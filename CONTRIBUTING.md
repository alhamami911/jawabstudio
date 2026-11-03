# Contributing to Jawab Studio

Jawab Studio records narrated Arabic tutorial videos of Jawab ERP from JSON scenarios, then queues, validates and publishes them. See `README.md` for usage and `docs/ARCHITECTURE.md` for design.

## Setup
```bash
npm install
cp .env.example .env     # fill in your own values — never commit .env
npx playwright install chromium
npm run typecheck        # must pass before every PR
```

## Repository layout
| Path | Purpose |
|---|---|
| `src/` | TypeScript: recorder, TTS, queue/worker, validation, dashboard |
| `series/` | Episode plans (`series.json` + `NN-slug.json`), produced by `scripts/generators/` |
| `scenarios/` | Raw one-off scenarios (`_template.json`) |
| `config/` | `production.json` (allowed hosts, retries, timeouts) |
| `catalog/` | Discovered Jawab menus/selections (data used by plan checks) |
| `scripts/` | Runtime tools used by the pipeline: `to-mp4`, `wrap-assets`, `make-cover`, `build-youtube-package`, `qa-episode` |
| `scripts/generators/` | Regenerate `series/*` from code (`gen-*.mjs`, `captions.mjs`) |
| `scripts/ops/` | Test-environment setup/cleanup, demo data, lesson user |
| `scripts/voice/` | Voice and audio tooling (ElevenLabs, music, brand audio) |
| `scripts/publish/` | Drive sync and YouTube upload |
| `scripts/kb/` | Knowledge-base / translation exports |
| `scripts/probes/` | Read-only exploration of a live Jawab instance (dev aids, not part of the pipeline) |
| `assets/` | Logo, fonts, covers, intro/outro (voice samples are git-ignored) |
| `docs/`, `knowledge-base/` | Architecture, catalog, runbook, decisions log |

Generated data (`output/`, `library/`, `cache/`, `data/`, `voice-*`, videos/audio) is **never** committed.

## Safety rules (non-negotiable)
1. **Secrets:** never commit `.env`, API keys, tokens, passwords or personal voice samples. `.env.example` lists every variable. Use keys with minimal scope (e.g. ElevenLabs: Text-to-Speech only).
2. **Target environment:** recording executes real actions and creates data. Run only against staging/demo hosts listed in `config/production.json` `allowedHosts`. Never add a customer production host.
3. **Destructive actions:** plans must not delete/archive/cancel/reverse; invoices stay drafts. Cleanup scripts (`scripts/ops/`) are dry-run by default and need `--apply`.
4. **Voice rights:** only use voices you own or have written consent for. Do not train or clone from third-party provider outputs unless their terms allow it.
5. **Dashboard:** binds to `127.0.0.1` by default. Exposing it (`DASHBOARD_HOST=0.0.0.0`) requires `DASHBOARD_SHARE_PASSWORD` and `ADMIN_USER/ADMIN_PASSWORD`.
6. **Child processes:** spawn with argument arrays (no `shell: true`); validate any id coming from HTTP/CLI input.

## Workflow
- Branch from `main`, keep PRs small, describe what you ran to verify (typecheck, `npm run queue -- plan:check`, `npm run dryrun -- <series> <eps>` for plan changes — dry runs use no voice credits).
- New series: add a generator in `scripts/generators/`, run it, then `npm run queue -- plan:check`.
- Update `docs/` or `knowledge-base/` when behaviour or decisions change.
