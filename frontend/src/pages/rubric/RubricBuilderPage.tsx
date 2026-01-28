import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, RotateCcw, Settings, Sparkles, Lock, CheckCircle, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { RubricBuilderProvider, useRubricBuilder } from '../../components/rubric/RubricBuilderProvider';
import { RubricStepList } from '../../components/rubric/RubricStepList';
import { GenerateRubricModal } from '../../components/rubric/GenerateRubricModal';
import { EvaluationCriteria, RubricStep, TaskRequirements } from '../../types/rubric.types';
import { useSubscription } from '../../hooks/useBilling';
import api from '../../services/api';

// Tiers that have access to AI rubric generation
const AI_GENERATION_TIERS = ['enterprise'];

function RubricBuilderContent() {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { state, updateMetadata, validateRubric, setCriteria } = useRubricBuilder();

  // AI Generation modal state
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);

  // Check subscription tier for feature gating
  const { data: subscription } = useSubscription();
  const canUseAiGeneration = subscription?.tier && AI_GENERATION_TIERS.includes(subscription.tier);

  // Fetch template with existing rubric
  const { data: template, isLoading } = useQuery({
    queryKey: ['template', templateId],
    queryFn: async () => {
      const response = await api.get(`/templates/${templateId}`);
      return response.data.data;
    },
    enabled: !!templateId,
  });

  // Load existing evaluation criteria
  useEffect(() => {
    if (template?.evaluationCriteria) {
      setCriteria(template.evaluationCriteria);
    }
  }, [template, setCriteria]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (criteria: EvaluationCriteria) => {
      return api.put(`/templates/${templateId}`, {
        evaluationCriteria: criteria,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template', templateId] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to save rubric');
    },
  });

  const handleSave = () => {
    if (!validateRubric()) {
      toast.error('Please fix validation errors before saving');
      return;
    }
    saveMutation.mutate(state.evaluationCriteria);
  };

  const handleDiscard = () => {
    if (state.isDirty) {
      if (window.confirm('Discard unsaved changes?')) {
        if (template?.evaluationCriteria) {
          setCriteria(template.evaluationCriteria);
        }
      }
    }
  };

  // Format task requirements into HTML instructions
  const formatInstructions = (reqs: TaskRequirements): string => {
    let html = '';

    // Add requirements list
    if (reqs.requirements && reqs.requirements.length > 0) {
      html += '<p><strong>Requirements:</strong></p>';
      html += '<ul>';
      reqs.requirements.forEach(req => {
        html += `<li>${req}</li>`;
      });
      html += '</ul>';
    }

    // Add tips list
    if (reqs.tips && reqs.tips.length > 0) {
      html += '<p><strong>Tips:</strong></p>';
      html += '<ul>';
      reqs.tips.forEach(tip => {
        html += `<li>${tip}</li>`;
      });
      html += '</ul>';
    }

    // Add estimated duration
    if (reqs.estimatedDuration) {
      html += `<p><strong>Estimated Duration:</strong> ${reqs.estimatedDuration}</p>`;
    }

    return html;
  };

  // Save template with generated content
  const saveTemplateMutation = useMutation({
    mutationFn: async (data: {
      title?: string;
      description?: string;
      instructions?: string;
      evaluationCriteria: EvaluationCriteria;
    }) => {
      return api.put(`/templates/${templateId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template', templateId] });
      toast.success('Template saved successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to save template');
    },
  });

  // Activate template mutation (change from draft to active)
  const activateMutation = useMutation({
    mutationFn: async () => {
      return api.put(`/templates/${templateId}`, { isActive: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template', templateId] });
      toast.success('Template activated! It can now be used for tasks.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to activate template');
    },
  });

  // Delete draft template mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      return api.delete(`/templates/${templateId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Draft template deleted successfully');
      navigate('/templates');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to delete template');
    },
  });

  const handleDeleteDraft = () => {
    if (window.confirm('Are you sure you want to delete this draft template? This will also delete the rubric and any associated video. This action cannot be undone.')) {
      deleteMutation.mutate();
    }
  };

  const handleActivate = () => {
    // Validate first
    if (!validateRubric()) {
      toast.error('Please fix validation errors before activating');
      return;
    }
    // Save any pending changes first, then activate
    if (state.isDirty) {
      saveMutation.mutate(state.evaluationCriteria, {
        onSuccess: () => {
          activateMutation.mutate();
        },
      });
    } else {
      activateMutation.mutate();
    }
  };

  // Handle AI-generated rubric
  const handleGeneratedRubric = useCallback(
    (rubricSteps: RubricStep[], suggestedTitle?: string, taskRequirements?: TaskRequirements) => {
      // Check if there are existing steps
      if (state.evaluationCriteria.rubricSteps.length > 0) {
        const confirmReplace = window.confirm(
          'This will replace your existing rubric steps and template details. Continue?'
        );
        if (!confirmReplace) return;
      }

      // Build the new evaluation criteria
      const newCriteria = {
        ...state.evaluationCriteria,
        rubricSteps: rubricSteps,
      };

      // Update local state
      setCriteria(newCriteria);

      // If taskRequirements provided, save the full template
      if (taskRequirements) {
        const instructions = formatInstructions(taskRequirements);
        saveTemplateMutation.mutate({
          title: taskRequirements.title || suggestedTitle,
          description: taskRequirements.description,
          instructions: instructions,
          evaluationCriteria: newCriteria,
        });
      } else {
        toast.success(`Generated ${rubricSteps.length} rubric steps`);
      }
    },
    [state.evaluationCriteria, setCriteria, saveTemplateMutation]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(-1)}
                className="p-2 text-gray-400 hover:text-gray-600"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">
                  Rubric Builder
                </h1>
                <p className="text-sm text-gray-500">{template?.title}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {state.isDirty && (
                <span className="text-sm text-amber-600">Unsaved changes</span>
              )}

              {/* Generate from Video button - feature gated, only for active templates */}
              {template?.isActive && (
                canUseAiGeneration ? (
                  <button
                    onClick={() => setIsGenerateModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
                    title="Generate rubric from video using AI"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span className="hidden sm:inline">Generate from Video</span>
                  </button>
                ) : subscription?.tier ? (
                  <button
                    onClick={() => navigate('/settings/billing')}
                    className="flex items-center gap-2 px-4 py-2 text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    title="Upgrade to Professional or higher to use AI generation"
                  >
                    <Lock className="w-4 h-4" />
                    <span className="hidden sm:inline">AI Generation</span>
                  </button>
                ) : null
              )}

              <button
                onClick={handleDiscard}
                disabled={!state.isDirty}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saveMutation.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Draft Banner */}
      {template && !template.isActive && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-amber-600 text-lg">✨</span>
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    This is a draft template
                  </p>
                  <p className="text-xs text-amber-600">
                    Review the rubric steps and activate when ready to use
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleDeleteDraft}
                  disabled={deleteMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete Draft'}
                </button>
                <button
                  onClick={handleActivate}
                  disabled={activateMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
                >
                  <CheckCircle className="w-4 h-4" />
                  {activateMutation.isPending ? 'Activating...' : 'Activate Template'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Steps List - 2 columns */}
          <div className="lg:col-span-2">
            <RubricStepList />
          </div>

          {/* Settings Sidebar */}
          <div className="space-y-6">
            {/* Rubric Settings Card */}
            <div className="bg-white rounded-lg border p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4 flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Rubric Settings
              </h3>

              <div className="space-y-4">
                {/* Passing Score */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Passing Score: {state.evaluationCriteria.passingScore}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={state.evaluationCriteria.passingScore}
                    onChange={(e) =>
                      updateMetadata({ passingScore: parseInt(e.target.value) })
                    }
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* Scoring Method */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Scoring Method
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="scoringMethod"
                        checked={state.evaluationCriteria.scoringMethod === 'weighted'}
                        onChange={() => updateMetadata({ scoringMethod: 'weighted' })}
                        className="text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700">
                        Weighted (by step weight)
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="scoringMethod"
                        checked={state.evaluationCriteria.scoringMethod === 'equal'}
                        onChange={() => updateMetadata({ scoringMethod: 'equal' })}
                        className="text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700">
                        Equal (all steps same weight)
                      </span>
                    </label>
                  </div>
                </div>

                {/* Auto-Analyze Toggle */}
                <div className="pt-4 border-t">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <span className="text-sm font-medium text-gray-700">
                        Auto-analyze
                      </span>
                      <p className="text-xs text-gray-500">
                        Automatically analyze after transcription
                      </p>
                    </div>
                    <button
                      role="switch"
                      aria-checked={state.evaluationCriteria.autoAnalyze}
                      onClick={() =>
                        updateMetadata({
                          autoAnalyze: !state.evaluationCriteria.autoAnalyze,
                        })
                      }
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        state.evaluationCriteria.autoAnalyze
                          ? 'bg-primary-600'
                          : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          state.evaluationCriteria.autoAnalyze
                            ? 'translate-x-6'
                            : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </label>
                </div>
              </div>
            </div>

            {/* Summary Card */}
            <div className="bg-white rounded-lg border p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">Summary</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Total Steps</dt>
                  <dd className="font-medium text-gray-900">
                    {state.evaluationCriteria.rubricSteps.length}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Required Steps</dt>
                  <dd className="font-medium text-gray-900">
                    {state.evaluationCriteria.rubricSteps.filter((s) => s.isRequired).length}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Total Weight</dt>
                  <dd className="font-medium text-gray-900">
                    {state.evaluationCriteria.rubricSteps.reduce((sum, s) => sum + s.weight, 0)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Speech Steps</dt>
                  <dd className="font-medium text-gray-900">
                    {state.evaluationCriteria.rubricSteps.filter(
                      (s) => s.evidenceType === 'speech' || s.evidenceType === 'both'
                    ).length}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Visual Steps</dt>
                  <dd className="font-medium text-gray-900">
                    {state.evaluationCriteria.rubricSteps.filter(
                      (s) => s.evidenceType === 'visual' || s.evidenceType === 'both'
                    ).length}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Validation Errors */}
            {Object.keys(state.validationErrors).length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-red-800 mb-2">
                  Validation Errors
                </h4>
                <ul className="text-sm text-red-600 space-y-1">
                  {Object.entries(state.validationErrors).map(([key, errors]) =>
                    errors.map((error, idx) => (
                      <li key={`${key}-${idx}`}>• {error}</li>
                    ))
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Generate Rubric Modal */}
      <GenerateRubricModal
        isOpen={isGenerateModalOpen}
        onClose={() => setIsGenerateModalOpen(false)}
        onGenerated={handleGeneratedRubric}
      />
    </div>
  );
}

export default function RubricBuilderPage() {
  return (
    <RubricBuilderProvider>
      <RubricBuilderContent />
    </RubricBuilderProvider>
  );
}
