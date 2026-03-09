# Kissd Video Validation Tool

A browser-based technical validation tool for video files. Runs 100% client-side via WebAssembly — no backend, no installation, no uploads.

---

## Features

### Core Analysis
- **Technical Metadata** — Container format, codec, resolution, frame rate, bit depth, chroma subsampling, color space, scan type (interlaced/progressive)
- **Audio Loudness** — Broadcast-compliant LUFS and True Peak measurement per ITU BS.1770-4
- **Fast-Start Check** — Detects moov atom position for streaming optimization
- **Waveform Visualization** — Audio amplitude display with frame-level resolution

### Visual Tools
- **Safezone Overlays** — 9 aspect ratios (9:16, 16:9, 4:5, 1:1, 4:3, 2.39:1, 1.85:1, 2:3, and more) with title-safe and action-safe guide lines
- **Thumbnail Grid** — Automatic frame extraction at uniform intervals
- **Video Player** — In-browser playback with overlay support

### Validation Engine
- **Preset-Based Checks** — Validates files against structured presets with pass/fail/warning results
- **Custom Presets** — Define your own rules via JSON with conditional logic support
- **Compliance Badge** — COMPLIANT / WARNINGS / NON-COMPLIANT result per file

### AI Transcription
- **On-Device Speech-to-Text** — Runs Whisper models locally via `@xenova/transformers`
- **3 Model Sizes** — Tiny (75 MB), Base (145 MB), Small (460 MB)
- **Model Caching** — Downloads once, cached in browser storage for offline use
- **Download Progress** — Visual progress bar during first-time model load

### Batch Mode
- **Multi-File Queue** — Drop multiple files and process them in sequence or concurrently
- **2 Parallel Scans** — Independent FFmpeg WASM instances (pool of 2) for concurrent processing
- **Card Grid UI** — Per-file cards with thumbnail, progress indicator, and result badge
- **Detail Panel** — Click any card to expand full results (checks, waveform, thumbnails, player)
- **Bulk Export** — Generate PDF or JSON reports for all scanned files

### Export
- **PDF Reports** — Thumbnails, waveform, metadata table, validation checks summary
- **JSON Reports** — Machine-readable output for integration with other tools

---

## Built-In Presets

| Preset | Format | Codec | Resolution | Notes |
|--------|--------|-------|------------|-------|
| **Innovid** | MP4 / MOV | H.264 / ProRes | 1080p | 23.976 / 25 / 29.97 fps |
| **AudienceXpress Linear HD** | MOV | ProRes 422 HQ | 1080i | Broadcast linear delivery |
| **AudienceXpress VAST Mezz** | MP4 | H.264 | 1080p / 720p | 15–30 Mbps, streaming |

Custom presets can be created with rule-based conditions (min/max duration, allowed codecs, sample rates, color spaces, loudness targets, and more).

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| UI Framework | React 18 + TypeScript |
| Build Tool | Vite 5 |
| Video Processing | FFmpeg.wasm (`@ffmpeg/ffmpeg` + `@ffmpeg/core`) |
| AI Transcription | Whisper.js via `@xenova/transformers` |
| PDF Export | jsPDF + jspdf-autotable |
| Icons | Lucide React |

FFmpeg runs in single-thread mode for single-file analysis and uses a **WASM pool of 2 independent instances** for batch mode — avoiding multi-thread deadlocks while enabling real concurrency.

---

## Getting Started

```bash
npm install
npm run dev
```

App runs at `http://localhost:5173`

> **Note:** The dev server sets `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers required for `SharedArrayBuffer` (FFmpeg multi-threading). For static deployments (Vercel, Netlify), the included `coi-serviceworker.js` handles this automatically.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with COOP/COEP headers |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build locally |

---

## Architecture

```
src/
├── App.tsx                     # Main component — mode toggle, presets, single-file UI
├── api/
│   ├── ffmpeg.ts               # FFmpeg.wasm wrapper — scan, loudness, thumbnails, pool
│   └── whisper.ts              # Whisper transcription — worker pool, model caching
├── components/
│   ├── batch/                  # All batch mode UI components
│   │   ├── BatchView.tsx
│   │   ├── BatchCard.tsx
│   │   ├── BatchDetailPanel.tsx
│   │   ├── BatchDropZone.tsx
│   │   ├── BatchGrid.tsx
│   │   └── BatchToolbar.tsx
│   ├── CheckResults.tsx         # Validation pass/fail display
│   ├── ContrastChecker.tsx      # WCAG contrast ratio tool
│   ├── TranscriptionPanel.tsx   # Whisper UI + model selector
│   ├── VideoPlayer.tsx          # Playback + safezone overlays
│   ├── Waveform.tsx             # Audio waveform canvas
│   └── ThumbnailGrid.tsx        # Frame extraction grid
├── hooks/
│   └── useBatch.ts              # Batch state machine + queue dispatcher
├── shared/
│   ├── types.ts                 # All TypeScript interfaces
│   └── presets.ts               # Built-in validation presets
└── utils/
    ├── validation.ts            # validateAgainstPreset()
    └── pdfGenerator.ts          # PDF and JSON export logic
```

---

## License

MIT
