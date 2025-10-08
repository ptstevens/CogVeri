import React, { useState, useEffect } from 'react';
import { X, Calendar, Tag, AlertCircle, ListChecks, Plus, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { taskService, Task } from '../../services/task.service';
import { userService } from '../../services/user.service';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

interface EditTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task;
}

interface UpdateTaskDto {
  title?: string;
  description?: string;
  type?: string;
  priority?: string;
  reviewed_by?: string;
  due_date?: string;
  estimated_duration?: number;
  tags?: string[];
  metadata?: any;
}

const EditTaskModal: React.FC<EditTaskModalProps> = ({ isOpen, onClose, task }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch users for reviewer dropdown
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => userService.getAllUsers(),
    enabled: isOpen,
  });

  const [formData, setFormData] = useState<UpdateTaskDto>({
    title: task.title,
    description: task.description || '',
    type: task.type,
    priority: task.priority,
    reviewed_by: task.reviewed_by || '',
    due_date: task.due_date ? new Date(task.due_date).toISOString().slice(0, 16) : '',
    estimated_duration: task.estimated_duration,
    tags: task.tags || [],
    metadata: task.metadata || {},
  });

  const [checklistItems, setChecklistItems] = useState<string[]>(
    task.metadata?.checklist || []
  );
  const [checklistInput, setChecklistInput] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset form when task changes
  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title,
        description: task.description || '',
        type: task.type,
        priority: task.priority,
        reviewed_by: task.reviewed_by || '',
        due_date: task.due_date ? new Date(task.due_date).toISOString().slice(0, 16) : '',
        estimated_duration: task.estimated_duration,
        tags: task.tags || [],
        metadata: task.metadata || {},
      });
      setChecklistItems(task.metadata?.checklist || []);
    }
  }, [task]);

  const updateTaskMutation = useMutation({
    mutationFn: async (data: UpdateTaskDto) => {
      // Include checklist in metadata
      const updatedMetadata = {
        ...data.metadata,
        checklist: checklistItems,
      };

      // Clean up empty strings for UUID fields - convert to null
      const cleanedData = { ...data };
      if (cleanedData.reviewed_by === '') {
        cleanedData.reviewed_by = undefined; // undefined will be omitted from the request
      }

      return await taskService.updateTask(task.id, {
        ...cleanedData,
        metadata: updatedMetadata,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task', task.id] });
      queryClient.invalidateQueries({ queryKey: ['task-statistics'] });
      toast.success('Task updated successfully');
      onClose();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update task');
    },
  });

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.title?.trim()) {
      newErrors.title = 'Title is required';
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
      updateTaskMutation.mutate(formData);
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

  const handleAddChecklistItem = () => {
    if (checklistInput.trim() && !checklistItems.includes(checklistInput.trim())) {
      setChecklistItems([...checklistItems, checklistInput.trim()]);
      setChecklistInput('');
    }
  };

  const handleRemoveChecklistItem = (index: number) => {
    setChecklistItems(checklistItems.filter((_, i) => i !== index));
  };

  const handleMoveChecklistItem = (index: number, direction: 'up' | 'down') => {
    const newItems = [...checklistItems];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex >= 0 && targetIndex < newItems.length) {
      [newItems[index], newItems[targetIndex]] = [newItems[targetIndex], newItems[index]];
      setChecklistItems(newItems);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Edit Task</h2>
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
              Description <span className="text-xs text-gray-500">(Supports Markdown)</span>
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={6}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
              placeholder="Use Markdown for formatting:&#10;# Heading&#10;**bold** *italic*&#10;- List item&#10;[Link](https://example.com)"
            />
            <p className="mt-1 text-xs text-gray-500">
              This description will be displayed with rich formatting on the public task page.
            </p>
          </div>

          {/* Task Checklist */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-purple-600" />
              Task Requirements Checklist
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Add items that must be completed before submitting the recording. These will appear as checkboxes on the public task page.
            </p>

            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={checklistInput}
                onChange={(e) => setChecklistInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddChecklistItem();
                  }
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Add a requirement (e.g., 'Show login process')"
              />
              <button
                type="button"
                onClick={handleAddChecklistItem}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>

            {checklistItems.length > 0 && (
              <div className="space-y-2 bg-gray-50 border border-gray-200 rounded-lg p-4">
                {checklistItems.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 bg-white p-3 rounded border border-gray-200"
                  >
                    <span className="text-sm text-gray-700 font-medium mr-2">{index + 1}.</span>
                    <span className="flex-1 text-sm text-gray-900">{item}</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => handleMoveChecklistItem(index, 'up')}
                        disabled={index === 0}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveChecklistItem(index, 'down')}
                        disabled={index === checklistItems.length - 1}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move down"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveChecklistItem(index)}
                        className="p-1 text-red-400 hover:text-red-600"
                        title="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {checklistItems.length === 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                No checklist items. Add requirements that must be verified before submission.
              </div>
            )}
          </div>

          {/* Type and Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-2">
                Task Type
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

          {/* Reviewer and Due Date */}
          <div className="grid grid-cols-2 gap-4">
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
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  errors.due_date ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {errors.due_date && (
                <p className="mt-1 text-sm text-red-600">{errors.due_date}</p>
              )}
            </div>
          </div>

          {/* Estimated Duration */}
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
              disabled={updateTaskMutation.isPending}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {updateTaskMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditTaskModal;
