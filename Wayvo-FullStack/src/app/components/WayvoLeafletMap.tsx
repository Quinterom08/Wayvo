import { useEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertCircle, LocateFixed, MapPin } from 'lucide-react';

// Coordenadas ILUSTRATIVAS del proyecto de grado: líneas rectas aproximadas
// entre puntos del Valle de Aburrá. NO son recorridos validados sobre calles.
export const DEMO_PATHS: {
  id: string;
  color: string;
  name: string;
  points: L.LatLngTuple[];
}[] = [
  { id: '302', color: '#2563EB', name: 'Bello — Envigado', points: [[6.334, -75.558], [6.300, -75.560], [6.273, -75.566], [6.251, -75.569], [6.240, -75.572], [6.210, -75.573], [6.174, -75.591]] },
  { id: '306', color: '#D97706', name: 'Laureles — Centro', points: [[6.245, -75.603], [6.250, -75.592], [6.255, -75.586], [6.250, -75.576], [6.245, -75.569]] },
  { id: '311', color: '#059669', name: 'Belén — Robledo', points: [[6.223, -75.601], [6.236, -75.608], [6.255, -75.601], [6.269, -75.591], [6.282, -75.595]] },
  { id: '315', color: '#7C3AED', name: 'La América — Itagüí', points: [[6.251, -75.613], [6.246, -75.591], [6.226, -75.576], [6.199, -75.579], [6.176, -75.597], [6.168, -75.614]] },
  { id: '301', color: '#DC2626', name: 'Circular Norte', points: [[6.282, -75.563], [6.291, -75.556], [6.300, -75.562], [6.301, -75.578], [6.286, -75.580], [6.282, -75.563]] },
];

const MEDELLIN: L.LatLngTuple = [6.2486, -75.5742];
const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
// En producción puede cambiarse por un proveedor de mosaicos compatible.
const TILE_URL = (import.meta.env.VITE_OSM_TILE_URL || DEFAULT_TILE_URL).trim();

interface Props {
  activeRoute?: string | null;
  compact?: boolean;
  onRouteSelect?: (id: string | null) => void;
  onOpenMap?: () => void;
}

