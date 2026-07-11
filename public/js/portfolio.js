/**
 * Portfolio Page — Student-facing artwork portfolio with CRUD, submit/withdraw,
 * and full-screen image lightbox.
 *
 * Conventions:
 *  - All API calls go through window.apiClient (auto-adds Bearer token).
 *  - User-derived text is set via DOM APIs / .textContent — never innerHTML.
 *  - UIComponents.createToast / UIComponents.showAlert for user feedback.
 */

/* =========================================================================
   State
   ========================================================================= */

/** ID of the portfolio item currently being edited (null when adding). */
let _editingId = null;

/** ID of the portfolio item targeted by the Submit modal. */
let _submittingId = null;

/** The element that had focus before a modal or the lightbox was opened. */
let _preFocusElement = null;

/* =========================================================================
   Submission-state helpers
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

/**
 * Returns true when the item is "locked" — server will 409 on edit/delete.
 * @param {object} item
 * @returns {boolean}
 */
function isLocked(item) {
  return item.submissionState === 'PENDING_REVIEW' || item.submissionState === 'IN_AUCTION';
}

/**
 * Returns true when a COMPLETED item may be submitted (no active submission).
 * @param {object} item
 * @returns {boolean}
 */
function isSubmittable(item) {
  return (
    item.portfolioStatus === 'COMPLETED' &&
    (item.submissionState === 'NOT_SUBMITTED' ||
      item.submissionState === 'REJECTED' ||
      item.submissionState === 'WITHDRAWN' ||
      item.submissionState === 'UNSOLD')
  );
}

/* =========================================================================
   Load & Render
   ========================================================================= */

/**
 * Fetches GET /api/portfolio, splits items by portfolioStatus, renders grids.
 */
async function loadPortfolio() {
  const inProgressGrid = document.getElementById('in-progress-grid');
  const completedGrid  = document.getElementById('completed-grid');
  const inProgressCount = document.getElementById('in-progress-count');
  const completedCount  = document.getElementById('completed-count');

  if (!inProgressGrid || !completedGrid) { return; }

  // Show loading placeholders
  const loadingMsg = document.createElement('p');
  loadingMsg.className = 'loading-message';
  loadingMsg.textContent = 'Loading portfolio...';
  inProgressGrid.replaceChildren(loadingMsg.cloneNode(true));
  completedGrid.replaceChildren(loadingMsg.cloneNode(true));

  let items = [];
  try {
    const data = await window.apiClient.get('/api/portfolio');
    items = data.items || [];
  } catch (err) {
    const errMsg = (err && err.status === 401)
      ? 'Session expired — please log in again.'
      : (err && err.message) || 'Could not load portfolio.';
    UIComponents.createToast({ message: errMsg, type: 'error' });
    inProgressGrid.replaceChildren();
    completedGrid.replaceChildren();
    return;
  }

  const inProgress = items.filter(i => i.portfolioStatus === 'IN_PROGRESS');
  const completed  = items.filter(i => i.portfolioStatus === 'COMPLETED');

  if (inProgressCount) { inProgressCount.textContent = String(inProgress.length); }
  if (completedCount)  { completedCount.textContent  = String(completed.length);  }

  renderGrid(inProgressGrid, inProgress, 'No in-progress artwork yet. Click "+ Add Artwork" to get started.');
  renderGrid(completedGrid,  completed,  'No completed artwork yet.');
}

/**
 * Renders items into a grid element, or an empty-state message.
 * @param {HTMLElement} grid
 * @param {object[]} items
 * @param {string} emptyMsg
 */
function renderGrid(grid, items, emptyMsg) {
  grid.replaceChildren();

  if (items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'section-help';
    empty.textContent = emptyMsg;
    grid.appendChild(empty);
    return;
  }

  items.forEach(item => grid.appendChild(renderCard(item)));
}

/**
 * Builds a single .portfolio-card element for the given item.
 * Uses DOM APIs for all user-derived text (XSS rule).
 * @param {object} item
 * @returns {HTMLElement}
 */
