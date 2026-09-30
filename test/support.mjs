import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { fixtureBundle, FIXTURE_KEY } from '../src/fixture.mjs';
import { hash } from '../src/protocol.mjs';
export const credential = () => ({ key: FIXTURE_KEY, projectId: 'fixture-project', keyId: 'fixture-key' });
export const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
export async function home(t) {
  const path = await mkdtemp(join(await realpath(tmpdir()), 'kastanje-test-'));
  t.after(() => rm(path, { recursive: true, force: true })); return path;
}
export async function backend(t, { scenario = 'approved', bundle = fixtureBundle(), interval = 3 } = {}) {
  let challenge, used = false, polls = 0; const calls = [];
  const server = createServer(async (req, res) => {
    let text = ''; for await (const part of req) text += part;
    const body = text ? JSON.parse(text) : undefined;
    calls.push({ path: req.url, method: req.method, body, authorization: req.headers.authorization });
    res.setHeader('Content-Type', 'application/json');
    const send = (status, data) => { res.writeHead(status); res.end(JSON.stringify(data)); };
    if (scenario === 'network') return req.socket.destroy();
    if (req.url === '/api/extension/device') {
      challenge = body.code_challenge; used = false; polls = 0;
      return send(200, { device_code: 'd'.repeat(64), user_code: 'ABCD-1234-EF56', expires_in: 600, interval });
    }
    if (req.url === '/api/extension/token') {
      if (scenario === 'denied') return send(403, { secret: FIXTURE_KEY });
      if (scenario === 'expired') return send(410, {});
      if (scenario === 'replay' || used) return send(409, {});
      if (hash(body.code_verifier) !== challenge || body.device_code !== 'd'.repeat(64)) return send(403, {});
      if (++polls === 1) return send(200, { status: 'pending' });
      used = true; return send(200, { status: 'authorized', ...credential() });
    }
    if (req.url === '/v1/pixelroute/setup?client=codex' && req.headers.authorization === 'Bearer ' + FIXTURE_KEY) return send(200, bundle);
    send(401, { secret: FIXTURE_KEY });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return { origin: `http://127.0.0.1:${server.address().port}`, calls, server };
}
