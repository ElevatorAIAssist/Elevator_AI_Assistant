"""
Phase 2B Protocol Engine & Session Lifecycle Manager.
Implements versioned packet validation, bounded challenge-response handshakes,
strict sequence gap rejection, timer expansion with jitter clamping,
and backend restart recovery for the physical cardboard demonstration rig.
"""

import time
import secrets
import threading
import sqlite3
import json
from typing import Optional, Dict, Any, Tuple, Set
from dataclasses import dataclass, field
from pydantic import BaseModel, Field, field_validator


# ============================================================================
# 1. VERSIONED HARDWARE TELEMETRY PACKET SCHEMA
# ============================================================================

class HardwareTelemetryPacket(BaseModel):
    """
    Strict schema for physical cardboard demonstration rig telemetry:
    - DS18B20: Water temperature in °C
    - INA219: LED circuit current in mA
    - SW-420: Frame vibration digital pulse events/sec
    - TCRT5000: Cardboard disc rotational speed in RPM (PPR=2)
    """
    protocol_version: str = Field(default="2.0", description="Protocol version identifier")
    device_id: str = Field(..., min_length=1, description="Unique hardware device identifier")
    boot_id: str = Field(..., min_length=1, description="UUID v4 of current hardware boot session")
    firmware_version: str = Field(..., min_length=1, description="Firmware build version")
    packet_id: int = Field(..., ge=1, le=(1 << 63) - 1, description="Signed 63-bit monotonic sequence counter")
    elapsed_ms: int = Field(..., ge=0, le=(1 << 32) - 1, description="32-bit unsigned hardware millisecond counter")
    water_temp_c: float = Field(..., ge=-20.0, le=120.0, description="DS18B20 water temperature in °C")
    led_current_ma: float = Field(..., ge=0.0, le=500.0, description="INA219 LED circuit current in mA")
    vibration_events_per_sec: float = Field(..., ge=0.0, le=1000.0, description="SW-420 frame vibration digital pulse events/sec")
    disc_rpm: float = Field(..., ge=0.0, le=6000.0, description="TCRT5000 optical disc rotational speed in RPM (PPR=2)")
    operating_state: str = Field(default="IDLE", description="Rig state: IDLE, RUNNING, FAULT_INDUCED, COASTING")


# ============================================================================
# 2. BOUNDED NONCE REGISTRY (SESSION FRESHNESS)
# ============================================================================

@dataclass
class PendingChallenge:
    nonce: str
    device_id: str
    connection_generation: int
    created_at: float


class ChallengeNonceRegistry:
    """
    Capacity-bounded, thread-safe challenge nonce registry.
    Ensures connection freshness across USB disconnects and prevents replay.
    """
    def __init__(self, max_capacity: int = 1024, ttl_seconds: float = 30.0):
        self._max_capacity = max_capacity
        self._ttl = ttl_seconds
        self._lock = threading.Lock()
        self._pending: Dict[str, PendingChallenge] = {}
        self._consumed: Dict[str, float] = {}

    def _prune_locked(self, now: float) -> None:
        expired_pending = [k for k, v in self._pending.items() if now - v.created_at > self._ttl]
        for k in expired_pending:
            del self._pending[k]
        expired_consumed = [k for k, ts in self._consumed.items() if now - ts > 60.0]
        for k in expired_consumed:
            del self._consumed[k]

    def create_challenge(self, device_id: str, connection_gen: int) -> str:
        now = time.time()
        with self._lock:
            self._prune_locked(now)
            if len(self._pending) >= self._max_capacity:
                raise RuntimeError("CHALLENGE_CAPACITY_EXCEEDED: Server ingestion backpressure active")
            nonce = secrets.token_hex(16)
            self._pending[nonce] = PendingChallenge(nonce, device_id, connection_gen, now)
            return nonce

    def consume_challenge(self, nonce: str, device_id: str, connection_gen: int) -> bool:
        now = time.time()
        with self._lock:
            self._prune_locked(now)
            if nonce in self._consumed:
                return False  # Replay detected
            challenge = self._pending.get(nonce)
            if not challenge:
                return False  # Unknown or expired
            if challenge.device_id != device_id or challenge.connection_generation != connection_gen:
                return False  # Connection generation mismatch
            del self._pending[nonce]
            self._consumed[nonce] = now
            return True


# ============================================================================
# 3. IN-MEMORY DEVICE SESSION STATE
# ============================================================================

@dataclass
class DeviceSessionState:
    device_id: str
    boot_id: str
    generation_id: int
    t_anchor: float
    high_water_mark: int
    current_epoch: int
    last_accepted_raw_ms: int
    last_accepted_extended_ms: int
    last_receipt_time: float
    status: str = "ACTIVE"
    seen_packet_ids: Set[int] = field(default_factory=set)


