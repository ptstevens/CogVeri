import { AlertTriangle, CheckCircle, TrendingUp, Infinity } from 'lucide-react';

export interface UsageBarProps {
  label: string;
  current: number;
  max: number;
  unit?: string;
  warningThreshold?: number;
  showIcon?: boolean;
  compact?: boolean;
}

const UsageBar = ({
  label,
  current,
  max,
  unit = '',
  warningThreshold = 80,
  showIcon = true,
  compact = false,
}: UsageBarProps) => {
  const isUnlimited = max === -1;
  const rawPercentage = isUnlimited ? 0 : (current / max) * 100;
  const percentage = Math.min(rawPercentage, 100);
  const isWarning = !isUnlimited && percentage >= warningThreshold;
  const isAtLimit = !isUnlimited && current === max;
  const isExceeded = !isUnlimited && current > max;

  const getBarGradient = () => {
    if (isUnlimited) return 'bg-gradient-to-r from-primary-400 to-primary-500';
    if (isExceeded) return 'bg-gradient-to-r from-error-500 to-error-600';
    if (isAtLimit) return 'bg-gradient-to-r from-amber-400 to-amber-500';
    if (isWarning) return 'bg-gradient-to-r from-warning-400 to-warning-500';
    return 'bg-gradient-to-r from-primary-400 to-primary-500';
  };

  const getStatusIcon = () => {
    if (!showIcon) return null;
    if (isUnlimited) {
      return <TrendingUp className="w-4 h-4 text-primary-500" />;
    }
    if (isExceeded) {
      return <AlertTriangle className="w-4 h-4 text-error" />;
    }
    if (isAtLimit) {
      return <CheckCircle className="w-4 h-4 text-amber-500" />;
    }
    if (isWarning) {
      return <AlertTriangle className="w-4 h-4 text-warning" />;
    }
    return <CheckCircle className="w-4 h-4 text-success" />;
  };

  const formatValue = (value: number): string => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }
    return value.toLocaleString();
  };

  if (compact) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-600 font-medium">{label}</span>
          <span className="font-semibold text-gray-900">
            {formatValue(current)}
            {isUnlimited ? '' : ` / ${formatValue(max)}`}
            {unit && ` ${unit}`}
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
          <div
            className={`${getBarGradient()} h-2 rounded-full transition-all duration-500 ease-out`}
            style={{ width: isUnlimited ? '100%' : `${percentage}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="text-sm font-semibold text-gray-800">{label}</span>
        </div>
        <div className="text-right flex items-center gap-1.5">
          <span className="text-lg font-bold text-gray-900">{formatValue(current)}</span>
          {!isUnlimited && (
            <span className="text-sm text-gray-500 font-medium">
              / {formatValue(max)} {unit}
            </span>
          )}
          {isUnlimited && (
            <span className="flex items-center gap-1 text-sm text-primary-600 font-medium">
              <Infinity className="w-4 h-4" />
              Unlimited
            </span>
          )}
        </div>
      </div>

      <div className="relative">
        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden shadow-inner">
          <div
            className={`${getBarGradient()} h-2.5 rounded-full transition-all duration-500 ease-out relative`}
            style={{ width: isUnlimited ? '100%' : `${Math.max(percentage, 2)}%` }}
          >
            {/* Shine effect */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent" />
          </div>
        </div>
      </div>

      {!isUnlimited && (
        <div className="flex items-center justify-between text-xs">
          <span
            className={`font-medium ${
              isExceeded
                ? 'text-error-600'
                : isAtLimit
                ? 'text-amber-600'
                : isWarning
                ? 'text-warning-600'
                : 'text-gray-500'
            }`}
          >
            {percentage.toFixed(0)}% used
          </span>
          {isExceeded && (
            <span className="text-error-600 font-semibold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Over limit
            </span>
          )}
          {isAtLimit && !isExceeded && (
            <span className="text-amber-600 font-medium">At capacity</span>
          )}
          {isWarning && !isAtLimit && !isExceeded && (
            <span className="text-warning-600 font-semibold">Approaching limit</span>
          )}
        </div>
      )}
    </div>
  );
};

export default UsageBar;
