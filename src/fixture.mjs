// Synthetic data only. This module is available solely through explicit --fixture mode.
import { ConnectionService } from './service.mjs';
import { validateCredential } from './vault.mjs';
import { SafeError } from './protocol.mjs';
export const FIXTURE_KEY = 'synthetic-kastanje-key-never-live';
export const fixtureBundle = () => ({
  client: 'codex', mode: 'demo', modelIds: ['demo-text'], defaultModel: 'demo-text',
  files: { 'kogle-models.json': JSON.stringify({ models: [{
    slug: 'demo-text', display_name: 'Synthetic text model', description: 'Local fixture only',
    default_reasoning_level: 'medium', supported_reasoning_levels: [{ effort: 'medium', description: 'Fixture' }],
    shell_type: 'shell_command', visibility: 'list', supported_in_api: true, priority: 0,
    availability_nux: null, upgrade: null, base_instructions: 'Use the tools provided by the client.',
    supports_reasoning_summaries: true, support_verbosity: false, default_verbosity: null,
    apply_patch_tool_type: 'freeform', web_search_tool_type: 'text',
    truncation_policy: { mode: 'bytes', limit: 16000 }, supports_parallel_tool_calls: true,
    context_window: 128000, auto_compact_token_limit: 100000, effective_context_window_percent: 90,
    experimental_supported_tools: [], input_modalities: ['text']
  }] }) }
});
export class MemoryVault {
  constructor(value = null) { this.value = value; }
  async get() { return this.value; }
  async set(value) { this.value = validateCredential(value); }
  async delete() { this.value = null; }
}
export function fixtureService({ home, helper, scenario = 'approved', ...options }) {
  let polls = 0;
  const requestFn = async (_origin, path) => {
    if (scenario === 'network') throw new SafeError('Synthetic network failure. Try again.');
    if (path === '/api/extension/device') {
      polls = 0;
      return { device_code: 'd'.repeat(64), user_code: 'ABCD-1234-EF56', interval: 3, expires_in: scenario === 'expired' ? 3 : 600 };
    }
    if (path === '/api/extension/token') {
      if (++polls === 1) return { status: 'pending' };
      if (['denied', 'replay'].includes(scenario)) throw new SafeError(scenario === 'denied' ? 'The connection request was denied.' : 'This connection request was already used. Connect again.');
      return { status: 'authorized', key: FIXTURE_KEY, projectId: 'fixture-project', keyId: 'fixture-key' };
    }
    return fixtureBundle();
  };
  return new ConnectionService({ ...options, home, helper, mock: true, vault: new MemoryVault(), requestFn });
}
