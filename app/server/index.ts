import http from 'node:http'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { parseProject } from '../src/domain/projectSchema.ts'
import { parseScene } from '../src/domain/sceneSchema.ts'
import type { Project } from '../src/domain/projectSchema.ts'
import type { Scene as SceneType } from '../src/domain/sceneSchema.ts'
import {
  getImageAssetSizeError,
  MAX_IMAGE_ASSET_BYTES,
} from '../src/imageAssetPolicy.ts'

const HOST = '127.0.0.1'
const PORT = 3002

const CONTENT_TYPE = 'application/json; charset=utf-8'

const ID_PATTERN = /^[A-Za-z0-9_-]+$/
const PROJECTS_PREFIX = '/api/projects/'
const SCENES_PREFIX = 'scenes/'
const ASSETS_PREFIX = 'assets/'
const LEGACY_AUDIO_PREFIX = 'audio/'

const MAX_BODY_SIZE = 10 * 1024 * 1024
const ALLOWED_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'])
const ALLOWED_IMAGE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
])
const FILENAME_PATTERN = /^[A-Za-z0-9_.-]+$/
const ALLOWED_BROWSER_ORIGINS = new Set([
  'http://127.0.0.1:5174',
  'http://localhost:5174',
  'http://127.0.0.1:3001',
  'http://localhost:3001',
])

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
// Importing this module does not listen or access real project data.
// Tests inject a temporary root and bind the returned server to a random port.
export function createLocalServer(
  PROJECTS_ROOT = path.resolve(__dirname, '..', 'projects'),
): http.Server {

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  if (res.headersSent || res.writableEnded) {
    return
  }
  res.statusCode = status
  res.setHeader('Content-Type', CONTENT_TYPE)
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-Match')
  res.setHeader('Access-Control-Expose-Headers', 'ETag')
  res.end(JSON.stringify(body))
}

function buildEntityTag(content: string | Buffer): string {
  return `"${createHash('sha256').update(content).digest('hex')}"`
}

async function rejectStaleWrite(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  targetPath: string,
): Promise<boolean> {
  const expected = req.headers['if-match']
  if (typeof expected !== 'string' || expected.length === 0) return false

  try {
    const current = await fs.readFile(targetPath)
    if (buildEntityTag(current) === expected) return false
    sendJson(res, 412, { error: 'File changed on disk' })
    return true
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      sendJson(res, 412, { error: 'File changed on disk' })
      return true
    }
    throw err
  }
}

interface ParsedProjectFile {
  project: Project
  raw: string
}

async function readAndParseProjectFile(
  res: http.ServerResponse,
  projectId: string,
): Promise<ParsedProjectFile | null> {
  const projectPath = path.join(PROJECTS_ROOT, projectId, 'project.json')

  let raw: string
  try {
    raw = await fs.readFile(projectPath, 'utf-8')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      sendJson(res, 404, { error: 'Project not found' })
    } else {
      console.error(err)
      sendJson(res, 500, { error: 'Internal server error' })
    }
    return null
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (err) {
    console.error(err)
    sendJson(res, 500, { error: 'Invalid project data' })
    return null
  }

  try {
    return { project: parseProject(json), raw }
  } catch (err) {
    console.error(err)
    sendJson(res, 500, { error: 'Invalid project data' })
    return null
  }
}

async function readAndParseProject(
  res: http.ServerResponse,
  projectId: string,
): Promise<Project | null> {
  return (await readAndParseProjectFile(res, projectId))?.project ?? null
}

async function handleGetProject(
  res: http.ServerResponse,
  projectId: string,
): Promise<void> {
  const resource = await readAndParseProjectFile(res, projectId)
  if (resource !== null) {
    res.setHeader('ETag', buildEntityTag(resource.raw))
    sendJson(res, 200, resource.project)
  }
}

