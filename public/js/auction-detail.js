/**
 * Auction Detail Page Module
 * Handles bidding, real-time updates, bid history, and WebSocket integration
 */

class AuctionDetail {
    constructor() {
        this.auctionId = new URLSearchParams(globalThis.location.search).get('id');
        this.auction = null;
        this.bidHistory = [];
        this.isUserLoggedIn = false;
        this.countdownInterval = null;
        this.websocket = null;
        this.init();
    }

    /**
     * Initialize auction detail page
     */
    async init() {
        if (!this.auctionId) {
            this.showError('Invalid auction ID');
            return;
        }

        // Load auction data
        await this.loadAuction();

        // Check login status
        this.checkLoginStatus();

        // Set up event listeners
        this.attachEventListeners();

        // Start countdown timer
        this.startCountdown();

        // Connect to WebSocket for real-time updates
        this.connectWebSocket();
    }

    /**
     * Load auction details from API
     */
    async loadAuction() {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/auctions/${this.auctionId}`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            const data = await response.json();

            if (!response.ok) {
                this.showError(data.message || 'Auction not found');
                return;
            }

            this.auction = data.auction;
            this.displayAuction();
            this.loadArtwork();
            this.loadBidHistory();
        } catch (error) {
            console.error('Load auction error:', error);
            this.showError('Failed to load auction');
        }
    }

    /**
     * Display auction details
     */
    displayAuction() {
        if (!this.auction) return;

        // Update image (auctions don't have images; use placeholder)
        const image = document.getElementById('artwork-image');
        if (image) {
            image.src = this.auction.image || '/images/auction-items/placeholder.svg';
            image.alt = this.auction.title || 'Auction';
        }

        // Update titles
        const titleEl = document.getElementById('artwork-title');
        if (titleEl) titleEl.textContent = this.auction.title || '';

        const titleSmall = document.getElementById('artwork-title-small');
        if (titleSmall) titleSmall.textContent = this.auction.title || '';

        const descEl = document.getElementById('artwork-description');
        if (descEl) descEl.textContent = this.auction.description || '';

        const schoolEl = document.getElementById('school-name');
        if (schoolEl) schoolEl.textContent = this.auction.schoolName || this.auction.schoolId || 'N/A';

        // Update breadcrumb
        const breadcrumb = document.getElementById('breadcrumb-title');
        if (breadcrumb) breadcrumb.textContent = this.auction.title || 'Auction Details';

        // Update bid info
        this.updateBidInfo();

        // Update auction status
        this.updateAuctionStatus();

        // Apply the school's saved colour theme
        if (this.auction.schoolId) {
            this.applySchoolTheme(this.auction.schoolId);
        }
    }

    /**
     * Fetch and apply the school's colour theme.
     * Non-critical — failure never breaks the page.
     * @param {string} schoolId
     */
    async applySchoolTheme(schoolId) {
        try {
            const res  = await fetch(`/api/schools/${schoolId}/theme`);
            const data = await res.json();
            if (data.success && data.data?.resolved) {
                ThemeManager.apply(data.data.resolved);
            }
        } catch (err) {
            console.warn('Could not load school theme:', err);
        }
    }

    /**
     * Update current bid information
     */
    updateBidInfo() {
        const currentBidEl = document.getElementById('display-current-bid');
        if (currentBidEl) {
            const bid = this.auction.currentBid ?? null;
            currentBidEl.textContent = bid !== null ? UIComponents.formatCurrency(bid) : '-';
        }

        const openingBidEl = document.getElementById('display-opening-bid');
        if (openingBidEl) {
            const opening = this.auction.openingBid ?? null;
            openingBidEl.textContent = opening !== null ? UIComponents.formatCurrency(opening) : '-';
        }

        const minIncrementEl = document.getElementById('display-minimum-increment');
        if (minIncrementEl) {
            const increment = this.auction.minBidIncrement ?? null;
            minIncrementEl.textContent = increment !== null ? UIComponents.formatCurrency(increment) : '-';
        }

        const bidCountEl = document.getElementById('display-bid-count');
        if (bidCountEl) {
            bidCountEl.textContent = this.auction.totalBids ?? this.auction.bidCount ?? 0;
        }

        const minBidHelpEl = document.getElementById('min-bid-amount');
        if (minBidHelpEl) {
            const current = this.auction.currentBid ?? 0;
            const increment = this.auction.minBidIncrement ?? 10;
            minBidHelpEl.textContent = UIComponents.formatCurrency(current + increment);
        }
    }

    /**
     * Update auction status
     */
    updateAuctionStatus() {
        const statusBadge = document.getElementById('auction-status-badge');
        if (!statusBadge) return;

        const status = this.auction.status;

        if (status === 'DRAFT') {
            statusBadge.className = 'auction-status-badge status-draft';
            statusBadge.textContent = '📝 Draft';
            this.disableBidding();
        } else if (status === 'APPROVED') {
            statusBadge.className = 'auction-status-badge status-approved';
            statusBadge.textContent = '✅ Approved';
            this.disableBidding();
        } else if (status === 'ENDED' || status === 'CLOSED' || status === 'CANCELLED') {
            statusBadge.className = 'auction-status-badge status-ended';
            statusBadge.textContent = status === 'CANCELLED' ? '❌ Cancelled' : '⛔ Auction Ended';
            this.disableBidding();
        } else if (status === 'LIVE') {
            const now = Date.now();
            const endTime = new Date(this.auction.endTime).getTime();
            if (endTime < now) {
                statusBadge.className = 'auction-status-badge status-ended';
                statusBadge.textContent = '⛔ Auction Ended';
                this.disableBidding();
            } else if (endTime - now < 3600000) {
                statusBadge.className = 'auction-status-badge status-ending-soon';
                statusBadge.textContent = '⚠️ Ending Soon';
            } else {
                statusBadge.className = 'auction-status-badge status-active';
                statusBadge.textContent = '🔴 Live';
            }
        } else {
            statusBadge.className = 'auction-status-badge';
            statusBadge.textContent = status || 'Unknown';
        }
    }

    /**
     * Load bid history
     */
    async loadBidHistory() {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/auctions/${this.auctionId}/bids`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            const data = await response.json();

            if (response.ok) {
                this.bidHistory = data.bids || [];
                this.displayBidHistory();
            }
        } catch (error) {
            console.error('Load bid history error:', error);
        }
    }

    /**
     * Display bid history
     */
    displayBidHistory() {
        const list = document.getElementById('bid-history-container');
        if (!list) return;

        list.innerHTML = '';

        if (this.bidHistory.length === 0) {
            list.innerHTML = '<p class="text-muted">No bids yet</p>';
            return;
        }

        this.bidHistory.forEach(bid => {
            const item = document.createElement('li');
            item.className = 'bid-history-item';
            item.innerHTML = `
                <div class="bid-info">
                    <span class="bidder-name">${this.escapeHtml(bid.bidderName || 'Anonymous')}</span>
                    <span class="bid-amount">${UIComponents.formatCurrency(bid.amount)}</span>
                </div>
                <span class="bid-time">${UIComponents.formatDateTime(bid.createdAt)}</span>
            `;
            list.appendChild(item);
        });
    }

    /**
     * Check if user is logged in
     */
    checkLoginStatus() {
        const token = localStorage.getItem('auth_token');
        this.isUserLoggedIn = !!token;

        const authRequired = document.getElementById('auth-required');
        const biddingForm = document.getElementById('bidding-form-container');

        if (this.isUserLoggedIn) {
            if (authRequired) authRequired.style.display = 'none';
            if (biddingForm) biddingForm.style.display = 'block';
        } else {
            if (authRequired) authRequired.style.display = 'block';
            if (biddingForm) biddingForm.style.display = 'none';
        }
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        const biddingForm = document.getElementById('bidding-form');
        if (biddingForm) {
            const submitBtn = biddingForm.querySelector('button[type="submit"]');
            submitBtn?.addEventListener('click', (e) => this.submitBid(e, biddingForm));
        }

        // Watch list button
        const watchBtn = document.getElementById('watchlist-btn');
        if (watchBtn) {
            watchBtn.addEventListener('click', () => this.toggleWatchlist());
        }

        // Share button
        const shareBtn = document.getElementById('share-btn');
        if (shareBtn) {
            shareBtn.addEventListener('click', () => this.showShareOptions());
        }

        // QR code button
        const qrBtn = document.getElementById('qr-btn');
        if (qrBtn) {
            qrBtn.addEventListener('click', () => this.showQRCode());
        }

        // Fullscreen button
        const fullscreenBtn = document.getElementById('fullscreen-btn');
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
        }

        // Auth required login button
        const loginBtn = document.getElementById('login-from-auction');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => { globalThis.location.href = '/login.html'; });
        }
    }

    /**
     * Submit bid
     */
    async submitBid(e, form) {
        e.preventDefault();

        const bidAmount = form.querySelector('#bid-amount')?.value;
        const paymentMethod = form.querySelector('#payment-method')?.value;

        if (!bidAmount || isNaN(Number.parseFloat(bidAmount))) {
            UIComponents.showAlert('Please enter a valid bid amount', 'warning');
            return;
        }

        const currentBid = this.auction.currentBid ?? 0;
        const minBid = currentBid + (this.auction.minBidIncrement || 10);
        if (Number.parseFloat(bidAmount) < minBid) {
            UIComponents.showAlert(
                `Minimum bid is ${UIComponents.formatCurrency(minBid)}`,
                'warning'
            );
            return;
        }

        try {
            const loader = UIComponents.showLoading('Placing bid...');

            const response = await fetch(`/api/auctions/${this.auctionId}/bid`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                },
                body: JSON.stringify({
                    amount: Number.parseFloat(bidAmount),
                    paymentMethod: paymentMethod,
                }),
            });

            const data = await response.json();
            UIComponents.hideLoading(loader);

            if (!response.ok) {
                UIComponents.showAlert(data.message || 'Bid failed', 'error');
                return;
            }

            UIComponents.createToast({
                message: 'Bid placed successfully!',
                type: 'success',
            });

            // Update auction with new bid
            this.auction.currentBid = data.currentBid;
            this.auction.totalBids = data.bidCount ?? data.totalBids ?? this.auction.totalBids;
            this.updateBidInfo();

            // Clear form
            form.reset();

            // Reload bid history
            this.loadBidHistory();
        } catch (error) {
            console.error('Submit bid error:', error);
            UIComponents.createToast({
                message: 'Connection error',
                type: 'error',
            });
        }
    }

    /**
     * Start countdown timer
     */
    startCountdown() {
        const countdownEl = document.getElementById('timer-value');
        const labelEl = document.getElementById('timer-label');
        if (!countdownEl) return;

        const now = Date.now();
        const startTime = this.auction.startTime ? new Date(this.auction.startTime).getTime() : null;
        const endTime = this.auction.endTime ? new Date(this.auction.endTime).getTime() : null;

        // Upcoming auction — count down to start time
        if (startTime && startTime > now) {
            if (labelEl) labelEl.textContent = 'Starts In';
            const update = () => {
                const remaining = Math.max(0, startTime - Date.now());
                countdownEl.textContent = UIComponents.formatTimeRemaining(remaining);
                if (remaining === 0) clearInterval(this.countdownInterval);
            };
            update();
            this.countdownInterval = setInterval(update, 1000);
            return;
        }

        // Live auction — count down to end time
        if (this.auction.status === 'LIVE' && endTime) {
            if (labelEl) labelEl.textContent = 'Time Remaining';
            const update = () => {
                const remaining = Math.max(0, endTime - Date.now());
                countdownEl.textContent = UIComponents.formatTimeRemaining(remaining);
                if (remaining === 0) {
                    clearInterval(this.countdownInterval);
                    this.disableBidding();
                }
            };
            update();
            this.countdownInterval = setInterval(update, 1000);
            return;
        }

        countdownEl.textContent = '--:--:--';
    }

    /**
     * Disable bidding when auction ends
     */
    disableBidding() {
        const formContainer = document.getElementById('bidding-form-container');
        if (formContainer) {
            formContainer.style.display = 'none';
        }

        const closedAlert = document.getElementById('auction-closed');
        if (closedAlert) {
            closedAlert.style.display = 'block';
        }
    }

    /**
     * Toggle watchlist
     */
    async toggleWatchlist() {
        try {
            const btn = document.getElementById('watchlist-btn');
            const isWatched = btn.classList.contains('watched');

            const response = await fetch(`/api/auctions/${this.auctionId}/watchlist`, {
                method: isWatched ? 'DELETE' : 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                },
            });

            if (!response.ok) {
                UIComponents.createToast({
                    message: 'Failed to update watchlist',
                    type: 'error',
                });
                return;
            }

            btn.classList.toggle('watched');
            const message = isWatched ? 'Removed from watchlist' : 'Added to watchlist';
            UIComponents.createToast({
                message: message,
                type: 'success',
                duration: 2000,
            });
        } catch (error) {
            console.error('Watchlist toggle error:', error);
        }
    }

    /**
     * Show share options modal
     */
    showShareOptions() {
        const url = globalThis.location.href;
        const title = this.auction.title;

        UIComponents.showModal('share-modal');

        // Copy link button
        const copyBtn = document.querySelector('[data-copy-link]');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(url).then(() => {
                    UIComponents.createToast({
                        message: 'Link copied to clipboard',
                        type: 'success',
                        duration: 2000,
                    });
                });
            });
        }

        // Social share buttons
        const twitterBtn = document.querySelector('[data-share-twitter]');
        if (twitterBtn) {
            const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;
            twitterBtn.href = twitterUrl;
            twitterBtn.target = '_blank';
        }

        const facebookBtn = document.querySelector('[data-share-facebook]');
        if (facebookBtn) {
            const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
            facebookBtn.href = fbUrl;
            facebookBtn.target = '_blank';
        }
    }

    /**
     * Show QR code modal
     */
    showQRCode() {
        UIComponents.showModal('qr-code-modal');

        const container = document.querySelector('#qr-code-modal .qr-code');
        if (container && container.innerHTML.trim() === '') {
            const QRCodeLib = globalThis.QRCode;
            if (QRCodeLib) {
                this._qrCode = new QRCodeLib(container, {
                    text: globalThis.location.href,
                    width: 200,
                    height: 200,
                });
            } else {
                container.innerHTML = `<p style="text-align:center;padding:1rem;word-break:break-all;">${globalThis.location.href}</p>`;
            }
        }
    }

    /**
     * Load artwork items for this auction and populate the detail fields.
     */
    async loadArtwork() {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/auctions/${this.auctionId}/artwork`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            if (!response.ok) return;
            const data = await response.json();
            if (data.artwork && data.artwork.length > 0) {
                this.displayArtworkPiece(data.artwork[0]);
            }
        } catch (err) {
            console.warn('Could not load auction artwork:', err);
        }
    }

    /**
     * Populate artwork-specific fields from the first artwork piece.
     */
    displayArtworkPiece(piece) {
        const imageEl = document.getElementById('artwork-image');
        if (imageEl && piece.imageUrl) {
            imageEl.src = piece.imageUrl;
            imageEl.alt = piece.title || 'Artwork';
        }

        const artistEl = document.getElementById('artwork-artist');
        if (artistEl) artistEl.textContent = piece.artistName || '';
        const artistSmallEl = document.getElementById('artwork-artist-small');
        if (artistSmallEl) artistSmallEl.textContent = piece.artistName || '';

        const mediumEl = document.getElementById('artwork-medium');
        if (mediumEl) mediumEl.textContent = piece.medium || '-';

        const dimensionsEl = document.getElementById('artwork-dimensions');
        if (dimensionsEl) dimensionsEl.textContent = piece.dimensions || '-';

        // Opening bid from artwork starting price
        const openingBidEl = document.getElementById('display-opening-bid');
        if (openingBidEl && piece.startingPrice != null) {
            openingBidEl.textContent = UIComponents.formatCurrency(Number(piece.startingPrice));
        }

        // Current bid (falls back to starting price if no bids yet)
        const currentBidEl = document.getElementById('display-current-bid');
        if (currentBidEl) {
            const bid = piece.currentBid != null ? Number(piece.currentBid) : Number(piece.startingPrice ?? 0);
            currentBidEl.textContent = UIComponents.formatCurrency(bid);
        }

        const bidCountEl = document.getElementById('display-bid-count');
        if (bidCountEl) bidCountEl.textContent = piece.bidCount ?? 0;

        const minBidHelpEl = document.getElementById('min-bid-amount');
        if (minBidHelpEl) {
            const current = piece.currentBid != null ? Number(piece.currentBid) : Number(piece.startingPrice ?? 0);
            minBidHelpEl.textContent = UIComponents.formatCurrency(current + 10);
        }
    }

    /**
     * Toggle fullscreen image
     */
    toggleFullscreen() {
        const image = document.querySelector('.artwork-image');
        if (!image) return;

        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            image.requestFullscreen?.().catch(() => {
                // Fallback for unsupported browsers
                UIComponents.createToast({
                    message: 'Fullscreen not supported',
                    type: 'info',
                });
            });
        }
    }

    /**
     * Connect to WebSocket for real-time updates
     */
    connectWebSocket() {
        if (this._wsReconnectCount >= 5) return;
        try {
            const protocol = globalThis.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${globalThis.location.host}/ws`;

            this.websocket = new WebSocket(wsUrl);

            this.websocket.addEventListener('open', () => {
                console.log('WebSocket connected');
                this._wsReconnectCount = 0;
                // Authenticate with JWT token
                const token = localStorage.getItem('auth_token');
                if (token) {
                    this.websocket.send(JSON.stringify({ type: 'authenticate', payload: { token } }));
                }
            });

            this.websocket.addEventListener('message', (event) => {
                try {
                    const data = JSON.parse(event.data);
                    // After authentication, subscribe to this auction
                    if (data.type === 'authenticated') {
                        this.websocket.send(JSON.stringify({ type: 'subscribe', auctionId: this.auctionId }));
                    } else {
                        this.handleWebSocketMessage(data);
                    }
                } catch (e) {
                    console.error('WS message parse error:', e);
                }
            });

            this.websocket.addEventListener('error', (error) => {
                console.error('WebSocket error:', error);
            });

            this.websocket.addEventListener('close', () => {
                console.log('WebSocket disconnected');
                this._wsReconnectCount = (this._wsReconnectCount || 0) + 1;
                if (this._wsReconnectCount < 5) {
                    setTimeout(() => this.connectWebSocket(), 5000);
                }
            });
        } catch (error) {
            console.error('WebSocket connection error:', error);
        }
    }

    /**
     * Handle WebSocket messages
     */
    handleWebSocketMessage(data) {
        switch (data.type) {
            // Legacy names kept for compatibility
            case 'bid_placed':
                this.handleNewBid(data);
                break;

            case 'price_update':
                this.handlePriceUpdate(data);
                break;

            case 'auction_ending':
                this.handleAuctionEnding(data);
                break;

            case 'auction_ended':
                this.handleAuctionEnded(data);
                break;

            // Server broadcast event names
            case 'bid_update': {
                const bidData = data.data || data;
                this.handleNewBid(bidData);
                this.handlePriceUpdate(bidData);
                break;
            }

            case 'auction_status_change':
                if (data.status === 'ENDED' || data.status === 'CLOSED') {
                    this.handleAuctionEnded(data);
                } else if (data.status === 'ENDING_SOON') {
                    this.handleAuctionEnding(data);
                }
                break;

            default:
                // Ignore connection/pong/subscribed messages
                break;
        }
    }

    /**
     * Handle new bid notification
     */
    handleNewBid(data) {
        // Add to bid history
        this.bidHistory.unshift({
            bidderName: data.bidderName || 'Anonymous',
            amount: data.amount,
            createdAt: new Date(),
        });

        this.displayBidHistory();

        // Check if current user was outbid
        if (data.outbidCurrentUser) {
            UIComponents.createToast({
                message: 'You have been outbid!',
                type: 'warning',
                duration: 5000,
            });
        }
    }

    /**
     * Handle price update
     */
    handlePriceUpdate(data) {
        this.auction.currentBid = data.currentBid;
        this.auction.totalBids = data.bidCount ?? data.totalBids ?? this.auction.totalBids;
        this.updateBidInfo();

        // Highlight the update
        const currentBidEl = document.querySelector('.current-bid-amount');
        if (currentBidEl) {
            currentBidEl.classList.add('highlight');
            setTimeout(() => currentBidEl.classList.remove('highlight'), 1000);
        }
    }

    /**
     * Handle auction ending notification
     */
    handleAuctionEnding(_data) {
        UIComponents.createToast({
            message: 'Auction ending soon!',
            type: 'warning',
            duration: 10000,
        });
    }

    /**
     * Handle auction ended notification
     */
    handleAuctionEnded(_data) {
        this.disableBidding();
        UIComponents.createToast({
            message: 'Auction has ended',
            type: 'info',
        });
    }

    /**
     * Show error message
     */
    showError(message) {
        const container = document.querySelector('.auction-detail-container');
        if (container) {
            container.innerHTML = `
                <div class="alert alert-error">
                    <p>${this.escapeHtml(message)}</p>
                </div>
            `;
        }
    }

    /**
     * Escape HTML special characters
     */
    escapeHtml(text) {
        if (!text) return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;',
        };
        return text.replaceAll(/[&<>"']/g, (char) => map[char]);
    }

    /**
     * Cleanup on page unload
     */
    destroy() {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
        }

        if (this.websocket) {
            this.websocket.close();
        }
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Initialize navbar (shared across all pages)
    UIComponents.initializeNavbar();
    
    // Initialize auction detail
    globalThis.auctionDetail = new AuctionDetail();
});

// Cleanup on page unload
globalThis.addEventListener('beforeunload', () => {
    globalThis.auctionDetail?.destroy();
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuctionDetail;
}
