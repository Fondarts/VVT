/**
 * Kissd Review CEP Panel — Photoshop Edition
 * Displays Firestore feedback comments + annotation drawings on images.
 */

/* global CSInterface, firebase */

// ── Firebase config ───────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyACvGUjdau8-36ITGvE5dXeFir_GzTiK1E',
  authDomain: 'kissd-review.firebaseapp.com',
  projectId: 'kissd-review',
  storageBucket: 'kissd-review.firebasestorage.app',
  messagingSenderId: '720957931719',
  appId: '1:720957931719:web:857d42a7dc2bb2d4943ee2',
};

const GOOGLE_CLIENT_ID = '620928038175-euo6jfvosmlvnp9t4g7tpbn4r344vn7u.apps.googleusercontent.com';
const DRIVE_SCOPES = 'email profile https://www.googleapis.com/auth/drive.readonly';

// ── State ─────────────────────────────────────────────────────────
let cs;
let db;
let currentUser = null;
let googleAccessToken = localStorage.getItem('kissd_google_token') || null;
let unsubComments = null;
let unsubProjects = null;
let comments = [];
let activeCommentId = null; // which comment's drawing is shown

// ── Init ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  cs = new CSInterface();

  // Handle OAuth redirect
  if (window.location.hash && window.location.hash.includes('access_token')) {
    const m = window.location.hash.match(/access_token=([^&]+)/);
    if (m) {
      googleAccessToken = decodeURIComponent(m[1]);
      localStorage.setItem('kissd_google_token', googleAccessToken);
      history.replaceState(null, '', window.location.pathname);
      const credential = firebase.auth.GoogleAuthProvider.credential(null, googleAccessToken);
      firebase.auth().signInWithCredential(credential).catch(console.error);
    }
  }

  // Init Firebase
  if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
  db = firebase.firestore();

  firebase.auth().onAuthStateChanged((user) => {
    currentUser = user;
    if (user) { showApp(); loadProjects(user.uid); }
    else { showAuth(); }
  });

  document.getElementById('btn-signin').addEventListener('click', signIn);
  document.getElementById('btn-projects').addEventListener('click', openSidebar);
  document.getElementById('btn-sidebar-close').addEventListener('click', closeSidebar);
  document.getElementById('sidebar-backdrop').addEventListener('click', closeSidebar);
  initResize();
});

// ── Auth ──────────────────────────────────────────────────────────
const OAUTH_PORT = 48710; // same as Premiere extension — shared OAuth redirect URI
const OAUTH_REDIRECT = `http://localhost:${OAUTH_PORT}/oauth-callback`;

function signIn() {
  const errEl = document.getElementById('auth-error');
  errEl.textContent = 'Opening browser for sign-in…';
  const cepNode = typeof cep_node !== 'undefined' ? cep_node : null;
  if (cepNode && cepNode.require) startOAuthWithNode(cepNode, errEl);
  else startOAuthManual(errEl);
}

