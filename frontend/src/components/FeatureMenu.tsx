import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';

const featureGroups = [
  {
    title: 'Village intelligence',
    links: [
      { to: '/feature-center', label: 'All features' },
      { to: '/village-profile', label: 'Village profile deep view' },
      { to: '/village-status', label: 'Village map and live status' },
      { to: '/predictions', label: 'Predictions and explanations' },
    ],
  },
  {
    title: 'Water and sensors',
    links: [
      { to: '/sensors#water-resources', label: 'Water resources map' },
      { to: '/sensors#iot-monitoring', label: 'IoT monitoring and readings' },
      { to: '/reports', label: 'Downloads and exports' },
    ],
  },
  {
    title: 'Citizen action',
    links: [
      { to: '/citizen-services', label: 'Complaints and service requests' },
      { to: '/health-reports', label: 'Health reports' },
      { to: '/alerts', label: 'Alerts and response' },
    ],
  },
];

export const FeatureMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="feature-menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className="feature-menu-trigger"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        Explore
        <ChevronDown size={16} />
      </button>

      {isOpen ? (
        <div className="feature-menu-panel">
          <section className="feature-menu-group">
            <strong>Quick access</strong>
            <div className="feature-menu-links">
              <Link to="/feature-center" onClick={() => setIsOpen(false)}>
                Explore all features
              </Link>
            </div>
          </section>
          {featureGroups.map((group) => (
            <section key={group.title} className="feature-menu-group">
              <strong>{group.title}</strong>
              <div className="feature-menu-links">
                {group.links.map((link) => (
                  <Link key={`${group.title}-${link.label}`} to={link.to} onClick={() => setIsOpen(false)}>
                    {link.label}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
};
