import { useState, useEffect } from 'react';
import { AdminService } from '../../services/admin.service';

interface FeatureInfo {
  name: string;
  description: string;
  category: string;
  tierValue: boolean;
  customValue: boolean | null;
  effectiveValue: boolean;
  isOverridden: boolean;
}

interface Props {
  organizationId: string;
}

export default function FeatureOverridesTab({ organizationId }: Props) {
  const [features, setFeatures] = useState<Record<string, FeatureInfo> | null>(null);
  const [, setTier] = useState<string>('');
  const [tierDisplayName, setTierDisplayName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    loadFeatures();
  }, [organizationId]);

  const loadFeatures = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await AdminService.getOrganizationFeatures(organizationId);
      setFeatures(data.features);
      setTier(data.tier);
      setTierDisplayName(data.tierDisplayName);
    } catch (err: any) {
      setError(err.message || 'Failed to load features');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (featureKey: string, currentEffective: boolean) => {
    if (!features) return;

    try {
      setSaving(featureKey);
      setError(null);
      setSuccessMessage(null);

      const newValue = !currentEffective;
      await AdminService.updateOrganizationFeatures(organizationId, {
        [featureKey]: newValue,
      });

      // Update local state
      setFeatures({
        ...features,
        [featureKey]: {
          ...features[featureKey],
          customValue: newValue,
          effectiveValue: newValue,
          isOverridden: true,
        },
      });

      setSuccessMessage(`${features[featureKey].name} ${newValue ? 'enabled' : 'disabled'}`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update feature');
    } finally {
      setSaving(null);
    }
  };

  const handleReset = async (featureKey: string) => {
    if (!features) return;

    try {
      setSaving(featureKey);
      setError(null);
      setSuccessMessage(null);

      await AdminService.updateOrganizationFeatures(organizationId, {
        [featureKey]: null,
      });

      // Update local state - reset to tier default
      const tierValue = features[featureKey].tierValue;
      setFeatures({
        ...features,
        [featureKey]: {
          ...features[featureKey],
          customValue: null,
          effectiveValue: tierValue,
          isOverridden: false,
        },
      });

      setSuccessMessage(`${features[featureKey].name} reset to tier default`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to reset feature');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-gray-600">Loading features...</span>
      </div>
    );
  }

  if (error && !features) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">{error}</p>
        <button
          onClick={loadFeatures}
          className="mt-2 text-red-600 hover:text-red-800 font-medium"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!features) return null;

  // Group features by category
  const categories = Object.entries(features).reduce((acc, [key, feature]) => {
    const category = feature.category || 'Other';
    if (!acc[category]) acc[category] = [];
    acc[category].push({ key, ...feature });
    return acc;
  }, {} as Record<string, Array<FeatureInfo & { key: string }>>);

  // Sort categories in a logical order
  const categoryOrder = [
    'Recording',
    'AI',
    'Collaboration',
    'Analytics',
    'Integrations',
    'Branding',
    'Security',
    'Support',
    'Other',
  ];
  const sortedCategories = Object.keys(categories).sort(
    (a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b)
  );

  const overriddenCount = Object.values(features).filter((f) => f.isOverridden).length;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-lg font-semibold text-gray-900">Feature Overrides</h4>
            <p className="text-sm text-gray-600 mt-1">
              Current tier: <span className="font-medium">{tierDisplayName}</span>
              {overriddenCount > 0 && (
                <span className="ml-2 text-amber-600">
                  ({overriddenCount} override{overriddenCount !== 1 ? 's' : ''} active)
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Status messages */}
        {error && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
            {error}
          </div>
        )}
        {successMessage && (
          <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
            {successMessage}
          </div>
        )}
      </div>

      {/* Feature Categories */}
      <div className="space-y-6">
        {sortedCategories.map((category) => (
          <div key={category} className="bg-gray-50 rounded-lg p-4">
            <h5 className="font-medium text-gray-900 mb-3">{category}</h5>
            <div className="space-y-3">
              {categories[category].map((feature) => (
                <div
                  key={feature.key}
                  className={`flex items-center justify-between p-3 rounded-lg transition ${
                    feature.isOverridden
                      ? 'bg-amber-50 border border-amber-200'
                      : 'bg-white border border-gray-200'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{feature.name}</span>
                      {feature.isOverridden && (
                        <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                          Overridden
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 truncate">{feature.description}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Tier default: {feature.tierValue ? 'Enabled' : 'Disabled'}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 ml-4">
                    {/* Reset button (only show if overridden) */}
                    {feature.isOverridden && (
                      <button
                        onClick={() => handleReset(feature.key)}
                        disabled={saving === feature.key}
                        className="text-xs text-gray-600 hover:text-gray-900 disabled:opacity-50"
                      >
                        Reset
                      </button>
                    )}

                    {/* Toggle switch */}
                    <button
                      onClick={() => handleToggle(feature.key, feature.effectiveValue)}
                      disabled={saving === feature.key}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
                        feature.effectiveValue ? 'bg-blue-600' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          feature.effectiveValue ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                      {saving === feature.key && (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          <span className="inline-block w-3 h-3 bg-amber-50 border border-amber-200 rounded mr-1"></span>
          Features highlighted in amber have custom overrides applied.
          Click "Reset" to restore tier defaults.
        </p>
      </div>
    </div>
  );
}
