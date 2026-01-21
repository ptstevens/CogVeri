import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { useOrganization } from '../../contexts/OrganizationContext';
import Card from '../ui/Card';
import api from '../../services/api';

interface UsageMetric {
  feature: string;
  current: number;
  limit: number;
  unit: string;
  percentageUsed: number;
}

interface UsageData {
  organization_id: string;
  tier: string;
  metrics: UsageMetric[];
  warning_threshold: number;
}

const ProgressBar = ({ percentage, atLimit = false, warning = false }: { percentage: number; atLimit?: boolean; warning?: boolean }) => {
  let bgColor = 'bg-success-500';
  if (warning) bgColor = 'bg-warning-500';
  if (atLimit) bgColor = 'bg-amber-500';
  if (percentage > 100) bgColor = 'bg-error-500';

  return (
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div
        className={`${bgColor} h-2 rounded-full transition-all`}
        style={{ width: `${Math.min(percentage, 100)}%` }}
      />
    </div>
  );
};

const UsageDisplay = () => {
  const { currentOrganization } = useOrganization();
  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentOrganization) return;

    const fetchUsage = async () => {
      try {
        setIsLoading(true);
        const response = await api.get('/pricing/organization/usage');
        setUsageData(response.data);
      } catch (err: any) {
        setError(err.response?.data?.error || err.message || 'Failed to fetch usage data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsage();
  }, [currentOrganization]);

  if (isLoading) {
    return <div className="text-center py-8">Loading usage information...</div>;
  }

  if (error) {
    return <div className="text-center py-8 text-error">{error}</div>;
  }

  if (!usageData || !usageData.metrics) {
    return null;
  }

  const getFeatureLabel = (feature: string) => {
    const labels: Record<string, string> = {
      members: 'Team Members',
      storage: 'Storage Usage',
      tasks: 'Tasks per Month',
    };
    return labels[feature] || feature;
  };

  const getFeatureIcon = (feature: string) => {
    switch (feature) {
      case 'members':
        return '👥';
      case 'storage':
        return '💾';
      case 'tasks':
        return '📋';
      default:
        return '📊';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Resource Usage</h2>
        <p className="text-gray-600">
          Your current usage for the {usageData.tier.charAt(0).toUpperCase() + usageData.tier.slice(1)} plan
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {usageData.metrics.map(metric => {
          const percentageUsed = metric.percentageUsed || (metric.current / metric.limit) * 100;
          const isWarning = percentageUsed >= usageData.warning_threshold;
          const isAtLimit = metric.current === metric.limit;
          const isExceeded = metric.current > metric.limit;

          return (
            <Card key={metric.feature} className={isExceeded ? 'border-error-200 bg-error-50' : isAtLimit ? 'border-amber-200 bg-amber-50' : ''}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <span className="mr-2">{getFeatureIcon(metric.feature)}</span>
                  {getFeatureLabel(metric.feature)}
                </h3>
                {isExceeded ? (
                  <AlertTriangle className="w-5 h-5 text-error-600" />
                ) : isAtLimit ? (
                  <CheckCircle className="w-5 h-5 text-amber-500" />
                ) : isWarning ? (
                  <AlertTriangle className="w-5 h-5 text-warning-600" />
                ) : (
                  <CheckCircle className="w-5 h-5 text-success-600" />
                )}
              </div>

              <div className="mb-3">
                <ProgressBar percentage={percentageUsed} atLimit={isAtLimit} warning={isWarning && !isAtLimit && !isExceeded} />
              </div>

              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-gray-900">
                  {metric.current.toLocaleString()}
                </span>
                <span className="text-sm text-gray-600">
                  of {metric.limit.toLocaleString()} {metric.unit}
                </span>
              </div>

              <div className="mt-2 text-sm">
                <p className="text-gray-700">
                  <span className="font-semibold">{percentageUsed.toFixed(1)}%</span> used
                </p>
              </div>

              {isExceeded && (
                <div className="mt-3 p-2 bg-error-100 rounded text-sm text-error-800">
                  You're over your plan limit. Please upgrade to add more.
                </div>
              )}

              {isAtLimit && !isExceeded && (
                <div className="mt-3 p-2 bg-amber-100 rounded text-sm text-amber-800">
                  You've reached your plan limit. Upgrade to add more.
                </div>
              )}

              {isWarning && !isAtLimit && !isExceeded && (
                <div className="mt-3 p-2 bg-warning-100 rounded text-sm text-warning-800">
                  Approaching your limit. Consider upgrading soon.
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default UsageDisplay;
