import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_ORIGIN, fail, hash, platformOrigin, request, safeMessage, validateBundle } from './protocol.mjs';
import { OSVault, validateCredential } from './vault.mjs';
import { ProfileStore } from './profile.mjs';
import { homedir } from 'node:os';

export function runtimeOptions() {
  const origin = platformOrigin(process.env.KASTANJE_ORIGIN || DEFAULT_ORIGIN);
  const home = resolve(process.env.CODEX_HOME || resolve(homedir(), '.codex'));
  return { origin, home, node: process.execPath, helper: fileURLToPath(new URL('./auth.mjs', import.meta.url)) };
}
export class ConnectionService {
  constructor({ origin = DEFAULT_ORIGIN, home, node = process.execPath, helper, vault, profiles,
    now = Date.now, requestFn = request, allowLoopback = false, mock = false } = {}) {
    this.origin = platformOrigin(origin, { allowLoopback }); this.home = resolve(home);
    this.node = node; this.helper = helper; this.vault = vault || new OSVault(this.origin, this.home);
    this.profiles = profiles || new ProfileStore(this.home);
    this.now = now; this.request = requestFn; this.mock = mock;
    this.epoch = 0; this.pending = null; this.bundle = null; this.bundleCredential = null; this.serial = Promise.resolve();
  }
  queue(fn) { const task = this.serial.then(fn); this.serial = task.catch(() => {}); return task; }
  invalidate() { this.epoch++; this.pending?.controller.abort(); this.pending = null; this.bundle = null; this.bundleCredential = null; }
  async status() {
    const credential = await this.vault.get();
    if (!credential || this.bundleCredential !== hash(credential.key)) { this.bundle = null; this.bundleCredential = null; }
    let profile, profileError;
    try { profile = await this.profiles.status(); } catch (error) { profile = 'blocked'; profileError = safeMessage(error); }
    const pending = this.pending;
    return { mock: this.mock, origin: this.origin, connected: !!credential, phase: pending ? 'pending' : credential ? 'connected' : 'disconnected',
      ...(pending ? { userCode: pending.userCode, connectUrl: this.origin + '/connect/codex?code=' + encodeURIComponent(pending.userCode),
        expiresAt: pending.deadline, nextPollMs: Math.max(0, pending.nextPoll - this.now()) } : {}),
      catalog: this.bundle ? { defaultModel: this.bundle.defaultModel, count: this.bundle.count } : null,
      profile, ...(profileError ? { profileError } : {}), launchCommand: 'codex --profile kastanje',
      links: { platform: this.origin + '/app', setup: this.origin + '/app/connect?client=codex',
        keys: this.origin + '/app/projects', activity: this.origin + '/app/activity', settings: this.origin + '/app/settings' } };
  }
  begin() {
    this.invalidate(); const epoch = this.epoch;
    const controller = new AbortController();
    // Include the initiating request in cancellation/reconnect invalidation.
    this.pending = { controller, epoch, userCode: null, deadline: this.now() + 600000, nextPoll: Infinity };
    return this.queue(async () => {
      try {
        if (epoch !== this.epoch) return this.status();
        const verifier = randomBytes(32).toString('hex');
        const result = await this.request(this.origin, '/api/extension/device', { body: { code_challenge: hash(verifier), client: 'codex' }, signal: controller.signal, limit: 4096 });
        if (epoch !== this.epoch) return this.status();
        if (!result || !/^[a-f0-9]{64}$/.test(result.device_code) || !/^([A-F0-9]{4}-){2}[A-F0-9]{4}$/.test(result.user_code) ||
            !Number.isInteger(result.expires_in) || result.expires_in < 1 || result.expires_in > 600 ||
            !Number.isInteger(result.interval) || result.interval < 3 || result.interval > 60) fail('The platform returned an invalid connection code.');
        this.pending = { controller, epoch, verifier, device: result.device_code, userCode: result.user_code,
          deadline: this.now() + result.expires_in * 1000, interval: result.interval * 1000, nextPoll: this.now() + result.interval * 1000 };
        return this.status();
      } catch (error) { if (epoch === this.epoch) this.pending = null; throw error; }
    });
  }
  poll() {
    return this.queue(async () => {
      const pending = this.pending;
      if (!pending || !pending.userCode) return this.status();
      if (this.now() >= pending.deadline) { this.invalidate(); fail('The connection code expired. Connect again.'); }
      if (this.now() < pending.nextPoll) return this.status();
      pending.nextPoll = this.now() + pending.interval;
      try {
        const result = await this.request(this.origin, '/api/extension/token', { body: { device_code: pending.device, code_verifier: pending.verifier }, signal: pending.controller.signal, timeout: Math.min(10000, pending.deadline - this.now()), limit: 4096 });
        if (pending.epoch !== this.epoch) return this.status();
        if (this.now() >= pending.deadline) fail('The connection code expired. Connect again.');
        if (result?.status === 'pending') return this.status();
        if (result?.status !== 'authorized') fail('The connection request was not approved. Connect again.');
        const credential = validateCredential(result);
        if ([credential.keyId, credential.projectId].some(value => value.includes(credential.key))) fail('The connection credential is invalid.');
        // Queue mutations, and fence both sides of asynchronous vault operations.
        const previous = await this.vault.get();
        if (pending.epoch !== this.epoch) return this.status();
        await this.vault.set(credential);
        if (pending.epoch !== this.epoch) {
          if (previous) await this.vault.set(previous); else await this.vault.delete();
          return this.status();
        }
        this.pending = null; this.bundle = null; this.bundleCredential = null;
        return this.status();
      } catch (error) { if (pending.epoch === this.epoch) this.pending = null; throw error; }
    });
  }
  cancel() { this.invalidate(); return this.queue(() => this.status()); }
  sync() {
    const epoch = this.epoch;
    return this.queue(async () => {
      // A failed refresh must not leave an older catalog eligible for Apply.
      this.bundle = null; this.bundleCredential = null;
      const credential = await this.vault.get(); if (!credential) fail('Connect to Kastanje first.');
      const result = await this.request(this.origin, '/v1/pixelroute/setup?client=codex', { key: credential.key });
      if (epoch !== this.epoch) return this.status();
      const current = await this.vault.get();
      if (epoch !== this.epoch || !current || current.key !== credential.key) { this.bundle = null; this.bundleCredential = null; fail('The connection changed. Sync the current project catalog again.'); }
      this.bundle = validateBundle(result, credential.key);
      this.bundleCredential = hash(credential.key);
      return this.status();
    });
  }
  apply() {
    const epoch = this.epoch;
    return this.queue(async () => {
      const credential = await this.vault.get();
      if (epoch !== this.epoch || !this.bundle || !credential || this.bundleCredential !== hash(credential.key)) fail('Sync a connected platform catalog before applying.');
      await this.profiles.apply(this.origin, this.bundle, this.node, this.helper);
      return this.status();
    });
  }
  recover() { return this.queue(async () => { await this.profiles.recover(); return this.status(); }); }
  disconnect() {
    this.invalidate();
    return this.queue(async () => {
      // Remove local auth even if recovery refuses a user-edited profile.
      await this.vault.delete();
      await this.profiles.recover();
      return this.status();
    });
  }
}
