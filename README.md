# 🎵 BlazeDownloader - Multiplataforma (iOS, Android, Mac, PC)

Una aplicación web moderna, rápida y responsiva para descargar videos y música de YouTube, permitiendo seleccionar la **calidad y formato exacto** (1080p, 720p, 480p, 360p, o Audio MP3/M4A).

Desarrollado por **Rutver Aranda Arguello - Dj Blaze**.

---

## ✨ Características Principales

- 🎵 **Icono de Corchea Negra**: Identidad visual musical y elegante.
- 💾 **Selección de Carpeta de Destino**: Al pulsar en descargar, te permite elegir exactamente en qué carpeta de tu equipo guardar el archivo antes de comenzar la descarga.
- 🎬 **Video en Alta Definición con Audio**: 1080p Full HD, 720p HD, 480p y 360p (MP4) con fusión automática de audio mediante FFmpeg.
- 🎧 **Audio MP3 / M4A**: Descarga música y podcasts en formato MP3 (320 kbps) o M4A original sin pérdida.
- 📱 **Multiplataforma Real (PWA)**: Funciona en macOS, iPhone/iPad (iOS), Android y Windows.
- 🔒 **Sin Anuncios ni Malware**: Privado, seguro y directo.

---

## 🚀 Opciones de Uso y Distribución

### 1️⃣ Archivo Instalable para macOS (.dmg y .app)
* 💿 **Instalador DMG**: [`BlazeDownloader-macOS.dmg`](file:///Users/rutver/.gemini/antigravity/scratch/snaptube-web/BlazeDownloader-macOS.dmg)
  - Haz doble clic en `BlazeDownloader-macOS.dmg` y arrastra **BlazeDownloader** a tu carpeta de **Aplicaciones**.
* ⚡ **App nativa**: [`BlazeDownloader.app`](file:///Users/rutver/.gemini/antigravity/scratch/snaptube-web/BlazeDownloader.app)
  - Al abrirla, levanta automáticamente la aplicación y abre la ventana en tu navegador predeterminado.

---

### 2️⃣ En Teléfonos (Android / iPhone) como App Instalable (PWA)
* **En Android (Chrome)**:
  Abre la web en Google Chrome y selecciona en el menú **"Instalar aplicación"** o **"Añadir a pantalla de inicio"**. Se instalará el icono de la corchea en tu cajón de aplicaciones y funcionará a pantalla completa como una app nativa (.apk).
* **En iPhone / iPad (Safari)**:
  Abre la web en Safari, pulsa **Compartir** (icono de cuadro con flecha hacia arriba) ➔ **"Añadir a pantalla de inicio"**.

---

### 3️⃣ Enlace Público Inmediato desde tu Mac (Sin Nube)
Para compartir un enlace temporal en cualquier parte del mundo o usarlo en la calle con datos 4G/5G:

```bash
cd /Users/rutver/.gemini/antigravity/scratch/snaptube-web
./share_online.sh
```

---

### 4️⃣ Enlace Público Global 24/7 (Vía GitHub + Nube Gratuita)
1. **Crea un repositorio en GitHub**: [github.com/new](https://github.com/new) llamado `blazedownloader`.
2. **Sube el código**:
   ```bash
   cd /Users/rutver/.gemini/antigravity/scratch/snaptube-web
   git remote add origin https://github.com/TU_USUARIO/blazedownloader.git
   git branch -M main
   git push -u origin main
   ```
3. **Conéctalo a [Render.com](https://render.com)** (New Web Service ➔ Repositorio ➔ Deploy Docker).

---

## 💻 Ejecución Local Básica

```bash
cd /Users/rutver/.gemini/antigravity/scratch/snaptube-web
./run.sh
```
Abre en tu navegador: [http://localhost:5050](http://localhost:5050)
