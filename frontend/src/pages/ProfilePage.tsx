import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { alertService } from '../services/alertService';
import { predictionService } from '../services/predictionService';
import { villageService } from '../services/villageService';
import { formatDate } from '../utils/format';

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
    queryFn: () => alertService.list({ village_id: user?.village_id ?? undefined, status: 'active', limit: 20 }),
    enabled: Boolean(user?.village_id),
  });

  const predictionQuery = useQuery({
    queryKey: ['profile-prediction', user?.village_id],
    queryFn: () => predictionService.latest(user!.village_id!),
    enabled: Boolean(user?.village_id),
  });

  const watchedVillages = (villagesQuery.data ?? []).filter((village) =>
    savedVillageIds.includes(village.id),
  );

  return (
    <>
      <section className="content-card">
        <div className="inline-between">
          <div>
            <div className="eyebrow">Your account</div>
            <h1>{user?.name}</h1>
            <p className="section-subtitle">{user?.email}</p>
          </div>
          <StatusBadge value={user?.role ?? 'unknown'} />
        </div>
      </section>

      <section className="section metric-grid">
        <StatCard label="Joined" value={formatDate(user?.created_at)} />
        <StatCard label="Active alerts for your village" value={String(alertSummaryQuery.data?.length ?? 0)} />
        <StatCard label="Current village prediction" value={predictionQuery.data ? `${Math.round(predictionQuery.data.risk_score)}/100` : 'Not available'} />
      </section>

      <section className="section split-layout">
        <article className="content-card">
          <h2>Preferences</h2>
          <div className="stack">
            <div className="inline-between">
              <div>
                <strong>Language</strong>
                <p className="subtle">Current preference: {language}</p>
              </div>
              <select value={language} onChange={(e) => setLanguage(e.target.value as typeof language)}>
                <option value="en">English</option>
                <option value="hi">हिन्दी</option>
                <option value="bn">বাংলা</option>
                <option value="ta">தமிழ்</option>
                <option value="te">తెలుగు</option>
                <option value="mr">मराठी</option>
                <option value="gu">ગુજરાતી</option>
                <option value="kn">ಕನ್ನಡ</option>
                <option value="ml">മലയാളം</option>
                <option value="pa">ਪੰਜਾਬੀ</option>
                <option value="or">ଓଡ଼ିଆ</option>
                <option value="ur">اردو</option>
                <option value="as">অসমীয়া</option>
              </select>
            </div>
            <div className="inline-between">
              <div>
                <strong>Comfort mode</strong>
                <p className="subtle">Larger text and easier reading on this device</p>
              </div>
              <button type="button" className="secondary-button" onClick={toggleComfortMode}>
                {comfortMode ? 'Turn off' : 'Turn on'}
              </button>
            </div>
            <div className="inline-between">
              <div>
                <strong>Easy read mode</strong>
                <p className="subtle">Women, elderly users, and low-vision readers get larger controls and stronger readability.</p>
              </div>
              <button type="button" className="secondary-button" onClick={toggleAccessibilityMode}>
                {accessibilityMode ? 'Turn off' : 'Turn on'}
              </button>
            </div>
            <div className="inline-between">
              <div>
                <strong>Field mode</strong>
                <p className="subtle">Keeps village selections and service drafts ready for low-network situations.</p>
              </div>
              <button type="button" className="secondary-button" onClick={toggleFieldMode}>
                {fieldMode ? 'Turn off' : 'Turn on'}
              </button>
            </div>
            <div className="inline-between">
              <div>
                <strong>Current village</strong>
                <p className="subtle">{activeVillageId || user?.village_id || 'No village selected yet'}</p>
              </div>
              <Link className="ghost-button" to="/village-status">
                Open village status
              </Link>
            </div>
            <div className="inline-between">
              <div>
                <strong>Notification preference</strong>
                <p className="subtle">Live website updates remain enabled for your selected village.</p>
              </div>
            </div>
          </div>
        </article>

        <article className="content-card">
          <h2>Watched villages</h2>
          {watchedVillages.length ? (
            <div className="stack">
              {watchedVillages.map((village) => (
                <article key={village.id} className="alert-card">
                  <div className="inline-between">
                    <h4>{village.name}</h4>
                    <span className="subtle">
                      {village.district}, {village.state}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No watched villages saved yet"
              description="Use the Village Status page to save areas you want to follow."
            />
          )}
        </article>
      </section>

      <section className="section content-card">
        <div className="inline-between">
          <div>
            <h2>Account actions</h2>
            <p className="section-subtitle">Your website preferences are stored safely and can be adjusted anytime.</p>
          </div>
          <button
            type="button"
            className="ghost-button"
            onClick={() => logout()}
          >
            Logout
          </button>
        </div>
      </section>
    </>
  );
};
