import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
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
import toast from 'react-hot-toast';
import { EmptyState } from '../components/EmptyState';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { authService } from '../services/authService';
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
  const { user, logout, refreshProfile } = useAuth();
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
    emailNotifications,
    toggleEmailNotifications,
    smsNotifications,
    toggleSmsNotifications,
    voiceNotifications,
    toggleVoiceNotifications,
    dailySummaryEnabled,
    toggleDailySummaryEnabled,
  } = usePreferences();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    setName(user?.name ?? '');
    setPhone(user?.phone ?? '');
  }, [user?.name, user?.phone]);

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

  const profileMutation = useMutation({
    mutationFn: async () =>
      authService.updateProfile({
        name,
        phone: phone || null,
        preferred_language: language,
      }),
    onSuccess: async () => {
      await refreshProfile();
      toast.success('Profile updated.');
    },
    onError: () => {
      toast.error('Profile could not be updated.');
    },
  });

  const passwordMutation = useMutation({
    mutationFn: async () =>
      authService.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      toast.success('Password changed.');
    },
    onError: () => {
      toast.error('Password change failed.');
    },
  });

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
            <div className="form-grid two">
              <div className="field">
                <label htmlFor="profile-name">Full name</label>
                <input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="profile-phone">Phone</label>
                <input id="profile-phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
              </div>
            </div>

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
            <div className="helper-row">
              <button
                type="button"
                className="primary-button"
                onClick={() => profileMutation.mutate()}
                disabled={profileMutation.isPending || !name.trim()}
              >
                Save profile
              </button>
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
                <p className="subtle">These settings now sync with your account and delivery preferences.</p>
              </div>
            </div>

            <div className="profile-pref-row">
              <div className="profile-pref-copy">
                <span className="profile-pref-label">
                  <Bell size={18} />
                  Email alerts
                </span>
                <p className="subtle">Receive account-level summary notifications by email when available.</p>
              </div>
              <button
                type="button"
                className={`profile-toggle ${emailNotifications ? 'active' : ''}`}
                onClick={toggleEmailNotifications}
              >
                {emailNotifications ? 'On' : 'Off'}
              </button>
            </div>

            <div className="profile-pref-row">
              <div className="profile-pref-copy">
                <span className="profile-pref-label">
                  <Bell size={18} />
                  SMS alerts
                </span>
                <p className="subtle">Use SMS for high-severity warnings when field connectivity is mixed.</p>
              </div>
              <button
                type="button"
                className={`profile-toggle ${smsNotifications ? 'active' : ''}`}
                onClick={toggleSmsNotifications}
              >
                {smsNotifications ? 'On' : 'Off'}
              </button>
            </div>

            <div className="profile-pref-row">
              <div className="profile-pref-copy">
                <span className="profile-pref-label">
                  <Bell size={18} />
                  Voice alerts
                </span>
                <p className="subtle">Critical alerts can trigger voice-call delivery for urgent outreach.</p>
              </div>
              <button
                type="button"
                className={`profile-toggle ${voiceNotifications ? 'active' : ''}`}
                onClick={toggleVoiceNotifications}
              >
                {voiceNotifications ? 'On' : 'Off'}
              </button>
            </div>

            <div className="profile-pref-row">
              <div className="profile-pref-copy">
                <span className="profile-pref-label">
                  <Bell size={18} />
                  Daily summary
                </span>
                <p className="subtle">Keep a short in-app daily operations summary ready each morning.</p>
              </div>
              <button
                type="button"
                className={`profile-toggle ${dailySummaryEnabled ? 'active' : ''}`}
                onClick={toggleDailySummaryEnabled}
              >
                {dailySummaryEnabled ? 'On' : 'Off'}
              </button>
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
              <Link className="ghost-button" to="/notifications">
                Notification inbox
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

          <article className="content-card">
            <div className="profile-section-head">
              <div>
                <h2>Security</h2>
                <p className="section-subtitle">Change your password and keep the account ready for shared devices.</p>
              </div>
            </div>
            <div className="form-grid two">
              <div className="field">
                <label htmlFor="current-password">Current password</label>
                <input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="new-password">New password</label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </div>
            </div>
            <div className="helper-row">
              <button
                type="button"
                className="primary-button"
                onClick={() => passwordMutation.mutate()}
                disabled={passwordMutation.isPending || newPassword.length < 8 || currentPassword.length < 8}
              >
                Change password
              </button>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
};
