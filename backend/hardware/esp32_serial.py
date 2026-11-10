"""
ESP32 Hardware Bridge using PySerial with HardwareProtocolEngine Integration (Phase 2B).
Asynchronously reads newline-delimited JSON telemetry packets from connected USB/UART microcontrollers.
Enforces challenge-response session handshakes, strict sequence contiguity, 
timer rollover tracking, jitter clamping, and database-first persistence.
"""

import json
import threading
import time
import secrets
import sys
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple

# Intra-package relative import: protocol.py is in the same hardware package
from .protocol import (
    HardwareTelemetryPacket,
    ChallengeNonceRegistry,
    DeviceSessionState,
    HardwareProtocolEngine
)

# Inter-package import: supports both package root and --app-dir execution
try:
    from ..database import db
except (ImportError, ValueError):
    import database.db as db

# Ensure module singleton consistency across sys.modules
if "database.db" in sys.modules and "backend.database.db" not in sys.modules:
    sys.modules["backend.database.db"] = sys.modules["database.db"]
elif "backend.database.db" in sys.modules and "database.db" not in sys.modules:
    sys.modules["database.db"] = sys.modules["backend.database.db"]

try:
    import serial
    import serial.tools.list_ports
    SERIAL_AVAILABLE = True
except ImportError:
    SERIAL_AVAILABLE = False


