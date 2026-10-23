# Wayvo — Actualización «Mapa primero + chat IA»

## Novedades de esta versión

1. **Inicio centrado en el mapa.** Al entrar, verás un mapa grande, el acceso al chat y, debajo, las tarjetas de módulos. Se mantiene la estética retro de verdes, crema y mostaza.
2. **Google Maps JavaScript API** (opcional). El mapa real permite desplazar, hacer zoom, filtrar recorridos ilustrativos y centrar con GPS. Sin clave, se muestra un mapa SVG local de demostración, no se bloquea el inicio.
3. **Wayvo IA: chat completo.** Navegación inferior: la pestaña «Rutas» ahora es «Wayvo IA». Hay burbujas de conversación, ejemplos, mensaje libre, contexto conversacional temporal y botón de GPS.
4. **Rutas y precios simulados.** La API de chat conoce cinco recorridos ficticios y puede proponer rutas directas o con transbordos de muestra, sin atribuirlos a operadores reales.
5. **API de IA opcional.** Cuando configuras `OPENAI_API_KEY`, el servidor utiliza OpenAI Responses API para conversación abierta, con instrucciones de no inventar rutas reales. Sin ella, el chat sigue funcionando de forma local en las preguntas de demostración, pero **no es un modelo de IA general**.

## 1. Ejecutar en computador

Requisitos: Node.js 22+ y Python 3.10+.

```bash
npm install
python dev.py
```

Abre **http://localhost:5173**. Si Windows no reconoce `python`, prueba `py dev.py`.

> Nota: la compilación completa del frontend no pudo validarse en el entorno de entrega por un bloqueo al instalar dependencias. El código TSX pasó comprobación de sintaxis y se ejecutaron pruebas Python de autenticación, chat y planificación.

## 2. Habilitar Google Maps real

1. En https://console.cloud.google.com/ crea o selecciona un proyecto.
2. Habilita **Maps JavaScript API**. Google Maps Platform requiere configuración de facturación para claves estándar; existe una clave de demostración para prototipos con limitaciones.
3. Crea una **API key de navegador** y restringe la API a **Maps JavaScript API**. Restringe sus orígenes web autorizados, por ejemplo `http://localhost:5173/*` durante desarrollo y el dominio HTTPS final.
4. Copia `.env.example` a `.env` en la **raíz del proyecto** y completa:

```env
VITE_API_URL=/api
VITE_GOOGLE_MAPS_API_KEY=tu_clave_de_google_maps_para_navegador
```

5. Reinicia `python dev.py` para que Vite reconozca la variable.

**Seguridad:** esta clave es *pública* en el bundle de la web y debe restringirse; no incluyas secretos de Google OAuth ni `OPENAI_API_KEY` en variables `VITE_`. Para WebViews de Android/iOS hay que validar restricciones, permisos y compatibilidad del proveedor; una clave para navegador web no garantiza por sí sola que el SDK nativo funcione. No se ha hecho prueba en móvil real.

**Importante:** las líneas sobre Google Maps se dibujan a partir de coordenadas aproximadas ficticias. **No son rutas oficiales ni posiciones en vivo de buses.** El API Maps no crea automáticamente rutas de autobús reales.

## 3. Activar conversación abierta con OpenAI

1. Crea una cuenta y credencial en https://platform.openai.com/ y configura la facturación que corresponda.
2. Copia `backend/.env.example` a **`backend/.env`** (el servidor ahora lo lee al iniciar).
3. Añade:

```env
OPENAI_API_KEY=tu_clave_privada
WAYVO_AI_MODEL=gpt-4.1-mini
```

4. Reinicia el servidor. El frontend llama a `POST /api/assistant/chat` y solo **el backend** se comunica con OpenAI; la clave no llega al navegador.

Sin clave, el chat de demo responde sobre Wayvo, rutas y tarifas simuladas; para preguntas generales informa que falta habilitar el servicio, sin fingir que una IA externa respondió.

## 4. Ejemplos para la exposición

- «Hola, ¿qué puedes hacer?»
- «¿Cómo llego de Bello a Envigado?» → WV-302 (simulado)
- «Necesito ir de Laureles a Envigado» → WV-306 + WV-302 (transbordo simulado)
- «¿Cuánto cuesta el pasaje?» → valor ficticio
- «¿Dónde estoy?» → comparte el GPS y devuelve coordenadas; no adivina paradero ni dirección
- «Explícame qué es la inteligencia artificial» → requiere clave de OpenAI para conversación general

## 5. Para el móvil

El frontend sigue siendo React + Capacitor. Para Android/iOS aún necesitarás un backend publicado con HTTPS, permisos GPS, clave de mapas compatible con el WebView o integración con SDK nativo, además de compilar y probar en los entornos nativos. Consulta `MOBILE.md`.

## 6. Pruebas

```bash
python -m unittest discover -s backend -p 'test_*.py' -v
```

## Qué NO se ha implementado en esta entrega

- Datos de empresas y buses reales / servicios GPS en vivo.
- Recomendaciones reales puerta a puerta basadas en toda la malla vial.
- Geocodificación inversa para convertir tu GPS a una dirección y paradero exactos.
- Pruebas en teléfonos físicos ni publicación en tiendas.
- Configuración externa de las claves de Google Maps, Google/Microsoft OAuth o OpenAI.
