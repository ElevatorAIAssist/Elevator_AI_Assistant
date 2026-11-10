"""
Sensor Processing and Telemetry Orchestration Engine.
Bridges raw ESP32 packets, simulation presets, ML inference, RCA, and database persistence.
"""

import time
import random
from typing import Optional, Dict, Any, Tuple, List
from models import (
    SensorReading,
    RawESP32Packet,
    TelemetryInput,
    TelemetryPayload,
    AnomalyResult,
    FaultClassificationResult,
    RCAResult,
    MotorHealthMetrics,
    SensorThresholds,
    SystemSeverity,
    AlertItem
)
from ml.anomaly_detection import detect_anomaly
from ml.fault_classifier import classify_fault
from rca.root_cause_engine import perform_rca, calculate_motor_health
import database.db as db
from hardware.esp32_serial import serial_bridge


SCENARIO_PRESETS = {
    "nominal": {
        "temperature": 25.0,
        "current": 4.5,
        "vibration": 55.0,
        "speed": 30.0,
        "doorClosed": True,
        "floor": 4,
        "direction": "up"
    },
    "warning_bearing": {
        "temperature": 38.0,
        "current": 8.0,
        "vibration": 110.0,
        "speed": 80.0,
        "doorClosed": True,
        "floor": 6,
        "direction": "up"
    },
    "critical_thermal": {
        "temperature": 50.0,
        "current": 8.0,
        "vibration": 60.0,
        "speed": 30.0,
        "doorClosed": True,
        "floor": 9,
        "direction": "up"
    },
    "critical_vibration": {
        "temperature": 38.0,
        "current": 8.0,
        "vibration": 145.0,
        "speed": 45.0,
        "doorClosed": True,
        "floor": 5,
        "direction": "idle"
    },
    "door_hazard": {
        "temperature": 28.0,
        "current": 6.0,
        "vibration": 50.0,
        "speed": 35.0,
        "doorClosed": False,  # Hazardous opening in motion!
        "floor": 7,
        "direction": "down"
    },
    "overspeed_trip": {
        "temperature": 32.0,
        "current": 8.0,
        "vibration": 60.0,
        "speed": 135.0,
        "doorClosed": True,
        "floor": 2,
        "direction": "down"
    }
}


