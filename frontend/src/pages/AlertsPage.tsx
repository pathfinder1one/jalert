import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { imagery } from '../assets/imagery';
import { AlertCard } from '../components/AlertCard';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { LoginPrompt } from '../components/LoginPrompt';
import { PageHero } from '../components/PageHero';
import { VillageSelector } from '../components/VillageSelector';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { adminService } from '../services/adminService';
import { alertService } from '../services/alertService';
import { villageService } from '../services/villageService';
import type { AlertStatus, AlertType, AlertSeverity } from '../types/api';
import { sentenceCase } from '../utils/format';

export const AlertsPage = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuth();
  const { activeVillageId, setActiveVillageId } = usePreferences();
  const [severity, setSeverity] = useState<AlertSeverity | ''>('');
  const [status, setStatus] = useState<AlertStatus | ''>('active');
  const [alertType, setAlertType] = useState<AlertType | ''>('');
  const [manualTitle, setManualTitle] = useState('');
  const [manualDescription, setManualDescription] = useState('');

  const villagesQuery = useQuery({
    queryKey: ['villages'],
    queryFn: villageService.list,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  const alertsQuery = useQuery({
    queryKey: ['alerts', activeVillageId, severity, status, alertType],
    queryFn: () =>
      alertService.list({
        village_id: activeVillageId ?? undefined,
        severity,
        status,
        alert_type: alertType,
        limit: 50,
      }),
    enabled: Boolean(isAuthenticated && activeVillageId),
    placeholderData: (previousData) => previousData,
    staleTime: 30_000,
  });

  const priorityAlertsQuery = useQuery({
    queryKey: ['alerts-priority-feed'],
    queryFn: () =>
      alertService.list({
        status: 'active',
        limit: 20,
      }),
    enabled: isAuthenticated,
    staleTime: 30_000,
    placeholderData: (previousData) => previousData,
  });

  const teamMembersQuery = useQuery({
    queryKey: ['alert-team-members'],
    queryFn: () => adminService.listUsers(false),
    enabled: isAuthenticated && user?.role === 'admin',
    staleTime: 60_000,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: ({ alertId, note }: { alertId: string; note?: string }) =>
      alertService.acknowledge(alertId, note),
    onSuccess: () => {
      toast.success('Alert acknowledged.');
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({ alertId, assignedToUserId, note }: { alertId: string; assignedToUserId: string; note?: string }) =>
      alertService.assign(alertId, assignedToUserId, note),
    onSuccess: () => {
      toast.success('Alert assigned.');
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  const escalateMutation = useMutation({
    mutationFn: ({ alertId, level, reason }: { alertId: string; level: number; reason: string }) =>
      alertService.escalate(alertId, level, reason),
    onSuccess: () => {
      toast.success('Alert escalated.');
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: ({ alertId, resolutionNote }: { alertId: string; resolutionNote?: string }) =>
      alertService.resolve(alertId, resolutionNote),
    onSuccess: () => {
      toast.success('Alert marked as resolved.');
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  const manualAlertMutation = useMutation({
    mutationFn: () =>
      alertService.createManual({
        village_id: activeVillageId!,
        alert_type: alertType || 'manual',
        severity: severity || 'moderate',
        title: manualTitle,
        description: manualDescription,
      }),
    onSuccess: () => {
      toast.success('Manual alert sent successfully.');
      setManualTitle('');
      setManualDescription('');
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  const canManage = useMemo(
    () => user?.role === 'admin' || user?.role === 'health_worker',
    [user?.role],
  );

  const assignmentOptions = useMemo(() => {
    const options = [
      ...(user ? [{ id: user.id, name: `${user.name} (Me)` }] : []),
      ...((teamMembersQuery.data ?? [])
        .filter((member) => member.is_active)
        .filter((member) => !activeVillageId || !member.village_id || member.village_id === activeVillageId)
        .map((member) => ({ id: member.id, name: `${member.name} (${sentenceCase(member.role)})` }))),
    ];

    const seen = new Set<string>();
    return options.filter((option) => {
      if (seen.has(option.id)) {
        return false;
      }
      seen.add(option.id);
      return true;
    });
  }, [activeVillageId, teamMembersQuery.data, user]);

  const suggestedVillages = useMemo(() => {
    const villageMap = new Map((villagesQuery.data ?? []).map((village) => [village.id, village]));
    const seen = new Set<string>();

    return (priorityAlertsQuery.data ?? [])
      .filter((alert) => {
        if (seen.has(alert.village_id)) {
          return false;
        }
        seen.add(alert.village_id);
        return villageMap.has(alert.village_id);
      })
      .map((alert) => villageMap.get(alert.village_id))
      .filter((village): village is NonNullable<typeof village> => Boolean(village))
      .slice(0, 4);
  }, [priorityAlertsQuery.data, villagesQuery.data]);

  return (
    <>
      <PageHero
        eyebrow="Community alerts"
        title={t('alerts.title')}
        subtitle={t('alerts.subtitle')}
        image={imagery.waterBody}
        badges={['Active warnings', 'Severity filters', 'Field team response', 'Manual alerts']}
        primaryLabel="Open village status"
        primaryTo="/village-status"
        secondaryLabel="View reports"
        secondaryTo="/reports"
      />

      {!isAuthenticated ? (
        <section className="section">
          <LoginPrompt />
        </section>
      ) : (
        <>
          <section className="section content-card">
            <div className="filters-grid">
              <VillageSelector
                villages={villagesQuery.data ?? []}
                value={activeVillageId}
                onChange={setActiveVillageId}
              />
              <div className="field">
                <label htmlFor="severity">Severity</label>
                <select id="severity" value={severity} onChange={(e) => setSeverity(e.target.value as AlertSeverity | '')}>
                  <option value="">All severities</option>
                  <option value="low">Low</option>
                  <option value="moderate">Moderate</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="status">Status</label>
                <select id="status" value={status} onChange={(e) => setStatus(e.target.value as AlertStatus | '')}>
                  <option value="">All statuses</option>
                  <option value="active">Active</option>
                  <option value="acknowledged">Acknowledged</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="alert-type">Category</label>
                <select id="alert-type" value={alertType} onChange={(e) => setAlertType(e.target.value as AlertType | '')}>
                  <option value="">All categories</option>
                  <option value="water_quality">Water quality</option>
                  <option value="disease_outbreak">Disease outbreak</option>
                  <option value="flood_risk">Flood risk</option>
                  <option value="manual">Manual</option>
                  <option value="ai_predicted">AI predicted</option>
                </select>
              </div>
            </div>
            {alertsQuery.data?.length === 0 && suggestedVillages.length > 0 ? (
              <div className="helper-row alert-suggestions">
                <div>
                  <strong>Villages needing attention</strong>
                  <p className="section-subtitle">
                    This village has no active alert right now. These villages currently have live warnings.
                  </p>
                </div>
                <div className="chip-row">
                  {suggestedVillages.map((village) => (
                    <button
                      key={village.id}
                      type="button"
                      className="chip-button"
                      onClick={() => setActiveVillageId(village.id)}
                    >
                      {village.name}, {village.district}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          {canManage ? (
            <section className="section content-card">
              <div className="inline-between">
                <div>
                  <h2>Send a manual alert</h2>
                  <p className="section-subtitle">
                    Use this when a field worker or responder needs to raise a community warning quickly.
                  </p>
                </div>
              </div>
              <div className="form-grid two">
                <div className="field">
                  <label htmlFor="manual-title">Alert title</label>
                  <input
                    id="manual-title"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    placeholder="Example: Hand pump contamination warning"
                  />
                </div>
                <div className="field">
                  <label htmlFor="manual-category">Alert category</label>
                  <select
                    id="manual-category"
                    value={alertType}
                    onChange={(e) => setAlertType(e.target.value as AlertType | '')}
                  >
                    <option value="manual">Manual</option>
                    <option value="water_quality">Water quality</option>
                    <option value="disease_outbreak">Disease outbreak</option>
                    <option value="flood_risk">Flood risk</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="manual-description">Description</label>
                <textarea
                  id="manual-description"
                  rows={4}
                  value={manualDescription}
                  onChange={(e) => setManualDescription(e.target.value)}
                  placeholder="Write a short, clear public-facing message."
                />
              </div>
              <div className="helper-row">
                <button
                  type="button"
                  className="primary-button"
                  disabled={!manualTitle || !manualDescription || !activeVillageId}
                  onClick={() => manualAlertMutation.mutate()}
                >
                  Send manual alert
                </button>
              </div>
            </section>
          ) : null}

          <section className="section stack">
            {alertsQuery.isLoading && !alertsQuery.data ? <LoadingState label="Loading alerts..." /> : null}
            {alertsQuery.isFetching && alertsQuery.data?.length ? (
              <div className="inline-note">Refreshing alerts for this village...</div>
            ) : null}
            {alertsQuery.isError ? (
              <ErrorState description="We could not fetch the alerts list right now." />
            ) : null}
            {alertsQuery.data?.length === 0 ? (
              <EmptyState
                title="No alerts match your filters"
                description="Try a different village, category, or severity."
              />
            ) : null}
            {alertsQuery.data?.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                canManage={canManage}
                currentUserId={user?.id}
                assignmentOptions={assignmentOptions}
                onAcknowledge={(id, note) => acknowledgeMutation.mutate({ alertId: id, note })}
                onAssign={(id, assignedToUserId, note) =>
                  assignMutation.mutate({ alertId: id, assignedToUserId, note })
                }
                onEscalate={(id, level, reason) =>
                  escalateMutation.mutate({ alertId: id, level, reason })
                }
                onResolve={(id, resolutionNote) =>
                  resolveMutation.mutate({ alertId: id, resolutionNote })
                }
              />
            ))}
          </section>
        </>
      )}
    </>
  );
};
