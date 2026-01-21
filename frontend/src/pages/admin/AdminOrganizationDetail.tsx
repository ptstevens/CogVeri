import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AdminService, OrganizationDetail } from '../../services/admin.service';
import FeatureOverridesTab from '../../components/admin/FeatureOverridesTab';
import FeatureGrantsTab from '../../components/admin/FeatureGrantsTab';
import TrialManagementTab from '../../components/admin/TrialManagementTab';

export default function AdminOrganizationDetail() {
  const { organizationId } = useParams<{ organizationId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<OrganizationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suspendLoading, setSuspendLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'features' | 'grants' | 'trial' | 'audit'>('overview');
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [tierLoading, setTierLoading] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string>('');

  // Delete organization state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');

  // Fetch organization detail
  useEffect(() => {
    const fetchDetail = async () => {
      try {
        setLoading(true);
        if (!organizationId) return;

        const detail = await AdminService.getOrganizationDetails(organizationId);
        setData(detail);
        setSelectedTier(detail.subscription.tier);
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch organization details');
      } finally {
        setLoading(false);
      }
    };

    if (organizationId) {
      fetchDetail();
    }
  }, [organizationId, navigate]);

  const handleTierChange = async (newTier: string) => {
    if (!organizationId || newTier === selectedTier) return;

    try {
      setTierLoading(true);
      await AdminService.updateOrganizationTier(organizationId, newTier);
      setSelectedTier(newTier);

      // Update local data
      if (data) {
        setData({
          ...data,
          subscription: {
            ...data.subscription,
            tier: newTier,
          },
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update tier');
    } finally {
      setTierLoading(false);
    }
  };

  const handleSuspend = async () => {
    try {
      setSuspendLoading(true);
      if (!organizationId) return;

      await AdminService.suspendOrganization(organizationId);

      if (data) {
        setData({
          ...data,
          organization: {
            ...data.organization,
            isSuspended: true,
          },
        });
      }
      setConfirmAction(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSuspendLoading(false);
    }
  };

  const handleUnsuspend = async () => {
    try {
      setSuspendLoading(true);
      if (!organizationId) return;

      await AdminService.unsuspendOrganization(organizationId);

      if (data) {
        setData({
          ...data,
          organization: {
            ...data.organization,
            isSuspended: false,
          },
        });
      }
      setConfirmAction(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSuspendLoading(false);
    }
  };

  const handleImpersonate = async () => {
    try {
      setSuspendLoading(true); // Re-use loading state or create new one
      if (!organizationId) return;

      // 1. Get impersonation token
      const { impersonationToken } = await AdminService.impersonateOrganization(organizationId);

      // 2. Exchange token for session
      const { token } = await AdminService.loginAsOrganization(impersonationToken);

      // 3. Store new token and redirect
      // We use window.location to force a full refresh and state reset
      const tokenKey = import.meta.env.VITE_AUTH_TOKEN_KEY || 'cogveri_auth_token';
      localStorage.setItem(tokenKey, token);

      // Redirect to dashboard as the impersonated user
      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(err.message || 'Failed to start impersonation');
      setSuspendLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      setDeleteLoading(true);
      if (!organizationId) return;

      await AdminService.deleteOrganization(organizationId);

      // Redirect to organizations list after successful deletion
      navigate('/admin/organizations', {
        state: { message: `Organization "${data?.organization.name}" has been permanently deleted.` }
      });
    } catch (err: any) {
      setError(err.message || 'Failed to delete organization');
      setDeleteLoading(false);
      setShowDeleteModal(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading organization details...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8">
        <button
          onClick={() => navigate('/admin/organizations')}
          className="mb-4 px-4 py-2 text-gray-600 hover:text-gray-900 font-medium"
        >
          ← Back to Organizations
        </button>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error || 'Failed to load organization'}</p>
        </div>
      </div>
    );
  }

  const { organization, owner, subscription, metrics, members, auditLogs } = data;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate('/admin/organizations')}
            className="mb-2 text-sm text-gray-500 hover:text-gray-700 font-medium flex items-center gap-1"
          >
            ← Organizations
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{organization.name}</h1>
          <p className="text-gray-500 text-sm mt-1 font-mono">{organization.id}</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleImpersonate}
            disabled={suspendLoading}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
            {suspendLoading ? 'Loading...' : 'Impersonate'}
          </button>

          {organization.isSuspended ? (
            <button
              onClick={() => setConfirmAction('unsuspend')}
              disabled={suspendLoading}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50"
            >
              {suspendLoading ? 'Processing...' : 'Unsuspend'}
            </button>
          ) : (
            <button
              onClick={() => setConfirmAction('suspend')}
              disabled={suspendLoading}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium disabled:opacity-50"
            >
              {suspendLoading ? 'Processing...' : 'Suspend'}
            </button>
          )}

          {/* Delete button - System Admin only */}
          <button
            onClick={() => setShowDeleteModal(true)}
            disabled={deleteLoading}
            className="px-4 py-2 bg-red-800 hover:bg-red-900 text-white rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            Delete
          </button>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {confirmAction === 'suspend' ? 'Suspend Organization?' : 'Unsuspend Organization?'}
            </h3>
            <p className="text-gray-600 mb-6">
              {confirmAction === 'suspend'
                ? 'This organization will be suspended and members will lose access.'
                : 'This organization will be restored and members will regain access.'}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => (confirmAction === 'suspend' ? handleSuspend() : handleUnsuspend())}
                className={`px-4 py-2 text-white rounded-lg font-medium ${
                  confirmAction === 'suspend'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {confirmAction === 'suspend' ? 'Suspend' : 'Unsuspend'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-red-100 rounded-full p-2">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">
                Delete Organization Permanently
              </h3>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-800 text-sm font-medium mb-2">
                This action cannot be undone. This will permanently delete:
              </p>
              <ul className="text-red-700 text-sm list-disc list-inside space-y-1">
                <li>All recordings and video files</li>
                <li>All tasks, reviews, and templates</li>
                <li>All user memberships and data</li>
                <li>The dedicated storage bucket</li>
                <li>All billing and subscription data</li>
              </ul>
            </div>

            <p className="text-gray-600 text-sm mb-4">
              To confirm, type the organization name: <strong>{organization.name}</strong>
            </p>

            <input
              type="text"
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              placeholder="Type organization name to confirm"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
              disabled={deleteLoading}
            />

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmName('');
                }}
                disabled={deleteLoading}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading || deleteConfirmName !== organization.name}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteLoading ? 'Deleting...' : 'Delete Organization'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-gray-500 text-sm">Status</p>
          <div className="mt-2">
            {organization.isSuspended ? (
              <span className="inline-block px-3 py-1 bg-red-100 text-red-800 text-sm rounded-full font-medium">
                Suspended
              </span>
            ) : organization.isActive ? (
              <span className="inline-block px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full font-medium">
                Active
              </span>
            ) : (
              <span className="inline-block px-3 py-1 bg-gray-100 text-gray-800 text-sm rounded-full font-medium">
                Inactive
              </span>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-gray-500 text-sm mb-2">Subscription Tier</p>
          <select
            value={selectedTier}
            onChange={(e) => handleTierChange(e.target.value)}
            disabled={tierLoading}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-gray-900 disabled:opacity-50"
          >
            <option value="free">Free</option>
            <option value="enterprise">Enterprise</option>
          </select>
          {tierLoading && <p className="text-xs text-gray-500 mt-1">Updating...</p>}
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-gray-500 text-sm">Members</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">{metrics.memberCount}</p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-gray-500 text-sm">Days Active</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">{metrics.daysActive}</p>
        </div>
      </div>

      {/* Organization Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Organization Details</h3>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-500">Name</p>
              <p className="text-gray-900 font-medium">{organization.name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Description</p>
              <p className="text-gray-900">{organization.description || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Domain</p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-gray-900 font-medium">{organization.domain || 'Not set'}</p>
                {organization.domain && organization.domainVerified && (
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                    Verified
                  </span>
                )}
                {organization.domain && !organization.domainVerified && (
                  <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                    Pending
                  </span>
                )}
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500">Created</p>
              <p className="text-gray-900">{formatDate(organization.createdAt)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Last Activity</p>
              <p className="text-gray-900">{formatDate(metrics.lastActivityAt)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Owner Information</h3>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-500">Name</p>
              <p className="text-gray-900 font-medium">{owner.name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Email</p>
              <p className="text-gray-900">{owner.email}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Subscription Status</p>
              <p className="text-gray-900 font-medium">
                {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Subscription Since</p>
              <p className="text-gray-900">{formatDate(subscription.createdAt)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 py-4 px-6 text-center font-medium border-b-2 transition ${
              activeTab === 'overview'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`flex-1 py-4 px-6 text-center font-medium border-b-2 transition ${
              activeTab === 'members'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Members
          </button>
          <button
            onClick={() => setActiveTab('features')}
            className={`flex-1 py-4 px-6 text-center font-medium border-b-2 transition ${
              activeTab === 'features'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Features
          </button>
          <button
            onClick={() => setActiveTab('grants')}
            className={`flex-1 py-4 px-6 text-center font-medium border-b-2 transition ${
              activeTab === 'grants'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Grants
          </button>
          <button
            onClick={() => setActiveTab('trial')}
            className={`flex-1 py-4 px-6 text-center font-medium border-b-2 transition ${
              activeTab === 'trial'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Trial
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`flex-1 py-4 px-6 text-center font-medium border-b-2 transition ${
              activeTab === 'audit'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Audit Logs
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div>
              <h4 className="text-lg font-semibold text-gray-900 mb-4">Quick Stats</h4>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-3xl font-bold text-gray-900">{metrics.memberCount}</p>
                  <p className="text-sm text-gray-600">Active Members</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-gray-900">{metrics.daysActive}</p>
                  <p className="text-sm text-gray-600">Days Active</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-gray-900">{subscription.tier}</p>
                  <p className="text-sm text-gray-600">Current Tier</p>
                </div>
              </div>
            </div>
          )}

          {/* Members Tab */}
          {activeTab === 'members' && (
            <div>
              <h4 className="text-lg font-semibold text-gray-900 mb-4">
                Members ({members.total})
              </h4>
              {members.list.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 font-medium text-gray-700">Email</th>
                        <th className="text-left py-2 font-medium text-gray-700">Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.list.map((member) => (
                        <tr key={member.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 text-gray-900">{member.email}</td>
                          <td className="py-3">
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                              {member.role}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-600">No members found</p>
              )}
              {members.total > members.list.length && (
                <p className="text-sm text-gray-600 mt-4">
                  Showing {members.list.length} of {members.total} members
                </p>
              )}
            </div>
          )}

          {/* Features Tab */}
          {activeTab === 'features' && organizationId && (
            <FeatureOverridesTab organizationId={organizationId} />
          )}

          {/* Feature Grants Tab */}
          {activeTab === 'grants' && organizationId && (
            <FeatureGrantsTab organizationId={organizationId} />
          )}

          {/* Trial Management Tab */}
          {activeTab === 'trial' && organizationId && (
            <TrialManagementTab organizationId={organizationId} />
          )}

          {/* Audit Logs Tab */}
          {activeTab === 'audit' && (
            <div>
              <h4 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h4>
              {auditLogs.length > 0 ? (
                <div className="space-y-3">
                  {auditLogs.map((log, idx) => (
                    <div key={idx} className="flex items-start gap-4 p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{log.action}</p>
                        <div className="flex gap-4 mt-1 text-xs text-gray-600">
                          <span>Type: {log.resourceType}</span>
                          <span>Actor: {log.actor}</span>
                        </div>
                      </div>
                      <div className="text-right text-xs text-gray-500">
                        {formatDate(log.createdAt)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-600">No audit logs found</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
