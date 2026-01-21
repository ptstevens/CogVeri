import { useQuery, UseQueryOptions } from '@tanstack/react-query';

/**
 * ★ useOptimizedQuery - Enhanced useQuery hook with intelligent deduplication
 * 
 * This hook provides optimized query strategies for different data types:
 * - Dashboard stats: 5 min staleTime, 10 min cache
 * - User lists: 10 min staleTime, 15 min cache
 * - Task data: 2 min staleTime, 5 min cache
 * - Recording data: 1 min staleTime, 5 min cache
 * 
 * Usage:
 * ```tsx
 * const { data } = useOptimizedQuery(
 *   'dashboard-stats',
 *   () => api.get('/dashboard/stats'),
 *   'dashboard' // Category for optimized settings
 * );
 * ```
 */

export type QueryCategory = 'dashboard' | 'users' | 'tasks' | 'recordings' | 'reviews' | 'default';

interface OptimizedQueryOptions<TData> extends Omit<UseQueryOptions<TData>, 'queryFn'> {
  category?: QueryCategory;
}

const categoryConfigs: Record<QueryCategory, { staleTime: number; gcTime: number }> = {
  // Dashboard stats - Medium freshness, long cache (reduce DB queries)
  dashboard: { 
    staleTime: 5 * 60 * 1000,  // 5 minutes
    gcTime: 10 * 60 * 1000     // 10 minutes
  },
  
  // User lists - Low frequency change, longer cache
  users: { 
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 15 * 60 * 1000     // 15 minutes
  },
  
  // Task data - Frequent changes, shorter cache
  tasks: { 
    staleTime: 2 * 60 * 1000,  // 2 minutes
    gcTime: 5 * 60 * 1000      // 5 minutes
  },
  
  // Recording data - High frequency changes, very short cache
  recordings: { 
    staleTime: 1 * 60 * 1000,  // 1 minute
    gcTime: 5 * 60 * 1000      // 5 minutes
  },
  
  // Review data - Medium frequency changes
  reviews: { 
    staleTime: 3 * 60 * 1000,  // 3 minutes
    gcTime: 8 * 60 * 1000      // 8 minutes
  },
  
  // Default - Conservative approach
  default: { 
    staleTime: 5 * 60 * 1000,  // 5 minutes
    gcTime: 10 * 60 * 1000     // 10 minutes
  },
};

export function useOptimizedQuery<TData = unknown>(
  queryKey: string | (string | number | Record<string, any>)[],
  queryFn: () => Promise<TData>,
  category: QueryCategory = 'default',
  options?: OptimizedQueryOptions<TData>
) {
  const config = categoryConfigs[category];
  
  return useQuery<TData>({
    queryKey: typeof queryKey === 'string' ? [queryKey] : queryKey,
    queryFn,
    staleTime: config.staleTime,
    gcTime: config.gcTime,
    refetchOnWindowFocus: false,
    retry: (failureCount, error: any) => {
      // Don't retry on 4xx errors
      if (error?.response?.status >= 400 && error?.response?.status < 500) {
        return false;
      }
      return failureCount < 1;
    },
    ...options,
  });
}

/**
 * ★ useOptimizedQueries - For querying multiple endpoints with deduplication
 * Useful when a page needs multiple data types simultaneously
 * 
 * Example: Dashboard page needing tasks, statistics, and recent activity
 * React Query automatically deduplicates identical requests made within 250ms
 */
export { useQueries } from '@tanstack/react-query';
