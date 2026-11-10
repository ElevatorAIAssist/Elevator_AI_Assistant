import React, { useState } from 'react';
import {
  Settings,
  RotateCcw,
  Save,
  CheckCircle2,
  AlertTriangle,
  Info,
  ShieldCheck,
  Thermometer,
  Zap,
  Activity,
  Gauge,
  Sliders
} from 'lucide-react';
import { useElevator, DEFAULT_THRESHOLDS } from '../../context/ElevatorContext';
import { SensorThresholds } from '../../types/elevator';

export const SettingsPage: React.FC = () => {
  const { thresholds, updateThresholds, resetThresholdsToDefaults } = useElevator();

  // Local draft state for threshold form
  const [formValues, setFormValues] = useState<SensorThresholds>(thresholds);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // System parameters (configurable metadata)
  const [systemParams, setSystemParams] = useState({
    ratedCapacityKg: 1600,
    totalFloors: 12,
    machineType: 'Permanent Magnet Synchronous Gearless PMSM',
    suspensionRatio: '2:1 Underslung',
    ambientMachineRoomLimitC: 35.0,
    ratedVelocityMs: 1.50
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateThresholds(formValues);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleReset = () => {
    if (window.confirm('Reset all demonstration thresholds to original baseline values?')) {
      resetThresholdsToDefaults();
      setFormValues(DEFAULT_THRESHOLDS);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* System Specification Notice Card */}
      <div className="p-4 rounded-xl bg-[#EFE8E2] border border-[#E2D9D2] text-slate-800 flex items-start gap-3 shadow-xs">
        <Info className="w-5 h-5 text-[#014BAA] shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed">
          <div className="font-bold text-[#014BAA] uppercase tracking-wide">
            System Specification &amp; Safety Notice
          </div>
          <p className="mt-0.5 text-slate-600">
            This dashboard provides autonomous fault detection, isolation, and root cause analysis (FDIR) for elevator monitoring and supervisory diagnostics. All thresholds are configurable diagnostic parameters aligned with standard elevator safety invariants (EN 81-20/50 and ASME A17.1).
          </p>
        </div>
      </div>

      {/* Main Settings Form */}
      <form onSubmit={handleSave} className="space-y-6">
        {/* Sensor Thresholds Card */}
        <div className="bg-white rounded-xl border border-[#E2D9D2] p-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between pb-4 border-b border-[#E2D9D2] gap-4">
            <div>
              <h2 className="text-sm font-bold text-[#014BAA] uppercase tracking-wider flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#014BAA]" />
                <span>Sensor Demonstration Thresholds</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure warning and critical excursion triggers used by the rule-based detection engine.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#EFE8E2] hover:bg-[#E2D9D2] text-slate-700 flex items-center gap-1.5 transition-colors border border-[#E2D9D2]"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore Defaults</span>
              </button>

              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#014BAA] hover:bg-[#003882] text-[#F8F3F0] flex items-center gap-1.5 transition-colors shadow-xs"
              >
                {savedSuccess ? <CheckCircle2 className="w-3.5 h-3.5 text-[#F8F3F0]" /> : <Save className="w-3.5 h-3.5" />}
                <span>{savedSuccess ? 'Thresholds Saved!' : 'Save Changes'}</span>
              </button>
            </div>
          </div>

          {/* Threshold Inputs Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-5">
            {/* 1. Temperature Thresholds */}
            <div className="p-4 rounded-xl bg-[#EFE8E2]/60 border border-[#E2D9D2] space-y-3">
              <div className="flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-rose-500" />
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Temperature
                  </h3>
                  <p className="text-[10px] text-slate-500 font-medium">Water Temperature (°C) • DS18B20</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                Monitored via DS18B20 waterproof temperature probe in test container.
              </p>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[11px] font-semibold text-amber-800 block mb-1">
                    Warning Threshold (°C)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="10"
                    max="80"
                    value={formValues.temperatureWarning}
                    onChange={e => setFormValues({ ...formValues, temperatureWarning: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 bg-white border border-[#E2D9D2] rounded-lg text-xs font-mono font-bold text-slate-900 focus:ring-1 focus:ring-[#014BAA] focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Baseline default: 35°C</span>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-rose-800 block mb-1">
                    Critical Threshold (°C)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="20"
                    max="100"
                    value={formValues.temperatureCritical}
                    onChange={e => setFormValues({ ...formValues, temperatureCritical: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 bg-white border border-[#E2D9D2] rounded-lg text-xs font-mono font-bold text-slate-900 focus:ring-1 focus:ring-[#014BAA] focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Baseline default: 45°C</span>
                </div>
              </div>
            </div>

            {/* 2. Current Thresholds */}
            <div className="p-4 rounded-xl bg-[#EFE8E2]/60 border border-[#E2D9D2] space-y-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Current
                  </h3>
                  <p className="text-[10px] text-slate-500 font-medium">LED Circuit Current (mA) • INA219</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                Measured via INA219 high-side current sensor on the LED load circuit.
              </p>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[11px] font-semibold text-amber-800 block mb-1">
                    Warning Threshold (mA)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="50"
                    value={formValues.currentWarning}
                    onChange={e => setFormValues({ ...formValues, currentWarning: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 bg-white border border-[#E2D9D2] rounded-lg text-xs font-mono font-bold text-slate-900 focus:ring-1 focus:ring-[#014BAA] focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Baseline default: 7.0 mA</span>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-rose-800 block mb-1">
                    Critical Threshold (mA)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="50"
                    value={formValues.currentCritical}
                    onChange={e => setFormValues({ ...formValues, currentCritical: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 bg-white border border-[#E2D9D2] rounded-lg text-xs font-mono font-bold text-slate-900 focus:ring-1 focus:ring-[#014BAA] focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Baseline default: 9.0 mA</span>
                </div>
              </div>
            </div>

            {/* 3. Vibration Thresholds */}
            <div className="p-4 rounded-xl bg-[#EFE8E2]/60 border border-[#E2D9D2] space-y-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#014BAA]" />
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Vibration
                  </h3>
                  <p className="text-[10px] text-slate-500 font-medium">Vibration Events (events/sec) • SW-420</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                Trigger events measured by SW-420 vibration sensor switch on cardboard chassis.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                    Min Operating Floor (events/sec)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="200"
                    value={formValues.vibrationLow ?? 45.0}
                    onChange={e => setFormValues({ ...formValues, vibrationLow: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 bg-white border border-[#E2D9D2] rounded-lg text-xs font-mono font-bold text-slate-900 focus:ring-1 focus:ring-[#014BAA] focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Normal Min: 45.0 ev/s</span>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-amber-800 block mb-1">
                    Warning Threshold (events/sec)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="200"
                    value={formValues.vibrationWarning}
                    onChange={e => setFormValues({ ...formValues, vibrationWarning: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 bg-white border border-[#E2D9D2] rounded-lg text-xs font-mono font-bold text-slate-900 focus:ring-1 focus:ring-[#014BAA] focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Baseline default: 90.0 ev/s</span>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-rose-800 block mb-1">
                    Critical Threshold (events/sec)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="200"
                    value={formValues.vibrationCritical}
                    onChange={e => setFormValues({ ...formValues, vibrationCritical: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 bg-white border border-[#E2D9D2] rounded-lg text-xs font-mono font-bold text-slate-900 focus:ring-1 focus:ring-[#014BAA] focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Baseline default: 135.0 ev/s</span>
                </div>
              </div>
            </div>

            {/* 4. Speed & Door Hazard Thresholds */}
            <div className="p-4 rounded-xl bg-[#EFE8E2]/60 border border-[#E2D9D2] space-y-3">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-[#014BAA]" />
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Speed
                  </h3>
                  <p className="text-[10px] text-slate-500 font-medium">Disc Rotational Speed (RPM) • TCRT5000</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                Derived from TCRT5000 infrared reflective sensor counting marks on rotating disc.
              </p>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[11px] font-semibold text-slate-800 block mb-1">
                    Nominal Max Speed (RPM)
                  </label>
                  <input
                    type="number"
                    step="5"
                    min="0"
                    max="300"
                    value={formValues.speedMaxNormal}
                    onChange={e => setFormValues({ ...formValues, speedMaxNormal: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 bg-white border border-[#E2D9D2] rounded-lg text-xs font-mono font-bold text-slate-900 focus:ring-1 focus:ring-[#014BAA] focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Baseline default: 60 RPM</span>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-rose-800 block mb-1">
                    Overspeed Trip Limit (RPM)
                  </label>
                  <input
                    type="number"
                    step="5"
                    min="0"
                    max="300"
                    value={formValues.speedCritical}
                    onChange={e => setFormValues({ ...formValues, speedCritical: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 bg-white border border-[#E2D9D2] rounded-lg text-xs font-mono font-bold text-slate-900 focus:ring-1 focus:ring-[#014BAA] focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Baseline default: 120 RPM</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* System Operating Range & Hardware Parameters */}
        <div className="bg-white rounded-xl border border-[#E2D9D2] p-6 shadow-xs space-y-4">
          <div className="border-b border-[#E2D9D2] pb-3">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#014BAA]" />
              <span>Elevator System Specifications &amp; Structural Range</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Physical parameters of the monitored elevator car installation.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="font-medium text-slate-600 block mb-1">Rated Passenger Load Capacity (kg)</label>
              <input
                type="number"
                value={systemParams.ratedCapacityKg}
                onChange={e => setSystemParams({ ...systemParams, ratedCapacityKg: parseInt(e.target.value) || 1600 })}
                className="w-full px-3 py-1.5 bg-[#EFE8E2]/50 border border-[#E2D9D2] rounded-lg font-mono font-bold text-slate-900"
              />
            </div>

            <div>
              <label className="font-medium text-slate-600 block mb-1">Number of Hoistway Landings</label>
              <input
                type="number"
                value={systemParams.totalFloors}
                onChange={e => setSystemParams({ ...systemParams, totalFloors: parseInt(e.target.value) || 12 })}
                className="w-full px-3 py-1.5 bg-[#EFE8E2]/50 border border-[#E2D9D2] rounded-lg font-mono font-bold text-slate-900"
              />
            </div>

            <div>
              <label className="font-medium text-slate-600 block mb-1">Nominal Contract Speed (m/s)</label>
              <input
                type="number"
                step="0.1"
                value={systemParams.ratedVelocityMs}
                onChange={e => setSystemParams({ ...systemParams, ratedVelocityMs: parseFloat(e.target.value) || 1.5 })}
                className="w-full px-3 py-1.5 bg-[#EFE8E2]/50 border border-[#E2D9D2] rounded-lg font-mono font-bold text-slate-900"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="font-medium text-slate-600 block mb-1">Traction Drive Motor Classification</label>
              <input
                type="text"
                value={systemParams.machineType}
                onChange={e => setSystemParams({ ...systemParams, machineType: e.target.value })}
                className="w-full px-3 py-1.5 bg-[#EFE8E2]/50 border border-[#E2D9D2] rounded-lg text-slate-900 font-medium"
              />
            </div>

            <div>
              <label className="font-medium text-slate-600 block mb-1">Machine Room Ambient Temperature Limit (°C)</label>
              <input
                type="number"
                value={systemParams.ambientMachineRoomLimitC}
                onChange={e => setSystemParams({ ...systemParams, ambientMachineRoomLimitC: parseFloat(e.target.value) || 35 })}
                className="w-full px-3 py-1.5 bg-[#EFE8E2]/50 border border-[#E2D9D2] rounded-lg font-mono font-bold text-slate-900"
              />
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};
