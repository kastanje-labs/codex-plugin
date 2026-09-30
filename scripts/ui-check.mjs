import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import assert from 'node:assert/strict';
async function preview(scenario) {
  const reserve = createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const child = spawn(process.execPath, ['dist/server.mjs', '--preview', String(port), scenario], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', errors = '';
  child.stderr.on('data', data => { errors += data; });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('Preview startup timed out: ' + errors)), 10000);
    child.stdout.on('data', data => { output += data; if (output.includes('Synthetic Kastanje preview:')) { clearTimeout(timeout); resolve(); } });
    child.once('exit', code => { clearTimeout(timeout); reject(Error('Preview exited: ' + code + ' ' + errors)); });
  }).catch(error => { child.kill('SIGTERM'); throw error; });
  return { origin: `http://127.0.0.1:${port}`, close: async () => { child.kill('SIGTERM'); await once(child, 'exit'); assert.equal(errors, '', 'Preview stderr'); } };
}
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  for (const scenario of ['approved', 'denied', 'network']) {
    const host = await preview(scenario); const page = await browser.newPage({ viewport: { width: 1050, height: 1000 } });
    page.on('pageerror', error => errors.push(error.message));
    const outbound = []; page.on('request', request => { if (!request.url().startsWith(host.origin)) outbound.push(request.url()); });
    try {
      await page.goto(host.origin);
      const panel = page.frameLocator('#app');
      await panel.getByRole('button', { name: 'Connect Kastanje', exact: true }).waitFor();
      assert.match(await panel.locator('body').innerText(), /Synthetic preview/);
      await panel.getByRole('button', { name: 'Hosted setup', exact: false }).click();
      await panel.getByRole('button', { name: 'API keys', exact: false }).first().click();
      await panel.getByRole('button', { name: 'Activity', exact: false }).click();
      await page.waitForFunction(() => window.previewLinks.length === 3);
      assert.deepEqual((await page.evaluate(() => window.previewLinks)).map(url => new URL(url).pathname + new URL(url).search), ['/app/connect?client=codex', '/app/projects', '/app/activity']);
      if (scenario === 'approved') {
        await panel.getByRole('button', { name: 'Connect Kastanje', exact: true }).click();
        await panel.getByLabel('Connection code', { exact: true }).waitFor();
        assert.equal(await panel.getByLabel('Connection code', { exact: true }).innerText(), 'ABCD-1234-EF56');
        await panel.getByRole('button', { name: 'Cancel connection', exact: true }).click();
        await panel.getByRole('button', { name: 'Connect Kastanje', exact: true }).waitFor();
        assert.equal((await page.evaluate(() => window.previewCalls)).filter(name => name === 'kastanje_poll').length, 0);
      }
      await panel.getByRole('button', { name: 'Connect Kastanje', exact: true }).click();
      if (scenario === 'approved') {
        await panel.getByRole('button', { name: 'Reconnect', exact: true }).waitFor({ timeout: 15000 });
        await panel.getByRole('button', { name: 'Sync catalog', exact: true }).click();
        await panel.getByText('1 model · default demo-text', { exact: true }).waitFor();
        assert.ok(!await panel.getByText('Applied', { exact: true }).count());
        await panel.getByRole('button', { name: 'Apply Codex profile', exact: true }).click();
        await panel.getByText('Applied', { exact: true }).waitFor();
        await panel.getByRole('button', { name: 'Remove managed profile', exact: true }).click();
        await panel.getByText('Not applied', { exact: true }).waitFor();
        await panel.getByRole('button', { name: 'Apply Codex profile', exact: true }).click();
        await panel.getByText('Applied', { exact: true }).waitFor();
        await panel.getByRole('button', { name: 'Disconnect this device', exact: true }).click();
        await panel.getByRole('button', { name: 'Connect Kastanje', exact: true }).waitFor();
        await panel.getByText('Not applied', { exact: true }).waitFor();
        await page.setViewportSize({ width: 375, height: 820 });
        const frame = page.frames().find(frame => frame.url() === host.origin + '/app');
        assert.ok(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Responsive view must fit');
        await panel.getByRole('button', { name: 'Platform', exact: false }).focus(); await page.keyboard.press('Tab');
        assert.ok(await panel.getByRole('button', { name: 'Hosted setup', exact: false }).evaluate(button => document.activeElement === button), 'Keyboard navigation');
      } else {
        const alert = panel.locator('#error'); await alert.waitFor({ state: 'visible', timeout: 15000 });
        assert.match(await alert.innerText(), scenario === 'denied' ? /denied/ : /Synthetic network failure/);
        await panel.getByRole('button', { name: 'Connect Kastanje', exact: true }).waitFor();
        const before = (await page.evaluate(() => window.previewCalls)).filter(name => name === 'kastanje_poll').length;
        await page.waitForTimeout(3200);
        assert.equal((await page.evaluate(() => window.previewCalls)).filter(name => name === 'kastanje_poll').length, before, 'Terminal errors must stop polling');
      }
      assert.ok(!(await panel.locator('body').innerText()).includes('synthetic-kastanje-key-never-live'));
      assert.deepEqual(outbound, []); process.stdout.write(`UI ${scenario}: passed through AppBridge → HTTP host → stdio MCP.\n`);
    } finally { await page.close(); await host.close(); }
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
