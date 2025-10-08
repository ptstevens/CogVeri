import api from './api';

export interface MagicLinkToken {
  token: string;
  url: string;
}

export interface CreateMagicLinkDto {
  taskId: string;
  email: string;
  expiresInDays: number;
  maxUses?: number;
}

export interface ClaimTaskDto {
  firstName: string;
  lastName: string;
  email: string;
}

export interface TokenValidation {
  valid: boolean;
  taskId?: string;
  email?: string;
  contributorId?: string;
}

export interface ExternalContributor {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  total_tasks_assigned: number;
  total_tasks_completed: number;
  total_tasks_rejected: number;
  average_completion_time_seconds?: number;
  last_active_at?: string;
  created_at: string;
}

export interface ContributorAnalytics {
  contributor: ExternalContributor;
  stats: {
    completionRate: number;
    successRate: number;
    averageCompletionTime?: number;
  };
  tasks: any[];
  recentActivity: any[];
}

class MagicLinkService {
  /**
   * Create a magic link for a task
   */
  async createMagicLink(data: CreateMagicLinkDto): Promise<MagicLinkToken> {
    const response = await api.post('/magic-links', data);
    return response.data.data;
  }

  /**
   * Validate a token (public endpoint)
   */
  async validateToken(token: string): Promise<TokenValidation> {
    const response = await api.get(`/magic-links/validate/${token}`);
    return response.data.data;
  }

  /**
   * Get task details by token (public endpoint)
   */
  async getTaskByToken(token: string): Promise<any> {
    const response = await api.get(`/magic-links/task/${token}`);
    return response.data.data;
  }

  /**
   * Claim a task (public endpoint)
   */
  async claimTask(token: string, data: ClaimTaskDto): Promise<any> {
    const response = await api.post(`/magic-links/claim/${token}`, data);
    return response.data.data;
  }

  /**
   * Revoke a magic link
   */
  async revokeToken(taskId: string): Promise<void> {
    await api.delete(`/magic-links/revoke/${taskId}`);
  }

  /**
   * Get all external contributors
   */
  async getExternalContributors(search?: string, limit?: number): Promise<ExternalContributor[]> {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (limit) params.append('limit', limit.toString());

    const queryString = params.toString();
    const url = queryString ? `/magic-links/contributors?${queryString}` : '/magic-links/contributors';

    const response = await api.get(url);
    return response.data.data;
  }

  /**
   * Get contributor analytics
   */
  async getContributorAnalytics(contributorId: string): Promise<ContributorAnalytics> {
    const response = await api.get(`/magic-links/contributors/${contributorId}/analytics`);
    return response.data.data;
  }
}

export const magicLinkService = new MagicLinkService();