export function WayvoLeafletMap({ activeRoute = null, compact = false, onRouteSelect, onOpenMap }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const linesRef = useRef<Map<string, L.Polyline>>(new Map());
  const locationRef = useRef<L.LayerGroup | null>(null);
  // Callback ref avoids rebuilding the map whenever the parent rerenders.
  const onSelectRef = useRef(onRouteSelect);
  onSelectRef.current = onRouteSelect;
  const onOpenRef = useRef(onOpenMap);
  onOpenRef.current = onOpenMap;

  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [gpsPosition, setGpsPosition] = useState<L.LatLngTuple | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = L.map(containerRef.current, {
      center: MEDELLIN,
      zoom: compact ? 11 : 12,
      zoomControl: false,
      scrollWheelZoom: !compact,
      // Small screens: avoid accidental map movement when scrolling home.
      dragging: !compact,
      touchZoom: !compact,
      doubleClickZoom: !compact,
      boxZoom: !compact,
    });
    mapRef.current = map;
    if (!compact) L.control.zoom({ position: 'bottomright' }).addTo(map);
    if (compact) map.on('click', () => onOpenRef.current?.());

    // Attribution must stay visible: required by the OSM tile policy.
    const tiles = L.tileLayer(TILE_URL, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
      maxZoom: 19,
      minZoom: 9,
    });
    let tileFailed = false;
    tiles.on('tileerror', () => {
      if (!tileFailed) {
        tileFailed = true;
        setError('No se pudieron cargar algunas partes del mapa. Comprueba la conexión a Internet.');
      }
    });
    tiles.addTo(map);

    DEMO_PATHS.forEach((route) => {
      const line = L.polyline(route.points, {
        color: route.color,
        weight: 4,
        opacity: .85,
        dashArray: '9 7',
        interactive: !compact,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);
      line.bindTooltip(`WV-${route.id} · ${route.name} (simulada)`, { sticky: true });
      line.on('click', () => onSelectRef.current?.(route.id));
      linesRef.current.set(route.id, line);
      // Start/end points identify the approximate route ends, not verified stops.
      [route.points[0], route.points[route.points.length - 1]].forEach((point) => {
        L.circleMarker(point, {
          radius: 4,
          color: '#fffdf1',
          weight: 2,
          fillColor: route.color,
          fillOpacity: 1,
          interactive: false,
        }).addTo(map);
      });
    });

    // Leaflet needs recalculation when the containing screen becomes visible.
    const resize = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resize.observe(containerRef.current);
    const frame = requestAnimationFrame(() => map.invalidateSize({ pan: false }));

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      locationRef.current = null;
      linesRef.current.clear();
      mapRef.current = null;
      map.remove();
    };
  }, [compact]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    linesRef.current.forEach((line, routeId) => {
      const selected = activeRoute === routeId;
      line.setStyle({
        opacity: activeRoute && !selected ? .18 : 0.88,
        weight: selected ? 7 : 4,
      });
      if (selected) line.bringToFront();
    });
    const chosen = activeRoute ? linesRef.current.get(activeRoute) : undefined;
    if (chosen) map.fitBounds(chosen.getBounds().pad(.26), { animate: true, maxZoom: 14 });
  }, [activeRoute, compact]);

  function locate() {
    if (!navigator.geolocation) {
      setError('Este dispositivo no tiene geolocalización disponible.');
      return;
    }
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point: L.LatLngTuple = [position.coords.latitude, position.coords.longitude];
        setGpsPosition(point);
        setLocating(false);
        const map = mapRef.current;
        if (!map) return;
        locationRef.current?.remove();
        const marker = L.circleMarker(point, {
          radius: 8,
          color: '#fffef3',
          weight: 3,
          fillColor: '#1b4935',
          fillOpacity: 1,
        }).bindPopup('Tu ubicación GPS aproximada');
        const accuracy = L.circle(point, {
          radius: Math.min(position.coords.accuracy || 25, 2000),
          color: '#286447',
          weight: 1,
          fillColor: '#286447',
          fillOpacity: 0.1,
        });
        locationRef.current = L.layerGroup([accuracy, marker]).addTo(map);
        map.setView(point, 15, { animate: true });
        marker.openPopup();
      },
      (cause) => {
        setLocating(false);
        setError(cause.code === 1
          ? 'Acceso a ubicación denegado. Permite el GPS en los ajustes del dispositivo.'
          : 'No se pudo obtener el GPS. Usa HTTPS o localhost y comprueba tu ubicación.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 },
    );
  }

  return (
    <div className="wayvo-map-wrap relative w-full h-full overflow-hidden" aria-label="Mapa interactivo OpenStreetMap con rutas simuladas de Wayvo">
      <div ref={containerRef} className="absolute inset-0 wayvo-leaflet-canvas" role="region" aria-label="Mapa de Medellín y Valle de Aburrá" />
      <div className="absolute top-3 left-3 max-w-[70%] z-[500] rounded-xl bg-[#fffdf1]/95 border border-[#74917b] px-3 py-2 text-[10px] font-extrabold text-[#1b4935] shadow-md pointer-events-none">
        OPENSTREETMAP · DEMOSTRACIÓN
      </div>
      {!compact && <button type="button" onClick={locate} disabled={locating} aria-label="Centrar mapa en mi ubicación GPS" title="Mi ubicación" className="absolute z-[500] top-3 right-3 bg-[#fffdf1] border-2 border-[#1b4935] rounded-xl p-2.5 text-[#1b4935] shadow-md disabled:opacity-60">
        <LocateFixed size={19} className={locating ? 'animate-pulse' : ''} />
      </button>}
      {!compact && gpsPosition && <div className="absolute z-[500] top-14 right-2 bg-[#fffdf1] rounded-md px-2 py-1 text-[10px] font-bold text-[#1b4935] border border-[#74917b]">GPS activo</div>}
      {error && <div role="alert" className="absolute z-[500] left-2 right-2 bottom-16 rounded-xl bg-[#fff8db]/95 border border-[#b57c45] p-2 flex items-start gap-2 text-xs text-[#663d20] shadow-md"><AlertCircle size={16} className="shrink-0" />{error}</div>}
      {compact && <div className="wayvo-preview-tap absolute z-[500] right-3 top-14 pointer-events-none">Toca el mapa para ampliar ↗</div>}
      <div className="absolute z-[500] left-2 bottom-7 max-w-[65%] bg-[#fffdf1]/95 border border-[#b4c3ae] text-[#426046] px-2.5 py-1 rounded-lg text-[10px] font-semibold pointer-events-none">
        <MapPin size={11} className="inline mr-1" />Rutas ilustrativas, no oficiales
      </div>
    </div>
  );
}
