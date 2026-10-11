import api from './api';

// Task status flow: assigned → in_progress → submitted → in_review → completed/rejected
export type TaskStatus =
  | 'draft'
  | 'assigned'
  | 'pending' // Legacy alias for 'assigned'
  | 'in_progress'
  | 'submitted' // Waiting for review
  | 'in_review' // Reviewer is actively reviewing
  | 'completed' // Approved by reviewer
  | 'reviewed' // Legacy alias for 'completed'
  | 'rejected'; // Needs resubmission

export interface Task {
  id: string;
  title: string;
  description?: string;
  type: 'recording' | 'live_demo' | 'hybrid';
  status: TaskStatus;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to: string;
  created_by: string;
  reviewed_by?: string;
  due_date?: string;
  completed_at?: string;
  estimated_duration?: number;
  actual_duration?: number;
  tags?: string[];
  metadata?: any;
  created_at: string;
  updated_at: string;
  // Joined fields from API
  assignee_name?: string;
  assignee_email?: string;
  creator_name?: string;
  creator_email?: string;
  reviewer_name?: string;
  reviewer_email?: string;
  // Magic link claim fields
  claim_name?: string;
  claim_email?: string;
}

export interface CreateTaskDto {
  title: string;
  description?: string;
  type: 'recording' | 'live_demo' | 'hybrid';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to: string;
  reviewed_by?: string;
  due_date?: string;
  estimated_duration?: number;
  tags?: string[];
  metadata?: any;
}

export interface UpdateTaskDto {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to?: string;
  reviewed_by?: string;
  due_date?: string;
  estimated_duration?: number;
  actual_duration?: number;
  tags?: string[];
  metadata?: any;
}

export interface TaskFilters {
  status?: string;
  assigned_to?: string;
  created_by?: string;
  type?: string;
  priority?: string;
  scope?: 'mine' | 'all';
}

export interface TaskStatistics {
  total: number;
  draft: number;
  assigned: number; // Tasks assigned but not started (was 'pending')
  in_progress: number;
  submitted: number; // Awaiting review
  in_review: number; // Currently being reviewed
  completed: number;
  rejected: number;
  overdue: number;
  // Legacy fields for backwards compatibility
  pending?: number; // Deprecated: use 'assigned'
  reviewed?: number; // Deprecated: no longer a valid status
}

export interface TasksByStatus {
  draft: Task[];
  assigned: Task[]; // Tasks assigned but not started (was 'pending')
  in_progress: Task[];
  submitted: Task[];
  in_review: Task[];
  completed: Task[];
  rejected: Task[];
  // Legacy fields for backwards compatibility
  pending?: Task[]; // Deprecated: use 'assigned'
  reviewed?: Task[]; // Deprecated: no longer a valid status
}

class TaskService {
  async getTasks(filters?: TaskFilters): Promise<Task[]> {
    const params = new URLSearchParams();

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value) {
          params.append(key, value);
        }
      });
    }

    const queryString = params.toString();
    const url = queryString ? `/tasks?${queryString}` : '/tasks';

    const response = await api.get(url);
    return response.data.data;
  }

  async getTaskById(id: string): Promise<Task> {
    const response = await api.get(`/tasks/${id}`);
    return response.data.data;
  }

  async createTask(data: CreateTaskDto): Promise<Task> {
    const response = await api.post('/tasks', data);
    return response.data.data;
  }

  async updateTask(id: string, data: UpdateTaskDto): Promise<Task> {
    const response = await api.put(`/tasks/${id}`, data);
    return response.data.data;
  }

  async deleteTask(id: string): Promise<void> {
    await api.delete(`/tasks/${id}`);
  }

  async getTaskStatistics(scope?: 'mine' | 'all'): Promise<TaskStatistics> {
    const params = scope ? `?scope=${scope}` : '';
    const response = await api.get(`/tasks/statistics${params}`);
    return response.data.data;
  }

  async getTasksByStatus(scope?: 'mine' | 'all'): Promise<TasksByStatus> {
    const params = scope ? `?scope=${scope}` : '';
    const response = await api.get(`/tasks/by-status${params}`);
    return response.data.data;
  }

  async updateTaskProgress(
    id: string,
    progress: {
      status?: 'in_progress' | 'completed';
      actual_duration?: number;
      notes?: string;
    }
  ): Promise<Task> {
    const response = await api.put(`/tasks/${id}/progress`, progress);
    return response.data.data;
  }

  async submitTask(id: string, recordingId: string): Promise<Task> {
    const response = await api.post(`/tasks/${id}/submit`, { recordingId });
    return response.data.data;
  }

  // Helper methods for common filters
  async getMyTasks(): Promise<Task[]> {
    // The backend already filters to show tasks where user is assignee, creator, or reviewer
    return this.getTasks();
  }

  async getAssignedTasks(): Promise<Task[]> {
    // Will get tasks assigned to the current user
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    return this.getTasks({ assigned_to: currentUser.id });
  }

  async getCreatedTasks(): Promise<Task[]> {
    // Will get tasks created by the current user
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    return this.getTasks({ created_by: currentUser.id });
  }

  async getPendingTasks(): Promise<Task[]> {
    // 'assigned' = tasks assigned but not yet started
    return this.getTasks({ status: 'assigned' });
  }

  async getUpcomingTasks(): Promise<Task[]> {
    const allTasks = await this.getTasks();
    const now = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    return allTasks.filter((task) => {
      if (!task.due_date) return false;
      const dueDate = new Date(task.due_date);
      return (
        dueDate >= now &&
        dueDate <= nextWeek &&
        task.status !== 'completed' &&
        task.status !== 'reviewed'
      );
    });
  }

  async getOverdueTasks(): Promise<Task[]> {
    const allTasks = await this.getTasks();
    const now = new Date();

    return allTasks.filter((task) => {
      if (!task.due_date) return false;
      const dueDate = new Date(task.due_date);
      return dueDate < now && task.status !== 'completed' && task.status !== 'reviewed';
    });
  }

  // Helper method to format due date
  formatDueDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''}`;
    } else if (diffDays === 0) {
      return 'Due today';
    } else if (diffDays === 1) {
      return 'Due tomorrow';
    } else if (diffDays <= 7) {
      return `Due in ${diffDays} days`;
    } else {
      return date.toLocaleDateString();
    }
  }

  // Helper method to get task priority color
  getPriorityColor(priority: string): string {
    switch (priority) {
      case 'urgent':
        return 'text-red-600 bg-red-100';
      case 'high':
        return 'text-orange-600 bg-orange-100';
      case 'medium':
        return 'text-yellow-600 bg-yellow-100';
      case 'low':
        return 'text-green-600 bg-green-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  }

  // Helper method to get task status color
  getStatusColor(status: string): string {
    switch (status) {
      case 'pending':
        return 'text-gray-600 bg-gray-100';
      case 'in_progress':
        return 'text-blue-600 bg-blue-100';
      case 'completed':
        return 'text-green-600 bg-green-100';
      case 'reviewed':
        return 'text-purple-600 bg-purple-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  }
}

export const taskService = new TaskService();
