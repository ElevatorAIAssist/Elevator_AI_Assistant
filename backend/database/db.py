"""
SQLite Database Layer for Elevator FDIR Telemetry, Predictions, and Alerts.
"""

import sqlite3
import json
import os
import time
from pathlib import Path
from typing import List, Dict, Any, Optional

DB_DIR = Path(__file__).parent
DB_PATH = Path(os.environ.get("ELEVATOR_DB_PATH", str(DB_DIR / "elevator.db")))


def set_db_path(custom_path: Path):
    """Override database path for test isolation."""
    global DB_PATH
    DB_PATH = Path(custom_path)


def get_db_path() -> Path:
    return DB_PATH


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create database tables automatically if they do not exist."""
    DB_DIR.mkdir(parents=True, exist_ok=True)
    with get_db_connection() as conn:
        cursor = conn.cursor()

        # 1. Telemetry / Sensor Readings
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sensor_readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp REAL NOT NULL,
                temperature REAL NOT NULL,
                current REAL NOT NULL,
                vibration REAL NOT NULL,
                speed REAL NOT NULL,
                door_closed INTEGER NOT NULL,
                floor INTEGER NOT NULL,
                direction TEXT NOT NULL,
                source TEXT DEFAULT 'simulated',
                raw_packet TEXT
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sensor_time ON sensor_readings(timestamp)")

        # 2. Machine Learning Predictions
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS fault_predictions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp REAL NOT NULL,
                is_anomaly INTEGER NOT NULL,
                anomaly_score REAL NOT NULL,
                predicted_fault TEXT NOT NULL,
                confidence REAL NOT NULL,
                probabilities TEXT,
                details TEXT
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_pred_time ON fault_predictions(timestamp)")

        # 3. Alert History
        cursor.execute("""
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
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_alert_time ON alerts(timestamp)")

        # 4. Device Boot Session Registry (Phase 2B)
        cursor.execute("""
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
            )
        """)
        cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_device_generation ON device_boot_sessions(device_id, generation_id)")

        # 5. Dedicated Hardware Sensor Readings (Phase 2B)
        cursor.execute("""
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
            )
        """)
        cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_hw_device_packet ON hardware_sensor_readings(device_id, boot_id, packet_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_hw_timestamp ON hardware_sensor_readings(timestamp)")

        conn.commit()


def save_sensor_reading(
    temperature: float,
    current: float,
    vibration: float,
    speed: float,
    door_closed: bool,
    floor: int,
    direction: str,
    source: str = "simulated",
    raw_packet: Optional[Dict[str, Any]] = None,
    timestamp: Optional[float] = None,
) -> int:
    ts = timestamp if timestamp is not None else time.time()
    packet_json = json.dumps(raw_packet) if raw_packet else None

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO sensor_readings (
                timestamp, temperature, current, vibration, speed,
                door_closed, floor, direction, source, raw_packet
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            ts, temperature, current, vibration, speed,
            1 if door_closed else 0, floor, direction, source, packet_json
        ))
        conn.commit()
        return cursor.lastrowid


def save_fault_prediction(
    is_anomaly: bool,
    anomaly_score: float,
    predicted_fault: str,
    confidence: float,
    probabilities: Optional[Dict[str, float]] = None,
    details: Optional[Dict[str, Any]] = None,
    timestamp: Optional[float] = None,
) -> int:
    ts = timestamp if timestamp is not None else time.time()
    probs_json = json.dumps(probabilities) if probabilities else "{}"
    details_json = json.dumps(details) if details else "{}"

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO fault_predictions (
                timestamp, is_anomaly, anomaly_score, predicted_fault,
                confidence, probabilities, details
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            ts, 1 if is_anomaly else 0, anomaly_score, predicted_fault,
            confidence, probs_json, details_json
        ))
        conn.commit()
        return cursor.lastrowid


