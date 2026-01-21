import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { AdminService, AdminMetrics } from '../../services/admin.service';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setLoading(true);
        const metricsData = await AdminService.getSystemMetrics();
        setMetrics(metricsData);
        setError(null);
      } catch (err: any) {
        // Axios error handling is already in api.ts interceptor, but we catch here for local state
        setError(err.message || 'Failed to load metrics');
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
    // Token is handled by interceptor, so we don't strictly need it in dep array if we trust interceptor,
    // but usually in React we reload if auth state changes.
    // For now, keeping it simple.
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error || 'Failed to load admin dashboard'}</p>
        </div>
      </div>
    );
  }

  // Prepare tier distribution data for pie chart
  const tierChartData = metrics.distribution.byTier.map((tier) => ({
    name: tier.tier.charAt(0).toUpperCase() + tier.tier.slice(1),
    value: tier.count,
  }));

  const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Platform-wide metrics and organization management</p>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Total Organizations */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium">Total Organizations</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{metrics.organizations.total}</p>
            </div>
            <div className="bg-blue-100 rounded-lg p-3">
              <svg
                className="w-6 h-6 text-blue-600"
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
            </div>
          </div>
          <div className="mt-4 text-sm">
            <span className="text-green-600 font-medium">{metrics.organizations.active}</span>
            <span className="text-gray-500"> active</span>
          </div>
        </div>

        {/* Active Organizations */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium">Active Organizations</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {metrics.organizations.active}
              </p>
            </div>
            <div className="bg-green-100 rounded-lg p-3">
              <svg
                className="w-6 h-6 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          </div>
          <div className="mt-4 text-sm">
            <span className="text-gray-500">
              {((metrics.organizations.active / metrics.organizations.total) * 100).toFixed(1)}%
            </span>
            <span className="text-gray-500"> of total</span>
          </div>
        </div>

        {/* Suspended Organizations */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium">Suspended Organizations</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {metrics.organizations.suspended}
              </p>
            </div>
            <div className="bg-red-100 rounded-lg p-3">
              <svg
                className="w-6 h-6 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          </div>
          <div className="mt-4 text-sm text-gray-500">Requires attention</div>
        </div>

        {/* Domain Verified */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium">Domain Verified</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {metrics.organizations.withVerifiedDomain}
              </p>
            </div>
            <div className="bg-purple-100 rounded-lg p-3">
              <svg
                className="w-6 h-6 text-purple-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m7 0a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          </div>
          <div className="mt-4 text-sm">
            <span className="text-gray-500">
              {(
                (metrics.organizations.withVerifiedDomain / metrics.organizations.total) *
                100
              ).toFixed(1)}
              %
            </span>
            <span className="text-gray-500"> verified</span>
          </div>
        </div>
      </div>

      {/* User Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Total Users */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">User Overview</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Total Users</span>
              <span className="text-2xl font-bold text-gray-900">{metrics.users.total}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">System Admins</span>
              <span className="text-lg font-semibold text-blue-600">
                {metrics.users.systemAdmins}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Avg Members/Org</span>
              <span className="text-lg font-semibold text-gray-900">
                {metrics.distribution.averageMembersPerOrg}
              </span>
            </div>
          </div>
        </div>

        {/* Growth */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Growth</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">New Orgs (Last Week)</span>
              <span className="text-2xl font-bold text-green-600">
                {metrics.growth.newOrgsLastWeek}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">New Orgs (Last Month)</span>
              <span className="text-2xl font-bold text-blue-600">
                {metrics.growth.newOrgsLastMonth}
              </span>
            </div>
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-gray-500">
                Weekly Average: {(metrics.growth.newOrgsLastMonth / 4).toFixed(1)} orgs/week
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Subscription Tier Distribution */}
        {tierChartData.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Organizations by Tier</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={tierChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {tierChartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Organization Status Distribution */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Organization Status</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={[
                { name: 'Active', value: metrics.organizations.active, fill: '#10b981' },
                { name: 'Suspended', value: metrics.organizations.suspended, fill: '#ef4444' },
              ]}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-4">
          <button
            onClick={() => navigate('/admin/organizations')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition"
          >
            View All Organizations
          </button>
          <button
            className="bg-gray-200 hover:bg-gray-300 text-gray-900 font-medium py-2 px-4 rounded-lg transition"
            disabled
          >
            View Suspended Organizations
          </button>
          <button
            className="bg-gray-200 hover:bg-gray-300 text-gray-900 font-medium py-2 px-4 rounded-lg transition"
            disabled
          >
            Export Report
          </button>
        </div>
      </div>
    </div>
  );
}