async function handlePutProject(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  projectId: string,
): Promise<void> {
  const body = await readRequestBody(req, res)
  if (body === null) return

  let project: Project
  try {
    project = parseProject(JSON.parse(body.toString('utf-8')))
  } catch (err) {
    console.error(err)
    sendJson(res, 400, { error: 'Invalid project data' })
    return
  }

  if (project.id !== projectId) {
    sendJson(res, 400, { error: 'Project id does not match route' })
    return
  }

  const projectPath = path.join(PROJECTS_ROOT, projectId, 'project.json')
  const tempPath = buildSceneTempPath(projectPath)

  try {
    if (await rejectStaleWrite(req, res, projectPath)) return
    const content = JSON.stringify(project, null, 2) + '\n'
    await fs.writeFile(tempPath, content, 'utf-8')
    await fs.rename(tempPath, projectPath)
    res.setHeader('ETag', buildEntityTag(content))
    sendJson(res, 200, project)
  } catch (err) {
    console.error(err)
    await fs.unlink(tempPath).catch(() => {})
    sendJson(res, 500, { error: 'Failed to save project' })
  }
}

async function handleGetScene(
  res: http.ServerResponse,
  projectId: string,
  sceneId: string,
): Promise<void> {
  const project = await readAndParseProject(res, projectId)
  if (project === null) return

  const reference = project.scenes.find((s) => s.id === sceneId)
  if (!reference) {
    sendJson(res, 404, { error: 'Scene not found' })
    return
  }

  const scenePath = path.join(PROJECTS_ROOT, projectId, reference.file)

  let raw: string
  try {
    raw = await fs.readFile(scenePath, 'utf-8')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      sendJson(res, 404, { error: 'Scene not found' })
    } else {
      console.error(err)
      sendJson(res, 500, { error: 'Internal server error' })
    }
    return
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (err) {
    console.error(err)
    sendJson(res, 500, { error: 'Invalid scene data' })
    return
  }

  try {
    const scene = parseScene(json)
    if (scene.id !== sceneId) {
      console.error(
        `Scene id mismatch: route "${sceneId}" vs file "${scene.id}"`,
      )
      sendJson(res, 500, { error: 'Invalid scene data' })
      return
    }
    res.setHeader('ETag', buildEntityTag(raw))
    sendJson(res, 200, scene)
  } catch (err) {
    console.error(err)
    sendJson(res, 500, { error: 'Invalid scene data' })
  }
}