function renderCard(item) {
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
    meta.textContent = [item.medium, item.artistGrade].filter(Boolean).join(' · ');
    body.appendChild(meta);
  }

  // Rejection reason (if any)
  if (item.rejectionReason && item.submissionState === 'REJECTED') {
    const reason = document.createElement('p');
    reason.className = 'portfolio-card-rejection';
    reason.textContent = 'Rejection reason: ' + item.rejectionReason;
    body.appendChild(reason);
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
  const locked = isLocked(item);

  // Edit button
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn btn-secondary btn-sm';
  editBtn.setAttribute('aria-label', 'Edit ' + (item.title || 'artwork'));
  editBtn.textContent = 'Edit';
  if (locked) {
    editBtn.disabled = true;
    editBtn.setAttribute('aria-disabled', 'true');
    editBtn.title = 'Cannot edit while submitted for review or in auction';
  } else {
    editBtn.addEventListener('click', () => openEditModal(item));
  }
  actions.appendChild(editBtn);

  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn btn-secondary btn-sm';
  deleteBtn.setAttribute('aria-label', 'Delete ' + (item.title || 'artwork'));
  deleteBtn.textContent = 'Delete';
  if (locked) {
    deleteBtn.disabled = true;
    deleteBtn.setAttribute('aria-disabled', 'true');
    deleteBtn.title = 'Cannot delete while submitted for review or in auction';
  } else {
    deleteBtn.addEventListener('click', () => deleteItem(item.id, item.title));
  }
  actions.appendChild(deleteBtn);

  // Toggle status button
  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'btn btn-secondary btn-sm';
  if (item.portfolioStatus === 'IN_PROGRESS') {
    toggleBtn.textContent = 'Mark Complete';
    toggleBtn.setAttribute('aria-label', 'Mark artwork as completed');
  } else {
    toggleBtn.textContent = 'Mark In Progress';
    toggleBtn.setAttribute('aria-label', 'Mark artwork as in progress');
  }
  if (locked) {
    toggleBtn.disabled = true;
    toggleBtn.setAttribute('aria-disabled', 'true');
    toggleBtn.title = 'Cannot change status while submitted for review or in auction';
  } else {
    toggleBtn.addEventListener('click', () => toggleStatus(item));
  }
  actions.appendChild(toggleBtn);

  // Submit button (COMPLETED + submittable)
  if (isSubmittable(item)) {
    const submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'btn btn-primary btn-sm';
    submitBtn.textContent = 'Submit';
    submitBtn.setAttribute('aria-label', 'Submit ' + (item.title || 'artwork') + ' to an auction');
    submitBtn.addEventListener('click', () => openSubmitModal(item.id));
    actions.appendChild(submitBtn);
  }

  // Withdraw button (only PENDING_REVIEW)
  if (item.submissionState === 'PENDING_REVIEW') {
    const withdrawBtn = document.createElement('button');
    withdrawBtn.type = 'button';
    withdrawBtn.className = 'btn btn-secondary btn-sm';
    withdrawBtn.textContent = 'Withdraw';
    withdrawBtn.setAttribute('aria-label', 'Withdraw ' + (item.title || 'artwork') + ' from review');
    withdrawBtn.addEventListener('click', () => withdrawItem(item.id));
    actions.appendChild(withdrawBtn);
  }

  card.appendChild(actions);
  return card;
}

/* =========================================================================
   Lightbox
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

/** Keyboard handler — Escape closes the lightbox. */
function _lightboxEscapeHandler(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeLightbox();
  }
}

/* =========================================================================
   Add / Edit Modal
   ========================================================================= */

/** Opens the Add modal (no existing item). */
function openAddModal() {
  _editingId = null;

  const titleEl = document.getElementById('piece-modal-title');
  if (titleEl) { titleEl.textContent = 'Add Artwork'; }

  // Clear all fields
  const form = document.getElementById('piece-form');
  if (form) { form.reset(); }

  const preview = document.getElementById('piece-image-preview');
  if (preview) { preview.style.display = 'none'; }

  _preFocusElement = document.activeElement;

  const modal = document.getElementById('piece-modal');
  modal.hidden = false;
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
  UIComponents.trapFocus(modal);

  const firstInput = document.getElementById('piece-title');
  if (firstInput) { firstInput.focus(); }
}

/**
 * Opens the Edit modal pre-filled with the given item's data.
 * @param {object} item
 */
