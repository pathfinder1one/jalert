import { useEffect, useMemo } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { imagery } from '../assets/imagery';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { LoginPrompt } from '../components/LoginPrompt';
import { PageHero } from '../components/PageHero';
import { StatusBadge } from '../components/StatusBadge';
import { VillageSelector } from '../components/VillageSelector';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { villageIntelligenceService } from '../services/villageIntelligenceService';
import { villageService } from '../services/villageService';
import type { CitizenRequest } from '../types/api';
import { formatDate, sentenceCase } from '../utils/format';

const serviceRequestSchema = z.object({
  reporter_name: z.string().min(2, 'Please enter your name'),
  contact_phone: z.string().min(8, 'Please enter a valid phone number'),
  category: z.string().min(3, 'Select a request type'),
  severity: z.enum(['low', 'moderate', 'high', 'critical']),
  preferred_channel: z.enum(['call', 'sms', 'visit']),
  description: z.string().min(10, 'Describe the issue in a little more detail'),
});

type ServiceRequestValues = z.infer<typeof serviceRequestSchema>;

const requestTypes = [
  { value: 'no_water_today', label: 'No water today' },
  { value: 'bad_smell_in_water', label: 'Bad smell in water' },
  { value: 'muddy_water', label: 'Muddy water' },
  { value: 'handpump_not_working', label: 'Handpump not working' },
  { value: 'illness_after_drinking', label: 'Illness after drinking water' },
];

