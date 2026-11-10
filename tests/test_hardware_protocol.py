"""
Unit tests for Phase 2B Hardware Communication Protocol Engine.
Executes against a separate, isolated test database: backend/database/test_phase2b.db
"""

import os
import sys
import time
import json
import sqlite3
import pytest
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from hardware.protocol import (
    HardwareTelemetryPacket,
    ChallengeNonceRegistry,
    DeviceSessionState,
    HardwareProtocolEngine
)

TEST_DB_PATH = Path(__file__).resolve().parent.parent / "backend" / "database" / "test_phase2b.db"


@pytest.fixture(autouse=True)
def setup_isolated_test_db():
    """Initializes schema in separate temporary test database before each test."""
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()

    conn = sqlite3.connect(str(TEST_DB_PATH))
    cur = conn.cursor()

    # 1. Device boot session registry (matches Phase 2A schema)
    cur.execute("""
        CREATE TABLE device_boot_sessions (
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
    cur.execute("CREATE UNIQUE INDEX idx_device_generation ON device_boot_sessions(device_id, generation_id);")
    cur.execute("CREATE UNIQUE INDEX idx_device_single_active ON device_boot_sessions(device_id) WHERE status = 'ACTIVE';")

    # 2. Alerts table (matches Phase 2A schema)
    cur.execute("""
        CREATE TABLE alerts (
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

    # 3. Dedicated hardware_sensor_readings table (Phase 2B recommended design)
    cur.execute("""
        CREATE TABLE hardware_sensor_readings (
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
    cur.execute("CREATE UNIQUE INDEX idx_hw_device_packet ON hardware_sensor_readings(device_id, boot_id, packet_id);")

    conn.commit()
    conn.close()

    yield

    # Teardown
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()


def get_test_db():
    return sqlite3.connect(str(TEST_DB_PATH), autocommit=True)


# ============================================================================
# 1. HANDSHAKE & SESSION LIFECYCLE TESTS
# ============================================================================

def test_handshake_fresh_boot_creates_active_session():
    engine = HardwareProtocolEngine()
    conn = get_test_db()
    
    device_id = "ESP32_RIG_01"
    boot_id = "boot-uuid-001"
    conn_gen = 1
    
    # 1. Create challenge
    nonce = engine.create_handshake_challenge(device_id, conn_gen)
    
    init_payload = {
        "device_id": device_id,
        "boot_id": boot_id,
        "challenge_nonce": nonce,
        "raw_elapsed_ms": 1500,
        "firmware_version": "v2.0.0-afdir"
    }
    
    receipt_time = 1793769000.0
    status, state = engine.handle_session_init(conn, init_payload, receipt_time, conn_gen)
    
    assert status == "SESSION_ACCEPTED"
    assert state is not None
    assert state.device_id == device_id
    assert state.boot_id == boot_id
    assert state.generation_id == 1
    assert state.high_water_mark == 0
    # t_anchor = 1793769000.0 - (1500 / 1000.0) = 1793768998.5
    assert state.t_anchor == 1793768998.5
    
    # Verify row in test DB
    cur = conn.cursor()
    cur.execute("SELECT generation_id, status, t_anchor FROM device_boot_sessions WHERE device_id = ? AND boot_id = ?;", (device_id, boot_id))
    row = cur.fetchone()
    assert row == (1, "ACTIVE", 1793768998.5)
    conn.close()


def test_handshake_replay_nonce_rejected():
    engine = HardwareProtocolEngine()
    conn = get_test_db()
    
    device_id = "ESP32_RIG_01"
    boot_id = "boot-uuid-001"
    conn_gen = 1
    
    nonce = engine.create_handshake_challenge(device_id, conn_gen)
    init_payload = {
        "device_id": device_id,
        "boot_id": boot_id,
        "challenge_nonce": nonce,
        "raw_elapsed_ms": 1500
    }
    
    # First consume succeeds
    status1, state1 = engine.handle_session_init(conn, init_payload, 1793769000.0, conn_gen)
    assert status1 == "SESSION_ACCEPTED"
    
    # Second consume with same nonce fails
    status2, state2 = engine.handle_session_init(conn, init_payload, 1793769001.0, conn_gen)
    assert status2 == "CHALLENGE_VERIFICATION_FAILED"
    assert state2 is None
    conn.close()


# ============================================================================
# 2. SAME-BOOT RECONNECTION & DUP ROW PREVENTION
# ============================================================================

def test_same_boot_reconnection_preserves_generation_and_zero_duplicate_rows():
    """
    Clarification 1:
    - Same boot_id reconnecting must NOT create a duplicate device_boot_sessions record.
    - Generation_id and t_anchor must be preserved.
    - HWM must be restored.
    """
    engine = HardwareProtocolEngine()
    conn = get_test_db()
    device_id = "ESP32_RIG_01"
    boot_id = "boot-uuid-002"
    
    # 1. Initial Handshake
    nonce1 = engine.create_handshake_challenge(device_id, 1)
    status1, state1 = engine.handle_session_init(
        conn, {"device_id": device_id, "boot_id": boot_id, "challenge_nonce": nonce1, "raw_elapsed_ms": 1000}, 1793769000.0, 1
    )
    assert status1 == "SESSION_ACCEPTED"
    assert state1.generation_id == 1
    
    # Ingest 2 packets (pid 1 and 2)
    p1 = {
        "protocol_version": "2.0", "device_id": device_id, "boot_id": boot_id, "firmware_version": "v2.0",
        "packet_id": 1, "elapsed_ms": 1100, "water_temp_c": 24.1, "led_current_ma": 18.0,
        "vibration_events_per_sec": 2.0, "disc_rpm": 400.0, "operating_state": "RUNNING"
    }
    _, rec1 = engine.validate_and_process_packet(state1, json.dumps(p1), 1793769000.1)
    engine.commit_packet_to_db(conn, state1, rec1)
    
    p2 = dict(p1, packet_id=2, elapsed_ms=1200)
    _, rec2 = engine.validate_and_process_packet(state1, json.dumps(p2), 1793769000.2)
    engine.commit_packet_to_db(conn, state1, rec2)
    assert state1.high_water_mark == 2
    
    # 2. USB Disconnect & Reconnect (Same boot_id, new connection generation 2)
    nonce2 = engine.create_handshake_challenge(device_id, 2)
    status2, state2 = engine.handle_session_init(
        conn, {"device_id": device_id, "boot_id": boot_id, "challenge_nonce": nonce2, "raw_elapsed_ms": 1300}, 1793769002.0, 2
    )
    
    # Must report SESSION_RECONNECTED
    assert status2 == "SESSION_RECONNECTED"
    assert state2.generation_id == 1  # Preserved
    assert state2.t_anchor == state1.t_anchor  # Preserved
    assert state2.high_water_mark == 2  # Restored from DB
    
    # Assert EXACTLY ONE row exists in device_boot_sessions
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM device_boot_sessions WHERE device_id = ? AND boot_id = ?;", (device_id, boot_id))
    assert cur.fetchone()[0] == 1
    
    # Next accepted packet MUST be pid 3 (HWM + 1)
    p3 = dict(p1, packet_id=3, elapsed_ms=1400)
    v_status, rec3 = engine.validate_and_process_packet(state2, json.dumps(p3), 1793769002.1)
    assert v_status == "ACCEPTED"
    engine.commit_packet_to_db(conn, state2, rec3)
    assert state2.high_water_mark == 3
    conn.close()


def test_same_boot_reconnect_timer_regression_rejected():
    """
    If ESP32 claims the same boot_id, but elapsed_ms regressed > 50ms,
    reconnect must be rejected.
    """
    engine = HardwareProtocolEngine()
    conn = get_test_db()
    device_id = "ESP32_RIG_01"
    boot_id = "boot-uuid-003"
    
    nonce1 = engine.create_handshake_challenge(device_id, 1)
    _, state1 = engine.handle_session_init(
        conn, {"device_id": device_id, "boot_id": boot_id, "challenge_nonce": nonce1, "raw_elapsed_ms": 50000}, 1793769000.0, 1
    )
    
    # Ingest packet at elapsed_ms 50500
    p1 = {
        "protocol_version": "2.0", "device_id": device_id, "boot_id": boot_id, "firmware_version": "v2.0",
        "packet_id": 1, "elapsed_ms": 50500, "water_temp_c": 24.1, "led_current_ma": 18.0,
        "vibration_events_per_sec": 2.0, "disc_rpm": 400.0, "operating_state": "RUNNING"
    }
    _, rec1 = engine.validate_and_process_packet(state1, json.dumps(p1), 1793769000.5)
    engine.commit_packet_to_db(conn, state1, rec1)
    
    # Reconnect claims elapsed_ms = 1000 (regressed by ~49.5s)
    nonce2 = engine.create_handshake_challenge(device_id, 2)
    status2, state2 = engine.handle_session_init(
        conn, {"device_id": device_id, "boot_id": boot_id, "challenge_nonce": nonce2, "raw_elapsed_ms": 1000}, 1793769002.0, 2
    )
    assert status2 == "RECONNECT_TIMER_REGRESSION"
    assert state2 is None
    conn.close()


# ============================================================================
# 3. SEQUENCE CONTIGUITY, DUPLICATES & GAPS
# ============================================================================

def test_duplicate_packet_rejected_with_zero_database_write():
    engine = HardwareProtocolEngine()
    conn = get_test_db()
    device_id = "ESP32_RIG_01"
    boot_id = "boot-uuid-004"
    
    nonce = engine.create_handshake_challenge(device_id, 1)
    _, state = engine.handle_session_init(
        conn, {"device_id": device_id, "boot_id": boot_id, "challenge_nonce": nonce, "raw_elapsed_ms": 1000}, 1793769000.0, 1
    )
    
    p1 = {
        "protocol_version": "2.0", "device_id": device_id, "boot_id": boot_id, "firmware_version": "v2.0",
        "packet_id": 1, "elapsed_ms": 1100, "water_temp_c": 24.1, "led_current_ma": 18.0,
        "vibration_events_per_sec": 2.0, "disc_rpm": 400.0, "operating_state": "RUNNING"
    }
    _, rec1 = engine.validate_and_process_packet(state, json.dumps(p1), 1793769000.1)
    engine.commit_packet_to_db(conn, state, rec1)
    assert state.high_water_mark == 1
    
    # Try re-submitting packet_id 1
    status_dup, rec_dup = engine.validate_and_process_packet(state, json.dumps(p1), 1793769000.2)
    assert status_dup == "DUPLICATE_PACKET"
    assert rec_dup is None
    
    # Database still has exactly 1 record
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM hardware_sensor_readings;")
    assert cur.fetchone()[0] == 1
    conn.close()


def test_sequence_gap_rejection_policy():
    """
    packet_id > HWM + 1 must be strictly rejected without volatile buffering.
    """
    engine = HardwareProtocolEngine()
    conn = get_test_db()
    device_id = "ESP32_RIG_01"
    boot_id = "boot-uuid-005"
    
    nonce = engine.create_handshake_challenge(device_id, 1)
    _, state = engine.handle_session_init(
        conn, {"device_id": device_id, "boot_id": boot_id, "challenge_nonce": nonce, "raw_elapsed_ms": 1000}, 1793769000.0, 1
    )
    
    # Packet 1 ingested
    p1 = {
        "protocol_version": "2.0", "device_id": device_id, "boot_id": boot_id, "firmware_version": "v2.0",
        "packet_id": 1, "elapsed_ms": 1100, "water_temp_c": 24.1, "led_current_ma": 18.0,
        "vibration_events_per_sec": 2.0, "disc_rpm": 400.0, "operating_state": "RUNNING"
    }
    _, rec1 = engine.validate_and_process_packet(state, json.dumps(p1), 1793769000.1)
    engine.commit_packet_to_db(conn, state, rec1)
    
    # Incoming packet_id = 4 (missing 2 and 3)
    p4 = dict(p1, packet_id=4, elapsed_ms=1400)
    status_gap, gap_info = engine.validate_and_process_packet(state, json.dumps(p4), 1793769000.4)
    
    assert status_gap == "SEQUENCE_GAP_DISCONTINUITY"
    assert gap_info["gap_size"] == 2
    assert gap_info["expected"] == 2
    assert gap_info["received"] == 4
    
    # High-water mark remains 1
    assert state.high_water_mark == 1
    conn.close()


# ============================================================================
# 4. TIMER JITTER, TCRT5000 DIAGNOSTICS & ROLLOVER
# ============================================================================

def test_timer_jitter_clamping_preserves_raw_and_non_decreasing_timestamps():
    """
    Clarification 2:
    - Raw timer must remain unmutated in database.
    - Extended timer is clamped to previous value.
    - Timestamps are non-decreasing.
    """
    engine = HardwareProtocolEngine()
    conn = get_test_db()
    device_id = "ESP32_RIG_01"
    boot_id = "boot-uuid-006"
    
    nonce = engine.create_handshake_challenge(device_id, 1)
    _, state = engine.handle_session_init(
        conn, {"device_id": device_id, "boot_id": boot_id, "challenge_nonce": nonce, "raw_elapsed_ms": 1000}, 1793769000.0, 1
    )
    
    # Packet 1 at 2000ms
    p1 = {
        "protocol_version": "2.0", "device_id": device_id, "boot_id": boot_id, "firmware_version": "v2.0",
        "packet_id": 1, "elapsed_ms": 2000, "water_temp_c": 24.1, "led_current_ma": 18.0,
        "vibration_events_per_sec": 2.0, "disc_rpm": 400.0, "operating_state": "RUNNING"
    }
    _, rec1 = engine.validate_and_process_packet(state, json.dumps(p1), 1793769002.0)
    engine.commit_packet_to_db(conn, state, rec1)
    
    # Packet 2 at 1980ms (backward step of -20ms within 50ms tolerance)
    p2 = dict(p1, packet_id=2, elapsed_ms=1980)
    status2, rec2 = engine.validate_and_process_packet(state, json.dumps(p2), 1793769002.1)
    
    assert status2 == "ACCEPTED"
    assert rec2["diagnostic_status"] == "TIMER_JITTER_CLAMPED"
    assert rec2["raw_elapsed_ms"] == 1980  # PRESERVED UNMUTATED
    assert rec2["extended_elapsed_ms"] == 2000  # CLAMPED TO PREVIOUS
    assert rec2["timestamp"] >= rec1["timestamp"]  # NON-DECREASING
    
    engine.commit_packet_to_db(conn, state, rec2)
    conn.close()


def test_tcrt5000_cautious_diagnostic_no_pulses_while_running():
    """
    Clarification 3:
    When operating_state == 'RUNNING' and disc_rpm == 0.0,
    report cautious status NO_PULSES_WHILE_RUNNING (do not claim confirmed stall).
    """
    engine = HardwareProtocolEngine()
    conn = get_test_db()
    device_id = "ESP32_RIG_01"
    boot_id = "boot-uuid-007"
    
    nonce = engine.create_handshake_challenge(device_id, 1)
    _, state = engine.handle_session_init(
        conn, {"device_id": device_id, "boot_id": boot_id, "challenge_nonce": nonce, "raw_elapsed_ms": 1000}, 1793769000.0, 1
    )
    
    p1 = {
        "protocol_version": "2.0", "device_id": device_id, "boot_id": boot_id, "firmware_version": "v2.0",
        "packet_id": 1, "elapsed_ms": 1100, "water_temp_c": 24.1, "led_current_ma": 18.0,
        "vibration_events_per_sec": 2.0, "disc_rpm": 0.0, "operating_state": "RUNNING"
    }
    status, rec = engine.validate_and_process_packet(state, json.dumps(p1), 1793769001.1)
    assert status == "ACCEPTED"
    assert rec["diagnostic_status"] == "NO_PULSES_WHILE_RUNNING"
    conn.close()


def test_genuine_32bit_rollover_advances_epoch():
    engine = HardwareProtocolEngine()
    conn = get_test_db()
    device_id = "ESP32_RIG_01"
    boot_id = "boot-uuid-008"
    
    nonce = engine.create_handshake_challenge(device_id, 1)
    _, state = engine.handle_session_init(
        conn, {"device_id": device_id, "boot_id": boot_id, "challenge_nonce": nonce, "raw_elapsed_ms": 4294900000}, 1793769000.0, 1
    )
    
    # Packet 1 at 4,294,950,000 ms (near 2^32 - 1)
    p1 = {
        "protocol_version": "2.0", "device_id": device_id, "boot_id": boot_id, "firmware_version": "v2.0",
        "packet_id": 1, "elapsed_ms": 4294950000, "water_temp_c": 24.1, "led_current_ma": 18.0,
        "vibration_events_per_sec": 2.0, "disc_rpm": 400.0, "operating_state": "RUNNING"
    }
    _, rec1 = engine.validate_and_process_packet(state, json.dumps(p1), 1793769000.1)
    engine.commit_packet_to_db(conn, state, rec1)
    assert state.current_epoch == 0
    
    # Packet 2 overflows to 250 ms
    p2 = dict(p1, packet_id=2, elapsed_ms=250)
    status2, rec2 = engine.validate_and_process_packet(state, json.dumps(p2), 1793769000.2)
    assert status2 == "ACCEPTED"
    assert rec2["rollover_epoch"] == 1
    # extended_ms = (1 * 2^32) + 250 = 4294967296 + 250 = 4294967546
    assert rec2["extended_elapsed_ms"] == 4294967546
    assert rec2["timestamp"] > rec1["timestamp"]
    
    engine.commit_packet_to_db(conn, state, rec2)
    assert state.current_epoch == 1
    conn.close()


def test_unannounced_reboot_detected_and_rejected():
    engine = HardwareProtocolEngine()
    conn = get_test_db()
    device_id = "ESP32_RIG_01"
    boot_id = "boot-uuid-009"
    
    nonce = engine.create_handshake_challenge(device_id, 1)
    _, state = engine.handle_session_init(
        conn, {"device_id": device_id, "boot_id": boot_id, "challenge_nonce": nonce, "raw_elapsed_ms": 1000}, 1793769000.0, 1
    )
    
    # Packet 1 at 120,000 ms (2 minutes uptime)
    p1 = {
        "protocol_version": "2.0", "device_id": device_id, "boot_id": boot_id, "firmware_version": "v2.0",
        "packet_id": 1, "elapsed_ms": 120000, "water_temp_c": 24.1, "led_current_ma": 18.0,
        "vibration_events_per_sec": 2.0, "disc_rpm": 400.0, "operating_state": "RUNNING"
    }
    _, rec1 = engine.validate_and_process_packet(state, json.dumps(p1), 1793769000.1)
    engine.commit_packet_to_db(conn, state, rec1)
    
    # Microcontroller resets to 500 ms without handshake
    p2 = dict(p1, packet_id=2, elapsed_ms=500)
    status2, rec2 = engine.validate_and_process_packet(state, json.dumps(p2), 1793769000.2)
    assert status2 == "UNANNOUNCED_RESET_WITHOUT_BOOT_ID"
    assert rec2 is None
    conn.close()


# ============================================================================
# 5. BACKEND RESTART RECOVERY FROM SAME RECORD
# ============================================================================

def test_backend_restart_recovery_from_same_record():
    """
    Clarification 4:
    - Restore HWM, extended_elapsed_ms, rollover_epoch, raw_elapsed_ms, and
      server_receipt_timestamp strictly from the SAME single latest record.
    """
    conn = get_test_db()
    device_id = "ESP32_RIG_01"
    boot_id = "boot-uuid-010"
    
    # Stage session row
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO device_boot_sessions (
            session_uuid, device_id, boot_id, generation_id, fw_version,
            status, t_anchor, initial_raw_elapsed_ms, created_at
        ) VALUES ('uuid-10', ?, ?, 1, 'v2.0', 'ACTIVE', 1793768000.0, 1000, 1793768001.0);
    """, (device_id, boot_id))
    
    # Stage 3 packets
    for pid in [1, 2, 3]:
        raw_ms = 1000 + (pid * 100)
        ext_ms = raw_ms
        receipt_ts = 1793768001.0 + pid
        calc_ts = 1793768000.0 + (ext_ms / 1000.0)
        cur.execute("""
            INSERT INTO hardware_sensor_readings (
                timestamp, device_id, boot_id, packet_id, rollover_epoch,
                raw_elapsed_ms, extended_elapsed_ms, server_receipt_timestamp,
                water_temp_c, led_current_ma, vibration_events_per_sec, disc_rpm,
                operating_state, diagnostic_status, raw_packet
            ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, 24.0, 18.0, 2.0, 400.0, 'RUNNING', 'NORMAL', '{}');
        """, (calc_ts, device_id, boot_id, pid, raw_ms, ext_ms, receipt_ts))
    conn.commit()
    
    # Simulate fresh backend start
    new_engine = HardwareProtocolEngine()
    restored_state = new_engine.restore_session_from_db(conn, device_id, boot_id)
    
    # All fields restored from record with packet_id = 3
    assert restored_state.high_water_mark == 3
    assert restored_state.last_accepted_raw_ms == 1300
    assert restored_state.last_accepted_extended_ms == 1300
    assert restored_state.current_epoch == 0
    assert restored_state.last_receipt_time == 1793768004.0
    assert 3 in restored_state.seen_packet_ids
    assert 2 in restored_state.seen_packet_ids
    assert 1 in restored_state.seen_packet_ids
    
    # Next valid packet MUST be 4
    p4 = {
        "protocol_version": "2.0", "device_id": device_id, "boot_id": boot_id, "firmware_version": "v2.0",
        "packet_id": 4, "elapsed_ms": 1400, "water_temp_c": 24.2, "led_current_ma": 18.1,
        "vibration_events_per_sec": 2.1, "disc_rpm": 405.0, "operating_state": "RUNNING"
    }
    status4, rec4 = new_engine.validate_and_process_packet(restored_state, json.dumps(p4), 1793768005.0)
    assert status4 == "ACCEPTED"
    assert rec4["packet_id"] == 4
    new_engine.commit_packet_to_db(conn, restored_state, rec4)
    assert restored_state.high_water_mark == 4
    conn.close()

