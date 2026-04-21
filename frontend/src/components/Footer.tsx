import { Link } from 'react-router-dom';
import { ShieldCheck, Waves, HeartPulse } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BrandLogo } from './BrandLogo';

export const Footer = () => {
  const { t } = useTranslation();

  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-top">
          <div className="footer-summary">
            <BrandLogo className="footer-brand-logo" />
            <p>{t('footer.strapline')}</p>
          </div>

          <nav className="footer-nav" aria-label="Footer navigation">
            <Link to="/village-status">Village status</Link>
            <Link to="/alerts">Alerts</Link>
            <Link to="/health-reports">Health reports</Link>
            <Link to="/reports">Reports</Link>
          </nav>
        </div>

        <div className="footer-meta">
          <div className="footer-meta-card">
            <ShieldCheck size={16} />
            <span>Village-ready public guidance</span>
          </div>
          <div className="footer-meta-card">
            <Waves size={16} />
            <span>Simple water quality updates</span>
          </div>
          <div className="footer-meta-card">
            <HeartPulse size={16} />
            <span>Health follow-up for local teams</span>
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
      </div>
    </footer>
  );
};
