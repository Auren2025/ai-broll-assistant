import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { assertPortAvailable, waitForServer } from '../scripts/dev';

test('development preflight rejects occupied ports without stopping their owner', async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    await assert.rejects(assertPortAvailable(address.port), /unavailable.*EADDRINUSE/);
    assert.equal(server.listening, true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  await assertPortAvailable(address.port);
});

test('development readiness retries until the API reports healthy', async () => {
  let calls = 0;
  const server = createHttpServer((_req, res) => {
    calls++;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: calls < 3 ? 'starting' : 'ok' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    await waitForServer({ url: `http://127.0.0.1:${address.port}/api/health`, intervalMs: 5, timeoutMs: 2000 });
    assert.equal(calls, 3);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('development readiness times out for an unrelated HTTP service', async () => {
  const server = createHttpServer((_req, res) => res.end('{"status":"wrong-service"}'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    await assert.rejects(waitForServer({
      url: `http://127.0.0.1:${address.port}/api/health`, intervalMs: 5, timeoutMs: 50,
    }), /did not become healthy/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
