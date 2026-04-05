import os
import sqlite3
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    seed_db()
    yield


app = FastAPI(title="Restaurant Service", version="1.0.0", lifespan=lifespan)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_db_path() -> str:
    return os.getenv("RESTAURANT_DB_PATH", "/data/restaurant.db")


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
            CREATE TABLE IF NOT EXISTS restaurants (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                address TEXT NOT NULL,
                phone TEXT NOT NULL,
                category TEXT NOT NULL,
                rating REAL NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
            """
        )


def seed_db() -> None:
    with get_connection() as conn:
        existing = conn.execute("SELECT id FROM restaurants WHERE id = ?", ("res-fastbite-1",)).fetchone()
        if not existing:
            conn.execute(
                """
                INSERT INTO restaurants (id, name, address, phone, category, rating, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "res-fastbite-1",
                    "FastBite",
                    "96 Tran Phu, Ha Dong, Ha Noi",
                    "0123456789",
                    "Fast Food",
                    4.8,
                    utc_now_iso(),
                ),
            )
        else:
            conn.execute(
                "UPDATE restaurants SET name = ?, address = ?, phone = ?, category = ?, rating = ? WHERE id = ?",
                ("FastBite", "96 Tran Phu, Ha Dong, Ha Noi", "0123456789", "Fast Food", 4.8, "res-fastbite-1"),
            )
        conn.execute("DELETE FROM restaurants WHERE name = 'Demo Restaurant'")


class HealthResponse(BaseModel):
    status: str


class RestaurantCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    address: str = Field(min_length=1, max_length=500)
    phone: str = Field(min_length=1, max_length=30)
    category: str = Field(min_length=1, max_length=100)


class RestaurantResponse(BaseModel):
    id: str
    name: str
    address: str
    phone: str
    category: str
    rating: float
    created_at: str


def row_to_restaurant(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "address": row["address"],
        "phone": row["phone"],
        "category": row["category"],
        "rating": row["rating"],
        "created_at": row["created_at"],
    }


@app.get("/health", response_model=HealthResponse)
def health() -> dict:
    return {"status": "ok"}


@app.get("/restaurants", response_model=list[RestaurantResponse])
def list_restaurants() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM restaurants ORDER BY created_at DESC").fetchall()
    return [row_to_restaurant(row) for row in rows]


@app.get("/restaurants/{restaurant_id}", response_model=RestaurantResponse)
def get_restaurant(restaurant_id: str) -> dict:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM restaurants WHERE id = ?", (restaurant_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    return row_to_restaurant(row)


@app.post("/restaurants", response_model=RestaurantResponse, status_code=201)
def create_restaurant(payload: RestaurantCreate) -> dict:
    restaurant_id = str(uuid.uuid4())
    created_at = utc_now_iso()
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO restaurants (id, name, address, phone, category, rating, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                restaurant_id,
                payload.name.strip(),
                payload.address.strip(),
                payload.phone.strip(),
                payload.category.strip(),
                0.0,
                created_at,
            ),
        )
        row = conn.execute("SELECT * FROM restaurants WHERE id = ?", (restaurant_id,)).fetchone()
    return row_to_restaurant(row)
