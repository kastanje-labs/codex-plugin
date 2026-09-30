import { cp, mkdir, readFile, readdir, rm, writeFile, rename, mkdtemp, realpath } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import assert from 'node:assert/strict';
const output = resolve('output'); const stage = join(output, 'package-stage');
await mkdir(output, { recursive: true }); await rm(stage, { recursive: true, force: true }); await mkdir(stage);
for (const file of ['.codex-plugin', '.mcp.json', '.agents', '.nvmrc', 'assets', 'skills', 'dist', 'src', 'README.md', 'LICENSE']) await cp(file, join(stage, file), { recursive: true });
await mkdir(join(stage, 'docs')); await cp('docs/delivery.md', join(stage, 'docs/delivery.md'));
await mkdir(join(stage, 'scripts')); await cp('scripts/responses-fixture.mjs', join(stage, 'scripts/responses-fixture.mjs'));
const native = (await readdir('node_modules/@napi-rs')).filter(name => name === 'keyring' || name.startsWith('keyring-'));
assert.ok(native.length > 1, 'Native vault package is missing for this build platform');
await mkdir(join(stage, 'node_modules/@napi-rs'), { recursive: true });
for (const name of native) await cp(join('node_modules/@napi-rs', name), join(stage, 'node_modules/@napi-rs', name), { recursive: true });
const original = JSON.parse(await readFile('package.json', 'utf8'));
const pkg = { name: original.name, version: original.version, private: true, type: 'module', license: 'MIT', engines: original.engines,
  description: 'Local Kastanje connection/setup plugin for Codex',
  scripts: { preview: 'node dist/server.mjs --preview 43188', fixture: 'node scripts/responses-fixture.mjs' },
  dependencies: Object.fromEntries(native.map(name => ['@napi-rs/' + name, '2.1.0'])),
  bundledDependencies: native.map(name => '@napi-rs/' + name),
  files: ['.codex-plugin/', '.mcp.json', '.agents/', '.nvmrc', 'assets/', 'skills/', 'dist/', 'src/', 'scripts/', 'source/', 'docs/', 'README.md', 'LICENSE'] };
await writeFile(join(stage, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
await mkdir(join(stage, 'source'));
for (const file of ['src', 'scripts', 'test', 'assets', 'skills', '.codex-plugin', '.mcp.json', '.agents', '.github', 'package.json', 'package-lock.json', '.nvmrc', 'README.md', 'LICENSE', 'docs/delivery.md']) {
  await mkdir(join(stage, 'source', file, '..'), { recursive: true });
  await cp(file, join(stage, 'source', file), { recursive: true });
}
const packed = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', output], { cwd: stage, encoding: 'utf8' }))[0];
const archive = join(output, `kastanje-codex-plugin-${original.version}-${process.platform}-${process.arch}.tgz`);
await rename(join(output, packed.filename), archive);
const names = packed.files.map(file => file.path);
for (const file of ['.codex-plugin/plugin.json', '.mcp.json', 'skills/kastanje-setup/SKILL.md', 'dist/server.mjs', 'dist/auth.mjs', 'dist/index.html', 'dist/THIRD-PARTY-NOTICES.md']) assert.ok(names.includes(file), 'Package missing ' + file);
assert.ok(!names.some(name => name.includes('AGENTS.md') || name.includes('requirements.md') || name.endsWith('.jsonl') || name.includes('auth.json')), 'Private/local input must not ship');
const extracted = await mkdtemp(join(await realpath(tmpdir()), 'kastanje-package-'));
try {
  execFileSync('tar', ['-xzf', archive, '-C', extracted]); const root = join(extracted, 'package');
  // Load the native module without opening or mutating any OS credential entry.
  execFileSync(process.execPath, ['--input-type=module', '-e', "import {Entry} from '@napi-rs/keyring'; if(typeof Entry !== 'function') process.exit(1)"], { cwd: root });
  const dir = join(extracted, 'isolated-codex-home'); await mkdir(dir);
  const manifest = JSON.parse(await readFile(join(root, '.codex-plugin/plugin.json'), 'utf8'));
  for (const path of [manifest.skills, manifest.mcpServers, manifest.interface.composerIcon, manifest.interface.logo]) {
    assert.ok(path.startsWith('./') && !path.split('/').includes('..'), 'Manifest paths must stay in the plugin root');
  }
  const mcp = JSON.parse(await readFile(join(root, manifest.mcpServers), 'utf8')).mcpServers.kastanje;
  assert.equal(mcp.command, 'node');
  const launch = mcp.args.map(arg => arg.replaceAll('${CLAUDE_PLUGIN_ROOT}', root));
  assert.deepEqual(launch, [join(root, 'dist/server.mjs')]);
  const client = new Client({ name: 'kastanje-relocation-test', version: '1.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [...launch, '--fixture', dir], cwd: root, stderr: 'pipe' }));
  try {
    assert.equal((await client.callTool({ name: 'kastanje_open', arguments: {} }))._meta['kastanje/status'].mock, true);
    assert.match((await client.readResource({ uri: 'ui://kastanje/setup' })).contents[0].text, /Kastanje/);
    assert.equal((await client.callTool({ name: 'kastanje_begin', arguments: {} }))._meta['kastanje/status'].phase, 'pending');
    await client.callTool({ name: 'kastanje_cancel', arguments: {} });
  } finally { await client.close(); }
  const result = spawnSync(process.execPath, [join(root, 'dist/auth.mjs'), 'wrong'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(result.status, 1); assert.equal(result.stdout, ''); assert.match(result.stderr, /Kastanje credential unavailable/);
} finally { await rm(extracted, { recursive: true, force: true }); await rm(stage, { recursive: true, force: true }); }
const proof = { version: original.version, platform: process.platform, arch: process.arch, archive: archive.slice(output.length + 1), sha512: packed.integrity, shasum: packed.shasum, files: names, nativeVaultLoadedWithoutCredentialAccess: true, relocatedMcp: 'passed' };
await writeFile(join(output, 'package-proof.json'), JSON.stringify(proof, null, 2) + '\n');
process.stdout.write(`Packaged and checked relocated ${process.platform}/${process.arch} artifact: ${archive}\n`);
