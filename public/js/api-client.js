/**
 * API Client - HTTP REST API Communication
 * Handles all backend API calls with error handling and token management
 */

class APIClient {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl || window.location.origin;
        this.timeout = 30000; // 30 seconds
    }

    /**
     * Make HTTP request with error handling
     * @param {string} method - HTTP method
     * @param {string} path - API endpoint path
     * @param {object} options - Request options
     * @returns {Promise} Response data
     */
    async request(method, path, options = {}) {
        const url = this.baseUrl + path;
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        // Add authorization token if available
        const token = this.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const config = {
            method,
            headers,
            timeout: this.timeout,
        };

        if (options.body) {
            config.body = JSON.stringify(options.body);
        }

        if (options.signal) {
            config.signal = options.signal;
        }

        try {
            const response = await fetch(url, config);
            return await this.handleResponse(response);
        } catch (error) {
            throw this.handleError(error);
        }
    }

    /**
     * Handle HTTP response
     * @param {Response} response
     * @returns {Promise} Response data
     */
    async handleResponse(response) {
        const contentType = response.headers.get('content-type');
        let data;

        try {
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = await response.text();
            }
        } catch (error) {
            data = null;
        }

        if (!response.ok) {
            const error = new Error(data?.message || `HTTP ${response.status}`);
            error.status = response.status;
            error.data = data;
            throw error;
        }

        return data;
    }

    /**
     * Handle request errors
     * @param {Error} error
     * @returns {Error} Processed error
     */
    handleError(error) {
        if (error.name === 'AbortError') {
            return new Error('Request timeout');
        }

        if (!navigator.onLine) {
            return new Error('No internet connection');
        }

        return error;
    }

    /**
     * Get stored authentication token
     * @returns {string|null} JWT token
     */
    getToken() {
        return localStorage.getItem('auth_token');
    }

    /**
     * Set authentication token
     * @param {string} token - JWT token
     */
    setToken(token) {
        if (token) {
            localStorage.setItem('auth_token', token);
        } else {
            localStorage.removeItem('auth_token');
        }
    }

    // ===== Authentication Endpoints =====

    /**
     * Register new user
     * @param {object} userData - User registration data
     * @returns {Promise}
     */
    register(userData) {
        return this.request('POST', '/api/auth/register', { body: userData });
    }

    /**
     * Login user
     * @param {string} email - User email
     * @param {string} password - User password
     * @returns {Promise}
     */
    login(email, password) {
        return this.request('POST', '/api/auth/login', {
            body: { email, password },
        });
    }

    /**
     * Verify 2FA code
     * @param {string} code - 2FA code
     * @returns {Promise}
     */
    verify2FA(code) {
        return this.request('POST', '/api/auth/verify-2fa', {
            body: { code },
        });
    }

    /**
     * Logout user
     * @returns {Promise}
     */
    logout() {
        this.setToken(null);
        return this.request('POST', '/api/auth/logout');
    }

    /**
     * Refresh authentication token
     * @returns {Promise}
     */
    refreshToken() {
        return this.request('POST', '/api/auth/refresh');
    }

    /**
     * Get current user
     * @returns {Promise}
     */
    getCurrentUser() {
        return this.request('GET', '/api/auth/me');
    }

    /**
     * Update user profile
     * @param {object} data - Profile data
     * @returns {Promise}
     */
    updateProfile(data) {
        return this.request('PUT', '/api/auth/profile', { body: data });
    }

    /**
     * Change password
     * @param {string} currentPassword
     * @param {string} newPassword
     * @returns {Promise}
     */
    changePassword(currentPassword, newPassword) {
        return this.request('POST', '/api/auth/change-password', {
            body: { currentPassword, newPassword },
        });
    }

    /**
     * Request password reset
     * @param {string} email - User email
     * @returns {Promise}
     */
    requestPasswordReset(email) {
        return this.request('POST', '/api/auth/forgot-password', {
            body: { email },
        });
    }

    /**
     * Reset password with token
     * @param {string} token - Reset token
     * @param {string} password - New password
     * @returns {Promise}
     */
    resetPassword(token, password) {
        return this.request('POST', '/api/auth/reset-password', {
            body: { token, password },
        });
    }

    // ===== Auction Endpoints =====

    /**
     * Get all auctions with filtering
     * @param {object} params - Query parameters
     * @returns {Promise}
     */
    getAuctions(params = {}) {
        const query = new URLSearchParams(params).toString();
        const path = `/api/auctions${query ? '?' + query : ''}`;
        return this.request('GET', path);
    }

    /**
     * Get single auction details
     * @param {string} auctionId - Auction ID
     * @returns {Promise}
     */
    getAuction(auctionId) {
        return this.request('GET', `/api/auctions/${auctionId}`);
    }

    /**
     * Create new auction (admin only)
     * @param {object} data - Auction data
     * @returns {Promise}
     */
    createAuction(data) {
        return this.request('POST', '/api/auctions', { body: data });
    }

    /**
     * Update auction (admin only)
     * @param {string} auctionId - Auction ID
     * @param {object} data - Updated data
     * @returns {Promise}
     */
    updateAuction(auctionId, data) {
        return this.request('PUT', `/api/auctions/${auctionId}`, { body: data });
    }

    /**
     * Close auction (admin only)
     * @param {string} auctionId - Auction ID
     * @returns {Promise}
     */
    closeAuction(auctionId) {
        return this.request('POST', `/api/auctions/${auctionId}/close`);
    }

    /**
     * Get auction winner
     * @param {string} auctionId - Auction ID
     * @returns {Promise}
     */
    getAuctionWinner(auctionId) {
        return this.request('GET', `/api/auctions/${auctionId}/winner`);
    }

    /**
     * Get auctions for authenticated user
     * @param {object} params - Query parameters
     * @returns {Promise}
     */
    getUserAuctions(params = {}) {
        const query = new URLSearchParams(params).toString();
        const path = `/api/auctions/user/list${query ? '?' + query : ''}`;
        return this.request('GET', path);
    }

    // ===== Bidding Endpoints =====

    /**
     * Place a bid
     * @param {string} auctionId - Auction ID
     * @param {object} bidData - Bid data
     * @returns {Promise}
     */
    placeBid(auctionId, bidData) {
        return this.request('POST', `/api/bidding/${auctionId}/place`, {
            body: bidData,
        });
    }

    /**
     * Withdraw a bid
     * @param {string} bidId - Bid ID
     * @returns {Promise}
     */
    withdrawBid(bidId) {
        return this.request('POST', `/api/bidding/bids/${bidId}/withdraw`);
    }

    /**
     * Get bid history for an auction
     * @param {string} auctionId - Auction ID
     * @param {object} params - Query parameters
     * @returns {Promise}
     */
    getBidHistory(auctionId, params = {}) {
        const query = new URLSearchParams(params).toString();
        const path = `/api/bidding/${auctionId}/history${query ? '?' + query : ''}`;
        return this.request('GET', path);
    }

    /**
     * Get current bidding state
     * @param {string} auctionId - Auction ID
     * @returns {Promise}
     */
    getBiddingState(auctionId) {
        return this.request('GET', `/api/bidding/${auctionId}/state`);
    }

    /**
     * Get user's bid history
     * @param {object} params - Query parameters
     * @returns {Promise}
     */
    getUserBidHistory(params = {}) {
        const query = new URLSearchParams(params).toString();
        const path = `/api/bidding/user/history${query ? '?' + query : ''}`;
        return this.request('GET', path);
    }

    /**
     * Get user's active auctions
     * @param {object} params - Query parameters
     * @returns {Promise}
     */
    getUserActiveAuctions(params = {}) {
        const query = new URLSearchParams(params).toString();
        const path = `/api/bidding/user/active${query ? '?' + query : ''}`;
        return this.request('GET', path);
    }

    /**
     * Get bidding statistics
     * @returns {Promise}
     */
    getBiddingStats() {
        return this.request('GET', '/api/bidding/stats');
    }

    // ===== Payment Endpoints =====

    /**
     * Create payment intent
     * @param {object} paymentData - Payment data
     * @returns {Promise}
     */
    createPaymentIntent(paymentData) {
        return this.request('POST', '/api/payments/intent', {
            body: paymentData,
        });
    }

    /**
     * Confirm payment
     * @param {object} paymentData - Payment confirmation data
     * @returns {Promise}
     */
    confirmPayment(paymentData) {
        return this.request('POST', '/api/payments/confirm', {
            body: paymentData,
        });
    }

    /**
     * Get payment methods
     * @returns {Promise}
     */
    getPaymentMethods() {
        return this.request('GET', '/api/payments/methods');
    }

    /**
     * Add payment method
     * @param {object} methodData - Payment method data
     * @returns {Promise}
     */
    addPaymentMethod(methodData) {
        return this.request('POST', '/api/payments/methods', {
            body: methodData,
        });
    }

    /**
     * Delete payment method
     * @param {string} methodId - Payment method ID
     * @returns {Promise}
     */
    deletePaymentMethod(methodId) {
        return this.request('DELETE', `/api/payments/methods/${methodId}`);
    }

    /**
     * Get payment history
     * @param {object} params - Query parameters
     * @returns {Promise}
     */
    getPaymentHistory(params = {}) {
        const query = new URLSearchParams(params).toString();
        const path = `/api/payments/history${query ? '?' + query : ''}`;
        return this.request('GET', path);
    }

    // ===== Admin Endpoints =====

    /**
     * Get all users (admin only)
     * @param {object} params - Query parameters
     * @returns {Promise}
     */
    getUsers(params = {}) {
        const query = new URLSearchParams(params).toString();
        const path = `/api/admin/users${query ? '?' + query : ''}`;
        return this.request('GET', path);
    }

    /**
     * Get user details (admin only)
     * @param {string} userId - User ID
     * @returns {Promise}
     */
    getUser(userId) {
        return this.request('GET', `/api/admin/users/${userId}`);
    }

    /**
     * Update user (admin only)
     * @param {string} userId - User ID
     * @param {object} data - User data
     * @returns {Promise}
     */
    updateUser(userId, data) {
        return this.request('PUT', `/api/admin/users/${userId}`, { body: data });
    }

    /**
     * Delete user (admin only)
     * @param {string} userId - User ID
     * @returns {Promise}
     */
    deleteUser(userId) {
        return this.request('DELETE', `/api/admin/users/${userId}`);
    }

    /**
     * Get system statistics (admin only)
     * @returns {Promise}
     */
    getSystemStats() {
        return this.request('GET', '/api/admin/stats');
    }

    /**
     * Get audit logs (admin only)
     * @param {object} params - Query parameters
     * @returns {Promise}
     */
    getAuditLogs(params = {}) {
        const query = new URLSearchParams(params).toString();
        const path = `/api/admin/logs${query ? '?' + query : ''}`;
        return this.request('GET', path);
    }

    // ===== Utility Methods =====

    /**
     * Create abort signal with timeout
     * @param {number} ms - Timeout in milliseconds
     * @returns {AbortSignal}
     */
    getAbortSignal(ms = this.timeout) {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), ms);
        return controller.signal;
    }

    /**
     * Check if user is authenticated
     * @returns {boolean}
     */
    isAuthenticated() {
        return !!this.getToken();
    }

    /**
     * Get authentication header
     * @returns {object}
     */
    getAuthHeaders() {
        const token = this.getToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
    }

    /**
     * Clear all stored data
     */
    clearStorage() {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        localStorage.removeItem('2fa_required');
    }
}

// Create global instance
window.apiClient = new APIClient();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = APIClient;
}