class ESP32SerialBridge:
    connected: bool = False

    def __init__(self, port: Optional[str] = None, baud_rate: int = 115200, timeout: float = 1.0):
        self.configured_port = port
        self.baud_rate = baud_rate
        self.timeout = timeout
        self.serial_handle: Optional[Any] = None
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()

        # Protocol Engine
        self.protocol_engine = HardwareProtocolEngine()
        self.connection_generation = 0
        self.active_state: Optional[DeviceSessionState] = None

        # State & Diagnostics
        self.connected: bool = False
        self.last_packet: Optional[Any] = None
        self.last_packet_raw: Optional[Dict[str, Any]] = None
        self.last_hardware_record: Optional[Dict[str, Any]] = None
        self.last_packet_time: Optional[float] = None
        self.last_error: Optional[str] = "Hardware bridge awaiting device connection"
        self.last_diagnostic_status: str = "STANDBY"
        self.packet_count = 0
        self.duplicate_count = 0
        self.gap_count = 0
        self._cached_ports: List[str] = []
        self._rx_buffer = ""

    def list_available_ports(self) -> List[str]:
        if not SERIAL_AVAILABLE:
            return []
        try:
            ports = [p.device for p in serial.tools.list_ports.comports()]
            self._cached_ports = ports
            return ports
        except Exception:
            return []

    def start(self):
        """Starts background reader thread."""
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._worker_loop, daemon=True, name="ESP32-Serial-Worker")
        self._thread.start()

    def stop(self):
        """Stops background reader thread."""
        self._stop_event.set()
        if self.serial_handle and hasattr(self.serial_handle, "is_open") and self.serial_handle.is_open:
            try:
                self.serial_handle.close()
            except Exception:
                pass
        self.connected = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1.0)

    def _find_target_port(self) -> Optional[str]:
        if self.configured_port:
            return self.configured_port
        ports = self.list_available_ports()
        for p in ports:
            if "USB" in p.upper() or "UART" in p.upper() or "COM" in p.upper():
                return p
        return ports[0] if ports else None

    def _send_serial_frame(self, data: dict) -> None:
        """Sends single newline-terminated JSON message over active serial port."""
        if self.serial_handle and hasattr(self.serial_handle, "is_open") and self.serial_handle.is_open:
            try:
                payload_str = json.dumps(data) + "\n"
                self.serial_handle.write(payload_str.encode("utf-8"))
                self.serial_handle.flush()
            except Exception as e:
                print(f"[ESP32Serial] Error transmitting frame: {e}")

    def initiate_handshake(self, device_id: str = "ESP32_RIG_01") -> str:
        """Generates fresh challenge nonce and transmits SESSION_CHALLENGE to device."""
        self.connection_generation += 1
        nonce = self.protocol_engine.create_handshake_challenge(device_id, self.connection_generation)
        challenge_msg = {
            "type": "SESSION_CHALLENGE",
            "device_id": device_id,
            "challenge_nonce": nonce,
            "connection_generation": self.connection_generation,
            "timestamp": time.time()
        }
        self._send_serial_frame(challenge_msg)
        with self._lock:
            self.last_diagnostic_status = "CHALLENGE_ISSUED"
        return nonce

    def process_line(self, line: str, receipt_time: Optional[float] = None) -> Tuple[str, Optional[Dict[str, Any]]]:
        """
        Parses and handles a single newline-delimited message string.
        Invoked both by serial worker loop and direct test harnesses.
        """
        now = receipt_time if receipt_time is not None else time.time()
        line = line.strip()
        if not line or not (line.startswith("{") and line.endswith("}")):
            return ("MALFORMED_LINE", None)

        try:
            payload = json.loads(line)
        except Exception as e:
            with self._lock:
                self.last_error = f"JSON decode error: {e}"
            return ("JSON_DECODE_ERROR", None)

        if not isinstance(payload, dict):
            with self._lock:
                self.last_error = "Malformed payload: Root JSON element must be an object"
            return ("MALFORMED_JSON_PAYLOAD", None)

        msg_type = payload.get("type")

        # --------------------------------------------------------------------
        # 1. Handshake Message Handling: SESSION_INIT
        # --------------------------------------------------------------------
        if msg_type == "SESSION_INIT":
            conn = db.get_db_connection()
            try:
                status, state = self.protocol_engine.handle_session_init(
                    conn, payload, now, self.connection_generation
                )
            finally:
                conn.close()

            with self._lock:
                if status == "SESSION_ACCEPTED" and state is not None:
                    self.active_state = state
                    self.last_diagnostic_status = "SESSION_ACTIVE"
                    self.last_error = None
                    self._send_serial_frame({
                        "type": "SESSION_ACCEPTED",
                        "device_id": state.device_id,
                        "boot_id": state.boot_id,
                        "generation_id": state.generation_id,
                        "t_anchor": state.t_anchor
                    })
                elif status == "SESSION_RECONNECTED" and state is not None:
                    self.active_state = state
                    self.last_diagnostic_status = "SESSION_RECONNECTED"
                    self.last_error = None
                    self._send_serial_frame({
                        "type": "SESSION_RECONNECTED",
                        "device_id": state.device_id,
                        "boot_id": state.boot_id,
                        "generation_id": state.generation_id,
                        "hwm": state.high_water_mark
                    })
                else:
                    self.last_diagnostic_status = "HANDSHAKE_REJECTED"
                    self.last_error = f"Handshake failed: {status}"
                    self._send_serial_frame({
                        "type": "SESSION_REJECTED",
                        "reason": status
                    })
            return (status, {"state": state} if state is not None else None)

        # --------------------------------------------------------------------
        # 2. Telemetry Packet Handling
        # --------------------------------------------------------------------
        with self._lock:
            state = self.active_state

        if state is None or state.status != "ACTIVE":
            with self._lock:
                self.last_error = "Telemetry rejected: No ACTIVE registered session"
                self.last_diagnostic_status = "UNREGISTERED_BOOT_SESSION"
            # Demand session initialization
            self.initiate_handshake()
            return ("UNREGISTERED_BOOT_SESSION", None)

        # Validate packet against sequence and timer progression
        status, result = self.protocol_engine.validate_and_process_packet(state, line, now)

        if status == "ACCEPTED":
            # Explicitly verify that result is not None and is a valid dictionary
            if result is None:
                with self._lock:
                    self.last_error = "Protocol error: Telemetry packet marked ACCEPTED with None record"
                    self.last_diagnostic_status = "MALFORMED_RECORD"
                return ("MALFORMED_RECORD", None)

            # Verify that the prepared record contains all required fields
            required_record_fields = (
                "timestamp", "device_id", "boot_id", "packet_id", "rollover_epoch",
                "raw_elapsed_ms", "extended_elapsed_ms", "server_receipt_timestamp",
                "water_temp_c", "led_current_ma", "vibration_events_per_sec", "disc_rpm",
                "operating_state", "diagnostic_status", "raw_packet"
            )
            if not isinstance(result, dict) or not all(k in result for k in required_record_fields):
                with self._lock:
                    self.last_error = "Protocol error: Incomplete telemetry record missing required fields"
                    self.last_diagnostic_status = "INCOMPLETE_RECORD"
                return ("INCOMPLETE_RECORD", None)

            conn = db.get_db_connection()
            try:
                self.protocol_engine.commit_packet_to_db(conn, state, result)
            finally:
                conn.close()

            with self._lock:
                self.last_hardware_record = result
                self.last_packet_time = now
                self.packet_count += 1
                self.last_error = None
                self.last_diagnostic_status = result.get("diagnostic_status", "NORMAL")

            return ("ACCEPTED", result)

        elif status == "DUPLICATE_PACKET":
            with self._lock:
                self.duplicate_count += 1
            return ("DUPLICATE_PACKET", None)

        elif status == "SEQUENCE_GAP_DISCONTINUITY":
            with self._lock:
                self.gap_count += 1

            # Validate that sequence-gap result exists, is a dictionary, and contains required keys
            if result is None or not isinstance(result, dict):
                with self._lock:
                    self.last_error = "Internal protocol error: Missing sequence gap result payload"
                    self.last_diagnostic_status = "MALFORMED_GAP_PAYLOAD"
                    if state is not None:
                        state.status = "CORRUPT_DESYNC"
                return ("SEQUENCE_GAP_DISCONTINUITY", None)

            required_gap_keys = ("expected", "received", "gap_size")
            if not all(k in result for k in required_gap_keys):
                with self._lock:
                    self.last_error = "Internal protocol error: Sequence gap payload missing required fields"
                    self.last_diagnostic_status = "MALFORMED_GAP_PAYLOAD"
                    if state is not None:
                        state.status = "CORRUPT_DESYNC"
                return ("SEQUENCE_GAP_DISCONTINUITY", None)

            expected_pkt = result["expected"]
            received_pkt = result["received"]
            gap_size = result["gap_size"]

            with self._lock:
                self.last_error = f"Sequence gap discontinuity: expected {expected_pkt}, got {received_pkt}"
                self.last_diagnostic_status = "SEQUENCE_GAP_DISCONTINUITY"
                if state is not None:
                    state.status = "CORRUPT_DESYNC"

            # Formally commit alert to database
            conn = db.get_db_connection()
            try:
                cur = conn.cursor()
                alert_id = f"ALT-GAP-{int(now * 1000)}"
                cur.execute("""
                    INSERT INTO alerts (
                        id, timestamp, fault_code, fault_name, severity,
                        sensor_name, sensor_value, description, acknowledged
                    ) VALUES (?, ?, 'SEQUENCE_GAP_DISCONTINUITY', 'Telemetry Gap Encountered', 'CRITICAL', 'telemetry_pipeline', ?, ?, 0);
                """, (alert_id, now, str(gap_size), f"Expected packet {expected_pkt}, received {received_pkt}"))
                conn.commit()
            finally:
                conn.close()

            # Demand resync over serial
            self._send_serial_frame({
                "type": "RESYNC_REQUIRED",
                "expected": expected_pkt,
                "received": received_pkt
            })
            return ("SEQUENCE_GAP_DISCONTINUITY", result)

        elif status == "UNANNOUNCED_RESET_WITHOUT_BOOT_ID":
            with self._lock:
                self.last_error = "Unannounced microcontroller reset without fresh boot_id"
                self.last_diagnostic_status = "CORRUPT_DESYNC"
                if state is not None:
                    state.status = "CORRUPT_DESYNC"

            conn = db.get_db_connection()
            try:
                cur = conn.cursor()
                alert_id = f"ALT-RESET-{int(now * 1000)}"
                cur.execute("""
                    INSERT INTO alerts (
                        id, timestamp, fault_code, fault_name, severity,
                        sensor_name, sensor_value, description, acknowledged
                    ) VALUES (?, ?, 'UNANNOUNCED_RESET_WITHOUT_BOOT_ID', 'Hardware Reset Without Handshake', 'CRITICAL', 'hardware_timer', '0', 'Elapsed timer regressed near 0 from long runtime', 0);
                """, (alert_id, now))
                conn.commit()
            finally:
                conn.close()

            device_id = state.device_id if state is not None else "ESP32_RIG_01"
            self.initiate_handshake(device_id=device_id)
            return ("UNANNOUNCED_RESET_WITHOUT_BOOT_ID", None)

        else:
            with self._lock:
                self.last_error = f"Packet rejected: {status}"
            return (status, None)

    def _worker_loop(self):
        """Dedicated background reader loop with line buffering and auto-reconnection."""
        while not self._stop_event.is_set():
            if not SERIAL_AVAILABLE:
                with self._lock:
                    self.connected = False
                    self.last_error = "PySerial library is not available in environment."
                self._stop_event.wait(5.0)
                continue

            target_port = self._find_target_port()
            if not target_port:
                with self._lock:
                    self.connected = False
                    self.last_error = "No serial COM ports detected on host machine."
                self._stop_event.wait(3.0)
                continue

            try:
                self.serial_handle = serial.Serial(
                    port=target_port,
                    baudrate=self.baud_rate,
                    bytesize=serial.EIGHTBITS,
                    parity=serial.PARITY_NONE,
                    stopbits=serial.STOPBITS_ONE,
                    timeout=self.timeout
                )
                with self._lock:
                    self.connected = True
                    self.last_error = None
                print(f"[ESP32Serial] Connected to {target_port} at {self.baud_rate} baud (8-N-1).")

                # Line opened: issue challenge handshake
                self.initiate_handshake()

                self._rx_buffer = ""
                while not self._stop_event.is_set() and self.serial_handle.is_open:
                    chunk = self.serial_handle.read(256).decode("utf-8", errors="ignore")
                    if not chunk:
                        continue

                    self._rx_buffer += chunk
                    while "\n" in self._rx_buffer:
                        line, self._rx_buffer = self._rx_buffer.split("\n", 1)
                        line = line.strip()
                        if line:
                            self.process_line(line)

            except Exception as e:
                with self._lock:
                    self.connected = False
                    self.last_error = f"Serial port {target_port} error: {e}"
                if self.serial_handle:
                    try:
                        self.serial_handle.close()
                    except Exception:
                        pass
                self._stop_event.wait(3.0)

    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            state = self.active_state
            active_device_id: Optional[str] = None
            active_boot_id: Optional[str] = None
            generation_id: Optional[int] = None
            high_water_mark: Optional[int] = None
            current_epoch: Optional[int] = None

            if state is not None:
                active_device_id = state.device_id
                active_boot_id = state.boot_id
                generation_id = state.generation_id
                high_water_mark = state.high_water_mark
                current_epoch = state.current_epoch

            return {
                "connected": self.connected,
                "port": self.configured_port or "auto-detect",
                "baud_rate": self.baud_rate,
                "packet_count": self.packet_count,
                "duplicate_count": self.duplicate_count,
                "gap_count": self.gap_count,
                "last_packet_time": self.last_packet_time,
                "active_device_id": active_device_id,
                "active_boot_id": active_boot_id,
                "generation_id": generation_id,
                "high_water_mark": high_water_mark,
                "current_epoch": current_epoch,
                "last_diagnostic_status": self.last_diagnostic_status,
                "last_error": self.last_error,
                "available_ports": self._cached_ports
            }

    def get_latest_hardware_record(self) -> Optional[Dict[str, Any]]:
        with self._lock:
            if self.last_hardware_record and self.last_packet_time and (time.time() - self.last_packet_time < 5.0):
                return self.last_hardware_record
        return db.get_latest_hardware_reading()

    def get_fresh_hardware_record(self, max_age_seconds: float = 5.0) -> Optional[Dict[str, Any]]:
        """Return the latest hardware record ONLY if connected and packet arrived within max_age_seconds."""
        with self._lock:
            if self.connected and self.last_hardware_record and self.last_packet_time:
                if (time.time() - self.last_packet_time) <= max_age_seconds:
                    return self.last_hardware_record
        return None

    def get_latest_packet(self) -> Optional[Any]:
        """Backward-compatibility accessor for legacy elevator simulation pipeline."""
        with self._lock:
            if self.last_packet and self.last_packet_time and (time.time() - self.last_packet_time < 5.0):
                return self.last_packet
        return None


# Global singleton instance
serial_bridge = ESP32SerialBridge()
