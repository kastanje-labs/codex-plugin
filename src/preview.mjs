import { createServer } from 'node:http';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ACTIONS, URI } from './mcp.mjs';
export async function servePreview(port, scenario = 'approved') {
  // This host exercises stdio MCP and the browser AppBridge. It has no live vault or account.
  const home = await mkdtemp(join(await realpath(tmpdir()), 'kastanje-preview-'));
  const client = new Client({ name: 'kastanje-synthetic-preview', version: '0.1.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('./server.mjs', import.meta.url)), '--fixture', home, scenario], stderr: 'pipe' });
  try { await client.connect(transport); } catch (error) { await rm(home, { recursive: true, force: true }); throw error; }
  const origin = `http://127.0.0.1:${port}`;
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    const site = req.headers['sec-fetch-site'];
    if (req.headers.host !== `127.0.0.1:${port}` || (req.headers.origin && req.headers.origin !== origin) || (site && !['same-origin', 'none'].includes(site))) {
      res.writeHead(403); return res.end();
    }
    try {
      if (req.method === 'GET' && ['/', '/host.mjs', '/app'].includes(req.url)) {
        res.setHeader('Content-Type', req.url === '/host.mjs' ? 'text/javascript' : 'text/html;charset=utf-8');
        if (req.url === '/app') {
          const data = await client.readResource({ uri: URI }); return res.end(data.contents[0].text);
        }
        return res.end(await readFile(new URL(req.url === '/' ? './preview.html' : './host.mjs', import.meta.url)));
      }
      if (req.method !== 'POST' || req.url !== '/api/tool' || req.headers.origin !== origin || req.headers['content-type'] !== 'application/json') { res.writeHead(404); return res.end(); }
      let text = '';
      for await (const part of req) { text += part; if (text.length > 1024) { res.writeHead(413); return res.end(); } }
      const body = JSON.parse(text);
      if (!body || !['kastanje_open', ...ACTIONS.map(action => 'kastanje_' + action)].includes(body.name) || Object.keys(body).some(key => key !== 'name')) { res.writeHead(400); return res.end(); }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(await client.callTool({ name: body.name, arguments: {} })));
    } catch { res.writeHead(500); res.end('Synthetic preview unavailable'); }
  });
  let closing = false;
  const close = async () => {
    if (closing) return; closing = true;
    await new Promise(resolve => server.close(resolve));
    await client.close(); await rm(home, { recursive: true, force: true });
  };
  process.once('SIGTERM', () => { void close(); }); process.once('SIGINT', () => { void close(); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }).catch(async error => { await client.close(); await rm(home, { recursive: true, force: true }); throw error; });
  process.stdout.write(`Synthetic Kastanje preview: ${origin}\n`);
  return { server, close };
}