def save_alert(alert: Dict[str, Any]) -> str:
    alert_id = alert.get("id", f"ALT-{int(time.time()*1000)}")
    ts = alert.get("timestamp", time.time())
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO alerts (
                id, timestamp, fault_code, fault_name, severity,
                sensor_name, sensor_value, description, acknowledged
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            alert_id,
            ts,
            alert.get("faultCode", "UNKNOWN"),
            alert.get("faultName", "Unknown Anomaly"),
            alert.get("severity", "warning"),
            alert.get("sensorName", ""),
            str(alert.get("sensorValue", "")),
            alert.get("description", ""),
            1 if alert.get("acknowledged", False) else 0
        ))
        conn.commit()
        return alert_id


def get_latest_reading() -> Optional[Dict[str, Any]]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM sensor_readings ORDER BY timestamp DESC, id DESC LIMIT 1")
        row = cursor.fetchone()
        if not row:
            return None
        return dict(row)


def get_telemetry_history(limit: int = 50) -> List[Dict[str, Any]]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM sensor_readings ORDER BY timestamp DESC, id DESC LIMIT ?",
            (limit,)
        )
        rows = cursor.fetchall()
        # Return in chronological order
        return [dict(r) for r in reversed(rows)]


def get_alerts(limit: int = 50) -> List[Dict[str, Any]]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM alerts ORDER BY timestamp DESC LIMIT ?",
            (limit,)
        )
        rows = cursor.fetchall()
        return [
            {
                "id": r["id"],
                "timestamp": r["timestamp"],
                "faultCode": r["fault_code"],
                "faultName": r["fault_name"],
                "severity": r["severity"],
                "sensorName": r["sensor_name"],
                "sensorValue": r["sensor_value"],
                "description": r["description"],
                "acknowledged": bool(r["acknowledged"])
            }
            for r in rows
        ]


def acknowledge_alert(alert_id: str) -> bool:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE alerts SET acknowledged = 1 WHERE id = ?", (alert_id,))
        conn.commit()
        return cursor.rowcount > 0


def clear_alerts():
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM alerts")
        conn.commit()


# ============================================================================
# Hardware Demonstration Rig Telemetry Queries (Phase 2B)
# ============================================================================

def get_latest_hardware_reading() -> Optional[Dict[str, Any]]:
    """Retrieve the single latest accepted physical rig telemetry reading."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM hardware_sensor_readings ORDER BY timestamp DESC, id DESC LIMIT 1;"
        )
        row = cursor.fetchone()
        if not row:
            return None
        return dict(row)


def get_hardware_telemetry_history(limit: int = 50) -> List[Dict[str, Any]]:
    """Retrieve historical physical rig telemetry readings in chronological order."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM hardware_sensor_readings ORDER BY timestamp DESC, id DESC LIMIT ?;",
            (limit,)
        )
        rows = cursor.fetchall()
        return [dict(r) for r in reversed(rows)]


def save_hardware_sensor_reading(record: Dict[str, Any]) -> int:
    """Durably persist an accepted physical rig telemetry reading."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO hardware_sensor_readings (
                timestamp, device_id, boot_id, packet_id, rollover_epoch,
                raw_elapsed_ms, extended_elapsed_ms, server_receipt_timestamp,
                water_temp_c, led_current_ma, vibration_events_per_sec, disc_rpm,
                operating_state, diagnostic_status, raw_packet
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (
            record["timestamp"],
            record["device_id"],
            record["boot_id"],
            record["packet_id"],
            record["rollover_epoch"],
            record["raw_elapsed_ms"],
            record["extended_elapsed_ms"],
            record["server_receipt_timestamp"],
            record["water_temp_c"],
            record["led_current_ma"],
            record["vibration_events_per_sec"],
            record["disc_rpm"],
            record["operating_state"],
            record.get("diagnostic_status", "NORMAL"),
            record.get("raw_packet", "{}")
        ))
        conn.commit()
        return cursor.lastrowid


# Auto-initialize on import
init_db()

