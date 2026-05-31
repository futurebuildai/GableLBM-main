# DEVOPS.md — Deployment Source of Truth

Operational source-of-truth for **GableLBM** deployments. Pairs with `.do/README.md`
(first-time App Platform setup) and `INTEGRATIONS.md` (cross-service contracts). When the
deploy topology changes, update **this file first**.

## Platform

Non-production environments run on **Digital Ocean App Platform** (PaaS, Dockerfile-based,
auto-deploy on git push). Production (`master`) is intentionally **not** deployed by this
repo. All deploy state is inspected and managed with **`doctl`** (the DO CLI), not the web
console, so changes are reproducible.

## Branch → Environment map

| Branch | DO App | App ID | URL | Logical DB |
|---|---|---|---|---|
| `master` | *(none)* | — | not deployed (fork-ready trunk) | — |
| `staging` | `gablelbm-staging` | `d2221ada-0860-4bf4-a54c-60483df5a55d` | https://staging.gablelbm.com (`gablelbm-staging-2m7ez.ondigitalocean.app`) | `gable_staging` |
| `community` | `gablelbm-demo` | `2e5e82f7-2fca-4fde-8333-06f74580cd4a` | https://demo.gablelbm.com (`gablelbm-demo-cqxcy.ondigitalocean.app`) | `gable_demo` |

Both apps share one DO Managed Postgres 16 cluster (`gable-pg`) with isolated logical
databases. Both run `AUTH_MODE=dev` (the seeded `demo@gable.com` is treated as admin/owner).
**Never** copy `AUTH_MODE=dev` to a production deploy.

App specs are version-controlled: `.do/app-demo.yaml` (community), `.do/app-staging.yaml`
(staging). The **downstream consumer** `ai-lm-staging`
(`8a274c57-dee2-4053-ac3c-40fe2528ca9e`) points its `GABLE_API_URL` at
`https://demo.gablelbm.com` — see `INTEGRATIONS.md`.

## Deploy anatomy

```
git push origin community ──▶ DO App Platform pulls the branch
                              ├─ build backend/Dockerfile → main + migrate + seed binaries
                              ├─ build app/Dockerfile      → nginx + Vite SPA (VITE_API_URL baked in)
                              ├─ deploy backend + frontend services
                              └─ POST_DEPLOY job: sh -c "./migrate && ./seed"  (idempotent)
```

The same backend image runs both the API service and the post-deploy migrate/seed job
(that's why `backend/Dockerfile` builds three binaries). App Platform path-routes `/api`,
`/health`, `/healthz`, `/metrics` to the backend and `/` to the frontend.

A deployment progresses **BUILDING → DEPLOYING → ACTIVE** and runs the POST_DEPLOY job last.
A healthy deploy shows phase `ACTIVE` and `7/7` (or `13/13` with services + job) steps.

## Runbook (`doctl`)

`doctl` lives at `~/.local/bin/doctl` and is authenticated (default context).

```bash
# What apps exist and where they serve
doctl apps list --format ID,Spec.Name,DefaultIngress

# Watch the latest deployment for an app (ID from the table above)
doctl apps list-deployments 2e5e82f7-2fca-4fde-8333-06f74580cd4a \
  --format ID,Cause,Phase,Progress,Created | head

# Tail build / deploy / run / post-deploy-job logs
doctl apps logs <app-id> backend  --type run        # live service logs
doctl apps logs <app-id> backend  --type build      # build output
doctl apps logs <app-id> migrate-and-seed --type run # post-deploy job (migrate+seed)

# Force a redeploy without a code change (e.g. to re-run seed)
doctl apps create-deployment <app-id> --force-rebuild

# Push a changed spec (env vars, instance sizes, routes)
doctl apps update <app-id> --spec .do/app-demo.yaml
```

### Deploy + verify (the standard loop)

```bash
git push origin community
# poll until Phase=ACTIVE for the newest SHA:
doctl apps list-deployments 2e5e82f7-2fca-4fde-8333-06f74580cd4a \
  --format Cause,Phase,Progress,Created | head -3
# smoke-test once ACTIVE:
curl -sf https://demo.gablelbm.com/healthz/live && echo OK
curl -s  "https://demo.gablelbm.com/api/integration/products?q=" \
  -H "X-Integration-Key: $INTEGRATION_KEY" | jq 'length'
```

If the host's IPv6 path is flaky, add `curl -6 --retry 4 --retry-all-errors`.

## Post-deploy job behavior

Every deploy runs `./migrate && ./seed` against the env DB:

- **Migrations** are forward-only, applied once each (tracked in `schema_migrations`).
- **Seed** uses `ON CONFLICT (natural key) DO UPDATE` / `DO NOTHING` so re-runs don't
  duplicate and *do* overwrite drift on matching keys. Seed strings on existing demo rows
  only update if the upsert names the changed column — see CLAUDE.md "Seed re-runs".

For a fresh demo: drop the logical DB from the cluster's `defaultdb`, recreate it, then
force a redeploy. Only do this to `gable_demo`, never mid-day to `gable_staging`.

## Secrets

`DATABASE_URL` is the only secret in the specs, resolved via DO binding
(`${gable-pg.DATABASE_URL}`); never committed. `AUTH_MODE=dev` means no JWKS/JWT/SMTP creds
are required. When real auth lands on staging, promote secrets via
`doctl apps update`/encrypted env vars — never inline them in YAML. The integration key
(`INTEGRATION_API_KEY`, consumed by AI_LM as `GABLE_INTEGRATION_KEY`) is likewise an
encrypted env var.

## Rollback

```bash
doctl apps list-deployments <app-id>
doctl apps create-deployment <app-id> --restore-deployment <deployment-id>
```

The migrate/seed job re-runs (safe/idempotent). DO rollback does **not** undo schema
changes — a bad migration needs a corrective forward migration.

## CI

`.github/workflows` runs Go/JS checks on PRs into `master`. Deployment itself is **not** a
GitHub Action — it is DO App Platform `deploy_on_push`. Don't look for deploy status in
`gh run list`; use `doctl apps list-deployments`.