function startOAuthWithNode(cepNode, errEl) {
  const http = cepNode.require('http');
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/oauth-callback')) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html><body style="background:#1e1e1e;color:#eee;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
        <div style="text-align:center">
          <h2 id="title">Signing in…</h2><p id="msg">Capturing token…</p>
        <script>
          var h = location.hash.substring(1);
          var el = document.getElementById('msg');
          if (!h) { el.textContent = 'No hash in URL'; document.getElementById('title').textContent = 'Failed'; }
          else {
            var m = h.match(/access_token=([^&]+)/);
            if (m) {
              fetch('http://localhost:${OAUTH_PORT}/token?t=' + m[1])
                .then(function(){ document.getElementById('title').textContent='Signed in!'; el.textContent='You can close this tab.'; })
                .catch(function(e){ el.textContent='Error: '+e.message; });
            } else { el.textContent='No token in hash'; }
          }
        </script></div></body></html>`);
      return;
    }
    if (req.url.startsWith('/token?t=')) {
      const token = decodeURIComponent(req.url.split('t=')[1]);
      res.writeHead(200); res.end('ok'); server.close();
      googleAccessToken = token;
      localStorage.setItem('kissd_google_token', googleAccessToken);
      const credential = firebase.auth.GoogleAuthProvider.credential(null, token);
      firebase.auth().signInWithCredential(credential).catch(e => { errEl.textContent = e.message; });
      return;
    }
    res.writeHead(404); res.end();
  });
  server.listen(OAUTH_PORT, '127.0.0.1', () => {
    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + [
      `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}`, 'response_type=token',
      `redirect_uri=${encodeURIComponent(OAUTH_REDIRECT)}`,
      `scope=${encodeURIComponent(DRIVE_SCOPES)}`, 'prompt=select_account',
    ].join('&');
    cs.openURLInDefaultBrowser(authUrl);
    errEl.textContent = 'Waiting for sign-in…';
  });
  server.on('error', e => { errEl.textContent = 'Auth server failed: ' + e.message; });
  setTimeout(() => { try { server.close(); } catch (_) {} }, 120000);
}

function startOAuthManual(errEl) {
  errEl.textContent = 'Opening sign-in…';
  const redirectUri = window.location.origin + window.location.pathname;
  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + [
    `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}`, 'response_type=token',
    `redirect_uri=${encodeURIComponent(redirectUri)}`,
    `scope=${encodeURIComponent(DRIVE_SCOPES)}`, 'prompt=select_account',
  ].join('&');
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
            googleAccessToken = decodeURIComponent(m[1]);
            localStorage.setItem('kissd_google_token', googleAccessToken);
            popup.close();
            const credential = firebase.auth.GoogleAuthProvider.credential(null, googleAccessToken);
            firebase.auth().signInWithCredential(credential).catch(e => { errEl.textContent = e.message; });
          }
        }
      } catch (_) {}
    }, 500);
  } else { window.location.href = authUrl; }
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
  projectFiles = {}; projects = []; comments = [];
  selectedFileId = null; selectedFileName = '';
}

// ── UI switching ──────────────────────────────────────────────────
function showAuth() {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app-screen').style.display = 'none';
}

function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'flex';
  const userEl = document.getElementById('user-info');
  if (currentUser) {
    const photo = currentUser.photoURL ? `<img src="${currentUser.photoURL}" referrerpolicy="no-referrer">` : '';
    userEl.innerHTML = `${photo}<span>${currentUser.displayName || currentUser.email}</span>`;
  }
  document.getElementById('btn-signout').addEventListener('click', signOut);
}

// ── Sidebar ───────────────────────────────────────────────────────
let projects = [];
let projectFiles = {};
let expandedProjects = {};
let expandedFolders = {};
let expandedVersions = {};
let selectedFileId = null;
let selectedFileName = '';
let fileUnsubs = {};

function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-backdrop').classList.add('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('open');
}

// ── Projects ──────────────────────────────────────────────────────
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

function loadProjectFiles(pid) {
  if (fileUnsubs[pid]) return;
  fileUnsubs[pid] = db.collection('projectFiles')
    .where('projectId', '==', pid)
    .onSnapshot((snap) => {
      projectFiles[pid] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      projectFiles[pid].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      renderSidebar();
    });
}

function unloadProjectFiles(pid) {
  if (fileUnsubs[pid]) { fileUnsubs[pid](); delete fileUnsubs[pid]; delete projectFiles[pid]; }
}

// ── Version detection ─────────────────────────────────────────────
const VERSION_PATTERN_G = /[_\-\s.](?:v|V|rev|REV|r|R|edit|EDIT)(\d{1,3})/g;
const FINAL_PATTERN = /[_\-\s.](?:final|FINAL|Final)(?=[_\-\s.]|$)/;

function parseVersion(filename) {
  const n = filename.replace(/\.[^.]+$/, '');
  const fm = n.match(FINAL_PATTERN);
  if (fm) return { baseName: n.slice(0, fm.index), versionTag: 'final', versionNumber: 9999 };
  let last = null, m;
  VERSION_PATTERN_G.lastIndex = 0;
  while ((m = VERSION_PATTERN_G.exec(n)) !== null) last = m;
  if (last) return { baseName: n.slice(0, last.index), versionTag: last[0].slice(1), versionNumber: parseInt(last[1], 10) };
  return { baseName: n, versionTag: null, versionNumber: 0 };
}

function groupByVersion(files) {
  const groups = new Map();
  for (const f of files) {
    const p = parseVersion(f.name || '');
    f._baseName = p.baseName; f._versionTag = p.versionTag; f._versionNumber = p.versionNumber;
    const key = (f.parentPath || '') + '|||' + p.baseName.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  return Array.from(groups.values()).map(vs => {
    vs.sort((a, b) => b._versionNumber - a._versionNumber);
    return { baseName: vs[0]._baseName, latest: vs[0], versions: vs };
  });
}

// ── File type icon ────────────────────────────────────────────────
const IMG_EXTS = new Set(['jpg','jpeg','png','webp','gif','bmp','tiff','avif','svg','psd','psb','tga']);
function fileIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  return IMG_EXTS.has(ext) ? '🖼️' : '🎬';
}

// ── Render sidebar ────────────────────────────────────────────────
function renderSidebar() {
  const treeEl = document.getElementById('sidebar-tree');
  if (projects.length === 0) { treeEl.innerHTML = '<div class="comment-empty">No projects yet.</div>'; return; }

  let html = '';
  for (const p of projects) {
    const isOpen = !!expandedProjects[p.id];
    html += `<div class="tree-row" data-action="toggle-project" data-pid="${p.id}">
      <span class="${isOpen ? 'tree-chevron open' : 'tree-chevron'}">&#9654;</span>
      <span class="tree-icon">&#128194;</span>
      <span class="tree-label project">${esc(p.name)}</span>
    </div>`;

    if (!isOpen) continue;
    const files = projectFiles[p.id];
    if (!files) { html += '<div class="comment-empty" style="padding:8px 0;font-size:10px;">Loading…</div>'; continue; }
    if (files.length === 0) { html += '<div class="comment-empty" style="padding:8px 0;font-size:10px;">No files.</div>'; continue; }

    const folders = new Map();
    for (const f of files) { const path = f.parentPath || '/'; if (!folders.has(path)) folders.set(path, []); folders.get(path).push(f); }
    const sortedPaths = Array.from(folders.keys()).sort();
    const single = sortedPaths.length === 1;

    for (const path of sortedPaths) {
      const ff = folders.get(path);
      const fKey = p.id + '|||' + path;
      const fOpen = single || expandedFolders[fKey] !== false;

      if (!single) {
        const dp = path === '/' ? '/' : path.replace(/^\//, '');
        html += `<div class="tree-row" data-action="toggle-folder" data-fkey="${esc(fKey)}" style="padding-left:28px;">
          <span class="${fOpen ? 'tree-chevron open' : 'tree-chevron'}">&#9654;</span>
          <span class="tree-icon">&#128193;</span>
          <span class="tree-label folder">${esc(dp)}</span>
          <span class="tree-count">${ff.length}</span>
        </div>`;
      }

      if (fOpen) {
        const vGroups = groupByVersion(ff);
        vGroups.sort((a, b) => a.baseName.localeCompare(b.baseName));
        const indent = single ? 28 : 44;

        for (const g of vGroups) {
          const f = g.latest;
          const sel = selectedFileId === f.id ? ' selected' : '';
          const vTag = f._versionTag ? `<span class="tree-badge">${esc(f._versionTag)}</span>` : '';
          const hasV = g.versions.length > 1;
          const vKey = p.id + '|||' + g.baseName.toLowerCase();
          const vToggle = hasV ? `<span class="tree-versions" data-action="toggle-versions" data-vkey="${esc(vKey)}">${g.versions.length}v</span>` : '';
          html += `<div class="tree-row${sel}" data-action="select-file" data-fid="${f.id}" data-fname="${esc(f.name)}" data-fsize="${f.sizeBytes||0}" style="padding-left:${indent}px;">
            <span class="tree-icon">${fileIcon(f.name)}</span>
            <span class="tree-label file">${esc(f.name)}</span>${vTag}${vToggle}
          </div>`;
          if (hasV && expandedVersions[vKey]) {
            for (let i = 1; i < g.versions.length; i++) {
              const v = g.versions[i];
              const vt = v._versionTag ? `<span class="tree-badge">${esc(v._versionTag)}</span>` : '';
              html += `<div class="tree-row${selectedFileId===v.id?' selected':''}" data-action="select-file" data-fid="${v.id}" data-fname="${esc(v.name)}" data-fsize="${v.sizeBytes||0}" style="padding-left:${indent+16}px;opacity:0.6;font-size:10px;">
                <span class="tree-icon">${fileIcon(v.name)}</span>
                <span class="tree-label file">${esc(v.name)}</span>${vt}
              </div>`;
            }
          }
        }
      }
    }
  }

  treeEl.innerHTML = html;
  treeEl.onclick = (e) => {
    const row = e.target.closest('[data-action]');
    if (!row) return;
    const action = row.dataset.action;
    if (action === 'toggle-project') {
      const pid = row.dataset.pid;
      expandedProjects[pid] = !expandedProjects[pid];
      if (expandedProjects[pid]) loadProjectFiles(pid); else unloadProjectFiles(pid);
      renderSidebar();
    } else if (action === 'toggle-folder') {
      expandedFolders[row.dataset.fkey] = expandedFolders[row.dataset.fkey] === false;
      renderSidebar();
    } else if (action === 'toggle-versions') {
      e.stopPropagation();
      expandedVersions[row.dataset.vkey] = !expandedVersions[row.dataset.vkey];
      renderSidebar();
    } else if (action === 'select-file') {
      selectedFileId = row.dataset.fid;
      selectedFileName = row.dataset.fname;
      const legacyKey = row.dataset.fname + '_' + row.dataset.fsize;
      loadComments(row.dataset.fid, legacyKey);
      const fileObj = findFileById(row.dataset.fid);
      showFeedbackPanel();
      loadImage(fileObj);
      closeSidebar();
      renderSidebar();
    }
  };
}

// ── Comments ──────────────────────────────────────────────────────
function loadComments(docId, legacyKey) {
  if (unsubComments) { unsubComments(); unsubComments = null; }
  const keys = [docId];
  if (legacyKey && legacyKey !== docId) keys.push(legacyKey);
  unsubComments = db.collection('comments')
    .where('fileKey', 'in', keys)
    .onSnapshot((snap) => {
      comments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      comments.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
      renderComments();
      updateStatus();
    });
}

function clearComments() {
  if (unsubComments) { unsubComments(); unsubComments = null; }
  comments = []; selectedFileId = null; selectedFileName = '';
  renderComments(); updateStatus(); hideFeedbackPanel();
}

// ── Render comments ───────────────────────────────────────────────
function renderComments() {
  const container = document.getElementById('comment-list');
  if (comments.length === 0) { container.innerHTML = '<div class="comment-empty">No feedback on this file yet.</div>'; return; }

  container.innerHTML = comments.map(c => {
    const resolved = c.resolved ? 'resolved' : '';
    const isActive = activeCommentId === c.id ? ' active' : '';
    const photo = c.authorPhoto ? `<img src="${c.authorPhoto}" referrerpolicy="no-referrer">` : '';
    const hasDrawing = c.annotationStrokes && c.annotationStrokes.length > 0;

    let repliesHtml = '';
    if (c.replies && c.replies.length > 0) {
      repliesHtml = `<div class="comment-replies">${c.replies.map(r =>
        `<div class="reply"><span class="reply-author">${esc(r.author)}:</span> ${esc(r.text)}</div>`
      ).join('')}</div>`;
    }

    const checkColor = c.resolved ? 'var(--success)' : 'var(--text-muted)';

    return `
      <div class="comment-card ${resolved}${isActive}" data-cid="${c.id}">
        <div class="comment-header">
          <div class="comment-author">${photo}<span>${esc(c.author)}</span></div>
          <div style="display:flex;align-items:center;gap:6px;">
            ${hasDrawing ? `<span class="comment-badge range drawing-btn" data-cid="${c.id}" title="Show drawing">&#9999;&#65039;</span>` : ''}
            <button class="resolve-btn" data-cid="${c.id}" title="${c.resolved ? 'Mark as open' : 'Mark as resolved'}" style="background:none;border:none;cursor:pointer;color:${checkColor};padding:2px;display:flex;align-items:center;font-size:14px;">&#10003;</button>
          </div>
        </div>
        <div class="comment-text">${esc(c.text)}</div>
        ${repliesHtml}
        <div class="reply-input-wrap">
          <input class="reply-input" data-cid="${c.id}" type="text" placeholder="Reply…">
          <button class="reply-send" data-cid="${c.id}" title="Send reply">&#8629;</button>
        </div>
      </div>
    `;
  }).join('');

  // Click: show drawing
  container.querySelectorAll('.comment-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.resolve-btn') || e.target.closest('.drawing-btn') || e.target.closest('.reply-input-wrap')) return;
      const c = comments.find(x => x.id === card.dataset.cid);
      if (c && c.annotationStrokes && c.annotationStrokes.length > 0) {
        activeCommentId = c.id;
        showAnnotations(c.annotationStrokes);
        renderComments(); // highlight active
      } else {
        activeCommentId = null;
        hideAnnotations();
        renderComments();
      }
    });
  });

  // Resolve
  container.querySelectorAll('.resolve-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); toggleResolved(btn.dataset.cid); });
  });

  // Drawing btn
  container.querySelectorAll('.drawing-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const c = comments.find(x => x.id === btn.dataset.cid);
      if (c) { activeCommentId = c.id; showAnnotations(c.annotationStrokes); renderComments(); }
    });
  });

  // Reply
  container.querySelectorAll('.reply-send').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); sendReply(btn.dataset.cid); });
  });
  container.querySelectorAll('.reply-input').forEach(input => {
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendReply(input.dataset.cid); } });
  });
}

// ── Reply ─────────────────────────────────────────────────────────
function sendReply(commentId) {
  const input = document.querySelector(`.reply-input[data-cid="${commentId}"]`);
  if (!input || !input.value.trim()) return;
  const c = comments.find(x => x.id === commentId);
  if (!c) return;
  db.collection('comments').doc(commentId).update({
    replies: [...(c.replies || []), {
      author: currentUser?.displayName || currentUser?.email || 'Anonymous',
      authorPhoto: currentUser?.photoURL || '',
      text: input.value.trim(),
      createdAt: new Date().toISOString(),
    }],
  });
  input.value = '';
}

function toggleResolved(commentId) {
  const c = comments.find(x => x.id === commentId);
  if (c) db.collection('comments').doc(commentId).update({ resolved: !c.resolved });
}

// ── Image viewer ──────────────────────────────────────────────────
function loadImage(file) {
  const img = document.getElementById('image-viewer');
  const errorEl = document.getElementById('image-error');
  const canvas = document.getElementById('annotation-canvas');

  img.style.display = 'block';
  errorEl.style.display = 'none';
  canvas.style.display = 'none';
  activeCommentId = null;

  if (!file) { showImageError(errorEl, img, 'File not found — reopen from sidebar.'); return; }

  if (!file.driveFileId) {
    img.style.display = 'none';
    errorEl.textContent = 'Searching Google Drive…';
    errorEl.style.display = 'flex';
    searchDriveByName(file.name).then(driveId => {
      if (driveId) { file.driveFileId = driveId; loadImage(file); }
      else { errorEl.textContent = 'File not found in Drive: "' + file.name + '"'; }
    }).catch(err => { errorEl.textContent = 'Drive search failed: ' + err.message; });
    return;
  }

  if (!googleAccessToken) { showImageError(errorEl, img, 'No Google token — sign out and sign in again.'); return; }

  errorEl.textContent = 'Loading image…';
  errorEl.style.display = 'flex';
  img.style.display = 'none';

  const driveUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.driveFileId)}?alt=media&supportsAllDrives=true`;
  fetch(driveUrl, { headers: { 'Authorization': `Bearer ${googleAccessToken}` } })
    .then(r => {
      if (!r.ok) return r.text().then(body => { throw new Error(`${r.status}: ${body.substring(0, 100)}`); });
      return r.blob();
    })
    .then(blob => {
      const url = URL.createObjectURL(blob);
      img.onload = () => { errorEl.style.display = 'none'; };
      img.src = url;
      img.style.display = 'block';
    })
    .catch(err => { showImageError(errorEl, img, 'Drive error: ' + err.message); });
}

