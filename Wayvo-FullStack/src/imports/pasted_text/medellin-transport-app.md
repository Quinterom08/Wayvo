Crea una **web móvil responsive de transporte público de Medellín, Colombia**, enfocada en ayudar a los usuarios a consultar rutas, buses, tarifas y planificar sus viajes.

La aplicación debe tener un diseño **moderno, limpio, intuitivo y profesional**, inspirado visualmente en el sistema de transporte público de Medellín, especialmente en el estilo del Metro de Medellín, pero **sin copiar su logotipo ni su identidad visual exacta**.

## 1. Estilo visual

Utiliza una interfaz **mobile-first**, diseñada principalmente para celulares, pero que también se adapte correctamente a tabletas y computadores.

### Paleta de colores

* **Color principal:** gris claro `#F2F3F5`
* **Color secundario:** negro `#171717`
* **Color de acento:** verde `#2E7D32`
* **Fondos:** blanco y gris muy claro.
* **Texto:** negro y gris oscuro.
* **Botones principales:** verde con texto blanco.

El diseño debe transmitir **seguridad, confianza, movilidad y facilidad de uso**.

Utiliza:

* Tarjetas con bordes redondeados.
* Sombras suaves.
* Iconos sencillos relacionados con transporte.
* Tipografía moderna y fácil de leer.
* Espaciado amplio.
* Botones grandes y fáciles de presionar.
* Navegación inferior fija en dispositivos móviles.
* Animaciones suaves y discretas.

## 2. Nombre de la aplicación

Utiliza un nombre provisional como **MetroBus Medellín**.

El nombre debe aparecer en la pantalla de inicio y en la barra superior.

## 3. Estructura general de la aplicación

La aplicación debe contar con las siguientes pantallas principales:

1. Inicio.
2. Rutas y líneas.
3. Vehículos.
4. Ubicación y geolocalización.
5. Tarifas.
6. Planificar viaje.
7. Notificaciones.
8. Perfil.
9. Administración.

## 4. Pantalla de inicio

Diseña una pantalla de inicio sencilla y funcional.

Debe incluir:

* Barra superior con el nombre de la aplicación.
* Icono de notificaciones.
* Saludo al usuario.
* Buscador para consultar rutas, líneas o destinos.
* Botón principal **"Planificar viaje"**.
* Acceso rápido a:

  * Rutas y líneas.
  * Ubicación de buses.
  * Tarifas.
  * Mis favoritos.
* Sección de **"Información importante"**.
* Tarjetas con avisos sobre cambios en rutas o servicio.
* Una sección visual que muestre el mapa o la ubicación de buses.

La pantalla debe permitir que el usuario encuentre rápidamente la información que necesita.

## 5. Módulo de autenticación y usuarios

Crea las siguientes pantallas:

### Registro

* Nombre completo.
* Correo electrónico.
* Contraseña.
* Confirmación de contraseña.
* Botón **"Crear cuenta"**.

### Inicio de sesión

* Correo electrónico.
* Contraseña.
* Botón **"Iniciar sesión"**.
* Enlace **"¿Olvidaste tu contraseña?"**.
* Opción para registrarse.

### Recuperación de contraseña

* Campo de correo electrónico.
* Botón para enviar instrucciones de recuperación.

### Perfil

* Nombre del usuario.
* Correo electrónico.
* Foto de perfil opcional.
* Botón para editar información.
* Configuración de notificaciones.
* Cerrar sesión.

### Roles y permisos

La interfaz debe contemplar dos tipos de usuario:

* **Usuario:** consulta rutas, buses, tarifas, planifica viajes y recibe notificaciones.
* **Administrador:** gestiona la información del sistema.

## 6. Módulo de rutas y líneas

Crea una pantalla donde el usuario pueda consultar las rutas y líneas de transporte público.

Debe incluir:

* Buscador de rutas.
* Lista de líneas disponibles.
* Identificación de cada línea.
* Nombre de la ruta.
* Origen y destino.
* Recorrido.
* Paraderos asociados.
* Información de los buses que pertenecen a la ruta.
* Botón para ver la ruta en el mapa.

Cada ruta debe mostrarse mediante una tarjeta clara y organizada.

Al seleccionar una ruta, mostrar una pantalla de detalle con:

* Nombre de la ruta.
* Origen.
* Destino.
* Recorrido.
* Paraderos.
* Buses asociados.
* Tiempo estimado.
* Botón **"Ver en el mapa"**.

## 7. Módulo de vehículos

Crea una pantalla para consultar los buses disponibles.

Debe incluir:

* Lista de vehículos.
* Número o identificación del bus.
* Empresa a la que pertenece.
* Ruta asociada.
* Estado del vehículo.
* Ubicación, cuando esté disponible.
* Botón **"Ver ubicación"**.

