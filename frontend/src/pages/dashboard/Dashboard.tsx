import React, { useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  ClipboardList,
  FileSearch,
  CheckCircle,
  Archive,
  Clock,
  Sparkles,
  X,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { StatusBadge } from '../../components/ui';

// ★ Memoized stat card component to prevent unnecessary re-renders
interface DashboardStatCardProps {
  stat: {
    name: string;
    value: number;
    icon: React.ComponentType<{ className?: string }>;
    gradient: string;
    bgGradient: string;
    iconColor: string;
    linkTo: string | null;
  };
  onClick?: () => void;
}

const DashboardStatCard = React.memo(({ stat, onClick }: DashboardStatCardProps) => {
  const isClickable = stat.linkTo !== null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isClickable}
      aria-label={`${stat.name}: ${stat.value}${isClickable ? ' - click to view' : ''}`}
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${stat.bgGradient} backdrop-blur-sm border border-white/50 shadow-lg transition-all duration-300 text-left w-full ${
        isClickable
          ? 'cursor-pointer hover:shadow-xl hover:-translate-y-1'
          : 'cursor-default'
      }`}
    >
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className={`p-3 rounded-xl bg-white shadow-sm`}>
            <stat.icon className={`h-6 w-6 ${stat.iconColor}`} aria-hidden="true" />
          </div>
          <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${stat.gradient} opacity-5 rounded-full -mr-16 -mt-16`} aria-hidden="true"></div>
        </div>
        <p className="text-sm font-medium text-slate-600 mb-1">{stat.name}</p>
        <p className={`text-3xl font-bold bg-gradient-to-r ${stat.gradient} bg-clip-text text-transparent`}>
          {stat.value}
        </p>
      </div>
    </button>
  );
});

DashboardStatCard.displayName = 'DashboardStatCard';

// ★ Memoized activity panel component
interface DashboardActivityPanelProps {
  recentActivity: any[];
  getRelativeTime: (dateString: string) => string;
}

