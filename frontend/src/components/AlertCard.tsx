import { StatusBadge } from './StatusBadge';
import { formatDate, sentenceCase, toActionList } from '../utils/format';
import type { Alert } from '../types/api';

export const AlertCard = ({
  alert,
  canResolve,
  onResolve,
}: {
  alert: Alert;
  canResolve?: boolean;
  onResolve?: (id: string) => void;
}) => (
  <article className="alert-card">
    <div className="alert-card-header">
      <div>
        <div className="meta-row">
          <StatusBadge value={alert.severity} />
          <StatusBadge value={alert.status} />
          <span>{sentenceCase(alert.alert_type)}</span>
        </div>
        <h3>{alert.title}</h3>
      </div>
      {canResolve && alert.status === 'active' && onResolve ? (
        <button type="button" className="secondary-button" onClick={() => onResolve(alert.id)}>
          Mark as resolved
        </button>
      ) : null}
    </div>
    <p className="body-copy">{alert.description}</p>
    {toActionList(alert.recommended_actions).length ? (
      <ul className="action-list">
        {toActionList(alert.recommended_actions).map((action) => (
          <li key={action}>{action}</li>
        ))}
      </ul>
    ) : null}
    <div className="meta-row">
      <span>{formatDate(alert.created_at)}</span>
      {alert.affected_population ? <span>Affected people: {alert.affected_population}</span> : null}
      {alert.triggered_by ? <span>Triggered by: {alert.triggered_by}</span> : null}
    </div>
  </article>
);
