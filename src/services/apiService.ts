/**
 * API Service Layer
 * Connects the React frontend to the Python FastAPI backend on port 8000 and ESP32 hardware telemetry.
 * Integrates REST endpoints, WebSocket real-time streams, and graceful offline fallback.
 */

import {
  SensorData,
  SensorThresholds,
  AlertHistoryItem,
  DetectedFault,
  MotorHealthMetrics,
  BackendDiagnosisData
} from '../types/elevator';

export interface ESP32TelemetryPacket {
  device_id: string;
  firmware_version?: string;
  uptime_seconds?: number;
  wifi_rssi_dbm?: number;
  raw_adc_temperature: number; // PT100 signal via MAX31865 SPI
  raw_adc_current: number;     // LEM Current Transducer 0-5V ADC
  raw_accel_vibration: number; // MPU6050/ADXL345 I2C vibration magnitude
  raw_pulse_counter_speed: number; // Optical quadrature encoder pulses / sec
  gpio_door_contact: number;   // 0 = Closed/Circuit Intact, 1 = Open
  crc32?: string;
}

export interface CalibratedTelemetry {
  temperature: number;
  current: number;
  vibration: number;
  speed: number;
  doorClosed: boolean;
  floor?: number;
  direction?: 'up' | 'down' | 'idle';
  timestamp?: number;
}

export interface BackendConnectionStatus {
  endpoint: string;
  connected: boolean;
  lastPingMs: number | null;
  hardwareBridge: 'ESP32_RS485_MODBUS' | 'ESP32_MQTT_WIFI' | 'NONE';
  brokerStatus: 'standby' | 'connected' | 'disconnected';
  message: string;
}

export interface HardwareTelemetryResult {
  connected: boolean;
  data: CalibratedTelemetry | null;
  packet?: ESP32TelemetryPacket | null;
  diagnosis?: BackendDiagnosisData | null;
  source?: string;
  error?: string;
}

export type MockHardwareMode = 'auto' | 'connected' | 'disconnected';

let currentMockMode: MockHardwareMode = 'auto';

export const DEFAULT_API_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
  (typeof window !== 'undefined' && window.location.hostname
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : 'http://localhost:8000');

export const DEFAULT_WS_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_WS_BASE_URL) ||
  DEFAULT_API_BASE.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');

