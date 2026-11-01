# WAYVO v1.3 — Expo Edition

Última actualización funcional antes del **parche de estabilidad**. Este paquete se aplicó sobre la base que compartiste y los parches de Google/GPS y vinculación Google posteriores.

## Qué cambia

1. **IA y Ruta Express → Mapa**: al obtener una ruta válida aparece **«Ver recorrido y mi GPS»**; el chat incluye el mismo botón para recomendaciones reconocidas. El mapa enfoca todos los buses del viaje, muestra paraderos de subida/bajada, conecta visualmente el GPS con el paradero estimado más próximo del primer tramo e indica la distancia en línea recta.
2. **Respuestas del chat**: elimina la introducción que repite origen y destino; agrega un resultado de ruta estructurado y muestra un estado de búsqueda. Se mantiene el fallback honesto cuando no hay API de IA.
3. **Mi Perfil retro**: interfaz verde, crema y mostaza, sin alterar los permisos, datos del usuario ni opciones.
4. **Móvil / Safari**: mejoras para márgenes, bordes, botones táctiles, legibilidad de formularios, área segura y mensajes de GPS/error.
5. **Resiliencia**: indicadores de carga y reintento del chat sin duplicar la burbuja con la pregunta; resultado Express conservado en la sesión al volver desde el mapa.

## Limitaciones que deben decirse en la exposición

- Las rutas, paraderos, tarifas y coordenadas de parada son **ficticios o aproximados**. El trazado no sigue necesariamente calles transitables y la línea punteada desde el GPS **NO** es una ruta real para caminar.
- «Paradero cercano» se refiere únicamente al más cercano entre los paraderos ficticios del primer tramo y a **distancia en línea recta**; no equivale a un análisis peatonal real.
- La ubicación propia solo se solicita después de activar una acción con GPS y requiere permiso del usuario y **HTTPS** (o localhost seguro). Si se niega, el origen y destino se pueden indicar manualmente.
- El GPS de buses se sigue alimentando desde dispositivos autorizados o desde el simulador académico preexistente.
- El backend Python, la base SQLite, SMTP, Firebase y el login original **no se reemplazaron**.

## Instalar el PARCHE (recomendado)

1. Haz commit o copia de seguridad de tu rama `mobile` antes de actualizar.
2. Descomprime `Wayvo-v1.3-Expo-Edition-PARCHE.zip`.
3. Copia su contenido **DENTRO de `Wayvo-FullStack/`**, preservando las carpetas `src/` y `backend/`.
4. Sólo se actualizan:

   - `src/app/App.tsx`
   - `src/app/components/WayvoLeafletMap.tsx`
   - `src/styles/globals.css`
   - `backend/assistant_chat.py`
   - `backend/test_assistant_chat.py`
   - `WAYVO_V1_3_EXPO_EDITION.md`

5. **NO** elimines ni sobrescribas `backend/.env`, `.env`, archivos SQLite, `public/`, `.git` ni tus logotipos.
6. En la carpeta `Wayvo-FullStack` ejecuta:

   ```bash
   python -m pip install -r backend/requirements.txt
   npm install
   python dev.py
   ```

7. Ejecuta los tests del backend cuando quieras:

   ```bash
   python -m unittest discover -s backend -p "test_*.py"
   ```

## Prueba funcional para el jurado

- Accede con tu cuenta verificada o Google.
- Ve a **Wayvo IA → Ruta Express** y selecciona `Laureles → Envigado`. Debes obtener dos buses (`WV-306`, `WV-302`) y poder pulsar **Ver recorrido y mi GPS**.
- Comprueba que el mapa destaca ambos recorridos, muestra subida, transbordo y destino y solicita GPS (o explica por qué no puede obtenerlo).
- Regresa a IA y pregunta «¿Cómo llego de Bello a Envigado?». La respuesta debe ofrecer un botón para abrir `WV-302` en el mapa.
- Abre **Mi Perfil** y comprueba la nueva apariencia.
- Comprueba el flujo desde el Safari de un iPhone y un Android bajo HTTPS. Revisa que teclado, botones y barras no se tapen.

## Verificación realizada en el entorno de preparación

- **27 pruebas automatizadas del backend pasaron** (`unittest discover`).
- El código TypeScript/TSX modificado pasó una comprobación de sintaxis mediante el compilador TypeScript (`transpileModule`).
- **No fue posible finalizar `npm install`**, así que NO está validada la compilación completa de Vite ni la visualización en Safari/Android.
- No se ha publicado Wayvo ni probado un enlace Cloudflare desde aquí.

## Próximo paso: v1.3.1 Stability Patch

Congelar nuevas funciones, corregir únicamente fallas detectadas en pruebas, comprobar despliegue HTTPS/GPS y generar el QR final sólo después de validar la URL pública.
