# Actualización de Wayvo desde tu ZIP (Firebase Google + GPS)

Esta versión se basó **únicamente en el ZIP que compartiste**. No sustituye el diseño de ingreso de Wayvo, no toca la animación del bus, y mantiene el login de correo/contraseña + verificación de 6 dígitos.

## Qué cambió

- **Login Wayvo**: exactamente el mismo formulario y correo OTP de antes.
- **Google**: botón separado «Continuar con Google», con ventana de Firebase Authentication en navegador web. El backend comprueba la **firma y el proyecto** del token de Firebase antes de permitir el siguiente paso de Wayvo (código por correo). No se vinculan cuentas locales existentes automáticamente.
- **Microsoft**: botón y procesamiento OAuth de Microsoft eliminados de la app/servidor.
- **GPS**: botón «Mi GPS» disponible también en el mapa pequeño del inicio y en el mapa completo. Tras conceder permiso, actualiza tu posición visual en el mapa mientras esté abierto. No guarda recorridos de pasajeros, no envía sus coordenadas como si fueran un bus, ni afecta al GPS automático de buses.
- **Firebase**: se añadió la dependencia `firebase` al `package.json` de `Wayvo-FullStack/` (antes solo estaba en el `package.json` exterior).

## Cómo actualizar SIN tocar tu configuración

**Recomendado: `Wayvo-PARCHE-Google-GPS.zip`.**

1. Haz commit en tu rama `mobile` o una copia de respaldo.
2. Descomprime el parche en la carpeta **exterior `Wayvo-Mobile-Android-iOS`**, la que contiene `Wayvo-FullStack/`.
3. Copia los archivos y permite sobrescribir **solo** los archivos incluidos en el parche.
4. El parche no contiene `.env`, `.git`, SQLite, claves, bases de datos ni `node_modules`.
5. En la terminal entra a `Wayvo-FullStack/` y ejecuta:

```bash
python -m pip install -r backend/requirements.txt
npm install
python dev.py
```

No hace falta volver a crear Firebase: `src/firebase.ts` mantiene la configuración que pusiste. No sustituyas tu `backend/.env`.

## Configuración de Firebase necesaria

En Firebase Console → **Authentication → Sign-in method**, habilita **Google**. En **Settings → Authorized domains** agrega el dominio desde el que abres la web; para pruebas agrega `localhost` si no está autorizado. El backend comprueba los tokens para el proyecto `wayvo-fde6b`. Si cambias de proyecto, establece `WAYVO_FIREBASE_PROJECT_ID` en tu `backend/.env`.

La autenticación de Google mediante Firebase funciona en **navegadores web compatibles**, incluido Safari si el navegador permite la ventana emergente. En la aplicación **Capacitor instalada** se conserva el flujo OAuth nativo anterior como alternativa, pero este requiere por separado `WAYVO_PUBLIC_API_URL`, `WAYVO_GOOGLE_CLIENT_ID` y `WAYVO_GOOGLE_CLIENT_SECRET` en el backend y el deep link `wayvo://auth` configurado en iOS/Android. No se ha probado un binario iOS/Android instalado con Google en esta entrega.

**Importante:** si tu correo ya está registrado con contraseña Wayvo, Google no lo vincula automáticamente por seguridad. Sigue usando el inicio de sesión normal. Vincular cuentas existentes requiere una función administrativa/autenticada específica, no puede resolverse comparando correos sin comprobar propiedad de ambas cuentas.

## GPS de usuarios vs. GPS de buses

- «Mi GPS» activa la ubicación del teléfono y la **muestra localmente**. Solicita permiso al tocarlo. Sigue siendo una ubicación aproximada, cuya precisión depende del dispositivo y la señal.
- Los buses reportan coordenadas por separado mediante sus dispositivos autorizados y sus posiciones se actualizan desde el servidor.
- Las grabaciones GPS manuales siguen limitadas a administradores, como en tu versión anterior.
- En **iPhone Safari** la geolocalización requiere **HTTPS** o `localhost` en el mismo dispositivo. Abrir `http://192.168.x.x:5173` desde el iPhone no cumple esta condición. Para pruebas usa una URL HTTPS válida o una app nativa correctamente configurada.
- Esto no implementa GPS persistente en segundo plano ni convierte al pasajero en rastreador de bus.

## Qué se ha probado

- 21 pruebas automatizadas de Python: autenticación, OTP, GPS de bus, permisos, recomendaciones y firma/verificación local de tokens de Firebase.
- Transpilación de sintaxis TypeScript/TSX en los archivos modificados.
- **No** se pudo completar `npm install` ni la compilación de Vite en este entorno (dependencias agotaron el tiempo). **No** se ha probado con tu Gmail real, tu Firebase real ni un iPhone físico.

Si ejecutas los comandos en tu equipo y aparece algún error, envía el texto del error **sin adjuntar `.env` ni credenciales**.
