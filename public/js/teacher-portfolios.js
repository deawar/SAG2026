/**
 * Teacher Portfolios — Teacher/school-admin read-only portfolio viewer.
 * File: public/js/teacher-portfolios.js
 *
 * Conventions:
 *  - All API calls go through window.apiClient (auto-adds Bearer token).
 *  - User-derived text is set via DOM APIs / .textContent — never innerHTML.
 *  - UIComponents.createToast / UIComponents.showAlert for user feedback.
 *  - Lightbox mirrors portfolio.js exactly: named handler added on open,
 *    removed on close; overlay-click and Escape close; focus restored.
 */

/* =========================================================================
   State
   ========================================================================= */

/** The element that had focus before the lightbox was opened. */
let _preFocusElement = null;

/* =========================================================================
   Submission-state helpers (mirror portfolio.js)
   ========================================================================= */

/** Human-readable label for each submissionState value. */
const STATE_LABEL = {
  NOT_SUBMITTED: 'Not Submitted',
  PENDING_REVIEW: 'Pending Review',
  IN_AUCTION: 'In Auction',
  SOLD: 'Sold',
  UNSOLD: 'Unsold',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn'
};

/** CSS modifier class appended to .portfolio-badge for each state. */
const STATE_CLASS = {
  NOT_SUBMITTED: 'badge-state-not-submitted',
  PENDING_REVIEW: 'badge-state-pending',
  IN_AUCTION: 'badge-state-in-auction',
  SOLD: 'badge-state-sold',
  UNSOLD: 'badge-state-unsold',
  REJECTED: 'badge-state-rejected',
  WITHDRAWN: 'badge-state-withdrawn'
};

/* =========================================================================
   Load Students
   ========================================================================= */

/**
 * Fetches GET /api/teacher/portfolios and renders each student as a row
 * with name, three counts, and a "View" button.
 */
async function loadStudents() {
  const list = document.getElementById('students-list');
  if (!list) { return; }

  const loading = document.createElement('p');
  loading.className = 'section-help';
  loading.textContent = 'Loading students…';
  list.replaceChildren(loading);

  let data;
  try {
    data = await window.apiClient.get('/api/teacher/portfolios');
  } catch (err) {
    const errMsg = (err && err.message) || 'Could not load students.';
    UIComponents.createToast({ message: errMsg, type: 'error' });
    list.replaceChildren();
    return;
  }

  const students = (data && data.students) ? data.students : [];

  list.replaceChildren();

  if (students.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'section-help';
    empty.textContent = 'No registered students found.';
    list.appendChild(empty);
    return;
  }

  students.forEach(student => list.appendChild(renderStudentRow(student)));
}

/**
 * Builds a single student-row element.
 * @param {object} student - { studentId, studentName, inProgress, completed, inAuction }
 * @returns {HTMLElement}
 */
function renderStudentRow(student) {
  const row = document.createElement('div');
  row.className = 'card';
  row.style.cssText = 'margin-bottom:0.75rem;padding:0.75rem 1rem;';

  // Name
  const name = document.createElement('p');
  name.style.cssText = 'margin:0 0 0.4rem;font-weight:600;';
  name.textContent = student.studentName || '(Unknown)';
  row.appendChild(name);

  // Counts row
  const counts = document.createElement('p');
  counts.style.cssText = 'margin:0 0 0.6rem;font-size:0.8rem;color:var(--color-text-muted,#666);';
  counts.textContent = (student.inProgress || 0) + ' In Progress \xb7 ' +
    (student.completed || 0) + ' Completed \xb7 ' +
    (student.inAuction || 0) + ' In Auction';
  row.appendChild(counts);

  // View button
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-secondary btn-sm';
  btn.textContent = 'View ▸';
  btn.setAttribute('aria-label', 'View portfolio for ' + (student.studentName || 'student'));
  btn.addEventListener('click', () => viewStudent(student.studentId, student.studentName));
  row.appendChild(btn);

  return row;
}

/* =========================================================================
   View Student Portfolio
   ========================================================================= */

/**
 * Fetches GET /api/teacher/portfolios/:studentId and renders the read-only grid.
 * On 403: shows an error toast and does NOT reveal the panel.
 * @param {string|number} studentId
 * @param {string} studentName
 */