export const CitizenServicesPage = () => {
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuth();
  const { activeVillageId, setActiveVillageId, fieldMode } = usePreferences();

  const villagesQuery = useQuery({
    queryKey: ['villages'],
    queryFn: villageService.list,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!villagesQuery.data?.length) {
      return;
    }
    const hasActiveVillage = activeVillageId
      ? villagesQuery.data.some((village) => village.id === activeVillageId)
      : false;
    if (!hasActiveVillage) {
      setActiveVillageId(villagesQuery.data[0].id);
    }
  }, [activeVillageId, setActiveVillageId, villagesQuery.data]);

  const requestsQuery = useQuery({
    queryKey: ['citizen-requests', activeVillageId],
    queryFn: () => villageIntelligenceService.listCitizenRequests(activeVillageId!),
    enabled: Boolean(isAuthenticated && activeVillageId),
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  });
  const dashboardQuery = useQuery({
    queryKey: ['citizen-services-dashboard', activeVillageId],
    queryFn: () => villageService.getDashboard(activeVillageId!),
    enabled: Boolean(isAuthenticated && activeVillageId),
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const profileQuery = useQuery({
    queryKey: ['village-profile-lite', activeVillageId],
    queryFn: () => villageIntelligenceService.profile(activeVillageId!),
    enabled: Boolean(isAuthenticated && activeVillageId),
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });
  const cachedRequests: CitizenRequest[] = useMemo(() => {
    if (!activeVillageId) {
      return [];
    }
    try {
      const raw = localStorage.getItem(`jalert.cached.citizen-requests.${activeVillageId}`);
      return raw ? (JSON.parse(raw) as CitizenRequest[]) : [];
    } catch {
      return [];
    }
  }, [activeVillageId]);
  const resolvedRequests = requestsQuery.data ?? cachedRequests;
  const activeVillage = useMemo(
    () => (villagesQuery.data ?? []).find((village) => village.id === activeVillageId) ?? null,
    [activeVillageId, villagesQuery.data],
  );
  const fallbackFamilyActions = useMemo(() => {
    if (!activeVillage || !dashboardQuery.data) {
      return [];
    }
    const qualityScore = dashboardQuery.data.latest_sensor.quality_score ?? 70;
    const actions = [
      'Use the currently monitored village source for drinking water.',
      'If smell, color, or stomach issues appear, switch to boiled or filtered water immediately.',
      'Keep one backup drinking-water source ready for children and elders.',
    ];
    if ((dashboardQuery.data.latest_sensor.ecoli ?? 0) > 0 || qualityScore < 55) {
      actions.unshift('Avoid untreated direct-source water until the next local check confirms safety.');
    }
    return actions;
  }, [activeVillage, dashboardQuery.data]);
  const fallbackTrust = useMemo(() => {
    if (!dashboardQuery.data) {
      return null;
    }
    return {
      qualityBadge:
        (dashboardQuery.data.latest_sensor.ecoli ?? 0) > 0
          ? 'Water Quality Affected'
          : (dashboardQuery.data.latest_sensor.quality_score ?? 70) >= 70
            ? 'Safe'
            : 'Needs Attention',
      predictionConfidence:
        dashboardQuery.data.risk.score != null ? `${Math.round(Math.max(52, Math.min(91, 100 - dashboardQuery.data.risk.score / 2)))}%` : 'Fallback',
      lastSensorUpdate: dashboardQuery.data.latest_sensor.timestamp,
      coordinateConfidence: 'Fallback trust view from live village dashboard',
    };
  }, [dashboardQuery.data]);

  const form = useForm<ServiceRequestValues>({
    resolver: zodResolver(serviceRequestSchema),
    defaultValues: {
      reporter_name: user?.name ?? '',
      contact_phone: user?.phone ?? '',
      category: 'no_water_today',
      severity: 'moderate',
      preferred_channel: 'call',
      description: '',
    },
  });
  useEffect(() => {
    if (!fieldMode) {
      return;
    }
    const raw = localStorage.getItem('jalert.citizen-request.draft');
    if (!raw) {
      return;
    }
    try {
      form.reset({ ...form.getValues(), ...(JSON.parse(raw) as Partial<ServiceRequestValues>) });
    } catch {
      localStorage.removeItem('jalert.citizen-request.draft');
    }
  }, [fieldMode, form]);

  useEffect(() => {
    if (!activeVillageId || !requestsQuery.data) {
      return;
    }
    localStorage.setItem(
      `jalert.cached.citizen-requests.${activeVillageId}`,
      JSON.stringify(requestsQuery.data),
    );
  }, [activeVillageId, requestsQuery.data]);

  useEffect(() => {
    if (!fieldMode) {
      return;
    }
    const subscription = form.watch((values) => {
      localStorage.setItem('jalert.citizen-request.draft', JSON.stringify(values));
    });
    return () => subscription.unsubscribe();
  }, [fieldMode, form]);

  const createRequestMutation = useMutation({
    mutationFn: async (values: ServiceRequestValues) =>
      villageIntelligenceService.createCitizenRequest({
        village_id: activeVillageId!,
        reporter_name: values.reporter_name,
        contact_phone: values.contact_phone,
        category: values.category,
        severity: values.severity,
        preferred_channel: values.preferred_channel,
        description: values.description,
      }),
    onSuccess: (createdRequest) => {
      toast.success('Service request submitted.');
      localStorage.removeItem('jalert.citizen-request.draft');
      queryClient.setQueryData<CitizenRequest[]>(
        ['citizen-requests', activeVillageId],
        (current) => [createdRequest, ...(current ?? cachedRequests)].slice(0, 100),
      );
      if (activeVillageId) {
        const nextItems = [createdRequest, ...resolvedRequests].slice(0, 100);
        localStorage.setItem(
          `jalert.cached.citizen-requests.${activeVillageId}`,
          JSON.stringify(nextItems),
        );
      }
      form.reset({
        reporter_name: user?.name ?? '',
        contact_phone: user?.phone ?? '',
        category: 'no_water_today',
        severity: 'moderate',
        preferred_channel: 'call',
        description: '',
      });
      void queryClient.invalidateQueries({ queryKey: ['citizen-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['village-profile-lite'] });
    },
    onError: () => {
      toast.error('Service request could not be submitted.');
    },
  });
  const updateRequestMutation = useMutation({
    mutationFn: async (payload: { requestId: string; status: 'open' | 'in_progress' | 'resolved'; resolution_notes?: string }) =>
      villageIntelligenceService.updateCitizenRequest(payload.requestId, {
        status: payload.status,
        resolution_notes: payload.resolution_notes,
      }),
    onSuccess: () => {
      toast.success('Request status updated.');
      void queryClient.invalidateQueries({ queryKey: ['citizen-requests'] });
    },
    onError: () => {
      toast.error('Request status could not be updated.');
    },
  });

  const requestSummary = useMemo(() => {
    const requests = resolvedRequests;
    return {
      open: requests.filter((item) => item.status === 'open').length,
      inProgress: requests.filter((item) => item.status === 'in_progress').length,
      resolved: requests.filter((item) => item.status === 'resolved').length,
    };
  }, [resolvedRequests]);
  const canManageRequests = user?.role === 'admin' || user?.role === 'health_worker';

  const whatsappShareText = useMemo(() => {
    if (!profileQuery.data) {
      return 'JALERT village update';
    }
    return encodeURIComponent(
      `JALERT update for ${profileQuery.data.village.name}, ${profileQuery.data.village.district}: water status ${profileQuery.data.village.quality_badge_label}. View more in the village profile.`,
    );
  }, [profileQuery.data]);

  return (
    <>
      <PageHero
        eyebrow="Citizen services"
        title="Report water issues, track follow-up, and reach the right village team"
        subtitle="Built for families, panchayat members, and field users who need a simple way to raise water and health concerns."
        image={imagery.fieldWorker}
        badges={['Complaint tracking', 'Field follow-up', 'WhatsApp sharing', 'Offline draft support']}
        primaryLabel="Raise a request"
        primaryTo="/citizen-services"
        secondaryLabel="Open village profile"
        secondaryTo="/village-profile"
      />

      {!isAuthenticated ? (
        <section className="section">
          <LoginPrompt />
        </section>
      ) : (
        <>
          <section className="section content-card">
            <div className="inline-between">
              <VillageSelector
                villages={villagesQuery.data ?? []}
                value={activeVillageId}
                onChange={setActiveVillageId}
              />
              <div className="helper-row">
                <Link className="secondary-button" to="/village-profile">
                  Open village profile
                </Link>
                <a className="ghost-button" href={`https://wa.me/?text=${whatsappShareText}`} target="_blank" rel="noreferrer">
                  Share on WhatsApp
                </a>
              </div>
            </div>
          </section>

          {!activeVillageId ? (
            <section className="section">
              <EmptyState
                title="Choose a village to begin"
                description="Citizen complaint tracking and local guidance appear after village selection."
              />
            </section>
          ) : (
            <>
              <section className="section metric-grid">
                <article className="metric-card">
                  <span className="eyebrow">Open requests</span>
                  <strong>{requestSummary.open}</strong>
                  <p>Issues that still need attention from the local response team.</p>
                </article>
                <article className="metric-card">
                  <span className="eyebrow">In progress</span>
                  <strong>{requestSummary.inProgress}</strong>
                  <p>Requests currently being checked or coordinated on the ground.</p>
                </article>
                <article className="metric-card">
                  <span className="eyebrow">Resolved</span>
                  <strong>{requestSummary.resolved}</strong>
                  <p>Closed updates that help build trust and visible accountability.</p>
                </article>
              </section>

              <section className="section split-layout">
                <article className="content-card">
                  <h3>Public service request</h3>
                  <p className="subtle">
                    Use this form for no water, dirty water, broken handpump, smell issues, or illness after drinking water.
                  </p>

                  <form className="stack section-tight" onSubmit={form.handleSubmit((values) => createRequestMutation.mutate(values))}>
                    <div className="form-grid two">
                      <div className="field">
                        <label htmlFor="reporter_name">Your name</label>
                        <input id="reporter_name" {...form.register('reporter_name')} />
                        {form.formState.errors.reporter_name ? <span className="field-error">{form.formState.errors.reporter_name.message}</span> : null}
                      </div>
                      <div className="field">
                        <label htmlFor="contact_phone">Phone number</label>
                        <input id="contact_phone" {...form.register('contact_phone')} />
                        {form.formState.errors.contact_phone ? <span className="field-error">{form.formState.errors.contact_phone.message}</span> : null}
                      </div>
                    </div>

                    <div className="form-grid three">
                      <div className="field">
                        <label htmlFor="category">Issue type</label>
                        <select id="category" {...form.register('category')}>
                          {requestTypes.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor="severity">Severity</label>
                        <select id="severity" {...form.register('severity')}>
                          <option value="low">Low</option>
                          <option value="moderate">Moderate</option>
                          <option value="high">High</option>
                          <option value="critical">Critical</option>
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor="preferred_channel">Preferred follow-up</label>
                        <select id="preferred_channel" {...form.register('preferred_channel')}>
                          <option value="call">Call</option>
                          <option value="sms">SMS</option>
                          <option value="visit">Field visit</option>
                        </select>
                      </div>
                    </div>

                    <div className="field">
                      <label htmlFor="description">What happened?</label>
                      <textarea id="description" rows={5} {...form.register('description')} placeholder="Tell us what happened, when it started, and which source or handpump is affected." />
                      {form.formState.errors.description ? <span className="field-error">{form.formState.errors.description.message}</span> : null}
                    </div>

                    <div className="helper-row">
                      <button type="submit" className="primary-button" disabled={createRequestMutation.isPending}>
                        Submit service request
                      </button>
                      <span className="subtle">This request is tied to the selected village and tracked below.</span>
                    </div>
                  </form>
                </article>

                <article className="content-card">
                  <h3>What can my family do now?</h3>
                  <ul className="action-list">
                    {(profileQuery.data?.family_actions ?? fallbackFamilyActions).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                    {!profileQuery.data?.family_actions?.length && !fallbackFamilyActions.length ? (
                      <li>Village-specific guidance will appear here once local profile data is loaded.</li>
                    ) : null}
                  </ul>

                  <div className="section-tight">
                    <h4>Helpful support options</h4>
                    <div className="assistant-links">
                      <a className="link-chip" href="tel:1916">
                        Call Jal Jeevan support
                      </a>
                      <a className="link-chip" href={`https://wa.me/?text=${whatsappShareText}`} target="_blank" rel="noreferrer">
                        Share village status
                      </a>
                      <Link className="link-chip" to="/health-reports">
                        Report illness
                      </Link>
                    </div>
                  </div>
                </article>
              </section>

              {requestsQuery.isLoading && !resolvedRequests.length ? <LoadingState label="Loading service requests..." /> : null}
              {requestsQuery.isError && !resolvedRequests.length ? <ErrorState description="Citizen requests could not be loaded." /> : null}
              {requestsQuery.isError && resolvedRequests.length ? (
                <section className="section content-card">
                  <p className="subtle">
                    Live citizen-request sync is temporarily unavailable, so this page is showing the latest saved village request history.
                  </p>
                </section>
              ) : null}

              <section className="section split-layout">
                <article className="content-card">
                  <h3>Request tracking</h3>
                  <div className="stack">
                    {resolvedRequests.length ? (
                      resolvedRequests.map((request) => (
                        <article key={request.id} className="alert-card">
                          <div className="inline-between">
                            <div>
                              <h4>{sentenceCase(request.category.replace(/_/g, ' '))}</h4>
                              <p className="subtle">{request.reporter_name}</p>
                            </div>
                            <div className="helper-row">
                              <StatusBadge value={request.severity} />
                              <StatusBadge value={request.status} />
                            </div>
                          </div>
                          <p className="subtle">{request.description}</p>
                          <div className="meta-row">
                            <span>Created {formatDate(request.created_at)}</span>
                            <span>Follow-up {sentenceCase(request.preferred_channel || 'call')}</span>
                            {request.resolution_notes ? <span>{request.resolution_notes}</span> : null}
                          </div>
                          {canManageRequests ? (
                            <div className="assistant-links">
                              {request.status !== 'open' ? (
                                <button
                                  type="button"
                                  className="link-chip"
                                  onClick={() => updateRequestMutation.mutate({ requestId: request.id, status: 'open' })}
                                >
                                  Mark open
                                </button>
                              ) : null}
                              {request.status !== 'in_progress' ? (
                                <button
                                  type="button"
                                  className="link-chip"
                                  onClick={() =>
                                    updateRequestMutation.mutate({
                                      requestId: request.id,
                                      status: 'in_progress',
                                      resolution_notes: 'Assigned for field follow-up',
                                    })
                                  }
                                >
                                  Mark in progress
                                </button>
                              ) : null}
                              {request.status !== 'resolved' ? (
                                <button
                                  type="button"
                                  className="link-chip"
                                  onClick={() =>
                                    updateRequestMutation.mutate({
                                      requestId: request.id,
                                      status: 'resolved',
                                      resolution_notes: 'Issue addressed and updated by field team',
                                    })
                                  }
                                >
                                  Resolve
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </article>
                      ))
                    ) : (
                      <EmptyState
                        title="No citizen requests yet"
                        description="Your village service requests will appear here as soon as people start using the form."
                      />
                    )}
                  </div>
                </article>

                <article className="content-card">
                  <h3>Trust and follow-up</h3>
                  <ul className="action-list">
                    <li>Every request is tagged to a real village and stored with timestamped follow-up status.</li>
                    <li>Water-quality badge: {profileQuery.data?.village.quality_badge_label ?? fallbackTrust?.qualityBadge ?? 'Loading village status'}</li>
                    <li>Prediction confidence: {profileQuery.data ? `${Math.round(profileQuery.data.transparency.prediction_confidence * 100)}%` : fallbackTrust?.predictionConfidence ?? 'Loading'}</li>
                    <li>Last local sensor update: {formatDate(profileQuery.data?.transparency.last_sensor_update ?? fallbackTrust?.lastSensorUpdate)}</li>
                    <li>Coordinate confidence: {profileQuery.data?.transparency.coordinate_accuracy_note ?? fallbackTrust?.coordinateConfidence ?? 'Loading'}</li>
                  </ul>
                </article>
              </section>
            </>
          )}
        </>
      )}
    </>
  );
};
