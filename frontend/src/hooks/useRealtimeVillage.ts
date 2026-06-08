import { useEffect, useState } from 'react';
import { env } from '../config/env';
import { getStoredTokens } from '../services/http';

export const useRealtimeVillage = (
  villageId?: string | null,
  channel: 'alerts' | 'sensors' = 'alerts',
) => {
  const [events, setEvents] = useState<Record<string, unknown>[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!villageId) {
      return undefined;
    }

    const tokens = getStoredTokens();
    if (!tokens?.access_token) {
      return undefined;
    }

    const params = new URLSearchParams({ token: tokens.access_token });
    const ws = new WebSocket(`${env.wsBaseUrl}/village/${villageId}/${channel}?${params.toString()}`);

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);
    ws.onerror = () => setIsConnected(false);
    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as Record<string, unknown>;
        setEvents((current) => [parsed, ...current].slice(0, 12));
      } catch {
        // Ignore malformed payloads from keep-alive frames.
      }
    };

    const heartbeat = window.setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send('ping');
      }
    }, 15000);

    return () => {
      window.clearInterval(heartbeat);
      ws.close();
    };
  }, [channel, villageId]);

  return { events, isConnected };
};
