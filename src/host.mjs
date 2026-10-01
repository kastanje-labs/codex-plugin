import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
const frame = document.querySelector('#app');
window.previewCalls = []; window.previewLinks = [];
const themeControl = document.querySelector('#theme');
const initialTheme = location.hash.slice(1);
themeControl.value = ['light', 'dark', 'system'].includes(initialTheme) ? initialTheme : 'dark';
function hostContext(theme) {
  return { displayMode: 'inline', ...(theme === 'system' ? {} : { theme }), styles: { variables: {
    '--color-background-primary': theme === 'light' ? '#ffffff' : '#171717',
    '--color-text-primary': theme === 'light' ? '#171717' : '#ffffff',
  } } };
}
const bridge = new AppBridge(null, { name: 'kastanje-synthetic-host', version: '0.1.0' }, { openLinks: {}, serverTools: {} }, { hostContext: hostContext(themeControl.value) });
themeControl.addEventListener('change', () => bridge.setHostContext(hostContext(themeControl.value)));
bridge.oncalltool = async ({ name }) => {
  window.previewCalls.push(name);
  const response = await fetch('/api/tool', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  if (!response.ok) throw Error('Synthetic host request failed');
  return response.json();
};
bridge.onopenlink = async ({ url }) => {
  window.previewLinks.push(url); document.querySelector('#link').textContent = url;
  return {};
};
bridge.oninitialized = async () => {
  await bridge.sendToolInput({ name: 'kastanje_open', arguments: {} });
  await bridge.sendToolResult(await bridge.oncalltool({ name: 'kastanje_open' }));
};
await bridge.connect(new PostMessageTransport(frame.contentWindow, frame.contentWindow));
frame.src = '/app';
