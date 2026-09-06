import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { concurrently } from 'concurrently';

const appRoot = fileURLToPath(new URL('../', import.meta.url));

export async function assertPortAvailable(port: number, host = '127.0.0.1') {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', (error) => reject(new Error(
      `Cannot start: ${host}:${port} is unavailable (${(error as NodeJS.ErrnoException).code}). Stop the existing service and retry.`,
    )));
    server.listen({ port, host, exclusive: true }, () => server.close((error) => error ? reject(error) : resolve()));
  });
}

export async function waitForServer({
  url = 'http://127.0.0.1:3002/api/health',
  timeoutMs = 30_000,
  intervalMs = 200,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(Math.max(1, Math.min(1000, deadline - Date.now()))),
      });
      const body: unknown = await response.json();
      if (response.ok && body !== null && typeof body === 'object' && 'status' in body && body.status === 'ok') return;
    } catch {
      // The service may still be starting; retries are bounded by the deadline.
    }
    await delay(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
  }
  throw new Error(`Local service did not become healthy within ${timeoutMs}ms: ${url}`);
}

async function main() {
  if (process.argv[2] === '--wait') {
    await waitForServer();
    return;
  }
  for (const port of [3002, 5174, 3001]) await assertPortAvailable(port);
  // Studio may bind IPv6 too. Do not overlook a localhost-only listener.
  try {
    await assertPortAvailable(3001, '::1');
  } catch (error) {
    if (!(error instanceof Error) || !/EAFNOSUPPORT|EADDRNOTAVAIL/.test(error.message)) throw error;
  }

  console.log('Starting services. Ctrl+C stops all three.');
  console.log('Editor: http://127.0.0.1:5174/my-design');
  console.log('Studio: http://localhost:3001/my-design');
  let interrupted = false;
  const onSignal = () => { interrupted = true; };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  try {
    const { result } = concurrently([
      { name: 'server', command: 'pnpm run dev:server', prefixColor: 'cyan' },
      { name: 'editor', command: 'node --import tsx scripts/dev.ts --wait && pnpm run dev:editor', prefixColor: 'green' },
      { name: 'studio', command: 'node --import tsx scripts/dev.ts --wait && pnpm run studio --no-open', prefixColor: 'magenta' },
    ], {
      cwd: appRoot,
      prefix: 'name',
      killOthersOn: ['success', 'failure'],
      killTimeout: 5000,
    });
    try {
      await result;
    } catch {
      if (!interrupted) throw new Error('A development service exited unexpectedly; all services have been stopped.');
    }
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[dev] ${error.message}`);
    process.exitCode = 1;
  });
}
