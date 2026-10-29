# Wayvo v1.1 — Correo seguro, recuperar contraseña y grabación GPS

## 1. Importante antes de iniciar

Esta versión **requiere envío de correo operativo** para completar registro o inicio de sesión. No entrega sesiones mientras falte la verificación de seis dígitos. Si no configuras SMTP, verás un error informativo y no podrás entrar con email ni con Google/Microsoft (el segundo factor también se aplica a las cuentas sociales).

- Registro: nombre, email y contraseña → correo con código → validar seis dígitos → ingresar.
- Iniciar sesión: email y contraseña → nuevo código por correo → validar → ingresar.
- Recuperación: ingresar email → código → nueva contraseña → volver al acceso. Las sesiones previas se anulan.
- Códigos de 6 dígitos, válidos **10 minutos**, con **5 intentos** y **60 segundos** entre reenvíos. La respuesta de recuperación no confirma si el correo existe.
- Contraseñas nuevas entre **8 y 12 caracteres**, con mayúscula, minúscula, número y carácter especial y sin espacios. La regla se valida también en el backend. Contraseñas previas de más de 12 caracteres se aceptan para iniciar sesión si ya existían, pero para cambiarlas se aplica el nuevo límite.
- La plantilla del correo es HTML responsive, con colores Wayvo, compatible con correo tipo Gmail; además incluye versión de texto plano. Puedes abrir `EMAIL_EJEMPLO_RECUPERACION.html` para ver una demostración con código ficticio.

## 2. Configurar envío real con Gmail / SMTP

1. Dentro de `backend`, copia `.env.example` y crea un archivo **`.env`** (NO lo subas a GitHub).
2. Configura estas variables (cambia los valores de ejemplo):

```dotenv
WAYVO_MAIL_MODE=smtp
WAYVO_SMTP_HOST=smtp.gmail.com
WAYVO_SMTP_PORT=587
WAYVO_SMTP_FROM=Wayvo <tucorreo@gmail.com>
WAYVO_SMTP_USER=tucorreo@gmail.com
WAYVO_SMTP_PASSWORD=TU_CONTRASENA_DE_APLICACION
```

Para usar el SMTP de Gmail, la cuenta suele necesitar **verificación en dos pasos** y, cuando esté disponible para tu cuenta, una **contraseña de aplicación**. No uses la contraseña habitual de Gmail. En organizaciones académicas la función puede estar bloqueada; también puedes utilizar otro proveedor SMTP transaccional. Consulta la documentación de Google: https://support.google.com/accounts/answer/185833?hl=es

La clave SMTP debe guardarse **únicamente en `backend/.env` o variables del servidor**, nunca en el frontend (`VITE_*`), ni en un repositorio, ni en un chat. El backend escucha en localhost durante el desarrollo. Si quieres usarlo desde el iPhone, despliega un backend HTTPS y configura `VITE_API_URL=https://tu-servidor/api` en la compilación de la app.

### Pruebas locales sin credenciales de correo

Los tests usan **outbox local** para inspeccionar los códigos sin enviar mensajes. Ese modo solo funciona si `WAYVO_HOST` es `127.0.0.1` o `localhost`. Si quieres usarlo temporalmente, agrega en `backend/.env`:

```dotenv
WAYVO_MAIL_MODE=outbox
WAYVO_MAIL_OUTBOX=C:/Wayvo/correos-prueba
WAYVO_SMTP_FROM=Wayvo <pruebas@wayvo.local>
```

Los archivos `.eml` aparecerán en esa carpeta **solo en tu computador**. Esto NO equivale a enviar emails reales; para demostraciones con Gmail cambia de nuevo a SMTP.

## 3. GPS: grabar un recorrido real (no simulado)

En la pantalla **Mapa** de Wayvo encontrarás:

- **Iniciar**: solicita permiso de ubicación y comienza a leer posiciones reales mediante `navigator.geolocation.watchPosition`.
- **Detener**: finaliza la grabación.
- **Guardar**: almacena los puntos explícitamente en SQLite vinculados a la cuenta conectada.
- **Borrar**: elimina el dibujo local (no borra recorridos ya guardados).
- **Historial**: consulta los últimos 10 recorridos de la cuenta, los muestra sobre Leaflet y permite eliminarlos del servidor.

El mapa muestra la traza, distancia aproximada en km, número de puntos y precisión GPS. Filtra mediciones con precisión peor a 100 m, saltos grandes y cambios por debajo de 5 m, para disminuir errores del GPS.

**Atención a iPhone:** para usar geolocalización desde Safari, abre la app desde una dirección **HTTPS** con certificado válido. `http://192.168.x.x:5173` no es un origen seguro, aunque funcione el mapa; en esa dirección Safari puede bloquear la grabación GPS. Otorga permiso de localización en iOS. El seguimiento ocurre **solo mientras la página está activa**, no es rastreo permanente en segundo plano ni GPS de un bus remoto.

En una compilación nativa Capacitor hay que configurar los permisos iOS/Android y probar en dispositivo físico; en iOS es necesario añadir una descripción como `NSLocationWhenInUseUsageDescription` en `Info.plist`. Dependiendo de la plataforma puede convenir integrar el plugin oficial `@capacitor/geolocation` para un resultado nativo fiable. Esta versión usa la API Web de geolocalización y **no incluye rastreo nativo en segundo plano**.

Las rutas ficticias de buses (WV-301, etc.) siguen siendo datos demostrativos y son independientes de la traza del usuario.

## 4. Arranque y pruebas

```bash
npm install
python dev.py
```

Abre `http://localhost:5173` en el equipo de desarrollo. Si SMTP no está listo, configúralo primero para poder registrar e iniciar sesión.

Pruebas del backend (correo simulado solo durante el test):

```bash
python -m unittest discover -s backend -p 'test_*.py' -v
```

## 5. Notas de seguridad y privacidad

- Los códigos son de un solo uso, tienen caducidad, se guardan hasheados (scrypt) y nunca se muestran en respuestas de la API.
- Las solicitudes de autenticación tienen limitación de frecuencia básica por IP. Para Internet público conviene completar la protección con un proxy HTTPS, límites distribuidos, políticas contra bots, rotación de sesiones y auditorías.
- No se guardan localizaciones GPS sin que el usuario pulse “Guardar”. No recolectamos datos GPS de forma silenciosa. Cada usuario solo puede consultar y eliminar sus propios recorridos.
- Los recorridos GPS son datos de ubicación precisos y sensibles: para un producto real se necesitarán una política de retención, consentimiento, cifrado/controles de almacenamiento y opción visible de borrar registros del servidor.

## 6. Estado de verificación

- Pruebas automatizadas del backend y validadores completadas con un servidor local y buzón de pruebas.
- Sintaxis TSX comprobada mediante compilador TypeScript en modo `transpileModule`.
- **Pendiente**: `npm install`, `npm run build`, pruebas visuales en Safari/iPhone, pruebas SMTP con una cuenta real y pruebas de permisos nativos Capacitor.
