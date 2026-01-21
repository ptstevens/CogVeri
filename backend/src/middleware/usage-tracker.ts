import { db } from '../config/database';
import { logger } from '../utils/logger';

/**
 * Usage Tracking Helpers
 *
 * Provides functions to track usage after successful operations.
 * Usage is tracked in the organization_usage table for monthly quota enforcement.
 */

export interface UsageSummary {
  organizationId: string;
  period: {
    year: number;
    month: number;
  };
  usage: {
    tasks: {
      count: number;
      limit: number;
      percentUsed: number;
      isUnlimited: boolean;
    };
    videos: {
      count: number;
      limit: number;
      percentUsed: number;
      isUnlimited: boolean;
    };
    storage: {
      usedBytes: number;
      usedGb: number;
      limitGb: number;
      percentUsed: number;
      isUnlimited: boolean;
    };
    members: {
      count: number;
      limit: number;
      percentUsed: number;
      isUnlimited: boolean;
    };
    externalContributors: {
      count: number;
      limit: number;
      percentUsed: number;
      isUnlimited: boolean;
    };
    workspaces: {
      count: number;
      limit: number;
      percentUsed: number;
      isUnlimited: boolean;
    };
    videoDuration: {
      totalSeconds: number;
      totalMinutes: number;
      maxLengthMinutes: number;
      isUnlimited: boolean;
    };
  };
  warnings: string[];
}

/**
 * Get or create usage record for current month
 * @internal Reserved for future use in transaction-based usage tracking
 */
export const getOrCreateUsageRecord = async (
  organizationId: string,
  trx?: any
): Promise<any> => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const query = trx || db;

  // Try to get existing record
  let record = await query('organization_usage')
    .where('organization_id', organizationId)
    .where('year', year)
    .where('month', month)
    .first();

  if (!record) {
    // Create new record for this month
    try {
      [record] = await query('organization_usage')
        .insert({
          organization_id: organizationId,
          year,
          month,
          tasks_count: 0,
          videos_count: 0,
          storage_bytes: 0,
          members_count: 0,
          external_contributors_count: 0,
          workspaces_count: 0,
          total_video_duration_seconds: 0,
        })
        .onConflict(['organization_id', 'year', 'month'])
        .merge()
        .returning('*');
    } catch (error: any) {
      // Handle race condition - record may have been created
      if (error.code === '23505') {
        record = await query('organization_usage')
          .where('organization_id', organizationId)
          .where('year', year)
          .where('month', month)
          .first();
      } else {
        throw error;
      }
    }
  }

  return record;
};

/**
 * Increment task count for the month
 */
export const trackTaskCreated = async (organizationId: string): Promise<void> => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    await db('organization_usage')
      .insert({
        organization_id: organizationId,
        year,
        month,
        tasks_count: 1,
        videos_count: 0,
        storage_bytes: 0,
        members_count: 0,
        external_contributors_count: 0,
        workspaces_count: 0,
        total_video_duration_seconds: 0,
      })
      .onConflict(['organization_id', 'year', 'month'])
      .merge({
        tasks_count: db.raw('organization_usage.tasks_count + 1'),
        updated_at: new Date(),
      });

    logger.debug(`Task tracked for organization ${organizationId}`);
  } catch (error) {
    logger.error('Error tracking task creation:', error);
    // Don't throw - usage tracking should not block main operation
  }
};

/**
 * Decrement task count (for deletions/reversals)
 */
export const trackTaskDeleted = async (organizationId: string): Promise<void> => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    await db('organization_usage')
      .where('organization_id', organizationId)
      .where('year', year)
      .where('month', month)
      .update({
        tasks_count: db.raw('GREATEST(0, tasks_count - 1)'),
        updated_at: new Date(),
      });

    logger.debug(`Task deletion tracked for organization ${organizationId}`);
  } catch (error) {
    logger.error('Error tracking task deletion:', error);
  }
};

/**
 * Increment video count and storage for the month
 */
export const trackVideoUploaded = async (
  organizationId: string,
  fileSizeBytes: number,
  durationMinutes: number
): Promise<void> => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const durationSeconds = Math.round(durationMinutes * 60);

    await db('organization_usage')
      .insert({
        organization_id: organizationId,
        year,
        month,
        tasks_count: 0,
        videos_count: 1,
        storage_bytes: fileSizeBytes,
        members_count: 0,
        external_contributors_count: 0,
        workspaces_count: 0,
        total_video_duration_seconds: durationSeconds,
      })
      .onConflict(['organization_id', 'year', 'month'])
      .merge({
        videos_count: db.raw('organization_usage.videos_count + 1'),
        storage_bytes: db.raw('organization_usage.storage_bytes + ?', [fileSizeBytes]),
        total_video_duration_seconds: db.raw('organization_usage.total_video_duration_seconds + ?', [durationSeconds]),
        updated_at: new Date(),
      });

    logger.debug(`Video upload tracked for organization ${organizationId}: ${fileSizeBytes} bytes, ${durationMinutes} minutes`);
  } catch (error) {
    logger.error('Error tracking video upload:', error);
  }
};

