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

// ── State ──────────────────────────────────────────────────────────
let cs; // CSInterface
let db;
let currentUser = null;
let unsubComments = null;
let unsubProjects = null;
let unsubFiles = null;
let comments = [];

// ── Init ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  cs = new CSInterface();

  // Init Firebase
  if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
  db = firebase.firestore();

  // Auth state listener
  firebase.auth().onAuthStateChanged((user) => {
    currentUser = user;
    if (user) {
      showApp();
      loadProjects(user.uid);
    } else {
      showAuth();
    }
  });

  // Wire up sign-in button
  document.getElementById('btn-signin').addEventListener('click', signIn);
});

// ── Auth ───────────────────────────────────────────────────────────
function signIn() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  firebase.auth().signInWithPopup(provider).catch((err) => {
    console.error('Sign-in failed:', err);
    document.getElementById('auth-error').textContent = err.message;
  });
}

function signOut() {
  firebase.auth().signOut();
  cleanup();
}

function cleanup() {
  if (unsubComments) { unsubComments(); unsubComments = null; }
  if (unsubProjects) { unsubProjects(); unsubProjects = null; }
  if (unsubFiles) { unsubFiles(); unsubFiles = null; }
  comments = [];
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

// ── Projects ───────────────────────────────────────────────────────
function loadProjects(userId) {
  if (unsubProjects) unsubProjects();

  const select = document.getElementById('project-select');
  unsubProjects = db.collection('projects')
    .where('memberUids', 'array-contains', userId)
    .onSnapshot((snap) => {
      const projects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      projects.sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0));

      select.innerHTML = '<option value="">— Select project —</option>';
      projects.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        select.appendChild(opt);
      });
    });

  select.addEventListener('change', () => {
    const projectId = select.value;
    if (projectId) loadFiles(projectId);
    else clearFiles();
  });
}

// ── Files ──────────────────────────────────────────────────────────
function loadFiles(projectId) {
  if (unsubFiles) unsubFiles();

  const select = document.getElementById('file-select');
  select.innerHTML = '<option value="">— Select file —</option>';

  unsubFiles = db.collection('projectFiles')
    .where('projectId', '==', projectId)
    .onSnapshot((snap) => {
      const files = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      files.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      select.innerHTML = '<option value="">— Select file —</option>';
      files.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = f.name;
        opt.dataset.fileName = f.name;
        opt.dataset.fileSize = f.sizeBytes;
        select.appendChild(opt);
      });
    });

  select.addEventListener('change', () => {
    const opt = select.selectedOptions[0];
    if (opt && opt.value) {
      const fKey = opt.dataset.fileName + '_' + opt.dataset.fileSize;
      loadComments(fKey);
    } else {
      clearComments();
    }
  });
}

function clearFiles() {
  if (unsubFiles) { unsubFiles(); unsubFiles = null; }
  document.getElementById('file-select').innerHTML = '<option value="">— Select file —</option>';
  clearComments();
}

// ── Comments ───────────────────────────────────────────────────────
function loadComments(fileKey) {
  if (unsubComments) unsubComments();

  unsubComments = db.collection('comments')
    .where('fileKey', '==', fileKey)
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
  renderComments();
  updateStatus();
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

    let repliesHtml = '';
    if (c.replies && c.replies.length > 0) {
      repliesHtml = `<div class="comment-replies">${c.replies.map(r =>
        `<div class="reply"><span class="reply-author">${esc(r.author)}</span> <span class="reply-text">${esc(r.text)}</span></div>`
      ).join('')}</div>`;
    }

    return `
      <div class="comment-card ${resolved}" data-time="${c.timecode || 0}">
        <div class="comment-header">
          <div class="comment-author">${photo}<span>${esc(c.author)}</span></div>
          <div class="comment-timecode">${tc}${tcEnd}</div>
        </div>
        <div class="comment-text">${esc(c.text)}</div>
        <div class="comment-meta">
          ${c.resolved ? '<span class="comment-badge resolved">Resolved</span>' : ''}
          ${c.timecodeEnd ? '<span class="comment-badge range">Range</span>' : ''}
          ${c.annotationStrokes?.length ? '<span class="comment-badge range">Drawing</span>' : ''}
        </div>
        ${repliesHtml}
      </div>
    `;
  }).join('');

  // Click handler — seek playhead
  container.querySelectorAll('.comment-card').forEach(card => {
    card.addEventListener('click', () => {
      const time = parseFloat(card.dataset.time);
      seekPlayhead(time);
    });
  });
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
  cs.evalScript(`seekToTime(${seconds})`, (result) => {
    try {
      const r = JSON.parse(result);
      if (!r.success) console.warn('Seek failed:', r.error);
    } catch { /* ignore parse errors */ }
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

// ── Helpers ────────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
