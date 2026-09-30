# Candidate delivery record

Accepted outcome: a thin branded local Codex connection/setup plugin for the
hosted Kastanje platform. No coding agent, duplicate management UI, analytics
implementation, private platform code or account migration.

Base revision: `4b03b10` (requirements and public branding). The delivered exact
candidate SHA is recorded in the caller handoff; this file is part of that
revision. One writer resumed useful files from the terminated initial attempt.
The prior attempt log is retained by the caller outside the public package.

| Slice | Verification boundary | State |
| --- | --- | --- |
| Device connection | Synthetic loopback HTTP: client marker, challenge/verifier, interval, pending/approved, denied/expired/replay/network, cancellation and stale vault writes | Local tests |
| Vault/auth helper | Injected memory vault and failures; native module load in relocated package without entry access; helper returns token or sanitized failure | Local tests; real vault entry acceptance remains caller work |
| Catalog/profile | Platform-shaped synthetic catalog, ID/default validation, bounded responses, secret exclusion, unchanged base files, ownership, symlinks, idempotence, partial writes and journal recovery | Local tests |
| MCP | Built stdio initialization, list tools/resources, global/thread entrypoints, app-only mutations, self-contained resource, status and connection actions | Local tests |
| UI | Chromium → AppBridge → loopback host → built stdio MCP; approve/cancel/sync/apply/recover/disconnect, denial/network errors, fixed hosted links, keyboard and narrow viewport | Automated checks; caller owns visual/native-host acceptance |
| Responses fixture | Local HTTP bearer validation, JSON and SSE completion, synthetic helper and isolated profile | Automated fixture check; actual Codex CLI parser/launch remains caller check |
| Package | Curated platform artifact, native dependency load, relocated stdio server/resource/helper and public license texts | Local package check |

Required clean run: `npm ci && npm run ci` on Node 22.21.1 and npm 11.14.1,
with Playwright 1.58.2 Chromium installed. Skill authoring validation:
`quick_validate.py skills/kastanje-setup` with PyYAML, passed. GitHub CI is
configured but a hosted run has not been claimed. No live login/inference,
platform deployment, account changes, global Codex installation or publication.

The credential/configuration changes carry meaningful trust-boundary risk.
Tests cover concrete stale-write, input, secret, symlink, edited-file and
rollback failures. Independent security/code review of the exact candidate
remains the caller's responsibility. Tests are implementer evidence, not an
independent acceptance result.

Public release inputs were inspected: authored plugin/server/UI/fixture/tests,
package lock, manifests/CI, setup skill and licensed public fonts/branding.
Only necessary private source contracts were read; none was copied. The curated
archive excludes engineering-only AGENTS/requirements files. Public source and
history must contain no local engineering paths or private implementation.
No desktop model
picker screenshot or claimed proof is included.

Recovery: remove only unchanged managed files, restore the prior managed
revision after interrupted writes, and revoke remote keys separately on hosted
API keys. Keep the previous reviewed artifact; sync/reapply after moving or
upgrading the helper. Real vault behavior across operating systems, native
Codex host/CLI, hosted account integration and distribution acceptance remain
unverified by synthetic tests. See README for full boundaries and commands.

Delivery state: **local candidate**, pending independent caller review. No PR,
merge, release, deployment or post-release observation. Direct cost, total human
time and time-to-acceptance are unknown; defects after acceptance are not yet
observed. No inference cost or account expenditure was incurred by fixtures.
