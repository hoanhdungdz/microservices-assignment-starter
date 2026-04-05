import os
import sqlite3
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field


DEFAULT_RESTAURANT_ID = "res-fastbite-1"
DEFAULT_MENU_ITEMS = (
    {
        "id": "mock-001",
        "name": "Classic Beef Burger",
        "description": "Bo nuong, pho mai, rau tuoi, sot dac trung.",
        "price": 55000,
        "category": "Burger",
        "image_url": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80",
    },
    {
        "id": "mock-002",
        "name": "Double Cheese Burger",
        "description": "2 lop pho mai tan chay cung bo nuong dam vi.",
        "price": 69000,
        "category": "Burger",
        "image_url": "https://images.unsplash.com/photo-1553979459-d2229ba7433b?auto=format&fit=crop&w=400&q=80",
    },
    {
        "id": "mock-003",
        "name": "Spicy Chicken Burger",
        "description": "Ga gion cay nhe, salad va mayo.",
        "price": 59000,
        "category": "Burger",
        "image_url": "https://images.unsplash.com/photo-1606755962773-d324e0a13086?auto=format&fit=crop&w=400&q=80",
    },
    {
        "id": "mock-004",
        "name": "Pepperoni Pizza",
        "description": "De mong gion, pepperoni va sot ca chua Y.",
        "price": 85000,
        "category": "Pizza",
        "image_url": "https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=400&q=80",
    },
    {
        "id": "mock-005",
        "name": "Seafood Pizza",
        "description": "Tom muc tuoi cung pho mai keo soi.",
        "price": 95000,
        "category": "Pizza",
        "image_url": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=400&q=80",
    },
    {
        "id": "mock-006",
        "name": "Hawaiian Pizza",
        "description": "Ham, dua va sot kem beo ngay.",
        "price": 79000,
        "category": "Pizza",
        "image_url": "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=400&q=80",
    },
    {
        "id": "mock-007",
        "name": "Original Fried Chicken",
        "description": "Ga ran gion truyen thong, da vang ruom.",
        "price": 65000,
        "category": "Fried Chicken",
        "image_url": "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=400&q=80",
    },
    {
        "id": "mock-008",
        "name": "Hot Spicy Wings",
        "description": "Canh ga sot cay ngot kieu Han.",
        "price": 59000,
        "category": "Fried Chicken",
        "image_url": "https://images.unsplash.com/photo-1567620832903-9fc6debc209f?auto=format&fit=crop&w=400&q=80",
    },
    {
        "id": "mock-009",
        "name": "Garlic Crispy Chicken",
        "description": "Ga gion sot bo toi thom lung.",
        "price": 72000,
        "category": "Fried Chicken",
        "image_url": "https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=400&q=80",
    },
    {
        "id": "mock-010",
        "name": "Combo Burger + Fries + Coke",
        "description": "Combo tiet kiem cho bua an nhanh tron ven.",
        "price": 99000,
        "category": "Combo Meal",
        "image_url": "https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?auto=format&fit=crop&w=400&q=80",
    },
    {
        "id": "mock-011",
        "name": "Family Chicken Combo",
        "description": "8 mieng ga + khoai + 2 nuoc ngot.",
        "price": 149000,
        "category": "Combo Meal",
        "image_url": "https://images.unsplash.com/photo-1585325701956-60dd9c8553bc?auto=format&fit=crop&w=400&q=80",
    },
    {
        "id": "mock-012",
        "name": "Pizza Party Combo",
        "description": "2 pizza co vua + khoai lac + Pepsi.",
        "price": 159000,
        "category": "Combo Meal",
        "image_url": "https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?auto=format&fit=crop&w=400&q=80",
    },
    {
        "id": "mock-013",
        "name": "French Fries",
        "description": "Khoai tay chien vang gion rac bot pho mai.",
        "price": 29000,
        "category": "Khac",
        "image_url": "https://images.unsplash.com/photo-1576107232684-1279f390859f?auto=format&fit=crop&w=400&q=80",
    },
    {
        "id": "mock-014",
        "name": "Mozzarella Sticks",
        "description": "Pho mai que keo soi, an kem sot marinara.",
        "price": 39000,
        "category": "Khac",
        "image_url": "https://images.unsplash.com/photo-1585109649139-366815a0d713?auto=format&fit=crop&w=400&q=80",
    },
    {
        "id": "mock-015",
        "name": "Choco Milkshake",
        "description": "Milkshake chocolate mat lanh, vi dam.",
        "price": 35000,
        "category": "Khac",
        "image_url": "https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=400&q=80",
    },
    {
        "id": "mock-016",
        "name": "Fried Rice Special",
        "description": "Com chien trung, rau cu va xuc xich.",
        "price": 45000,
        "category": "Khac",
        "image_url": "https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=400&q=80",
    },
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    seed_menu_items()
    yield


app = FastAPI(title="Menu Service", version="1.0.0", lifespan=lifespan)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_db_path() -> str:
    return os.getenv("MENU_DB_PATH", "/data/menu.db")


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
            CREATE TABLE IF NOT EXISTS menu_items (
                id TEXT PRIMARY KEY,
                restaurant_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                price REAL NOT NULL CHECK (price >= 0),
                category TEXT NOT NULL DEFAULT 'Khac',
                image_url TEXT,
                available INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            )
            """
        )


def seed_menu_items() -> None:
    with get_connection() as conn:
        for item in DEFAULT_MENU_ITEMS:
            existing_item = conn.execute(
                "SELECT id FROM menu_items WHERE id = ?",
                (item["id"],),
            ).fetchone()
            if existing_item is None:
                conn.execute(
                    """
                    INSERT INTO menu_items (
                        id, restaurant_id, name, description, price, category, image_url, available, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        item["id"],
                        DEFAULT_RESTAURANT_ID,
                        item["name"],
                        item["description"],
                        item["price"],
                        item["category"],
                        item["image_url"],
                        1,
                        utc_now_iso(),
                    ),
                )
            else:
                conn.execute(
                    """
                    UPDATE menu_items
                    SET restaurant_id = ?, name = ?, description = ?, price = ?, category = ?, image_url = ?
                    WHERE id = ?
                    """,
                    (
                        DEFAULT_RESTAURANT_ID,
                        item["name"],
                        item["description"],
                        item["price"],
                        item["category"],
                        item["image_url"],
                        item["id"],
                    ),
                )


