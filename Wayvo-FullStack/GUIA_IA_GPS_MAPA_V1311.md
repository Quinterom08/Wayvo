# Wayvo v1.3.1 — Ajustes de IA, GPS y mapa

Parche para **Wayvo v1.3 Expo Edition**. No elimina usuarios, rutas, base de datos, login ni Firebase. **No contiene `.env`, SQLite o `.git`.**

## Instalación segura

1. Guarda tus cambios con un commit en `mobile` o copia de respaldo.
2. Descomprime `Wayvo-v1.3.1-PARCHE-IA-GPS-MAPA.zip`.
3. Desde la raíz de **Wayvo-FullStack** copia los archivos preservando sus carpetas `src/...`, `backend/...` y este documento. Reemplaza *solo* esos archivos. No sustituyas la carpeta `backend` completa.
4. Conserva `backend/.env` existente. Si aún no usas OpenAI, agrégale `OPENAI_API_KEY` y opcionalmente `WAYVO_AI_MODEL`.
5. Reinicia con `python dev.py`. El frontend se abre en `http://localhost:5173` desde tu PC.

## Activar OpenAI

1. Crea una clave en `https://platform.openai.com/api-keys`.
2. Revisa la facturación y los límites del proyecto de API en OpenAI Platform (independientes de ChatGPT).
3. Agrega en `backend/.env` (NO en un archivo Vite o en Firebase):

```dotenv
OPENAI_API_KEY=PEGA_AQUI_TU_CLAVE
WAYVO_AI_MODEL=gpt-4.1-mini
```

4. Reinicia `python dev.py` y prueba: «¿Cómo organizar mejor mis estudios?». Las preguntas sobre buses siguen sujetas al motor de rutas académicas, que **nunca debe inventar líneas**.
5. Si no responde la API: revisa conexión, facturación, permisos de clave y el log del servidor (`Wayvo IA: ... HTTP 401/429/otros`). No compartas claves ni correos privados en capturas.

**La API de OpenAI no es gratuita por tener ChatGPT.** Su uso puede generar cargos. No envíes secretos al chat y no los subas a GitHub.

## Qué cambia en el mapa

- Se utilizan las mismas coordenadas de paraderos para construir cada línea. No debería haber puntos de subida fuera de su línea **simulada**.
- El mapa resalta únicamente el tramo seleccionado sobre el recorrido completo del bus.
- El resumen sobre el mapa indica, para cada bus, dónde subir, dónde bajar y dónde transbordar. El amarillo indica transbordo.
- El GPS del pasajero primero intenta alta precisión y luego una ubicación aproximada. Si no responde, cancela el estado de espera tras unos 21 segundos y ofrece reintentar.
- Si el GPS no está disponible, **Ruta Express sigue funcionando** con origen manual.
- Los recorridos **son ficticios**, sus segmentos se dibujan entre paraderos y no representan rutas por las calles ni instrucciones de caminar.

## GPS en iPhone

- Safari exige **HTTPS**, permisos de ubicación y que la localización del sistema esté encendida. `localhost` solo sirve como origen seguro en el mismo equipo, no desde otro celular.
- Si el navegador no concede la ubicación automáticamente al entrar al mapa, toca el botón «Mi GPS» de arriba a la derecha, acepta el permiso y espera. Si falla, aparecerá un mensaje y podrás reintentar.
- En la vista de recorrido, el indicador de proximidad es **distancia en línea recta**, no tiempo a pie ni navegación real.

## Pruebas locales

```bash
cd backend
python -m unittest discover -p "test_*.py"
```

En el entorno de creación pasaron 30 pruebas del backend y de coherencia de paraderos. La sintaxis TSX fue comprobada, pero **no se pudo completar `npm install` ni la compilación visual**; falta probar la interfaz en Safari/Android y el envío a OpenAI con tu clave real.
