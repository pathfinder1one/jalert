import logo from '../assets/jalert-logo.png';

type BrandLogoProps = {
  compact?: boolean;
  showTagline?: boolean;
  className?: string;
};

export const BrandLogo = ({ compact = false, showTagline = true, className = '' }: BrandLogoProps) => (
  <span className={`brand-lockup ${compact ? 'compact' : 'full'} ${className}`.trim()}>
    <img className="brand-logo-image" src={logo} alt="JAlert logo" />
    <span className="brand-lockup-copy">
      <strong>JAlert</strong>
      {showTagline ? <small>Be Smart Be Healthy</small> : null}
    </span>
  </span>
);
