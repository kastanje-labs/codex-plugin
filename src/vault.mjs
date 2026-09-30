import { fail, hash, id, record, token } from './protocol.mjs';
import { resolve } from 'node:path';

// Native code is loaded only when a vault operation is requested. No plaintext fallback.
export class OSVault {
  constructor(origin, home) { this.account = hash(origin + '\n' + resolve(home)); }
  async entry() {
    try { const { Entry } = await import('@napi-rs/keyring'); return new Entry('labs.kastanje.codex.v1', this.account, { linux: { store: 'secret-service' } }); }
    catch { fail('The OS credential vault is unavailable. Linux requires a functioning Secret Service.'); }
  }
  async get() {
    try { const text = (await this.entry()).getPassword(); return text === null ? null : validateCredential(JSON.parse(text)); }
    catch { fail('The OS credential vault could not read the connection.'); }
  }
  async set(value) {
    try { (await this.entry()).setPassword(JSON.stringify(validateCredential(value))); }
    catch { fail('The OS credential vault could not save the connection. No file fallback was used.'); }
  }
  async delete() {
    try { const entry = await this.entry(); if (entry.getPassword() !== null) entry.deletePassword(); }
    catch { fail('The OS credential vault could not remove the connection.'); }
  }
}
export function validateCredential(value) {
  if (!record(value) || !token(value.key) || !id(value.projectId) || !id(value.keyId)) fail('The connection credential is invalid.');
  return { key: value.key, projectId: value.projectId, keyId: value.keyId };
}
