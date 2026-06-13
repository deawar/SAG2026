/**
 * Auctions Gallery Page Module
 * Handles filtering, sorting, pagination, and real-time auction list
 */

class AuctionsPage {
  constructor() {
    this.currentPage = 1;
    this.pageSize = 12;
    this.filters = {
      status: 'all',
      minPrice: 0,
      maxPrice: Infinity,
      school: 'all',
      sortBy: 'newest'
    };
    this.auctions = [];
    this.init();
  }

  /**
     * Initialize auctions page
     */
  init() {
    this.attachEventListeners();
    this.loadAuctions();
  }

  /**
     * Attach event listeners
     */
  attachEventListeners() {
    // Filter form
    const filterForm = document.getElementById('filter-form');
    if (filterForm) {
      const statusSelect = filterForm.querySelector('select[name="status"]');
      const minPriceInput = filterForm.querySelector('input[name="min-price"]');
      const maxPriceInput = filterForm.querySelector('input[name="max-price"]');
      const schoolSelect = filterForm.querySelector('select[name="school"]');
      const sortSelect = filterForm.querySelector('select[name="sort"]');
      const clearBtn = filterForm.querySelector('.btn-clear-filters');

      // Debounce price inputs
      const debouncedFilter = UIComponents.debounce(() => this.applyFilters(), 500);

      statusSelect?.addEventListener('change', (e) => {
        this.filters.status = e.target.value;
        this.applyFilters();
      });

      minPriceInput?.addEventListener('input', (e) => {
        this.filters.minPrice = parseFloat(e.target.value) || 0;
        debouncedFilter();
      });

      maxPriceInput?.addEventListener('input', (e) => {
        this.filters.maxPrice = parseFloat(e.target.value) || Infinity;
        debouncedFilter();
      });

      schoolSelect?.addEventListener('change', (e) => {
        this.filters.school = e.target.value;
        this.applyFilters();
      });

      sortSelect?.addEventListener('change', (e) => {
        this.filters.sortBy = e.target.value;
        this.applyFilters();
      });

      clearBtn?.addEventListener('click', () => this.clearFilters());
    }

    // Pagination
    const paginationContainer = document.querySelector('.pagination');
    if (paginationContainer) {
      paginationContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('pagination-btn')) {
          const page = parseInt(e.target.dataset.page);
          this.goToPage(page);
        }
      });
    }

    // Watch list buttons
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-watch')) {
        const auctionId = e.target.closest('[data-auction-id]')?.dataset.auctionId;
        if (auctionId) {
          this.toggleWatchlist(auctionId, e.target);
        }
      }
    });

    // Card image click → open preview overlay
    document.addEventListener('click', (e) => {
      const imgArea = e.target.closest('.auction-card-image');
      if (imgArea) {
        const card = imgArea.closest('[data-auction-id]');
        if (card) {
          const auction = this.auctions.find(a => String(a.id) === card.dataset.auctionId);
          if (auction) {
            this.openCardPreview(auction);
          } else {
            console.warn('[AuctionsPage] Card preview: auction not found for id', card.dataset.auctionId);
          }
        }
      }
    });

    // Overlay close button, cancel button, and backdrop
    const overlay = document.getElementById('card-preview-overlay');
    if (overlay) {
      document.getElementById('card-preview-close')?.addEventListener('click', () => this.closeCardPreview());
      document.getElementById('card-preview-cancel')?.addEventListener('click', () => this.closeCardPreview());
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { this.closeCardPreview(); }
      });
    }

    // Escape key closes overlay (only when overlay is visible)
    document.addEventListener('keydown', (e) => {
      const overlay = document.getElementById('card-preview-overlay');
      if (e.key === 'Escape' && overlay && !overlay.hidden) { this.closeCardPreview(); }
    });
  }

  /**
     * Load auctions from API
     */
  async loadAuctions() {
    try {
      const resultsInfo = document.querySelector('.results-info');
      if (resultsInfo) {
        resultsInfo.setAttribute('aria-live', 'polite');
      }

      const token = localStorage.getItem('auth_token');
      const fetchOptions = token ? { headers: { 'Authorization': `Bearer ${token}` } } : {};
      const response = await fetch('/api/auctions?limit=100', fetchOptions);
      const data = await response.json();

      if (response.ok) {
        this.auctions = data.auctions || [];
        this.applyFilters();
      } else {
        UIComponents.createToast({
          message: 'Failed to load auctions',
          type: 'error'
        });
      }
    } catch (error) {
      console.error('Load auctions error:', error);
      UIComponents.createToast({
        message: 'Connection error',
        type: 'error'
      });
    }
  }

  /**
     * Apply filters and display results
     */
  applyFilters() {
    let filtered = this.auctions;

    // Status filter — compare against normalised values
    if (this.filters.status !== 'all') {
      filtered = filtered.filter(a => this.normaliseStatus(a.status) === this.filters.status);
    }

    // Price range filter
    filtered = filtered.filter(a =>
      a.currentBid >= this.filters.minPrice &&
            a.currentBid <= this.filters.maxPrice
    );

    // School filter
    if (this.filters.school !== 'all') {
      filtered = filtered.filter(a => a.school === this.filters.school);
    }

    // Sort
    filtered = this.sortAuctions(filtered, this.filters.sortBy);

    // Store filtered results
    this.filteredAuctions = filtered;

    // Reset to page 1
    this.currentPage = 1;

    // Display results
    this.displayAuctions(filtered);
    this.updateResultsInfo(filtered.length);
  }

  /**
     * Sort auctions
     */
  sortAuctions(auctions, sortBy) {
    const sorted = [...auctions];

    switch (sortBy) {
      case 'newest':
        return sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      case 'ending-soon':
        return sorted.sort((a, b) => new Date(a.endTime) - new Date(b.endTime));

      case 'price-high':
        return sorted.sort((a, b) => b.currentBid - a.currentBid);

      case 'price-low':
        return sorted.sort((a, b) => a.currentBid - b.currentBid);

      case 'most-bids':
        return sorted.sort((a, b) => b.bidCount - a.bidCount);

      default:
        return sorted;
    }
  }

  /**
     * Display auctions in grid
     */
  displayAuctions(auctions) {
    const grid = document.querySelector('.auctions-grid');
    const noResults = document.querySelector('.no-results');

    if (!grid) {return;}

    grid.innerHTML = '';

    if (auctions.length === 0) {
      grid.style.display = 'none';
      if (noResults) {noResults.style.display = 'block';}
      return;
    }

    if (noResults) {noResults.style.display = 'none';}
    grid.style.display = 'grid';

    // Paginate
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    const pageAuctions = auctions.slice(start, end);

    pageAuctions.forEach(auction => {
      const card = this.createAuctionCard(auction);
      grid.appendChild(card);
    });

    // Update pagination
    this.updatePagination(auctions.length);
  }

  /**
     * Create auction card
     */
  createAuctionCard(auction) {
    const card = document.createElement('div');
    card.className = 'auction-card';
    card.dataset.auctionId = auction.id;

    // Normalise status: API returns LIVE/DRAFT/ENDED/CANCELLED
    const normalisedStatus = this.normaliseStatus(auction.status);
    const statusBadge = this.getStatusBadge(normalisedStatus);
    const timeRemaining = UIComponents.formatTimeRemaining(
      new Date(auction.endTime) - Date.now()
    );
    const imageSrc = auction.image || '/images/placeholder-art.svg';

    card.innerHTML = `
            <div class="auction-card-image">
                <img src="${this.escapeHtml(imageSrc)}" alt="${this.escapeHtml(auction.title)}" loading="lazy">
                <span class="status-badge status-${normalisedStatus}">${statusBadge}</span>
            </div>
            <div class="auction-card-body">
                <h3 class="auction-title">${this.escapeHtml(auction.title)}</h3>
                <p class="auction-school">${this.escapeHtml(auction.school || 'N/A')}</p>
                <div class="auction-stats">
                    <span class="current-bid">
                        <strong>${UIComponents.formatCurrency(auction.currentBid || 0)}</strong>
                    </span>
                    <span class="bid-count">${auction.bidCount || 0} bids</span>
                </div>
                <p class="time-remaining">${timeRemaining}</p>
                <div class="auction-actions">
                    <a href="/auction-detail.html?id=${auction.id}" class="btn btn-primary">View</a>
                    <button class="btn btn-secondary btn-watch" aria-label="Add to watchlist">
                        <span class="watch-icon">★</span>
                    </button>
                </div>
            </div>
        `;

    return card;
  }

  /**
     * Normalise API status values to frontend display values
     * API: LIVE, DRAFT, ENDED, CANCELLED, PENDING_APPROVAL
     */
  normaliseStatus(status) {
    const map = {
      'LIVE': 'active',
      'DRAFT': 'draft',
      'ENDED': 'ended',
      'CANCELLED': 'ended',
      'PENDING_APPROVAL': 'draft'
    };
    return map[status] || (status || '').toLowerCase();
  }

  /**
     * Get status badge text
     */
  getStatusBadge(status) {
    const badges = {
      'active': 'Active',
      'ending-soon': 'Ending Soon',
      'ended': 'Ended',
      'draft': 'Draft'
    };
    return badges[status] || status;
  }

  /**
     * Update pagination controls
     */
  updatePagination(totalItems) {
    const totalPages = Math.ceil(totalItems / this.pageSize);
    const paginationContainer = document.querySelector('.pagination');

    if (!paginationContainer || totalPages <= 1) {
      if (paginationContainer) {paginationContainer.innerHTML = '';}
      return;
    }

    let html = '';

    // Previous button
    if (this.currentPage > 1) {
      html += `<button class="pagination-btn" data-page="${this.currentPage - 1}" aria-label="Previous page">← Previous</button>`;
    }

    // Page numbers
    const maxButtons = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxButtons / 2));
    const endPage = Math.min(totalPages, startPage + maxButtons - 1);

    if (endPage - startPage + 1 < maxButtons) {
      startPage = Math.max(1, endPage - maxButtons + 1);
    }

    if (startPage > 1) {
      html += '<button class="pagination-btn" data-page="1" aria-label="Go to page 1">1</button>';
      if (startPage > 2) {html += '<span class="pagination-ellipsis">...</span>';}
    }

    for (let i = startPage; i <= endPage; i++) {
      const isActive = i === this.currentPage;
      html += `<button class="pagination-btn${isActive ? ' active' : ''}" data-page="${i}" aria-label="Go to page ${i}" aria-current="${isActive ? 'page' : 'false'}">${i}</button>`;
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {html += '<span class="pagination-ellipsis">...</span>';}
      html += `<button class="pagination-btn" data-page="${totalPages}" aria-label="Go to page ${totalPages}">${totalPages}</button>`;
    }

    // Next button
    if (this.currentPage < totalPages) {
      html += `<button class="pagination-btn" data-page="${this.currentPage + 1}" aria-label="Next page">Next →</button>`;
    }

    paginationContainer.innerHTML = html;
  }

  /**
     * Go to specific page
     */
  goToPage(pageNumber) {
    if (pageNumber < 1 || pageNumber > Math.ceil(this.filteredAuctions.length / this.pageSize)) {
      return;
    }

    this.currentPage = pageNumber;
    this.displayAuctions(this.filteredAuctions);
    window.scrollTo(0, 0);
  }

  /**
     * Update results info text
     */
  updateResultsInfo(count) {
    const resultsInfo = document.querySelector('.results-info');
    if (resultsInfo) {
      const start = (this.currentPage - 1) * this.pageSize + 1;
      const end = Math.min(this.currentPage * this.pageSize, count);
      resultsInfo.textContent = `Showing ${count === 0 ? 0 : start}-${end} of ${count} auction${count !== 1 ? 's' : ''}`;
    }
  }

  /**
     * Clear all filters
     */
  clearFilters() {
    this.filters = {
      status: 'all',
      minPrice: 0,
      maxPrice: Infinity,
      school: 'all',
      sortBy: 'newest'
    };

    // Update form
    const filterForm = document.getElementById('filter-form');
    if (filterForm) {
      filterForm.reset();
    }

    this.applyFilters();
    UIComponents.createToast({
      message: 'Filters cleared',
      type: 'info'
    });
  }

  /**
     * Toggle watchlist
     */
  async toggleWatchlist(auctionId, button) {
    try {
      const isWatched = button.classList.contains('watched');

      const response = await fetch(`/api/auctions/${auctionId}/watchlist`, {
        method: isWatched ? 'DELETE' : 'POST'
      });

      if (!response.ok) {
        UIComponents.createToast({
          message: 'Failed to update watchlist',
          type: 'error'
        });
        return;
      }

      button.classList.toggle('watched');
      button.setAttribute('aria-pressed', !isWatched);

      const message = isWatched ? 'Removed from watchlist' : 'Added to watchlist';
      UIComponents.createToast({
        message,
        type: 'success',
        duration: 2000
      });
    } catch (error) {
      console.error('Watchlist toggle error:', error);
      UIComponents.createToast({
        message: 'Connection error',
        type: 'error'
      });
    }
  }

  /**
     * Escape HTML special characters
     */
  escapeHtml(text) {
    if (!text) {return '';}
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
  }

  openCardPreview(auction) {
    const overlay = document.getElementById('card-preview-overlay');
    if (!overlay) { return; }

    this._previewOpener = document.activeElement;
    this._previewBodyOverflow = document.body.style.overflow;

    const set = (id, val) => { const el = document.getElementById(id); if (el) { el.textContent = val || ''; } };
    const img = document.getElementById('card-preview-img');
    if (img) {
      const allowedSrc = /^https?:\/\/|^\//.test(auction.image || '')
        ? auction.image
        : '/images/placeholder-art.svg';
      img.src = allowedSrc;
      img.alt = auction.title || '';
    }
    set('card-preview-title', auction.title);
    set('card-preview-school', auction.school || '');
    set('card-preview-bid', UIComponents.formatCurrency(auction.currentBid || 0));
    set('card-preview-count', `${auction.bidCount || 0} bids`);
    const remaining = UIComponents.formatTimeRemaining(new Date(auction.endTime) - Date.now());
    set('card-preview-time', remaining);

    const cta = document.getElementById('card-preview-cta');
    if (cta) { cta.href = `/auction-detail.html?id=${encodeURIComponent(auction.id)}`; }

    document.body.style.overflow = 'hidden';
    overlay.hidden = false;
    document.getElementById('card-preview-close')?.focus();

    this._previewTrapHandler = (e) => {
      if (e.key !== 'Tab') { return; }
      const focusable = Array.from(overlay.querySelectorAll('a[href], button:not([disabled])'));
      if (!focusable.length) { return; }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else if (document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };
    overlay.addEventListener('keydown', this._previewTrapHandler);
  }

  closeCardPreview() {
    const overlay = document.getElementById('card-preview-overlay');
    if (!overlay) { return; }
    overlay.hidden = true;
    document.body.style.overflow = this._previewBodyOverflow ?? '';
    if (this._previewTrapHandler) {
      overlay.removeEventListener('keydown', this._previewTrapHandler);
      this._previewTrapHandler = null;
    }
    this._previewOpener?.focus();
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  // Initialize navbar (shared across all pages)
  UIComponents.initializeNavbar();

  // Initialize auctions page
  window.auctionsPage = new AuctionsPage();
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AuctionsPage;
}
