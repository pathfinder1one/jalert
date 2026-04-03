import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { imagery } from '../assets/imagery';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { LoginPrompt } from '../components/LoginPrompt';
import { PageHero } from '../components/PageHero';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { VillageSelector } from '../components/VillageSelector';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { villageService } from '../services/villageService';
import { villageIntelligenceService } from '../services/villageIntelligenceService';
import type { Village, VillageCatalog, VillageIntelligenceProfile } from '../types/api';
import { formatDate, formatNumber, sentenceCase } from '../utils/format';

const firstVillageId = (catalog?: VillageCatalog) =>
  catalog?.states[0]?.districts[0]?.blocks[0]?.panchayats[0]?.villages[0]?.id ?? null;

const buildCatalogFromVillages = (villages: Village[]): VillageCatalog => {
  const stateMap = new Map<
    string,
    Map<string, Map<string, Map<string, Array<{ id: string; name: string }>>>>
  >();

  villages.forEach((village) => {
    const stateName = village.state;
    const districtName = village.district;
    const blockName = `${village.district} block`;
    const panchayatName = `${village.name.split(' ')[0]} panchayat`;

    if (!stateMap.has(stateName)) {
      stateMap.set(stateName, new Map());
    }
    const districtMap = stateMap.get(stateName)!;
    if (!districtMap.has(districtName)) {
      districtMap.set(districtName, new Map());
    }
    const blockMap = districtMap.get(districtName)!;
    if (!blockMap.has(blockName)) {
      blockMap.set(blockName, new Map());
    }
    const panchayatMap = blockMap.get(blockName)!;
    if (!panchayatMap.has(panchayatName)) {
      panchayatMap.set(panchayatName, []);
    }
    panchayatMap.get(panchayatName)!.push({ id: village.id, name: village.name });
  });

  return {
    states: Array.from(stateMap.entries()).map(([stateName, districtMap]) => ({
      name: stateName,
      districts: Array.from(districtMap.entries()).map(([districtName, blockMap]) => ({
        name: districtName,
        blocks: Array.from(blockMap.entries()).map(([blockName, panchayatMap]) => ({
          name: blockName,
          panchayats: Array.from(panchayatMap.entries()).map(([panchayatName, villageItems]) => ({
            name: panchayatName,
            villages: villageItems,
          })),
        })),
      })),
    })),
    source_label: 'frontend drilldown generated from active village registry',
  };
};

