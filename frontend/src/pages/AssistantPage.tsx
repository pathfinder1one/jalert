import { Activity, MapPinned, Send, ShieldCheck, Sparkles, User, Waves } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';

import { AssistantRobot } from '../components/AssistantRobot';
import { PageHero } from '../components/PageHero';
import { imagery } from '../assets/imagery';
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
      <PageHero
        eyebrow="JALERT AI Hub"
        title="Your dedicated village assistant"
        subtitle="Powered by live village data, with local AI responses when the configured model is available."
        image={imagery.report}
        badges={['Natural language Q&A', 'Live village context', 'Water and alert insights', 'Multilingual support']}
        primaryLabel="Open fullscreen chat"
        primaryTo="/chat"
        secondaryLabel="Open village status"
        secondaryTo="/village-status"
        statItems={[
          { label: 'Village', value: activeVillageId ? 'Linked' : 'Needed' },
          { label: 'Mode', value: responseModeLabel },
          { label: 'Turns', value: String(conversationTurnCount) },
        ]}
      />

      {!isAuthenticated ? (
        <section className="section">
          <LoginPrompt />
        </section>
      ) : (
        <section className="section">
          <div className="assistant-workspace">
            <div className="content-card assistant-chat-shell">
              <div className="assistant-chat-hero">
                <div className="assistant-chat-hero-main">
                  <div className="assistant-chat-avatar-stack">
                    <AssistantRobot size="md" showCredit />
                    <div className="assistant-chat-presence">
                      <span className="assistant-status-dot" />
                      Monitoring live village signals
                    </div>
                  </div>

                  <div className="assistant-chat-copy">
                    <p className="assistant-chat-kicker">AI field desk</p>
                    <h2>JALERT Robot Assistant</h2>
                    <p className="assistant-chat-lede">
                      Ask about water safety, disease signals, recent alerts, and next actions. This
                      workspace is tuned for fast village-level decisions instead of generic chatbot
                      replies.
                    </p>

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
                  </div>
                </div>

                <div className="assistant-prompt-strip">
                  <span className="assistant-prompt-strip-label">Try a sharper ask</span>
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
                    className={`assistant-bubble-row ${msg.role === 'user' ? 'is-user' : 'is-assistant'}`}
                  >
                    {msg.role === 'user' ? (
                      <div className="assistant-user-avatar">
                        <User size={18} />
                      </div>
                    ) : (
                      <AssistantRobot size="sm" className="assistant-message-avatar" />
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
                    <AssistantRobot size="sm" className="assistant-message-avatar" />
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
                <p className="assistant-sidebar-eyebrow">Village context</p>
                <h3>Designed for fast field answers</h3>
                <p className="assistant-sidebar-copy">
                  The assistant works best when your question includes a timeframe, a location, and a
                  signal such as water source, symptoms, or alert type.
                </p>
                <div className="assistant-mini-metrics">
                  <div className="assistant-mini-card">
                    <span>Village</span>
                    <strong>{activeVillageId ? 'Linked' : 'Needed'}</strong>
                  </div>
                  <div className="assistant-mini-card">
                    <span>Role</span>
                    <strong>{roleLabel}</strong>
                  </div>
                  <div className="assistant-mini-card">
                    <span>Turns</span>
                    <strong>{conversationTurnCount || 'New'}</strong>
                  </div>
                </div>
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

              <div className="content-card assistant-sidebar-card">
                <p className="assistant-sidebar-eyebrow">Prompt tips</p>
                <ul className="assistant-tip-list">
                  <li>Mention a window like today, last 7 days, or this monsoon for sharper answers.</li>
                  <li>Ask for next steps when you need action, not just a summary.</li>
                  <li>Include the signal you care about: water source, symptoms, alert level, or village risk.</li>
                </ul>
              </div>
            </aside>
          </div>
        </section>
      )}
    </>
  );
};
