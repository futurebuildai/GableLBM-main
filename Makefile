.PHONY: up down logs ps pg-shell migrate seed reset-db

# ---------------------------------------------------------------------------
# Infra (Docker)
# ---------------------------------------------------------------------------
up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

ps:
	docker compose ps

pg-shell:
	docker exec -it gable_postgres psql -U gable_user -d gable_db

# ---------------------------------------------------------------------------
# Backend lifecycle
# ---------------------------------------------------------------------------
# Apply SQL migrations in order. Honors DATABASE_URL if set; otherwise the
# migrator falls back to its built-in dev default (localhost:5434).
migrate:
	cd backend && go run ./cmd/migrate

# Populate the database with Kelowna / Gable Lumber & Supply demo data. Safe
# to re-run; the seed uses ON CONFLICT upserts on natural keys.
seed:
	cd backend && go run ./cmd/seed

# Nuke + repave the dev database, then migrate and seed. Requires the
# `gable_postgres` container from docker compose to be running.
reset-db:
	docker exec -i gable_postgres psql -U gable_user -d postgres -c "DROP DATABASE IF EXISTS gable_db;"
	docker exec -i gable_postgres psql -U gable_user -d postgres -c "CREATE DATABASE gable_db OWNER gable_user;"
	$(MAKE) migrate
	$(MAKE) seed
