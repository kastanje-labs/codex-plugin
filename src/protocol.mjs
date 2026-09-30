import { createHash } from 'node:crypto';

export const DEFAULT_ORIGIN = 'https://kastanje-app-demo.gustavonline.workers.dev';
export class SafeError extends Error {}
export const fail = message => { throw new SafeError(message); };
export const hash = value => createHash('sha256').update(value).digest('hex');
export const record = value => value && typeof value === 'object' && !Array.isArray(value);
export const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
export const token = value => typeof value === 'string' && /^[\x21-\x7e]{16,512}$/.test(value);
export const safeMessage = error => error instanceof SafeError ? error.message : 'The operation failed. Check the connection or credential vault and try again.';

export function platformOrigin(value, { allowLoopback = false } = {}) {
  let url;
  try { url = new URL(value); } catch { fail('Configure a full HTTPS platform origin.'); }
  if (typeof value !== 'string' || url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      value !== url.origin || !(url.protocol === 'https:' ||
      (allowLoopback && url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname)))) {
    fail('Configure an HTTPS origin without credentials, path, query or fragment.');
  }
  return url.origin;
}

const messages = {
  401: 'The connection was revoked or expired. Connect again.',
  403: 'The connection request was denied.',
  409: 'This connection request was already used. Connect again.',
  410: 'The connection code expired. Connect again.',
  429: 'The platform is busy. Try again later.'
};
export async function request(origin, path, { body, key, signal, timeout = 10000, limit = 2 * 1024 * 1024 } = {}) {
  // All callers use fixed paths. Neither MCP nor the UI accepts URLs.
  if (!['/api/extension/device', '/api/extension/token', '/v1/pixelroute/setup?client=codex'].includes(path)) fail('Unsupported platform request.');
  try {
    const response = await fetch(origin + path, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error',
      signal: AbortSignal.any([AbortSignal.timeout(timeout), ...(signal ? [signal] : [])]),
      headers: { Accept: 'application/json', Origin: origin,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(key ? { Authorization: 'Bearer ' + key } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (!response.ok) { await response.body?.cancel(); fail(messages[response.status] || 'The platform could not complete the request.'); }
    if (!response.headers.get('content-type')?.includes('application/json')) { await response.body?.cancel(); fail('The platform returned an invalid response.'); }
    const reader = response.body?.getReader();
    if (!reader) fail('The platform returned an empty response.');
    let size = 0; const chunks = [];
    try {
      for (;;) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.byteLength;
        if (size > limit) fail('The platform response exceeded the size limit.');
        chunks.push(part.value);
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof SafeError) throw error;
    fail('The platform request failed or timed out. Try again.');
  }
}

export function validateBundle(bundle, secret) {
  if (!record(bundle) || bundle.client !== 'codex' || !['demo', 'live', 'mixed'].includes(bundle.mode) ||
      !Array.isArray(bundle.modelIds) || bundle.modelIds.length < 1 || bundle.modelIds.length > 256 ||
      !bundle.modelIds.every(id) || new Set(bundle.modelIds).size !== bundle.modelIds.length ||
      !bundle.modelIds.includes(bundle.defaultModel)) fail('The platform setup bundle is invalid.');
  // Select one data file; never follow or execute downloaded paths or TOML.
  const files = bundle.files;
  let content;
  if (Array.isArray(files)) {
    const matches = files.filter(file => record(file) && (file.path ?? file.name) === 'kogle-models.json');
    if (matches.length === 1) content = matches[0].content;
  } else if (record(files)) content = files['kogle-models.json'];
  let catalog;
  try { catalog = typeof content === 'string' ? JSON.parse(content) : content; } catch { fail('The platform model catalog is invalid.'); }
  if (!record(catalog) || !Array.isArray(catalog.models) || catalog.models.length !== bundle.modelIds.length ||
      !catalog.models.every(model => record(model) && id(model.slug)) ||
      new Set(catalog.models.map(model => model.slug)).size !== catalog.models.length ||
      !catalog.models.every(model => bundle.modelIds.includes(model.slug))) fail('The platform model catalog does not match its model IDs.');
  const bytes = JSON.stringify(catalog, null, 2) + '\n';
  if (Buffer.byteLength(bytes) > 2 * 1024 * 1024 || (secret && JSON.stringify(bundle).includes(secret))) fail('The platform setup bundle is unsafe.');
  // Preserve platform capabilities byte-equivalently as JSON values; no extension model conversion.
  return { catalog: bytes, defaultModel: bundle.defaultModel, count: bundle.modelIds.length, mode: bundle.mode };
}
