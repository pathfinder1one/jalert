import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export const PageHero = ({
  eyebrow,
  title,
  subtitle,
  image,
  primaryLabel,
  primaryTo,
  secondaryLabel,
  secondaryTo,
  statItems = [],
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  image: string;
  primaryLabel?: string;
  primaryTo?: string;
  secondaryLabel?: string;
  secondaryTo?: string;
  compact?: boolean;
  badges?: string[]; // kept for backward compat, no-op
  statItems?: { label: string; value: string }[];
}) => (
  <section className="page-hero-cinematic">
    {/* Background image */}
    <div className="page-hero-bg">
      <img src={image} alt={title} className="page-hero-bg-img" />
      <div className="page-hero-grad-left" />
      <div className="page-hero-grad-bottom" />
    </div>

    {/* Content */}
    <div className="page-hero-content">
      <div className="page-hero-copy">
        {/* Eyebrow chip */}
        <div className="page-hero-eyebrow-chip">{eyebrow}</div>

        <h1 className="page-hero-title">{title}</h1>
        <p className="page-hero-subtitle">{subtitle}</p>

        {/* CTA buttons */}
        {(primaryLabel && primaryTo) || (secondaryLabel && secondaryTo) ? (
          <div className="page-hero-ctas">
            {primaryLabel && primaryTo ? (
              <Link to={primaryTo} className="page-hero-btn-primary">
                <span>{primaryLabel}</span>
                <ChevronRight size={16} />
              </Link>
            ) : null}
            {secondaryLabel && secondaryTo ? (
              <Link to={secondaryTo} className="page-hero-btn-ghost">
                {secondaryLabel}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Desktop floating card — only shown when statItems provided */}
      {statItems.length > 0 ? (
        <div className="page-hero-float-card">
          <div className="page-hero-float-kicker">{eyebrow}</div>
          <h3 className="page-hero-float-title">{eyebrow}</h3>
          <div className="page-hero-float-stats">
            {statItems.map((item) => (
              <div key={item.label} className="page-hero-float-stat">
                <p className="page-hero-float-stat-label">{item.label}</p>
                <strong className="page-hero-float-stat-value">{item.value}</strong>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  </section>
);
