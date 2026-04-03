import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import type { Village, VillageMapOverview, WaterResourceItem } from '../types/api';
import { formatNumber, sentenceCase } from '../utils/format';

const INDIA_CENTER: [number, number] = [22.6, 79.2];
const INDIA_BOUNDS = L.latLngBounds(
  L.latLng(6, 68),
  L.latLng(37.6, 97.6),
);

const colorForRisk = (riskScore: number) => {
  if (riskScore >= 70) {
    return '#e53935';
  }
  if (riskScore >= 45) {
    return '#f57c00';
  }
  return '#43a047';
};

const colorForContaminant = (status?: string) => {
  if (status === 'needs_attention') {
    return '#e53935';
  }
  if (status === 'integration_ready') {
    return '#546e7a';
  }
  return '#0277bd';
};

export const WaterResourceIndiaMap = ({
  resources,
  overview,
  villages = [],
}: {
  resources: WaterResourceItem[];
  overview?: VillageMapOverview | null;
  villages?: Village[];
}) => {
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const exactResources = useMemo(
    () =>
      resources.filter(
        (item) =>
          typeof item.latitude === 'number'
          && typeof item.longitude === 'number'
          && Number.isFinite(item.latitude)
          && Number.isFinite(item.longitude),
      ),
    [resources],
  );

  const fallbackVillages = useMemo(
    () =>
      villages
        .filter(
          (item) =>
            typeof item.latitude === 'number'
            && typeof item.longitude === 'number'
            && Number.isFinite(item.latitude)
            && Number.isFinite(item.longitude),
        )
        .slice(0, 120),
    [villages],
  );
  const fallbackStatesCount = useMemo(
    () => new Set(fallbackVillages.map((item) => item.state)).size,
    [fallbackVillages],
  );
  const fallbackDistrictsCount = useMemo(
    () => new Set(fallbackVillages.map((item) => `${item.state}::${item.district}`)).size,
    [fallbackVillages],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = L.map(containerRef.current, {
      center: INDIA_CENTER,
      zoom: 5,
      minZoom: 4,
      maxZoom: 12,
      maxBounds: INDIA_BOUNDS,
      maxBoundsViscosity: 1,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = layerGroup;

    return () => {
      layerGroup.clearLayers();
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) {
      return;
    }

    layerGroup.clearLayers();
    const bounds = L.latLngBounds([]);

    overview?.states?.forEach((state) => {
      const polygon = L.polygon(state.polygon as [number, number][], {
        color: colorForRisk(state.risk_score),
        weight: 2,
        fillColor: colorForRisk(state.risk_score),
        fillOpacity: 0.12,
      });
      polygon.bindPopup(
        `<div class="resource-popup"><strong>${state.name}</strong><div>Village count: ${state.village_count}</div><div>Average risk: ${formatNumber(state.risk_score)}</div></div>`,
      );
      polygon.addTo(layerGroup);
      state.polygon.forEach((point) => bounds.extend(point as [number, number]));
    });

    overview?.districts?.forEach((district) => {
      const polygon = L.polygon(district.polygon as [number, number][], {
        color: '#29b6f6',
        weight: 1.5,
        dashArray: '5,4',
        fillColor: '#29b6f6',
        fillOpacity: 0.05,
      });
      polygon.bindPopup(
        `<div class="resource-popup"><strong>${district.name}</strong><div>${district.state}</div><div>Villages: ${district.village_count}</div><div>Average risk: ${formatNumber(district.risk_score)}</div></div>`,
      );
      polygon.addTo(layerGroup);
    });

    overview?.clusters?.forEach((cluster) => {
      const circle = L.circleMarker(cluster.center, {
        radius: Math.max(10, Math.min(24, 8 + cluster.count * 0.6)),
        color: '#ffffff',
        weight: 2,
        fillColor: colorForRisk(cluster.risk_score),
        fillOpacity: 0.78,
      });
      circle.bindPopup(
        `<div class="resource-popup"><strong>${cluster.label}</strong><div>${sentenceCase(cluster.level)} cluster</div><div>Points: ${cluster.count}</div><div>Risk: ${formatNumber(cluster.risk_score)}</div></div>`,
      );
      circle.addTo(layerGroup);
      bounds.extend(cluster.center);
    });

    overview?.villages?.forEach((village) => {
      const contaminantEntries = Object.entries(village.contaminants ?? {});
      const worstContaminant = contaminantEntries.find(([, status]) => status === 'needs_attention')?.[1];
      const marker = L.circleMarker([village.latitude, village.longitude], {
        radius: 6,
        color: '#ffffff',
        weight: 1.5,
        fillColor: colorForContaminant(worstContaminant),
        fillOpacity: 0.95,
      });
      marker.bindPopup(
        `<div class="village-popup"><strong>${village.name}</strong><div>${village.district}, ${village.state}</div><div>Risk ${formatNumber(village.risk_score)}</div><div>Water quality ${formatNumber(village.quality_score)}</div><div>Safe sources ${village.safe_source_count}</div><div>Groundwater ${formatNumber(village.groundwater_level_m)}</div><div>Confidence ${sentenceCase(village.groundwater_accuracy)}</div></div>`,
      );
      marker.addTo(layerGroup);
      bounds.extend([village.latitude, village.longitude]);
    });

    if ((!overview?.villages || overview.villages.length === 0) && fallbackVillages.length > 0) {
      fallbackVillages.forEach((village) => {
        const marker = L.circleMarker([village.latitude, village.longitude], {
          radius: 5,
          color: '#ffffff',
          weight: 1.5,
          fillColor: '#0277bd',
          fillOpacity: 0.88,
        });
        marker.bindPopup(
          `<div class="village-popup"><strong>${village.name}</strong><div>${village.district}, ${village.state}</div><div>Village registry point</div></div>`,
        );
        marker.addTo(layerGroup);
        bounds.extend([village.latitude, village.longitude]);
      });
    }

    exactResources.slice(0, 40).forEach((item) => {
      const groundwater = item.resource_type.includes('groundwater');
      const marker = L.circleMarker([item.latitude!, item.longitude!], {
        radius: 4,
        color: groundwater ? '#0277bd' : '#43a047',
        weight: 1,
        fillColor: groundwater ? '#4fc3f7' : '#66bb6a',
        fillOpacity: 0.7,
      });
      marker.bindPopup(
        `<div class="resource-popup"><strong>${item.name}</strong><div>${item.district_name}, ${item.state_name}</div><div>${sentenceCase(item.resource_type.replace(/_/g, ' '))}</div><div>Quality ${formatNumber(item.water_quality_score)}</div></div>`,
      );
      marker.addTo(layerGroup);
      bounds.extend([item.latitude!, item.longitude!]);
    });

    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.14));
    } else {
      map.setView(INDIA_CENTER, 5);
    }
  }, [exactResources, fallbackVillages, overview]);

  return (
    <div className="resource-map-layout">
      <div className="resource-map-canvas resource-map-leaflet">
        <div ref={containerRef} className="resource-map-instance" />
      </div>

      <div className="resource-map-side">
        <div className="resource-map-note">
          <strong>India geo drilldown map</strong>
          <p className="subtle">
            State and district boundaries are derived from the connected village coordinates. Village points, risk shading, contaminant attention, and exact-vs-approximate groundwater confidence are layered together here.
          </p>
        </div>

        <div className="resource-map-selected">
          <span className="eyebrow">Map legend</span>
          <ul className="action-list">
            <li>Green boundary: lower average risk</li>
            <li>Orange / red boundary: elevated risk heat</li>
            <li>Blue village marker: no current contaminant trigger</li>
            <li>Red village marker: contaminant attention needed</li>
            <li>Small blue/green dots: mapped water sources</li>
            <li>Fallback blue points: village registry coordinates</li>
          </ul>
        </div>

        <div className="resource-map-selected">
          <span className="eyebrow">Live map status</span>
          <div className="mini-grid">
            <div className="map-mini-stat">
              <strong>{overview?.states.length || fallbackStatesCount}</strong>
              <span>States</span>
            </div>
            <div className="map-mini-stat">
              <strong>{overview?.districts.length || fallbackDistrictsCount}</strong>
              <span>Districts</span>
            </div>
            <div className="map-mini-stat">
              <strong>{overview?.villages.length || fallbackVillages.length}</strong>
              <span>Village points</span>
            </div>
            <div className="map-mini-stat">
              <strong>{exactResources.length}</strong>
              <span>Exact source coordinates</span>
            </div>
          </div>
          <p className="subtle section-tight">
            Season layer: {sentenceCase((overview?.season ?? 'post_monsoon').replace(/_/g, ' '))}
          </p>
        </div>
      </div>
    </div>
  );
};
