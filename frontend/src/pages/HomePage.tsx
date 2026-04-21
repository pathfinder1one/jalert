import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowRight, BellRing, Droplets, HeartPulse, ShieldCheck, Waves, Bot } from 'lucide-react';
import { Link } from 'react-router-dom';
import { imagery } from '../assets/imagery';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { PageHero } from '../components/PageHero';
import { Reveal } from '../components/Reveal';
import { SectionHeader } from '../components/SectionHeader';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { villageService } from '../services/villageService';
import { formatDate, formatNumber, sentenceCase } from '../utils/format';

const showcaseCards = [
  {
    icon: Droplets,
    kicker: 'Water Safety',
    title: 'Water quality that reads clearly',
    text: 'Turn raw source readings into a public-friendly card that explains what changed and what needs attention.',
    chip: 'Source quality watch',
    panelTitle: 'Water readiness',
    metricLabel: 'Safe supply points',
    metricValue: '18 / 21',
    metricNote: 'Latest village snapshot',
    floatingTitle: 'Today',
    floatingValue: '83',
    floatingNote: 'Quality score',
    bullets: [
      'Spot pH and turbidity drift early',
      'Make safe versus watch status obvious',
    ],
    rows: [
      { label: 'North', value: 86 },
      { label: 'East', value: 72 },
      { label: 'South', value: 91 },
    ],
    primaryLabel: 'View water status',
    primaryTo: '/village-status',
    secondaryLabel: 'Open sensors',
    secondaryTo: '/sensors',
  },
  {
    icon: HeartPulse,
    kicker: 'Health Reporting',
    title: 'Community health without the spreadsheet feel',
    text: 'Surface symptom reporting and escalation cues in a cleaner action card for families and field teams.',
    chip: 'Health report flow',
    panelTitle: 'Response readiness',
    metricLabel: 'Open follow-ups',
    metricValue: '12',
    metricNote: 'Prioritized for local teams',
    floatingTitle: 'Follow-up',
    floatingValue: '2 hrs',
    floatingNote: 'Median acknowledgement',
    bullets: [
      'Early cluster visibility for villages',
      'Plain-language severity for families',
    ],
    rows: [
      { label: 'Fever', value: 64 },
      { label: 'GI', value: 47 },
      { label: 'Skin', value: 31 },
    ],
    primaryLabel: 'Report an issue',
    primaryTo: '/citizen-services',
    secondaryLabel: 'See health reports',
    secondaryTo: '/health-reports',
  },
  {
    icon: ShieldCheck,
    kicker: 'Village Confidence',
    title: 'Official trust cards with less weight',
    text: 'Combine local status, confidence language, and decision support without making the interface feel heavy.',
    chip: 'Village confidence layer',
    panelTitle: 'Village status',
    metricLabel: 'Confidence',
    metricValue: '94%',
    metricNote: 'Based on synced data',
    floatingTitle: 'Coverage',
    floatingValue: '3 feeds',
    floatingNote: 'Water, alerts, reports',
    bullets: [
      'One public-facing source of truth',
      'Fast drilldown into the right workflow',
    ],
    rows: [
      { label: 'Sensors', value: 92 },
      { label: 'Alerts', value: 76 },
      { label: 'Reports', value: 88 },
    ],
    primaryLabel: 'Check village profile',
    primaryTo: '/village-profile',
    secondaryLabel: 'Feature center',
    secondaryTo: '/feature-center',
  },
  {
    icon: Waves,
    kicker: 'Live Response',
    title: 'Alert cards built for quick response',
    text: 'Pair a premium shell with clear actions so people can move from awareness to response without friction.',
    chip: 'Alert response queue',
    panelTitle: 'Response timeline',
    metricLabel: 'Active alerts',
    metricValue: '07',
    metricNote: 'Updated every sync',
    floatingTitle: 'Escalation',
    floatingValue: 'Ready',
    floatingNote: 'Field team notified',
    bullets: [
      'Signal which alerts need attention first',
      'Keep status, trend, and CTA together',
    ],
    rows: [
      { label: 'Critical', value: 28 },
      { label: 'High', value: 54 },
      { label: 'Moderate', value: 76 },
    ],
    primaryLabel: 'Open alerts',
    primaryTo: '/alerts',
    secondaryLabel: 'Download reports',
    secondaryTo: '/reports',
  },
];