async function readRequestBody(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<Buffer | null> {
  const chunks: Buffer[] = []
  let totalLength = 0
  let aborted = false

  const onChunk = (chunk: Buffer): void => {
    if (aborted) return
    totalLength += chunk.length
    if (totalLength > MAX_BODY_SIZE) {
      sendJson(res, 413, { error: 'Request body too large' })
      aborted = true
      req.destroy()
      return
    }
    chunks.push(chunk)
  }

  return new Promise<Buffer | null>((resolve) => {
    const finish = (value: Buffer | null): void => {
      if (aborted) return
      aborted = true
      resolve(value)
    }

    req.on('data', onChunk)
    req.on('end', () => {
      if (aborted) return
      if (totalLength === 0) {
        sendJson(res, 400, { error: 'Invalid JSON' })
        finish(null)
        return
      }
      finish(Buffer.concat(chunks))
    })
    req.on('error', (err) => {
      console.error('Request stream error:', err.message)
      finish(null)
    })
  })
}

async function handlePutScene(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  projectId: string,
  sceneId: string,
): Promise<void> {
  const project = await readAndParseProject(res, projectId)
  if (project === null) return

  const reference = project.scenes.find((s) => s.id === sceneId)
  if (!reference) {
    sendJson(res, 404, { error: 'Scene not found' })
    return
  }

  const body = await readRequestBody(req, res)
  if (body === null) return

  let json: unknown
  try {
    json = JSON.parse(body.toString('utf-8'))
  } catch (err) {
    console.error(err)
    sendJson(res, 400, { error: 'Invalid JSON' })
    return
  }

  let scene: SceneType
  try {
    scene = parseScene(json)
  } catch (err) {
    console.error(err)
    sendJson(res, 400, { error: 'Invalid scene data' })
    return
  }

  if (scene.id !== sceneId) {
    console.error(
      `Scene id mismatch: route "${sceneId}" vs body "${scene.id}"`,
    )
    sendJson(res, 400, { error: 'Scene id mismatch' })
    return
  }

  const scenePath = path.join(PROJECTS_ROOT, projectId, reference.file)
  const sceneDir = path.dirname(scenePath)
  const tempPath = path.join(
    sceneDir,
    `${path.basename(scenePath)}.tmp-${process.pid}-${Date.now()}`,
  )

  const content = JSON.stringify(scene, null, 2) + '\n'

  try {
    if (await rejectStaleWrite(req, res, scenePath)) return
    await fs.writeFile(tempPath, content, 'utf-8')
    await fs.rename(tempPath, scenePath)
    res.setHeader('ETag', buildEntityTag(content))
  } catch (err) {
    console.error(err)
    await fs.unlink(tempPath).catch(() => {})
    if (!res.headersSent && !res.writableEnded) {
      sendJson(res, 500, { error: 'Failed to save scene' })
    }
    return
  }

  sendJson(res, 200, scene)
}

async function handleDeleteScene(
  res: http.ServerResponse,
  projectId: string,
  sceneId: string,
): Promise<void> {
  const project = await readAndParseProject(res, projectId)
  if (project === null) return

  if (project.scenes.length <= 1) {
    sendJson(res, 409, { error: 'Cannot delete the last scene' })
    return
  }

  const reference = project.scenes.find((scene) => scene.id === sceneId)
  if (!reference) {
    sendJson(res, 404, { error: 'Scene not found' })
    return
  }

  let nextProject: Project
  try {
    nextProject = parseProject({
      ...project,
      scenes: project.scenes.filter((scene) => scene.id !== sceneId),
    })
  } catch (err) {
    console.error(err)
    sendJson(res, 400, { error: 'Failed to update project' })
    return
  }

  const projectDir = path.join(PROJECTS_ROOT, projectId)
  const projectPath = path.join(projectDir, 'project.json')

  // Unlink the scene file first. If it fails with anything other than ENOENT,
  // abort before project.json changes so the cross-file references stay
  // consistent. A successful unlink makes the deletion atomic from the caller's
  // perspective; a failed one leaves project.json untouched.
  const scenePath = path.join(projectDir, reference.file)
  try {
    await fs.unlink(scenePath)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      console.error(err)
      sendJson(res, 500, { error: 'Failed to delete scene file' })
      return
    }
  }

  const tempPath = buildSceneTempPath(projectPath)
  try {
    await fs.writeFile(
      tempPath,
      JSON.stringify(nextProject, null, 2) + '\n',
      'utf-8',
    )
    await fs.rename(tempPath, projectPath)
  } catch (err) {
    console.error(err)
    await fs.unlink(tempPath).catch(() => {})
    // The scene file was removed but project.json could not be updated, so the
    // next read of project.json will reference a missing scene file. Report
    // the failure; the operator must restore the scene file from version
    // control or another source.
    sendJson(res, 500, { error: 'Failed to update project' })
    return
  }

  sendJson(res, 200, nextProject)
}

const SCENE_ID_PATTERN = /^scene-(\d+)$/
const NEW_SCENE_DURATION_IN_FRAMES = 150

function extensionFromMime(mime: string): string | null {
  switch (mime.toLowerCase()) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
      return 'jpg'
    case 'image/gif':
      return 'gif'
    case 'image/webp':
      return 'webp'
    case 'image/svg+xml':
      return 'svg'
    default:
      return null
  }
}

function extensionFromFilename(filename: string): string | null {
  const dotIndex = filename.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex === filename.length - 1) return null
  const ext = filename.slice(dotIndex + 1).toLowerCase()
  return ALLOWED_IMAGE_EXTENSIONS.has(ext) ? ext : null
}

function buildAssetFilename(extension: string): string {
  const id = randomBytes(8).toString('hex')
  return `image-${id}.${extension}`
}

