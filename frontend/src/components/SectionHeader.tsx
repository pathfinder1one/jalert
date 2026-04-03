import type { ReactNode } from 'react';

export const SectionHeader = ({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) => (
  <div className="section-header">
    <div>
      <h2>{title}</h2>
      <p className="section-subtitle">{subtitle}</p>
    </div>
    {action}
  </div>
);
