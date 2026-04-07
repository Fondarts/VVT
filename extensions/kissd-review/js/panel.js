/**
 * Kissd Review CEP Panel
 * Displays Firestore feedback comments and seeks Premiere/AE playhead on click.
 */

/* global CSInterface, firebase */

// ── Firebase config (same as the web app) ──────────────────────────
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyACvGUjdau8-36ITGvE5dXeFir_GzTiK1E',
  authDomain: 'kissd-review.firebaseapp.com',
  projectId: 'kissd-review',
  storageBucket: 'kissd-review.firebasestorage.app',
  messagingSenderId: '720957931719',
  appId: '1:720957931719:web:857d42a7dc2bb2d4943ee2',
};

const GOOGLE_CLIENT_ID = '620928038175-euo6jfvosmlvnp9t4g7tpbn4r344vn7u.apps.googleusercontent.com';

const HELPER_BASE = 'http://127.0.0.1:3777';
const DRIVE_SCOPES = 'email profile https://www.googleapis.com/auth/drive.readonly';

// ── State ──────────────────────────────────────────────────────────
let cs; // CSInterface
let db;
let currentUser = null;
let googleAccessToken = localStorage.getItem('kissd_google_token') || null;  // Google OAuth token (includes Drive scope)
let helperAvailable = false;
let unsubComments = null;
let unsubProjects = null;
let comments = [];

// ── Init ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  cs = new CSInterface();

  // Handle OAuth redirect — hash may contain access_token after Google sign-in
  if (window.location.hash && window.location.hash.includes('access_token')) {
    const m = window.location.hash.match(/access_token=([^&]+)/);
    if (m) {
      googleAccessToken = decodeURIComponent(m[1]);
      localStorage.setItem('kissd_google_token', googleAccessToken);
      history.replaceState(null, '', window.location.pathname);
      const credential = firebase.auth.GoogleAuthProvider.credential(null, googleAccessToken);
      firebase.auth().signInWithCredential(credential).catch((err) => {
        console.error('[Kissd] OAuth redirect sign-in failed:', err);
      });
    }
  }

  // Debug: check CEP bridge availability
  console.log('[Kissd] __adobe_cep__ exists:', typeof window.__adobe_cep__);
  if (window.__adobe_cep__) {
    console.log('[Kissd] __adobe_cep__ methods:', Object.keys(window.__adobe_cep__));
  }

  // Load ExtendScript — define seekToTime inline to ensure it's available
  cs.evalScript(`
    function seekToTime(seconds) {
      try {
        if (typeof app !== 'undefined' && app.project && app.project.activeSequence) {
          var seq = app.project.activeSequence;
          var ticks = seconds * 254016000000;
          seq.setPlayerPosition(String(Math.round(ticks)));
          return '{"success":true}';
        }
        return '{"success":false,"error":"No active sequence"}';
      } catch(e) {
        return '{"success":false,"error":"' + e.message + '"}';
      }
    }
    '{"loaded":true}'
  `, (r) => {
    console.log('[Kissd] ExtendScript loaded:', r);
  });

  // Init Firebase
  if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
  db = firebase.firestore();

  // Auth state listener
  firebase.auth().onAuthStateChanged((user) => {
    currentUser = user;
    if (user) {
      console.log('[Kissd] Signed in:', user.email, 'driveToken:', !!googleAccessToken);
      showApp();
      loadProjects(user.uid);
    } else {
      showAuth();
    }
  });

  // Wire up sign-in button
  document.getElementById('btn-signin').addEventListener('click', signIn);

  // Wire sidebar
  document.getElementById('btn-projects').addEventListener('click', openSidebar);
  document.getElementById('btn-sidebar-close').addEventListener('click', closeSidebar);
  document.getElementById('sidebar-backdrop').addEventListener('click', closeSidebar);

  // Init resize between player and comments
  initResize();

  // Check helper availability
  checkHelper();
});

// ── Auth ───────────────────────────────────────────────────────────
// CEP blocks all popups. Strategy: open system browser for OAuth,
// redirect to a local HTTP server that captures the token.
// We spin up a tiny HTTP server via Node.js (through CEP's node access)
// to receive the OAuth redirect.

const OAUTH_PORT = 48710;
const OAUTH_REDIRECT = `http://localhost:${OAUTH_PORT}/oauth-callback`;