async function readAssetBytes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<Buffer | null> {
  const chunks: Buffer[] = []
  let totalLength = 0
  let aborted = false

  return new Promise<Buffer | null>((resolve) => {
    const finish = (value: Buffer | null): void => {
      if (aborted) return
      aborted = true
      resolve(value)
    }

    const onChunk = (chunk: Buffer): void => {
      if (aborted) return
      totalLength += chunk.length
      if (totalLength > MAX_IMAGE_ASSET_BYTES) {
        sendJson(res, 413, { error: getImageAssetSizeError(totalLength) })
        aborted = true
        req.destroy()
        return
      }
      chunks.push(chunk)
    }

    req.on('data', onChunk)
    req.on('end', () => {
      if (aborted) return
      if (totalLength === 0) {
        sendJson(res, 400, { error: 'Empty payload' })
        finish(null)
        return
      }
      finish(Buffer.concat(chunks))
    })
    req.on('error', (err) => {
      console.error('Asset upload error:', err.message)
      finish(null)
    })
  })
}

async function handlePostAsset(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  projectId: string,
): Promise<void> {
  const project = await readAndParseProject(res, projectId)
  if (project === null) return

  const projectDir = path.join(PROJECTS_ROOT, projectId)
  const assetsDir = path.join(projectDir, 'assets')

  const contentLengthHeader = req.headers['content-length']
  if (typeof contentLengthHeader === 'string') {
    const contentLength = Number(contentLengthHeader)
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_IMAGE_ASSET_BYTES
    ) {
      sendJson(res, 413, { error: getImageAssetSizeError(contentLength) })
      return
    }
  }

  const contentType = (req.headers['content-type'] ?? '').toLowerCase()
  if (!ALLOWED_IMAGE_MIME.has(contentType)) {
    sendJson(res, 415, { error: 'Unsupported image type' })
    return
  }

  const bytes = await readAssetBytes(req, res)
  if (bytes === null) return

  const extension = extensionFromMime(contentType)
  if (extension === null) {
    sendJson(res, 415, { error: 'Unsupported image type' })
    return
  }

  await fs.mkdir(assetsDir, { recursive: true })

  const filename = buildAssetFilename(extension)
  const relativePath = `${ASSETS_PREFIX}${filename}`
  const absolutePath = path.join(assetsDir, filename)

  try {
    await fs.writeFile(absolutePath, bytes)
  } catch (err) {
    console.error(err)
    sendJson(res, 500, { error: 'Failed to save asset' })
    return
  }

  sendJson(res, 201, {
    filename,
    src: relativePath,
    contentType,
    bytes: bytes.length,
  })
}

async function handleGetAsset(
  res: http.ServerResponse,
  projectId: string,
  filename: string,
): Promise<void> {
  if (!FILENAME_PATTERN.test(filename)) {
    sendJson(res, 400, { error: 'Invalid asset filename' })
    return
  }

  const projectDir = path.join(PROJECTS_ROOT, projectId)
  const absolutePath = path.join(projectDir, 'assets', filename)

  const resolved = path.resolve(absolutePath)
  const allowedRoot = path.resolve(projectDir, 'assets') + path.sep
  if (!resolved.startsWith(allowedRoot)) {
    sendJson(res, 400, { error: 'Invalid asset path' })
    return
  }

  let bytes: Buffer
  try {
    bytes = await fs.readFile(absolutePath)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      sendJson(res, 404, { error: 'Asset not found' })
    } else {
      console.error(err)
      sendJson(res, 500, { error: 'Failed to read asset' })
    }
    return
  }

  const ext = extensionFromFilename(filename)
  const mime =
    ext === 'png'
      ? 'image/png'
      : ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : ext === 'gif'
          ? 'image/gif'
          : ext === 'webp'
            ? 'image/webp'
            : ext === 'svg'
              ? 'image/svg+xml'
              : 'application/octet-stream'

  if (res.headersSent || res.writableEnded) return
  res.statusCode = 200
  res.setHeader('Content-Type', mime)
  res.setHeader('Content-Length', String(bytes.length))
  res.setHeader('Cache-Control', 'no-cache')
  res.end(bytes)
}

function audioMimeFromExtension(ext: string): string {
  switch (ext) {
    case 'mp3':
      return 'audio/mpeg'
    case 'wav':
      return 'audio/wav'
    case 'm4a':
      return 'audio/mp4'
    case 'aac':
      return 'audio/aac'
    case 'ogg':
      return 'audio/ogg'
    case 'flac':
      return 'audio/flac'
    case 'webm':
      return 'audio/webm'
    default:
      return 'application/octet-stream'
  }
}

