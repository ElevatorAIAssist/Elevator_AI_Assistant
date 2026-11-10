import React from 'react';
import { ArrowUp, ArrowDown, AlertOctagon, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useElevator } from '../../context/ElevatorContext';

export const ElevatorShaftVisualizer: React.FC = () => {
  const { sensors, activeFaults, carShaftAnimationProgress, operatingMode, hardwareConnected } = useElevator();

  const isHardware = operatingMode === 'real_hardware';
  const isMoving = !isHardware && sensors.speed > 0.05;
  const displaySpeed = isHardware && !hardwareConnected ? 0 : sensors.speed;

  // Total floors: 12
  const floors = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

  return (
    <div className="bg-white rounded-xl border border-[#E2D9D2] p-5 shadow-xs flex flex-col justify-between">
      {/* Visualizer Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#E2D9D2] gap-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-xs font-bold text-[#014BAA] uppercase tracking-wider">
              Shaft Hoistway &amp; Car Dynamic Visualizer
            </h3>
            <span className="text-[10px] font-mono font-bold bg-[#EFE8E2] text-[#014BAA] px-2 py-0.5 rounded border border-[#E2D9D2]">
              {isHardware ? 'Hardware Mode' : 'Simulation'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {isHardware
              ? 'Demonstration rig operates without car, door, or hoistway sensors'
              : 'Mechanical position & safety interlock tracking model'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Movement Indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#EFE8E2] text-slate-700 text-xs font-mono font-semibold border border-[#E2D9D2]">
            <span className="text-slate-600 font-bold">
              {isHardware ? (displaySpeed > 0 ? 'ROTATING' : 'STANDBY') : sensors.direction === 'up' && isMoving ? (
                <span className="flex items-center text-[#014BAA] font-bold gap-1">
                  <ArrowUp className="w-3.5 h-3.5 animate-bounce" /> UP
                </span>
              ) : sensors.direction === 'down' && isMoving ? (
                <span className="flex items-center text-[#014BAA] font-bold gap-1">
                  <ArrowDown className="w-3.5 h-3.5 animate-bounce" /> DOWN
                </span>
              ) : (
                <span className="text-slate-500">HOLD</span>
              )}
            </span>
            <span>·</span>
            <span>{isHardware ? `${displaySpeed.toFixed(1)} RPM` : `${displaySpeed.toFixed(2)} m/s`}</span>
          </div>

          {/* Current Floor only in simulation */}
          {!isHardware && (
            <div className="px-2.5 py-1 rounded-lg bg-[#014BAA] text-[#F8F3F0] text-xs font-mono font-bold shadow-xs">
              {sensors.floor ? `FL ${sensors.floor.toString().padStart(2, '0')}` : 'FL N/A'}
            </div>
          )}
        </div>
      </div>

      {/* Real Sensor Mode Notice Banner if in hardware mode */}
      {isHardware && (
        <div className="mt-3 p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-center justify-between">
          <span className="font-medium">
            Real Sensor Mode — Hoistway motion visualizer paused (Demonstration Rig has no car/door position sensors)
          </span>
          <span className="font-mono text-[10px] bg-blue-200/70 text-blue-900 px-2 py-0.5 rounded font-bold">
            RIG ISOLATED
          </span>
        </div>
      )}

      {/* Main Shaft Schematic View */}
      <div className="my-4 relative h-72 bg-[#002759] rounded-xl p-3 overflow-hidden border border-[#014BAA]/30 flex items-stretch gap-3 shadow-inner">
        {/* Machine Room Header at top */}
        <div className="absolute top-0 left-0 right-0 h-7 bg-[#01357A] border-b border-[#014BAA]/40 flex items-center justify-between px-3 text-[10px] text-[#F8F3F0] font-mono z-20">
          <span className="font-semibold">ELEVATOR CONTROL &amp; MONITORING UNIT</span>
          <span className="text-slate-300">DISC ROTATION (2 PPR)</span>
        </div>

        {/* Floor Markers Column */}
        <div className="w-10 flex flex-col justify-between py-7 text-[10px] font-mono text-slate-400 z-10 shrink-0">
          {floors.map(fl => (
            <div
              key={fl}
              className={`flex items-center gap-1 transition-colors ${
                !isHardware && sensors.floor === fl ? 'text-[#F8F3F0] font-bold' : ''
              }`}
            >
              <span>{fl.toString().padStart(2, '0')}F</span>
              {!isHardware && sensors.floor === fl && <span className="w-1.5 h-1.5 rounded-full bg-[#F8F3F0]" />}
            </div>
          ))}
        </div>

        {/* Hoistway Grid with Car & Cables */}
        <div className="relative flex-1 bg-[#001D42] rounded-lg border border-[#014BAA]/30 mx-1 overflow-hidden">
          {/* Guide Rail vertical lines */}
          <div className="absolute top-7 bottom-0 left-4 w-0.5 bg-blue-300/20" />
          <div className="absolute top-7 bottom-0 right-4 w-0.5 bg-blue-300/20" />
          <div className="absolute top-7 bottom-0 left-1/2 -translate-x-1/2 w-px border-r border-dashed border-blue-400/20" />

          {/* Elevator Car Body */}
          <div
            className="absolute left-6 right-6 h-14 bg-gradient-to-b from-[#014BAA] to-[#002759] rounded border-2 border-[#F8F3F0]/60 transition-all duration-700 ease-out flex flex-col justify-between p-1.5 shadow-lg z-10"
            style={{
              bottom: isHardware ? '35%' : `${Math.max(5, Math.min(85, carShaftAnimationProgress))}%`
            }}
          >
            {/* Top Car Crosshead */}
            <div className="flex items-center justify-between text-[8px] text-[#F8F3F0] font-mono border-b border-white/20 pb-0.5">
              <span>CAR #01</span>
              <span>{isHardware ? 'IDLE' : sensors.direction.toUpperCase()}</span>
            </div>

            {/* Car Interior / Door indicator */}
            <div className="flex items-center justify-center">
              <div
                className={`text-[9px] font-bold font-mono px-2 py-0.5 rounded border ${
                  isHardware
                    ? 'bg-slate-700 text-slate-300 border-slate-600'
                    : sensors.doorClosed
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-rose-500 text-white border-rose-400 animate-pulse'
                }`}
              >
                {isHardware ? 'RIG DISK' : sensors.doorClosed ? 'GATE CLOSED' : 'GATE OPEN (ALERT)'}
              </div>
            </div>

            {/* Bottom Sills */}
            <div className="text-[7px] text-[#F8F3F0]/70 font-mono text-center">
              {isHardware ? 'NO CAR HOISTWAY' : `TRAVELING: ${displaySpeed.toFixed(2)} m/s`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
