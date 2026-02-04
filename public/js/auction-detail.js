/**
 * Auction Detail Page Module
 * Handles bidding, real-time updates, bid history, and WebSocket integration
 */

class AuctionDetail {
    constructor() {
        this.auctionId = new URLSearchParams(window.location.search).get('id');
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
            const response = await fetch(`/api/auctions/${this.auctionId}`);
            const data = await response.json();

            if (!response.ok) {
                this.showError(data.message || 'Auction not found');
                return;
            }

            this.auction = data.auction;
            this.displayAuction();
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

        const container = document.querySelector('.auction-detail-container');
        if (!container) return;

        // Update image
        const image = container.querySelector('.artwork-image');
        if (image) {
            image.src = this.auction.image;
            image.alt = this.auction.title;
        }

        // Update details
        const titleEl = container.querySelector('.auction-title');
        if (titleEl) titleEl.textContent = this.auction.title;

        const descEl = container.querySelector('.auction-description');
        if (descEl) descEl.textContent = this.auction.description;

        const schoolEl = container.querySelector('.auction-school');
        if (schoolEl) schoolEl.textContent = `School: ${this.auction.school || 'N/A'}`;

        // Update bid info
        this.updateBidInfo();

        // Update auction status
        this.updateAuctionStatus();
    }

    /**
     * Update current bid information
     */
    updateBidInfo() {
        const container = document.querySelector('.current-bid-section');
        if (!container) return;

        const currentBid = container.querySelector('.current-bid-amount');
        if (currentBid) {
            currentBid.textContent = UIComponents.formatCurrency(this.auction.currentBid);
        }

        const minBid = container.querySelector('.min-bid-amount');
        if (minBid) {
            const minBidAmount = this.auction.currentBid + (this.auction.minBidIncrement || 10);
            minBid.textContent = UIComponents.formatCurrency(minBidAmount);
        }

        const bidCount = container.querySelector('.bid-count');
        if (bidCount) {
            bidCount.textContent = `${this.auction.bidCount || 0} bids`;
        }
    }

    /**
     * Update auction status
     */
    updateAuctionStatus() {
        const statusBadge = document.querySelector('.auction-status-badge');
        if (!statusBadge) return;

        const now = Date.now();
        const endTime = new Date(this.auction.endTime).getTime();

        if (endTime < now) {
            statusBadge.className = 'auction-status-badge status-ended';
            statusBadge.textContent = '⛔ Auction Ended';
            this.disableBidding();
        } else if (endTime - now < 3600000) {
            // Less than 1 hour remaining
            statusBadge.className = 'auction-status-badge status-ending-soon';
            statusBadge.textContent = '⚠️ Ending Soon';
        } else {
            statusBadge.className = 'auction-status-badge status-active';
            statusBadge.textContent = '🔴 Active';
        }
    }

