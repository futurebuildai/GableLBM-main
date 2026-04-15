.PHONY: up down logs ps pg-shell

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
