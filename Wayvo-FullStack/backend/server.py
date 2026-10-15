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
from urllib.parse import unquote, urlsplit

BASE = Path(__file__).resolve().parent
DB = Path(os.environ.get('WAYVO_DB', str(BASE / 'wayvo.sqlite3')))
PORT = int(os.environ.get('WAYVO_PORT', '8000'))
HOST = os.environ.get('WAYVO_HOST', '127.0.0.1')
# Comma-separated HTTPS origins; e.g. https://wayvo.example.com.
# capacitor://localhost (iOS) and https://localhost (Android) are local app origins.
ALLOWED_ORIGINS = set(x.strip() for x in os.environ.get('WAYVO_CORS_ORIGINS', 'capacitor://localhost,https://localhost').split(',') if x.strip())
SECTIONS = {'Usuarios', 'Empresas', 'Buses', 'Rutas', 'Paraderos', 'Tarifas', 'Reportes', 'Notificaciones'}

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

    def do_GET(self): self.handle_api('GET')
    def do_POST(self): self.handle_api('POST')
    def do_PUT(self): self.handle_api('PUT')
    def do_DELETE(self): self.handle_api('DELETE')

if __name__ == '__main__':
    DB.parent.mkdir(parents=True,exist_ok=True)
    init()
    print(f'Wayvo API en http://{HOST}:{PORT}', flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
