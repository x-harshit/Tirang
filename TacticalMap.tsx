import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { TacticalUnit } from '../types/tactical';
import { RadarWidget } from './RadarWidget';
import { Crosshair, RotateCcw } from 'lucide-react';

interface TacticalMapProps {
  units: TacticalUnit[];
  selectedUnit: TacticalUnit | null;
  isStale?: boolean;
  lastUpdateTime?: string | null;
  onSelectUnit: (unit: TacticalUnit) => void;
  onOpenOrderModal: (targetUnit?: TacticalUnit) => void;
  onAcknowledgeSos: (unitId: string) => void;
}

export const TacticalMap: React.FC<TacticalMapProps> = ({
  units,
  selectedUnit,
  isStale = false,
  lastUpdateTime = null,
  onSelectUnit,
  onOpenOrderModal,
  onAcknowledgeSos,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const trailsRef = useRef<Map<string, L.Polyline>>(new Map());
  const [showTrails, setShowTrails] = useState<boolean>(true);
  const [centerCoords, setCenterCoords] = useState<{ lat: number; lon: number }>({
    lat: 28.6139,
    lon: 77.2090,
  });
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lon: number }>({
    lat: 28.6139,
    lon: 77.2090,
  });

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [28.6139, 77.2090],
      zoom: 12,
      minZoom: 10,
      maxZoom: 16,
      zoomControl: true,
      attributionControl: false,
    });

    const CARTO_API_KEY = (import.meta.env.VITE_CARTO_API_KEY as string) || 'cb1_4uf2_1_b3946203a75eb73c1d02997b';
    const tileLayer = L.tileLayer(
      `https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`,
      {
        subdomains: 'abcd',
        maxZoom: 19,
        className: 'tactical-map-tiles',
      }
    );
    tileLayer.addTo(map);

    map.on('move', () => {
      const c = map.getCenter();
      setCenterCoords({ lat: +c.lat.toFixed(5), lon: +c.lng.toFixed(5) });
    });

    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      setCursorCoords({ lat: +e.latlng.lat.toFixed(5), lon: +e.latlng.lng.toFixed(5) });
    });

    mapRef.current = map;

    return () => {
      trailsRef.current.forEach((pl) => pl.remove());
      trailsRef.current.clear();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Center on selectedUnit or active SOS
  useEffect(() => {
    if (!mapRef.current || !selectedUnit) return;
    mapRef.current.panTo([selectedUnit.lat, selectedUnit.lon], {
      animate: true,
      duration: 0.6,
    });
  }, [selectedUnit]);

  // Update Markers and Movement Trails
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clean up polylines for any units that no longer exist
    const activeUnitIds = new Set(units.map((u) => u.id));
    trailsRef.current.forEach((pl, id) => {
      if (!activeUnitIds.has(id) || !showTrails) {
        pl.remove();
        trailsRef.current.delete(id);
      }
    });

    units.forEach((unit) => {
      const isSelected = selectedUnit?.id === unit.id;
      const isSos = unit.status === 'SOS';
      const isWeak = unit.status === 'WEAK_SIGNAL';
      const isLost = unit.status === 'NO_CONTACT';

      // Status colors (greyed out when data is stale)
      const statusColor = isStale
        ? '#606c74'
        : isSos
        ? '#c73a3a'
        : isWeak
        ? '#bd8c2d'
        : isLost
        ? '#576269'
        : '#4d8058';

      // 1. Render / Update Movement Trail
      if (showTrails && unit.trail && unit.trail.length > 0) {
        const trailPoints: [number, number][] = [...unit.trail, [unit.lat, unit.lon]];
        const trailColor = isStale
          ? '#3f4950'
          : isSos
          ? '#ef4444'
          : isSelected
          ? '#38bdf8'
          : isWeak
          ? '#f59e0b'
          : isLost
          ? '#4b5563'
          : '#34d399';

        let polyline = trailsRef.current.get(unit.id);
        if (polyline) {
          polyline.setLatLngs(trailPoints);
          polyline.setStyle({
            color: trailColor,
            weight: isSelected ? 2.5 : 1.5,
            opacity: isStale ? 0.4 : isSelected ? 0.9 : 0.65,
            dashArray: isSelected ? undefined : '3, 4',
          });
        } else {
          polyline = L.polyline(trailPoints, {
            color: trailColor,
            weight: isSelected ? 2.5 : 1.5,
            opacity: isStale ? 0.4 : isSelected ? 0.9 : 0.65,
            dashArray: isSelected ? undefined : '3, 4',
            className: 'tactical-movement-trail',
          }).addTo(map);
          trailsRef.current.set(unit.id, polyline);
        }
      } else {
        const polyline = trailsRef.current.get(unit.id);
        if (polyline) {
          polyline.remove();
          trailsRef.current.delete(unit.id);
        }
      }

      // 2. Circular unit point with heading vector indicator on map
      const iconHtml = `
        <div class="relative flex flex-col items-center justify-center cursor-pointer select-none ${
          isStale ? 'opacity-55 grayscale' : ''
        }">
          <div class="relative w-4 h-4 rounded-full flex items-center justify-center border transition-transform"
               style="background: #111518; border-color: ${statusColor}; ${
        isSelected ? 'transform: scale(1.35); border-width: 2px;' : 'border-width: 1.5px;'
      }">
            <div class="w-1.5 h-1.5 rounded-full" style="background-color: ${statusColor};"></div>
            <!-- Heading Vector Tick -->
            <div class="absolute inset-0 flex items-center justify-center pointer-events-none" style="transform: rotate(${unit.heading}deg);">
              <div class="w-0.5 h-1.5 absolute -top-1 rounded-full" style="background-color: ${statusColor};"></div>
            </div>
          </div>
          <div class="mt-0.5 px-1 text-[9px] font-mono font-normal uppercase whitespace-nowrap ${
            isStale ? 'text-[#6e7d86]' : 'text-[#9bb0bc]'
          }">
            ${unit.callsign}
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'tactical-unit-icon',
        html: iconHtml,
        iconSize: [36, 32],
        iconAnchor: [18, 16],
        popupAnchor: [0, -16],
      });

      let marker = markersRef.current.get(unit.id);
      if (marker) {
        marker.setLatLng([unit.lat, unit.lon]);
        marker.setIcon(customIcon);
      } else {
        marker = L.marker([unit.lat, unit.lon], { icon: customIcon });
        marker.on('click', () => {
          onSelectUnit(unit);
        });
        marker.addTo(map);
        markersRef.current.set(unit.id, marker);
      }

      // Popup content without decorative dots
      const popupHtml = `
        <div class="p-2.5 text-xs font-mono text-[#b5c2ca]" style="min-width: 190px;">
          <div class="flex items-center justify-between border-b border-[#22292e] pb-1.5 mb-2">
            <span class="font-normal text-xs text-[#cfdbe0]">${unit.callsign} [${unit.code}]</span>
            <span class="text-[9px] uppercase font-normal" style="color: ${statusColor};">
              ${isStale ? `STALE (${lastUpdateTime || 'LINK LOST'})` : unit.status}
            </span>
          </div>
          <div class="space-y-1 text-[10px] text-[#788891] mb-2.5">
            <div class="flex justify-between">
              <span>ROLE:</span>
              <span class="text-[#cfdbe0]">${unit.role}</span>
            </div>
            <div class="flex justify-between">
              <span>OPERATOR:</span>
              <span class="text-[#cfdbe0]">${unit.operator}</span>
            </div>
            <div class="flex justify-between">
              <span>COORDS:</span>
              <span class="text-[#89a8ba] font-mono">${unit.lat.toFixed(4)}, ${unit.lon.toFixed(4)}</span>
            </div>
            <div class="flex justify-between">
              <span>SPEED:</span>
              <span class="text-[#cfdbe0]">${unit.speed} km/h (${unit.heading}°)</span>
            </div>
            <div class="flex justify-between">
              <span>BATTERY / SIGNAL:</span>
              <span class="text-[#cfdbe0]">${unit.battery}% / ${unit.signalStrength}%</span>
            </div>
            ${unit.currentOrder ? `
              <div class="flex justify-between text-[#89a8ba] pt-1 border-t border-[#1e2428]">
                <span>ORDER:</span>
                <span class="font-normal">${unit.currentOrder}</span>
              </div>
            ` : ''}
          </div>
          <div class="flex gap-2 pt-1 border-t border-[#1e2428]">
            <button id="popup-order-${unit.id}" class="flex-1 py-1 px-1.5 bg-[#1b2329] border border-[#2b3942] text-[#9ac1d6] text-[10px] font-medium uppercase hover:bg-[#232d34] cursor-pointer text-center">
              ORDER
            </button>
            ${unit.status === 'SOS' ? `
              <button id="popup-ack-${unit.id}" class="flex-1 py-1 px-1.5 bg-[#2d1818] border border-[#522424] text-[#e09b9b] text-[10px] font-medium uppercase hover:bg-[#381e1e] cursor-pointer text-center">
                ACK SOS
              </button>
            ` : `
              <button id="popup-ack-${unit.id}" class="flex-1 py-1 px-1.5 bg-[#17221a] border border-[#27382c] text-[#86ab8c] text-[10px] font-medium uppercase hover:bg-[#1d2b21] cursor-pointer text-center">
                PING
              </button>
            `}
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, {
        closeButton: true,
        className: 'tactical-popup',
      });

      marker.on('popupopen', () => {
        const orderBtn = document.getElementById(`popup-order-${unit.id}`);
        if (orderBtn) {
          orderBtn.onclick = () => {
            onOpenOrderModal(unit);
            marker?.closePopup();
          };
        }
        const ackBtn = document.getElementById(`popup-ack-${unit.id}`);
        if (ackBtn) {
          ackBtn.onclick = () => {
            if (unit.status === 'SOS') {
              onAcknowledgeSos(unit.id);
            }
            marker?.closePopup();
          };
        }
      });
    });
  }, [units, selectedUnit, showTrails, isStale, lastUpdateTime, onSelectUnit, onOpenOrderModal, onAcknowledgeSos]);

  const resetView = () => {
    if (mapRef.current) {
      mapRef.current.flyTo([28.6139, 77.2090], 12, { duration: 0.8 });
    }
  };

  return (
    <div className="relative flex-1 h-full w-full flex flex-col overflow-hidden select-none bg-[#101316] border border-[#1d2327]">
      {/* Map Header / Minimalist Coordinates Bar (No dots, no trail/radar toggles) */}
      <div className="bg-[#13171a] border-b border-[#1f2529] px-3 py-1.5 flex flex-wrap items-center justify-between gap-3 z-10 text-xs font-mono">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Crosshair className={`w-3.5 h-3.5 ${isStale ? 'text-[#c28546]' : 'text-[#5e7865]'}`} />
            {isStale ? (
              <span className="text-[#e8a356] uppercase text-[10px] font-normal tracking-wider bg-[#261b12] px-1.5 py-0.5 border border-[#52341b]">
                STALE POSITIONS ({lastUpdateTime || 'LINK LOST'})
              </span>
            ) : (
              <span className="font-normal text-[#b8c6cf] uppercase text-xs">
                GRID
              </span>
            )}
          </div>
          <span className="text-[#7896a6] font-mono text-[11px] tabular-nums">
            LAT {centerCoords.lat.toFixed(4)} LON {centerCoords.lon.toFixed(4)}
          </span>
          <span className="text-[#55636b] font-mono text-[10px] hidden lg:inline tabular-nums">
            CURSOR: {cursorCoords.lat.toFixed(4)}, {cursorCoords.lon.toFixed(4)}
          </span>
        </div>

        {/* Controls: Trails toggle & Recenter */}
        <div className="flex items-center gap-2 text-[10px]">
          <button
            onClick={() => setShowTrails(!showTrails)}
            className={`px-2 py-0.5 border text-[10px] uppercase font-mono transition-colors cursor-pointer ${
              showTrails
                ? 'border-[#2d5e3c] bg-[#14261a] text-[#7ec28c] font-normal'
                : 'border-[#222a2f] bg-[#14181b] text-[#5c6c74]'
            }`}
            title="Toggle GPS movement trails"
          >
            TRAILS: {showTrails ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={resetView}
            className="p-1 border border-[#222a2f] text-[#7b8d96] hover:border-[#38454d] hover:text-[#b8c7cf] transition-colors cursor-pointer"
            title="Recenter Grid"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Leaflet Map Canvas */}
      <div className="relative flex-1 w-full h-full">
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Bottom-Left Radar Widget: permanently visible above tiles */}
        <div className="absolute bottom-3 left-3 z-[1000] pointer-events-auto">
          <RadarWidget
            units={units}
            centerLat={centerCoords.lat}
            centerLon={centerCoords.lon}
            onSelectUnit={onSelectUnit}
          />
        </div>

        {/* Bottom-Right Range Scale */}
        <div className="absolute bottom-3 right-3 z-[1000] bg-[#111518]/90 border border-[#222a2f] px-2 py-0.5 text-[9px] font-mono text-[#7b8d96] flex items-center gap-2 pointer-events-none">
          <div className="w-10 h-0.5 bg-[#414f57] relative">
            <div className="absolute left-0 top-0 h-1.5 w-[1px] bg-[#5a6c75] -translate-y-0.5" />
            <div className="absolute right-0 top-0 h-1.5 w-[1px] bg-[#5a6c75] -translate-y-0.5" />
          </div>
          <span>1 KM GRID</span>
        </div>
      </div>
    </div>
  );
};
