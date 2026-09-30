import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { makeServer } from './mcp.mjs';
import { ConnectionService, runtimeOptions } from './service.mjs';
import { fixtureService } from './fixture.mjs';
import { servePreview } from './preview.mjs';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
try {
  if (args[0] === '--preview' && args.length <= 3) {
    const port = Number(args[1] || 43188);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error();
    if (args[2] && !['approved', 'denied', 'expired', 'replay', 'network'].includes(args[2])) throw Error();
    await servePreview(port, args[2]);
  } else {
    let service;
    if (args[0] === '--fixture' && (args.length === 2 || args.length === 3) && isAbsolute(args[1])) {
      if (args[2] && !['approved', 'denied', 'expired', 'replay', 'network'].includes(args[2])) throw Error();
      service = fixtureService({ home: args[1], scenario: args[2], helper: fileURLToPath(new URL('./auth.mjs', import.meta.url)) });
    } else {
      if (args.length) throw Error();
      service = new ConnectionService(runtimeOptions());
    }
    await makeServer(service).connect(new StdioServerTransport());
  }
} catch {
  process.stderr.write('Kastanje could not start. Check Node, the platform origin and launch arguments.\n');
  process.exitCode = 1;
}
