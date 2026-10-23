# Wayvo v0.9 — Ruta Express en la misma pantalla de IA

## Qué cambió

Dentro de **Wayvo IA** aparece un módulo **RUTA EXPRESS** encima del chat. Permite elegir el punto de origen y el destino con dos menús desplegables, intercambiarlos y tocar **Encontrar mi bus**. El resultado se muestra en el área desplazable donde están los mensajes, sin deshabilitar el chat.

Se muestran las líneas de bus de demostración (ej. WV-302), los puntos donde subir y bajar, la cantidad y lista de paraderos, el número de transbordos, el tiempo ficticio estimado y el costo ficticio estimado. También puedes pulsar **Consultar detalles en el chat** para preguntar por esa misma conexión.

La interfaz conserva la paleta retro verde, crema y mostaza. El bloque RUTA EXPRESS es plegable para liberar espacio al conversar en pantalla pequeña.

## Cómo funciona

- `GET /api/assistant/stops`: devuelve los 20 nombres de paraderos presentes en las cinco rutas de demostración. Requiere una sesión iniciada.
- `POST /api/assistant/quick-route`: recibe `{ "origin": "Bello", "destination": "Envigado" }` con los nombres del catálogo, y devuelve itinerario estructurado. Requiere sesión.
- El cálculo reutiliza `plan_route` del chat, buscando primero menos transbordos y después menos paradas. El sentido inverso es posible en las rutas ficticias. **No usa una API externa de IA**: puede funcionar sin `OPENAI_API_KEY`.
- Tiempo por tramo: estimación ilustrativa proporcional a las paradas recorridas; se añaden 7 minutos ficticios por cada transbordo. Tarifa: $3.200 COP por bus, exclusivamente para la demostración académica.
- Si los lugares no están registrados o no hay conexión, el backend no inventa un bus ni un trayecto.

## Para probarlo

1. Abre una terminal en la carpeta del proyecto.
2. Ejecuta `npm install` (la primera vez) y después `python dev.py`.
3. Abre `http://localhost:5173` e inicia sesión (crea una cuenta si hace falta).
4. Entra a **Wayvo IA** y usa los selectores de **Ruta Express**.
5. Ejemplos: **Bello → Envigado** (WV-302 directo), **Laureles → Envigado** (WV-306 y WV-302, transbordo en Centro).
6. El botón junto a los selectores intercambia origen y destino.

## Limitaciones intencionales

Los paraderos, recorridos, horarios relativos y tarifas proceden de cinco rutas **completamente ficticias**. No se calculan tiempos con tráfico real, no se determina tu parada más cercana por GPS y **no deben usarse para desplazamientos reales**. El mapa de OpenStreetMap sigue funcionando como antes, pero no sirve para validar esas rutas. La API requiere que el backend esté encendido y la sesión iniciada.

## Verificación

Pruebas Python: `python -m unittest discover -s backend -p 'test_*.py' -v`.

Para móviles Android/iOS sigue haciendo falta compilar con Capacitor y configurar `VITE_API_URL` apuntando a un backend HTTPS público. Compilación visual en dispositivo pendiente.
