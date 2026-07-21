/**
 * School Gallery page — renders a school's shared artwork with pre-moderated
 * comment threads.
 *  - School: ?school=<id> URL param, else the viewer's own schoolId.
 *  - All user-derived text via DOM APIs / .textContent (XSS rule).
 *  - Comments: GET shows APPROVED only; POST is held for teacher approval.
 */

/** The school whose gallery is shown. */
let _schoolId = null;
/** Current viewer ({ role, schoolId, ... }) from authManager. */
let _viewer = null;
/** Items keyed by id (for the comment modal). */
let _itemsById = {};
/** Item whose comment thread is open (null when closed). */
let _commentItemId = null;

/* ========================= Gallery load & render ========================= */

async function loadGallery() {
  const statusEl = document.getElementById('gallery-status');
  const grid = document.getElementById('gallery-grid');
  grid.textContent = '';
  try {
    const data = await window.apiClient.get('/api/gallery/' + encodeURIComponent(_schoolId));
    const items = (data && data.items) ? data.items : [];
    _itemsById = {};
    items.forEach((it) => { _itemsById[it.id] = it; });
    if (items.length === 0) {
      statusEl.textContent = 'No artwork has been shared to this gallery yet.';
      return;
    }
    statusEl.textContent = '';
    items.forEach((item) => grid.appendChild(renderGalleryCard(item)));
  } catch (err) {
    statusEl.textContent = err.message || 'You do not have access to this gallery.';
  }
}

/**
 * Builds one gallery card. First name only — never full identity.
 * @param {object} item
 * @returns {HTMLElement}
 */
function renderGalleryCard(item) {
  const card = document.createElement('div');
  card.className = 'portfolio-card';
  card.dataset.id = item.id;

  const imgWrapper = document.createElement('div');
  imgWrapper.className = 'portfolio-card-img-wrapper';
  if (item.imageUrl) {
    const img = document.createElement('img');
    img.src = item.imageUrl;
    img.alt = item.title || 'Artwork image';
    img.className = 'portfolio-card-img';
    img.setAttribute('tabindex', '0');
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', 'View full-screen image of ' + (item.title || 'artwork'));
    img.addEventListener('click', () => openLightbox(item.imageUrl, item.title));
    img.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(item.imageUrl, item.title); }
    });
    imgWrapper.appendChild(img);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'portfolio-card-img-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.textContent = 'No Image';
    imgWrapper.appendChild(placeholder);
  }
  card.appendChild(imgWrapper);

  const body = document.createElement('div');
  body.className = 'portfolio-card-body';

  const title = document.createElement('h3');
  title.className = 'portfolio-card-title';
  title.textContent = item.title || '(Untitled)';
  body.appendChild(title);

  const meta = document.createElement('p');
  meta.className = 'portfolio-card-meta';
  meta.textContent = ['by ' + (item.artistFirstName || 'a student'), item.medium, item.artistGrade]
    .filter(Boolean).join(' · ');
  body.appendChild(meta);
  card.appendChild(body);

  const actions = document.createElement('div');
  actions.className = 'portfolio-card-actions';
  if (item.commentsAllowed) {
    const commentBtn = document.createElement('button');
    commentBtn.type = 'button';
    commentBtn.className = 'portfolio-comment-btn';
    commentBtn.setAttribute('aria-label', 'Comments for ' + (item.title || 'artwork'));
    const label = document.createElement('span');
    label.textContent = 'Comments';
    commentBtn.appendChild(label);
    commentBtn.addEventListener('click', () => openCommentThread(item.id));
    actions.appendChild(commentBtn);
  }
  card.appendChild(actions);
  return card;
}

/* ============================== Lightbox ================================ */

function openLightbox(src, title) {
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  if (!lb || !img) { return; }
  img.src = src;
  img.alt = title || 'Artwork image';
  lb.hidden = false;
}

function closeLightbox() {
  const lb = document.getElementById('lightbox');
  if (lb) { lb.hidden = true; }
}

/* =========================== Comment thread ============================= */

async function openCommentThread(itemId) {
  _commentItemId = itemId;
  const modal = document.getElementById('comment-modal');
  if (!modal) { return; }
  modal.hidden = false;
  modal.style.display = 'flex';

  // Compose box: students only (backend also enforces STUDENTS_ONLY).
  const compose = document.getElementById('comment-compose');
  if (compose) {
    compose.style.display = (_viewer && _viewer.role === 'STUDENT') ? '' : 'none';
  }
  await loadComments(itemId);
  const textarea = document.getElementById('comment-body-input');
  if (textarea) { textarea.value = ''; updateCharCount(); }
}

