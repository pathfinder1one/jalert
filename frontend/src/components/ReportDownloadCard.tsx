import type { ReactNode } from 'react';
import { Building2, CalendarDays, Download, Eye } from 'lucide-react';

export const ReportDownloadCard = ({
  icon,
  iconClassName,
  title,
  metaLabel,
  villageCountLabel,
  metricValue,
  metricLabel,
  onDownload,
  onView,
  downloadLabel = 'Download PDF',
  viewLabel = 'View',
  disabled = false,
}: {
  icon: ReactNode;
  iconClassName?: string;
  title: string;
  metaLabel: string;
  villageCountLabel: string;
  metricValue: string;
  metricLabel: string;
  onDownload: () => void;
  onView: () => void;
  downloadLabel?: string;
  viewLabel?: string;
  disabled?: boolean;
}) => (
  <article className="report-showcase-card interactive-card">
    <div className={`report-showcase-icon ${iconClassName ?? ''}`.trim()}>{icon}</div>

    <div className="report-showcase-copy">
      <h3>{title}</h3>
      <div className="report-showcase-meta">
        <span>
          <CalendarDays size={14} />
          {metaLabel}
        </span>
        <span>
          <Building2 size={14} />
          {villageCountLabel}
        </span>
      </div>
    </div>

    <div className="report-showcase-metric">
      <strong>{metricValue}</strong>
      <span>{metricLabel}</span>
    </div>

    <div className="report-showcase-actions">
      <button type="button" className="report-pill-button" onClick={onDownload} disabled={disabled}>
        <Download size={16} />
        <span>{downloadLabel}</span>
      </button>
      <button type="button" className="report-pill-button report-pill-button-secondary" onClick={onView} disabled={disabled}>
        <Eye size={16} />
        <span>{viewLabel}</span>
      </button>
    </div>
  </article>
);
