import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat, symlink, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ProfileStore, profileTemplate, PROFILE, CATALOG, MANIFEST } from '../src/profile.mjs';
import { validateBundle, hash } from '../src/protocol.mjs';
import { fixtureBundle, MemoryVault, FIXTURE_KEY } from '../src/fixture.mjs';
import { authToken } from '../src/auth.mjs';
import { home, credential } from './support.mjs';
const origin = 'https://example.test'; const bundle = () => validateBundle(fixtureBundle(), FIXTURE_KEY);
const apply = store => store.apply(origin, bundle(), process.execPath, '/installed/auth.mjs');
test('profile is fixed command-backed Responses auth with absolute paths; base files preserved byte-for-byte', async t => {
  const dir = await home(t); const store = new ProfileStore(dir);
  const base = Buffer.from([0, 255, 42, 10]);
  for (const name of ['config.toml', 'auth.json', 'other.config.toml']) await writeFile(join(dir, name), base);
  assert.equal(await apply(store), true); assert.equal(await store.status(), 'applied');
  const profile = await readFile(join(dir, PROFILE), 'utf8');
  assert.match(profile, /model_provider = "kastanje"/); assert.match(profile, /wire_api = "responses"/);
  assert.match(profile, /\[model_providers.kastanje.auth\]/); assert.ok(profile.includes(process.execPath)); assert.ok(profile.includes('/installed/auth.mjs'));
  for (const value of ['env_key', 'requires_openai_auth', 'bearer_token', FIXTURE_KEY]) assert.ok(!profile.includes(value));
  const before = await stat(join(dir, PROFILE)); assert.equal(await apply(store), false); assert.equal((await stat(join(dir, PROFILE))).mtimeMs, before.mtimeMs);
  assert.equal((await stat(join(dir, PROFILE))).mode & 0o777, 0o600);
  await store.recover(); await store.recover(); assert.equal(await store.status(), 'not_applied');
  for (const name of ['config.toml', 'auth.json', 'other.config.toml']) assert.deepEqual(await readFile(join(dir, name)), base);
  assert.throws(() => profileTemplate('relative', origin, bundle(), process.execPath, '/installed/auth.mjs'), /absolute/);
});
for (const name of [PROFILE, CATALOG, MANIFEST]) test('unmanaged or invalid destination refused: ' + name, async t => {
  const dir = await home(t); const store = new ProfileStore(dir); await writeFile(join(dir, name), 'original user content');
  await assert.rejects(apply(store)); assert.equal(await readFile(join(dir, name), 'utf8'), 'original user content');
  assert.deepEqual(await readdir(dir), [name]);
});
for (const name of [PROFILE, CATALOG, MANIFEST, 'kastanje.lock']) test('symlink destination refused: ' + name, async t => {
  const dir = await home(t); const target = join(dir, 'protected'); await writeFile(target, 'preserve'); await symlink(target, join(dir, name));
  await assert.rejects(apply(new ProfileStore(dir))); assert.equal(await readFile(target, 'utf8'), 'preserve');
});
test('symlink CODEX_HOME and ancestors are refused', async t => {
  const dir = await home(t); await mkdir(join(dir, 'real')); await symlink(join(dir, 'real'), join(dir, 'alias'));
  for (const path of [join(dir, 'alias'), join(dir, 'alias', 'nested')]) await assert.rejects(apply(new ProfileStore(path)), /symlink/);
  assert.deepEqual(await readdir(join(dir, 'real')), []);
});
test('user edits block both apply and recovery; check all destinations before touching any', async t => {
  const dir = await home(t); const store = new ProfileStore(dir); await apply(store);
  const original = await readFile(join(dir, PROFILE), 'utf8'); await writeFile(join(dir, CATALOG), 'user catalog');
  await assert.rejects(apply(store), /edited/); await assert.rejects(store.recover(), /edited/);
  assert.equal(await readFile(join(dir, PROFILE), 'utf8'), original); assert.equal(await readFile(join(dir, CATALOG), 'utf8'), 'user catalog');
});
test('partial write failure rolls back new files and previous managed revision', async t => {
  const dir = await home(t); const normal = new ProfileStore(dir);
  const broken = new ProfileStore(dir, { fault: () => { throw Error('Synthetic interrupted write'); } });
  await assert.rejects(apply(broken), /interrupted/); assert.deepEqual(await readdir(dir), []);
  await apply(normal); const before = await readFile(join(dir, PROFILE), 'utf8'); const manifest = await readFile(join(dir, MANIFEST), 'utf8');
  await assert.rejects(broken.apply('https://another.test', bundle(), process.execPath, '/new/helper'), /interrupted/);
  assert.equal(await readFile(join(dir, PROFILE), 'utf8'), before); assert.equal(await readFile(join(dir, MANIFEST), 'utf8'), manifest);
});
test('persisted interrupted transaction is recoverable and user edits are retained', async t => {
  const dir = await home(t); const store = new ProfileStore(dir); const after = profileTemplate(dir, origin, bundle(), process.execPath, '/helper');
  const journal = { owner: 'labs.kastanje.codex.profile.v1', version: 1, hashes: { [PROFILE]: null, [CATALOG]: null },
    pending: { [PROFILE]: { before: null, after }, [CATALOG]: { before: null, after: bundle().catalog } } };
  await writeFile(join(dir, MANIFEST), JSON.stringify(journal)); await writeFile(join(dir, PROFILE), after);
  assert.equal(await store.status(), 'recovery_needed'); await store.recover(); assert.deepEqual(await readdir(dir), []);
  await writeFile(join(dir, MANIFEST), JSON.stringify(journal)); await writeFile(join(dir, PROFILE), 'user edit after interruption');
  await assert.rejects(store.recover(), /user edits/); assert.equal(await readFile(join(dir, PROFILE), 'utf8'), 'user edit after interruption');
});
test('live and abandoned locks block writes without unsafe reclamation', async t => {
  const dir = await home(t); const store = new ProfileStore(dir);
  await writeFile(join(dir, 'kastanje.lock'), JSON.stringify({ pid: process.pid })); await assert.rejects(apply(store), /Another/);
  await writeFile(join(dir, 'kastanje.lock'), JSON.stringify({ pid: 99999999 }));
  await assert.rejects(apply(store), /stopped operation/);
  assert.equal(await store.status(), 'not_applied');
});
test('auth helper returns only injected credential, rejects unknown argv and unsafe paths without reading stdin', async t => {
  const dir = await home(t); const vault = new MemoryVault(credential());
  assert.equal(await authToken(['auth', origin, dir], { vaultFactory: () => vault }), FIXTURE_KEY);
  for (const args of [[], ['auth', origin, dir, 'extra'], ['auth', 'http://example.test', dir], ['export', origin, dir], ['auth', origin, 'relative']]) await assert.rejects(authToken(args, { vaultFactory: () => vault }));
  vault.value = null; await assert.rejects(authToken(['auth', origin, dir], { vaultFactory: () => vault }));
  assert.equal(hash('test').length, 64);
});
test('invalid UTF-8 cannot disguise a user edit as unchanged managed content', async t => {
  const dir = await home(t); const store = new ProfileStore(dir);
  const data = { ...bundle(), catalog: '{"description":"\uFFFD"}\n' };
  await store.apply(origin, data, process.execPath, '/helper');
  const bytes = await readFile(join(dir, CATALOG)); const at = bytes.indexOf(Buffer.from('\uFFFD'));
  assert.ok(at >= 0);
  const edited = Buffer.concat([bytes.subarray(0, at), Buffer.from([255]), bytes.subarray(at + 3)]);
  await writeFile(join(dir, CATALOG), edited);
  await assert.rejects(store.recover(), /invalid UTF-8/); assert.deepEqual(await readFile(join(dir, CATALOG)), edited);
});
test('concurrent stopped-lock recovery attempts cannot delete or replace each other’s lock', async t => {
  const dir = await home(t); const lock = join(dir, 'kastanje.lock');
  const original = JSON.stringify({ pid: 99999999 }); await writeFile(lock, original);
  let entered = 0;
  const results = await Promise.allSettled([new ProfileStore(dir), new ProfileStore(dir)].map(store => store.locked(async () => { entered++; })));
  assert.equal(entered, 0); assert.ok(results.every(result => result.status === 'rejected'));
  assert.equal(await readFile(lock, 'utf8'), original);
});
