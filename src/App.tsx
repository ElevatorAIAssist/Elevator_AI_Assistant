/**
 * Autonomous Fault Isolation and Root Cause Analysis Assistant for Elevator Systems
 * Main Application Entry
 */

import React, { useState } from 'react';
import { ElevatorProvider, useElevator } from './context/ElevatorContext';
import { Sidebar, NavPage } from './components/common/Sidebar';
import { Header } from './components/common/Header';
import { DashboardOverview } from './components/dashboard/DashboardOverview';
import { LiveMonitoring } from './components/monitoring/LiveMonitoring';
import { SensorSimulation } from './components/simulation/SensorSimulation';
import { FaultAnalysis } from './components/faults/FaultAnalysis';
import { AlertHistory } from './components/history/AlertHistory';
import { SettingsPage } from './components/settings/SettingsPage';
import { HardwarePendingModal } from './components/common/HardwarePendingModal';

const AppContent: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<NavPage>('dashboard');
  const [isHardwareModalOpen, setIsHardwareModalOpen] = useState(false);
  const { operatingMode, connectionState } = useElevator();

  return (
    <div className="flex min-h-screen bg-[#F8F3F0] text-slate-800 font-sans">
      {/* 1. Light Cream Sidebar with Royal Blue Accents */}
      <Sidebar currentPage={currentPage} onSelectPage={setCurrentPage} />

      {/* 2. Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#F8F3F0]">
        {/* Top Header */}
        <Header
          currentPage={currentPage}
          onSelectPage={setCurrentPage}
          onOpenHardwareModal={() => setIsHardwareModalOpen(true)}
        />

        {/* Real Sensor Mode Notice Banner (if in Real Hardware mode) */}
        {operatingMode === 'real_hardware' && (
          <div
            className={`px-6 py-2.5 text-xs flex items-center justify-between border-b ${
              connectionState === 'hardware_connected'
                ? 'bg-[#014BAA] text-[#F8F3F0] border-[#003882]'
                : 'bg-[#EFE8E2] text-[#014BAA] border-[#E2D9D2]'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  connectionState === 'hardware_connected' ? 'bg-[#F8F3F0] animate-ping' : 'bg-rose-500'
                }`}
              />
              <span>
                <strong>Real Sensor Mode:</strong>{' '}
                {connectionState === 'hardware_connected'
                  ? 'Physical ESP32 connection verified. Live telemetry streaming.'
                  : 'Physical ESP32 + FastAPI hardware bridge unavailable (Disconnected).'}
              </span>
            </div>
            <button
              onClick={() => setIsHardwareModalOpen(true)}
              className="text-[11px] underline hover:opacity-80 font-medium ml-4 shrink-0"
            >
              Hardware Diagnostics &amp; Architecture
            </button>
          </div>
        )}

        {/* Main Viewport Content */}
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
          {currentPage === 'dashboard' && <DashboardOverview onNavigate={setCurrentPage} />}
          {currentPage === 'monitoring' && <LiveMonitoring />}
          {currentPage === 'simulation' && <SensorSimulation onNavigate={setCurrentPage} />}
          {currentPage === 'faults' && <FaultAnalysis onNavigate={setCurrentPage} />}
          {currentPage === 'history' && <AlertHistory />}
          {currentPage === 'settings' && <SettingsPage />}
        </main>

        {/* Industrial Footer */}
        <footer className="border-t border-[#E2D9D2] bg-[#EFE8E2] px-6 py-3.5 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#014BAA]">Autonomous Elevator FDIR Assistant</span>
            <span>·</span>
            <span>Elevator FDIR Diagnostic System</span>
          </div>

          <div className="flex items-center gap-4 text-[11px] font-mono text-slate-500">
            <span>Standard: EN 81-20/50 Baseline</span>
            <span>·</span>
            <span>Unit: Traction Car 01</span>
            <span>·</span>
            <div className="flex items-center gap-1.5 font-medium">
              <span
                className={`w-2 h-2 rounded-full ${
                  connectionState === 'disconnected' ? 'bg-rose-500' : 'bg-[#014BAA] animate-pulse'
                }`}
              />
              <span
                className={
                  connectionState === 'disconnected' ? 'text-rose-600 font-semibold' : 'text-[#014BAA] font-semibold'
                }
              >
                {connectionState === 'simulation_active' && 'Simulation Active'}
                {connectionState === 'hardware_connected' && 'Hardware Connected'}
                {connectionState === 'disconnected' && 'Disconnected'}
              </span>
            </div>
          </div>
        </footer>
      </div>

      {/* Hardware Pending Modal */}
      <HardwarePendingModal
        isOpen={isHardwareModalOpen}
        onClose={() => setIsHardwareModalOpen(false)}
      />
    </div>
  );
};

export default function App() {
  return (
    <ElevatorProvider>
      <AppContent />
    </ElevatorProvider>
  );
}
