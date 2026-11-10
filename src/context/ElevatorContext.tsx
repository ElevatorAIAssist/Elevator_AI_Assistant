import React, { createContext, useContext, useState, useEffect, useRef, useMemo, ReactNode } from 'react';
import {
  SensorData,
  SensorThresholds,
  DetectedFault,
  SystemStatus,
  MotorHealthMetrics,
  AlertHistoryItem,
  OperatingMode,
  SimulationPreset,
  TelemetryConnectionState,
  AnomalyDetectionData,
  FaultClassificationData,
  BackendDiagnosisData
} from '../types/elevator';
import { evaluateSensors } from '../services/faultDetectionEngine';
import { API_SERVICE, MockHardwareMode } from '../services/apiService';



export const DEFAULT_THRESHOLDS: SensorThresholds = {
  temperatureWarning: 35.0,
  temperatureCritical: 45.0,
  currentWarning: 7.0,
  currentCritical: 9.0,
  vibrationLow: 45.0,
  vibrationWarning: 90.0,
  vibrationCritical: 135.0,
  speedMaxNormal: 60.0,
  speedCritical: 120.0,
  doorHazardSpeedLimit: 0.10
};



export const NOMINAL_SENSORS: SensorData = {
  timestamp: Date.now(),
  temperature: 25.0,
  current: 4.5,
  vibration: 55.0,
  speed: 30.0,
  doorClosed: true,
  floor: 4,
  direction: 'up'
};



export const SIMULATION_PRESETS: SimulationPreset[] = [
  {
    id: 'nominal',
    name: 'Normal Baseline',
    description: 'All physical sensors within optimal nominal operating thresholds.',
    targetSeverity: 'normal',
    values: {
      temperature: 25.0,
      current: 4.5,
      vibration: 55.0,
      speed: 30.0,
      doorClosed: true,
      floor: 3,
      direction: 'up'
    }
  },
  {
    id: 'warning_bearing',
    name: 'Warning: Friction & Vibration',
    description: 'Elevated machine vibration (110 ev/s) and current (8.0 mA) within warning envelope.',
    targetSeverity: 'warning',
    values: {
      temperature: 38.0,
      current: 8.0,
      vibration: 110.0,
      speed: 80.0,
      doorClosed: true,
      floor: 6,
      direction: 'up'
    }
  },
  {
    id: 'critical_thermal',
    name: 'Critical: Thermal Overload',
    description: 'Severe water temperature escalation (> 45°C critical limit) with moderate current draw.',
    targetSeverity: 'critical',
    values: {
      temperature: 50.0,
      current: 8.0,
      vibration: 60.0,
      speed: 30.0,
      doorClosed: true,
      floor: 9,
      direction: 'up'
    }
  },
  {
    id: 'critical_vibration',
    name: 'Critical: Mechanical Seizure',
    description: 'Catastrophic frame vibration (> 135 ev/s critical limit) with high electrical load (> 9 mA).',
    targetSeverity: 'critical',
    values: {
      temperature: 38.0,
      current: 9.5,
      vibration: 145.0,
      speed: 45.0,
      doorClosed: true,
      floor: 5,
      direction: 'idle'
    }
  },
  {
    id: 'door_hazard',
    name: 'Critical: Door Interlock Failure',
    description: 'Car door open while elevator car is actively traveling in hoistway.',
    targetSeverity: 'critical',
    values: {
      temperature: 28.0,
      current: 6.0,
      vibration: 55.0,
      speed: 35.0,
      doorClosed: false, // OPEN during motion!
      floor: 7,
      direction: 'down'
    }
  },
  {
    id: 'overspeed_trip',
    name: 'Critical: Disc Overspeed Trip',
    description: 'Rotational disc speed exceeds critical trip threshold (> 120 RPM).',
    targetSeverity: 'critical',
    values: {
      temperature: 32.0,
      current: 8.0,
      vibration: 60.0,
      speed: 135.0,
      doorClosed: true,
      floor: 2,
      direction: 'down'
    }
  }
];



export interface TelemetryPoint {
  timeStr: string;
  timestamp: number;
  temperature: number;
  current: number;
  vibration: number;
  speed: number;
  status: SystemStatus;
}



