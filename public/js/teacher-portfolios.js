/**
 * Teacher Portfolios — Teacher/school-admin read-only portfolio viewer with
 * comment threads, Remove control, and admin-only Restore for removed pieces.
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

/** ID of the portfolio item whose comment thread is open (null when closed). */
let _commentItemId = null;

/** studentId currently being viewed — needed after Remove/Restore to reload. */
let _currentStudentId = null;

/** studentName currently being viewed — needed for heading after reload. */
let _currentStudentName = null;

/** itemId targeted by the pending Remove action. */
let _removingItemId = null;

/* =========================================================================
   Viewer role (read from stored token via authManager — same pattern as
   admin-dashboard.js and ui-components.js)
   ========================================================================= */

/**
 * Returns the current viewer's role string (e.g. 'SCHOOL_ADMIN', 'TEACHER').
 * @returns {string}
 */
function _viewerRole() {
  const user = authManager.getUser();
  return (user && user.role) ? user.role : '';
}

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
  _currentStudentId = studentId;
  _currentStudentName = studentName;

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
    // Signal failure in the panel rather than leaving an ambiguous empty grid.
    if (helpText) { helpText.textContent = 'Could not load this portfolio. Please try again.'; }
    return;
  }

  const items = (data && data.items) ? data.items : [];

  // Split: visible items vs removed items (admin only)
  const visibleItems  = items.filter(i => i.moderationStatus !== 'REMOVED');
  const removedItems  = items.filter(i => i.moderationStatus === 'REMOVED');
  const isAdmin = _viewerRole() === 'SCHOOL_ADMIN';

  if (helpText) {
    const visibleCount = visibleItems.length;
    helpText.textContent = visibleCount + ' item' + (visibleCount === 1 ? '' : 's') + ' — read-only view';
  }

  grid.replaceChildren();

  if (visibleItems.length === 0 && removedItems.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'section-help';
    empty.textContent = 'This student has no portfolio items yet.';
    grid.appendChild(empty);
  } else if (visibleItems.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'section-help';
    empty.textContent = 'No visible items.';
    grid.appendChild(empty);
  } else {
    visibleItems.forEach(item => grid.appendChild(renderReadOnlyCard(item, studentId)));
  }

  // Admin-only: removed pieces section
  if (isAdmin && removedItems.length > 0) {
    const removedSection = document.createElement('section');
    removedSection.className = 'removed-pieces-section';
    removedSection.setAttribute('aria-label', 'Removed pieces');

    const removedHeading = document.createElement('h3');
    removedHeading.className = 'removed-pieces-section__heading';
    removedHeading.textContent = 'Removed Pieces (' + removedItems.length + ')';
    removedSection.appendChild(removedHeading);

    const removedGrid = document.createElement('div');
    removedGrid.className = 'portfolio-grid';
    removedItems.forEach(item => removedGrid.appendChild(renderRemovedCard(item, studentId)));
    removedSection.appendChild(removedGrid);

    grid.appendChild(removedSection);
  }
}

/**
 * Builds a read-only .portfolio-card for a visible student portfolio item.
 * Shows image (click -> lightbox), title, state badge, comment thread button,
 * and a Remove button.
 * @param {object} item
 * @param {string|number} studentId
 * @returns {HTMLElement}
 */
function renderReadOnlyCard(item, studentId) {
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

  // ---- Actions ----
  const actions = document.createElement('div');
  actions.className = 'portfolio-card-actions';

  // Comments affordance
  const commentCount = Number.parseInt(item.commentCount, 10) || 0;
  const unreadCount  = Number.parseInt(item.unreadCount, 10) || 0;
  const commentBtn = document.createElement('button');
  commentBtn.type = 'button';
  commentBtn.className = 'portfolio-comment-btn';
  commentBtn.setAttribute(
    'aria-label',
    'Comments (' + commentCount + ')' + (unreadCount > 0 ? ', ' + unreadCount + ' unread' : '') +
      ' for ' + (item.title || 'artwork')
  );
  const commentLabel = document.createElement('span');
  commentLabel.textContent = 'Comments (' + commentCount + ')';
  commentBtn.appendChild(commentLabel);
  if (unreadCount > 0) {
    const dot = document.createElement('span');
    dot.className = 'comment-unread-dot';
    dot.setAttribute('aria-hidden', 'true');
    commentBtn.appendChild(dot);
  }
  commentBtn.addEventListener('click', () => openCommentThread(item.id, commentBtn));
  actions.appendChild(commentBtn);

  // Remove button (visible pieces only)
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn btn-sm moderation-remove-btn';
  removeBtn.setAttribute('aria-label', 'Remove piece: ' + (item.title || 'artwork'));
  removeBtn.textContent = 'Remove';
  removeBtn.addEventListener('click', () => openRemoveModal(item.id, item.title));
  actions.appendChild(removeBtn);

  card.appendChild(actions);
  return card;
}

