import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ConnectionService } from '../src/service.mjs';
import { MemoryVault, FIXTURE_KEY, fixtureBundle } from '../src/fixture.mjs';
import { SafeError, safeMessage } from '../src/protocol.mjs';
import { OSVault } from '../src/vault.mjs';
import { PROFILE, CATALOG } from '../src/profile.mjs';
import { home, backend, credential, deferred } from './support.mjs';
async function setup(t, options = {}) {
  let time = 100000; const vault = new MemoryVault();
  const platform = await backend(t, options);
  const dir = await home(t);
  const service = new ConnectionService({ home: dir, helper: '/installed/auth.mjs', origin: platform.origin, allowLoopback: true, vault, now: () => time });
  return { service, vault, platform, dir, advance: (ms = 3000) => { time += ms; } };
}
test('HTTP device auth, interval, pending, approval, authoritative catalog and explicit apply', async t => {
  const { service, vault, platform, dir, advance } = await setup(t);
  await writeFile(join(dir, 'config.toml'), '# existing\n'); await writeFile(join(dir, 'auth.json'), 'original auth\n');
  const pending = await service.begin();
  assert.equal(pending.userCode, 'ABCD-1234-EF56'); assert.match(pending.connectUrl, /\/connect\/codex\?code=ABCD-1234-EF56$/);
  assert.equal(platform.calls[0].body.client, 'codex'); assert.match(platform.calls[0].body.code_challenge, /^[a-f0-9]{64}$/);
  await service.poll(); assert.equal(platform.calls.length, 1);
  advance(); assert.equal((await service.poll()).phase, 'pending');
  await service.poll(); assert.equal(platform.calls.length, 2);
  advance(); assert.equal((await service.poll()).connected, true); assert.deepEqual(await vault.get(), credential());
  const status = await service.sync(); assert.deepEqual(status.catalog, { defaultModel: 'demo-text', count: 1 });
  assert.equal(status.profile, 'not_applied'); assert.deepEqual((await readdir(dir)).sort(), ['auth.json', 'config.toml']);
  assert.equal(platform.calls.at(-1).authorization, 'Bearer ' + FIXTURE_KEY);
  assert.equal((await service.apply()).profile, 'applied');
  assert.deepEqual(JSON.parse(await readFile(join(dir, CATALOG), 'utf8')), JSON.parse(fixtureBundle().files['kogle-models.json']));
  const profile = await readFile(join(dir, PROFILE), 'utf8'); assert.ok(!profile.includes(FIXTURE_KEY));
  assert.equal(await readFile(join(dir, 'config.toml'), 'utf8'), '# existing\n'); assert.equal(await readFile(join(dir, 'auth.json'), 'utf8'), 'original auth\n');
  assert.ok(!JSON.stringify(await service.status()).includes(FIXTURE_KEY));
  await service.disconnect(); assert.equal(await vault.get(), null); assert.deepEqual((await readdir(dir)).sort(), ['auth.json', 'config.toml']);
});
for (const [scenario, message] of [['denied', /denied/], ['expired', /expired/], ['replay', /already used/], ['network', /failed or timed out/]]) test('HTTP ' + scenario + ' leaves no credentials or poll loop', async t => {
  const { service, vault, advance } = await setup(t, { scenario });
  if (scenario === 'network') await assert.rejects(service.begin(), message);
  else { await service.begin(); advance(); await assert.rejects(service.poll(), message); }
  assert.equal(await vault.get(), null); assert.equal((await service.status()).phase, 'disconnected');
});
test('local deadline caps auth; invalid device contract refused', async t => {
  const { service, advance, platform } = await setup(t);
  await service.begin(); advance(600000); await assert.rejects(service.poll(), /expired/); assert.equal(platform.calls.length, 1);
  service.request = async () => ({ device_code: 'd'.repeat(64), user_code: 'ABCD-1234-EF56', expires_in: 601, interval: 1 });
  await assert.rejects(service.begin(), /invalid connection code/); assert.equal(service.pending, null);
});
test('cancel fences an initiating request and propagates abort', async t => {
  const dir = await home(t); const started = deferred(); const answer = deferred(); let signal;
  const service = new ConnectionService({ home: dir, vault: new MemoryVault(), requestFn: async (_origin, _path, options) => { signal = options.signal; started.resolve(); return answer.promise; } });
  const begin = service.begin(); await started.promise; const cancel = service.cancel(); assert.equal(signal.aborted, true);
  answer.resolve({ device_code: 'd'.repeat(64), user_code: 'ABCD-1234-EF56', expires_in: 600, interval: 3 });
  await Promise.all([begin, cancel]); assert.equal(service.pending, null);
});
test('cancel during vault save restores the previous credential and reconnect cannot install stale credentials', async t => {
  const { service, vault, advance } = await setup(t);
  const previous = { ...credential(), key: 'synthetic-previous-key-0000' }; vault.value = previous;
  await service.begin(); advance(); await service.poll(); advance();
  const started = deferred(); const saved = deferred(); const original = vault.set.bind(vault);
  let first = true;
  vault.set = async value => { if (first) { first = false; started.resolve(); await saved.promise; } await original(value); };
  const poll = service.poll(); await started.promise; const reconnect = service.begin(); saved.resolve();
  await Promise.all([poll, reconnect]); assert.deepEqual(await vault.get(), previous); assert.equal(service.pending.userCode, 'ABCD-1234-EF56');
  await service.cancel(); assert.deepEqual(await vault.get(), previous);
});
test('vault save failure and disconnect with edited files fail honestly', async t => {
  const { service, vault, advance, dir } = await setup(t);
  await service.begin(); advance(); await service.poll(); advance();
  vault.set = async () => { throw new SafeError('Synthetic vault save failure.'); };
  await assert.rejects(service.poll(), /vault save failure/); assert.equal(await vault.get(), null); assert.equal(service.pending, null);
  vault.value = credential(); await service.sync(); await service.apply(); await writeFile(join(dir, PROFILE), '# user edit');
  await assert.rejects(service.disconnect(), /edited/); assert.equal(await vault.get(), null); assert.equal(await readFile(join(dir, PROFILE), 'utf8'), '# user edit');
});
test('sync cancellation discards stale catalog; cancelled apply does not create files', async t => {
  const { service, vault } = await setup(t); vault.value = credential();
  const started = deferred(); const finished = deferred();
  service.request = async () => { started.resolve(); return finished.promise; };
  const sync = service.sync(); await started.promise; const cancel = service.cancel(); finished.resolve(fixtureBundle());
  await Promise.all([sync, cancel]); assert.equal(service.bundle, null);
  service.bundle = { catalog: '{}', defaultModel: 'demo-text' };
  const reading = deferred(); const done = deferred(); vault.get = async () => { reading.resolve(); await done.promise; return credential(); };
  const apply = service.apply(); await reading.promise; service.invalidate(); done.resolve();
  await assert.rejects(apply, /Sync a connected/);
});
test('native vault failures have no fallback and sanitize raw secrets', async () => {
  const vault = new OSVault('https://example.test', '/synthetic/home');
  vault.entry = async () => { throw Error(FIXTURE_KEY); };
  for (const operation of ['get', 'set', 'delete']) {
    await assert.rejects(vault[operation](credential()), error => { assert.ok(!safeMessage(error).includes(FIXTURE_KEY)); return /vault/.test(error.message); });
  }
  assert.equal(safeMessage(Error(FIXTURE_KEY)), 'The operation failed. Check the connection or credential vault and try again.');
});
test('hosted setup, keys/revocation and Activity routes are fixed platform links', async t => {
  const { service } = await setup(t); const { links } = await service.status();
  assert.equal(links.setup, service.origin + '/app/connect?client=codex'); assert.equal(links.keys, service.origin + '/app/projects'); assert.equal(links.activity, service.origin + '/app/activity');
});
test('a credential replaced by another local runtime cannot apply a previous project catalog', async t => {
  const { service, vault, dir } = await setup(t); vault.value = credential(); await service.sync();
  vault.value = { ...credential(), key: 'synthetic-other-connection-key' };
  await assert.rejects(service.apply(), /Sync a connected/); assert.deepEqual(await readdir(dir), []);
  assert.equal((await service.status()).catalog, null);
});
test('failed network refresh or invalid catalog revokes eligibility to apply the previous catalog', async t => {
  const { service, vault, dir } = await setup(t); vault.value = credential();
  const initial = service.request;
  for (const refresh of [async () => { throw Error('Synthetic network failure'); }, async () => ({ client: 'vscode' })]) {
    service.request = initial; await service.sync(); assert.equal((await service.status()).catalog.count, 1);
    service.request = refresh; await assert.rejects(service.sync());
    assert.equal((await service.status()).catalog, null);
    await assert.rejects(service.apply(), /Sync a connected/);
    assert.deepEqual(await readdir(dir), []);
  }
});
