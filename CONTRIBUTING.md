# Contributing to GableLBM

Thanks for your interest in contributing. This document covers the branch
model, PR workflow, local dev setup, and a few one-time-only notes that
external contributors should be aware of.

For stack details (Go 1.25, Lit 3, PG 16, etc.) and code conventions, read
[`CLAUDE.md`](./CLAUDE.md). For deployment specifics, read
[`.do/README.md`](./.do/README.md).

## Branch model

| Branch | Auto-deploys to | Who can merge | Purpose |
|---|---|---|---|
| `master` | nothing | FutureBuild maintainers | Pristine, fork-ready trunk. No demo seed runs here. |
| `staging` | https://staging.gablelbm.com | FutureBuild maintainers | Internal pre-prod demos. |
| `community` | https://demo.gablelbm.com | FutureBuild maintainers (after review) | Public demo + community contributions. |

**External PRs target `community`.** Maintainers fast-forward
`community → staging → master` after review.

The two deployed branches run with `AUTH_MODE=dev` — the seeded
`demo@gable.com` user is treated as full admin/owner. This is safe because
demo data is non-confidential. **Do not ever promote `AUTH_MODE=dev` to a
production deploy of `master`.**

## Local setup

```bash
git clone git@github.com:futurebuild/GableLBM.git
cd GableLBM
make up          # docker compose: Postgres on :5434
make migrate     # apply SQL migrations
make seed        # populate Kelowna / Gable Lumber & Supply demo data (optional)
```

Then in two terminals:

```bash
cd backend && go run ./cmd/server   # API on :8080
cd app && npm install && npm run dev # SPA on :5173
```

To start over: `make reset-db` (drops the database, re-migrates, re-seeds).

## Pull request workflow

1. Fork the repo (or branch directly if you have write access).
2. Branch off `community`: `git checkout -b feat/short-description community`.
3. Make changes. Keep commits focused — one logical change per commit.
4. Run the pre-flight gates **before pushing** (see below).
5. Open the PR against `community`.
6. Address review feedback; maintainers will fast-forward once approved.

### Pre-flight gates

Run these before pushing. CI will run them too, but failing locally is
faster.

```bash
# Frontend
cd app
npx tsc --noEmit
npm run build
npm run lint

# Backend
cd ../backend
go build ./...
go test ./...
go vet ./...
```

DB changes: every new column should follow the conventions in `CLAUDE.md`
(UUID PKs, `DECIMAL(19,4)` for quantities, money-as-cents in app code, every
quantity paired with a UOM ID).

## Re-deploying demo / staging

Deployment is automatic on push (DO App Platform pulls the matching branch).
Forced redeploys, manifest changes, and database operations are documented
in [`.do/README.md`](./.do/README.md).

To attach a new custom domain or rotate a secret, you need DO dashboard
access (FutureBuild maintainers only).

## Working with AI agents

The repo is structured to be friendly to AI coding agents. The two entry
points are:

- **Claude Code:** `npm install -g @anthropic-ai/claude-code && claude` from
  the repo root. Claude reads `CLAUDE.md` automatically for context.
- **Cursor / Antigravity:** opens with `cursor GableLBM`. Agents read
  `CLAUDE.md` and `.agent/workflows/development.md`.

If your AI agent suggests something that contradicts `CLAUDE.md`, trust
`CLAUDE.md`.

## One-time note: history wipe

The branches `master`, `staging`, and `community` were rebased to single
fresh commits before going public. If you cloned the repo prior to that, you
will need to re-clone:

```bash
cd /tmp && git clone git@github.com:futurebuild/GableLBM.git
```

Tags from before the wipe are no longer reachable and have been removed.

## Code of conduct

Be respectful. Be specific in PRs and issues. Don't open issues asking for
proprietary integrations — fork the repo and add adapters instead.

## License

By contributing, you agree your contributions are licensed under the same
license as the project (see [`LICENSE`](./LICENSE)).
