# Wayvo — actualización visual retro urbana

Este paquete toma como base `Wayvo-Login-Retro-Corregido.zip` y conserva los componentes y el backend anteriores.

## Diseño implementado
- Cabecera fija verde profundo con marca WAYVO y detalle de boleto retro.
- Fondos verde crema con textura de papel punteada.
- Tarjetas tipo ticket con bordes salvia y sombras sólidas.
- Botones y campos en paleta verde oscuro/crema.
- Etiquetas de sección con detalle mostaza.
- Navegación inferior acorde con el inicio de sesión, con pestaña activa destacada.
- Estilos comunes también aplicados a rutas, mapa (sus controles), tarifas, perfil, asistente IA y panel administrativo.
- Diseño adaptable a pantallas móviles y contenedor en escritorio; admite márgenes seguros inferiores.

## Importante
Solo se modificó la capa visual (App.tsx y styles/globals.css). El contenido y las limitaciones de datos, OAuth, GPS y backend siguen siendo los de la versión de origen. Este cambio no implica que Google/Microsoft estén ya configurados ni que las rutas representen transporte en vivo.

## Ejecución
`npm install` y `python dev.py` en la raíz, tras configurar las variables necesarias. Para Android/iOS consultar MOBILE.md.

## Verificación
Se verificó que los archivos modificados están presentes en el paquete. No se confirmó la compilación: la instalación de dependencias del entorno no finalizó dentro del tiempo disponible.
