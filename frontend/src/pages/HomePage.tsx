import { useQuery } from '@tanstack/react-query';
import { Droplets, HeartPulse, ShieldCheck, Waves } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { imagery } from '../assets/imagery';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { Reveal } from '../components/Reveal';
import { SectionHeader } from '../components/SectionHeader';
import { StatCard } from '../components/StatCard';
import { BrandLogo } from '../components/BrandLogo';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { villageService } from '../services/villageService';
import { formatDate, formatNumber, sentenceCase } from '../utils/format';

const trustCards = [
  {
    icon: Droplets,
    title: 'Water safety',
    text: 'See whether water conditions are safe, changing, or need urgent attention.',
  },
  {
    icon: HeartPulse,
    title: 'Health reporting',
    text: 'Share symptoms early so field teams can notice clusters before they become outbreaks.',
  },
  {
    icon: ShieldCheck,
    title: 'Village confidence',
    text: 'Give families and local workers one place to check trusted updates in plain language.',
  },
  {
    icon: Waves,
    title: 'Live response',
    text: 'Use real-time alerts, clear action steps, and local monitoring for faster response.',
  },
];

export const HomePage = () => {
  const { t } = useTranslation();
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
      <section className="hero">
        <div className="hero-copy">
          <div className="hero-ripple hero-ripple-one" />
          <div className="hero-ripple hero-ripple-two" />
          <div className="hero-brand-panel">
            <BrandLogo className="hero-brand-logo" showTagline={false} />
            <div className="hero-brand-note">
              Water, health, farming, and local response brought together in one calm public-facing experience.
            </div>
          </div>
          <div className="eyebrow">Village safety shaped by water, crops, and care</div>
          <h1>{t('home.title')}</h1>
          <p>{t('home.subtitle')}</p>
          <div className="hero-actions">
            <Link className="secondary-button" to="/feature-center">
              Explore all features
            </Link>
            <Link className="primary-button" to="/village-profile">
              {t('home.ctaStatus')}
            </Link>
            <Link className="secondary-button" to="/alerts">
              {t('home.ctaAlerts')}
            </Link>
            <Link className="ghost-button" to="/citizen-services">
              Citizen Services
            </Link>
          </div>
          <div className="hero-highlights">
            <div className="hero-highlight">
              <span className="subtle">River and field view</span>
              <strong>Readable risk guidance</strong>
            </div>
            <div className="hero-highlight">
              <span className="subtle">Community support</span>
              <strong>Multilingual access</strong>
            </div>
            <div className="hero-highlight">
              <span className="subtle">Smart connection</span>
              <strong>Alerts and reports together</strong>
            </div>
          </div>
        </div>

        <div className="hero-media">
          <img
            src={imagery.hero}
            alt="Farms and water landscape representing village water and health monitoring"
          />
          <div className="hero-overlay-card">
            <strong>Inspired by your new brand mark</strong>
            <p className="subtle">
              Soft water blues, farm greens, and warm civic accents now shape the interface across the site.
            </p>
          </div>
        </div>
      </section>

      <Reveal className="section">
        <SectionHeader
          title="Built around people, not dashboards"
          subtitle="Every section of JALERT is written and designed to help normal users understand what is happening in their village and what to do next."
        />
        <div className="card-grid">
          {trustCards.map((card, index) => (
            <Reveal key={card.title} delay={index * 70}>
              <article className="feature-card interactive-card">
                <div className="eyebrow">
                  <card.icon size={16} />
                  {card.title}
                </div>
                <h3>{card.title}</h3>
                <p>{card.text}</p>
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
          <div className="metric-grid">
            <StatCard
              label="Current village risk"
              value={sentenceCase(dashboardQuery.data.risk.category)}
              helper={`Updated ${formatDate(dashboardQuery.data.risk.last_updated)}`}
            />
            <StatCard
              label="Water quality score"
              value={formatNumber(dashboardQuery.data.latest_sensor.quality_score)}
              helper="Based on the most recent sensor snapshot"
            />
            <StatCard
              label="Active alerts"
              value={String(dashboardQuery.data.active_alerts.length)}
              helper={`${dashboardQuery.data.village.name}, ${dashboardQuery.data.village.district}`}
            />
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
          <article className="content-card interactive-card">
            <SectionHeader
              title="AI assistance for real questions"
              subtitle="The floating assistant can help users find alerts, explain predictions, check water safety, and move to the right page quickly."
            />
          <ul className="action-list">
            <li>Show my village alerts</li>
            <li>Explain this prediction</li>
            <li>How safe is the water?</li>
            <li>Download my report</li>
          </ul>
          <p className="body-copy">
            It works like a simple guide, not a technical chatbot. The answers are connected to the same backend data used across the website.
          </p>
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
          <Reveal delay={40}>
            <article className="testimonial-card interactive-card">
              <h3>Village-ready language</h3>
              <p>
                Clear labels, meaningful status colors, and room for Indian language support across the full site.
              </p>
            </article>
          </Reveal>
          <Reveal delay={100}>
            <article className="testimonial-card interactive-card">
              <h3>Useful on the ground</h3>
              <p>
                Health reports, water readings, alerts, and report downloads are connected in one user-facing flow.
              </p>
            </article>
          </Reveal>
          <Reveal delay={160}>
            <article className="testimonial-card interactive-card">
              <h3>Built for action</h3>
              <p>
                Families can understand the update, workers can respond, and village leaders can share reports quickly.
              </p>
            </article>
          </Reveal>
        </div>
      </Reveal>
    </>
  );
};