Los estados pueden mostrarse como:

* En servicio.
* Fuera de servicio.
* Información no disponible.

Cuando exista información GPS, mostrar la **ubicación del vehículo en tiempo real**.

## 8. Módulo de ubicación y geolocalización

Crea una pantalla de mapa interactivo.

Debe incluir:

* Mapa de Medellín.
* Ubicación actual del usuario, si permite el acceso.
* Marcadores de buses.
* Marcadores de rutas.
* Opción para buscar una ubicación.
* Botón **"Centrar en mi ubicación"**.
* Información del bus al seleccionar un marcador.

Si no existe información GPS real, utiliza **datos de demostración** y muestra claramente que son datos simulados.

## 9. Módulo de tarifas

Crea una pantalla para consultar el costo del pasaje.

Debe incluir:

* Título **"Tarifas"**.
* Tarjetas con los diferentes servicios.
* Nombre del servicio.
* Costo del pasaje.
* Información adicional.
* Fecha de actualización.
* Aviso cuando exista una modificación de tarifas.

Ejemplo de categorías:

* Transporte público.
* Servicios integrados.
* Otros servicios disponibles.

**No inventes tarifas reales actuales.** Utiliza valores de demostración claramente identificados o deja los campos preparados para ser actualizados por el administrador.

## 10. Módulo de planificación de viajes

Crea una pantalla principal con el título **"¿A dónde quieres ir?"**.

Debe incluir:

* Campo **"Origen"**.
* Campo **"Destino"**.
* Botón **"Buscar rutas"**.
* Opción para usar la ubicación actual.
* Opciones de rutas recomendadas.
* Tiempo estimado.
* Costo estimado.
* Información del recorrido.

Después de realizar una búsqueda, mostrar tarjetas con diferentes alternativas:

### Ejemplo de tarjeta

* Ruta recomendada.
* Nombre de la línea.
* Tiempo estimado.
* Costo estimado.
* Cantidad de paradas.
* Botón **"Ver recorrido"**.

El diseño debe ser sencillo para que una persona pueda planificar su viaje sin conocimientos técnicos.

## 11. Módulo de notificaciones

Crea una pantalla de notificaciones.

Debe incluir:

* Lista de notificaciones.
* Cambios en rutas.
* Modificaciones de tarifas.
* Alertas de servicio.
* Información relevante para el usuario.
* Indicador de notificaciones no leídas.

Cada notificación debe mostrar:

* Icono.
* Título.
* Mensaje.
* Fecha.
* Estado de lectura.

## 12. Módulo de administración

Crea un **panel de administración separado**, accesible únicamente para usuarios con rol de administrador.

Debe incluir un dashboard con:

* Total de usuarios.
* Total de empresas.
* Total de buses.
* Total de rutas.
* Total de notificaciones.
* Resumen de información del sistema.

### Funciones del administrador

* Gestionar usuarios.
* Gestionar empresas.
* Gestionar buses.
* Gestionar rutas.
* Gestionar paraderos.
* Gestionar tarifas.
* Gestionar reportes.
* Gestionar notificaciones.

Cada sección debe permitir:

* Registrar información.
* Consultar información.
* Editar información.
* Eliminar información cuando corresponda.

Utiliza tablas, formularios y botones de acción.

## 13. Navegación móvil

Utiliza una barra de navegación inferior con cinco opciones:

* **Inicio**
* **Rutas**
* **Mapa**
* **Viajes**
* **Perfil**

La opción seleccionada debe resaltarse con el color verde.

El menú debe ser sencillo, claro y fácil de utilizar.

## 14. Experiencia de usuario

La aplicación debe estar pensada para personas que utilizan el transporte público de Medellín.

Por eso:

* Utiliza textos claros.
* Evita interfaces complicadas.
* Prioriza las funciones más importantes.
* Permite consultar información rápidamente.
* Utiliza botones grandes.
* Muestra mensajes de carga y estados vacíos.
* Incluye mensajes de error comprensibles.
* Mantén una apariencia consistente en todas las pantallas.

## 15. Datos de demostración

Utiliza datos ficticios para mostrar el funcionamiento de la aplicación.

No afirmes que los datos son reales ni que la ubicación de los buses es en tiempo real si no existe una conexión GPS.

## 16. Resultado esperado

Genera una **web móvil completa, visualmente atractiva y funcional**, con todas las pantallas descritas, navegación entre módulos, formularios, tarjetas, mapas de demostración y panel de administración.

El resultado debe parecer una **aplicación real de transporte público**, no una página web genérica.

Prioriza el diseño móvil, la facilidad de uso y una estética inspirada en el transporte público de Medellín.
