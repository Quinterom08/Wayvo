# Wayvo Android + iOS (Capacitor)

Este repositorio integra **Capacitor**, de manera que conserva la interfaz React existente. No contiene todavía archivos APK/IPA compilados ni ha sido probado en dispositivos físicos.

## Requisitos

- Node.js **22 o superior**; `npm install`.
- Android: Android Studio, Android SDK y JDK compatibles con Capacitor 8.
- iOS: **macOS**, Xcode y herramientas de firma de Apple.

## Configura el backend remoto

El backend Python debe estar desplegado en un servidor accesible desde Internet con **HTTPS** (por ejemplo `https://api.tu-dominio.com/api`). No se incluye hosting en este ZIP.

Crea `.env.production` en la raíz, **antes de compilar**:

```env
VITE_API_URL=https://api.tu-dominio.com/api
```

No añadas una barra final. La app la utilizará para registro, inicio de sesión y administración. La API se configura con `WAYVO_CORS_ORIGINS=capacitor://localhost,https://localhost` y puede incluir el dominio web si lo necesitas. Para un proxy inverso, encamina `/api/*` al backend en el puerto 8000. No publiques directamente el servidor Python de demostración sin HTTPS, controles de seguridad y un despliegue adecuado.

## Generar los proyectos nativos

```bash
npm install
npm run build
npx cap add android
npx cap add ios          # solo en macOS con Xcode
npm run mobile:sync
```

Para abrir cada proyecto:

```bash
npx cap open android
npx cap open ios
```

Cada vez que modifiques la interfaz, ejecuta `npm run mobile:sync`. Usa Android Studio para construir y probar Android, y Xcode para iOS. Para publicar se necesitan iconos definitivos, identificador de paquete definitivo, certificados, privacidad y cuentas de las tiendas.

## Estado funcional

La interfaz web original se ejecuta dentro de un contenedor móvil nativo. Las funciones conectadas a la API (cuentas y panel administrativo) necesitan que el backend esté desplegado y accesible. Rutas públicas, ubicación de vehículos, notificaciones, tarifas y viajes siguen mostrando demostraciones y **no** información real de transporte. Para publicar como producto final deben implementarse los datos reales, permisos nativos, controles de calidad, pruebas de dispositivos y las políticas de distribución de cada tienda.

**Nota:** los proyectos `android/` e `ios/` se crean usando el CLI y no se incluyen en este ZIP si no se han generado localmente.

## Inicio de sesión social y asistente de rutas

- Configura Google Cloud OAuth y Microsoft Entra ID con credenciales de **aplicación web confidencial**. Registra como URIs de redirección `https://api.tudominio.com/api/auth/oauth/google/callback` y `https://api.tudominio.com/api/auth/oauth/microsoft/callback`. Las claves secretas se guardan **solo** en el servidor.
- Configura las variables de `backend/.env.example` mediante el entorno del servidor (el backend ahora también lee `backend/.env` para desarrollo local). Utiliza HTTPS real y ajusta las URLs a los dominios desplegados.
- OAuth funciona con apertura del navegador del sistema y retorno con ticket temporal canjeable una vez, mediante `wayvo://auth` en Android/iOS o mediante `WAYVO_WEB_URL` en navegador. Registra el esquema URL `wayvo` en el proyecto nativo generado: Android intent-filter VIEW BROWSABLE con scheme `wayvo`, host `auth`; iOS CFBundleURLTypes con CFBundleURLSchemes `wayvo`. Valida Apple App Store / Google Play requisitos de identidad antes de publicar.
- Ejecuta `npm install && npm run build && npx cap add android && npx cap add ios && npx cap sync`. Android Studio y Xcode requieren sus respectivos entornos.
- El asistente `/api/assistant/routes` utiliza exclusivamente rutas creadas en Administración → Rutas (`nombre`, `origen`, `destino`, `paraderos`). Opcionalmente redacta la respuesta con OpenAI Responses API cuando se configura `OPENAI_API_KEY`. No envía secretos al teléfono; no inventa datos cuando falta cobertura.
- GPS: el botón solicita coordenadas del dispositivo. La conversión GPS → paradero cercano **no está implementada**; requiere mapa de paraderos con coordenadas y geocodificación/ruteo. Agrega los permisos de ubicación nativos antes de publicar.
- Pendiente de producción: vinculación segura de cuentas preexistentes, protección contra abuso/rate-limit, PostgreSQL y HTTPS en producción, revisión legal de ubicación, catálogo georreferenciado y horarios verificados, pruebas OAuth y GPS en dispositivos físicos. No son APK/IPA compilados.


## Actualización: Google Maps + chat

Consulta [ACTUALIZACION_MAPA_IA.md](ACTUALIZACION_MAPA_IA.md) para la nueva pantalla inicial, restricciones de claves de Maps y `POST /api/assistant/chat`. En WebView comprueba la compatibilidad de la clave con el origen de la app y los permisos GPS.
