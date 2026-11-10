"""
FastAPI REST API Routes for Elevator Telemetry, Diagnostics, Alerts, and Scenarios.
"""

import json
import time
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from models import (
    TelemetryInput,
    TelemetryPayload,
    SensorReading,
    RawESP32Packet,
    SensorThresholds,
    ScenarioRequest,
    AlertItem
)
from sensor_processor import processor
import database.db as db
from hardware.esp32_serial import serial_bridge
from ws_manager import manager

router = APIRouter()


@router.get("/api/health")
async def health_check():
    """Check backend operational availability."""
    hw_status = serial_bridge.get_status()
    return {
        "status": "healthy",
        "service": "Autonomous Elevator Fault Isolation & RCA Assistant",
        "timestamp": time.time(),
        "hardware_bridge": {
            "connected": hw_status["connected"],
            "port": hw_status["port"]
        }
    }


@router.get("/api/v1/telemetry")
async def get_telemetry_compatibility():
    """
    Direct compatibility endpoint for existing React frontend apiService.ts.
    Returns wrapped format with parsed simulated telemetry.
    If no actual hardware packet exists, packet is null without fabricating ADC values.
    """
    payload = processor.get_latest_payload()
    raw_packet_dict = payload.packet.model_dump() if payload.packet else None

    return {
        "connected": True,
        "source": payload.source,
        "packet": raw_packet_dict,
        "telemetry": payload.telemetry.model_dump(),
        "status": payload.status,
        "anomaly": payload.anomaly.model_dump(),
        "fault_prediction": payload.fault_prediction.model_dump(),
        "rca": [r.model_dump() for r in payload.rca],
        "motor_health": payload.motor_health.model_dump()
    }


@router.get("/api/v1/telemetry/latest", response_model=TelemetryPayload)
async def get_latest_telemetry():
    """Return the latest sensor readings and full diagnostic payload."""
    return processor.get_latest_payload()


@router.get("/api/v1/telemetry/history")
async def get_telemetry_history(limit: int = Query(default=50, ge=1, le=200)):
    """Return historical sensor readings from SQLite database."""
    history = db.get_telemetry_history(limit=limit)
    return {"count": len(history), "history": history}


@router.post("/api/v1/telemetry", response_model=TelemetryPayload)
async def ingest_telemetry(telemetry_in: TelemetryInput):
    """Receive new sensor readings (either calibrated readings or raw ESP32 packet)."""
    try:
        payload = processor.process_telemetry(telemetry_in=telemetry_in, source="api_post")
        return payload
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid telemetry payload: {e}")


@router.get("/api/v1/alerts")
async def get_alerts(limit: int = Query(default=50, ge=1, le=100)):
    """Return active and acknowledged fault alerts."""
    alerts = db.get_alerts(limit=limit)
    return {"count": len(alerts), "alerts": alerts}


@router.post("/api/v1/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str):
    """Acknowledge an alert."""
    success = db.acknowledge_alert(alert_id)
    if not success:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"success": True, "alert_id": alert_id}


@router.get("/api/v1/diagnosis")
async def get_diagnosis():
    """Return ML predictions and Root Cause Analysis results."""
    payload = processor.get_latest_payload()
    return {
        "timestamp": payload.telemetry.timestamp,
        "system_status": payload.status,
        "anomaly_detection": payload.anomaly.model_dump(),
        "fault_classification": payload.fault_prediction.model_dump(),
        "root_cause_analysis": [r.model_dump() for r in payload.rca],
        "motor_health": payload.motor_health.model_dump()
    }


@router.get("/api/v1/thresholds", response_model=SensorThresholds)
async def get_thresholds():
    """Return current configured safety thresholds."""
    return processor.get_thresholds()


@router.post("/api/v1/thresholds", response_model=SensorThresholds)
async def update_thresholds(thresholds: SensorThresholds):
    """Update configured safety thresholds."""
    processor.set_thresholds(thresholds)
    return processor.get_thresholds()


@router.post("/api/v1/simulation/scenario")
async def set_simulation_scenario(req: ScenarioRequest):
    """Set normal, warning, or critical test scenarios."""
    reading = processor.apply_scenario(req.scenario)
    payload = processor.process_telemetry(source="simulation_preset")
    return {
        "success": True,
        "scenario": req.scenario,
        "telemetry": reading.model_dump(),
        "system_status": payload.status,
        "active_faults": len(payload.rca)
    }


@router.get("/api/v1/hardware/status")
async def get_hardware_status():
    """Return PySerial connection status, errors, and detected ports."""
    return serial_bridge.get_status()


@router.get("/api/v1/hardware/telemetry/latest")
async def get_latest_hardware_telemetry():
    """Return the single latest physical demonstration rig telemetry record."""
    status = serial_bridge.get_status()
    record = serial_bridge.get_latest_hardware_record()
    return {
        "connected": status["connected"],
        "port": status["port"],
        "device_id": status["active_device_id"],
        "boot_id": status["active_boot_id"],
        "generation_id": status["generation_id"],
        "high_water_mark": status["high_water_mark"],
        "diagnostic_status": status["last_diagnostic_status"],
        "telemetry": record
    }


@router.get("/api/v1/hardware/telemetry/history")
async def get_hardware_telemetry_history(limit: int = Query(default=50, ge=1, le=200)):
    """Return historical physical demonstration rig telemetry from SQLite."""
    history = db.get_hardware_telemetry_history(limit=limit)
    return {
        "count": len(history),
        "history": history
    }


@router.websocket("/ws/telemetry")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint streaming live sensor telemetry, ML predictions, and alerts.
    Also handles client ping-pong and dynamic scenario injection.
    """
    await manager.connect(websocket)
    try:
        initial_payload = processor.get_latest_payload()
        await websocket.send_json({
            "type": "initial_state",
            "timestamp": time.time(),
            "data": initial_payload.model_dump()
        })

        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
            else:
                try:
                    parsed = json.loads(data)
                    if parsed.get("action") == "scenario":
                        scenario = parsed.get("scenario", "nominal")
                        processor.apply_scenario(scenario)
                        updated = processor.process_telemetry(source="ws_command")
                        await websocket.send_json({
                            "type": "scenario_applied",
                            "scenario": scenario,
                            "data": updated.model_dump()
                        })
                except Exception:
                    pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"[WebSocket] Connection terminated: {e}")
        manager.disconnect(websocket)

