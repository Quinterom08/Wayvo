import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Bus, MapPin, Search, Bell, Home, Map, User, ChevronRight, ChevronLeft,
  Clock, ArrowRight, Info, AlertCircle, Settings, LogOut, X,
  Wallet, Loader2, Shield, Navigation2, CheckCircle,
  Plus, Eye, Trash2, Edit2, Navigation,
  Bookmark, Volume2, Moon, Globe, ChevronDown, Bot, LocateFixed,
} from "lucide-react";

// ─── TYPES ────────────────────────────────────────────────────────────────────

type Screen =
  | "home" | "routes" | "route-detail" | "vehicles"
  | "map" | "trips" | "fares" | "notifications"
  | "profile" | "admin" | "favorites" | "settings" | "assistant";

type TabId = "home" | "routes" | "map" | "trips" | "profile" | "admin";
type AuthRole = "client" | "worker";
type AuthMode = "login" | "register" | "forgot" | "sent";

interface AppUser { name: string; email: string; isAdmin: boolean }
interface StoredUser { name: string; email: string; password: string; role: AuthRole }

interface BusRoute {
  id: string; name: string; color: string;
  origin: string; destination: string;
  waypoints: [number, number][];
  stops: string[]; frequency: string; hours: string; buses: number;
}

interface Vehicle {
  id: string; empresa: string; ruta: string;
  estado: "En servicio" | "Fuera de servicio" | "Sin información";
}

interface Tarifa { id: string; servicio: string; costo: string; descripcion: string }

interface AppNotif {
  id: number; tipo: "alerta" | "info" | "tarifa";
  titulo: string; mensaje: string; fecha: string; leida: boolean;
}

// ─── STORAGE HELPERS ──────────────────────────────────────────────────────────

// On native devices the API must be deployed over HTTPS; localhost means the phone.
// A relative /api path is valid only for the web deployment behind a reverse proxy.
const isNativeApp = () => !!(window as any).Capacitor?.isNativePlatform?.();
const API_BASE = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");
const missingNativeApi = () => isNativeApp() && !/^https:\/\//.test(API_BASE);
const apiConnectionHelp = "No se pudo conectar al servidor de Wayvo. Para usarlo en web inicia también el backend (python backend/server.py). En Android/iOS configura VITE_API_URL=https://tu-servidor/api antes de compilar.";
let sessionToken = sessionStorage.getItem("wayvo_token") || "";
async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  if (missingNativeApi()) throw new Error("La app móvil no tiene un servidor configurado. Define VITE_API_URL con la dirección HTTPS de tu backend antes de compilar.");
  let res: Response;
  try { res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}), ...options.headers },
  });
  } catch (e) { throw new Error(e instanceof TypeError ? apiConnectionHelp : (e instanceof Error ? e.message : apiConnectionHelp)); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `El servidor devolvió un error (${res.status}).`);
  return data as T;
}
function setSession(token: string) { sessionToken = token; sessionStorage.setItem("wayvo_token", token); }
function clearSession() { sessionToken = ""; sessionStorage.removeItem("wayvo_token"); }

// ─── DATA ─────────────────────────────────────────────────────────────────────

const ROUTES: BusRoute[] = [
  {
    id: "302", name: "Bello — Envigado", color: "#2563EB",
    origin: "Terminal Norte, Bello", destination: "Envigado Centro",
    waypoints: [[440,65],[440,148],[440,235],[440,330],[440,420],[440,510],[440,568]],
    stops: ["Terminal Norte (Bello)","Niquía","Madera","Acevedo","Tricentenario","Universidad","Hospital","San Antonio","Alpujarra","Envigado Centro"],
    frequency: "8 min", hours: "5:00 — 23:00", buses: 24,
  },
  {
    id: "306", name: "Laureles — Centro", color: "#D97706",
    origin: "Laureles, Calle 33", destination: "San Antonio, Centro",
    waypoints: [[258,320],[318,318],[382,320],[436,328],[440,330]],
    stops: ["Laureles","La 80","Estadio","Suramericana","Exposiciones","San Antonio","Centro"],
    frequency: "12 min", hours: "5:30 — 22:30", buses: 14,
  },
  {
    id: "311", name: "Belén — Robledo", color: "#059669",
    origin: "Belén Centro", destination: "Robledo",
    waypoints: [[260,460],[298,394],[360,332],[395,285],[335,238],[272,205],[258,200]],
    stops: ["Belén Centro","La América","La 80","Estadio","San Javier","Floresta","Robledo"],
    frequency: "15 min", hours: "5:00 — 22:00", buses: 10,
  },
  {
    id: "315", name: "La América — Itagüí", color: "#7C3AED",
    origin: "La América, Cra 76", destination: "Itagüí Centro",
    waypoints: [[275,350],[360,355],[478,365],[585,385],[556,432],[498,490],[440,540],[400,572]],
    stops: ["La América","Suramericana","El Poblado","La Aguacatala","Sabaneta","Itagüí Norte","Itagüí Centro"],
    frequency: "10 min", hours: "5:00 — 23:00", buses: 18,
  },
  {
    id: "301", name: "Circular Norte", color: "#DC2626",
    origin: "Aranjuez", destination: "Aranjuez (circular)",
    waypoints: [[440,165],[502,143],[562,160],[588,210],[566,258],[503,272],[440,258],[415,210],[440,165]],
    stops: ["Aranjuez","Las Esmeraldas","La Cruz","Manrique","Villa del Socorro","Santa Cruz","Aranjuez"],
    frequency: "20 min", hours: "6:00 — 21:00", buses: 8,
  },
];

const BUS_DEFS = [
  {id:"b1",routeId:"302",phase:0.00,speed:0.022},{id:"b2",routeId:"302",phase:0.38,speed:0.022},
  {id:"b3",routeId:"302",phase:0.74,speed:0.022},{id:"b4",routeId:"306",phase:0.15,speed:0.036},
  {id:"b5",routeId:"306",phase:0.68,speed:0.036},{id:"b6",routeId:"311",phase:0.10,speed:0.019},
  {id:"b7",routeId:"311",phase:0.62,speed:0.019},{id:"b8",routeId:"315",phase:0.00,speed:0.025},
  {id:"b9",routeId:"315",phase:0.53,speed:0.025},{id:"b10",routeId:"301",phase:0.20,speed:0.030},
  {id:"b11",routeId:"301",phase:0.72,speed:0.030},
];

const VEHICLES: Vehicle[] = [
  {id:"MDE-302-01",empresa:"Trans-Bello Coop.",ruta:"302",estado:"En servicio"},
  {id:"MDE-302-02",empresa:"Trans-Bello Coop.",ruta:"302",estado:"En servicio"},
  {id:"MDE-302-03",empresa:"Trans-Bello Coop.",ruta:"302",estado:"En servicio"},
  {id:"MDE-306-01",empresa:"Autobuses del Valle",ruta:"306",estado:"En servicio"},
  {id:"MDE-306-02",empresa:"Autobuses del Valle",ruta:"306",estado:"Fuera de servicio"},
  {id:"MDE-311-01",empresa:"Coop. Belén-Robledo",ruta:"311",estado:"En servicio"},
  {id:"MDE-311-02",empresa:"Coop. Belén-Robledo",ruta:"311",estado:"Sin información"},
  {id:"MDE-315-01",empresa:"Autobuses del Valle",ruta:"315",estado:"En servicio"},
  {id:"MDE-315-02",empresa:"Autobuses del Valle",ruta:"315",estado:"En servicio"},
  {id:"MDE-301-01",empresa:"Coop. Norte",ruta:"301",estado:"En servicio"},
  {id:"MDE-301-02",empresa:"Coop. Norte",ruta:"301",estado:"Fuera de servicio"},
];

const TARIFAS: Tarifa[] = [
  {id:"t1",servicio:"Transporte urbano estándar",costo:"$2.950 COP*",descripcion:"Tarifa para buses del sistema integrado de transporte."},
  {id:"t2",servicio:"Integrada Metro + Bus",costo:"$4.200 COP*",descripcion:"Integración de metro y bus en puntos autorizados del SITVA."},
  {id:"t3",servicio:"Tarjeta Cívica (descuento)",costo:"$2.700 COP*",descripcion:"Tarifa preferencial con Tarjeta Cívica activa."},
  {id:"t4",servicio:"Adulto mayor",costo:"$1.475 COP*",descripcion:"50% de descuento para mayores de 60 años con carné."},
  {id:"t5",servicio:"Estudiante",costo:"$2.200 COP*",descripcion:"Descuento especial con carné estudiantil vigente."},
];

const NOTIFS_DATA: AppNotif[] = [
  {id:1,tipo:"alerta",titulo:"Desvío ruta 302",mensaje:"Desvío temporal por obras en Av. Colombia. Tiempo adicional estimado: ~10 min.",fecha:"Hoy, 9:30 am",leida:false},
  {id:2,tipo:"tarifa",titulo:"Revisión de tarifas",mensaje:"Revisión de tarifas programada para el próximo mes. Mantente informado.",fecha:"Ayer, 2:15 pm",leida:false},
  {id:3,tipo:"alerta",titulo:"Suspensión ruta 311",mensaje:"Sin servicio los domingos entre 8:00–12:00 por mantenimiento preventivo.",fecha:"Hace 2 días",leida:true},
  {id:4,tipo:"info",titulo:"Nuevos horarios ruta 301",mensaje:"Circular Norte ajusta horarios. Consulta la sección Rutas para más info.",fecha:"Hace 3 días",leida:true},
  {id:5,tipo:"info",titulo:"Bienvenido a MetroBus",mensaje:"Consulta rutas, tarifas y planifica tus viajes fácilmente.",fecha:"Hace 7 días",leida:true},
];

const ADMIN_STATS = [
  {label:"Usuarios",value:"1.284",icon:User},
  {label:"Empresas",value:"12",icon:Shield},
  {label:"Buses",value:"74",icon:Bus},
  {label:"Rutas",value:"5",icon:Navigation},
];

const ADMIN_SECTIONS = ["Usuarios","Empresas","Buses","Rutas","Paraderos","Tarifas","Reportes","Notificaciones"];