function signIn() {
  const errEl = document.getElementById('auth-error');
  errEl.textContent = 'Opening browser for sign-in…';

  // Start a one-shot local HTTP server to capture the OAuth redirect
  const nodeScript = `
    var http = require('http');
    var server = http.createServer(function(req, res) {
      if (req.url.indexOf('/oauth-callback') === 0) {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end('<html><body style="background:#1e1e1e;color:#eee;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2>Signed in!</h2><p>You can close this tab and return to Premiere Pro.</p><script>if(location.hash){window.opener||fetch("http://localhost:${OAUTH_PORT}/token"+location.hash)}</' + 'script></div></body></html>');
      } else if (req.url.indexOf('/token#') === 0 || req.url.indexOf('/token?') === 0) {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end('ok');
        var hash = req.url.substring(6);
        var m = hash.match(/access_token=([^&]+)/);
        if (m) process.__cep_oauth_token = m[1];
        setTimeout(function(){ server.close(); }, 500);
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server.listen(${OAUTH_PORT}, '127.0.0.1');
    setTimeout(function(){ try { server.close(); } catch(e){} }, 120000);
  `;

  // CEP gives us access to Node.js
  try {
    window.__adobe_cep__.evalScript('$.global.dummy = 0'); // just to test
  } catch (_) { /* ignore */ }

  // Use cep_node to run the server
  const cepNode = typeof cep_node !== 'undefined' ? cep_node : null;
  if (cepNode && cepNode.require) {
    startOAuthWithNode(cepNode, errEl);
  } else {
    // Fallback: use CSInterface to open URL and ask user to paste token
    startOAuthManual(errEl);
  }
}

