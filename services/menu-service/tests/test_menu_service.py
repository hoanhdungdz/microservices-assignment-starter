import sys
from pathlib import Path
import importlib.util

from fastapi.testclient import TestClient


SERVICE_ROOT = Path(__file__).resolve().parents[1]


def load_main():
    module_name = "menu_service_main_test"
    sys.modules.pop(module_name, None)
    spec = importlib.util.spec_from_file_location(module_name, SERVICE_ROOT / "app" / "main.py")
    module = importlib.util.module_from_spec(spec)
    assert spec is not None and spec.loader is not None
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def create_client(tmp_path, monkeypatch):
    db_file = tmp_path / "menu_test.db"
    monkeypatch.setenv("MENU_DB_PATH", str(db_file))

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


def test_create_and_get_menu_item(tmp_path, monkeypatch):
    client = create_client(tmp_path, monkeypatch)

    create_response = client.post(
        "/menus",
        json={
            "restaurant_id": "res-test-1",
            "name": "Margherita",
            "description": "Classic pizza",
            "price": 9.5,
            "category": "Pizza",
            "image_url": "https://example.com/pizza.jpg",
        },
    )
    assert create_response.status_code == 201
    menu_item = create_response.json()
    assert menu_item["category"] == "Pizza"
    assert menu_item["image_url"] == "https://example.com/pizza.jpg"

    get_response = client.get(f"/menus/{menu_item['id']}")
    assert get_response.status_code == 200
    assert get_response.json()["name"] == "Margherita"


def test_list_menus_with_filter(tmp_path, monkeypatch):
    client = create_client(tmp_path, monkeypatch)

    client.post(
        "/menus",
        json={
            "restaurant_id": "res-1",
            "name": "Item A",
            "description": "Desc A",
            "price": 10,
            "category": "Khac",
        },
    )
    client.post(
        "/menus",
        json={
            "restaurant_id": "res-2",
            "name": "Item B",
            "description": "Desc B",
            "price": 20,
            "category": "Khac",
        },
    )

    all_response = client.get("/menus")
    assert all_response.status_code == 200
    assert len(all_response.json()) >= 2

    filtered_response = client.get("/menus", params={"restaurant_id": "res-1"})
    assert filtered_response.status_code == 200
    assert all(item["restaurant_id"] == "res-1" for item in filtered_response.json())


def test_update_menu_item(tmp_path, monkeypatch):
    client = create_client(tmp_path, monkeypatch)

    item = client.post(
        "/menus",
        json={
            "restaurant_id": "res-1",
            "name": "Old Name",
            "description": "Old desc",
            "price": 10,
            "category": "Pizza",
        },
    ).json()

    update_response = client.patch(
        f"/menus/{item['id']}",
        json={
            "name": "New Name",
            "description": "New desc",
            "price": 15,
            "category": "Burger",
            "image_url": "https://example.com/new.jpg",
        },
    )
    assert update_response.status_code == 200
    assert update_response.json()["name"] == "New Name"
    assert update_response.json()["price"] == 15


def test_toggle_availability(tmp_path, monkeypatch):
    client = create_client(tmp_path, monkeypatch)

    item = client.post(
        "/menus",
        json={
            "restaurant_id": "res-1",
            "name": "Toggle Test",
            "description": "Desc",
            "price": 10,
            "category": "Khac",
        },
    ).json()

    toggle_response = client.patch(
        f"/menus/{item['id']}/availability", json={"available": False}
    )
    assert toggle_response.status_code == 200
    assert toggle_response.json()["available"] is False


def test_not_found_errors(tmp_path, monkeypatch):
    client = create_client(tmp_path, monkeypatch)

    response = client.get("/menus/not-exist")
    assert response.status_code == 404

    response = client.patch(
        "/menus/not-exist",
        json={
            "name": "Missing",
            "description": "Missing",
            "price": 10,
            "category": "Khac",
        },
    )
    assert response.status_code == 404

    response = client.patch("/menus/not-exist/availability", json={"available": True})
    assert response.status_code == 404
