import api from './api';

export interface TaskTemplate {
  id: string;
  title: string;
  description?: string;
  category?: string;
  iconEmoji: string;
  organizationId?: string;
  type: 'recording' | 'live_demo' | 'hybrid';
  instructions?: string;
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  tags?: string[];
  evaluationCriteria?: {
    version: string;
    passingScore: number;
    scoringMethod: 'weighted' | 'equal';
    autoAnalyze: boolean;
    rubricSteps: Array<{
      id: string;
      order: number;
      title: string;
      description: string;
      evidenceType: 'speech' | 'visual' | 'both';
      weight: number;
      isRequired: boolean;
      speechCriteria?: {
        requiredKeywords: string[];
        requiredPhrases: string[];
        optionalKeywords?: string[];
        matchThreshold?: number;
      };
      visualCriteria?: {
        expectedElements: string[];
        expectedActions: string[];
      };
    }>;
  };
  isSystemDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  metadata?: {
    copiedFromSystemDefault?: string;
    [key: string]: any;
  };
}

export interface CreateTemplateDto {
  title: string;
  description?: string;
  category?: string;
  iconEmoji?: string;
  type: 'recording' | 'live_demo' | 'hybrid';
  instructions?: string;
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  tags?: string[];
}

export interface UpdateTemplateDto extends Partial<CreateTemplateDto> {}

class TemplateService {
  /**
   * Get all templates for the current organization
   * Returns org-owned templates (including copies of system defaults)
   * @param includeDrafts - If true, includes draft (inactive) templates
   */
  async getOrganizationTemplates(includeDrafts: boolean = false): Promise<TaskTemplate[]> {
    const params = includeDrafts ? { includeDrafts: 'true' } : {};
    const response = await api.get('/templates', { params });
    return response.data.data || [];
  }

  /**
   * Get a single template by ID
   */
  async getTemplate(id: string): Promise<TaskTemplate> {
    const response = await api.get(`/templates/${id}`);
    return response.data.data;
  }

  /**
   * Create a new template for the organization
   */
  async createTemplate(data: CreateTemplateDto): Promise<TaskTemplate> {
    const response = await api.post('/templates', data);
    return response.data.data;
  }

  /**
   * Update an existing template
   */
  async updateTemplate(id: string, data: UpdateTemplateDto): Promise<TaskTemplate> {
    const response = await api.put(`/templates/${id}`, data);
    return response.data.data;
  }

  /**
   * Delete a template (soft delete)
   */
  async deleteTemplate(id: string): Promise<void> {
    await api.delete(`/templates/${id}`);
  }

  /**
   * Get system defaults that can be restored (ones the org doesn't have)
   */
  async getRestorableDefaults(): Promise<TaskTemplate[]> {
    const response = await api.get('/templates/restorable');
    return response.data.data || [];
  }

  /**
   * Restore a system default template for the organization
   */
  async restoreDefault(systemDefaultId: string): Promise<TaskTemplate> {
    const response = await api.post('/templates/restore', { systemDefaultId });
    return response.data.data;
  }
}

export const templateService = new TemplateService();
export default templateService;
