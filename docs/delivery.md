# Delivery and recovery

## Accepted connection slice — 2026-09-30

Kastanje for Codex is a thin branded local connection/setup plugin for the hosted
platform. Login, projects, selected models, budgets and usage stay on Kastanje.
The plugin adds no coding agent or duplicate management dashboard.

The independently reviewed 0.1.1 source was
`865b972fd1915a3071fd378ee6670272135a3e99`; merged main
`972c57caa302d5ab030d0cf0ad1faf2604caa1d7` has the identical tree.
GitHub Plugin CI passed, including the actual Codex 0.159.2 local parser/install
check in a disposable home. The public darwin/arm64 archive SHA-256 was
`ae8a8d7e4277df5ba2bf3d146b2719d0d774cb946e0fe8af2bb03ecce951bf54`.

| Boundary | Evidence |
| --- | --- |
| Device connection | Synthetic HTTP challenge/verifier/client identity, pending/approval, denied/expired/replay/network, cancellation and stale vault writes |
| Vault/auth helper | Injected vault/failure tests, native module load in relocated archive, sanitized helper failure; no real key issued by checks |
| Catalog/profile | Canonical model capabilities, validation, bounded responses, secret exclusion, base-file preservation, ownership/symlinks/idempotence/journal recovery |
| MCP | Built stdio initialization, nine tools, self-contained app resource, global/thread entrypoints and app-only setup mutations |
| UI | Browser → real AppBridge → HTTP host → built stdio MCP, approval/cancel/sync/apply/recover/disconnect, denial/network, hosted links, keyboard and 375 px layout |
| Actual CLI | Synthetic Responses server/profile/auth helper; native parser/install/path resolution and installed MCP handshake in disposable home |
| Package | Platform-specific native dependency, licensed assets, pinned source rebuild inputs, relocated runtime/resource/helper |

The October 1 independent source audit found no copied private platform history
or unintended source/asset loss. All 44 archived source files matched the
reviewed 0.1.1 source. Seven targeted in-memory compatibility checks also passed.
These results cover that version, not later changes automatically.

## Host theme correction — 0.1.2, 2026-10-01

A real native light-mode screenshot exposed mixed colors: light host background
with hardcoded dark card/sidebar/text colors. The old synthetic host exercised
only dark mode and missed this. The theme regression rejects the released 0.1.1
app under an initial light host context.

0.1.2 reads the initial host context after the MCP Apps handshake, then responds
to live theme changes. Namespaced Kastanje light/dark tokens cover page, text,
sidebar, cards, buttons, code, links, badges and notices/errors. OS preference is
a fallback only when the host supplies no explicit theme. This adds no provider,
credential, inference or profile behavior.

The real AppBridge UI gate now covers initial light/dark context with opposing
OS preferences, OS fallback/change, live switching without reload or extra setup
calls, retained pending/connected/catalog/error state, readable text contrast
(minimum 4.5:1 for sampled enabled text) and 375 px layout. The labelled preview
has a host-theme control; it is not a separate product theme setting. Independent
review found that selecting no host theme after an explicit one needed a fresh
handshake; the preview now reopens with `#system`, with a regression covering the
transition and subsequent OS changes. Explicit light/dark changes remain live.

Release gates: `npm ci && npm run ci` on Node 22.21.1, plus
`npm run test:codex` with Codex 0.159.2; independent review of the exact source
revision and check artifacts. The immutable GitHub release/tag, archive hash
and PR checks identify the delivered candidate. Synthetic preview screenshots
are labelled as such and do not establish native desktop rendering acceptance.

## User test installation and limits

On October 1 the owner explicitly authorized local Codex installation for test.
0.1.1 was installed as enabled `kastanje@kastanje-local` from a stable extracted
archive. Its actual production-mode server started with the native vault adapter,
returned all nine tools and the app resource, and reported disconnected/not
applied. That read-only check issued no key, changed no managed profile and made
no inference request. Codex installation itself updated base configuration to
enable the marketplace/plugin; profile actions preserve base config and login.
Upgrades use another versioned reviewed archive and read back the installed path.

The owner screenshot proves native panel rendering, while the theme checks use
the real browser bridge. Native desktop combined subscription/custom-provider
picker support, hosted live login, cross-OS vault behavior and OpenAI public
plugin-directory acceptance remain unproven. The plugin is currently a local
marketplace distribution, not a publicly approved remote integration. See
[README distribution](../README.md#distribution).

## Recovery

Before uninstalling, disconnect while the helper is installed, and revoke the
remote key separately on hosted API keys. Remove only unchanged managed files;
refuse user edits and restore the previous managed revision after interrupted
writes. Keep the previous reviewed archive. After moving/upgrading a helper,
sync/reapply only through the explicit panel action to refresh absolute paths.
Do not automatically migrate the user's normal provider or Docker setup.
