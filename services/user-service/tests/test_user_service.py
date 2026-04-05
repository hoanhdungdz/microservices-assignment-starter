import sys
from pathlib import Path
import importlib.util

from fastapi.testclient import TestClient


SERVICE_ROOT = Path(__file__).resolve().parents[1]


def load_main():
    module_name = "user_service_main_test"
    sys.modules.pop(module_name, None)
    spec = importlib.util.spec_from_file_location(module_name, SERVICE_ROOT / "app" / "main.py")
    module = importlib.util.module_from_spec(spec)
    assert spec is not None and spec.loader is not None
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def create_client(tmp_path, monkeypatch):
    db_file = tmp_path / "user_test.db"
    monkeypatch.setenv("USER_DB_PATH", str(db_file))

    main = load_main()
    app = main.app
    init_db = main.init_db
    seed_default_manager = main.seed_default_manager

    if db_file.exists():
        db_file.unlink()
    init_db()
    seed_default_manager()

    return TestClient(app), main


def test_health(tmp_path, monkeypatch):
    client, _ = create_client(tmp_path, monkeypatch)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_register_login_and_update_user(tmp_path, monkeypatch):
    client, _ = create_client(tmp_path, monkeypatch)

    register_response = client.post(
        "/auth/register",
        json={
            "name": "Nguyen Van A",
            "email": "a@example.com",
            "phone": "0912345678",
            "password": "Password123",
        },
    )
    assert register_response.status_code == 201
    user = register_response.json()
    assert user["role"] == "customer"

    login_response = client.post(
        "/auth/login",
        json={"identity": "a@example.com", "password": "Password123"},
    )
    assert login_response.status_code == 200
    assert login_response.json()["email"] == "a@example.com"

    manager_login = client.post(
        "/auth/login",
        json={"identity": "manager@fastbite.vn", "password": "Manager@123"},
    )
    assert manager_login.status_code == 200
    assert manager_login.json()["role"] == "manager"

    update_response = client.patch(
        f"/users/{user['id']}",
        json={
            "name": "Nguyen Van B",
            "email": "b@example.com",
            "phone": "0987654321",
            "password": "Password456",
        },
    )
    assert update_response.status_code == 200
    assert update_response.json()["name"] == "Nguyen Van B"

    list_response = client.get("/users", params={"role": "customer"})
    assert list_response.status_code == 200
    assert any(row["email"] == "b@example.com" for row in list_response.json())


def test_auth_validation_errors(tmp_path, monkeypatch):
    client, _ = create_client(tmp_path, monkeypatch)

    response = client.post(
        "/auth/register",
        json={
            "name": "Bad Email",
            "email": "bad-email",
            "phone": "0912345678",
            "password": "Password123",
        },
    )
    assert response.status_code == 400

    response = client.post(
        "/auth/register",
        json={
            "name": "Manager",
            "email": "manager2@fastbite.vn",
            "phone": "0911111111",
            "password": "Password123",
            "role": "manager",
        },
    )
    assert response.status_code == 400

    response = client.post(
        "/auth/login",
        json={"identity": "manager@fastbite.vn", "password": "WrongPassword"},
    )
    assert response.status_code == 400
