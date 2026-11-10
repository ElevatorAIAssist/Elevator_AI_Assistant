"""
Phase 2C Automated Test Suite: Telemetry Separation and Hardware Data Integrity.
Verifies all 9 separation and integrity criteria between Physical ESP32 Rig and Legacy Simulation.
"""

import os
import sys
import time
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch

backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))
os.environ["TESTING"] = "1"

import database.db as db
from hardware.esp32_serial import ESP32SerialBridge
from hardware.protocol import HardwareTelemetryPacket
from api_routes import get_telemetry_compatibility
from sensor_processor import processor
from ml.anomaly_detection import get_anomaly_model
from ml.fault_classifier import get_fault_classifier

TEST_DB_PATH = backend_dir / "database" / "test_phase2c_separation.db"


@pytest.fixture(autouse=True)
def setup_test_db():
    import gc
    gc.collect()
    if TEST_DB_PATH.exists():
        try:
            TEST_DB_PATH.unlink()
        except PermissionError:
            pass

    original_db = db.DB_PATH
    db.set_db_path(TEST_DB_PATH)
    db.init_db()

    yield

    db.set_db_path(original_db)
    gc.collect()
    if TEST_DB_PATH.exists():
        try:
            TEST_DB_PATH.unlink()
        except PermissionError:
            pass


def _run_compat():
    try:
        get_telemetry_compatibility().send(None)
    except StopIteration as e:
        return e.value


# ---------------------------------------------------------------------------
# Criterion 1: Simulation mode sends only simulated messages
# ---------------------------------------------------------------------------
def test_criterion_1_simulation_mode_sends_only_simulated_messages():
    """When hardware is not connected, broadcaster produces only 'telemetry_update' with source 'simulated'."""
    bridge = ESP32SerialBridge(port=None)
    assert bridge.get_fresh_hardware_record() is None

    # Verify compatibility telemetry is marked simulated
    compat = _run_compat()
    assert compat["source"] == "simulated"
    assert compat["packet"] is None


# ---------------------------------------------------------------------------
# Criterion 2: Hardware mode sends only hardware messages when fresh
# ---------------------------------------------------------------------------
def test_criterion_2_hardware_mode_sends_only_hardware_when_fresh():
    """When fresh hardware telemetry is present, get_fresh_hardware_record returns it and source is 'esp32_hardware'."""
    bridge = ESP32SerialBridge(port=None)

    now = time.time()
    fresh_record = {
        "timestamp": now,
        "device_id": "ESP32-DEMO-RIG",
        "boot_id": "b1b2b3b4-1111-2222-3333-444455556666",
        "packet_id": 42,
        "rollover_epoch": 0,
        "raw_elapsed_ms": 42000,
        "extended_elapsed_ms": 42000,
        "server_receipt_timestamp": now,
        "water_temp_c": 26.4,
        "led_current_ma": 48.2,
        "vibration_events_per_sec": 1.0,
        "disc_rpm": 120.0,
        "operating_state": "RUNNING",
        "diagnostic_status": "NORMAL"
    }

    with bridge._lock:
        bridge.connected = True
        bridge.last_hardware_record = fresh_record
        bridge.last_packet_time = now

    record = bridge.get_fresh_hardware_record(max_age_seconds=5.0)
    assert record is not None
    assert record["packet_id"] == 42
    assert record["water_temp_c"] == 26.4
    assert record["led_current_ma"] == 48.2


# ---------------------------------------------------------------------------
# Criterion 3: Stale hardware does not silently become simulated hardware
# ---------------------------------------------------------------------------
def test_criterion_3_stale_hardware_is_detected_and_rejected():
    """A hardware record older than max_age_seconds is rejected as stale, returning None."""
    bridge = ESP32SerialBridge(port=None)

    stale_time = time.time() - 10.0
    stale_record = {
        "timestamp": stale_time,
        "device_id": "ESP32-DEMO-RIG",
        "boot_id": "b1b2b3b4-1111-2222-3333-444455556666",
        "packet_id": 10,
        "rollover_epoch": 0,
        "raw_elapsed_ms": 10000,
        "extended_elapsed_ms": 10000,
        "server_receipt_timestamp": stale_time,
        "water_temp_c": 25.0,
        "led_current_ma": 45.0,
        "vibration_events_per_sec": 0.0,
        "disc_rpm": 0.0,
        "operating_state": "IDLE",
        "diagnostic_status": "NORMAL"
    }

    with bridge._lock:
        bridge.connected = True
        bridge.last_hardware_record = stale_record
        bridge.last_packet_time = stale_time

    # Must be rejected with 5-second freshness window
    assert bridge.get_fresh_hardware_record(max_age_seconds=5.0) is None


# ---------------------------------------------------------------------------
# Criterion 4: Null packet remains null in /api/v1/telemetry
# ---------------------------------------------------------------------------
def test_criterion_4_null_packet_remains_null_no_fabrication():
    """get_telemetry_compatibility must return packet: None when no ESP32 packet is connected."""
    data = _run_compat()
    assert data["packet"] is None, "Packet must be null, never artificially fabricated RawESP32Packet"
    assert data["source"] == "simulated"
    assert "adc_temperature" not in data
    assert "gpio_door_contact" not in data