    /**
     * Load bid history
     */
    async loadBidHistory() {
        try {
            const response = await fetch(`/api/auctions/${this.auctionId}/bids`);
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
        const list = document.querySelector('.bid-history-list');
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
        const token = localStorage.getItem('authToken');
        this.isUserLoggedIn = !!token;

        const authRequired = document.querySelector('.auth-required-alert');
        const biddingForm = document.querySelector('.bidding-form');

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
        const biddingForm = document.querySelector('.bidding-form');
        if (biddingForm) {
            const submitBtn = biddingForm.querySelector('button[type="submit"]');
            submitBtn?.addEventListener('click', (e) => this.submitBid(e, biddingForm));
        }

        // Watch list button
        const watchBtn = document.querySelector('.btn-watch-auction');
        if (watchBtn) {
            watchBtn.addEventListener('click', () => this.toggleWatchlist());
        }

        // Share buttons
        const shareBtn = document.querySelector('.btn-share');
        if (shareBtn) {
            shareBtn.addEventListener('click', () => this.showShareOptions());
        }

        // QR code button
        const qrBtn = document.querySelector('.btn-qr-code');
        if (qrBtn) {
            qrBtn.addEventListener('click', () => this.showQRCode());
        }

        // Fullscreen button
        const fullscreenBtn = document.querySelector('.btn-fullscreen');
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
        }

        // Auth modal login button
        const loginBtn = document.querySelector('.btn-auth-login');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => window.location.href = '/login.html');
        }
    }

    /**
     * Submit bid
     */
    async submitBid(e, form) {
        e.preventDefault();

        const bidAmount = form.querySelector('input[name="bid-amount"]')?.value;
        const paymentMethod = form.querySelector('select[name="payment-method"]')?.value;

        if (!bidAmount || isNaN(parseFloat(bidAmount))) {
            UIComponents.showAlert('Please enter a valid bid amount', 'warning');
            return;
        }

        const minBid = this.auction.currentBid + (this.auction.minBidIncrement || 10);
        if (parseFloat(bidAmount) < minBid) {
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
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                },
                body: JSON.stringify({
                    amount: parseFloat(bidAmount),
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
            this.auction.bidCount = data.bidCount;
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
        const countdownEl = document.querySelector('.countdown-timer');
        if (!countdownEl) return;

        const updateCountdown = () => {
            const now = Date.now();
            const endTime = new Date(this.auction.endTime).getTime();
            const remaining = Math.max(0, endTime - now);

            const formatted = UIComponents.formatTimeRemaining(remaining);
            countdownEl.textContent = formatted;

            if (remaining === 0) {
                clearInterval(this.countdownInterval);
                this.disableBidding();
            }
        };

        updateCountdown();
        this.countdownInterval = setInterval(updateCountdown, 1000);
    }

    /**
     * Disable bidding when auction ends
     */
    disableBidding() {
        const form = document.querySelector('.bidding-form');
        if (form) {
            form.style.display = 'none';
        }

        const closedAlert = document.querySelector('.auction-closed-alert');
        if (closedAlert) {
            closedAlert.style.display = 'block';
        }
    }

    /**
     * Toggle watchlist
     */
    async toggleWatchlist() {
        try {
            const btn = document.querySelector('.btn-watch-auction');
            const isWatched = btn.classList.contains('watched');

            const response = await fetch(`/api/auctions/${this.auctionId}/watchlist`, {
                method: isWatched ? 'DELETE' : 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
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
        const url = window.location.href;
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

        // Generate QR code if not already done
        const container = document.querySelector('#qr-code-modal .qr-code');
        if (container && container.innerHTML.trim() === '') {
            const url = window.location.href;
            // Placeholder: In production, use qrcode.js library
            container.innerHTML = `
                <div style="text-align: center; padding: 20px;">
                    <p>📱 QR Code would be displayed here</p>
                    <p style="font-size: 0.875rem; color: #666;">Scan with your phone to share</p>
                </div>
            `;
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
        try {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws/auctions/${this.auctionId}`;

            this.websocket = new WebSocket(wsUrl);

            this.websocket.addEventListener('open', () => {
                console.log('WebSocket connected');
            });

            this.websocket.addEventListener('message', (event) => {
                const data = JSON.parse(event.data);
                this.handleWebSocketMessage(data);
            });

            this.websocket.addEventListener('error', (error) => {
                console.error('WebSocket error:', error);
            });

            this.websocket.addEventListener('close', () => {
                console.log('WebSocket disconnected');
                // Attempt to reconnect after 5 seconds
                setTimeout(() => this.connectWebSocket(), 5000);
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

            default:
                console.log('Unknown message type:', data.type);
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
        this.auction.bidCount = data.bidCount;
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
    handleAuctionEnding(data) {
        UIComponents.createToast({
            message: 'Auction ending soon!',
            type: 'warning',
            duration: 10000,
        });
    }

    /**
     * Handle auction ended notification
     */
    handleAuctionEnded(data) {
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
        return text.replace(/[&<>"']/g, (char) => map[char]);
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
    window.auctionDetail = new AuctionDetail();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.auctionDetail) {
        window.auctionDetail.destroy();
    }
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuctionDetail;
}
