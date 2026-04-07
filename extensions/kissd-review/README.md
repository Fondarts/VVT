# Kissd Review — CEP Extension for Premiere Pro & After Effects

View project feedback and annotations from Kissd Review directly inside Premiere Pro and After Effects. Click on any comment to seek the playhead to that timecode.

## Features

- Google Sign-In (same account as Kissd Review web app)
- Browse projects and files
- Real-time comment sync via Firestore
- Click a comment to seek Premiere/AE playhead to that timecode
- Shows comment author, timecode, text, resolved status, replies, and annotation indicators

## Installation (Development)

### 1. Enable unsigned extensions

**Windows:** Open Registry Editor and set:
```
HKEY_CURRENT_USER\Software\Adobe\CSXS.11
PlayerDebugMode = 1 (String)
```
Also set for CSXS.9, CSXS.10 if targeting older versions.

**Mac:**
```bash
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
```

### 2. Symlink or copy the extension

**Windows:**
```cmd
mklink /D "%APPDATA%\Adobe\CEP\extensions\com.kissd.review" "F:\Proyectos\VVT\extensions\kissd-review"
```

**Mac:**
```bash
ln -s /path/to/VVT/extensions/kissd-review ~/Library/Application\ Support/Adobe/CEP/extensions/com.kissd.review
```

### 3. Restart Premiere Pro / After Effects

The panel will appear under **Window > Extensions > Kissd Review**.

## Usage

1. Open the panel from Window > Extensions > Kissd Review
2. Sign in with your Google account
3. Select a project from the dropdown
4. Select a file to view its feedback
5. Click any comment to seek the playhead to that timecode

## File Structure

```
kissd-review/
├── CSXS/
│   └── manifest.xml      # Extension manifest (hosts, panel size, etc.)
├── css/
│   └── panel.css          # Panel styles (Adobe dark theme)
├── js/
│   ├── CSInterface.js     # Adobe CEP bridge
│   └── panel.js           # Firebase + UI logic
├── jsx/
│   └── host.jsx           # ExtendScript (playhead seeking)
├── .debug                 # Debug ports for Chrome DevTools
├── index.html             # Panel HTML
└── README.md
```