/**
 * Builds a read-only .portfolio-card for a REMOVED portfolio item (admin only).
 * Shows image, title, removed flag with reason/date, and a Restore button.
 * @param {object} item
 * @param {string|number} studentId
 * @returns {HTMLElement}
 */
function renderRemovedCard(item, studentId) {
  const card = document.createElement('div');
  card.className = 'portfolio-card portfolio-card--removed';
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

  // Removed flag
  const removedBadge = document.createElement('span');
  removedBadge.className = 'moderation-status-badge moderation-status-badge--removed';
  removedBadge.textContent = 'Removed';
  body.appendChild(removedBadge);

  // Removal reason
  if (item.moderationReason) {
    const reasonEl = document.createElement('p');
    reasonEl.className = 'moderation-reason';
    reasonEl.textContent = 'Reason: ' + item.moderationReason;
    body.appendChild(reasonEl);
  }

  // Removal date + moderator ("Removed: <date> by <name>")
  if (item.moderatedAt || item.moderatedByName) {
    const dateEl = document.createElement('p');
    dateEl.className = 'moderation-date';
    let text = 'Removed';
    if (item.moderatedAt) {
      const d = new Date(item.moderatedAt);
      text += ': ' + (isNaN(d.getTime()) ? item.moderatedAt : d.toLocaleDateString());
    }
    if (item.moderatedByName) {
      text += ' by ' + item.moderatedByName;
    }
    dateEl.textContent = text;
    body.appendChild(dateEl);
  }

  card.appendChild(body);

  // ---- Actions ----
  const actions = document.createElement('div');
  actions.className = 'portfolio-card-actions';

  // Restore button (SCHOOL_ADMIN only — this function is only called for admins)
  const restoreBtn = document.createElement('button');
  restoreBtn.type = 'button';
  restoreBtn.className = 'btn btn-sm moderation-restore-btn';
  restoreBtn.setAttribute('aria-label', 'Restore piece: ' + (item.title || 'artwork'));
  restoreBtn.textContent = 'Restore';
  restoreBtn.addEventListener('click', () => restoreItem(item.id, item.title));
  actions.appendChild(restoreBtn);

  card.appendChild(actions);
  return card;
}

/* =========================================================================
   Comment Thread Modal  (mirrors portfolio.js exactly; staff delete ANY comment)
   ========================================================================= */

/**
 * Opens the comment thread modal for the given portfolio item, loads comments,
 * and clears the unread indicator on the triggering card.
 * @param {number|string} itemId
 * @param {HTMLElement} triggerBtn  The button that was clicked (for focus restore).
 */
async function openCommentThread(itemId, triggerBtn) {
  _commentItemId = itemId;
  _preFocusElement = triggerBtn || document.activeElement;

  // Clear unread dot immediately (GET marks thread read server-side)
  _clearUnreadDot(itemId);

  const modal = document.getElementById('comment-modal');
  if (!modal) { return; }

  // Reset title
  const titleEl = document.getElementById('comment-modal-title');
  if (titleEl) { titleEl.textContent = 'Comments'; }

  // Show modal
  modal.hidden = false;
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
  UIComponents.trapFocus(modal);
  document.addEventListener('keydown', _commentModalEscapeHandler);

  // Clear compose box
  const textarea = document.getElementById('comment-body-input');
  if (textarea) {
    textarea.value = '';
    _updateCharCount(textarea);
  }

  // Load thread
  await _loadCommentThread(itemId);

  // Focus close button
  const closeBtn = document.getElementById('comment-modal-close');
  if (closeBtn) { closeBtn.focus(); }
}

/** Closes the comment thread modal and restores focus. */
function closeCommentModal() {
  const modal = document.getElementById('comment-modal');
  if (modal) {
    modal.hidden = true;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }
  UIComponents.releaseFocus();
  if (_preFocusElement && typeof _preFocusElement.focus === 'function') {
    _preFocusElement.focus();
  }
  _preFocusElement = null;
  _commentItemId = null;

  document.removeEventListener('keydown', _commentModalEscapeHandler);
}

