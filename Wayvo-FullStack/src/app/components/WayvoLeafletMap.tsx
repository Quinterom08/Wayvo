import { useEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertCircle, LocateFixed, MapPin, Play, Square, Save, Trash2, History } from 'lucide-react';

// Coordenadas de paraderos FICTICIOS del catálogo académico.
// Una única fuente de coordenadas en frontend evita marcadores fuera de la línea.
// El orden coincide con backend/assistant_chat.py; NO representa calles reales.
export const DEMO_STOP_COORDS: Record<string, L.LatLngTuple> = {
  'Bello':[6.334,-75.558], 'Niquía':[6.317,-75.558], 'Madera':[6.300,-75.560],
  'Acevedo':[6.283,-75.564], 'Universidad':[6.265,-75.568], 'Centro':[6.246,-75.570],
  'El Poblado':[6.222,-75.573], 'Envigado':[6.174,-75.591],
  'Laureles':[6.245,-75.603], 'Estadio':[6.250,-75.593], 'Suramericana':[6.251,-75.585],
  'Belén':[6.223,-75.601], 'La América':[6.236,-75.608], 'Floresta':[6.269,-75.591],
  'Robledo':[6.282,-75.595], 'Sabaneta':[6.176,-75.597], 'Itagüí':[6.168,-75.614],
  'Aranjuez':[6.282,-75.563], 'Manrique':[6.291,-75.556], 'Santa Cruz':[6.300,-75.562],
};

const DEMO_ROUTE_STOPS: Record<string, string[]> = {
  '302':['Bello','Niquía','Madera','Acevedo','Universidad','Centro','El Poblado','Envigado'],
  '306':['Laureles','Estadio','Suramericana','Centro'],
  '311':['Belén','La América','Estadio','Floresta','Robledo'],
  '315':['La América','Suramericana','El Poblado','Sabaneta','Itagüí'],
  '301':['Aranjuez','Manrique','Santa Cruz','Acevedo','Aranjuez'],
};

export const DEMO_PATHS: {id:string;color:string;name:string;points:L.LatLngTuple[]}[] = [
  {id:'302',color:'#2563EB',name:'Bello — Envigado'},
  {id:'306',color:'#D97706',name:'Laureles — Centro'},
  {id:'311',color:'#059669',name:'Belén — Robledo'},
  {id:'315',color:'#7C3AED',name:'La América — Itagüí'},
  {id:'301',color:'#DC2626',name:'Circular Norte'},
].map(route=>({...route,points:DEMO_ROUTE_STOPS[route.id].map(stop=>DEMO_STOP_COORDS[stop])}));

export type MapTrip = {
  found: boolean; origin?:string; destination?:string;
  segments?: {bus:string;board_at:string;get_off_at:string;stops:string[]}[];
};

export type GpsPoint = { lat: number; lng: number; time: number };
export type LiveBus = { id:number; label:string; route_id:string; active:boolean; updated_at:string; lat:number; lng:number; accuracy:number|null; trail:{lat:number;lng:number}[] };
const MEDELLIN: L.LatLngTuple = [6.2486, -75.5742];
const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
// En producción puede cambiarse por un proveedor de mosaicos compatible.
const TILE_URL = (import.meta.env.VITE_OSM_TILE_URL || DEFAULT_TILE_URL).trim();

interface Props {
  activeRoute?: string | null;
  trip?: MapTrip | null;
  compact?: boolean;
  onRouteSelect?: (id: string | null) => void;
  onOpenMap?: () => void;
  onSaveTrack?: (points: GpsPoint[]) => Promise<void>;
  onLoadTracks?: () => Promise<{id:number;created_at:string;points:GpsPoint[]}[]>;
  onDeleteTrack?: (id:number) => Promise<void>;
  onLoadBuses?: () => Promise<LiveBus[]>;
  isAdmin?: boolean;
}