const NBHDS = [
  {label:"BELLO",x:440,y:38},{label:"ROBLEDO",x:258,y:186},
  {label:"ARANJUEZ",x:504,y:132},{label:"MANRIQUE",x:582,y:160},
  {label:"LAURELES",x:244,y:308},{label:"ESTADIO",x:345,y:290},
  {label:"CENTRO",x:468,y:318},{label:"EL POBLADO",x:610,y:376},
  {label:"BELÉN",x:252,y:445},{label:"ENVIGADO",x:465,y:553},
  {label:"ITAGÜÍ",x:392,y:594},{label:"SABANETA",x:538,y:556},
];

const SUGG = [
  "Bello, Terminal Norte","Belén Centro","Centro, Parque Berrío",
  "El Poblado, Av. El Poblado","Envigado Centro","Estadio, Calle 50",
  "Itagüí Centro","La América, Cra 76","Laureles, Calle 33",
  "Manrique, Calle 107","Robledo, Cra 80","Sabaneta Centro",
  "San Antonio, Centro","Universidad de Antioquia",
];

const FAVORITE_ROUTE_IDS = ["302", "311"];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function lerp(pts: [number,number][], t: number): [number,number] {
  const n = pts.length - 1;
  if (n <= 0) return pts[0];
  const sc = Math.max(0, Math.min(0.9999, t)) * n;
  const i = Math.floor(sc);
  const f = sc - i;
  return [pts[i][0]+(pts[i+1][0]-pts[i][0])*f, pts[i][1]+(pts[i+1][1]-pts[i][1])*f];
}

function toPath(pts: [number,number][]): string {
  return pts.map((p,i) => `${i===0?"M":"L"}${p[0]},${p[1]}`).join(" ");
}

// ─── UI ATOMS ─────────────────────────────────────────────────────────────────

