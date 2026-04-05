# Frontend

Static SPA built with HTML, CSS, and Vanilla JavaScript, served by Nginx.

## Run

Served by `nginx:alpine` on port `3000` inside Docker Compose.

## Main Routes

- `#/auth`: customer login/register
- `#/profile`: customer profile update
- `#/`: customer menu browsing
- `#/cart`: cart view
- `#/checkout`: checkout form
- `#/tracking`: order tracking by phone
- `#/manager-auth`: manager login
- `#/manager`: manager dashboard

## Features

- Customer registration and login stored in browser session state
- Customer profile editing
- Menu browsing from `restaurant-service` data
- Cart and checkout flow
- Order tracking from `order-service` data
- Manager dashboard:
  - order summary
  - status updates
  - menu item edit
  - menu availability toggle
  - customer and report overview

## API Rule

All API calls use `/api/*` paths only through the gateway.