# ============================================================================
# 4. HARDWARE PROTOCOL ENGINE
# ============================================================================

class HardwareProtocolEngine:
    """
    Implements pure packet validation, handshake resolution, timer rollover,
    and database-first persistence for physical demonstration rig telemetry.
    """
    def __init__(self, nonce_registry: Optional[ChallengeNonceRegistry] = None):
        self.nonce_registry = nonce_registry or ChallengeNonceRegistry()
        self._device_locks: Dict[str, threading.Lock] = {}
        self._sessions: Dict[str, DeviceSessionState] = {}
        self._global_lock = threading.Lock()

    def get_device_lock(self, device_id: str) -> threading.Lock:
        with self._global_lock:
            if device_id not in self._device_locks:
                self._device_locks[device_id] = threading.Lock()
            return self._device_locks[device_id]

    # ------------------------------------------------------------------------
    # Handshake & Session Management
    # ------------------------------------------------------------------------

    def create_handshake_challenge(self, device_id: str, connection_gen: int) -> str:
        return self.nonce_registry.create_challenge(device_id, connection_gen)

    def handle_session_init(
        self,
        conn: sqlite3.Connection,
        init_payload: Dict[str, Any],
        receipt_time: float,
        connection_gen: int
    ) -> Tuple[str, Optional[DeviceSessionState]]:
        """
        Processes SESSION_INIT frame.
        - Validates challenge nonce
        - Resolves same-boot reconnection vs. fresh boot session
        - Guarantees zero duplicate rows in device_boot_sessions for identical (device_id, boot_id)
        """
        if not init_payload or not isinstance(init_payload, dict):
            return ("INVALID_INIT_PAYLOAD", None)

        device_id = init_payload.get("device_id")
        boot_id = init_payload.get("boot_id")
        nonce = init_payload.get("challenge_nonce")
        raw_elapsed_ms = init_payload.get("raw_elapsed_ms", 0)
        fw_version = init_payload.get("firmware_version", "v2.0.0-afdir")

        if not device_id or not boot_id or not nonce:
            return ("INVALID_INIT_PAYLOAD", None)

        # 1. Nonce validation
        if not self.nonce_registry.consume_challenge(nonce, device_id, connection_gen):
            return ("CHALLENGE_VERIFICATION_FAILED", None)

        cur = conn.cursor()

        # 2. Check if this exact (device_id, boot_id) already exists
        cur.execute(
            "SELECT session_uuid, generation_id, status, t_anchor, initial_raw_elapsed_ms "
            "FROM device_boot_sessions WHERE device_id = ? AND boot_id = ?;",
            (device_id, boot_id)
        )
        existing_boot = cur.fetchone()

        if existing_boot:
            session_uuid, gen_id, status, t_anchor, init_raw = existing_boot

            if status != "ACTIVE":
                # Session was previously retired or closed due to outage/corruption
                return ("SESSION_PERMANENTLY_CLOSED", None)

            # Reconnection with same active boot session
            # Reconstruct latest state from the single latest telemetry record
            state = self.restore_session_from_db(conn, device_id, boot_id)

            # Timer validation across reconnect
            if raw_elapsed_ms < (state.last_accepted_raw_ms - 50):
                return ("RECONNECT_TIMER_REGRESSION", None)

            # Reconnect confirmed: preserve generation_id and t_anchor without inserting duplicate
            state.last_receipt_time = receipt_time
            self._sessions[device_id] = state
            return ("SESSION_RECONNECTED", state)

        # 3. Fresh Boot Session
        cur.execute("PRAGMA foreign_keys = OFF;")
        cur.execute("BEGIN IMMEDIATE;")
        try:
            # Retire any currently ACTIVE session for this device
            cur.execute(
                "UPDATE device_boot_sessions SET status = 'RETIRED', retired_at = ? "
                "WHERE device_id = ? AND status = 'ACTIVE';",
                (receipt_time, device_id)
            )

            # Calculate next monotonic generation_id
            cur.execute("SELECT COALESCE(MAX(generation_id), 0) + 1 FROM device_boot_sessions WHERE device_id = ?;", (device_id,))
            next_gen = cur.fetchone()[0]

            # Calculate t_anchor
            t_anchor = receipt_time - (raw_elapsed_ms / 1000.0)
            session_uuid = secrets.token_hex(16)

            # Insert new active session row
            cur.execute("""
                INSERT INTO device_boot_sessions (
                    session_uuid, device_id, boot_id, generation_id, fw_version,
                    status, t_anchor, initial_raw_elapsed_ms, created_at
                ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?);
            """, (session_uuid, device_id, boot_id, next_gen, fw_version, t_anchor, raw_elapsed_ms, receipt_time))

            cur.execute("COMMIT;")
        except Exception:
            cur.execute("ROLLBACK;")
            raise

        new_state = DeviceSessionState(
            device_id=device_id,
            boot_id=boot_id,
            generation_id=next_gen,
            t_anchor=t_anchor,
            high_water_mark=0,
            current_epoch=0,
            last_accepted_raw_ms=raw_elapsed_ms,
            last_accepted_extended_ms=raw_elapsed_ms,
            last_receipt_time=receipt_time,
            status="ACTIVE",
            seen_packet_ids=set()
        )
        self._sessions[device_id] = new_state
        return ("SESSION_ACCEPTED", new_state)

    def restore_session_from_db(self, conn: sqlite3.Connection, device_id: str, boot_id: str) -> DeviceSessionState:
        """
        Reconstructs session state strictly from the SINGLE latest accepted telemetry record
        (highest packet_id) to avoid disjoint MAX() discrepancies across timer fields.
        """
        cur = conn.cursor()
        cur.execute(
            "SELECT generation_id, t_anchor, initial_raw_elapsed_ms, created_at "
            "FROM device_boot_sessions WHERE device_id = ? AND boot_id = ? AND status = 'ACTIVE';",
            (device_id, boot_id)
        )
        sess_row = cur.fetchone()
        if not sess_row:
            raise ValueError(f"No ACTIVE session found for device={device_id}, boot={boot_id}")
        gen_id, t_anchor, init_raw, created_at = sess_row

        # Query latest single telemetry record
        cur.execute("""
            SELECT packet_id, raw_elapsed_ms, extended_elapsed_ms, rollover_epoch, server_receipt_timestamp
            FROM hardware_sensor_readings
            WHERE device_id = ? AND boot_id = ?
            ORDER BY packet_id DESC LIMIT 1;
        """, (device_id, boot_id))
        latest_record = cur.fetchone()

        if latest_record:
            hwm, last_raw, last_ext, epoch, last_recv = latest_record
        else:
            # Empty telemetry history
            hwm = 0
            last_raw = init_raw
            last_ext = init_raw
            epoch = 0
            last_recv = created_at

        # Populate sliding window with last 1000 IDs
        cur.execute("""
            SELECT packet_id FROM hardware_sensor_readings
            WHERE device_id = ? AND boot_id = ?
            ORDER BY packet_id DESC LIMIT 1000;
        """, (device_id, boot_id))
        seen_ids = {r[0] for r in cur.fetchall()}

        return DeviceSessionState(
            device_id=device_id,
            boot_id=boot_id,
            generation_id=gen_id,
            t_anchor=t_anchor,
            high_water_mark=hwm,
            current_epoch=epoch,
            last_accepted_raw_ms=last_raw,
            last_accepted_extended_ms=last_ext,
            last_receipt_time=last_recv,
            status="ACTIVE",
            seen_packet_ids=seen_ids
        )

    # ------------------------------------------------------------------------
    # Telemetry Packet Processing
    # ------------------------------------------------------------------------

    def validate_and_process_packet(
        self,
        state: DeviceSessionState,
        raw_json_str: str,
        receipt_time: float
    ) -> Tuple[str, Optional[Dict[str, Any]]]:
        """
        Evaluates a raw JSON telemetry frame:
        1. Parse and validate JSON schema
        2. Sequence contiguity (HWM + 1, duplicate, gap)
        3. Timer progression (outage, rollover, reboot, jitter clamping)
        4. Cautious optical sensor diagnostic status (NO_PULSES_WHILE_RUNNING)
        """
        # 1. JSON parse
        try:
            data = json.loads(raw_json_str)
            packet = HardwareTelemetryPacket(**data)
        except Exception as e:
            return ("MALFORMED_JSON_PAYLOAD", None)

        if packet.device_id != state.device_id or packet.boot_id != state.boot_id:
            return ("SESSION_MISMATCH", None)

        pid = packet.packet_id
        raw_ms = packet.elapsed_ms

        # 2. Sequence Validation
        if pid <= state.high_water_mark:
            return ("DUPLICATE_PACKET", None)

        if pid > state.high_water_mark + 1:
            # Strict gap rejection (zero volatile buffering)
            gap_size = pid - (state.high_water_mark + 1)
            return ("SEQUENCE_GAP_DISCONTINUITY", {
                "gap_size": gap_size,
                "expected": state.high_water_mark + 1,
                "received": pid
            })

        # 3. Timer Progression Rules
        # 3.1 Outage check (49.71 days in seconds)
        if receipt_time - state.last_receipt_time > 4294967.295:
            return ("OUTAGE_AMBIGUITY_EXCEEDED", None)

        W_ROLL = 100000  # 100 seconds
        rollover_epoch = state.current_epoch
        diagnostic_status = "NORMAL"

        # 3.2 Genuine 32-bit Rollover Check
        if (state.last_accepted_raw_ms >= ((1 << 32) - W_ROLL)) and (raw_ms <= W_ROLL):
            rollover_epoch = state.current_epoch + 1
            extended_ms = (rollover_epoch * (1 << 32)) + raw_ms
        # 3.3 Unannounced Reboot Check
        elif (state.last_accepted_raw_ms > 60000) and (raw_ms < 5000) and ((raw_ms - state.last_accepted_raw_ms) < -50):
            return ("UNANNOUNCED_RESET_WITHOUT_BOOT_ID", None)
        # 3.4 Timer Jitter Clamping (<= 50ms regression within epoch)
        elif -50 <= (raw_ms - state.last_accepted_raw_ms) < 0:
            extended_ms = state.last_accepted_extended_ms
            diagnostic_status = "TIMER_JITTER_CLAMPED"
        # 3.5 Monotonic Forward Advance
        elif (raw_ms - state.last_accepted_raw_ms) >= 0:
            extended_ms = (rollover_epoch * (1 << 32)) + raw_ms
        else:
            return ("INVALID_TIMER_EPOCH_COMBINATION", None)

        # 4. TCRT5000 Cautious Diagnostic Status
        # INA219 measures LED current, not motor drive current.
        # Report NO_PULSES_WHILE_RUNNING without falsely claiming confirmed mechanical failure.
        if packet.operating_state == "RUNNING" and packet.disc_rpm == 0.0:
            diagnostic_status = "NO_PULSES_WHILE_RUNNING"

        # Derived UTC measurement timestamp
        calc_timestamp = state.t_anchor + (extended_ms / 1000.0)

        prepared_record = {
            "timestamp": calc_timestamp,
            "device_id": state.device_id,
            "boot_id": state.boot_id,
            "packet_id": pid,
            "rollover_epoch": rollover_epoch,
            "raw_elapsed_ms": raw_ms,  # PRESERVED UNMUTATED
            "extended_elapsed_ms": extended_ms,
            "server_receipt_timestamp": receipt_time,
            "water_temp_c": packet.water_temp_c,
            "led_current_ma": packet.led_current_ma,
            "vibration_events_per_sec": packet.vibration_events_per_sec,
            "disc_rpm": packet.disc_rpm,
            "operating_state": packet.operating_state,
            "diagnostic_status": diagnostic_status,
            "raw_packet": raw_json_str
        }

        return ("ACCEPTED", prepared_record)

    def commit_packet_to_db(
        self,
        conn: sqlite3.Connection,
        state: DeviceSessionState,
        prepared_record: Dict[str, Any]
    ) -> None:
        """
        Database-First Commit:
        1. BEGIN IMMEDIATE -> INSERT -> COMMIT
        2. In-memory state updated ONLY on successful SQLite commit.
        """
        if not prepared_record or not isinstance(prepared_record, dict):
            raise ValueError("commit_packet_to_db called with None or non-dict prepared_record")

        cur = conn.cursor()
        cur.execute("PRAGMA foreign_keys = OFF;")
        cur.execute("BEGIN IMMEDIATE;")
        try:
            cur.execute("""
                INSERT INTO hardware_sensor_readings (
                    timestamp, device_id, boot_id, packet_id, rollover_epoch,
                    raw_elapsed_ms, extended_elapsed_ms, server_receipt_timestamp,
                    water_temp_c, led_current_ma, vibration_events_per_sec, disc_rpm,
                    operating_state, diagnostic_status, raw_packet
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (
                prepared_record["timestamp"],
                prepared_record["device_id"],
                prepared_record["boot_id"],
                prepared_record["packet_id"],
                prepared_record["rollover_epoch"],
                prepared_record["raw_elapsed_ms"],
                prepared_record["extended_elapsed_ms"],
                prepared_record["server_receipt_timestamp"],
                prepared_record["water_temp_c"],
                prepared_record["led_current_ma"],
                prepared_record["vibration_events_per_sec"],
                prepared_record["disc_rpm"],
                prepared_record["operating_state"],
                prepared_record["diagnostic_status"],
                prepared_record["raw_packet"]
            ))
            cur.execute("COMMIT;")
        except Exception:
            cur.execute("ROLLBACK;")
            raise

        # Post-commit memory update
        pid = prepared_record["packet_id"]
        state.high_water_mark = pid
        state.current_epoch = prepared_record["rollover_epoch"]
        state.last_accepted_raw_ms = prepared_record["raw_elapsed_ms"]
        state.last_accepted_extended_ms = prepared_record["extended_elapsed_ms"]
        state.last_receipt_time = prepared_record["server_receipt_timestamp"]
        state.seen_packet_ids.add(pid)
        if len(state.seen_packet_ids) > 1000:
            state.seen_packet_ids.remove(min(state.seen_packet_ids))