function audioExtensionFromFilename(filename: string): string | null {
  const dotIndex = filename.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex === filename.length - 1) return null
  const extension = filename.slice(dotIndex + 1).toLowerCase()
  return audioMimeFromExtension(extension) === 'application/octet-stream'
    ? null
    : extension
}

function parseByteRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | 'invalid' | null {
  if (header === undefined) return null

  const match = /^bytes=(\d*)-(\d*)$/.exec(header)
  if (!match || (match[1] === '' && match[2] === '')) return 'invalid'

  if (match[1] === '') {
    const suffixLength = Number(match[2])
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return 'invalid'
    return {
      start: Math.max(0, size - suffixLength),
      end: size - 1,
    }
  }

  const start = Number(match[1])
  const requestedEnd = match[2] === '' ? size - 1 : Number(match[2])
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= size ||
    requestedEnd < start
  ) {
    return 'invalid'
  }

  return { start, end: Math.min(requestedEnd, size - 1) }
}

async function handleGetAudio(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  projectId: string,
  relativePath: string,
): Promise<void> {
  const projectDir = path.join(PROJECTS_ROOT, projectId)
  const absolutePath = path.resolve(projectDir, relativePath)

  const allowedRoot = path.resolve(projectDir) + path.sep
  if (!absolutePath.startsWith(allowedRoot)) {
    sendJson(res, 400, { error: 'Invalid audio path' })
    return
  }

  let size: number
  try {
    size = (await fs.stat(absolutePath)).size
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      sendJson(res, 404, { error: 'Audio not found' })
    } else {
      console.error(err)
      sendJson(res, 500, { error: 'Failed to read audio' })
    }
    return
  }

  const dotIndex = relativePath.lastIndexOf('.')
  const ext = dotIndex > 0 ? relativePath.slice(dotIndex + 1).toLowerCase() : ''
  const range = parseByteRange(req.headers.range, size)

  if (range === 'invalid') {
    res.statusCode = 416
    res.setHeader('Content-Range', `bytes */${size}`)
    res.setHeader('Accept-Ranges', 'bytes')
    res.end()
    return
  }

  const start = range?.start ?? 0
  const end = range?.end ?? size - 1

  if (res.headersSent || res.writableEnded) return
  res.statusCode = range === null ? 200 : 206
  res.setHeader('Content-Type', audioMimeFromExtension(ext))
  res.setHeader('Content-Length', String(end - start + 1))
  res.setHeader('Accept-Ranges', 'bytes')
  if (range !== null) {
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
  }
  res.setHeader('Cache-Control', 'no-cache')
  createReadStream(absolutePath, { start, end }).pipe(res)
}

function buildSceneTempPath(target: string): string {
  const random = Math.random().toString(36).slice(2, 10)
  return `${target}.tmp-${process.pid}-${Date.now()}-${random}`
}

function isWriteMethod(method: string): boolean {
  return method === 'PUT' || method === 'POST' || method === 'DELETE'
}

function isRequestOriginAllowed(origin: unknown): origin is string {
  return typeof origin === 'string' && ALLOWED_BROWSER_ORIGINS.has(origin)
}

async function readExistingSceneEndFrames(
  project: Project,
  projectDir: string,
): Promise<{ value: number; ok: false; error: { status: number; message: string } } | { value: number; ok: true }> {
  let maxEndFrame = 0

  for (const reference of project.scenes) {
    const scenePath = path.join(projectDir, reference.file)
    let raw: string
    try {
      raw = await fs.readFile(scenePath, 'utf-8')
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        continue
      }
      console.error(err)
      return {
        value: 0,
        ok: false,
        error: { status: 500, message: 'Failed to read existing scene' },
      }
    }

    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch (err) {
      console.error(err)
      return {
        value: 0,
        ok: false,
        error: { status: 500, message: 'Invalid existing scene data' },
      }
    }

    try {
      const scene = parseScene(json)
      const endFrame = scene.startFrame + scene.durationInFrames
      if (endFrame > maxEndFrame) maxEndFrame = endFrame
    } catch (err) {
      console.error(err)
      return {
        value: 0,
        ok: false,
        error: { status: 500, message: 'Invalid existing scene data' },
      }
    }
  }

  return { value: maxEndFrame, ok: true }
}

