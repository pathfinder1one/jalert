import { Mic, Send, Volume2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

import { AssistantRobot } from './AssistantRobot';
import { assistantService } from '../services/assistantService';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import type { AssistantReply } from '../types/api';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  length: number;
}

interface SpeechRecognitionEventLike extends Event {
  results: SpeechRecognitionResultLike[];
}

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
}

interface BrowserWindowWithSpeech extends Window {
  SpeechRecognition?: new () => SpeechRecognitionInstance;
  webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
}

const suggestions = [
  'Show my village alerts',
  'Explain this prediction',
  'How safe is the water?',
  'Download my report',
];

const createMessageId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const AssistantWidget = () => {
  const { t } = useTranslation();
  const { user, isAuthenticated } = useAuth();
  const { activeVillageId, language } = usePreferences();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [messages, setMessages] = useState<AssistantReply[]>([
    {
      id: 'welcome',
      text: 'I can guide you to alerts, village status, predictions, water safety, and reports.',
    },
  ]);
  const lastBotMessage = useMemo(
    () => [...messages].reverse().find((item, index) => (index === 0 ? true : true)),
    [messages],
  );

  const handleSpeak = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !lastBotMessage?.text) {
      toast.error('Voice playback is not supported in this browser.');
      return;
    }
    const utterance = new SpeechSynthesisUtterance(lastBotMessage.text);
    utterance.lang = language === 'hi' ? 'hi-IN' : 'en-IN';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const handleVoiceInput = () => {
    if (typeof window === 'undefined') {
      return;
    }
    const speechWindow = window as BrowserWindowWithSpeech;
    const SpeechRecognitionApi =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognitionApi) {
      toast.error('Voice input is not supported in this browser.');
      return;
    }
    const recognition = new SpeechRecognitionApi();
    recognition.lang = language === 'hi' ? 'hi-IN' : 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setIsListening(true);
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      const transcript = event.results?.[0]?.[0]?.transcript ?? '';
      setMessage(transcript);
      setIsListening(false);
    };
    recognition.onerror = () => {
      setIsListening(false);
      toast.error('Voice input could not be captured.');
    };
    recognition.onend = () => {
      setIsListening(false);
    };
    recognition.start();
  };

  const handleSend = async (value: string) => {
    if (!value.trim()) {
      return;
    }

    setMessages((current) => [...current, { id: createMessageId(), text: value }]);
    setMessage('');
    setIsThinking(true);

    try {
      const reply = await assistantService.respond(value, {
        villageId: activeVillageId,
        role: user?.role,
        isAuthenticated,
      });
      setMessages((current) => [...current, reply]);
    } catch (error) {
      toast.error('The assistant could not complete that request right now.');
      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          text: 'I could not fetch that information right now. Please try again or open the page directly.',
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <>
      {isOpen ? (
        <aside className="assistant-panel">
          <div className="inline-between">
            <div className="assistant-widget-header">
              <AssistantRobot size="sm" className="assistant-widget-robot" />
              <div>
              <h3>{t('assistant.title')}</h3>
              <p className="subtle">{t('assistant.subtitle')}</p>
              </div>
            </div>
            <button type="button" className="ghost-button" onClick={() => setIsOpen(false)}>
              Close
            </button>
          </div>

          <div className="suggested-prompts">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="link-chip"
                onClick={() => handleSend(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>

          <div className="assistant-messages">
            {messages.map((item, index) => {
              const isUser = index > 0 && index % 2 === 1;
              return (
                <div key={item.id} className={`assistant-bubble ${isUser ? 'user' : 'bot'}`}>
                  <div>{item.text}</div>
                  {item.links?.length ? (
                    <div className="assistant-links">
                      {item.links.map((link) =>
                        link.href.startsWith('/') ? (
                          <Link key={link.href} className="link-chip" to={link.href}>
                            {link.label}
                          </Link>
                        ) : (
                          <a
                            key={link.href}
                            className="link-chip"
                            href={link.href}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {link.label}
                          </a>
                        ),
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {isThinking ? <div className="assistant-bubble bot">Checking the latest village information...</div> : null}
          </div>

          <form
            className="helper-row"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSend(message);
            }}
          >
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Ask about alerts, reports, or water safety"
            />
            <button type="button" className="ghost-button" onClick={handleVoiceInput} disabled={isListening}>
              <Mic size={16} />
            </button>
            <button type="button" className="ghost-button" onClick={handleSpeak}>
              <Volume2 size={16} />
            </button>
            <button type="submit" className="primary-button" disabled={isThinking}>
              <Send size={16} />
            </button>
          </form>
          {isListening ? <p className="subtle">Listening in {language === 'hi' ? 'Hindi' : 'English'}...</p> : null}
        </aside>
      ) : null}

      <button
        type="button"
        className="assistant-fab"
        aria-label="Open AI assistant"
        onClick={() => setIsOpen(true)}
      >
        <span className="assistant-fab-ring" />
        <AssistantRobot size="sm" className="assistant-fab-robot" />
      </button>
    </>
  );
};