const trustNotes = [
  {
    title: 'Village-ready language',
    text: 'The cards keep the tone calm and civic, while still making the next action obvious.',
  },
  {
    title: 'Useful on the ground',
    text: 'Status, supporting detail, and a clear CTA all live inside the same card shell.',
  },
  {
    title: 'Built for action',
    text: 'Each card can preview a signal, show confidence, and send the user to the right workflow fast.',
  },
];

export const HomePage = () => {
  const { isAuthenticated } = useAuth();
  const { activeVillageId } = usePreferences();

  const dashboardQuery = useQuery({
    queryKey: ['home-dashboard', activeVillageId],
    queryFn: () => villageService.getDashboard(activeVillageId!),
    enabled: Boolean(isAuthenticated && activeVillageId),
    staleTime: 60 * 1000,
  });

  return (
    <>
      <PageHero
        eyebrow="Public village intelligence, made readable"
        title="See water, alerts, and village risk in one calm civic view"
        subtitle="JALERT turns live water readings, community reports, and AI-supported village signals into clear public guidance that families, field teams, and administrators can act on."
        image={imagery.hero}
        primaryLabel="Explore feature center"
        primaryTo="/feature-center"
        secondaryLabel="Open village status"
        secondaryTo="/village-status"
      />

      <Reveal className="section">
        <SectionHeader
          title="Built around people, not dashboards"
          subtitle="Every section of JALERT is written and designed to help normal users understand what is happening in their village and what to do next."
        />
        <div className="card-grid">
          {showcaseCards.map((card, index) => (
            <Reveal key={card.title} delay={index * 70}>
              <article className="showcase-card interactive-card">
                <div className="showcase-copy">
                  <div className="showcase-kicker">
                    <card.icon size={16} />
                    {card.kicker}
                  </div>
                  <h3>{card.title}</h3>
                  <p>{card.text}</p>
                  <ul className="showcase-bullets">
                    {card.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                </div>

                <div className="showcase-visual">
                  <div className="showcase-dashboard">
                    <div className="showcase-dashboard-utility">
                      <div className="showcase-inline-chip">{card.chip}</div>
                      <div className="showcase-inline-stat">
                        <span>{card.floatingTitle}</span>
                        <strong>{card.floatingValue}</strong>
                        <small>{card.floatingNote}</small>
                      </div>
                    </div>

                    <div className="showcase-dashboard-head">
                      <strong>{card.panelTitle}</strong>
                      <span>{card.metricNote}</span>
                    </div>

                    <div className="showcase-metric-line">
                      <div>
                        <span>{card.metricLabel}</span>
                        <strong>{card.metricValue}</strong>
                      </div>
                      <Activity size={18} />
                    </div>

                    <div className="showcase-chart">
                      {card.rows.map((row) => (
                        <div key={row.label} className="showcase-chart-row">
                          <span>{row.label}</span>
                          <div className="showcase-bar-track">
                            <div className="showcase-bar-fill" style={{ width: `${row.value}%` }} />
                          </div>
                          <strong>{row.value}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="showcase-actions">
                  <Link className="showcase-primary" to={card.primaryTo}>
                    {card.primaryLabel}
                  </Link>
                  <Link className="showcase-secondary" to={card.secondaryTo}>
                    {card.secondaryLabel}
                    <ArrowRight size={16} />
                  </Link>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </Reveal>

      <Reveal className="section">
        <SectionHeader
          title="Live system highlights"
          subtitle="If you are signed in and have a village selected, the latest local snapshot appears here."
        />
        {!isAuthenticated ? (
          <article className="content-card">
            <p className="body-copy">
              Sign in to see your village status, recent alerts, and current water snapshot.
            </p>
          </article>
        ) : dashboardQuery.isLoading ? (
          <LoadingState label="Loading the latest village highlights..." />
        ) : dashboardQuery.isError ? (
          <ErrorState description="We could not load the live highlights right now." />
        ) : dashboardQuery.data ? (
          <div className="bento-grid">
            <article className="bento-card bento-card-primary interactive-card">
              <div className="bento-kicker">
                <BellRing size={16} />
                Live village snapshot
              </div>
              <h3>{dashboardQuery.data.village.name}</h3>
              <p className="bento-subtitle">
                {dashboardQuery.data.village.district}, {dashboardQuery.data.village.state}
              </p>
              <div className="bento-highlight-row">
                <div>
                  <span>Population</span>
                  <strong>{formatNumber(dashboardQuery.data.village.population, 0)}</strong>
                </div>
                <div>
                  <span>Risk score</span>
                  <strong>{formatNumber(dashboardQuery.data.risk.score)}</strong>
                </div>
              </div>
              <div className="bento-chip-row">
                <span className="bento-chip">
                  Category: {sentenceCase(dashboardQuery.data.risk.category)}
                </span>
                <span className="bento-chip">
                  Updated {formatDate(dashboardQuery.data.risk.last_updated)}
                </span>
              </div>
            </article>

            <article className="bento-card interactive-card">
              <div className="bento-kicker">
                <Droplets size={16} />
                Water quality
              </div>
              <strong className="bento-value">
                {formatNumber(dashboardQuery.data.latest_sensor.quality_score)}
              </strong>
              <p className="bento-subtitle">Based on the most recent sensor snapshot.</p>
              <ul className="bento-list">
                <li>pH: {formatNumber(dashboardQuery.data.latest_sensor.ph)}</li>
                <li>Turbidity: {formatNumber(dashboardQuery.data.latest_sensor.turbidity)}</li>
                <li>Last reading: {formatDate(dashboardQuery.data.latest_sensor.timestamp)}</li>
              </ul>
            </article>

            <article className="bento-card interactive-card">
              <div className="bento-kicker">
                <ShieldCheck size={16} />
                Alerts and follow-up
              </div>
              <strong className="bento-value">{String(dashboardQuery.data.active_alerts.length)}</strong>
              <p className="bento-subtitle">Active alerts currently open for this village.</p>
              <ul className="bento-list">
                {dashboardQuery.data.active_alerts.length ? (
                  dashboardQuery.data.active_alerts.slice(0, 3).map((alert) => (
                    <li key={alert.id}>
                      {sentenceCase(alert.severity)}: {alert.title}
                    </li>
                  ))
                ) : (
                  <li>No active alerts are open right now.</li>
                )}
              </ul>
            </article>
          </div>
        ) : (
          <article className="content-card">
            <p className="body-copy">
              Select a village on the Village Status page to start seeing local live highlights here.
            </p>
          </article>
        )}
      </Reveal>

      <Reveal className="section split-layout">
          <article className="content-card interactive-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', justifyContent: 'center' }}>
              <SectionHeader
                title="Real AI Assistant"
                subtitle="Talk directly to the JALERT assistant with live village context."
              />
          <p className="body-copy">
            Understand complex alerts, ask about water metrics, and view real-time data insights completely naturally.
          </p>
          <div>
            <Link className="primary-button" to="/chat" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <Bot size={18} /> Open Fullscreen Chat
            </Link>
          </div>
          </article>

          <article className="content-card interactive-card">
            <img className="content-image" src={imagery.community} alt="Village community and agricultural setting" />
            <div className="assistant-links section-tight">
              <Link className="link-chip" to="/village-profile">
                Know My Village
              </Link>
              <Link className="link-chip" to="/feature-center">
                Feature Center
              </Link>
              <Link className="link-chip" to="/village-status">
                Live village dashboard
              </Link>
              <Link className="link-chip" to="/citizen-services">
                Raise a service request
              </Link>
            </div>
          </article>
        </Reveal>

      <Reveal className="section">
        <SectionHeader
          title="Why communities can trust this experience"
          subtitle="The interface keeps the tone calm, the language simple, and the actions practical."
        />
        <div className="grid-3">
          {trustNotes.map((note, index) => (
            <Reveal key={note.title} delay={40 + index * 60}>
              <article className="testimonial-card interactive-card">
                <div className="eyebrow">
                  <ShieldCheck size={16} />
                  Trust Layer
                </div>
                <h3>{note.title}</h3>
                <p>{note.text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </Reveal>
    </>
  );
};
