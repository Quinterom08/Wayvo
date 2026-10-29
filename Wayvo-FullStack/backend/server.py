"""Wayvo API: Python standard library + SQLite. Python 3.10+."""
import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
import threading
import math
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit, urlencode, parse_qs
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from assistant_chat import chat_reply, demo_stops, quick_route
from mail_security import validate_password, send_code, ready as mail_ready
from gps_helpers import valid_track

BASE = Path(__file__).resolve().parent

def load_local_env():
    # Convenience for local demo only: read KEY=VALUE entries, NEVER execute code.
    # Environment settings set by deployment take precedence.
    env_file = BASE / '.env'
    if not env_file.is_file(): return
    for line in env_file.read_text(encoding='utf-8').splitlines():
        line=line.strip()
        if not line or line.startswith('#') or '=' not in line: continue
        key,value=line.split('=',1)
        key=key.strip();value=value.strip().strip('\"').strip("'")
        if key and all(c.isupper() or c.isdigit() or c=='_' for c in key):
            os.environ.setdefault(key,value)

load_local_env()
DB = Path(os.environ.get('WAYVO_DB', str(BASE / 'wayvo.sqlite3')))
PORT = int(os.environ.get('WAYVO_PORT', '8000'))
HOST = os.environ.get('WAYVO_HOST', '127.0.0.1')
# Comma-separated HTTPS origins; e.g. https://wayvo.example.com.
# capacitor://localhost (iOS) and https://localhost (Android) are local app origins.
ALLOWED_ORIGINS = set(x.strip() for x in os.environ.get('WAYVO_CORS_ORIGINS', 'capacitor://localhost,https://localhost').split(',') if x.strip())
SECTIONS = {'Usuarios', 'Empresas', 'Buses', 'Rutas', 'Paraderos', 'Tarifas', 'Reportes', 'Notificaciones'}

def fetch_json(url, body=None, headers=None):
    req = Request(url, data=body, headers=headers or {}, method='POST' if body is not None else 'GET')
    with urlopen(req, timeout=12) as res:
        return json.loads(res.read(65536))

def oauth_config(provider):
    if provider not in ('google', 'microsoft'): return None
    key = provider.upper()
    client = os.environ.get('WAYVO_'+key+'_CLIENT_ID', '')
    secret = os.environ.get('WAYVO_'+key+'_CLIENT_SECRET', '')
    base = os.environ.get('WAYVO_PUBLIC_API_URL','').rstrip('/')
    if not client or not secret or not base.startswith('https://'): return None
    if provider == 'google':
        return dict(client=client, secret=secret, authorization='https://accounts.google.com/o/oauth2/v2/auth', token='https://oauth2.googleapis.com/token', userinfo='https://openidconnect.googleapis.com/v1/userinfo', scope='openid email profile', base=base)
    tenant = os.environ.get('WAYVO_MICROSOFT_TENANT','common')
    if tenant not in ('common','organizations','consumers') and not all(c.isalnum() or c=='-' for c in tenant): return None
    return dict(client=client,secret=secret, authorization=f'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize',token=f'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token',userinfo='https://graph.microsoft.com/oidc/userinfo',scope='openid email profile',base=base)

