import React, { useState } from 'react';

import {

  ResponsiveContainer,

  LineChart,

  Line,

  XAxis,

  YAxis,

  CartesianGrid,

  Tooltip,

  ReferenceLine

} from 'recharts';

import {

  Play,

  Pause,

  Radio,

  RotateCcw,

  Thermometer,

  Zap,

  Activity,

  Gauge,

  DoorClosed,

  DoorOpen,

  Sliders,

  CheckCircle2

} from 'lucide-react';

import { useElevator } from '../../context/ElevatorContext';



export const LiveMonitoring: React.FC = () => {

  const {

    sensors,

    thresholds,

    telemetryHistory,

    isStreamingPaused,

    toggleStreamingPause,

    isSimulatingNoise,

    toggleSimulatingNoise,

    operatingMode

  } = useElevator();



  const isHardware = operatingMode === 'real_hardware';



  const [activeTab, setActiveTab] = useState<'grid' | 'temperature' | 'current' | 'vibration' | 'speed'>('grid');



  // Compute live statistics over the current buffer

  const getStats = (key: 'temperature' | 'current' | 'vibration' | 'speed') => {
    const liveVal = typeof sensors[key] === 'number' ? +sensors[key].toFixed(2) : undefined;
    if (telemetryHistory.length === 0) {
      const cur = liveVal ?? 0;
      return { min: cur, max: cur, avg: cur, current: cur };
    }

    const values = telemetryHistory.map(p => p[key]);
    const current = liveVal ?? +values[values.length - 1].toFixed(2);
    const allValues = [...values, current];
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const avg = allValues.reduce((a, b) => a + b, 0) / allValues.length;

    return {
      min: +min.toFixed(2),
      max: +max.toFixed(2),
      avg: +avg.toFixed(2),
      current
    };
  };



  const tempStats = getStats('temperature');

  const currentStats = getStats('current');

  const vibStats = getStats('vibration');

  const speedStats = getStats('speed');



  // Dynamic domains, tick points, and engineering units calculated according to active thresholds

  const isPhysicalCurrent = thresholds.currentCritical <= 50 || isHardware;

  const currentUnit = isPhysicalCurrent ? ' mA' : ' A';

  const currentMax = Math.ceil(Math.max(

    currentStats.max * 1.15,

    thresholds.currentCritical * 1.33,

    isPhysicalCurrent ? 12 : 10

  ));

  const currentDomain: [number, number] = [0, currentMax];

  const currentMid = Math.round((thresholds.currentWarning / 2) * 10) / 10;

  const currentTicks = Array.from(new Set([

    0,

    currentMid,

    thresholds.currentWarning,

    thresholds.currentCritical,

    currentMax

  ])).sort((a, b) => a - b);



  const tempMin = Math.max(0, Math.floor(Math.min(tempStats.min - 3, thresholds.temperatureWarning - 15, 15)));

  const tempMax = Math.ceil(Math.max(tempStats.max + 5, thresholds.temperatureCritical + 10, 55));

  const tempDomain: [number, number] = [tempMin, tempMax];

  const tempMid = Math.round((tempMin + thresholds.temperatureWarning) / 2);

  const tempTicks = Array.from(new Set([

    tempMin,

    tempMid,

    thresholds.temperatureWarning,

    thresholds.temperatureCritical,

    tempMax

  ])).sort((a, b) => a - b);



  const isPhysicalVibration = thresholds.vibrationCritical > 25 || isHardware;

  const vibUnit = isPhysicalVibration ? ' ev/s' : ' mm/s';

  const vibLow = thresholds.vibrationLow ?? 45;

  const vibMax = Math.ceil(Math.max(

    vibStats.max * 1.15,

    thresholds.vibrationCritical * 1.25,

    isPhysicalVibration ? 160 : 10

  ));

  const vibDomain: [number, number] = [0, vibMax];

  const vibTicks = Array.from(new Set([

    0,

    vibLow,

    thresholds.vibrationWarning,

    thresholds.vibrationCritical,

    vibMax

  ])).sort((a, b) => a - b);



  const isPhysicalSpeed = thresholds.speedCritical > 10 || isHardware;

  const speedUnit = isPhysicalSpeed ? ' RPM' : ' m/s';

  const speedMax = Math.ceil(Math.max(

    speedStats.max * 1.15,

    thresholds.speedCritical * 1.25,

    isPhysicalSpeed ? 150 : 3.5

  ));

  const speedDomain: [number, number] = [0, speedMax];

  const speedMid = Math.round(thresholds.speedMaxNormal / 2);

  const speedTicks = Array.from(new Set([

    0,

    speedMid,

    thresholds.speedMaxNormal,

    thresholds.speedCritical,

    speedMax

  ])).sort((a, b) => a - b);



  // Custom dot renderers highlighting points when threshold limits are breached

  const renderCurrentDot = (props: any) => {

    const { cx, cy, payload } = props;

    if (cx == null || cy == null || !payload) return null;

    const val = payload.current;

    if (typeof val !== 'number') return null;

    if (val > thresholds.currentCritical) {

      return <circle key={`c-dot-${cx}-${cy}`} cx={cx} cy={cy} r={4.5} fill="#dc2626" stroke="#ffffff" strokeWidth={1.5} />;

    }

    if (val >= thresholds.currentWarning) {

      return <circle key={`c-dot-${cx}-${cy}`} cx={cx} cy={cy} r={3.5} fill="#d97706" stroke="#ffffff" strokeWidth={1.5} />;

    }

    return null;

  };



  const renderTempDot = (props: any) => {

    const { cx, cy, payload } = props;

    if (cx == null || cy == null || !payload) return null;

    const val = payload.temperature;

    if (typeof val !== 'number') return null;

    if (val >= thresholds.temperatureCritical) {

      return <circle key={`t-dot-${cx}-${cy}`} cx={cx} cy={cy} r={4.5} fill="#dc2626" stroke="#ffffff" strokeWidth={1.5} />;

    }

    if (val >= thresholds.temperatureWarning) {

      return <circle key={`t-dot-${cx}-${cy}`} cx={cx} cy={cy} r={3.5} fill="#d97706" stroke="#ffffff" strokeWidth={1.5} />;

    }

    return null;

  };



  const renderVibDot = (props: any) => {

    const { cx, cy, payload } = props;

    if (cx == null || cy == null || !payload) return null;

    const val = payload.vibration;

    if (typeof val !== 'number') return null;

    if (val > thresholds.vibrationCritical) {

      return <circle key={`v-dot-${cx}-${cy}`} cx={cx} cy={cy} r={4.5} fill="#dc2626" stroke="#ffffff" strokeWidth={1.5} />;

    }

    if (val >= thresholds.vibrationWarning) {

      return <circle key={`v-dot-${cx}-${cy}`} cx={cx} cy={cy} r={3.5} fill="#d97706" stroke="#ffffff" strokeWidth={1.5} />;

    }

    return null;

  };



  const renderSpeedDot = (props: any) => {

    const { cx, cy, payload } = props;

    if (cx == null || cy == null || !payload) return null;

    const val = payload.speed;

    if (typeof val !== 'number') return null;

    if (val >= thresholds.speedCritical) {

      return <circle key={`s-dot-${cx}-${cy}`} cx={cx} cy={cy} r={4.5} fill="#dc2626" stroke="#ffffff" strokeWidth={1.5} />;

    }

    if (val > thresholds.speedMaxNormal) {

      return <circle key={`s-dot-${cx}-${cy}`} cx={cx} cy={cy} r={3.5} fill="#d97706" stroke="#ffffff" strokeWidth={1.5} />;

    }

    return null;

  };



  return (

    <div className="space-y-6">

      {/* Live Monitoring Header & Control Strip */}

      <div className="bg-white rounded-xl p-5 border border-[#E2D9D2] shadow-xs flex flex-wrap items-center justify-between gap-4">

        <div>

          <div className="flex items-center gap-2">

            <h2 className="text-sm font-bold text-[#014BAA] uppercase tracking-wider">

              Continuous Telemetry Waveforms

            </h2>

            <span className="flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full bg-[#EFE8E2] text-[#014BAA] border border-[#E2D9D2] font-bold">

              <span className="w-2 h-2 rounded-full bg-[#014BAA] animate-pulse" />

              <span>{isStreamingPaused ? 'Buffer Paused' : '1.5s Sampling Rate'}</span>

            </span>

          </div>

          <p className="text-xs text-slate-500 mt-0.5">

            Real-time buffer of last 30 readings with automated threshold reference lines

          </p>

        </div>



        {/* Action Controls */}

        <div className="flex items-center gap-2">

          {/* Pause / Resume */}

          <button

            onClick={toggleStreamingPause}

            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-colors ${

              isStreamingPaused

                ? 'bg-amber-500 text-white border-amber-600 hover:bg-amber-600'

                : 'bg-white text-slate-700 border-[#E2D9D2] hover:bg-[#EFE8E2]'

            }`}

          >

            {isStreamingPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5 text-slate-500" />}

            <span>{isStreamingPaused ? 'Resume Charts' : 'Freeze Charts'}</span>

          </button>



          {/* Noise Toggle */}

          <button

            onClick={toggleSimulatingNoise}

            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-colors ${

              isSimulatingNoise

                ? 'bg-[#014BAA] text-[#F8F3F0] border-[#014BAA]'

                : 'bg-white text-slate-700 border-[#E2D9D2] hover:bg-[#EFE8E2]'

            }`}

          >

            <Radio className="w-3.5 h-3.5" />

            <span>Gaussian Noise: {isSimulatingNoise ? 'ON' : 'OFF'}</span>

          </button>



          {/* View Mode Tabs */}

          <div className="flex items-center bg-[#EFE8E2] p-0.5 rounded-xl border border-[#E2D9D2] text-xs">

            <button

              onClick={() => setActiveTab('grid')}

              className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${

                activeTab === 'grid' ? 'bg-[#014BAA] text-[#F8F3F0] shadow-xs' : 'text-slate-600 hover:text-[#014BAA]'

              }`}

            >

              All Sensors

            </button>

            <button

              onClick={() => setActiveTab('temperature')}

              className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${

                activeTab === 'temperature' ? 'bg-[#014BAA] text-[#F8F3F0] shadow-xs' : 'text-slate-600 hover:text-[#014BAA]'

              }`}

            >

              Temp

            </button>

            <button

              onClick={() => setActiveTab('current')}

              className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${

                activeTab === 'current' ? 'bg-[#014BAA] text-[#F8F3F0] shadow-xs' : 'text-slate-600 hover:text-[#014BAA]'

              }`}

            >

              Current

            </button>

            <button

              onClick={() => setActiveTab('vibration')}

              className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${

                activeTab === 'vibration' ? 'bg-[#014BAA] text-[#F8F3F0] shadow-xs' : 'text-slate-600 hover:text-[#014BAA]'

              }`}

            >

              Vibration

            </button>

            <button

              onClick={() => setActiveTab('speed')}

              className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${

                activeTab === 'speed' ? 'bg-[#014BAA] text-[#F8F3F0] shadow-xs' : 'text-slate-600 hover:text-[#014BAA]'

              }`}

            >

              Speed

            </button>

          </div>

        </div>

      </div>



      {/* Door Status Real-Time Summary Ribbon */}

      <div className="bg-white rounded-xl p-4 border border-[#E2D9D2] shadow-xs flex flex-wrap items-center justify-between gap-4">

        <div className="flex items-center gap-3">

          <div

            className={`w-9 h-9 rounded-xl flex items-center justify-center border ${

              isHardware

                ? 'bg-[#EFE8E2] text-slate-500 border-[#E2D9D2]'

                : sensors.doorClosed

                ? 'bg-[#EFE8E2] text-[#014BAA] border-[#E2D9D2]'

                : sensors.speed > thresholds.doorHazardSpeedLimit

                ? 'bg-rose-50 text-rose-600 border-rose-300'

                : 'bg-amber-50 text-amber-600 border-amber-200'

            }`}

          >

            {sensors.doorClosed ? <DoorClosed className="w-5 h-5" /> : <DoorOpen className="w-5 h-5" />}

          </div>

          <div>

            <div className="text-xs font-bold text-slate-800 uppercase tracking-wide">

              {isHardware

                ? 'Door Interlock (Unavailable on Hardware Rig)'

                : 'Door Interlock & Gate Position Monitor'}

            </div>

            <div className="text-xs text-slate-500">

              State:{' '}

              <span className={`font-semibold ${isHardware ? 'text-slate-600' : sensors.doorClosed ? 'text-[#014BAA]' : 'text-amber-700'}`}>

                {isHardware

                  ? 'Unavailable on Physical Hardware Rig (No Door Sensor)'

                  : sensors.doorClosed

                  ? 'Fully Closed and Mechanical Gate Contact Verified'

                  : 'Open at Hoistway Sill'}

              </span>

            </div>

          </div>

        </div>



        <div className="flex items-center gap-4 text-xs font-mono">

          <div className="px-3 py-1 rounded-lg bg-[#EFE8E2] border border-[#E2D9D2]">

            <span className="text-slate-500">Motion Hazard Interlock: </span>

            <span

              className={`font-bold ${

                isHardware

                  ? 'text-slate-600'

                  : !sensors.doorClosed && sensors.speed > thresholds.doorHazardSpeedLimit

                  ? 'text-rose-600'

                  : 'text-[#014BAA]'

              }`}

            >

              {isHardware

                ? 'STANDBY (NO DOOR)'

                : !sensors.doorClosed && sensors.speed > thresholds.doorHazardSpeedLimit

                ? 'TRIPPED (HAZARD)'

                : 'SECURE'}

            </span>

          </div>



          <div className="px-3 py-1 rounded-lg bg-[#EFE8E2] border border-[#E2D9D2]">

            <span className="text-slate-500">Max In-Transit Tolerance: </span>

            <span className="text-slate-800 font-bold">{thresholds.doorHazardSpeedLimit.toFixed(2)} m/s</span>

          </div>

        </div>

      </div>



      {/* Graphs Layout */}

      {(activeTab === 'grid' || activeTab === 'temperature') && (

        <div className="bg-white rounded-xl p-5 border border-[#E2D9D2] shadow-xs">

          <div className="flex flex-wrap items-center justify-between pb-3 border-b border-[#E2D9D2] gap-2">

            <div className="flex items-center gap-2">

              <Thermometer className="w-4 h-4 text-rose-500" />

              <div>

                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">

                  Temperature

                </h3>

                <p className="text-[10px] text-slate-500 font-medium">Water Temperature (°C) • DS18B20</p>

              </div>

            </div>

            {/* Quick Stats */}

            <div className="flex items-center gap-4 text-[11px] font-mono text-slate-600">

              <span>Cur: <strong className="text-slate-900">{tempStats.current}°C</strong></span>

              <span>Min: {tempStats.min}°C</span>

              <span>Max: {tempStats.max}°C</span>

              <span>Avg: {tempStats.avg}°C</span>

              <span className="text-amber-700 font-semibold">Warn: {thresholds.temperatureWarning}°C</span>

              <span className="text-rose-600 font-semibold">Crit: {thresholds.temperatureCritical}°C</span>

            </div>

          </div>



          <div className="h-64 mt-4 w-full">

            <ResponsiveContainer width="100%" height="100%">

              <LineChart data={telemetryHistory} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>

                <CartesianGrid strokeDasharray="3 3" stroke="#EFE8E2" />

                <XAxis dataKey="timeStr" tick={{ fontSize: 10, fill: '#64748B' }} stroke="#CBD5E1" />

                <YAxis domain={tempDomain} ticks={tempTicks} tick={{ fontSize: 10, fill: '#64748B' }} stroke="#CBD5E1" unit="°C" />

                <Tooltip

                  contentStyle={{ backgroundColor: '#014BAA', borderColor: '#E2D9D2', borderRadius: 8, color: '#F8F3F0', fontSize: 12 }}

                  formatter={(val?: any) => [typeof val === 'number' ? `${val.toFixed(1)} °C` : `${val}`, 'Temperature']}

                />

                {/* Warning threshold reference line */}

                <ReferenceLine

                  y={thresholds.temperatureWarning}

                  stroke="#d97706"

                  strokeDasharray="4 4"

                  label={{ value: `Warn (${thresholds.temperatureWarning}°C)`, fill: '#d97706', fontSize: 10, position: 'right' }}

                />

                {/* Critical threshold reference line */}

                <ReferenceLine

                  y={thresholds.temperatureCritical}

                  stroke="#dc2626"

                  strokeWidth={1.5}

                  label={{ value: `Crit (${thresholds.temperatureCritical}°C)`, fill: '#dc2626', fontSize: 10, position: 'right' }}

                />

                <Line

                  type="monotone"

                  dataKey="temperature"

                  stroke="#e11d48"

                  strokeWidth={2}

                  dot={renderTempDot}

                  activeDot={{ r: 5, strokeWidth: 2 }}

                  isAnimationActive={false}

                />

              </LineChart>

            </ResponsiveContainer>

          </div>

        </div>

      )}



      {(activeTab === 'grid' || activeTab === 'current') && (

        <div className="bg-white rounded-xl p-5 border border-[#E2D9D2] shadow-xs">

          <div className="flex flex-wrap items-center justify-between pb-3 border-b border-[#E2D9D2] gap-2">

            <div className="flex items-center gap-2">

              <Zap className="w-4 h-4 text-amber-500" />

              <div>

                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">

                  Current

                </h3>

                <p className="text-[10px] text-slate-500 font-medium">LED Circuit Current (mA) • INA219</p>

              </div>

            </div>

            {/* Quick Stats */}

            <div className="flex items-center gap-4 text-[11px] font-mono text-slate-600">

              <span>Cur: <strong className="text-slate-900">{currentStats.current} mA</strong></span>

              <span>Min: {currentStats.min} mA</span>

              <span>Max: {currentStats.max} mA</span>

              <span>Avg: {currentStats.avg} mA</span>

              <span className="text-amber-700 font-semibold">Warn: {thresholds.currentWarning.toFixed(1)} mA</span>

              <span className="text-rose-600 font-semibold">Crit: {thresholds.currentCritical.toFixed(1)} mA</span>

            </div>

          </div>



          <div className="h-64 mt-4 w-full">

            <ResponsiveContainer width="100%" height="100%">

              <LineChart data={telemetryHistory} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>

                <CartesianGrid strokeDasharray="3 3" stroke="#EFE8E2" />

                <XAxis dataKey="timeStr" tick={{ fontSize: 10, fill: '#64748B' }} stroke="#CBD5E1" />

                <YAxis domain={currentDomain} ticks={currentTicks} tick={{ fontSize: 10, fill: '#64748B' }} stroke="#CBD5E1" unit={currentUnit} />

                <Tooltip

                  contentStyle={{ backgroundColor: '#014BAA', borderColor: '#E2D9D2', borderRadius: 8, color: '#F8F3F0', fontSize: 12 }}

                  formatter={(val?: any) => [typeof val === 'number' ? `${val.toFixed(2)}${currentUnit}` : `${val}`, 'Current']}

                />

                <ReferenceLine

                  y={thresholds.currentWarning}

                  stroke="#d97706"

                  strokeDasharray="4 4"

                  label={{ value: `Warn (${thresholds.currentWarning}${currentUnit.trim()})`, fill: '#d97706', fontSize: 10, position: 'right' }}

                />

                <ReferenceLine

                  y={thresholds.currentCritical}

                  stroke="#dc2626"

                  strokeWidth={1.5}

                  label={{ value: `Crit (${thresholds.currentCritical}${currentUnit.trim()})`, fill: '#dc2626', fontSize: 10, position: 'right' }}

                />

                <Line

                  type="monotone"

                  dataKey="current"

                  stroke="#d97706"

                  strokeWidth={2}

                  dot={renderCurrentDot}

                  activeDot={{ r: 5, strokeWidth: 2 }}

                  isAnimationActive={false}

                />

              </LineChart>

            </ResponsiveContainer>

          </div>

        </div>

      )}



      {(activeTab === 'grid' || activeTab === 'vibration') && (

        <div className="bg-white rounded-xl p-5 border border-[#E2D9D2] shadow-xs">

          <div className="flex flex-wrap items-center justify-between pb-3 border-b border-[#E2D9D2] gap-2">

            <div className="flex items-center gap-2">

              <Activity className="w-4 h-4 text-[#014BAA]" />

              <div>

                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">

                  Vibration

                </h3>

                <p className="text-[10px] text-slate-500 font-medium">Vibration Events (events/sec) • SW-420</p>

              </div>

            </div>

            {/* Quick Stats */}

            <div className="flex items-center gap-4 text-[11px] font-mono text-slate-600">

              <span>Cur: <strong className="text-slate-900">{vibStats.current} events/sec</strong></span>

              <span>Min: {vibStats.min}</span>

              <span>Max: {vibStats.max}</span>

              <span>Avg: {vibStats.avg}</span>

              <span className="text-amber-700 font-semibold">Warn: {thresholds.vibrationWarning.toFixed(1)} events/sec</span>

              <span className="text-rose-600 font-semibold">Crit: {thresholds.vibrationCritical.toFixed(1)} events/sec</span>

            </div>

          </div>



          <div className="h-64 mt-4 w-full">

            <ResponsiveContainer width="100%" height="100%">

              <LineChart data={telemetryHistory} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>

                <CartesianGrid strokeDasharray="3 3" stroke="#EFE8E2" />

                <XAxis dataKey="timeStr" tick={{ fontSize: 10, fill: '#64748B' }} stroke="#CBD5E1" />

                <YAxis domain={vibDomain} ticks={vibTicks} tick={{ fontSize: 10, fill: '#64748B' }} stroke="#CBD5E1" unit={vibUnit} />

                <Tooltip

                  contentStyle={{ backgroundColor: '#014BAA', borderColor: '#E2D9D2', borderRadius: 8, color: '#F8F3F0', fontSize: 12 }}

                  formatter={(val?: any) => [typeof val === 'number' ? `${val.toFixed(2)} ${vibUnit.trim()}` : `${val}`, 'Vibration']}

                />

                <ReferenceLine

                  y={thresholds.vibrationLow ?? 45}

                  stroke="#64748b"

                  strokeDasharray="2 2"

                  label={{ value: `Min Normal (${thresholds.vibrationLow ?? 45} ${vibUnit.trim()})`, fill: '#64748b', fontSize: 10, position: 'left' }}

                />

                <ReferenceLine

                  y={thresholds.vibrationWarning}

                  stroke="#d97706"

                  strokeDasharray="4 4"

                  label={{ value: `Warn (${thresholds.vibrationWarning} ${vibUnit.trim()})`, fill: '#d97706', fontSize: 10, position: 'right' }}

                />

                <ReferenceLine

                  y={thresholds.vibrationCritical}

                  stroke="#dc2626"

                  strokeWidth={1.5}

                  label={{ value: `Crit (${thresholds.vibrationCritical} ${vibUnit.trim()})`, fill: '#dc2626', fontSize: 10, position: 'right' }}

                />

                <Line

                  type="monotone"

                  dataKey="vibration"

                  stroke="#4f46e5"

                  strokeWidth={2}

                  dot={renderVibDot}

                  activeDot={{ r: 5, strokeWidth: 2 }}

                  isAnimationActive={false}

                />

              </LineChart>

            </ResponsiveContainer>

          </div>

        </div>

      )}



      {(activeTab === 'grid' || activeTab === 'speed') && (

        <div className="bg-white rounded-xl p-5 border border-[#E2D9D2] shadow-xs">

          <div className="flex flex-wrap items-center justify-between pb-3 border-b border-[#E2D9D2] gap-2">

            <div className="flex items-center gap-2">

              <Gauge className="w-4 h-4 text-[#014BAA]" />

              <div>

                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">

                  Speed

                </h3>

                <p className="text-[10px] text-slate-500 font-medium">Disc Rotational Speed (RPM) • TCRT5000</p>

              </div>

            </div>

            {/* Quick Stats */}

            <div className="flex items-center gap-4 text-[11px] font-mono text-slate-600">

              <span>Cur: <strong className="text-slate-900">{speedStats.current} RPM</strong></span>

              <span>Min: {speedStats.min}</span>

              <span>Max: {speedStats.max}</span>

              <span>Nominal Max: {thresholds.speedMaxNormal.toFixed(2)} RPM</span>

              <span className="text-rose-600 font-semibold">Overspeed Trip: {thresholds.speedCritical.toFixed(2)} RPM</span>

            </div>

          </div>



          <div className="h-64 mt-4 w-full">

            <ResponsiveContainer width="100%" height="100%">

              <LineChart data={telemetryHistory} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>

                <CartesianGrid strokeDasharray="3 3" stroke="#EFE8E2" />

                <XAxis dataKey="timeStr" tick={{ fontSize: 10, fill: '#64748B' }} stroke="#CBD5E1" />

                <YAxis domain={speedDomain} ticks={speedTicks} tick={{ fontSize: 10, fill: '#64748B' }} stroke="#CBD5E1" unit={speedUnit} />

                <Tooltip

                  contentStyle={{ backgroundColor: '#014BAA', borderColor: '#E2D9D2', borderRadius: 8, color: '#F8F3F0', fontSize: 12 }}

                  formatter={(val?: any) => [typeof val === 'number' ? `${val.toFixed(2)} ${speedUnit.trim()}` : `${val}`, 'Speed']}

                />

                <ReferenceLine

                  y={thresholds.speedMaxNormal}

                  stroke="#014BAA"

                  strokeDasharray="4 4"

                  label={{ value: `Nominal Max (${thresholds.speedMaxNormal} ${speedUnit.trim()})`, fill: '#014BAA', fontSize: 10, position: 'right' }}

                />

                <ReferenceLine

                  y={thresholds.speedCritical}

                  stroke="#dc2626"

                  strokeWidth={1.5}

                  label={{ value: `Overspeed (${thresholds.speedCritical} ${speedUnit.trim()})`, fill: '#dc2626', fontSize: 10, position: 'right' }}

                />

                <Line

                  type="monotone"

                  dataKey="speed"

                  stroke="#014BAA"

                  strokeWidth={2.5}

                  dot={renderSpeedDot}

                  activeDot={{ r: 5, strokeWidth: 2 }}

                  isAnimationActive={false}

                />

              </LineChart>

            </ResponsiveContainer>

          </div>

        </div>

      )}

    </div>

  );

};

