---
name: kastanje-setup
description: Connect a hosted Kastanje project to the separate Codex CLI profile, sync its platform catalog, or recover plugin-managed files. Use for Kastanje plugin setup and connection troubleshooting.
---

Open `kastanje_open` and let the user complete setup in the panel. Its global and
thread entrypoints open the same interface. Connection and polling tools are
app-only; do not call them from model loops or request a key in chat.

The platform owns login, project selection, models, budgets, connections and
analytics. Use panel links to hosted Setup, API keys, Activity and Settings.
The device confirmation page shows the same connection code as the panel.
Do not build another provider chooser or analytics dashboard.

After connecting, the user chooses Sync catalog and Apply Codex profile.
`codex --profile kastanje` selects the sibling profile. Normal Codex startup
keeps the existing login and default configuration. Do not edit `config.toml`
or `auth.json`, silently switch the default provider, or export the key.
The command-backed helper obtains credentials from the OS vault; Linux needs
Secret Service. There is no plaintext fallback.

The platform's selected-model catalog is authoritative. Sync and reapply after
hosted model changes, then start a new CLI session. Desktop provider picker
support is not established; do not claim a combined subscription/custom picker.
Plugin setup does not authorize an inference request or spending.

Remove managed profile or Disconnect this device recovers only unchanged owned
files. If recovery reports user edits, preserve those files and help the user
inspect them before deciding what to keep. Revocation happens on the hosted
API keys page. See the bundled README for installation, supported runtime,
preview fixtures and recovery details.
