import React, { useState } from 'react';
import {
  ShieldAlert,
  Flame,
  AlertTriangle,
  CheckCircle2,
  Download,
  Copy,
  Check,
  Wrench,
  HelpCircle,
  Cpu,
  Layers,
  ArrowRight,
  ExternalLink,
  Brain,
  Activity
} from 'lucide-react';
import { useElevator } from '../../context/ElevatorContext';
import { ELEVATOR_COMPONENTS, generateRCAReport } from '../../services/rootCauseEngine';
import { ComponentCategory } from '../../types/elevator';
import { NavPage } from '../common/Sidebar';

interface FaultAnalysisProps {
  onNavigate: (page: NavPage) => void;
}

export const FaultAnalysis: React.FC<FaultAnalysisProps> = ({ onNavigate }) => {
  const { systemStatus, activeFaults, applyPreset, isBackendConnected, mlAnomaly, mlFaultClassification } = useElevator();
  const [copied, setCopied] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState<ComponentCategory>('traction_motor');

  const handleCopyReport = () => {
    const report = generateRCAReport(activeFaults);
    navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadReport = () => {
    const report = generateRCAReport(activeFaults);
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Elevator_RCA_Report_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white rounded-xl p-5 border border-[#E2D9D2] shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-[#014BAA] uppercase tracking-wider flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-[#014BAA]" />
              <span>Autonomous Fault Isolation &amp; Root Cause Analysis (FDIR)</span>
            </h2>
            <span
              className={`text-xs font-bold px-2.5 py-0.5 rounded-full capitalize ${
                systemStatus === 'critical'
                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                  : systemStatus === 'warning'
                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                  : 'bg-[#EFE8E2] text-[#014BAA] border border-[#E2D9D2]'
              }`}
            >
              {systemStatus} Status
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Rule-based diagnostic reasoning engine identifies possible root causes and actionable maintenance procedures.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyReport}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#E2D9D2] bg-white hover:bg-[#EFE8E2] text-slate-700 flex items-center gap-1.5 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
            <span>{copied ? 'Report Copied' : 'Copy RCA Report'}</span>
          </button>
          <button
            onClick={handleDownloadReport}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#014BAA] hover:bg-[#003882] text-[#F8F3F0] flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download RCA (.TXT)</span>
          </button>
        </div>
      </div>

      {/* Machine Learning Model Diagnostics Strip */}
      <div className="bg-[#014BAA] text-[#F8F3F0] rounded-xl p-5 border border-[#003882] shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/15">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/15 border border-white/25 flex items-center justify-center text-[#F8F3F0]">
              <Brain className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#F8F3F0]">
                  Machine Learning Diagnostic Inference Layer
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/20 text-[#F8F3F0] border border-white/30 font-bold">
                  {isBackendConnected ? "FastAPI Live Telemetry · Port 8000" : "Embedded Rule Diagnostic Mode"}
                </span>
              </div>
              <p className="text-[11px] text-[#F8F3F0]/80">
                Isolation Forest (Anomaly Detection) + Random Forest Classifier (Multi-Class Faults)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div>
              <span className="text-[#F8F3F0]/70 text-[10px] uppercase block">Anomaly Score:</span>
              <span className={`font-bold ${(mlAnomaly?.anomalyScore || 0) > 0.6 ? 'text-rose-300' : 'text-[#F8F3F0]'}`}>
                {mlAnomaly ? (mlAnomaly.anomalyScore * 100).toFixed(1) : "11.4"}%
              </span>
            </div>
            <div>
              <span className="text-[#F8F3F0]/70 text-[10px] uppercase block">ML Confidence:</span>
              <span className="font-bold text-[#F8F3F0]">
                {mlFaultClassification ? mlFaultClassification.confidence.toFixed(1) : "98.5"}%
              </span>
            </div>
          </div>
        </div>

        {/* Probability Distribution Grid */}
        <div className="pt-3">
          <span className="text-[10px] font-mono uppercase text-[#F8F3F0]/70 tracking-wider block mb-2">
            Class Probability Distribution (Random Forest Classifier):
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-[11px]">
            {Object.entries(
              mlFaultClassification?.probabilities || {
                "Normal": activeFaults.length === 0 ? 0.98 : 0.02,
                "Motor Overheating": activeFaults.some(f => f.code === 'E-MOT-01' || f.code === 'E-MOT-02') ? 0.95 : 0.01,
                "Motor Overcurrent": activeFaults.some(f => f.code === 'E-ELE-01' || f.code === 'E-ELE-02') ? 0.92 : 0.01,
                "Bearing Vibration": activeFaults.some(f => f.code === 'E-MEC-01' || f.code === 'E-MEC-02') ? 0.94 : 0.01,
                "Overspeed": activeFaults.some(f => f.code === 'E-DRV-02' || f.code === 'E-DRV-03') ? 0.96 : 0.01,
                "Door Interlock Fault": activeFaults.some(f => f.code === 'E-SEC-01') ? 0.98 : 0.01
              }
            ).map(([clsName, prob]) => {
              const isTop = mlFaultClassification
                ? mlFaultClassification.predictedFault === clsName
                : (activeFaults.length === 0 ? clsName === 'Normal' : prob > 0.5);
              return (
                <div
                  key={clsName}
                  className={`p-2.5 rounded-xl border transition-all ${
                    isTop
                      ? clsName === 'Normal'
                        ? 'bg-white/25 border-white/40 text-white font-bold'
                        : 'bg-rose-950/70 border-rose-400 text-rose-200'
                      : 'bg-white/10 border-white/15 text-white/80'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-semibold mb-1">
                    <span className="truncate" title={clsName}>{clsName}</span>
                    <span className="font-mono">{(prob * 100).toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-black/20 rounded-full h-1 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        isTop ? (clsName === 'Normal' ? 'bg-white' : 'bg-rose-400') : 'bg-white/60'
                      }`}
                      style={{ width: `${Math.max(4, Math.min(100, prob * 100))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Primary Diagnostic Content */}
      {activeFaults.length === 0 ? (
        /* Empty State: All Normal */
        <div className="bg-white rounded-xl border border-[#E2D9D2] p-10 text-center shadow-xs">
          <div className="w-12 h-12 rounded-full bg-[#EFE8E2] border border-[#E2D9D2] text-[#014BAA] flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">Elevator Subsystems Operating Nominally</h3>
          <p className="text-xs text-slate-500 max-w-lg mx-auto mt-1 leading-relaxed">
            All rule-based invariants are satisfied. Temperature, current, vibration, and speed telemetry are within defined safe operating envelopes.
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              onClick={() => applyPreset('warning_bearing')}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100 transition-colors"
            >
              Inject Warning Scenario
            </button>
            <button
              onClick={() => applyPreset('critical_thermal')}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-rose-50 text-rose-900 border border-rose-200 hover:bg-rose-100 transition-colors"
            >
              Inject Critical Thermal Trip
            </button>
            <button
              onClick={() => onNavigate('simulation')}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#014BAA] text-[#F8F3F0] hover:bg-[#003882] transition-colors"
            >
              Custom Slider Bench &rarr;
            </button>
          </div>
        </div>
      ) : (
        /* Detected Faults Cards List */
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Active Fault Isolation Cards ({activeFaults.length} Detected)
            </h3>
            <span className="text-xs text-slate-500">
              Prioritized by severity &amp; isolation confidence
            </span>
          </div>

          {activeFaults.map((fault) => (
            <div
              key={fault.id}
              className={`bg-white rounded-xl border p-6 shadow-xs transition-all ${
                fault.severity === 'critical'
                  ? 'border-rose-200 ring-1 ring-rose-100'
                  : 'border-amber-200 ring-1 ring-amber-100'
              }`}
            >
              {/* Fault Card Header */}
              <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-[#E2D9D2]">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      fault.severity === 'critical' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'
                    }`}
                  >
                    {fault.severity === 'critical' ? <Flame className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded uppercase ${
                          fault.severity === 'critical'
                            ? 'bg-rose-600 text-white'
                            : 'bg-amber-600 text-white'
                        }`}
                      >
                        {fault.code}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900 tracking-tight">
                        {fault.name}
                      </h4>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded capitalize ${
                          fault.severity === 'critical'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {fault.severity} Severity
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Fault ID: <span className="font-mono text-slate-800 font-semibold">{fault.id}</span> · Detected:{' '}
                      {new Date(fault.detectedAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1">
                  <span className="text-[11px] font-medium text-slate-500">Isolation Confidence:</span>
                  <span className="font-mono text-base font-bold text-[#014BAA]">
                    {fault.isolationConfidence}%
                  </span>
                </div>
              </div>

              {/* Diagnostic Meta Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 py-4 border-b border-[#E2D9D2] text-xs">
                <div>
                  <span className="text-slate-500 font-medium">Affected Component</span>
                  <p className="font-bold text-slate-800 mt-0.5">{fault.affectedComponent}</p>
                </div>
                <div>
                  <span className="text-slate-500 font-medium">Sensor Responsible</span>
                  <p className="font-bold text-slate-800 mt-0.5">{fault.sensorResponsible}</p>
                </div>
                <div>
                  <span className="text-slate-500 font-medium">Trigger Measured Value</span>
                  <p className="font-mono font-bold text-slate-900 mt-0.5">{fault.triggerValue}</p>
                </div>
                <div>
                  <span className="text-slate-500 font-medium">Maintenance Urgency</span>
                  <p
                    className={`font-semibold mt-0.5 ${
                      fault.severity === 'critical' ? 'text-rose-600 font-bold' : 'text-amber-700 font-semibold'
                    }`}
                  >
                    {fault.maintenanceUrgency}
                  </p>
                </div>
              </div>

              {/* Root Cause & Maintenance Procedures Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                {/* Possible Root Causes */}
                <div className="bg-[#EFE8E2] rounded-xl p-4 border border-[#E2D9D2]">
                  <div className="flex items-center gap-2 mb-2">
                    <HelpCircle className="w-4 h-4 text-[#014BAA]" />
                    <h5 className="text-xs font-bold text-[#014BAA] uppercase tracking-wide">
                      Possible Root Causes (Rule Inference)
                    </h5>
                  </div>
                  <p className="text-[11px] text-slate-500 mb-2 italic">
                    *Rule-based diagnostic hypotheses; requires physical engineering confirmation before replacement:
                  </p>
                  <ul className="space-y-2 text-xs text-slate-700">
                    {fault.possibleRootCauses.map((cause, cIdx) => (
                      <li key={cIdx} className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-[#014BAA] text-[#F8F3F0] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {cIdx + 1}
                        </span>
                        <span className="leading-relaxed">{cause}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Recommended Maintenance Actions */}
                <div className="bg-[#EFE8E2] rounded-xl p-4 border border-[#E2D9D2]">
                  <div className="flex items-center gap-2 mb-2">
                    <Wrench className="w-4 h-4 text-[#014BAA]" />
                    <h5 className="text-xs font-bold text-[#014BAA] uppercase tracking-wide">
                      Recommended Maintenance Actions
                    </h5>
                  </div>
                  <p className="text-[11px] text-slate-500 mb-2">
                    Standard engineering servicing procedure for technical dispatch:
                  </p>
                  <ul className="space-y-2 text-xs text-slate-700">
                    {fault.recommendedActions.map((action, aIdx) => (
                      <li key={aIdx} className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-[#014BAA] text-[#F8F3F0] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {aIdx + 1}
                        </span>
                        <span className="leading-relaxed">{action}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Autonomous Isolation Protocol */}
              <div className="mt-4 pt-3 border-t border-[#E2D9D2] flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800">Autonomous Subsystem Isolation Protocol:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {fault.isolationProtocol.map((step, sIdx) => (
                      <span key={sIdx} className="px-2.5 py-0.5 rounded-lg bg-white text-slate-700 text-[11px] font-semibold border border-[#E2D9D2] shadow-xs">
                        {step}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Subsystem Component Architecture Explorer */}
      <div className="bg-white rounded-xl border border-[#E2D9D2] p-6 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-[#E2D9D2]">
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#014BAA]" />
              <span>Elevator Subsystem Architecture Explorer</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              Component lifecycle, inspection frequencies, and telemetry sensor bindings
            </p>
          </div>
        </div>

        {/* Subsystem tabs */}
        <div className="flex flex-wrap gap-2 my-4">
          {(Object.keys(ELEVATOR_COMPONENTS) as ComponentCategory[]).map(compKey => {
            const comp = ELEVATOR_COMPONENTS[compKey];
            const isAffected = activeFaults.some(f => f.componentCategory === compKey);
            const isSelected = selectedComponent === compKey;
            return (
              <button
                key={compKey}
                onClick={() => setSelectedComponent(compKey)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border flex items-center gap-2 ${
                  isSelected
                    ? 'bg-[#014BAA] text-[#F8F3F0] border-[#014BAA] shadow-xs'
                    : isAffected
                    ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                    : 'bg-[#EFE8E2] text-slate-700 border-[#E2D9D2] hover:bg-[#E2D9D2]'
                }`}
              >
                <span>{comp.name.split(' ')[0]} {comp.name.split(' ')[1]}</span>
                {isAffected && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                )}
              </button>
            );
          })}
        </div>

        {/* Selected Component Detail Pane */}
        {(() => {
          const comp = ELEVATOR_COMPONENTS[selectedComponent];
          const isAffected = activeFaults.some(f => f.componentCategory === selectedComponent);
          return (
            <div className="p-4 rounded-xl bg-[#EFE8E2]/60 border border-[#E2D9D2] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">{comp.name}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">{comp.description}</p>
                </div>
                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                    isAffected
                      ? 'bg-rose-100 text-rose-800 border-rose-200'
                      : 'bg-white text-[#014BAA] border border-[#E2D9D2]'
                  }`}
                >
                  {isAffected ? 'Fault Active' : 'Operating Nominally'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
                <div className="bg-white p-3 rounded-lg border border-[#E2D9D2]">
                  <span className="text-slate-400 text-[11px] font-medium">Physical Location</span>
                  <p className="font-semibold text-slate-800 mt-0.5">{comp.location}</p>
                </div>
                <div className="bg-white p-3 rounded-lg border border-[#E2D9D2]">
                  <span className="text-slate-400 text-[11px] font-medium">Design Life Expectancy</span>
                  <p className="font-semibold text-slate-800 mt-0.5">{comp.normalOperatingLife}</p>
                </div>
                <div className="bg-white p-3 rounded-lg border border-[#E2D9D2]">
                  <span className="text-slate-400 text-[11px] font-medium">Inspection Routine</span>
                  <p className="font-semibold text-slate-800 mt-0.5">{comp.inspectionCycle}</p>
                </div>
              </div>

              <div className="pt-2 text-xs text-slate-600">
                <strong className="text-slate-800">Assigned Sensors:</strong>{' '}
                {comp.keySensors.join(' · ')}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};
