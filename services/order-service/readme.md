# Order Service

## Stack

- Python 3.12
- FastAPI
- SQLite

## Run (inside Docker Compose)

Service is started by `docker compose up --build`.

## Environment variables

- `ORDER_DB_PATH` (default: `/data/order.db`)
- `RESTAURANT_SERVICE_URL` (default: `http://restaurant-service:5000`)

## Endpoints

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `GET /users`
- `GET /users/{id}`
- `PATCH /users/{id}`
- `POST /orders`
- `GET /orders/{id}`
- `GET /orders?user_phone=xxx`
- `PATCH /orders/{id}/status`
- `DELETE /orders/{id}`

## Status transitions

- `PENDING -> CONFIRMED -> PREPARING -> DELIVERING -> DELIVERED`
- `CANCELLED` allowed from `PENDING` or `CONFIRMED` (for status patch)
- `DELETE /orders/{id}` cancellation is only allowed when current status is `PENDING`

## Notes

- SQLite DB is auto-created on startup.
- Default manager account is seeded on startup:
  - `manager@fastbite.vn`
  - `0901234567`
  - `Manager@123`
- On order creation, service validates `restaurant_id` against Restaurant Service using Docker DNS (`restaurant-service`).
- Input validation is handled by Pydantic/FastAPI.

## Tests

Tests are in `tests/test_service_b.py`.