interface ElevatorContextType {
  sensors: SensorData;
  thresholds: SensorThresholds;
  systemStatus: SystemStatus;
  operatingState: string;
  activeFaults: DetectedFault[];
  motorHealth: MotorHealthMetrics;
  telemetryHistory: TelemetryPoint[];
  alertHistory: AlertHistoryItem[];
  operatingMode: OperatingMode;
  isSimulatingNoise: boolean;
  isStreamingPaused: boolean;
  activePresetId: string | null;
  // Connection and Hardware State
  connectionState: TelemetryConnectionState;
  hardwareConnected: boolean;
  isBackendConnected: boolean;
  mockHardwareStatus: MockHardwareMode;
  setMockHardwareStatus: (mode: MockHardwareMode) => void;
  // Backend ML & RCA Diagnostics
  backendDiagnosis: BackendDiagnosisData | null;
  mlAnomaly: AnomalyDetectionData | null;
  mlFaultClassification: FaultClassificationData | null;
  backendRCA: DetectedFault[];
  // Actions
  updateSensors: (partial: Partial<SensorData>) => void;
  applyPreset: (presetId: string) => void;
  resetToNominal: () => void;
  updateThresholds: (partial: Partial<SensorThresholds>) => void;
  resetThresholdsToDefaults: () => void;
  setOperatingMode: (mode: OperatingMode) => void;
  toggleSimulatingNoise: () => void;
  toggleStreamingPause: () => void;
  acknowledgeAlert: (alertId: string) => void;
  clearAlert: (alertId: string) => void;
  clearAllAlerts: () => void;
  carShaftAnimationProgress: number; // 0 - 100 for elevator shaft graphic
}



const ElevatorContext = createContext<ElevatorContextType | undefined>(undefined);



const LOCAL_STORAGE_THRESHOLDS_KEY = 'elevator_assistant_thresholds_v2';
const LOCAL_STORAGE_ALERTS_KEY = 'elevator_assistant_alerts_v1';



