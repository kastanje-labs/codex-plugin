# Thin hosted-platform connection · issue9

Accepted by Gustav on2026-09-30: branded Codex sidebar/setup plugin, reusing the
hosted platform to minimize duplicated UI/maintenance. No new coding agent.
Public plugin code may use public MIT extension branding; private platform stays
private. Caller owns publication, deployment and acceptance.

## Runtime contract

Default platform https://kastanje-app-demo.gustavonline.workers.dev . Configured
origin must be full HTTPS origin, no credentials/path/query/fragment. Loopback
HTTP only for controlled tests. No arbitrary user-supplied URLs via tools/UI.

POST /api/extension/device {code_challenge:hex SHA256 verifier,client:"codex"}
returns device_code64hex,user_codeXXXX-XXXX-XXXX,expires_in600,interval3.
Open /connect/codex?code=USERCODE on platform with host openLink. Platform owns
authentication and project choice/confirmation. Poll POST /api/extension/token
{device_code,code_verifier} no faster than interval, max10min, bounded response /
timeout, redirect:error. Result pending or authorized {key,projectId,keyId}.
Store key only in OS credential vault; no insecure plaintext fallback. Node
@napi-rs/keyring2.1.0 offers Entry; Linux requires functioning Secret Service.
Fixtures use injected memory vault. Secrets stay out of MCP results/_meta/UI,
logs/config/catalog/model context. Cancellation/reconnect concurrency must not
install stale credentials. No polling from model loops; UI handles timed poll.

Bearer GET /v1/pixelroute/setup?client=codex returns canonical platform bundle
{client,modelIds,defaultModel,mode,files}, including kogle-models.json. Reuse
that authoritative catalog and model capabilities; do not reimplement it from
extension models. Validate catalog/default/model IDs and bounded responses;
never execute downloaded code/config paths. Use local template with fixed
provider kastanje, base_url=origin+/v1,wire_api="responses". No inference smoke.

Official current Codex docs allow command-backed [model_providers.kastanje.auth]
command=absoluteNode, args=[absoluteInstalledHelper,"auth"] timeout_ms5000
refresh_interval_ms300000. Helper gets no stdin and prints token only. Don't
combine auth table with env_key,requires_openai_auth or bearer_token.
Profile: CODEX_HOME/kastanje.config.toml (v2 sibling profile) + owned catalog.
Preserve base config.toml/auth.json and other files byte-for-byte; refuse
symlink/unmanaged destination. Explicit UI action applies profile. Track hashes
and recovery; refuse overwriting user edits; repeated sync/apply is bounded and
idempotent. Recovery removes/restores only unchanged managed files. No silent
default-provider switch. Native CLI: codex --profile kastanje. Desktop provider
picker support is not proven; don't claim simultaneous subscription/custom
picker. Plugin panel/setup can work without that capability.

## UI and package

Use @modelcontextprotocol/ext-apps1.7.5,SDK1.31.0,
@openai/mcp-extensions0.1.0 and esbuild for self-contained MCP App HTML, stdio
server. Global and thread open tool entrypoints; mutating setup tools app-only.
Use the documented MCP App server/bridge APIs.
One setup skill under skills/kastanje-setup with validated YAML frontmatter.
No duplicated management screens; buttons open
platform /app, /app/projects, /app/settings and key revocation page actual route
from platform. Show status, matching connection code, catalog default/count,
sync + Apply Codex profile, CLI launch command, disconnect/recovery.
Brand orange#f47745,navy#0b1428/#0e1930,Geist sans/pixel public extension
assets from the public kastanje-labs/vscode-extension repository. Copy only
required MIT public fonts/assets with licensing. Responsive/keyboard/loading/
error/disconnected states. No iframe weakening of platform security; host
openLink links out to existing platform. Local loopback preview for reviewer.

Theme delta accepted on 2026-10-01: apply initial MCP host context after connect
and later theme notifications. Use coherent Kastanje light/dark surface/text
pairs with namespaced tokens; OS fallback only without a host theme. Test both
initial themes, live switching without setup calls/reload, error/status contrast
and narrow layout through the real AppBridge.
Portable plugin root plugin.json or .codex-plugin/plugin.json + .mcp.json
relative paths supported; package remains self-contained after build. Document
install via Codex local plugin pathway, no global installation by worker.

## New ChatGPT login research

Responses remains correct. Sign in with ChatGPT uses public api.openai.com/v1
and dynamic client registration for eligible locally running open-source apps.
Hosted/paid apps need approved access; don't install this flow on Kastanje
cloud, export subscription tokens or use fixed old Codex client to fake new
support. Record official source and limitation in README:
https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt .
New provider-account migration remains a separately scoped follow-up.

## Verification / delivery

Test real MCP initialization/tools/resource against stdio; fixtures for auth
pending/approved/denied/expired/replay/cancel/network failures, vault failure,
catalog validation, config preservation/ownership/symlink/rollback. Actual Codex
CLI profile parser/auth helper against local synthetic Responses fixture can be
done by caller; provide fixture. UI preview/mock mode must be labelled and never
claim real OAuth or inference. CI npm ci && npm run ci pinned actions/minimal
permissions, no external credentials. Fresh git history, reviewed public files.
Independent review caller; no worker publication/deployment.