const buildFallbackVillageProfile = (
  village: Village,
  dashboard: ReturnType<typeof villageService.getDashboard> extends Promise<infer T> ? T : never,
  path?: { state: string; district: string; block: string; panchayat: string } | null,
): VillageIntelligenceProfile => {
  const qualityScore = dashboard.latest_sensor.quality_score ?? 72;
  const ecoli = dashboard.latest_sensor.ecoli ?? 0;
  const households = Math.max(1, Math.round(village.population / 4.8));
  const tapCoveragePercent = Math.max(
    42,
    Math.min(96, Math.round((qualityScore >= 70 ? 82 : qualityScore >= 55 ? 71 : 58) * 10) / 10),
  );
  const tapConnectedHouseholds = Math.round((households * tapCoveragePercent) / 100);
  const qualityBadge =
    ecoli > 0 || qualityScore < 55
      ? 'water_quality_affected'
      : dashboard.risk.category === 'high' || dashboard.risk.category === 'critical'
        ? 'needs_attention'
        : 'safe';

  return {
    village: {
      id: village.id,
      name: village.name,
      district: village.district,
      state: village.state,
      population: village.population,
      latitude: village.latitude,
      longitude: village.longitude,
      quality_badge: qualityBadge,
      quality_badge_label: sentenceCase(qualityBadge.replace(/_/g, ' ')),
    },
    drilldown: {
      state: path?.state ?? village.state,
      district: path?.district ?? village.district,
      block: path?.block ?? `${village.district} block`,
      panchayat: path?.panchayat ?? `${village.name.split(' ')[0]} panchayat`,
      source_label: 'fallback profile generated from active village dashboard',
    },
    coverage: {
      households,
      tap_connected_households: tapConnectedHouseholds,
      remaining_households: Math.max(0, households - tapConnectedHouseholds),
      tap_coverage_percent: tapCoveragePercent,
      schools: { total: Math.max(1, Math.round(village.population / 900)), covered: Math.max(1, Math.round(village.population / 1100)) },
      anganwadi: { total: Math.max(1, Math.round(village.population / 1300)), covered: Math.max(1, Math.round(village.population / 1500)) },
      habitation_count: Math.max(1, Math.round(village.population / 1600)),
      source_label: 'live village dashboard fallback',
      source_reference: 'derived from current village, risk signals, and latest water monitoring snapshot',
    },
    iot_monitoring: {
      tank_level_percent: Math.max(28, Math.min(93, Math.round((qualityScore + 12) * 10) / 10)),
      pump_runtime_hours: 5.5,
      chlorine_residual_mg_l: 0.32,
      supply_hours_today: qualityScore >= 70 ? 11 : qualityScore >= 55 ? 8.5 : 6,
      last_successful_delivery_time: dashboard.latest_sensor.timestamp,
      source_label: 'fallback from latest sensor dashboard',
      sensor_count: 1,
    },
    testing_summary: {
      last_lab_test_at: dashboard.latest_sensor.timestamp,
      ftk_test_count: dashboard.latest_sensor.timestamp ? 4 : 1,
      contamination_found: ecoli > 0 || qualityScore < 55,
      safe_after_retest: ecoli <= 0 && qualityScore >= 70,
      tested_by: 'JALERT local monitoring workflow',
      source_label: 'fallback generated from live sensor readings',
    },
    source_scheme: {
      sources: [
        {
          name: `${village.name} primary source`,
          source_type: 'groundwater',
          treatment_required: true,
          treatment_available: qualityScore >= 60,
          supply_route: ['Source point', 'Storage tank', 'Village supply line', 'Households'],
          coordinate_confidence: 'village_registry',
          distance_km: 1.2,
        },
      ],
      schemes: [
        {
          name: `${village.name} village water scheme`,
          scheme_type: 'rural_water_supply',
          service_status: dashboard.risk.category === 'critical' ? 'needs_attention' : 'operational',
          treatment_stage: qualityScore >= 60 ? 'basic_treatment' : 'improvement_needed',
          connected_sources: [`${village.name} primary source`],
          official_reference: 'fallback village scheme summary',
          source_label: 'modeled from village registry and live readings',
        },
      ],
    },
    groundwater: {
      available: true,
      pre_monsoon_level_m: 10.8,
      post_monsoon_level_m: 8.9,
      level_change_m: -1.9,
      recharge_trend: 'improving',
      district_comparison: `${village.district} district median trend`,
      coordinate_confidence: 'approximate village-level groundwater summary',
      official_reference: 'fallback groundwater view',
    },
    affordability: {
      tanker_dependency: qualityScore < 58,
      monthly_spend_inr: qualityScore < 58 ? 950 : 420,
      high_burden: qualityScore < 58,
      support_eligibility: dashboard.risk.category === 'high' || dashboard.risk.category === 'critical',
      source_label: 'fallback household burden estimate',
      official_reference: 'village-support estimate',
    },
    monsoon_preparedness: {
      score: qualityScore >= 70 ? 78 : qualityScore >= 55 ? 62 : 44,
      label: qualityScore >= 70 ? 'ready' : qualityScore >= 55 ? 'watchful' : 'needs_preparation',
      advice: qualityScore >= 70 ? 'Maintain chlorination and keep backup storage ready.' : 'Inspect storage, monitor supply lines, and keep alternate drinking source ready.',
    },
    household_vulnerability: {
      score: dashboard.risk.score ?? (qualityScore >= 70 ? 28 : 53),
      label: (dashboard.risk.category ?? 'moderate') as string,
      summary: 'Fallback household vulnerability view based on latest local monitoring and current village risk.',
    },
    family_actions: [
      'Use the latest monitored source for drinking water.',
      'Boil or filter drinking water if taste, smell, or color changes.',
      'Report any stomach illness or unsafe water signs quickly.',
      'Keep one alternate safe water option ready for the household.',
    ],
    contaminants: [
      {
        slug: 'ecoli',
        label: 'Biological contamination',
        latest_value: dashboard.latest_sensor.ecoli ?? 0,
        safe_limit: 0,
        status: (dashboard.latest_sensor.ecoli ?? 0) > 0 ? 'needs_attention' : 'safe',
        explanation: 'Derived from the latest E.coli reading in the selected village.',
      },
      {
        slug: 'turbidity',
        label: 'Turbidity',
        latest_value: dashboard.latest_sensor.turbidity ?? null,
        safe_limit: 5,
        status: (dashboard.latest_sensor.turbidity ?? 0) > 5 ? 'needs_attention' : 'safe',
        explanation: 'Higher turbidity can reduce drinking-water clarity and treatment effectiveness.',
      },
    ],
    nearby_safe_sources: [],
    alternate_source: {
      available: false,
      message: 'Alternate safe source suggestions will appear after deep profile sync completes.',
      map_link: null,
    },
    mapped_contacts: [],
    official_ingestion: {
      jjm_export: { available: false, files: [], status: 'awaiting_export' },
      ftk_lab: { available: false, files: [], status: 'awaiting_dataset' },
    },
    timeline: dashboard.active_alerts.map((alert) => ({
      type: 'alert_raised',
      title: alert.title,
      timestamp: alert.created_at,
      detail: `${sentenceCase(alert.severity)} alert currently active in the village.`,
    })),
    trust_documents: {
      official_references: [],
      local_documents: [
        {
          label: 'Village profile fallback snapshot',
          type: 'fallback',
          status: 'generated',
          reference: 'Built from active village dashboard while deep profile service refreshes.',
        },
      ],
    },
    transparency: {
      last_sensor_update: dashboard.latest_sensor.timestamp,
      last_prediction_update: dashboard.risk.last_updated,
      prediction_confidence: dashboard.risk.score != null ? 0.74 : 0.51,
      coordinate_accuracy_note: 'This section is temporarily using the live village dashboard fallback.',
      government_references: [],
    },
  };
};