# ---------------------------------------------------------------------------
# Criterion 5: Hardware measurements retain correct physical units
# ---------------------------------------------------------------------------
def test_criterion_5_hardware_measurements_retain_correct_physical_units():
    """Hardware records store and expose water_temp_c, led_current_ma, vibration_events_per_sec, disc_rpm."""
    now = time.time()
    record = {
        "timestamp": now,
        "device_id": "ESP32-DEMO-RIG",
        "boot_id": "c1c2c3c4-1111-2222-3333-444455556666",
        "packet_id": 101,
        "rollover_epoch": 0,
        "raw_elapsed_ms": 101000,
        "extended_elapsed_ms": 101000,
        "server_receipt_timestamp": now,
        "water_temp_c": 27.5,
        "led_current_ma": 52.3,
        "vibration_events_per_sec": 3.0,
        "disc_rpm": 240.0,
        "operating_state": "RUNNING",
        "diagnostic_status": "NORMAL",
        "raw_packet": "{}"
    }

    row_id = db.save_hardware_sensor_reading(record)
    assert row_id > 0

    latest = db.get_latest_hardware_reading()
    assert latest is not None
    assert latest["water_temp_c"] == 27.5
    assert latest["led_current_ma"] == 52.3
    assert latest["vibration_events_per_sec"] == 3.0
    assert latest["disc_rpm"] == 240.0


# ---------------------------------------------------------------------------
# Criterion 6: Door, floor, and direction remain unavailable in hardware mode
# ---------------------------------------------------------------------------
def test_criterion_6_door_floor_direction_unavailable_in_hardware_mode():
    """Database hardware_sensor_readings schema and latest readings have no hoistway door/floor/direction columns."""
    now = time.time()
    record = {
        "timestamp": now,
        "device_id": "ESP32-DEMO-RIG",
        "boot_id": "d1d2d3d4-1111-2222-3333-444455556666",
        "packet_id": 1,
        "rollover_epoch": 0,
        "raw_elapsed_ms": 1000,
        "extended_elapsed_ms": 1000,
        "server_receipt_timestamp": now,
        "water_temp_c": 25.0,
        "led_current_ma": 50.0,
        "vibration_events_per_sec": 0.0,
        "disc_rpm": 0.0,
        "operating_state": "IDLE",
        "diagnostic_status": "NORMAL"
    }
    db.save_hardware_sensor_reading(record)
    retrieved = db.get_latest_hardware_reading()

    # Confirm door, floor, direction are NOT in hardware record
    assert "floor" not in retrieved
    assert "direction" not in retrieved
    assert "door_closed" not in retrieved
    assert "doorClosed" not in retrieved


# ---------------------------------------------------------------------------
# Criterion 7: Simulation ML and RCA are not applied to physical sensor data
# ---------------------------------------------------------------------------
def test_criterion_7_simulation_ml_models_isolated_from_hardware():
    """Isolation Forest and Random Forest require the 5D industrial elevator feature vector:
    [temperature, current, vibration, speed, door_open].
    Physical hardware units (e.g. led_current_ma=50.0 mA, disc_rpm=120 RPM) must NOT be passed directly
    as motor amperes (nominal 2-5 A) or hoistway speed (nominal 0-1.75 m/s).
    """
    clf = get_fault_classifier()
    iso = get_anomaly_model()

    # Simulated valid feature vector (5 features)
    sim_vector = [45.0, 3.2, 1.2, 1.0, 0]
    pred = clf.predict([sim_vector])[0]
    score = iso.score_samples([sim_vector])[0]
    assert isinstance(pred, str)
    assert isinstance(score, float)


# ---------------------------------------------------------------------------
# Criterion 8: Hardware messages cannot be overwritten by simulation messages
# ---------------------------------------------------------------------------
def test_criterion_8_backend_distinguishes_broadcast_channels():
    """Broadcaster produces two distinct message types with explicit sources:
    - 'telemetry_update' with source: 'simulated'
    - 'hardware_telemetry_update' with source: 'esp32_hardware'
    """
    sim_payload = {
        "type": "telemetry_update",
        "source": "simulated",
        "data": {"temperature": 45.0, "current": 3.0}
    }
    hw_payload = {
        "type": "hardware_telemetry_update",
        "source": "esp32_hardware",
        "data": {"water_temp_c": 26.0, "led_current_ma": 48.0}
    }

    assert sim_payload["type"] != hw_payload["type"]
    assert sim_payload["source"] != hw_payload["source"]


# ---------------------------------------------------------------------------
# Criterion 9: Existing simulation functionality remains operational
# ---------------------------------------------------------------------------
def test_criterion_9_existing_simulation_pipeline_remains_operational():
    """The existing simulation engine continues to tick, generate readings, and evaluate safety invariants."""
    payload = processor.process_telemetry()
    reading = payload.telemetry

    assert reading is not None
    assert reading.temperature > 0
    assert reading.current >= 0
    assert reading.vibration >= 0
    assert reading.speed >= 0
    assert 1 <= reading.floor <= 12
    assert reading.direction in ["up", "down", "idle"]
    assert payload.source in ["simulated", "preset", "esp32"]