/** Keyboard handler — Escape closes the comment modal. */
function _commentModalEscapeHandler(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeCommentModal();
  }
}

/**
 * Fetches and renders the comment list for the given item.
 * Staff (canModerate=true) get a delete button on every comment.
 * @param {number|string} itemId
 */
async function _loadCommentThread(itemId) {
  const list = document.getElementById('comment-thread-list');
  if (!list) { return; }

  // Loading state
  list.replaceChildren();
  const loadingLi = document.createElement('li');
  loadingLi.className = 'comment-thread__empty';
  loadingLi.textContent = 'Loading comments…';
  list.appendChild(loadingLi);

  let comments = [];
  let canModerate = false;
  try {
    const data = await window.apiClient.get('/api/portfolio-comments/item/' + itemId);
    comments = (data && data.comments) ? data.comments : [];
    canModerate = !!(data && data.canModerate);
  } catch (err) {
    list.replaceChildren();
    const errLi = document.createElement('li');
    errLi.className = 'comment-thread__empty';
    errLi.textContent = (err && err.message) || 'Could not load comments.';
    list.appendChild(errLi);
    return;
  }

  list.replaceChildren();

  // Keep the card's "Comments (n)" badge in sync
  _updateCardCommentCount(itemId, comments.length);

  if (comments.length === 0) {
    const noLi = document.createElement('li');
    noLi.className = 'comment-thread__empty';
    noLi.id = 'comment-thread-empty';
    noLi.textContent = 'No comments yet. Be the first to comment!';
    list.appendChild(noLi);
    return;
  }

  comments.forEach(function(comment) {
    list.appendChild(_buildCommentEl(comment, canModerate));
  });

  // Scroll to bottom so newest is visible
  list.scrollTop = list.scrollHeight;
}

/**
 * Builds a single comment <li> element.
 * Staff with canModerate=true get a delete button on ALL comments (not just own).
 * All user text set via textContent — never innerHTML.
 * @param {object} comment
 * @param {boolean} canModerate
 * @returns {HTMLLIElement}
 */
function _buildCommentEl(comment, canModerate) {
  const li = document.createElement('li');
  li.className = 'comment' + (comment.isOwnByViewer ? ' comment--own' : '');
  li.dataset.commentId = comment.id;

  // Meta row
  const meta = document.createElement('div');
  meta.className = 'comment-meta';

  const authorSpan = document.createElement('span');
  authorSpan.className = 'comment-meta__author';
  authorSpan.textContent = comment.authorName || 'Unknown';
  meta.appendChild(authorSpan);

  if (comment.authorRole) {
    const roleSpan = document.createElement('span');
    roleSpan.className = 'comment-meta__role';
    roleSpan.textContent = comment.authorRole;
    meta.appendChild(roleSpan);
  }

  const dateSpan = document.createElement('span');
  dateSpan.className = 'comment-meta__date';
  const d = new Date(comment.createdAt);
  dateSpan.textContent = isNaN(d.getTime()) ? '' : d.toLocaleString();
  meta.appendChild(dateSpan);

  li.appendChild(meta);

  // Body
  const bodyEl = document.createElement('p');
  bodyEl.className = 'comment-body';
  bodyEl.textContent = comment.body || '';
  li.appendChild(bodyEl);

  // Delete button: shown when staff can moderate ANY comment, or for own comment
  if (canModerate || comment.isOwnByViewer) {
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'comment__delete-btn';
    delBtn.setAttribute('aria-label', 'Delete this comment');
    delBtn.textContent = '🗑'; // 🗑
    delBtn.addEventListener('click', function() {
      _deleteComment(comment.id);
    });
    li.appendChild(delBtn);
  }

  return li;
}

/**
 * Deletes a comment then reloads the thread.
 * @param {number|string} commentId
 */
async function _deleteComment(commentId) {
  try {
    await window.apiClient.delete('/api/portfolio-comments/' + commentId);
    if (_commentItemId) {
      await _loadCommentThread(_commentItemId);
    }
  } catch (err) {
    const msg = (err && err.message) || 'Could not delete comment.';
    UIComponents.createToast({ message: msg, type: 'error' });
  }
}

/**
 * Posts a new comment for the current thread item.
 */
