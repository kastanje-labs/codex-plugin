// Actual native plugin parsing/installation in a disposable Codex home; no inference.
import { execFileSync } from 'node:child_process';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const version = JSON.parse(await (await import('node:fs/promises')).readFile('package.json', 'utf8')).version;
const dir = await mkdtemp(join(await realpath(tmpdir()), 'kastanje-native-plugin-'));
const home = join(dir, 'codex-home');
const env = { ...process.env, CODEX_HOME: home };
const run = args => execFileSync('codex', args, { env, encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] });
try {
  execFileSync('tar', ['-xzf', resolve(`output/kastanje-codex-plugin-${version}-${process.platform}-${process.arch}.tgz`), '-C', dir]);
  const root = join(dir, 'package');
  run(['plugin', 'marketplace', 'add', root, '--json']);
  const installed = JSON.parse(run(['plugin', 'add', 'kastanje@kastanje-local', '--json']));
  const server = JSON.parse(run(['mcp', 'list', '--json'])).find(item => item.name === 'kastanje');
  assert.equal(server.enabled, true);
  assert.equal(server.transport.command, 'node');
  assert.equal(resolve(server.transport.cwd), resolve(installed.installedPath));
  assert.deepEqual(server.transport.args, ['./dist/server.mjs']);
  const client = new Client({ name: 'kastanje-native-parser-proof', version: '1.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath,
    args: [...server.transport.args, '--fixture', join(dir, 'fixture-home')],
    cwd: server.transport.cwd, env, stderr: 'pipe' }));
  try {
    const tools = await client.listTools(); assert.ok(tools.tools.some(tool => tool.name === 'kastanje_open'));
    assert.equal((await client.callTool({ name: 'kastanje_open', arguments: {} }))._meta['kastanje/status'].mock, true);
    assert.match((await client.readResource({ uri: 'ui://kastanje/setup' })).contents[0].text, /Kastanje/);
  } finally { await client.close(); }
  process.stdout.write('Actual Codex local install/parser and installed MCP handshake/resource passed in a disposable home.\n');
} finally { await rm(dir, { recursive: true, force: true }); }