/**
 * Track video deletion (reduce storage)
 */
export const trackVideoDeleted = async (
  organizationId: string,
  fileSizeBytes: number,
  durationMinutes: number
): Promise<void> => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const durationSeconds = Math.round(durationMinutes * 60);

    await db('organization_usage')
      .where('organization_id', organizationId)
      .where('year', year)
      .where('month', month)
      .update({
        videos_count: db.raw('GREATEST(0, videos_count - 1)'),
        storage_bytes: db.raw('GREATEST(0, storage_bytes - ?)', [fileSizeBytes]),
        total_video_duration_seconds: db.raw('GREATEST(0, total_video_duration_seconds - ?)', [durationSeconds]),
        updated_at: new Date(),
      });

    logger.debug(`Video deletion tracked for organization ${organizationId}`);
  } catch (error) {
    logger.error('Error tracking video deletion:', error);
  }
};

/**
 * Track member added
 */
export const trackMemberAdded = async (organizationId: string): Promise<void> => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    await db('organization_usage')
      .insert({
        organization_id: organizationId,
        year,
        month,
        tasks_count: 0,
        videos_count: 0,
        storage_bytes: 0,
        members_count: 1,
        external_contributors_count: 0,
        workspaces_count: 0,
        total_video_duration_seconds: 0,
      })
      .onConflict(['organization_id', 'year', 'month'])
      .merge({
        members_count: db.raw('organization_usage.members_count + 1'),
        updated_at: new Date(),
      });

    logger.debug(`Member added tracked for organization ${organizationId}`);
  } catch (error) {
    logger.error('Error tracking member addition:', error);
  }
};

/**
 * Track member removed
 */
export const trackMemberRemoved = async (organizationId: string): Promise<void> => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    await db('organization_usage')
      .where('organization_id', organizationId)
      .where('year', year)
      .where('month', month)
      .update({
        members_count: db.raw('GREATEST(0, members_count - 1)'),
        updated_at: new Date(),
      });

    logger.debug(`Member removal tracked for organization ${organizationId}`);
  } catch (error) {
    logger.error('Error tracking member removal:', error);
  }
};

/**
 * Track external contributor
 */
export const trackExternalContributor = async (
  organizationId: string,
  action: 'added' | 'removed'
): Promise<void> => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    if (action === 'added') {
      await db('organization_usage')
        .insert({
          organization_id: organizationId,
          year,
          month,
          tasks_count: 0,
          videos_count: 0,
          storage_bytes: 0,
          members_count: 0,
          external_contributors_count: 1,
          workspaces_count: 0,
          total_video_duration_seconds: 0,
        })
        .onConflict(['organization_id', 'year', 'month'])
        .merge({
          external_contributors_count: db.raw('organization_usage.external_contributors_count + 1'),
          updated_at: new Date(),
        });
    } else {
      await db('organization_usage')
        .where('organization_id', organizationId)
        .where('year', year)
        .where('month', month)
        .update({
          external_contributors_count: db.raw('GREATEST(0, external_contributors_count - 1)'),
          updated_at: new Date(),
        });
    }

    logger.debug(`External contributor ${action} tracked for organization ${organizationId}`);
  } catch (error) {
    logger.error('Error tracking external contributor:', error);
  }
};

/**
 * Track workspace creation
 */
export const trackWorkspaceCreated = async (organizationId: string): Promise<void> => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    await db('organization_usage')
      .insert({
        organization_id: organizationId,
        year,
        month,
        tasks_count: 0,
        videos_count: 0,
        storage_bytes: 0,
        members_count: 0,
        external_contributors_count: 0,
        workspaces_count: 1,
        total_video_duration_seconds: 0,
      })
      .onConflict(['organization_id', 'year', 'month'])
      .merge({
        workspaces_count: db.raw('organization_usage.workspaces_count + 1'),
        updated_at: new Date(),
      });

    logger.debug(`Workspace creation tracked for organization ${organizationId}`);
  } catch (error) {
    logger.error('Error tracking workspace creation:', error);
  }
};

/**
 * Track workspace deletion
 */
export const trackWorkspaceDeleted = async (organizationId: string): Promise<void> => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    await db('organization_usage')
      .where('organization_id', organizationId)
      .where('year', year)
      .where('month', month)
      .update({
        workspaces_count: db.raw('GREATEST(0, workspaces_count - 1)'),
        updated_at: new Date(),
      });

    logger.debug(`Workspace deletion tracked for organization ${organizationId}`);
  } catch (error) {
    logger.error('Error tracking workspace deletion:', error);
  }
};

