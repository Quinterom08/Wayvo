# Wayvo — Corrección de rutas consecutivas en el chat

Este parche se aplica **después** del parche `Wayvo-v1.3.1-Parche-Boton-Mapa-Chat.zip`.

## Qué corrige

- La búsqueda de rutas funciona más de una vez en la misma conversación.
- Acepta preguntas breves como «¿Y de Envigado a Bello?» y «Ahora de Laureles a Envigado».
- Permite cambiar el destino con «¿Y ahora a Robledo?» conservando el origen de la última ruta.
- Permite invertir el último recorrido con «¿Y en sentido contrario?».
- Conserva el flujo de completar origen o destino mediante mensajes separados.
- No ofrece un bus para lugares que no figuran en el catálogo académico de prueba.
- No modifica el frontend, Google/Firebase, Gmail, el mapa ni los permisos de administrador.

## Instalación sobre tu proyecto actual

1. Haz un commit o copia de respaldo del proyecto.
2. Abre este ZIP y copia `backend/assistant_chat.py` y `backend/test_assistant_chat.py` **dentro de la carpeta `Wayvo-FullStack/backend/`**.
3. Reemplaza solo esos dos archivos. No reemplaces la carpeta `backend` entera.
4. No toques `.env`, la base de datos `.sqlite3` ni `.git`.
5. Detén el servidor y reinicia desde la carpeta principal con `python dev.py`.
6. Actualiza la pestaña de Wayvo. Si conservas una conversación vieja, prueba también en un chat nuevo o una pestaña privada.

## Prueba recomendada en una sola conversación

- «¿Cómo llego de Bello a Envigado?» → muestra botón para abrir el mapa.
- «¿Y de Envigado a Bello?» → nueva ruta + botón.
- «Ahora de Laureles a Envigado» → nueva ruta con transbordo + botón.
- «¿Y ahora a Robledo?» → toma Laureles como origen y propone ruta a Robledo.
- «¿Y en sentido contrario?» → invierte la ruta anterior.

Estas rutas son **simuladas**; no equivalen al servicio real de transporte en Medellín.

## Pruebas automáticas

Desde la carpeta `Wayvo-FullStack/backend`:

```bash
python -m unittest discover -p 'test_*.py'
```

Verificado sobre la base de pruebas de Wayvo v1.3.1: 39 pruebas de backend superadas. La compilación visual del frontend y la prueba en tu instalación siguen pendientes; este parche no cambia React.