class SensorProcessor:
    def __init__(self):
        self.thresholds = SensorThresholds()
        self.active_scenario = "nominal"
        self._current_reading: SensorReading = SensorReading(**SCENARIO_PRESETS["nominal"])
        self._last_processed_payload: Optional[TelemetryPayload] = None
        self._active_fault_codes = set()

    def set_thresholds(self, thresholds: SensorThresholds):
        self.thresholds = thresholds

    def get_thresholds(self) -> SensorThresholds:
        return self.thresholds

    def calibrate_esp32_packet(self, packet: RawESP32Packet) -> Tuple[SensorReading, RawESP32Packet]:
        """Convert microcontroller ADC/GPIO counts into calibrated physical engineering units."""
        cal_temp = round(float(packet.raw_adc_temperature * 0.05 + 18.0), 1)
        cal_curr = round(float(packet.raw_adc_current * 0.008), 2)
        cal_vib = round(float(packet.raw_accel_vibration * 0.02), 2)
        cal_speed = round(float((packet.raw_pulse_counter_speed / 1000.0) * 1.5), 2)
        door_closed = (packet.gpio_door_contact == 0)

        # Clamp calibrated values to physical sensor boundaries
        cal_temp = max(-40.0, min(160.0, cal_temp))
        cal_curr = max(0.0, min(60.0, cal_curr))
        cal_vib = max(0.0, min(300.0, cal_vib))
        cal_speed = max(0.0, min(500.0, cal_speed))

        reading = SensorReading(
            timestamp=time.time(),
            temperature=cal_temp,
            current=cal_curr,
            vibration=cal_vib,
            speed=cal_speed,
            doorClosed=door_closed,
            floor=self._current_reading.floor,
            direction=self._current_reading.direction
        )
        return reading, packet

    def apply_scenario(self, scenario_name: str) -> SensorReading:
        preset = SCENARIO_PRESETS.get(scenario_name, SCENARIO_PRESETS["nominal"])
        self.active_scenario = scenario_name
        self._current_reading = SensorReading(**preset, timestamp=time.time())
        return self._current_reading

    def process_telemetry(
        self,
        telemetry_in: Optional[TelemetryInput] = None,
        source: str = "simulated"
    ) -> TelemetryPayload:
        """
        Executes end-to-end pipeline:
        1. Sensor validation / calibration
        2. Isolation Forest Anomaly Detection
        3. Random Forest Fault Classification
        4. Rule-based Root Cause Analysis
        5. Database Storage & Alert generation
        """
        raw_packet = None

        # 1. Determine sensor inputs
        if telemetry_in and telemetry_in.packet:
            reading, raw_packet = self.calibrate_esp32_packet(telemetry_in.packet)
            source = "esp32_hardware"
        elif telemetry_in and telemetry_in.temperature is not None:
            # Calibrated input directly provided
            reading = SensorReading(
                timestamp=telemetry_in.timestamp or time.time(),
                temperature=telemetry_in.temperature,
                current=telemetry_in.current if telemetry_in.current is not None else 3.2,
                vibration=telemetry_in.vibration if telemetry_in.vibration is not None else 1.8,
                speed=telemetry_in.speed if telemetry_in.speed is not None else 1.25,
                doorClosed=telemetry_in.doorClosed if telemetry_in.doorClosed is not None else True,
                floor=telemetry_in.floor or 4,
                direction=telemetry_in.direction or "idle"
            )
        else:
            # Check if live hardware packet is available from serial bridge
            hw_packet = serial_bridge.get_latest_packet()
            if hw_packet:
                reading, raw_packet = self.calibrate_esp32_packet(hw_packet)
                source = "esp32_hardware"
            else:
                # Use current simulated reading with micro-fluctuation noise
                prev = self._current_reading
                temp_noise = random.uniform(-0.15, 0.15)
                curr_noise = random.uniform(-0.08, 0.08)
                vib_noise = random.uniform(-0.10, 0.10)
                speed_noise = random.uniform(-0.02, 0.02) if prev.speed > 0 else 0.0

                reading = SensorReading(
                    timestamp=time.time(),
                    temperature=round(prev.temperature + temp_noise, 1),
                    current=round(max(0.0, prev.current + curr_noise), 2),
                    vibration=round(max(0.0, prev.vibration + vib_noise), 2),
                    speed=round(max(0.0, prev.speed + speed_noise), 2),
                    doorClosed=prev.doorClosed,
                    floor=prev.floor,
                    direction=prev.direction
                )

        self._current_reading = reading

        # 2. ML Anomaly Detection (Model 1)
        is_anomaly, anomaly_score = detect_anomaly(
            reading.temperature,
            reading.current,
            reading.vibration,
            reading.speed,
            reading.doorClosed
        )
        anomaly_res = AnomalyResult(
            is_anomaly=is_anomaly,
            anomaly_score=anomaly_score
        )

        # 3. ML Fault Classifier (Model 2)
        predicted_fault, confidence, probabilities = classify_fault(
            reading.temperature,
            reading.current,
            reading.vibration,
            reading.speed,
            reading.doorClosed
        )
        fault_res = FaultClassificationResult(
            predicted_fault=predicted_fault,
            confidence=confidence,
            probabilities=probabilities
        )

        # 4. Root Cause Analysis
        rca_faults = perform_rca(
            reading.temperature,
            reading.current,
            reading.vibration,
            reading.speed,
            reading.doorClosed,
            self.thresholds,
            ml_predicted_fault=predicted_fault
        )

        # 5. System Status Calculation
        if any(f.severity == "critical" for f in rca_faults):
            system_status: SystemSeverity = "critical"
        elif len(rca_faults) > 0 or (is_anomaly and predicted_fault != "Normal"):
            system_status = "warning"
        else:
            system_status = "normal"

        # 6. Motor Health Metrics
        motor_health = calculate_motor_health(
            reading.temperature,
            reading.current,
            reading.vibration,
            self.thresholds,
            system_status=system_status
        )

        # 7. Persist reading & predictions to SQLite
        try:
            db.save_sensor_reading(
                temperature=reading.temperature,
                current=reading.current,
                vibration=reading.vibration,
                speed=reading.speed,
                door_closed=reading.doorClosed,
                floor=reading.floor,
                direction=reading.direction,
                source=source,
                raw_packet=raw_packet.model_dump() if raw_packet else None,
                timestamp=reading.timestamp
            )
            db.save_fault_prediction(
                is_anomaly=is_anomaly,
                anomaly_score=anomaly_score,
                predicted_fault=predicted_fault,
                confidence=confidence,
                probabilities=probabilities,
                details={"rca_count": len(rca_faults), "status": system_status},
                timestamp=reading.timestamp
            )
        except Exception as e:
            print(f"[SensorProcessor] DB Save Error: {e}")

        # 8. Alert Generation on New Fault Transitions
        current_codes = {f.code for f in rca_faults}
        for fault in rca_faults:
            if fault.code not in self._active_fault_codes:
                alert_dict = {
                    "id": f"ALT-{int(time.time()*1000)}-{fault.code}",
                    "timestamp": fault.detectedAt,
                    "faultCode": fault.code,
                    "faultName": fault.name,
                    "severity": fault.severity,
                    "sensorName": fault.sensorResponsible.split("(")[0].strip(),
                    "sensorValue": fault.triggerValue,
                    "description": f"Threshold breached: {fault.thresholdBreached}. Affected: {fault.affectedComponent}",
                    "acknowledged": False
                }
                try:
                    db.save_alert(alert_dict)
                except Exception as e:
                    print(f"[SensorProcessor] Alert Save Error: {e}")

        self._active_fault_codes = current_codes

        payload = TelemetryPayload(
            status=system_status,
            telemetry=reading,
            packet=raw_packet,
            anomaly=anomaly_res,
            fault_prediction=fault_res,
            rca=rca_faults,
            motor_health=motor_health,
            source=source
        )
        self._last_processed_payload = payload
        return payload

    def get_latest_payload(self) -> TelemetryPayload:
        if self._last_processed_payload is None:
            return self.process_telemetry()
        return self._last_processed_payload


# Global singleton processor
processor = SensorProcessor()

