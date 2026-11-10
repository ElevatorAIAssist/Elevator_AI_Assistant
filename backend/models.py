"""
Data models and validation schemas for Autonomous Elevator FDIR Assistant.
"""

from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field, field_validator
import time

MovementDirection = Literal["up", "down", "idle"]
SystemSeverity = Literal["normal", "warning", "critical"]
FaultCategory = Literal[
    "Normal",
    "Motor Overheating",
    "Motor Overcurrent",
    "Bearing Vibration",
    "Overspeed",
    "Door Interlock Fault",
]


class SensorReading(BaseModel):
    """
    Validated calibrated sensor telemetry.
    Supports both camelCase (from React UI) and snake_case field access.
    """
    timestamp: float = Field(default_factory=time.time, description="Unix epoch timestamp in seconds")
    temperature: float = Field(..., ge=-40.0, le=160.0, description="Motor stator core temperature in °C")
    current: float = Field(..., ge=0.0, le=60.0, description="Armature line current in Amperes")
    vibration: float = Field(..., ge=0.0, le=300.0, description="Vibration events/sec (or mm/s)")
    speed: float = Field(..., ge=0.0, le=500.0, description="Disc speed in RPM (or m/s)")
    doorClosed: bool = Field(default=True, description="True if hoistway/car door circuit is intact/closed")
    floor: int = Field(default=1, ge=1, le=12, description="Current landing floor (1-12)")
    direction: MovementDirection = Field(default="idle", description="Current travel direction")

    model_config = {
        "populate_by_name": True,
        "json_schema_extra": {
            "example": {
                "timestamp": 1730000000.0,
                "temperature": 42.5,
                "current": 3.2,
                "vibration": 1.8,
                "speed": 1.25,
                "doorClosed": True,
                "floor": 4,
                "direction": "up"
            }
        }
    }


class RawESP32Packet(BaseModel):
    """
    Direct microcontroller raw ADC counts and GPIO state contract.
    """
    device_id: str = Field(default="ESP32_ELEVATOR_RIG_01", min_length=1)
    firmware_version: Optional[str] = "v2.4.1-PROD"
    uptime_seconds: Optional[int] = 0
    wifi_rssi_dbm: Optional[int] = -60
    raw_adc_temperature: float = Field(..., ge=0, le=4095, description="PT100 RTD MAX31865 SPI / ADC count")
    raw_adc_current: float = Field(..., ge=0, le=4095, description="LEM Current transducer ADC count")
    raw_accel_vibration: float = Field(..., ge=0, le=4095, description="MPU6050 accelerometer magnitude count")
    raw_pulse_counter_speed: float = Field(..., ge=0, le=10000, description="Rotary encoder pulses per second")
    gpio_door_contact: int = Field(..., ge=0, le=1, description="0 = Closed, 1 = Open")
    crc32: Optional[str] = None


class TelemetryInput(BaseModel):
    """
    Flexible input schema that accepts either calibrated telemetry or raw ESP32 packet.
    """
    # Calibrated fields (optional if raw packet provided)
    temperature: Optional[float] = None
    current: Optional[float] = None
    vibration: Optional[float] = None
    speed: Optional[float] = None
    doorClosed: Optional[bool] = None
    floor: Optional[int] = 1
    direction: Optional[MovementDirection] = "idle"
    timestamp: Optional[float] = None

    # Raw fields (optional if calibrated provided)
    packet: Optional[RawESP32Packet] = None


class SensorThresholds(BaseModel):
    temperatureWarning: float = 35.0
    temperatureCritical: float = 45.0
    currentWarning: float = 7.0
    currentCritical: float = 9.0
    vibrationLow: float = 45.0
    vibrationWarning: float = 90.0
    vibrationCritical: float = 135.0
    speedMaxNormal: float = 60.0
    speedCritical: float = 120.0
    doorHazardSpeedLimit: float = 0.10


class AnomalyResult(BaseModel):
    is_anomaly: bool
    anomaly_score: float = Field(..., description="Normalized score 0.0 (nominal) to 1.0 (extreme excursion)")
    model_version: str = "IsolationForest_v1.0"


class FaultClassificationResult(BaseModel):
    predicted_fault: str
    confidence: float = Field(..., ge=0.0, le=100.0)
    probabilities: Dict[str, float]
    model_version: str = "RandomForestClassifier_v1.0"


class RCAResult(BaseModel):
    id: str
    code: str
    name: str
    severity: SystemSeverity
    affectedComponent: str
    componentCategory: str
    sensorResponsible: str
    triggerValue: str
    thresholdBreached: str
    detectedAt: float
    isolationConfidence: float
    maintenanceUrgency: str
    possibleRootCauses: List[str]
    recommendedActions: List[str]
    isolationProtocol: List[str]


class MotorHealthMetrics(BaseModel):
    overallHealthScore: int = Field(..., ge=0, le=100)
    thermalStressScore: int = Field(..., ge=0, le=100)
    electricalStressScore: int = Field(..., ge=0, le=100)
    mechanicalVibrationScore: int = Field(..., ge=0, le=100)
    status: SystemSeverity


class TelemetryPayload(BaseModel):
    status: SystemSeverity
    telemetry: SensorReading
    packet: Optional[RawESP32Packet] = None
    anomaly: AnomalyResult
    fault_prediction: FaultClassificationResult
    rca: List[RCAResult]
    motor_health: MotorHealthMetrics
    source: str = "simulation"


class AlertItem(BaseModel):
    id: str
    timestamp: float
    faultCode: str
    faultName: str
    severity: SystemSeverity
    sensorName: str
    sensorValue: str
    description: str
    acknowledged: bool = False


class ScenarioRequest(BaseModel):
    scenario: Literal[
        "nominal",
        "warning_bearing",
        "critical_thermal",
        "critical_vibration",
        "door_hazard",
        "overspeed_trip"
    ]

