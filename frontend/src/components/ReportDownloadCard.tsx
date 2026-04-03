import type { ReactNode } from 'react';

export const ReportDownloadCard = ({
  title,
  description,
  actionLabel,
  secondaryAction,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  secondaryAction?: ReactNode;
  onAction: () => void;
}) => (
  <article className="report-card">
    <h3>{title}</h3>
    <p>{description}</p>
    <div className="helper-row">
      <button type="button" className="primary-button" onClick={onAction}>
        {actionLabel}
      </button>
      {secondaryAction}
    </div>
  </article>
);
