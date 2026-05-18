# Digital Ocean App Platform — Operational Notes

This directory holds the App Platform specs that deploy GableLBM's
non-production environments. **`master` / production is intentionally
not deployed here** — these specs cover the two demo/staging surfaces
only.

| Spec | Branch | URL | DB |
|---|---|---|---|
| `app-demo.yaml` | `community` | https://demo.gablelbm.com | `gable_demo` |
| `app-staging.yaml` | `staging` | https://staging.gablelbm.com | `gable_staging` |

Both apps share a single DO Managed Postgres cluster (`gable-pg`,
PG 16, dev tier) with isolated logical databases. Both run with
`AUTH_MODE=dev` — the seeded `demo@gable.com` user is treated as a
full admin/owner by the dev-mode pass-through in
`backend/pkg/middleware/auth.go`. This is safe because demo and staging
data is non-confidential. **Never copy this env mode to a future
production deploy.**

## Architecture

```
GitHub push → DO App Platform pulls branch
              │
              ├─ builds backend/Dockerfile  → main + migrate + seed binaries
              │                                (alpine 3.20, port 8080)
              │
              ├─ builds app/Dockerfile      → nginx + Vite SPA bundle
              │                                (VITE_API_URL baked at build time)
              │
              ├─ deploys backend + frontend services
              │
              └─ runs POST_DEPLOY job: ./migrate && ./seed
                                       (against the env's logical DB)
```

The same Docker image used for the backend service is reused for the
post-deploy migrate-and-seed job — that's why `backend/Dockerfile`
builds three binaries (`main`, `migrate`, `seed`) into the runtime
image. The job entrypoint is overridden via `run_command`.

Frontend routing: App Platform splits traffic by path. The backend
service owns `/api`, `/health`, `/healthz`, `/metrics`. The frontend
owns `/`. The SPA bundle calls `${VITE_API_URL}/api/v1/*` which lands
back on the backend over the public hostname.

## First-time setup

1. Create the Managed Postgres cluster once (shared between both apps):
   ```bash
   doctl databases create gable-pg \
       --engine pg --version 16 --region tor1 \
       --size db-s-1vcpu-1gb --num-nodes 1
   ```
   Inside the cluster, create two logical databases:
   ```bash
   doctl databases db create <cluster-id> gable_demo
   doctl databases db create <cluster-id> gable_staging
   ```

2. Create the apps:
   ```bash
   doctl apps create --spec .do/app-demo.yaml
   doctl apps create --spec .do/app-staging.yaml
   ```

3. After the first deploy, DO assigns each app a hostname like
   `octopus-app-xxxx.ondigitalocean.app`. In the `gablelbm.com`
   Cloudflare zone:
   - `CNAME demo → <demo target>` (proxy **off** — App Platform handles TLS)
   - `CNAME staging → <staging target>` (proxy **off**)
   - Add the verification TXT records App Platform requests during
     the domain-attach flow.

4. Once DNS verifies, DO issues Let's Encrypt certs automatically and
   both `demo.gablelbm.com` and `staging.gablelbm.com` go live.

## Subsequent deploys

Push to the matching branch — DO auto-deploys on push because every
service has `deploy_on_push: true`:

```bash
git push origin community     # → demo.gablelbm.com
git push origin staging       # → staging.gablelbm.com
```

To force a redeploy without a code change (e.g. to re-run the
seed job after manually mutating data):

```bash
doctl apps create-deployment <app-id> --force-rebuild
```

To update the spec itself (env vars, instance sizes, routes):

```bash
doctl apps update <app-id> --spec .do/app-demo.yaml
```

## Post-deploy job behavior

Every deploy runs `./migrate && ./seed` against the env's database.

- **Migrations** are idempotent — they apply only the SQL files that
  haven't been recorded in `schema_migrations` yet.
- **Seed** uses `ON CONFLICT DO NOTHING` / upsert patterns on natural
  keys (account_number, sku, code, email, license, plate), so re-runs
  do not duplicate data. They will however overwrite any drift on
  rows whose natural keys match.

If you want a *fresh* demo (wipe + reseed), drop the logical DB and
let the next deploy recreate it:

```bash
# Connect to the cluster's `defaultdb` first, then:
psql> DROP DATABASE gable_demo;
psql> CREATE DATABASE gable_demo OWNER gable_user;
# Then force a redeploy as shown above.
```

Do this only for `gable_demo` — destroying `gable_staging` mid-day
will interrupt any internal demo in progress.

## Secrets

`DATABASE_URL` is the only secret in these specs and it's resolved via
DO's component binding syntax: `${gable-pg.DATABASE_URL}`. App Platform
substitutes the real connection string (with credentials and
`sslmode=require`) at runtime. The literal value is never committed.

There are no other secrets — `AUTH_MODE=dev` means no JWKS URL, no
JWT signing key, no SMTP creds. The moment any of those become
required (e.g. when wiring real auth on staging), promote them to
encrypted env vars via `doctl apps update` and **do not** add them
inline to the YAML.

## Local-only files (ignored by git)

The repo's `.gitignore` excludes `.do/*.local.*` and `.do/.env*`. Use
these patterns for scratch specs and local credentials that you don't
want to publish:

```
.do/app-demo.local.yaml   # personal overrides
.do/.env.demo             # doctl context env
```

## Rollback

App Platform retains the last N deployments per app. To roll back:

```bash
doctl apps list-deployments <app-id>
doctl apps create-deployment <app-id> --restore-deployment <deployment-id>
```

The post-deploy migrate/seed job will run again against the existing
DB, which is safe (idempotent). If a migration is the cause of the
breakage, you'll need to author a corrective forward migration — DO's
rollback does not undo schema changes.
