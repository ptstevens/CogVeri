import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Lock } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import EmojiPicker from '../ui/EmojiPicker';
import RichTextEditor, { RichTextContent } from '../ui/RichTextEditor';
import { BackgroundRubricGenerationModal } from '../rubric/BackgroundRubricGenerationModal';
import { useSubscription } from '../../hooks/useBilling';
import {
  templateService,
  TaskTemplate,
  CreateTemplateDto,
  UpdateTemplateDto,
} from '../../services/template.service';

type DetailTab = 'details' | 'rubric';

interface TemplateManagementProps {
  organizationId: string;
  userRole?: string;
}

interface Message {
  type: 'success' | 'error';
  text: string;
  persistent?: boolean;
}

const TEMPLATE_TYPES = [
  { value: 'recording', label: 'Recording' },
  { value: 'live_demo', label: 'Live Demo' },
  { value: 'hybrid', label: 'Hybrid' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

// Tiers that have access to AI rubric generation
const AI_GENERATION_TIERS = ['enterprise'];

const TemplateManagement: React.FC<TemplateManagementProps> = ({ organizationId, userRole }) => {
  const navigate = useNavigate();
  const { data: subscription } = useSubscription();
  const canUseAiGeneration = subscription?.tier && AI_GENERATION_TIERS.includes(subscription.tier);

  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [restorableDefaults, setRestorableDefaults] = useState<TaskTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<Message | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('details');

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    iconEmoji: '📝',
    type: 'recording' as 'recording' | 'live_demo' | 'hybrid',
    instructions: '',
    minDurationSeconds: '60', // Default 1 minute
    maxDurationSeconds: '300', // Default 5 minutes
    priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
    tags: '',
  });

  const isAdmin = userRole === 'admin' || userRole === 'owner';

  const showMessage = (type: 'success' | 'error', text: string, persistent = false) => {
    setMessage({ type, text, persistent });
    if (!persistent) {
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const fetchTemplates = async () => {
    try {
      setIsLoading(true);
      // Include drafts so admins can see AI-generated templates pending review
      const data = await templateService.getOrganizationTemplates(true);
      setTemplates(data);
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setIsLoading(false);
    }
  };

  // Separate active templates from drafts (inactive templates)
  const activeTemplates = templates.filter((t) => t.isActive);
  const draftTemplates = templates.filter((t) => !t.isActive);

  useEffect(() => {
    fetchTemplates();
  }, [organizationId]);

  const fetchRestorableDefaults = async () => {
    if (!isAdmin) return;
    try {
      const data = await templateService.getRestorableDefaults();
      setRestorableDefaults(data);
    } catch (err) {
      // Silently fail - this is a secondary feature
    }
  };

  useEffect(() => {
    fetchRestorableDefaults();
  }, [isAdmin, templates]);

  const handleRestore = async (systemDefaultId: string) => {
    try {
      await templateService.restoreDefault(systemDefaultId);
      showMessage('success', 'Template restored successfully');
      await fetchTemplates();
      await fetchRestorableDefaults();
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to restore template', true);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      category: '',
      iconEmoji: '📝',
      type: 'recording',
      instructions: '',
      minDurationSeconds: '60', // Default 1 minute
      maxDurationSeconds: '300', // Default 5 minutes
      priority: 'medium',
      tags: '',
    });
  };

  const handleCreateOrUpdate = async () => {
    if (!formData.title.trim()) {
      showMessage('error', 'Template title is required');
      return;
    }

    try {
      const payload: CreateTemplateDto | UpdateTemplateDto = {
        title: formData.title,
        description: formData.description || undefined,
        category: formData.category || undefined,
        iconEmoji: formData.iconEmoji,
        type: formData.type,
        instructions: formData.instructions || undefined,
        minDurationSeconds: formData.minDurationSeconds
          ? Math.max(60, parseInt(formData.minDurationSeconds)) // Minimum 1 minute
          : 60, // Default to 1 minute if empty
        maxDurationSeconds: formData.maxDurationSeconds
          ? parseInt(formData.maxDurationSeconds)
          : 300, // Default to 5 minutes if empty
        priority: formData.priority,
        tags: formData.tags
          ? formData.tags
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
          : undefined,
      };

      if (editingId) {
        await templateService.updateTemplate(editingId, payload);
        showMessage('success', 'Template updated');
      } else {
        await templateService.createTemplate(payload as CreateTemplateDto);
        showMessage('success', 'Template created');
      }

      setShowCreateForm(false);
      setEditingId(null);
      resetForm();
      await fetchTemplates();
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to save template');
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!window.confirm('Are you sure you want to delete this template?')) {
      return;
    }

    try {
      await templateService.deleteTemplate(templateId);
      showMessage('success', 'Template deleted');
      setSelectedTemplate(null);
      await fetchTemplates();
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to delete template');
    }
  };

  const handleEditTemplate = (template: TaskTemplate) => {
    setSelectedTemplate(null);
    setEditingId(template.id);
    setFormData({
      title: template.title,
      description: template.description || '',
      category: template.category || '',
      iconEmoji: template.iconEmoji || '📝',
      type: template.type,
      instructions: template.instructions || '',
      minDurationSeconds: template.minDurationSeconds?.toString() || '',
      maxDurationSeconds: template.maxDurationSeconds?.toString() || '',
      priority: template.priority,
      tags: template.tags?.join(', ') || '',
    });
    setShowCreateForm(true);
  };

  const cancelEdit = () => {
    setShowCreateForm(false);
    setEditingId(null);
    resetForm();
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return null;
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
  };

  const isSystemCopy = (template: TaskTemplate): boolean => {
    return !!template.metadata?.copiedFromSystemDefault;
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'high':
        return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      default:
        return 'bg-green-100 text-green-700 border-green-200';
    }
  };

  // Simple card for the grid view
  const renderTemplateCard = (template: TaskTemplate) => (
    <button
      key={template.id}
      onClick={() => setSelectedTemplate(template)}
      className="text-left border rounded-xl p-5 bg-white hover:shadow-md hover:border-teal-300 transition-all duration-200 group"
    >
      <div className="flex items-start gap-4">
        <span className="text-3xl group-hover:scale-110 transition-transform">
          {template.iconEmoji}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-gray-900 truncate">{template.title}</h3>
            {isSystemCopy(template) && (
              <span className="shrink-0 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                Default
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span
              className={`text-xs px-2 py-0.5 rounded-full border ${getPriorityColor(template.priority)}`}
            >
              {template.priority}
            </span>
            {template.category && (
              <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">
                {template.category}
              </span>
            )}
            {(template.minDurationSeconds || template.maxDurationSeconds) && (
              <span className="text-xs text-gray-500">
                {formatDuration(template.minDurationSeconds)} -{' '}
                {formatDuration(template.maxDurationSeconds)}
              </span>
            )}
          </div>
        </div>
        <svg
          className="h-5 w-5 text-gray-400 group-hover:text-teal-500 transition-colors shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );

  // Detail modal with tabs
  const renderDetailModal = () => {
    if (!selectedTemplate) return null;

    const rubric = selectedTemplate.evaluationCriteria;
    const hasRubric = rubric && rubric.rubricSteps && rubric.rubricSteps.length > 0;

    return (
      <div className="fixed inset-0 z-50 overflow-hidden">
        <div
          className="absolute inset-0 bg-black/50 transition-opacity"
          onClick={() => {
            setSelectedTemplate(null);
            setActiveTab('details');
          }}
        />
        <div className="absolute inset-y-0 right-0 w-full max-w-2xl bg-white shadow-2xl overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b bg-gradient-to-r from-teal-50 to-white">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <span className="text-4xl">{selectedTemplate.iconEmoji}</span>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedTemplate.title}</h2>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${getPriorityColor(selectedTemplate.priority)}`}
                    >
                      {selectedTemplate.priority} priority
                    </span>
                    {selectedTemplate.category && (
                      <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">
                        {selectedTemplate.category}
                      </span>
                    )}
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {selectedTemplate.type.replace('_', ' ')}
                    </span>
                    {isSystemCopy(selectedTemplate) && (
                      <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <svg
                          className="h-3 w-3"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        System default
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedTemplate(null);
                  setActiveTab('details');
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg
                  className="h-5 w-5 text-gray-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mt-4 -mb-4">
              <button
                onClick={() => setActiveTab('details')}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                  activeTab === 'details'
                    ? 'bg-white text-teal-700 border-t border-l border-r border-gray-200'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                }`}
              >
                Details
              </button>
              <button
                onClick={() => setActiveTab('rubric')}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-2 ${
                  activeTab === 'rubric'
                    ? 'bg-white text-teal-700 border-t border-l border-r border-gray-200'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                }`}
              >
                Rubric
                {hasRubric && (
                  <span className="bg-teal-100 text-teal-700 text-xs px-1.5 py-0.5 rounded-full">
                    {rubric.rubricSteps.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {activeTab === 'details' ? (
              <>
                {/* Duration info */}
                {(selectedTemplate.minDurationSeconds || selectedTemplate.maxDurationSeconds) && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 px-4 py-2 rounded-lg">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span>
                      Recommended duration: {formatDuration(selectedTemplate.minDurationSeconds)} -{' '}
                      {formatDuration(selectedTemplate.maxDurationSeconds)}
                    </span>
                  </div>
                )}

                {/* Description */}
                {selectedTemplate.description && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                      Description
                    </h3>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <RichTextContent
                        content={selectedTemplate.description}
                        className="text-gray-700"
                      />
                    </div>
                  </div>
                )}

                {/* Instructions */}
                {selectedTemplate.instructions && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                      Recording Instructions
                    </h3>
                    <div className="bg-white border rounded-lg p-5 prose prose-sm max-w-none prose-headings:text-gray-900 prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-p:my-2 prose-table:text-sm prose-th:bg-gray-50 prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2 prose-blockquote:border-teal-500 prose-blockquote:bg-teal-50 prose-blockquote:py-1 prose-blockquote:not-italic">
                      <RichTextContent content={selectedTemplate.instructions} />
                    </div>
                  </div>
                )}

                {/* Tags */}
                {selectedTemplate.tags && selectedTemplate.tags.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                      Tags
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedTemplate.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="text-sm bg-gray-100 text-gray-600 px-3 py-1 rounded-full"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Rubric Tab */
              <div className="space-y-4">
                {hasRubric ? (
                  <>
                    {/* Rubric Summary */}
                    <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium text-teal-900">Evaluation Settings</h3>
                          <p className="text-sm text-teal-700 mt-1">
                            {rubric.rubricSteps.length} steps • Passing score: {rubric.passingScore}
                            %
                          </p>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-teal-700">
                          <span className="flex items-center gap-1">
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"
                              />
                            </svg>
                            {rubric.scoringMethod}
                          </span>
                          {rubric.autoAnalyze && (
                            <span className="flex items-center gap-1">
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M13 10V3L4 14h7v7l9-11h-7z"
                                />
                              </svg>
                              Auto-analyze
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Rubric Steps */}
                    <div className="space-y-3">
                      {rubric.rubricSteps.map((step) => (
                        <div
                          key={step.id}
                          className="bg-white border rounded-lg p-4 hover:border-gray-300 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <span className="flex-shrink-0 w-7 h-7 bg-gray-100 text-gray-700 rounded-full flex items-center justify-center text-sm font-medium">
                              {step.order}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-medium text-gray-900">{step.title}</h4>
                                {step.isRequired && (
                                  <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                                    Required
                                  </span>
                                )}
                                <span className="text-xs text-gray-500">
                                  Weight: {step.weight}/10
                                </span>
                              </div>
                              <p className="text-sm text-gray-600 mb-3">{step.description}</p>

                              {/* Evidence Type Badge */}
                              <div className="flex items-center gap-2 mb-2">
                                <span
                                  className={`text-xs px-2 py-1 rounded-full ${
                                    step.evidenceType === 'speech'
                                      ? 'bg-blue-100 text-blue-700'
                                      : step.evidenceType === 'visual'
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-purple-100 text-purple-700'
                                  }`}
                                >
                                  {step.evidenceType === 'both'
                                    ? '🎤 Speech + 👁 Visual'
                                    : step.evidenceType === 'speech'
                                      ? '🎤 Speech'
                                      : '👁 Visual'}
                                </span>
                              </div>

                              {/* Speech Criteria */}
                              {step.speechCriteria &&
                                (step.evidenceType === 'speech' ||
                                  step.evidenceType === 'both') && (
                                  <div className="bg-blue-50 rounded p-3 text-sm mb-2">
                                    {step.speechCriteria.requiredKeywords?.length > 0 && (
                                      <div className="mb-2">
                                        <span className="text-blue-700 font-medium text-xs uppercase">
                                          Keywords:
                                        </span>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                          {step.speechCriteria.requiredKeywords.map((kw, i) => (
                                            <span
                                              key={i}
                                              className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs"
                                            >
                                              {kw}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {step.speechCriteria.optionalKeywords &&
                                      step.speechCriteria.optionalKeywords.length > 0 && (
                                        <div>
                                          <span className="text-blue-600 font-medium text-xs uppercase">
                                            Optional:
                                          </span>
                                          <div className="flex flex-wrap gap-1 mt-1">
                                            {step.speechCriteria.optionalKeywords.map((kw, i) => (
                                              <span
                                                key={i}
                                                className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-xs border border-blue-200"
                                              >
                                                {kw}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                  </div>
                                )}

                              {/* Visual Criteria */}
                              {step.visualCriteria &&
                                (step.evidenceType === 'visual' ||
                                  step.evidenceType === 'both') && (
                                  <div className="bg-green-50 rounded p-3 text-sm">
                                    {step.visualCriteria.expectedElements?.length > 0 && (
                                      <div className="mb-2">
                                        <span className="text-green-700 font-medium text-xs uppercase">
                                          Elements:
                                        </span>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                          {step.visualCriteria.expectedElements.map((el, i) => (
                                            <span
                                              key={i}
                                              className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs"
                                            >
                                              {el}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {step.visualCriteria.expectedActions?.length > 0 && (
                                      <div>
                                        <span className="text-green-700 font-medium text-xs uppercase">
                                          Actions:
                                        </span>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                          {step.visualCriteria.expectedActions.map((act, i) => (
                                            <span
                                              key={i}
                                              className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs"
                                            >
                                              {act}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-12">
                    <svg
                      className="mx-auto h-12 w-12 text-gray-300"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                      />
                    </svg>
                    <h3 className="mt-4 text-lg font-medium text-gray-900">No rubric defined</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      This template doesn't have evaluation criteria yet.
                    </p>
                    {isAdmin && (
                      <Button
                        variant="primary"
                        size="sm"
                        className="mt-4"
                        onClick={() => navigate(`/templates/${selectedTemplate.id}/rubric`)}
                      >
                        Create Rubric
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer actions */}
          {isAdmin && (
            <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleEditTemplate(selectedTemplate)}
                >
                  <svg
                    className="h-4 w-4 mr-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                  Edit Template
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate(`/templates/${selectedTemplate.id}/rubric`)}
                >
                  <svg
                    className="h-4 w-4 mr-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                    />
                  </svg>
                  Edit Rubric
                </Button>
              </div>
              <button
                onClick={() => handleDelete(selectedTemplate.id)}
                className="text-red-600 hover:text-red-700 text-sm font-medium flex items-center gap-1"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">Loading templates...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`p-4 rounded-md flex justify-between items-start ${
            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          <div className="flex items-start gap-2">
            {message.type === 'error' && (
              <svg
                className="h-5 w-5 flex-shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            )}
            <span>{message.text}</span>
          </div>
          {message.persistent && (
            <button
              onClick={() => setMessage(null)}
              className="text-current opacity-70 hover:opacity-100 ml-4"
              aria-label="Dismiss message"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      )}

      <Card
        title="Task Templates"
        subtitle="Click a template to view details. Templates define how tasks are created and evaluated."
        actions={
          isAdmin && !showCreateForm ? (
            <div className="flex gap-2">
              {canUseAiGeneration ? (
                <Button variant="secondary" size="sm" onClick={() => setShowVideoModal(true)}>
                  <Sparkles className="w-4 h-4 mr-1.5" />
                  Create from Video
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled
                  title="Upgrade to Pro to use AI generation"
                >
                  <Lock className="w-4 h-4 mr-1.5" />
                  Create from Video
                </Button>
              )}
              <Button variant="primary" size="sm" onClick={() => setShowCreateForm(true)}>
                Create Template
              </Button>
            </div>
          ) : null
        }
      >
        {!isAdmin && (
          <div className="mb-4 p-3 bg-yellow-50 text-yellow-700 text-sm rounded flex items-center gap-2">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Only organization owners and admins can create or edit templates.
          </div>
        )}

        {showCreateForm && (
          <div className="mb-6 border rounded-lg p-4 bg-blue-50">
            <h3 className="font-semibold mb-4 text-gray-900">
              {editingId ? 'Edit Template' : 'Create New Template'}
            </h3>

            <div className="space-y-4">
              {/* Title and Icon */}
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Icon</label>
                  <EmojiPicker
                    value={formData.iconEmoji}
                    onChange={(emoji) => setFormData({ ...formData, iconEmoji: emoji })}
                  />
                </div>
                <div className="col-span-10">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Product Demo Recording"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Brief description of the template"
                  rows={2}
                />
              </div>

              {/* Type, Priority, Category */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {TEMPLATE_TYPES.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {PRIORITY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Demo, Support"
                  />
                </div>
              </div>

              {/* Duration */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Min Duration (seconds)
                  </label>
                  <input
                    type="number"
                    value={formData.minDurationSeconds}
                    onChange={(e) =>
                      setFormData({ ...formData, minDurationSeconds: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="60 (1 minute)"
                    min="60"
                  />
                  <p className="text-xs text-gray-500 mt-1">Minimum: 60 seconds (1 minute)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Duration (seconds)
                  </label>
                  <input
                    type="number"
                    value={formData.maxDurationSeconds}
                    onChange={(e) =>
                      setFormData({ ...formData, maxDurationSeconds: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="300 (5 minutes)"
                    min="60"
                  />
                  <p className="text-xs text-gray-500 mt-1">e.g., 300 = 5 minutes</p>
                </div>
              </div>

              {/* Instructions - Rich Text Editor */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Instructions for Contributors
                </label>
                <RichTextEditor
                  content={formData.instructions}
                  onChange={(content) => setFormData({ ...formData, instructions: content })}
                  placeholder="Detailed instructions that will be shown to the contributor when they receive a task with this template..."
                  minHeight="150px"
                />
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., demo, product, walkthrough"
                />
              </div>

              {/* Form Actions */}
              <div className="flex gap-2 pt-4">
                <Button variant="primary" onClick={handleCreateOrUpdate}>
                  {editingId ? 'Update Template' : 'Create Template'}
                </Button>
                <Button variant="secondary" onClick={cancelEdit}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Draft Templates Section - AI-generated templates pending review */}
        {draftTemplates.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">✨</span>
              <h3 className="text-md font-semibold text-amber-700">Drafts Pending Review</h3>
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                {draftTemplates.length} {draftTemplates.length === 1 ? 'template' : 'templates'}
              </span>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              These AI-generated templates need review before they can be used. Click on a template
              to review and activate it.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {draftTemplates.map((template) => (
                <div
                  key={template.id}
                  className="relative border-2 border-dashed border-amber-300 bg-amber-50 rounded-lg cursor-pointer hover:border-amber-400 hover:bg-amber-100 transition-colors"
                  onClick={() => navigate(`/templates/${template.id}/rubric`)}
                >
                  <div className="absolute top-2 right-2">
                    <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-medium">
                      Draft
                    </span>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{template.iconEmoji || '📋'}</span>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-gray-900 truncate">{template.title}</h4>
                        {template.description && (
                          <p className="text-sm text-gray-500 line-clamp-2 mt-1">
                            {template.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                            {template.evaluationCriteria?.rubricSteps?.length || 0} steps
                          </span>
                          <span className="text-xs text-gray-400">
                            Created {new Date(template.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active Templates Section */}
        {activeTemplates.length === 0 && draftTemplates.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-4">
              No templates yet. Templates help you quickly create tasks with pre-filled settings.
            </p>
            {isAdmin && (
              <Button variant="primary" onClick={() => setShowCreateForm(true)}>
                Create Your First Template
              </Button>
            )}
          </div>
        ) : activeTemplates.length > 0 ? (
          <>
            {draftTemplates.length > 0 && (
              <h3 className="text-md font-semibold text-gray-700 mb-3">Active Templates</h3>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              {activeTemplates.map(renderTemplateCard)}
            </div>
          </>
        ) : null}
      </Card>

      {/* Restore Default Templates Section */}
      {isAdmin && restorableDefaults.length > 0 && (
        <Card
          title="Restore Default Templates"
          subtitle="These system templates can be added to your organization."
        >
          <div className="grid gap-3 md:grid-cols-3">
            {restorableDefaults.map((template) => (
              <div
                key={template.id}
                className="border border-dashed border-gray-300 rounded-lg p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{template.iconEmoji}</span>
                  <span className="font-medium text-gray-700">{template.title}</span>
                </div>
                <button
                  onClick={() => handleRestore(template.id)}
                  className="w-full px-3 py-1.5 text-sm bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 hover:border-gray-400 transition-colors flex items-center justify-center gap-1"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Add to My Templates
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Detail Modal */}
      {renderDetailModal()}

      {/* Generate from Video Modal (Background Processing) */}
      <BackgroundRubricGenerationModal
        isOpen={showVideoModal}
        onClose={() => setShowVideoModal(false)}
        onQueued={() => {
          // Template will be created in background - no immediate refresh needed
          // User will be notified when ready and can refresh the page
          // Note: Don't close modal here - let the success state show first
          // User will close via "Got it" button which triggers handleSuccessClose
        }}
      />
    </div>
  );
};

export default TemplateManagement;