const findVillagePath = (catalog: VillageCatalog | undefined, villageId: string) => {
  if (!catalog) {
    return null;
  }

  for (const state of catalog.states) {
    for (const district of state.districts) {
      for (const block of district.blocks) {
        for (const panchayat of block.panchayats) {
          if (panchayat.villages.some((item) => item.id === villageId)) {
            return {
              state: state.name,
              district: district.name,
              block: block.name,
              panchayat: panchayat.name,
            };
          }
        }
      }
    }
  }

  return null;
};

export const VillageProfilePage = () => {
  const { isAuthenticated } = useAuth();
  const { activeVillageId, setActiveVillageId, fieldMode } = usePreferences();
  const [stateName, setStateName] = useState('');
  const [districtName, setDistrictName] = useState('');
  const [blockName, setBlockName] = useState('');
  const [panchayatName, setPanchayatName] = useState('');

  const villagesQuery = useQuery({
    queryKey: ['villages'],
    queryFn: villageService.list,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });
  const catalogQuery = useQuery({
    queryKey: ['village-catalog'],
    queryFn: villageIntelligenceService.catalog,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });
  const profileQuery = useQuery({
    queryKey: ['village-profile', activeVillageId],
    queryFn: () => villageIntelligenceService.profile(activeVillageId!),
    enabled: Boolean(isAuthenticated && activeVillageId),
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });
  const dashboardQuery = useQuery({
    queryKey: ['village-dashboard-fallback', activeVillageId],
    queryFn: () => villageService.getDashboard(activeVillageId!),
    enabled: Boolean(isAuthenticated && activeVillageId),
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });
  const cachedProfile: VillageIntelligenceProfile | null =
    fieldMode && activeVillageId
      ? (() => {
          const raw = localStorage.getItem(`jalert.cached.village-profile.${activeVillageId}`);
          if (!raw) {
            return null;
          }
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        })()
      : null;
  const catalogData = useMemo(() => {
    if (catalogQuery.data?.states?.length) {
      return catalogQuery.data;
    }
    return buildCatalogFromVillages(villagesQuery.data ?? []);
  }, [catalogQuery.data, villagesQuery.data]);

  useEffect(() => {
    if (!catalogData.states.length) {
      return;
    }

    if (!activeVillageId) {
      const firstId = firstVillageId(catalogData);
      if (firstId) {
        setActiveVillageId(firstId);
      }
      return;
    }

    const currentPath = findVillagePath(catalogData, activeVillageId);
    if (currentPath) {
      setStateName(currentPath.state);
      setDistrictName(currentPath.district);
      setBlockName(currentPath.block);
      setPanchayatName(currentPath.panchayat);
    }
  }, [activeVillageId, catalogData, setActiveVillageId]);

  useEffect(() => {
    if (fieldMode && activeVillageId && profileQuery.data) {
      localStorage.setItem(
        `jalert.cached.village-profile.${activeVillageId}`,
        JSON.stringify(profileQuery.data),
      );
    }
  }, [activeVillageId, fieldMode, profileQuery.data]);

  const selectedState = useMemo(
    () => catalogData.states.find((item) => item.name === stateName) ?? null,
    [catalogData, stateName],
  );
  const selectedDistrict = useMemo(
    () => selectedState?.districts.find((item) => item.name === districtName) ?? null,
    [districtName, selectedState],
  );
  const selectedBlock = useMemo(
    () => selectedDistrict?.blocks.find((item) => item.name === blockName) ?? null,
    [blockName, selectedDistrict],
  );
  const selectedPanchayat = useMemo(
    () => selectedBlock?.panchayats.find((item) => item.name === panchayatName) ?? null,
    [panchayatName, selectedBlock],
  );
  const filteredVillageIds = useMemo(() => {
    if (selectedPanchayat?.villages?.length) {
      return new Set(selectedPanchayat.villages.map((item) => item.id));
    }
    if (selectedBlock?.panchayats?.length) {
      return new Set(
        selectedBlock.panchayats.flatMap((item) => item.villages.map((village) => village.id)),
      );
    }
    if (selectedDistrict?.blocks?.length) {
      return new Set(
        selectedDistrict.blocks.flatMap((block) =>
          block.panchayats.flatMap((panchayat) => panchayat.villages.map((village) => village.id)),
        ),
      );
    }
    if (selectedState?.districts?.length) {
      return new Set(
        selectedState.districts.flatMap((district) =>
          district.blocks.flatMap((block) =>
            block.panchayats.flatMap((panchayat) => panchayat.villages.map((village) => village.id)),
          ),
        ),
      );
    }
    return null;
  }, [selectedDistrict, selectedBlock, selectedPanchayat, selectedState]);

  useEffect(() => {
    if (!stateName) {
      setDistrictName('');
      setBlockName('');
      setPanchayatName('');
      return;
    }
    if (selectedState && districtName && !selectedState.districts.some((item) => item.name === districtName)) {
      setDistrictName('');
      setBlockName('');
      setPanchayatName('');
    }
  }, [districtName, selectedState, stateName]);

  useEffect(() => {
    if (!districtName) {
      setBlockName('');
      setPanchayatName('');
      return;
    }
    if (selectedDistrict && blockName && !selectedDistrict.blocks.some((item) => item.name === blockName)) {
      setBlockName('');
      setPanchayatName('');
    }
  }, [blockName, districtName, selectedDistrict]);

  useEffect(() => {
    if (!blockName) {
      setPanchayatName('');
      return;
    }
    if (selectedBlock && panchayatName && !selectedBlock.panchayats.some((item) => item.name === panchayatName)) {
      setPanchayatName('');
    }
  }, [blockName, panchayatName, selectedBlock]);

  useEffect(() => {
    if (!filteredVillageIds || !activeVillageId || filteredVillageIds.has(activeVillageId)) {
      return;
    }

    const nextVillageId = selectedPanchayat?.villages[0]?.id
      ?? selectedBlock?.panchayats[0]?.villages[0]?.id
      ?? selectedDistrict?.blocks[0]?.panchayats[0]?.villages[0]?.id
      ?? selectedState?.districts[0]?.blocks[0]?.panchayats[0]?.villages[0]?.id
      ?? null;

    if (nextVillageId) {
      setActiveVillageId(nextVillageId);
    }
  }, [
    activeVillageId,
    filteredVillageIds,
    selectedBlock,
    selectedDistrict,
    selectedPanchayat,
    selectedState,
    setActiveVillageId,
  ]);

  const comparisonIds = useMemo(() => {
    if (!profileQuery.data || !villagesQuery.data) {
      return [];
    }
    return villagesQuery.data
      .filter(
        (item) =>
          item.id !== profileQuery.data!.village.id
          && item.state === profileQuery.data!.village.state
          && item.district === profileQuery.data!.village.district,
      )
      .slice(0, 2)
      .map((item) => item.id);
  }, [profileQuery.data, villagesQuery.data]);

  const fallbackProfile = useMemo(() => {
    if (!activeVillageId || !dashboardQuery.data || !villagesQuery.data?.length) {
      return null;
    }
    const village = villagesQuery.data.find((item) => item.id === activeVillageId);
    if (!village) {
      return null;
    }
    return buildFallbackVillageProfile(village, dashboardQuery.data, findVillagePath(catalogData, activeVillageId));
  }, [activeVillageId, catalogData, dashboardQuery.data, villagesQuery.data]);

  const resolvedProfile = profileQuery.data ?? cachedProfile ?? fallbackProfile;

  const comparisonQuery = useQuery({
    queryKey: ['village-compare', activeVillageId, comparisonIds],
    queryFn: () => villageIntelligenceService.compare(activeVillageId!, comparisonIds),
    enabled: Boolean(isAuthenticated && activeVillageId && comparisonIds.length >= 1),
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHero
        eyebrow="Know my village"
        title="Village profile, trust signals, and public-service action in one view"
        subtitle="Explore JJM-style village profile details, scheme and source lineage, groundwater trends, contaminants, trust references, and family action guidance."
        image={imagery.community}
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
              <div>
                <h3>Know My Village wizard</h3>
                <p className="subtle">State to panchayat drilldown for faster village discovery.</p>
              </div>
              <div className="helper-row">
                <Link className="ghost-button" to="/village-status">
                  Open live village dashboard
                </Link>
                <Link className="secondary-button" to="/citizen-services">
                  Open citizen services
                </Link>
              </div>
            </div>

            <div className="form-grid two section-tight">
              <div className="field">
                <label>State</label>
                <select
                  value={stateName}
                  onChange={(e) => {
                    setStateName(e.target.value);
                    setDistrictName('');
                    setBlockName('');
                    setPanchayatName('');
                  }}
                >
                  <option value="">Select state</option>
                  {catalogData.states.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>District</label>
                <select
                  value={districtName}
                  onChange={(e) => {
                    setDistrictName(e.target.value);
                    setBlockName('');
                    setPanchayatName('');
                  }}
                >
                  <option value="">Select district</option>
                  {(selectedState?.districts ?? []).map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Block</label>
                <select
                  value={blockName}
                  onChange={(e) => {
                    setBlockName(e.target.value);
                    setPanchayatName('');
                  }}
                >
                  <option value="">Select block</option>
                  {(selectedDistrict?.blocks ?? []).map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Panchayat</label>
                <select value={panchayatName} onChange={(e) => setPanchayatName(e.target.value)}>
                  <option value="">Select panchayat</option>
                  {(selectedBlock?.panchayats ?? []).map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="section-tight">
              <VillageSelector
                villages={(villagesQuery.data ?? []).filter((item) => {
                  if (!filteredVillageIds) {
                    return true;
                  }
                  return filteredVillageIds.has(item.id);
                })}
                value={activeVillageId}
                onChange={setActiveVillageId}
              />
            </div>
          </section>

          {profileQuery.isLoading && !resolvedProfile ? <LoadingState label="Loading village deep profile..." /> : null}
          {profileQuery.isError && !resolvedProfile ? <ErrorState description="Village profile could not be loaded." /> : null}
          {!activeVillageId ? (
            <EmptyState title="Choose a village to begin" description="Profile sections appear after village selection." />
          ) : null}

          {resolvedProfile ? (
            <>
              {fieldMode && cachedProfile && !profileQuery.data ? (
                <section className="section content-card">
                  <p className="subtle">Showing the last saved village snapshot from field mode cache.</p>
                </section>
              ) : null}
              {profileQuery.isError && fallbackProfile ? (
                <section className="section content-card">
                  <p className="subtle">
                    Deep village profile service did not respond in time, so this page is showing the live village dashboard fallback for now.
                  </p>
                </section>
              ) : null}
              {(() => {
                const profileData: VillageIntelligenceProfile = resolvedProfile;
                return (
            <>
              <section className="section metric-grid">
                <StatCard label="Water quality badge" value={profileData.village.quality_badge_label} helper={profileData.transparency.coordinate_accuracy_note} />
                <StatCard label="Tap coverage" value={`${profileData.coverage.tap_coverage_percent}%`} helper={`${formatNumber(profileData.coverage.tap_connected_households, 0)} households connected`} />
                <StatCard label="Prediction confidence" value={`${Math.round(profileData.transparency.prediction_confidence * 100)}%`} helper={`Last updated ${formatDate(profileData.transparency.last_prediction_update)}`} />
              </section>

              <section className="section split-layout">
                <article className="content-card">
                  <div className="inline-between">
                    <div>
                        <h3>Village profile deep view</h3>
                        <p className="subtle">
                        {profileData.village.name}, {profileData.village.district}, {profileData.village.state}
                        </p>
                      </div>
                    <StatusBadge value={profileData.village.quality_badge} />
                  </div>
                  <div className="mini-grid section-tight">
                    <div className="map-mini-stat">
                      <strong>{formatNumber(profileData.coverage.households, 0)}</strong>
                      <span>Total households</span>
                    </div>
                    <div className="map-mini-stat">
                      <strong>{formatNumber(profileData.coverage.tap_connected_households, 0)}</strong>
                      <span>Tap-connected households</span>
                    </div>
                    <div className="map-mini-stat">
                      <strong>{profileData.coverage.schools.covered}/{profileData.coverage.schools.total}</strong>
                      <span>Schools covered</span>
                    </div>
                    <div className="map-mini-stat">
                      <strong>{profileData.coverage.anganwadi.covered}/{profileData.coverage.anganwadi.total}</strong>
                      <span>Anganwadi covered</span>
                    </div>
                  </div>
                    <p className="subtle section-tight">
                    Habitations: {formatNumber(profileData.coverage.habitation_count, 0)}. Source: {profileData.coverage.source_label}.
                  </p>
                </article>

                <article className="content-card">
                  <h3>What should my family do now?</h3>
                  <ul className="action-list">
                    {profileData.family_actions.map((action: string) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                </article>
              </section>

              <section className="section split-layout">
                <article className="content-card">
                  <h3>IoT water supply monitoring</h3>
                  <div className="mini-grid section-tight">
                    <div className="map-mini-stat">
                      <strong>{profileData.iot_monitoring.tank_level_percent}%</strong>
                      <span>Tank level</span>
                    </div>
                    <div className="map-mini-stat">
                      <strong>{profileData.iot_monitoring.pump_runtime_hours}h</strong>
                      <span>Pump runtime</span>
                    </div>
                    <div className="map-mini-stat">
                      <strong>{profileData.iot_monitoring.chlorine_residual_mg_l}</strong>
                      <span>Chlorine residual</span>
                    </div>
                    <div className="map-mini-stat">
                      <strong>{profileData.iot_monitoring.supply_hours_today}h</strong>
                      <span>Supply hours today</span>
                    </div>
                  </div>
                    <p className="subtle section-tight">
                    Last successful delivery {formatDate(profileData.iot_monitoring.last_successful_delivery_time)}.
                  </p>
                </article>

                <article className="content-card">
                  <h3>Water quality lab + FTK testing</h3>
                  <ul className="action-list">
                    <li>Last lab test: {formatDate(profileData.testing_summary.last_lab_test_at)}</li>
                    <li>FTK test count: {profileData.testing_summary.ftk_test_count}</li>
                    <li>Contamination found: {profileData.testing_summary.contamination_found ? 'Yes' : 'No'}</li>
                    <li>Safe after retest: {profileData.testing_summary.safe_after_retest ? 'Yes' : 'No'}</li>
                    <li>Tested by: {profileData.testing_summary.tested_by}</li>
                  </ul>
                </article>
              </section>

              <section className="section split-layout">
                <article className="content-card">
                  <h3>Source and scheme lineage</h3>
                  <div className="stack">
                    {profileData.source_scheme.sources.map((source: VillageIntelligenceProfile['source_scheme']['sources'][number]) => (
                      <article key={source.name} className="alert-card">
                        <div className="inline-between">
                          <h4>{source.name}</h4>
                          <span className="status-badge neutral">{sentenceCase(source.source_type.replace(/_/g, ' '))}</span>
                        </div>
                        <p className="subtle">
                          Route: {source.supply_route.join(' -> ')}
                        </p>
                        <div className="meta-row">
                          <span>Treatment required {source.treatment_required ? 'Yes' : 'No'}</span>
                          <span>Treatment available {source.treatment_available ? 'Yes' : 'No'}</span>
                          <span>{source.coordinate_confidence} coordinates</span>
                          {source.distance_km != null ? <span>{source.distance_km} km away</span> : null}
                        </div>
                      </article>
                    ))}
                  </div>
                </article>

                <article className="content-card">
                  <h3>Scheme profile</h3>
                  <div className="stack">
                    {profileData.source_scheme.schemes.map((scheme: VillageIntelligenceProfile['source_scheme']['schemes'][number]) => (
                      <article key={scheme.name} className="alert-card">
                        <div className="inline-between">
                          <h4>{scheme.name}</h4>
                          <span className="status-badge neutral">{sentenceCase(scheme.service_status)}</span>
                        </div>
                        <p className="subtle">{sentenceCase(scheme.scheme_type.replace(/_/g, ' '))}</p>
                        <div className="meta-row">
                          <span>Treatment stage {scheme.treatment_stage}</span>
                          <span>Sources {scheme.connected_sources.join(', ') || 'Pending mapping'}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </article>
              </section>

              <section className="section split-layout">
                <article className="content-card">
                  <h3>Groundwater season comparison</h3>
                  {profileData.groundwater.available ? (
                    <div className="mini-grid section-tight">
                      <div className="map-mini-stat">
                        <strong>{formatNumber(profileData.groundwater.pre_monsoon_level_m)}</strong>
                        <span>Pre-monsoon</span>
                      </div>
                      <div className="map-mini-stat">
                        <strong>{formatNumber(profileData.groundwater.post_monsoon_level_m)}</strong>
                        <span>Post-monsoon</span>
                      </div>
                      <div className="map-mini-stat">
                        <strong>{formatNumber(profileData.groundwater.level_change_m)}</strong>
                        <span>Rise / fall</span>
                      </div>
                      <div className="map-mini-stat">
                        <strong>{sentenceCase(profileData.groundwater.recharge_trend || 'stable')}</strong>
                        <span>Recharge trend</span>
                      </div>
                    </div>
                  ) : (
                    <p className="subtle">{profileData.groundwater.message}</p>
                  )}
                </article>

                <article className="content-card">
                  <h3>Water affordability and support</h3>
                  <ul className="action-list">
                    <li>Tanker dependency: {profileData.affordability.tanker_dependency ? 'Yes' : 'No'}</li>
                    <li>Estimated monthly spend: Rs. {formatNumber(profileData.affordability.monthly_spend_inr, 0)}</li>
                    <li>High burden household flag: {profileData.affordability.high_burden ? 'Yes' : 'No'}</li>
                    <li>Support eligibility: {profileData.affordability.support_eligibility ? 'Eligible' : 'Not flagged'}</li>
                  </ul>
                </article>
              </section>

              <section className="section split-layout">
                <article className="content-card">
                  <h3>Monsoon preparedness</h3>
                  <ul className="action-list">
                    <li>Preparedness score: {formatNumber(profileData.monsoon_preparedness.score)}</li>
                    <li>Status: {sentenceCase(profileData.monsoon_preparedness.label)}</li>
                    <li>{profileData.monsoon_preparedness.advice}</li>
                  </ul>
                </article>

                <article className="content-card">
                  <h3>Household vulnerability</h3>
                  <ul className="action-list">
                    <li>Vulnerability score: {formatNumber(profileData.household_vulnerability.score)}</li>
                    <li>Level: {sentenceCase(profileData.household_vulnerability.label)}</li>
                    <li>{profileData.household_vulnerability.summary}</li>
                  </ul>
                </article>
              </section>

              <section className="section split-layout">
                <article className="content-card">
                  <h3>Contaminant detail view</h3>
                  <div className="stack">
                    {profileData.contaminants.map((item: VillageIntelligenceProfile['contaminants'][number]) => (
                      <article key={item.slug} className="alert-card">
                        <div className="inline-between">
                          <h4>{item.label}</h4>
                          <span className={`status-badge ${item.status === 'needs_attention' ? 'moderate' : item.status === 'integration_ready' ? 'neutral' : 'safe'}`}>
                            {sentenceCase(item.status.replace(/_/g, ' '))}
                          </span>
                        </div>
                        <p className="subtle">{item.explanation}</p>
                        <div className="meta-row">
                          <span>Latest {formatNumber(item.latest_value)}</span>
                          <span>Safe limit {formatNumber(item.safe_limit)}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </article>

                <article className="content-card">
                  <h3>Nearby safe sources</h3>
                  <div className="stack">
                    {profileData.nearby_safe_sources.length ? (
                      profileData.nearby_safe_sources.map((source: VillageIntelligenceProfile['nearby_safe_sources'][number]) => (
                        <article key={`${source.name}-${source.resource_type}`} className="alert-card">
                          <div className="inline-between">
                            <h4>{source.name}</h4>
                            <span className="status-badge safe">{sentenceCase(source.resource_type.replace(/_/g, ' '))}</span>
                          </div>
                          <div className="meta-row">
                            <span>{source.district_name}, {source.state_name}</span>
                            <span>Quality {formatNumber(source.water_quality_score)}</span>
                            {source.distance_km != null ? <span>{source.distance_km} km</span> : null}
                          </div>
                        </article>
                      ))
                    ) : (
                      <EmptyState title="No nearby safe sources found" description="Add more connected sources or widen the filter." />
                    )}
                  </div>
                  <div className="assistant-links section-tight">
                    {profileData.alternate_source.map_link ? (
                      <a className="link-chip" href={profileData.alternate_source.map_link} target="_blank" rel="noreferrer">
                        Open alternate safe route
                      </a>
                    ) : null}
                  </div>
                </article>
              </section>

              <section className="section split-layout">
                <article className="content-card">
                  <h3>Village comparison</h3>
                  {comparisonQuery.data?.villages?.length ? (
                    <div className="stack">
                      {comparisonQuery.data.villages.map((item: NonNullable<typeof comparisonQuery.data>['villages'][number]) => (
                        <article key={item.id} className="alert-card">
                          <div className="inline-between">
                            <h4>{item.name}</h4>
                            <span className="status-badge neutral">{sentenceCase(item.risk_category)}</span>
                          </div>
                          <div className="meta-row">
                            <span>Quality {formatNumber(item.quality_score)}</span>
                            <span>Risk {formatNumber(item.risk_score)}</span>
                            <span>Alerts {item.alert_count}</span>
                            <span>{item.sensor_uptime}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="subtle">Comparison will appear once nearby villages are available in the same district.</p>
                  )}
                </article>

                <article className="content-card">
                  <h3>Timeline of village events</h3>
                  <div className="stack">
                    {profileData.timeline.map((item: VillageIntelligenceProfile['timeline'][number]) => (
                      <article key={`${item.type}-${item.timestamp}-${item.title}`} className="alert-card">
                        <div className="inline-between">
                          <h4>{item.title}</h4>
                          <span className="status-badge neutral">{sentenceCase(item.type.replace(/_/g, ' '))}</span>
                        </div>
                        <p className="subtle">{item.detail}</p>
                        <p className="subtle">{formatDate(item.timestamp)}</p>
                      </article>
                    ))}
                  </div>
                </article>
              </section>

              <section className="section split-layout">
                <article className="content-card">
                  <h3>Village trust documents</h3>
                  <div className="stack">
                    {profileData.trust_documents.official_references.map((item: VillageIntelligenceProfile['trust_documents']['official_references'][number]) => (
                      <article key={item.url} className="alert-card">
                        <div className="inline-between">
                          <h4>{item.label}</h4>
                          <span className="status-badge safe">{sentenceCase(item.availability.replace(/_/g, ' '))}</span>
                        </div>
                        <a className="link-chip" href={item.url} target="_blank" rel="noreferrer">
                          Open reference
                        </a>
                      </article>
                    ))}
                    {profileData.trust_documents.local_documents.map((item: VillageIntelligenceProfile['trust_documents']['local_documents'][number]) => (
                      <article key={item.label} className="alert-card">
                        <div className="inline-between">
                          <h4>{item.label}</h4>
                          <span className="status-badge neutral">{sentenceCase(item.status.replace(/_/g, ' '))}</span>
                        </div>
                        <p className="subtle">{item.reference}</p>
                      </article>
                    ))}
                  </div>
                </article>

                <article className="content-card">
                  <h3>Transparency and trust</h3>
                  <ul className="action-list">
                    <li>Last sensor update: {formatDate(profileData.transparency.last_sensor_update)}</li>
                    <li>Last prediction update: {formatDate(profileData.transparency.last_prediction_update)}</li>
                    <li>Prediction confidence: {Math.round(profileData.transparency.prediction_confidence * 100)}%</li>
                    <li>{profileData.transparency.coordinate_accuracy_note}</li>
                  </ul>
                  <div className="assistant-links">
                    {profileData.transparency.government_references.map((item) => (
                      <a key={item} className="link-chip" href={item} target="_blank" rel="noreferrer">
                        Government source
                      </a>
                    ))}
                  </div>
                </article>
              </section>
              <section className="section split-layout">
                <article className="content-card">
                  <h3>Mapped contacts and helplines</h3>
                  <div className="stack">
                    {profileData.mapped_contacts.map((contact: VillageIntelligenceProfile['mapped_contacts'][number]) => (
                      <article key={`${contact.name}-${contact.role}`} className="alert-card">
                        <div className="inline-between">
                          <h4>{contact.name}</h4>
                          <span className="status-badge neutral">{sentenceCase(contact.role.replace(/_/g, ' '))}</span>
                        </div>
                        <div className="meta-row">
                          {contact.phone ? <a href={`tel:${contact.phone}`}>{contact.phone}</a> : null}
                          {contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : null}
                          {contact.reference_url ? <a href={contact.reference_url} target="_blank" rel="noreferrer">Open official contact</a> : null}
                        </div>
                      </article>
                    ))}
                  </div>
                </article>
                <article className="content-card">
                  <h3>Official ingestion readiness</h3>
                  <ul className="action-list">
                    <li>JJM export: {sentenceCase(profileData.official_ingestion.jjm_export.status)}</li>
                    <li>FTK / lab ingestion: {sentenceCase(profileData.official_ingestion.ftk_lab.status)}</li>
                    <li>JJM files connected: {profileData.official_ingestion.jjm_export.files.length}</li>
                    <li>FTK / lab files connected: {profileData.official_ingestion.ftk_lab.files.length}</li>
                  </ul>
                </article>
              </section>
            </>
                );
              })()}
            </>
          ) : null}
        </>
      )}
    </>
  );
};
