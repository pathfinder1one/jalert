import { AlertTriangle, Droplets, Siren, Waves } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { formatDate, sentenceCase, toActionList } from '../utils/format';
import type { Alert } from '../types/api';

const alertTypeIcon = {
  water_quality: Droplets,
  disease_outbreak: Siren,
  flood_risk: Waves,
  manual: AlertTriangle,
  ai_predicted: AlertTriangle,
} as const;

export const AlertCard = ({
  alert,
  canResolve,
  onResolve,
}: {
  alert: Alert;
  canResolve?: boolean;
  onResolve?: (id: string) => void;
}) => {
  const TypeIcon = alertTypeIcon[alert.alert_type] ?? AlertTriangle;
  const actions = toActionList(alert.recommended_actions);

  return (
    <article className={`alert-card alert-card-elevated alert-card-${alert.severity} interactive-card`}>
      <div className="alert-card-header">
        <div className="stack-tight">
          <div className="meta-row">
            <StatusBadge value={alert.severity} />
            <StatusBadge value={alert.status} />
            <span className="alert-card-type">
              <TypeIcon size={14} />
              {sentenceCase(alert.alert_type)}
            </span>
          </div>
          <h3>{alert.title}</h3>
        </div>
        {canResolve && alert.status === 'active' && onResolve ? (
          <button type="button" className="secondary-button alert-card-button" onClick={() => onResolve(alert.id)}>
            Mark as resolved
          </button>
        ) : null}
      </div>

      <p className="body-copy alert-card-summary">{alert.description}</p>

      {actions.length ? (
        <div className="alert-card-guidance">
          <strong>What to do now</strong>
          <ul className="action-list">
            {actions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="alert-card-footer">
        <span className="alert-meta-pill">{formatDate(alert.created_at)}</span>
        {alert.affected_population ? <span className="alert-meta-pill">Affected people: {alert.affected_population}</span> : null}
        {alert.triggered_by ? <span className="alert-meta-pill">Triggered by: {alert.triggered_by}</span> : null}
      </div>
    </article>
  );
};
