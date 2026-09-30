import { constants } from 'node:fs';
import { lstat, mkdir, open, rename, unlink } from 'node:fs/promises';
import { isAbsolute, join, parse, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fail, hash, record } from './protocol.mjs';

export const PROFILE = 'kastanje.config.toml';
export const CATALOG = 'kastanje.kogle-models.json';
export const MANIFEST = 'kastanje.managed.json';
const LOCK = 'kastanje.lock';
const OWNED = [PROFILE, CATALOG];
const OWNER = 'labs.kastanje.codex.profile.v1';
const digest = text => text === null ? null : hash(text);
const quote = value => JSON.stringify(value);

export function profileTemplate(home, origin, bundle, node, helper) {
  if (![home, node, helper].every(isAbsolute)) fail('Profile paths must be absolute.');
  return `# Managed by the Kastanje plugin. Select explicitly with codex --profile kastanje.\n` +
    `model = ${quote(bundle.defaultModel)}\nmodel_provider = "kastanje"\nmodel_catalog_json = ${quote(join(home, CATALOG))}\nweb_search = "disabled"\n\n` +
    `[features]\napps = false\nmulti_agent = false\n\n` +
    `[model_providers.kastanje]\nname = "Kastanje"\nbase_url = ${quote(origin + '/v1')}\nwire_api = "responses"\nsupports_websockets = false\nrequest_max_retries = 0\nstream_max_retries = 0\n\n` +
    `[model_providers.kastanje.auth]\ncommand = ${quote(node)}\nargs = [${quote(helper)}, "auth", ${quote(origin)}, ${quote(home)}]\ntimeout_ms = 5000\nrefresh_interval_ms = 300000\n`;
}

