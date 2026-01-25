import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  RotateCcw,
  AlertTriangle,
  FileText,
  Sparkles,
} from 'lucide-react';
import { AIPromptsService } from '../../services/ai-prompts.service';
import { AIPromptWithHistory, PromptKey } from '../../types/ai-prompts';
import PromptVersionHistory from '../../components/admin/PromptVersionHistory';
import PromptTestPanel from '../../components/admin/PromptTestPanel';

export default function AdminAIPromptEditor() {
  const { promptKey } = useParams<{ promptKey: string }>();
  const navigate = useNavigate();

  const [prompt, setPrompt] = useState<AIPromptWithHistory | null>(null);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [previewPrompt, setPreviewPrompt] = useState<string | null>(null);

  const validPromptKeys: PromptKey[] = ['speech_analysis', 'visual_analysis', 'rubric_generation'];

  useEffect(() => {
    if (promptKey && validPromptKeys.includes(promptKey as PromptKey)) {
      loadPrompt();
    }
  }, [promptKey]);

  const loadPrompt = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await AIPromptsService.getPrompt(promptKey as PromptKey);
      setPrompt(data);
      setEditedPrompt(data.systemPrompt);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to load prompt');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!prompt) return;

    try {
      setSaving(true);
      setError(null);

      await AIPromptsService.updatePrompt(promptKey as PromptKey, {
        systemPrompt: editedPrompt,
        reason: changeReason || undefined,
      });

      setSuccessMessage('Prompt saved successfully');
      setChangeReason('');
      setTimeout(() => setSuccessMessage(null), 3000);

      // Reload to get updated version and history
      await loadPrompt();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to save prompt');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!prompt) return;

    try {
      setResetting(true);
      setError(null);

      await AIPromptsService.resetToDefault(promptKey as PromptKey);

      setSuccessMessage('Prompt reset to default');
      setShowResetConfirm(false);
      setTimeout(() => setSuccessMessage(null), 3000);

      // Reload to get updated version and history
      await loadPrompt();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to reset prompt');
    } finally {
      setResetting(false);
    }
  };

  const handleRevert = async (version: number) => {
    if (!prompt) return;

    try {
      setReverting(true);
      setError(null);

      await AIPromptsService.revertToVersion(promptKey as PromptKey, version);

      setSuccessMessage(`Reverted to version ${version}`);
      setTimeout(() => setSuccessMessage(null), 3000);

      // Reload to get updated version and history
      await loadPrompt();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to revert prompt');
    } finally {
      setReverting(false);
    }
  };

  const hasChanges = prompt && editedPrompt !== prompt.systemPrompt;
  const isModifiedFromDefault = prompt && prompt.systemPrompt !== prompt.defaultPrompt;

  if (!promptKey || !validPromptKeys.includes(promptKey as PromptKey)) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Invalid Prompt Key</h2>
          <p className="text-gray-600 mb-4">
            The prompt key "{promptKey}" is not valid.
          </p>
          <button
            onClick={() => navigate('/admin/ai-prompts')}
            className="text-blue-600 hover:text-blue-800"
          >
            Back to AI Prompts
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading prompt...</p>
        </div>
      </div>
    );
  }

  if (!prompt) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Prompt Not Found</h2>
          <p className="text-gray-600 mb-4">
            The prompt "{promptKey}" could not be found. Make sure the migration has been run.
          </p>
          <button
            onClick={() => navigate('/admin/ai-prompts')}
            className="text-blue-600 hover:text-blue-800"
          >
            Back to AI Prompts
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/admin/ai-prompts')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to AI Prompts
        </button>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <FileText className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{prompt.displayName}</h1>
              <p className="text-gray-600">{prompt.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2 py-1 text-sm font-medium bg-gray-100 text-gray-700 rounded">
              v{prompt.version}
            </span>
            {isModifiedFromDefault && (
              <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded">
                Modified
              </span>
            )}
            {hasChanges && (
              <span className="px-2 py-1 text-xs bg-orange-100 text-orange-800 rounded">
                Unsaved changes
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}
      {successMessage && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-800">{successMessage}</p>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Editor - 2 columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* Prompt Editor */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-500" />
                System Prompt
              </h3>
              <span className="text-sm text-gray-500">
                {editedPrompt.length.toLocaleString()} characters
              </span>
            </div>

            <textarea
              value={editedPrompt}
              onChange={(e) => setEditedPrompt(e.target.value)}
              className="w-full h-96 p-4 font-mono text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y"
              placeholder="Enter the system prompt..."
              spellCheck={false}
            />

            {/* Change Reason */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Change reason (optional)
              </label>
              <input
                type="text"
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                placeholder="e.g., Made scoring more lenient for partial matches"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
              <div>
                {isModifiedFromDefault && (
                  <button
                    onClick={() => setShowResetConfirm(true)}
                    disabled={resetting || saving}
                    className="flex items-center gap-2 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reset to Default
                  </button>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setEditedPrompt(prompt.systemPrompt)}
                  disabled={!hasChanges || saving}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  Discard Changes
                </button>
                <button
                  onClick={handleSave}
                  disabled={!hasChanges || saving || editedPrompt.trim().length < 50}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>

          {/* Test Panel */}
          <PromptTestPanel promptKey={promptKey as PromptKey} systemPrompt={editedPrompt} />
        </div>

        {/* Sidebar - 1 column */}
        <div className="space-y-6">
          {/* Version History */}
          <PromptVersionHistory
            history={prompt.history}
            currentVersion={prompt.version}
            onRevert={handleRevert}
            reverting={reverting}
            onPreview={setPreviewPrompt}
          />

          {/* Diff View Placeholder */}
          {isModifiedFromDefault && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Changes from Default</h3>
              <p className="text-sm text-gray-500 mb-3">
                Current prompt differs from the original default by{' '}
                {Math.abs(prompt.systemPrompt.length - prompt.defaultPrompt.length)} characters.
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-gray-100 rounded">
                  <span className="font-medium">Default:</span>{' '}
                  {prompt.defaultPrompt.length.toLocaleString()} chars
                </div>
                <div className="p-2 bg-purple-100 rounded">
                  <span className="font-medium">Current:</span>{' '}
                  {prompt.systemPrompt.length.toLocaleString()} chars
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-yellow-100 rounded-full">
                <AlertTriangle className="h-6 w-6 text-yellow-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Reset to Default?</h3>
            </div>
            <p className="text-gray-600 mb-6">
              This will replace the current prompt with the original hardcoded version. Your changes
              will be saved in the version history and can be restored later.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                disabled={resetting}
                className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
              >
                {resetting ? 'Resetting...' : 'Reset to Default'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewPrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Prompt Preview</h3>
              <button
                onClick={() => setPreviewPrompt(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                Close
              </button>
            </div>
            <pre className="flex-1 p-4 bg-gray-100 rounded-lg text-sm font-mono text-gray-700 overflow-auto whitespace-pre-wrap">
              {previewPrompt}
            </pre>
            <div className="flex justify-end mt-4">
              <button
                onClick={() => {
                  setEditedPrompt(previewPrompt);
                  setPreviewPrompt(null);
                }}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                Use This Version
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