const DashboardActivityPanel = React.memo(
  ({ recentActivity, getRelativeTime }: DashboardActivityPanelProps) => (
    <section
      className="rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden"
      aria-labelledby="recent-activity-heading"
    >
      <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-transparent">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-blue-500" aria-hidden="true" />
          <h2 id="recent-activity-heading" className="text-lg font-semibold text-slate-900">Recent Activity</h2>
        </div>
      </div>
      <div className="p-6">
        <div className="space-y-4">
          {recentActivity.length > 0 ? (
            recentActivity.slice(0, 5).map((activity: any) => {
              return (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {activity.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <StatusBadge status={activity.status} size="sm" showIcon={false} />
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
                <Clock className="h-8 w-8 text-slate-400" aria-hidden="true" />
              </div>
              <p className="text-sm text-slate-500">No recent activity</p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
);

DashboardActivityPanel.displayName = 'DashboardActivityPanel';

// ★ Memoized task breakdown item for better granular rendering
interface TaskBreakdownItemProps {
  count: number;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: 'blue' | 'purple' | 'green' | 'yellow' | 'red';
}

const TaskBreakdownItem = React.memo(({ count, label, icon: Icon, color }: TaskBreakdownItemProps) => {
  const colorMap = {
    blue: { bg: 'bg-blue-500', hoverBg: 'hover:from-blue-100', gradientBg: 'from-blue-50' },
    purple: { bg: 'bg-purple-500', hoverBg: 'hover:from-purple-100', gradientBg: 'from-purple-50' },
    green: { bg: 'bg-green-500', hoverBg: 'hover:from-green-100', gradientBg: 'from-green-50' },
    yellow: { bg: 'bg-yellow-500', hoverBg: 'hover:from-yellow-100', gradientBg: 'from-yellow-50' },
    red: { bg: 'bg-red-500', hoverBg: 'hover:from-red-100', gradientBg: 'from-red-50' },
  };

  const colors = colorMap[color];

  return (
    <div className={`flex items-center justify-between p-3 rounded-xl bg-gradient-to-r ${colors.gradientBg} to-transparent ${colors.hoverBg} transition-colors`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg ${colors.bg} flex items-center justify-center`}>
          <Icon className="h-5 w-5 text-white" aria-hidden="true" />
        </div>
        <span className="text-sm font-medium text-slate-700">{label}</span>
      </div>
      <span className={`text-xl font-bold text-${color}-600`} aria-label={`${count} ${label} tasks`}>
        {count}
      </span>
    </div>
  );
});

TaskBreakdownItem.displayName = 'TaskBreakdownItem';

// ★ Memoized task breakdown component
interface DashboardTaskBreakdownProps {
  dashboardData: any;
}

const DashboardTaskBreakdown = React.memo(({ dashboardData }: DashboardTaskBreakdownProps) => (
  <section
    className="rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden"
    aria-labelledby="task-overview-heading"
  >
    <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-transparent">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-blue-500" aria-hidden="true" />
        <h2 id="task-overview-heading" className="text-lg font-semibold text-slate-900">Task Overview</h2>
      </div>
    </div>
    <div className="p-6">
      <div className="space-y-3">
        {dashboardData?.tasks?.in_progress > 0 && (
          <TaskBreakdownItem
            count={dashboardData.tasks.in_progress}
            label="In Progress"
            icon={Clock}
            color="blue"
          />
        )}
        {dashboardData?.tasks?.submitted > 0 && (
          <TaskBreakdownItem
            count={dashboardData.tasks.submitted}
            label="Under Review"
            icon={FileSearch}
            color="purple"
          />
        )}
        {dashboardData?.tasks?.completed > 0 && (
          <TaskBreakdownItem
            count={dashboardData.tasks.completed}
            label="Completed"
            icon={CheckCircle}
            color="green"
          />
        )}
        {dashboardData?.tasks?.assigned > 0 && (
          <TaskBreakdownItem
            count={dashboardData.tasks.assigned}
            label="Assigned"
            icon={ClipboardList}
            color="yellow"
          />
        )}
        {dashboardData?.tasks?.rejected > 0 && (
          <TaskBreakdownItem
            count={dashboardData.tasks.rejected}
            label="Rejected"
            icon={X}
            color="red"
          />
        )}
        {dashboardData?.tasks?.total === 0 && (
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center">
              <ClipboardList className="h-8 w-8 text-slate-400" aria-hidden="true" />
            </div>
            <p className="text-sm text-slate-500">No tasks yet</p>
            <p className="text-xs text-slate-400 mt-1">Create your first task to get started</p>
          </div>
        )}
      </div>
    </div>
  </section>
));

DashboardTaskBreakdown.displayName = 'DashboardTaskBreakdown';

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Check if user is a system admin without an organization - redirect to admin dashboard
  const isSystemAdmin = (user as any)?.is_system_admin === true || (user as any)?.system_role === 'SUPER_ADMIN';
  const hasNoOrganization = !user?.organization_id;

  useEffect(() => {
    if (isSystemAdmin && hasNoOrganization) {
      navigate('/admin', { replace: true });
    }
  }, [isSystemAdmin, hasNoOrganization, navigate]);

  // Fetch dashboard stats from API
  const { data: dashboardData, isLoading, error } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const response = await api.get('/dashboard/stats');
      return response.data.data;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes - stats don't change frequently
    refetchOnWindowFocus: false, // Don't refetch when user switches tabs
  });

  // ★ IMPORTANT: All hooks must be called before any early returns
  // This prevents React Hook rule violations (error #310)

  // ★ Memoize expensive stat calculations to avoid recalculation on every render
  // Each stat can link to the Tasks page with a filter applied
  const stats = useMemo(
    () => [
      {
        name: 'Total Tasks',
        value: dashboardData?.tasks?.total || 0,
        icon: ClipboardList,
        gradient: 'from-blue-500 to-cyan-500',
        bgGradient: 'from-blue-500/10 to-cyan-500/10',
        iconColor: 'text-blue-500',
        linkTo: '/tasks', // Show all tasks
      },
      {
        name: 'Submitted',
        value: dashboardData?.tasks?.submitted || 0,
        icon: FileSearch,
        gradient: 'from-purple-500 to-pink-500',
        bgGradient: 'from-purple-500/10 to-pink-500/10',
        iconColor: 'text-purple-500',
        linkTo: '/reviews', // Submitted tasks go to review queue
      },
      {
        name: 'Completed',
        value: dashboardData?.tasks?.completed || 0,
        icon: CheckCircle,
        gradient: 'from-green-500 to-emerald-500',
        bgGradient: 'from-green-500/10 to-emerald-500/10',
        iconColor: 'text-green-500',
        linkTo: '/tasks?status=completed',
      },
      {
        name: 'Archived',
        value: dashboardData?.tasks?.archived || 0,
        icon: Archive,
        gradient: 'from-slate-500 to-gray-500',
        bgGradient: 'from-slate-500/10 to-gray-500/10',
        iconColor: 'text-slate-500',
        linkTo: null, // Archived is not clickable (no dedicated view)
      },
    ],
    [dashboardData?.tasks]
  );

  // ★ Memoize utility function to avoid recalculation on every render
  const getRelativeTime = useCallback((dateString: string) => {
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
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <LoadingSpinner />
      </div>
    );
  }

  // Handle error state
  if (error) {
    const errorMessage = (error as any)?.response?.data?.message || 'Failed to load dashboard';
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-teal-50/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden">
            <div className="p-8">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-blue-600" />
                </div>
                <h1 className="text-2xl font-bold text-slate-900">Welcome, {user?.name}!</h1>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                <p className="text-blue-900 font-medium mb-2">{errorMessage}</p>
                <p className="text-blue-700 text-sm">
                  To start tracking your tasks and projects, you'll need to join or create an organization. 
                  Visit your settings or ask your team lead for an invitation.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const recentActivity = dashboardData?.recent_activity || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-teal-50/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="h-8 w-8 text-blue-500" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
              Welcome back, {user?.name}
            </h1>
          </div>
          <p className="text-slate-600 text-lg ml-11">
            Here's what's happening with your projects today
          </p>
        </div>

        {/* Stats Grid - Clickable to navigate */}
        <section aria-label="Task statistics" className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          {stats.map((stat) => (
            <DashboardStatCard
              key={stat.name}
              stat={stat}
              onClick={stat.linkTo ? () => navigate(stat.linkTo!) : undefined}
            />
          ))}
        </section>

        {/* Activity and Breakdown Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-8">
          {/* Recent Activity */}
          <DashboardActivityPanel
            recentActivity={recentActivity}
            getRelativeTime={getRelativeTime}
          />

          {/* Task Status Breakdown */}
          <DashboardTaskBreakdown 
            dashboardData={dashboardData}
          />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
