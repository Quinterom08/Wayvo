# Wayvo — configuración para ejecutar y activar el inicio de sesión

## 1. Registro e inicio de sesión (local)

Requisitos: Python 3.10+ y Node.js 22+. En la raíz del proyecto:

```bash
npm install
python dev.py
```

Visita `http://localhost:5173`. `dev.py` arranca el backend en `http://127.0.0.1:8000` y el frontend en el puerto 5173; el proxy de Vite dirige `/api` hacia el servidor. **No abras solamente `index.html` ni la compilación estática**: sin una API operativa no se puede crear una cuenta.

Diagnóstico: abre `http://localhost:8000/api/health` y comprueba que devuelva `{"status":"ok","database":"sqlite"}`. Las cuentas locales persisten en `backend/wayvo.sqlite3`.

## 2. Google y Microsoft (OAuth real)

Estos botones abren los proveedores oficiales mediante OAuth. **No es posible autenticar cuentas reales sin registrar la aplicación y configurar las credenciales del propietario.** En lugar de mostrar un error genérico, Wayvo ahora explica si falta esa configuración.

En Google Cloud configura la pantalla de consentimiento y crea un OAuth Client ID de tipo Web Application. En Microsoft Entra, registra una aplicación y crea un Client Secret. En cada servicio agrega las URL exactas de callback (HTTPS):

- `https://TU-API/api/auth/oauth/google/callback`
- `https://TU-API/api/auth/oauth/microsoft/callback`

Configura estas variables de entorno **del backend** (no las incluyas en React):

```env
WAYVO_PUBLIC_API_URL=https://TU-API
WAYVO_WEB_URL=https://TU-WEB
WAYVO_GOOGLE_CLIENT_ID=...
WAYVO_GOOGLE_CLIENT_SECRET=...
WAYVO_MICROSOFT_CLIENT_ID=...
WAYVO_MICROSOFT_CLIENT_SECRET=...
WAYVO_MICROSOFT_TENANT=common
WAYVO_CORS_ORIGINS=https://TU-WEB,capacitor://localhost,https://localhost
```

**Importante:** el servidor Python no carga archivos `.env` por sí mismo; exporta las variables desde el sistema, un servicio de hosting o un gestor de secretos. No subas secretos al repositorio. Prueba `https://TU-API/api/auth/oauth/google/status` y `/microsoft/status`: `configured` deberá ser `true`.

## 3. Android e iOS

El móvil necesita una API HTTPS pública. Antes de compilar crea `.env.production` en la raíz:

```env
VITE_API_URL=https://TU-API/api
```

Después ejecuta `npm run build`, `npx cap add android` / `npx cap add ios` y `npx cap sync`. Para regresar desde la web de Google/Microsoft hasta la app, registra `wayvo://auth` en los esquemas deep-link de Android e iOS (consulte `MOBILE.md`). El inicio de sesión **no está verificado en dispositivos reales** hasta realizar estos pasos.

Seguridad y publicación: para producción son necesarias pruebas de integración OAuth reales, HTTPS, bloqueo de solicitudes abusivas, política de privacidad y mecanismo seguro de vinculación de cuentas ya existentes. No se auto-vinculan correos de proveedores con contraseñas locales para evitar apropiación de cuentas.
