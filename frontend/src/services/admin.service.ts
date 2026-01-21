import api from './api';

export interface AdminMetrics {
  organizations: {
    total: number;
    active: number;
    suspended: number;
    withVerifiedDomain: number;
  };
  users: {
    total: number;
    systemAdmins: number;
  };
  growth: {
    newOrgsLastWeek: number;
    newOrgsLastMonth: number;
  };
  distribution: {
    byTier: Array<{ tier: string; count: number }>;
    averageMembersPerOrg: number;
  };
}

export interface OrganizationSummary {
  id: string;
  name: string;
  domain: string;
  domainVerified: boolean; // mapped from backend domain_verified/domainVerified
  isSuspended: boolean; // mapped from is_suspended
  isActive: boolean; // mapped from is_active
  memberCount: number;
  ownerEmail: string;
  createdAt: string;
  lastActivityAt: string;
  // Backend might send snake_case or mixing, we'll need to check the controller output or just use looser types matching backend if we don't transform.
  // Controller sends: ...org (snake_case database fields usually), memberCount, ownerEmail, domainVerified, createdAt, lastActivityAt
  // org fields: name, domain, is_suspended, is_active, owner_id, etc.
  // Actually controller explicitly constructs the object.
  // Let's match what the controller sends in `getOrganizations`.
  // { ...org, memberCount, ownerEmail, domainVerified, createdAt, lastActivityAt }
  // DB org: is_suspended, is_active, domain_verified
  // So we will have mixed case properties available.
  domain_verified?: boolean;
  is_suspended?: boolean;
  is_active?: boolean;
}

export interface OrganizationDetail {
  organization: {
    id: string;
    name: string;
    description: string;
    domain: string;
    domainVerified: boolean;
    isActive: boolean;
    isSuspended: boolean;
    createdAt: string;
    updatedAt: string;
  };
  owner: {
    id: string;
    email: string;
    name: string;
  };
  subscription: {
    tier: string;
    status: string;
    createdAt: string;
  };
  metrics: {
    memberCount: number;
    daysActive: number;
    lastActivityAt: string;
  };
  members: {
    total: number;
    list: Array<{
      id: string;
      email: string;
      role: string;
    }>;
  };
  auditLogs: Array<{
    action: string;
    resourceType: string;
    createdAt: string;
    actor: string;
  }>;
}

export const AdminService = {
  /**
   * Create a new organization
   */
  async createOrganization(data: {
    name: string;
    ownerEmail: string;
    tier?: string;
  }): Promise<{
    organizationId: string;
    name: string;
    ownerId: string;
    ownerEmail: string;
    tier: string;
  }> {
    const response = await api.post('/admin/organizations', data);
    return response.data.data;
  },

  /**
   * Get system-wide metrics
   */
  async getSystemMetrics(): Promise<AdminMetrics> {
    const response = await api.get('/admin/metrics');
    return response.data.data;
  },

  /**
   * Get paginated organizations
   */
  async getOrganizations(params: {
    limit?: number;
    offset?: number;
    search?: string;
    status?: string;
  }): Promise<{ organizations: OrganizationSummary[]; total: number; hasMore: boolean }> {
    const response = await api.get('/admin/organizations', { params });
    return response.data.data;
  },

  /**
   * Get organization details
   */
  async getOrganizationDetails(organizationId: string): Promise<OrganizationDetail> {
    const response = await api.get(`/admin/organizations/${organizationId}`);
    return response.data.data;
  },

  /**
   * Update organization tier
   */
  async updateOrganizationTier(organizationId: string, tier: string): Promise<{ tier: string }> {
    const response = await api.put(`/admin/organizations/${organizationId}/tier`, { tier });
    return response.data;
  },

  /**
   * Suspend an organization
   */
  async suspendOrganization(organizationId: string, reason?: string): Promise<void> {
    await api.post(`/admin/organizations/${organizationId}/suspend`, { reason });
  },

  /**
   * Unsuspend an organization
   */
  async unsuspendOrganization(organizationId: string): Promise<void> {
    await api.post(`/admin/organizations/${organizationId}/unsuspend`);
  },

  /**
   * Impersonate an organization (Get temporary access token)
   */
  async impersonateOrganization(organizationId: string): Promise<{
    impersonationToken: string;
    expiresAt: string;
    organizationId: string;
    message: string;
  }> {
    const response = await api.post(`/admin/impersonate/${organizationId}`);
    return response.data.data;
  },

  /**
   * Login using impersonation token
   */
  async loginAsOrganization(token: string): Promise<{
    token: string;
    refreshToken?: string; // Now optional - stored in HttpOnly cookie
    user: any;
    isImpersonating: boolean;
  }> {
    const response = await api.post('/auth/v2/impersonate/token', { token });
    return response.data;
  },

  /**
   * Get audit logs for an organization
   */
  async getAuditLogs(
    organizationId: string,
    params: {
      limit?: number;
      offset?: number;
      action?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<{ logs: any[]; total: number; hasMore: boolean }> {
    const response = await api.get(`/admin/organizations/${organizationId}/audit-logs`, { params });
    return response.data.data;
  },

  /**
   * Get organization feature overrides
   */
  async getOrganizationFeatures(organizationId: string): Promise<{
    organizationId: string;
    organizationName: string;
    tier: string;
    tierDisplayName: string;
    features: Record<
      string,
      {
        name: string;
        description: string;
        category: string;
        tierValue: boolean;
        customValue: boolean | null;
        effectiveValue: boolean;
        isOverridden: boolean;
      }
    >;
  }> {
    const response = await api.get(`/admin/organizations/${organizationId}/features`);
    return response.data.data;
  },

  /**
   * Update organization feature overrides
   */
  async updateOrganizationFeatures(
    organizationId: string,
    features: Record<string, boolean | null>
  ): Promise<{
    success: boolean;
    message: string;
    changes: Array<{ feature: string; from: boolean | null; to: boolean | null }>;
  }> {
    const response = await api.put(`/admin/organizations/${organizationId}/features`, { features });
    return response.data;
  },

  /**
   * Get organization limit overrides
   */
  async getOrganizationLimits(organizationId: string): Promise<{
    organizationId: string;
    organizationName: string;
    tier: string;
    tierDisplayName: string;
    limits: Record<
      string,
      {
        name: string;
        unit: string;
        tierValue: number;
        customValue: number | null;
        effectiveValue: number;
        isOverridden: boolean;
        isUnlimited: boolean;
      }
    >;
  }> {
    const response = await api.get(`/admin/organizations/${organizationId}/limits`);
    return response.data.data;
  },

  /**
   * Update organization limit overrides
   */
  async updateOrganizationLimits(
    organizationId: string,
    limits: Record<string, number | null>
  ): Promise<{
    success: boolean;
    message: string;
    changes: Array<{ limit: string; from: number | null; to: number | null }>;
  }> {
    const response = await api.put(`/admin/organizations/${organizationId}/limits`, { limits });
    return response.data;
  },

  /**
   * Delete an organization permanently (System Admin only)
   * WARNING: This permanently deletes all organization data including recordings, files, and storage bucket
   */
  async deleteOrganization(organizationId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    const response = await api.delete(`/organizations/${organizationId}`);
    return response.data;
  },
};
