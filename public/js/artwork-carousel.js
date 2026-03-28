/**
 * ArtworkCarousel — Reusable gallery carousel component
 *
 * Usage:
 *   const carousel = new ArtworkCarousel('container-id', {
 *     title:       'Featured Artwork',   // section heading
 *     schoolId:    null,                 // filter by school UUID (optional)
 *     role:        'bidder',             // 'bidder' | 'student' | 'teacher'
 *     autoAdvance: true,                 // auto-advance slides
 *     interval:    5000,                 // ms between auto-advance
 *     items:       null,                 // pre-loaded items array (skips fetch)
 *     onApprove:   null,                 // teacher: fn(submissionId)
 *     onReject:    null,                 // teacher: fn(submissionId)
 *   });
 *   await carousel.init();
 */
class ArtworkCarousel {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) { return; }

    this.options = {
      title:       options.title       || 'Artwork Gallery',
      schoolId:    options.schoolId    || null,
      role:        options.role        || 'bidder',
      autoAdvance: options.autoAdvance !== false,
      interval:    options.interval    || 5000,
      items:       options.items       || null,
      onApprove:   options.onApprove   || null,
      onReject:    options.onReject    || null,
    };

    this.slides       = [];
    this.currentIndex = 0;
    this.timer        = null;
    this.touchStartX  = 0;
    this.touchStartY  = 0;
    this.isDragging   = false;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  async init() {
    if (!this.container) { return; }
    this._renderSkeleton();

    try {
      const items = this.options.items || await this._fetchAuctions();
      this.slides = items;

      if (items.length === 0) {
        this._renderEmpty();
        return;
      }

      this._renderCarousel();
      this._attachListeners();
      if (this.options.autoAdvance && items.length > 1) {
        this._startAutoAdvance();
      }
    } catch (err) {
      this._renderError();
      console.error('[ArtworkCarousel] init error:', err);
    }
  }

  /** Reload with fresh data (useful after approve/reject) */
  async refresh(items) {
    this._stopAutoAdvance();
    this.currentIndex = 0;
    this.slides = items || await this._fetchAuctions();
    if (this.slides.length === 0) {
      this._renderEmpty();
      return;
    }
    this._renderCarousel();
    this._attachListeners();
    if (this.options.autoAdvance && this.slides.length > 1) {
      this._startAutoAdvance();
    }
  }

  goTo(index) {
    if (!this._track) { return; }
    const count = this.slides.length;
    this.currentIndex = ((index % count) + count) % count;
    this._updateTrack();
    this._updateDots();
    this._updateAriaLive();
  }

  next() { this.goTo(this.currentIndex + 1); }
  prev() { this.goTo(this.currentIndex - 1); }

  // ── Data fetching ────────────────────────────────────────────────────────────

  async _fetchAuctions() {
    const token = localStorage.getItem('auth_token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    let url = '/api/auctions?limit=60&status=LIVE';
    if (this.options.schoolId) {
      url += `&schoolId=${encodeURIComponent(this.options.schoolId)}`;
    }

    const resp = await fetch(url, { headers });
    if (!resp.ok) { throw new Error(`HTTP ${resp.status}`); }
    const data = await resp.json();

    return (data.auctions || []).map(a => ({
      id:          a.id,
      title:       a.title || 'Untitled',
      artist:      a.artwork?.artist_name || a.artworkArtist || '',
      school:      a.school || a.schoolName || '',
      image:       a.image || a.artwork?.image_url || '/images/placeholder-art.svg',
      currentBid:  a.currentBid || 0,
      bidCount:    a.bidCount   || 0,
      endTime:     a.endTime    || null,
      status:      a.status     || 'LIVE',
      submissionId: a.artworkId || null,
      submissionStatus: a.artworkStatus || null,
    }));
  }

  // ── Rendering ────────────────────────────────────────────────────────────────

  _renderSkeleton() {
    this.container.innerHTML = `
      <div class="ac-wrapper" aria-busy="true" aria-label="Loading ${this._esc(this.options.title)}">
        <div class="ac-header">
          <h2 class="ac-title">${this._esc(this.options.title)}</h2>
        </div>
        <div class="ac-skeleton-row">
          ${[1,2,3].map(() => '<div class="ac-skeleton-card"></div>').join('')}
        </div>
      </div>`;
  }

  _renderEmpty() {
    this.container.innerHTML = `
      <div class="ac-wrapper">
        <div class="ac-header">
          <h2 class="ac-title">${this._esc(this.options.title)}</h2>
        </div>
        <p class="ac-empty">No artwork available right now. Check back soon!</p>
      </div>`;
  }

  _renderError() {
    this.container.innerHTML = `
      <div class="ac-wrapper">
        <div class="ac-header">
          <h2 class="ac-title">${this._esc(this.options.title)}</h2>
        </div>
        <p class="ac-empty">Unable to load artwork. Please refresh the page.</p>
      </div>`;
  }

  _renderCarousel() {
    const count = this.slides.length;

    this.container.innerHTML = `
      <div class="ac-wrapper" role="region" aria-label="${this._esc(this.options.title)} — ${count} item${count !== 1 ? 's' : ''}">
        <div class="ac-header">
          <h2 class="ac-title">${this._esc(this.options.title)}</h2>
          <span class="ac-count">${count} piece${count !== 1 ? 's' : ''}</span>
        </div>

        <div class="ac-stage">
          <button class="ac-btn ac-btn-prev" aria-label="Previous artwork" ${count < 2 ? 'disabled' : ''}>&#8249;</button>

          <div class="ac-viewport" aria-live="polite" aria-atomic="true">
            <div class="ac-track" role="list">
              ${this.slides.map((item, i) => this._renderSlide(item, i)).join('')}
            </div>
          </div>

          <button class="ac-btn ac-btn-next" aria-label="Next artwork" ${count < 2 ? 'disabled' : ''}>&#8250;</button>
        </div>

        <div class="ac-dots" role="tablist" aria-label="Select artwork to view">
          ${this.slides.map((item, i) => `
            <button
              class="ac-dot${i === 0 ? ' ac-dot-active' : ''}"
              role="tab"
              aria-selected="${i === 0}"
              aria-label="Artwork ${i + 1}: ${this._esc(item.title)}"
              data-index="${i}"
              tabindex="${i === 0 ? '0' : '-1'}"
            ></button>`).join('')}
        </div>
      </div>`;

    this._track    = this.container.querySelector('.ac-track');
    this._dots     = this.container.querySelectorAll('.ac-dot');
    this._viewport = this.container.querySelector('.ac-viewport');
    this._liveRegion = this._viewport;
    this._updateTrack();
  }

  _renderSlide(item, index) {
    const isActive  = index === this.currentIndex;
    const imgAlt    = item.artist
      ? `${this._esc(item.title)} by ${this._esc(item.artist)}`
      : this._esc(item.title);

    const bidLabel  = item.currentBid > 0
      ? `<div class="ac-bid"><span class="ac-bid-label">Current bid</span><span class="ac-bid-amount">${this._formatCurrency(item.currentBid)}</span></div>`
      : '';

    const timeLeft  = item.endTime
      ? `<p class="ac-time">${this._formatTimeRemaining(item.endTime)}</p>`
      : '';

    const schoolTag = item.school
      ? `<p class="ac-school">${this._esc(item.school)}</p>`
      : '';

    const actions   = this._renderActions(item);

    return `
      <div
        class="ac-slide${isActive ? ' ac-slide-active' : ''}"
        role="listitem"
        aria-hidden="${!isActive}"
        data-index="${index}"
      >
        <a href="/auction-detail.html?id=${this._esc(item.id)}" class="ac-slide-link" tabindex="${isActive ? '0' : '-1'}">
          <div class="ac-img-wrap">
            <img
              src="${this._esc(item.image)}"
              alt="${imgAlt}"
              loading="${index < 3 ? 'eager' : 'lazy'}"
              onerror="this.src='/images/placeholder-art.svg'"
            >
            ${this._renderStatusBadge(item.status)}
          </div>
          <div class="ac-caption">
            <h3 class="ac-slide-title">${this._esc(item.title)}</h3>
            ${item.artist ? `<p class="ac-artist">by ${this._esc(item.artist)}</p>` : ''}
            ${schoolTag}
            ${bidLabel}
            ${item.bidCount > 0 ? `<p class="ac-bids">${item.bidCount} bid${item.bidCount !== 1 ? 's' : ''}</p>` : ''}
            ${timeLeft}
          </div>
        </a>
        ${actions}
      </div>`;
  }

  _renderStatusBadge(status) {
    const map = {
      LIVE:    { cls: 'active',  label: 'Live' },
      ENDED:   { cls: 'ended',   label: 'Ended' },
      DRAFT:   { cls: 'draft',   label: 'Preview' },
    };
    const { cls, label } = map[status] || map['LIVE'];
    return `<span class="ac-status-badge status-${cls}" aria-label="Auction status: ${label}">${label}</span>`;
  }

  _renderActions(item) {
    if (this.options.role !== 'teacher') { return ''; }
    if (!this.options.onApprove && !this.options.onReject) { return ''; }

    const isPending = item.submissionStatus === 'SUBMITTED' || item.submissionStatus === 'PENDING_APPROVAL';
    if (!isPending || !item.submissionId) { return ''; }

    return `
      <div class="ac-actions" role="group" aria-label="Submission actions">
        <button
          class="btn btn-primary ac-approve-btn"
          data-submission-id="${this._esc(item.submissionId)}"
          aria-label="Approve ${this._esc(item.title)}"
        >Approve</button>
        <button
          class="btn btn-secondary ac-reject-btn"
          data-submission-id="${this._esc(item.submissionId)}"
          aria-label="Reject ${this._esc(item.title)}"
        >Reject</button>
      </div>`;
  }

  // ── Track / Dot Updates ──────────────────────────────────────────────────────

  _updateTrack() {
    if (!this._track) { return; }
    const slides = this._track.querySelectorAll('.ac-slide');
    slides.forEach((slide, i) => {
      const active = i === this.currentIndex;
      slide.classList.toggle('ac-slide-active', active);
      slide.setAttribute('aria-hidden', !active);
      const link = slide.querySelector('.ac-slide-link');
      if (link) { link.tabIndex = active ? 0 : -1; }
      const btns = slide.querySelectorAll('button');
      btns.forEach(b => { b.tabIndex = active ? 0 : -1; });
    });

    // CSS translate approach — slides stack, only active is shown
    this._track.style.transform = `translateX(-${this.currentIndex * 100}%)`;
  }

  _updateDots() {
    if (!this._dots) { return; }
    this._dots.forEach((dot, i) => {
      const active = i === this.currentIndex;
      dot.classList.toggle('ac-dot-active', active);
      dot.setAttribute('aria-selected', active);
      dot.tabIndex = active ? 0 : -1;
    });
  }

  _updateAriaLive() {
    if (!this._liveRegion) { return; }
    const item = this.slides[this.currentIndex];
    if (!item) { return; }
    this._liveRegion.setAttribute('aria-label',
      `${item.title}${item.artist ? ' by ' + item.artist : ''} — ${this.currentIndex + 1} of ${this.slides.length}`);
  }

  // ── Event Listeners ──────────────────────────────────────────────────────────

  _attachListeners() {
    const wrapper = this.container.querySelector('.ac-wrapper');
    if (!wrapper) { return; }

    // Prev / Next buttons
    wrapper.querySelector('.ac-btn-prev')?.addEventListener('click', () => {
      this._stopAutoAdvance();
      this.prev();
      this._restartAutoAdvance();
    });
    wrapper.querySelector('.ac-btn-next')?.addEventListener('click', () => {
      this._stopAutoAdvance();
      this.next();
      this._restartAutoAdvance();
    });

    // Dot navigation
    this._dots?.forEach(dot => {
      dot.addEventListener('click', () => {
        this._stopAutoAdvance();
        this.goTo(parseInt(dot.dataset.index));
        this._restartAutoAdvance();
      });
      // Keyboard: left/right arrows within dot row
      dot.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft')  { this._stopAutoAdvance(); this.prev(); this._restartAutoAdvance(); e.preventDefault(); }
        if (e.key === 'ArrowRight') { this._stopAutoAdvance(); this.next(); this._restartAutoAdvance(); e.preventDefault(); }
      });
    });

    // Keyboard on stage
    wrapper.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft')  { this._stopAutoAdvance(); this.prev(); this._restartAutoAdvance(); }
      if (e.key === 'ArrowRight') { this._stopAutoAdvance(); this.next(); this._restartAutoAdvance(); }
    });

    // Pause on hover / focus
    wrapper.addEventListener('mouseenter', () => this._stopAutoAdvance());
    wrapper.addEventListener('mouseleave', () => this._restartAutoAdvance());
    wrapper.addEventListener('focusin',    () => this._stopAutoAdvance());
    wrapper.addEventListener('focusout',   () => this._restartAutoAdvance());

    // Touch / swipe
    wrapper.addEventListener('touchstart', (e) => {
      this.touchStartX = e.changedTouches[0].clientX;
      this.touchStartY = e.changedTouches[0].clientY;
      this.isDragging  = true;
      this._stopAutoAdvance();
    }, { passive: true });

    wrapper.addEventListener('touchend', (e) => {
      if (!this.isDragging) { return; }
      this.isDragging = false;
      const dx = e.changedTouches[0].clientX - this.touchStartX;
      const dy = e.changedTouches[0].clientY - this.touchStartY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
        dx < 0 ? this.next() : this.prev();
      }
      this._restartAutoAdvance();
    }, { passive: true });

    // Teacher approve / reject
    if (this.options.role === 'teacher') {
      wrapper.addEventListener('click', (e) => {
        const approveBtn = e.target.closest('.ac-approve-btn');
        const rejectBtn  = e.target.closest('.ac-reject-btn');
        if (approveBtn && this.options.onApprove) {
          e.preventDefault();
          this.options.onApprove(approveBtn.dataset.submissionId);
        }
        if (rejectBtn && this.options.onReject) {
          e.preventDefault();
          this.options.onReject(rejectBtn.dataset.submissionId);
        }
      });
    }
  }

  // ── Auto-advance ─────────────────────────────────────────────────────────────

  _startAutoAdvance() {
    if (!this.options.autoAdvance || this.slides.length < 2) { return; }
    this.timer = setInterval(() => this.next(), this.options.interval);
  }

  _stopAutoAdvance() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  _restartAutoAdvance() {
    this._stopAutoAdvance();
    this._startAutoAdvance();
  }

  // ── Utilities ────────────────────────────────────────────────────────────────

  _esc(str) {
    if (str == null) { return ''; }
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  _formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  }

  _formatTimeRemaining(endTime) {
    const ms = new Date(endTime) - Date.now();
    if (ms <= 0) { return 'Ended'; }
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h > 48) { return `${Math.floor(h / 24)}d remaining`; }
    if (h > 0)  { return `${h}h ${m}m remaining`; }
    return `${m}m remaining`;
  }
}