function startOAuthWithNode(cepNode, errEl) {
  const http = cepNode.require('http');
  const server = http.createServer((req, res) => {
    // The redirect page — extracts token from hash and sends it back
    if (req.url.startsWith('/oauth-callback')) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html><body style="background:#1e1e1e;color:#eee;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
        <div style="text-align:center">
          <h2 id="title">Signing in…</h2>
          <p id="msg">Capturing token…</p>
        <script>
          var h = location.hash.substring(1);
          var el = document.getElementById('msg');
          if (!h) {
            el.textContent = 'ERROR: No hash fragment in URL. Hash: ' + location.hash + ' | Full URL: ' + location.href;
            document.getElementById('title').textContent = 'Sign-in failed';
          } else {
            var m = h.match(/access_token=([^&]+)/);
            if (m) {
              el.textContent = 'Token found (' + m[1].substring(0,10) + '…), sending to panel…';
              fetch('http://localhost:${OAUTH_PORT}/token?t=' + m[1])
                .then(function() {
                  document.getElementById('title').textContent = 'Signed in!';
                  el.textContent = 'You can close this tab and return to Premiere Pro.';
                })
                .catch(function(err) {
                  el.textContent = 'ERROR sending token: ' + err.message;
                });
            } else {
              el.textContent = 'ERROR: No access_token in hash. Hash: ' + h.substring(0, 200);
              document.getElementById('title').textContent = 'Sign-in failed';
            }
          }
        </script></div></body></html>`);
      return;
    }

    // Token callback from the redirect page
    if (req.url.startsWith('/token?t=')) {
      const token = decodeURIComponent(req.url.split('t=')[1]);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      server.close();
      // Save Google access token for Drive API
      googleAccessToken = token;
      localStorage.setItem('kissd_google_token', googleAccessToken);
      // Sign in to Firebase with the token
      const credential = firebase.auth.GoogleAuthProvider.credential(null, token);
      firebase.auth().signInWithCredential(credential).catch((err) => {
        console.error('Firebase sign-in failed:', err);
        errEl.textContent = err.message;
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(OAUTH_PORT, '127.0.0.1', () => {
    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + [
      `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}`,
      'response_type=token',
      `redirect_uri=${encodeURIComponent(OAUTH_REDIRECT)}`,
      `scope=${encodeURIComponent(DRIVE_SCOPES)}`,
      'prompt=select_account',
    ].join('&');

    // Open in system default browser
    cs.openURLInDefaultBrowser(authUrl);
    errEl.textContent = 'Waiting for sign-in in your browser…';
  });

  server.on('error', (err) => {
    console.error('OAuth server error:', err);
    errEl.textContent = 'Auth server failed: ' + err.message;
  });

  // Auto-close after 2 minutes
  setTimeout(() => { try { server.close(); } catch (_) {} }, 120000);
}

function startOAuthManual(errEl) {
  // Fallback: open OAuth in a popup, capture token from redirect
  errEl.textContent = 'Opening sign-in…';

  // Redirect URI = current page (CEP panel or browser)
  const redirectUri = window.location.origin + window.location.pathname;
  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + [
    `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}`,
    'response_type=token',
    `redirect_uri=${encodeURIComponent(redirectUri)}`,
    `scope=${encodeURIComponent(DRIVE_SCOPES)}`,
    'prompt=select_account',
  ].join('&');

  // Try popup first
  const popup = window.open(authUrl, 'google-oauth', 'width=500,height=600');
  if (popup) {
    const interval = setInterval(() => {
      try {
        if (popup.closed) { clearInterval(interval); return; }
        const hash = popup.location.hash;
        if (hash && hash.includes('access_token')) {
          clearInterval(interval);
          const m = hash.match(/access_token=([^&]+)/);
          if (m) {
            const token = decodeURIComponent(m[1]);
            googleAccessToken = token;
            localStorage.setItem('kissd_google_token', googleAccessToken);
            popup.close();
            const credential = firebase.auth.GoogleAuthProvider.credential(null, token);
            firebase.auth().signInWithCredential(credential).catch((err) => {
              errEl.textContent = err.message;
            });
          }
        }
      } catch (_) { /* cross-origin — keep polling */ }
    }, 500);
  } else {
    // Popup blocked — redirect instead
    window.location.href = authUrl;
  }
}

function signOut() {
  firebase.auth().signOut();
  googleAccessToken = null;
  localStorage.removeItem('kissd_google_token');
  cleanup();
}

function cleanup() {
  if (unsubComments) { unsubComments(); unsubComments = null; }
  if (unsubProjects) { unsubProjects(); unsubProjects = null; }
  Object.keys(fileUnsubs).forEach(k => { fileUnsubs[k](); delete fileUnsubs[k]; });
  projectFiles = {};
  projects = [];
  comments = [];
  selectedFileId = null;
  selectedFileName = '';
}

// ── UI switching ───────────────────────────────────────────────────
function showAuth() {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app-screen').style.display = 'none';
}

function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'flex';

  // Update user info
  const userEl = document.getElementById('user-info');
  if (currentUser) {
    const photo = currentUser.photoURL ? `<img src="${currentUser.photoURL}" referrerpolicy="no-referrer">` : '';
    userEl.innerHTML = `${photo}<span>${currentUser.displayName || currentUser.email}</span>`;
  }

  document.getElementById('btn-signout').addEventListener('click', signOut);
}

// ── Sidebar ───────────────────────────────────────────────────────
let sidebarOpen = false;
let projects = [];
let projectFiles = {};        // projectId -> files[]
let expandedProjects = {};    // projectId -> bool
let expandedFolders = {};     // "projectId|||path" -> bool
let expandedVersions = {};    // "projectId|||vkey" -> bool
let selectedFileId = null;
let selectedFileName = '';
let fileUnsubs = {};          // projectId -> unsub fn

function openSidebar() {
  sidebarOpen = true;
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-backdrop').classList.add('open');
}

function closeSidebar() {
  sidebarOpen = false;
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('open');
}

// ── Projects ───────────────────────────────────────────────────────
function loadProjects(userId) {
  if (unsubProjects) unsubProjects();

  unsubProjects = db.collection('projects')
    .where('memberUids', 'array-contains', userId)
    .onSnapshot((snap) => {
      projects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      projects.sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0));
      renderSidebar();
    });
}

function loadProjectFiles(projectId) {
  if (fileUnsubs[projectId]) return; // already listening
  fileUnsubs[projectId] = db.collection('projectFiles')
    .where('projectId', '==', projectId)
    .onSnapshot((snap) => {
      const files = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      files.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      projectFiles[projectId] = files;
      renderSidebar();
    });
}

function unloadProjectFiles(projectId) {
  if (fileUnsubs[projectId]) {
    fileUnsubs[projectId]();
    delete fileUnsubs[projectId];
    delete projectFiles[projectId];
  }
}

// ── Version detection (ported from src/utils/versionDetection.ts) ──
const VERSION_PATTERN_G = /[_\-\s.](?:v|V|rev|REV|r|R|edit|EDIT)(\d{1,3})/g;
const FINAL_PATTERN = /[_\-\s.](?:final|FINAL|Final)(?=[_\-\s.]|$)/;

function parseVersion(filename) {
  const nameWithoutExt = filename.replace(/\.[^.]+$/, '');
  const finalMatch = nameWithoutExt.match(FINAL_PATTERN);
  if (finalMatch) {
    return { baseName: nameWithoutExt.slice(0, finalMatch.index), versionTag: 'final', versionNumber: 9999 };
  }
  let lastMatch = null, m;
  VERSION_PATTERN_G.lastIndex = 0;
  while ((m = VERSION_PATTERN_G.exec(nameWithoutExt)) !== null) lastMatch = m;
  if (lastMatch) {
    return { baseName: nameWithoutExt.slice(0, lastMatch.index), versionTag: lastMatch[0].slice(1), versionNumber: parseInt(lastMatch[1], 10) };
  }
  return { baseName: nameWithoutExt, versionTag: null, versionNumber: 0 };
}

function groupByVersion(files) {
  const groups = new Map();
  for (const f of files) {
    const parsed = parseVersion(f.name || '');
    f._baseName = parsed.baseName;
    f._versionTag = parsed.versionTag;
    f._versionNumber = parsed.versionNumber;
    const key = (f.parentPath || '') + '|||' + parsed.baseName.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  return Array.from(groups.values()).map(versions => {
    versions.sort((a, b) => b._versionNumber - a._versionNumber);
    return { baseName: versions[0]._baseName, latest: versions[0], versions };
  });
}

// ── Render sidebar tree ───────────────────────────────────────────
function renderSidebar() {
  const treeEl = document.getElementById('sidebar-tree');

  if (projects.length === 0) {
    treeEl.innerHTML = '<div class="comment-empty">No projects yet.</div>';
    return;
  }

  let html = '';
  for (const p of projects) {
    const isOpen = !!expandedProjects[p.id];
    const chevron = isOpen ? 'tree-chevron open' : 'tree-chevron';

    html += `<div class="tree-row" data-action="toggle-project" data-pid="${p.id}">
      <span class="${chevron}">▶</span>
      <span class="tree-icon">📂</span>
      <span class="tree-label project">${esc(p.name)}</span>
    </div>`;

    if (isOpen) {
      const files = projectFiles[p.id];
      if (!files) {
        html += `<div class="comment-empty" style="padding: 8px 0; font-size: 10px;">Loading…</div>`;
        continue;
      }
      if (files.length === 0) {
        html += `<div class="comment-empty" style="padding: 8px 0; font-size: 10px;">No files.</div>`;
        continue;
      }

      // Group by parentPath
      const folders = new Map();
      for (const f of files) {
        const path = f.parentPath || '/';
        if (!folders.has(path)) folders.set(path, []);
        folders.get(path).push(f);
      }
      const sortedPaths = Array.from(folders.keys()).sort();
      const singleFolder = sortedPaths.length === 1;

      for (const path of sortedPaths) {
        const folderFiles = folders.get(path);
        const fKey = p.id + '|||' + path;
        const folderOpen = singleFolder || expandedFolders[fKey] !== false;

        if (!singleFolder) {
          const displayPath = path === '/' ? '/' : path.replace(/^\//, '');
          const fChevron = folderOpen ? 'tree-chevron open' : 'tree-chevron';
          html += `<div class="tree-row" data-action="toggle-folder" data-fkey="${esc(fKey)}" style="padding-left:28px;">
            <span class="${fChevron}">▶</span>
            <span class="tree-icon">📁</span>
            <span class="tree-label folder">${esc(displayPath)}</span>
            <span class="tree-count">${folderFiles.length}</span>
          </div>`;
        }

        if (folderOpen) {
          const vGroups = groupByVersion(folderFiles);
          vGroups.sort((a, b) => a.baseName.localeCompare(b.baseName));
          const indent = singleFolder ? 28 : 44;

          for (const g of vGroups) {
            const f = g.latest;
            const sel = selectedFileId === f.id ? ' selected' : '';
            const vTag = f._versionTag ? `<span class="tree-badge">${esc(f._versionTag)}</span>` : '';
            const hasV = g.versions.length > 1;
            const vKey = p.id + '|||' + g.baseName.toLowerCase();
            const vToggle = hasV ? `<span class="tree-versions" data-action="toggle-versions" data-vkey="${esc(vKey)}">${g.versions.length}v</span>` : '';

            html += `<div class="tree-row${sel}" data-action="select-file" data-fid="${f.id}" data-fname="${esc(f.name)}" data-fsize="${f.sizeBytes || 0}" style="padding-left:${indent}px;">
              <span class="tree-icon">🎬</span>
              <span class="tree-label file">${esc(f.name)}</span>${vTag}${vToggle}
            </div>`;

            if (hasV && expandedVersions[vKey]) {
              for (let i = 1; i < g.versions.length; i++) {
                const v = g.versions[i];
                const vSel = selectedFileId === v.id ? ' selected' : '';
                const vt = v._versionTag ? `<span class="tree-badge">${esc(v._versionTag)}</span>` : '';
                html += `<div class="tree-row${vSel}" data-action="select-file" data-fid="${v.id}" data-fname="${esc(v.name)}" data-fsize="${v.sizeBytes || 0}" style="padding-left:${indent + 16}px; opacity:0.6; font-size:10px;">
                  <span class="tree-icon">🎬</span>
                  <span class="tree-label file">${esc(v.name)}</span>${vt}
                </div>`;
              }
            }
          }
        }
      }
    }
  }

  treeEl.innerHTML = html;

  // Single delegated click handler
  treeEl.onclick = (e) => {
    const row = e.target.closest('[data-action]');
    if (!row) return;
    const action = row.dataset.action;

    if (action === 'toggle-project') {
      const pid = row.dataset.pid;
      expandedProjects[pid] = !expandedProjects[pid];
      if (expandedProjects[pid]) loadProjectFiles(pid);
      else unloadProjectFiles(pid);
      renderSidebar();
    } else if (action === 'toggle-folder') {
      const fkey = row.dataset.fkey;
      expandedFolders[fkey] = expandedFolders[fkey] === false ? true : false;
      renderSidebar();
    } else if (action === 'toggle-versions') {
      e.stopPropagation();
      const vkey = row.dataset.vkey;
      expandedVersions[vkey] = !expandedVersions[vkey];
      renderSidebar();
    } else if (action === 'select-file') {
      selectedFileId = row.dataset.fid;
      selectedFileName = row.dataset.fname;
      const legacyKey = row.dataset.fname + '_' + row.dataset.fsize;
      loadComments(row.dataset.fid, legacyKey);
      // Find the file object to get driveFileId
      const fileObj = findFileById(row.dataset.fid);
      showFeedbackPanel();
      loadVideo(fileObj);
      closeSidebar();
      renderSidebar();
    }
  };
}

// ── Comments ───────────────────────────────────────────────────────
// Comments may be stored with fileKey = projectFile doc ID (Projects mode)
// or fileKey = "fileName_fileSize" (Local mode). Query both and merge.
function loadComments(docId, legacyKey) {
  if (unsubComments) { unsubComments(); unsubComments = null; }

  const keys = [docId];
  if (legacyKey && legacyKey !== docId) keys.push(legacyKey);

  // Firestore 'in' query supports up to 30 values
  unsubComments = db.collection('comments')
    .where('fileKey', 'in', keys)
    .onSnapshot((snap) => {
      comments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      comments.sort((a, b) => (a.timecode || 0) - (b.timecode || 0));
      renderComments();
      updateStatus();
    });
}

function clearComments() {
  if (unsubComments) { unsubComments(); unsubComments = null; }
  comments = [];
  selectedFileId = null;
  selectedFileName = '';
  renderComments();
  updateStatus();
  hideFeedbackPanel();
}

// ── Render ─────────────────────────────────────────────────────────
function renderComments() {
  const container = document.getElementById('comment-list');

  if (comments.length === 0) {
    container.innerHTML = '<div class="comment-empty">No feedback on this file yet.</div>';
    return;
  }

  container.innerHTML = comments.map(c => {
    const tc = formatTimecode(c.timecode || 0);
    const tcEnd = c.timecodeEnd ? ' → ' + formatTimecode(c.timecodeEnd) : '';
    const resolved = c.resolved ? 'resolved' : '';
    const photo = c.authorPhoto ? `<img src="${c.authorPhoto}" referrerpolicy="no-referrer">` : '';
    const hasDrawing = c.annotationStrokes && c.annotationStrokes.length > 0;

    let repliesHtml = '';
    if (c.replies && c.replies.length > 0) {
      repliesHtml = `<div class="comment-replies">${c.replies.map(r =>
        `<div class="reply"><span class="reply-author">${esc(r.author)}:</span> ${esc(r.text)}</div>`
      ).join('')}</div>`;
    }

    const checkColor = c.resolved ? 'var(--success)' : 'var(--text-muted)';
    const checkTitle = c.resolved ? 'Mark as open' : 'Mark as resolved';

    return `
      <div class="comment-card ${resolved}" data-time="${c.timecode || 0}" data-cid="${c.id}">
        <div class="comment-header">
          <div class="comment-author">${photo}<span>${esc(c.author)}</span></div>
          <div style="display:flex;align-items:center;gap:6px;">
            ${hasDrawing ? '<span class="comment-badge range drawing-btn" data-cid="' + c.id + '" title="Show drawing">✏️</span>' : ''}
            <div class="comment-timecode">${tc}${tcEnd}</div>
            <button class="resolve-btn" data-cid="${c.id}" title="${checkTitle}" style="background:none;border:none;cursor:pointer;color:${checkColor};padding:2px;display:flex;align-items:center;font-size:14px;">✓</button>
          </div>
        </div>
        <div class="comment-text">${esc(c.text)}</div>
        ${repliesHtml}
        <div class="reply-input-wrap">
          <input class="reply-input" data-cid="${c.id}" type="text" placeholder="Reply…">
          <button class="reply-send" data-cid="${c.id}" title="Send reply">↵</button>
        </div>
      </div>
    `;
  }).join('');

  // Click handlers
  container.querySelectorAll('.comment-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // Don't seek if clicking resolve button or drawing button
      if (e.target.closest('.resolve-btn') || e.target.closest('.drawing-btn')) return;
      const time = parseFloat(card.dataset.time);
      seekPlayhead(time);
      seekVideoPlayer(time);
      // Show annotations if this comment has them
      const c = comments.find(x => x.id === card.dataset.cid);
      if (c && c.annotationStrokes && c.annotationStrokes.length > 0) {
        showAnnotations(c.annotationStrokes);
      } else {
        hideAnnotations();
      }
    });
  });

  // Resolve buttons
  container.querySelectorAll('.resolve-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleResolved(btn.dataset.cid);
    });
  });

  // Drawing buttons
  container.querySelectorAll('.drawing-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const c = comments.find(x => x.id === btn.dataset.cid);
      if (c) {
        const time = c.timecode || 0;
        seekPlayhead(time);
        seekVideoPlayer(time);
        showAnnotations(c.annotationStrokes);
      }
    });
  });

  // Reply inputs
  container.querySelectorAll('.reply-send').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      sendReply(btn.dataset.cid);
    });
  });
  container.querySelectorAll('.reply-input').forEach(input => {
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendReply(input.dataset.cid);
      }
    });
  });
}

// ── Reply ─────────────────────────────────────────────────────────
function sendReply(commentId) {
  const input = document.querySelector(`.reply-input[data-cid="${commentId}"]`);
  if (!input || !input.value.trim()) return;

  const c = comments.find(x => x.id === commentId);
  if (!c) return;

  const reply = {
    author: currentUser?.displayName || currentUser?.email || 'Anonymous',
    authorPhoto: currentUser?.photoURL || '',
    text: input.value.trim(),
    createdAt: new Date().toISOString(),
  };

  const existingReplies = c.replies || [];
  db.collection('comments').doc(commentId).update({
    replies: [...existingReplies, reply],
  });

  input.value = '';
}

// ── Toggle resolved ───────────────────────────────────────────────
function toggleResolved(commentId) {
  const c = comments.find(x => x.id === commentId);
  if (!c) return;
  db.collection('comments').doc(commentId).update({ resolved: !c.resolved });
}

// ── Annotations overlay ───────────────────────────────────────────
let annotationCanvas = null;

function showAnnotations(strokes) {
  const playerWrap = document.getElementById('player-wrap');
  const video = document.getElementById('video-player');
  if (!playerWrap || !video || !video.videoWidth) return;

  if (!annotationCanvas) {
    annotationCanvas = document.createElement('canvas');
    annotationCanvas.id = 'annotation-canvas';
    annotationCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:5;';
    playerWrap.style.position = 'relative';
    playerWrap.appendChild(annotationCanvas);
  }

  // Calculate video content rect (accounting for object-fit:contain)
  const wrapRect = playerWrap.getBoundingClientRect();
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const wrapW = wrapRect.width;
  const wrapH = wrapRect.height;
  const scale = Math.min(wrapW / vw, wrapH / vh);
  const rw = vw * scale;
  const rh = vh * scale;
  const ox = (wrapW - rw) / 2;
  const oy = (wrapH - rh) / 2;

  annotationCanvas.width = Math.round(wrapW);
  annotationCanvas.height = Math.round(wrapH);

  const ctx = annotationCanvas.getContext('2d');
  ctx.clearRect(0, 0, wrapW, wrapH);

  for (const s of strokes) {
    if ((s.type === 'path' || s.type === 'eraser') && s.points && s.points.length > 1) {
      ctx.save();
      if (s.type === 'eraser') ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.strokeStyle = s.type === 'eraser' ? 'rgba(0,0,0,1)' : s.color;
      ctx.lineWidth = s.lineWidth || 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(s.points[0].x * rw + ox, s.points[0].y * rh + oy);
      for (let i = 1; i < s.points.length; i++) {
        ctx.lineTo(s.points[i].x * rw + ox, s.points[i].y * rh + oy);
      }
      ctx.stroke();
      ctx.restore();
    } else if (s.type === 'text' && s.text && s.x !== undefined && s.y !== undefined) {
      const fs = Math.round((s.fontSize || 0.028) * rh);
      ctx.font = `bold ${fs}px sans-serif`;
      ctx.fillStyle = s.color;
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 4;
      ctx.fillText(s.text, s.x * rw + ox, s.y * rh + oy);
      ctx.shadowBlur = 0;
    }
  }
}

function hideAnnotations() {
  if (annotationCanvas) {
    const ctx = annotationCanvas.getContext('2d');
    ctx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
  }
}

// ── Timecode formatting ────────────────────────────────────────────
function formatTimecode(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.round((seconds % 1) * 30); // assume ~30fps display
  return [h, m, s, f].map(v => String(v).padStart(2, '0')).join(':');
}

// ── Playhead seek via ExtendScript ─────────────────────────────────
function seekPlayhead(seconds) {
  console.log('[Kissd] Seeking to', seconds, 'seconds');
  cs.evalScript(`seekToTime(${seconds})`, (result) => {
    console.log('[Kissd] seekToTime result:', result);
    try {
      const r = JSON.parse(result);
      if (!r.success) console.warn('[Kissd] Seek failed:', r.error);
    } catch (e) {
      console.warn('[Kissd] Could not parse result:', result, e);
    }
  });
}

// ── Status bar ─────────────────────────────────────────────────────
function updateStatus() {
  const total = comments.length;
  const resolved = comments.filter(c => c.resolved).length;
  const pending = total - resolved;
  document.getElementById('status-text').textContent =
    total === 0 ? 'No comments' : `${total} comments · ${pending} pending · ${resolved} resolved`;
}

// ── Feedback panel visibility ─────────────────────────────────────
function showFeedbackPanel() {
  document.getElementById('feedback-panel').style.display = 'flex';
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('selected-file-label').textContent = selectedFileName || '';
}

function hideFeedbackPanel() {
  document.getElementById('feedback-panel').style.display = 'none';
  document.getElementById('empty-state').style.display = 'block';
  document.getElementById('selected-file-label').textContent = '';
  // Stop video
  const video = document.getElementById('video-player');
  video.pause();
  video.removeAttribute('src');
  video.load();
}

// ── Video player ──────────────────────────────────────────────────
function loadVideo(file) {
  const video = document.getElementById('video-player');
  const errorEl = document.getElementById('player-error');

  video.style.display = 'block';
  errorEl.style.display = 'none';

  if (!file) {
    video.style.display = 'none';
    errorEl.textContent = 'File object not found — try reopening from sidebar.';
    errorEl.style.display = 'flex';
    console.warn('[Kissd] file is null/undefined');
    return;
  }

  if (!file.driveFileId) {
    // No driveFileId stored — try to find the file in Drive by name
    console.log('[Kissd] No driveFileId, searching Drive for:', file.name);
    errorEl.textContent = 'Searching Google Drive for "' + file.name + '"…';
    errorEl.style.display = 'flex';
    video.style.display = 'none';

    searchDriveByName(file.name).then(driveId => {
      if (driveId) {
        console.log('[Kissd] Found driveFileId via search:', driveId);
        file.driveFileId = driveId;
        loadVideo(file); // retry with the found ID
      } else {
        errorEl.textContent = 'File not found in your Google Drive: "' + file.name + '"';
      }
    }).catch(err => {
      errorEl.textContent = 'Drive search failed: ' + err.message;
    });
    return;
  }

  if (!googleAccessToken) {
    video.style.display = 'none';
    errorEl.textContent = 'No Google token — sign out and sign in again (Drive access needed).';
    errorEl.style.display = 'flex';
    console.warn('[Kissd] No googleAccessToken stored');
    return;
  }

  const driveId = file.driveFileId;
  errorEl.textContent = `Loading video… (Drive ID: ${driveId.substring(0, 12)}…)`;
  errorEl.style.display = 'flex';
  video.style.display = 'none';

  // Fetch video from Drive API directly (supports shared drives)
  const driveUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveId)}?alt=media&supportsAllDrives=true`;

  fetch(driveUrl, {
    headers: { 'Authorization': `Bearer ${googleAccessToken}` }
  }).then(r => {
    if (!r.ok) {
      return r.text().then(body => {
        errorEl.textContent = `Drive API error (${r.status}): ${body.substring(0, 150)}`;
      });
    }
    return r.blob().then(blob => {
      const blobUrl = URL.createObjectURL(blob);
      video.src = blobUrl;
      video.style.display = 'block';
      errorEl.style.display = 'none';
    });
  }).catch(err => {
    errorEl.textContent = `Fetch error: ${err.message}`;
  });
}

