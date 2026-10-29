"""Lanza el entorno de desarrollo con soporte para Windows y autoreparación."""
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parent
target = root / "Wayvo-FullStack" / "dev.py"

# Si Wayvo-FullStack/dev.py fue reemplazado por una nueva versión sin compatibilidad con Windows, se auto-corrige:
if target.is_file():
    try:
        content = target.read_text(encoding="utf-8")
        if "shell=True" not in content and "shell=" not in content:
            content = content.replace("['npm','run','dev'],cwd=root)", "['npm','run','dev'],cwd=root,shell=True)")
            content = content.replace("['npm', 'run', 'dev'], cwd=root)", "['npm', 'run', 'dev'], cwd=root, shell=True)")
            content = content.replace("['npm','run','dev']", "['npm','run','dev'],shell=True")
            target.write_text(content, encoding="utf-8")
    except Exception:
        pass

if target.is_file():
    try:
        subprocess.run([sys.executable, str(target)], cwd=target.parent)
    except KeyboardInterrupt:
        pass
else:
    print(f"No se encontró {target}", file=sys.stderr)
    sys.exit(1)