function StatusBadge({estado}: {estado: Vehicle["estado"]}) {
  const cls = {
    "En servicio":"bg-green-100 text-green-700",
    "Fuera de servicio":"bg-red-100 text-red-700",
    "Sin información":"bg-gray-100 text-gray-500",
  }[estado];
  return <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${cls}`}>{estado}</span>;
}

function Chip({children, active, color, onClick}: {children: React.ReactNode; active?: boolean; color?: string; onClick?: ()=>void}) {
  return (
    <button onClick={onClick}
      className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors ${active ? "text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
      style={active && color ? {backgroundColor: color} : active ? {backgroundColor:"#171717"} : {}}>
      {children}
    </button>
  );
}

function SectionLabel({children}: {children: React.ReactNode}) {
  return <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">{children}</p>;
}

function Card({children, className=""}: {children: React.ReactNode; className?: string}) {
  return <div className={`bg-white rounded-2xl shadow-sm border border-black/[0.07] ${className}`}>{children}</div>;
}

// ─── MODAL ────────────────────────────────────────────────────────────────────

function Modal({title, onClose, children}: {title: string; onClose: () => void; children: React.ReactNode}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" style={{background:"rgba(0,0,0,0.45)"}}>
      <div className="w-full max-w-sm bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
            <X className="w-4 h-4 text-gray-600"/>
          </button>
        </div>
        <div className="px-5 pb-5 pt-4 max-h-[70vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function ModalField({label, value, onChange, type="text", placeholder=""}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div className="mb-3">
      <label className="text-xs font-semibold text-gray-400 block mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-gray-50 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500/20 border border-transparent focus:border-green-500/30 transition-all"/>
    </div>
  );
}

// ─── AUTH FIELD ───────────────────────────────────────────────────────────────

function AuthField({label, type, value, onChange, placeholder, onEnter}: {
  label: string; type: string; value: string;
  onChange: (v: string) => void; placeholder: string; onEnter?: () => void;
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-400 block mb-1.5">{label}</label>
      <input
        type={type} value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        onKeyDown={e => e.key === "Enter" && onEnter?.()}
        autoComplete={type === "password" ? "current-password" : type === "email" ? "email" : "off"}
        className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-green-500/25 border border-transparent focus:border-green-500/30 transition-all"
      />
    </div>
  );
}

// ─── AUTH LOGO (module-level para evitar remount en re-renders) ───────────────

function AuthLogo() {
  return (
    <div className="mb-8 text-center">
      {/* Carretera de lado a lado */}
      <div className="relative w-full overflow-hidden mb-5" style={{height:"52px"}}>
        {/* Asfalto */}
        <div className="absolute inset-y-2 inset-x-0 rounded-2xl overflow-hidden" style={{background:"#f3f4f6", border:"1px solid #e5e7eb"}}>
          {/* Rayas centrales sutiles estáticas */}
          <div className="absolute inset-0" style={{background: "repeating-linear-gradient(90deg, transparent 0px, transparent 14px, #d1d5db 14px, #d1d5db 26px)", height: "2px", top: "calc(50% - 1px)"}}/>
        </div>
        {/* Bus conduciendo de izquierda a derecha */}
        <div className="bus-drive">
          <Bus className="w-7 h-7" style={{color:"#4ade80"}} strokeWidth={2}/>
        </div>
      </div>
      <h1 className="text-2xl font-bold text-gray-900">Wayvo</h1>
      <p className="text-sm text-gray-400 mt-1">Transporte público en tus manos</p>
    </div>
  );
}

// ─── AUTH SCREEN ──────────────────────────────────────────────────────────────

function AuthScreen({onLogin}: {onLogin: (u: AppUser) => void}) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [pass, setPass]   = useState("");
  const [name, setName]   = useState("");
  const [cpass, setCpass] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr]     = useState("");
  const [success, setSuccess] = useState("");

  const clearForm = () => { setEmail(""); setPass(""); setName(""); setCpass(""); setErr(""); setSuccess(""); };

  const field = (label: string, type: string, value: string, onChange: (v: string) => void, ph: string, onEnter?: () => void) => (
    <AuthField
      label={label} type={type} value={value}
      onChange={v => { onChange(v); setErr(""); }}
      placeholder={ph} onEnter={onEnter}
    />
  );

  const doLogin = async () => {
    if (!email.trim() || !pass) { setErr("Completa todos los campos."); return; }
    setLoading(true); setErr("");
    try {
      const result = await api<{token: string; user: AppUser}>("/auth/login", {method:"POST",body:JSON.stringify({email:email.trim(),password:pass})});
      setSession(result.token); onLogin(result.user);
    } catch (e) { setErr(e instanceof Error ? e.message : "Error de conexión"); }
    finally { setLoading(false); }
  };

  const socialLogin = async (provider: "google" | "microsoft") => {
    setErr(""); setLoading(true);
    try {
      if (missingNativeApi()) throw new Error("Para usar Google o Microsoft en el teléfono primero configura VITE_API_URL con tu backend público HTTPS.");
      const status = await api<{ configured: boolean; error?: string }>(`/auth/oauth/${provider}/status`);
      if (!status.configured) throw new Error(status.error || `El acceso con ${provider} aún requiere configurar las credenciales OAuth en el servidor.`);
      const url = `${API_BASE}/auth/oauth/${provider}/start?mode=${isNativeApp() ? "mobile" : "web"}`;
      if (isNativeApp()) {
        const { Browser } = await import("@capacitor/browser");
        await Browser.open({ url });
      } else window.location.assign(url);
    } catch (e) { setErr(e instanceof Error ? e.message : "No se pudo iniciar el acceso social."); }
    finally { setLoading(false); }
  };

  const doRegister = async () => {
    if (!name.trim() || !email.trim() || !pass || !cpass) { setErr("Completa todos los campos."); return; }
    if (pass !== cpass) { setErr("Las contraseñas no coinciden."); return; }
    if (pass.length < 8) { setErr("La contraseña debe tener al menos 8 caracteres."); return; }
    setLoading(true); setErr("");
    try {
      await api("/auth/register",{method:"POST",body:JSON.stringify({name:name.trim(),email:email.trim(),password:pass})});
      setMode("login"); clearForm(); setSuccess("¡Cuenta creada! Ya puedes iniciar sesión.");
    } catch(e) { setErr(e instanceof Error ? e.message : "Error de conexión"); }
    finally { setLoading(false); }
  };

  const doForgot = async () => {
    if (!email.trim()) { setErr("Ingresa tu correo electrónico."); return; }
    setLoading(true); setErr("");
    try { await api("/auth/forgot",{method:"POST",body:JSON.stringify({email:email.trim()})}); setMode("sent"); }
    catch(e) { setErr(e instanceof Error ? e.message : "Error de conexión"); }
    finally { setLoading(false); }
  };

  const f = (label: string, type: string, value: string, set: (v: string) => void, ph: string, onEnter?: () => void) => (
    <AuthField label={label} type={type} value={value}
      onChange={v => { set(v); setErr(""); }} placeholder={ph} onEnter={onEnter}/>
  );

  if (mode === "login") return (
    <div className="wayvo-retro-auth min-h-screen flex flex-col items-center justify-center px-5 py-10">
      <div className="retro-orbit retro-orbit-one" aria-hidden="true"/><div className="retro-orbit retro-orbit-two" aria-hidden="true"/>
      <div className="retro-auth-inner"><div className="retro-kicker">● RUTA LIBRE · EDICIÓN 2026</div><AuthLogo/>
      <Card className="retro-auth-card w-full max-w-sm p-6">
        <div className="retro-auth-ticket">TU VIAJE EMPIEZA AQUÍ <span>↗</span></div>
        <h2 className="text-xl font-black text-gray-900 mb-1">¡Qué bueno verte!</h2>
        <p className="text-xs text-gray-500 mb-5">Entra a Wayvo y muévete a tu ritmo.</p>
        {success && <div className="bg-green-50 text-green-700 text-xs rounded-xl px-3 py-2.5 mb-4 flex items-start gap-2"><CheckCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"/>{success}</div>}
        {err && <div className="bg-red-50 text-red-600 text-xs rounded-xl px-3 py-2.5 mb-4 flex items-start gap-2"><AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"/>{err}</div>}
        <div className="space-y-3">
          {f("Correo electrónico", "email", email, setEmail, "correo@ejemplo.com")}
          {f("Contraseña", "password", pass, setPass, "••••••••", doLogin)}
          <button onClick={doLogin} disabled={loading}
            className="retro-primary w-full bg-green-700 hover:bg-green-800 text-white rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
            {loading && <Loader2 className="w-4 h-4 animate-spin"/>}Iniciar sesión
          </button>
        </div>
        <div className="flex items-center gap-2 my-4"><div className="flex-1 border-t border-gray-200"/><span className="text-xs text-gray-400">o continúa con</span><div className="flex-1 border-t border-gray-200"/></div>
        <div className="grid grid-cols-2 gap-2">
          <button disabled={loading} onClick={() => socialLogin("google")} className="retro-social border border-gray-200 bg-white rounded-xl py-3 text-sm font-semibold text-gray-700"><span className="retro-google-g">G</span> Google</button>
          <button disabled={loading} onClick={() => socialLogin("microsoft")} className="retro-social border border-gray-200 bg-white rounded-xl py-3 text-sm font-semibold text-gray-700"><span className="retro-ms-grid" aria-hidden="true"><i/><i/><i/><i/></span> Microsoft</button>
        </div>
        <button onClick={() => { setMode("forgot"); setErr(""); setEmail(""); }}
          className="w-full text-center text-xs text-green-700 mt-3 hover:underline font-medium py-1">
          ¿Olvidaste tu contraseña?
        </button>
      </Card>
      <p className="text-xs text-gray-400 mt-4">
        ¿No tienes cuenta?{" "}
        <button onClick={() => { setMode("register"); clearForm(); }}
          className="text-green-700 font-semibold hover:underline">
          Regístrate
        </button>
      </p>
      </div>
    </div>
  );

  if (mode === "register") return (
    <div className="wayvo-retro-auth min-h-screen flex flex-col items-center justify-center px-5 py-10">
      <div className="retro-orbit retro-orbit-one" aria-hidden="true"/><div className="retro-orbit retro-orbit-two" aria-hidden="true"/>
      <div className="retro-auth-inner"><div className="retro-kicker">● RUTA LIBRE · EDICIÓN 2026</div><AuthLogo/>
      <Card className="retro-auth-card w-full max-w-sm p-6">
        <div className="flex items-center gap-2 mb-5">
          <button onClick={() => { setMode("login"); setErr(""); }} className="w-8 h-8 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center hover:bg-gray-100">
            <ChevronLeft className="w-4 h-4 text-gray-600"/>
          </button>
          <h2 className="text-xl font-black text-gray-900">Súbete a Wayvo</h2>
        </div>
        {err && <div className="bg-red-50 text-red-600 text-xs rounded-xl px-3 py-2.5 mb-4 flex items-start gap-2"><AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"/>{err}</div>}
        <div className="space-y-3">
          {f("Nombre completo", "text", name, setName, "Tu nombre completo")}
          {f("Correo electrónico", "email", email, setEmail, "correo@ejemplo.com")}
          {f("Contraseña", "password", pass, setPass, "Mínimo 8 caracteres")}
          {f("Confirmar contraseña", "password", cpass, setCpass, "Repite la contraseña", doRegister)}
          <button onClick={doRegister} disabled={loading}
            className="retro-primary w-full bg-green-700 hover:bg-green-800 text-white rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
            {loading && <Loader2 className="w-4 h-4 animate-spin"/>}Crear cuenta
          </button>
        </div>
        <p className="text-xs text-gray-400 text-center mt-4">
          ¿Ya tienes cuenta?{" "}
          <button onClick={() => { setMode("login"); setErr(""); }}
            className="text-green-700 font-semibold hover:underline">
            Inicia sesión
          </button>
        </p>
      </Card>
      </div>
    </div>
  );

  if (mode === "forgot") return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-5 py-10">
      <AuthLogo/>
      <Card className="w-full max-w-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => { setMode("login"); setErr(""); }} className="w-8 h-8 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center hover:bg-gray-100">
            <ChevronLeft className="w-4 h-4 text-gray-600"/>
          </button>
          <h2 className="text-base font-bold text-gray-900">Recuperar contraseña</h2>
        </div>
        {err && <div className="bg-red-50 text-red-600 text-xs rounded-xl px-3 py-2.5 mb-4 flex items-start gap-2"><AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"/>{err}</div>}
        <p className="text-sm text-gray-500 mb-5 leading-relaxed">Ingresa el correo de tu cuenta y te enviaremos un enlace para restablecer tu contraseña.</p>
        {f("Correo electrónico", "email", email, setEmail, "correo@ejemplo.com", doForgot)}
        <button onClick={doForgot} disabled={loading}
          className="w-full bg-green-700 hover:bg-green-800 text-white rounded-xl py-3 mt-4 text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
          {loading && <Loader2 className="w-4 h-4 animate-spin"/>}Enviar enlace
        </button>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-5 py-10">
      <AuthLogo/>
      <Card className="w-full max-w-sm p-6 text-center">
        <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" strokeWidth={1.5}/>
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">¡Correo enviado!</h2>
        <p className="text-sm text-gray-500 leading-relaxed mb-2">Hemos enviado un enlace de recuperación a:</p>
        <p className="text-sm font-bold text-gray-800 bg-gray-50 rounded-xl px-4 py-2.5 mb-5 break-all">{email}</p>
        <button onClick={() => { setMode("login"); setEmail(""); setErr(""); }}
          className="w-full bg-green-700 hover:bg-green-800 text-white rounded-xl py-3 text-sm font-bold transition-colors">
          Volver al inicio de sesión
        </button>
      </Card>
    </div>
  );
}

// ─── TRANSIT MAP SVG (overlay routes, no background) ─────────────────────────

type BusPos = {id:string; routeId:string; x:number; y:number};

function RoutesOverlay({activeRoute, busPositions, onBusClick, compact=false}: {
  activeRoute: string|null;
  busPositions: BusPos[];
  onBusClick?: (id: string) => void;
  compact?: boolean;
}) {
  const [hov, setHov] = useState<string|null>(null);
  const hovBus = busPositions.find(b => b.id === hov);
  const hovRoute = hovBus ? ROUTES.find(r => r.id === hovBus.routeId) : null;

  return (
    <svg viewBox="0 0 900 680" className="w-full h-full absolute inset-0 pointer-events-none" style={{zIndex:5}}>
      {ROUTES.map(r => {
        const isActive = activeRoute === r.id;
        const dimmed = activeRoute !== null && !isActive;
        return <path key={r.id} d={toPath(r.waypoints)} fill="none" stroke={r.color}
          strokeWidth={isActive ? 6 : 3} strokeLinecap="round" strokeLinejoin="round"
          opacity={dimmed ? 0.10 : isActive ? 1 : 0.7} style={{transition:"opacity 0.3s"}}/>;
      })}
      {activeRoute && ROUTES.find(r => r.id === activeRoute)?.waypoints.map((pt, i) => {
        const rc = ROUTES.find(r => r.id === activeRoute)!;
        return <circle key={i} cx={pt[0]} cy={pt[1]} r={4} fill="white" stroke={rc.color} strokeWidth={2} opacity={0.9}/>;
      })}
      {busPositions.map(bus => {
        const route = ROUTES.find(r => r.id === bus.routeId);
        if (!route) return null;
        if (activeRoute !== null && activeRoute !== bus.routeId) return null;
        const isHov = hov === bus.id;
        return (
          <g key={bus.id} transform={`translate(${bus.x},${bus.y})`}
            style={{cursor: onBusClick ? "pointer" : "default", pointerEvents:"all"}}
            onClick={() => onBusClick?.(bus.routeId)}
            onMouseEnter={() => setHov(bus.id)} onMouseLeave={() => setHov(null)}>
            {isHov && <circle r={14} fill={route.color} opacity={0.22}/>}
            <circle r={isHov ? 10 : compact ? 5 : 8} fill={route.color} stroke="white" strokeWidth={2} style={{transition:"r 0.12s"}}/>
            {!compact && <text textAnchor="middle" dy="4" fontSize="6" fontWeight="700" fill="white"
              style={{fontFamily:"'Space Mono',monospace",pointerEvents:"none"}}>{bus.routeId}</text>}
          </g>
        );
      })}
      {!compact && hovBus && hovRoute && (() => {
        const tx = hovBus.x > 780 ? hovBus.x - 116 : hovBus.x + 14;
        const ty = hovBus.y < 50 ? hovBus.y + 14 : hovBus.y - 26;
        return <g style={{pointerEvents:"none"}}>
          <rect x={tx} y={ty} width={108} height={22} rx={4} fill="white" stroke={hovRoute.color} strokeWidth={1} opacity={0.97}/>
          <text x={tx+54} y={ty+14} textAnchor="middle" fontSize="8" fontWeight="500" fill="#171717"
            style={{fontFamily:"'DM Sans',sans-serif"}}>{hovRoute.name}</text>
        </g>;
      })()}
    </svg>
  );
}

// ─── MINI MAP (home screen, SVG-based) ───────────────────────────────────────

function MiniTransitMap({busPositions}: {busPositions: BusPos[]}) {
  const hLines = [110,170,230,290,350,410,470,530,590,645];
  const vLines = [270,330,390,440,510,570,630,678];
  return (
    <svg viewBox="0 0 900 680" className="w-full h-full" style={{background:"#EAE6DC"}}>
      <polygon points="0,680 0,130 42,108 78,85 112,68 142,78 165,58 182,75 196,55 208,74 214,98 218,130 220,680" fill="#D5D0C4"/>
      <polygon points="900,680 900,130 858,108 822,85 788,68 758,78 735,58 718,75 704,55 692,74 686,98 682,130 680,680" fill="#D5D0C4"/>
      {hLines.map(y => <line key={`h${y}`} x1="220" y1={y} x2="680" y2={y} stroke="#C5C0B2" strokeWidth="0.35"/>)}
      {vLines.map(x => <line key={`v${x}`} x1={x} y1="80" x2={x} y2="652" stroke="#C5C0B2" strokeWidth="0.35"/>)}
      <line x1="220" y1="330" x2="680" y2="330" stroke="#B8B3A5" strokeWidth="1.1"/>
      <line x1="440" y1="80" x2="440" y2="652" stroke="#B8B3A5" strokeWidth="1.1"/>
      {ROUTES.map(r => (
        <path key={r.id} d={toPath(r.waypoints)} fill="none" stroke={r.color}
          strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.62}/>
      ))}
      {busPositions.map(bus => {
        const route = ROUTES.find(r => r.id === bus.routeId);
        if (!route) return null;
        return (
          <circle key={bus.id} cx={bus.x} cy={bus.y} r={5} fill={route.color} stroke="white" strokeWidth={1.5}/>
        );
      })}
      <g transform="translate(440,330)">
        <circle r={9} fill="#2E7D32" opacity={0.18}/>
        <circle r={5} fill="#2E7D32" stroke="white" strokeWidth={2}/>
      </g>
    </svg>
  );
}

// ─── MAP SCREEN ───────────────────────────────────────────────────────────────

function MapScreen({busPositions, activeRoute, onRouteChange}: {
  busPositions: BusPos[];
  activeRoute: string|null;
  onRouteChange: (id: string|null) => void;
}) {
  const activeRouteData = ROUTES.find(r => r.id === activeRoute);
  const activeBusCount = busPositions.filter(b => activeRoute ? b.routeId === activeRoute : true).length;
  const hLines = [110,170,230,290,350,410,470,530,590,645];
  const vLines = [270,330,390,440,510,570,630,678];

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* Fondo SVG estático — dibujo de la ciudad */}
      <svg viewBox="0 0 900 680" className="absolute inset-0 w-full h-full" style={{background:"#EAE6DC", zIndex:1}}>
        {/* Montañas laterales */}
        <polygon points="0,680 0,130 42,108 78,85 112,68 142,78 165,58 182,75 196,55 208,74 214,98 218,130 220,680" fill="#D5D0C4"/>
        <polygon points="900,680 900,130 858,108 822,85 788,68 758,78 735,58 718,75 704,55 692,74 686,98 682,130 680,680" fill="#D5D0C4"/>
        {/* Cuadrícula de manzanas */}
        {hLines.map(y => <line key={`h${y}`} x1="220" y1={y} x2="680" y2={y} stroke="#C5C0B2" strokeWidth="0.5"/>)}
        {vLines.map(x => <line key={`v${x}`} x1={x} y1="80" x2={x} y2="652" stroke="#C5C0B2" strokeWidth="0.5"/>)}
        {/* Ejes principales */}
        <line x1="220" y1="330" x2="680" y2="330" stroke="#B0AB9C" strokeWidth="2"/>
        <line x1="440" y1="80" x2="440" y2="652" stroke="#B0AB9C" strokeWidth="2"/>
        {/* Etiquetas de barrios */}
        {NBHDS.map(n => (
          <text key={n.label} x={n.x} y={n.y} textAnchor="middle" fontSize="9" fontWeight="600"
            fill="#8C8779" style={{fontFamily:"'DM Sans',sans-serif",letterSpacing:"0.06em"}}
            opacity={0.75}>{n.label}</text>
        ))}
        {/* Rutas dibujadas */}
        {ROUTES.map(r => {
          const dimmed = activeRoute !== null && activeRoute !== r.id;
          return <path key={r.id} d={toPath(r.waypoints)} fill="none" stroke={r.color}
            strokeWidth={activeRoute === r.id ? 5 : 3}
            strokeLinecap="round" strokeLinejoin="round"
            opacity={dimmed ? 0.12 : activeRoute === r.id ? 1 : 0.65}
            style={{transition:"opacity 0.3s,stroke-width 0.3s"}}/>;
        })}
        {/* Paradas de ruta activa */}
        {activeRoute && ROUTES.find(r => r.id === activeRoute)?.waypoints.map((pt, i) => {
          const rc = ROUTES.find(r => r.id === activeRoute)!;
          return <circle key={i} cx={pt[0]} cy={pt[1]} r={4} fill="white" stroke={rc.color} strokeWidth={2} opacity={0.9}/>;
        })}
        {/* Buses animados */}
        {busPositions.map(bus => {
          const route = ROUTES.find(r => r.id === bus.routeId);
          if (!route) return null;
          if (activeRoute !== null && activeRoute !== bus.routeId) return null;
          return (
            <g key={bus.id} transform={`translate(${bus.x},${bus.y})`}
              style={{cursor:"pointer"}}
              onClick={() => onRouteChange(activeRoute === bus.routeId ? null : bus.routeId)}>
              <circle r={9} fill={route.color} stroke="white" strokeWidth={2}/>
              <text textAnchor="middle" dy="4" fontSize="6" fontWeight="700" fill="white"
                style={{fontFamily:"'Space Mono',monospace",pointerEvents:"none"}}>{bus.routeId}</text>
            </g>
          );
        })}
        {/* Punto de ubicación central */}
        <g transform="translate(440,330)">
          <circle r={11} fill="#2E7D32" opacity={0.15}/>
          <circle r={6} fill="#2E7D32" stroke="white" strokeWidth={2.5}/>
        </g>
      </svg>

      {/* Search bar overlay */}
      <div className="absolute top-3 left-3 right-3 flex items-center gap-2" style={{zIndex:20}}>
        <div className="flex-1 flex items-center gap-2 bg-white/95 border border-gray-200 rounded-2xl px-4 py-2.5 shadow-md">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0"/>
          <span className="text-sm text-gray-400">
            {activeRouteData ? `Ruta ${activeRouteData.id} — ${activeRouteData.name}` : "Buscar en el mapa..."}
          </span>
        </div>
        <button onClick={() => onRouteChange(null)}
          className="w-10 h-10 bg-green-700 rounded-2xl flex items-center justify-center shadow-md flex-shrink-0"
          style={{zIndex:20}}>
          <Navigation2 className="w-5 h-5 text-white" strokeWidth={1.5}/>
        </button>
      </div>

      {/* Active buses badge */}
      {activeRouteData && (
        <div className="absolute top-16 left-3 flex items-center gap-2 bg-white rounded-xl px-3 py-2 shadow-md border border-gray-100" style={{zIndex:20}}>
          <div className="w-2 h-2 rounded-full" style={{backgroundColor: activeRouteData.color}}/>
          <span className="text-xs font-semibold text-gray-700">{activeBusCount} buses en ruta</span>
        </div>
      )}

      {/* Route chips */}
      <div className="absolute bottom-3 left-3 right-3" style={{zIndex:20}}>
        <Card className="p-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Filtrar ruta</p>
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            <Chip active={activeRoute === null} onClick={() => onRouteChange(null)}>Todas</Chip>
            {ROUTES.map(r => (
              <Chip key={r.id} active={activeRoute === r.id} color={r.color}
                onClick={() => onRouteChange(activeRoute === r.id ? null : r.id)}>
                {r.id}
              </Chip>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── HOME SCREEN ──────────────────────────────────────────────────────────────

function AssistantScreen({onBack}: {onBack: () => void}) {
  const [origin,setOrigin]=useState("");
  const [destination,setDestination]=useState("");
  const [location,setLocation]=useState<{latitude:number;longitude:number}|undefined>();
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  const [routes,setRoutes]=useState<Array<{nombre:string;origen:string;destino:string;paraderos:string}>>([]);
  const [error,setError]=useState("");
  const useLocation=() => {
    setError("");
    navigator.geolocation.getCurrentPosition(p=>{
      setLocation({latitude:p.coords.latitude,longitude:p.coords.longitude});
      setOrigin("Mi ubicación");
    },()=>setError("No se pudo acceder al GPS. Revisa los permisos de ubicación."),{enableHighAccuracy:true,timeout:12000});
  };
  const ask=async () => {
    setLoading(true);setError("");setMessage("");setRoutes([]);
    try {
      const result=await api<{answer:string;routes:typeof routes}>("/assistant/routes",{method:"POST",body:JSON.stringify({origin,destination,location})});
      setMessage(result.answer);setRoutes(result.routes||[]);
    } catch(e) {setError(e instanceof Error?e.message:"Error de conexión");}
    finally {setLoading(false);}
  };
  return <div className="flex-1 overflow-y-auto bg-gray-50 p-5">
    <div className="flex items-center gap-3 mb-6"><button onClick={onBack} aria-label="Volver"><ChevronLeft/></button><Bot className="text-green-700"/><h1 className="font-bold text-xl">Asistente de rutas</h1></div>
    <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-3 shadow-sm">
      <p className="text-sm text-gray-600">Dime desde dónde sales y adónde quieres llegar. Consultaré las rutas verificadas por Wayvo.</p>
      <label className="block text-xs font-bold text-gray-700">Origen</label>
      <div className="flex gap-2"><input aria-label="Origen" value={origin} onChange={e=>{setOrigin(e.target.value);setLocation(undefined);}} placeholder="Barrio, paradero o dirección" className="border rounded-xl p-3 text-sm min-w-0 flex-1"/><button onClick={useLocation} title="Usar ubicación actual" aria-label="Usar ubicación actual" className="border rounded-xl px-3 text-green-700"><LocateFixed size={18}/></button></div>
      <label className="block text-xs font-bold text-gray-700">Destino</label>
      <input aria-label="Destino" value={destination} onChange={e=>setDestination(e.target.value)} placeholder="¿A dónde quieres ir?" className="w-full border rounded-xl p-3 text-sm"/>
      <button onClick={ask} disabled={loading || !origin.trim() || !destination.trim()} className="w-full rounded-xl bg-green-700 text-white font-bold py-3 disabled:opacity-50">{loading?"Consultando rutas...":"Preguntar a Wayvo"}</button>
    </div>
    {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
    {message && <div aria-live="polite" className="bg-white rounded-2xl p-4 mt-4 border border-gray-100"><p className="text-sm text-gray-800 whitespace-pre-wrap">{message}</p>{routes.map((r,i)=><div key={i} className="border-t mt-3 pt-3 text-xs text-gray-700"><strong>{r.nombre}</strong><div>{r.origen} → {r.destino}</div></div>)}</div>}
    <p className="text-xs text-gray-500 mt-5">Las sugerencias dependen de las rutas registradas; no representan datos en vivo. Verifica horarios y paraderos antes de viajar. El GPS requiere permisos y datos geográficos para resolver paraderos cercanos.</p>
  </div>;
}

function HomeScreen({user, busPositions, unread, onNavigate}: {
  user: AppUser; busPositions: BusPos[]; unread: number;
  onNavigate: (s: Screen|TabId) => void;
}) {
  const [search, setSearch] = useState("");
  const quickActions = [
    {icon: Bot, label:"Preguntar a IA", dest:"assistant", bg:"bg-green-50", fg:"text-green-700"},
    {icon: Navigation, label:"Rutas y líneas",   dest:"routes",    bg:"bg-blue-50",   fg:"text-blue-600"},
    {icon: MapPin,     label:"Ubicación buses",  dest:"map",       bg:"bg-green-50",  fg:"text-green-600"},
    {icon: Wallet,     label:"Tarifas",          dest:"fares",     bg:"bg-amber-50",  fg:"text-amber-600"},
    {icon: Bookmark,   label:"Mis favoritos",    dest:"favorites", bg:"bg-purple-50", fg:"text-purple-600"},
  ] as const;
  const alerts = NOTIFS_DATA.filter(n => !n.leida).slice(0, 2);

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="flex items-center justify-between px-4 pt-5 pb-2">
        <div>
          <p className="text-xs text-gray-400 font-medium">Bienvenido de nuevo</p>
          <h1 className="text-xl font-bold text-gray-900 mt-0.5">{user.name} 👋</h1>
        </div>
        <button onClick={() => onNavigate("notifications")}
          className="relative w-10 h-10 rounded-full bg-white border border-gray-100 shadow-sm flex items-center justify-center">
          <Bell className="w-5 h-5 text-gray-600" strokeWidth={1.5}/>
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 rounded-full text-[10px] text-white font-bold flex items-center justify-center px-1">
              {unread}
            </span>
          )}
        </button>
      </div>

      <div className="px-4 mt-3 mb-4">
        <div className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3 border border-gray-100 shadow-sm">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && search.trim() && onNavigate("trips")}
            placeholder="Buscar ruta, línea o destino..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"/>
          {search && <button onClick={() => setSearch("")}><X className="w-4 h-4 text-gray-400"/></button>}
        </div>
      </div>

      <div className="px-4 mb-5">
        <button onClick={() => onNavigate("trips")}
          className="w-full bg-green-700 text-white rounded-2xl py-4 px-5 flex items-center justify-between hover:bg-green-800 transition-colors shadow-md shadow-green-900/20">
          <div>
            <p className="text-base font-bold">Planificar viaje</p>
            <p className="text-white/70 text-xs mt-0.5">¿A dónde vas hoy?</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
            <ArrowRight className="w-5 h-5 text-white"/>
          </div>
        </button>
      </div>

      <div className="px-4 mb-5">
        <SectionLabel>Acceso rápido</SectionLabel>
        <div className="grid grid-cols-2 gap-2.5">
          {quickActions.map(q => (
            <button key={q.label} onClick={() => onNavigate(q.dest as Screen)}
              className="bg-white rounded-2xl p-4 flex flex-col items-start gap-2.5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow text-left">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${q.bg}`}>
                <q.icon className={`w-5 h-5 ${q.fg}`} strokeWidth={1.5}/>
              </div>
              <span className="text-sm font-semibold text-gray-800 leading-tight">{q.label}</span>
            </button>
          ))}
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="px-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>Información importante</SectionLabel>
            <button onClick={() => onNavigate("notifications")} className="text-xs text-green-700 font-semibold -mt-3">Ver todas →</button>
          </div>
          <div className="space-y-2.5">
            {alerts.map(a => (
              <Card key={a.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${a.tipo==="alerta"?"bg-red-50":"bg-blue-50"}`}>
                    {a.tipo === "alerta" ? <AlertCircle className="w-4 h-4 text-red-500"/> : <Info className="w-4 h-4 text-blue-500"/>}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{a.titulo}</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{a.mensaje}</p>
                    <p className="text-[11px] text-gray-400 mt-1.5">{a.fecha}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="px-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <SectionLabel>Buses en tiempo real</SectionLabel>
          <button onClick={() => onNavigate("map")} className="text-xs text-green-700 font-semibold -mt-3">Ver mapa →</button>
        </div>
        <div className="relative rounded-2xl overflow-hidden border border-gray-100 shadow-sm" style={{height:180}}>
          <MiniTransitMap busPositions={busPositions}/>
          <div className="absolute top-2 left-2 bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-semibold px-2.5 py-1 rounded-lg">
            ⚠ Datos simulados
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ROUTES SCREEN ────────────────────────────────────────────────────────────

function RoutesScreen({onSelect, onBack, selected, onViewMap}: {
  onSelect: (r: BusRoute) => void; onBack: () => void;
  selected: BusRoute|null; onViewMap: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = ROUTES.filter(r => r.name.toLowerCase().includes(q.toLowerCase()) || r.id.includes(q));

  if (selected) return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="flex items-center gap-3 bg-white px-4 pt-5 pb-4 border-b border-gray-100">
        <button onClick={onBack} className="w-9 h-9 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center">
          <ChevronLeft className="w-5 h-5 text-gray-600"/>
        </button>
        <span className="text-xs font-bold px-2.5 py-1 rounded-lg text-white" style={{backgroundColor:selected.color}}>{selected.id}</span>
        <h2 className="text-base font-bold text-gray-900 truncate">{selected.name}</h2>
      </div>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-2.5">
          {[
            {icon:MapPin, label:"Origen", val:selected.origin},
            {icon:Navigation2, label:"Destino", val:selected.destination},
            {icon:Clock, label:"Frecuencia", val:selected.frequency},
            {icon:Bus, label:"Buses activos", val:`${selected.buses} unidades`},
          ].map(item => (
            <Card key={item.label} className="p-3.5">
              <item.icon className="w-4 h-4 text-green-700 mb-1.5" strokeWidth={1.5}/>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">{item.label}</p>
              <p className="text-sm font-semibold text-gray-900 leading-tight mt-0.5">{item.val}</p>
            </Card>
          ))}
        </div>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-gray-400" strokeWidth={1.5}/>
            <p className="text-xs text-gray-400">Horario de operación</p>
          </div>
          <p className="text-sm font-semibold text-gray-900">{selected.hours}</p>
        </Card>
        <div>
          <SectionLabel>Recorrido y paraderos</SectionLabel>
          <Card className="overflow-hidden divide-y divide-gray-50">
            {selected.stops.map((stop, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="flex flex-col items-center gap-0.5">
                  <div className={`w-3 h-3 rounded-full border-2 ${i===0||i===selected.stops.length-1?"border-green-600 bg-green-600":"border-gray-300 bg-white"}`}/>
                  {i < selected.stops.length-1 && <div className="w-0.5 h-5 bg-gray-100"/>}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{stop}</p>
                  {(i===0||i===selected.stops.length-1) && <p className="text-[10px] text-green-600 font-semibold">{i===0?"Origen":"Destino"}</p>}
                </div>
              </div>
            ))}
          </Card>
        </div>
        <div>
          <SectionLabel>Vehículos en esta ruta</SectionLabel>
          <div className="space-y-2">
            {VEHICLES.filter(v => v.ruta === selected.id).map(v => (
              <Card key={v.id} className="flex items-center justify-between p-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center">
                    <Bus className="w-4 h-4 text-gray-500" strokeWidth={1.5}/>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-900" style={{fontFamily:"'Space Mono',monospace"}}>{v.id}</p>
                    <p className="text-[11px] text-gray-400">{v.empresa}</p>
                  </div>
                </div>
                <StatusBadge estado={v.estado}/>
              </Card>
            ))}
          </div>
        </div>
        <button onClick={() => onViewMap(selected.id)}
          className="w-full bg-green-700 text-white rounded-2xl py-3.5 font-bold flex items-center justify-center gap-2 hover:bg-green-800 transition-colors shadow-md shadow-green-900/15">
          <MapPin className="w-4 h-4"/>Ver en el mapa
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="bg-white px-4 pt-5 pb-4 border-b border-gray-100">
        <h2 className="text-xl font-bold text-gray-900 mb-3">Rutas y Líneas</h2>
        <div className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3 border border-gray-200">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0"/>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por número o nombre..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"/>
          {q && <button onClick={() => setQ("")}><X className="w-4 h-4 text-gray-400"/></button>}
        </div>
      </div>
      <div className="p-4 space-y-2.5 pb-6">
        {filtered.map(r => (
          <button key={r.id} onClick={() => onSelect(r)}
            className="w-full bg-white border border-gray-100 rounded-2xl p-4 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow text-left">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
              style={{backgroundColor:r.color, fontFamily:"'Space Mono',monospace"}}>{r.id}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900">{r.name}</p>
              <p className="text-xs text-gray-400 mt-0.5 truncate">{r.origin} → {r.destination}</p>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-[11px] text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3"/>Cada {r.frequency}</span>
                <span className="text-[11px] text-gray-400">{r.buses} buses</span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0"/>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-14">
            <Bus className="w-10 h-10 text-gray-200 mx-auto mb-3" strokeWidth={1}/>
            <p className="text-sm text-gray-400">Sin resultados para "{q}"</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TRIPS SCREEN ─────────────────────────────────────────────────────────────

function TripsScreen({onViewRoute}: {onViewRoute: (id: string) => void}) {
  const [origin, setOrigin] = useState(""); const [dest, setDest] = useState("");
  const [loading, setLoading] = useState(false); const [results, setResults] = useState(false);
  const [focusO, setFocusO] = useState(false); const [focusD, setFocusD] = useState(false);

  const oSugg = focusO && origin.length > 0 ? SUGG.filter(s => s.toLowerCase().includes(origin.toLowerCase())).slice(0,4) : [];
  const dSugg = focusD && dest.length > 0 ? SUGG.filter(s => s.toLowerCase().includes(dest.toLowerCase())).slice(0,4) : [];
  const search = () => { if (!origin.trim() || !dest.trim()) return; setLoading(true); setTimeout(() => { setLoading(false); setResults(true); }, 650); };

  const tripOpts = [
    {label:"⭐ Recomendada",linea:"306 → 302",tipo:"Conexión",tiempo:"42 min",costo:"$5.900",paradas:14,routeId:"306"},
    {label:"Alternativa",linea:"311 → 302",tipo:"Conexión",tiempo:"58 min",costo:"$5.900",paradas:20,routeId:"311"},
    {label:"Directa",linea:"315",tipo:"Directo",tiempo:"65 min",costo:"$2.950",paradas:7,routeId:"315"},
  ];

  const SuggList = ({items, onPick}: {items:string[];onPick:(s:string)=>void}) =>
    items.length > 0 ? (
      <div className="absolute inset-x-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30 overflow-hidden">
        {items.map(s => (
          <button key={s} onMouseDown={() => onPick(s)} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2">
            <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0"/>{s}
          </button>
        ))}
      </div>
    ) : null;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="bg-white px-4 pt-5 pb-5 border-b border-gray-100">
        <h2 className="text-xl font-bold text-gray-900 mb-1">¿A dónde quieres ir?</h2>
        <p className="text-sm text-gray-400 mb-5">Planifica tu viaje en transporte público</p>
        <Card className="p-4 space-y-3">
          <div className="relative">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Origen</label>
            <div className="flex items-center gap-2.5 bg-gray-50 rounded-xl px-3.5 py-3 border border-transparent focus-within:border-green-500/40 focus-within:ring-2 focus-within:ring-green-500/15 transition-all">
              <div className="w-2.5 h-2.5 rounded-full bg-green-600 flex-shrink-0"/>
              <input value={origin} onChange={e=>{setOrigin(e.target.value);setResults(false);}}
                onFocus={()=>setFocusO(true)} onBlur={()=>setTimeout(()=>setFocusO(false),150)}
                placeholder="Desde dónde partes..." className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"/>
              {origin && <button onClick={()=>{setOrigin("");setResults(false);}}><X className="w-3.5 h-3.5 text-gray-400"/></button>}
            </div>
            <SuggList items={oSugg} onPick={s=>{setOrigin(s);setFocusO(false);}}/>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 border-t border-dashed border-gray-200"/>
            <button onClick={()=>{const t=origin;setOrigin(dest);setDest(t);setResults(false);}}
              className="w-7 h-7 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center hover:bg-gray-100">
              <ArrowRight className="w-3.5 h-3.5 text-gray-400"/>
            </button>
            <div className="flex-1 border-t border-dashed border-gray-200"/>
          </div>
          <div className="relative">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Destino</label>
            <div className="flex items-center gap-2.5 bg-gray-50 rounded-xl px-3.5 py-3 border border-transparent focus-within:border-green-500/40 focus-within:ring-2 focus-within:ring-green-500/15 transition-all">
              <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0"/>
              <input value={dest} onChange={e=>{setDest(e.target.value);setResults(false);}}
                onFocus={()=>setFocusD(true)} onBlur={()=>setTimeout(()=>setFocusD(false),150)}
                onKeyDown={e=>e.key==="Enter"&&search()}
                placeholder="¿A dónde vas?" className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"/>
              {dest && <button onClick={()=>{setDest("");setResults(false);}}><X className="w-3.5 h-3.5 text-gray-400"/></button>}
            </div>
            <SuggList items={dSugg} onPick={s=>{setDest(s);setFocusD(false);}}/>
          </div>
          <button onClick={search} disabled={!origin.trim()||!dest.trim()||loading}
            className="w-full bg-green-700 text-white rounded-xl py-3.5 text-sm font-bold flex items-center justify-center gap-2 hover:bg-green-800 transition-colors disabled:opacity-40">
            {loading?<Loader2 className="w-4 h-4 animate-spin"/>:<Search className="w-4 h-4"/>}Buscar rutas
          </button>
        </Card>
      </div>
      {results && (
        <div className="p-4 pb-6">
          <SectionLabel>{tripOpts.length} opciones encontradas</SectionLabel>
          <div className="space-y-3">
            {tripOpts.map((opt,i) => (
              <Card key={i} className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${i===0?"bg-green-100 text-green-700":"bg-gray-100 text-gray-500"}`}>{opt.label}</span>
                    <p className="text-sm font-bold text-gray-900 mt-1.5">Línea {opt.linea}</p>
                    <p className="text-xs text-gray-400">{opt.tipo}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-gray-900">{opt.tiempo}</p>
                    <p className="text-xs text-gray-400">{opt.costo} est.*</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 mb-3.5 text-xs text-gray-400">
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/>{opt.paradas} paradas</span>
                  <span className="flex items-center gap-1"><Wallet className="w-3 h-3"/>Costo estimado</span>
                </div>
                <button onClick={()=>onViewRoute(opt.routeId)}
                  className="w-full border-2 border-green-700 text-green-700 rounded-xl py-2.5 text-sm font-bold hover:bg-green-700 hover:text-white transition-colors">
                  Ver recorrido en mapa
                </button>
              </Card>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 text-center mt-3">* Tiempos y costos son estimados de demostración</p>
        </div>
      )}
    </div>
  );
}

