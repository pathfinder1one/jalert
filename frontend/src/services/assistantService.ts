import { http } from './http';
import type { AssistantReply, UserRole } from '../types/api';

interface AssistantContext {
  villageId?: string | null;
  role?: UserRole;
  isAuthenticated: boolean;
  history?: { role: string; content: string }[];
}

export const assistantService = {
  async respond(message: string, context: AssistantContext): Promise<AssistantReply> {
    const payload = {
      message,
      village_id: context.villageId || null,
      history: context.history || [],
    };

    const requestConfig = {
      // 2 minutes timeout for LLM generation
      timeout: 120000, 
    };

    try {
      const response = await http.post('/chat', payload, requestConfig);
      return {
        id: response.data.id || String(Date.now()),
        text: response.data.text,
        mode: response.data.mode,
        notice: response.data.notice,
      };
    } catch (error) {
      console.error('Chatbot API Error:', error);
      throw error;
    }
  },
};
