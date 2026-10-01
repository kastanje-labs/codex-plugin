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
async function checkTheme(panel, theme) {
  const colors = await panel.locator('body').evaluate(body => {
    const rgb = color => color.match(/[\d.]+/g).slice(0, 3).map(Number);
    const luminance = color => rgb(color).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
    const background = node => {
      for (let current = node; current; current = current.parentElement) {
        const color = getComputedStyle(current).backgroundColor;
        if (color !== 'rgba(0, 0, 0, 0)') return color;
      }
      return 'rgb(255, 255, 255)';
    };
    const selectors = ['h1', '.intro p', '.card h2', '.card p', '.eyebrow', '.client', 'nav button', '.brand', '.badge', '.small', '.mock', 'dt', 'dd', '.launch code', '.inline-link', '.primary:not(:disabled)', '.notice', '.error', '.code'];
    const text = selectors.flatMap(selector => [...body.querySelectorAll(selector)].filter(node => node.getClientRects().length && !node.closest('[disabled]')).map(node => {
      const a = luminance(getComputedStyle(node).color), b = luminance(background(node));
      return { selector, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
    }));
    return { page: getComputedStyle(body).backgroundColor, card: getComputedStyle(body.querySelector('.card')).backgroundColor,
      sidebar: getComputedStyle(body.querySelector('aside')).backgroundColor, scheme: getComputedStyle(body).colorScheme, text,
      fits: document.documentElement.scrollWidth <= innerWidth };
  });
  const light = theme === 'light';
  assert.equal(colors.page, light ? 'rgb(245, 248, 253)' : 'rgb(11, 20, 40)', `${theme} page surface`);
  assert.equal(colors.card, light ? 'rgb(255, 255, 255)' : 'rgb(18, 31, 55)', `${theme} card surface`);
  assert.equal(colors.sidebar, light ? 'rgb(237, 242, 249)' : 'rgb(14, 25, 48)', `${theme} sidebar surface`);
  assert.equal(colors.scheme, theme);
  for (const sample of colors.text) assert.ok(sample.ratio >= 4.5, `${theme} ${sample.selector} contrast ${sample.ratio.toFixed(2)}`);
  assert.ok(colors.fits, `${theme} responsive view must fit`);
}
async function switchTheme(page, panel, theme) {
  await page.getByLabel('Host theme', { exact: true }).selectOption(theme);
  await panel.locator(`html[data-theme="${theme}"]`).waitFor();
  await checkTheme(panel, theme);
}
try {
  const themeHost = await preview('approved');
  try {
    for (const initial of ['light', 'dark', 'system']) {
      const page = await browser.newPage({ viewport: { width: 1050, height: 1000 }, colorScheme: initial === 'dark' ? 'light' : 'dark' });
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto(`${themeHost.origin}/#${initial}`);
        const panel = page.frameLocator('#app');
        await panel.getByRole('note').waitFor();
        await panel.getByRole('button', { name: 'Connect Kastanje', exact: true }).waitFor();
        await checkTheme(panel, initial === 'system' ? 'dark' : initial);
        if (initial === 'system') {
          await page.emulateMedia({ colorScheme: 'light' });
          await panel.locator('html[data-theme="light"]').waitFor();
          await checkTheme(panel, 'light');
        } else {
          const calls = await page.evaluate(() => window.previewCalls.length);
          const frame = page.frames().find(frame => frame.url() === themeHost.origin + '/app');
          await frame.evaluate(() => { window.themeStateMarker = 'same-document'; });
          for (const theme of ['dark', 'light', 'dark']) {
            await switchTheme(page, panel, theme);
            await page.setViewportSize({ width: 375, height: 820 });
            await checkTheme(panel, theme);
            await page.setViewportSize({ width: 1050, height: 1000 });
          }
          assert.equal(await frame.evaluate(() => window.themeStateMarker), 'same-document', 'Theme changes must not reload the panel');
          assert.equal(await page.evaluate(() => window.previewCalls.length), calls, 'Theme changes must not call setup tools');
          if (initial === 'dark') {
            await page.emulateMedia({ colorScheme: 'light' });
            await checkTheme(panel, 'dark');
            await Promise.all([page.waitForEvent('load'), page.getByLabel('Host theme', { exact: true }).selectOption('system')]);
            assert.equal(page.url(), `${themeHost.origin}/#system`);
            await panel.getByRole('note').waitFor();
            await checkTheme(panel, 'light');
            await page.emulateMedia({ colorScheme: 'dark' });
            await panel.locator('html[data-theme="dark"]').waitFor();
            await checkTheme(panel, 'dark');
          }
        }
        process.stdout.write(`UI theme ${initial}: initial context, live changes, contrast and layout passed.\n`);
      } finally { await page.close(); }
    }
  } finally { await themeHost.close(); }
  for (const scenario of ['approved', 'denied', 'network']) {
    const host = await preview(scenario); const page = await browser.newPage({ viewport: { width: 1050, height: 1000 } });
    page.on('pageerror', error => errors.push(error.message));
    const outbound = []; page.on('request', request => { if (!request.url().startsWith(host.origin)) outbound.push(request.url()); });
    try {
      await page.goto(`${host.origin}/#${scenario === 'denied' ? 'light' : 'dark'}`);
      const panel = page.frameLocator('#app');
      await panel.getByRole('note').waitFor();
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
        await checkTheme(panel, 'dark');
        await switchTheme(page, panel, 'light');
        assert.equal(await panel.getByLabel('Connection code', { exact: true }).innerText(), 'ABCD-1234-EF56');
        await panel.getByRole('button', { name: 'Cancel connection', exact: true }).click();
        await panel.getByRole('button', { name: 'Connect Kastanje', exact: true }).waitFor();
        assert.equal((await page.evaluate(() => window.previewCalls)).filter(name => name === 'kastanje_poll').length, 0);
      }
      await panel.getByRole('button', { name: 'Connect Kastanje', exact: true }).click();
      if (scenario === 'approved') {
        await panel.getByRole('button', { name: 'Reconnect', exact: true }).waitFor({ timeout: 15000 });
        await checkTheme(panel, 'light');
        await panel.getByRole('button', { name: 'Sync catalog', exact: true }).click();
        await panel.getByText('1 model · default demo-text', { exact: true }).waitFor();
        await checkTheme(panel, 'light');
        await switchTheme(page, panel, 'dark');
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
        await checkTheme(panel, scenario === 'denied' ? 'light' : 'dark');
        await switchTheme(page, panel, scenario === 'denied' ? 'dark' : 'light');
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