// Reject symlinks in every existing component, including CODEX_HOME ancestors.
export async function safeParents(path) {
  const absolute = resolve(path); const root = parse(absolute).root;
  let current = root;
  for (const part of absolute.slice(root.length).split(/[\\/]/).filter(Boolean)) {
    current = join(current, part);
    try { const stat = await lstat(current); if (!stat.isDirectory() || stat.isSymbolicLink()) fail('A profile directory is a symlink or is not a directory.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
async function textAt(path) {
  let file;
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) fail('A managed destination is unsafe or too large.');
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const bytes = await file.readFile();
    const text = bytes.toString('utf8');
    // Ownership is byte-sensitive. Lossy UTF-8 decoding must never hide user edits.
    if (!Buffer.from(text, 'utf8').equals(bytes)) fail('A managed destination contains invalid UTF-8. Preserve it before retrying.');
    return text;
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  finally { await file?.close(); }
}
function parseManifest(text) {
  if (text === null) return null;
  let data; try { data = JSON.parse(text); } catch { fail('The Kastanje ownership record is invalid.'); }
  if (!record(data) || data.owner !== OWNER || data.version !== 1 || !record(data.hashes) ||
      Object.keys(data.hashes).some(name => !OWNED.includes(name)) ||
      !OWNED.every(name => data.hashes[name] === null || /^[a-f0-9]{64}$/.test(data.hashes[name] ?? ''))) fail('The Kastanje ownership record is invalid.');
  if (data.pending) {
    if (!record(data.pending) || !OWNED.every(name => record(data.pending[name]) &&
        ['before', 'after'].every(key => data.pending[name][key] === null || typeof data.pending[name][key] === 'string')) ||
        !OWNED.every(name => digest(data.pending[name].before) === data.hashes[name])) fail('The recovery journal is invalid.');
  }
  return data;
}

export class ProfileStore {
  constructor(home, { fault = () => {} } = {}) { this.home = resolve(home); this.fault = fault; }
  path(name) { return join(this.home, name); }
  async read() {
    await safeParents(this.home);
    const manifestText = await textAt(this.path(MANIFEST));
    const data = parseManifest(manifestText);
    const files = Object.fromEntries(await Promise.all(OWNED.map(async name => [name, await textAt(this.path(name))])));
    return { data, manifestText, files };
  }
  assertOwned({ data, files }) {
    if (!OWNED.every(name => digest(files[name]) === (data?.hashes[name] ?? null))) fail('A profile destination is unmanaged or was edited. Preserve it before retrying.');
  }
  async status() {
    const state = await this.read();
    if (state.data?.pending) return 'recovery_needed';
    this.assertOwned(state);
    return state.data ? 'applied' : 'not_applied';
  }
  async locked(fn) {
    await safeParents(this.home); await mkdir(this.home, { recursive: true, mode: 0o700 });
    const path = this.path(LOCK);
    let file;
    try { file = await open(path, 'wx', 0o600); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const old = await textAt(path);
      let pid; try { pid = JSON.parse(old).pid; } catch { fail('The Kastanje lock is invalid. Check it manually.'); }
      if (!Number.isSafeInteger(pid) || pid < 1) fail('The Kastanje lock is invalid.');
      try { process.kill(pid, 0); fail('Another Kastanje profile operation is running.'); }
      catch (running) { if (running.code !== 'ESRCH') throw running; }
      // Reclaiming by read-then-unlink can delete another process's new lock.
      // Fail closed; a stopped runtime's lock needs deliberate manual cleanup.
      fail('A stopped operation left a Kastanje lock. Confirm no plugin runtime is writing, then remove only kastanje.lock before retrying.');
    }
    try { await file.writeFile(JSON.stringify({ pid: process.pid })); await file.sync(); return await fn(); }
    finally { await file.close(); await unlink(path); }
  }
  async replace(name, expected, next) {
    await safeParents(this.home);
    if (await textAt(this.path(name)) !== expected) fail('A managed file changed during the operation. No replacement was made.');
    if (next === null) { if (expected !== null) await unlink(this.path(name)); return; }
    if (next === expected) return;
    const temp = this.path('.kastanje-' + randomUUID());
    const file = await open(temp, 'wx', 0o600);
    try { await file.writeFile(next); await file.sync(); }
    finally { await file.close(); }
    try {
      if (await textAt(this.path(name)) !== expected) fail('A managed file changed during the operation.');
      await rename(temp, this.path(name));
    } finally { await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  async rollback(state) {
    const journal = state.data?.pending;
    if (!journal) return state;
    // Check every destination before changing any of them.
    if (!OWNED.every(name => [journal[name].before, journal[name].after].includes(state.files[name]))) fail('Recovery found user edits. Managed files were left in place.');
    for (const name of OWNED) await this.replace(name, state.files[name], journal[name].before);
    const previous = OWNED.every(name => journal[name].before === null) ? null :
      JSON.stringify({ owner: OWNER, version: 1, hashes: state.data.hashes }, null, 2) + '\n';
    await this.replace(MANIFEST, state.manifestText, previous);
    return this.read();
  }
  async transact(next) {
    let state = await this.rollback(await this.read()); this.assertOwned(state);
    if (OWNED.every(name => state.files[name] === next[name])) return false;
    const journal = JSON.stringify({ owner: OWNER, version: 1,
      hashes: Object.fromEntries(OWNED.map(name => [name, digest(state.files[name])])),
      pending: Object.fromEntries(OWNED.map(name => [name, { before: state.files[name], after: next[name] }])) }, null, 2) + '\n';
    await this.replace(MANIFEST, state.manifestText, journal);
    try {
      for (const name of OWNED) { await this.replace(name, state.files[name], next[name]); this.fault(name); }
      const result = OWNED.every(name => next[name] === null) ? null : JSON.stringify({ owner: OWNER, version: 1,
        hashes: Object.fromEntries(OWNED.map(name => [name, digest(next[name])])) }, null, 2) + '\n';
      await this.replace(MANIFEST, journal, result);
    } catch (error) { await this.rollback(await this.read()); throw error; }
    return true;
  }
  async apply(origin, bundle, node, helper) {
    return this.locked(() => this.transact({ [PROFILE]: profileTemplate(this.home, origin, bundle, node, helper), [CATALOG]: bundle.catalog }));
  }
  async recover() { return this.locked(() => this.transact({ [PROFILE]: null, [CATALOG]: null })); }
}