class HealthResponse(BaseModel):
    status: str


class MenuItemCreate(BaseModel):
    restaurant_id: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=1000)
    price: float = Field(gt=0)
    category: str = Field(default="Khac", min_length=1, max_length=100)
    image_url: str | None = Field(default=None, max_length=1000)


class MenuItemUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=1000)
    price: float = Field(gt=0)
    category: str = Field(min_length=1, max_length=100)
    image_url: str | None = Field(default=None, max_length=1000)


class MenuItemAvailabilityUpdate(BaseModel):
    available: bool


class MenuItemResponse(BaseModel):
    id: str
    restaurant_id: str
    name: str
    description: str
    price: float
    category: str
    image_url: str | None
    available: bool
    created_at: str


def row_to_menu_item(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "restaurant_id": row["restaurant_id"],
        "name": row["name"],
        "description": row["description"],
        "price": row["price"],
        "category": row["category"],
        "image_url": row["image_url"],
        "available": bool(row["available"]),
        "created_at": row["created_at"],
    }


@app.get("/health", response_model=HealthResponse)
def health() -> dict:
    return {"status": "ok"}


@app.get("/menus", response_model=list[MenuItemResponse])
def list_menus(restaurant_id: str | None = Query(default=None)) -> list[dict]:
    query = "SELECT * FROM menu_items"
    params: tuple = ()
    if restaurant_id:
        query += " WHERE restaurant_id = ?"
        params = (restaurant_id,)
    query += " ORDER BY created_at DESC"

    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
    return [row_to_menu_item(row) for row in rows]


@app.post("/menus", response_model=MenuItemResponse, status_code=201)
def create_menu_item(payload: MenuItemCreate) -> dict:
    menu_item_id = str(uuid.uuid4())
    created_at = utc_now_iso()
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO menu_items (
                id, restaurant_id, name, description, price, category, image_url, available, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                menu_item_id,
                payload.restaurant_id.strip(),
                payload.name.strip(),
                payload.description.strip(),
                payload.price,
                payload.category.strip(),
                payload.image_url.strip() if payload.image_url else None,
                1,
                created_at,
            ),
        )
        row = conn.execute("SELECT * FROM menu_items WHERE id = ?", (menu_item_id,)).fetchone()
    return row_to_menu_item(row)


@app.get("/menus/{menu_item_id}", response_model=MenuItemResponse)
def get_menu_item(menu_item_id: str) -> dict:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM menu_items WHERE id = ?", (menu_item_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Menu item not found")
    return row_to_menu_item(row)


@app.patch("/menus/{menu_item_id}", response_model=MenuItemResponse)
def update_menu_item(menu_item_id: str, payload: MenuItemUpdate) -> dict:
    with get_connection() as conn:
        existing = conn.execute("SELECT id FROM menu_items WHERE id = ?", (menu_item_id,)).fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail="Menu item not found")

        conn.execute(
            """
            UPDATE menu_items
            SET name = ?, description = ?, price = ?, category = ?, image_url = ?
            WHERE id = ?
            """,
            (
                payload.name.strip(),
                payload.description.strip(),
                payload.price,
                payload.category.strip(),
                payload.image_url.strip() if payload.image_url else None,
                menu_item_id,
            ),
        )
        row = conn.execute("SELECT * FROM menu_items WHERE id = ?", (menu_item_id,)).fetchone()
    return row_to_menu_item(row)


@app.patch("/menus/{menu_item_id}/availability", response_model=MenuItemResponse)
def toggle_menu_item_availability(menu_item_id: str, payload: MenuItemAvailabilityUpdate) -> dict:
    with get_connection() as conn:
        existing = conn.execute("SELECT id FROM menu_items WHERE id = ?", (menu_item_id,)).fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail="Menu item not found")

        conn.execute(
            "UPDATE menu_items SET available = ? WHERE id = ?",
            (1 if payload.available else 0, menu_item_id),
        )
        row = conn.execute("SELECT * FROM menu_items WHERE id = ?", (menu_item_id,)).fetchone()
    return row_to_menu_item(row)
