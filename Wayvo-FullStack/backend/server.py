"""Wayvo API: Python standard library + SQLite. Python 3.10+."""
import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit, urlencode, parse_qs
from urllib.request import Request, urlopen
from urllib.error import HTTPError

BASE = Path(__file__).resolve().parent
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
        ''')
        # Bootstrap admin credentials are created ONLY when explicitly supplied.
        email = os.environ.get('WAYVO_ADMIN_EMAIL', '').strip().lower()
        password = os.environ.get('WAYVO_ADMIN_PASSWORD', '')
        if email and len(password) >= 12 and not db.execute('SELECT id FROM users WHERE email=?', (email,)).fetchone():
            db.execute('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)', ('Administrador', email, hashed(password), 'worker'))

def issue_token(db, user_id):
    token = secrets.token_urlsafe(32)
    expiry = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    db.execute('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), user_id, expiry))
    return token

def public_user(row):
    return {'name': row['name'], 'email': row['email'], 'isAdmin': row['role'] == 'worker'}

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
        if length > 32768:
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
            WHERE s.token_hash=? AND s.expires_at>?''', (digest, datetime.now(timezone.utc).isoformat())).fetchone()
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
                    return self.send(200,{'token':issue_token(db,row['id']),'user':public_user(row)})
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
                if path == '/api/auth/register' and method == 'POST':
                    name, email, password = str(data.get('name','')).strip(), str(data.get('email','')).strip().lower(), str(data.get('password',''))
                    if not name or len(name) > 120 or '@' not in email or len(email) > 255 or len(password) < 8:
                        return self.send(400, {'error':'Datos inválidos. La contraseña debe tener 8 caracteres como mínimo.'})
                    if db.execute('SELECT id FROM users WHERE email=?', (email,)).fetchone():
                        return self.send(409, {'error':'Ya existe una cuenta con ese correo.'})
                    db.execute('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)', (name,email,hashed(password),'client'))
                    return self.send(201, {'message':'Cuenta creada correctamente'})
                if path == '/api/auth/login' and method == 'POST':
                    email, password = str(data.get('email','')).strip().lower(), str(data.get('password',''))
                    row = db.execute('SELECT * FROM users WHERE email=?', (email,)).fetchone()
                    if not row or not password_ok(password, row['password_hash']):
                        return self.send(401, {'error':'Correo o contraseña incorrectos.'})
                    return self.send(200, {'token':issue_token(db,row['id']), 'user':public_user(row)})
                if path == '/api/auth/forgot' and method == 'POST':
                    # No account-enumeration. An email provider + reset-token workflow must be configured before production use.
                    return self.send(200, {'message':'Si existe una cuenta, recibirás instrucciones cuando se configure el correo.'})
                user = self.current_user(db)
                if not user:
                    return self.send(401, {'error':'Debes iniciar sesión.'})
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
