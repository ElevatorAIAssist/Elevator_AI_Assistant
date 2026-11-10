"""
Automated Integration Test Suite for Phase 2B Step 3:
PySerial Bridge Integration, Protocol Handshake, and Hardware Storage Isolation.
Runs against an isolated temporary test database.
"""

import os
import sys
import time
import json
import sqlite3
import pytest
from typing import Tuple, Dict, Any, Optional
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))
os.environ["TESTING"] = "1"

import database.db as db  # type: ignore
from hardware.esp32_serial import ESP32SerialBridge  # type: ignore
from hardware.protocol import HardwareProtocolEngine, HardwareTelemetryPacket, DeviceSessionState  # type: ignore
from ml.anomaly_detection import get_anomaly_model  # type: ignore
from ml.fault_classifier import get_fault_classifier  # type: ignore

INTEG_DB_PATH = backend_dir / "database" / "test_phase2b_integration.db"


@pytest.fixture(autouse=True)
def setup_integration_db():
    """Initializes schema in isolated test database before each test."""
    import gc
    gc.collect()
    if INTEG_DB_PATH.exists():
        try:
            INTEG_DB_PATH.unlink()
        except PermissionError:
            pass

    original_db = db.get_db_path()
    # Override db path for test isolation
    db.set_db_path(INTEG_DB_PATH)

    conn = sqlite3.connect(str(INTEG_DB_PATH))
    cur = conn.cursor()

    # 1. Device boot session registry
    cur.execute("""
        CREATE TABLE IF NOT EXISTS device_boot_sessions (
            session_uuid TEXT PRIMARY KEY,
            device_id TEXT NOT NULL,
            boot_id TEXT NOT NULL,
            generation_id INTEGER NOT NULL,
            fw_version TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'RETIRED', 'CORRUPT_DESYNC', 'OUTAGE_AMBIGUITY')),
            t_anchor REAL NOT NULL,
            initial_raw_elapsed_ms INTEGER NOT NULL,
            created_at REAL NOT NULL,
            retired_at REAL,
            CONSTRAINT uq_device_boot UNIQUE(device_id, boot_id)
        );
    """)
    cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_device_generation ON device_boot_sessions(device_id, generation_id);")
    cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_device_single_active ON device_boot_sessions(device_id) WHERE status = 'ACTIVE';")

    # 2. Alerts table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS alerts (
            id TEXT PRIMARY KEY,
            timestamp REAL NOT NULL,
            fault_code TEXT NOT NULL,
            fault_name TEXT NOT NULL,
            severity TEXT NOT NULL,
            sensor_name TEXT,
            sensor_value TEXT,
            description TEXT,
            acknowledged INTEGER DEFAULT 0
        );
    """)

    # 3. Dedicated hardware_sensor_readings table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS hardware_sensor_readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp REAL NOT NULL,
            device_id TEXT NOT NULL,
            boot_id TEXT NOT NULL,
            packet_id INTEGER NOT NULL,
            rollover_epoch INTEGER NOT NULL,
            raw_elapsed_ms INTEGER NOT NULL,
            extended_elapsed_ms INTEGER NOT NULL,
            server_receipt_timestamp REAL NOT NULL,
            water_temp_c REAL NOT NULL,
            led_current_ma REAL NOT NULL,
            vibration_events_per_sec REAL NOT NULL,
            disc_rpm REAL NOT NULL,
            operating_state TEXT NOT NULL,
            diagnostic_status TEXT DEFAULT 'NORMAL',
            raw_packet TEXT
        );
    """)
    cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_hw_device_packet ON hardware_sensor_readings(device_id, boot_id, packet_id);")

    # 4. Legacy sensor_readings table (for isolation checks)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS sensor_readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp REAL NOT NULL,
            temperature REAL NOT NULL,
            current REAL NOT NULL,
            vibration REAL NOT NULL,
            speed REAL NOT NULL,
            door_closed INTEGER,
            floor INTEGER,
            direction TEXT,
            source TEXT DEFAULT 'simulated',
            raw_packet TEXT
        );
    """)

    # Clean rows in case previous file handle was locked on Windows
    cur.execute("DELETE FROM device_boot_sessions;")
    cur.execute("DELETE FROM alerts;")
    cur.execute("DELETE FROM hardware_sensor_readings;")
    cur.execute("DELETE FROM sensor_readings;")

    conn.commit()
    conn.close()

    yield

    # Teardown
    import gc
    gc.collect()
    time.sleep(0.05)
    if INTEG_DB_PATH.exists():
        try:
            INTEG_DB_PATH.unlink()
        except PermissionError:
            pass
    db.set_db_path(original_db)


# ----------------------------------------------------------------------------
# 1. Fresh ESP32 Handshake
# ----------------------------------------------------------------------------
def test_1_fresh_esp32_handshake():
    bridge = ESP32SerialBridge()
    nonce = bridge.initiate_handshake(device_id="ESP32_RIG_01")
    assert nonce is not None

    init_line = json.dumps({
        "type": "SESSION_INIT",
        "device_id": "ESP32_RIG_01",
        "boot_id": "boot-test-01",
        "challenge_nonce": nonce,
        "raw_elapsed_ms": 1200,
        "firmware_version": "v2.0.0-afdir"
    })

    status, res = bridge.process_line(init_line, receipt_time=1793770000.0)
    assert status == "SESSION_ACCEPTED"
    assert bridge.active_state is not None
    assert bridge.active_state.generation_id == 1
    assert bridge.active_state.t_anchor == 1793770000.0 - (1200 / 1000.0)


# ----------------------------------------------------------------------------
# 2. Same-Boot USB Reconnection
# ----------------------------------------------------------------------------
def test_2_same_boot_usb_reconnection():
    bridge = ESP32SerialBridge()
    nonce1 = bridge.initiate_handshake(device_id="ESP32_RIG_01")
    bridge.process_line(json.dumps({
        "type": "SESSION_INIT", "device_id": "ESP32_RIG_01", "boot_id": "boot-test-02",
        "challenge_nonce": nonce1, "raw_elapsed_ms": 1000
    }), receipt_time=1793770000.0)

    # Ingest packet 1
    p1 = {
        "protocol_version": "2.0", "device_id": "ESP32_RIG_01", "boot_id": "boot-test-02",
        "firmware_version": "v2.0", "packet_id": 1, "elapsed_ms": 1100,
        "water_temp_c": 24.5, "led_current_ma": 18.2, "vibration_events_per_sec": 3.0,
        "disc_rpm": 450.0, "operating_state": "RUNNING"
    }
    bridge.process_line(json.dumps(p1), receipt_time=1793770000.1)

    # Reconnect with same boot_id
    nonce2 = bridge.initiate_handshake(device_id="ESP32_RIG_01")
    status2, res2 = bridge.process_line(json.dumps({
        "type": "SESSION_INIT", "device_id": "ESP32_RIG_01", "boot_id": "boot-test-02",
        "challenge_nonce": nonce2, "raw_elapsed_ms": 1200
    }), receipt_time=1793770002.0)

    assert status2 == "SESSION_RECONNECTED"
    assert bridge.active_state is not None
    assert bridge.active_state.generation_id == 1
    assert bridge.active_state.high_water_mark == 1

    # Verify zero duplicate rows in device_boot_sessions
    conn = sqlite3.connect(str(INTEG_DB_PATH))
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM device_boot_sessions WHERE device_id = 'ESP32_RIG_01';")
    row = cur.fetchone()
    assert row is not None and row[0] == 1
    conn.close()


# ----------------------------------------------------------------------------
# 3. Invalid or Expired Nonce
# ----------------------------------------------------------------------------
def test_3_invalid_or_expired_nonce():
    bridge = ESP32SerialBridge()
    bridge.initiate_handshake(device_id="ESP32_RIG_01")

    # Submit invalid nonce
    status, res = bridge.process_line(json.dumps({
        "type": "SESSION_INIT", "device_id": "ESP32_RIG_01", "boot_id": "boot-test-03",
        "challenge_nonce": "bad_hex_nonce_00000", "raw_elapsed_ms": 1000
    }))
    assert status == "CHALLENGE_VERIFICATION_FAILED"
    assert bridge.active_state is None


# ----------------------------------------------------------------------------
# 4. Malformed JSON
# ----------------------------------------------------------------------------
def test_4_malformed_json():
    bridge = ESP32SerialBridge()
    status, res = bridge.process_line('{"incomplete_json": true, ')
    assert status == "MALFORMED_LINE" or status == "JSON_DECODE_ERROR"


# ----------------------------------------------------------------------------
# 5. Missing Required Packet Fields
# ----------------------------------------------------------------------------
def test_5_missing_required_packet_fields():
    bridge = ESP32SerialBridge()
    nonce = bridge.initiate_handshake(device_id="ESP32_RIG_01")
    bridge.process_line(json.dumps({
        "type": "SESSION_INIT", "device_id": "ESP32_RIG_01", "boot_id": "boot-test-05",
        "challenge_nonce": nonce, "raw_elapsed_ms": 1000
    }))

    # Missing water_temp_c and packet_id
    bad_payload = json.dumps({
        "protocol_version": "2.0", "device_id": "ESP32_RIG_01", "boot_id": "boot-test-05"
    })
    status, res = bridge.process_line(bad_payload)
    assert status == "MALFORMED_JSON_PAYLOAD"


# ----------------------------------------------------------------------------
# 6. Invalid Sensor Values
# ----------------------------------------------------------------------------
def test_6_invalid_sensor_values():
    bridge = ESP32SerialBridge()
    nonce = bridge.initiate_handshake(device_id="ESP32_RIG_01")
    bridge.process_line(json.dumps({
        "type": "SESSION_INIT", "device_id": "ESP32_RIG_01", "boot_id": "boot-test-06",
        "challenge_nonce": nonce, "raw_elapsed_ms": 1000
    }))

    # water_temp_c out of physical range (150 > 120)
    bad_val_payload = json.dumps({
        "protocol_version": "2.0", "device_id": "ESP32_RIG_01", "boot_id": "boot-test-06",
        "firmware_version": "v2.0", "packet_id": 1, "elapsed_ms": 1100,
        "water_temp_c": 150.0, "led_current_ma": 18.0, "vibration_events_per_sec": 2.0,
        "disc_rpm": 400.0, "operating_state": "RUNNING"
    })
    status, res = bridge.process_line(bad_val_payload)
    assert status == "MALFORMED_JSON_PAYLOAD"


# ----------------------------------------------------------------------------
# 7. Duplicate Packet Rejection
# ----------------------------------------------------------------------------
def test_7_duplicate_packet_rejection():
    bridge = ESP32SerialBridge()
    nonce = bridge.initiate_handshake(device_id="ESP32_RIG_01")
    bridge.process_line(json.dumps({
        "type": "SESSION_INIT", "device_id": "ESP32_RIG_01", "boot_id": "boot-test-07",
        "challenge_nonce": nonce, "raw_elapsed_ms": 1000
    }))

    p1 = json.dumps({
        "protocol_version": "2.0", "device_id": "ESP32_RIG_01", "boot_id": "boot-test-07",
        "firmware_version": "v2.0", "packet_id": 1, "elapsed_ms": 1100,
        "water_temp_c": 24.0, "led_current_ma": 18.0, "vibration_events_per_sec": 2.0,
        "disc_rpm": 400.0, "operating_state": "RUNNING"
    })
    status1, _ = bridge.process_line(p1)
    assert status1 == "ACCEPTED"

    # Re-submit packet 1
    status2, _ = bridge.process_line(p1)
    assert status2 == "DUPLICATE_PACKET"
    assert bridge.duplicate_count == 1


# ----------------------------------------------------------------------------
# 8. Sequence Gap Rejection & Discontinuity Alert
# ----------------------------------------------------------------------------
def test_8_sequence_gap_rejection():
    bridge = ESP32SerialBridge()
    nonce = bridge.initiate_handshake(device_id="ESP32_RIG_01")
    bridge.process_line(json.dumps({
        "type": "SESSION_INIT", "device_id": "ESP32_RIG_01", "boot_id": "boot-test-08",
        "challenge_nonce": nonce, "raw_elapsed_ms": 1000
    }))

    p1 = json.dumps({
        "protocol_version": "2.0", "device_id": "ESP32_RIG_01", "boot_id": "boot-test-08",
        "firmware_version": "v2.0", "packet_id": 1, "elapsed_ms": 1100,
        "water_temp_c": 24.0, "led_current_ma": 18.0, "vibration_events_per_sec": 2.0,
        "disc_rpm": 400.0, "operating_state": "RUNNING"
    })
    bridge.process_line(p1)

    # Gap: Send packet 4
    p4 = json.dumps({
        "protocol_version": "2.0", "device_id": "ESP32_RIG_01", "boot_id": "boot-test-08",
        "firmware_version": "v2.0", "packet_id": 4, "elapsed_ms": 1400,
        "water_temp_c": 24.0, "led_current_ma": 18.0, "vibration_events_per_sec": 2.0,
        "disc_rpm": 400.0, "operating_state": "RUNNING"
    })
    status_gap, res_gap = bridge.process_line(p4)
    assert status_gap == "SEQUENCE_GAP_DISCONTINUITY"
    assert bridge.gap_count == 1

    # Verify critical alert logged in SQLite
    conn = sqlite3.connect(str(INTEG_DB_PATH))
    cur = conn.cursor()
    cur.execute("SELECT fault_code, severity FROM alerts WHERE fault_code = 'SEQUENCE_GAP_DISCONTINUITY';")
    alert_row = cur.fetchone()
    assert alert_row == ("SEQUENCE_GAP_DISCONTINUITY", "CRITICAL")
    conn.close()


# ----------------------------------------------------------------------------
# 9. Timer Jitter Clamping
# ----------------------------------------------------------------------------
def test_9_timer_jitter():
    bridge = ESP32SerialBridge()
    nonce = bridge.initiate_handshake(device_id="ESP32_RIG_01")
    bridge.process_line(json.dumps({
        "type": "SESSION_INIT", "device_id": "ESP32_RIG_01", "boot_id": "boot-test-09",
        "challenge_nonce": nonce, "raw_elapsed_ms": 1000
    }))

    p1 = json.dumps({
        "protocol_version": "2.0", "device_id": "ESP32_RIG_01", "boot_id": "boot-test-09",
        "firmware_version": "v2.0", "packet_id": 1, "elapsed_ms": 5000,
        "water_temp_c": 24.0, "led_current_ma": 18.0, "vibration_events_per_sec": 2.0,
        "disc_rpm": 400.0, "operating_state": "RUNNING"
    })
    bridge.process_line(p1)

    # Packet 2 has -20ms jitter (4980ms)
    p2 = json.dumps({
        "protocol_version": "2.0", "device_id": "ESP32_RIG_01", "boot_id": "boot-test-09",
        "firmware_version": "v2.0", "packet_id": 2, "elapsed_ms": 4980,
        "water_temp_c": 24.0, "led_current_ma": 18.0, "vibration_events_per_sec": 2.0,
        "disc_rpm": 400.0, "operating_state": "RUNNING"
    })
    status2, res2 = bridge.process_line(p2)
    assert status2 == "ACCEPTED"
    assert res2 is not None
    assert res2["diagnostic_status"] == "TIMER_JITTER_CLAMPED"
    assert res2["raw_elapsed_ms"] == 4980  # Unmutated
    assert res2["extended_elapsed_ms"] == 5000  # Clamped


# ----------------------------------------------------------------------------
# 10. Timer Rollover
# ----------------------------------------------------------------------------
def test_10_timer_rollover():
    bridge = ESP32SerialBridge()
    nonce = bridge.initiate_handshake(device_id="ESP32_RIG_01")
    bridge.process_line(json.dumps({
        "type": "SESSION_INIT", "device_id": "ESP32_RIG_01", "boot_id": "boot-test-10",
        "challenge_nonce": nonce, "raw_elapsed_ms": 4294900000
    }))

    p1 = json.dumps({
        "protocol_version": "2.0", "device_id": "ESP32_RIG_01", "boot_id": "boot-test-10",
        "firmware_version": "v2.0", "packet_id": 1, "elapsed_ms": 4294950000,
        "water_temp_c": 24.0, "led_current_ma": 18.0, "vibration_events_per_sec": 2.0,
        "disc_rpm": 400.0, "operating_state": "RUNNING"
    })
    bridge.process_line(p1)

    # Rollover to 200ms
    p2 = json.dumps({
        "protocol_version": "2.0", "device_id": "ESP32_RIG_01", "boot_id": "boot-test-10",
        "firmware_version": "v2.0", "packet_id": 2, "elapsed_ms": 200,
        "water_temp_c": 24.0, "led_current_ma": 18.0, "vibration_events_per_sec": 2.0,
        "disc_rpm": 400.0, "operating_state": "RUNNING"
    })
    status2, res2 = bridge.process_line(p2)
    assert status2 == "ACCEPTED"
    assert res2 is not None
    assert res2["rollover_epoch"] == 1
    assert res2["extended_elapsed_ms"] == (1 << 32) + 200


# ----------------------------------------------------------------------------
# 11. Unexpected ESP32 Reset
# ----------------------------------------------------------------------------
def test_11_unexpected_esp32_reset():
    bridge = ESP32SerialBridge()
    nonce = bridge.initiate_handshake(device_id="ESP32_RIG_01")
    bridge.process_line(json.dumps({
        "type": "SESSION_INIT", "device_id": "ESP32_RIG_01", "boot_id": "boot-test-11",
        "challenge_nonce": nonce, "raw_elapsed_ms": 1000
    }))

    p1 = json.dumps({
        "protocol_version": "2.0", "device_id": "ESP32_RIG_01", "boot_id": "boot-test-11",
        "firmware_version": "v2.0", "packet_id": 1, "elapsed_ms": 100000,
        "water_temp_c": 24.0, "led_current_ma": 18.0, "vibration_events_per_sec": 2.0,
        "disc_rpm": 400.0, "operating_state": "RUNNING"
    })
    bridge.process_line(p1)

    # Reset near 0 (500ms) without handshake
    p2 = json.dumps({
        "protocol_version": "2.0", "device_id": "ESP32_RIG_01", "boot_id": "boot-test-11",
        "firmware_version": "v2.0", "packet_id": 2, "elapsed_ms": 500,
        "water_temp_c": 24.0, "led_current_ma": 18.0, "vibration_events_per_sec": 2.0,
        "disc_rpm": 400.0, "operating_state": "RUNNING"
    })
    status2, _ = bridge.process_line(p2)
    assert status2 == "UNANNOUNCED_RESET_WITHOUT_BOOT_ID"


# ----------------------------------------------------------------------------
# 12. Backend Restart Recovery from Single Latest Record
# ----------------------------------------------------------------------------
def test_12_backend_restart_recovery():
    bridge1 = ESP32SerialBridge()
    nonce = bridge1.initiate_handshake(device_id="ESP32_RIG_01")
    bridge1.process_line(json.dumps({
        "type": "SESSION_INIT", "device_id": "ESP32_RIG_01", "boot_id": "boot-test-12",
        "challenge_nonce": nonce, "raw_elapsed_ms": 1000
    }))

    p1 = json.dumps({
        "protocol_version": "2.0", "device_id": "ESP32_RIG_01", "boot_id": "boot-test-12",
        "firmware_version": "v2.0", "packet_id": 1, "elapsed_ms": 1200,
        "water_temp_c": 24.0, "led_current_ma": 18.0, "vibration_events_per_sec": 2.0,
        "disc_rpm": 400.0, "operating_state": "RUNNING"
    })
    bridge1.process_line(p1)

    # Backend restarts
    bridge2 = ESP32SerialBridge()
    conn = sqlite3.connect(str(INTEG_DB_PATH))
    restored_state = bridge2.protocol_engine.restore_session_from_db(conn, "ESP32_RIG_01", "boot-test-12")
    conn.close()

    assert restored_state is not None
    assert restored_state.high_water_mark == 1
    assert restored_state.last_accepted_raw_ms == 1200
    assert restored_state.current_epoch == 0


# ----------------------------------------------------------------------------
# 13. Valid Hardware Packet Persistence in Dedicated Table
# ----------------------------------------------------------------------------
def test_13_valid_hardware_packet_persistence():
    bridge = ESP32SerialBridge()
    nonce = bridge.initiate_handshake(device_id="ESP32_RIG_01")
    bridge.process_line(json.dumps({
        "type": "SESSION_INIT", "device_id": "ESP32_RIG_01", "boot_id": "boot-test-13",
        "challenge_nonce": nonce, "raw_elapsed_ms": 1000
    }))

    p1 = json.dumps({
        "protocol_version": "2.0", "device_id": "ESP32_RIG_01", "boot_id": "boot-test-13",
        "firmware_version": "v2.0", "packet_id": 1, "elapsed_ms": 1500,
        "water_temp_c": 25.4, "led_current_ma": 19.8, "vibration_events_per_sec": 4.5,
        "disc_rpm": 520.0, "operating_state": "RUNNING"
    })
    bridge.process_line(p1)

    conn = sqlite3.connect(str(INTEG_DB_PATH))
    cur = conn.cursor()
    cur.execute("SELECT water_temp_c, led_current_ma, vibration_events_per_sec, disc_rpm FROM hardware_sensor_readings WHERE packet_id = 1;")
    row = cur.fetchone()
    assert row == (25.4, 19.8, 4.5, 520.0)
    conn.close()


# ----------------------------------------------------------------------------
# 14 & 15. Serial Disconnection and Reconnection
# ----------------------------------------------------------------------------
@pytest.fixture
def mock_connected_bridge() -> ESP32SerialBridge:
    """Fixture providing an ESP32SerialBridge instance with connection state initialized."""
    bridge = ESP32SerialBridge()
    bridge.connected = True
    return bridge


def test_14_15_serial_disconnection_and_reconnection(mock_connected_bridge: ESP32SerialBridge):
    bridge = mock_connected_bridge
    assert bridge.get_status()["connected"] is True

    # Simulate disconnect
    bridge.stop()
    assert bridge.connected is False
    assert bridge.get_status()["connected"] is False

    # Simulate reconnect
    nonce = bridge.initiate_handshake()
    assert nonce is not None
    assert bridge.connection_generation == 1


# ----------------------------------------------------------------------------
# 16. Hardware Data Isolated from Legacy Industrial ML Models
# ----------------------------------------------------------------------------
def test_16_hardware_data_isolated_from_legacy_ml():
    """
    Verify legacy Isolation Forest and Random Forest require motor industrial features
    and are NOT invoked on physical rig measurements (water temp, LED mA, disc RPM).
    """
    iso = get_anomaly_model()
    clf = get_fault_classifier()
    assert iso is not None
    assert clf is not None

    # Legacy models expect 5 features: temperature, current, vibration, speed, door_closed
    # Hardware rig has water_temp_c, led_current_ma, vibration_events_per_sec, disc_rpm
    # Verifying schema incompatibility
    hw_keys = set(HardwareTelemetryPacket.model_fields.keys())
    legacy_keys = {"temperature", "current", "vibration", "speed", "door_closed"}
    overlap = hw_keys.intersection(legacy_keys)
    assert len(overlap) == 0, f"Hardware packet erroneously overlaps with legacy ML fields: {overlap}"


# ----------------------------------------------------------------------------
# 17. Simulation Data Does Not Overwrite Hardware Telemetry
# ----------------------------------------------------------------------------
def test_17_simulation_data_does_not_overwrite_hardware():
    bridge = ESP32SerialBridge()
    nonce = bridge.initiate_handshake(device_id="ESP32_RIG_01")
    bridge.process_line(json.dumps({
        "type": "SESSION_INIT", "device_id": "ESP32_RIG_01", "boot_id": "boot-test-17",
        "challenge_nonce": nonce, "raw_elapsed_ms": 1000
    }))

    p1 = json.dumps({
        "protocol_version": "2.0", "device_id": "ESP32_RIG_01", "boot_id": "boot-test-17",
        "firmware_version": "v2.0", "packet_id": 1, "elapsed_ms": 1200,
        "water_temp_c": 23.8, "led_current_ma": 17.5, "vibration_events_per_sec": 1.2,
        "disc_rpm": 380.0, "operating_state": "RUNNING"
    })
    bridge.process_line(p1)

    # Insert simulated row into sensor_readings
    db.save_sensor_reading(
        temperature=45.0, current=3.5, vibration=1.8, speed=1.2,
        door_closed=True, floor=3, direction="up", source="simulated"
    )

    # Verify hardware table only has the hardware reading
    conn = sqlite3.connect(str(INTEG_DB_PATH))
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM hardware_sensor_readings;")
    hw_count = cur.fetchone()
    assert hw_count is not None and hw_count[0] == 1

    cur.execute("SELECT COUNT(*) FROM sensor_readings;")
    sim_count = cur.fetchone()
    assert sim_count is not None and sim_count[0] == 1
    conn.close()


# ----------------------------------------------------------------------------
# 18. Legacy Telemetry Compatibility Endpoint (/api/v1/telemetry)
# ----------------------------------------------------------------------------
def test_18_legacy_telemetry_compatibility():
    """
    Ensure processor.process_telemetry() and get_latest_payload() execute cleanly
    without raising AttributeError on serial_bridge or throwing HTTP 500.
    """
    from sensor_processor import processor  # type: ignore
    payload = processor.process_telemetry()
    assert payload is not None
    assert payload.telemetry.temperature > 0
    assert payload.status in ["normal", "warning", "critical"]
    assert payload.anomaly is not None
    assert payload.fault_prediction is not None


# ----------------------------------------------------------------------------
# 19. Protocol Result Integrity & Defensive Optional-Dict Handling
# ----------------------------------------------------------------------------
def test_19_malformed_protocol_results_do_not_crash():
    """
    Ensure serial bridge handles edge cases where protocol returns ACCEPTED or
    SEQUENCE_GAP_DISCONTINUITY with None or incomplete records without crashing.
    """
    bridge = ESP32SerialBridge()
    nonce = bridge.initiate_handshake(device_id="ESP32_RIG_01")
    bridge.process_line(json.dumps({
        "type": "SESSION_INIT", "device_id": "ESP32_RIG_01", "boot_id": "boot-test-19",
        "challenge_nonce": nonce, "raw_elapsed_ms": 1000
    }))

    # Mock functions with strict signatures to test error paths without type suppression
    def mock_validate_accepted_none(
        state: DeviceSessionState,
        raw_json_str: str,
        receipt_time: float
    ) -> Tuple[str, Optional[Dict[str, Any]]]:
        return ("ACCEPTED", None)

    def mock_validate_incomplete_record(
        state: DeviceSessionState,
        raw_json_str: str,
        receipt_time: float
    ) -> Tuple[str, Optional[Dict[str, Any]]]:
        return ("ACCEPTED", {"packet_id": 1})

    def mock_validate_gap_none(
        state: DeviceSessionState,
        raw_json_str: str,
        receipt_time: float
    ) -> Tuple[str, Optional[Dict[str, Any]]]:
        return ("SEQUENCE_GAP_DISCONTINUITY", None)

    def mock_validate_gap_missing_keys(
        state: DeviceSessionState,
        raw_json_str: str,
        receipt_time: float
    ) -> Tuple[str, Optional[Dict[str, Any]]]:
        return ("SEQUENCE_GAP_DISCONTINUITY", {"expected": 2})

    # Test 19.1: Mock validate_and_process_packet returning ACCEPTED with None result
    original_validate = bridge.protocol_engine.validate_and_process_packet
    try:
        bridge.protocol_engine.validate_and_process_packet = mock_validate_accepted_none
        status, res = bridge.process_line('{"test": 1}')
        assert status == "MALFORMED_RECORD"
        assert res is None
        assert bridge.last_diagnostic_status == "MALFORMED_RECORD"

        # Test 19.2: Incomplete record missing required keys
        bridge.protocol_engine.validate_and_process_packet = mock_validate_incomplete_record
        status, res = bridge.process_line('{"test": 2}')
        assert status == "INCOMPLETE_RECORD"
        assert res is None
        assert bridge.last_diagnostic_status == "INCOMPLETE_RECORD"

        # Test 19.3: SEQUENCE_GAP_DISCONTINUITY with None result
        bridge.protocol_engine.validate_and_process_packet = mock_validate_gap_none
        status, res = bridge.process_line('{"test": 3}')
        assert status == "SEQUENCE_GAP_DISCONTINUITY"
        assert res is None
        assert bridge.last_diagnostic_status == "MALFORMED_GAP_PAYLOAD"
        assert bridge.active_state is not None
        session_state_19_3 = bridge.active_state
        assert session_state_19_3.status == "CORRUPT_DESYNC"

        # Restore active state for subtest 19.4
        session_state_19_3.status = "ACTIVE"

        # Test 19.4: SEQUENCE_GAP_DISCONTINUITY with missing gap keys
        bridge.protocol_engine.validate_and_process_packet = mock_validate_gap_missing_keys
        status, res = bridge.process_line('{"test": 4}')
        assert status == "SEQUENCE_GAP_DISCONTINUITY"
        assert res is None
        assert bridge.last_diagnostic_status == "MALFORMED_GAP_PAYLOAD"
        assert bridge.active_state is not None
        session_state_19_4 = bridge.active_state
        assert session_state_19_4.status == "CORRUPT_DESYNC"

    finally:
        bridge.protocol_engine.validate_and_process_packet = original_validate


if __name__ == "__main__":
    import pytest
    sys.exit(pytest.main([__file__, "-v"]))
