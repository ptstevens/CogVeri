import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trophy, TrendingUp, Users, BarChart3, Download } from 'lucide-react';
import api from '../../services/api';
import LoadingSpinner from '../ui/LoadingSpinner';
import { useAuth } from '../../contexts/AuthContext';

interface CohortData {
  org_summary: {
    total_analyses: number;
    avg_score: number;
    pass_rate: number;
    partial_rate: number;
    fail_rate: number;
  };
  by_task: Array<{
    task_id: string;
    task_title: string;
    analysis_count: number;
    avg_score: number;
    pass_rate: number;
    score_distribution: { range: string; count: number }[];
    top_performers: Array<{ name: string; score: number }>;
  }>;
  leaderboard: Array<{
    user_id: string;
    name: string;
    avg_score: number;
    analyses_count: number;
    pass_rate: number;
  }>;
}

const verdictColor = (score: number) => {
  if (score >= 80) return 'text-emerald-600 bg-emerald-50';
  if (score >= 60) return 'text-amber-600 bg-amber-50';
  return 'text-red-600 bg-red-50';
};

const ScoreBar: React.FC<{ value: number; max: number; color: string }> = ({ value, max, color }) => (
  <div className="flex items-center gap-2">
    <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: max > 0 ? `${(value / max) * 100}%` : '0%' }}
      />
    </div>
    <span className="text-xs text-slate-500 w-6 text-right">{value}</span>
  </div>
);

export const CohortStats: React.FC = () => {
  const { user } = useAuth();
  const isManager = ['manager', 'admin', 'owner'].includes(user?.org_role || '');

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard-cohort'],
    queryFn: async () => {
      const res = await api.get('/dashboard/cohort');
      return res.data.data as CohortData;
    },
    enabled: isManager,
    staleTime: 5 * 60 * 1000,
  });

  const [isExporting, setIsExporting] = React.useState(false);

  const handleExport = async (period: number = 90) => {
    setIsExporting(true);
    try {
      const response = await api.get(`/dashboard/export?period=${period}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `cogveri-export-${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  if (!isManager) return null;

  return (
    <div className="space-y-6">
      {/* Section header + export button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-indigo-500" />
          <h2 className="text-lg font-semibold text-slate-900">Team Performance</h2>
        </div>
        <button
          onClick={() => handleExport(90)}
          disabled={isExporting}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {isExporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner />
        </div>
      )}

      {error && (
        <div className="text-center py-8 text-slate-500 text-sm">
          Could not load team performance data.
        </div>
      )}

      {data && data.org_summary.total_analyses === 0 && (
        <div className="rounded-2xl bg-white/80 border border-white/50 shadow-sm p-8 text-center">
          <BarChart3 className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No analysis data yet. Complete some tasks to see team performance here.</p>
        </div>
      )}

      {data && data.org_summary.total_analyses > 0 && (
        <>
          {/* Org Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Avg Score', value: `${data.org_summary.avg_score}%`, icon: TrendingUp, color: 'text-indigo-600 bg-indigo-50' },
              { label: 'Pass Rate', value: `${data.org_summary.pass_rate}%`, icon: Trophy, color: 'text-emerald-600 bg-emerald-50' },
              { label: 'Partial Pass', value: `${data.org_summary.partial_rate}%`, icon: BarChart3, color: 'text-amber-600 bg-amber-50' },
              { label: 'Analyses', value: data.org_summary.total_analyses, icon: Users, color: 'text-slate-600 bg-slate-100' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-sm p-4">
                <div className={`inline-flex p-2 rounded-xl mb-3 ${stat.color}`}>
                  <stat.icon className="h-4 w-4" />
                </div>
                <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                <p className="text-xs text-slate-500 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Per-Task Breakdown */}
          {data.by_task.length > 0 && (
            <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden">
              <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-transparent">
                <h3 className="font-semibold text-slate-900">Performance by Task</h3>
              </div>
              <div className="divide-y divide-slate-50">
                {data.by_task.map((task) => {
                  const maxCount = Math.max(...task.score_distribution.map((d) => d.count), 1);
                  return (
                    <div key={task.task_id} className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-medium text-slate-900 text-sm">{task.task_title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{task.analysis_count} recording{task.analysis_count !== 1 ? 's' : ''}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${verdictColor(task.avg_score)}`}>
                            {task.avg_score}%
                          </span>
                          <span className="text-xs text-slate-500">{task.pass_rate}% pass</span>
                        </div>
                      </div>

                      {/* Score distribution bars */}
                      <div className="space-y-1.5 mb-3">
                        {task.score_distribution.map((bucket) => (
                          <div key={bucket.range} className="flex items-center gap-2">
                            <span className="text-xs text-slate-400 w-12">{bucket.range}</span>
                            <ScoreBar
                              value={bucket.count}
                              max={maxCount}
                              color={
                                bucket.range === '80-100' ? 'bg-emerald-400' :
                                bucket.range === '60-79' ? 'bg-amber-400' :
                                bucket.range === '40-59' ? 'bg-orange-400' : 'bg-red-400'
                              }
                            />
                          </div>
                        ))}
                      </div>

                      {/* Top performers */}
                      {task.top_performers.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-slate-400">Top:</span>
                          {task.top_performers.map((p, i) => (
                            <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                              {p.name} · {p.score}%
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Leaderboard */}
          {data.leaderboard.length > 0 && (
            <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden">
              <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-transparent">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-500" />
                  <h3 className="font-semibold text-slate-900">Leaderboard</h3>
                </div>
              </div>
              <div className="p-4">
                <div className="space-y-2">
                  {data.leaderboard.map((user, idx) => (
                    <div key={user.user_id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 transition-colors">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        idx === 0 ? 'bg-amber-100 text-amber-700' :
                        idx === 1 ? 'bg-slate-100 text-slate-600' :
                        idx === 2 ? 'bg-orange-100 text-orange-700' :
                        'bg-slate-50 text-slate-500'
                      }`}>
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{user.name}</p>
                        <p className="text-xs text-slate-500">{user.analyses_count} analyses · {user.pass_rate}% pass rate</p>
                      </div>
                      <span className={`text-sm font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${verdictColor(user.avg_score)}`}>
                        {user.avg_score}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CohortStats;
