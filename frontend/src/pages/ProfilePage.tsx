import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  CalendarDays,
  Globe2,
  LogOut,
  Mail,
  MapPin,
  Phone,
  Settings2,
  ShieldCheck,
  Waves,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { alertService } from '../services/alertService';
import { predictionService } from '../services/predictionService';
import { villageService } from '../services/villageService';
import { formatDate, sentenceCase } from '../utils/format';

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'bn', label: 'Bangla' },
  { value: 'ta', label: 'Tamil' },
  { value: 'te', label: 'Telugu' },
  { value: 'mr', label: 'Marathi' },
  { value: 'gu', label: 'Gujarati' },
  { value: 'kn', label: 'Kannada' },
  { value: 'ml', label: 'Malayalam' },
  { value: 'pa', label: 'Punjabi' },
  { value: 'or', label: 'Odia' },
  { value: 'ur', label: 'Urdu' },
  { value: 'as', label: 'Assamese' },
] as const;

export const ProfilePage = () => {
  const { user, logout } = useAuth();
  const {
    comfortMode,
    toggleComfortMode,
    fieldMode,
    toggleFieldMode,
    accessibilityMode,
    toggleAccessibilityMode,
    savedVillageIds,
    activeVillageId,
    language,
    setLanguage,
  } = usePreferences();

  const villagesQuery = useQuery({
    queryKey: ['villages-profile'],
    queryFn: villageService.list,
    enabled: true,
  });

  const alertSummaryQuery = useQuery({
    queryKey: ['profile-alert-summary', user?.village_id],
    queryFn: () =>
      alertService.list({ village_id: user?.village_id ?? undefined, status: 'active', limit: 20 }),
    enabled: Boolean(user?.village_id),
  });

  const predictionQuery = useQuery({
    queryKey: ['profile-prediction', user?.village_id],
    queryFn: () => predictionService.latest(user!.village_id!),
    enabled: Boolean(user?.village_id),
  });

  const villages = villagesQuery.data ?? [];
  const watchedVillages = villages.filter((village) => savedVillageIds.includes(village.id));
  const activeVillage =
    villages.find((village) => village.id === activeVillageId)
    ?? villages.find((village) => village.id === user?.village_id)
    ?? null;
  const initials = (user?.name ?? 'J A')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  const languageLabel =
    LANGUAGE_OPTIONS.find((option) => option.value === language)?.label ?? 'English';
  const predictionSummary = predictionQuery.data
    ? `${Math.round(predictionQuery.data.risk_score)}/100`
    : 'Awaiting assessment';
  const predictionHelper = predictionQuery.data
    ? `${sentenceCase(predictionQuery.data.risk_category)} risk`
    : activeVillage
      ? `For ${activeVillage.name}`
      : 'Choose a village to start monitoring';
  const currentVillageLabel = activeVillage
    ? `${activeVillage.name}, ${activeVillage.district}, ${activeVillage.state}`
    : 'No village selected yet';

  return (
    <div className="profile-page">
      <section className="content-card profile-hero-card">
        <div className="profile-hero-shell">
          <div className="profile-avatar" aria-hidden="true">
            {initials}
          </div>

          <div className="profile-hero-copy">
            <div className="eyebrow">Your account</div>
            <h1>{user?.name}</h1>
            <p className="section-subtitle">{user?.email}</p>

            <div className="profile-meta-row">
              <span className="profile-meta-pill">
                <CalendarDays size={16} />
                Joined {formatDate(user?.created_at)}
              </span>
              <span className="profile-meta-pill">
                <Phone size={16} />
                {user?.phone || 'Phone not added yet'}
              </span>
              <span className="profile-meta-pill">
                <MapPin size={16} />
                {currentVillageLabel}
              </span>
            </div>
          </div>

          <div className="profile-hero-side">
            <div className="profile-role-wrap">
              <StatusBadge value={user?.role ?? 'unknown'} />
            </div>
            <div className="profile-hero-summary">
              <span className="eyebrow profile-mini-eyebrow">Current village</span>
              <strong>{activeVillage?.name || 'Choose a village'}</strong>
              <p className="subtle">
                {activeVillage
                  ? `${activeVillage.district}, ${activeVillage.state}`
                  : 'Link a village to get alerts, reports, and predictions here.'}
              </p>
              <Link className="ghost-button" to="/village-status">
                Open village status
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section metric-grid">
        <StatCard
          label="Watched villages"
          value={String(watchedVillages.length)}
          helper={watchedVillages.length ? 'Saved for quick follow-up' : 'Start saving villages to track them here'}
        />
        <StatCard
          label="Active alerts"
          value={String(alertSummaryQuery.data?.length ?? 0)}
          helper={activeVillage ? `For ${activeVillage.name}` : 'Choose a village for live alert counts'}
        />
        <StatCard
          label="Village prediction"
          value={predictionSummary}
          helper={predictionHelper}
        />
      </section>

      <section className="section split-layout profile-main-grid">
        <article className="content-card profile-panel-card">
          <div className="profile-section-head">
            <div>
              <h2>Profile details</h2>
              <p className="section-subtitle">
                A cleaner summary of your identity, village access, and reading preferences.
              </p>
            </div>
          </div>

          <div className="mini-grid profile-detail-grid">
            <div className="profile-detail-item">
              <span className="profile-detail-label">
                <Mail size={16} />
                Email
              </span>
              <strong>{user?.email}</strong>
            </div>
            <div className="profile-detail-item">
              <span className="profile-detail-label">
                <Phone size={16} />
                Phone
              </span>
              <strong>{user?.phone || 'Not added yet'}</strong>
            </div>
            <div className="profile-detail-item">
              <span className="profile-detail-label">
                <ShieldCheck size={16} />
                Role
              </span>
              <strong>{sentenceCase(user?.role ?? 'public')}</strong>
            </div>
            <div className="profile-detail-item">
              <span className="profile-detail-label">
                <Globe2 size={16} />
                Language
              </span>
              <strong>{languageLabel}</strong>
            </div>
            <div className="profile-detail-item">
              <span className="profile-detail-label">
                <MapPin size={16} />
                Current village
              </span>
              <strong>{activeVillage?.name || 'Not selected yet'}</strong>
              <p className="subtle">
                {activeVillage
                  ? `${activeVillage.district}, ${activeVillage.state}`
                  : 'Link a village to see reports and predictions.'}
              </p>
            </div>
            <div className="profile-detail-item">
              <span className="profile-detail-label">
                <CalendarDays size={16} />
                Joined
              </span>
              <strong>{formatDate(user?.created_at)}</strong>
            </div>
          </div>

          <div className="profile-pref-stack">
            <div className="profile-pref-row">
              <div className="profile-pref-copy">
                <span className="profile-pref-label">
                  <Globe2 size={18} />
                  Language
                </span>
                <p className="subtle">Choose the language you want JALERT to prefer across the site.</p>
              </div>
              <select value={language} onChange={(e) => setLanguage(e.target.value as typeof language)}>
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="profile-pref-row">
              <div className="profile-pref-copy">
                <span className="profile-pref-label">
                  <Settings2 size={18} />
                  Comfort mode
                </span>
                <p className="subtle">Larger text and calmer spacing for easier reading on this device.</p>
              </div>
              <button
                type="button"
                className={`profile-toggle ${comfortMode ? 'active' : ''}`}
                onClick={toggleComfortMode}
              >
                {comfortMode ? 'On' : 'Off'}
              </button>
            </div>

            <div className="profile-pref-row">
              <div className="profile-pref-copy">
                <span className="profile-pref-label">
                  <ShieldCheck size={18} />
                  Easy read mode
                </span>
                <p className="subtle">Bigger controls and stronger readability for low-vision friendly use.</p>
              </div>
              <button
                type="button"
                className={`profile-toggle ${accessibilityMode ? 'active' : ''}`}
                onClick={toggleAccessibilityMode}
              >
                {accessibilityMode ? 'On' : 'Off'}
              </button>
            </div>

            <div className="profile-pref-row">
              <div className="profile-pref-copy">
                <span className="profile-pref-label">
                  <Waves size={18} />
                  Field mode
                </span>
                <p className="subtle">Keeps village selections and service drafts ready for low-network situations.</p>
              </div>
              <button
                type="button"
                className={`profile-toggle ${fieldMode ? 'active' : ''}`}
                onClick={toggleFieldMode}
              >
                {fieldMode ? 'On' : 'Off'}
              </button>
            </div>

            <div className="profile-pref-row static">
              <div className="profile-pref-copy">
                <span className="profile-pref-label">
                  <Bell size={18} />
                  Notifications
                </span>
                <p className="subtle">Live website alerts stay enabled for the village currently linked to your profile.</p>
              </div>
            </div>
          </div>
        </article>

        <div className="stack">
          <article className="content-card profile-villages-card">
            <div className="profile-section-head">
              <div>
                <h2>Watched villages</h2>
                <p className="section-subtitle">The places you are following for alerts, status, and reports.</p>
              </div>
            </div>

            {watchedVillages.length ? (
              <div className="stack profile-village-list">
                {watchedVillages.map((village) => (
                  <article key={village.id} className="profile-village-card">
                    <div className="profile-village-top">
                      <div>
                        <h4>{village.name}</h4>
                        <p className="subtle">{village.district}, {village.state}</p>
                      </div>
                      <span className={`status-badge ${village.id === activeVillage?.id ? 'active' : 'neutral'}`}>
                        {village.id === activeVillage?.id ? 'Current' : 'Saved'}
                      </span>
                    </div>
                    <Link className="ghost-button" to="/village-status">
                      Open village
                    </Link>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No watched villages saved yet"
                description="Use the Village Status page to save the areas you want to keep an eye on."
              />
            )}
          </article>

          <article className="content-card profile-actions-card">
            <div className="profile-section-head">
              <div>
                <h2>Quick actions</h2>
                <p className="section-subtitle">Jump back into your village workflow or sign out safely.</p>
              </div>
            </div>

            <div className="profile-actions-row">
              <Link className="secondary-button" to="/village-status">
                Open village dashboard
              </Link>
              <Link className="ghost-button" to="/alerts">
                View alerts
              </Link>
              <button type="button" className="ghost-button profile-logout-button" onClick={() => logout()}>
                <LogOut size={16} />
                Logout
              </button>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
};
