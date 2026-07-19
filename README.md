# GableLBM

Open-source ERP for lumber and building materials (LBM) dealers — a modern
replacement for legacy systems like Epicor BisTrack, ECI Spruce, and DMSi
Agility.

> **For stack accuracy and conventions, trust [`CLAUDE.md`](./CLAUDE.md), not
> this README.** This file is intentionally short.

## Stack

- **Backend:** Go 1.25 (stdlib `net/http.ServeMux` + pgx v5)
- **Database:** PostgreSQL 16
- **Frontend:** Lit 3 web components + TypeScript 5.9 + Vite 7 + Tailwind 3.4
- **Hosting (non-prod):** Digital Ocean App Platform (see `.do/README.md`)

## Quickstart (local)

```bash
# Boot Postgres via docker compose
make up

# Apply migrations
make migrate

# Optional: seed the Kelowna / "Gable Lumber & Supply" demo data
make seed

# In two terminals:
cd backend && go run ./cmd/server   # API on :8080
cd app && npm install && npm run dev # SPA on :5173
```

The dev API runs on `:8080`, connecting to Postgres at `localhost:5434` (the
docker-compose mapping). Open http://localhost:5173 — `AUTH_MODE=dev` is the
default, so the demo admin is logged in automatically.

To wipe and re-seed:

```bash
make reset-db
```

## Branches & deployments

| Branch | Auto-deploys to | Purpose |
|---|---|---|
| `master` | nothing (fork-ready) | Pristine trunk. Devs `make seed` locally. |
| `staging` | https://staging.gablelbm.com | FutureBuild internal demos. |
| `community` | https://demo.gablelbm.com | Public demo. Community PRs land here. |

Community contributors should target **`community`**. See
[`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full workflow.

## Documentation

| Document | What's in it |
|---|---|
| [`CLAUDE.md`](./CLAUDE.md) | Stack, conventions, pre-flight checks, gotchas |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Branch model, PR rules, redeploy how-to |
| [`docs/architecture.md`](./docs/architecture.md) | Module boundaries, hosting, API surface |
| [`docs/modularization-blueprint.md`](./docs/modularization-blueprint.md) | Installable-apps platform: design, conversion recipe, phases |
| [`docs/design-system.md`](./docs/design-system.md) | Colors, typography, component patterns |
| [`docs/database-erd.md`](./docs/database-erd.md) | Full schema + ERD |
| [`.do/README.md`](./.do/README.md) | Digital Ocean App Platform operations |

## Repo extras

- `industry_erps/` — captured API specs for the legacy systems GableLBM
  replaces (BisTrack, Spruce, Agility). Reference material for future
  import/sync adapters; nothing in the codebase consumes them yet.
- `brand/` — logo source assets. The app bundles its own copies under
  `app/src/components/ui/` and `app/public/`.

## License

GableLBM is free software under a **conditional dual license**:

- **Running it for your own dealership** (one dealer organization, its own
  operations and portals) → **GPL-3.0-or-later**. Host it, modify it, no
  source-sharing obligation for merely operating it.
- **Operating or customizing it for multiple dealers** (SaaS for dealers,
  reselling a customized fork, a shared co-op instance) →
  **AGPL-3.0-or-later**. The dealers and users you serve are entitled to
  the source of the version you run — ecosystem improvements flow back.

The applicability conditions and both full texts: [LICENSE](./LICENSE) and
[`LICENSES/`](./LICENSES). Contributions are licensed under both (see
[CONTRIBUTING.md](./CONTRIBUTING.md)).
