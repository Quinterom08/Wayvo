# Wayvo — frontend + backend

Aplicación de transporte urbano basada en la interfaz React recibida. Conserva el diseño y navegación originales, y añade una API persistente para autenticación y administración.

## Requisitos

- Node.js 20+ y npm
- Python 3.10+ (sin paquetes adicionales)

## Ejecutar localmente

1. Abre una terminal en `Wayvo-FullStack/` e inicia el backend:

   ```bash
   # macOS / Linux:
   export WAYVO_ADMIN_EMAIL="admin@tudominio.com"
   export WAYVO_ADMIN_PASSWORD="elige-una-clave-de-12-o-mas-caracteres"
   python3 backend/server.py
   ```

   En PowerShell:

   ```powershell
   $env:WAYVO_ADMIN_EMAIL="admin@tudominio.com"
   $env:WAYVO_ADMIN_PASSWORD="elige-una-clave-de-12-o-mas-caracteres"
   python backend/server.py
   ```

   Las credenciales iniciales se crean solo si no existe un usuario con ese correo. **No publiques credenciales en un repositorio.**

2. En otra terminal, dentro de la misma carpeta:

   ```bash
   npm install
   npm run dev
   ```

3. Abre `http://localhost:5173`. La API escucha en `http://127.0.0.1:8000`; Vite redirige `/api` automáticamente.

4. Registra un usuario o accede con la cuenta administradora que configuraste.

## Funcionalidades conectadas a la API

- Registro de usuarios en SQLite con contraseñas cifradas mediante scrypt + sal aleatoria.
- Inicio de sesión, persistencia de sesión por token, verificación de sesión y cierre de sesión.
- Roles de cliente y administrador; las operaciones administrativas exigen el rol apropiado en el servidor.
- Alta, listado, modificación vía API y eliminación de registros de las ocho secciones del panel administrativo.
- Base de datos persistente en `backend/wayvo.sqlite3` (se crea sola, no debe subirse al repositorio).

## Endpoints

| Método | Endpoint | Uso |
|---|---|---|
| GET | `/api/health` | Estado del backend |
| POST | `/api/auth/register` | Registro de cliente |
| POST | `/api/auth/login` | Inicio de sesión y token |
| GET | `/api/auth/me` | Usuario autenticado |
| POST | `/api/auth/logout` | Revocar token |
| POST | `/api/auth/forgot` | Respuesta neutra (recuperación por correo aún no conectada) |
| GET | `/api/admin/records` | Todas las secciones (administrador) |
| POST | `/api/admin/records/{seccion}` | Crear registro (administrador) |
| PUT | `/api/admin/records/{seccion}/{id}` | Modificar registro (administrador) |
| DELETE | `/api/admin/records/{seccion}/{id}` | Eliminar registro (administrador) |

## Alcance y pendientes

Esta es una **primera integración funcional**, no un sistema de transporte listo para producción. El mapa y las posiciones de buses siguen siendo simulaciones, y rutas/tarifas/vehículos/notificaciones presentados en las pantallas públicas siguen viniendo de las constantes del frontend; los registros creados en administración se guardan en SQLite pero aún no alimentan esas pantallas. La búsqueda de viajes también es demostrativa. La recuperación de contraseña **no envía correos** hasta integrar un proveedor de email con tokens de restablecimiento.

Antes de publicar: conectar los catálogos públicos a la base de datos; añadir validación por esquema, limitación de intentos de inicio de sesión, HTTPS, gestión de cookies/sesiones más robusta, respaldo de BD, correo de recuperación y pruebas automatizadas. Para local se usa SQLite; en producción puede migrarse a PostgreSQL.

> Nota: las tarifas y alertas preexistentes son datos de muestra, no información oficial en tiempo real.

## Aplicación Android / iOS

Se añadió configuración de Capacitor para empaquetar la misma interfaz como app móvil. Consulta [MOBILE.md](MOBILE.md) para requisitos, conexión a la API HTTPS, creación de los proyectos nativos y limitaciones.
