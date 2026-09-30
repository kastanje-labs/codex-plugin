import { OSVault } from './vault.mjs';
import { platformOrigin } from './protocol.mjs';
import { safeParents } from './profile.mjs';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Command-backed auth only: no stdin, network or alternate secret source.
export async function authToken(args, { vaultFactory = (origin, home) => new OSVault(origin, home) } = {}) {
  const [operation, origin, home] = args;
  if (operation !== 'auth' || args.length !== 3 || !isAbsolute(home)) throw Error();
  platformOrigin(origin); await safeParents(home);
  const credential = await vaultFactory(origin, home).get();
  if (!credential) throw Error();
  return credential.key;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.stdout.write(await authToken(process.argv.slice(2)) + '\n'); }
  catch { process.stderr.write('Kastanje credential unavailable. Connect in the setup panel.\n'); process.exitCode = 1; }
}
