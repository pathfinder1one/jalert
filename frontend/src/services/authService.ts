import { http, clearStoredTokens, setStoredTokens } from './http';
import type { AuthTokens, User } from '../types/api';

interface RegisterPayload {
  name: string;
  email: string;
  phone?: string;
  password: string;
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
  logout() {
    clearStoredTokens();
  },
};
