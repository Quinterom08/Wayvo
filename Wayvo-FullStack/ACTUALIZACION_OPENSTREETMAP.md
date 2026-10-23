# Wayvo v0.8 — OpenStreetMap + Leaflet (sin Google Maps)

## Qué cambió

- Se reemplazó por completo el mapa de Google Maps con **Leaflet 1.9.4 y OpenStreetMap**.
- El inicio muestra el mapa de Medellín y el Valle de Aburrá; debajo se conservan Wayvo IA y los módulos del diseño retro.
- La pestaña **Mapa** permite seleccionar las cinco líneas de **demostración**; también puedes tocarlas en el mapa.
- Botón GPS (requiere permiso de usuario y HTTPS o `localhost`). Muestra tu ubicación aproximada y círculo de precisión.
- Los recorridos dibujados son **polilíneas ilustrativas** con puntos aproximados, NO rutas de autobús verificadas sobre carreteras. La app no muestra autobuses reales ni datos en vivo.
- La atribución visible «© OpenStreetMap contributors» se mantiene en el mapa.
- El chat Wayvo IA y el backend siguen igual que en v0.7.

## ¿Debo crear cuentas, poner claves o pagar?

**No** para el mapa de este prototipo. Leaflet es software libre, los datos OpenStreetMap también, y las teselas públicas predeterminadas pueden utilizarse para visualización humana con tráfico moderado cumpliendo la política indicada abajo. Es **necesaria conexión a Internet** para cargar las imágenes del mapa.

### Ejecución local

Desde la carpeta `Wayvo-FullStack`:

```bash
npm install
python dev.py
```

Abre `http://localhost:5173`. No necesitas configurar `VITE_GOOGLE_MAPS_API_KEY` (se eliminó).

`VITE_OSM_TILE_URL` es **opcional** y permite definir un proveedor de mosaicos propio si cambias a otro servicio. Ten en cuenta sus condiciones de uso y atribución.

### Uso responsable de los servidores de mosaicos

El servicio de `tile.openstreetmap.org` **no es ilimitado y no garantiza disponibilidad**, aunque no cobre por solicitudes normales. Reglas clave:

- Conservar la atribución visible y vincular a la licencia de OpenStreetMap.
- Respetar caché de red y cabeceras estándar; no activar cabeceras `no-cache` en la app.
- No realizar descargas masivas, precarga ni ofrecer mapas offline desde esos servidores.
- Si Wayvo se distribuye ampliamente o tiene tráfico elevado, usar un proveedor de mosaicos adecuado (puede tener precios) o alojar uno.
- Publicar un contacto en el sitio o tienda cuando se distribuya y una identificación clara de la app.

Política oficial: https://operations.osmfoundation.org/policies/tiles/

Licencia de datos: https://www.openstreetmap.org/copyright

### Android y iOS

La misma interfaz Leaflet se renderiza dentro de Capacitor. La carga de las teselas exige conexión a Internet. Configura la API de autenticación con `VITE_API_URL=https://.../api` para el móvil y asegúrate de configurar permisos de ubicación y probarlos en Android Studio/Xcode. El mapa y el GPS no fueron probados en teléfonos físicos durante esta entrega.

### Limitaciones

- Los recorridos no siguen los ejes de las calles; para eso se necesita una herramienta de ruteo y datos de transporte.
- El mapa **no implementa** geocodificación, búsqueda real de lugares, tiempos de llegada reales ni GPS de buses.
- La IA y la base de datos no pasan automáticamente a tener datos reales por usar OpenStreetMap.
- La instalación de dependencias y compilación frontend necesitan verificarse en tu equipo (el entorno de entrega puede no tener acceso al registro npm).

### Dependencias

Se retiró `react-leaflet@5` porque requiere React 19 y Wayvo utiliza React 18. El mapa usa directamente `leaflet@1.9.4`. Se eliminó el archivo `pnpm-lock.yaml` preexistente porque no correspondía a las dependencias completas de `package.json`; ejecuta `npm install` para generar un nuevo `package-lock.json` coherente.
