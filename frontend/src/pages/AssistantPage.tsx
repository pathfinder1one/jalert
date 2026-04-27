import { Activity, MapPinned, Send, ShieldCheck, Sparkles, User, Waves } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';

import { AssistantRobot } from '../components/AssistantRobot';
import { LoginPrompt } from '../components/LoginPrompt';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { assistantService } from '../services/assistantService';

type ChatEntry = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  mode?: 'llm' | 'local_fallback';
  notice?: string | null;
};

const quickPrompts = [
  {
    label: 'Water quality snapshot',
    prompt: 'Give me a quick summary of the latest water quality risks for my village.',
  },
  {
    label: 'Recent alerts',
    prompt: 'What are the most recent alerts and what should field workers do first?',
  },
  {
    label: 'Disease signal check',
    prompt: 'Are there any disease patterns or outbreak signals I should know about right now?',
  },
];

const toTitleCase = (value: string) => value.replace(/\b\w/g, (char) => char.toUpperCase());

const getEntryStatus = (entry: ChatEntry) => {
  if (entry.role === 'user') {
    return 'Field message';
  }

  if (entry.mode === 'llm') {
    return 'Live AI';
  }

  if (entry.mode === 'local_fallback') {
    return 'Local fallback';
  }

  return 'Context ready';
};

