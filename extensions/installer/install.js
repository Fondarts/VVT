#!/usr/bin/env node
/**
 * Kissd Review — Adobe Extension Installer
 * Installs CEP extensions for Premiere Pro, After Effects, and/or Photoshop.
 *
 * Usage: run the exe and follow the prompts.
 * Requires Administrator privileges on Windows (for registry + symlink/copy).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const readline = require('readline');

// ── Config ────────────────────────────────────────────────────────
const EXTENSIONS = [
  {
    id: 'com.kissd.review',
    name: 'Premiere Pro & After Effects',
    folder: 'kissd-review',
    short: 'ppro',
  },
  {
    id: 'com.kissd.review.ps',
    name: 'Photoshop',
    folder: 'kissd-review-ps',
    short: 'ps',
  },
];

const CSXS_VERSIONS = ['CSXS.9', 'CSXS.10', 'CSXS.11', 'CSXS.12'];

// ── Helpers ───────────────────────────────────────────────────────
function isWindows() { return process.platform === 'win32'; }
function isMac() { return process.platform === 'darwin'; }

function getCepExtensionsDir() {
  if (isWindows()) {
    return path.join(process.env.APPDATA || '', 'Adobe', 'CEP', 'extensions');
  } else if (isMac()) {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Adobe', 'CEP', 'extensions');
  }
  throw new Error('Unsupported platform: ' + process.platform);
}

function getSourceDir() {
  // pkg bundles assets into a virtual /snapshot/ filesystem
  // __dirname inside pkg = /snapshot/extensions/installer
  // Extensions are at /snapshot/extensions/kissd-review and /snapshot/extensions/kissd-review-ps
  return path.resolve(__dirname, '..');
}

function isAdmin() {
  if (!isWindows()) return process.getuid?.() === 0;
  try {
    execSync('net session', { stdio: 'pipe' });
    return true;
  } catch { return false; }
}

function enablePlayerDebugMode() {
  if (!isWindows()) {
    // macOS: write plist defaults
    for (const ver of CSXS_VERSIONS) {
      try {
        execSync(`defaults write com.adobe.${ver} PlayerDebugMode 1`, { stdio: 'pipe' });
      } catch (_) {}
    }
    return true;
  }

  // Windows: write registry keys
  for (const ver of CSXS_VERSIONS) {
    try {
      execSync(
        `reg add "HKCU\\Software\\Adobe\\${ver}" /v PlayerDebugMode /t REG_SZ /d 1 /f`,
        { stdio: 'pipe' }
      );
    } catch (_) {}
  }
  return true;
}

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) throw new Error(`Source not found: ${src}`);
  if (fs.existsSync(dest)) {
    // Remove existing
    fs.rmSync(dest, { recursive: true, force: true });
  }
  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function printBanner() {
  console.log('');
  console.log('  ┌──────────────────────────────────────────┐');
  console.log('  │         Kissd Review — Installer          │');
  console.log('  │    Adobe Extension for Video & Image      │');
  console.log('  │              Review Feedback               │');
  console.log('  └──────────────────────────────────────────┘');
  console.log('');
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  printBanner();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(resolve => rl.question(q, resolve));

  const cepDir = getCepExtensionsDir();
  console.log(`  Extensions directory: ${cepDir}`);
  console.log('');

  // Show options
  console.log('  Available extensions:');
  console.log('');
  console.log('    [1] Premiere Pro & After Effects');
  console.log('    [2] Photoshop');
  console.log('    [3] All');
  console.log('');

  const choice = await ask('  Which extensions to install? (1/2/3): ');
  const selected = [];
  if (choice.trim() === '1') selected.push(EXTENSIONS[0]);
  else if (choice.trim() === '2') selected.push(EXTENSIONS[1]);
  else if (choice.trim() === '3') selected.push(...EXTENSIONS);
  else {
    console.log('\n  Invalid choice. Exiting.');
    rl.close();
    process.exit(1);
  }

  console.log('');
  console.log('  Selected:');
  selected.forEach(ext => console.log(`    ✓ ${ext.name}`));
  console.log('');

  // Step 1: Enable PlayerDebugMode
  console.log('  [1/3] Enabling unsigned extensions (PlayerDebugMode)…');
  try {
    enablePlayerDebugMode();
    console.log('        ✓ Registry keys set for ' + CSXS_VERSIONS.join(', '));
  } catch (err) {
    console.log('        ⚠ Could not set registry: ' + err.message);
    console.log('        You may need to run as Administrator.');
  }

  // Step 2: Ensure extensions directory exists
  console.log('  [2/3] Preparing extensions directory…');
  if (!fs.existsSync(cepDir)) {
    fs.mkdirSync(cepDir, { recursive: true });
    console.log('        ✓ Created ' + cepDir);
  } else {
    console.log('        ✓ Directory exists');
  }

  // Step 3: Copy extensions
  console.log('  [3/3] Installing extensions…');
  const sourceBase = getSourceDir();

  for (const ext of selected) {
    const src = path.join(sourceBase, ext.folder);
    const dest = path.join(cepDir, ext.id);

    if (!fs.existsSync(src)) {
      console.log(`        ✗ Source not found: ${src}`);
      continue;
    }

    try {
      copyDirSync(src, dest);
      console.log(`        ✓ ${ext.name} → ${dest}`);
    } catch (err) {
      console.log(`        ✗ ${ext.name}: ${err.message}`);
    }
  }

  console.log('');
  console.log('  ┌──────────────────────────────────────────┐');
  console.log('  │           Installation complete!          │');
  console.log('  │                                            │');
  console.log('  │   Restart your Adobe app, then find the   │');
  console.log('  │   panel under Window > Extensions >       │');
  console.log('  │   Kissd Review                            │');
  console.log('  └──────────────────────────────────────────┘');
  console.log('');

  await ask('  Press Enter to exit…');
  rl.close();
}

main().catch(err => {
  console.error('  Error:', err.message);
  process.exit(1);
});