async function _submitComment() {
  if (!_commentItemId) { return; }

  const textarea = document.getElementById('comment-body-input');
  const submitBtn = document.getElementById('comment-submit-btn');
  if (!textarea) { return; }

  const body = textarea.value.trim();
  if (!body) {
    UIComponents.createToast({ message: 'Comment cannot be empty.', type: 'error' });
    textarea.focus();
    return;
  }
  if (body.length > 2000) {
    UIComponents.createToast({ message: 'Comment must be 2000 characters or fewer.', type: 'error' });
    textarea.focus();
    return;
  }

  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Posting…'; }

  try {
    await window.apiClient.post('/api/portfolio-comments/item/' + _commentItemId, { body: body });
    textarea.value = '';
    _updateCharCount(textarea);
    await _loadCommentThread(_commentItemId);
  } catch (err) {
    const msg = (err && err.message) || 'Could not post comment.';
    UIComponents.createToast({ message: msg, type: 'error' });
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Post Comment'; }
  }
}

/**
 * Updates the character counter display for the comment textarea.
 * @param {HTMLTextAreaElement} textarea
 */
function _updateCharCount(textarea) {
  const counter = document.getElementById('comment-char-count');
  if (!counter) { return; }
  const len = textarea.value.length;
  counter.textContent = len + ' / 2000';
  counter.className = 'comment-thread__char-count';
  if (len > 2000) {
    counter.classList.add('comment-thread__char-count--over');
  } else if (len > 1800) {
    counter.classList.add('comment-thread__char-count--warn');
  }
}

/**
 * Clears the unread dot on the card for the given item ID.
 * @param {number|string} itemId
 */
function _clearUnreadDot(itemId) {
  const card = document.querySelector('.portfolio-card[data-id="' + itemId + '"]');
  if (!card) { return; }
  const dot = card.querySelector('.comment-unread-dot');
  if (dot) { dot.remove(); }
}

/**
 * Updates the "Comments (n)" label on the card for the given item ID.
 * @param {number|string} itemId
 * @param {number} count
 */
function _updateCardCommentCount(itemId, count) {
  const card = document.querySelector('.portfolio-card[data-id="' + itemId + '"]');
  if (!card) { return; }
  const label = card.querySelector('.portfolio-comment-btn > span:first-child');
  if (label) { label.textContent = 'Comments (' + count + ')'; }
}

/* =========================================================================
   Remove Modal
   ========================================================================= */

/**
 * Opens the Remove modal for the given piece, capturing the target item ID.
 * @param {number|string} itemId
 * @param {string} [itemTitle]
 */
function openRemoveModal(itemId, itemTitle) {
  _removingItemId = itemId;
  _preFocusElement = document.activeElement;

  const modal = document.getElementById('remove-modal');
  if (!modal) { return; }

  // Clear reason input
  const textarea = document.getElementById('remove-reason-input');
  if (textarea) {
    textarea.value = '';
    _updateRemoveCharCount(textarea);
  }

  // Update title to include piece name
  const titleEl = document.getElementById('remove-modal-title');
  if (titleEl) {
    titleEl.textContent = 'Remove Piece';
    if (itemTitle) {
      titleEl.textContent = 'Remove “' + itemTitle + '”';
    }
  }

  modal.hidden = false;
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
  UIComponents.trapFocus(modal);
  document.addEventListener('keydown', _removeModalEscapeHandler);

  if (textarea) { textarea.focus(); }
}

/** Closes the Remove modal and restores focus. */
function closeRemoveModal() {
  const modal = document.getElementById('remove-modal');
  if (modal) {
    modal.hidden = true;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }
  UIComponents.releaseFocus();
  if (_preFocusElement && typeof _preFocusElement.focus === 'function') {
    _preFocusElement.focus();
  }
  _preFocusElement = null;
  _removingItemId = null;
  document.removeEventListener('keydown', _removeModalEscapeHandler);
}

/** Keyboard handler — Escape closes the remove modal. */
function _removeModalEscapeHandler(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeRemoveModal();
  }
}

/**
 * Updates the character counter for the remove-reason textarea.
 * @param {HTMLTextAreaElement} textarea
 */
function _updateRemoveCharCount(textarea) {
  const counter = document.getElementById('remove-reason-count');
  if (!counter) { return; }
  const len = textarea.value.length;
  counter.textContent = len + ' / 500';
  counter.className = 'comment-thread__char-count';
  if (len > 500) {
    counter.classList.add('comment-thread__char-count--over');
  } else if (len > 400) {
    counter.classList.add('comment-thread__char-count--warn');
  }
}

