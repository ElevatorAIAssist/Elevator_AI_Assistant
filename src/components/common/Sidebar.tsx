import React from 'react';
import {
  LayoutDashboard,
  Activity,
  SlidersHorizontal,
  ShieldAlert,
  History,
  Settings,
  Cpu,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Flame
} from 'lucide-react';
import { useElevator } from '../../context/ElevatorContext';

export type NavPage = 'dashboard' | 'monitoring' | 'simulation' | 'faults' | 'history' | 'settings';

interface SidebarProps {
  currentPage: NavPage;
  onSelectPage: (page: NavPage) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onSelectPage }) => {
  const { systemStatus, activeFaults, operatingMode } = useElevator();

  const navItems = [
    { id: 'dashboard' as NavPage, label: 'Dashboard Overview', icon: LayoutDashboard },
    { id: 'monitoring' as NavPage, label: 'Live Monitoring', icon: Activity },
    { id: 'simulation' as NavPage, label: 'Sensor Simulation', icon: SlidersHorizontal },
    {
      id: 'faults' as NavPage,
      label: 'Fault Analysis (RCA)',
      icon: ShieldAlert,
      badge: activeFaults.length > 0 ? activeFaults.length : undefined
    },
    { id: 'history' as NavPage, label: 'Alert History', icon: History },
    { id: 'settings' as NavPage, label: 'Threshold Settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-[#EFE8E2] text-slate-800 flex flex-col shrink-0 border-r border-[#E2D9D2] select-none min-h-screen">
      {/* Brand Header */}
      <div className="p-5 border-b border-[#E2D9D2]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#014BAA] text-[#F8F3F0] flex items-center justify-center shrink-0 shadow-xs">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-[#014BAA] tracking-tight leading-tight">
              A-FDIR Assistant
            </div>
            <div className="text-[11px] text-slate-600 leading-tight">
              Elevator Diagnostic Core
            </div>
          </div>
        </div>
        <div className="mt-3 pt-2.5 border-t border-[#E2D9D2] flex items-center justify-between text-[11px]">
          <span className="text-slate-500 font-medium">Unit ID:</span>
          <span className="font-mono text-[#014BAA] font-bold">ELV-SHAFT-01</span>
        </div>
      </div>

      {/* System Status Indicator Widget */}
      <div className="mx-4 my-3 p-3 rounded-xl bg-white border border-[#E2D9D2] shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">
            System Status
          </span>
          {systemStatus === 'normal' && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Normal</span>
            </span>
          )}
          {systemStatus === 'warning' && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>Warning</span>
            </span>
          )}
          {systemStatus === 'critical' && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 animate-pulse">
              <Flame className="w-3.5 h-3.5 text-rose-600" />
              <span>Critical Trip</span>
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-slate-600 pt-2 border-t border-[#E2D9D2]">
          <span>Active Faults:</span>
          <span className={`font-mono font-bold ${activeFaults.length > 0 ? (systemStatus === 'critical' ? 'text-rose-600' : 'text-amber-600') : 'text-slate-800'}`}>
            {activeFaults.length}
          </span>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-3 py-2 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectPage(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all text-left ${
                isActive
                  ? 'bg-[#014BAA] text-[#F8F3F0] shadow-sm'
                  : 'text-slate-700 hover:text-[#014BAA] hover:bg-white/80'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#F8F3F0]' : 'text-[#014BAA]'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                    isActive
                      ? 'bg-white text-[#014BAA]'
                      : 'bg-rose-100 text-rose-700 border border-rose-200'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer mode badge */}
      <div className="p-4 border-t border-[#E2D9D2] text-[11px] text-slate-500">
        <div className="flex items-center justify-between">
          <span>Operating Mode:</span>
          <span className="font-semibold text-[#014BAA] capitalize">
            {operatingMode === 'simulation' ? 'Simulation' : 'Real Hardware'}
          </span>
        </div>
      </div>
    </aside>
  );
};