/**
 * Recalculate and sync usage from source data
 * Useful for fixing drift or after data migrations
 */
export const syncUsageFromSource = async (organizationId: string): Promise<void> => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // Get actual counts from source tables
    const [memberCount] = await db('users')
      .where('organization_id', organizationId)
      .count('id as count');

    const [taskCount] = await db('tasks')
      .where('organization_id', organizationId)
      .whereRaw('created_at >= date_trunc(\'month\', now())')
      .count('id as count');

    const videoDataResult = await db('recordings')
      .where('organization_id', organizationId)
      .whereRaw('created_at >= date_trunc(\'month\', now())')
      .select(
        db.raw('count(id) as count'),
        db.raw('coalesce(sum(file_size_bytes), 0) as total_bytes'),
        db.raw('coalesce(sum(duration_seconds), 0) as total_seconds')
      )
      .first();

    const videoData = (videoDataResult as unknown as { count: string; total_bytes: string; total_seconds: string }) || { count: '0', total_bytes: '0', total_seconds: '0' };

    // Get all-time storage (not monthly)
    const [totalStorage] = await db('recordings')
      .where('organization_id', organizationId)
      .where('status', '!=', 'deleted')
      .sum('file_size_bytes as total');

    // External contributors
    let externalCount = 0;
    try {
      const [extCount] = await db('external_contributors')
        .where('organization_id', organizationId)
        .where('is_active', true)
        .count('id as count');
      externalCount = parseInt(String(extCount?.count)) || 0;
    } catch {
      // Table may not exist
    }

    // Workspaces
    let workspaceCount = 0;
    try {
      const [wsCount] = await db('workspaces')
        .where('organization_id', organizationId)
        .count('id as count');
      workspaceCount = parseInt(String(wsCount?.count)) || 0;
    } catch {
      // Table may not exist
    }

    // Parse counts safely
    const parsedTaskCount = parseInt(String((taskCount as any).count)) || 0;
    const parsedVideoCount = parseInt(String(videoData.count)) || 0;
    const parsedStorageBytes = parseInt(String((totalStorage as any)?.total)) || 0;
    const parsedMemberCount = parseInt(String((memberCount as any).count)) || 0;
    const parsedVideoDuration = parseInt(String(videoData.total_seconds)) || 0;

    // Upsert usage record
    await db('organization_usage')
      .insert({
        organization_id: organizationId,
        year,
        month,
        tasks_count: parsedTaskCount,
        videos_count: parsedVideoCount,
        storage_bytes: parsedStorageBytes,
        members_count: parsedMemberCount,
        external_contributors_count: externalCount,
        workspaces_count: workspaceCount,
        total_video_duration_seconds: parsedVideoDuration,
      })
      .onConflict(['organization_id', 'year', 'month'])
      .merge({
        tasks_count: parsedTaskCount,
        videos_count: parsedVideoCount,
        storage_bytes: parsedStorageBytes,
        members_count: parsedMemberCount,
        external_contributors_count: externalCount,
        workspaces_count: workspaceCount,
        total_video_duration_seconds: parsedVideoDuration,
        updated_at: new Date(),
      });

    logger.info(`Usage synced from source for organization ${organizationId}`);
  } catch (error) {
    logger.error('Error syncing usage from source:', error);
    throw error;
  }
};

/**
 * Get usage summary for an organization
 */
