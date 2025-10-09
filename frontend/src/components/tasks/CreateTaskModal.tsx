import React, { useState, useEffect } from 'react';
import { X, Calendar, User, Tag, AlertCircle, Link as LinkIcon, Copy, Check, Mail } from 'lucide-react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { taskService, CreateTaskDto } from '../../services/task.service';
import { userService } from '../../services/user.service';
import { magicLinkService, ExternalContributor } from '../../services/magicLink.service';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AssignmentType = 'user' | 'external';

const CreateTaskModal: React.FC<CreateTaskModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [assignmentType, setAssignmentType] = useState<AssignmentType>('user');
  const [externalEmail, setExternalEmail] = useState('');
  const [linkExpiryDays, setLinkExpiryDays] = useState(30);
  const [generatedLink, setGeneratedLink] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [searchContributor, setSearchContributor] = useState('');

  // Fetch users for assignment dropdown
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => userService.getAllUsers(),
    enabled: isOpen && assignmentType === 'user',
  });

  // Fetch external contributors for suggestions
  const { data: contributors } = useQuery({
    queryKey: ['external-contributors', searchContributor],
    queryFn: () => magicLinkService.getExternalContributors(searchContributor, 10),
    enabled: isOpen && assignmentType === 'external' && searchContributor.length > 2,
  });

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

  const [tagInput, setTagInput] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createTaskMutation = useMutation({
    mutationFn: async (data: CreateTaskDto) => {
      const task = await taskService.createTask(data);

      // If external assignment, create magic link
      if (assignmentType === 'external' && externalEmail) {
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
        toast.success('Task created and magic link generated!');
      } else {
        toast.success('Task created successfully');
        onClose();
        resetForm();
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create task');
    },
  });

  const resetForm = () => {
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
    setTagInput('');
    setErrors({});
    setAssignmentType('user');
    setExternalEmail('');
    setLinkExpiryDays(30);
    setGeneratedLink('');
    setCopied(false);
    setSearchContributor('');
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (assignmentType === 'user' && !formData.assigned_to) {
      newErrors.assigned_to = 'Please assign this task to someone';
    }

    if (assignmentType === 'external') {
      if (!externalEmail.trim()) {
        newErrors.externalEmail = 'Email is required for external assignment';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(externalEmail)) {
        newErrors.externalEmail = 'Please enter a valid email address';
      }
    }

    if (formData.due_date) {
      const dueDate = new Date(formData.due_date);
      if (dueDate < new Date()) {
        newErrors.due_date = 'Due date cannot be in the past';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (validateForm()) {
      // For external assignments, use a placeholder assigned_to
      const submitData = {
        ...formData,
        assigned_to: assignmentType === 'external' ? user!.id : formData.assigned_to,
      };
      createTaskMutation.mutate(submitData);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'estimated_duration' ? (value ? parseInt(value) : undefined) : value,
    }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags?.includes(tagInput.trim())) {
      setFormData((prev) => ({
        ...prev,
        tags: [...(prev.tags || []), tagInput.trim()],
      }));
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags?.filter((t) => t !== tag) || [],
    }));
  };

  const handleCopyLink = async () => {
    if (generatedLink) {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      toast.success('Link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSelectContributor = (contributor: ExternalContributor) => {
    setExternalEmail(contributor.email);
    setSearchContributor('');
  };

  const handleCloseWithLink = () => {
    onClose();
    resetForm();
  };

  if (!isOpen) return null;

  // Show generated link screen
  if (generatedLink) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg w-full max-w-2xl">
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4 text-white">
            <h2 className="text-xl font-semibold">Task Created Successfully! 🎉</h2>
          </div>

          <div className="p-6 space-y-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Check className="h-5 w-5 text-green-600" />
                <p className="font-semibold text-green-900">Magic Link Generated</p>
              </div>
              <p className="text-sm text-green-700">
                A secure link has been created for <strong>{externalEmail}</strong>
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Share this link with the assignee:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={generatedLink}
                  readOnly
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 font-mono text-sm"
                />
                <button
                  onClick={handleCopyLink}
                  className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition flex items-center gap-2"
                >
                  {copied ? (
                    <>
                      <Check className="h-5 w-5" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-5 w-5" />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
              <h3 className="font-semibold text-blue-900 flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Link Details
              </h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Expires in <strong>{linkExpiryDays} days</strong></li>
                <li>• Can be used multiple times until expiry</li>
                <li>• Requires name and email verification to claim</li>
                <li>• Full recording and submission capability</li>
              </ul>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> You can also send this link via email or your preferred communication channel.
                The assignee will receive instructions when they open the link.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                onClick={handleCloseWithLink}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Create New Task</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
              Task Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleChange}
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                errors.title ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Enter task title"
            />
            {errors.title && (
              <p className="mt-1 text-sm text-red-600">{errors.title}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Provide task details..."
            />
          </div>

          {/* Assignment Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Assignment Type <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setAssignmentType('user')}
                className={`p-4 border-2 rounded-lg transition-all ${
                  assignmentType === 'user'
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <User className="h-6 w-6 mx-auto mb-2 text-indigo-600" />
                <p className="font-medium text-gray-900">Existing User</p>
                <p className="text-xs text-gray-500 mt-1">Assign to a registered user</p>
              </button>

              <button
                type="button"
                onClick={() => setAssignmentType('external')}
                className={`p-4 border-2 rounded-lg transition-all ${
                  assignmentType === 'external'
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <LinkIcon className="h-6 w-6 mx-auto mb-2 text-purple-600" />
                <p className="font-medium text-gray-900">External Link</p>
                <p className="text-xs text-gray-500 mt-1">Send a secure magic link</p>
              </button>
            </div>
          </div>

          {/* Conditional Assignment Fields */}
          {assignmentType === 'user' ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="assigned_to" className="block text-sm font-medium text-gray-700 mb-2">
                  Assign To <span className="text-red-500">*</span>
                </label>
                <select
                  id="assigned_to"
                  name="assigned_to"
                  value={formData.assigned_to}
                  onChange={handleChange}
                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    errors.assigned_to ? 'border-red-300' : 'border-gray-300'
                  }`}
                  disabled={usersLoading}
                >
                  <option value="">
                    {usersLoading ? 'Loading users...' : 'Select a user'}
                  </option>
                  {!usersLoading && users && users.length > 0 && users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
                {errors.assigned_to && (
                  <p className="mt-1 text-sm text-red-600">{errors.assigned_to}</p>
                )}
              </div>

              <div>
                <label htmlFor="reviewed_by" className="block text-sm font-medium text-gray-700 mb-2">
                  Reviewer (Optional)
                </label>
                <select
                  id="reviewed_by"
                  name="reviewed_by"
                  value={formData.reviewed_by}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  disabled={usersLoading}
                >
                  <option value="">
                    {usersLoading ? 'Loading users...' : 'Select a reviewer (optional)'}
                  </option>
                  {!usersLoading && users && users.length > 0 && users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email}) - {u.role}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label htmlFor="externalEmail" className="block text-sm font-medium text-gray-700 mb-2">
                  Assignee Email <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="email"
                    id="externalEmail"
                    value={externalEmail}
                    onChange={(e) => {
                      setExternalEmail(e.target.value);
                      setSearchContributor(e.target.value);
                      if (errors.externalEmail) {
                        setErrors((prev) => ({ ...prev, externalEmail: '' }));
                      }
                    }}
                    className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                      errors.externalEmail ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="john@example.com"
                  />
                  <Mail className="absolute right-3 top-2.5 h-5 w-5 text-gray-400" />
                </div>
                {errors.externalEmail && (
                  <p className="mt-1 text-sm text-red-600">{errors.externalEmail}</p>
                )}

                {/* Contributor suggestions */}
                {contributors && contributors.length > 0 && searchContributor && (
                  <div className="mt-2 border border-gray-200 rounded-lg bg-white shadow-lg max-h-48 overflow-y-auto">
                    <p className="px-3 py-2 text-xs font-medium text-gray-500 bg-gray-50">Previous contributors:</p>
                    {contributors.map((contributor) => (
                      <button
                        key={contributor.id}
                        type="button"
                        onClick={() => handleSelectContributor(contributor)}
                        className="w-full px-3 py-2 text-left hover:bg-purple-50 transition-colors border-b border-gray-100 last:border-b-0"
                      >
                        <p className="text-sm font-medium text-gray-900">
                          {contributor.first_name} {contributor.last_name}
                        </p>
                        <p className="text-xs text-gray-600">{contributor.email}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {contributor.total_tasks_completed} completed • {contributor.total_tasks_rejected} rejected
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="linkExpiry" className="block text-sm font-medium text-gray-700 mb-2">
                  Link Expiry
                </label>
                <select
                  id="linkExpiry"
                  value={linkExpiryDays}
                  onChange={(e) => setLinkExpiryDays(parseInt(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value={1}>1 day</option>
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days (recommended)</option>
                  <option value={60}>60 days</option>
                  <option value={90}>90 days</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  The link will expire after this period and can no longer be used
                </p>
              </div>

              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <h4 className="font-medium text-purple-900 mb-2 flex items-center gap-2">
                  <LinkIcon className="h-4 w-4" />
                  How Magic Links Work
                </h4>
                <ul className="text-sm text-purple-800 space-y-1">
                  <li>• Secure link will be generated for the email provided</li>
                  <li>• Assignee claims task by confirming their name and email</li>
                  <li>• Full recording and submission capability without account</li>
                  <li>• Link can be reused until expiry (useful for resubmissions)</li>
                </ul>
              </div>
            </div>
          )}

          {/* Type and Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-2">
                Task Type <span className="text-red-500">*</span>
              </label>
              <select
                id="type"
                name="type"
                value={formData.type}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="recording">Recording</option>
                <option value="live_demo">Live Demo</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>

            <div>
              <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-2">
                Priority
              </label>
              <select
                id="priority"
                name="priority"
                value={formData.priority}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          {/* Due Date and Estimated Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="due_date" className="block text-sm font-medium text-gray-700 mb-2">
                Due Date
              </label>
              <input
                type="datetime-local"
                id="due_date"
                name="due_date"
                value={formData.due_date}
                onChange={handleChange}
                min={new Date().toISOString().slice(0, 16)}
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  errors.due_date ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {errors.due_date && (
                <p className="mt-1 text-sm text-red-600">{errors.due_date}</p>
              )}
            </div>

            <div>
              <label htmlFor="estimated_duration" className="block text-sm font-medium text-gray-700 mb-2">
                Estimated Duration (minutes)
              </label>
              <input
                type="number"
                id="estimated_duration"
                name="estimated_duration"
                value={formData.estimated_duration || ''}
                onChange={handleChange}
                min="1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g., 30"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tags
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Add a tag and press Enter"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Add
              </button>
            </div>
            {formData.tags && formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm flex items-center gap-1"
                  >
                    <Tag className="h-3 w-3" />
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:text-indigo-900"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createTaskMutation.isPending}
              className={`px-6 py-2 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                assignmentType === 'external'
                  ? 'bg-purple-600 hover:bg-purple-700'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {createTaskMutation.isPending
                ? 'Creating...'
                : assignmentType === 'external'
                ? 'Create & Generate Link'
                : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateTaskModal;
