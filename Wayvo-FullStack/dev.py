"""Ejecuta la API y Vite juntos: python dev.py (requiere npm install)."""
import subprocess, sys, signal
from pathlib import Path
root=Path(__file__).resolve().parent
api=subprocess.Popen([sys.executable,str(root/'backend/server.py')],cwd=root)
try:
    web=subprocess.Popen(['npm','run','dev'],cwd=root)
    print('Wayvo en http://localhost:5173 — API en http://localhost:8000',flush=True)
    web.wait()
except KeyboardInterrupt: pass
finally:
    api.terminate()
    try: web.terminate()
    except NameError: pass
    api.wait(timeout=5)
