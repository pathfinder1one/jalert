import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link, useLocation } from 'react-router-dom';
import { imagery } from '../assets/imagery';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { LoginPrompt } from '../components/LoginPrompt';
import { PageHero } from '../components/PageHero';
import { StatCard } from '../components/StatCard';
import { VillageSelector } from '../components/VillageSelector';
import { WaterResourceIndiaMap } from '../components/WaterResourceIndiaMap';
import { INDIA_STATE_OPTIONS } from '../constants/indiaStates';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { useRealtimeVillage } from '../hooks/useRealtimeVillage';
import { sensorService } from '../services/sensorService';
import { villageIntelligenceService } from '../services/villageIntelligenceService';
import { villageService } from '../services/villageService';
import { waterResourceService } from '../services/waterResourceService';
import type { Sensor, SensorReading, Village, VillageIntelligenceProfile, VillageMapOverview, WaterResourceResponse } from '../types/api';
import { formatCompactDate, formatDate, formatNumber, sentenceCase } from '../utils/format';

export const SensorsPage = () => {
  const { isAuthenticated } = useAuth();
  const { activeVillageId, setActiveVillageId } = usePreferences();
  const location = useLocation();
  const [hours, setHours] = useState(48);
  const [resourceQuery, setResourceQuery] = useState('');
  const [resourceState, setResourceState] = useState('');
  const [resourceDistrict, setResourceDistrict] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [season, setSeason] = useState('post_monsoon');
  const [contaminant, setContaminant] = useState('');
  const [selectedResourceId, setSelectedResourceId] = useState('');
  const deferredResourceQuery = useDeferredValue(resourceQuery);
  const deferredResourceState = useDeferredValue(resourceState);
  const deferredResourceDistrict = useDeferredValue(resourceDistrict);
  const deferredResourceType = useDeferredValue(resourceType);
  const deferredContaminant = useDeferredValue(contaminant);

  const villagesQuery = useQuery<Village[]>({
    queryKey: ['villages'],
    queryFn: villageService.list,
    enabled: isAuthenticated,
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

  const sensorsQuery = useQuery<Sensor[]>({
    queryKey: ['sensors', activeVillageId],
    queryFn: () => sensorService.list(activeVillageId!),
    enabled: Boolean(isAuthenticated && activeVillageId),
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const readingsQuery = useQuery<SensorReading[]>({
    queryKey: ['sensor-readings', activeVillageId, hours],
    queryFn: () => sensorService.readings(activeVillageId!, hours, 150),
    enabled: Boolean(isAuthenticated && activeVillageId),
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const waterResourcesQuery = useQuery<WaterResourceResponse>({
    queryKey: ['water-resources', deferredResourceQuery, deferredResourceState, deferredResourceType],
    queryFn: () =>
      waterResourceService.list({
        query: deferredResourceQuery || undefined,
        state: deferredResourceState || undefined,
        resourceType: deferredResourceType || undefined,
        limit: 60,
      }),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });
  const mapOverviewQuery = useQuery<VillageMapOverview>({
    queryKey: ['village-map-overview', deferredResourceState, deferredResourceDistrict, deferredContaminant, season],
    queryFn: () =>
      villageIntelligenceService.mapOverview({
        state: deferredResourceState || undefined,
        district: deferredResourceDistrict || undefined,
        contaminant: deferredContaminant || undefined,
        season,
      }),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
  const villageProfileQuery = useQuery<VillageIntelligenceProfile>({
    queryKey: ['water-village-profile', activeVillageId],
    queryFn: () => villageIntelligenceService.profile(activeVillageId!),
    enabled: Boolean(isAuthenticated && activeVillageId),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const sensorStream = useRealtimeVillage(activeVillageId, 'sensors');
  const readingItems: SensorReading[] = readingsQuery.data ?? [];
  const latestReading = readingItems[0];
  const waterResources: WaterResourceResponse['resources'] = waterResourcesQuery.data?.resources ?? [];
  const selectedResource = useMemo(
    () => waterResources.find((item) => item.resource_id === selectedResourceId) ?? waterResources[0] ?? null,
    [selectedResourceId, waterResources],
  );
  const waterResourceMap = waterResourcesQuery.data?.map;
  const districtOptions = useMemo(() => {
    const districts = new Set<string>();
    (mapOverviewQuery.data?.districts ?? []).forEach((item) => {
      if (!deferredResourceState || item.state === deferredResourceState) {
        districts.add(item.name);
      }
    });
    return Array.from(districts).sort((a, b) => a.localeCompare(b));
  }, [deferredResourceState, mapOverviewQuery.data?.districts]);
  const chartData = useMemo(
    () =>
      readingItems.slice().reverse().map((reading) => ({
        label: formatCompactDate(reading.timestamp),
        ph: reading.ph,
        turbidity: reading.turbidity,
        tds: reading.tds,
        ecoli: reading.ecoli,
      })),
    [readingItems],
  );
  const stateOptions = useMemo(() => {
    const merged = new Set<string>(INDIA_STATE_OPTIONS);
    (waterResourcesQuery.data?.available_states ?? []).forEach((item) => merged.add(item));
    (villagesQuery.data ?? []).forEach((village) => {
      if (village.state) {
        merged.add(village.state);
      }
    });
    return Array.from(merged).sort((a, b) => a.localeCompare(b));
  }, [villagesQuery.data, waterResourcesQuery.data?.available_states]);
  const filteredVillages = useMemo(() => {
    return (villagesQuery.data ?? []).filter((village) => {
      const matchesState = !deferredResourceState || village.state === deferredResourceState;
      const matchesDistrict =
        !deferredResourceDistrict
        || village.district.toLowerCase().includes(deferredResourceDistrict.toLowerCase());
      const query = deferredResourceQuery.trim().toLowerCase();
      const matchesQuery =
        !query
        || `${village.name} ${village.district} ${village.state}`.toLowerCase().includes(query);
      return matchesState && matchesDistrict && matchesQuery;
    });
  }, [deferredResourceDistrict, deferredResourceQuery, deferredResourceState, villagesQuery.data]);
  const fallbackStatesCount = useMemo(
    () => new Set(filteredVillages.map((village) => village.state)).size,
    [filteredVillages],
  );
  const fallbackDistrictsCount = useMemo(
    () => new Set(filteredVillages.map((village) => `${village.state}::${village.district}`)).size,
    [filteredVillages],
  );
  const sensorSummary = useMemo(() => {
    const sensors = sensorsQuery.data ?? [];
    const activeSensors = sensors.filter((sensor) => sensor.status === 'active').length;
    const faultySensors = sensors.filter((sensor) => sensor.status === 'faulty').length;
    return {
      total: sensors.length,
      active: activeSensors,
      faulty: faultySensors,
      latestSeen: sensors[0]?.last_seen ?? latestReading?.timestamp ?? null,
    };
  }, [latestReading?.timestamp, sensorsQuery.data]);

  useEffect(() => {
    if (!waterResources.length) {
      setSelectedResourceId('');
      return;
    }
    if (!selectedResourceId || !waterResources.some((item) => item.resource_id === selectedResourceId)) {
      setSelectedResourceId(waterResources[0].resource_id);
    }
  }, [selectedResourceId, waterResources]);

  useEffect(() => {
    if (!location.hash) {
      return;
    }
    const targetId = location.hash.replace('#', '');
    const timer = window.setTimeout(() => {
      const target = document.getElementById(targetId);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [location.hash, latestReading, waterResources.length]);

  return (
    <div className="sensors-page">
      <PageHero
        eyebrow="Water monitoring and resources"
        title="Official water resources and live monitoring in one place"
        subtitle="Explore public water sources, groundwater stations, and village water-quality records, then check live readings for your selected village."
        image={imagery.waterBody}
        badges={['Live sensor readings', 'Official datasets', 'Groundwater levels', 'Contaminant filters']}
        primaryLabel="Explore water resources"
        primaryTo="/sensors#water-resources"
        secondaryLabel="Live monitoring"
        secondaryTo="/sensors#iot-monitoring"
      />

      <section id="water-resources" className="section split-layout sensors-explorer-grid">
        <article className="content-card sensors-explorer-card">
          <div className="inline-between">
            <div>
              <h3>Official water resources explorer</h3>
              <p className="subtle">
                Search groundwater stations, village water records, and surface-water monitoring
                points from the official datasets loaded into JALERT.
              </p>
            </div>
            <div className="helper-row">
              <a
                className="link-chip"
                href={waterResourceMap?.portal_url}
                target="_blank"
                rel="noreferrer"
              >
                Open Bhuvan map
              </a>
              <a
                className="link-chip"
                href={waterResourceMap?.wms_url}
                target="_blank"
                rel="noreferrer"
              >
                Bhuvan WMS
              </a>
            </div>
          </div>

          <div className="form-grid sensors-explorer-filters" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
            <div className="field">
              <label htmlFor="resource-query">Search location</label>
              <input
                id="resource-query"
                value={resourceQuery}
                onChange={(e) => setResourceQuery(e.target.value)}
                placeholder="Village, district, or station"
              />
            </div>
            <div className="field">
              <label htmlFor="resource-state">State</label>
              <select
                id="resource-state"
                value={resourceState}
                onChange={(e) => setResourceState(e.target.value)}
              >
                <option value="">All states</option>
                {stateOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="resource-district">District</label>
              <select
                id="resource-district"
                value={resourceDistrict}
                onChange={(e) => setResourceDistrict(e.target.value)}
              >
                <option value="">All districts</option>
                {districtOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="resource-type">Resource type</label>
              <select
                id="resource-type"
                value={resourceType}
                onChange={(e) => setResourceType(e.target.value)}
              >
                <option value="">All resources</option>
                <option value="groundwater">Groundwater</option>
                <option value="groundwater_level_station">Groundwater level station</option>
                <option value="surface_water">Surface water</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="resource-contaminant">Contaminant filter</label>
              <select
                id="resource-contaminant"
                value={contaminant}
                onChange={(e) => setContaminant(e.target.value)}
              >
                <option value="">All contaminants</option>
                <option value="arsenic">Arsenic</option>
                <option value="fluoride">Fluoride</option>
                <option value="nitrate">Nitrate</option>
                <option value="salinity">Salinity / TDS</option>
                <option value="biological">Biological</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="season">Groundwater season</label>
              <select id="season" value={season} onChange={(e) => setSeason(e.target.value)}>
                <option value="post_monsoon">Post-monsoon</option>
                <option value="pre_monsoon">Pre-monsoon</option>
              </select>
            </div>
          </div>

          {waterResourcesQuery.isLoading && waterResources.length === 0 ? (
            <LoadingState label="Loading official water resources..." />
          ) : null}
          {waterResourcesQuery.isError ? (
            <ErrorState description="Official water resources could not be loaded." />
          ) : null}

          {waterResourcesQuery.data ? (
            <>
              {waterResourcesQuery.isFetching ? (
                <div className="helper-row section-tight">
                  <span className="status-dot" />
                  <span className="subtle">Refreshing official water resources...</span>
                </div>
              ) : null}

              <div className="metric-grid section-tight">
                <StatCard
                  label="Official resources"
                  value={String(waterResourcesQuery.data.summary.total_resources)}
                  helper="Loaded from public water datasets"
                />
                <StatCard
                  label="States covered"
                  value={String(waterResourcesQuery.data.summary.states_covered)}
                  helper="Across official source files"
                />
                <StatCard
                  label="Groundwater records"
                  value={String(waterResourcesQuery.data.summary.groundwater_resources)}
                  helper="Stations, wells, and level points"
                />
              </div>

              <div className="resource-map-card sensors-resource-map">
                <WaterResourceIndiaMap
                  resources={waterResources}
                  overview={mapOverviewQuery.data}
                  villages={filteredVillages}
                />
              </div>

              <div className="metric-grid section-tight">
                <StatCard
                  label="Village clusters"
                  value={String(mapOverviewQuery.data?.clusters.length ?? Math.max(fallbackDistrictsCount, 0))}
                  helper="State and district-level drilldown groups"
                />
                <StatCard
                  label="Mapped villages"
                  value={String(mapOverviewQuery.data?.villages.length ?? filteredVillages.length)}
                  helper="Village points with risk and contaminant signals"
                />
                <StatCard
                  label="Groundwater layer"
                  value={sentenceCase((mapOverviewQuery.data?.season ?? season).replace(/_/g, ' '))}
                  helper="Pre-monsoon or post-monsoon comparison view"
                />
              </div>

              <div className="stack sensors-resource-list">
                {waterResources.length ? (
                  waterResources.slice(0, 20).map((resource) => (
                    <article
                      key={`${resource.resource_type}-${resource.resource_id}-${resource.name}`}
                      className={`alert-card sensors-resource-row ${selectedResource?.resource_id === resource.resource_id ? 'selected-resource-card' : ''}`}
                      onClick={() => setSelectedResourceId(resource.resource_id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedResourceId(resource.resource_id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="inline-between">
                        <div>
                          <h4>{resource.name}</h4>
                          <p className="subtle">
                            {resource.district_name || 'Unknown district'},{' '}
                            {resource.state_name || 'Unknown state'}
                          </p>
                        </div>
                        <span
                          className={`status-badge ${
                            resource.resource_type.includes('groundwater') ? 'moderate' : 'safe'
                          }`}
                        >
                          {sentenceCase(resource.resource_type.replace(/_/g, ' '))}
                        </span>
                      </div>
                      <div className="meta-row">
                        {resource.water_quality_score != null ? (
                          <span>Quality score {formatNumber(resource.water_quality_score)}</span>
                        ) : null}
                        {resource.ph != null ? <span>pH {formatNumber(resource.ph)}</span> : null}
                        {resource.tds != null ? <span>TDS {formatNumber(resource.tds)}</span> : null}
                        {resource.current_level != null ? (
                          <span>Water level {formatNumber(resource.current_level)}</span>
                        ) : null}
                        {resource.level_diff != null ? (
                          <span>Level change {formatNumber(resource.level_diff)}</span>
                        ) : null}
                      </div>
                    </article>
                  ))
                ) : (
                  <EmptyState
                    title="Official water resources are warming up"
                    description="The public dataset cache is still loading in the background. This page will refresh automatically in a moment."
                  />
                )}
              </div>

              {selectedResource ? (
                <article className="content-card section-tight sensors-selected-resource">
                  <div className="inline-between">
                    <div>
                      <h3>Selected water resource</h3>
                      <p className="subtle">
                        {selectedResource.name}
                      </p>
                    </div>
                    <span
                      className={`status-badge ${
                        selectedResource.resource_type.includes('groundwater') ? 'moderate' : 'safe'
                      }`}
                    >
                      {sentenceCase(selectedResource.resource_type.replace(/_/g, ' '))}
                    </span>
                  </div>

                  <div className="mini-grid section-tight">
                    <div className="map-mini-stat">
                      <strong>{selectedResource.district_name || 'Unknown'}</strong>
                      <span>District</span>
                    </div>
                    <div className="map-mini-stat">
                      <strong>{selectedResource.state_name || 'Unknown'}</strong>
                      <span>State</span>
                    </div>
                    <div className="map-mini-stat">
                      <strong>{formatNumber(selectedResource.water_quality_score)}</strong>
                      <span>Quality score</span>
                    </div>
                    <div className="map-mini-stat">
                      <strong>{formatNumber(selectedResource.ph)}</strong>
                      <span>pH</span>
                    </div>
                    <div className="map-mini-stat">
                      <strong>{formatNumber(selectedResource.tds)}</strong>
                      <span>TDS</span>
                    </div>
                    <div className="map-mini-stat">
                      <strong>{formatNumber(selectedResource.current_level)}</strong>
                      <span>Water level</span>
                    </div>
                  </div>

                  <div className="assistant-links">
                    {typeof selectedResource.latitude === 'number' && typeof selectedResource.longitude === 'number' ? (
                      <a
                        className="link-chip"
                        href={`https://www.openstreetmap.org/?mlat=${selectedResource.latitude}&mlon=${selectedResource.longitude}#map=12/${selectedResource.latitude}/${selectedResource.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open on map
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="link-chip"
                      onClick={() => {
                        if (selectedResource.state_name) {
                          setResourceState(selectedResource.state_name);
                        }
                        if (selectedResource.district_name) {
                          setResourceDistrict(selectedResource.district_name);
                        }
                        if (selectedResource.resource_type) {
                          setResourceType(selectedResource.resource_type);
                        }
                      }}
                    >
                      Filter similar resources
                    </button>
                  </div>
                </article>
              ) : null}
            </>
          ) : null}
        </article>

        <article className="content-card sensors-network-card">
          <h3>Source network connected to JALERT</h3>
          <ul className="action-list">
            <li>OGD India water-quality datasets</li>
            <li>Village water-quality records</li>
            <li>Groundwater quality yearly tables</li>
            <li>CGWB and state groundwater level-change records</li>
            <li>Bhuvan groundwater map portal and WMS services</li>
            <li>JJM village and FHTC reports ready for future export integration</li>
          </ul>
          <p className="body-copy">
            This public section helps normal users discover water resources, while the live village
            monitoring tools below stay focused on sensor-based readings.
          </p>
          {villageProfileQuery.data ? (
            <>
              <div className="section-tight">
                <h4>Nearby safe source finder</h4>
                <p className="subtle">{villageProfileQuery.data.alternate_source.message}</p>
                <div className="assistant-links">
                  {villageProfileQuery.data.alternate_source.map_link ? (
                    <a className="link-chip" href={villageProfileQuery.data.alternate_source.map_link} target="_blank" rel="noreferrer">
                      Open alternate route
                    </a>
                  ) : null}
                  <Link className="link-chip" to="/village-profile">
                    Open village intelligence
                  </Link>
                </div>
              </div>

              <div className="section-tight">
                <h4>Official data ingestion status</h4>
                <ul className="action-list">
                  <li>JJM export: {sentenceCase(villageProfileQuery.data.official_ingestion.jjm_export.status.replace(/_/g, ' '))}</li>
                  <li>FTK / lab dataset: {sentenceCase(villageProfileQuery.data.official_ingestion.ftk_lab.status.replace(/_/g, ' '))}</li>
                  <li>Monsoon preparedness: {formatNumber(villageProfileQuery.data.monsoon_preparedness.score)}</li>
                  <li>Household vulnerability: {formatNumber(villageProfileQuery.data.household_vulnerability.score)}</li>
                </ul>
              </div>
            </>
          ) : null}
        </article>
      </section>

      {!isAuthenticated ? (
        <section className="section">
          <LoginPrompt />
        </section>
      ) : (
        <>
          <section className="section content-card sensors-toolbar-card">
            <div className="inline-between">
              <VillageSelector
                villages={villagesQuery.data ?? []}
                value={activeVillageId}
                onChange={setActiveVillageId}
              />
              <div style={{ display: 'grid', gap: '10px', justifyItems: 'end' }}>
                <div className="field" style={{ maxWidth: '180px' }}>
                  <label htmlFor="hours">History range</label>
                  <select id="hours" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                    <option value={24}>Last 24 hours</option>
                    <option value={48}>Last 48 hours</option>
                    <option value={72}>Last 72 hours</option>
                    <option value={168}>Last 7 days</option>
                  </select>
                </div>
                {readingsQuery.isFetching && activeVillageId ? (
                  <span className="subtle" style={{ fontSize: '0.92rem', fontWeight: 600 }}>
                    Refreshing readings...
                  </span>
                ) : null}
              </div>
            </div>
          </section>

          {readingsQuery.isLoading && readingItems.length === 0 ? (
            <LoadingState label="Loading water readings..." />
          ) : null}
          {readingsQuery.isError ? (
            <ErrorState description="Water readings could not be loaded." />
          ) : null}
          {!activeVillageId ? (
            <EmptyState
              title="Choose a village to view water monitoring"
              description="Readings, charts, and safe-range guidance will appear here."
            />
          ) : null}

          {!readingsQuery.isLoading && !readingsQuery.isError && activeVillageId && !latestReading ? (
            <>
              <EmptyState
                title="No water readings found for this history range"
                description="This village is selected, but there are no returned sensor readings yet for the current time window. Try a longer range or wait for the next sync."
              />

              <section className="section metric-grid">
                <StatCard
                  label="Registered sensors"
                  value={String(sensorSummary.total)}
                  helper="Sensor points linked to this village"
                />
                <StatCard
                  label="Last sensor seen"
                  value={sensorSummary.latestSeen ? formatDate(sensorSummary.latestSeen) : 'No sync yet'}
                  helper="Most recent device heartbeat"
                />
                <StatCard
                  label="Mapped sources"
                  value={String(waterResources.length)}
                  helper="Water sources available for monitoring"
                />
              </section>

              {sensorsQuery.data?.length ? (
                <section className="section">
                  <article className="content-card sensors-monitor-card">
                    <h3>Registered sensors</h3>
                    <div className="stack">
                      {sensorsQuery.data.map((sensor) => (
                        <article key={sensor.id} className="alert-card sensors-sensor-row">
                          <div className="inline-between">
                            <h4>{sensor.sensor_code}</h4>
                            <span className={`status-badge ${sensor.status}`}>
                              {sentenceCase(sensor.status)}
                            </span>
                          </div>
                          <p className="subtle">
                            {`${sensor.location_name || 'Unnamed sensor point'} | Last seen ${formatDate(sensor.last_seen)}`}
                          </p>
                        </article>
                      ))}
                    </div>
                  </article>
                </section>
              ) : null}
            </>
          ) : null}

          {latestReading ? (
            <>
              <section id="iot-monitoring" className="section metric-grid">
                <StatCard
                  label="Current pH"
                  value={formatNumber(latestReading.ph)}
                  helper="Safe range is usually 6.5 to 8.5"
                />
                <StatCard
                  label="Current turbidity"
                  value={formatNumber(latestReading.turbidity)}
                  helper="Lower values are better for clear water"
                />
                <StatCard
                  label="Current E.coli"
                  value={formatNumber(latestReading.ecoli)}
                  helper="Any detection needs quick attention"
                />
              </section>

              <section className="section split-layout">
                <article className="chart-card content-card sensors-chart-card">
                  <div className="inline-between">
                    <div>
                      <h3>Water reading trends</h3>
                      <p className="subtle">Recent pH and turbidity movement</p>
                    </div>
                    <div className="helper-row">
                      <span className={`status-dot ${sensorStream.isConnected ? '' : 'offline'}`} />
                      <span className="subtle">
                        {sensorStream.isConnected
                          ? 'Live sensor updates connected'
                          : 'Live sensor updates offline'}
                      </span>
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

                <div className="stack">
                  <article className="content-card sensors-monitor-card">
                    <h3>Latest snapshot</h3>
                    <ul className="action-list">
                      <li>Quality score: {formatNumber(latestReading.quality_score)}</li>
                      <li>TDS: {formatNumber(latestReading.tds)}</li>
                      <li>Nitrate: {formatNumber(latestReading.nitrate)}</li>
                      <li>Arsenic: {formatNumber(latestReading.arsenic)}</li>
                      <li>Fluoride: {formatNumber(latestReading.fluoride)}</li>
                      <li>Recorded at: {formatDate(latestReading.timestamp)}</li>
                    </ul>
                  </article>

                  <article className="content-card sensors-monitor-card">
                    <h3>Monitoring status</h3>
                    <ul className="action-list">
                      <li>Total registered sensors: {sensorSummary.total}</li>
                      <li>Active right now: {sensorSummary.active}</li>
                      <li>Faulty / needs check: {sensorSummary.faulty}</li>
                      <li>Last sensor seen: {formatDate(sensorSummary.latestSeen)}</li>
                      <li>Resource sources mapped: {waterResources.length}</li>
                      <li>Village safe sources: {villageProfileQuery.data?.nearby_safe_sources.length ?? 0}</li>
                    </ul>
                  </article>
                </div>
              </section>

              <section className="section">
                  <article className="content-card sensors-monitor-card">
                  <h3>Registered sensors</h3>
                  <div className="stack">
                    {sensorsQuery.data?.map((sensor) => (
                      <article key={sensor.id} className="alert-card sensors-sensor-row">
                        <div className="inline-between">
                          <h4>{sensor.sensor_code}</h4>
                          <span className={`status-badge ${sensor.status}`}>
                            {sentenceCase(sensor.status)}
                          </span>
                        </div>
                        <p className="subtle">
                          {`${sensor.location_name || 'Unnamed sensor point'} | Last seen ${formatDate(sensor.last_seen)}`}
                        </p>
                      </article>
                    ))}
                  </div>
                </article>
              </section>
            </>
          ) : null}
        </>
      )}
    </div>
  );
};