export function WayvoLeafletMap({ activeRoute = null, trip = null, compact = false, onRouteSelect, onOpenMap, onSaveTrack, onLoadTracks, onDeleteTrack, onLoadBuses, isAdmin = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const linesRef = useRef<Map<string, L.Polyline>>(new Map());
  const locationRef = useRef<L.LayerGroup | null>(null);
  const journeyRef = useRef<L.LayerGroup | null>(null);
  const trackLineRef = useRef<L.Polyline | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const locationWatchIdRef = useRef<number | null>(null);
  const gpsRequestRef = useRef(0);
  const gpsTimeoutRef = useRef<number | null>(null);
  const gpsBusyRef = useRef(false);
  const tripRef = useRef(trip);
  tripRef.current = trip;
  const busLayerRef = useRef<L.LayerGroup | null>(null);
  const loadBusesRef = useRef(onLoadBuses);
  loadBusesRef.current = onLoadBuses;
  const [busStatus,setBusStatus] = useState('Esperando señales GPS de los buses…');
  const trackPointsRef = useRef<GpsPoint[]>([]);
  const [trackPoints, setTrackPoints] = useState<GpsPoint[]>([]);
  const [tracking, setTracking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [trackInfo, setTrackInfo] = useState('');
  const [meters, setMeters] = useState(0);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [savedTracks, setSavedTracks] = useState<{id:number;created_at:string;points:GpsPoint[]}[]>([]);
  // Callback ref avoids rebuilding the map whenever the parent rerenders.
  const onSelectRef = useRef(onRouteSelect);
  onSelectRef.current = onRouteSelect;
  const onOpenRef = useRef(onOpenMap);
  onOpenRef.current = onOpenMap;

  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [gpsPosition, setGpsPosition] = useState<L.LatLngTuple | null>(null);
  const [gpsNote,setGpsNote] = useState('');
  const [nearestStop,setNearestStop] = useState<{name:string;meters:number}|null>(null);

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
    busLayerRef.current = L.layerGroup().addTo(map);
    journeyRef.current = L.layerGroup().addTo(map);
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
      gpsRequestRef.current++;
      gpsBusyRef.current=false;
      if (gpsTimeoutRef.current !== null) window.clearTimeout(gpsTimeoutRef.current);
      gpsTimeoutRef.current=null;
      if (watchIdRef.current !== null) navigator.geolocation?.clearWatch(watchIdRef.current);
      if (locationWatchIdRef.current !== null) navigator.geolocation?.clearWatch(locationWatchIdRef.current);
      watchIdRef.current = null;
      busLayerRef.current = null;
      trackLineRef.current = null;
      locationRef.current = null;
      journeyRef.current = null;
      linesRef.current.clear();
      mapRef.current = null;
      map.remove();
    };
  }, [compact]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    linesRef.current.forEach((line, routeId) => {
      const inTrip=trip?.segments?.some(leg=>leg.bus===`WV-${routeId}`) ?? false;
      const selected = activeRoute === routeId || inTrip;
      line.setStyle({
        opacity: (activeRoute || trip?.found) && !selected ? .12 : 0.88,
        weight: selected ? 7 : 4,
      });
      if (selected) line.bringToFront();
    });
    const chosen = activeRoute ? linesRef.current.get(activeRoute) : undefined;
    if (chosen) map.fitBounds(chosen.getBounds().pad(.26), { animate: true, maxZoom: 14 });
  }, [activeRoute, compact, trip]);

  // Se dibuja el bus completo de fondo y, encima, ÚNICAMENTE las paradas
  // recorridas en cada tramo (también en sentido inverso).
  useEffect(()=>{
    const map=mapRef.current, group=journeyRef.current;
    if(!map || !group)return;
    group.clearLayers();
    setNearestStop(null);
    if(!trip?.found || !trip.segments?.length)return;
    const bounds:L.LatLngTuple[]=[];
    trip.segments.forEach((leg,index)=>{
      const routeId=leg.bus.replace(/^WV-/, '');
      const color=DEMO_PATHS.find(r=>r.id===routeId)?.color||'#1b4935';
      const visited=leg.stops.map(name=>DEMO_STOP_COORDS[name]).filter((p):p is L.LatLngTuple=>!!p);
      if(visited.length>1){
        L.polyline(visited,{color:'#fffdf1',weight:10,opacity:1,interactive:false}).addTo(group);
        L.polyline(visited,{color,weight:7,opacity:1,interactive:false}).addTo(group);
        bounds.push(...visited);
      }
      const first=DEMO_STOP_COORDS[leg.board_at];
      const last=DEMO_STOP_COORDS[leg.get_off_at];
      if(first){
        const marker=L.circleMarker(first,{radius:11,color:'#fffdf1',weight:3,fillColor:index===0?'#1b4935':'#e6d681',fillOpacity:1});
        marker.bindTooltip(index===0?`INICIO · Sube al ${leg.bus} en ${leg.board_at}`:`TRANSBORDO ${index} · Sube al ${leg.bus} en ${leg.board_at}`);
        marker.addTo(group);
        bounds.push(first);
      }
      if(last){
        // Un único punto de transbordo coincide para la bajada y subida
        // siguiente. Los pasos completos aparecen en el resumen superior.
        const isTransfer=index<trip.segments!.length-1;
        L.circleMarker(last,{radius:isTransfer?12:10,color:'#fffdf1',weight:3,fillColor:isTransfer?'#e6d681':'#b96032',fillOpacity:1})
          .bindTooltip(isTransfer?`TRANSBORDO · Baja de ${leg.bus} y toma ${trip.segments![index+1].bus} en ${leg.get_off_at}`:`DESTINO · Baja de ${leg.bus} en ${leg.get_off_at}`)
          .addTo(group);
        bounds.push(last);
      }
    });
    if(bounds.length)map.fitBounds(L.latLngBounds(bounds).pad(.22),{maxZoom:14,animate:false});
  },[trip,compact]);

  // Find the nearest ESTIMATED stop from the first leg using the user's real GPS.
  // The dotted connection is straight-line distance, not a walking route.
  useEffect(()=>{
    const group=journeyRef.current, map=mapRef.current;
    if(!group || !map || !trip?.found || !trip.segments?.length || !gpsPosition){setNearestStop(null);return;}
    const startLeg=trip.segments[0];
    const options=startLeg.stops.slice(0,-1).map(name=>({name,point:DEMO_STOP_COORDS[name]})).filter((o):o is {name:string;point:L.LatLngTuple}=>!!o.point);
    if(!options.length)return;
    const ranked=options.map(o=>({...o,meters:map.distance(gpsPosition,o.point)})).sort((a,b)=>a.meters-b.meters);
    const nearest=ranked[0];
    setNearestStop({name:nearest.name,meters:nearest.meters});
    const line=L.polyline([gpsPosition,nearest.point],{color:'#1b4935',weight:3,opacity:.9,dashArray:'4 9',interactive:false}).addTo(group);
    const marker=L.circleMarker(nearest.point,{radius:11,color:'#1b4935',weight:3,fillColor:'#e6d681',fillOpacity:1})
      .bindTooltip(`Paradero estimado más cercano: ${nearest.name}`)
      .addTo(group);
    return ()=>{group.removeLayer(line);group.removeLayer(marker);};
  },[trip,gpsPosition]);

  // GPS activation is requested only after the person explicitly pressed
  // “Ver recorrido y mi GPS” in Ruta Express/the chat.
  useEffect(()=>{
    if(trip?.found && !compact && mapRef.current)locate();
    // locate is intentionally not a dependency: its state callback changes per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[trip,compact]);

  // GPS locations come from the server (in-bus devices). The passenger's own
  // geolocation is only used by the separate Locate button, never sent as bus telemetry.
  useEffect(() => {
    let cancelled=false;
    const refresh=async () => {
      if (!loadBusesRef.current || !mapRef.current || document.visibilityState==='hidden') return;
      try {
        const buses=await loadBusesRef.current();
        if(cancelled || !mapRef.current || !busLayerRef.current)return;
        busLayerRef.current.clearLayers();
        buses.forEach(bus=>{
          const pts=bus.trail || [];
          if(pts.length>1) L.polyline(pts.map(p=>[p.lat,p.lng] as L.LatLngTuple),
            {color:bus.active?'#1b4935':'#87958a',weight:4,opacity:bus.active ? 0.86 : 0.35,interactive:false}).addTo(busLayerRef.current!);
          const marker=L.circleMarker([bus.lat,bus.lng],{radius:bus.active?9:6,color:'#fffdf1',weight:3,fillColor:bus.active?'#e6d681':'#9da59a',fillOpacity:1}).addTo(busLayerRef.current!);
          // Use textContent-style strings only; no HTML from server/device labels.
          const tooltip=L.DomUtil.create('span');
          tooltip.textContent=`${bus.label} · WV-${bus.route_id} · ${bus.active?'GPS activo':'última posición registrada'}`;
          marker.bindTooltip(tooltip);
        });
        setBusStatus(buses.length ? `${buses.filter(b=>b.active).length} bus(es) transmitiendo GPS · ${buses.length} registrados` : 'Sin GPS de buses conectado. Rutas ilustrativas.');
      } catch {
        if(!cancelled)setBusStatus('No se pudo consultar el GPS de los buses.');
      }
    };
    void refresh();
    const timer=window.setInterval(()=>void refresh(),6000);
    return ()=>{cancelled=true;window.clearInterval(timer);};
  }, [compact]);

  // GPS del pasajero: obtención inicial con límite de tiempo, reintento
  // de precisión estándar y seguimiento posterior. Nunca se almacena ni envía.
  function locate() {
    if(!navigator.geolocation){setLocating(false);setError('GPS no disponible: selecciona un origen manual en Ruta Express.');return;}
    if(!window.isSecureContext){setLocating(false);setError('Para usar GPS desde iPhone o Android abre Wayvo con HTTPS y autoriza la ubicación.');return;}
    if(gpsBusyRef.current)return;
    const map=mapRef.current;
    if(gpsPosition && locationWatchIdRef.current!==null){map?.setView(gpsPosition,15,{animate:true});return;}
    const request=++gpsRequestRef.current;
    gpsBusyRef.current=true;
    setLocating(true);setError('');setGpsNote('Solicitando ubicación…');
    if(gpsTimeoutRef.current!==null)window.clearTimeout(gpsTimeoutRef.current);
    let finished=false;
    const finish=()=>{
      if(finished || request!==gpsRequestRef.current)return false;
      finished=true;
      gpsBusyRef.current=false;setLocating(false);
      if(gpsTimeoutRef.current!==null)window.clearTimeout(gpsTimeoutRef.current);
      gpsTimeoutRef.current=null;
      return true;
    };
    const applyFix=(position:GeolocationPosition,first:boolean)=>{
      if(request!==gpsRequestRef.current)return;
      const {latitude,longitude,accuracy:acc}=position.coords;
      if(!Number.isFinite(latitude)||!Number.isFinite(longitude))return;
      const point:L.LatLngTuple=[latitude,longitude];
      setGpsPosition(point);
      setGpsNote(`GPS activo · precisión aproximada ±${Math.round(acc)} m`);
      const visibleMap=mapRef.current;
      if(!visibleMap)return;
      locationRef.current?.remove();
      locationRef.current=L.layerGroup([
        L.circle(point,{radius:Math.min(acc||25,2000),color:'#286447',weight:1,fillColor:'#286447',fillOpacity:.10}),
        L.circleMarker(point,{radius:8,color:'#fffef3',weight:3,fillColor:'#1b4935',fillOpacity:1})
          .bindPopup(`Tu GPS · precisión aprox. ±${Math.round(acc)} m`)
      ]).addTo(visibleMap);
      if(first){
        const currentTrip=tripRef.current;
        const path=currentTrip?.segments?.flatMap(leg=>leg.stops.map(stop=>DEMO_STOP_COORDS[stop]).filter((p):p is L.LatLngTuple=>!!p))||[];
        if(path.length && visibleMap.distance(point,path[0])<35000)
          visibleMap.fitBounds(L.latLngBounds([point,...path]).pad(.18),{maxZoom:14,animate:true});
        else if(!path.length)visibleMap.setView(point,15,{animate:true});
        // Fuera de Medellín no alejar el mapa de la ruta simulada para mostrar el GPS.
      }
    };
    const success=(position:GeolocationPosition)=>{
      if(!finish())return;
      setError('');applyFix(position,true);
      if(locationWatchIdRef.current!==null)navigator.geolocation.clearWatch(locationWatchIdRef.current);
      locationWatchIdRef.current=navigator.geolocation.watchPosition(
        position=>applyFix(position,false),
        ()=>{setGpsNote('Última ubicación disponible. Toca Mi GPS para reintentar si cambias de lugar.');
             if(locationWatchIdRef.current!==null)navigator.geolocation.clearWatch(locationWatchIdRef.current);
             locationWatchIdRef.current=null;},
        {enableHighAccuracy:false,timeout:15000,maximumAge:15000}
      );
    };
    const fail=(reason:GeolocationPositionError)=>{
      if(!finish())return;
      setGpsNote('GPS no disponible');
      setError(reason.code===1
        ?'Permiso de ubicación denegado. Actívalo en Safari/Ajustes y pulsa Mi GPS.'
        : 'No pudimos localizarte. Comprueba la ubicación del celular, el HTTPS y vuelve a pulsar Mi GPS. También puedes elegir el origen manualmente.');
    };
    gpsTimeoutRef.current=window.setTimeout(()=>{
      if(!finish())return;
      setGpsNote('GPS no disponible');
      setError('El GPS tardó demasiado. Toca Mi GPS para reintentar o selecciona el origen manualmente.');
    },21000);
    navigator.geolocation.getCurrentPosition(success, reason=>{
      if(request!==gpsRequestRef.current)return;
      if(reason.code===1){fail(reason);return;}
      setGpsNote('Buscando señal alternativa…');
      navigator.geolocation.getCurrentPosition(success,fail,
        {enableHighAccuracy:false,timeout:8000,maximumAge:30000});
    },{enableHighAccuracy:true,timeout:8500,maximumAge:15000});
  }

  function distanceMeters(a:GpsPoint,b:GpsPoint) {
    const rad=Math.PI/180, dLat=(b.lat-a.lat)*rad, dLng=(b.lng-a.lng)*rad;
    const x=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLng/2)**2;
    return 6371000*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
  }
  function renderTrack(points:GpsPoint[]) {
    const map=mapRef.current;
    if (!map) return;
    trackLineRef.current?.remove();
    if(points.length>0){
      trackLineRef.current=L.polyline(points.map((p):L.LatLngTuple=>[p.lat,p.lng]),{color:'#1b4935',weight:6,opacity:.98}).addTo(map);
      trackLineRef.current.bringToFront();
    }
  }
  function stopTracking() {
    if(watchIdRef.current!==null)navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current=null;
    setTracking(false);
    setTrackInfo('Grabación detenida. Puedes guardar o borrar tu recorrido.');
  }
  function startTracking() {
    if (!navigator.geolocation) {setError('GPS no disponible en este dispositivo.');return;}
    if (!window.isSecureContext) {setError('Para grabar GPS en iPhone usa HTTPS (o localhost en el mismo dispositivo). Una IP local por HTTP no permite geolocalización segura.');return;}
    if(watchIdRef.current!==null)return;
    trackPointsRef.current=[];setTrackPoints([]);setMeters(0);setTrackInfo('Esperando señal GPS…');setError('');
    trackLineRef.current?.remove();trackLineRef.current=null;
    setTracking(true);
    watchIdRef.current=navigator.geolocation.watchPosition(pos=>{
      const {latitude:lat,longitude:lng,accuracy:acc}=pos.coords;
      setAccuracy(Math.round(acc));
      // Ignore unreliable and stationary fixes to avoid GPS jitter/spurious distances.
      if(!Number.isFinite(lat)||!Number.isFinite(lng)||acc>100)return;
      const next:GpsPoint={lat,lng,time:pos.timestamp};
      const previous=trackPointsRef.current[trackPointsRef.current.length-1];
      const moved=previous?distanceMeters(previous,next):0;
      if(previous && moved<5)return;
      if(moved>500)return; // unrealistic jump for city travel between samples
      if(trackPointsRef.current.length>=1500){stopTracking();setError('Límite de 1500 puntos alcanzado. Guarda el recorrido.');return;}
      trackPointsRef.current=[...trackPointsRef.current,next];
      setTrackPoints(trackPointsRef.current);
      setMeters(old=>old+moved);
      setTrackInfo('Grabando recorrido en primer plano');
      renderTrack(trackPointsRef.current);
      const map=mapRef.current;
      if(map){
        map.panTo([lat,lng],{animate:false});
        locationRef.current?.remove();
        locationRef.current=L.layerGroup([L.circleMarker([lat,lng],{radius:7,color:'#fffdf1',weight:3,fillColor:'#1b4935',fillOpacity:1})]).addTo(map);
      }
    },reason=>{
      stopTracking();
      setError(reason.code===1?'Permite el acceso a tu ubicación desde los ajustes del navegador.':'Sin señal GPS. Prueba al aire libre y con HTTPS.');
    },{enableHighAccuracy:true,timeout:20000,maximumAge:0});
  }
  async function saveTrack(){
    if(!onSaveTrack || trackPoints.length<2)return;
    setSaving(true);setError('');
    try{await onSaveTrack(trackPoints);setTrackInfo('¡Recorrido guardado en tu cuenta!');}
    catch(e){setError(e instanceof Error?e.message:'Error guardando recorrido.');}
    finally{setSaving(false);}
  }
  function clearTrack(){
    if(tracking)stopTracking();
    trackPointsRef.current=[];setTrackPoints([]);setMeters(0);setTrackInfo('Recorrido borrado de esta pantalla.');
    trackLineRef.current?.remove();trackLineRef.current=null;
  }
  async function loadTrackHistory(){
    if(!onLoadTracks)return;
    try{const result=await onLoadTracks();setSavedTracks(result);setTrackInfo(result.length?`${result.length} recorridos guardados. Elige uno para verlo.`:'Todavía no hay recorridos guardados.');}
    catch(e){setError(e instanceof Error?e.message:'No se pudieron cargar tus recorridos.');}
  }
  async function deleteSaved(id:number){
    if(!onDeleteTrack)return;
    if(!window.confirm('¿Eliminar permanentemente este recorrido guardado?'))return;
    try{await onDeleteTrack(id);setSavedTracks(old=>old.filter(t=>t.id!==id));setTrackInfo('Recorrido eliminado del servidor.');}
    catch(e){setError(e instanceof Error?e.message:'No se pudo eliminar.');}
  }
  function showSaved(points:GpsPoint[]){
    if(tracking)stopTracking();
    trackPointsRef.current=points;setTrackPoints(points);
    renderTrack(points);
    setMeters(points.slice(1).reduce((total,p,i)=>total+distanceMeters(points[i],p),0));
    if(points.length>1)mapRef.current?.fitBounds(L.latLngBounds(points.map((p):L.LatLngTuple=>[p.lat,p.lng])),{padding:[20,20]});
    setTrackInfo('Recorrido guardado (histórico).');
  }

  return (
    <div className="wayvo-map-wrap relative w-full h-full overflow-hidden" aria-label="Mapa interactivo OpenStreetMap con rutas simuladas de Wayvo">
      <div ref={containerRef} className="absolute inset-0 wayvo-leaflet-canvas" role="region" aria-label="Mapa de Medellín y Valle de Aburrá" />
      <div className="absolute top-3 left-3 max-w-[70%] z-[500] rounded-xl bg-[#fffdf1]/95 border border-[#74917b] px-3 py-2 text-[10px] font-extrabold text-[#1b4935] shadow-md pointer-events-none">
        OPENSTREETMAP · DEMOSTRACIÓN
      </div>
      <button type="button" onClick={(event)=>{event.stopPropagation();locate();}} disabled={locating}
        aria-label="Activar GPS y localizarme" title="Mi ubicación (GPS en directo)"
        className="absolute z-[500] top-3 right-3 bg-[#fffdf1] border-2 border-[#1b4935] rounded-xl p-2.5 text-[#1b4935] shadow-md disabled:opacity-60 flex gap-1 items-center">
        <LocateFixed size={19} className={locating ? 'animate-pulse' : ''} />
        {!compact && <span className="text-[10px] font-black">{locating?'Buscando…':'Mi GPS'}</span>}
        {compact && <span className="text-[10px] font-black">Mi GPS</span>}
      </button>
      {!compact && isAdmin && !trip?.found && <div className="absolute z-[500] top-16 left-2 right-2 pointer-events-none flex flex-col items-start gap-1">
        <div className="rounded-xl bg-[#fffdf1]/95 border border-[#74917b] shadow-md p-2 pointer-events-auto max-w-full">
          <p className="text-[11px] font-black text-[#1b4935] mb-1">{tracking?'● GRABANDO GPS':'REGISTRAR RECORRIDO GPS'}</p>
          <div className="flex flex-wrap gap-1.5">
            {!tracking ? <button onClick={startTracking} className="text-[11px] bg-[#1b4935] text-white px-2 py-2 rounded-lg font-bold inline-flex gap-1 items-center"><Play size={12}/> Iniciar</button>
              : <button onClick={stopTracking} className="text-[11px] bg-[#a33f30] text-white px-2 py-2 rounded-lg font-bold inline-flex gap-1 items-center"><Square size={12}/> Detener</button>}
            <button onClick={saveTrack} disabled={tracking||trackPoints.length<2||saving} className="text-[11px] border border-[#1b4935] text-[#1b4935] px-2 py-2 rounded-lg font-bold inline-flex gap-1 items-center disabled:opacity-40"><Save size={12}/> Guardar</button>
            <button onClick={clearTrack} disabled={tracking} className="text-[11px] border border-[#d2baa1] text-[#784d3f] px-2 py-2 rounded-lg font-bold inline-flex gap-1 items-center disabled:opacity-40"><Trash2 size={12}/> Borrar</button>
            <button onClick={loadTrackHistory} className="text-[11px] border border-[#74917b] text-[#1b4935] px-2 py-2 rounded-lg font-bold inline-flex gap-1 items-center"><History size={12}/> Historial</button>
          </div>
          <p className="text-[10px] text-[#426046] mt-1">{(meters/1000).toFixed(2)} km · {trackPoints.length} puntos{accuracy!==null?` · ±${accuracy} m`:''}</p>
          {trackInfo && <p className="text-[10px] text-[#426046] mt-1">{trackInfo}</p>}
          {savedTracks.length>0 && <div className="max-h-28 overflow-y-auto mt-1 space-y-1">{savedTracks.map(t=><div key={t.id} className="flex gap-1 w-full"><button onClick={()=>showSaved(t.points)} className="flex-1 rounded-md bg-[#e8efdc] text-[#1b4935] p-1.5 text-left text-[10px] font-semibold">Recorrido #{t.id} · {t.created_at} · {t.points.length} puntos</button><button onClick={()=>deleteSaved(t.id)} className="bg-[#f8e8de] text-[#783e34] rounded-md px-2 text-[10px]" aria-label={`Eliminar recorrido ${t.id}`}><Trash2 size={12}/></button></div>)}</div>}
        </div>
      </div>}
      {gpsPosition && !trip && <div className="absolute z-[500] top-16 right-2 bg-[#fffdf1] rounded-md px-2 py-1 text-[10px] font-bold text-[#1b4935] border border-[#74917b]">● GPS activo</div>}
      {!compact && trip?.found && <div className="wayvo-map-stop-panel absolute z-[500] top-16 left-2 right-2">
        <strong className="flex gap-1.5 items-center"><MapPin size={14}/> {nearestStop?`Paradero estimado: ${nearestStop.name}`:locating?'Buscando tu GPS…':gpsPosition?'GPS disponible · comprueba el paradero':'Toca Mi GPS para buscar el paradero'}</strong>
        <span>{nearestStop?`${Math.round(nearestStop.meters)} m en línea recta desde tu GPS · NO es una ruta para caminar`:`${gpsNote||'Si no aparece el GPS, usa el origen manual.'} · El paradero de subida se indica arriba.`}</span>
      </div>}
      {error && <div role="alert" className="absolute z-[500] left-2 right-2 bottom-16 rounded-xl bg-[#fff8db]/95 border border-[#b57c45] p-2 flex items-start gap-2 text-xs text-[#663d20] shadow-md"><AlertCircle size={16} className="shrink-0" />{error}</div>}
      {!compact && <div className="absolute z-[500] left-2 bottom-16 max-w-[78%] rounded-lg bg-[#fffdf1]/95 border border-[#74917b] px-2 py-1 text-[10px] font-bold text-[#1b4935] pointer-events-none">{busStatus}</div>}
      {compact && <div className="wayvo-preview-tap absolute z-[500] right-3 top-14 pointer-events-none">Toca el mapa para ampliar ↗</div>}
      <div className="absolute z-[500] left-2 bottom-7 max-w-[65%] bg-[#fffdf1]/95 border border-[#b4c3ae] text-[#426046] px-2.5 py-1 rounded-lg text-[10px] font-semibold pointer-events-none">
        <MapPin size={11} className="inline mr-1" />Rutas ilustrativas, no oficiales
      </div>
    </div>
  );
}
