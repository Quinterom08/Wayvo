"""Lanza el entorno de desarrollo delegando en Wayvo-FullStack/dev.py"""
import subprocess
import sys
from pathlib import Path

target = Path(__file__).resolve().parent / "Wayvo-FullStack" / "dev.py"
if target.is_file():
    try:
        subprocess.run([sys.executable, str(target)])
    except KeyboardInterrupt:
        pass
else:
    print(f"No se encontró {target}", file=sys.stderr)
    sys.exit(1)
