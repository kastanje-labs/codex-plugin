import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { platformOrigin, request, validateBundle } from '../src/protocol.mjs';
import { fixtureBundle, FIXTURE_KEY } from '../src/fixture.mjs';
test('origin validation rejects credentials, paths, query, HTTP, alternate loopbacks and normalization tricks', () => {
  assert.equal(platformOrigin('https://example.test'), 'https://example.test');
  for (const value of ['https://a:b@example.test', 'https://example.test/', 'https://example.test/path', 'https://example.test?q=1', 'https://example.test#f', 'http://example.test', 'http://127.0.0.1', 'https://EXAMPLE.test', 'https://example.test:443', 'https://example.test\\@evil.test']) assert.throws(() => platformOrigin(value));
  assert.equal(platformOrigin('http://127.0.0.1:1234', { allowLoopback: true }), 'http://127.0.0.1:1234');
  assert.throws(() => platformOrigin('http://localhost:1234', { allowLoopback: true }));
});
test('catalog preserves platform capabilities and ignores downloaded config and paths', () => {
  const bundle = fixtureBundle(); bundle.files['../../auth.json'] = 'untrusted'; bundle.files['kogle.config.toml'] = 'execute anything';
  const validated = validateBundle(bundle, FIXTURE_KEY);
  assert.deepEqual(JSON.parse(validated.catalog), JSON.parse(bundle.files['kogle-models.json']));
  assert.ok(!validated.catalog.includes('untrusted'));
});
for (const change of [
  b => { b.client = 'vscode'; }, b => { b.mode = 'invalid'; }, b => { b.modelIds.push('demo-text'); },
  b => { b.defaultModel = 'missing'; }, b => { b.files['kogle-models.json'] = '{'; },
  b => { b.files['kogle-models.json'] = JSON.stringify({ models: [{ slug: 'missing' }] }); },
  b => { b.files['kogle-models.json'] = JSON.stringify({ models: [{ slug: 'demo-text', secret: FIXTURE_KEY }] }); },
  b => { b.files['kogle-models.json'] = JSON.stringify({ models: [{ slug: 'demo-text', huge: 'x'.repeat(2 * 1024 * 1024) }] }); }
]) test('unsafe or inconsistent catalog is refused: ' + change.toString().slice(0, 100), () => { const b = fixtureBundle(); change(b); assert.throws(() => validateBundle(b, FIXTURE_KEY)); });
test('HTTP response bounds, redirects, invalid JSON/type, timeout and cancellation', async t => {
  let behavior;
  const server = createServer((req, res) => behavior(req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  behavior = (_req, res) => { res.writeHead(302, { Location: '/secret' }); res.end(); };
  await assert.rejects(request(origin, '/api/extension/device'), /failed or timed out/);
  behavior = (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<html>'); };
  await assert.rejects(request(origin, '/api/extension/device'), /invalid response/);
  behavior = (_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end('{'); };
  await assert.rejects(request(origin, '/api/extension/device'), /failed or timed out/);
  behavior = (_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify('x'.repeat(4096))); };
  await assert.rejects(request(origin, '/api/extension/device', { limit: 1024 }), /size limit/);
  behavior = () => {};
  await assert.rejects(request(origin, '/api/extension/device', { timeout: 20 }), /timed out/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(request(origin, '/api/extension/device', { signal: controller.signal }), /timed out/);
  await assert.rejects(request(origin, '/arbitrary'), /Unsupported/);
});
test('Unicode-escaped credential cannot become plaintext in the normalized installed catalog', () => {
  const bundle = fixtureBundle();
  const escaped = Array.from(FIXTURE_KEY, ch => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0')).join('');
  bundle.files['kogle-models.json'] = '{"models":[{"slug":"demo-text","description":"' + escaped + '"}]}';
  assert.ok(!JSON.stringify(bundle).includes(FIXTURE_KEY));
  assert.throws(() => validateBundle(bundle, FIXTURE_KEY), /unsafe/);
});
