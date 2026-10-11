import { useState, useEffect } from 'react';
import api from '../../services/api';

interface FeatureGrant {
  id: string;
  organizationId: string;
  featureName: string;
  grantedAt: string;
  expiresAt: string;
  grantedBy: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  reason: string | null;
}

interface FeatureGrantsTabProps {
  organizationId: string;
}

export default function FeatureGrantsTab({ organizationId }: FeatureGrantsTabProps) {
  const [activeGrants, setActiveGrants] = useState<FeatureGrant[]>([]);
  const [history, setHistory] = useState<FeatureGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Form state for new grant
  const [newGrant, setNewGrant] = useState({
    featureName: '',
    expiresAt: '',
    reason: '',
  });

  useEffect(() => {
    loadGrants();
  }, [organizationId]);

  const loadGrants = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await api.get(
        `/admin/organizations/${organizationId}/feature-grants?includeExpired=true`
      );
      setActiveGrants(res.data.activeGrants || []);
      setHistory(res.data.history || []);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to load feature grants');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGrant = async () => {
    if (!newGrant.featureName || !newGrant.expiresAt) {
      setError('Feature name and expiration date are required');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      await api.post(`/admin/organizations/${organizationId}/feature-grants`, {
        featureName: newGrant.featureName,
        expiresAt: newGrant.expiresAt,
        reason: newGrant.reason || undefined,
      });

      setSuccessMessage('Feature grant created successfully');
      setShowCreateModal(false);
      setNewGrant({ featureName: '', expiresAt: '', reason: '' });
      await loadGrants();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to create feature grant');
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeGrant = async (grantId: string) => {
    if (!confirm('Are you sure you want to revoke this feature grant?')) return;

    try {
      setSaving(true);
      setError(null);

      await api.delete(`/admin/organizations/${organizationId}/feature-grants/${grantId}`);

      setSuccessMessage('Feature grant revoked successfully');
      await loadGrants();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to revoke feature grant');
    } finally {
      setSaving(false);
    }
  };

  const handleExtendGrant = async (grantId: string, currentExpiry: string) => {
    const newDate = prompt('Enter new expiration date (YYYY-MM-DD):', currentExpiry.split('T')[0]);
    if (!newDate) return;

    try {
      setSaving(true);
      setError(null);

      await api.patch(`/admin/organizations/${organizationId}/feature-grants/${grantId}/extend`, {
        newExpiresAt: new Date(newDate).toISOString(),
      });

      setSuccessMessage('Feature grant extended successfully');
      await loadGrants();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to extend feature grant');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getDaysRemaining = (expiresAt: string) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diff = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  // Get default expiration date (30 days from now)
  const getDefaultExpiryDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().split('T')[0];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h4 className="text-lg font-semibold text-gray-900">Feature Grants</h4>
        <button
          onClick={() => {
            setNewGrant({ featureName: '', expiresAt: getDefaultExpiryDate(), reason: '' });
            setShowCreateModal(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
        >
          + Grant Feature
        </button>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}
      {successMessage && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-green-800 text-sm">{successMessage}</p>
        </div>
      )}

      {/* Active Grants */}
      <div className="mb-6">
        <h5 className="text-sm font-medium text-gray-700 mb-3">
          Active Grants ({activeGrants.length})
        </h5>
        {activeGrants.length === 0 ? (
          <p className="text-gray-500 text-sm">No active feature grants</p>
        ) : (
          <div className="space-y-3">
            {activeGrants.map((grant) => {
              const daysRemaining = getDaysRemaining(grant.expiresAt);
              return (
                <div
                  key={grant.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-900">{grant.featureName}</p>
                    <div className="flex gap-4 mt-1 text-sm text-gray-600">
                      <span>Expires: {formatDate(grant.expiresAt)}</span>
                      <span
                        className={`${
                          daysRemaining <= 7
                            ? 'text-red-600 font-medium'
                            : daysRemaining <= 14
                              ? 'text-yellow-600'
                              : 'text-green-600'
                        }`}
                      >
                        ({daysRemaining} days remaining)
                      </span>
                    </div>
                    {grant.reason && (
                      <p className="text-xs text-gray-500 mt-1">Reason: {grant.reason}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleExtendGrant(grant.id, grant.expiresAt)}
                      disabled={saving}
                      className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
                    >
                      Extend
                    </button>
                    <button
                      onClick={() => handleRevokeGrant(grant.id)}
                      disabled={saving}
                      className="px-3 py-1 text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Grant History */}
      <div>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="text-sm text-gray-600 hover:text-gray-900 mb-3"
        >
          {showHistory ? '- Hide History' : '+ Show Grant History'}
        </button>

        {showHistory && history.length > 0 && (
          <div className="space-y-2">
            {history.map((grant) => (
              <div
                key={grant.id}
                className="flex items-center justify-between p-3 bg-gray-100 rounded-lg text-sm"
              >
                <div>
                  <span className="font-medium text-gray-700">{grant.featureName}</span>
                  <span className="text-gray-500 ml-2">
                    {formatDate(grant.grantedAt)} -{' '}
                    {grant.revokedAt ? formatDate(grant.revokedAt) : formatDate(grant.expiresAt)}
                  </span>
                </div>
                <span
                  className={`px-2 py-1 text-xs rounded ${
                    grant.revokedAt
                      ? 'bg-red-100 text-red-800'
                      : new Date(grant.expiresAt) < new Date()
                        ? 'bg-gray-200 text-gray-700'
                        : 'bg-green-100 text-green-800'
                  }`}
                >
                  {grant.revokedAt
                    ? 'Revoked'
                    : new Date(grant.expiresAt) < new Date()
                      ? 'Expired'
                      : 'Active'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Grant Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Grant Feature Access</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Feature Name</label>
                <input
                  type="text"
                  value={newGrant.featureName}
                  onChange={(e) => setNewGrant({ ...newGrant, featureName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., ssoEnabled, advancedAnalytics"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enter the feature key exactly as defined in the tier features
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Expiration Date
                </label>
                <input
                  type="date"
                  value={newGrant.expiresAt}
                  onChange={(e) => setNewGrant({ ...newGrant, expiresAt: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason (optional)
                </label>
                <textarea
                  value={newGrant.reason}
                  onChange={(e) => setNewGrant({ ...newGrant, reason: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Why is this grant being made?"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGrant}
                disabled={saving || !newGrant.featureName || !newGrant.expiresAt}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Creating...' : 'Grant Feature'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
