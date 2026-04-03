import type { ReactNode } from 'react';

export const ErrorState = ({
  title = 'We could not load this section',
  description = 'Please try again in a moment.',
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) => (
  <div className="error-state">
    <h3>{title}</h3>
    <p className="section-subtitle">{description}</p>
    {action}
  </div>
);
