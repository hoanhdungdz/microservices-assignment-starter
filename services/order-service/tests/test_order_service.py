import sys
from pathlib import Path
import importlib.util

from fastapi.testclient import TestClient


SERVICE_ROOT = Path(__file__).resolve().parents[1]


def load_main():
    module_name = "order_service_main_test"
    sys.modules.pop(module_name, None)
    spec = importlib.util.spec_from_file_location(module_name, SERVICE_ROOT / "app" / "main.py")
    module = importlib.util.module_from_spec(spec)
    assert spec is not None and spec.loader is not None
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def create_client(tmp_path, monkeypatch):
    db_file = tmp_path / "order_test.db"
    monkeypatch.setenv("ORDER_DB_PATH", str(db_file))

    main = load_main()
    app = main.app
    init_db = main.init_db

    if db_file.exists():
        db_file.unlink()
    init_db()

    return TestClient(app), main


def create_order_payload(restaurant_id="r-1"):
    return {
        "user_name": "Alice",
        "user_phone": "0999888777",
        "restaurant_id": restaurant_id,
        "delivery_address": "456 Lane",
        "note": "No spicy",
        "items": [
            {
                "menu_item_id": "m-1",
                "menu_item_name": "Burger",
                "quantity": 2,
                "unit_price": 5.5,
            }
        ],
    }


def test_health(tmp_path, monkeypatch):
    client, _ = create_client(tmp_path, monkeypatch)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_create_get_and_list_order(tmp_path, monkeypatch):
    client, main = create_client(tmp_path, monkeypatch)
    monkeypatch.setattr(main, "verify_restaurant_exists", lambda restaurant_id: None)

    create_response = client.post("/orders", json=create_order_payload())
    assert create_response.status_code == 201
    order = create_response.json()
    assert order["status"] == "PENDING"
    assert order["total_price"] == 11.0

    get_response = client.get(f"/orders/{order['id']}")
    assert get_response.status_code == 200
    assert len(get_response.json()["items"]) == 1

    list_response = client.get("/orders", params={"user_phone": "0999888777"})
    assert list_response.status_code == 200
    assert len(list_response.json()) >= 1


def test_status_transition_validation(tmp_path, monkeypatch):
    client, main = create_client(tmp_path, monkeypatch)
    monkeypatch.setattr(main, "verify_restaurant_exists", lambda restaurant_id: None)

    order = client.post("/orders", json=create_order_payload()).json()

    invalid_response = client.patch(
        f"/orders/{order['id']}/status", json={"status": "DELIVERED"}
    )
    assert invalid_response.status_code == 400

    valid_response = client.patch(
        f"/orders/{order['id']}/status", json={"status": "CONFIRMED"}
    )
    assert valid_response.status_code == 200
    assert valid_response.json()["status"] == "CONFIRMED"


def test_cancel_only_pending(tmp_path, monkeypatch):
    client, main = create_client(tmp_path, monkeypatch)
    monkeypatch.setattr(main, "verify_restaurant_exists", lambda restaurant_id: None)

    order = client.post("/orders", json=create_order_payload()).json()

    response = client.delete(f"/orders/{order['id']}")
    assert response.status_code == 200

    order_2 = client.post("/orders", json=create_order_payload("r-2")).json()
    client.patch(f"/orders/{order_2['id']}/status", json={"status": "CONFIRMED"})
    response = client.delete(f"/orders/{order_2['id']}")
    assert response.status_code == 400
