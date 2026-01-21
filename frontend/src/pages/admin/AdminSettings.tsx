import { useState, useEffect } from 'react';
import api from '../../services/api';

interface TrialSettings {
  trialDurationDays: number;
}

export default function AdminSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [trialSettings, setTrialSettings] = useState<TrialSettings>({
    trialDurationDays: 7,
  });
  const [originalSettings, setOriginalSettings] = useState<TrialSettings>({
    trialDurationDays: 7,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await api.get('/admin/settings/trial');
      const settings = res.data.settings;
      setTrialSettings(settings);
      setOriginalSettings(settings);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTrialSettings = async () => {
    try {
      setSaving(true);
      setError(null);

      await api.put('/admin/settings/trial', trialSettings);
      setOriginalSettings(trialSettings);
      setSuccessMessage('Trial settings saved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = trialSettings.trialDurationDays !== originalSettings.trialDurationDays;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">Configure global system settings</p>
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

      {/* Trial Settings Section */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Trial Settings</h2>
          {hasChanges && (
            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
              Unsaved changes
            </span>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default Trial Duration (days)
            </label>
            <input
              type="number"
              value={trialSettings.trialDurationDays}
              onChange={(e) =>
                setTrialSettings({
                  ...trialSettings,
                  trialDurationDays: parseInt(e.target.value) || 0,
                })
              }
              min={1}
              max={90}
              className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-sm text-gray-500 mt-1">
              New organizations will get a {trialSettings.trialDurationDays}-day free trial period.
            </p>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> Changes to trial duration only apply to new trials.
              Existing trials will keep their original end dates.
            </p>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSaveTrialSettings}
              disabled={saving || !hasChanges}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Trial Settings'}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