export const ElevatorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Load persisted thresholds
  const [thresholds, setThresholds] = useState<SensorThresholds>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_THRESHOLDS_KEY);
      if (saved) {
        return { ...DEFAULT_THRESHOLDS, ...JSON.parse(saved) };
      }
    } catch {
      // ignore
    }
    return DEFAULT_THRESHOLDS;
  });



  // Load persisted alert history
  const [alertHistory, setAlertHistory] = useState<AlertHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_ALERTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    const now = Date.now();
    return [
      {
        id: `ALT-SEED-1`,
        timestamp: now - 3600000 * 2,
        faultCode: 'E-MOT-01',
        faultName: 'Elevated Motor Operating Temperature',
        severity: 'warning',
        sensorName: 'PT100 Stator RTD',
        sensorValue: '62.4 °C',
        description: 'Sensor exceeded warning threshold of 60.0°C during peak noon traffic.',
        acknowledged: true
      },
      {
        id: `ALT-SEED-2`,
        timestamp: now - 3600000 * 5,
        faultCode: 'E-MEC-01',
        faultName: 'Elevated Machine Vibration Level',
        severity: 'warning',
        sensorName: 'Machine Accelerometer',
        sensorValue: '4.32 mm/s',
        description: 'Vibration spike logged at 4th floor landing transition.',
        acknowledged: true
      }
    ];
  });



  const [sensors, setSensors] = useState<SensorData>(NOMINAL_SENSORS);
  const [operatingMode, setOperatingMode] = useState<OperatingMode>('simulation');
  const [isSimulatingNoise, setIsSimulatingNoise] = useState<boolean>(true);
  const [isStreamingPaused, setIsStreamingPaused] = useState<boolean>(false);
  const [activePresetId, setActivePresetId] = useState<string | null>('nominal');
  const [carShaftAnimationProgress, setCarShaftAnimationProgress] = useState<number>(35);



  // Backend & Hardware Connection State
  const [hardwareConnected, setHardwareConnected] = useState<boolean>(false);
  const [isBackendConnected, setIsBackendConnected] = useState<boolean>(false);
  const [mockHardwareStatus, setMockHardwareStatusState] = useState<MockHardwareMode>(() => API_SERVICE.getMockHardwareStatus());



  // Backend ML & RCA Diagnostics state
  const [backendDiagnosis, setBackendDiagnosis] = useState<BackendDiagnosisData | null>(null);



  const setMockHardwareStatus = (mode: MockHardwareMode) => {
    API_SERVICE.setMockHardwareStatus(mode);
    setMockHardwareStatusState(mode);
    if (mode === 'disconnected') {
      setHardwareConnected(false);
    } else if (mode === 'connected') {
      setHardwareConnected(true);
    }
  };



  // Derive dynamic telemetry connection state
  const connectionState: TelemetryConnectionState = useMemo(() => {
    if (operatingMode === 'simulation') {
      return isStreamingPaused ? 'disconnected' : 'simulation_active';
    } else {
      // In real_hardware mode: green "Hardware Connected" only when verified hardware connection exists & stream not paused
      return hardwareConnected && !isStreamingPaused ? 'hardware_connected' : 'disconnected';
    }
  }, [operatingMode, isStreamingPaused, hardwareConnected]);



  // When switching to real_hardware mode without an active connection, immediately zero all sensor values
  useEffect(() => {
    if (operatingMode === 'real_hardware' && !hardwareConnected) {
      setSensors(prev => {
        if (prev.temperature === 0 && prev.current === 0 && prev.vibration === 0 && prev.speed === 0) {
          return prev;
        }
        return {
          timestamp: Date.now(),
          temperature: 0,
          current: 0,
          vibration: 0,
          speed: 0,
          doorClosed: false,
          floor: 1,
          direction: 'idle'
        };
      });
    } else if (operatingMode === 'simulation') {
      const preset = SIMULATION_PRESETS.find(p => p.id === (activePresetId || 'nominal')) || SIMULATION_PRESETS[0];
      setSensors({
        ...preset.values,
        timestamp: Date.now()
      });
    }
  }, [operatingMode, hardwareConnected, activePresetId]);



  // Buffer of last 30 telemetry points for line charts
  const [telemetryHistory, setTelemetryHistory] = useState<TelemetryPoint[]>(() => {
    const initial: TelemetryPoint[] = [];
    const now = Date.now();
    for (let i = 25; i >= 0; i--) {
      const ts = now - i * 2000;
      const d = new Date(ts);
      const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
      initial.push({
        timeStr,
        timestamp: ts,
        temperature: +(25.0 + (Math.random() - 0.5) * 0.8).toFixed(1),
        current: +(4.5 + (Math.random() - 0.5) * 0.4).toFixed(2),
        vibration: +(55.0 + (Math.random() - 0.5) * 4.0).toFixed(1),
        speed: +(30.0 + (Math.random() - 0.5) * 2.0).toFixed(1),
        status: 'normal'
      });
    }
    return initial;
  });

  // Track latest hardware packet identity to avoid duplicate history filling
  const lastHwPacketIdRef = useRef<number | string | null>(null);
  const lastHwTimestampRef = useRef<number | null>(null);

  // Synchronize authentic historical records from database when in real_hardware mode
  useEffect(() => {
    if (operatingMode !== 'real_hardware') return;
    let isCancelled = false;

    API_SERVICE.getHardwareTelemetryHistory(30).then(rows => {
      if (isCancelled || !rows || rows.length === 0) return;
      const points: TelemetryPoint[] = rows.map((r: any) => {
        const rawTs = r.timestamp || r.server_receipt_timestamp || Date.now() / 1000;
        const ts = rawTs > 10000000000 ? Math.floor(rawTs) : Math.floor(rawTs * 1000);
        const d = new Date(ts);
        const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
        return {
          timeStr,
          timestamp: ts,
          temperature: typeof r.water_temp_c === 'number' ? +r.water_temp_c.toFixed(2) : 0,
          current: typeof r.led_current_ma === 'number' ? +r.led_current_ma.toFixed(2) : 0,
          vibration: typeof r.vibration_events_per_sec === 'number' ? +r.vibration_events_per_sec.toFixed(2) : 0,
          speed: typeof r.disc_rpm === 'number' ? +r.disc_rpm.toFixed(2) : 0,
          status: (r.diagnostic_status?.toLowerCase() === 'normal' || !r.diagnostic_status) ? 'normal' : 'warning'
        };
      });

      setTelemetryHistory(points);
      const latest = rows[rows.length - 1];
      if (latest) {
        lastHwPacketIdRef.current = latest.packet_id ?? null;
        lastHwTimestampRef.current = latest.timestamp ?? null;
        setSensors(prev => ({
          ...prev,
          timestamp: latest.timestamp > 10000000000 ? latest.timestamp : Math.floor(latest.timestamp * 1000),
          temperature: latest.water_temp_c ?? prev.temperature,
          current: latest.led_current_ma ?? prev.current,
          vibration: latest.vibration_events_per_sec ?? prev.vibration,
          speed: latest.disc_rpm ?? prev.speed,
          doorClosed: null as any,
          floor: null as any,
          direction: null as any
        }));
      }
    }).catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [operatingMode]);



  // Evaluate faults dynamically (combines rule engine with backend RCA if present)
  const localEvaluation = useMemo(() => {
    return evaluateSensors(sensors, thresholds);
  }, [sensors, thresholds]);



  const [hardwareOperatingState, setHardwareOperatingState] = useState<string>('IDLE');



  // Operating State (IDLE / RUNNING / STANDBY) separate from System Condition (NORMAL / WARNING / CRITICAL)
  const operatingState = useMemo(() => {
    if (operatingMode === 'real_hardware') {
      if (!hardwareConnected) return 'STANDBY';
      return hardwareOperatingState || (sensors.speed > 0 ? 'RUNNING' : 'IDLE');
    }
    return sensors.speed > 0 ? 'RUNNING' : 'IDLE';
  }, [operatingMode, hardwareConnected, hardwareOperatingState, sensors.speed]);



  // Active faults: evaluated dynamically from active sensor readings against configured thresholds
  const activeFaults = useMemo(() => {
    if (operatingMode === 'real_hardware' && !hardwareConnected) {
      return [];
    }
    return localEvaluation.faults;
  }, [operatingMode, hardwareConnected, localEvaluation.faults]);



  // Overall system condition: follows the most severe sensor status (CRITICAL > WARNING > NORMAL)
  const systemStatus: SystemStatus = useMemo(() => {
    if (operatingMode === 'real_hardware' && !hardwareConnected) {
      return 'warning'; // Disconnected / stale hardware displays warning status
    }
    return localEvaluation.status;
  }, [operatingMode, hardwareConnected, localEvaluation.status]);



  // System Health metrics: recalculated dynamically whenever underlying readings change
  const motorHealth = useMemo(() => {
    if (operatingMode === 'real_hardware' && !hardwareConnected) {
      return {
        overallHealthScore: 0,
        thermalStressScore: 0,
        electricalStressScore: 0,
        mechanicalVibrationScore: 0,
        status: 'warning' as SystemStatus
      };
    }
    return localEvaluation.motorHealth;
  }, [operatingMode, hardwareConnected, localEvaluation.motorHealth]);



  const mlAnomaly: AnomalyDetectionData | null = useMemo(() => {
    if (operatingMode === 'real_hardware') return null; // ML models run strictly on simulated elevator
    return backendDiagnosis?.anomaly || null;
  }, [operatingMode, backendDiagnosis]);



  const mlFaultClassification: FaultClassificationData | null = useMemo(() => {
    if (operatingMode === 'real_hardware') return null; // ML models run strictly on simulated elevator
    return backendDiagnosis?.faultClassification || null;
  }, [operatingMode, backendDiagnosis]);



  const backendRCA: DetectedFault[] = useMemo(() => {
    return backendDiagnosis?.rca || [];
  }, [backendDiagnosis]);



  // Alert generation state tracker for transition-based logging
  const previousFaultsRef = useRef<Map<string, DetectedFault>>(new Map());



  // Auto-generate alerts on fault occurrence or recovery
  useEffect(() => {
    const now = Date.now();
    const newAlerts: AlertHistoryItem[] = [];
    const currentFaultMap = new Map<string, DetectedFault>();



    activeFaults.forEach(fault => {
      currentFaultMap.set(fault.code, fault);
      if (!previousFaultsRef.current.has(fault.code)) {
        newAlerts.push({
          id: `ALT-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
          timestamp: now,
          faultCode: fault.code,
          faultName: fault.name,
          severity: fault.severity,
          sensorName: fault.sensorResponsible.split('(')[0].trim(),
          sensorValue: fault.triggerValue,
          description: `Breached ${fault.thresholdBreached}. Affected: ${fault.affectedComponent}`,
          acknowledged: false
        });
      }
    });



    previousFaultsRef.current.forEach((prevFault, code) => {
      if (!currentFaultMap.has(code)) {
        newAlerts.push({
          id: `ALT-CLR-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
          timestamp: now,
          faultCode: `${code}-CLR`,
          faultName: `Resolved: ${prevFault.name}`,
          severity: 'normal',
          sensorName: prevFault.sensorResponsible.split('(')[0].trim(),
          sensorValue: 'Nominal Level',
          description: `Fault condition resolved. Telemetry returned to nominal operating limits for ${prevFault.affectedComponent}.`,
          acknowledged: true
        });
      }
    });



    previousFaultsRef.current = currentFaultMap;



    if (newAlerts.length > 0) {
      setAlertHistory(prev => {
        const updated = [...newAlerts, ...prev].slice(0, 100);
        try {
          localStorage.setItem(LOCAL_STORAGE_ALERTS_KEY, JSON.stringify(updated));
        } catch {
          // ignore
        }
        return updated;
      });
    }
  }, [activeFaults]);



  // Persist thresholds whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_THRESHOLDS_KEY, JSON.stringify(thresholds));
    } catch {
      // ignore
    }
  }, [thresholds]);



  // Sync initial thresholds and alerts from backend on initial mount
  useEffect(() => {
    API_SERVICE.getThresholds().then(remoteThresholds => {
      if (remoteThresholds) {
        setThresholds(prev => ({ ...prev, ...remoteThresholds }));
      }
    }).catch(() => {});



    API_SERVICE.getAlerts(30).then(remoteAlerts => {
      if (remoteAlerts && remoteAlerts.length > 0) {
        setAlertHistory(prev => {
          const ids = new Set(prev.map(a => a.id));
          const additions = remoteAlerts.filter(a => !ids.has(a.id));
          return [...additions, ...prev].slice(0, 100);
        });
      }
    }).catch(() => {});
  }, []);



  const systemStatusRef = useRef(systemStatus);
  useEffect(() => {
    systemStatusRef.current = systemStatus;
  }, [systemStatus]);

  // 1-Second Telemetry Tick for Independent Simulation Mode
  useEffect(() => {
    if (isStreamingPaused || operatingMode !== 'simulation') return;



    const interval = setInterval(() => {
      setSensors(prev => {
        let { temperature, current, vibration, speed, doorClosed, floor, direction } = prev;



        if (isSimulatingNoise) {
          const tempJitter = (Math.random() - 0.5) * 0.15;
          const currentJitter = (Math.random() - 0.5) * 0.08;
          const vibJitter = (Math.random() - 0.5) * 0.12;
          const speedJitter = speed > 0 ? (Math.random() - 0.5) * 0.02 : 0;



          temperature = +(temperature + tempJitter).toFixed(1);
          current = +(Math.max(0, current + currentJitter)).toFixed(2);
          vibration = +(Math.max(0, vibration + vibJitter)).toFixed(2);
          speed = +(Math.max(0, speed + speedJitter)).toFixed(2);
        }



        let nextFloor = floor;
        let nextDir = direction;
        if (speed > 0) {
          setCarShaftAnimationProgress(p => {
            let nextP = direction === 'up' ? p + speed * 1.5 : p - speed * 1.5;
            if (nextP >= 95) {
              nextDir = 'down';
              nextP = 95;
            } else if (nextP <= 5) {
              nextDir = 'up';
              nextP = 5;
            }
            nextFloor = Math.max(1, Math.min(12, Math.round(1 + (nextP / 100) * 11)));
            return nextP;
          });
        }



        const now = Date.now();
        const d = new Date(now);
        const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;



        setTelemetryHistory(history => [
          ...history.slice(-29),
          {
            timeStr,
            timestamp: now,
            temperature,
            current,
            vibration,
            speed,
            status: systemStatusRef.current
          }
        ]);



        return {
          ...prev,
          timestamp: now,
          temperature,
          current,
          vibration,
          speed,
          doorClosed,
          floor: nextFloor,
          direction: nextDir
        };
      });
    }, 1500);



    return () => clearInterval(interval);
  }, [operatingMode, isStreamingPaused, isSimulatingNoise]);



  // Telemetry Ingestion via WebSocket (/ws/telemetry) with REST Fallback
  useEffect(() => {
    let isMounted = true;



    // Helper to process telemetry updates from either WebSocket or REST
    const handleBackendPayload = (message: any) => {
      if (!isMounted) return;
      setIsBackendConnected(true);



      const msgType = message.type;
      const msgSource = message.source || message.data?.source;
      const payload = message.data || message;



      // 1. PHYSICAL HARDWARE MESSAGE
      if (msgType === 'hardware_telemetry_update' || msgSource === 'esp32_hardware') {
        const isHw = (msgSource === 'esp32_hardware' || mockHardwareStatus === 'connected');
        setHardwareConnected(isHw);



        if (operatingMode === 'real_hardware' && !isStreamingPaused) {
          if (!isHw) {
            setSensors({
              timestamp: Date.now(),
              temperature: 0,
              current: 0,
              vibration: 0,
              speed: 0,
              doorClosed: false,
              floor: 1,
              direction: 'idle'
            });
            return;
          }
          const hwData = payload;
          if (hwData.operating_state) {
            setHardwareOperatingState(hwData.operating_state);
          }

          const rawTs = hwData.timestamp || hwData.server_receipt_timestamp || Date.now() / 1000;
          const packetId = hwData.packet_id;

          const isDuplicate = (packetId != null && packetId === lastHwPacketIdRef.current) ||
                              (packetId == null && rawTs === lastHwTimestampRef.current);

          if (packetId != null) lastHwPacketIdRef.current = packetId;
          lastHwTimestampRef.current = rawTs;

          const now = rawTs > 10000000000 ? Math.floor(rawTs) : Math.floor(rawTs * 1000);
          const d = new Date(now);
          const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;

          let temp = typeof hwData.water_temp_c === 'number' ? hwData.water_temp_c : 0;
          let curr = typeof hwData.led_current_ma === 'number' ? hwData.led_current_ma : 0;
          let vib = typeof hwData.vibration_events_per_sec === 'number' ? hwData.vibration_events_per_sec : 0;
          let spd = typeof hwData.disc_rpm === 'number' ? hwData.disc_rpm : 0;

          if (isSimulatingNoise) {
            temp = +(temp + (Math.random() - 0.5) * 0.1).toFixed(2);
            curr = +(Math.max(0, curr + (Math.random() - 0.5) * 0.08)).toFixed(2);
            vib = +(Math.max(0, vib + (Math.random() - 0.5) * 0.1)).toFixed(2);
            spd = +(Math.max(0, spd + (Math.random() - 0.5) * 0.1)).toFixed(2);
          }

          setSensors(prev => ({
            ...prev,
            timestamp: now,
            temperature: temp,
            current: curr,
            vibration: vib,
            speed: spd,
            doorClosed: null as any,
            floor: null as any,
            direction: null as any
          }));

          if (!isDuplicate || isSimulatingNoise) {
            setTelemetryHistory(history => [
              ...history.slice(-29),
              {
                timeStr,
                timestamp: now,
                temperature: temp,
                current: curr,
                vibration: vib,
                speed: spd,
                status: hwData.diagnostic_status || 'normal'
              }
            ]);
          }
        }
        return; // Stop here: hardware data NEVER triggers legacy elevator ML/RCA
      }



      // 2. SIMULATION MESSAGE (telemetry_update)
      if (msgType === 'telemetry_update' || msgSource === 'simulated') {
        // If the user selected real_hardware mode, NEVER allow simulated messages to overwrite hardware telemetry
        if (operatingMode === 'real_hardware') {
          return;
        }



        const tele = payload.telemetry || payload;
        const now = tele.timestamp ? Math.floor(tele.timestamp > 10000000000 ? tele.timestamp : tele.timestamp * 1000) : Date.now();



        // Live Backend ML & RCA diagnosis updates exclusively for simulated elevator
        if (payload.anomaly && payload.fault_prediction) {
          setBackendDiagnosis({
            timestamp: now,
            systemStatus: payload.status || 'normal',
            anomaly: {
              isAnomaly: payload.anomaly.is_anomaly,
              anomalyScore: payload.anomaly.anomaly_score,
              modelVersion: payload.anomaly.model_version
            },
            faultClassification: {
              predictedFault: payload.fault_prediction.predicted_fault,
              confidence: payload.fault_prediction.confidence,
              probabilities: payload.fault_prediction.probabilities || {},
              modelVersion: payload.fault_prediction.model_version
            },
            rca: payload.rca || [],
            motorHealth: payload.motor_health || {
              overallHealthScore: 85,
              thermalStressScore: 85,
              electricalStressScore: 85,
              mechanicalVibrationScore: 85,
              status: 'normal'
            }
          });
        }
      }
    };



    // 1. Establish persistent WebSocket connection to ws://localhost:8000/ws/telemetry
    const wsController = API_SERVICE.createTelemetryWebSocket(
      (data) => {
        handleBackendPayload(data);
      },
      (connected) => {
        if (!isMounted) return;
        setIsBackendConnected(connected);
        if (!connected && mockHardwareStatus !== 'connected') {
          setHardwareConnected(false);
        }
      }
    );



    // 2. Periodic REST poll fallback (ensures sync even if WebSocket is disconnected or in mock mode)
    const pollRest = async () => {
      if (isStreamingPaused) {
        if (isMounted && operatingMode === 'real_hardware') setHardwareConnected(false);
        return;
      }
      try {
        if (operatingMode === 'real_hardware') {
          const result = await API_SERVICE.fetchHardwareTelemetry();
          if (!isMounted) return;
          if (result.connected && result.data) {
            setIsBackendConnected(true);
            setHardwareConnected(true);
            if (result.packet?.operating_state) {
              setHardwareOperatingState(result.packet.operating_state);
            }
            const packetId = result.packet?.packet_id;
            const rawTs = result.packet?.timestamp || result.data.timestamp || Date.now() / 1000;

            const isDuplicate = (packetId != null && packetId === lastHwPacketIdRef.current) ||
                                (packetId == null && rawTs === lastHwTimestampRef.current);

            let { temperature, current, vibration, speed } = result.data;

            if (packetId != null) lastHwPacketIdRef.current = packetId;
            lastHwTimestampRef.current = rawTs;

            const now = rawTs > 10000000000 ? Math.floor(rawTs) : Math.floor(rawTs * 1000);
            const d = new Date(now);
            const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;

            if (isSimulatingNoise) {
              temperature = +(temperature + (Math.random() - 0.5) * 0.1).toFixed(2);
              current = +(Math.max(0, current + (Math.random() - 0.5) * 0.08)).toFixed(2);
              vibration = +(Math.max(0, vibration + (Math.random() - 0.5) * 0.1)).toFixed(2);
              speed = +(Math.max(0, speed + (Math.random() - 0.5) * 0.1)).toFixed(2);
            }

            setSensors(prev => ({
              ...prev,
              timestamp: now,
              temperature,
              current,
              vibration,
              speed,
              doorClosed: null as any,
              floor: null as any,
              direction: null as any
            }));

            if (!isDuplicate || isSimulatingNoise) {
              setTelemetryHistory(history => [
                ...history.slice(-29),
                {
                  timeStr,
                  timestamp: now,
                  temperature,
                  current,
                  vibration,
                  speed,
                  status: (result.packet?.diagnostic_status?.toLowerCase() === 'normal' || !result.packet?.diagnostic_status) ? 'normal' : 'warning'
                }
              ]);
            }
          } else {
            setHardwareConnected(false);
            setSensors(prev => {
              if (prev.temperature === 0 && prev.current === 0 && prev.vibration === 0 && prev.speed === 0) {
                return prev;
              }
              return {
                timestamp: Date.now(),
                temperature: 0,
                current: 0,
                vibration: 0,
                speed: 0,
                doorClosed: false,
                floor: 1,
                direction: 'idle'
              };
            });
          }
        }
      } catch {
        if (isMounted && operatingMode === 'real_hardware') {
          setHardwareConnected(false);
          setSensors(prev => {
            if (prev.temperature === 0 && prev.current === 0 && prev.vibration === 0 && prev.speed === 0) {
              return prev;
            }
            return {
              timestamp: Date.now(),
              temperature: 0,
              current: 0,
              vibration: 0,
              speed: 0,
              doorClosed: false,
              floor: 1,
              direction: 'idle'
            };
          });
        }
      }
    };



    const pollInterval = setInterval(pollRest, 3000);



    return () => {
      isMounted = false;
      wsController.disconnect();
      clearInterval(pollInterval);
    };
  }, [operatingMode, isStreamingPaused, mockHardwareStatus]);



  // Actions
  const appendTelemetryHistory = (nextSensors: SensorData) => {
    const d = new Date(nextSensors.timestamp);
    const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
    setTelemetryHistory(history => [
      ...history.slice(-29),
      {
        timeStr,
        timestamp: nextSensors.timestamp,
        temperature: nextSensors.temperature,
        current: nextSensors.current,
        vibration: nextSensors.vibration,
        speed: nextSensors.speed,
        status: systemStatus
      }
    ]);
  };



  const updateSensors = (partial: Partial<SensorData>) => {
    setActivePresetId(null);
    setSensors(prev => {
      const next = {
        ...prev,
        ...partial,
        timestamp: Date.now()
      };
      appendTelemetryHistory(next);
      return next;
    });
  };



  const applyPreset = (presetId: string) => {
    const preset = SIMULATION_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    setActivePresetId(preset.id);



    // Apply to local sensors
    setSensors(prev => {
      const next = {
        ...prev,
        ...preset.values,
        timestamp: Date.now()
      };
      appendTelemetryHistory(next);
      return next;
    });



    // In real_hardware / backend mode, notify backend to synchronize scenario
    if (operatingMode === 'real_hardware') {
      API_SERVICE.setSimulationScenario(presetId).catch(() => {});
    }
  };



  const resetToNominal = () => {
    applyPreset('nominal');
  };



  const updateThresholds = (partial: Partial<SensorThresholds>) => {
    const updated = { ...thresholds, ...partial };
    setThresholds(updated);
    // Sync to backend
    API_SERVICE.updateThresholds(updated).catch(() => {});
  };



  const resetThresholdsToDefaults = () => {
    setThresholds(DEFAULT_THRESHOLDS);
    API_SERVICE.updateThresholds(DEFAULT_THRESHOLDS).catch(() => {});
  };



  const toggleSimulatingNoise = () => {
    setIsSimulatingNoise(prev => !prev);
  };



  const toggleStreamingPause = () => {
    setIsStreamingPaused(prev => !prev);
  };



  const acknowledgeAlert = (alertId: string) => {
    setAlertHistory(prev => {
      const updated = prev.map(item => (item.id === alertId ? { ...item, acknowledged: true } : item));
      try {
        localStorage.setItem(LOCAL_STORAGE_ALERTS_KEY, JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
    // Sync to backend in background
    API_SERVICE.acknowledgeAlert(alertId).catch(() => {});
  };



  const clearAlert = (alertId: string) => {
    setAlertHistory(prev => {
      const updated = prev.filter(item => item.id !== alertId);
      try {
        localStorage.setItem(LOCAL_STORAGE_ALERTS_KEY, JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  };



  const clearAllAlerts = () => {
    setAlertHistory([]);
    try {
      localStorage.removeItem(LOCAL_STORAGE_ALERTS_KEY);
    } catch {
      // ignore
    }
  };



  return (
    <ElevatorContext.Provider
      value={{
        sensors,
        thresholds,
        systemStatus,
        operatingState,
        activeFaults,
        motorHealth,
        telemetryHistory,
        alertHistory,
        operatingMode,
        isSimulatingNoise,
        isStreamingPaused,
        activePresetId,
        connectionState,
        hardwareConnected,
        isBackendConnected,
        mockHardwareStatus,
        setMockHardwareStatus,
        backendDiagnosis,
        mlAnomaly,
        mlFaultClassification,
        backendRCA,
        updateSensors,
        applyPreset,
        resetToNominal,
        updateThresholds,
        resetThresholdsToDefaults,
        setOperatingMode,
        toggleSimulatingNoise,
        toggleStreamingPause,
        acknowledgeAlert,
        clearAlert,
        clearAllAlerts,
        carShaftAnimationProgress
      }}
    >
      {children}
    </ElevatorContext.Provider>
  );
};



export function useElevator() {
  const context = useContext(ElevatorContext);
  if (!context) {
    throw new Error('useElevator must be used within an ElevatorProvider');
  }
  return context;
}

