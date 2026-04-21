import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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
import { healthService } from '../services/healthService';
import { villageService } from '../services/villageService';
import { formatCompactDate, formatDate } from '../utils/format';

const symptomKeys = ['fever', 'diarrhea', 'vomiting', 'skin_irritation', 'stomach_pain'] as const;

const formSchema = z.object({
  reporter_name: z.string().min(2, 'Please enter your name'),
  age: z.coerce.number().min(0).max(120).optional(),
  gender: z.string().optional(),
  suspected_disease: z.string().optional(),
  notes: z.string().optional(),
  symptom_onset: z.string().optional(),
  is_hospitalized: z.boolean().default(false),
  fever: z.string().optional(),
  diarrhea: z.string().optional(),
  vomiting: z.string().optional(),
  skin_irritation: z.string().optional(),
  stomach_pain: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export const HealthReportsPage = () => {
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuth();
  const { activeVillageId, setActiveVillageId } = usePreferences();

  const villagesQuery = useQuery({
    queryKey: ['villages'],
    queryFn: villageService.list,
    enabled: isAuthenticated,
  });

  const reportsQuery = useQuery({
    queryKey: ['health-reports', activeVillageId],
    queryFn: () => healthService.listReports(activeVillageId!, 14, 50),
    enabled: Boolean(isAuthenticated && activeVillageId && (user?.role === 'admin' || user?.role === 'health_worker')),
  });

  const clustersQuery = useQuery({
    queryKey: ['health-clusters', activeVillageId],
    queryFn: () => healthService.getClusters(activeVillageId!, 7),
    enabled: Boolean(isAuthenticated && activeVillageId && (user?.role === 'admin' || user?.role === 'health_worker')),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      reporter_name: user?.name ?? '',
      is_hospitalized: false,
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const symptoms = symptomKeys.reduce<Record<string, string>>((accumulator, key) => {
        const value = values[key];
        if (value) {
          accumulator[key] = value;
        }
        return accumulator;
      }, {});

      return healthService.createReport({
        village_id: activeVillageId!,
        reporter_name: values.reporter_name,
        age: values.age,
        gender: values.gender,
        suspected_disease: values.suspected_disease,
        symptom_onset: values.symptom_onset || undefined,
        is_hospitalized: values.is_hospitalized,
        notes: values.notes,
        symptoms,
      });
    },
    onSuccess: () => {
      toast.success('Health report submitted successfully.');
      form.reset({ reporter_name: user?.name ?? '', is_hospitalized: false });
      void queryClient.invalidateQueries({ queryKey: ['health-reports'] });
      void queryClient.invalidateQueries({ queryKey: ['health-clusters'] });
    },
  });

  const clusterChart = useMemo(
    () =>
      clustersQuery.data
        ? Object.entries(clustersQuery.data.daily_case_trend).map(([date, count]) => ({
            date: formatCompactDate(date),
            count,
          }))
        : [],
    [clustersQuery.data],
  );

  const canReview = user?.role === 'admin' || user?.role === 'health_worker';

  return (
    <>
      <PageHero
        eyebrow="Health reporting"
        title="Report symptoms early and help your village respond sooner"
        subtitle="Share health concerns in simple language. Health workers can review local trends and identify possible clusters."
        image={imagery.community}
        badges={['Symptom reporting', 'Cluster detection', 'Field review', 'Real-time trends']}
        primaryLabel="Submit a report"
        primaryTo="/health-reports"
        secondaryLabel="Open alerts"
        secondaryTo="/alerts"
      />

      {!isAuthenticated ? (
        <section className="section">
          <LoginPrompt />
        </section>
      ) : (
        <>
          <section className="section content-card">
            <VillageSelector
              villages={villagesQuery.data ?? []}
              value={activeVillageId}
              onChange={setActiveVillageId}
            />
          </section>

          {!activeVillageId ? (
            <section className="section">
              <EmptyState title="Choose a village to report a health issue" description="After selecting a village you can submit a report or review local health activity." />
            </section>
          ) : (
            <>
              <section className="section content-card">
                <h2>Submit a symptom report</h2>
                <p className="section-subtitle">
                  Keep the report short and accurate. Early reports help local health teams notice patterns faster.
                </p>

                <form className="stack" onSubmit={form.handleSubmit((values) => submitMutation.mutate(values))}>
                  <div className="form-grid two">
                    <div className="field">
                      <label htmlFor="reporter_name">Reporter name</label>
                      <input id="reporter_name" {...form.register('reporter_name')} />
                      {form.formState.errors.reporter_name ? <span className="field-error">{form.formState.errors.reporter_name.message}</span> : null}
                    </div>
                    <div className="field">
                      <label htmlFor="age">Age</label>
                      <input id="age" type="number" {...form.register('age')} />
                    </div>
                  </div>

                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor="gender">Gender</label>
                      <select id="gender" {...form.register('gender')}>
                        <option value="">Prefer not to say</option>
                        <option value="female">Female</option>
                        <option value="male">Male</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="symptom_onset">Symptom start</label>
                      <input id="symptom_onset" type="datetime-local" {...form.register('symptom_onset')} />
                    </div>
                    <div className="field">
                      <label htmlFor="suspected_disease">Suspected illness</label>
                      <input id="suspected_disease" {...form.register('suspected_disease')} placeholder="Optional" />
                    </div>
                    <div className="field">
                      <label htmlFor="is_hospitalized">Hospitalized</label>
                      <input id="is_hospitalized" type="checkbox" {...form.register('is_hospitalized')} />
                    </div>
                  </div>

                  <div className="form-grid">
                    {symptomKeys.map((key) => (
                      <div key={key} className="field">
                        <label htmlFor={key}>{key.replace(/_/g, ' ')}</label>
                        <select id={key} {...form.register(key)}>
                          <option value="">Not reported</option>
                          <option value="mild">Mild</option>
                          <option value="moderate">Moderate</option>
                          <option value="high">High</option>
                        </select>
                      </div>
                    ))}
                  </div>

                  <div className="field">
                    <label htmlFor="notes">Notes</label>
                    <textarea id="notes" rows={4} {...form.register('notes')} placeholder="Add any helpful local context." />
                  </div>

                  <div className="helper-row">
                    <button type="submit" className="primary-button" disabled={submitMutation.isPending}>
                      Submit health report
                    </button>
                  </div>
                </form>
              </section>

              {canReview ? (
                <>
                  {reportsQuery.isLoading || clustersQuery.isLoading ? <LoadingState label="Loading health overview..." /> : null}
                  {reportsQuery.isError || clustersQuery.isError ? <ErrorState description="The village health overview could not be loaded." /> : null}

                  {clustersQuery.data ? (
                    <section className="section split-layout">
                      <article className="content-card">
                        <div className="helper-row">
                          <StatusBadge value={clustersQuery.data.alert_level} />
                          <span className="subtle">{clustersQuery.data.cluster_detected ? 'Possible cluster detected' : 'No strong cluster signal yet'}</span>
                        </div>
                        <ul className="action-list">
                          <li>Total reports: {clustersQuery.data.total_reports}</li>
                          <li>Hospitalized cases: {clustersQuery.data.hospitalized}</li>
                          <li>Monitoring period: {clustersQuery.data.period_days} days</li>
                        </ul>
                        <p className="body-copy">
                          This summary uses local health reports to highlight unusual symptom patterns and give health workers a quick starting point.
                        </p>
                      </article>

                      <article className="chart-card content-card">
                        <h3>Recent report trend</h3>
                        <div className="chart-shell">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={clusterChart}>
                              <XAxis dataKey="date" />
                              <YAxis />
                              <Tooltip />
                              <Bar dataKey="count" fill="#43a047" radius={[10, 10, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </article>
                    </section>
                  ) : null}

                  <section className="section content-card">
                    <h2>Recent reports</h2>
                    <div className="stack">
                      {reportsQuery.data?.map((report) => (
                        <article key={report.id} className="alert-card">
                          <div className="inline-between">
                            <h4>{report.reporter_name || 'Anonymous report'}</h4>
                            <StatusBadge value={report.is_recovered ? 'resolved' : 'active'} />
                          </div>
                          <p className="subtle">
                            {formatDate(report.created_at)} · Symptoms: {Object.keys(report.symptoms).join(', ') || 'Not listed'}
                          </p>
                        </article>
                      ))}
                    </div>
                  </section>
                </>
              ) : null}
            </>
          )}
        </>
      )}
    </>
  );
};
