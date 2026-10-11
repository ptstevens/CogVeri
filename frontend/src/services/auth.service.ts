import api from './api';
import {
  loginResponseSchema,
  refreshResponseSchema,
  getMeResponseSchema,
  parseOrThrow,
  type LoginResponse,
  type RefreshResponse,
  type User,
} from '../schemas/api.schemas';

export const authService = {
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const response = await api.post('/auth/login', { email, password });
    // Validate response against schema for runtime type safety
    return parseOrThrow(loginResponseSchema, response.data, 'login');
  },

  logout: async (): Promise<void> => {
    await api.post('/auth/logout');
  },

  refreshToken: async (): Promise<RefreshResponse> => {
    // Refresh token is sent automatically via HttpOnly cookie
    const response = await api.post('/auth/refresh', {});
    return parseOrThrow(refreshResponseSchema, response.data, 'refresh');
  },

  getMe: async (): Promise<User> => {
    const response = await api.get('/auth/me');
    const validated = parseOrThrow(getMeResponseSchema, response.data, 'getMe');
    return validated.user;
  },

  ssoLogin: async () => {
    window.location.href = `${import.meta.env.VITE_API_URL}/auth/sso/login`;
  },

  switchOrganization: async (
    organizationId: string
  ): Promise<{ accessToken: string; expiresIn: string }> => {
    const response = await api.post('/auth/v2/switch-org', { organizationId });
    return response.data;
  },
};
