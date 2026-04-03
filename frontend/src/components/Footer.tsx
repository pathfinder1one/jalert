import { Link } from 'react-router-dom';
import { ShieldCheck, Waves, HeartPulse } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Reveal } from './Reveal';
import { BrandLogo } from './BrandLogo';

export const Footer = () => {
  const { t } = useTranslation();

  return (
    <footer className="footer">
      <Reveal className="footer-inner">
        <div className="footer-hero">
          <div className="footer-brand-block interactive-card">
            <span className="footer-kicker">Community water intelligence</span>
            <div className="footer-brand-row">
              <BrandLogo className="footer-brand-logo" />
            </div>
            <p className="section-subtitle">{t('footer.strapline')}</p>
            <div className="footer-pill-row">
              <span className="footer-pill">Water safety</span>
              <span className="footer-pill">Village alerts</span>
              <span className="footer-pill">Health response</span>
            </div>
          </div>

          <div className="footer-spotlight interactive-card">
            <strong>Made for families, field teams, and village communities</strong>
            <p>
              Clear updates, quick reporting, and simple guidance for everyday water and health
              decisions.
            </p>
          </div>
        </div>

        <div className="footer-grid">
          <div className="footer-card interactive-card">
            <strong>Explore</strong>
            <div className="footer-links">
              <Link to="/village-status">Village status</Link>
              <Link to="/alerts">Alerts</Link>
              <Link to="/health-reports">Health reports</Link>
              <Link to="/sensors">Water monitoring</Link>
            </div>
          </div>

          <div className="footer-card interactive-card">
            <strong>Support</strong>
            <div className="footer-feature-list">
              <p>
                <Waves size={16} />
                Easy-to-read water quality updates
              </p>
              <p>
                <HeartPulse size={16} />
                Health issue reporting for local follow-up
              </p>
              <p>
                <ShieldCheck size={16} />
                Public-facing alerts built for trust and clarity
              </p>
            </div>
          </div>

          <div className="footer-card interactive-card">
            <strong>Why JALERT</strong>
            <div className="footer-stat-grid">
              <div>
                <span>Simple</span>
                <small>Plain-language guidance</small>
              </div>
              <div>
                <span>Connected</span>
                <small>Alerts, reports, and sensors together</small>
              </div>
              <div>
                <span>Responsive</span>
                <small>Designed for mobile and field use</small>
              </div>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <p>Citizen-first public safety experience for stronger local action.</p>
          <div className="footer-bottom-links">
            <Link to="/">Home</Link>
            <Link to="/reports">Reports</Link>
            <Link to="/profile">Profile</Link>
          </div>
        </div>
      </Reveal>
    </footer>
  );
};