export const API_SERVICE = {
  /**
   * Set mock hardware testing state (useful for simulating scenario C and D)
   */
  setMockHardwareStatus(mode: MockHardwareMode) {
    currentMockMode = mode;
  },

  /**
   * Get current mock hardware state
   */
  getMockHardwareStatus(): MockHardwareMode {
    return currentMockMode;
  },

  /**
   * Validate raw incoming ESP32 packet structure and calibrated physics ranges
   */
  validateESP32Packet(packet: any): packet is ESP32TelemetryPacket {
    if (!packet || typeof packet !== 'object') return false;
    if (typeof packet.device_id !== 'string' || packet.device_id.trim() === '') return false;

    const {
      raw_adc_temperature,
      raw_adc_current,
      raw_accel_vibration,
      raw_pulse_counter_speed,
      gpio_door_contact
    } = packet;

    if (
      typeof raw_adc_temperature !== 'number' || !Number.isFinite(raw_adc_temperature) ||
      typeof raw_adc_current !== 'number' || !Number.isFinite(raw_adc_current) ||
      typeof raw_accel_vibration !== 'number' || !Number.isFinite(raw_accel_vibration) ||
      typeof raw_pulse_counter_speed !== 'number' || !Number.isFinite(raw_pulse_counter_speed) ||
      (gpio_door_contact !== 0 && gpio_door_contact !== 1)
    ) {
      return false;
    }

    const calibrated = this.parseESP32Packet(packet);
    if (
      calibrated.temperature < -40 || calibrated.temperature > 160 ||
      calibrated.current < 0 || calibrated.current > 60 ||
      calibrated.vibration < 0 || calibrated.vibration > 50 ||
      calibrated.speed < 0 || calibrated.speed > 10
    ) {
      return false;
    }

    return true;
  },

  /**
   * Translates raw microcontroller ADC & GPIO counts into calibrated physical units
   */
  parseESP32Packet(packet: ESP32TelemetryPacket): CalibratedTelemetry {
    const calibratedTemp = +(packet.raw_adc_temperature * 0.05 + 18.0).toFixed(1);
    const calibratedCurrent = +(packet.raw_adc_current * 0.008).toFixed(2);
    const calibratedVibration = +(packet.raw_accel_vibration * 0.02).toFixed(2);
    const calibratedSpeed = +((packet.raw_pulse_counter_speed / 1000) * 1.5).toFixed(2);
    const doorClosed = packet.gpio_door_contact === 0;

    return {
      temperature: calibratedTemp,
      current: calibratedCurrent,
      vibration: calibratedVibration,
      speed: calibratedSpeed,
      doorClosed
    };
  },

  /**
   * Health check probe for FastAPI backend (GET /api/health)
   */
  async checkBackendHealth(baseUrl = DEFAULT_API_BASE): Promise<BackendConnectionStatus> {
    if (currentMockMode === 'connected') {
      return {
        endpoint: `${baseUrl}/api/health`,
        connected: true,
        lastPingMs: 12,
        hardwareBridge: 'ESP32_MQTT_WIFI',
        brokerStatus: 'connected',
        message: 'ESP32 microcontroller telemetry stream verified and streaming online.'
      };
    }

    if (currentMockMode === 'disconnected') {
      return {
        endpoint: `${baseUrl}/api/health`,
        connected: false,
        lastPingMs: null,
        hardwareBridge: 'NONE',
        brokerStatus: 'disconnected',
        message: 'Hardware bridge connection lost or offline.'
      };
    }

    try {
      const startTime = performance.now();
      const res = await fetch(`${baseUrl}/api/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(1500)
      });
      const pingMs = Math.round(performance.now() - startTime);

      if (res.ok) {
        const json = await res.json();
        return {
          endpoint: `${baseUrl}/api/health`,
          connected: true,
          lastPingMs: pingMs,
          hardwareBridge: json.hardware_bridge?.connected ? 'ESP32_MQTT_WIFI' : 'NONE',
          brokerStatus: json.hardware_bridge?.connected ? 'connected' : 'standby',
          message: `FastAPI Gateway online. Service: ${json.service || 'Active'} (${pingMs}ms)`
        };
      }
    } catch {
      // Graceful offline fallback
    }

    return {
      endpoint: `${baseUrl}/api/health`,
      connected: false,
      lastPingMs: null,
      hardwareBridge: 'NONE',
      brokerStatus: 'disconnected',
      message: 'FastAPI Gateway offline or awaiting server on port 8000.'
    };
  },

  /**
   * Fetch hardware telemetry from FastAPI endpoint (GET /api/v1/telemetry)
   */
  async fetchHardwareTelemetry(baseUrl = DEFAULT_API_BASE): Promise<HardwareTelemetryResult> {
    // 1. Mock connected test mode
    if (currentMockMode === 'connected') {
      const syntheticPacket: ESP32TelemetryPacket = {
        device_id: 'ESP32_ELEVATOR_RIG_01',
        firmware_version: 'v2.4.1-PROD',
        uptime_seconds: Math.floor(performance.now() / 1000),
        wifi_rssi_dbm: -58,
        raw_adc_temperature: 480 + Math.floor((Math.random() - 0.5) * 8),
        raw_adc_current: 395 + Math.floor((Math.random() - 0.5) * 12),
        raw_accel_vibration: 92 + Math.floor((Math.random() - 0.5) * 6),
        raw_pulse_counter_speed: 830 + Math.floor((Math.random() - 0.5) * 10),
        gpio_door_contact: 0,
        crc32: '0x9F4C2A11'
      };

      return {
        connected: true,
        data: this.parseESP32Packet(syntheticPacket),
        packet: syntheticPacket,
        source: 'esp32_hardware'
      };
    }

    // 2. Mock disconnected test mode
    if (currentMockMode === 'disconnected') {
      return {
        connected: false,
        data: null,
        error: 'Hardware connection unavailable or lost.'
      };
    }

    // 3. Real HTTP request to dedicated FastAPI hardware endpoint
    try {
      const response = await fetch(`${baseUrl}/api/v1/hardware/telemetry/latest`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(1800)
      });

      if (!response.ok) {
        return {
          connected: false,
          data: null,
          error: `HTTP ${response.status}: ${response.statusText}`
        };
      }

      const json = await response.json();
      if (json.connected && json.telemetry) {
        return {
          connected: true,
          data: {
            temperature: json.telemetry.water_temp_c,
            current: json.telemetry.led_current_ma,
            vibration: json.telemetry.vibration_events_per_sec,
            speed: json.telemetry.disc_rpm,
            doorClosed: null as any,
            floor: null as any,
            direction: null as any,
            timestamp: json.telemetry.timestamp
          },
          packet: json.telemetry,
          diagnosis: null,
          source: 'esp32_hardware'
        };
      }

      return {
        connected: false,
        data: null,
        error: json.diagnostic_status || 'Hardware standby / awaiting ESP32 packet'
      };
    } catch (err: any) {
      return {
        connected: false,
        data: null,
        error: err?.message || 'Unable to communicate with FastAPI backend.'
      };
    }
  },

  /**
   * Fetch historical telemetry from database (GET /api/v1/telemetry/history)
   */
  async getTelemetryHistory(limit = 30, baseUrl = DEFAULT_API_BASE): Promise<any[]> {
    try {
      const res = await fetch(`${baseUrl}/api/v1/telemetry/history?limit=${limit}`, {
        signal: AbortSignal.timeout(2000)
      });
      if (res.ok) {
        const json = await res.json();
        return json.history || [];
      }
    } catch {
      // ignore
    }
    return [];
  },

  /**
   * Fetch historical hardware telemetry from database (GET /api/v1/hardware/telemetry/history)
   */
  async getHardwareTelemetryHistory(limit = 30, baseUrl = DEFAULT_API_BASE): Promise<any[]> {
    try {
      const res = await fetch(`${baseUrl}/api/v1/hardware/telemetry/history?limit=${limit}`, {
        signal: AbortSignal.timeout(2500)
      });
      if (res.ok) {
        const json = await res.json();
        return json.history || [];
      }
    } catch {
      // ignore
    }
    return [];
  },

  /**
   * Fetch alerts from backend (GET /api/v1/alerts)
   */
  async getAlerts(limit = 50, baseUrl = DEFAULT_API_BASE): Promise<AlertHistoryItem[]> {
    try {
      const res = await fetch(`${baseUrl}/api/v1/alerts?limit=${limit}`, {
        signal: AbortSignal.timeout(2000)
      });
      if (res.ok) {
        const json = await res.json();
        return (json.alerts || []).map((a: any) => ({
          id: a.id,
          timestamp: Math.floor(a.timestamp > 10000000000 ? a.timestamp : a.timestamp * 1000),
          faultCode: a.faultCode,
          faultName: a.faultName,
          severity: a.severity,
          sensorName: a.sensorName,
          sensorValue: a.sensorValue,
          description: a.description,
          acknowledged: a.acknowledged
        }));
      }
    } catch {
      // ignore
    }
    return [];
  },

  /**
   * Acknowledge alert on backend (POST /api/v1/alerts/{id}/acknowledge)
   */
  async acknowledgeAlert(alertId: string, baseUrl = DEFAULT_API_BASE): Promise<boolean> {
    try {
      const res = await fetch(`${baseUrl}/api/v1/alerts/${alertId}/acknowledge`, {
        method: 'POST',
        signal: AbortSignal.timeout(2000)
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  /**
   * Fetch current ML and RCA diagnosis (GET /api/v1/diagnosis)
   */
  async getDiagnosis(baseUrl = DEFAULT_API_BASE): Promise<BackendDiagnosisData | null> {
    try {
      const res = await fetch(`${baseUrl}/api/v1/diagnosis`, {
        signal: AbortSignal.timeout(2000)
      });
      if (res.ok) {
        const json = await res.json();
        return {
          timestamp: json.timestamp || Date.now(),
          systemStatus: json.system_status || 'normal',
          anomaly: {
            isAnomaly: json.anomaly_detection?.is_anomaly ?? false,
            anomalyScore: json.anomaly_detection?.anomaly_score ?? 0,
            modelVersion: json.anomaly_detection?.model_version
          },
          faultClassification: {
            predictedFault: json.fault_classification?.predicted_fault || 'Normal',
            confidence: json.fault_classification?.confidence || 0,
            probabilities: json.fault_classification?.probabilities || {},
            modelVersion: json.fault_classification?.model_version
          },
          rca: json.root_cause_analysis || [],
          motorHealth: json.motor_health || {
            overallHealthScore: 85,
            thermalStressScore: 85,
            electricalStressScore: 85,
            mechanicalVibrationScore: 85,
            status: 'normal'
          }
        };
      }
    } catch {
      // ignore
    }
    return null;
  },

  /**
   * Fetch thresholds (GET /api/v1/thresholds)
   */
  async getThresholds(baseUrl = DEFAULT_API_BASE): Promise<SensorThresholds | null> {
    try {
      const res = await fetch(`${baseUrl}/api/v1/thresholds`, {
        signal: AbortSignal.timeout(1500)
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // ignore
    }
    return null;
  },

  /**
   * Update thresholds (POST /api/v1/thresholds)
   */
  async updateThresholds(thresholds: SensorThresholds, baseUrl = DEFAULT_API_BASE): Promise<boolean> {
    try {
      const res = await fetch(`${baseUrl}/api/v1/thresholds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(thresholds),
        signal: AbortSignal.timeout(2000)
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  /**
   * Trigger backend scenario preset (POST /api/v1/simulation/scenario)
   */
  async setSimulationScenario(scenario: string, baseUrl = DEFAULT_API_BASE): Promise<boolean> {
    try {
      const res = await fetch(`${baseUrl}/api/v1/simulation/scenario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario }),
        signal: AbortSignal.timeout(2000)
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  /**
   * Connect to real-time WebSocket (/ws/telemetry)
   */
  createTelemetryWebSocket(
    onMessage: (payload: any) => void,
    onStatusChange?: (connected: boolean) => void,
    wsBase = DEFAULT_WS_BASE
  ): { disconnect: () => void; send: (data: any) => void } {
    let ws: WebSocket | null = null;
    let isDisposed = false;
    let reconnectTimer: any = null;

    const connect = () => {
      if (isDisposed) return;
      try {
        const fullWsUrl = `${wsBase}/ws/telemetry`;
        console.log(`[WebSocket] Connecting to ${fullWsUrl}...`);
        ws = new WebSocket(fullWsUrl);

        ws.onopen = () => {
          if (isDisposed) {
            ws?.close();
            return;
          }
          console.log(`[WebSocket] Connected to ${fullWsUrl} (ReadyState: ${ws?.readyState})`);
          if (onStatusChange) onStatusChange(true);
        };

        ws.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data);
            if (parsed.data) {
              onMessage(parsed.data);
            } else {
              onMessage(parsed);
            }
          } catch {
            // ignore non-json
          }
        };

        ws.onerror = (err) => {
          console.warn('[WebSocket] Connection error:', err);
          if (onStatusChange) onStatusChange(false);
        };

        ws.onclose = (event) => {
          console.log(`[WebSocket] Closed (code: ${event.code}). Reconnecting in 2s...`);
          if (onStatusChange) onStatusChange(false);
          if (!isDisposed) {
            clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(connect, 2000);
          }
        };
      } catch (err) {
        console.warn('[WebSocket] Exception during connect:', err);
        if (onStatusChange) onStatusChange(false);
        if (!isDisposed) {
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(connect, 2000);
        }
      }
    };

    connect();

    return {
      disconnect: () => {
        isDisposed = true;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        if (ws) {
          ws.close();
          ws = null;
        }
        if (onStatusChange) onStatusChange(false);
      },
      send: (data: any) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(typeof data === 'string' ? data : JSON.stringify(data));
        }
      }
    };
  }
};
