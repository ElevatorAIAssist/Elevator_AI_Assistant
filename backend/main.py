"""
Autonomous Fault Isolation and Root Cause Analysis Assistant for Elevator Systems.
FastAPI Main Application Entry Point.
"""

import asyncio
import json
import os
import sys
import time
from contextlib import asynccontextmanager
from typing import Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from api_routes import router as api_router
from database.db import init_db
from hardware.esp32_serial import serial_bridge
from ml.anomaly_detection import get_anomaly_model
from ml.fault_classifier import get_fault_classifier
from sensor_processor import processor
from ws_manager import manager
_broadcaster_task = None
_is_broadcasting = False


async def telemetry_broadcaster_loop():
    """Background task pushing live telemetry and ML diagnostics via WebSocket."""
    while _is_broadcasting:
        try:
            await asyncio.sleep(1.5)
            if not _is_broadcasting:
                break
            if manager.active_connections:
                now = time.time()
                # 1. When physical hardware telemetry is fresh and valid, broadcast ONLY hardware_telemetry_update
                fresh_hw = serial_bridge.get_fresh_hardware_record(max_age_seconds=5.0)
                if fresh_hw:
                    msg_hw = {
                        "type": "hardware_telemetry_update",
                        "source": "esp32_hardware",
                        "timestamp": now,
                        "data": fresh_hw
                    }
                    await manager.broadcast_json(msg_hw)
                else:
                    # 2. When hardware is disconnected or stale, broadcast simulation telemetry with clear source
                    payload = processor.process_telemetry(source="simulated")
                    msg = {
                        "type": "telemetry_update",
                        "source": "simulated",
                        "timestamp": now,
                        "data": payload.model_dump()
                    }
                    await manager.broadcast_json(msg)
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"[TelemetryBroadcaster] Error in loop: {e}")
            await asyncio.sleep(2.0)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _broadcaster_task, _is_broadcasting
    # Startup sequence
    print("[Startup] Initializing SQLite database...")
    init_db()

    print("[Startup] Loading Machine Learning models...")
    iso_model = get_anomaly_model()
    clf_model = get_fault_classifier()
    if iso_model:
        print("[Startup] Isolation Forest loaded successfully.")
    else:
        print("[Startup] Warning: Isolation Forest not found, fallback heuristic active.")

    if clf_model:
        print(f"[Startup] Random Forest Classifier loaded successfully with {len(clf_model.classes_)} classes.")
    else:
        print("[Startup] Warning: Fault Classifier not found, fallback heuristic active.")

    is_testing = bool(os.environ.get("PYTEST_CURRENT_TEST")) or ("pytest" in sys.modules) or bool(os.environ.get("TESTING"))
    if not is_testing:
        print("[Startup] Starting ESP32 hardware bridge listener...")
        serial_bridge.start()
        _is_broadcasting = True
        _broadcaster_task = asyncio.create_task(telemetry_broadcaster_loop())

    yield

    # Shutdown sequence
    print("[Shutdown] Stopping background tasks and hardware listeners...")
    _is_broadcasting = False
    if _broadcaster_task:
        _broadcaster_task.cancel()
        try:
            await _broadcaster_task
        except (asyncio.CancelledError, Exception):
            pass
    serial_bridge.stop()
    print("[Shutdown] Clean shutdown completed.")


app = FastAPI(
    title="Autonomous Elevator Fault Isolation & RCA Assistant",
    description="FastAPI Backend providing sensor telemetry processing, ML anomaly detection, fault classification, and root cause analysis.",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
        "http://172.168.69.207:3000",
    ],
    allow_origin_regex=r"^https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API and WebSocket routes
app.include_router(api_router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