// ─── FARES SCREEN ─────────────────────────────────────────────────────────────

function FaresScreen({onBack}: {onBack: () => void}) {
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="flex items-center gap-3 bg-white px-4 pt-5 pb-4 border-b border-gray-100">
        <button onClick={onBack} className="w-9 h-9 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center"><ChevronLeft className="w-5 h-5 text-gray-600"/></button>
        <h2 className="text-lg font-bold text-gray-900">Tarifas</h2>
      </div>
      <div className="p-4">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 mb-5 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5"/>
          <p className="text-xs text-amber-700 leading-relaxed"><span className="font-bold">Datos de demostración.</span> Los valores marcados con * son referenciales.</p>
        </div>
        <SectionLabel>Transporte público</SectionLabel>
        <div className="space-y-2.5 mb-4">
          {TARIFAS.map(t => (
            <Card key={t.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-900">{t.servicio}</p>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">{t.descripcion}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-base font-bold text-green-700">{t.costo}</p>
                  <p className="text-[10px] text-gray-400">por viaje</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── VEHICLES SCREEN ──────────────────────────────────────────────────────────

function VehiclesScreen({onBack, onViewMap}: {onBack: () => void; onViewMap: (routeId: string) => void}) {
  const [filterRoute, setFilterRoute] = useState<string|null>(null);
  const filtered = filterRoute ? VEHICLES.filter(v => v.ruta === filterRoute) : VEHICLES;
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="flex items-center gap-3 bg-white px-4 pt-5 pb-4 border-b border-gray-100">
        <button onClick={onBack} className="w-9 h-9 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center"><ChevronLeft className="w-5 h-5 text-gray-600"/></button>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Vehículos</h2>
          <p className="text-xs text-gray-400">{VEHICLES.filter(v=>v.estado==="En servicio").length} de {VEHICLES.length} en servicio</p>
        </div>
      </div>
      <div className="p-4">
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          <Chip active={filterRoute===null} onClick={()=>setFilterRoute(null)}>Todos</Chip>
          {ROUTES.map(r => <Chip key={r.id} active={filterRoute===r.id} color={r.color} onClick={()=>setFilterRoute(filterRoute===r.id?null:r.id)}>{r.id}</Chip>)}
        </div>
        <div className="space-y-2.5">
          {filtered.map(v => (
            <Card key={v.id} className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0">
                  <Bus className="w-5 h-5 text-gray-400" strokeWidth={1.5}/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900" style={{fontFamily:"'Space Mono',monospace"}}>{v.id}</p>
                  <p className="text-xs text-gray-400 truncate">{v.empresa} · Ruta {v.ruta}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <StatusBadge estado={v.estado}/>
                  {v.estado==="En servicio" && <button onClick={()=>onViewMap(v.ruta)} className="flex items-center gap-1 text-[11px] text-green-700 font-semibold hover:underline"><Eye className="w-3 h-3"/>Ver en mapa</button>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── FAVORITES SCREEN ─────────────────────────────────────────────────────────

function FavoritesScreen({onBack, onViewRoute, onViewMap}: {
  onBack: () => void; onViewRoute: (r: BusRoute) => void; onViewMap: (id: string) => void;
}) {
  const favorites = ROUTES.filter(r => FAVORITE_ROUTE_IDS.includes(r.id));
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="flex items-center gap-3 bg-white px-4 pt-5 pb-4 border-b border-gray-100">
        <button onClick={onBack} className="w-9 h-9 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center"><ChevronLeft className="w-5 h-5 text-gray-600"/></button>
        <h2 className="text-lg font-bold text-gray-900">Mis favoritos</h2>
      </div>
      <div className="p-4">
        <SectionLabel>Rutas guardadas</SectionLabel>
        <div className="space-y-2.5">
          {favorites.map(r => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                  style={{backgroundColor:r.color,fontFamily:"'Space Mono',monospace"}}>{r.id}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900">{r.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{r.origin} → {r.destination}</p>
                  <span className="text-[11px] text-gray-400 flex items-center gap-1 mt-1"><Clock className="w-3 h-3"/>Cada {r.frequency}</span>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={()=>onViewRoute(r)} className="flex-1 border border-gray-200 text-gray-700 rounded-xl py-2 text-xs font-semibold hover:bg-gray-50 transition-colors">Ver detalle</button>
                <button onClick={()=>onViewMap(r.id)} className="flex-1 bg-green-700 text-white rounded-xl py-2 text-xs font-bold hover:bg-green-800 transition-colors">Ver en mapa</button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── SETTINGS SCREEN ──────────────────────────────────────────────────────────

function SettingsScreen({onBack}: {onBack: () => void}) {
  const [notifPush, setNotifPush] = useState(true);
  const [notifSonido, setNotifSonido] = useState(false);
  const [modoOscuro, setModoOscuro] = useState(false);
  const [saved, setSaved] = useState(false);

  const Toggle = ({active, onToggle}: {active: boolean; onToggle: () => void}) => (
    <button onClick={onToggle} className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${active?"bg-green-600":"bg-gray-200"}`}>
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${active?"left-6":"left-1"}`}/>
    </button>
  );

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="flex items-center gap-3 bg-white px-4 pt-5 pb-4 border-b border-gray-100">
        <button onClick={onBack} className="w-9 h-9 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center"><ChevronLeft className="w-5 h-5 text-gray-600"/></button>
        <h2 className="text-lg font-bold text-gray-900">Configuración</h2>
      </div>
      <div className="p-4 space-y-5">
        <div>
          <SectionLabel>Notificaciones</SectionLabel>
          <Card className="divide-y divide-gray-50">
            {[{icon:Bell,bg:"bg-blue-50",ic:"text-blue-500",label:"Notificaciones push",desc:"Alertas de rutas y desvíos",val:notifPush,set:setNotifPush},
              {icon:Volume2,bg:"bg-amber-50",ic:"text-amber-500",label:"Sonido",desc:"Sonido en notificaciones",val:notifSonido,set:setNotifSonido}].map(item => (
              <div key={item.label} className="flex items-center justify-between px-4 py-4">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-xl ${item.bg} flex items-center justify-center`}>
                    <item.icon className={`w-4 h-4 ${item.ic}`} strokeWidth={1.5}/>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                    <p className="text-xs text-gray-400">{item.desc}</p>
                  </div>
                </div>
                <Toggle active={item.val} onToggle={()=>item.set(!item.val)}/>
              </div>
            ))}
          </Card>
        </div>
        <div>
          <SectionLabel>Apariencia</SectionLabel>
          <Card>
            <div className="flex items-center justify-between px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center">
                  <Moon className="w-4 h-4 text-gray-600" strokeWidth={1.5}/>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Modo oscuro</p>
                  <p className="text-xs text-gray-400">Tema oscuro en la app</p>
                </div>
              </div>
              <Toggle active={modoOscuro} onToggle={()=>setModoOscuro(!modoOscuro)}/>
            </div>
          </Card>
        </div>
        <button onClick={()=>{setSaved(true);setTimeout(()=>setSaved(false),2000);}}
          className={`w-full rounded-2xl py-3.5 text-sm font-bold flex items-center justify-center gap-2 transition-all ${saved?"bg-green-600 text-white":"bg-green-700 text-white hover:bg-green-800"}`}>
          {saved?<><CheckCircle className="w-4 h-4"/>Guardado</>:"Guardar cambios"}
        </button>
      </div>
    </div>
  );
}

// ─── NOTIFICATIONS SCREEN ─────────────────────────────────────────────────────

function NotificationsScreen({notifications, onBack, onMarkRead}: {
  notifications: AppNotif[]; onBack: () => void; onMarkRead: (id: number) => void;
}) {
  const iconMap: Record<string,React.ReactNode> = {alerta:<AlertCircle className="w-4 h-4 text-red-500"/>,info:<Info className="w-4 h-4 text-blue-500"/>,tarifa:<Wallet className="w-4 h-4 text-amber-500"/>};
  const bgMap: Record<string,string> = {alerta:"bg-red-50",info:"bg-blue-50",tarifa:"bg-amber-50"};
  const unread = notifications.filter(n=>!n.leida);
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="flex items-center justify-between bg-white px-4 pt-5 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-9 h-9 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center"><ChevronLeft className="w-5 h-5 text-gray-600"/></button>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Notificaciones</h2>
            {unread.length>0 && <p className="text-xs text-gray-400">{unread.length} sin leer</p>}
          </div>
        </div>
        {unread.length>0 && <button onClick={()=>unread.forEach(n=>onMarkRead(n.id))} className="text-xs text-green-700 font-semibold">Marcar todas leídas</button>}
      </div>
      <div className="divide-y divide-gray-100">
        {notifications.map(n => (
          <button key={n.id} onClick={()=>onMarkRead(n.id)}
            className={`w-full text-left px-4 py-4 flex items-start gap-3 transition-colors ${n.leida?"bg-white":"bg-green-50/40 hover:bg-green-50/70"}`}>
            <div className={`w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 mt-0.5 ${bgMap[n.tipo]}`}>{iconMap[n.tipo]}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className={`text-sm ${n.leida?"text-gray-700":"font-bold text-gray-900"}`}>{n.titulo}</p>
                {!n.leida && <div className="w-2 h-2 rounded-full bg-green-600 flex-shrink-0"/>}
              </div>
              <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{n.mensaje}</p>
              <p className="text-[11px] text-gray-300 mt-1.5">{n.fecha}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── PROFILE SCREEN ───────────────────────────────────────────────────────────

function ProfileScreen({user, onNavigate, onLogout}: {
  user: AppUser; onNavigate: (s: Screen) => void; onLogout: () => void;
}) {
  const menuItems: {icon: React.FC<{className?:string;strokeWidth?:number}>; label:string; desc:string; action:()=>void}[] = [
    {icon:Bookmark, label:"Mis favoritos",  desc:"2 rutas guardadas",  action:()=>onNavigate("favorites")},
    {icon:Bell,     label:"Notificaciones", desc:"Configurar alertas", action:()=>onNavigate("notifications")},
    {icon:Wallet,   label:"Tarifas",        desc:"Consultar precios",  action:()=>onNavigate("fares")},
    {icon:Bus,      label:"Vehículos",      desc:"Estado de la flota", action:()=>onNavigate("vehicles")},
    {icon:Settings, label:"Configuración",  desc:"Ajustes de la app",  action:()=>onNavigate("settings")},
  ];
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="bg-green-700 px-4 pt-8 pb-12">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-3xl flex-shrink-0">
            {user.isAdmin ? "🛡️" : "👤"}
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">{user.name}</h2>
            <p className="text-white/60 text-sm">{user.email}</p>
            <span className="text-[11px] bg-white/20 text-white px-2.5 py-0.5 rounded-full font-semibold mt-1.5 inline-block">
              {user.isAdmin ? "Trabajador" : "Cliente"}
            </span>
          </div>
        </div>
      </div>
      <div className="px-4 -mt-6 mb-5">
        <Card className="grid grid-cols-3 divide-x divide-gray-100">
          {[{n:"2",l:"Favoritos"},{n:"14",l:"Viajes"},{n:"5",l:"Rutas"}].map(s => (
            <div key={s.l} className="py-3.5 text-center">
              <p className="text-xl font-bold text-gray-900">{s.n}</p>
              <p className="text-xs text-gray-400">{s.l}</p>
            </div>
          ))}
        </Card>
      </div>
      <div className="px-4 mb-4">
        <SectionLabel>Mi cuenta</SectionLabel>
        <div className="space-y-2">
          {menuItems.map(item => (
            <button key={item.label} onClick={item.action}
              className="w-full flex items-center gap-3 px-4 py-3.5 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition-shadow text-left">
              <div className="w-9 h-9 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0">
                <item.icon className="w-5 h-5 text-gray-500" strokeWidth={1.5}/>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                <p className="text-xs text-gray-400">{item.desc}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300"/>
            </button>
          ))}
        </div>
      </div>
      
      <div className="px-4 pb-6">
        <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 py-3.5 border-2 border-red-200 text-red-500 rounded-2xl text-sm font-bold hover:bg-red-50 transition-colors">
          <LogOut className="w-4 h-4"/>Cerrar sesión
        </button>
      </div>
    </div>
  );
}

// ─── ADMIN SCREEN ─────────────────────────────────────────────────────────────

type AdminRecord = Record<string, string>;

const SECTION_FIELDS: Record<string, {key: string; label: string; type?: string}[]> = {
  Usuarios:      [{key:"nombre",label:"Nombre completo"},{key:"correo",label:"Correo electrónico",type:"email"},{key:"rol",label:"Rol (ej: Usuario / Supervisor)"}],
  Empresas:      [{key:"nombre",label:"Nombre de la empresa"},{key:"rutas",label:"Rutas asignadas (ej: 302, 306)"},{key:"flota",label:"Tamaño de flota (ej: 12 buses)"}],
  Buses:         [{key:"placa",label:"Placa del bus"},{key:"empresa",label:"Empresa operadora"},{key:"ruta",label:"Ruta asignada"},{key:"estado",label:"Estado (En servicio / Fuera de servicio)"}],
  Rutas:         [{key:"id",label:"Número de ruta"},{key:"nombre",label:"Nombre de la ruta"},{key:"frecuencia",label:"Frecuencia (ej: 10 min)"},{key:"horario",label:"Horario (ej: 5:00–23:00)"}],
  Paraderos:     [{key:"nombre",label:"Nombre del paradero"},{key:"ruta",label:"Ruta que pasa"},{key:"direccion",label:"Dirección o referencia"}],
  Tarifas:       [{key:"servicio",label:"Tipo de servicio"},{key:"costo",label:"Costo (ej: $2.950 COP)"},{key:"descripcion",label:"Descripción"}],
  Reportes:      [{key:"tipo",label:"Tipo de reporte"},{key:"descripcion",label:"Descripción del incidente"},{key:"ruta",label:"Ruta afectada"}],
  Notificaciones:[{key:"titulo",label:"Título"},{key:"mensaje",label:"Mensaje"},{key:"tipo",label:"Tipo (alerta / info / tarifa)"}],
};

function AdminScreen({onBack}: {onBack: () => void}) {
  const [section, setSection] = useState<string|null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<AdminRecord>({});
  const [records, setRecords] = useState<Record<string, AdminRecord[]>>({});

  useEffect(() => {
    api<Record<string, AdminRecord[]>>("/admin/records")
      .then(setRecords).catch(e => console.error("Error cargando registros:",e));
  }, []);

  const openAdd = () => { setFormData({}); setShowModal(true); };

  const handleSave = async () => {
    if (!section) return;
    const fields = SECTION_FIELDS[section] || [];
    if (!fields.some(f => formData[f.key]?.trim())) return;
    try {
      const saved = await api<AdminRecord>(`/admin/records/${encodeURIComponent(section)}`, {
        method:"POST", body:JSON.stringify(formData)
      });
      setRecords(prev => ({...prev,[section]:[...(prev[section] || []),saved]}));
      setShowModal(false);
    } catch(e) { alert(e instanceof Error ? e.message : "No se pudo guardar"); }
  };

  const handleDelete = async (idx: number) => {
    if (!section) return;
    const record = (records[section] || [])[idx];
    if (!record?._id) return;
    try {
      await api(`/admin/records/${encodeURIComponent(section)}/${record._id}`,{method:"DELETE"});
      setRecords(prev => ({...prev,[section]:prev[section].filter(r=>r._id!==record._id)}));
    } catch(e) { alert(e instanceof Error ? e.message : "No se pudo eliminar"); }
  };

  const sectionRecords = section ? (records[section] || []) : [];
  const fields = section ? (SECTION_FIELDS[section] || []) : [];

  // Get first two field values as display columns
  const getDisplayCols = (rec: AdminRecord) => fields.slice(0,3).map(f => rec[f.key] || "—");

  const filtered = sectionRecords.filter(rec =>
    Object.values(rec).some(v => v.toLowerCase().includes(searchQ.toLowerCase()))
  );

  if (section) return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      {showModal && section && (
        <Modal title={`Agregar ${section.slice(0,-1) || section}`} onClose={()=>setShowModal(false)}>
          <div className="space-y-0">
            {fields.map(f => (
              <ModalField key={f.key} label={f.label} type={f.type||"text"} value={formData[f.key]||""}
                onChange={v=>setFormData(prev=>({...prev,[f.key]:v}))} placeholder={f.label}/>
            ))}
          </div>
          <button onClick={handleSave}
            className="w-full bg-green-700 text-white rounded-xl py-3 mt-4 text-sm font-bold hover:bg-green-800 transition-colors">
            Guardar registro
          </button>
        </Modal>
      )}

      <div className="flex items-center justify-between bg-white px-4 pt-5 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <button onClick={()=>{setSection(null);setSearchQ("");setShowModal(false);}}
            className="w-9 h-9 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center">
            <ChevronLeft className="w-5 h-5 text-gray-600"/>
          </button>
          <h2 className="text-base font-bold text-gray-900">{section}</h2>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-1.5 bg-green-700 text-white rounded-xl px-3 py-2 text-xs font-bold hover:bg-green-800 transition-colors">
          <Plus className="w-3.5 h-3.5"/>Agregar
        </button>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 mb-4">
          <Search className="w-4 h-4 text-gray-400"/>
          <input value={searchQ} onChange={e=>setSearchQ(e.target.value)}
            placeholder={`Buscar en ${section}...`}
            className="flex-1 text-sm outline-none placeholder:text-gray-400 bg-transparent"/>
          {searchQ && <button onClick={()=>setSearchQ("")}><X className="w-4 h-4 text-gray-400"/></button>}
        </div>

        <Card className="overflow-hidden">
          {filtered.length === 0 ? (
            <div className="py-12 text-center">
              <Plus className="w-8 h-8 text-gray-200 mx-auto mb-2"/>
              <p className="text-sm text-gray-400">{searchQ ? `Sin resultados para "${searchQ}"` : "No hay registros aún"}</p>
              {!searchQ && <button onClick={openAdd} className="text-xs text-green-700 font-semibold mt-1 hover:underline">Agregar el primero</button>}
            </div>
          ) : (
            filtered.map((rec, i) => {
              const cols = getDisplayCols(rec);
              return (
                <div key={i} className="flex items-center px-4 py-3.5 border-b border-gray-50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{cols[0]}</p>
                    {cols[1] && <p className="text-xs text-gray-400 truncate">{cols[1]}{cols[2] ? ` · ${cols[2]}` : ""}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 ml-2">
                    <button className="w-7 h-7 rounded-xl bg-blue-50 flex items-center justify-center hover:bg-blue-100 transition-colors"><Eye className="w-3.5 h-3.5 text-blue-600"/></button>
                    <button className="w-7 h-7 rounded-xl bg-amber-50 flex items-center justify-center hover:bg-amber-100 transition-colors"><Edit2 className="w-3.5 h-3.5 text-amber-600"/></button>
                    <button onClick={()=>handleDelete(sectionRecords.indexOf(rec))}
                      className="w-7 h-7 rounded-xl bg-red-50 flex items-center justify-center hover:bg-red-100 transition-colors"><Trash2 className="w-3.5 h-3.5 text-red-500"/></button>
                  </div>
                </div>
              );
            })
          )}
        </Card>
        <p className="text-[11px] text-gray-400 text-center mt-3">{filtered.length} registro{filtered.length !== 1 ? "s" : ""}</p>
      </div>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="flex items-center gap-3 bg-white px-4 pt-5 pb-4 border-b border-gray-100">
        <button onClick={onBack} className="w-9 h-9 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center"><ChevronLeft className="w-5 h-5 text-gray-600"/></button>
        <h2 className="text-lg font-bold text-gray-900">Panel de Administración</h2>
      </div>
      <div className="p-4">
        <SectionLabel>Resumen del sistema</SectionLabel>
        <div className="grid grid-cols-2 gap-2.5 mb-6">
          {ADMIN_STATS.map(s => (
            <Card key={s.label} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <s.icon className="w-5 h-5 text-green-700" strokeWidth={1.5}/>
                <span className="text-[10px] bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">Total</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
            </Card>
          ))}
        </div>
        <SectionLabel>Módulos de gestión</SectionLabel>
        <div className="space-y-2">
          {ADMIN_SECTIONS.map(sec => (
            <button key={sec} onClick={()=>setSection(sec)}
              className="w-full flex items-center justify-between px-4 py-3.5 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-gray-900">{sec}</span>
                {(records[sec]?.length || 0) > 0 && (
                  <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">{records[sec].length}</span>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300"/>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── BOTTOM NAV ───────────────────────────────────────────────────────────────

function BottomNav({active, onSwitch, user}: {active: TabId; onSwitch: (t: TabId) => void; user: AppUser}) {
  const tabs: [TabId, React.FC<{className?:string;strokeWidth?:number}>, string][] = [
    ["home",    Home,        "Inicio"],
    ["routes",  Navigation,  "Rutas"],
    ["map",     Map,         "Mapa"],
    ["trips",   Navigation2, "Viajes"],
    ["profile", User,        "Perfil"],
  ];
  if (user.isAdmin) {
    tabs.push(["admin", Shield, "Admin"]);
  }
  return (
    <nav className="flex-shrink-0 bg-white border-t border-gray-100 shadow-[0_-1px_0_rgba(0,0,0,0.05)]">
      <div className="flex">
        {tabs.map(([id, Icon, label]) => (
          <button key={id} onClick={()=>onSwitch(id)}
            className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors ${active===id?"text-green-700":"text-gray-400 hover:text-gray-600"}`}>
            <Icon className="w-5 h-5" strokeWidth={active===id?2.5:1.5}/>
            <span className={`text-[10px] ${active===id?"font-bold":"font-medium"}`}>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function App() {
  const [user, setUser] = useState<AppUser|null>(null);
  const [checkingSession, setCheckingSession] = useState(!!sessionToken);
  useEffect(() => {
    const consume = async (ticket:string) => {
      try { const result=await api<{token:string;user:AppUser}>("/auth/oauth/exchange",{method:"POST",body:JSON.stringify({ticket})}); setSession(result.token);setUser(result.user); }
      catch(e){ console.error("OAuth:",e); }
      finally {setCheckingSession(false);}
    };
    const ticket=new URLSearchParams(window.location.search).get("ticket");
    if(ticket){window.history.replaceState(null,"",window.location.pathname);consume(ticket);}
    let remove:undefined|(()=>void);
    import("@capacitor/app").then(({App:CapApp})=>CapApp.addListener("appUrlOpen", async e=>{
      const t=new URL(e.url).searchParams.get("ticket");
      if(t){ await import("@capacitor/browser").then(({Browser})=>Browser.close()).catch(()=>{});consume(t); }
    })).then(listener=>{remove=()=>listener.remove();}).catch(()=>{});
    return ()=>remove?.();
  },[]);
  useEffect(() => {
    if (!sessionToken) return;
    api<{user: AppUser}>("/auth/me").then(data => setUser(data.user))
      .catch(() => clearSession()).finally(() => setCheckingSession(false));
  }, []);
  const [tab, setTab] = useState<TabId>("home");
  const [screen, setScreen] = useState<Screen>("home");
  const [screenStack, setScreenStack] = useState<Screen[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<BusRoute|null>(null);
  const [activeMapRoute, setActiveMapRoute] = useState<string|null>(null);
  const [notifications, setNotifications] = useState<AppNotif[]>(NOTIFS_DATA);
  const [busPositions, setBusPositions] = useState<BusPos[]>([]);

  const unread = notifications.filter(n => !n.leida).length;

  useEffect(() => {
    let raf: number;
    const t0 = performance.now();
    const tick = () => {
      const elapsed = (performance.now() - t0) / 1000;
      setBusPositions(BUS_DEFS.map(def => {
        const route = ROUTES.find(r => r.id === def.routeId)!;
        const t = ((def.phase + elapsed * def.speed) % 1 + 1) % 1;
        const [x, y] = lerp(route.waypoints, t);
        return {id: def.id, routeId: def.routeId, x, y};
      }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const navigate = useCallback((s: Screen) => {
    setScreenStack(prev => [...prev, screen]);
    setScreen(s);
  }, [screen]);

  const goBack = useCallback(() => {
    if (screenStack.length > 0) {
      const prev = screenStack[screenStack.length - 1];
      setScreenStack(s => s.slice(0, -1));
      setScreen(prev);
    } else {
      setScreen(tab);
    }
  }, [screenStack, tab]);

  const switchTab = useCallback((t: TabId) => {
    setTab(t); setScreen(t); setScreenStack([]);
    if (t !== "routes") setSelectedRoute(null);
  }, []);

  const markRead = (id: number) => setNotifications(prev => prev.map(n => n.id===id ? {...n,leida:true} : n));

  const goToMap = (routeId: string) => { setActiveMapRoute(routeId); switchTab("map"); };
  const goToRouteDetail = (r: BusRoute) => { setSelectedRoute(r); navigate("route-detail"); };

  if (checkingSession) return <div className="h-screen flex items-center justify-center">Cargando sesión...</div>;
  if (!user) return <AuthScreen onLogin={setUser}/>;

  const renderScreen = () => {
    switch (screen) {
      case "assistant": return <AssistantScreen onBack={goBack}/>;
      case "notifications": return <NotificationsScreen notifications={notifications} onBack={goBack} onMarkRead={markRead}/>;
      case "fares":         return <FaresScreen onBack={goBack}/>;
      case "vehicles":      return <VehiclesScreen onBack={goBack} onViewMap={goToMap}/>;
      case "admin":         return user.isAdmin ? <AdminScreen onBack={goBack}/> : null;
      case "favorites":     return <FavoritesScreen onBack={goBack} onViewRoute={goToRouteDetail} onViewMap={goToMap}/>;
      case "settings":      return <SettingsScreen onBack={goBack}/>;
      case "map":           return <MapScreen busPositions={busPositions} activeRoute={activeMapRoute} onRouteChange={setActiveMapRoute}/>;
      case "trips":         return <TripsScreen onViewRoute={id=>{goToMap(id);}}/>;
      case "route-detail":  return <RoutesScreen selected={selectedRoute} onSelect={r=>setSelectedRoute(r)} onBack={goBack} onViewMap={goToMap}/>;
      case "routes":        return <RoutesScreen selected={null} onSelect={r=>{setSelectedRoute(r);navigate("route-detail");}} onBack={goBack} onViewMap={goToMap}/>;
      case "profile":       return <ProfileScreen user={user} onNavigate={navigate} onLogout={()=>{ api("/auth/logout",{method:"POST"}).catch(()=>{}); clearSession(); setUser(null); }}/>;
      default:              return <HomeScreen user={user} busPositions={busPositions} unread={unread}
          onNavigate={dest=>{
            const tabs=["home","routes","map","trips","profile","admin"];
            if(tabs.includes(dest)) switchTab(dest as TabId); else navigate(dest as Screen);
          }}/>;
    }
  };

  return (
    <div className="h-screen bg-gray-300 flex justify-center overflow-hidden" style={{fontFamily:"'DM Sans',system-ui,sans-serif"}}>
      <div className="relative w-full max-w-sm h-full bg-white flex flex-col overflow-hidden shadow-2xl">
        <div className="flex-1 flex flex-col overflow-hidden">{renderScreen()}</div>
        <BottomNav active={tab} onSwitch={switchTab} user={user}/>
      </div>
    </div>
  );
}
