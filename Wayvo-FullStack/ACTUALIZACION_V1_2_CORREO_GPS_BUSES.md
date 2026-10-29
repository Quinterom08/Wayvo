# Wayvo v1.2 · Correos reales y GPS administrado por buses

## 1. Activar el envío de códigos a Gmail (OBLIGATORIO)

La app mantiene los códigos de **6 dígitos por correo** para registrarse, entrar y recuperar la contraseña. Si el correo no está configurado, Wayvo **rechaza el acceso**: no existe bypass de verificación.

**Necesitas una cuenta remitente autorizada**, por ejemplo una cuenta Gmail exclusiva para el proyecto. Gmail SMTP no es una API gratuita e ilimitada para envíos comerciales; para el proyecto académico o pocas pruebas puede servir. Una contraseña normal del Gmail no sirve para SMTP tradicional; Google permite, en cuentas elegibles, crear **contraseñas de aplicación de 16 caracteres** con verificación en dos pasos. Si tu institución bloquea la opción, usa un servicio de correo transaccional con SMTP. Referencia oficial: https://support.google.com/accounts/answer/185833?hl=es.

1. Entra a Google Account > Seguridad; activa verificación en dos pasos y, si tu cuenta ofrece la opción, crea una **contraseña de aplicación** para Wayvo.
2. Crea `backend/.env` copiando el archivo `backend/.env.example` y reemplaza los valores de ejemplo:

```dotenv
WAYVO_MAIL_MODE=smtp
WAYVO_SMTP_HOST=smtp.gmail.com
WAYVO_SMTP_PORT=587
WAYVO_SMTP_FROM=Wayvo <remitente@gmail.com>
WAYVO_SMTP_USER=remitente@gmail.com
WAYVO_SMTP_PASSWORD=contraseña_de_aplicación_de_Google
```

3. Reinicia el backend (`python dev.py` desde la raíz). En otra terminal, desde la raíz, **comprueba primero el envío real**:

```bash
python backend/check_email.py tucorreo@gmail.com
```

El script envía un correo de **prueba**, que NO es un código de inicio de sesión. Confirma en la bandeja y en Spam que realmente llegó. El mensaje de éxito indica aceptación por SMTP, no entrega definitiva en buzón. A continuación prueba registro e inicio de sesión en Wayvo: Gmail debe entregar el código de 6 dígitos generado en el backend.

**Nunca subas `backend/.env` a GitHub, no compartas tu contraseña de aplicación en chats, ni la pongas en `VITE_*` ni en el frontend.** Para celular real, la API debe estar accesible mediante HTTPS.

Si sale un error:
- `SMTPAuthenticationError`: contraseña de aplicación inválida, cuenta incorrecta o políticas Google.
- `SMTPConnectError` / tiempo de conexión: red o puerto bloqueado; prueba 465 con SSL (el backend lo admite).
- `SMTPRecipientsRefused`: destinatario rechazado; revisa la dirección.
- El correo se acepta pero no aparece: revisa Spam, filtros y límites del proveedor.

El backend no puede enviar correos desde una cuenta Gmail sin configurar el remitente y sus credenciales. Las pruebas automatizadas usan una bandeja local, no envío Gmail real.

## 2. Permisos GPS

| Usuario | Lo que puede hacer |
|---|---|
| Pasajero | Ver mapa, rutas ilustrativas, ubicación propia (al permitirla), buses vinculados y sus trayectos |
| Administrador (`isAdmin`) | Todo lo anterior y, además, registrar/guardar recorridos manualmente y crear/revocar dispositivos GPS de buses |
| GPS del bus | Reportar latitud/longitud a la API con una clave específica del dispositivo; no puede administrar usuarios/rutas |

La **autorización se valida en el backend**, no solo ocultando botones en la interfaz.

### Crear administrador

En `backend/.env`, antes de iniciar la app por primera vez con una base de datos nueva:

```dotenv
WAYVO_ADMIN_EMAIL=admin@ejemplo.com
WAYVO_ADMIN_PASSWORD=Cambia9!Aa
```

