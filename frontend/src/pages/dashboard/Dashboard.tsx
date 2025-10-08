import { useAuth } from '../../contexts/AuthContext';
import {
  ClipboardDocumentListIcon,
  DocumentMagnifyingGlassIcon,
  CheckCircleIcon,
  ArchiveBoxIcon,
  ClockIcon,
  SparklesIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

const Dashboard = () => {
  const { user } = useAuth();

  // Fetch dashboard stats from API
  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const response = await api.get('/dashboard/stats');
      return response.data.data;
    },
  });

  const stats = [
    {
      name: 'Total Tasks',
      value: dashboardData?.tasks?.total || 0,
      icon: ClipboardDocumentListIcon,
      gradient: 'from-blue-500 to-cyan-500',
      bgGradient: 'from-blue-500/10 to-cyan-500/10',
      iconColor: 'text-blue-500',
    },
    {
      name: 'Submitted',
      value: dashboardData?.tasks?.submitted || 0,
      icon: DocumentMagnifyingGlassIcon,
      gradient: 'from-purple-500 to-pink-500',
      bgGradient: 'from-purple-500/10 to-pink-500/10',
      iconColor: 'text-purple-500',
    },
    {
      name: 'Completed',
      value: dashboardData?.tasks?.completed || 0,
      icon: CheckCircleIcon,
      gradient: 'from-green-500 to-emerald-500',
      bgGradient: 'from-green-500/10 to-emerald-500/10',
      iconColor: 'text-green-500',
    },
    {
      name: 'Archived',
      value: dashboardData?.tasks?.archived || 0,
      icon: ArchiveBoxIcon,
      gradient: 'from-slate-500 to-gray-500',
      bgGradient: 'from-slate-500/10 to-gray-500/10',
      iconColor: 'text-slate-500',
    },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <LoadingSpinner />
      </div>
    );
  }

  const recentActivity = dashboardData?.recent_activity || [];

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { color: string; bgColor: string; label: string }> = {
      completed: { color: 'text-green-700', bgColor: 'bg-green-100', label: 'Completed' },
      submitted: { color: 'text-purple-700', bgColor: 'bg-purple-100', label: 'Submitted' },
      in_progress: { color: 'text-blue-700', bgColor: 'bg-blue-100', label: 'In Progress' },
      assigned: { color: 'text-yellow-700', bgColor: 'bg-yellow-100', label: 'Assigned' },
      rejected: { color: 'text-red-700', bgColor: 'bg-red-100', label: 'Rejected' },
    };
    return configs[status] || { color: 'text-gray-700', bgColor: 'bg-gray-100', label: status };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-teal-50/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <SparklesIcon className="h-8 w-8 text-teal-500" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
              Welcome back, {user?.name}
            </h1>
          </div>
          <p className="text-slate-600 text-lg ml-11">
            Here's what's happening with your projects today
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          {stats.map((stat) => (
            <div
              key={stat.name}
              className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${stat.bgGradient} backdrop-blur-sm border border-white/50 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1`}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-xl bg-white shadow-sm`}>
                    <stat.icon className={`h-6 w-6 ${stat.iconColor}`} />
                  </div>
                  <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${stat.gradient} opacity-5 rounded-full -mr-16 -mt-16`}></div>
                </div>
                <p className="text-sm font-medium text-slate-600 mb-1">{stat.name}</p>
                <p className={`text-3xl font-bold bg-gradient-to-r ${stat.gradient} bg-clip-text text-transparent`}>
                  {stat.value}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Activity and Breakdown Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-8">
          {/* Recent Activity */}
          <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-transparent">
              <div className="flex items-center gap-2">
                <ClockIcon className="h-5 w-5 text-teal-500" />
                <h2 className="text-lg font-semibold text-slate-900">Recent Activity</h2>
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {recentActivity.length > 0 ? (
                  recentActivity.slice(0, 5).map((activity: any) => {
                    const statusConfig = getStatusConfig(activity.status);
                    return (
                      <div
                        key={activity.id}
                        className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors"
                      >
                        <div className={`w-2 h-2 rounded-full mt-2 ${statusConfig.bgColor} ${statusConfig.color} ring-4 ring-white`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {activity.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${statusConfig.bgColor} ${statusConfig.color} font-medium`}>
                              {statusConfig.label}
                            </span>
                            <span className="text-xs text-slate-500">
                              {getRelativeTime(activity.updated_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center">
                      <ClockIcon className="h-8 w-8 text-slate-400" />
                    </div>
                    <p className="text-sm text-slate-500">No recent activity</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Task Status Breakdown */}
          <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-teal-50 to-transparent">
              <div className="flex items-center gap-2">
                <ClipboardDocumentListIcon className="h-5 w-5 text-teal-500" />
                <h2 className="text-lg font-semibold text-slate-900">Task Overview</h2>
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-3">
                {dashboardData?.tasks?.in_progress > 0 && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-blue-50 to-transparent hover:from-blue-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center">
                        <ClockIcon className="h-5 w-5 text-white" />
                      </div>
                      <span className="text-sm font-medium text-slate-700">In Progress</span>
                    </div>
                    <span className="text-xl font-bold text-blue-600">
                      {dashboardData.tasks.in_progress}
                    </span>
                  </div>
                )}
                {dashboardData?.tasks?.submitted > 0 && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-purple-50 to-transparent hover:from-purple-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-purple-500 flex items-center justify-center">
                        <DocumentMagnifyingGlassIcon className="h-5 w-5 text-white" />
                      </div>
                      <span className="text-sm font-medium text-slate-700">Under Review</span>
                    </div>
                    <span className="text-xl font-bold text-purple-600">
                      {dashboardData.tasks.submitted}
                    </span>
                  </div>
                )}
                {dashboardData?.tasks?.completed > 0 && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-green-50 to-transparent hover:from-green-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-green-500 flex items-center justify-center">
                        <CheckCircleIcon className="h-5 w-5 text-white" />
                      </div>
                      <span className="text-sm font-medium text-slate-700">Completed</span>
                    </div>
                    <span className="text-xl font-bold text-green-600">
                      {dashboardData.tasks.completed}
                    </span>
                  </div>
                )}
                {dashboardData?.tasks?.assigned > 0 && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-yellow-50 to-transparent hover:from-yellow-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-yellow-500 flex items-center justify-center">
                        <ClipboardDocumentListIcon className="h-5 w-5 text-white" />
                      </div>
                      <span className="text-sm font-medium text-slate-700">Assigned</span>
                    </div>
                    <span className="text-xl font-bold text-yellow-600">
                      {dashboardData.tasks.assigned}
                    </span>
                  </div>
                )}
                {dashboardData?.tasks?.rejected > 0 && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-red-50 to-transparent hover:from-red-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-red-500 flex items-center justify-center">
                        <XMarkIcon className="h-5 w-5 text-white" />
                      </div>
                      <span className="text-sm font-medium text-slate-700">Rejected</span>
                    </div>
                    <span className="text-xl font-bold text-red-600">
                      {dashboardData.tasks.rejected}
                    </span>
                  </div>
                )}
                {dashboardData?.tasks?.total === 0 && (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center">
                      <ClipboardDocumentListIcon className="h-8 w-8 text-slate-400" />
                    </div>
                    <p className="text-sm text-slate-500">No tasks yet</p>
                    <p className="text-xs text-slate-400 mt-1">Create your first task to get started</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
