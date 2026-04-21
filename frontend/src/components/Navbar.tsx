import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { BrandLogo } from './BrandLogo';
import { FeatureMenu } from './FeatureMenu';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ProfileDropdown } from './ProfileDropdown';

const navItems = [
  { to: '/', key: 'nav.home' },
  { to: '/alerts', key: 'nav.alerts' },
  { to: '/feature-center', key: 'Features' },
  { to: '/village-profile', key: 'nav.village' },
  { to: '/predictions', key: 'nav.predictions' },
  { to: '/health-reports', key: 'nav.health' },
  { to: '/sensors', key: 'nav.sensors' },
  { to: '/reports', key: 'nav.reports' },
];

export const Navbar = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const items = user?.role === 'admin'
    ? [...navItems, { to: '/admin-portal', key: 'Admin Portal' }]
    : navItems;

  return (
    <header className="navbar">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <div className="navbar-inner">
        <NavLink to="/" className="brand" onClick={() => setIsOpen(false)}>
          <BrandLogo compact showTagline={false} />
        </NavLink>

        <button
          type="button"
          className="mobile-toggle"
          onClick={() => setIsOpen((current) => !current)}
          aria-expanded={isOpen}
          aria-label="Toggle navigation"
        >
          {isOpen ? <X size={18} /> : <Menu size={18} />}
        </button>

        <nav className={`nav-links ${isOpen ? 'open' : ''}`} aria-label="Main navigation">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              onClick={() => setIsOpen(false)}
            >
              {item.key.startsWith('nav.') ? t(item.key) : item.key}
            </NavLink>
          ))}
        </nav>

        <div className="nav-actions">
          <FeatureMenu />
          <LanguageSwitcher />
          <ProfileDropdown />
        </div>
      </div>
    </header>
  );
};