function openEditModal(item) {
  _editingId = item.id;

  const titleEl = document.getElementById('piece-modal-title');
  if (titleEl) { titleEl.textContent = 'Edit Artwork'; }

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) { el.value = val || ''; }
  };

  setVal('piece-title',       item.title);
  setVal('piece-description', item.description);
  setVal('piece-medium',      item.medium);
  setVal('piece-grade',       item.artistGrade);

  // Clear file input (can't pre-fill for security reasons)
  const fileInput = document.getElementById('piece-image');
  if (fileInput) { fileInput.value = ''; }

  // Show existing image as preview if available
  const preview    = document.getElementById('piece-image-preview');
  const previewImg = document.getElementById('piece-preview-img');
  if (preview && previewImg && item.imageUrl) {
    previewImg.src = item.imageUrl;
    previewImg.alt = 'Current image for ' + (item.title || 'artwork');
    preview.style.display = 'block';
  } else if (preview) {
    preview.style.display = 'none';
  }

  _preFocusElement = document.activeElement;

  const modal = document.getElementById('piece-modal');
  modal.hidden = false;
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
  UIComponents.trapFocus(modal);

  const firstInput = document.getElementById('piece-title');
  if (firstInput) { firstInput.focus(); }
}

/** Closes the Add/Edit modal and restores focus. */
function closePieceModal() {
  const modal = document.getElementById('piece-modal');
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
  _editingId = null;
}

/**
 * Handles Add/Edit form submission.
 * Reads the image file (if provided) as a base64 data URL, then POSTs or PUTs.
 * @param {Event} e
 */
