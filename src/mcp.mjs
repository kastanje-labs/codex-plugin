import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { OpenAIExtensions } from '@openai/mcp-extensions/server';
import { readFile } from 'node:fs/promises';
import { safeMessage } from './protocol.mjs';
export const URI = 'ui://kastanje/setup';
export const ACTIONS = ['status', 'begin', 'poll', 'cancel', 'sync', 'apply', 'recover', 'disconnect'];
export function makeServer(service, htmlUrl = new URL('./index.html', import.meta.url)) {
  const server = new McpServer({ name: 'kastanje', version: '0.1.0' });
  new OpenAIExtensions(server);
  registerAppResource(server, 'kastanje-setup', URI, {}, async () => ({ contents: [{
    uri: URI, mimeType: RESOURCE_MIME_TYPE, text: await readFile(htmlUrl, 'utf8'),
    _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } },
      'openai/ui': { preferredDisplayMode: 'inline', availableDisplayModes: ['inline', 'fullscreen'] } }
  }] }));
  const result = async action => {
    try {
      const status = await service[action]();
      // Connection codes and hosted URLs are interface data, never model instructions.
      return { content: [], structuredContent: { connected: status.connected, profile: status.profile, mock: status.mock },
        _meta: { 'kastanje/status': status } };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: safeMessage(error) }] };
    }
  };
  registerAppTool(server, 'kastanje_open', {
    title: 'Open Kastanje', description: 'Open Kastanje connection setup. Manage projects, models, budgets, API keys and usage on the hosted platform.',
    inputSchema: {}, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { ui: { resourceUri: URI }, 'openai/ui': { entrypoints: [{ type: 'global' }, { type: 'thread' }] } }
  }, async () => {
    const response = await result('status');
    if (!response.isError) response.content = [{ type: 'text', text: 'Kastanje setup panel. Connect and apply the separate Codex CLI profile in the panel. Existing Codex login and default configuration are preserved.' }];
    return response;
  });
  for (const action of ACTIONS) registerAppTool(server, 'kastanje_' + action, {
    title: 'Kastanje ' + action, description: 'Setup panel action: ' + action + '. Only the app initiates connection polling and profile changes.',
    inputSchema: {}, annotations: { readOnlyHint: action === 'status', destructiveHint: action === 'disconnect' || action === 'recover',
      idempotentHint: ['status', 'cancel', 'sync', 'apply', 'recover', 'disconnect'].includes(action), openWorldHint: ['begin', 'poll', 'sync'].includes(action) },
    _meta: { ui: { resourceUri: URI, visibility: ['app'] } }
  }, () => result(action));
  return server;
}
