import React from 'react';
import {
  RotateCcw,
  Play,
  Pause,
  Radio,
  Sliders,
  AlertTriangle,
  Flame,
  CheckCircle2,
  HardDrive
} from 'lucide-react';
import { useElevator } from '../../context/ElevatorContext';
import { NavPage } from './Sidebar';

interface HeaderProps {
  currentPage: NavPage;
  onSelectPage: (page: NavPage) => void;
  onOpenHardwareModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentPage,
  onSelectPage,
  onOpenHardwareModal
}) => {
  const {
    systemStatus,
    activeFaults,
    operatingMode,
    setOperatingMode,
    isStreamingPaused,
    toggleStreamingPause,
    isSimulatingNoise,
    toggleSimulatingNoise,
    resetToNominal
  } = useElevator();

  const pageTitles: Record<NavPage, { title: string; subtitle: string }> = {
    dashboard: {
      title: 'Elevator Monitoring Dashboard',
      subtitle: 'Real-time telemetry, system health indexing & active fault monitoring'
    },
    monitoring: {
      title: 'Live Sensor Monitoring',
      subtitle: 'Continuous dynamic waveforms and threshold boundary references'
    },
    simulation: {
      title: 'Sensor Simulation & Fault Injection',
      subtitle: 'Interactive test bench for elevator operating parameter perturbation'
    },
    faults: {
      title: 'Autonomous Fault Isolation & Root Cause Analysis',
      subtitle: 'Rule-based diagnostic reasoning, component isolation and maintenance actions'
    },
    history: {
      title: 'Alert History & Event Audit Log',
      subtitle: 'Chronological threshold breaches and maintenance dispatch records'
    },
    settings: {
      title: 'Demonstration Threshold Configuration',
      subtitle: 'Configurable warning, critical limits and system boundary settings'
    }
  };

  const currentInfo = pageTitles[currentPage];

  return (
    <header className="bg-[#F8F3F0] border-b border-[#E2D9D2] px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30 shadow-xs">
      {/* Title & Breadcrumb */}
      <div>
        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
          <span>Traction Elevator #01</span>
          <span>/</span>
          <span className="text-[#014BAA] font-bold">{currentInfo.title}</span>
        </div>
        <h1 className="text-lg font-bold text-[#014BAA] tracking-tight leading-tight">
          {currentInfo.title}
        </h1>
      </div>

      {/* Action Controls */}
      <div className="flex items-center flex-wrap gap-2.5">
        {/* Operating Mode Selector */}
        <div className="flex items-center bg-[#EFE8E2] p-0.5 rounded-xl border border-[#E2D9D2] text-xs">
          <button
            onClick={() => setOperatingMode('simulation')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
              operatingMode === 'simulation'
                ? 'bg-[#014BAA] text-[#F8F3F0] shadow-xs'
                : 'text-slate-600 hover:text-[#014BAA]'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Simulation Mode</span>
          </button>
          <button
            onClick={() => {
              setOperatingMode('real_hardware');
              onOpenHardwareModal();
            }}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
              operatingMode === 'real_hardware'
                ? 'bg-[#014BAA] text-[#F8F3F0] shadow-xs'
                : 'text-slate-600 hover:text-[#014BAA]'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>Real Sensor Mode</span>
          </button>
        </div>

        {/* Stream Play/Pause */}
        <button
          onClick={toggleStreamingPause}
          title={isStreamingPaused ? 'Resume live telemetry stream' : 'Pause live telemetry stream'}
          className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
            isStreamingPaused
              ? 'bg-amber-500 text-white border-amber-600 hover:bg-amber-600'
              : 'bg-white text-slate-700 border-[#E2D9D2] hover:bg-[#EFE8E2]'
          }`}
        >
          {isStreamingPaused ? (
            <>
              <Play className="w-3.5 h-3.5 text-white" />
              <span>Resume Stream</span>
            </>
          ) : (
            <>
              <Pause className="w-3.5 h-3.5 text-slate-500" />
              <span>Pause Stream</span>
            </>
          )}
        </button>

        {/* Noise Toggle */}
        <button
          onClick={toggleSimulatingNoise}
          title="Toggle realistic sensor noise micro-fluctuations"
          className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
            isSimulatingNoise
              ? 'bg-[#014BAA] text-[#F8F3F0] border-[#014BAA]'
              : 'bg-white text-slate-700 border-[#E2D9D2] hover:bg-[#EFE8E2]'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>Noise: {isSimulatingNoise ? 'ON' : 'OFF'}</span>
        </button>

        {/* Reset to Nominal */}
        <button
          onClick={resetToNominal}
          title="Reset all sensor parameters to nominal baseline"
          className="px-3 py-1.5 rounded-xl border border-[#E2D9D2] bg-white text-slate-700 hover:bg-[#EFE8E2] text-xs font-semibold flex items-center gap-1.5 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
          <span>Reset Nominal</span>
        </button>

        {/* Quick System Status Chip */}
        <div
          onClick={() => {
            if (activeFaults.length > 0) {
              onSelectPage('faults');
            }
          }}
          className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors shadow-xs ${
            systemStatus === 'critical'
              ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
              : systemStatus === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
              : 'bg-white border-[#E2D9D2] text-[#014BAA] hover:bg-[#EFE8E2]'
          }`}
        >
          {systemStatus === 'critical' && <Flame className="w-4 h-4 text-rose-600 animate-pulse" />}
          {systemStatus === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-600" />}
          {systemStatus === 'normal' && <CheckCircle2 className="w-4 h-4 text-[#014BAA]" />}
          <span className="capitalize font-bold">{systemStatus}</span>
          {activeFaults.length > 0 && (
            <span className="font-mono text-[10px] px-1.5 py-0.2 bg-white rounded border border-current font-bold">
              {activeFaults.length} Fault{activeFaults.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </header>
  );
};
