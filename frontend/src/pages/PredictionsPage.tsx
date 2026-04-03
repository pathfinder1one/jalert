import { useEffect, useMemo } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import toast from 'react-hot-toast';
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
import { predictionService } from '../services/predictionService';
import { villageService } from '../services/villageService';
import { formatCompactDate, formatDate, formatNumber, sentenceCase, toActionList } from '../utils/format';

export const PredictionsPage = () => {
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuth();
  const { activeVillageId, setActiveVillageId } = usePreferences();

  const villagesQuery = useQuery({
    queryKey: ['villages'],
    queryFn: villageService.list,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!activeVillageId && villagesQuery.data?.length) {
      setActiveVillageId(villagesQuery.data[0].id);
    }
  }, [activeVillageId, setActiveVillageId, villagesQuery.data]);

  const latestQuery = useQuery({
    queryKey: ['prediction-latest', activeVillageId],
    queryFn: () => predictionService.latest(activeVillageId!),
    enabled: Boolean(isAuthenticated && activeVillageId),
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const historyQuery = useQuery({
    queryKey: ['prediction-history', activeVillageId],
    queryFn: () => predictionService.history(activeVillageId!, 30),
    enabled: Boolean(isAuthenticated && activeVillageId),
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const explainQuery = useQuery({
    queryKey: ['prediction-explain', activeVillageId],
    queryFn: () => predictionService.explain(activeVillageId!),
    enabled: Boolean(isAuthenticated && activeVillageId),
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const runMutation = useMutation({
    mutationFn: () => predictionService.run(activeVillageId!, true),
    onSuccess: () => {
      toast.success('Fresh village assessment completed.');
      void queryClient.invalidateQueries({ queryKey: ['prediction-latest'] });
      void queryClient.invalidateQueries({ queryKey: ['prediction-history'] });
      void queryClient.invalidateQueries({ queryKey: ['prediction-explain'] });
    },
  });

  const chartData = useMemo(
    () =>
      (historyQuery.data ?? []).slice().reverse().map((entry) => ({
        label: formatCompactDate(entry.created_at),
        score: entry.risk_score,
      })),
    [historyQuery.data],
  );

  const topFactors = useMemo(() => {
    const shap = explainQuery.data?.shap_values as
      | { feature_importance?: Record<string, number>; top_risk_factors?: string[] }
      | undefined;
    if (!shap?.feature_importance) {
      return [];
    }
    return Object.entries(shap.feature_importance)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 6);
  }, [explainQuery.data?.shap_values]);

  const agentCards = useMemo(() => {
    const outputs = explainQuery.data?.agent_outputs as
      | Record<
          string,
          {
            risk_score?: number;
            confidence?: number;
            findings?: string[];
          }
        >
      | undefined;
    if (!outputs) {
      return [];
    }
    return Object.entries(outputs);
  }, [explainQuery.data?.agent_outputs]);

  const scoreBreakdown = latestQuery.data
    ? [
        { label: 'Water', value: latestQuery.data.water_quality_score ?? 0 },
        { label: 'Disease', value: latestQuery.data.disease_risk_score ?? 0 },
        { label: 'Weather', value: latestQuery.data.weather_risk_score ?? 0 },
        { label: 'Community', value: latestQuery.data.community_health_score ?? 0 },
      ]
    : [];

  const canRun = user?.role === 'admin' || user?.role === 'health_worker';

  return (
    <>
      <PageHero
        eyebrow="AI assessment"
        title="AI predictions explained in everyday language"
        subtitle="Understand village risk levels, recent changes, and practical next steps without technical jargon."
        image={imagery.handPump}
        compact
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
              {canRun ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => runMutation.mutate()}
                  disabled={!activeVillageId || runMutation.isPending}
                >
                  Run fresh AI assessment
                </button>
              ) : null}
            </div>
          </section>

          {latestQuery.isLoading ? <LoadingState label="Loading prediction summary..." /> : null}
          {latestQuery.isError ? <ErrorState description="Prediction data could not be loaded." /> : null}
          {!activeVillageId ? (
            <EmptyState title="Choose a village to see predictions" description="Risk summaries and explanations appear after you select a village." />
          ) : null}

          {latestQuery.data ? (
            <>
              <section className="section split-layout">
                <article className="content-card">
                  <div className="helper-row">
                    <StatusBadge value={latestQuery.data.risk_category} />
                    <span className="subtle">Updated {formatDate(latestQuery.data.created_at)}</span>
                  </div>
                  <h2 style={{ marginTop: '12px' }}>Risk score {formatNumber(latestQuery.data.risk_score)}</h2>
                  <p className="body-copy">
                    {explainQuery.data?.explanation ||
                      'The system is summarizing water quality, disease patterns, community reports, and weather signals for this village.'}
                  </p>
                  <ul className="action-list">
                    {toActionList(latestQuery.data.recommended_actions).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>

                <article className="chart-card content-card">
                  <h3>Component score breakdown</h3>
                  <div className="chart-shell">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={scoreBreakdown}>
                        <XAxis dataKey="label" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="value" fill="#29b6f6" radius={[10, 10, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </article>
              </section>

              <section className="section split-layout">
                <article className="chart-card content-card">
                  <h3>Risk trend history</h3>
                  <div className="chart-shell">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <XAxis dataKey="label" />
                        <YAxis />
                        <Tooltip />
                        <Area type="monotone" dataKey="score" stroke="#0277bd" fill="#4fc3f7" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </article>

                <article className="content-card">
                  <h3>Simple explanation</h3>
                  <p className="body-copy">
                    The model combines the latest water readings, symptom patterns, local health reports, and weather factors. The goal is not to replace field judgement, but to help communities notice risk earlier.
                  </p>
                  <ul className="action-list">
                    <li>Outbreak timeline: {latestQuery.data.outbreak_timeline_days ?? 'No immediate outbreak sign'}</li>
                    <li>Water quality score: {formatNumber(latestQuery.data.water_quality_score)}</li>
                    <li>Disease risk score: {formatNumber(latestQuery.data.disease_risk_score)}</li>
                    <li>Last assessment time: {formatDate(latestQuery.data.created_at)}</li>
                  </ul>
                </article>
              </section>

              <section className="section split-layout">
                <article className="content-card">
                  <h3>What the model looked at</h3>
                  {topFactors.length ? (
                    <div className="stack">
                      {topFactors.map(([name, value]) => (
                        <div key={name} className="alert-card">
                          <div className="inline-between">
                            <strong>{sentenceCase(name.replace(/_/g, ' '))}</strong>
                            <span className="status-badge neutral">
                              Influence {formatNumber(value)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="body-copy">
                      Feature influence will appear here after the latest village assessment is generated.
                    </p>
                  )}
                </article>

                <article className="content-card">
                  <h3>Model and agent outputs</h3>
                  {agentCards.length ? (
                    <div className="stack">
                      {agentCards.map(([name, value]) => (
                        <article key={name} className="alert-card">
                          <div className="inline-between">
                            <strong>{sentenceCase(name.replace(/_/g, ' '))}</strong>
                            <span className="status-badge safe">
                              Score {formatNumber(value.risk_score)}
                            </span>
                          </div>
                          <p className="subtle">
                            Confidence {formatNumber(value.confidence)}
                          </p>
                          <ul className="action-list">
                            {(value.findings ?? []).slice(0, 3).map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="body-copy">
                      Model outputs are not available yet for this village.
                    </p>
                  )}
                </article>
              </section>
            </>
          ) : null}
        </>
      )}
    </>
  );
};
