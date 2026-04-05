# Restaurant Service

## Stack

- Python 3.12
- FastAPI
- SQLite

## Run (inside Docker Compose)

Service is started by `docker compose up --build`.

## Environment variables

- `RESTAURANT_DB_PATH` (default: `/data/restaurant.db`)

## Endpoints

- `GET /health`
- `GET /restaurants`
- `GET /restaurants/{id}`
- `POST /restaurants`
- `GET /restaurants/{id}/menu`
- `POST /restaurants/{id}/menu`
- `GET /menu-items/{id}`
- `PATCH /menu-items/{id}`
- `PATCH /menu-items/{id}/availability`

## Notes

- SQLite DB is auto-created on startup.
- FastBite and 16 menu items mặc định are seeded on startup.
- Uses UUID string IDs.
- Input validation is handled by Pydantic/FastAPI with 422 responses.
- 404 responses are returned for missing restaurants/menu items.

## Tests

Tests are in `tests/test_service_a.py` and can run in containerized workflow.