def connect():
    conn = sqlite3.connect(DB, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA foreign_keys=ON')
    return conn

def hashed(password, salt=None):
    salt = salt or secrets.token_bytes(16)
    key = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f'{salt.hex()}:{key.hex()}'

def password_ok(password, saved):
    try:
        salt, _ = saved.split(':')
        return hmac.compare_digest(hashed(password, bytes.fromhex(salt)), saved)
    except (ValueError, TypeError):
        return False

def init():
    with connect() as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'client' CHECK(role IN ('client','worker')),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS records (
          id INTEGER PRIMARY KEY AUTOINCREMENT, section TEXT NOT NULL,
          data TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS records_section ON records(section);
        CREATE TABLE IF NOT EXISTS social_accounts(provider TEXT NOT NULL,subject TEXT NOT NULL,user_id INTEGER NOT NULL REFERENCES users(id),PRIMARY KEY(provider,subject));
        CREATE TABLE IF NOT EXISTS oauth_pending(state_hash TEXT PRIMARY KEY, provider TEXT NOT NULL, mode TEXT NOT NULL, expires_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS oauth_tickets(ticket_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),expires_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS email_codes (
          email TEXT NOT NULL, purpose TEXT NOT NULL,
          code_hash TEXT NOT NULL, expires_at TEXT NOT NULL,
          issued_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(email, purpose)
        );
        CREATE TABLE IF NOT EXISTS gps_tracks (
          id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          points TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS bus_devices (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          label TEXT NOT NULL,
          route_id TEXT NOT NULL,
          secret_hash TEXT UNIQUE NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS bus_positions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          device_id INTEGER NOT NULL REFERENCES bus_devices(id) ON DELETE CASCADE,
          lat REAL NOT NULL, lng REAL NOT NULL, accuracy REAL,
          recorded_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS bus_positions_recent ON bus_positions(device_id,id DESC);
        ''')
        # Database migration for pre-existing installations.
        if 'verified_at' not in [c['name'] for c in db.execute('PRAGMA table_info(users)')]:
            db.execute('ALTER TABLE users ADD COLUMN verified_at TEXT')
        # Bootstrap admin credentials are created ONLY when explicitly supplied.
        email = os.environ.get('WAYVO_ADMIN_EMAIL', '').strip().lower()
        password = os.environ.get('WAYVO_ADMIN_PASSWORD', '')
        if email and not validate_password(password) and not db.execute('SELECT id FROM users WHERE email=?', (email,)).fetchone():
            db.execute('INSERT INTO users(name,email,password_hash,role,verified_at) VALUES(?,?,?,?,?)', ('Administrador', email, hashed(password), 'worker', datetime.now(timezone.utc).isoformat()))

def issue_token(db, user_id):
    token = secrets.token_urlsafe(32)
    expiry = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    db.execute('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), user_id, expiry))
    return token

def public_user(row):
    return {'name': row['name'], 'email': row['email'], 'isAdmin': row['role'] == 'worker'}

# Brute-force protection per IP, including nonexistent usernames.
_RATE_LOCK = threading.Lock()
_RATE_ATTEMPTS = {}
def check_rate(ip, action, max_count=16, period=600):
    now = time.monotonic()
    key = (ip, action)
    with _RATE_LOCK:
        recent = [t for t in _RATE_ATTEMPTS.get(key, []) if now-t < period]
        if len(recent) >= max_count:
            _RATE_ATTEMPTS[key] = recent
            return False
        recent.append(now)
        _RATE_ATTEMPTS[key] = recent
        return True


def otp_create(db, email, purpose, bypass_cooldown=False):
    now = datetime.now(timezone.utc)
    prev = db.execute('SELECT issued_at FROM email_codes WHERE email=? AND purpose=?', (email, purpose)).fetchone()
    if prev and not bypass_cooldown and (now - datetime.fromisoformat(prev['issued_at'])).total_seconds() < 60:
        raise ValueError('Espera 60 segundos antes de solicitar otro código.')
    code = f'{secrets.randbelow(1000000):06d}'
    db.execute('INSERT INTO email_codes(email,purpose,code_hash,expires_at,issued_at,attempts) VALUES(?,?,?,?,?,0) '
               'ON CONFLICT(email,purpose) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at, issued_at=excluded.issued_at, attempts=0',
               (email, purpose, hashed(code), (now+timedelta(minutes=10)).isoformat(), now.isoformat()))
    # Delivery is synchronous so SMTP failure rolls back the transaction.
    send_code(email, purpose, code)


def otp_check(db, email, purpose, code):
    if not (isinstance(code, str) and len(code)==6 and code.isascii() and code.isdigit()):
        return False
    row = db.execute('SELECT * FROM email_codes WHERE email=? AND purpose=?', (email,purpose)).fetchone()
    if not row or row['attempts'] >= 5 or row['expires_at'] < datetime.now(timezone.utc).isoformat():
        return False
    db.execute('UPDATE email_codes SET attempts=attempts+1 WHERE email=? AND purpose=?', (email,purpose))
    if not password_ok(code, row['code_hash']): return False
    db.execute('DELETE FROM email_codes WHERE email=? AND purpose=?', (email,purpose))
    return True

class Handler(BaseHTTPRequestHandler):
    def send(self, status, value):
        body = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def cors_headers(self):
        origin = self.headers.get('Origin', '')
        if origin in ALLOWED_ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors_headers()
        self.send_header('Content-Length', '0')
        self.end_headers()

    def payload(self):
        length = int(self.headers.get('Content-Length', '0'))
        limit = 160000 if urlsplit(self.path).path == '/api/gps/tracks' else 32768
        if length < 0 or length > limit:
            raise ValueError('Solicitud demasiado grande')
        data = json.loads(self.rfile.read(length) or b'{}')
        if not isinstance(data, dict):
            raise ValueError('Se requiere un objeto JSON')
        return data

    def current_user(self, db):
        auth = self.headers.get('Authorization', '')
        if not auth.startswith('Bearer '):
            return None
        digest = hashlib.sha256(auth[7:].encode()).hexdigest()
        row = db.execute('''SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id
            WHERE s.token_hash=? AND s.expires_at>? AND u.verified_at IS NOT NULL''', (digest, datetime.now(timezone.utc).isoformat())).fetchone()
        return row

    def handle_api(self, method):
        path = unquote(urlsplit(self.path).path)
        parts = path.strip('/').split('/')
        if not parts or parts[0] != 'api':
            return self.send(404, {'error': 'Ruta no encontrada'})
        try:
            data = self.payload() if method in ('POST', 'PUT', 'PATCH') else {}
            with connect() as db:
                if path.startswith('/api/auth/oauth/') and method == 'GET':
                    if len(parts)==5 and parts[4]=='status' and parts[3] in ('google','microsoft'):
                        configured = oauth_config(parts[3]) is not None
                        return self.send(200, {'configured':configured, 'error':None if configured else 'Acceso social aún sin configurar. Añade WAYVO_PUBLIC_API_URL y las credenciales de '+parts[3]+' al servidor (consulta CONFIGURACION.md).'})
                    if len(parts)!=5 or parts[2]!='oauth': return self.send(404,{'error':'Ruta desconocida'})
                    provider, action = parts[3], parts[4]
                    cfg = oauth_config(provider)
                    if not cfg: return self.send(503,{'error':'OAuth no configurado para este proveedor'})
                    callback = cfg['base']+'/api/auth/oauth/'+provider+'/callback'
                    if action == 'start':
                        mode = parse_qs(urlsplit(self.path).query).get('mode',['web'])[0]
                        if mode not in ('web','mobile'): return self.send(400,{'error':'Modo inválido'})
                        state = secrets.token_urlsafe(32)
                        expiry = (datetime.now(timezone.utc)+timedelta(minutes=10)).isoformat()
                        db.execute('INSERT INTO oauth_pending VALUES (?,?,?,?)',(hashlib.sha256(state.encode()).hexdigest(),provider,mode,expiry))
                        url=cfg['authorization']+'?'+urlencode(dict(client_id=cfg['client'],redirect_uri=callback,response_type='code',scope=cfg['scope'],state=state,prompt='select_account'))
                        return self.redirect(url)
                    if action == 'callback':
                        params=parse_qs(urlsplit(self.path).query)
                        state=params.get('state',[''])[0]; code=params.get('code',[''])[0]
                        row=db.execute('SELECT * FROM oauth_pending WHERE state_hash=?',(hashlib.sha256(state.encode()).hexdigest(),)).fetchone()
                        if not row or row['provider']!=provider or row['expires_at']<datetime.now(timezone.utc).isoformat():
                            return self.send(400,{'error':'Estado OAuth inválido o vencido'})
                        db.execute('DELETE FROM oauth_pending WHERE state_hash=?',(row['state_hash'],))
                        if not code: return self.send(400,{'error':'Autorización cancelada'})
                        try:
                            tokens=fetch_json(cfg['token'],urlencode(dict(client_id=cfg['client'],client_secret=cfg['secret'],code=code,redirect_uri=callback,grant_type='authorization_code')).encode(),{'Content-Type':'application/x-www-form-urlencoded'})
                            profile=fetch_json(cfg['userinfo'],headers={'Authorization':'Bearer '+tokens['access_token']})
                        except (HTTPError, KeyError, OSError, ValueError):
                            return self.send(502,{'error':'No se pudo verificar la identidad con el proveedor'})
                        sub=str(profile.get('sub','')); email=str(profile.get('email','')).strip().lower()
                        # Never auto-link an unverified email to an existing local account.
                        verified = profile.get('email_verified',False) is True if provider=='google' else False
                        if not sub: return self.send(401,{'error':'Identidad sin identificador'})
                        account=db.execute('SELECT user_id FROM social_accounts WHERE provider=? AND subject=?',(provider,sub)).fetchone()
                        if account: uid=account['user_id']
                        else:
                            if not email or '@' not in email or (not verified and db.execute('SELECT id FROM users WHERE email=?',(email,)).fetchone()):
                                return self.send(409,{'error':'Cuenta existente o correo no verificable. Contacta soporte para vincular cuentas.'})
                            if db.execute('SELECT id FROM users WHERE email=?',(email,)).fetchone():
                                return self.send(409,{'error':'Ya existe una cuenta con ese correo; vinculación manual requerida'})
                            db.execute('INSERT INTO users(name,email,password_hash,role) VALUES (?,?,?,?)',(str(profile.get('name') or email.split('@')[0])[:120],email,hashed(secrets.token_urlsafe(48)),'client'))
                            uid=db.execute('SELECT last_insert_rowid()').fetchone()[0]
                            db.execute('INSERT INTO social_accounts VALUES (?,?,?)',(provider,sub,uid))
                        ticket=secrets.token_urlsafe(32)
                        db.execute('INSERT INTO oauth_tickets VALUES(?,?,?)',(hashlib.sha256(ticket.encode()).hexdigest(),uid,(datetime.now(timezone.utc)+timedelta(minutes=2)).isoformat()))
                        if row['mode']=='mobile': return self.redirect('wayvo://auth?'+urlencode({'ticket':ticket}))
                        web_url=os.environ.get('WAYVO_WEB_URL','').rstrip('/')
                        if not web_url.startswith('https://') and not web_url.startswith('http://localhost:'):
                            return self.send(503,{'error':'WAYVO_WEB_URL no configurada'})
                        return self.redirect(web_url+'/?'+urlencode({'ticket':ticket}))
                if path == '/api/auth/oauth/exchange' and method == 'POST':
                    ticket=str(data.get('ticket',''))
                    digest=hashlib.sha256(ticket.encode()).hexdigest()
                    pending=db.execute('SELECT * FROM oauth_tickets WHERE ticket_hash=? AND expires_at>?',(digest,datetime.now(timezone.utc).isoformat())).fetchone()
                    if not pending: return self.send(401,{'error':'Código de acceso inválido o vencido'})
                    db.execute('DELETE FROM oauth_tickets WHERE ticket_hash=?',(digest,))
                    row=db.execute('SELECT * FROM users WHERE id=?',(pending['user_id'],)).fetchone()
                    if not mail_ready(): return self.send(503,{'error':'OAuth verificado, pero falta configurar el correo para el segundo factor.'})
                    try: otp_create(db,row['email'],'login')
                    except ValueError as e: return self.send(429,{'error':str(e)})
                    except Exception:
                        db.rollback()
                        return self.send(503,{'error':'No se pudo enviar el segundo factor al correo.'})
                    db.commit()
                    return self.send(200,{'requires_verification':True,'purpose':'login','email':row['email']})
                # GPS telemetry: hardware or a dedicated simulator POSTs positions
                # using its own per-bus secret. Never accept a passenger session here.
                if path == '/api/gps/device/position' and method == 'POST':
                    key = self.headers.get('X-Wayvo-Device-Key', '')
                    if len(key) < 30 or len(key) > 256:
                        return self.send(401, {'error': 'Credencial de dispositivo requerida.'})
                    key_hash = hashlib.sha256(key.encode()).hexdigest()
                    device = db.execute('SELECT id FROM bus_devices WHERE secret_hash=?', (key_hash,)).fetchone()
                    if not device:
                        return self.send(401, {'error': 'Dispositivo no autorizado.'})
                    lat, lng, acc = data.get('lat'), data.get('lng'), data.get('accuracy')
                    if any(isinstance(v, bool) or not isinstance(v, (int,float)) or not math.isfinite(v) for v in (lat,lng)) or not (-90 <= lat <= 90 and -180 <= lng <= 180):
                        return self.send(400, {'error': 'Coordenadas GPS inválidas.'})
                    if acc is not None and (isinstance(acc,bool) or not isinstance(acc,(int,float)) or not math.isfinite(acc) or not 0 <= acc <= 1000):
                        return self.send(400, {'error': 'Precisión inválida.'})
                    # Database timestamps prevent replayed/fabricated device times.
                    now=datetime.now(timezone.utc)
                    last=db.execute('SELECT recorded_at FROM bus_positions WHERE device_id=? ORDER BY id DESC LIMIT 1',(device['id'],)).fetchone()
                    if last and (now-datetime.fromisoformat(last['recorded_at'])).total_seconds()<2:
                        return self.send(429, {'error': 'Máximo una posición cada 2 segundos.'})
                    db.execute('INSERT INTO bus_positions(device_id,lat,lng,accuracy,recorded_at) VALUES (?,?,?,?,?)',
                               (device['id'],round(lat,6),round(lng,6),round(acc,1) if acc is not None else None,now.isoformat()))
                    # Retain only 500 latest samples per device for the academic prototype.
                    db.execute('DELETE FROM bus_positions WHERE device_id=? AND id NOT IN (SELECT id FROM bus_positions WHERE device_id=? ORDER BY id DESC LIMIT 500)',(device['id'],device['id']))
                    db.commit()
                    return self.send(202, {'received':True})
                if path == '/api/assistant/stops' and method == 'GET':
                    if not self.current_user(db): return self.send(401, {'error':'Debes iniciar sesión'})
                    return self.send(200, {'stops':demo_stops(), 'demo':True})
                if path == '/api/assistant/quick-route' and method == 'POST':
                    if not self.current_user(db): return self.send(401, {'error':'Debes iniciar sesión'})
                    origin, destination = data.get('origin'), data.get('destination')
                    if not isinstance(origin,str) or not isinstance(destination,str) or len(origin)>100 or len(destination)>100:
                        return self.send(400, {'error':'Elige un origen y un destino válidos.'})
                    if not origin.strip() or not destination.strip():
                        return self.send(400, {'error':'Elige un origen y un destino.'})
                    return self.send(200, quick_route(origin, destination))
                if path == '/api/assistant/chat' and method == 'POST':
                    if not self.current_user(db): return self.send(401,{'error':'Debes iniciar sesión'})
                    raw=data.get('messages')
                    if not isinstance(raw,list) or not 1<=len(raw)<=30:
                        return self.send(400,{'error':'Envía entre 1 y 30 mensajes de chat'})
                    messages=[]
                    for item in raw[-12:]:
                        if not isinstance(item,dict) or item.get('role') not in ('user','assistant') or not isinstance(item.get('content'),str):
                            return self.send(400,{'error':'Formato de chat inválido'})
                        content=item['content'].strip()
                        if not content or len(content)>1000:return self.send(400,{'error':'Mensaje vacío o demasiado largo'})
                        messages.append({'role':item['role'],'content':content})
                    if messages[-1]['role']!='user':return self.send(400,{'error':'El último mensaje debe ser del usuario'})
                    loc=data.get('location')
                    if not isinstance(loc,dict) or not all(isinstance(loc.get(k),(int,float)) for k in ('latitude','longitude')):
                        loc=None
                    elif not (-90<=loc['latitude']<=90 and -180<=loc['longitude']<=180):loc=None
                    return self.send(200,chat_reply(messages,loc,fetch_json))
                if path == '/api/assistant/routes' and method == 'POST':
                    if not self.current_user(db): return self.send(401,{'error':'Debes iniciar sesión'})
                    origin=str(data.get('origin','')).strip()[:160]; dest=str(data.get('destination','')).strip()[:160]
                    if not origin or not dest: return self.send(400,{'error':'Indica origen y destino'})
                    catalog=[]
                    for item in db.execute('SELECT data FROM records WHERE section=? ORDER BY id LIMIT 200',('Rutas',)):
                        r=json.loads(item['data']); stops=r.get('paraderos') or r.get('stops') or r.get('recorrido') or ''
                        catalog.append({'nombre':str(r.get('nombre') or r.get('ruta') or r.get('name') or '')[:100], 'origen':str(r.get('origen') or '')[:100], 'destino':str(r.get('destino') or '')[:100], 'paraderos':str(stops)[:1200]})
                    # Only grounded recommendations: exact text matches over operator-managed route records.
                    def norm(v): return ' '.join(str(v).casefold().split())
                    direct=[r for r in catalog if r['nombre'] and norm(origin) in norm(r['origen']+' '+r['paraderos']) and norm(dest) in norm(r['destino']+' '+r['paraderos'])]
                    location=data.get('location')
                    if isinstance(location,dict) and 'latitude' in location and 'longitude' in location and origin.lower() in ('mi ubicación','ubicación actual'):
                        return self.send(200,{'answer':'Recibí tu ubicación GPS. Para identificar el paradero cercano hace falta conectar un servicio geográfico y rutas georreferenciadas. Por ahora escribe tu barrio o paradero de origen.','routes':[],'source':'sin_geocodificacion'})
                    if not catalog: return self.send(200,{'answer':'Todavía no hay rutas verificadas en la base de datos. Un administrador debe registrar los recorridos antes de recomendar un bus.','routes':[],'source':'sin_datos'})
                    if not direct: return self.send(200,{'answer':f'No encontré un bus directo verificado entre {origin} y {dest}. No puedo confirmar transbordos sin datos de conexiones y horarios.','routes':[],'source':'catalogo'})
                    names=[r['nombre'] for r in direct[:5]]
                    response=f'Según las rutas registradas, puedes consultar: {", ".join(names)}. Confirma el sentido, los horarios y los paraderos con el operador antes de viajar.'
                    api_key=os.environ.get('OPENAI_API_KEY','')
                    if api_key:
                        try:
                            prompt='Eres el asistente Wayvo. Responde en español breve. Solo puedes recomendar estos buses verificados: '+json.dumps(direct[:5],ensure_ascii=False)+'. Origen: '+origin+'. Destino: '+dest+'. Nunca inventes paraderos, tiempos o transbordos; explica límites de datos.'
                            result=fetch_json('https://api.openai.com/v1/responses',json.dumps({'model':os.environ.get('WAYVO_AI_MODEL','gpt-4.1-mini'),'input':prompt,'max_output_tokens':250}).encode(),{'Authorization':'Bearer '+api_key,'Content-Type':'application/json'})
                            output=' '.join(part.get('text','') for item in result.get('output',[]) for part in item.get('content',[]) if part.get('type')=='output_text').strip()
                            if output: response=output
                        except (HTTPError,OSError,ValueError,KeyError): pass
                    return self.send(200,{'answer':response,'routes':direct[:5],'source':'rutas_administradas'})
                if path == '/api/health' and method == 'GET':
                    return self.send(200, {'status': 'ok', 'database': 'sqlite'})
                # Email/password flows require 6-digit email confirmation before a session exists.
                if path in ('/api/auth/register','/api/auth/login','/api/auth/forgot','/api/auth/resend','/api/auth/verify','/api/auth/reset') and method == 'POST':
                    if not check_rate(self.client_address[0], path, 20 if path.endswith('/verify') else 12):
                        return self.send(429, {'error':'Demasiados intentos. Intenta nuevamente en unos minutos.'})
                if path == '/api/auth/register' and method == 'POST':
                    name = str(data.get('name','')).strip()
                    email = str(data.get('email','')).strip().lower()
                    password = data.get('password', '')
                    problem = validate_password(password)
                    if not name or len(name)>120 or '@' not in email or len(email)>255 or problem:
                        return self.send(400, {'error':problem or 'Completa el nombre y un correo válido.'})
                    if db.execute('SELECT 1 FROM users WHERE email=?', (email,)).fetchone():
                        return self.send(409, {'error':'Este correo ya está registrado. Si aún no lo verificaste, inicia el proceso de ingreso.'})
                    if not mail_ready():
                        return self.send(503, {'error':'El envío de correos no está configurado. Consulta backend/.env.'})
                    try:
                        db.execute('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)', (name,email,hashed(password),'client'))
                        otp_create(db,email,'register')
                    except Exception:
                        db.rollback()
                        return self.send(503, {'error':'No se pudo enviar el código por correo. Revisa la configuración SMTP.'})
                    db.commit()
                    return self.send(201, {'requires_verification':True,'purpose':'register','message':'Te enviamos un código de 6 dígitos al correo.'})
                if path == '/api/auth/login' and method == 'POST':
                    email = str(data.get('email','')).strip().lower()
                    password = data.get('password','')
                    row = db.execute('SELECT * FROM users WHERE email=?', (email,)).fetchone()
                    if not row or not isinstance(password,str) or not password_ok(password, row['password_hash']):
                        return self.send(401, {'error':'Correo o contraseña incorrectos.'})
                    if not mail_ready():
                        return self.send(503, {'error':'El envío de correos no está configurado. Consulta backend/.env.'})
                    purpose = 'register' if not row['verified_at'] else 'login'
                    try:
                        otp_create(db,email,purpose)
                    except ValueError as e:
                        return self.send(429,{'error':str(e)})
                    except Exception:
                        db.rollback()
                        return self.send(503,{'error':'No se pudo enviar el código de acceso. Revisa el servicio SMTP.'})
                    db.commit()
                    return self.send(200, {'requires_verification':True,'purpose':purpose,'message':'Código enviado al correo. Compruébalo para entrar.'})
                if path == '/api/auth/verify' and method == 'POST':
                    email = str(data.get('email','')).strip().lower()
                    purpose = str(data.get('purpose',''))
                    code = data.get('code','')
                    if purpose not in ('register','login') or not otp_check(db,email,purpose,code):
                        db.commit()
                        return self.send(400,{'error':'Código incorrecto, vencido o demasiados intentos.'})
                    row = db.execute('SELECT * FROM users WHERE email=?',(email,)).fetchone()
                    if not row: return self.send(400,{'error':'Código inválido.'})
                    if not row['verified_at']:
                        db.execute('UPDATE users SET verified_at=? WHERE id=?',(datetime.now(timezone.utc).isoformat(),row['id']))
                    db.execute("DELETE FROM email_codes WHERE email=? AND purpose IN ('register','login')",(email,))
                    token = issue_token(db,row['id'])
                    db.commit()
                    return self.send(200,{'token':token,'user':public_user(row)})
                if path == '/api/auth/resend' and method == 'POST':
                    email = str(data.get('email','')).strip().lower()
                    purpose = str(data.get('purpose',''))
                    if purpose not in ('register','login','reset'):
                        return self.send(400, {'error':'Tipo de código inválido.'})
                    pending = db.execute('SELECT 1 FROM email_codes WHERE email=? AND purpose=?',(email,purpose)).fetchone()
                    if pending:
                        if not mail_ready(): return self.send(503,{'error':'El correo SMTP no está configurado.'})
                        try: otp_create(db,email,purpose)
                        except ValueError as e: return self.send(429,{'error':str(e)})
                        except Exception:
                            db.rollback()
                            return self.send(503,{'error':'No se pudo reenviar el código.'})
                    db.commit()
                    return self.send(200,{'message':'Si hay una solicitud vigente, recibirás un nuevo código.'})
                if path == '/api/auth/forgot' and method == 'POST':
                    email = str(data.get('email','')).strip().lower()
                    if not mail_ready(): return self.send(503,{'error':'El envío de correos no está configurado. Consulta backend/.env.'})
                    row = db.execute('SELECT * FROM users WHERE email=?',(email,)).fetchone() if '@' in email else None
                    if row:
                        try: otp_create(db,email,'reset')
                        except ValueError: pass  # Same answer prevents account discovery.
                        except Exception:
                            db.rollback()
                            return self.send(503,{'error':'No se pudo contactar el servicio de correo.'})
                    db.commit()
                    return self.send(200,{'message':'Si existe la cuenta, recibirás un código de recuperación.'})
                if path == '/api/auth/reset' and method == 'POST':
                    email = str(data.get('email','')).strip().lower()
                    password = data.get('new_password','')
                    problem = validate_password(password)
                    if problem:return self.send(400,{'error':problem})
                    if not otp_check(db,email,'reset',data.get('code','')):
                        db.commit()
                        return self.send(400,{'error':'Código incorrecto, vencido o demasiados intentos.'})
                    row=db.execute('SELECT id FROM users WHERE email=?',(email,)).fetchone()
                    if not row: return self.send(400,{'error':'Código inválido.'})
                    db.execute('UPDATE users SET password_hash=?,verified_at=? WHERE id=?', (hashed(password),datetime.now(timezone.utc).isoformat(),row['id']))
                    db.execute('DELETE FROM sessions WHERE user_id=?',(row['id'],))
                    db.execute('DELETE FROM email_codes WHERE email=?',(email,))
                    db.commit()
                    return self.send(200,{'message':'Contraseña actualizada. Inicia sesión con tu nueva contraseña.'})
                user = self.current_user(db)
                if not user:
                    return self.send(401, {'error':'Debes iniciar sesión.'})
                # All logged-in users may read bus telemetry. Never expose device secrets.
                if path == '/api/gps/buses' and method == 'GET':
                    now=datetime.now(timezone.utc)
                    output=[]
                    for device in db.execute('SELECT id,label,route_id FROM bus_devices ORDER BY id LIMIT 100'):
                        positions=db.execute('SELECT lat,lng,accuracy,recorded_at FROM bus_positions WHERE device_id=? ORDER BY id DESC LIMIT 150',(device['id'],)).fetchall()
                        if not positions: continue
                        last=positions[0]
                        age=(now-datetime.fromisoformat(last['recorded_at'])).total_seconds()
                        output.append({'id':device['id'],'label':device['label'],'route_id':device['route_id'],
                                       'active':0 <= age <= 120,
                                       'updated_at':last['recorded_at'],
                                       'lat':last['lat'],'lng':last['lng'],
                                       'accuracy':last['accuracy'],
                                       'trail':[{'lat':p['lat'],'lng':p['lng']} for p in reversed(positions)]})
                    return self.send(200, {'buses':output,'source':'gps_devices','demo':True})
                if path == '/api/admin/gps/devices' and method == 'GET':
                    if user['role'] != 'worker':return self.send(403, {'error':'Solo un administrador puede gestionar dispositivos GPS.'})
                    return self.send(200, {'devices':[dict(row) for row in db.execute('SELECT id,label,route_id,created_at FROM bus_devices ORDER BY id')]})
                if path == '/api/admin/gps/devices' and method == 'POST':
                    if user['role'] != 'worker':return self.send(403, {'error':'Solo un administrador puede registrar dispositivos GPS.'})
                    label,route_id=data.get('label'),data.get('route_id')
                    if not isinstance(label,str) or not 2<=len(label.strip())<=60 or not isinstance(route_id,str) or not 1<=len(route_id.strip())<=32:
                        return self.send(400,{'error':'Indica nombre de bus (2-60) y número de ruta (1-32).'} )
                    key=secrets.token_urlsafe(36)
                    cur=db.execute('INSERT INTO bus_devices(label,route_id,secret_hash) VALUES(?,?,?)',(label.strip(),route_id.strip(),hashlib.sha256(key.encode()).hexdigest()))
                    db.commit()
                    return self.send(201,{'id':cur.lastrowid,'device_key':key,'message':'Copia la clave ahora; no volverá a mostrarse.'})
                if len(parts)==5 and parts[:4]==['api','admin','gps','devices'] and parts[4].isdigit() and method=='DELETE':
                    if user['role'] != 'worker':return self.send(403,{'error':'Solo el administrador puede revocar dispositivos.'})
                    cur=db.execute('DELETE FROM bus_devices WHERE id=?',(int(parts[4]),))
                    db.commit()
                    return self.send(200 if cur.rowcount else 404,{'message':'Dispositivo revocado.'} if cur.rowcount else {'error':'No encontrado.'})
                if path == '/api/gps/tracks' and method == 'POST':
                    if user['role'] != 'worker':return self.send(403, {'error':'Solo un administrador puede registrar recorridos.'})
                    points=valid_track(data.get('points'))
                    if not points:return self.send(400,{'error':'Recorrido GPS inválido (2 a 1500 puntos, máximo 8 horas).'})
                    db.execute('INSERT INTO gps_tracks(user_id,points) VALUES (?,?)',(user['id'],json.dumps(points,separators=(',',':'))))
                    db.commit()
                    return self.send(201, {'message':'Recorrido guardado de forma privada.','points':len(points)})
                if path == '/api/gps/tracks' and method == 'GET':
                    if user['role'] != 'worker':return self.send(403, {'error':'Solo un administrador puede consultar las grabaciones.'})
                    rows=db.execute('SELECT id,created_at,points FROM gps_tracks WHERE user_id=? ORDER BY id DESC LIMIT 10',(user['id'],)).fetchall()
                    return self.send(200,{'tracks':[{'id':r['id'],'created_at':r['created_at'],'points':json.loads(r['points'])} for r in rows]})
                if len(parts)==4 and parts[:3]==['api','gps','tracks'] and method=='DELETE' and parts[3].isdigit():
                    if user['role'] != 'worker':return self.send(403, {'error':'Solo el administrador puede eliminar recorridos.'})
                    db.execute('DELETE FROM gps_tracks WHERE id=? AND user_id=?',(int(parts[3]),user['id']))
                    db.commit()
                    return self.send(200,{'message':'Recorrido eliminado.'})
                if path == '/api/auth/me' and method == 'GET':
                    return self.send(200, {'user':public_user(user)})
                if path == '/api/auth/logout' and method == 'POST':
                    auth = self.headers.get('Authorization','')[7:]
                    db.execute('DELETE FROM sessions WHERE token_hash=?', (hashlib.sha256(auth.encode()).hexdigest(),))
                    return self.send(200, {'message':'Sesión cerrada'})
                if len(parts) >= 3 and parts[:3] == ['api','admin','records']:
                    if user['role'] != 'worker':
                        return self.send(403, {'error':'Acceso solo para administradores.'})
                    if len(parts) == 3 and method == 'GET':
                        result = {name: [] for name in SECTIONS}
                        for row in db.execute('SELECT id,section,data FROM records ORDER BY id'):
                            result[row['section']].append({'_id':str(row['id']), **json.loads(row['data'])})
                        return self.send(200, result)
                    if len(parts) >= 4 and parts[3] in SECTIONS:
                        section = parts[3]
                        if len(parts) == 4 and method == 'POST':
                            value = {k: v.strip() for k,v in data.items() if k != '_id' and isinstance(v,str) and len(v) < 2000}
                            if not value or not any(value.values()):
                                return self.send(400, {'error':'Completa al menos un campo válido.'})
                            cur = db.execute('INSERT INTO records(section,data) VALUES(?,?)', (section,json.dumps(value,ensure_ascii=False)))
                            return self.send(201, {'_id':str(cur.lastrowid),**value})
                        if len(parts) == 5 and parts[4].isdigit():
                            record_id = int(parts[4])
                            if method == 'DELETE':
                                cur = db.execute('DELETE FROM records WHERE id=? AND section=?', (record_id,section))
                                return self.send(200 if cur.rowcount else 404, {'message':'Eliminado'} if cur.rowcount else {'error':'No encontrado'})
                            if method == 'PUT':
                                value = {k:v.strip() for k,v in data.items() if k!='_id' and isinstance(v,str) and len(v)<2000}
                                cur = db.execute('UPDATE records SET data=? WHERE id=? AND section=?', (json.dumps(value,ensure_ascii=False),record_id,section))
                                return self.send(200 if cur.rowcount else 404, {'_id':str(record_id),**value} if cur.rowcount else {'error':'No encontrado'})
                return self.send(404, {'error':'Ruta no encontrada'})
        except (ValueError, json.JSONDecodeError) as exc:
            return self.send(400, {'error':str(exc)})
        except sqlite3.Error:
            return self.send(500, {'error':'Error de base de datos'})

    def redirect(self, url):
        self.send_response(302)
        self.send_header('Location',url)
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Length','0')
        self.end_headers()

    def do_GET(self): self.handle_api('GET')
    def do_POST(self): self.handle_api('POST')
    def do_PUT(self): self.handle_api('PUT')
    def do_DELETE(self): self.handle_api('DELETE')

if __name__ == '__main__':
    DB.parent.mkdir(parents=True,exist_ok=True)
    init()
    print(f'Wayvo API en http://{HOST}:{PORT}', flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