async function handlePostScene(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  projectId: string,
): Promise<void> {
  const project = await readAndParseProject(res, projectId)
  if (project === null) return

  let maxNumber = 0
  for (const reference of project.scenes) {
    const match = SCENE_ID_PATTERN.exec(reference.id)
    if (match) {
      maxNumber = Math.max(maxNumber, Number(match[1]))
    }
  }
  const nextNumber = maxNumber + 1
  const nextId = `scene-${String(nextNumber).padStart(3, '0')}`

  if (project.scenes.some((reference) => reference.id === nextId)) {
    sendJson(res, 409, { error: `Scene id "${nextId}" already exists` })
    return
  }

  const projectDir = path.join(PROJECTS_ROOT, projectId)
  const endFrameResult = await readExistingSceneEndFrames(project, projectDir)
  if (!endFrameResult.ok) {
    sendJson(res, endFrameResult.error.status, { error: endFrameResult.error.message })
    return
  }

  const newScene: SceneType = {
    schemaVersion: 1,
    id: nextId,
    topic: `Untitled scene ${nextNumber}`,
    startFrame: endFrameResult.value,
    durationInFrames: NEW_SCENE_DURATION_IN_FRAMES,
    layers: [],
  }

  let validatedScene: SceneType
  try {
    validatedScene = parseScene(newScene)
  } catch (err) {
    console.error(err)
    sendJson(res, 400, { error: 'Failed to construct new scene' })
    return
  }

  const sceneRelPath = `${SCENES_PREFIX}${nextId}.json`
  const sceneAbsPath = path.join(projectDir, sceneRelPath)

  try {
    await fs.access(sceneAbsPath)
    sendJson(res, 409, { error: 'Scene file already exists' })
    return
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      console.error(err)
      sendJson(res, 500, { error: 'Internal server error' })
      return
    }
  }

  const nextProject: Project = {
    ...project,
    scenes: [...project.scenes, { id: nextId, file: sceneRelPath }],
  }

  let validatedProject: Project
  try {
    validatedProject = parseProject(nextProject)
  } catch (err) {
    console.error(err)
    sendJson(res, 400, { error: 'Failed to construct new project' })
    return
  }

  const sceneContent = JSON.stringify(validatedScene, null, 2) + '\n'
  const projectContent = JSON.stringify(validatedProject, null, 2) + '\n'

  const projectJsonPath = path.join(projectDir, 'project.json')

  const sceneTempPath = buildSceneTempPath(sceneAbsPath)
  const projectTempPath = buildSceneTempPath(projectJsonPath)

  let sceneTempWritten = false
  try {
    await fs.writeFile(sceneTempPath, sceneContent, 'utf-8')
    sceneTempWritten = true
    await fs.rename(sceneTempPath, sceneAbsPath)
  } catch (err) {
    console.error(err)
    if (sceneTempWritten) {
      await fs.unlink(sceneTempPath).catch(() => {})
    }
    sendJson(res, 500, { error: 'Failed to save scene' })
    return
  }

  let projectTempWritten = false
  try {
    await fs.writeFile(projectTempPath, projectContent, 'utf-8')
    projectTempWritten = true
    await fs.rename(projectTempPath, projectJsonPath)
  } catch (err) {
    console.error(err)
    if (projectTempWritten) {
      await fs.unlink(projectTempPath).catch(() => {})
    }
    await fs.unlink(sceneAbsPath).catch(() => {})
    sendJson(res, 500, { error: 'Failed to update project' })
    return
  }

  sendJson(res, 201, { project: validatedProject, scene: validatedScene })
}