async function handlePieceFormSubmit(e) {
  e.preventDefault();

  const titleInput = document.getElementById('piece-title');
  const title = (titleInput && titleInput.value) ? titleInput.value.trim() : '';
  if (!title) {
    UIComponents.showAlert('Title is required.', 'error');
    if (titleInput) { titleInput.focus(); }
    return;
  }

  const descEl   = document.getElementById('piece-description');
  const medEl    = document.getElementById('piece-medium');
  const gradeEl  = document.getElementById('piece-grade');
  const imageEl  = document.getElementById('piece-image');

  const description = (descEl  && descEl.value)  ? descEl.value.trim()  : undefined;
  const medium      = (medEl   && medEl.value)   ? medEl.value.trim()   : undefined;
  const artistGrade = (gradeEl && gradeEl.value) ? gradeEl.value.trim() : undefined;
  const imageFile   = (imageEl && imageEl.files && imageEl.files[0]) ? imageEl.files[0] : null;

  const saveBtn = document.getElementById('piece-save-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

  try {
    let imageData;
    if (imageFile) {
      if (imageFile.size > 8 * 1024 * 1024) {
        UIComponents.showAlert('Image must be under 8 MB.', 'error');
        return;
      }
      imageData = await readFileAsDataURL(imageFile);
    }

    const body = { title };
    if (description !== undefined) { body.description = description; }
    if (medium      !== undefined) { body.medium      = medium;      }
    if (artistGrade !== undefined) { body.artistGrade = artistGrade; }
    if (imageData   !== undefined) { body.imageData   = imageData;   }

    if (_editingId) {
      await window.apiClient.put('/api/portfolio/' + _editingId, body);
    } else {
      await window.apiClient.post('/api/portfolio', body);
    }

    UIComponents.createToast({
      message: _editingId ? 'Artwork updated.' : 'Artwork added to your portfolio.',
      type: 'success'
    });

    closePieceModal();
    await loadPortfolio();
  } catch (err) {
    const msg = (err && err.status === 409)
      ? 'This artwork is locked while submitted — it cannot be edited.'
      : ((err && err.message) || 'Save failed. Please try again.');
    UIComponents.createToast({ message: msg, type: 'error' });
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Artwork'; }
  }
}

/* =========================================================================
   CRUD Actions
   ========================================================================= */

/**
 * Toggles an item between IN_PROGRESS and COMPLETED via PATCH.
 * @param {object} item
 */
async function toggleStatus(item) {
  const newStatus = item.portfolioStatus === 'IN_PROGRESS' ? 'COMPLETED' : 'IN_PROGRESS';
  const label     = newStatus === 'COMPLETED' ? 'Completed' : 'In Progress';

  try {
    await window.apiClient.patch('/api/portfolio/' + item.id + '/status', {
      portfolioStatus: newStatus
    });
    UIComponents.createToast({ message: 'Artwork marked as ' + label + '.', type: 'success' });
    await loadPortfolio();
  } catch (err) {
    const msg = (err && err.message) || 'Could not update status.';
    UIComponents.createToast({ message: msg, type: 'error' });
  }
}

/**
 * Confirms then deletes a portfolio item.
 * Shows a "locked" toast on 409.
 * @param {number|string} id
 * @param {string} [itemTitle]
 */
async function deleteItem(id, itemTitle) {
  const confirmed = await UIComponents.showConfirmation(
    'Delete "' + (itemTitle || 'this artwork') + '"? This cannot be undone.',
    'Delete Artwork'
  );
  if (!confirmed) { return; }

  try {
    await window.apiClient.delete('/api/portfolio/' + id);
    UIComponents.createToast({ message: 'Artwork deleted.', type: 'success' });
    await loadPortfolio();
  } catch (err) {
    const msg = (err && err.status === 409)
      ? 'This artwork is locked while submitted — it cannot be deleted.'
      : ((err && err.message) || 'Delete failed.');
    UIComponents.createToast({ message: msg, type: 'error' });
  }
}

/* =========================================================================
   Submit Modal
   ========================================================================= */

/**
 * Opens the Submit modal for the given portfolio item ID.
 * Populates the auction <select> from GET /api/user/artwork/auctions.
 * @param {number|string} itemId
 */
async function openSubmitModal(itemId) {
  _submittingId = itemId;

  const select = document.getElementById('submit-auction');
  if (select) {
    // Reset while loading
    select.replaceChildren();
    const loading = document.createElement('option');
    loading.value = '';
    loading.textContent = 'Loading auctions...';
    select.appendChild(loading);
  }

  _preFocusElement = document.activeElement;

  const modal = document.getElementById('submit-modal');
  modal.hidden = false;
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
  UIComponents.trapFocus(modal);

  // Populate auctions
  try {
    const data = await window.apiClient.get('/api/user/artwork/auctions');
    const auctions = (data && data.auctions) ? data.auctions : [];

    if (!select) { return; }
    select.replaceChildren();

    if (auctions.length === 0) {
      const none = document.createElement('option');
      none.value = '';
      none.textContent = 'No eligible auctions available for your school';
      select.appendChild(none);
    } else {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = '— Select an auction —';
      select.appendChild(placeholder);

      auctions.forEach(a => {
        const opt = document.createElement('option');
        opt.value = String(a.id);
        opt.textContent = a.title || ('Auction #' + a.id);
        select.appendChild(opt);
      });
    }
  } catch (err) {
    if (select) {
      select.replaceChildren();
      const errOpt = document.createElement('option');
      errOpt.value = '';
      errOpt.textContent = 'Could not load auctions';
      select.appendChild(errOpt);
    }
  }

  // Focus the select
  if (select) { select.focus(); }
}

/** Closes the Submit modal and restores focus. */
function closeSubmitModal() {
  const modal = document.getElementById('submit-modal');
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
  _submittingId = null;
}

/**
 * Handles the Submit modal form submission.
 * @param {Event} e
 */
async function handleSubmitFormSubmit(e) {
  e.preventDefault();

  if (!_submittingId) { return; }

  const select    = document.getElementById('submit-auction');
  const auctionId = select ? select.value : '';

  if (!auctionId) {
    UIComponents.showAlert('Please select an auction.', 'error');
    if (select) { select.focus(); }
    return;
  }

  const confirmBtn = document.getElementById('submit-confirm-btn');
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Submitting...'; }

  try {
    await window.apiClient.post('/api/portfolio/' + _submittingId + '/submit', {
      auctionId
    });

    UIComponents.createToast({ message: 'Artwork submitted for review!', type: 'success' });
    closeSubmitModal();
    await loadPortfolio();
  } catch (err) {
    const msg = (err && err.status === 409)
      ? 'This artwork cannot be submitted right now (it may already be submitted).'
      : (err && err.status === 403)
        ? 'You are not eligible to submit to this auction.'
        : ((err && err.message) || 'Submission failed.');
    UIComponents.createToast({ message: msg, type: 'error' });
  } finally {
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Submit Artwork'; }
  }
}

/* =========================================================================
   Withdraw
   ========================================================================= */

/**
 * Withdraws a PENDING_REVIEW portfolio item.
 * @param {number|string} id
 */
async function withdrawItem(id) {
  const confirmed = await UIComponents.showConfirmation(
    'Withdraw this artwork from review? You can resubmit it later.',
    'Withdraw Artwork'
  );
  if (!confirmed) { return; }

  try {
    await window.apiClient.post('/api/portfolio/' + id + '/withdraw', {});
    UIComponents.createToast({ message: 'Artwork withdrawn from review.', type: 'success' });
    await loadPortfolio();
  } catch (err) {
    const msg = (err && err.message) || 'Withdrawal failed.';
    UIComponents.createToast({ message: msg, type: 'error' });
  }
}

/* =========================================================================
   Utilities
   ========================================================================= */

/**
 * Reads a File object as a base64 data URL.
 * @param {File} file
 * @returns {Promise<string>}
 */
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (evt) => resolve(evt.target.result);
    reader.onerror = ()    => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/* =========================================================================
   Initialisation
   ========================================================================= */

document.addEventListener('DOMContentLoaded', () => {
  // Require authentication — redirect to home if not logged in
  UIComponents.requireAuth('/');

  // Initialise shared navbar (user name, dropdown, logout)
  UIComponents.initializeNavbar();

  // Load portfolio data
  loadPortfolio();

  // ---- Add Artwork button ----
  const addBtn = document.getElementById('add-piece-btn');
  if (addBtn) {
    addBtn.addEventListener('click', openAddModal);
  }

  // ---- Add/Edit modal: close button ----
  const pieceClose = document.getElementById('piece-modal-close');
  if (pieceClose) {
    pieceClose.addEventListener('click', closePieceModal);
  }

  // ---- Add/Edit modal: cancel button ----
  const pieceCancel = document.getElementById('piece-cancel-btn');
  if (pieceCancel) {
    pieceCancel.addEventListener('click', closePieceModal);
  }

  // ---- Add/Edit modal: form submit ----
  const pieceForm = document.getElementById('piece-form');
  if (pieceForm) {
    pieceForm.addEventListener('submit', handlePieceFormSubmit);
  }

  // ---- Add/Edit modal: image file preview ----
  const pieceImageInput = document.getElementById('piece-image');
  if (pieceImageInput) {
    pieceImageInput.addEventListener('change', () => {
      const file    = pieceImageInput.files[0];
      const preview = document.getElementById('piece-image-preview');
      const img     = document.getElementById('piece-preview-img');
      if (!preview || !img) { return; }

      if (!file) {
        preview.style.display = 'none';
        return;
      }

      if (file.size > 8 * 1024 * 1024) {
        UIComponents.showAlert('Image must be under 8 MB.', 'error');
        pieceImageInput.value = '';
        preview.style.display = 'none';
        return;
      }

      const reader = new FileReader();
      reader.onload = (evt) => {
        img.src = evt.target.result;
        img.alt = 'Preview of selected image';
        preview.style.display = 'block';
      };
      reader.readAsDataURL(file);
    });
  }

  // ---- Add/Edit modal: Escape key ----
  const pieceModal = document.getElementById('piece-modal');
  if (pieceModal) {
    pieceModal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closePieceModal(); }
    });
    // Close on backdrop click
    pieceModal.addEventListener('click', (e) => {
      if (e.target === pieceModal) { closePieceModal(); }
    });
  }

  // ---- Submit modal: close button ----
  const submitClose = document.getElementById('submit-modal-close');
  if (submitClose) {
    submitClose.addEventListener('click', closeSubmitModal);
  }

  // ---- Submit modal: cancel button ----
  const submitCancel = document.getElementById('submit-cancel-btn');
  if (submitCancel) {
    submitCancel.addEventListener('click', closeSubmitModal);
  }

  // ---- Submit modal: form submit ----
  const submitForm = document.getElementById('submit-form');
  if (submitForm) {
    submitForm.addEventListener('submit', handleSubmitFormSubmit);
  }

  // ---- Submit modal: Escape key + backdrop ----
  const submitModal = document.getElementById('submit-modal');
  if (submitModal) {
    submitModal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeSubmitModal(); }
    });
    submitModal.addEventListener('click', (e) => {
      if (e.target === submitModal) { closeSubmitModal(); }
    });
  }

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
