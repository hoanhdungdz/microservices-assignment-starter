import os
import sqlite3
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Order Service", version="1.0.0", lifespan=lifespan)

ORDER_STATUSES = (
    "PENDING",
    "CONFIRMED",
    "PREPARING",
    "DELIVERING",
    "DELIVERED",
    "CANCELLED",
)

VALID_TRANSITIONS: dict[str, set[str]] = {
    "PENDING": {"CONFIRMED", "CANCELLED"},
    "CONFIRMED": {"PREPARING", "CANCELLED"},
    "PREPARING": {"DELIVERING"},
    "DELIVERING": {"DELIVERED"},
    "DELIVERED": set(),
    "CANCELLED": set(),
}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_db_path() -> str:
    return os.getenv("ORDER_DB_PATH", "/data/order.db")


def get_restaurant_service_url() -> str:
    return os.getenv("RESTAURANT_SERVICE_URL", "http://restaurant-service:8000")


def get_connection() -> sqlite3.Connection:
    db_path = get_db_path()
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_db() -> None:
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY,
                user_name TEXT NOT NULL,
                user_phone TEXT NOT NULL,
                restaurant_id TEXT NOT NULL,
                delivery_address TEXT NOT NULL,
                status TEXT NOT NULL,
                total_price REAL NOT NULL,
                note TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS order_items (
                id TEXT PRIMARY KEY,
                order_id TEXT NOT NULL,
                menu_item_id TEXT NOT NULL,
                menu_item_name TEXT NOT NULL,
                quantity INTEGER NOT NULL CHECK (quantity > 0),
                unit_price REAL NOT NULL CHECK (unit_price >= 0),
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
            )
            """
        )


class HealthResponse(BaseModel):
    status: str


class OrderItemCreate(BaseModel):
    menu_item_id: str = Field(min_length=1)
    menu_item_name: str = Field(min_length=1, max_length=200)
    quantity: int = Field(gt=0)
    unit_price: float = Field(ge=0)


class OrderCreate(BaseModel):
    user_name: str = Field(min_length=1, max_length=200)
    user_phone: str = Field(min_length=1, max_length=30)
    restaurant_id: str = Field(min_length=1)
    delivery_address: str = Field(min_length=1, max_length=500)
    note: str | None = Field(default=None, max_length=1000)
    items: list[OrderItemCreate] = Field(min_length=1)


class OrderStatusUpdate(BaseModel):
    status: str


class OrderItemResponse(BaseModel):
    id: str
    order_id: str
    menu_item_id: str
    menu_item_name: str
    quantity: int
    unit_price: float


class OrderResponse(BaseModel):
    id: str
    user_name: str
    user_phone: str
    restaurant_id: str
    delivery_address: str
    status: str
    total_price: float
    note: str | None
    created_at: str
    updated_at: str
    items: list[OrderItemResponse]


class OrderListResponse(BaseModel):
    id: str
    user_name: str
    user_phone: str
    restaurant_id: str
    delivery_address: str
    status: str
    total_price: float
    note: str | None
    created_at: str
    updated_at: str


def row_to_order(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "user_name": row["user_name"],
        "user_phone": row["user_phone"],
        "restaurant_id": row["restaurant_id"],
        "delivery_address": row["delivery_address"],
        "status": row["status"],
        "total_price": row["total_price"],
        "note": row["note"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def row_to_order_item(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "order_id": row["order_id"],
        "menu_item_id": row["menu_item_id"],
        "menu_item_name": row["menu_item_name"],
        "quantity": row["quantity"],
        "unit_price": row["unit_price"],
    }


def verify_restaurant_exists(restaurant_id: str) -> None:
    url = f"{get_restaurant_service_url().rstrip('/')}/restaurants/{restaurant_id}"
    try:
        response = httpx.get(url, timeout=5.0)
    except httpx.RequestError as exc:
        raise HTTPException(status_code=400, detail=f"Restaurant service unavailable: {exc}") from exc

    if response.status_code == 404:
        raise HTTPException(status_code=400, detail="Restaurant does not exist")
    if response.status_code >= 400:
        raise HTTPException(status_code=400, detail="Unable to validate restaurant")


def get_order_with_items(order_id: str) -> dict | None:
    with get_connection() as conn:
        order_row = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        if order_row is None:
            return None
        item_rows = conn.execute("SELECT * FROM order_items WHERE order_id = ?", (order_id,)).fetchall()

    order = row_to_order(order_row)
    order["items"] = [row_to_order_item(row) for row in item_rows]
    return order


@app.get("/health", response_model=HealthResponse)
def health() -> dict:
    return {"status": "ok"}


@app.post("/orders", response_model=OrderResponse, status_code=201)
def create_order(payload: OrderCreate) -> dict:
    verify_restaurant_exists(payload.restaurant_id)

    order_id = str(uuid.uuid4())
    created_at = utc_now_iso()
    updated_at = created_at
    total_price = sum(item.quantity * item.unit_price for item in payload.items)

    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO orders (
                id, user_name, user_phone, restaurant_id, delivery_address,
                status, total_price, note, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                order_id,
                payload.user_name.strip(),
                payload.user_phone.strip(),
                payload.restaurant_id.strip(),
                payload.delivery_address.strip(),
                "PENDING",
                total_price,
                payload.note.strip() if payload.note else None,
                created_at,
                updated_at,
            ),
        )

        for item in payload.items:
            conn.execute(
                """
                INSERT INTO order_items (id, order_id, menu_item_id, menu_item_name, quantity, unit_price)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()),
                    order_id,
                    item.menu_item_id.strip(),
                    item.menu_item_name.strip(),
                    item.quantity,
                    item.unit_price,
                ),
            )

    order = get_order_with_items(order_id)
    if order is None:
        raise HTTPException(status_code=400, detail="Failed to create order")
    return order


@app.get("/orders/{order_id}", response_model=OrderResponse)
def get_order(order_id: str) -> dict:
    order = get_order_with_items(order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@app.get("/orders", response_model=list[OrderListResponse])
def list_orders(user_phone: str | None = Query(default=None)) -> list[dict]:
    query = "SELECT * FROM orders"
    params: tuple = ()
    if user_phone:
        query += " WHERE user_phone = ?"
        params = (user_phone,)
    query += " ORDER BY created_at DESC"

    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
    return [row_to_order(row) for row in rows]


@app.patch("/orders/{order_id}/status", response_model=OrderResponse)
def update_order_status(order_id: str, payload: OrderStatusUpdate) -> dict:
    new_status = payload.status.strip().upper()
    if new_status not in ORDER_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status value")

    with get_connection() as conn:
        order = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        if order is None:
            raise HTTPException(status_code=404, detail="Order not found")

        current_status = order["status"]
        if new_status not in VALID_TRANSITIONS[current_status]:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status transition from {current_status} to {new_status}",
            )

        conn.execute(
            "UPDATE orders SET status = ?, updated_at = ? WHERE id = ?",
            (new_status, utc_now_iso(), order_id),
        )

    updated_order = get_order_with_items(order_id)
    if updated_order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return updated_order


@app.delete("/orders/{order_id}")
def cancel_order(order_id: str) -> dict:
    with get_connection() as conn:
        order = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        if order is None:
            raise HTTPException(status_code=404, detail="Order not found")

        if order["status"] != "PENDING":
            raise HTTPException(status_code=400, detail="Only PENDING orders can be cancelled")

        conn.execute(
            "UPDATE orders SET status = ?, updated_at = ? WHERE id = ?",
            ("CANCELLED", utc_now_iso(), order_id),
        )

    return {"status": "ok", "message": "Order cancelled"}
