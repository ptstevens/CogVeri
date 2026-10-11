import React, { useState, useEffect } from 'react';
import api from '../../services/api';

interface PricingTier {
  id: string;
  name: string;
  displayName: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  limits: Record<string, number>;
  features: Record<string, boolean>;
  highlighted: boolean;
  ctaText: string;
  isActive: boolean;
  sortOrder: number;
  stripePriceIdMonthly: string | null;
  stripePriceIdYearly: string | null;
  stripeProductId: string | null;
  dbId: string;
  archived: boolean;
  archivedAt: string | null;
}

interface ArchiveInfo {
  organizationCount: number;
  organizations: Array<{
    id: string;
    name: string;
    memberCount: number;
  }>;
}

interface FeatureDefinition {
  name: string;
  description: string;
  category: string;
}

interface LimitDefinition {
  name: string;
  unit: string;
}

export default function AdminPricing() {
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTier, setEditingTier] = useState<PricingTier | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [featureDefinitions, setFeatureDefinitions] = useState<Record<string, FeatureDefinition>>(
    {}
  );
  const [limitDefinitions, setLimitDefinitions] = useState<Record<string, LimitDefinition>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveModalTier, setArchiveModalTier] = useState<PricingTier | null>(null);
  const [archiveInfo, setArchiveInfo] = useState<ArchiveInfo | null>(null);
  const [loadingArchiveInfo, setLoadingArchiveInfo] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async (includeArchived: boolean = showArchived) => {
    try {
      setLoading(true);
      setError(null);

      const [tiersRes, featuresRes, limitsRes] = await Promise.all([
        api.get(`/admin/pricing/tiers?includeArchived=${includeArchived}`),
        api.get('/admin/pricing/feature-definitions'),
        api.get('/admin/pricing/limit-definitions'),
      ]);

      setTiers(tiersRes.data.data.tiers);
      setFeatureDefinitions(featuresRes.data.data.features);
      setLimitDefinitions(limitsRes.data.data.limits);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to load pricing data');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (tier: PricingTier) => {
    try {
      setSaving(true);
      const endpoint = tier.isActive
        ? `/admin/pricing/tiers/${tier.name}/deactivate`
        : `/admin/pricing/tiers/${tier.name}/activate`;

      await api.patch(endpoint);
      await loadData();
      setSuccessMessage(`${tier.displayName} ${tier.isActive ? 'deactivated' : 'activated'}`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update tier status');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTier = async (tierData: Partial<PricingTier> & { name: string }) => {
    try {
      setSaving(true);
      setError(null);

      if (editingTier) {
        await api.put(`/admin/pricing/tiers/${editingTier.name}`, tierData);
        setSuccessMessage(`${tierData.displayName || editingTier.displayName} updated`);
      } else {
        await api.post('/admin/pricing/tiers', tierData);
        setSuccessMessage(`${tierData.displayName} created`);
      }

      await loadData();
      setEditingTier(null);
      setShowCreateModal(false);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save tier');
    } finally {
      setSaving(false);
    }
  };

  const handleShowArchiveInfo = async (tier: PricingTier) => {
    try {
      setLoadingArchiveInfo(true);
      setArchiveModalTier(tier);
      const res = await api.get(`/admin/pricing/tiers/${tier.name}/archive-info`);
      setArchiveInfo(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load archive info');
      setArchiveModalTier(null);
    } finally {
      setLoadingArchiveInfo(false);
    }
  };

  const handleArchiveTier = async () => {
    if (!archiveModalTier) return;
    try {
      setSaving(true);
      await api.patch(`/admin/pricing/tiers/${archiveModalTier.name}/archive`);
      setSuccessMessage(`${archiveModalTier.displayName} archived`);
      setArchiveModalTier(null);
      setArchiveInfo(null);
      await loadData(showArchived);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to archive tier');
    } finally {
      setSaving(false);
    }
  };

  const handleReactivateTier = async (tier: PricingTier) => {
    try {
      setSaving(true);
      await api.patch(`/admin/pricing/tiers/${tier.name}/reactivate`);
      setSuccessMessage(`${tier.displayName} reactivated`);
      await loadData(showArchived);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reactivate tier');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncToStripe = async (tier: PricingTier) => {
    try {
      setSyncing(tier.name);
      await api.post(`/admin/pricing/tiers/${tier.name}/sync-stripe`);
      setSuccessMessage(`${tier.displayName} synced to Stripe`);
      await loadData(showArchived);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to sync tier to Stripe');
    } finally {
      setSyncing(null);
    }
  };

  const getStripeStatus = (tier: PricingTier): 'synced' | 'partial' | 'not_synced' => {
    if (!tier.stripeProductId) return 'not_synced';
    const hasMonthly = tier.monthlyPrice === 0 || !!tier.stripePriceIdMonthly;
    const hasYearly = tier.yearlyPrice === 0 || !!tier.stripePriceIdYearly;
    if (hasMonthly && hasYearly) return 'synced';
    return 'partial';
  };

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading pricing data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pricing & Tiers</h1>
          <p className="text-gray-600 mt-1">Manage subscription tiers and pricing</p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => {
                setShowArchived(e.target.checked);
                loadData(e.target.checked);
              }}
              className="w-4 h-4 rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Show Archived</span>
          </label>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
          >
            + Create Tier
          </button>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}
      {successMessage && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-800">{successMessage}</p>
        </div>
      )}

      {/* Tiers Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tier
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Monthly
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Yearly
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Limits
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Stripe
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {tiers.map((tier) => {
              const stripeStatus = getStripeStatus(tier);
              return (
                <tr
                  key={tier.name}
                  className={`${!tier.isActive ? 'bg-gray-50 opacity-60' : ''} ${tier.archived ? 'bg-red-50' : ''}`}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{tier.displayName}</span>
                          {tier.highlighted && (
                            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                              Highlighted
                            </span>
                          )}
                          {tier.archived && (
                            <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded">
                              Archived
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">{tier.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-gray-900 font-medium">
                      {formatPrice(tier.monthlyPrice)}
                    </span>
                    <span className="text-gray-500 text-sm">/mo</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-gray-900 font-medium">
                      {formatPrice(tier.yearlyPrice)}
                    </span>
                    <span className="text-gray-500 text-sm">/yr</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-600">
                      <div>
                        {tier.limits.maxMembers === -1 ? 'Unlimited' : tier.limits.maxMembers}{' '}
                        members
                      </div>
                      <div>
                        {tier.limits.maxStorageGb === -1 ? 'Unlimited' : tier.limits.maxStorageGb}GB
                        storage
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        tier.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {tier.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          stripeStatus === 'synced'
                            ? 'bg-green-100 text-green-800'
                            : stripeStatus === 'partial'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {stripeStatus === 'synced'
                          ? 'Synced'
                          : stripeStatus === 'partial'
                            ? 'Partial'
                            : 'Not Synced'}
                      </span>
                      {stripeStatus !== 'synced' && tier.monthlyPrice > 0 && (
                        <button
                          onClick={() => handleSyncToStripe(tier)}
                          disabled={syncing === tier.name}
                          className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                          title="Sync to Stripe"
                        >
                          {syncing === tier.name ? '...' : 'Sync'}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {!tier.archived ? (
                      <>
                        <button
                          onClick={() => setEditingTier(tier)}
                          className="text-blue-600 hover:text-blue-900 mr-3"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleActive(tier)}
                          disabled={saving}
                          className={`mr-3 ${
                            tier.isActive
                              ? 'text-orange-600 hover:text-orange-900'
                              : 'text-green-600 hover:text-green-900'
                          } disabled:opacity-50`}
                        >
                          {tier.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={() => handleShowArchiveInfo(tier)}
                          disabled={saving}
                          className="text-red-600 hover:text-red-900 disabled:opacity-50"
                        >
                          Archive
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleReactivateTier(tier)}
                        disabled={saving}
                        className="text-green-600 hover:text-green-900 disabled:opacity-50"
                      >
                        Reactivate
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Feature Reference */}
      <div className="mt-8 bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Feature Reference</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          {Object.entries(featureDefinitions)
            .sort((a, b) => a[1].category.localeCompare(b[1].category))
            .map(([key, def]) => (
              <div key={key} className="flex items-start gap-2">
                <span className="text-gray-400 text-xs mt-1">{def.category}</span>
                <span className="text-gray-900">{def.name}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Edit/Create Modal */}
      {(editingTier || showCreateModal) && (
        <TierModal
          tier={editingTier}
          featureDefinitions={featureDefinitions}
          limitDefinitions={limitDefinitions}
          onSave={handleSaveTier}
          onCancel={() => {
            setEditingTier(null);
            setShowCreateModal(false);
          }}
          saving={saving}
        />
      )}

      {/* Archive Confirmation Modal */}
      {archiveModalTier && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Archive {archiveModalTier.displayName}?
            </h3>

            {loadingArchiveInfo ? (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            ) : archiveInfo ? (
              <div className="space-y-4">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-800">
                    <strong>{archiveInfo.organizationCount}</strong> organization(s) are currently
                    on this tier. They will keep their current features and limits until they
                    manually change tiers.
                  </p>
                </div>

                {archiveInfo.organizationCount > 0 && (
                  <div className="max-h-40 overflow-y-auto">
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      Affected Organizations:
                    </p>
                    <ul className="space-y-1">
                      {archiveInfo.organizations.slice(0, 10).map((org) => (
                        <li key={org.id} className="text-sm text-gray-600">
                          {org.name} ({org.memberCount} members)
                        </li>
                      ))}
                      {archiveInfo.organizationCount > 10 && (
                        <li className="text-sm text-gray-500 italic">
                          ... and {archiveInfo.organizationCount - 10} more
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                <p className="text-sm text-gray-600">Archiving this tier will:</p>
                <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
                  <li>Hide it from the pricing page</li>
                  <li>Prevent new sign-ups</li>
                  <li>Keep existing organizations functional</li>
                  <li>Archive the corresponding Stripe product</li>
                </ul>
              </div>
            ) : (
              <p className="text-sm text-gray-600">Failed to load archive info.</p>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setArchiveModalTier(null);
                  setArchiveInfo(null);
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleArchiveTier}
                disabled={saving || loadingArchiveInfo}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? 'Archiving...' : 'Archive Tier'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Tier Edit/Create Modal Component
function TierModal({
  tier,
  featureDefinitions,
  limitDefinitions,
  onSave,
  onCancel,
  saving,
}: {
  tier: PricingTier | null;
  featureDefinitions: Record<string, FeatureDefinition>;
  limitDefinitions: Record<string, LimitDefinition>;
  onSave: (data: any) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const isEditing = !!tier;
  const [formData, setFormData] = useState({
    name: tier?.name || '',
    displayName: tier?.displayName || '',
    description: tier?.description || '',
    monthlyPrice: tier?.monthlyPrice || 0,
    yearlyPrice: tier?.yearlyPrice || 0,
    stripePriceIdMonthly: tier?.stripePriceIdMonthly || '',
    stripePriceIdYearly: tier?.stripePriceIdYearly || '',
    highlighted: tier?.highlighted || false,
    ctaText: tier?.ctaText || 'Get Started',
    limits: tier?.limits || {
      maxMembers: 5,
      maxStorageGb: 10,
      maxTasksPerMonth: -1,
      maxVideosPerMonth: -1,
      maxVideoLengthMinutes: -1,
      maxExternalContributors: -1,
      maxWorkspaces: 1,
    },
    features: tier?.features || {},
  });

  const [activeTab, setActiveTab] = useState<'basic' | 'limits' | 'features' | 'stripe'>('basic');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  // Group features by category
  const featuresByCategory = Object.entries(featureDefinitions).reduce(
    (acc, [key, def]) => {
      if (!acc[def.category]) acc[def.category] = [];
      acc[def.category].push({ key, ...def });
      return acc;
    },
    {} as Record<
      string,
      Array<{ key: string; name: string; description: string; category: string }>
    >
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {isEditing ? `Edit ${tier.displayName}` : 'Create New Tier'}
          </h2>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-6">
          {(['basic', 'limits', 'features', 'stripe'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 px-4 font-medium border-b-2 transition capitalize ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          {/* Basic Tab */}
          {activeTab === 'basic' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name (lowercase, no spaces)
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value.toLowerCase() })}
                  disabled={isEditing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                  placeholder="e.g., starter"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                <input
                  type="text"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g., Starter"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  rows={2}
                  placeholder="Short description for pricing page"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Monthly Price ($)
                  </label>
                  <input
                    type="number"
                    value={formData.monthlyPrice}
                    onChange={(e) =>
                      setFormData({ ...formData, monthlyPrice: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Yearly Price ($)
                  </label>
                  <input
                    type="number"
                    value={formData.yearlyPrice}
                    onChange={(e) =>
                      setFormData({ ...formData, yearlyPrice: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CTA Text</label>
                  <input
                    type="text"
                    value={formData.ctaText}
                    onChange={(e) => setFormData({ ...formData, ctaText: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="Get Started"
                  />
                </div>
                <div className="flex items-center">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.highlighted}
                      onChange={(e) => setFormData({ ...formData, highlighted: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">Highlighted (Most Popular)</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Limits Tab */}
          {activeTab === 'limits' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 mb-4">Use -1 for unlimited</p>
              {Object.entries(limitDefinitions).map(([key, def]) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {def.name} ({def.unit})
                  </label>
                  <input
                    type="number"
                    value={formData.limits[key] ?? 0}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        limits: { ...formData.limits, [key]: parseInt(e.target.value) || 0 },
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Features Tab */}
          {activeTab === 'features' && (
            <div className="space-y-6">
              {Object.entries(featuresByCategory).map(([category, features]) => (
                <div key={category}>
                  <h4 className="font-medium text-gray-900 mb-2">{category}</h4>
                  <div className="space-y-2">
                    {features.map((feature) => (
                      <label key={feature.key} className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.features[feature.key] || false}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              features: { ...formData.features, [feature.key]: e.target.checked },
                            })
                          }
                          className="w-4 h-4 rounded border-gray-300"
                        />
                        <div>
                          <span className="text-sm text-gray-900">{feature.name}</span>
                          <p className="text-xs text-gray-500">{feature.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Stripe Tab */}
          {activeTab === 'stripe' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 mb-4">
                Stripe Price IDs are required for billing integration
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Stripe Monthly Price ID
                </label>
                <input
                  type="text"
                  value={formData.stripePriceIdMonthly}
                  onChange={(e) =>
                    setFormData({ ...formData, stripePriceIdMonthly: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                  placeholder="price_xxx..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Stripe Yearly Price ID
                </label>
                <input
                  type="text"
                  value={formData.stripePriceIdYearly}
                  onChange={(e) =>
                    setFormData({ ...formData, stripePriceIdYearly: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                  placeholder="price_xxx..."
                />
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : isEditing ? 'Update Tier' : 'Create Tier'}
          </button>
        </div>
      </div>
    </div>
  );
}
