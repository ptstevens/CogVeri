import api from './api';

interface LoginResponse {
  token: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

interface RefreshResponse {
  token: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

export const authService = {
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const response = await api.post<LoginResponse>('/auth/login', { email, password });
    return response.data;
  },

  logout: async (): Promise<void> => {
    await api.post('/auth/logout');
  },

  refreshToken: async (refreshToken: string): Promise<RefreshResponse> => {
    const response = await api.post<RefreshResponse>('/auth/refresh', { refreshToken });
    return response.data;
  },

  getMe: async () => {
    const response = await api.get('/auth/me');
    return response.data.user;
  },

  ssoLogin: async () => {
    window.location.href = `${import.meta.env.VITE_API_URL}/auth/sso/login`;
  },
};