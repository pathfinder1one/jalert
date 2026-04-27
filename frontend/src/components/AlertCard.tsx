import { useEffect, useState } from 'react';
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
  canManage,
  currentUserId,
  assignmentOptions,
  onAcknowledge,
  onAssign,
  onEscalate,
  onResolve,
}: {
  alert: Alert;
  canManage?: boolean;
  currentUserId?: string;
  assignmentOptions?: Array<{ id: string; name: string }>;
  onAcknowledge?: (id: string, note?: string) => void;
  onAssign?: (id: string, assignedToUserId: string, note?: string) => void;
  onEscalate?: (id: string, escalationLevel: number, reason: string) => void;
  onResolve?: (id: string, resolutionNote?: string) => void;
}) => {
  const TypeIcon = alertTypeIcon[alert.alert_type] ?? AlertTriangle;
  const actions = toActionList(alert.recommended_actions);
  const [workflowNote, setWorkflowNote] = useState('');
  const [assignedTo, setAssignedTo] = useState(alert.assigned_to_user_id ?? currentUserId ?? '');
  const [escalationLevel, setEscalationLevel] = useState(Math.max(1, alert.escalation_level ?? 1));

  useEffect(() => {
    setAssignedTo(alert.assigned_to_user_id ?? currentUserId ?? '');
  }, [alert.assigned_to_user_id, currentUserId]);

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
      </div>

      <p className="body-copy alert-card-summary">{alert.description}</p>

      <div className="meta-row">
        {alert.assigned_to_name ? <span className="alert-meta-pill">Assigned to: {alert.assigned_to_name}</span> : null}
        {alert.acknowledged_by_name ? (
          <span className="alert-meta-pill">Acknowledged by: {alert.acknowledged_by_name}</span>
        ) : null}
        {alert.escalation_level ? (
          <span className="alert-meta-pill">Escalation level: {alert.escalation_level}</span>
        ) : null}
        {alert.acknowledged_at ? <span className="alert-meta-pill">Acknowledged {formatDate(alert.acknowledged_at)}</span> : null}
      </div>

      {alert.escalation_reason ? (
        <div className="alert-card-guidance">
          <strong>Escalation reason</strong>
          <p className="body-copy">{alert.escalation_reason}</p>
        </div>
      ) : null}

      {alert.resolution_note ? (
        <div className="alert-card-guidance">
          <strong>Resolution note</strong>
          <p className="body-copy">{alert.resolution_note}</p>
        </div>
      ) : null}

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

      {canManage && alert.status !== 'resolved' ? (
        <div className="stack section-tight">
          <div className="form-grid two">
            <div className="field">
              <label>Workflow note</label>
              <input
                value={workflowNote}
                onChange={(event) => setWorkflowNote(event.target.value)}
                placeholder="Add note for acknowledgement, assignment, or resolution"
              />
            </div>
            <div className="field">
              <label>Assigned responder</label>
              <select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)}>
                <option value="">Select responder</option>
                {(assignmentOptions ?? []).map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="helper-row">
            {alert.status === 'active' && onAcknowledge ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => onAcknowledge(alert.id, workflowNote || undefined)}
              >
                Acknowledge
              </button>
            ) : null}
            {onAssign ? (
              <button
                type="button"
                className="ghost-button"
                disabled={!assignedTo}
                onClick={() => onAssign(alert.id, assignedTo, workflowNote || undefined)}
              >
                Assign
              </button>
            ) : null}
            {onResolve ? (
              <button
                type="button"
                className="primary-button"
                onClick={() => onResolve(alert.id, workflowNote || undefined)}
              >
                Resolve
              </button>
            ) : null}
          </div>

          {onEscalate ? (
            <div className="helper-row">
              <div className="field" style={{ minWidth: '120px' }}>
                <label>Escalation level</label>
                <select
                  value={String(escalationLevel)}
                  onChange={(event) => setEscalationLevel(Number(event.target.value))}
                >
                  <option value="1">Level 1</option>
                  <option value="2">Level 2</option>
                  <option value="3">Level 3</option>
                </select>
              </div>
              <button
                type="button"
                className="ghost-button"
                disabled={!workflowNote.trim()}
                onClick={() => onEscalate(alert.id, escalationLevel, workflowNote)}
              >
                Escalate
              </button>
            </div>
          ) : null}
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