function showImageError(errorEl, img, msg) {
  img.style.display = 'none';
  errorEl.textContent = msg;
  errorEl.style.display = 'flex';
}

// ── Annotations overlay ───────────────────────────────────────────
function showAnnotations(strokes) {
  const wrap = document.getElementById('image-wrap');
  const img = document.getElementById('image-viewer');
  const canvas = document.getElementById('annotation-canvas');
  if (!wrap || !img) return;

  // Wait for image to load if naturalWidth isn't ready yet
  if (!img.naturalWidth) {
    img.addEventListener('load', () => showAnnotations(strokes), { once: true });
    return;
  }

  const wrapRect = wrap.getBoundingClientRect();
  const imgRect = img.getBoundingClientRect();

  // Position canvas exactly over the image
  const rw = imgRect.width;
  const rh = imgRect.height;
  const ox = imgRect.left - wrapRect.left;
  const oy = imgRect.top - wrapRect.top;

  canvas.style.display = 'block';
  canvas.style.left = ox + 'px';
  canvas.style.top = oy + 'px';
  canvas.style.width = rw + 'px';
  canvas.style.height = rh + 'px';
  canvas.width = Math.round(rw);
  canvas.height = Math.round(rh);

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, rw, rh);

  for (const s of strokes) {
    if ((s.type === 'path' || s.type === 'eraser') && s.points && s.points.length > 1) {
      ctx.save();
      if (s.type === 'eraser') ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.strokeStyle = s.type === 'eraser' ? 'rgba(0,0,0,1)' : s.color;
      ctx.lineWidth = s.lineWidth || 3;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.moveTo(s.points[0].x * rw, s.points[0].y * rh);
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x * rw, s.points[i].y * rh);
      ctx.stroke();
      ctx.restore();
    } else if (s.type === 'text' && s.text && s.x !== undefined && s.y !== undefined) {
      const fs = Math.round((s.fontSize || 0.028) * rh);
      ctx.font = `bold ${fs}px sans-serif`;
      ctx.fillStyle = s.color;
      ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4;
      ctx.fillText(s.text, s.x * rw, s.y * rh);
      ctx.shadowBlur = 0;
    }
  }
}