export const AssistantPage = () => {
  const { isAuthenticated, user } = useAuth();
  const { activeVillageId } = usePreferences();

  const [message, setMessage] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [history, setHistory] = useState<ChatEntry[]>([
    {
      id: 'greeting',
      role: 'assistant',
      text: "Hello! I'm the JALERT AI Assistant. I can help you analyze village risk data, check recent alerts, and understand water quality metrics. How can I help you today?",
    },
  ]);

  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, isThinking]);

  const conversationTurnCount = history.filter((entry) => entry.id !== 'greeting').length;
  const latestAssistantMode = [...history]
    .reverse()
    .find((entry) => entry.role === 'assistant' && entry.mode)?.mode;
  const responseModeLabel =
    latestAssistantMode === 'llm'
      ? 'Live AI'
      : latestAssistantMode === 'local_fallback'
        ? 'Local fallback'
        : 'Adaptive';
  const roleLabel = user?.role ? toTitleCase(user.role.replace(/_/g, ' ')) : 'Field User';

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!message.trim()) return;

    if (!isAuthenticated) {
      toast.error("Please log in to use the AI Assistant.");
      return;
    }

    const unformattedMsg = message.trim();
    setMessage('');
    
    // Optimistic UI
    const tempUserId = `user-${Date.now()}`;
    setHistory(prev => [...prev, { id: tempUserId, role: 'user', text: unformattedMsg }]);
    setIsThinking(true);

    try {
      // Map history format to what the backend expects
      const backendHistory = history
        .filter(h => h.id !== 'greeting')
        .map(h => ({
          role: h.role,
          content: h.text,
        }));

      const reply = await assistantService.respond(unformattedMsg, {
        villageId: activeVillageId,
        role: user?.role,
        isAuthenticated,
        history: backendHistory,
      });

      setHistory(prev => [
        ...prev,
        {
          id: reply.id,
          role: 'assistant',
          text: reply.text,
          mode: reply.mode,
          notice: reply.notice,
        },
      ]);
    } catch (error) {
      setHistory(prev => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          text: 'I could not reach the assistant service just now. Please try again in a moment.',
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <>
      {!isAuthenticated ? (
        <section className="section">
          <LoginPrompt />
        </section>
      ) : (
        <section className="section assistant-page-shell">
          <div className="assistant-workspace">
            <div className="content-card assistant-chat-shell">
              <div className="assistant-chat-hero">
                <div className="assistant-chat-hero-main">
                  <div className="assistant-chat-copy assistant-chat-copy-compact">
                    <div className="assistant-chat-topbar">
                      <p className="assistant-chat-kicker">JALERT AI desk</p>
                      <div className="assistant-chat-presence">
                        <span className="assistant-status-dot" />
                        Monitoring live village signals
                      </div>
                    </div>

                    <h1 className="assistant-chat-title">Village assistant</h1>
                    <p className="assistant-chat-lede">
                      Ask about water contamination, outbreaks, recent alerts, and practical next
                      steps with village context already attached.
                    </p>
                  </div>

                  <div className="assistant-chat-side-actions">
                    <Link to="/village-status" className="assistant-chat-action-link">
                      Open village status
                    </Link>
                    <Link to="/feature-center" className="assistant-chat-action-link ghost">
                      Explore tools
                    </Link>
                  </div>
                </div>

                <div className="assistant-chat-summary-row">
                  <div className="assistant-chat-summary-card">
                    <span>Village</span>
                    <strong>{activeVillageId ? 'Linked' : 'Needed'}</strong>
                  </div>
                  <div className="assistant-chat-summary-card">
                    <span>Mode</span>
                    <strong>{responseModeLabel}</strong>
                  </div>
                  <div className="assistant-chat-summary-card">
                    <span>Role</span>
                    <strong>{roleLabel}</strong>
                  </div>
                </div>

                <div className="assistant-chat-pill-row">
                  <span className="assistant-chat-pill">
                    <MapPinned size={16} />
                    {activeVillageId ? 'Village context linked' : 'Choose a village for grounded answers'}
                  </span>
                  <span className="assistant-chat-pill">
                    <Sparkles size={16} />
                    {responseModeLabel} responses
                  </span>
                  <span className="assistant-chat-pill">
                    <ShieldCheck size={16} />
                    Water and health safe-ops support
                  </span>
                </div>

                <div className="assistant-prompt-strip">
                  <span className="assistant-prompt-strip-label">Start with one of these</span>
                  <div className="assistant-prompt-list">
                    {quickPrompts.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        className="assistant-prompt-chip"
                        onClick={() => setMessage(item.prompt)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="assistant-chat-log wrapper-scroll">
                {history.map((msg) => (
                  <article
                    key={msg.id}
                    className={`assistant-bubble-row ${msg.role === 'user' ? 'is-user' : 'is-assistant'} ${msg.id === 'greeting' ? 'is-welcome' : ''}`}
                  >
                    {msg.role === 'user' ? (
                      <div className="assistant-user-avatar">
                        <User size={18} />
                      </div>
                    ) : (
                      <AssistantRobot size="sm" mode="still" className="assistant-message-avatar" />
                    )}

                    <div className="assistant-message-bubble">
                      <div className="assistant-message-meta">
                        <span>{msg.role === 'assistant' ? 'JALERT assistant' : 'You'}</span>
                        <span>{getEntryStatus(msg)}</span>
                      </div>
                      <p className="assistant-message-text">{msg.text}</p>
                      {msg.role === 'assistant' && msg.notice ? (
                        <div className="assistant-message-notice">{msg.notice}</div>
                      ) : null}
                    </div>
                  </article>
                ))}

                {isThinking ? (
                  <article className="assistant-bubble-row is-assistant">
                    <AssistantRobot size="sm" mode="still" className="assistant-message-avatar" />
                    <div className="assistant-message-bubble assistant-thinking-bubble">
                      <div className="assistant-message-meta">
                        <span>JALERT assistant</span>
                        <span>Analyzing</span>
                      </div>
                      <div className="assistant-thinking-line">
                        <span className="assistant-thinking-dots" aria-hidden="true">
                          <span />
                          <span />
                          <span />
                        </span>
                        <span>Reviewing village context and preparing a response...</span>
                      </div>
                    </div>
                  </article>
                ) : null}
                <div ref={endOfMessagesRef} />
              </div>

              <form onSubmit={handleSend} className="assistant-composer">
                <div className="assistant-composer-field">
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Ask about water contamination, outbreak signals, or recent alerts..."
                    disabled={isThinking}
                    className="assistant-composer-input"
                  />
                  <span className="assistant-composer-hint">Press Enter to send</span>
                </div>
                <button
                  type="submit"
                  className="primary-button assistant-send-button"
                  disabled={isThinking || !message.trim()}
                >
                  <span>Send</span>
                  <Send size={16} />
                </button>
              </form>
            </div>

            <aside className="assistant-sidebar">
              <div className="content-card assistant-sidebar-card assistant-sidebar-spotlight">
                <p className="assistant-sidebar-eyebrow">Ask better</p>
                <h3>Make the question specific</h3>
                <p className="assistant-sidebar-copy">
                  The best answers include a timeframe, a location, and the signal you care about.
                </p>
                <ul className="assistant-tip-list">
                  <li>Say when: today, last 7 days, this monsoon, or this week.</li>
                  <li>Say where: village, ward, source, or health area.</li>
                  <li>Say what: water quality, symptoms, alerts, or risk level.</li>
                </ul>
              </div>

              <div className="content-card assistant-sidebar-card">
                <p className="assistant-sidebar-eyebrow">Coverage</p>
                <div className="assistant-capability-list">
                  <div className="assistant-capability-item">
                    <div className="assistant-capability-icon">
                      <Waves size={18} />
                    </div>
                    <div className="assistant-capability-copy">
                      <strong>Water safety</strong>
                      <span>Summarize contamination trends, unsafe readings, and source-level risk.</span>
                    </div>
                  </div>

                  <div className="assistant-capability-item">
                    <div className="assistant-capability-icon">
                      <Activity size={18} />
                    </div>
                    <div className="assistant-capability-copy">
                      <strong>Disease monitoring</strong>
                      <span>Check symptom patterns, outbreak signals, and pressure on local response teams.</span>
                    </div>
                  </div>

                  <div className="assistant-capability-item">
                    <div className="assistant-capability-icon">
                      <MapPinned size={18} />
                    </div>
                    <div className="assistant-capability-copy">
                      <strong>Village risk context</strong>
                      <span>Connect alerts, water quality, and village conditions into one readable answer.</span>
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </section>
      )}
    </>
  );
};