function closeCommentThread() {
  const modal = document.getElementById('comment-modal');
  if (modal) { modal.hidden = true; modal.style.display = 'none'; }
  _commentItemId = null;
}

async function loadComments(itemId) {
  const list = document.getElementById('comment-thread-list');
  if (!list) { return; }
  list.textContent = '';
  const loading = document.createElement('li');
  loading.className = 'comment-thread__empty';
  loading.textContent = 'Loading comments…';
  list.appendChild(loading);
  try {
    const data = await window.apiClient.get('/api/gallery/items/' + encodeURIComponent(itemId) + '/comments');
    const comments = (data && data.comments) ? data.comments : [];
    list.textContent = '';
    if (comments.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'comment-thread__empty';
      empty.textContent = 'No comments yet.';
      list.appendChild(empty);
      return;
    }
    comments.forEach((c) => {
      const li = document.createElement('li');
      li.className = 'comment-thread__item';
      const author = document.createElement('strong');
      author.textContent = c.authorFirstName || 'A student';
      li.appendChild(author);
      const bodyP = document.createElement('p');
      bodyP.textContent = c.body;
      li.appendChild(bodyP);
      const when = document.createElement('small');
      const d = new Date(c.createdAt);
      when.textContent = isNaN(d.getTime()) ? '' : d.toLocaleDateString();
      li.appendChild(when);
      list.appendChild(li);
    });
  } catch (err) {
    list.textContent = '';
    const errLi = document.createElement('li');
    errLi.className = 'comment-thread__empty';
    errLi.textContent = err.message || 'Could not load comments.';
    list.appendChild(errLi);
  }
}

async function submitComment() {
  if (!_commentItemId) { return; }
  const textarea = document.getElementById('comment-body-input');
  const body = textarea ? textarea.value.trim() : '';
  if (body.length < 1) {
    UIComponents.showAlert('Write a comment first.', 'error');
    return;
  }
  try {
    await window.apiClient.post('/api/gallery/items/' + encodeURIComponent(_commentItemId) + '/comments', { body });
    if (textarea) { textarea.value = ''; updateCharCount(); }
    UIComponents.showAlert('Comment submitted — it will appear once a teacher approves it.', 'success');
  } catch (err) {
    UIComponents.showAlert(err.message || 'Could not post your comment.', 'error');
  }
}

function updateCharCount() {
  const textarea = document.getElementById('comment-body-input');
  const counter = document.getElementById('comment-char-count');
  if (textarea && counter) { counter.textContent = textarea.value.length + ' / 2000'; }
}

/* ================================ Init ================================== */

document.addEventListener('DOMContentLoaded', () => {
  UIComponents.requireAuth('/');
  UIComponents.initializeNavbar();

  _viewer = window.authManager ? window.authManager.getUser() : null;
  const params = new URLSearchParams(window.location.search);
  _schoolId = params.get('school') || (_viewer && _viewer.schoolId) || null;

  const statusEl = document.getElementById('gallery-status');
  if (!_schoolId) {
    if (statusEl) { statusEl.textContent = 'No gallery to show. Ask your teacher for a gallery link.'; }
  } else {
    // Staff of the shown school get the management entry point.
    if (_viewer && (_viewer.role === 'TEACHER' || _viewer.role === 'SCHOOL_ADMIN') &&
        (!params.get('school') || params.get('school') === _viewer.schoolId)) {
      const manage = document.getElementById('gallery-manage-link');
      if (manage) { manage.style.display = ''; }
    }
    loadGallery();
  }

  const lbClose = document.getElementById('lightbox-close');
  if (lbClose) { lbClose.addEventListener('click', closeLightbox); }
  const lb = document.getElementById('lightbox');
  if (lb) { lb.addEventListener('click', (e) => { if (e.target === lb) { closeLightbox(); } }); }

  const cClose = document.getElementById('comment-modal-close');
  if (cClose) { cClose.addEventListener('click', closeCommentThread); }
  const cSubmit = document.getElementById('comment-submit-btn');
  if (cSubmit) { cSubmit.addEventListener('click', submitComment); }
  const cInput = document.getElementById('comment-body-input');
  if (cInput) { cInput.addEventListener('input', updateCharCount); }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeCommentThread(); closeLightbox(); }
  });
});
