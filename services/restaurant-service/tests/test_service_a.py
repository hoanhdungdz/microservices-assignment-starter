import sys
from pathlib import Path
import importlib.util

from fastapi.testclient import TestClient


SERVICE_ROOT = Path(__file__).resolve().parents[1]


def load_main():
    module_name = "service_a_main_test"
    sys.modules.pop(module_name, None)
    spec = importlib.util.spec_from_file_location(module_name, SERVICE_ROOT / "app" / "main.py")
    module = importlib.util.module_from_spec(spec)
    assert spec is not None and spec.loader is not None
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def create_client(tmp_path, monkeypatch):
    db_file = tmp_path / "restaurant_test.db"
    monkeypatch.setenv("RESTAURANT_DB_PATH", str(db_file))

    main = load_main()
    app = main.app
    init_db = main.init_db

    if db_file.exists():
        db_file.unlink()
    init_db()
    return TestClient(app)


def test_health(tmp_path, monkeypatch):
    client = create_client(tmp_path, monkeypatch)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_create_and_get_restaurant(tmp_path, monkeypatch):
    client = create_client(tmp_path, monkeypatch)

    create_response = client.post(
        "/restaurants",
        json={
            "name": "Pho House",
            "address": "123 Main St",
            "phone": "0909000000",
            "category": "Vietnamese",
        },
    )
    assert create_response.status_code == 201
    restaurant = create_response.json()

    get_response = client.get(f"/restaurants/{restaurant['id']}")
    assert get_response.status_code == 200
    assert get_response.json()["name"] == "Pho House"


def test_list_restaurants(tmp_path, monkeypatch):
    client = create_client(tmp_path, monkeypatch)

    client.post(
        "/restaurants",
        json={
            "name": "Restaurant A",
            "address": "Address A",
            "phone": "0123",
            "category": "Vietnamese",
        },
    )

    list_response = client.get("/restaurants")
    assert list_response.status_code == 200
    assert len(list_response.json()) >= 1


def test_not_found_errors(tmp_path, monkeypatch):
    client = create_client(tmp_path, monkeypatch)

    response = client.get("/restaurants/not-exist")
    assert response.status_code == 404
