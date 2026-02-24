# AdValify - Validación Técnica de Video

Aplicación desktop 100% offline para validación técnica de archivos de video con previsualización, overlays de safezones, verificación de contraste y generación de reportes.

## Características

- **100% Offline**: Sin backend remoto, sin base de datos, todo corre localmente
- **Análisis Técnico Completo**: Formatos, codecs, resolución, frame rate, chroma subsampling
- **Audio Loudness**: Medición LUFS y True Peak conforme a estándares de broadcast
- **Overlays de Safezones**: 9:16, 16:9, 4:5, 1:1 con áreas seguras para título y acción
- **Verificación de Contraste**: Medición WCAG AA/AAA para accesibilidad
- **Reportes PDF/JSON**: Exportación completa con thumbnails y waveform de audio
- **Previsualización**: Player integrado con controles de navegación

## Requisitos

- Node.js 18+
- FFmpeg (incluido en releases o instalado en el sistema)
- FFprobe (viene con FFmpeg)

## Instalación

```bash
# Clonar el repositorio
cd AdValify

# Instalar dependencias
npm install

# Modo desarrollo
npm run dev

# Build para producción
npm run build

# Crear instalador
npm run dist
```

## FFmpeg

### Windows
1. Descargar FFmpeg desde https://ffmpeg.org/download.html
2. Extraer en `C:\ffmpeg` o agregar al PATH
3. La app detectará automáticamente la instalación

### macOS
```bash
brew install ffmpeg
```

### Linux
```bash
sudo apt-get install ffmpeg
```

## Uso

1. **Abrir archivo**: Click en "Select Video" o drag & drop de archivo MP4/MOV/MKV/WEBM
2. **Seleccionar preset**: Elegir configuración de validación (Social Media, Broadcast, etc.)
3. **Analizar**: Click en "Scan File" para iniciar el análisis
4. **Verificar contraste**: En el panel de contraste, seleccionar texto y fondo
5. **Exportar**: Guardar reporte PDF y JSON con thumbnails

## Presets Incluidos

- **Social Media - Estándar**: Optimizado para Instagram, Facebook, Twitter
- **Broadcast - HDTV**: Conforme a estándares HDTV 1080i/p
- **Cinema - DCI**: Formato DCI 2K/4K para exhibición
- **Mobile - Vertical**: Optimizado para stories y reels

## Estructura del Reporte

```
output_folder/
├── report.pdf          # Reporte visual completo
├── report.json         # Datos en formato JSON
├── thumb_1.jpg         # Thumbnails (8 totales)
├── ...
├── thumb_8.jpg
└── waveform.png        # Visualización de audio
```

## Scripts

- `npm run dev`: Iniciar en modo desarrollo
- `npm run build`: Compilar para producción
- `npm run dist`: Crear instalador con electron-builder
- `npm run lint`: Ejecutar ESLint

## Tecnologías

- Electron
- React + TypeScript
- Vite
- Tailwind CSS
- jsPDF (generación de PDFs)
- FFmpeg + FFprobe (análisis de video)

## Licencia

MIT