<img width="1600" height="520" alt="wayvo-banner" src="https://github.com/user-attachments/assets/9537bd42-8042-42fe-b9b8-ad8165dcd4e6" />
[README.md](https://github.com/user-attachments/files/34230008/README.md)
![Wayvo — Tu ciudad, tu ruta](./wayvo-banner.png)

# 🚌 Wayvo

**Tu ciudad, tu ruta.** Una forma más sencilla de descubrir cómo moverte por la ciudad.

![Estado](https://img.shields.io/badge/ESTADO-Prototipo%20acad%C3%A9mico-1B4935?style=for-the-badge)
![Ubicación](https://img.shields.io/badge/ORIGEN-Medell%C3%ADn-E6D681?style=for-the-badge&labelColor=254937)
![Plataforma](https://img.shields.io/badge/PLATAFORMA-Web%20m%C3%B3vil-1B4935?style=for-the-badge)

> **Wayvo conecta personas, destinos y tecnología.** Un proyecto de grado que explora cómo facilitar la movilidad urbana mediante mapas interactivos, rutas de transporte simuladas y un asistente inteligente.

---

## 🌆 ¿Por qué existe Wayvo?

Moverse por una ciudad puede resultar confuso cuando no conocemos las rutas de transporte, los puntos de abordaje o las alternativas para llegar a un destino.

**Wayvo propone una experiencia clara y accesible:** consultar el mapa, elegir un destino y recibir una recomendación de transporte en pocos pasos.

Nuestro objetivo es demostrar cómo una aplicación de movilidad puede reunir **orientación, geolocalización e inteligencia artificial** en un mismo lugar.

## ✨ Lo que puedes hacer

| | Funcionalidad | Experiencia |
|:---:|---|---|
| 🗺️ | **Mapa interactivo** | Explora Medellín con OpenStreetMap y Leaflet. |
| ⚡ | **Ruta Express** | Elige origen y destino y consulta buses, paraderos y transbordos del prototipo. |
| 🤖 | **Wayvo IA** | Haz preguntas en un chat sobre recorridos y opciones de viaje. |
| 📍 | **Mi ubicación** | Visualiza tu posición aproximada con el permiso del dispositivo. |
| 🚌 | **Buses y GPS** | Consulta posiciones y recorridos de buses de demostración. |
| 🔐 | **Acceso seguro** | Regístrate, verifica tu correo y recupera tu contraseña. |
| 🔗 | **Google** | Inicia sesión y vincula Google mediante Firebase Authentication. |
| 🛠️ | **Administración** | Gestiona los datos del sistema y los dispositivos de seguimiento autorizados. |

### 🚏 Una ruta, tres pasos

**01 · Encuentra tu punto de partida** → **02 · Consulta la mejor opción disponible** → **03 · Visualiza el recorrido en el mapa**

> **Importante:** Wayvo es un **prototipo académico**. Las rutas, buses, paraderos, tarifas, tiempos y posiciones de demostración pueden ser simulados; **no son indicaciones oficiales para viajes reales**.

---

## 🧩 Tecnologías que dan vida a Wayvo

![React](https://img.shields.io/badge/React-18-20232A?logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?logo=firebase&logoColor=black)
![Leaflet](https://img.shields.io/badge/Leaflet-199900?logo=leaflet&logoColor=white)

| Capa | Herramientas |
|---|---|
| **Frontend** | React, TypeScript, Vite, Tailwind CSS |
| **Backend** | Python y API HTTP/REST |
| **Persistencia** | SQLite |
| **Mapas** | OpenStreetMap + Leaflet |
| **Autenticación** | Cuenta Wayvo, Firebase Authentication para Google y verificación por correo |
| **Notificaciones por correo** | SMTP |
| **Adaptación móvil** | Interfaz responsive y configuración de Capacitor |
| **Colaboración** | Git y GitHub |

### 🏗️ ¿Cómo se conectan las piezas?

| Interfaz | Servidor | Datos y servicios |
|:---:|:---:|:---:|
| **React + Leaflet** | **Backend Python** | **SQLite + Firebase + SMTP** |
| Pantallas, mapa y chat | Usuarios, rutas, permisos y GPS | Persistencia y servicios externos |

La aplicación consulta una API propia: **el frontend publicado y el backend deben estar conectados** para que todas las funcionalidades funcionen fuera del entorno local.

---

## 🚀 Ejecuta Wayvo en tu computador

### Antes de comenzar

- Instala **Node.js** con npm y **Python 3.10 o superior**.
- Utiliza la carpeta que contiene `dev.py`, `package.json` y `backend/`.
- Mantén una conexión a Internet para las funcionalidades que usan servicios externos.

**1. Instala las dependencias**

```bash
npm install
python -m pip install -r backend/requirements.txt
```

**2. Configura los servicios**

Prepara `backend/.env` con tus propias variables de entorno para el correo, Firebase y los servicios opcionales. Consulta los archivos de ejemplo y las guías incluidas en el proyecto.

**Nunca subas a GitHub contraseñas, tokens privados ni bases de datos con información personal.**

**3. Inicia Wayvo**

```bash
python dev.py
```

**4. Abre la aplicación**

`http://localhost:5173`

Si el repositorio contiene una carpeta `Wayvo-FullStack/`, ejecuta los comandos **dentro de esa carpeta**. En Windows puedes probar `py dev.py` si `python` no se reconoce.

---

## 🧪 Pruebas y alcance

Las pruebas automatizadas del backend se pueden ejecutar con:

```bash
python -m unittest discover -s backend -v
```

Para una demostración completa también se deben comprobar, en el entorno donde se ejecuta la app, el envío de correos, el inicio con Google, los permisos GPS, el mapa y la comunicación con el backend.

**Estado del proyecto:** desarrollo académico con funcionalidades operativas y otras sujetas a configuración o validación en dispositivos reales. La integración con una API externa de IA y la publicación pública dependen de la configuración del entorno.

## 🌱 Próximos pasos

- Mejorar la conexión entre recomendaciones, recorridos y mapa.
- Afinar la experiencia en navegadores móviles.
- Validar el seguimiento de buses con dispositivos GPS físicos.
- Preparar una versión pública estable para demostración.

---

## 👥 Nuestro equipo

| Integrante | Proyecto |
|---|---|
| **Emmanuel Pérez** | Wayvo · Proyecto de grado |
| **Carlos Cano** | Wayvo · Proyecto de grado |
| **Pedro López** | Wayvo · Proyecto de grado |
| **Nicolás Quintero** | Wayvo · Proyecto de grado |

📍 **Medellín, Colombia** · 🎓 **Proyecto de grado**

---

### 💚 WAYVO — TU CIUDAD, TU RUTA.

*La movilidad comienza con una buena dirección.*
