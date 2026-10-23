# Wayvo v1.0 — Navegación móvil sin barra inferior + Ruta Express visible

## Lo que cambia

- Eliminada **por completo** la barra de navegación inferior. Ya no se repiten accesos que están en Inicio.
- El logo de Wayvo está dentro del contenido del Inicio: **no existe una segunda cabecera global fija**. Las demás pantallas usan sus cabeceras locales, cuando corresponde.
- Toca el **mapa de la portada** o el botón **Ver mapa completo** para abrir el mapa a pantalla completa; allí está **Volver al inicio**.
- La tarjeta **¿A dónde vamos hoy?** abre Wayvo IA. Las tarjetas inferiores abren **Perfil, Vehículos, Tarifas, Favoritos, Avisos** y, solo para administradores, **Administración**.
- En **Wayvo IA**, **RUTA EXPRESS v1.0** aparece **al principio del panel desplazable**, arriba de los mensajes. No desaparece al entrar por culpa del desplazamiento automático del chat. Puedes escoger **origen y destino**, intercambiarlos y tocar **Encontrar mi bus**.
- Añadidos indicadores de carga y un botón para **reintentar paraderos** si el backend no responde.
- Corregidas medidas móviles con `100dvh`, observación de `visualViewport` para teclado, zonas seguras (`viewport-fit=cover`) y selectores a 16px para evitar zoom automático en Safari iOS.

## Cómo instalar correctamente la actualización

**IMPORTANTE:** v0.9 y v1.0 son carpetas de proyecto completas; no copies solo el ZIP sobre el ZIP anterior ni abras la carpeta antigua. Si ves v0.9, estás ejecutando una versión anterior.

1. Descomprime `Wayvo-v1.0-Navegacion-iPhone-Ruta-Express.zip` en una **carpeta nueva**.
2. En VS Code, abre **la carpeta `Wayvo-FullStack` del ZIP nuevo**, donde están `dev.py`, `package.json` y `src/`.
3. En la terminal ejecuta:

   ```bash
   npm install
   python dev.py
   ```

   En Windows también puedes usar `py dev.py`.
4. Abre `http://localhost:5173` en el computador.
5. Para verlo en iPhone en la **misma red Wi-Fi**, abre `http://IP_LOCAL_DEL_COMPUTADOR:5173` (por ejemplo, `http://192.168.1.20:5173`). **`localhost` en el iPhone significa el propio teléfono**. Revisa los permisos del firewall de Windows para el puerto 5173 si hace falta.
6. Recarga Safari o abre una pestaña privada para evitar una versión en caché. En Inicio debe verse **V1.0** junto al logo. En Wayvo IA debe verse **RUTA EXPRESS v1.0**.
7. Prueba **Bello → Envigado** (directo WV-302) y **Laureles → Envigado** (con transbordo), siempre como datos ficticios.

## Si Ruta Express se ve pero no puede buscar

El formulario consulta a `GET /api/assistant/stops` y `POST /api/assistant/quick-route`; **necesita el backend y sesión iniciada**. Arranca con `python dev.py` (ambos procesos), no solo `npm run dev`, salvo que ejecutes el backend en otra terminal. Si la API no está disponible, ahora el formulario indica el fallo y permite reintentar.

En un proyecto **compilado como app nativa** con Capacitor debes configurar `VITE_API_URL=https://URL-PUBLICA-DE-TU-BACKEND/api` antes de compilar (como se explica en `MOBILE.md`). Una app instalada en iOS/Android no puede acceder al backend del computador mediante `localhost`.

El GPS del navegador en iPhone normalmente requiere **HTTPS** o un origen seguro; el mapa puede verse sobre la red local, pero pedir ubicación desde una IP HTTP puede fallar. Esto es una restricción del navegador, no un fallo del mapa.

## Comprobaciones en el repositorio

```bash
python -m unittest discover -s backend -p 'test_*.py' -v
```

El código se revisó sintácticamente con TypeScript `transpileModule`, pero **no se verificó compilación completa ni funcionamiento en Safari físico** en este entorno porque `npm install` no terminó. No confundir revisión de código con pruebas de dispositivos.
