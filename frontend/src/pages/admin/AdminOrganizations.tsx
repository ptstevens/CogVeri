import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminService, OrganizationSummary } from '../../services/admin.service';

export default function AdminOrganizations() {
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Create organization modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', ownerEmail: '', tier: 'free' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Refresh trigger - increment to force re-fetch
  const [refreshKey, setRefreshKey] = useState(0);

  const limit = 25;

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  // Fetch organizations
  useEffect(() => {
    const fetchOrganizations = async () => {
      try {
        setLoading(true);
        const data = await AdminService.getOrganizations({
          limit,
          offset: page * limit,
          search: debouncedSearch || undefined,
          status: statusFilter || undefined,
        });

        setOrganizations(data.organizations);
        setTotal(data.total);
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch organizations');
      } finally {
        setLoading(false);
      }
    };

    fetchOrganizations();
  }, [page, debouncedSearch, statusFilter, refreshKey]);

  const handleRowClick = (organizationId: string) => {
    navigate(`/admin/organizations/${organizationId}`);
  };

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);

    try {
      await AdminService.createOrganization({
        name: createForm.name,
        ownerEmail: createForm.ownerEmail,
        tier: createForm.tier,
      });

      // Reset form and close modal
      setCreateForm({ name: '', ownerEmail: '', tier: 'free' });
      setShowCreateModal(false);

      // Refresh the list
      setPage(0);
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      setCreateError(err.response?.data?.error || err.message || 'Failed to create organization');
    } finally {
      setCreating(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const maxPages = Math.ceil(total / limit);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Organizations</h1>
        <p className="text-gray-600 mt-1">Manage all organizations on the platform</p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search organizations by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter || ''}
            onChange={(e) => setStatusFilter(e.target.value || null)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>

          {/* Create Organization button */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            + Create Organization
          </button>

          {/* Back button */}
          <button
            onClick={() => navigate('/admin')}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium"
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading organizations...</p>
          </div>
        </div>
      )}

      {/* Organizations Table */}
      {!loading && organizations.length > 0 && (
        <>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Organization
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Domain
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Owner
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Members
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {organizations.map((org) => (
                    <tr
                      key={org.id}
                      onClick={() => handleRowClick(org.id)}
                      className="hover:bg-gray-50 cursor-pointer transition"
                    >
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-gray-900">{org.name}</p>
                          <p className="text-sm text-gray-500">{org.id}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-900">{org.domain || '-'}</span>
                          {/* Use domainVerified if available, or domain_verified */}
                          {(org.domainVerified || org.domain_verified) && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              ✓ Verified
                            </span>
                          )}
                          {/* If domain exists but not verified */}
                          {org.domain && !(org.domainVerified || org.domain_verified) && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              Pending
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-gray-900">{org.ownerEmail}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-gray-900 font-medium">{org.memberCount}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {/* Check both cases just to be safe, but usually snake_case for list */}
                          {org.isSuspended || org.is_suspended ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              Suspended
                            </span>
                          ) : org.isActive || org.is_active ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              Inactive
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {formatDate(org.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="mt-6 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing {page * limit + 1}-{Math.min((page + 1) * limit, total)} of {total}{' '}
              organizations
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                ← Previous
              </button>
              <div className="flex items-center gap-2">
                {Array.from({ length: Math.min(5, maxPages) }, (_, i) => {
                  let pageNum = i;
                  if (maxPages > 5 && page > 2) {
                    pageNum = page - 2 + i;
                  }
                  if (pageNum >= maxPages) return null;

                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`px-3 py-2 rounded-lg font-medium ${
                        pageNum === page
                          ? 'bg-blue-600 text-white'
                          : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {pageNum + 1}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setPage(Math.min(maxPages - 1, page + 1))}
                disabled={page >= maxPages - 1}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}

      {/* Empty State */}
      {!loading && organizations.length === 0 && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <svg
            className="w-12 h-12 text-gray-400 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"
            />
          </svg>
          <p className="text-gray-600 text-lg">No organizations found</p>
          <p className="text-gray-500 text-sm mt-2">
            {search ? 'Try adjusting your search filters' : 'Organizations will appear here'}
          </p>
        </div>
      )}

      {/* Create Organization Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Create Organization</h2>

            {createError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-red-800 text-sm">{createError}</p>
              </div>
            )}

            <form onSubmit={handleCreateOrganization}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Organization Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Acme Corp"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Owner Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={createForm.ownerEmail}
                    onChange={(e) => setCreateForm({ ...createForm, ownerEmail: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="owner@example.com"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    If the user doesn't exist, they will be invited to create an account.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Subscription Tier
                  </label>
                  <select
                    value={createForm.tier}
                    onChange={(e) => setCreateForm({ ...createForm, tier: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="free">Free</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setCreateError(null);
                    setCreateForm({ name: '', ownerEmail: '', tier: 'free' });
                  }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium"
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Organization'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
