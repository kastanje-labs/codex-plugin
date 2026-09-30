import { build } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const root = resolve('.'); const out = join(root, 'dist');
await rm(out, { recursive: true, force: true }); await mkdir(out, { recursive: true });
const nodeOptions = { absWorkingDir: root, bundle: true, platform: 'node', format: 'esm', target: 'node22', metafile: true,
  external: ['@napi-rs/keyring'], banner: { js: "import {createRequire as __createRequire} from 'node:module';const require=__createRequire(import.meta.url);" } };
const server = await build({ ...nodeOptions, entryPoints: ['src/server.mjs'], outfile: join(out, 'server.mjs') });
const auth = await build({ ...nodeOptions, entryPoints: ['src/auth.mjs'], outfile: join(out, 'auth.mjs') });
const browser = { absWorkingDir: root, bundle: true, platform: 'browser', format: 'esm', target: 'es2022', minify: true, metafile: true };
const app = await build({ ...browser, entryPoints: ['src/app.mjs'], write: false });
const host = await build({ ...browser, entryPoints: ['src/host.mjs'], outfile: join(out, 'host.mjs') });
const css = await build({ absWorkingDir: root, entryPoints: ['src/styles.css'], bundle: true, minify: true, external: ['__GEIST_SANS__', '__GEIST_PIXEL__'], write: false });
let style = css.outputFiles[0].text;
for (const [key, file] of [['__GEIST_SANS__', 'geist-sans-variable.woff2'], ['__GEIST_PIXEL__', 'geist-pixel-square.woff2']]) {
  style = style.replaceAll(key, 'data:font/woff2;base64,' + (await readFile(join(root, 'assets/fonts', file))).toString('base64'));
}
const mark = 'data:image/svg+xml;base64,' + (await readFile(join(root, 'assets/kastanje-mark.svg'))).toString('base64');
const js = app.outputFiles[0].text.replaceAll('/*MARK_URL*/', mark).replaceAll('</script', '<\\/script');
const html = (await readFile('src/index.html', 'utf8')).replace('/*APP_CSS*/', () => style).replace('/*APP_JS*/', () => js);
await writeFile(join(out, 'index.html'), html); await copyFile('src/preview.html', join(out, 'preview.html'));
const roots = new Set(['node_modules/@napi-rs/keyring']);
for (const meta of [server.metafile, auth.metafile, app.metafile, host.metafile]) for (const input of Object.keys(meta.inputs)) {
  const parts = input.split('/'); const at = parts.lastIndexOf('node_modules'); if (at < 0) continue;
  roots.add(parts.slice(0, at + (parts[at + 1].startsWith('@') ? 3 : 2)).join('/'));
}
let notices = '# Third-party notices\n\nBundled packages retain the following license texts.\n';
for (const path of [...roots].sort()) {
  const info = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'));
  let license;
  for (const file of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'COPYING']) {
    try { license = await readFile(join(path, file), 'utf8'); break; } catch { /* Try conventional names. */ }
  }
  if (!license && info.name === '@cfworker/json-schema') license = await readFile('scripts/license-overrides/cfworker-json-schema-LICENSE', 'utf8');
  if (!license) throw Error('Missing license: ' + info.name);
  notices += `\n## ${info.name} ${info.version}\n\n${license}\n`;
}
notices += '\n## Geist fonts (SIL OFL)\n\n' + await readFile('assets/fonts/LICENSE.txt', 'utf8');
notices += '\n## Kastanje public MIT branding\n\n' + await readFile('assets/KASTANJE-ASSETS-LICENSE.txt', 'utf8');
await writeFile(join(out, 'THIRD-PARTY-NOTICES.md'), notices);
process.stdout.write('Built self-contained MCP App HTML, stdio server, auth helper and preview host.\n');
