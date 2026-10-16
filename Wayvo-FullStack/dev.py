"""Ejecuta la API y Vite juntos: python dev.py (requiere npm install)."""
import subprocess, sys, shutil
from pathlib import Path

root = Path(__file__).resolve().parent
api = subprocess.Popen([sys.executable, str(root / 'backend/server.py')], cwd=root)
npm_cmd = shutil.which('npm') or ('npm.cmd' if sys.platform == 'win32' else 'npm')

try:
    web = subprocess.Popen([npm_cmd, 'run', 'dev'], cwd=root)
    print('Wayvo en http://localhost:5173 — API en http://localhost:8000', flush=True)
    web.wait()
except KeyboardInterrupt:
    pass
finally:
    api.terminate()
    try:
        web.terminate()
    except Exception:
        pass
    try:
        api.wait(timeout=5)
    except Exception:
        api.kill()
    try:
        web.wait(timeout=5)
    except Exception:
        pass

