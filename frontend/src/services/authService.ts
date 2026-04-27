import { http, clearStoredTokens, setStoredTokens } from './http';
import type {
  AuthTokens,
  ChangePasswordPayload,
  UpdateUserPreferencesPayload,
  UpdateUserProfilePayload,
  User,
  UserPreferences,
  UserRole,
} from '../types/api';

interface RegisterPayload {
  name: string;
  email: string;
  phone?: string;
  password: string;
  role?: UserRole;
  preferred_language: string;
  village_id?: string;
}

interface LoginPayload {
  email: string;
  password: string;
}

export const authService = {
  async register(payload: RegisterPayload) {
    const { data } = await http.post<User>('/auth/register', payload);
    return data;
  },
  async login(payload: LoginPayload) {
    const { data } = await http.post<AuthTokens>('/auth/login', payload);
    setStoredTokens(data);
    return data;
  },
  async me() {
    const { data } = await http.get<User>('/auth/me');
    return data;
  },
  async updateProfile(payload: UpdateUserProfilePayload) {
    const { data } = await http.patch<User>('/auth/me', payload);
    return data;
  },
  async changePassword(payload: ChangePasswordPayload) {
    const { data } = await http.post<{ status: string }>('/auth/change-password', payload);
    return data;
  },
  async getPreferences() {
    const { data } = await http.get<UserPreferences>('/auth/preferences');
    return data;
  },
  async updatePreferences(payload: UpdateUserPreferencesPayload) {
    const { data } = await http.patch<UserPreferences>('/auth/preferences', payload);
    return data;
  },
  logout() {
    clearStoredTokens();
  },
};
