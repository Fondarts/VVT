#!/bin/bash
# KISSD Export Helper — macOS installer
# Double-click this file to install and run the helper.

clear
echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║   KISSD Export Helper — Installer    ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

DIR="$(cd "$(dirname "$0")" && pwd)"
ARM="$DIR/KissdHelper-mac-arm64"
X64="$DIR/KissdHelper-mac-x64"

# Detect which binary to use
if [ -f "$ARM" ]; then
  BIN="$ARM"
elif [ -f "$X64" ]; then
  BIN="$X64"
else
  echo "  ERROR: No KissdHelper binary found in this folder."
  echo "  Make sure KissdHelper-mac-arm64 or KissdHelper-mac-x64"
  echo "  is in the same folder as this file."
  echo ""
  read -p "  Press Enter to close..."
  exit 1
fi

echo "  Found: $(basename "$BIN")"
echo ""

# Remove quarantine and make executable
echo "  Removing macOS quarantine flag..."
xattr -d com.apple.quarantine "$BIN" 2>/dev/null
echo "  Setting executable permission..."
chmod +x "$BIN"

echo ""
echo "  Starting KISSD Export Helper..."
echo "  (Keep this window open while using KISSD)"
echo ""

# Run it
"$BIN"
