const origin =
  typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:8000';

const publicApiOrigin = import.meta.env.VITE_PUBLIC_API_ORIGIN || origin;

export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  publicApiOrigin,
  wsBaseUrl:
    import.meta.env.VITE_WS_BASE_URL ||
    `${publicApiOrigin.replace(/^http/, 'ws')}/ws`,
};