async function viewStudent(studentId, studentName) {
  const panel = document.getElementById('student-portfolio');
  const heading = document.getElementById('student-portfolio-heading');
  const helpText = document.getElementById('student-portfolio-help');
  const grid = document.getElementById('student-portfolio-grid');

  if (!panel || !grid) { return; }

  // Show loading state in the grid while keeping panel visible if it was open
  if (heading) { heading.textContent = studentName || 'Student Portfolio'; }
  if (helpText) { helpText.textContent = 'Loading…'; }
  grid.replaceChildren();
  panel.hidden = false;

  let data;
  try {
    data = await window.apiClient.get('/api/teacher/portfolios/' + encodeURIComponent(studentId));
  } catch (err) {
    // 403: access denied — hide panel and show toast
    if (err && err.status === 403) {
      panel.hidden = true;
      UIComponents.createToast({
        message: 'You don’t have access to this student’s portfolio.',
        type: 'error'
      });
      return;
    }
    const errMsg = (err && err.message) || 'Could not load portfolio.';
    UIComponents.createToast({ message: errMsg, type: 'error' });
    if (helpText) { helpText.textContent = ''; }
    return;
  }

  const items = (data && data.items) ? data.items : [];

  if (helpText) {
    helpText.textContent = items.length + ' item' + (items.length === 1 ? '' : 's') + ' — read-only view';
  }

  grid.replaceChildren();

  if (items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'section-help';
    empty.textContent = 'This student has no portfolio items yet.';
    grid.appendChild(empty);
    return;
  }

  items.forEach(item => grid.appendChild(renderReadOnlyCard(item)));
}

/**
 * Builds a read-only .portfolio-card for a student's portfolio item.
 * Shows image (click -> lightbox), title, and submissionState badge only.
 * No edit/delete/submit/toggle buttons.
 * @param {object} item
 * @returns {HTMLElement}
 */
function renderReadOnlyCard(item) {
  const card = document.createElement('div');
  card.className = 'portfolio-card';
  card.dataset.id = item.id;

  // ---- Image ----
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
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openLightbox(item.imageUrl, item.title);
      }
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

  // ---- Body ----
  const body = document.createElement('div');
  body.className = 'portfolio-card-body';

  // Title
  const title = document.createElement('h3');
  title.className = 'portfolio-card-title';
  title.textContent = item.title || '(Untitled)';
  body.appendChild(title);

  // Meta row: medium + grade
  if (item.medium || item.artistGrade) {
    const meta = document.createElement('p');
    meta.className = 'portfolio-card-meta';
    meta.textContent = [item.medium, item.artistGrade].filter(Boolean).join(' \xb7 ');
    body.appendChild(meta);
  }

  // Submission state badge
  const badge = document.createElement('span');
  badge.className = 'portfolio-badge ' + (STATE_CLASS[item.submissionState] || '');
  badge.textContent = STATE_LABEL[item.submissionState] || item.submissionState || '';
  body.appendChild(badge);

  card.appendChild(body);

  // No actions div — this is read-only

  return card;
}

/* =========================================================================
   Lightbox  (mirrors portfolio.js exactly)
   ========================================================================= */

/**
 * Opens the full-screen lightbox with the given image URL.
 * Closes on overlay click or Escape key; restores focus on close.
 * @param {string} url
 * @param {string} [altText]
 */
function openLightbox(url, altText) {
  const lightbox = document.getElementById('lightbox');
  const img      = document.getElementById('lightbox-img');
  if (!lightbox || !img) { return; }

  _preFocusElement = document.activeElement;
  img.src = url;
  img.alt = altText ? 'Full-screen image: ' + altText : 'Full-screen artwork image';

  lightbox.hidden = false;
  lightbox.removeAttribute('style');

  // Focus the close button for keyboard users
  const closeBtn = document.getElementById('lightbox-close');
  if (closeBtn) { closeBtn.focus(); }

  document.addEventListener('keydown', _lightboxEscapeHandler);
}

/**
 * Closes the full-screen lightbox and restores prior focus.
 */
function closeLightbox() {
  const lightbox = document.getElementById('lightbox');
  const img      = document.getElementById('lightbox-img');
  if (!lightbox) { return; }

  lightbox.hidden = true;

  if (img) {
    img.src = '';
    img.alt = '';
  }

  document.removeEventListener('keydown', _lightboxEscapeHandler);

  if (_preFocusElement && typeof _preFocusElement.focus === 'function') {
    _preFocusElement.focus();
  }
  _preFocusElement = null;
}

/** Keyboard handler — Escape closes the lightbox. Named so it can be removed. */
function _lightboxEscapeHandler(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeLightbox();
  }
}

/* =========================================================================
   Initialisation
   ========================================================================= */

document.addEventListener('DOMContentLoaded', () => {
  // Require authentication — redirect to home if not logged in
  if (!UIComponents.requireAuth('/')) { return; }

  // Initialise shared navbar (user name, dropdown, logout)
  UIComponents.initializeNavbar();

  // Load students list
  loadStudents();

  // ---- Lightbox: close button ----
  const lightboxClose = document.getElementById('lightbox-close');
  if (lightboxClose) {
    lightboxClose.addEventListener('click', closeLightbox);
  }

  // ---- Lightbox: backdrop click (click on the overlay itself, not the image) ----
  const lightbox = document.getElementById('lightbox');
  if (lightbox) {
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox || e.target.id === 'lightbox-close') {
        closeLightbox();
      }
    });
  }
});
