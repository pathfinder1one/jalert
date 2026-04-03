import axios from 'axios';
import { env } from '../config/env';
import type { AuthTokens } from '../types/api';

const AUTH_STORAGE_KEY = 'jalert.auth.tokens';
const AUTH_EXPIRED_EVENT = 'jalert:auth-expired';

export const getStoredTokens = (): AuthTokens | null => {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthTokens;
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
};

export const setStoredTokens = (tokens: AuthTokens) => {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(tokens));
};

export const clearStoredTokens = () => {
  localStorage.removeItem(AUTH_STORAGE_KEY);
};

export const emitAuthExpired = () => {
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
};

export const onAuthExpired = (callback: () => void) => {
  window.addEventListener(AUTH_EXPIRED_EVENT, callback);
  return () => window.removeEventListener(AUTH_EXPIRED_EVENT, callback);
};

export const http = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 15000,
});

http.interceptors.request.use((config) => {
  const tokens = getStoredTokens();
  if (tokens?.access_token) {
    config.headers.Authorization = `Bearer ${tokens.access_token}`;
  }
  return config;
});

http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && getStoredTokens()) {
      clearStoredTokens();
      emitAuthExpired();
    }
    return Promise.reject(error);
  },
);
