import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseProject } from '../src/domain/projectSchema.ts'
import { parseScene } from '../src/domain/sceneSchema.ts'
import type { Project } from '../src/domain/projectSchema.ts'
import type { Scene as SceneType } from '../src/domain/sceneSchema.ts'

const HOST = '127.0.0.1'
const PORT = 3001

const CONTENT_TYPE = 'application/json; charset=utf-8'

const ID_PATTERN = /^[A-Za-z0-9_-]+$/
const PROJECTS_PREFIX = '/api/projects/'
const SCENES_PREFIX = 'scenes/'

const MAX_BODY_SIZE = 1 * 1024 * 1024

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECTS_ROOT = path.resolve(__dirname, '..', 'projects')

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  if (res.headersSent || res.writableEnded) {
    return
  }
  res.statusCode = status
  res.setHeader('Content-Type', CONTENT_TYPE)
  res.end(JSON.stringify(body))
}

async function readAndParseProject(
  res: http.ServerResponse,
  projectId: string,
): Promise<Project | null> {
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
    return parseProject(json)
  } catch (err) {
    console.error(err)
    sendJson(res, 500, { error: 'Invalid project data' })
    return null
  }
}

async function handleGetProject(
  res: http.ServerResponse,
  projectId: string,
): Promise<void> {
  const project = await readAndParseProject(res, projectId)
  if (project !== null) {
    sendJson(res, 200, project)
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
    await fs.writeFile(tempPath, content, 'utf-8')
    await fs.rename(tempPath, scenePath)
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

const server = http.createServer((req, res) => {
  const method = req.method ?? 'GET'
  const url = req.url ?? ''

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
      if (method !== 'GET') {
        sendJson(res, 405, { error: 'Method not allowed' })
        return
      }
      handleGetProject(res, projectIdPart)
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
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }

    sendJson(res, 404, { error: 'Not found' })
    return
  }

  sendJson(res, 404, { error: 'Not found' })
})

server.listen(PORT, HOST, () => {
  console.log(`Local service listening at http://127.0.0.1:3001`)
})