const server = http.createServer((req, res) => {
  const method = req.method ?? 'GET'
  const url = req.url ?? ''
  const origin = req.headers.origin

  if (typeof origin === 'string') {
    if (isRequestOriginAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
    } else {
      // CORS browsers must see a deterministic rejection for both reads and
      // writes; otherwise the missing CORS header can look like success in
      // callers that key only on the absence of an Allow-Origin value.
      res.setHeader('Vary', 'Origin')
      sendJson(res, 403, { error: 'Origin not allowed' })
      return
    }
  } else if (isWriteMethod(method)) {
    // No Origin header indicates a non-browser caller. Same-origin browser
    // requests still send Origin; CLI agents may not. Allow them through
    // because the local service is documented to be reached by editors,
    // render scripts, and other trusted local processes.
  }

  if (method === 'OPTIONS') {
    sendJson(res, 204, {})
    return
  }

  if (url === '/api/health') {
    if (method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    sendJson(res, 200, { status: 'ok' })
    return
  }

  if (url === PROJECTS_PREFIX || url.startsWith(PROJECTS_PREFIX)) {
    const remainder = url
      .slice(PROJECTS_PREFIX.length)
      .split('?')[0]
      .replace(/\/+$/, '')

    const slashIndex = remainder.indexOf('/')
    const projectIdPart =
      slashIndex === -1 ? remainder : remainder.slice(0, slashIndex)
    const restAfterProject =
      slashIndex === -1 ? '' : remainder.slice(slashIndex + 1)

    if (!ID_PATTERN.test(projectIdPart)) {
      sendJson(res, 400, { error: 'Invalid project id' })
      return
    }

    if (restAfterProject === '') {
      if (method === 'GET') {
        handleGetProject(res, projectIdPart)
        return
      }
      if (method === 'PUT') {
        void handlePutProject(req, res, projectIdPart)
        return
      }
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }

    if (restAfterProject === 'scenes') {
      if (method === 'POST') {
        void handlePostScene(req, res, projectIdPart)
        return
      }
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }

    if (restAfterProject === 'assets') {
      if (method === 'POST') {
        void handlePostAsset(req, res, projectIdPart)
        return
      }
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }

    if (restAfterProject.startsWith(ASSETS_PREFIX)) {
      const filename = restAfterProject.slice(ASSETS_PREFIX.length)
      if (!FILENAME_PATTERN.test(filename)) {
        sendJson(res, 400, { error: 'Invalid asset filename' })
        return
      }
      if (method === 'GET') {
        void handleGetAsset(res, projectIdPart, filename)
        return
      }
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }

    if (restAfterProject.startsWith(LEGACY_AUDIO_PREFIX)) {
      const filename = restAfterProject.slice(LEGACY_AUDIO_PREFIX.length)
      if (!FILENAME_PATTERN.test(filename)) {
        sendJson(res, 400, { error: 'Invalid audio filename' })
        return
      }
      if (method === 'GET') {
        void handleGetAudio(req, res, projectIdPart, restAfterProject)
        return
      }
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }

    const audioExtension = audioExtensionFromFilename(restAfterProject)
    if (
      FILENAME_PATTERN.test(restAfterProject) &&
      audioExtension !== null
    ) {
      if (method === 'GET') {
        void handleGetAudio(req, res, projectIdPart, restAfterProject)
        return
      }
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }

    if (restAfterProject.startsWith(SCENES_PREFIX)) {
      const sceneId = restAfterProject.slice(SCENES_PREFIX.length)
      if (!ID_PATTERN.test(sceneId)) {
        sendJson(res, 400, { error: 'Invalid scene id' })
        return
      }
      if (method === 'GET') {
        handleGetScene(res, projectIdPart, sceneId)
        return
      }
      if (method === 'PUT') {
        void handlePutScene(req, res, projectIdPart, sceneId)
        return
      }
      if (method === 'DELETE') {
        void handleDeleteScene(res, projectIdPart, sceneId)
        return
      }
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }

    sendJson(res, 404, { error: 'Not found' })
    return
  }

  sendJson(res, 404, { error: 'Not found' })
})

return server
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  createLocalServer().listen(PORT, HOST, () => {
    console.log(`Local service listening at http://127.0.0.1:3002`)
  })
}
