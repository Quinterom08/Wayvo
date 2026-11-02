# Wayvo — Corrección del botón «Ver ruta en el mapa» desde el chat

Parche específico para **Wayvo v1.3.1**. Cambia solamente la interpretación de preguntas de rutas en el backend; no modifica el frontend, el login, Google, el mapa ni la base de datos.

## Por qué antes no salía el botón

La interfaz del chat solo muestra «Ver ruta y paradero en el mapa» si `/api/assistant/chat` devuelve un objeto `trip` con `found: true`. Ruta Express ya lo hacía porque recibe un origen y un destino desde selectores. En cambio, cuando el backend del chat no comprendía la frase, devolvía solo texto; las respuestas generadas por OpenAI tampoco contienen por sí solas `trip`.

## Instalación

1. Haz una copia/commit del proyecto, en la rama `mobile`.
2. Abre el ZIP y copia `backend/assistant_chat.py` sobre `Wayvo-FullStack/backend/assistant_chat.py`.
3. Copia `backend/test_assistant_chat.py` en la misma carpeta para mantener las pruebas actualizadas.
4. No copies carpetas completas encima de tu instalación ni modifiques `.env`, `.git` o SQLite.
5. Reinicia el servidor con `python dev.py`.

## Prueba del chat

- «¿Cómo llego de Bello a Envigado?» → ruta directa, botón en el chat.
- «Estoy en Laureles y quiero ir a Bello» → ruta con transbordo, botón en el chat.
- «¿Cómo voy a Bello?» → pide origen, todavía sin botón (correcto).
- En ese mismo chat, «Desde Laureles» → ruta con transbordo y botón.

Las rutas, paraderos y tarifas son **simulados para el proyecto de grado**. El GPS no puede sustituir automáticamente el origen si no se conoce a qué paradero registrado corresponde la coordenada.

## Pruebas

Desde la carpeta `backend`:

```bash
python -m unittest discover -p 'test_*.py'
```

Pasaron 34 pruebas automatizadas del backend y los datos de rutas en el entorno de preparación. Todavía debe comprobarse la experiencia visual en navegador y celular con tu instalación de Wayvo.