Debe ser una contraseña fuerte de 8 a 12 caracteres. Al arrancar `python dev.py`, el backend crea la cuenta administradora si no existe. Después del primer arranque, elimina la contraseña de admin de `.env` y guarda la contraseña en un gestor seguro. El administrador también valida su código enviado al correo para iniciar sesión.

**Si ya existe una cuenta cliente con ese correo, no se convertirá automáticamente en admin.** Usa un correo diferente o gestiona una migración controlada; no modifiques roles desde el frontend.

### Cómo vincular un GPS a un bus

1. Inicia sesión como administrador.
2. Abre `Administración` > `GPS de buses`.
3. Escribe nombre del bus y número de ruta. Pulsa `Registrar GPS de bus`.
4. Copia la **clave de dispositivo** mostrada una sola vez y guárdala en el hardware/configuración del emisor.
5. El emisor o un adaptador HTTPS manda una posición cada 4–10 segundos a:

`POST https://tu-api/api/gps/device/position`

Cabeceras: `Content-Type: application/json` y `X-Wayvo-Device-Key: <clave_del_dispositivo>`

Cuerpo de ejemplo (datos ficticios, no una ubicación real):

```json
{"lat":6.25,"lng":-75.57,"accuracy":12}
```

El servidor almacena automáticamente las posiciones, limita la frecuencia a una cada 2 segundos por dispositivo y retiene las últimas 500. Los clientes consultan `GET /api/gps/buses` con sesión válida; el frontend actualiza cada 6 segundos mientras la pestaña está visible. Las posiciones se marcan **GPS activo** solo si son recientes (menos de 2 minutos), y si la transmisión se corta, el marcador se conserva como última posición conocida (no se afirma que esté en vivo).

Para un **GPS físico** debes saber si tu rastreador admite webhooks HTTPS o si necesita un adaptador para su protocolo (TCP/UDP/vendor API). Sin ese dato no se puede conectar mágicamente el hardware. Las claves deben viajar exclusivamente por HTTPS fuera de localhost. No conectes directamente el GPS del pasajero como si fuera un bus.

### Simulación automática para la exposición

Si no tienes hardware todavía, esta versión trae un **emisor simulado** que publica una ruta académica en segundo plano mientras ejecutas el programa; no exige pulsar Iniciar/Detener en la pantalla.

En el panel admin crea `Bus académico 01`, ruta `302`, copia la clave. En una **terminal nueva**:

**PowerShell (Windows)**

```powershell
$env:WAYVO_DEVICE_KEY="PEGA_AQUI_LA_CLAVE_CREADA"
$env:WAYVO_GPS_API="http://127.0.0.1:8000/api"
python backend/demo_bus_gps.py
```

**Linux/macOS**

```bash
WAYVO_DEVICE_KEY="PEGA_AQUI_LA_CLAVE_CREADA" WAYVO_GPS_API="http://127.0.0.1:8000/api" python backend/demo_bus_gps.py
```

Abre el mapa como pasajero y verás el bus actualizarse cada ~6 segundos. Para detener la demostración, usa Ctrl+C en la terminal del simulador. Con hardware real esta función se sustituye por el envío automático del GPS embarcado; no se ejecuta el script de demo.

## 3. Límites de esta entrega

- El código del sistema de correo funciona y tiene pruebas automatizadas con outbox, pero **el envío a Gmail sigue pendiente de configurar y probar con tu cuenta remitente**.
- La recepción/almacenamiento/visualización automática de GPS se implementó; **no hay un GPS físico conectado** ni seguimiento nativo permanente en segundo plano.
- El mapa mantiene rutas ilustrativas independientes del historial GPS. No se han validado rutas oficiales.
- Precisión GPS depende de hardware, antena y entorno. No prometemos ubicación exacta.
- Para una app pública faltan autorización/consentimiento del operador, retención, monitoreo, auditoría y despliegue HTTPS estable.

## 4. Pruebas

```bash
python -m unittest discover -s backend -p 'test_*.py' -v
```

Las pruebas cubren inicio de sesión con códigos, recuperación, autorización admin, claves de dispositivos y visualización de posiciones. La compilación completa de frontend y las pruebas en iPhone/dispositivo GPS siguen pendientes.
