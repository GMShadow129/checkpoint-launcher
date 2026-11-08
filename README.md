# 🎮 Checkpoint Launcher

[![Versión](https://img.shields.io/badge/version-0.5.1--beta.1-FF2A4E.svg)](https://github.com/GMShadow129/checkpoint-launcher/releases)
[![Electron](https://img.shields.io/badge/Electron-31.x-47848F.svg?logo=electron&logoColor=white)](https://electronjs.org/)
[![Minecraft](https://img.shields.io/badge/Minecraft-1.2.5%20--%201.21.x-4DFF7C.svg?logo=minecraft&logoColor=white)](https://minecraft.net/)
[![Invitar Bot de Discord](https://img.shields.io/badge/Discord-Invitar%20Bot%20Oficial-5865F2.svg?logo=discord&logoColor=white)](https://discord.com/oauth2/authorize?client_id=1557485683898064997&permissions=2147502080&integration_type=0&scope=bot+applications.commands)

**Checkpoint Launcher** es un lanzador de Minecraft moderno, rápido y diseñado para comunidades de jugadores. Incluye autenticación oficial de Microsoft, integración directa con Discord mediante Bot para organizar y sincronizar eventos comunitarios, auto-descarga de mods desde Modrinth y CurseForge, y conexión automática a servidores.

> 🤖 **¿Quieres organizar eventos en tu servidor de Discord?**  
> 👉 **[Haz clic aquí para añadir el Bot de Checkpoint a tu servidor](https://discord.com/oauth2/authorize?client_id=1557485683898064997&permissions=2147502080&integration_type=0&scope=bot+applications.commands)**  
> Con el bot añadido, podrás usar `/event create`, `/event edit` y `/event list` para que los eventos aparezcan automáticamente en el Launcher de todos los jugadores.

---

## ⚡ Características Principales

* 🔐 **Login Oficial de Microsoft**: Autenticación segura mediante MSMC con renovación automática de sesión sin tocar tus contraseñas.
* 🤖 **Sincronización con Discord Bot**:
  - Eventos creados en Discord con `/event create` generan un código único (ej: `EVT-XXXX`).
  - Al ingresar el código en el Launcher, se descarga e instala automáticamente la versión de Minecraft, el modloader (Forge, Fabric, NeoForge o Vanilla) y la lista de mods requeridos.
  - Conexión automática al servidor IP del evento al iniciar el juego.
* 🔔 **Alertas en Vivo**:
  - Banner en tiempo real dentro del Launcher cuando un evento está por comenzar o está en vivo (`● EN VIVO`).
  - Botón de **«🎮 Entrar al evento»** con 1 clic para preparar la instancia y entrar directamente.
* 🔄 **Sincronización en Caliente de Mods e IP**:
  - Si los administradores modifican la IP o agregan nuevos mods desde Discord (`/event edit`), el Launcher los sincroniza y descarga automáticamente al pulsar "Jugar".
* 👥 **Lista Interactiva de Asistentes**:
  - Consulta en tiempo real qué miembros de la comunidad van a participar, con sus avatares de Discord y sus nicks de Minecraft (IGN).
* 📦 **Explorador y Gestor de Mods Integrado**:
  - Busca e instala mods de **Modrinth** y **CurseForge** directamente desde el Launcher.
  - Habilita, deshabilita o elimina mods con un solo clic.
* ☁️ **Sincronización en la Nube**:
  - Soporte de distribución de modpacks comunitarios a través de Google Drive.
* ☕ **Detección Automática de Java**:
  - Detección inteligente de Java instalados en el sistema y selección del JRE recomendado para cada versión de Minecraft (Java 8, 17, 21).

---

## 📥 Descarga e Instalación

1. Ve a la sección de **[Releases](https://github.com/GMShadow129/checkpoint-launcher/releases)**.
2. Descarga el instalador ejecutable más reciente:
   - **`Checkpoint Launcher-Setup-0.5.1-beta.1.exe`**
3. Ejecuta el instalador y sigue los pasos en pantalla. ¡Listo para jugar!

---

## 🛠️ Desarrollo Local

Si deseas contribuir o probar el Launcher en modo de desarrollo:

### Requisitos
- [Node.js](https://nodejs.org/) v18 o superior.
- npm v9 o superior.

### Instalación
```bash
# Clonar el repositorio
git clone https://github.com/GMShadow129/checkpoint-launcher.git
cd checkpoint-launcher

# Instalar dependencias
npm install

# Iniciar la aplicación en modo desarrollo
npm start
```

---

## 📦 Compilación y Empaquetado

Para generar los binarios ejecutables para Windows:

```bash
# Empaquetado de prueba descomprimido (rápido):
npm run build:dir

# Generar el instalador oficial NSIS (.exe):
npm run build:win
```

Los instaladores resultantes se generan en la carpeta `dist/`.

---

## 🌐 Ecosistema Checkpoint

El ecosistema de Checkpoint está compuesto por 3 componentes sincronizados:
- **[Checkpoint Launcher](https://github.com/GMShadow129/checkpoint-launcher)**: Cliente de escritorio para jugadores (Electron).
- **[Checkpoint Bot](https://github.com/GMShadow2/checkpoint-bot)**: Bot de Discord para creación y gestión de eventos (`/event create`, `/event edit`, `/event cancel`).  
  👉 **[Enlace de Invitación Oficial del Bot](https://discord.com/oauth2/authorize?client_id=1557485683898064997&permissions=2147502080&integration_type=0&scope=bot+applications.commands)**
- **[Checkpoint Backend](https://github.com/GMShadow2/checkpoint-backend)**: API REST y base de datos de eventos, participantes y autenticación OAuth.

---

## 📄 Licencia

Este proyecto está bajo licencia comunitaria para el proyecto **Checkpoint Launcher**.
Minecraft es una marca registrada de Mojang Synergies AB. Este software no está afiliado ni respaldado por Mojang o Microsoft.
