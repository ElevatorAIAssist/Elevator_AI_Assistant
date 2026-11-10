/**
 * Type definitions for Autonomous Fault Isolation & Root Cause Analysis Assistant for Elevator Systems
 */

export type SystemStatus = 'normal' | 'warning' | 'critical';

export type OperatingMode = 'simulation' | 'real_hardware';

export type TelemetryConnectionState = 'simulation_active' | 'hardware_connected' | 'disconnected';

export interface SensorData {
  timestamp: number;
  temperature: number; // °C
  current: number;     // A (Motor armature / line current)
  vibration: number;   // mm/s (Peak vibration velocity RMS)
  speed: number;       // m/s (Elevator car linear speed)
  doorClosed: boolean; // true = Closed, false = Open
  floor: number;       // Current floor (1 - 12)
  direction: 'up' | 'down' | 'idle';
}

export interface HardwareTelemetryData {
  timestamp: number;
  water_temp_c: number;              // DS18B20: Water Temperature (°C)
  led_current_ma: number;            // INA219: LED Circuit Current (mA)
  vibration_events_per_sec: number;  // SW-420: Vibration Events (events/sec)
  disc_rpm: number;                  // TCRT5000: Disc Rotational Speed (RPM)
  operating_state: string;           // RUNNING, IDLE, STOPPED
  diagnostic_status?: string;        // NORMAL, NO_PULSES_WHILE_RUNNING, etc.
  packet_id?: number;
  device_id?: string;
  boot_id?: string;
  door_closed: null;
  floor: null;
  direction: null;
}

export interface SensorThresholds {
  temperatureWarning: number;   // default 35.0°C (DS18B20 Water Temperature)
  temperatureCritical: number;  // default 45.0°C
  currentWarning: number;       // default 7.0 mA (INA219 LED Circuit Current)
  currentCritical: number;      // default 9.0 mA
  vibrationLow?: number;        // default 45.0 events/sec (SW-420 Normal Min)
  vibrationWarning: number;     // default 90.0 events/sec (SW-420 Vibration Events)
  vibrationCritical: number;    // default 135.0 events/sec
  speedMaxNormal: number;       // default 60.0 RPM (TCRT5000 Disc RPM)
  speedCritical: number;        // default 120.0 RPM
  doorHazardSpeedLimit: number; // default 0.10 m/s (if door open while speed > limit -> hazard)
}

export type ComponentCategory =
  | 'traction_motor'
  | 'bearing_gearbox'
  | 'brake_assembly'
  | 'door_interlock'
  | 'drive_inverter'
  | 'guide_rail_counterweight';

export interface DetectedFault {
  id: string;
  code: string;
  name: string;
  severity: 'warning' | 'critical';
  affectedComponent: string;
  componentCategory: ComponentCategory;
  sensorResponsible: string;
  triggerValue: string;
  thresholdBreached: string;
  detectedAt: number;
  possibleRootCauses: string[];
  recommendedActions: string[];
  maintenanceUrgency: 'Immediate Shutdown Required' | 'Schedule Inspection within 24 Hours' | 'Routine Maintenance Required';
  isolationConfidence: number; // 0 - 100%
  isolationProtocol: string[];
}

export interface AlertHistoryItem {
  id: string;
  timestamp: number;
  faultCode: string;
  faultName: string;
  severity: SystemStatus;
  sensorName: string;
  sensorValue: string;
  description: string;
  acknowledged: boolean;
}

export interface SimulationPreset {
  id: string;
  name: string;
  description: string;
  targetSeverity: SystemStatus;
  values: {
    temperature: number;
    current: number;
    vibration: number;
    speed: number;
    doorClosed: boolean;
    floor?: number;
    direction?: 'up' | 'down' | 'idle';
  };
}

export interface MotorHealthMetrics {
  overallHealthScore: number; // 0 - 100
  thermalStressScore: number;
  electricalStressScore: number;
  mechanicalVibrationScore: number;
  status: SystemStatus;
}

export interface AnomalyDetectionData {
  isAnomaly: boolean;
  anomalyScore: number; // 0.0 - 1.0
  modelVersion?: string;
}

export interface FaultClassificationData {
  predictedFault: string;
  confidence: number; // 0 - 100%
  probabilities: Record<string, number>;
  modelVersion?: string;
}

export interface BackendDiagnosisData {
  timestamp: number;
  systemStatus: SystemStatus;
  anomaly: AnomalyDetectionData;
  faultClassification: FaultClassificationData;
  rca: DetectedFault[];
  motorHealth: MotorHealthMetrics;
}
