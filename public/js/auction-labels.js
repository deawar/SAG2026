'use strict';

class AuctionLabels {
  constructor() {
    this.auctionId = new URLSearchParams(globalThis.location.search).get('id');
    this.auction = null;
    this.artworks = [];
    this.init();
  }

  async init() {
    if (!this.auctionId) {
      globalThis.location.assign('/auctions.html');
      return;
    }
    if (!this.checkAuth()) { return; }
    await this.loadData();
    this.renderLabels();
    this.generateQRCodes();
  }

  checkAuth() {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      const returnTo = encodeURIComponent(globalThis.location.pathname + globalThis.location.search);
      globalThis.location.assign(`/login.html?returnTo=${returnTo}`);
      return false;
    }
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const allowed = ['TEACHER', 'SCHOOL_ADMIN', 'SITE_ADMIN'];
      if (!allowed.includes(payload.role)) {
        globalThis.location.assign('/auctions.html');
        return false;
      }
    } catch {
      globalThis.location.assign('/login.html');
      return false;
    }
    return true;
  }

  async loadData() {
    const token = localStorage.getItem('auth_token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    try {
      const [auctionRes, artworkRes] = await Promise.all([
        fetch(`/api/auctions/${this.auctionId}`, { headers }),
        fetch(`/api/auctions/${this.auctionId}/artwork`, { headers }),
      ]);

      if (auctionRes.ok) {
        const data = await auctionRes.json();
        this.auction = data.auction;
        const titleEl = document.getElementById('auction-title');
        if (titleEl) { titleEl.textContent = data.auction?.title || 'Auction Labels'; }
        const schoolEl = document.getElementById('school-name');
        if (schoolEl) { schoolEl.textContent = data.auction?.schoolName || ''; }
      }

      if (artworkRes.ok) {
        const data = await artworkRes.json();
        this.artworks = data.artwork || [];
      }
    } catch (err) {
      console.error('AuctionLabels loadData error:', err);
    }
  }

  renderLabels() {
    const grid = document.getElementById('labels-grid');
    if (!grid) { return; }
    const total = this.artworks.length;
    grid.innerHTML = this.artworks.map((piece, i) => this.renderLabel(piece, i + 1, total)).join('');
  }

  renderLabel(piece, index, total) {
    const auctionTitle = this.auction?.title || '';
    const schoolName = this.auction?.schoolName || '';
    const startingPrice = piece.startingPrice != null
      ? UIComponents.formatCurrency(Number(piece.startingPrice)) : '-';
    const currentBidRow = piece.currentBid != null && Number(piece.currentBid) > 0
      ? `<div class="price-row"><span>Current bid:</span><span>${UIComponents.formatCurrency(Number(piece.currentBid))}</span></div>`
      : '';
    const reserveRow = piece.reservePrice != null
      ? `<div class="price-row label-reserve"><span>Reserve:</span><span>${UIComponents.formatCurrency(Number(piece.reservePrice))}</span></div>`
      : '';
    const specsLine = [piece.medium, piece.dimensions].filter(Boolean).map(s => this._esc(s)).join(' · ');

    return `
      <div class="label-card" data-artwork-id="${this._esc(String(piece.id))}" data-auction-id="${this._esc(String(this.auctionId))}">
        <div class="label-meta">${this._esc(schoolName)}${schoolName && auctionTitle ? ' · ' : ''}${this._esc(auctionTitle)} &nbsp;|&nbsp; Piece ${index} of ${total}</div>
        <div class="label-piece-header">
          <div class="label-title-block">
            <p class="label-title">${this._esc(piece.title || 'Untitled')}</p>
            <p class="label-artist">${this._esc(piece.artistName || '')}</p>
          </div>
          <div class="label-qr" data-qr-artwork="${this._esc(String(piece.id))}"></div>
        </div>
        ${specsLine ? `<p class="label-specs">${specsLine}</p>` : ''}
        ${piece.description ? `<p class="label-description">${this._esc(piece.description)}</p>` : ''}
        <div class="label-pricing">
          ${reserveRow}
          <div class="price-row"><span>Starting bid:</span><span>${startingPrice}</span></div>
          ${currentBidRow}
        </div>
      </div>
    `;
  }

  generateQRCodes() {
    const QRCodeLib = globalThis.QRCode;
    if (!QRCodeLib) { return; }
    document.querySelectorAll('[data-qr-artwork]').forEach(el => {
      const artworkId = el.dataset.qrArtwork;
      const url = `${globalThis.location.origin}/auction-detail.html?id=${encodeURIComponent(this.auctionId)}&artwork=${encodeURIComponent(artworkId)}`;
      new QRCodeLib(el, { text: url, width: 160, height: 160 });
    });
  }

  _esc(text) {
    if (!text) { return ''; }
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, c => map[c]);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  UIComponents.initializeNavbar();
  globalThis.auctionLabels = new AuctionLabels();
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AuctionLabels;
}
