import { useState, useEffect } from 'react';
import api from '../../services/api';

interface TrialDetails {
  organizationId: string;
  status: 'trialing' | 'expired' | 'converted' | 'canceled' | 'none';
  startedAt: string | null;
  endsAt: string | null;
  daysRemaining: number | null;
  tier: string;
}

interface TrialManagementTabProps {
  organizationId: string;
}

export default function TrialManagementTab({ organizationId }: TrialManagementTabProps) {
  const [trial, setTrial] = useState<TrialDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [showShortenModal, setShowShortenModal] = useState(false);
  const [extendDays, setExtendDays] = useState(7);
  const [shortenDate, setShortenDate] = useState('');

  useEffect(() => {
    loadTrial();
  }, [organizationId]);

  const loadTrial = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await api.get(`/admin/organizations/${organizationId}/trial`);
      setTrial(res.data.trial);
    } catch (err: any) {
      // 404 means no trial - that's OK
      if (err.response?.status === 404) {
        setTrial({
          organizationId,
          status: 'none',
          startedAt: null,
          endsAt: null,
          daysRemaining: null,
          tier: 'N/A',
        });
      } else {
        setError(err.response?.data?.error || err.message || 'Failed to load trial info');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExtendTrial = async () => {
    if (extendDays < 1 || extendDays > 90) {
      setError('Extension must be between 1 and 90 days');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      await api.post(`/admin/organizations/${organizationId}/trial/extend`, {
        additionalDays: extendDays,
      });

      setSuccessMessage(`Trial extended by ${extendDays} days`);
      setShowExtendModal(false);
      setExtendDays(7);
      await loadTrial();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to extend trial');
    } finally {
      setSaving(false);
    }
  };

  const handleShortenTrial = async () => {
    if (!shortenDate) {
      setError('Please select a new end date');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      await api.post(`/admin/organizations/${organizationId}/trial/shorten`, {
        newEndDate: new Date(shortenDate).toISOString(),
      });

      setSuccessMessage('Trial end date updated');
      setShowShortenModal(false);
      setShortenDate('');
      await loadTrial();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to update trial end date');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'trialing':
        return 'bg-blue-100 text-blue-800';
      case 'expired':
        return 'bg-red-100 text-red-800';
      case 'converted':
        return 'bg-green-100 text-green-800';
      case 'canceled':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
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
      <h4 className="text-lg font-semibold text-gray-900 mb-6">Trial Management</h4>

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

      {!trial || trial.status === 'none' ? (
        <div className="bg-gray-50 rounded-lg p-6 text-center">
          <p className="text-gray-600">This organization has no trial history.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Trial Status Card */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-sm text-gray-500">Status</p>
                <span
                  className={`inline-block mt-1 px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(
                    trial.status
                  )}`}
                >
                  {trial.status.charAt(0).toUpperCase() + trial.status.slice(1)}
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-500">Trial Tier</p>
                <p className="mt-1 font-medium text-gray-900">{trial.tier}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Started</p>
                <p className="mt-1 text-gray-900">
                  {trial.startedAt ? formatDate(trial.startedAt) : '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Ends</p>
                <p className="mt-1 text-gray-900">
                  {trial.endsAt ? formatDate(trial.endsAt) : '-'}
                </p>
              </div>
            </div>

            {trial.status === 'trialing' && trial.daysRemaining !== null && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Days Remaining</p>
                    <p
                      className={`text-3xl font-bold ${
                        trial.daysRemaining <= 3
                          ? 'text-red-600'
                          : trial.daysRemaining <= 7
                            ? 'text-yellow-600'
                            : 'text-green-600'
                      }`}
                    >
                      {trial.daysRemaining}
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowExtendModal(true)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
                    >
                      Extend Trial
                    </button>
                    <button
                      onClick={() => {
                        setShortenDate(trial.endsAt?.split('T')[0] || '');
                        setShowShortenModal(true);
                      }}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm"
                    >
                      Shorten Trial
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Trial Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h5 className="text-sm font-medium text-gray-700 mb-2">Trial Information</h5>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>- Extending a trial adds more days from the current end date</li>
              <li>
                - Shortening a trial sets a new end date that must be before the current end date
              </li>
              <li>- Trial status changes are logged in the organization's audit log</li>
            </ul>
          </div>
        </div>
      )}

      {/* Extend Trial Modal */}
      {showExtendModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Extend Trial</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Additional Days
                </label>
                <input
                  type="number"
                  value={extendDays}
                  onChange={(e) => setExtendDays(parseInt(e.target.value) || 0)}
                  min={1}
                  max={90}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Maximum 90 days per extension</p>
              </div>

              {trial?.endsAt && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
                    New end date will be:{' '}
                    <strong>
                      {new Date(
                        new Date(trial.endsAt).getTime() + extendDays * 24 * 60 * 60 * 1000
                      ).toLocaleDateString()}
                    </strong>
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowExtendModal(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleExtendTrial}
                disabled={saving || extendDays < 1}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Extending...' : 'Extend Trial'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shorten Trial Modal */}
      {showShortenModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Shorten Trial</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New End Date</label>
                <input
                  type="date"
                  value={shortenDate}
                  onChange={(e) => setShortenDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  max={trial?.endsAt?.split('T')[0]}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Must be between today and the current end date
                </p>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-800">
                  Warning: This will end the trial sooner than originally planned. The organization
                  may be downgraded to the free tier.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowShortenModal(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleShortenTrial}
                disabled={saving || !shortenDate}
                className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
              >
                {saving ? 'Updating...' : 'Update End Date'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
