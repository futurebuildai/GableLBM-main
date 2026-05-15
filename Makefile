.PHONY: up down logs ps pg-shell migrate seed dev backend frontend

# ── Infrastructure ───────────────────────────────────────────
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

# ── Database ─────────────────────────────────────────────────
migrate:
	cd backend && go run ./cmd/migrate

seed:
	cd backend && go run ./cmd/seed

# ── Application ──────────────────────────────────────────────
backend:
	cd backend && go run ./cmd/server

frontend:
	cd app && npm install && npm run dev

# ── Full Local Dev Stack ──────────────────────────────────────
# Starts Docker, runs migrations, seeds data, then starts the backend.
# Run `make frontend` in a second terminal for the full UI.
dev: up
	@echo "Waiting for Postgres to be ready..."
	@until docker exec gable_postgres pg_isready -U gable_user -d gable_db -q; do sleep 1; done
	$(MAKE) migrate
	$(MAKE) seed
	$(MAKE) backend
