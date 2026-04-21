import { useQuery } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router-dom';
import { ClipboardList, FileStack, ShieldCheck, Siren, Users, Waves } from 'lucide-react';

import { PageHero } from '../components/PageHero';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { imagery } from '../assets/imagery';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { villageService } from '../services/villageService';
import { formatDate, formatNumber, sentenceCase } from '../utils/format';

const adminCards = [
  {
    title: 'Operations queue',
    text: 'Check which villages need report publishing, response follow-up, or verification after new sensor uploads.',
    icon: ClipboardList,
    link: '/reports',
    action: 'Open reports',
  },
  {
    title: 'Alert supervision',
    text: 'Review unresolved warnings, compare risk levels, and coordinate follow-up with local health workers.',
    icon: Siren,
    link: '/alerts',
    action: 'Open alerts',
  },
  {
    title: 'Village oversight',
    text: 'Inspect profile data, water quality trends, and public-facing summaries before sharing them widely.',
    icon: Waves,
    link: '/village-profile',
    action: 'Open villages',
  },
];

export const AdminPortalPage = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { activeVillageId } = usePreferences();

  const villagesQuery = useQuery({
    queryKey: ['admin-villages'],
    queryFn: villageService.list,
    enabled: isAuthenticated && user?.role === 'admin',
    staleTime: 300_000,
  });

  const dashboardQuery = useQuery({
    queryKey: ['admin-dashboard', activeVillageId],
    queryFn: () => villageService.getDashboard(activeVillageId!),
    enabled: isAuthenticated && user?.role === 'admin' && !!activeVillageId,
    staleTime: 60_000,
  });

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate replace to="/admin/login" />;
  }

  if (user?.role !== 'admin') {
    return <Navigate replace to="/" />;
  }

  const villageCount = villagesQuery.data?.length ?? 0;
  const riskCategory = dashboardQuery.data?.risk.category ?? 'unknown';
  const riskScore = dashboardQuery.data?.risk.score;
  const qualityScore = dashboardQuery.data?.latest_sensor.quality_score;
  const activeAlerts = dashboardQuery.data?.active_alerts.length ?? 0;

  return (
    <>
      <PageHero
        eyebrow="Administrator portal"
        title="Govern village reporting, alerts, and response from one place"
        subtitle="This portal is reserved for administrators who publish reports, supervise alerts, and keep village data ready for field teams."
        image={imagery.fieldWorker}
        badges={['Report publishing', 'Alert supervision', 'Village oversight', 'Secure admin workspace']}
        primaryLabel="Manage reports"
        primaryTo="/reports"
        secondaryLabel="Review alerts"
        secondaryTo="/alerts"
      />

      <section className="section content-card admin-portal-hero">
        <div>
          <div className="eyebrow">Signed in</div>
          <h2>{user.name}</h2>
          <p className="section-subtitle">{user.email} | Joined {formatDate(user.created_at)}</p>
        </div>
        <div className="admin-badge-line">
          <StatusBadge value={user.role} />
          <span className="admin-portal-chip">
            <ShieldCheck size={16} />
            Separate administrator workspace
          </span>
        </div>
      </section>

      <section className="section metric-grid">
        <StatCard
          label="Villages in oversight"
          value={villageCount ? formatNumber(villageCount, 0) : '0'}
          helper="Connected from the active village catalog"
        />
        <StatCard
          label="Active alerts in current focus"
          value={String(activeAlerts)}
          helper={dashboardQuery.data?.village.name ? `${dashboardQuery.data.village.name} is selected` : 'Select a village to inspect live alerts'}
        />
        <StatCard
          label="Latest water quality score"
          value={qualityScore != null ? formatNumber(qualityScore) : 'Pending'}
          helper="Pulled from the live monitoring snapshot"
        />
        <StatCard
          label="Current risk posture"
          value={riskScore != null ? `${formatNumber(riskScore)}/100` : 'Unknown'}
          helper={`Category: ${sentenceCase(riskCategory)}`}
        />
      </section>

      <section className="section admin-portal-grid">
        {adminCards.map((card) => (
          <article key={card.title} className="content-card admin-panel-card">
            <div className="admin-panel-icon">
              <card.icon size={22} />
            </div>
            <h3>{card.title}</h3>
            <p>{card.text}</p>
            <Link className="secondary-button" to={card.link}>
              {card.action}
            </Link>
          </article>
        ))}
      </section>

      <section className="section split-layout">
        <article className="content-card">
          <div className="inline-between">
            <div>
              <div className="eyebrow">Reporting readiness</div>
              <h2>Publishing checklist</h2>
            </div>
            <FileStack size={20} />
          </div>
          <ul className="action-list">
            <li>Confirm the active village has a current monitoring window before exporting PDFs.</li>
            <li>Use the Reports page sample library to demonstrate expected report formats to staff.</li>
            <li>Review Alerts before sharing an annual or disease-surveillance summary outside the team.</li>
          </ul>
        </article>

        <article className="content-card">
          <div className="inline-between">
            <div>
              <div className="eyebrow">Portal notes</div>
              <h2>Administrator safeguards</h2>
            </div>
            <Users size={20} />
          </div>
          <ul className="action-list">
            <li>The administrator login is intentionally separate from the regular user login page.</li>
            <li>Only accounts with the `admin` role can open this workspace.</li>
            <li>Health workers and public users continue to use the standard app pages and report restrictions.</li>
          </ul>
        </article>
      </section>
    </>
  );
};
