import { useEffect, useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router-dom';
import { imagery } from '../assets/imagery';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { LoginPrompt } from '../components/LoginPrompt';
import { PageHero } from '../components/PageHero';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { VillageMapPanel } from '../components/VillageMapPanel';
import { VillageSelector } from '../components/VillageSelector';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { useRealtimeVillage } from '../hooks/useRealtimeVillage';
import { predictionService } from '../services/predictionService';
import { sensorService } from '../services/sensorService';
import { villageService } from '../services/villageService';
import { formatCompactDate, formatDate, formatNumber, sentenceCase } from '../utils/format';

export const VillageStatusPage = () => {
  const { isAuthenticated } = useAuth();
  const { activeVillageId, setActiveVillageId, savedVillageIds, toggleSavedVillage } = usePreferences();
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

  const dashboardQuery = useQuery({
    queryKey: ['village-dashboard', activeVillageId],
    queryFn: () => villageService.getDashboard(activeVillageId!),
    enabled: Boolean(isAuthenticated && activeVillageId),
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const predictionQuery = useQuery({
    queryKey: ['latest-prediction', activeVillageId],
    queryFn: () => predictionService.latest(activeVillageId!),
    enabled: Boolean(isAuthenticated && activeVillageId),
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const sensorReadingsQuery = useQuery({
    queryKey: ['sensor-readings', activeVillageId],
    queryFn: () => sensorService.readings(activeVillageId!, 72, 120),
    enabled: Boolean(isAuthenticated && activeVillageId),
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const sensorsQuery = useQuery({
    queryKey: ['sensors', activeVillageId],
    queryFn: () => sensorService.list(activeVillageId!),
    enabled: Boolean(isAuthenticated && activeVillageId),
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const sensorInventoryQuery = useQuery({
    queryKey: ['sensor-inventory', activeVillageId],
    queryFn: () => sensorService.inventory(activeVillageId!),
    enabled: Boolean(isAuthenticated && activeVillageId),
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const alertStream = useRealtimeVillage(activeVillageId, 'alerts');
  const sensorStream = useRealtimeVillage(activeVillageId, 'sensors');

  const chartData = useMemo(
    () =>
      (sensorReadingsQuery.data ?? []).slice().reverse().map((reading) => ({
        label: formatCompactDate(reading.timestamp),
        ph: reading.ph,
        turbidity: reading.turbidity,
        quality_score: reading.quality_score,
      })),
    [sensorReadingsQuery.data],
  );

  return (
    <>
      <PageHero
        eyebrow="Village overview"
        title="Village status you can understand at a glance"
        subtitle="See water quality, local risk, recent alerts, and monitoring signals in one clear page."
        image={imagery.fieldWorker}
      />

      {!isAuthenticated ? (
        <section className="section">
          <LoginPrompt />
        </section>
      ) : (
        <>
          <section className="section content-card">
            <div className="inline-between">
              <div className="stack" style={{ flex: 1 }}>
                <VillageSelector
                  villages={villagesQuery.data ?? []}
                  value={activeVillageId}
                  onChange={setActiveVillageId}
                />
                <div className="helper-row">
                  <Link className="ghost-button" to="/village-profile">
                    Open deep village profile
                  </Link>
                  <Link className="secondary-button" to="/citizen-services">
                    Citizen services
                  </Link>
                </div>
              </div>
              {activeVillageId ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => toggleSavedVillage(activeVillageId)}
                >
                  {savedVillageIds.includes(activeVillageId) ? 'Remove from watched villages' : 'Save village to profile'}
                </button>
              ) : null}
            </div>
          </section>

          {villagesQuery.data?.length ? (
            <section className="section">
              <VillageMapPanel
                villages={villagesQuery.data}
                selectedVillageId={activeVillageId}
                onSelect={setActiveVillageId}
              />
            </section>
          ) : null}

          {dashboardQuery.isLoading ? <LoadingState label="Loading village status..." /> : null}
          {dashboardQuery.isError ? <ErrorState description="The village status could not be loaded." /> : null}
          {!activeVillageId ? (
            <EmptyState title="Choose a village to begin" description="The dashboard appears as soon as a village is selected." />
          ) : null}

          {dashboardQuery.data ? (
            <>
              <section className="section metric-grid">
                <StatCard
                  label="Current village risk"
                  value={sentenceCase(dashboardQuery.data.risk.category)}
                  helper={`Updated ${formatDate(dashboardQuery.data.risk.last_updated)}`}
                />
                <StatCard
                  label="Water quality summary"
                  value={formatNumber(dashboardQuery.data.latest_sensor.quality_score)}
                  helper="Most recent quality score"
                />
                <StatCard
                  label="Recent alerts"
                  value={String(dashboardQuery.data.active_alerts.length)}
                  helper={`${dashboardQuery.data.village.name}, population ${formatNumber(dashboardQuery.data.village.population, 0)}`}
                />
              </section>

              <section className="section split-layout">
                <article className="chart-card content-card">
                  <div className="inline-between">
                    <div>
                      <h3>Water quality trend</h3>
                      <p className="subtle">Simple view of pH and turbidity over recent readings</p>
                    </div>
                    <div className="helper-row">
                      <span className={`status-dot ${sensorStream.isConnected ? '' : 'offline'}`} />
                      <span className="subtle">{sensorStream.isConnected ? 'Live sensor stream connected' : 'Live sensor stream offline'}</span>
                    </div>
                  </div>
                  <div className="chart-shell">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <XAxis dataKey="label" />
                        <YAxis />
                        <Tooltip />
                        <Line dataKey="ph" stroke="#0277bd" strokeWidth={3} dot={false} />
                        <Line dataKey="turbidity" stroke="#f57c00" strokeWidth={3} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </article>

                <article className="content-card">
                  <div className="inline-between">
                    <div>
                      <h3>Recent alerts</h3>
                      <p className="subtle">Plain-language warnings for this village</p>
                    </div>
                    <div className="helper-row">
                      <span className={`status-dot ${alertStream.isConnected ? '' : 'offline'}`} />
                      <span className="subtle">{alertStream.isConnected ? 'Live alert stream connected' : 'Live alert stream offline'}</span>
                    </div>
                  </div>
                  <div className="stack">
                    {dashboardQuery.data.active_alerts.length ? (
                      dashboardQuery.data.active_alerts.map((alert) => (
                        <article key={alert.id} className="alert-card">
                          <div className="inline-between">
                            <h4>{alert.title}</h4>
                            <StatusBadge value={alert.severity} />
                          </div>
                          <p className="subtle">{formatDate(alert.created_at)}</p>
                        </article>
                      ))
                    ) : (
                      <EmptyState title="No active alerts" description="This village currently has no urgent active alerts." />
                    )}
                  </div>
                </article>
              </section>

              <section className="section split-layout">
                <article className="content-card">
                  <h3>Prediction summary</h3>
                  {predictionQuery.data ? (
                    <>
                      <div className="helper-row">
                        <StatusBadge value={predictionQuery.data.risk_category} />
                        <span className="subtle">Risk score {formatNumber(predictionQuery.data.risk_score)}</span>
                      </div>
                      <ul className="action-list">
                        <li>Water quality score: {formatNumber(predictionQuery.data.water_quality_score)}</li>
                        <li>Disease risk score: {formatNumber(predictionQuery.data.disease_risk_score)}</li>
                        <li>Community health score: {formatNumber(predictionQuery.data.community_health_score)}</li>
                        <li>Weather risk score: {formatNumber(predictionQuery.data.weather_risk_score)}</li>
                      </ul>
                    </>
                  ) : (
                    <p className="subtle">Prediction details will appear here once a village assessment is available.</p>
                  )}
                </article>

                <article className="content-card">
                  <h3>Sensor snapshot</h3>
                  <ul className="action-list">
                    <li>Registered sensors: {sensorInventoryQuery.data?.total ?? sensorsQuery.data?.length ?? 0}</li>
                    <li>Latest pH: {formatNumber(dashboardQuery.data.latest_sensor.ph)}</li>
                    <li>Latest turbidity: {formatNumber(dashboardQuery.data.latest_sensor.turbidity)}</li>
                    <li>Latest E.coli: {formatNumber(dashboardQuery.data.latest_sensor.ecoli)}</li>
                    <li>Last reading time: {formatDate(dashboardQuery.data.latest_sensor.timestamp)}</li>
                  </ul>
                </article>
              </section>

              <section className="section">
                <article className="content-card">
                  <div className="inline-between">
                    <div>
                      <h3>Available sensors dataset</h3>
                      <p className="subtle">
                        Separate village-wise sensor inventory with latest reading details.
                      </p>
                    </div>
                    <div className="helper-row">
                      <span className="status-badge neutral">
                        {sensorInventoryQuery.data?.total ?? 0} sensors
                      </span>
                    </div>
                  </div>

                  <p className="subtle">
                    Dataset file: {sensorInventoryQuery.data?.dataset_path ?? 'Preparing sensor dataset'}
                  </p>

                  <div className="stack">
                    {sensorInventoryQuery.data?.items?.length ? (
                      sensorInventoryQuery.data.items.map((sensor) => (
                        <article key={sensor.sensor_id} className="alert-card">
                          <div className="inline-between">
                            <div>
                              <h4>{sensor.sensor_code}</h4>
                              <p className="subtle">
                                {sensor.location_name || `${sensor.village_name} monitoring point`}
                              </p>
                            </div>
                            <span className={`status-badge ${sensor.status}`}>
                              {sentenceCase(sensor.status)}
                            </span>
                          </div>
                          <div className="meta-row">
                            <span>Type {sentenceCase(sensor.sensor_type)}</span>
                            <span>Firmware {sensor.firmware_version || 'Not available'}</span>
                            <span>Readings {sensor.reading_count}</span>
                            <span>Quality {formatNumber(sensor.latest_quality_score)}</span>
                          </div>
                          <div className="meta-row">
                            <span>Latest pH {formatNumber(sensor.latest_ph)}</span>
                            <span>Turbidity {formatNumber(sensor.latest_turbidity)}</span>
                            <span>E.coli {formatNumber(sensor.latest_ecoli)}</span>
                            <span>Updated {formatDate(sensor.latest_reading_at)}</span>
                          </div>
                        </article>
                      ))
                    ) : (
                      <EmptyState
                        title="No sensor dataset entries yet"
                        description="Sensors and their village details will appear here as soon as they are available."
                      />
                    )}
                  </div>
                </article>
              </section>
            </>
          ) : null}
        </>
      )}
    </>
  );
};
