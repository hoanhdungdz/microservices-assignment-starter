import os
import sqlite3
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import hashlib
import re

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    seed_default_manager()
    yield


app = FastAPI(title="User Service", version="1.0.0", lifespan=lifespan)

USER_ROLES = ("customer", "manager")
DEFAULT_MANAGER = {
    "name": "FastBite Manager",
    "email": "manager@fastbite.vn",
    "phone": "0901234567",
    "password": "Manager@123",
    "role": "manager",
}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_db_path() -> str:
    return os.getenv("USER_DB_PATH", "/data/user.db")


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
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                phone TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('customer', 'manager')),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )


def normalize_email(email: str) -> str:
    return email.strip().lower()


def normalize_phone(phone: str) -> str:
    return phone.strip()


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def is_valid_email(email: str) -> bool:
    return bool(re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email))


def is_valid_phone(phone: str) -> bool:
    return bool(re.fullmatch(r"\d{10}", phone))


def seed_default_manager() -> None:
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM users WHERE email = ?",
            (normalize_email(DEFAULT_MANAGER["email"]),),
        ).fetchone()
        if existing is not None:
            return

        now = utc_now_iso()
        conn.execute(
            """
            INSERT INTO users (id, name, email, phone, password_hash, role, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                DEFAULT_MANAGER["name"],
                normalize_email(DEFAULT_MANAGER["email"]),
                normalize_phone(DEFAULT_MANAGER["phone"]),
                hash_password(DEFAULT_MANAGER["password"]),
                DEFAULT_MANAGER["role"],
                now,
                now,
            ),
        )


class HealthResponse(BaseModel):
    status: str


class UserRegister(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: str = Field(min_length=5, max_length=200)
    phone: str = Field(min_length=10, max_length=20)
    password: str = Field(min_length=6, max_length=200)
    role: str = Field(default="customer")


class UserLogin(BaseModel):
    identity: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=1, max_length=200)


class UserUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: str = Field(min_length=5, max_length=200)
    phone: str = Field(min_length=10, max_length=20)
    password: str | None = Field(default=None, min_length=6, max_length=200)


class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    phone: str
    role: str
    created_at: str
    updated_at: str


def row_to_user(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "phone": row["phone"],
        "role": row["role"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def get_user_by_identity(identity: str) -> dict | None:
    normalized_identity = identity.strip().lower()
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE lower(email) = ? OR phone = ?",
            (normalized_identity, identity.strip()),
        ).fetchone()
    return dict(row) if row is not None else None


@app.get("/health", response_model=HealthResponse)
def health() -> dict:
    return {"status": "ok"}


@app.post("/auth/register", response_model=UserResponse, status_code=201)
def register_user(payload: UserRegister) -> dict:
    role = payload.role.strip().lower()
    if role not in USER_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    if role != "customer":
        raise HTTPException(status_code=400, detail="Public registration is only allowed for customer accounts")

    email = normalize_email(payload.email)
    phone = normalize_phone(payload.phone)
    if not is_valid_email(email):
        raise HTTPException(status_code=400, detail="Invalid email format")
    if not is_valid_phone(phone):
        raise HTTPException(status_code=400, detail="Phone number must contain exactly 10 digits")

    created_at = utc_now_iso()
    user_id = str(uuid.uuid4())
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM users WHERE email = ? OR phone = ?",
            (email, phone),
        ).fetchone()
        if existing is not None:
            raise HTTPException(status_code=400, detail="Email or phone already exists")

        conn.execute(
            """
            INSERT INTO users (id, name, email, phone, password_hash, role, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                payload.name.strip(),
                email,
                phone,
                hash_password(payload.password),
                role,
                created_at,
                created_at,
            ),
        )
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=400, detail="Failed to create user")
    return row_to_user(row)


@app.post("/auth/login", response_model=UserResponse)
def login_user(payload: UserLogin) -> dict:
    row = get_user_by_identity(payload.identity)
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    if row["password_hash"] != hash_password(payload.password):
        raise HTTPException(status_code=400, detail="Invalid password")
    return row_to_user(row)


@app.get("/users", response_model=list[UserResponse])
def list_users(role: str | None = Query(default=None)) -> list[dict]:
    query = "SELECT * FROM users"
    params: tuple = ()
    if role:
        normalized_role = role.strip().lower()
        if normalized_role not in USER_ROLES:
            raise HTTPException(status_code=400, detail="Invalid role")
        query += " WHERE role = ?"
        params = (normalized_role,)
    query += " ORDER BY created_at DESC"

    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
    return [row_to_user(row) for row in rows]


@app.get("/users/{user_id}", response_model=UserResponse)
def get_user(user_id: str) -> dict:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    return row_to_user(row)


@app.patch("/users/{user_id}", response_model=UserResponse)
def update_user(user_id: str, payload: UserUpdate) -> dict:
    email = normalize_email(payload.email)
    phone = normalize_phone(payload.phone)
    if not is_valid_email(email):
        raise HTTPException(status_code=400, detail="Invalid email format")
    if not is_valid_phone(phone):
        raise HTTPException(status_code=400, detail="Phone number must contain exactly 10 digits")

    with get_connection() as conn:
        existing_user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if existing_user is None:
            raise HTTPException(status_code=404, detail="User not found")

        duplicate = conn.execute(
            "SELECT id FROM users WHERE (email = ? OR phone = ?) AND id != ?",
            (email, phone, user_id),
        ).fetchone()
        if duplicate is not None:
            raise HTTPException(status_code=400, detail="Email or phone already exists")

        password_hash = existing_user["password_hash"]
        if payload.password:
            password_hash = hash_password(payload.password)

        conn.execute(
            """
            UPDATE users
            SET name = ?, email = ?, phone = ?, password_hash = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                payload.name.strip(),
                email,
                phone,
                password_hash,
                utc_now_iso(),
                user_id,
            ),
        )
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    return row_to_user(row)
