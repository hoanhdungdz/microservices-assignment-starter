# Gateway

Nginx reverse proxy for frontend and backend services.

## Internal port

- `8000`

## Routes

- `/api/restaurants*` -> `restaurant-service:5000/restaurants*`
- `/api/menu-items*` -> `restaurant-service:5000/menu-items*`
- `/api/orders*` -> `order-service:5000/orders*`
- `/health` -> static `200 {"status": "ok"}`
- `/` -> proxied to `frontend:3000`

`/api` prefix is stripped before forwarding to backend services.
