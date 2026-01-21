import api from './api';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  role: 'employee' | 'manager' | 'reviewer' | 'admin';
  sso_id?: string;
  sso_provider?: string;
  is_active: boolean;
  last_login_at?: string;
  notification_preferences?: {
    email: boolean;
    inApp: boolean;
    slack: boolean;
  };
  department?: string;
  job_title?: string;
  manager_id?: string;
  created_at: string;
  updated_at: string;
}

export interface UpdateUserDto {
  name?: string;
  department?: string;
  job_title?: string;
  phone?: string;
  bio?: string;
  notification_preferences?: {
    email?: boolean;
    inApp?: boolean;
    slack?: boolean;
  };
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

class UserService {
  async getMe(): Promise<User> {
    const response = await api.get('/users/me');
    return response.data.user;
  }

  async updateProfile(data: UpdateUserDto): Promise<User> {
    const response = await api.put('/users/me', data);
    return response.data.user;
  }

  async changePassword(data: ChangePasswordDto): Promise<void> {
    await api.put('/users/me/password', data);
  }

  async getAllUsers(): Promise<User[]> {
    const response = await api.get('/users');
    return response.data.users || [];
  }

  async getUserById(id: string): Promise<User> {
    const response = await api.get(`/users/${id}`);
    return response.data.user;
  }

  async getManagers(): Promise<User[]> {
    const response = await api.get('/users?role=manager');
    return response.data.users || [];
  }

  async getReviewers(): Promise<User[]> {
    const response = await api.get('/users?role=reviewer');
    return response.data.users || [];
  }

  async getTeamMembers(managerId: string): Promise<User[]> {
    const response = await api.get(`/users?manager_id=${managerId}`);
    return response.data.users || [];
  }

  async uploadAvatar(file: File): Promise<{ url: string }> {
    const formData = new FormData();
    formData.append('avatar', file);

    const response = await api.post('/users/me/avatar', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  }

  async deleteAvatar(): Promise<void> {
    await api.delete('/users/me/avatar');
  }

  // Admin functions
  async updateUserRole(userId: string, role: string): Promise<User> {
    const response = await api.put(`/users/${userId}/role`, { role });
    return response.data.user;
  }

  async deactivateUser(userId: string): Promise<void> {
    await api.put(`/users/${userId}/deactivate`);
  }

  async reactivateUser(userId: string): Promise<void> {
    await api.put(`/users/${userId}/reactivate`);
  }

  // Helper method to format user display name
  formatUserName(user: User): string {
    return user.name || user.email.split('@')[0];
  }

  // Helper method to get user initials for avatar
  getUserInitials(user: User): string {
    if (user.name) {
      const parts = user.name.split(' ');
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      }
      return parts[0].substring(0, 2).toUpperCase();
    }
    return user.email.substring(0, 2).toUpperCase();
  }

  // Helper method to get role display name
  getRoleDisplayName(role: string): string {
    const roleMap: Record<string, string> = {
      employee: 'Employee',
      manager: 'Manager',
      reviewer: 'Reviewer',
      admin: 'Administrator',
    };
    return roleMap[role] || role;
  }

  // Helper method to get role color
  getRoleColor(role: string): string {
    switch (role) {
      case 'admin':
        return 'text-red-600 bg-red-100';
      case 'manager':
        return 'text-purple-600 bg-purple-100';
      case 'reviewer':
        return 'text-blue-600 bg-blue-100';
      case 'employee':
        return 'text-gray-600 bg-gray-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  }
}

export const userService = new UserService();