function hideAnnotations() {
  const canvas = document.getElementById('annotation-canvas');
  if (canvas) {
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    canvas.style.display = 'none';
  }
}

// Redraw annotations when image-wrap resizes
window.addEventListener('resize', () => {
  if (activeCommentId) {
    const c = comments.find(x => x.id === activeCommentId);
    if (c && c.annotationStrokes) showAnnotations(c.annotationStrokes);
  }
});

// ── Status bar ────────────────────────────────────────────────────
function updateStatus() {
  const total = comments.length;
  const resolved = comments.filter(c => c.resolved).length;
  document.getElementById('status-text').textContent =
    total === 0 ? 'No comments' : `${total} comments · ${total - resolved} pending · ${resolved} resolved`;
}

// ── Feedback panel ────────────────────────────────────────────────
function showFeedbackPanel() {
  document.getElementById('feedback-panel').style.display = 'flex';
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('selected-file-label').textContent = selectedFileName || '';
}

function hideFeedbackPanel() {
  document.getElementById('feedback-panel').style.display = 'none';
  document.getElementById('empty-state').style.display = 'block';
  document.getElementById('selected-file-label').textContent = '';
  const img = document.getElementById('image-viewer');
  img.removeAttribute('src');
  hideAnnotations();
}

// ── Resize handle ─────────────────────────────────────────────────
function initResize() {
  const handle = document.getElementById('resize-handle');
  const wrap = document.getElementById('image-wrap');
  let startY, startH;
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault(); startY = e.clientY; startH = wrap.offsetHeight;
    handle.classList.add('active');
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', onStop);
  });
  function onDrag(e) {
    const newH = Math.max(60, startH + (e.clientY - startY));
    wrap.style.height = newH + 'px';
    const img = document.getElementById('image-viewer');
    img.style.maxHeight = newH + 'px';
  }
  function onStop() {
    handle.classList.remove('active');
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', onStop);
    // Redraw annotations if visible
    if (activeCommentId) {
      const c = comments.find(x => x.id === activeCommentId);
      if (c && c.annotationStrokes) showAnnotations(c.annotationStrokes);
    }
  }
}

// ── Drive search ──────────────────────────────────────────────────
async function searchDriveByName(fileName) {
  if (!googleAccessToken) return null;
  const q = encodeURIComponent(`name='${fileName.replace(/'/g, "\\'")}'`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=5&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${googleAccessToken}` } });
  if (!res.ok) { const body = await res.text(); throw new Error(`Drive API ${res.status}: ${body.substring(0, 100)}`); }
  const data = await res.json();
  return (data.files && data.files.length > 0) ? data.files[0].id : null;
}

// ── Helpers ───────────────────────────────────────────────────────
function findFileById(fileId) {
  for (const pid of Object.keys(projectFiles)) {
    const f = (projectFiles[pid] || []).find(f => f.id === fileId);
    if (f) return f;
  }
  return null;
}

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
