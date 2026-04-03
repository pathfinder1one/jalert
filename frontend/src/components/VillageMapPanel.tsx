import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import type { Village } from '../types/api';

const INDIA_CENTER: [number, number] = [22.6, 79.2];
const INDIA_BOUNDS = L.latLngBounds(
  L.latLng(6, 68),
  L.latLng(37.6, 97.6),
);

type VillageMarker = {
  village: Village;
  position: [number, number];
};

const createVillageIcon = (selected: boolean) =>
  L.divIcon({
    className: '',
    html: `
      <div class="village-map-pin ${selected ? 'selected' : ''}">
        <span class="village-map-pin-dot"></span>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -10],
  });

export const VillageMapPanel = ({
  villages,
  selectedVillageId,
  onSelect,
}: {
  villages: Village[];
  selectedVillageId: string | null;
  onSelect: (villageId: string) => void;
}) => {
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const markers = useMemo<VillageMarker[]>(
    () =>
      villages
        .filter(
          (village) =>
            Number.isFinite(village.latitude)
            && Number.isFinite(village.longitude),
        )
        .map((village) => ({
          village,
          position: [village.latitude, village.longitude] as [number, number],
        })),
    [villages],
  );

  const selectedVillage =
    villages.find((village) => village.id === selectedVillageId) ?? villages[0] ?? null;
  const stateCount = new Set(villages.map((village) => village.state)).size;

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
      layerGroupRef.current = null;
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;

    if (!map || !layerGroup) {
      return;
    }

    layerGroup.clearLayers();

    if (!markers.length) {
      map.setView(INDIA_CENTER, 5);
      return;
    }

    const bounds = L.latLngBounds([]);

    markers.forEach(({ village, position }) => {
      const selected = village.id === selectedVillage?.id;
      const marker = L.marker(position, { icon: createVillageIcon(selected) });

      marker.bindPopup(
        `
          <div class="village-popup">
            <strong>${village.name}</strong>
            <div>${village.district}, ${village.state}</div>
            <div>Population: ${village.population.toLocaleString('en-IN')}</div>
          </div>
        `,
      );

      marker.bindTooltip(village.name, {
        direction: 'top',
        offset: [0, -10],
        opacity: 0.96,
        className: selected ? 'village-map-tooltip is-selected' : 'village-map-tooltip',
        permanent: selected,
      });

      marker.on('click', () => onSelect(village.id));

      marker.addTo(layerGroup);
      bounds.extend(position);
    });

    if (selectedVillage) {
      const selectedMarker = markers.find((entry) => entry.village.id === selectedVillage.id);
      if (selectedMarker) {
        map.setView(selectedMarker.position, Math.max(map.getZoom(), 6), { animate: true });
        return;
      }
    }

    map.fitBounds(bounds.pad(0.18));
  }, [markers, onSelect, selectedVillage]);

  return (
    <article className="content-card village-map-panel">
      <div className="inline-between">
        <div>
          <h3>Village map overview</h3>
          <p className="subtle">
            Tap any village point on the India map to open it. The selected village name stays visible on the map.
          </p>
        </div>
        <div className="village-map-summary">
          <strong>{villages.length}</strong>
          <span>{stateCount} states mapped</span>
        </div>
      </div>

      <div className="village-map-layout">
        <div className="village-map-canvas village-map-leaflet">
          <div ref={containerRef} className="village-map-instance" />
        </div>

        <div className="village-map-info">
          {selectedVillage ? (
            <>
              <div className="village-map-selected">
                <span className="eyebrow">Selected village</span>
                <h4>{selectedVillage.name}</h4>
                <p className="subtle">
                  {selectedVillage.district}, {selectedVillage.state}
                </p>
              </div>
              <div className="mini-grid">
                <div className="map-mini-stat">
                  <strong>{selectedVillage.latitude.toFixed(2)}</strong>
                  <span>Latitude</span>
                </div>
                <div className="map-mini-stat">
                  <strong>{selectedVillage.longitude.toFixed(2)}</strong>
                  <span>Longitude</span>
                </div>
                <div className="map-mini-stat">
                  <strong>{selectedVillage.population.toLocaleString('en-IN')}</strong>
                  <span>Population</span>
                </div>
                <div className="map-mini-stat">
                  <strong>{selectedVillage.is_active ? 'Active' : 'Inactive'}</strong>
                  <span>Status</span>
                </div>
              </div>
            </>
          ) : null}

          <div className="village-map-list">
            {markers.slice(0, 10).map(({ village }) => (
              <button
                key={village.id}
                type="button"
                className={village.id === selectedVillage?.id ? 'active' : ''}
                onClick={() => onSelect(village.id)}
              >
                <strong>{village.name}</strong>
                <span>
                  {village.district}, {village.state}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
};