// Seek the video player to a specific time (when clicking comments)
function seekVideoPlayer(seconds) {
  const video = document.getElementById('video-player');
  if (video.src && video.readyState >= 1) {
    video.currentTime = seconds;
  }
}

// ── Helper check ──────────────────────────────────────────────────
function checkHelper() {
  const doCheck = () => {
    fetch(`${HELPER_BASE}/health`)
      .then(r => { helperAvailable = r.ok; })
      .catch(() => { helperAvailable = false; });
  };
  doCheck();
  setInterval(doCheck, 30000);
}

// ── Resize handle (between player and comments) ───────────────────
function initResize() {
  const handle = document.getElementById('resize-handle');
  const playerWrap = document.getElementById('player-wrap');
  let startY, startH;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startY = e.clientY;
    startH = playerWrap.offsetHeight;
    handle.classList.add('active');
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', onStop);
  });

  function onDrag(e) {
    const delta = e.clientY - startY;
    const newH = Math.max(80, startH + delta);
    playerWrap.style.height = newH + 'px';
    const video = document.getElementById('video-player');
    video.style.maxHeight = newH + 'px';
  }

  function onStop() {
    handle.classList.remove('active');
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', onStop);
  }
}

// ── Drive search ──────────────────────────────────────────────────
async function searchDriveByName(fileName) {
  if (!googleAccessToken) return null;
  const q = encodeURIComponent(`name='${fileName.replace(/'/g, "\\'")}'`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=5&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${googleAccessToken}` }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Drive API ${res.status}: ${body.substring(0, 100)}`);
  }
  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id; // Return first match
  }
  return null;
}

// ── Helpers ────────────────────────────────────────────────────────
function findFileById(fileId) {
  for (const pid of Object.keys(projectFiles)) {
    const files = projectFiles[pid];
    if (!files) continue;
    const found = files.find(f => f.id === fileId);
    if (found) return found;
  }
  return null;
}

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
