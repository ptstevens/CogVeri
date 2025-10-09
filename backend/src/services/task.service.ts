import { db } from '../config/database';
import { BadRequestError, NotFoundError } from '../utils/AppError';
import { logger } from '../utils/logger';

export interface Task {
  id: string;
  title: string;
  description?: string;
  type: 'recording' | 'live_demo' | 'hybrid';
  status: 'draft' | 'assigned' | 'in_progress' | 'submitted' | 'in_review' | 'completed' | 'rejected';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to: string;
  created_by: string;
  reviewed_by?: string;
  due_date?: Date;
  completed_at?: Date;
  estimated_duration?: number;
  actual_duration?: number;
  tags?: string[];
  metadata?: any;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTaskDto {
  title: string;
  description?: string;
  type: 'recording' | 'live_demo' | 'hybrid';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to?: string | null; // Optional for external link tasks
  reviewed_by?: string | null;
  due_date?: Date;
  estimated_duration?: number;
  tags?: string[];
  metadata?: any;
}

export interface UpdateTaskDto {
  title?: string;
  description?: string;
  status?: 'draft' | 'assigned' | 'in_progress' | 'submitted' | 'in_review' | 'completed' | 'rejected';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to?: string;
  reviewed_by?: string;
  due_date?: Date;
  estimated_duration?: number;
  actual_duration?: number;
  tags?: string[];
  metadata?: any;
  archived?: boolean;
}

class TaskService {
  async createTask(userId: string, taskData: CreateTaskDto): Promise<Task> {
    try {
      // Clean up empty strings to null for UUID fields
      const cleanedData: any = { ...taskData };

      // Convert empty strings to null for all UUID fields
      const uuidFields = ['assigned_to', 'reviewed_by'];
      uuidFields.forEach(field => {
        if (field in cleanedData) {
          const value = cleanedData[field];
          // Convert empty string, null, undefined, or whitespace-only string to null
          if (!value || (typeof value === 'string' && value.trim() === '')) {
            cleanedData[field] = null;
          }
        }
      });

      const [task] = await db('tasks')
        .insert({
          ...cleanedData,
          status: 'assigned',
          priority: taskData.priority || 'medium',
          created_by: userId,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning('*');

      logger.info(`Task created: ${task.id} by user ${userId}`);

      // Create notification for assigned user (only if assigned to a specific user)
      if (task.assigned_to && task.assigned_to !== userId) {
        await this.createTaskNotification(task.assigned_to, task.id, 'task_assigned');
      }

      return task;
    } catch (error) {
      logger.error('Error creating task:', error);
      throw error;
    }
  }

  async getTasks(userId: string, filters?: {
    status?: string;
    assigned_to?: string;
    created_by?: string;
    type?: string;
    priority?: string;
  }): Promise<Task[]> {
    try {
      let query = db('tasks')
        .leftJoin('users as assignee', 'tasks.assigned_to', 'assignee.id')
        .leftJoin('users as creator', 'tasks.created_by', 'creator.id')
        .leftJoin('users as reviewer', 'tasks.reviewed_by', 'reviewer.id')
        .select(
          'tasks.*',
          'assignee.name as assignee_name',
          'assignee.email as assignee_email',
          'creator.name as creator_name',
          'creator.email as creator_email',
          'reviewer.name as reviewer_name',
          'reviewer.email as reviewer_email'
        );

      // Apply filters
      if (filters?.status) {
        query = query.where('tasks.status', filters.status);
      }
      if (filters?.assigned_to) {
        query = query.where('tasks.assigned_to', filters.assigned_to);
      }
      if (filters?.created_by) {
        query = query.where('tasks.created_by', filters.created_by);
      }
      if (filters?.type) {
        query = query.where('tasks.type', filters.type);
      }
      if (filters?.priority) {
        query = query.where('tasks.priority', filters.priority);
      }

      // User can see tasks they created, are assigned to, or are reviewing
      query = query.where((builder) => {
        builder
          .where('tasks.assigned_to', userId)
          .orWhere('tasks.created_by', userId)
          .orWhere('tasks.reviewed_by', userId);
      });

      const tasks = await query.orderBy('tasks.created_at', 'desc');

      return tasks;
    } catch (error) {
      logger.error('Error fetching tasks:', error);
      throw error;
    }
  }

  async getTaskById(taskId: string, userId: string): Promise<Task> {
    try {
      const task = await db('tasks')
        .leftJoin('users as assignee', 'tasks.assigned_to', 'assignee.id')
        .leftJoin('users as creator', 'tasks.created_by', 'creator.id')
        .leftJoin('users as reviewer', 'tasks.reviewed_by', 'reviewer.id')
        .select(
          'tasks.*',
          'assignee.name as assignee_name',
          'assignee.email as assignee_email',
          'creator.name as creator_name',
          'creator.email as creator_email',
          'reviewer.name as reviewer_name',
          'reviewer.email as reviewer_email'
        )
        .where('tasks.id', taskId)
        .first();

      if (!task) {
        throw new NotFoundError('Task not found');
      }

      // Check if user has access to this task
      if (
        task.assigned_to !== userId &&
        task.created_by !== userId &&
        task.reviewed_by !== userId
      ) {
        throw new NotFoundError('Task not found');
      }

      return task;
    } catch (error) {
      logger.error('Error fetching task:', error);
      throw error;
    }
  }

  async updateTask(taskId: string, userId: string, updateData: UpdateTaskDto): Promise<Task> {
    try {
      // Get existing task
      const existingTask = await this.getTaskById(taskId, userId);

      // Only creator, assignee, or reviewer can update
      if (existingTask.created_by !== userId && existingTask.assigned_to !== userId && existingTask.reviewed_by !== userId) {
        throw new BadRequestError('You do not have permission to update this task');
      }

      // Clean up empty strings to null for UUID fields
      const cleanedData: any = { ...updateData };
      const uuidFields = ['assigned_to', 'reviewed_by'];
      uuidFields.forEach(field => {
        if (field in cleanedData) {
          const value = cleanedData[field];
          // Convert empty string, null, undefined, or whitespace-only string to null
          if (!value || (typeof value === 'string' && value.trim() === '')) {
            cleanedData[field] = null;
          }
        }
      });

      // Update task
      const [updatedTask] = await db('tasks')
        .where('id', taskId)
        .update({
          ...cleanedData,
          updated_at: new Date(),
        })
        .returning('*');

      // Handle status changes
      if (updateData.status === 'completed' && existingTask.status !== 'completed') {
        await db('tasks')
          .where('id', taskId)
          .update({ completed_at: new Date() });

        // Notify reviewer if task is completed
        if (updatedTask.reviewed_by) {
          await this.createTaskNotification(updatedTask.reviewed_by, taskId, 'task_completed');
        }
      }

      // Handle assignee changes
      if (updateData.assigned_to && updateData.assigned_to !== existingTask.assigned_to) {
        await this.createTaskNotification(updateData.assigned_to, taskId, 'task_assigned');
      }

      logger.info(`Task updated: ${taskId} by user ${userId}`);

      return updatedTask;
    } catch (error) {
      logger.error('Error updating task:', error);
      throw error;
    }
  }

  async deleteTask(taskId: string, userId: string): Promise<void> {
    try {
      const task = await this.getTaskById(taskId, userId);

      // Only creator can delete
      if (task.created_by !== userId) {
        throw new BadRequestError('You do not have permission to delete this task');
      }

      // Delete related data first
      await db('recordings').where('task_id', taskId).del();
      await db('notifications').where('entity_id', taskId).where('entity_type', 'task').del();

      // Delete task
      await db('tasks').where('id', taskId).del();

      logger.info(`Task deleted: ${taskId} by user ${userId}`);
    } catch (error) {
      logger.error('Error deleting task:', error);
      throw error;
    }
  }

  async getTaskStatistics(userId: string): Promise<any> {
    try {
      const stats = await db('tasks')
        .where((builder) => {
          builder
            .where('assigned_to', userId)
            .orWhere('created_by', userId)
            .orWhere('reviewed_by', userId);
        })
        .select(
          db.raw('COUNT(*) as total'),
          db.raw('COUNT(CASE WHEN status = \'pending\' THEN 1 END) as pending'),
          db.raw('COUNT(CASE WHEN status = \'in_progress\' THEN 1 END) as in_progress'),
          db.raw('COUNT(CASE WHEN status = \'completed\' THEN 1 END) as completed'),
          db.raw('COUNT(CASE WHEN status = \'reviewed\' THEN 1 END) as reviewed'),
          db.raw('COUNT(CASE WHEN due_date < NOW() AND status NOT IN (\'completed\', \'reviewed\') THEN 1 END) as overdue')
        )
        .first();

      return stats;
    } catch (error) {
      logger.error('Error fetching task statistics:', error);
      throw error;
    }
  }

  async updateTaskProgress(taskId: string, userId: string, progress: {
    status?: 'in_progress' | 'completed';
    actual_duration?: number;
    notes?: string;
  }): Promise<Task> {
    try {
      const task = await this.getTaskById(taskId, userId);

      // Only assignee can update progress
      if (task.assigned_to !== userId) {
        throw new BadRequestError('Only the assigned user can update task progress');
      }

      const updateData: any = {
        updated_at: new Date(),
      };

      if (progress.status) {
        updateData.status = progress.status;
        if (progress.status === 'completed') {
          updateData.completed_at = new Date();
        }
      }

      if (progress.actual_duration !== undefined) {
        updateData.actual_duration = progress.actual_duration;
      }

      const [updatedTask] = await db('tasks')
        .where('id', taskId)
        .update(updateData)
        .returning('*');

      // Log activity
      await db('activity_logs').insert({
        id: db.raw('gen_random_uuid()'),
        user_id: userId,
        action: `updated_task_progress`,
        entity_type: 'task',
        entity_id: taskId,
        details: progress,
        created_at: new Date(),
      });

      return updatedTask;
    } catch (error) {
      logger.error('Error updating task progress:', error);
      throw error;
    }
  }

  private async createTaskNotification(userId: string, taskId: string, type: string): Promise<void> {
    try {
      await db('notifications').insert({
        id: db.raw('gen_random_uuid()'),
        user_id: userId,
        type,
        entity_type: 'task',
        entity_id: taskId,
        is_read: false,
        created_at: new Date(),
      });
    } catch (error) {
      logger.error('Error creating notification:', error);
    }
  }
}

export default new TaskService();