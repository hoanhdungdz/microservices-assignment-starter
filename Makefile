.PHONY: help init up down logs clean

help:
	@echo "make init   - create .env from .env.example if missing"
	@echo "make up     - build and start all containers"
	@echo "make down   - stop all containers"
	@echo "make logs   - view compose logs"
	@echo "make clean  - stop containers and remove volumes"

init:
	@if [ ! -f .env ]; then cp .env.example .env; fi

up:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f

clean:
	docker compose down -v
