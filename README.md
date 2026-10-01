# Kastanje for Codex

A small local plugin connects a hosted Kastanje project to native Codex. The
panel handles connection status, catalog sync and a separate CLI profile.
Kastanje owns login, projects, models, budgets, connections and usage insights.

The product is **Kastanje for Codex**, in `kastanje-labs/codex-plugin`, with the
stable plugin ID `kastanje`. The panel follows the host's initial light/dark
theme and live theme changes, using Kastanje's paired surface/text colors.
When a host provides no theme, it follows the operating system. Hosted platform
settings remain on the platform; the plugin adds no separate theme preference.

The panel opens the existing platform: [Setup](https://kastanje-app-demo.gustavonline.workers.dev/app/connect?client=codex),
[API keys and revocation](https://kastanje-app-demo.gustavonline.workers.dev/app/projects),
[Activity](https://kastanje-app-demo.gustavonline.workers.dev/app/activity), and
[Settings](https://kastanje-app-demo.gustavonline.workers.dev/app/settings).
There is no model/provider chooser, analytics dashboard or coding agent here.

## Build and verify

Use Node **22.21.1** (also in `.nvmrc`):

```sh
npm ci
npx playwright install chromium
npm run ci
npm run test:codex
```

These commands run from the source checkout. In an extracted release archive,
use `cd package/source` before rebuilding; the `package/` root is the ready-to-run
plugin and has only preview/fixture scripts. `test:codex` requires Codex 0.159.2.

On a minimal Linux CI machine use `npx playwright install --with-deps chromium`.
`ci` checks syntax/manifests, builds, runs protocol/profile/MCP tests and real
browser bridge tests, then packages and checks a relocated artifact. All auth
and Responses fixtures are synthetic; no test uses customer credentials, an OS
vault entry, paid inference or a live platform account.

The setup skill also passes the official skill-creator `quick_validate.py`
validator (Python with PyYAML). CI performs a local frontmatter/manifest check;
the official validator is an authoring check outside this repository.

## Preview for review

```sh
npm run preview
```

Open **http://127.0.0.1:43188**. This labelled synthetic host runs the built
stdio MCP server and the real MCP Apps `AppBridge`. Connect shows
`ABCD-1234-EF56`; the first timed poll is pending and the second approves a
synthetic project. Sync and Apply write only to an automatically created
isolated temporary Codex home. Disconnect removes those managed files.
Hosted link requests are displayed by the preview host without navigating.
Ctrl-C closes the child MCP server and removes the temporary home.

For error states:

```sh
node dist/server.mjs --preview 43188 denied
node dist/server.mjs --preview 43188 expired
node dist/server.mjs --preview 43188 replay
node dist/server.mjs --preview 43188 network
```

Run one preview at a time. The synthetic host's **Host theme** selector exercises
initial light/dark context and live notifications. Open `/#light`, `/#dark` or
`/#system` to select the initial test context. Selecting **No host theme**
reopens the preview to repeat the handshake, since a partial notification cannot
unset an explicit host theme. Automated UI tests cover these
themes, readable text contrast, approval, cancellation, denial and network
failure, keyboard navigation and a narrow viewport. Native desktop visual
acceptance remains a separate check; this preview
does not prove a desktop provider picker or a completed live login.

## Local plugin installation

Build first, or extract the reviewed platform-specific release archive into a
stable directory. Keep the whole plugin directory, including its `dist/` and
native vault dependency. Node must be available to the local Codex runtime.
The compatibility manifest lives in `.codex-plugin/plugin.json`; `.mcp.json`
uses an explicit relative `cwd: "."` resolved against the installed plugin root,
with `./dist/server.mjs` and no machine-specific install path.

The repository includes `.agents/plugins/marketplace.json` with a relative
local source. In supported local clients, add that directory as a marketplace
with `codex plugin marketplace add /absolute/path/to/the/plugin`, then install
Kastanje from that local source in the desktop Plugins directory and open it
in a new chat. This command is a **user installation step**; building and tests
do not run it or change global Codex settings. Local plugin availability varies
by client. See the official [plugin packaging and local marketplace guide](https://developers.openai.com/plugins/build/plugins).

The native CLI installation command is `codex plugin add kastanje@kastanje-local`.
With Codex 0.159.2 installed, `npm run test:codex` checks actual local installation,
native MCP path resolution and the installed server handshake in a disposable
Codex home, without changing the user's settings or sending inference.

Invoke `kastanje_open` or its global/thread UI entrypoint. Only a host that
supports MCP Apps and respects `ui.visibility: ["app"]` should expose the setup
actions. The skill `kastanje-setup` guides this flow. No hooks or registered
remote app connection are installed by this package.

In the panel:

1. Choose **Connect Kastanje**. Confirm the matching device code on the hosted
   `/connect/codex` page, sign in there and select a project.
2. Choose **Sync catalog**, then **Apply Codex profile**. Setup applies only on
   that explicit panel action.
3. Start a fresh CLI session with `codex --profile kastanje`. Run Codex normally
   for your existing configuration and subscription login.

The default origin is `https://kastanje-app-demo.gustavonline.workers.dev`.
An administrator can supply `KASTANJE_ORIGIN` to the MCP process as a full HTTPS
origin, without credentials, path, query or fragment. There is no arbitrary URL
input in a tool or panel. Production mode refuses HTTP; controlled fixtures
alone permit loopback HTTP. Preserve the same `CODEX_HOME` when connecting,
applying and launching the profile.

## Credential and configuration boundaries

The device handshake uses fresh random verifier bytes and a hex SHA-256
challenge, with `client: "codex"`. Polls respect the platform interval, expire
within ten minutes, reject redirects and bound request duration/response size.
The UI runs the timer. Cancellation/reconnect fences stale results, including
asynchronous credential saves. A consumed or failed exchange requires a new
code; there is no silent inference or automatic approval.

The project key goes only to `@napi-rs/keyring` **2.1.0**, under service
`labs.kastanje.codex.v1`, scoped by a hash of the platform origin and absolute
Codex home. macOS uses Keychain; Windows uses its credential store; Linux is
pinned to a functioning **Secret Service**. A locked/unavailable vault fails
closed. There is no file, environment or kernel-keyring fallback.

The installed `dist/auth.mjs` command reads that vault entry, reads no stdin and
prints only the key to stdout for Codex. The key never enters a tool result,
`_meta`, UI, catalog, configuration file or log. Connection codes and fixed
hosted links go to the interface via `_meta`; model-visible status is minimal.
The separate profile uses [official command-backed provider authentication](https://learn.chatgpt.com/docs/config-file/config-reference),
with absolute Node/helper paths, a five-second timeout and five-minute refresh.
It uses `wire_api = "responses"` without `env_key`, `requires_openai_auth` or an
inline bearer token.

Only these names are managed in `CODEX_HOME` (normally `~/.codex`):

| File | Purpose |
| --- | --- |
| `kastanje.config.toml` | Separate sibling profile for `codex --profile kastanje` |
| `kastanje.kogle-models.json` | Validated platform-owned selected-model catalog |
| `kastanje.managed.json` | Ownership hashes and interruption recovery journal |
| `kastanje.lock` | Temporary process lock during profile operations |

The plugin reads `/v1/pixelroute/setup?client=codex`, selects only
`kogle-models.json`, and validates catalog/model IDs/default/size. It preserves
platform capabilities as JSON values. Downloaded TOML, README instructions and
other paths are never installed or executed; profile configuration comes from
a local fixed template. Profile actions leave `config.toml`, `auth.json` and
all other files byte-for-byte unchanged. Codex's own marketplace/plugin
installation commands can update its base configuration to enable the plugin.
Symlink directories or managed destinations, unmanaged
files and user edits are refused. Sync/reapply is idempotent.

Changes are journaled before replacement. A failed/interrupted update restores
the previous managed revision when files still match recorded states. **Remove
managed profile** or **Disconnect this device** removes only unchanged owned
files. Disconnect deletes the local credential first, even if edited files
prevent recovery; it does not revoke the remote key. Revoke that key under
hosted **API keys** (`/app/projects`). If recovery refuses edits, preserve the
files and inspect them before any manual cleanup. The process lock coordinates
plugin writers; it cannot prevent an unrelated process racing a file write.

After a process crash, an abandoned `kastanje.lock` is refused rather than
automatically reclaimed. Stop all Kastanje plugin runtimes, confirm no profile
operation is running, then remove only that lock file and retry recovery.

Before uninstalling, disconnect while the helper is still installed. After an
upgrade or moving the installed directory, sync and reapply to refresh absolute
helper paths. Retain the prior reviewed artifact for rollback; restore it and
reapply only unchanged owned files. Do not overwrite user edits to force a
rollback.

## Protocol and product limits

This plugin needs a Codex release supporting sibling profiles (the hosted
setup contract targets 0.134+) and command-backed custom-provider auth. The
Codex CLI 0.159.2 accepts the profile and plugin package in an isolated setup.
The native CLI resolves the explicit relative MCP `cwd` against the installed
plugin root. MCP argument placeholders are not expanded by its legacy parser;
the manifest therefore uses `cwd: "."` and `./dist/server.mjs`. Desktop
combined subscription/custom provider picker support is **not established**.

The local template disables built-in apps, delegation, web search and
WebSockets for the Kastanje CLI session. It preserves other MCP configuration;
large inherited tool catalogs may exceed platform limits. Hosted Responses
support is stateless text and function tools with buffered SSE. Stored response
IDs, images, server-side tools and provider compaction are outside this slice.
Select and budget models on hosted Setup; consult Activity for actual usage.
This plugin supplies no inference tools and makes no inference request itself.

The new [Sign in with ChatGPT cookbook](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt)
describes dynamic client registration and eligible plan usage via the public
`api.openai.com/v1` resource. Open-source/local eligibility does not authorize a
paid or remotely hosted app; those apps require OpenAI-approved access as
explained in the [official overview](https://developers.openai.com/siwc/token-sharing-open-source).
This plugin does not install that flow on Kastanje cloud, export subscription
tokens or reuse an old fixed Codex client ID. Provider-account migration is a
separate follow-up owned by the hosted platform.

## Synthetic CLI fixture

```sh
npm run fixture -- --port 43189
```

This starts a loopback-only Responses server, creates a temporary Codex home
with the same profile template and synthetic catalog, and prints an isolated
`CODEX_HOME=... codex --profile kastanje exec ...` command for caller testing.
Copy that command only in the authorized local fixture check. Its auth helper
prints a fixed synthetic token instead of accessing the OS vault; token counts
are dummy values. The fixture returns a fixed response, does not execute tools
and never forwards a request. Ctrl-C removes the temporary home. The fixture's
HTTP JSON/SSE and synthetic helper are tested automatically; running actual
Codex against it remains a caller check.

## Package and release

```sh
npm run package
```

Produces `output/kastanje-codex-plugin-0.1.2-<platform>-<arch>.tgz` and
`output/package-proof.json`. The artifact contains built HTML/server/helper,
local manifests, skill, assets/licenses, public sources and the installed
native vault packages. It works after extraction without a runtime npm install;
use a matching OS/architecture build. `source/` includes the original pinned
package/lock/build/test inputs for rebuilding. Internal task instructions,
private platform files/history, account data, attempt logs and global configs
are excluded. Bundled package/font/branding licenses are retained in
`dist/THIRD-PARTY-NOTICES.md` and assets.

CI has read-only repository permissions, pinned actions and no account/deploy
credentials. It does not publish. See GitHub Releases for reviewed artifacts,
exact revisions, verification and platform limits. A local stdio/OS-vault plugin
is not a hosted web integration. See the distribution boundaries below and
[delivery evidence](docs/delivery.md).

## Distribution

Local/repository marketplaces are the supported test route for this package.
Installing a raw source repository does not build it or install its dependencies;
use the reviewed archive matching your OS/architecture, or build the source first.

OpenAI's [public directory submission](https://developers.openai.com/plugins/deploy/submission)
uses the [submission portal](https://platform.openai.com/plugins), verified
developer identity, suitable organisation permissions and review. The documented
MCP route requires a public HTTPS/Streamable HTTP endpoint. Core local execution
needs product-specific support or contact with OpenAI. The current stdio server
accesses the local OS vault and writes an explicit local profile; moving that
server to a remote endpoint would not preserve those boundaries. No public
directory submission is claimed for this release.

[tldraw's MCP app](https://github.com/tldraw/tldraw/tree/main/apps/mcp-app)
is a useful example of a hosted MCP panel on Cloudflare Workers and Durable
Objects. Its hosted UI pattern fits Kastanje's platform reuse, but it does not
establish distribution support for a local credential/profile helper. Retain
the thin local connector while researching a public directory path separately.
