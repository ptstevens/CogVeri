import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { AdminService } from '../../services/admin.service';
import { isPrimaryAdmin, PRIMARY_ADMIN_EMAIL } from '../../config/sysadmin';
import { ShieldCheck, UserPlus, UserMinus, AlertTriangle, Crown, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface SystemAdmin {
  id: string;
  email: string;
  name: string;
  system_role: string;
  system_admin_since: string;
  created_at: string;
  isPrimary: boolean;
}

export default function AdminSystemAdmins() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<SystemAdmin[]>([]);
  const [canManageAdmins, setCanManageAdmins] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Grant admin dialog state
  const [showGrantDialog, setShowGrantDialog] = useState(false);
  const [grantEmail, setGrantEmail] = useState('');

  // Current user is primary admin
  const isCurrentUserPrimary = isPrimaryAdmin(user);

  useEffect(() => {
    fetchAdmins();
  }, []);

  const fetchAdmins = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await AdminService.getSystemAdmins();
      setAdmins(response.admins);
      setCanManageAdmins(response.canManageAdmins);
    } catch (err: any) {
      setError(err.message || 'Failed to load system administrators');
    } finally {
      setLoading(false);
    }
  };

  const handleGrantAdmin = async () => {
    if (!grantEmail.trim()) {
      toast.error('Please enter an email address');
      return;
    }

    if (!grantEmail.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }

    try {
      setActionLoading('grant');
      const response = await AdminService.grantSystemAdmin(grantEmail.trim().toLowerCase());
      toast.success(response.message);
      setShowGrantDialog(false);
      setGrantEmail('');
      await fetchAdmins();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to grant system admin');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevokeAdmin = async (admin: SystemAdmin) => {
    if (admin.isPrimary) {
      toast.error('Cannot revoke system admin from the primary administrator');
      return;
    }

    if (admin.id === user?.id) {
      toast.error('Cannot revoke system admin from yourself');
      return;
    }

    if (
      !confirm(
        `Are you sure you want to revoke SYSADMIN privileges from ${admin.name} (${admin.email})?`
      )
    ) {
      return;
    }

    try {
      setActionLoading(admin.id);
      const response = await AdminService.revokeSystemAdmin(admin.id);
      toast.success(response.message);
      await fetchAdmins();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to revoke system admin');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-primary-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading system administrators...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
          <button
            onClick={fetchAdmins}
            className="mt-2 text-red-600 hover:text-red-800 underline text-sm"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-amber-100 p-2 rounded-lg">
            <ShieldCheck className="h-6 w-6 text-amber-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">System Administrators</h1>
        </div>
        <p className="text-gray-600">
          Manage users with SYSADMIN privileges. These users have full access to all administrative
          features.
        </p>
      </div>

      {/* Primary Admin Notice */}
      {!isCurrentUserPrimary && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-800 font-medium">View Only Access</p>
              <p className="text-amber-700 text-sm mt-1">
                Only the primary administrator ({PRIMARY_ADMIN_EMAIL}) can grant or revoke SYSADMIN
                privileges. You can view the list of system administrators but cannot make changes.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Grant Admin Button (Primary Admin Only) */}
      {canManageAdmins && (
        <div className="mb-6">
          <button
            onClick={() => setShowGrantDialog(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            Grant SYSADMIN Access
          </button>
        </div>
      )}

      {/* Admin List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Administrator
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Since
              </th>
              {canManageAdmins && (
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {admins.map((admin) => (
              <tr key={admin.id} className={admin.isPrimary ? 'bg-amber-50' : undefined}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10">
                      <div
                        className={`h-10 w-10 rounded-full flex items-center justify-center ${
                          admin.isPrimary ? 'bg-amber-100' : 'bg-primary-100'
                        }`}
                      >
                        {admin.isPrimary ? (
                          <Crown className="h-5 w-5 text-amber-600" />
                        ) : (
                          <ShieldCheck className="h-5 w-5 text-primary-600" />
                        )}
                      </div>
                    </div>
                    <div className="ml-4">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-gray-900">{admin.name}</div>
                        {admin.isPrimary && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                            Primary
                          </span>
                        )}
                        {admin.id === user?.id && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            You
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">{admin.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                    {admin.system_role}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {admin.system_admin_since
                    ? new Date(admin.system_admin_since).toLocaleDateString()
                    : 'Unknown'}
                </td>
                {canManageAdmins && (
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {!admin.isPrimary && admin.id !== user?.id && (
                      <button
                        onClick={() => handleRevokeAdmin(admin)}
                        disabled={actionLoading === admin.id}
                        className="inline-flex items-center gap-1 text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {actionLoading === admin.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <UserMinus className="h-4 w-4" />
                        )}
                        Revoke
                      </button>
                    )}
                    {admin.isPrimary && <span className="text-gray-400 text-xs">Protected</span>}
                    {admin.id === user?.id && !admin.isPrimary && (
                      <span className="text-gray-400 text-xs">Cannot revoke self</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Security Notice */}
      <div className="mt-8 bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-2">Security Notes</h3>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>- SYSADMIN users have full access to all organizations and system features</li>
          <li>
            - Only the primary administrator ({PRIMARY_ADMIN_EMAIL}) can grant or revoke SYSADMIN
            privileges
          </li>
          <li>- The primary administrator cannot be removed or demoted</li>
          <li>- All SYSADMIN actions are logged for audit purposes</li>
        </ul>
      </div>

      {/* Grant Admin Dialog */}
      {showGrantDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Grant SYSADMIN Access</h2>
            <p className="text-sm text-gray-600 mb-4">
              Enter the email address of the user you want to grant SYSADMIN privileges to. The user
              must already have an account in the system.
            </p>
            <div className="mb-4">
              <label htmlFor="grantEmail" className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                id="grantEmail"
                value={grantEmail}
                onChange={(e) => setGrantEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                autoFocus
              />
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  This will grant the user full system administrator access including the ability to
                  view and manage all organizations, users, and system settings.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowGrantDialog(false);
                  setGrantEmail('');
                }}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleGrantAdmin}
                disabled={actionLoading === 'grant' || !grantEmail.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {actionLoading === 'grant' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                Grant Access
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