export const getUsageSummary = async (organizationId: string): Promise<UsageSummary> => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // Get organization with tier info
  const org = await db('organizations')
    .where('id', organizationId)
    .first();

  if (!org) {
    throw new Error('Organization not found');
  }

  // Import pricing tiers
  const { PRICING_TIERS } = await import('../services/pricing.service');
  const tierName = org.subscription_tier || 'free';
  const tier = PRICING_TIERS[tierName.toLowerCase()] || PRICING_TIERS.free;

  // Get current month usage
  const usageRecord = await db('organization_usage')
    .where('organization_id', organizationId)
    .where('year', year)
    .where('month', month)
    .first();

  const usage = usageRecord || {
    tasks_count: 0,
    videos_count: 0,
    storage_bytes: 0,
    members_count: 0,
    external_contributors_count: 0,
    workspaces_count: 0,
    total_video_duration_seconds: 0,
  };

  // If no usage record, calculate from source
  if (!usageRecord) {
    await syncUsageFromSource(organizationId);
    const freshUsage = await db('organization_usage')
      .where('organization_id', organizationId)
      .where('year', year)
      .where('month', month)
      .first();

    if (freshUsage) {
      Object.assign(usage, freshUsage);
    }
  }

  const limits = tier!.limits;
  const warnings: string[] = [];

  // Helper to calculate percentage
  const calcPercent = (current: number, limit: number): number => {
    if (limit === -1) return 0;
    if (limit === 0) return 100;
    return Math.round((current / limit) * 10000) / 100;
  };

  // Build usage summary
  const tasksPercent = calcPercent(usage.tasks_count, limits.maxTasksPerMonth);
  const videosPercent = calcPercent(usage.videos_count, limits.maxVideosPerMonth);
  const storageGb = usage.storage_bytes / (1024 * 1024 * 1024);
  const storagePercent = calcPercent(storageGb, limits.maxStorageGb);
  const membersPercent = calcPercent(usage.members_count, limits.maxMembers);
  const externalPercent = calcPercent(usage.external_contributors_count, limits.maxExternalContributors);
  const workspacesPercent = calcPercent(usage.workspaces_count, limits.maxWorkspaces);

  // Generate warnings for limits approaching
  if (limits.maxTasksPerMonth !== -1 && tasksPercent >= 80) {
    warnings.push(`Task limit at ${tasksPercent}% (${usage.tasks_count}/${limits.maxTasksPerMonth})`);
  }
  if (limits.maxVideosPerMonth !== -1 && videosPercent >= 80) {
    warnings.push(`Video limit at ${videosPercent}% (${usage.videos_count}/${limits.maxVideosPerMonth})`);
  }
  if (limits.maxStorageGb !== -1 && storagePercent >= 80) {
    warnings.push(`Storage limit at ${storagePercent}% (${storageGb.toFixed(2)}GB/${limits.maxStorageGb}GB)`);
  }
  if (limits.maxMembers !== -1 && membersPercent >= 80) {
    warnings.push(`Member limit at ${membersPercent}% (${usage.members_count}/${limits.maxMembers})`);
  }
  if (limits.maxExternalContributors !== -1 && externalPercent >= 80) {
    warnings.push(`External contributor limit at ${externalPercent}%`);
  }
  if (limits.maxWorkspaces !== -1 && workspacesPercent >= 80) {
    warnings.push(`Workspace limit at ${workspacesPercent}%`);
  }

  return {
    organizationId,
    period: { year, month },
    usage: {
      tasks: {
        count: usage.tasks_count,
        limit: limits.maxTasksPerMonth,
        percentUsed: tasksPercent,
        isUnlimited: limits.maxTasksPerMonth === -1,
      },
      videos: {
        count: usage.videos_count,
        limit: limits.maxVideosPerMonth,
        percentUsed: videosPercent,
        isUnlimited: limits.maxVideosPerMonth === -1,
      },
      storage: {
        usedBytes: parseInt(String(usage.storage_bytes)) || 0,
        usedGb: Math.round(storageGb * 100) / 100,
        limitGb: limits.maxStorageGb,
        percentUsed: storagePercent,
        isUnlimited: limits.maxStorageGb === -1,
      },
      members: {
        count: usage.members_count,
        limit: limits.maxMembers,
        percentUsed: membersPercent,
        isUnlimited: limits.maxMembers === -1,
      },
      externalContributors: {
        count: usage.external_contributors_count,
        limit: limits.maxExternalContributors,
        percentUsed: externalPercent,
        isUnlimited: limits.maxExternalContributors === -1,
      },
      workspaces: {
        count: usage.workspaces_count,
        limit: limits.maxWorkspaces,
        percentUsed: workspacesPercent,
        isUnlimited: limits.maxWorkspaces === -1,
      },
      videoDuration: {
        totalSeconds: parseInt(String(usage.total_video_duration_seconds)) || 0,
        totalMinutes: Math.round((parseInt(String(usage.total_video_duration_seconds)) || 0) / 60),
        maxLengthMinutes: limits.maxVideoLengthMinutes,
        isUnlimited: limits.maxVideoLengthMinutes === -1,
      },
    },
    warnings,
  };
};

/**
 * Get historical usage for an organization (for analytics)
 */
export const getUsageHistory = async (
  organizationId: string,
  monthsBack: number = 12
): Promise<Array<{
  year: number;
  month: number;
  tasks: number;
  videos: number;
  storageGb: number;
}>> => {
  try {
    const records = await db('organization_usage')
      .where('organization_id', organizationId)
      .orderBy([
        { column: 'year', order: 'desc' },
        { column: 'month', order: 'desc' },
      ])
      .limit(monthsBack);

    return records.map((r: any) => ({
      year: r.year,
      month: r.month,
      tasks: r.tasks_count,
      videos: r.videos_count,
      storageGb: Math.round((parseInt(r.storage_bytes) / (1024 * 1024 * 1024)) * 100) / 100,
    }));
  } catch (error) {
    logger.error('Error getting usage history:', error);
    return [];
  }
};