/**
 * Handles the Remove form submission.
 * @param {Event} e
 */
async function handleRemoveFormSubmit(e) {
  e.preventDefault();

  if (!_removingItemId || !_currentStudentId) { return; }

  const textarea = document.getElementById('remove-reason-input');
  const confirmBtn = document.getElementById('remove-confirm-btn');
  const reason = (textarea && textarea.value) ? textarea.value.trim() : '';

  if (!reason) {
    UIComponents.createToast({ message: 'A reason is required.', type: 'error' });
    if (textarea) { textarea.focus(); }
    return;
  }

  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Removing…'; }

  try {
    await window.apiClient.post(
      '/api/teacher/portfolios/' + encodeURIComponent(_currentStudentId) +
      '/items/' + encodeURIComponent(_removingItemId) + '/remove',
      { reason: reason }
    );
    UIComponents.createToast({ message: 'Piece removed.', type: 'success' });
    closeRemoveModal();
    await viewStudent(_currentStudentId, _currentStudentName);
  } catch (err) {
    const msg = (err && err.message) || 'Could not remove piece.';
    UIComponents.createToast({ message: msg, type: 'error' });
  } finally {
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Remove Piece'; }
  }
}

/* =========================================================================
   Restore Action  (SCHOOL_ADMIN only)
   ========================================================================= */

/**
 * Restores a previously removed portfolio item after confirmation.
 * @param {number|string} itemId
 * @param {string} [itemTitle]
 */
async function restoreItem(itemId, itemTitle) {
  const confirmed = await UIComponents.showConfirmation(
    'Restore “' + (itemTitle || 'this piece') + '”? It will become visible to the student again.',
    'Restore Piece'
  );
  if (!confirmed) { return; }

  try {
    await window.apiClient.post(
      '/api/teacher/portfolios/' + encodeURIComponent(_currentStudentId) +
      '/items/' + encodeURIComponent(itemId) + '/restore',
      {}
    );
    UIComponents.createToast({ message: 'Piece restored.', type: 'success' });
    await viewStudent(_currentStudentId, _currentStudentName);
  } catch (err) {
    const msg = (err && err.message) || 'Could not restore piece.';
    UIComponents.createToast({ message: msg, type: 'error' });
  }
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

  // ---- Comment modal: close button ----
  const commentClose = document.getElementById('comment-modal-close');
  if (commentClose) {
    commentClose.addEventListener('click', closeCommentModal);
  }

  // ---- Comment modal: post button ----
  const commentSubmit = document.getElementById('comment-submit-btn');
  if (commentSubmit) {
    commentSubmit.addEventListener('click', _submitComment);
  }

  // ---- Comment modal: live character counter ----
  const commentInput = document.getElementById('comment-body-input');
  if (commentInput) {
    commentInput.addEventListener('input', () => _updateCharCount(commentInput));
  }

  // ---- Comment modal: backdrop click ----
  const commentModal = document.getElementById('comment-modal');
  if (commentModal) {
    commentModal.addEventListener('click', (e) => {
      if (e.target === commentModal) { closeCommentModal(); }
    });
  }

  // ---- Remove modal: close button ----
  const removeClose = document.getElementById('remove-modal-close');
  if (removeClose) {
    removeClose.addEventListener('click', closeRemoveModal);
  }

  // ---- Remove modal: cancel button ----
  const removeCancel = document.getElementById('remove-cancel-btn');
  if (removeCancel) {
    removeCancel.addEventListener('click', closeRemoveModal);
  }

  // ---- Remove modal: form submit ----
  const removeForm = document.getElementById('remove-form');
  if (removeForm) {
    removeForm.addEventListener('submit', handleRemoveFormSubmit);
  }

  // ---- Remove modal: live character counter ----
  const removeReasonInput = document.getElementById('remove-reason-input');
  if (removeReasonInput) {
    removeReasonInput.addEventListener('input', () => _updateRemoveCharCount(removeReasonInput));
  }

  // ---- Remove modal: backdrop click ----
  const removeModal = document.getElementById('remove-modal');
  if (removeModal) {
    removeModal.addEventListener('click', (e) => {
      if (e.target === removeModal) { closeRemoveModal(); }
    });
  }
});
