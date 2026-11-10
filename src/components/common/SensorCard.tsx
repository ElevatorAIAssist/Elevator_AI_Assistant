import React from 'react';
import { LucideIcon, AlertTriangle, Flame, CheckCircle } from 'lucide-react';
import { SystemStatus } from '../../types/elevator';

interface SensorCardProps {
  title: string;
  subtitle?: string;
  value: string | number;
  unit: string;
  icon: LucideIcon;
  status: SystemStatus;
  isStale?: boolean;
  isDisconnected?: boolean;
  warningThreshold?: string;
  criticalThreshold?: string;
  percentage?: number; // 0 to 100 relative to full scale
  subtext?: string;
  onClick?: () => void;
}

export const SensorCard: React.FC<SensorCardProps> = ({
  title,
  subtitle,
  value,
  unit,
  icon: Icon,
  status,
  isStale = false,
  isDisconnected = false,
  warningThreshold,
  criticalThreshold,
  percentage = 40,
  subtext,
  onClick
}) => {
  const getStatusStyles = () => {
    if (isDisconnected) {
      return {
        border: 'border-[#E2D9D2]',
        badge: 'bg-slate-100 text-slate-500 border-slate-300',
        barColor: 'bg-slate-300',
        iconBg: 'bg-[#EFE8E2] text-slate-400 border-[#E2D9D2]',
        valueColor: 'text-slate-500'
      };
    }
    switch (status) {
      case 'critical':
        return {
          border: 'border-rose-300 ring-1 ring-rose-200',
          badge: 'bg-rose-100 text-rose-800 border-rose-200',
          barColor: 'bg-rose-500',
          iconBg: 'bg-rose-50 text-rose-600 border-rose-200',
          valueColor: 'text-rose-700'
        };
      case 'warning':
        return {
          border: 'border-amber-300 ring-1 ring-amber-200',
          badge: 'bg-amber-100 text-amber-800 border-amber-200',
          barColor: 'bg-amber-500',
          iconBg: 'bg-amber-50 text-amber-600 border-amber-200',
          valueColor: 'text-amber-700'
        };
      case 'normal':
      default:
        return {
          border: 'border-[#E2D9D2] hover:border-[#014BAA]/40',
          badge: 'bg-[#EFE8E2] text-[#014BAA] border-[#E2D9D2]',
          barColor: 'bg-[#014BAA]',
          iconBg: 'bg-[#EFE8E2] text-[#014BAA] border-[#E2D9D2]',
          valueColor: 'text-[#014BAA]'
        };
    }
  };

  const styles = getStatusStyles();

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl p-4.5 border transition-all duration-200 shadow-xs flex flex-col justify-between ${styles.border} ${
        onClick ? 'cursor-pointer hover:shadow-md' : ''
      }`}
    >
      <div>
        {/* Header Row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${styles.iconBg}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-slate-800 truncate">{title}</h3>
              {subtitle ? (
                <p className="text-[10px] font-medium text-slate-500 truncate leading-tight">{subtitle}</p>
              ) : (
                <p className="text-[10px] text-slate-400 truncate">Telemetry Stream</p>
              )}
            </div>
          </div>

          <div className="shrink-0 flex items-center">
            {isDisconnected ? (
              <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-300">
                Disconnected
              </span>
            ) : isStale ? (
              <span className="text-[10px] font-mono font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-300">
                STALE
              </span>
            ) : (
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${styles.badge}`}>
                {status === 'critical' && <Flame className="w-3 h-3 text-rose-600" />}
                {status === 'warning' && <AlertTriangle className="w-3 h-3 text-amber-600" />}
                {status === 'normal' && <CheckCircle className="w-3 h-3 text-[#014BAA]" />}
                <span>{status}</span>
              </span>
            )}
          </div>
        </div>

        {/* Value Display */}
        <div className="mt-4 flex items-baseline gap-1.5">
          <span className={`text-2xl font-bold font-mono tracking-tight tabular-nums ${styles.valueColor}`}>
            {value}
          </span>
          <span className="text-xs font-bold text-slate-500 uppercase">{unit}</span>
        </div>

        {/* Subtext info */}
        {subtext && (
          <p className="mt-1 text-[11px] text-slate-600 truncate">{subtext}</p>
        )}
      </div>

      {/* Progress / Gauge bar */}
      <div className="mt-4 pt-3 border-t border-[#E2D9D2]/60">
        <div className="w-full bg-[#EFE8E2] rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 rounded-full ${styles.barColor}`}
            style={{ width: `${Math.max(0, Math.min(100, percentage))}%` }}
          />
        </div>

        {/* Threshold indicators */}
        {(warningThreshold || criticalThreshold) && (
          <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 font-mono">
            <span>Warn: {warningThreshold}</span>
            <span>Crit: {criticalThreshold}</span>
          </div>
        )}
      </div>
    </div>
  );
};
