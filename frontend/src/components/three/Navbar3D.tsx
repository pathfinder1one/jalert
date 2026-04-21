import React from 'react';
import { Html } from '@react-three/drei';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BrandLogo } from '../BrandLogo';
import { FeatureMenu } from '../FeatureMenu';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { ProfileDropdown } from '../ProfileDropdown';

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

export const Navbar3D = () => {
  const { t } = useTranslation();

  return (
    <Html
      position={[0, 8, 0]} // Positioned high in the 3D world
      center
      distanceFactor={10}
      style={{
        width: '100vw',
        pointerEvents: 'auto',
      }}
    >
      <header className="navbar" style={{
        background: 'rgba(20, 20, 30, 0.8)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        position: 'relative',
        top: '-45vh' // Offset to align with top of screen
      }}>
        <div className="navbar-inner">
          <NavLink to="/" className="brand">
            <BrandLogo compact showTagline={false} />
          </NavLink>

          <nav className="nav-links" aria-label="Main navigation">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
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
    </Html>
  );
};
