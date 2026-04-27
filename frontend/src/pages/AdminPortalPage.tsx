import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowUpRight,
  ClipboardList,
  KeyRound,
  Radar,
  ShieldCheck,
  Siren,
  Users,
  Waves,
} from 'lucide-react';

import { PageHero } from '../components/PageHero';
import { StatusBadge } from '../components/StatusBadge';
import { imagery } from '../assets/imagery';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { adminService } from '../services/adminService';
import { villageService } from '../services/villageService';
import type { AdminUserUpdatePayload, User, Village } from '../types/api';
import { formatDate, formatNumber, sentenceCase } from '../utils/format';

const AdminUserCard = ({
  user,
  villages,
  onSave,
  onResetPassword,
}: {
  user: User;
  villages: Village[];
  onSave: (userId: string, payload: AdminUserUpdatePayload) => void;
  onResetPassword: (userId: string, password: string) => void;
}) => {
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [role, setRole] = useState(user.role);
  const [villageId, setVillageId] = useState(user.village_id ?? '');
  const [language, setLanguage] = useState(user.preferred_language ?? 'en');
  const [isActive, setIsActive] = useState(user.is_active);
  const [password, setPassword] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    setName(user.name);
    setPhone(user.phone ?? '');
    setRole(user.role);
    setVillageId(user.village_id ?? '');
    setLanguage(user.preferred_language ?? 'en');
    setIsActive(user.is_active);
  }, [user]);

  const initials = user.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  const linkedVillage = villages.find((village) => village.id === user.village_id);

  return (
    <article className={`admin-user-card ${isExpanded ? 'expanded' : ''}`}>
      <div className="admin-user-card-top">
        <div className="admin-user-identity">
          <div className="admin-user-avatar" aria-hidden="true">
            {initials || 'JA'}
          </div>
          <div className="stack-tight">
            <div className="admin-user-heading-row">
              <h3>{user.name}</h3>
              <div className="helper-row">
                <StatusBadge value={user.role} />
                <StatusBadge value={user.is_active ? 'active' : 'inactive'} />
              </div>
            </div>
            <p className="section-subtitle">{user.email}</p>
          </div>
        </div>

        <button
          type="button"
          className="ghost-button admin-user-toggle"
          onClick={() => setIsExpanded((current) => !current)}
        >
          {isExpanded ? 'Hide controls' : 'Manage access'}
        </button>
      </div>

      <div className="admin-user-meta">
        <span className="admin-user-meta-pill">
          Village
          <strong>{linkedVillage ? linkedVillage.name : 'Unlinked'}</strong>
        </span>
        <span className="admin-user-meta-pill">
          Language
          <strong>{language.toUpperCase()}</strong>
        </span>
        <span className="admin-user-meta-pill">
          Joined
          <strong>{formatDate(user.created_at)}</strong>
        </span>
      </div>

      <div className="admin-user-card-foot">
        <p className="subtle">
          {user.role === 'admin'
            ? 'Full operations access, audit review, and report control.'
            : user.role === 'health_worker'
              ? 'Field response access for alerts, reports, and follow-up.'
              : 'Public-facing account with village-linked access.'}
        </p>
      </div>

      {isExpanded ? (
        <div className="admin-user-editor">
          <section className="admin-control-panel">
            <div className="admin-control-panel-head">
              <div>
                <div className="eyebrow">Account controls</div>
                <h4>Access and assignment</h4>
              </div>
              <ShieldCheck size={18} />
            </div>

            <div className="form-grid two">
              <div className="field">
                <label>Name</label>
                <input value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="field">
                <label>Phone</label>
                <input value={phone} onChange={(event) => setPhone(event.target.value)} />
              </div>
              <div className="field">
                <label>Role</label>
                <select value={role} onChange={(event) => setRole(event.target.value as User['role'])}>
                  <option value="admin">Admin</option>
                  <option value="health_worker">Health worker</option>
                  <option value="public">Public</option>
                </select>
              </div>
              <div className="field">
                <label>Linked village</label>
                <select value={villageId} onChange={(event) => setVillageId(event.target.value)}>
                  <option value="">No linked village</option>
                  {villages.map((village) => (
                    <option key={village.id} value={village.id}>
                      {village.name}, {village.district}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Language</label>
                <input value={language} onChange={(event) => setLanguage(event.target.value)} />
              </div>
              <div className="field">
                <label>Account status</label>
                <select
                  value={isActive ? 'active' : 'inactive'}
                  onChange={(event) => setIsActive(event.target.value === 'active')}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="helper-row">
              <button
                type="button"
                className="primary-button"
                onClick={() =>
                  onSave(user.id, {
                    name,
                    phone: phone || null,
                    role,
                    village_id: villageId || null,
                    is_active: isActive,
                    preferred_language: language,
                  })
                }
              >
                Save changes
              </button>
            </div>
          </section>

          <section className="admin-control-panel admin-control-panel-muted">
            <div className="admin-control-panel-head">
              <div>
                <div className="eyebrow">Credentials</div>
                <h4>Temporary password reset</h4>
              </div>
              <KeyRound size={18} />
            </div>

            <div className="form-grid two">
              <div className="field">
                <label>Reset password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter a temporary password"
                />
              </div>
              <div className="field admin-password-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={password.length < 8}
                  onClick={() => {
                    onResetPassword(user.id, password);
                    setPassword('');
                  }}
                >
                  Reset password
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </article>
  );
};

export const AdminPortalPage = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { activeVillageId } = usePreferences();
  const queryClient = useQueryClient();

  const villagesQuery = useQuery({
    queryKey: ['admin-villages'],
    queryFn: villageService.list,
    enabled: isAuthenticated && user?.role === 'admin',
    staleTime: 300_000,
  });

  const dashboardQuery = useQuery({
    queryKey: ['admin-dashboard', activeVillageId],
    queryFn: () => villageService.getDashboard(activeVillageId!),
    enabled: isAuthenticated && user?.role === 'admin' && !!activeVillageId,
    staleTime: 60_000,
  });

  const usersQuery = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => adminService.listUsers(true),
    enabled: isAuthenticated && user?.role === 'admin',
    staleTime: 30_000,
  });

  const auditQuery = useQuery({
    queryKey: ['admin-audit'],
    queryFn: () => adminService.listAudit({ limit: 30 }),
    enabled: isAuthenticated && user?.role === 'admin',
    staleTime: 30_000,
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ userId, payload }: { userId: string; payload: AdminUserUpdatePayload }) =>
      adminService.updateUser(userId, payload),
    onSuccess: () => {
      toast.success('User updated.');
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-audit'] });
    },
    onError: () => {
      toast.error('User update failed.');
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) =>
      adminService.setUserPassword(userId, { new_password: password }),
    onSuccess: () => {
      toast.success('Password reset completed.');
      void queryClient.invalidateQueries({ queryKey: ['admin-audit'] });
    },
    onError: () => {
      toast.error('Password reset failed.');
    },
  });

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate replace to="/admin/login" />;
  }

  if (user?.role !== 'admin') {
    return <Navigate replace to="/" />;
  }

  const villageCount = villagesQuery.data?.length ?? 0;
  const riskCategory = dashboardQuery.data?.risk.category ?? 'unknown';
  const riskScore = dashboardQuery.data?.risk.score;
  const activeAlerts = dashboardQuery.data?.active_alerts.length ?? 0;
  const users = usersQuery.data ?? [];
  const activeUsers = users.filter((item) => item.is_active).length;
  const inactiveUsers = users.length - activeUsers;
  const highlightedAudit = auditQuery.data?.slice(0, 6) ?? [];
  const criticalSummary = useMemo(() => {
    if (!dashboardQuery.data?.active_alerts.length) {
      return 'No active village alerts in the current focus.';
    }
    return dashboardQuery.data.active_alerts
      .slice(0, 2)
      .map((alert) => `${sentenceCase(alert.severity)}: ${alert.title}`)
      .join(' | ');
  }, [dashboardQuery.data?.active_alerts]);

  return (
    <div className="admin-portal-page">
      <PageHero
        eyebrow="Administrator portal"
        title="Run operations, manage people, and inspect system activity"
        subtitle="This admin workspace now includes user management, password reset, audit visibility, and live village oversight."
        image={imagery.fieldWorker}
        badges={['User admin', 'Audit trail', 'Village oversight', 'Incident response']}
        primaryLabel="Open alerts"
        primaryTo="/alerts"
        secondaryLabel="Open reports"
        secondaryTo="/reports"
      />

      <section className="section content-card admin-portal-hero">
        <div>
          <div className="eyebrow">Signed in</div>
          <h2>{user.name}</h2>
          <p className="section-subtitle">{user.email} | Joined {formatDate(user.created_at)}</p>
        </div>
        <div className="admin-badge-line">
          <StatusBadge value={user.role} />
          <span className="admin-portal-chip">
            <ShieldCheck size={16} />
            Live administrator controls
          </span>
        </div>
      </section>

      <section className="section admin-command-grid">
        <article className="admin-command-surface">
          <div className="admin-command-header">
            <div>
              <div className="eyebrow">Operations overview</div>
              <h2>Command center</h2>
              <p className="section-subtitle">
                Keep the most important numbers, shortcuts, and village posture in one glance.
              </p>
            </div>
            <div className="admin-command-icon">
              <Radar size={22} />
            </div>
          </div>

          <div className="admin-signal-grid">
            <article className="admin-signal-card">
              <span className="admin-signal-label">Villages in oversight</span>
              <strong>{formatNumber(villageCount, 0)}</strong>
              <p>Connected from the live catalog.</p>
            </article>
            <article className="admin-signal-card">
              <span className="admin-signal-label">Active users</span>
              <strong>{activeUsers}</strong>
              <p>{inactiveUsers} inactive accounts.</p>
            </article>
            <article className="admin-signal-card">
              <span className="admin-signal-label">Alerts in focus</span>
              <strong>{activeAlerts}</strong>
              <p>{dashboardQuery.data?.village.name ?? 'Choose a village'}.</p>
            </article>
            <article className="admin-signal-card">
              <span className="admin-signal-label">Risk posture</span>
              <strong>{riskScore != null ? `${formatNumber(riskScore)}/100` : 'Unknown'}</strong>
              <p>{sentenceCase(riskCategory)} category.</p>
            </article>
          </div>

          <div className="admin-command-footer">
            <div className="assistant-links">
              <Link className="link-chip" to="/alerts">
                <Siren size={16} />
                Incident workflow
              </Link>
              <Link className="link-chip" to="/reports">
                <Waves size={16} />
                Report exports
              </Link>
              <Link className="link-chip" to="/notifications">
                <Users size={16} />
                Notification inbox
              </Link>
            </div>
            <div className="admin-command-note">
              <span className="eyebrow">Current focus</span>
              <p>{criticalSummary}</p>
            </div>
          </div>
        </article>

        <article className="admin-activity-surface">
          <div className="admin-command-header">
            <div>
              <div className="eyebrow">Audit visibility</div>
              <h2>Recent activity</h2>
            </div>
            <div className="admin-command-icon admin-command-icon-muted">
              <ClipboardList size={20} />
            </div>
          </div>

          <div className="admin-timeline">
            {highlightedAudit.map((log) => (
              <article key={log.id} className="admin-timeline-item">
                <div className="admin-timeline-marker" />
                <div className="admin-timeline-copy">
                  <div className="inline-between">
                    <strong>{log.action}</strong>
                    <span className="subtle">{formatDate(log.created_at)}</span>
                  </div>
                  <p className="subtle">
                    {log.user_name || log.user_email || 'System'} on {log.resource_type}
                    {log.resource_id ? ` (${log.resource_id})` : ''}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="section admin-portal-layout">
        <article className="content-card admin-user-board">
          <div className="admin-user-board-head">
            <div>
              <div className="eyebrow">Access control</div>
              <h2>User management</h2>
              <p className="section-subtitle">
                Compact control cards for roles, village assignment, and password resets.
              </p>
            </div>
            <div className="admin-board-pills">
              <span className="admin-board-pill">Total {users.length}</span>
              <span className="admin-board-pill">Active {activeUsers}</span>
              <span className="admin-board-pill">Inactive {inactiveUsers}</span>
            </div>
          </div>

          <div className="admin-user-grid">
            {users.map((member) => (
              <AdminUserCard
                key={member.id}
                user={member}
                villages={villagesQuery.data ?? []}
                onSave={(userId, payload) => updateUserMutation.mutate({ userId, payload })}
                onResetPassword={(userId, password) =>
                  resetPasswordMutation.mutate({ userId, password })
                }
              />
            ))}
          </div>
        </article>

        <aside className="content-card admin-audit-board">
          <div className="admin-user-board-head">
            <div>
              <div className="eyebrow">Full audit trail</div>
              <h2>System journal</h2>
              <p className="section-subtitle">
                A tighter stream of auth, report, alert, and user-management actions.
              </p>
            </div>
          </div>

          <div className="admin-audit-list">
            {auditQuery.data?.map((log) => (
              <article key={log.id} className="admin-audit-entry">
                <div className="inline-between">
                  <div>
                    <h4>{log.action}</h4>
                    <p className="subtle">{log.user_name || log.user_email || 'System'}</p>
                  </div>
                  <span className="admin-audit-date">{formatDate(log.created_at)}</span>
                </div>

                <div className="admin-audit-meta">
                  <span>{log.resource_type}</span>
                  {log.resource_id ? <span>{log.resource_id}</span> : null}
                  {log.ip_address ? <span>{log.ip_address}</span> : null}
                </div>

                {log.detail ? (
                  <span className="admin-audit-detail">
                    Change context recorded
                    <ArrowUpRight size={14} />
                  </span>
                ) : null}
              </article>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
};
