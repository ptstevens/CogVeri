import React, { useState, useCallback, useMemo } from 'react';
import {
  Link as LinkIcon,
  Copy,
  Check,
  Mail,
  FileText,
  ClipboardList,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Plus,
  ExternalLink,
  Sparkles,
  AlertCircle,
  Calendar,
  Flag,
  Video,
  CheckCircle2,
  FileEdit,
  LayoutTemplate,
  ArrowRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Modal } from '../ui';
import RichTextEditor from '../ui/RichTextEditor';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { taskService, CreateTaskDto } from '../../services/task.service';
import { magicLinkService, ExternalContributor } from '../../services/magicLink.service';
import { TaskTemplate } from '../../services/template.service';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { marked } from 'marked';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'start' | 'select-template' | 'form';
type TabId = 'details' | 'rubric' | 'send';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

// Extended template with rubric info - types must match TaskTemplate
interface TemplateWithRubric extends TaskTemplate {
  evaluationCriteria?: {
    version: string;
    rubricSteps: Array<{
      id: string;
      order: number;
      title: string;
      description: string;
      evidenceType: 'speech' | 'visual' | 'both';
      weight: number;
      isRequired: boolean;
    }>;
    passingScore: number;
    scoringMethod: 'weighted' | 'equal';
    autoAnalyze: boolean;
  };
}

// Success screen shown after task creation
const LinkSuccessScreen: React.FC<{
  generatedLink: string;
  externalEmail: string;
  linkExpiryDays: number;
  onClose: () => void;
}> = ({ generatedLink, externalEmail, linkExpiryDays, onClose }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal isOpen={true} onClose={onClose} title="Task Created!" size="md" closeOnBackdrop={false}>
      <div className="space-y-5">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Check className="h-5 w-5 text-green-600" />
            <p className="font-semibold text-green-900">Magic Link Generated</p>
          </div>
          <p className="text-sm text-green-700">
            Ready to share with <strong>{externalEmail}</strong>
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Share this link:</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={generatedLink}
              readOnly
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 font-mono text-sm"
            />
            <button
              onClick={handleCopy}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
          <p>
            Link expires in <strong>{linkExpiryDays} days</strong>
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
};

