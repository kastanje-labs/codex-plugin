import { App, applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps';
import { OpenAIExtensions } from '@openai/mcp-extensions/app';
const root = document.querySelector('#root');
const app = new App({ name: 'kastanje-setup', version: '0.1.0' });
new OpenAIExtensions(app);
let state, busy = '', error = '', notice = '', timer, generation = 0;
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const button = (action, label, style = '', disabled = false) => `<button data-action="${action}" class="${style}" ${disabled || (busy && action !== 'cancel') ? 'disabled' : ''}>${escape(busy === action ? 'Working…' : label)}</button>`;
const link = (name, label, style = '') => `<button data-link="${name}" class="${style}">${label}<span aria-hidden="true">↗</span></button>`;
function render() {
  const focus = document.activeElement?.dataset;
  const pending = state?.phase === 'pending';
  const connected = !!state?.connected;
  root.innerHTML = `<div class="shell"><aside><div class="brand"><img src="/*MARK_URL*/" alt="" width="32" height="32"><span>Kastanje</span></div><span class="client">FOR CODEX</span><nav aria-label="Kastanje platform">${link('platform', 'Platform')}${link('setup', 'Hosted setup')}${link('keys', 'API keys')}${link('activity', 'Activity')}${link('settings', 'Settings')}</nav><p class="sidebar-note">Your projects, models and budgets live in Kastanje.</p></aside><main><header><span class="eyebrow">YOUR WORKSPACE, CONNECTED</span><span class="badge ${connected ? 'connected' : ''}">${pending ? 'Connecting' : connected ? 'Connected' : 'Disconnected'}</span></header>${state?.mock ? '<p class="mock" role="note">Synthetic preview · no live login or inference.</p>' : ''}<section class="intro"><h1>A little connection.<br>A whole platform.</h1><p>Bring your Kastanje project to Codex. Keep managing it in the place you already know.</p></section><p id="error" class="error" role="alert" ${error ? '' : 'hidden'}>${escape(error)}</p><p class="notice" role="status" ${notice ? '' : 'hidden'}>${escape(notice)}</p><section class="card" aria-labelledby="connection-heading"><div class="card-heading"><span class="step">01</span><h2 id="connection-heading">Connect your project</h2></div>${pending || busy === 'begin' ? `<p>Confirm the matching code on Kastanje, then choose your project.</p>${state?.userCode ? `<div class="code" aria-label="Connection code">${escape(state.userCode)}</div><p class="small">Waiting for approval. The code expires in ten minutes or less.</p><div class="actions">${link('connectUrl', 'Open confirmation', 'primary')}${button('cancel', 'Cancel connection')}</div>` : `<p role="status">Requesting a connection code…</p>${button('cancel', 'Cancel connection')}`}` : connected ? `<p>Your project is connected on this device. Manage models, connections and spending on the platform.</p><div class="actions">${link('setup', 'Open hosted setup', 'primary')}${button('begin', 'Reconnect')}</div>` : `<p>Sign in and choose a project on the hosted platform. Your existing Codex login stays in place.</p>${button('begin', 'Connect Kastanje', 'primary', !state)}`}</section><section class="card" aria-labelledby="profile-heading"><div class="card-heading"><span class="step">02</span><h2 id="profile-heading">Use it in Codex CLI</h2></div><p>Sync your selected models, then apply the separate Kastanje profile.</p><dl><div><dt>Platform catalog</dt><dd>${state?.catalog ? `${state.catalog.count} ${state.catalog.count === 1 ? 'model' : 'models'} · default ${escape(state.catalog.defaultModel)}` : 'Sync to check selected models'}</dd></div><div><dt>Codex profile</dt><dd>${escape(({ applied: 'Applied', not_applied: 'Not applied', recovery_needed: 'Recovery needed', blocked: 'Needs attention' })[state?.profile] || 'Checking…')}</dd></div></dl>${state?.profileError ? `<p class="error">${escape(state.profileError)}</p>` : ''}<div class="actions">${button('sync', 'Sync catalog', '', !connected || pending)}${button('apply', 'Apply Codex profile', 'primary', !connected || pending || !state?.catalog)}</div><div class="launch"><span>Launch from your terminal</span><code>codex --profile kastanje</code></div><p class="small">Run Codex normally to use your existing setup. Desktop provider picker support is not established.</p></section><footer><div class="actions">${button('recover', 'Remove managed profile', '', !state || state.profile === 'not_applied')}${button('disconnect', 'Disconnect this device', '', !connected && !pending)}</div><p class="small">Disconnect removes the local credential and unchanged managed profile files. Revoke the project key in ${link('keys', 'API keys', 'inline-link')}.</p></footer></main></div>`;
  if (focus?.action) root.querySelector(`[data-action="${focus.action}"]`)?.focus();
  if (focus?.link) root.querySelector(`[data-link="${focus.link}"]`)?.focus();
}
function schedule() {
  clearTimeout(timer);
  if (state?.phase === 'pending' && state.userCode && !document.hidden) timer = setTimeout(() => { void perform('poll'); }, Math.max(3000, state.nextPollMs || 0));
}
function receive(result) {
  if (result?.isError) throw Error(result.content?.find(part => part.type === 'text')?.text || 'Kastanje could not complete the action.');
  const next = result?._meta?.['kastanje/status'];
  if (next) { state = next; render(); schedule(); }
}
async function open(name) {
  const url = name === 'connectUrl' ? state?.connectUrl : state?.links?.[name];
  if (!url) return;
  try { await app.openLink({ url }); }
  catch { error = 'The host could not open Kastanje. Try opening the confirmation again.'; render(); }
}
async function perform(action) {
  if (busy && action !== 'cancel') return;
  const mine = action === 'poll' ? generation : ++generation;
  clearTimeout(timer);
  if (action !== 'poll') busy = action;
  error = ''; notice = ''; render();
  try {
    const result = await app.callServerTool({ name: 'kastanje_' + action, arguments: {} });
    if (mine !== generation) return;
    receive(result);
    if (action === 'begin' && state?.userCode) await open('connectUrl');
    if (action === 'sync') notice = 'Catalog synced. Apply the profile to use these models.';
    if (action === 'apply') notice = 'Profile applied. Start a new Codex CLI session with the command below.';
    if (action === 'recover') notice = 'Managed profile removed. Your normal Codex setup is ready.';
    if (action === 'disconnect') notice = 'This device is disconnected. Revoke the key on Kastanje if it is no longer needed.';
  } catch (cause) {
    if (mine === generation) {
      error = cause.message || 'Kastanje could not complete the action.';
      // Terminal auth errors must clear pending UI without starting another poll loop.
      try { receive(await app.callServerTool({ name: 'kastanje_status', arguments: {} })); } catch { /* Keep the actionable error visible. */ }
    }
  } finally { if (mine === generation) { busy = ''; render(); schedule(); } }
}
root.addEventListener('click', event => {
  const target = event.target.closest('button');
  if (target?.dataset.action) void perform(target.dataset.action);
  if (target?.dataset.link) void open(target.dataset.link);
});
app.ontoolresult = result => { try { receive(result); } catch (cause) { error = cause.message; render(); } };
app.onhostcontextchanged = context => {
  if (context.theme) applyDocumentTheme(context.theme);
  if (context.styles?.variables) applyHostStyleVariables(context.styles.variables);
};
document.addEventListener('visibilitychange', schedule);
window.addEventListener('pagehide', () => clearTimeout(timer));
render();
try { await app.connect(); if (!state) await perform('status'); }
catch { error = 'Open this setup panel in a supported MCP Apps host.'; busy = ''; render(); }
