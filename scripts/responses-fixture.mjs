// Explicit local synthetic fixture. No upstream forwarding, account access or OS vault writes.
import { createServer } from 'node:http';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProfileStore } from '../src/profile.mjs';
import { fixtureBundle, FIXTURE_KEY } from '../src/fixture.mjs';
import { validateBundle } from '../src/protocol.mjs';
const args = process.argv.slice(2);
if (args.length > 2 || (args.length && args[0] !== '--port')) throw Error('Use --port PORT');
const port = Number(args[1] || 43189);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid fixture port');
const origin = `http://127.0.0.1:${port}`;
const home = await mkdtemp(join(await realpath(tmpdir()), 'kastanje-responses-fixture-'));
const helper = join(home, 'synthetic-auth.mjs');
await writeFile(helper, `// Synthetic token only; never reads a vault or environment.\nprocess.stdout.write(${JSON.stringify(FIXTURE_KEY + '\n')});\n`, { mode: 0o600 });
const profiles = new ProfileStore(home);
await profiles.apply(origin, validateBundle(fixtureBundle()), process.execPath, helper);
let requestCount = 0;
const server = createServer(async (req, res) => {
  if (req.headers.host !== `127.0.0.1:${port}` || (req.headers.origin && req.headers.origin !== origin)) { res.writeHead(403); return res.end(); }
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET' && req.url === '/fixture/status') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ synthetic: true, requestCount })); }
  if (req.headers.authorization !== 'Bearer ' + FIXTURE_KEY) { res.writeHead(401); return res.end(); }
  if (req.method === 'GET' && req.url === '/v1/models') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ object: 'list', data: [{ id: 'demo-text', object: 'model', owned_by: 'synthetic-fixture' }] })); }
  if (req.method !== 'POST' || req.url !== '/v1/responses') { res.writeHead(404); return res.end(); }
  try {
    let text = ''; for await (const part of req) { text += part; if (text.length > 1024 * 1024) { res.writeHead(413); return res.end(); } }
    const body = JSON.parse(text);
    if (body.model !== 'demo-text') { res.writeHead(400); return res.end(); }
    requestCount++;
    const content = 'Synthetic Responses fixture completed.';
    const message = { id: 'msg_fixture', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: content, annotations: [] }] };
    const response = { id: 'resp_fixture', object: 'response', created_at: Math.floor(Date.now() / 1000), status: 'completed', model: 'demo-text', output: [message], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } };
    if (!body.stream) { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(response)); }
    res.setHeader('Content-Type', 'text/event-stream');
    let sequence_number = 0;
    const event = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: sequence_number++, ...data })}\n\n`);
    event('response.created', { response: { ...response, status: 'in_progress', output: [] } });
    event('response.output_item.added', { output_index: 0, item: { ...message, status: 'in_progress', content: [] } });
    event('response.content_part.added', { item_id: message.id, output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } });
    event('response.output_text.delta', { item_id: message.id, output_index: 0, content_index: 0, delta: content });
    event('response.output_text.done', { item_id: message.id, output_index: 0, content_index: 0, text: content });
    event('response.content_part.done', { item_id: message.id, output_index: 0, content_index: 0, part: message.content[0] });
    event('response.output_item.done', { output_index: 0, item: message });
    event('response.completed', { response }); res.end();
  } catch { res.writeHead(400); res.end(); }
});
let stopping = false;
const close = async () => { if (stopping) return; stopping = true; await new Promise(resolve => server.close(resolve)); await rm(home, { recursive: true, force: true }); };
process.once('SIGINT', () => { void close(); }); process.once('SIGTERM', () => { void close(); });
try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); }
catch (error) { await rm(home, { recursive: true, force: true }); throw error; }
const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'";
process.stdout.write(`Synthetic Responses fixture: ${origin}\nSynthetic fixture CODEX_HOME: ${home}\nCODEX_HOME=${shellQuote(home)} codex --profile kastanje exec --skip-git-repo-check "Reply with the fixture result"\nUses a synthetic token helper, not the OS vault. No request can leave this fixture.\n`);