// Rubric preview component
const RubricPreview: React.FC<{
  template: TemplateWithRubric;
  expanded: boolean;
  onToggle: () => void;
}> = ({ template, expanded, onToggle }) => {
  const rubric = template.evaluationCriteria;
  const stepCount = rubric?.rubricSteps?.length || 0;

  if (!rubric || stepCount === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">No rubric defined</p>
            <p className="text-sm text-amber-700 mt-1">
              This template doesn't have evaluation criteria yet. Add a rubric to enable AI-powered
              analysis.
            </p>
            <Link
              to={`/templates/${template.id}/rubric`}
              className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium text-amber-700 hover:text-amber-800"
            >
              <Plus className="w-4 h-4" />
              Create Rubric
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-white" />
          </div>
          <div className="text-left">
            <p className="font-medium text-gray-900">{stepCount} Evaluation Steps</p>
            <p className="text-sm text-gray-500">
              Passing score: {rubric.passingScore}% •{' '}
              {rubric.autoAnalyze ? 'Auto-analyze enabled' : 'Manual analysis'}
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronRight className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-gray-200">
          <div className="divide-y divide-gray-100">
            {rubric.rubricSteps.map((step, index) => (
              <div key={step.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-semibold flex items-center justify-center">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 truncate">{step.title}</p>
                      {step.isRequired && (
                        <span className="px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded">
                          Required
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{step.description}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                      <span className="capitalize">{step.evidenceType} evidence</span>
                      <span>Weight: {step.weight}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 bg-gray-50 border-t border-gray-200">
            <Link
              to={`/templates/${template.id}/rubric`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700"
            >
              Edit Rubric
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

const CreateTaskModal: React.FC<CreateTaskModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Step state for the wizard
  const [currentStep, setCurrentStep] = useState<Step>('start');

  // Tab state (for form step)
  const [activeTab, setActiveTab] = useState<TabId>('details');

  // Form state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [externalEmail, setExternalEmail] = useState('');
  const [linkExpiryDays, setLinkExpiryDays] = useState(30);
  const [generatedLink, setGeneratedLink] = useState<string>('');
  const [searchContributor, setSearchContributor] = useState('');
  const [rubricExpanded, setRubricExpanded] = useState(true);

  const [formData, setFormData] = useState<CreateTaskDto>({
    title: '',
    description: '',
    type: 'recording',
    priority: 'medium',
    assigned_to: '',
    reviewed_by: '',
    due_date: '',
    estimated_duration: undefined,
    tags: [],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const tabs: Tab[] = [
    { id: 'details', label: 'Details', icon: <FileText className="w-4 h-4" /> },
    { id: 'rubric', label: 'Rubric', icon: <ClipboardList className="w-4 h-4" /> },
    { id: 'send', label: 'Send to', icon: <Mail className="w-4 h-4" /> },
  ];

  // Fetch templates with rubric data
  const { data: templates = [], isLoading: templatesLoading } = useQuery<TemplateWithRubric[]>({
    queryKey: ['templates-with-rubrics'],
    queryFn: async () => {
      const response = await api.get('/templates');
      return response.data.data || [];
    },
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch full template when selected
  const { data: selectedTemplateData } = useQuery<TemplateWithRubric>({
    queryKey: ['template', selectedTemplateId],
    queryFn: async () => {
      const response = await api.get(`/templates/${selectedTemplateId}`);
      return response.data.data;
    },
    enabled: !!selectedTemplateId && isOpen,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch contributor suggestions
  const { data: contributors } = useQuery({
    queryKey: ['external-contributors', searchContributor],
    queryFn: () => magicLinkService.getExternalContributors(searchContributor, 5),
    enabled: isOpen && searchContributor.length > 2,
    staleTime: 3 * 60 * 1000,
  });

  // Get selected template with rubric data
  const selectedTemplate = useMemo(() => {
    return selectedTemplateData || templates.find((t) => t.id === selectedTemplateId);
  }, [templates, selectedTemplateId, selectedTemplateData]);

  // Handle template selection - pre-fill form
  const handleTemplateSelect = useCallback(
    (templateId: string) => {
      setSelectedTemplateId(templateId);
      const template = templates.find((t) => t.id === templateId);

      if (template) {
        // Convert markdown instructions to HTML for the rich text editor
        const instructionsHtml = template.instructions
          ? (marked.parse(template.instructions, { async: false }) as string)
          : '';

        setFormData((prev) => ({
          ...prev,
          title: template.title,
          description: instructionsHtml,
          type: template.type,
          priority: template.priority,
          tags: template.tags || [],
          estimated_duration: template.minDurationSeconds
            ? Math.max(1, Math.ceil(template.minDurationSeconds / 60)) // Round up, minimum 1 minute
            : undefined,
        }));
        // Go to form step
        setCurrentStep('form');
      }
    },
    [templates]
  );

  // Start with blank canvas
  const handleStartBlank = useCallback(() => {
    setSelectedTemplateId('');
    setFormData({
      title: '',
      description: '',
      type: 'recording',
      priority: 'medium',
      assigned_to: '',
      reviewed_by: '',
      due_date: '',
      estimated_duration: undefined,
      tags: [],
    });
    setCurrentStep('form');
  }, []);

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: async (data: CreateTaskDto) => {
      // Include template_id if one was selected
      const taskData = selectedTemplateId ? { ...data, template_id: selectedTemplateId } : data;

      const task = await taskService.createTask(taskData);

      // Create magic link for external contributor
      if (externalEmail) {
        const magicLink = await magicLinkService.createMagicLink({
          taskId: task.id,
          email: externalEmail,
          expiresInDays: linkExpiryDays,
        });
        return { task, magicLink };
      }

      return { task, magicLink: null };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task-statistics'] });

      if (data.magicLink) {
        setGeneratedLink(data.magicLink.url);
      } else {
        handleClose();
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create task');
    },
  });

  // Reset form
  const resetForm = useCallback(() => {
    setCurrentStep('start');
    setActiveTab('details');
    setSelectedTemplateId('');
    setExternalEmail('');
    setLinkExpiryDays(30);
    setGeneratedLink('');
    setSearchContributor('');
    setRubricExpanded(true);
    setFormData({
      title: '',
      description: '',
      type: 'recording',
      priority: 'medium',
      assigned_to: '',
      reviewed_by: '',
      due_date: '',
      estimated_duration: undefined,
      tags: [],
    });
    setErrors({});
  }, []);

  const handleClose = useCallback(() => {
    onClose();
    resetForm();
  }, [onClose, resetForm]);

  // Validate form
  const validateForm = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (!selectedTemplateId) {
      newErrors.template = 'Please select a template with a rubric to enable video analysis';
    }

    if (!externalEmail.trim()) {
      newErrors.externalEmail = 'Email is required';
    } else if (!/^\S+@\S+\.\S+$/.test(externalEmail)) {
      newErrors.externalEmail = 'Please enter a valid email address';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData.title, externalEmail, selectedTemplateId]);

  // Handle submit
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      if (validateForm()) {
        const submitData = {
          ...formData,
          assigned_to: user!.id,
        };
        createTaskMutation.mutate(submitData);
      }
    },
    [formData, validateForm, user, createTaskMutation]
  );

  // Handle contributor selection
  const handleSelectContributor = useCallback((contributor: ExternalContributor) => {
    setExternalEmail(contributor.email);
    setSearchContributor('');
  }, []);

  // Navigate to next tab
  const goToNextTab = () => {
    const currentIndex = tabs.findIndex((t) => t.id === activeTab);
    if (currentIndex < tabs.length - 1) {
      setActiveTab(tabs[currentIndex + 1].id);
    }
  };

  // Check if tab has content/is valid
  const getTabStatus = (tabId: TabId): 'complete' | 'incomplete' | 'current' => {
    if (tabId === activeTab) return 'current';
    if (tabId === 'details') {
      return formData.title.trim() ? 'complete' : 'incomplete';
    }
    if (tabId === 'rubric') {
      return selectedTemplateId ? 'complete' : 'incomplete';
    }
    if (tabId === 'send') {
      return externalEmail.trim() && /^\S+@\S+\.\S+$/.test(externalEmail)
        ? 'complete'
        : 'incomplete';
    }
    return 'incomplete';
  };

  // Show success screen if link generated
  if (generatedLink) {
    return (
      <LinkSuccessScreen
        generatedLink={generatedLink}
        externalEmail={externalEmail}
        linkExpiryDays={linkExpiryDays}
        onClose={handleClose}
      />
    );
  }

  // Render the "Start From" step
  const renderStartStep = () => (
    <div className="py-4">
      <h2 className="text-xl font-semibold text-gray-900 mb-2">Create New Task</h2>
      <p className="text-gray-600 mb-8">How would you like to start?</p>

      <div className="grid grid-cols-2 gap-4">
        {/* Blank Canvas Option */}
        <button
          onClick={handleStartBlank}
          className="group relative flex flex-col items-center p-6 rounded-xl border-2 border-gray-200 hover:border-primary-400 hover:bg-primary-50 transition-all text-center"
        >
          <div className="w-16 h-16 rounded-full bg-gray-100 group-hover:bg-primary-100 flex items-center justify-center mb-4 transition-colors">
            <FileEdit className="w-8 h-8 text-gray-500 group-hover:text-primary-600" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">Start from Scratch</h3>
          <p className="text-sm text-gray-500">Create a custom task with your own instructions</p>
          <ArrowRight className="absolute bottom-4 right-4 w-5 h-5 text-gray-300 group-hover:text-primary-500 transition-colors" />
        </button>

        {/* Template Option */}
        <button
          onClick={() => setCurrentStep('select-template')}
          className="group relative flex flex-col items-center p-6 rounded-xl border-2 border-gray-200 hover:border-primary-400 hover:bg-primary-50 transition-all text-center"
        >
          <div className="w-16 h-16 rounded-full bg-gray-100 group-hover:bg-primary-100 flex items-center justify-center mb-4 transition-colors">
            <LayoutTemplate className="w-8 h-8 text-gray-500 group-hover:text-primary-600" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">Use a Template</h3>
          <p className="text-sm text-gray-500">Start with a pre-built template and rubric</p>
          {templates.length > 0 && (
            <span className="absolute top-4 right-4 bg-primary-100 text-primary-700 text-xs font-medium px-2 py-0.5 rounded-full">
              {templates.length} available
            </span>
          )}
          <ArrowRight className="absolute bottom-4 right-4 w-5 h-5 text-gray-300 group-hover:text-primary-500 transition-colors" />
        </button>
      </div>

      <div className="mt-6 text-center">
        <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">
          Cancel
        </button>
      </div>
    </div>
  );

  // Render template selection step
  const renderTemplateSelectionStep = () => (
    <div className="py-2">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => setCurrentStep('start')}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-gray-500" />
        </button>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Choose a Template</h2>
          <p className="text-sm text-gray-500">Select a template to use as a starting point</p>
        </div>
      </div>

      {templatesLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
          <LayoutTemplate className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="font-medium text-gray-900 mb-2">No templates yet</h3>
          <p className="text-sm text-gray-500 mb-4">
            Create templates in Settings to reuse task configurations
          </p>
          <Link
            to="/organizations/settings?tab=templates"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            <Plus className="w-4 h-4" />
            Create Template
          </Link>
        </div>
      ) : (
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
          {templates.map((template) => {
            const hasRubric =
              template.evaluationCriteria?.rubricSteps &&
              template.evaluationCriteria.rubricSteps.length > 0;
            const stepCount = template.evaluationCriteria?.rubricSteps?.length || 0;

            return (
              <button
                key={template.id}
                type="button"
                onClick={() => handleTemplateSelect(template.id)}
                className="w-full flex items-start gap-4 p-4 rounded-xl border-2 border-gray-200 hover:border-primary-400 hover:bg-primary-50 transition-all text-left group"
              >
                <span className="text-3xl flex-shrink-0">{template.iconEmoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">{template.title}</h3>
                    {template.category && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {template.category}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 line-clamp-2 mb-2">
                    {template.description || 'No description'}
                  </p>
                  <div className="flex items-center gap-3">
                    {hasRubric ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-full">
                        <Sparkles className="w-3 h-3" />
                        {stepCount} rubric steps
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded-full">
                        <AlertCircle className="w-3 h-3" />
                        No rubric
                      </span>
                    )}
                    <span className="text-xs text-gray-400">{template.type.replace('_', ' ')}</span>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-primary-500 transition-colors flex-shrink-0 mt-2" />
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between pt-5 mt-5 border-t border-gray-200">
        <button
          type="button"
          onClick={() => setCurrentStep('start')}
          className="px-4 py-2 text-gray-600 hover:text-gray-900 flex items-center gap-2"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <button
          type="button"
          onClick={handleStartBlank}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          or start from scratch
        </button>
      </div>
    </div>
  );

  // Render the main form step
  const renderFormStep = () => (
    <form onSubmit={handleSubmit} className="flex flex-col">
      {/* Header with back button and template indicator */}
      <div className="-mt-2 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <button
            type="button"
            onClick={() => {
              setCurrentStep('start');
              setSelectedTemplateId('');
            }}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-500" />
          </button>
          <h2 className="text-xl font-semibold text-gray-900">
            {selectedTemplate ? 'Customize Task' : 'Create Task'}
          </h2>
        </div>

        {/* Show selected template badge */}
        {selectedTemplate && (
          <div className="flex items-center gap-2 px-3 py-2 bg-primary-50 border border-primary-200 rounded-lg mb-4">
            <span className="text-xl">{selectedTemplate.iconEmoji}</span>
            <div className="flex-1">
              <span className="text-sm font-medium text-primary-900">
                Using: {selectedTemplate.title}
              </span>
              <p className="text-xs text-primary-600">Edit below to customize for this task</p>
            </div>
            <button
              type="button"
              onClick={() => setCurrentStep('select-template')}
              className="text-xs text-primary-700 hover:text-primary-900 font-medium"
            >
              Change
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {tabs.map((tab) => {
            const status = getTabStatus(tab.id);
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                  status === 'current'
                    ? 'border-primary-500 text-primary-600'
                    : status === 'complete'
                      ? 'border-transparent text-gray-600 hover:text-gray-900'
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                <span className="relative">
                  {tab.icon}
                  {status === 'complete' && tab.id !== activeTab && (
                    <CheckCircle2 className="w-3 h-3 text-green-500 absolute -top-1 -right-1 bg-white rounded-full" />
                  )}
                </span>
                <span className="text-sm font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1">
        {/* Details Tab */}
        {activeTab === 'details' && (
          <div className="space-y-5">
            {/* Task Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Task Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, title: e.target.value }));
                  if (errors.title) setErrors((prev) => ({ ...prev, title: '' }));
                }}
                className={`w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                  errors.title ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="e.g., Record product demo for onboarding"
              />
              {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title}</p>}
            </div>

            {/* Instructions - Rich Text Editor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Instructions for Contributor
              </label>
              <RichTextEditor
                content={formData.description || ''}
                onChange={(content) => setFormData((prev) => ({ ...prev, description: content }))}
                placeholder="Describe what the contributor should do, include any specific requirements..."
                minHeight="120px"
              />
            </div>

            {/* Task Settings Row */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Video className="w-4 h-4 inline mr-1" />
                  Type
                </label>
                <select
                  value={formData.type}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, type: e.target.value as any }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                >
                  <option value="recording">Recording</option>
                  <option value="live_demo">Live Demo</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Flag className="w-4 h-4 inline mr-1" />
                  Priority
                </label>
                <select
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, priority: e.target.value as any }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  Due Date
                </label>
                <input
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData((prev) => ({ ...prev, due_date: e.target.value }))}
                  min={new Date().toISOString().slice(0, 10)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
              </div>
            </div>
          </div>
        )}

        {/* Rubric Tab */}
        {activeTab === 'rubric' && (
          <div className="space-y-5">
            {selectedTemplate ? (
              <>
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{selectedTemplate.iconEmoji}</span>
                    <div>
                      <p className="font-medium text-gray-900">{selectedTemplate.title}</p>
                      <p className="text-sm text-gray-500">
                        This task will use the rubric from this template
                      </p>
                    </div>
                  </div>
                </div>

                <RubricPreview
                  template={selectedTemplate}
                  expanded={rubricExpanded}
                  onToggle={() => setRubricExpanded(!rubricExpanded)}
                />
              </>
            ) : (
              <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                <AlertCircle className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                <h3 className="font-medium text-gray-900 mb-2">No template selected</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Select a template to include a rubric for AI-powered analysis
                </p>
                <button
                  type="button"
                  onClick={() => setCurrentStep('select-template')}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary-100 text-primary-700 rounded-lg hover:bg-primary-200 transition font-medium text-sm"
                >
                  <LayoutTemplate className="w-4 h-4" />
                  Choose Template
                </button>
              </div>
            )}
          </div>
        )}

        {/* Send Tab */}
        {activeTab === 'send' && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-medium text-gray-900 mb-1">Send to Contributor</h3>
              <p className="text-sm text-gray-500">
                Enter the email address of the person who will complete this task. They'll receive a
                magic link to access the recording interface.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Contributor Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={externalEmail}
                    onChange={(e) => {
                      setExternalEmail(e.target.value);
                      setSearchContributor(e.target.value);
                      if (errors.externalEmail)
                        setErrors((prev) => ({ ...prev, externalEmail: '' }));
                    }}
                    className={`w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                      errors.externalEmail ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="contributor@example.com"
                  />
                </div>
                {errors.externalEmail && (
                  <p className="mt-1 text-sm text-red-600">{errors.externalEmail}</p>
                )}

                {/* Contributor suggestions */}
                {contributors && contributors.length > 0 && searchContributor && (
                  <div className="mt-2 border border-gray-200 rounded-lg bg-white shadow-sm max-h-32 overflow-y-auto">
                    <p className="px-3 py-1 text-xs text-gray-500 bg-gray-50">
                      Previous contributors:
                    </p>
                    {contributors.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelectContributor(c)}
                        className="w-full px-3 py-2 text-left hover:bg-blue-50 text-sm border-b last:border-b-0"
                      >
                        <span className="font-medium">
                          {c.first_name} {c.last_name}
                        </span>
                        <span className="text-gray-500 ml-2">{c.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Link Expiry */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Link Expires In
                </label>
                <select
                  value={linkExpiryDays}
                  onChange={(e) => setLinkExpiryDays(parseInt(e.target.value))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days (recommended)</option>
                  <option value={60}>60 days</option>
                  <option value={90}>90 days</option>
                </select>
              </div>
            </div>

            {/* Summary Card */}
            {formData.title && externalEmail && (
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h4 className="text-sm font-medium text-gray-900 mb-3">Task Summary</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Title:</span>
                    <span className="font-medium text-gray-900 truncate max-w-[200px]">
                      {formData.title}
                    </span>
                  </div>
                  {selectedTemplate && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Template:</span>
                      <span className="font-medium text-gray-900">
                        {selectedTemplate.iconEmoji} {selectedTemplate.title}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500">Send to:</span>
                    <span className="font-medium text-gray-900">{externalEmail}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Expires:</span>
                    <span className="font-medium text-gray-900">{linkExpiryDays} days</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center pt-5 mt-5 border-t border-gray-200">
        <button
          type="button"
          onClick={onClose}
          className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>

        <div className="flex items-center gap-3">
          {activeTab !== 'send' && (
            <button
              type="button"
              onClick={goToNextTab}
              className="px-5 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          )}

          {activeTab === 'send' && (
            <div className="flex items-center gap-3">
              {errors.template && <p className="text-sm text-red-600">{errors.template}</p>}
              <button
                type="submit"
                disabled={
                  createTaskMutation.isPending ||
                  !formData.title ||
                  !externalEmail ||
                  !selectedTemplateId
                }
                className="px-5 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {createTaskMutation.isPending ? (
                  'Creating...'
                ) : (
                  <>
                    <LinkIcon className="h-4 w-4" />
                    Create & Generate Link
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </form>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" size={currentStep === 'form' ? 'lg' : 'md'}>
      {currentStep === 'start' && renderStartStep()}
      {currentStep === 'select-template' && renderTemplateSelectionStep()}
      {currentStep === 'form' && renderFormStep()}
    </Modal>
  );
};

export default CreateTaskModal;
