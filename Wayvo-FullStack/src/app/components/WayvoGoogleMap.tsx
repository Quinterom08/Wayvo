import React, {useEffect, useRef, useState} from 'react';
import {LocateFixed, MapPin, AlertCircle} from 'lucide-react';

// Approximate illustration coordinates, NOT official transport routes or live bus positions.
// They are deliberately separate from the SVG animation and must never be reported as live buses.
export const DEMO_PATHS = [
  {id:'302',color:'#2563EB',name:'Bello — Envigado',points:[[6.334,-75.558],[6.300,-75.560],[6.273,-75.566],[6.251,-75.569],[6.240,-75.572],[6.210,-75.573],[6.174,-75.591]]},
  {id:'306',color:'#D97706',name:'Laureles — Centro',points:[[6.245,-75.603],[6.250,-75.592],[6.255,-75.586],[6.250,-75.576],[6.245,-75.569]]},
  {id:'311',color:'#059669',name:'Belén — Robledo',points:[[6.223,-75.601],[6.236,-75.608],[6.255,-75.601],[6.269,-75.591],[6.282,-75.595]]},
  {id:'315',color:'#7C3AED',name:'La América — Itagüí',points:[[6.251,-75.613],[6.246,-75.591],[6.226,-75.576],[6.199,-75.579],[6.176,-75.597],[6.168,-75.614]]},
  {id:'301',color:'#DC2626',name:'Circular Norte',points:[[6.282,-75.563],[6.291,-75.556],[6.300,-75.562],[6.301,-75.578],[6.286,-75.580],[6.282,-75.563]]},
] as const;

const MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
let googleMapsPromise: Promise<any> | null = null;
function loadGoogleMaps(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Mapas no disponibles'));
  if ((window as any).google?.maps?.Map) return Promise.resolve((window as any).google.maps);
  if (googleMapsPromise) return googleMapsPromise;
  googleMapsPromise = new Promise((resolve,reject) => {
    const callbackName = '__wayvoGoogleMapsReady';
    const w = window as any;
    let script: HTMLScriptElement;
    const fail = () => { delete w[callbackName]; script?.remove(); googleMapsPromise=null; reject(new Error('No se pudo cargar Google Maps. Verifica tu clave, facturación y restricciones.')); };
    const timeout = window.setTimeout(fail, 14000);
    w[callbackName] = () => { window.clearTimeout(timeout); delete w[callbackName]; resolve(w.google.maps); };
    script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(MAPS_API_KEY)}&v=weekly&language=es&region=CO&loading=async&callback=${callbackName}`;
    script.async=true;
    script.onerror = () => {window.clearTimeout(timeout); fail();};
    document.head.appendChild(script);
  });
  return googleMapsPromise;
}

interface Props {
  activeRoute?: string|null;
  compact?: boolean;
  fallback: React.ReactNode;
}
export function WayvoGoogleMap({activeRoute=null,compact=false,fallback}:Props) {
  const el=useRef<HTMLDivElement>(null);
  const map=useRef<any>(null);
  const polylines=useRef<any[]>([]);
  const positionMarker=useRef<any>(null);
  const gpsRef=useRef<{lat:number;lng:number}|null>(null);
  const [error,setError]=useState('');
  const [locating,setLocating]=useState(false);
  const [foundPosition,setFoundPosition]=useState<{lat:number;lng:number}|null>(null);
  const hasKey=!!MAPS_API_KEY;

  useEffect(()=>{
    if (!hasKey || !el.current) return;
    let alive=true;
    loadGoogleMaps().then((gm:any)=>{
      if (!alive || !el.current) return;
      const instance = new gm.Map(el.current,{
        center:{lat:6.2486,lng:-75.5742},zoom:compact?11:12,
        disableDefaultUI:true, zoomControl:true, gestureHandling:'greedy',
        styles:[
          {featureType:'poi',elementType:'labels',stylers:[{visibility:'off'}]},
          {featureType:'road',elementType:'geometry',stylers:[{color:'#f6f1df'}]},
          {featureType:'water',elementType:'geometry',stylers:[{color:'#bfdbcd'}]},
          {featureType:'landscape',elementType:'geometry',stylers:[{color:'#e7eddf'}]},
        ],
      });
      map.current=instance;
      polylines.current=DEMO_PATHS.map(route=>new gm.Polyline({
        map:instance, path:route.points.map(([lat,lng])=>({lat,lng})),
        strokeColor:route.color,strokeOpacity:activeRoute && activeRoute!==route.id ? 0.2 : 0.88,
        strokeWeight:activeRoute===route.id?6:3,
      }));
      if(gpsRef.current) positionMarker.current=new gm.Marker({map:instance,position:gpsRef.current,title:'Tu ubicación GPS'});
    }).catch(e=>{if(alive)setError(e instanceof Error?e.message:'Error de Google Maps');});
    return ()=>{alive=false;polylines.current.forEach(line=>line.setMap(null));polylines.current=[];positionMarker.current?.setMap(null);positionMarker.current=null;map.current=null;};
    // Map instance should be created once per map mount.
  },[hasKey,compact]);

  useEffect(()=>{
    polylines.current.forEach((line,i)=>{
      const isChosen=activeRoute===DEMO_PATHS[i].id;
      line.setOptions({strokeOpacity:activeRoute&&!isChosen?.16:.9,strokeWeight:isChosen?6:3,zIndex:isChosen?10:1});
    });
  },[activeRoute]);

  const locate=()=>{
    if (!navigator.geolocation) {setError('Este dispositivo no tiene geolocalización disponible.');return;}
    setLocating(true);
    navigator.geolocation.getCurrentPosition(p=>{
      const pos={lat:p.coords.latitude,lng:p.coords.longitude};
      gpsRef.current=pos;setFoundPosition(pos);setLocating(false);setError('');
      if(map.current && (window as any).google?.maps) {
        positionMarker.current?.setMap(null);
        positionMarker.current=new (window as any).google.maps.Marker({map:map.current,position:pos,title:'Tu ubicación GPS'});
        map.current.panTo(pos);map.current.setZoom(15);
      }
    },()=>{setLocating(false);setError('No se pudo obtener tu GPS. Revisa el permiso de ubicación.');},{enableHighAccuracy:true,timeout:12000});
  };
  return <div className="wayvo-map-wrap relative w-full h-full overflow-hidden">
    {hasKey ? <div ref={el} className="absolute inset-0" role="application" aria-label="Mapa de Google Maps con rutas ilustrativas"/> : <div className="absolute inset-0">{fallback}</div>}
    <div className="absolute left-3 top-3 max-w-[72%] rounded-xl bg-[#fffdf1]/95 border border-[#74917b] px-3 py-2 text-[11px] font-extrabold text-[#1b4935] shadow-md pointer-events-none">
      {hasKey ? 'GOOGLE MAPS · DEMOSTRACIÓN' : 'MAPA SIMULADO · CONFIGURAR GOOGLE MAPS'}
    </div>
    {<button type="button" onClick={locate} disabled={locating} aria-label="Centrar en mi ubicación GPS" className="absolute top-3 right-3 bg-[#fffdf1] border-2 border-[#1b4935] rounded-xl p-2.5 text-[#1b4935] shadow-md disabled:opacity-60"><LocateFixed size={19}/></button>}
    {foundPosition && !hasKey && <div className="absolute top-14 right-2 left-2 bg-[#fffdf1] border border-[#1b4935] rounded-xl p-2 text-xs text-[#1b4935]">GPS: {foundPosition.lat.toFixed(5)}, {foundPosition.lng.toFixed(5)}. Configura Google Maps para centrarlo en el mapa.</div>}
    {error && <div role="alert" className="absolute left-2 right-2 bottom-10 bg-[#fff8db] border border-[#b57c45] rounded-xl p-2 flex items-start gap-2 text-xs text-[#663d20]"><AlertCircle size={16} className="shrink-0"/>{error}</div>}
    <div className="absolute bottom-2 left-2 bg-[#fffdf1]/90 text-[#426046] px-2.5 py-1 rounded-lg text-[10px] font-semibold pointer-events-none"><MapPin size={11} className="inline mr-1"/>Recorridos ficticios, sin GPS de buses en vivo</div>
  </div>;
}
