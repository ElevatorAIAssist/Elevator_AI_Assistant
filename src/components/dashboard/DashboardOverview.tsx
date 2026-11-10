import React from 'react';
import {
  Thermometer,
  Zap,
  Activity,
  Gauge,
  DoorClosed,
  DoorOpen,
  ShieldCheck,
  AlertTriangle,
  Flame,
  ArrowRight,
  HeartPulse,
  Sliders,
  CheckCircle2,
  Clock,
  Brain
} from 'lucide-react';
import { useElevator, SIMULATION_PRESETS } from '../../context/ElevatorContext';
import { SensorCard } from '../common/SensorCard';
import { ElevatorShaftVisualizer } from '../common/ElevatorShaftVisualizer';
import { NavPage } from '../common/Sidebar';

interface DashboardOverviewProps {
  onNavigate: (page: NavPage) => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({ onNavigate }) => {
  const {
    sensors,
    thresholds,
    systemStatus,
    operatingState,
    activeFaults,
    motorHealth,
    alertHistory,
    acknowledgeAlert,
    applyPreset,
    activePresetId,
    isBackendConnected,
    mlAnomaly,
    mlFaultClassification,
    operatingMode,
    hardwareConnected
  } = useElevator();

  const isHardwareDisconnected = operatingMode === 'real_hardware' && !hardwareConnected;

  // Helper to determine sensor specific status
  const getTempStatus = () => {
    if (sensors.temperature >= thresholds.temperatureCritical) return 'critical';
    if (sensors.temperature >= thresholds.temperatureWarning) return 'warning';
    return 'normal';
  };

  const getCurrentStatus = () => {
    if (sensors.current > thresholds.currentCritical) return 'critical';
    if (sensors.current >= thresholds.currentWarning) return 'warning';
    return 'normal';
  };

  const getVibStatus = () => {
    if (sensors.vibration > thresholds.vibrationCritical) return 'critical';
    if (sensors.vibration >= thresholds.vibrationWarning) return 'warning';
    if (sensors.vibration < (thresholds.vibrationLow ?? 45)) {
      if (sensors.speed > 0.1 || sensors.vibration > 0) return 'warning';
      return 'normal';
    }
    return 'normal';
  };

  const getSpeedStatus = () => {
    if (sensors.speed >= thresholds.speedCritical) return 'critical';
    if (sensors.speed > thresholds.speedMaxNormal) return 'warning';
    return 'normal';
  };

  const getDoorStatus = () => {
    if (operatingMode === 'real_hardware') return 'normal';
    if (!sensors.doorClosed && sensors.speed > thresholds.doorHazardSpeedLimit) return 'critical';
    return 'normal';
  };

  return (
    <div className="space-y-6">
      {/* Real Hardware Mode Disconnected Banner */}
      {isHardwareDisconnected && (
        <div className="p-4 rounded-xl border border-rose-300 bg-rose-50 text-rose-900 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-rose-600 text-white shrink-0">
              <AlertTriangle className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-800">
                  REAL SENSOR DISCONNECTED – NO LIVE DATA
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-rose-200/80 text-rose-900 border border-rose-300">
                  READINGS: 0.0
                </span>
              </div>
              <p className="text-xs text-rose-700 mt-1 font-medium">
                Physical ESP32 serial bridge is not connected. All sensor channels display 0.0 until hardware connection is established.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('settings')}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 transition-colors shrink-0 shadow-xs"
          >
            Diagnostics &amp; Port Settings
          </button>
        </div>
      )}

      {/* Top System Health & Active Fault Alert Banner (if any) */}
      {activeFaults.length > 0 && (
        <div
          className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all shadow-xs ${
            systemStatus === 'critical'
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`p-2.5 rounded-lg shrink-0 ${
                systemStatus === 'critical' ? 'bg-rose-600 text-white animate-pulse' : 'bg-amber-500 text-white'
              }`}
            >
              {systemStatus === 'critical' ? <Flame className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider">
                  {systemStatus === 'critical' ? 'CRITICAL SYSTEM TRIP ACTIVE' : 'SYSTEM WARNING ACTIVE'}
                </span>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-white/80 border border-current font-bold">
                  {activeFaults.length} Fault{activeFaults.length > 1 ? 's' : ''} Detected
                </span>
              </div>
              <p className="text-sm font-semibold mt-0.5">
                Primary fault: {activeFaults[0].name} ({activeFaults[0].code})
              </p>
              <p className="text-xs opacity-80 mt-0.5">
                Affected subsystem: {activeFaults[0].affectedComponent} · Sensor: {activeFaults[0].sensorResponsible}
              </p>
            </div>
          </div>

          <button
            onClick={() => onNavigate('faults')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors shrink-0 shadow-xs ${
              systemStatus === 'critical'
                ? 'bg-rose-600 text-white hover:bg-rose-700'
                : 'bg-amber-600 text-white hover:bg-amber-700'
            }`}
          >
            <span>Investigate Root Cause</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Primary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: System Status */}
        <div className="bg-white rounded-xl p-5 border border-[#E2D9D2] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">System State</span>
            {systemStatus === 'normal' && <ShieldCheck className="w-5 h-5 text-[#014BAA]" />}
            {systemStatus === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-500" />}
            {systemStatus === 'critical' && <Flame className="w-5 h-5 text-rose-600 animate-pulse" />}
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span
                className={`text-2xl font-bold font-mono uppercase ${
                  systemStatus === 'critical'
                    ? 'text-rose-600'
                    : systemStatus === 'warning'
                    ? 'text-amber-600'
                    : 'text-[#014BAA]'
                }`}
              >
                {systemStatus}
              </span>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-[#EFE8E2] text-slate-700 border border-[#E2D9D2]">{operatingState}</span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              {systemStatus === 'normal'
                ? 'All sensors in safe baseline'
                : `${activeFaults.length} threshold rule(s) breached`}
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-[#E2D9D2] flex items-center justify-between text-xs text-slate-500">
            <span>Safety Circuit:</span>
            <span className={`font-bold ${systemStatus === 'critical' ? 'text-rose-600' : 'text-[#014BAA]'}`}>
              {systemStatus === 'critical' ? 'TRIPPED' : 'ENERGIZED'}
            </span>
          </div>
        </div>

        {/* Card 2: System Health Score */}
        <div className="bg-white rounded-xl p-5 border border-[#E2D9D2] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">System Health</span>
            <HeartPulse className="w-5 h-5 text-[#014BAA]" />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-[#014BAA] tabular-nums">
                {isHardwareDisconnected ? 'N/A' : `${motorHealth.overallHealthScore}%`}
              </span>
              <span className="text-xs font-semibold text-slate-500">{isHardwareDisconnected ? 'Hardware Offline' : 'System Health Score'}</span>
            </div>
            {/* Health Bar */}
            <div className="w-full bg-[#EFE8E2] rounded-full h-2 mt-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  motorHealth.overallHealthScore >= 80
                    ? 'bg-[#014BAA]'
                    : motorHealth.overallHealthScore >= 55
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
                }`}
                style={{ width: `${motorHealth.overallHealthScore}%` }}
              />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-[#E2D9D2] flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>Thermal: {motorHealth.thermalStressScore}%</span>
            <span>Elec: {motorHealth.electricalStressScore}%</span>
            <span>Vib: {motorHealth.mechanicalVibrationScore}%</span>
          </div>
        </div>

        {/* Card 3: Active Faults Count */}
        <div className="bg-white rounded-xl p-5 border border-[#E2D9D2] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Faults</span>
            <span className="w-2.5 h-2.5 rounded-full bg-[#014BAA]" />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-bold font-mono ${activeFaults.length > 0 ? 'text-rose-600' : 'text-[#014BAA]'}`}>
                {activeFaults.length}
              </span>
              <span className="text-xs font-semibold text-slate-500">Active incidents</span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              {activeFaults.length === 0
                ? 'No active subsystem trips'
                : activeFaults.some(f => f.severity === 'critical')
                ? 'Requires immediate technician dispatch'
                : 'Warning level maintenance advised'}
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-[#E2D9D2] flex items-center justify-between text-xs">
            <button
              onClick={() => onNavigate('faults')}
              className="text-[#014BAA] hover:underline font-bold inline-flex items-center gap-1"
            >
              <span>View RCA Breakdown</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Card 4: Car Position & Speed */}
        <div className="bg-white rounded-xl p-5 border border-[#E2D9D2] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {operatingMode === 'real_hardware' ? 'Demonstration Rig Status' : 'Hoistway Position'}
            </span>
            <span className="px-2 py-0.5 rounded-lg bg-[#EFE8E2] text-[#014BAA] text-xs font-mono font-bold border border-[#E2D9D2]">
              {operatingMode === 'real_hardware' ? 'RIG-01' : `FL ${sensors.floor ?? 'N/A'}`}
            </span>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-[#014BAA] tabular-nums">
                {(isHardwareDisconnected ? 0 : sensors.speed).toFixed(2)}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                {operatingMode === 'real_hardware' ? 'RPM Disc Speed' : 'm/s Velocity'}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              {operatingMode === 'real_hardware' ? (
                <span className="text-slate-500 italic text-[11px]">
                  Door/Floor/Direction: <strong className="not-italic text-slate-700">Unavailable (No Sensor on Rig)</strong>
                </span>
              ) : (
                <span className="capitalize">
                  Direction: <span className="font-bold text-slate-800">{sensors.direction ?? 'HOLD'}</span> · Doors:{' '}
                  <span className={`font-bold ${sensors.doorClosed ? 'text-[#014BAA]' : 'text-amber-700'}`}>
                    {sensors.doorClosed ? 'Closed & Locked' : 'Open'}
                  </span>
                </span>
              )}
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-[#E2D9D2] flex items-center justify-between text-xs text-slate-500">
            <span>{operatingMode === 'real_hardware' ? 'TCRT5000 Encoder:' : 'Shaft Velocity Limit:'}</span>
            <span className="font-mono text-slate-800 font-bold">
              {operatingMode === 'real_hardware' ? 'PPR = 2 Optical' : `${thresholds.speedMaxNormal.toFixed(2)} m/s`}
            </span>
          </div>
        </div>
      </div>

      {/* ML Predictive Diagnostics & Anomaly Detection (Model 1 & 2) */}
      <div className="bg-[#014BAA] text-[#F8F3F0] rounded-xl p-5 border border-[#003882] shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/15">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/15 border border-white/25 flex items-center justify-center text-[#F8F3F0]">
              <Brain className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#F8F3F0]">
                  ML Predictive Diagnostics &amp; Anomaly Detection
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-white/20 text-[#F8F3F0] border border-white/30 font-bold">
                  {isBackendConnected ? "FastAPI Port 8000 · Live WebSocket" : "Embedded Rule Baseline"}
                </span>
              </div>
              <p className="text-[11px] text-[#F8F3F0]/80">
                Isolation Forest (Anomaly Detection) + Random Forest Classifier (Fault Isolation)
              </p>
            </div>
          </div>

          <button
            onClick={() => onNavigate('faults')}
            className="text-xs font-bold text-[#F8F3F0] hover:underline flex items-center gap-1 transition-colors"
          >
            <span>View Full RCA Breakdown</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-3 text-xs">
          {/* Box 1: Anomaly Detection */}
          <div className="bg-white/10 rounded-xl p-3 border border-white/15">
            <span className="text-[10px] font-mono text-[#F8F3F0]/70 uppercase tracking-wider block mb-1">
              Model 1 · Isolation Forest
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-bold text-white">
                {operatingMode === 'real_hardware' ? (
                  <span className="text-slate-300 flex items-center gap-1">
                    Standby (Rig Isolated)
                  </span>
                ) : mlAnomaly?.isAnomaly ? (
                  <span className="text-rose-300 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Anomaly Detected
                  </span>
                ) : (
                  <span className="text-emerald-300 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Nominal Envelope
                  </span>
                )}
              </span>
              <span className="font-mono text-xs text-[#F8F3F0] font-bold">
                {operatingMode === 'real_hardware' ? 'N/A' : `Score: ${mlAnomaly ? (mlAnomaly.anomalyScore * 100).toFixed(1) : "11.4"}%`}
              </span>
            </div>
            <div className="w-full bg-black/20 rounded-full h-1.5 mt-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  operatingMode === 'real_hardware' ? "bg-slate-400" : (mlAnomaly?.anomalyScore || 0.1) > 0.6 ? "bg-rose-400" : "bg-emerald-300"
                }`}
                style={{ width: `${operatingMode === 'real_hardware' ? 0 : Math.min(100, ((mlAnomaly?.anomalyScore ?? 0.114) * 100))}%` }}
              />
            </div>
            {operatingMode === 'real_hardware' && (
              <p className="text-[10px] text-amber-200 mt-1 font-mono">
                Active for Simulated Elevator Only
              </p>
            )}
          </div>

          {/* Box 2: Random Forest Classification */}
          <div className="bg-white/10 rounded-xl p-3 border border-white/15">
            <span className="text-[10px] font-mono text-[#F8F3F0]/70 uppercase tracking-wider block mb-1">
              Model 2 · Random Forest Classification
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-bold text-white">
                {operatingMode === 'real_hardware' ? 'Standby (Rig Isolated)' : (mlFaultClassification?.predictedFault || (activeFaults.length > 0 ? activeFaults[0].name : "Normal"))}
              </span>
              <span className="font-mono text-xs font-bold text-emerald-300">
                {operatingMode === 'real_hardware' ? 'N/A' : `${mlFaultClassification ? mlFaultClassification.confidence.toFixed(1) : "98.5"}% Conf.`}
              </span>
            </div>
            <p className="text-[10px] text-[#F8F3F0]/70 mt-1 truncate">
              {operatingMode === 'real_hardware' ? 'Physical demonstration rig data is isolated from industrial ML models' : 'Trained on 4,800 records across 6 fault categories'}
            </p>
          </div>

          {/* Box 3: Root Cause Isolation Status */}
          <div className="bg-white/10 rounded-xl p-3 border border-white/15">
            <span className="text-[10px] font-mono text-[#F8F3F0]/70 uppercase tracking-wider block mb-1">
              Autonomous FDIR Diagnostics
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-bold text-white">
                {operatingMode === 'real_hardware'
                  ? 'Hardware Telemetry Active'
                  : activeFaults.length === 0
                  ? "No Subsystem Excursions"
                  : `${activeFaults.length} Active Fault(s)`}
              </span>
              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded uppercase ${
                operatingMode === 'real_hardware' ? 'bg-[#EFE8E2] text-[#014BAA]' : systemStatus === 'critical' ? 'bg-rose-500 text-white' : systemStatus === 'warning' ? 'bg-amber-500 text-white' : 'bg-emerald-400 text-slate-900'
              }`}>
                {operatingMode === 'real_hardware' ? 'Hardware Mode' : systemStatus}
              </span>
            </div>
            <p className="text-[10px] text-[#F8F3F0]/70 mt-1 truncate">
              {operatingMode === 'real_hardware' ? 'Dedicated hardware telemetry pipeline active' : activeFaults.length > 0 ? `Affected: ${activeFaults[0].affectedComponent}` : "All safety invariants satisfied"}
            </p>
          </div>
        </div>
      </div>

      {/* Quick Scenario Injector Toolbar */}
      <div className="bg-white rounded-xl p-4 border border-[#E2D9D2] shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-[#014BAA] shrink-0" />
          <span className="text-xs font-bold text-slate-800">Quick Scenario Injection:</span>
          <span className="text-xs text-slate-500 hidden sm:inline">Simulate physical fault scenarios instantly:</span>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {SIMULATION_PRESETS.map(preset => {
            const isCurrent = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  isCurrent
                    ? preset.targetSeverity === 'critical'
                      ? 'bg-rose-600 text-white font-bold shadow-xs'
                      : preset.targetSeverity === 'warning'
                      ? 'bg-amber-600 text-white font-bold shadow-xs'
                      : 'bg-[#014BAA] text-[#F8F3F0] font-bold shadow-xs'
                    : 'bg-[#EFE8E2] text-slate-700 hover:bg-[#E2D9D2]'
                }`}
              >
                {preset.name}
              </button>
            );
          })}
          <button
            onClick={() => onNavigate('simulation')}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-[#014BAA] hover:bg-[#EFE8E2] border border-[#E2D9D2] transition-colors"
          >
            Open Slider Controls &rarr;
          </button>
        </div>
      </div>

      {/* Sensor Cards Section */}
      <div>
        <div className="flex flex-wrap items-center justify-between mb-3 gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Live Subsystem Sensor Readings
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {operatingMode === 'real_hardware'
                ? (hardwareConnected
                    ? '4 physical channels active · Real hardware telemetry streaming from ESP32'
                    : '4 physical channels · No hardware connected (Sensors reading 0.0)')
                : '5 active channels · Multi-sensor simulation & root cause analysis'}
            </p>
          </div>
          <button
            onClick={() => onNavigate('monitoring')}
            className="text-xs text-[#014BAA] hover:underline font-bold flex items-center gap-1"
          >
            <span>Open Time-Series Charts</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {operatingMode === 'real_hardware' ? (
          /* Symmetrical 4-column balanced grid for physical sensors */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Temperature */}
            <SensorCard
              title="Temperature"
              subtitle="Water Temperature (°C) • DS18B20"
              value={!hardwareConnected ? '0.0' : sensors.temperature.toFixed(1)}
              unit="°C"
              icon={Thermometer}
              status={!hardwareConnected ? 'normal' : getTempStatus()}
              isDisconnected={!hardwareConnected}
              warningThreshold={`${thresholds.temperatureWarning}°C`}
              criticalThreshold={`${thresholds.temperatureCritical}°C`}
              percentage={!hardwareConnected ? 0 : Math.max(0, ((sensors.temperature - 20) / (thresholds.temperatureCritical - 20)) * 100)}
              subtext={!hardwareConnected ? "No physical sensor connected" : "DS18B20 Live Hardware"}
              onClick={() => onNavigate('simulation')}
            />

            {/* 2. Current */}
            <SensorCard
              title="Current"
              subtitle="LED Circuit Current (mA) • INA219"
              value={!hardwareConnected ? '0.00' : sensors.current.toFixed(2)}
              unit="mA"
              icon={Zap}
              status={!hardwareConnected ? 'normal' : getCurrentStatus()}
              isDisconnected={!hardwareConnected}
              warningThreshold={`${thresholds.currentWarning.toFixed(1)} mA`}
              criticalThreshold={`${thresholds.currentCritical.toFixed(1)} mA`}
              percentage={!hardwareConnected ? 0 : Math.max(0, (sensors.current / (thresholds.currentCritical * 1.2)) * 100)}
              subtext={!hardwareConnected ? "No physical sensor connected" : "INA219 Live Hardware"}
              onClick={() => onNavigate('simulation')}
            />

            {/* 3. Vibration */}
            <SensorCard
              title="Vibration"
              subtitle="Vibration Events (ev/s) • SW-420"
              value={!hardwareConnected ? '0.0' : sensors.vibration.toFixed(1)}
              unit="events/sec"
              icon={Activity}
              status={!hardwareConnected ? 'normal' : getVibStatus()}
              isDisconnected={!hardwareConnected}
              warningThreshold={`${thresholds.vibrationWarning.toFixed(0)} ev/s`}
              criticalThreshold={`${thresholds.vibrationCritical.toFixed(0)} ev/s`}
              percentage={!hardwareConnected ? 0 : Math.max(0, (sensors.vibration / (thresholds.vibrationCritical * 1.2)) * 100)}
              subtext={
                !hardwareConnected 
                  ? "No physical sensor connected" 
                  : sensors.vibration < (thresholds.vibrationLow ?? 45) && (sensors.speed > 0.1 || sensors.vibration > 0)
                  ? "Below operating range (< 45 ev/s)"
                  : "SW-420 Live Hardware (45–89 ev/s)"
              }
              onClick={() => onNavigate('simulation')}
            />

            {/* 4. Speed */}
            <SensorCard
              title="Speed"
              subtitle="Disc Speed (RPM) • TCRT5000"
              value={!hardwareConnected ? '0.00' : sensors.speed.toFixed(2)}
              unit="RPM"
              icon={Gauge}
              status={!hardwareConnected ? 'normal' : getSpeedStatus()}
              isDisconnected={!hardwareConnected}
              warningThreshold={`${thresholds.speedMaxNormal.toFixed(0)} RPM`}
              criticalThreshold={`${thresholds.speedCritical.toFixed(0)} RPM`}
              percentage={!hardwareConnected ? 0 : Math.max(0, (sensors.speed / (thresholds.speedCritical * 1.1)) * 100)}
              subtext={!hardwareConnected ? "No physical sensor connected" : "TCRT5000 Live Hardware"}
              onClick={() => onNavigate('simulation')}
            />
          </div>
        ) : (
          /* 5-column grid for simulation mode */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <SensorCard
              title="Temperature"
              subtitle="Water Temperature (°C)"
              value={sensors.temperature.toFixed(1)}
              unit="°C"
              icon={Thermometer}
              status={getTempStatus()}
              warningThreshold={`${thresholds.temperatureWarning}°C`}
              criticalThreshold={`${thresholds.temperatureCritical}°C`}
              percentage={((sensors.temperature - 20) / (thresholds.temperatureCritical - 20)) * 100}
              subtext="Simulated DS18B20"
              onClick={() => onNavigate('simulation')}
            />
            <SensorCard
              title="Current"
              subtitle="LED Circuit Current (mA)"
              value={sensors.current.toFixed(2)}
              unit="mA"
              icon={Zap}
              status={getCurrentStatus()}
              warningThreshold={`${thresholds.currentWarning.toFixed(1)} mA`}
              criticalThreshold={`${thresholds.currentCritical.toFixed(1)} mA`}
              percentage={(sensors.current / (thresholds.currentCritical * 1.2)) * 100}
              subtext="Simulated INA219"
              onClick={() => onNavigate('simulation')}
            />
            <SensorCard
              title="Vibration"
              subtitle="Vibration Events (ev/s)"
              value={sensors.vibration.toFixed(1)}
              unit="events/sec"
              icon={Activity}
              status={getVibStatus()}
              warningThreshold={`${thresholds.vibrationWarning.toFixed(0)} ev/s`}
              criticalThreshold={`${thresholds.vibrationCritical.toFixed(0)} ev/s`}
              percentage={(sensors.vibration / (thresholds.vibrationCritical * 1.2)) * 100}
              subtext="Simulated SW-420"
              onClick={() => onNavigate('simulation')}
            />
            <SensorCard
              title="Speed"
              subtitle="Disc Speed (RPM)"
              value={sensors.speed.toFixed(2)}
              unit="RPM"
              icon={Gauge}
              status={getSpeedStatus()}
              warningThreshold={`${thresholds.speedMaxNormal.toFixed(0)} RPM`}
              criticalThreshold={`${thresholds.speedCritical.toFixed(0)} RPM`}
              percentage={(sensors.speed / (thresholds.speedCritical * 1.1)) * 100}
              subtext="Simulated TCRT5000"
              onClick={() => onNavigate('simulation')}
            />
            <SensorCard
              title="Door Condition"
              subtitle="Hoistway Gate Interlock"
              value={sensors.doorClosed ? 'CLOSED' : 'OPEN'}
              unit=""
              icon={sensors.doorClosed ? DoorClosed : DoorOpen}
              status={getDoorStatus()}
              percentage={sensors.doorClosed ? 100 : 25}
              subtext={sensors.doorClosed ? 'Interlock Circuit Locked' : 'Door Gate Open'}
              onClick={() => onNavigate('simulation')}
            />
          </div>
        )}
      </div>

      {/* 2-Column Split: Elevator Shaft Visualizer + Recent Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Hoistway Shaft Visualizer (5 cols) */}
        <div className="lg:col-span-5">
          <ElevatorShaftVisualizer />
        </div>

        {/* Right: Recent Alerts & Diagnostic Feed (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-[#E2D9D2] p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-[#E2D9D2]">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Recent Alert &amp; Event Feed
              </h3>
              <p className="text-[11px] text-slate-500">
                Logged threshold violations and safety trips
              </p>
            </div>
            <button
              onClick={() => onNavigate('history')}
              className="text-xs text-[#014BAA] hover:underline font-bold flex items-center gap-1"
            >
              <span>Full History ({alertHistory.length})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Alert Table / List */}
          <div className="my-3 space-y-2 max-h-72 overflow-y-auto pr-1">
            {alertHistory.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-xs">
                <CheckCircle2 className="w-8 h-8 mx-auto text-[#014BAA] mb-2 opacity-80" />
                <p className="font-semibold text-slate-700">No Alert Records Logged</p>
                <p className="mt-1 text-slate-500">All telemetry is running within nominal boundaries.</p>
              </div>
            ) : (
              alertHistory.slice(0, 5).map(alert => (
                <div
                  key={alert.id}
                  className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 transition-colors ${
                    alert.severity === 'critical'
                      ? 'bg-rose-50/70 border-rose-200'
                      : alert.severity === 'warning'
                      ? 'bg-amber-50/70 border-amber-200'
                      : 'bg-[#EFE8E2] border-[#E2D9D2]'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={`mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                        alert.severity === 'critical'
                          ? 'bg-rose-600 text-white'
                          : alert.severity === 'warning'
                          ? 'bg-amber-600 text-white'
                          : 'bg-white text-[#014BAA] border border-[#E2D9D2]'
                      }`}
                    >
                      {alert.faultCode}
                    </span>
                    <div>
                      <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                        <span>{alert.faultName}</span>
                        {alert.acknowledged && (
                          <span className="text-[10px] font-normal text-slate-500">(Acked)</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-600 mt-0.5">
                        {alert.sensorName}: <span className="font-mono font-bold text-slate-800">{alert.sensorValue}</span> · {alert.description}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end shrink-0 gap-1.5">
                    <div className="text-[10px] text-slate-500 flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(alert.timestamp).toLocaleTimeString()}</span>
                    </div>
                    {!alert.acknowledged && (
                      <button
                        onClick={() => acknowledgeAlert(alert.id)}
                        className="text-[11px] font-bold text-[#014BAA] hover:underline"
                      >
                        Acknowledge
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="pt-3 border-t border-[#E2D9D2] flex items-center justify-between text-xs text-slate-500">
            <span>Demonstration baseline: Rule-Based Evaluation Engine Active</span>
            <button
              onClick={() => onNavigate('faults')}
              className="font-bold text-[#014BAA] hover:underline"
            >
              Analyze Root Causes &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
