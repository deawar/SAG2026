/**
 * Authentication Manager
 * Handles user authentication, registration, and token management
 */

class AuthManager {
    constructor() {
        this.user = this.loadUser();
        this.token = localStorage.getItem('auth_token');
        this.refreshToken = localStorage.getItem('refresh_token');
        this.require2FA = localStorage.getItem('2fa_required') === 'true';
        
        // Auto-refresh token before expiry
        this.setupTokenRefresh();
    }

    /**
     * Register new user
     * @param {object} userData - User registration data
     * @returns {Promise}
     */
    async register(userData) {
        try {
            const response = await apiClient.register({
                first_name: userData.firstName,
                last_name: userData.lastName,
                email: userData.email,
                password: userData.password,
                school_id: userData.schoolId,
                phone: userData.phone,
            });

            if (response.token) {
                this.setToken(response.token);
                this.setUser(response.user);
                return { success: true, user: response.user };
            }

            return { success: false, error: response.message };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Login user
     * @param {string} email - User email
     * @param {string} password - User password
     * @returns {Promise}
     */
    async login(email, password) {
        try {
            const response = await apiClient.login(email, password);

            if (response.requires_2fa) {
                this.require2FA = true;
                localStorage.setItem('2fa_required', 'true');
                localStorage.setItem('2fa_token', response.temp_token);
                return { success: false, requires2FA: true };
            }

            if (response.token) {
                this.setToken(response.token);
                this.setUser(response.user);
                if (response.refresh_token) {
                    this.setRefreshToken(response.refresh_token);
                }
                this.require2FA = false;
                localStorage.removeItem('2fa_required');
                localStorage.removeItem('2fa_token');
                return { success: true, user: response.user };
            }

            return { success: false, error: response.message };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Verify 2FA code
     * @param {string} code - 2FA code
     * @returns {Promise}
     */
    async verify2FA(code) {
        try {
            const response = await apiClient.verify2FA(code);

            if (response.token) {
                this.setToken(response.token);
                this.setUser(response.user);
                if (response.refresh_token) {
                    this.setRefreshToken(response.refresh_token);
                }
                this.require2FA = false;
                localStorage.removeItem('2fa_required');
                localStorage.removeItem('2fa_token');
                return { success: true, user: response.user };
            }

            return { success: false, error: response.message };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Logout user
     * @returns {Promise}
     */
    async logout() {
        try {
            await apiClient.logout();
        } catch (error) {
            console.warn('Logout API call failed:', error);
        }

        this.clearAuth();
    }

    /**
     * Refresh authentication token
     * @returns {Promise}
     */
    async refreshAccessToken() {
        if (!this.refreshToken) {
            this.clearAuth();
            return false;
        }

        try {
            const response = await apiClient.refreshToken();

            if (response.token) {
                this.setToken(response.token);
                if (response.refresh_token) {
                    this.setRefreshToken(response.refresh_token);
                }
                return true;
            }

            this.clearAuth();
            return false;
        } catch (error) {
            console.error('Token refresh failed:', error);
            this.clearAuth();
            return false;
        }
    }

    /**
     * Setup automatic token refresh
     */
    setupTokenRefresh() {
        setInterval(async () => {
            if (this.isAuthenticated()) {
                await this.refreshAccessToken();
            }
        }, 15 * 60 * 1000); // Refresh every 15 minutes
    }

    /**
     * Get current user
     * @returns {Promise}
     */
    async getCurrentUser() {
        try {
            const response = await apiClient.getCurrentUser();
            this.setUser(response);
            return response;
        } catch (error) {
            console.error('Failed to get current user:', error);
            return null;
        }
    }

    /**
     * Update user profile
     * @param {object} data - Profile data
     * @returns {Promise}
     */
    async updateProfile(data) {
        try {
            const response = await apiClient.updateProfile(data);
            this.setUser(response);
            return { success: true, user: response };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Change password
     * @param {string} currentPassword - Current password
     * @param {string} newPassword - New password
     * @returns {Promise}
     */
    async changePassword(currentPassword, newPassword) {
        try {
            await apiClient.changePassword(currentPassword, newPassword);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Request password reset
     * @param {string} email - User email
     * @returns {Promise}
     */
    async requestPasswordReset(email) {
        try {
            const response = await apiClient.requestPasswordReset(email);
            return { success: true, message: response.message };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Reset password with token
     * @param {string} token - Reset token
     * @param {string} password - New password
     * @returns {Promise}
     */
    async resetPassword(token, password) {
        try {
            const response = await apiClient.resetPassword(token, password);
            return { success: true, message: response.message };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // ===== Token Management =====

    /**
     * Set authentication token
     * @param {string} token - JWT token
     */
    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('auth_token', token);
            apiClient.setToken(token);
        } else {
            localStorage.removeItem('auth_token');
            apiClient.setToken(null);
        }
    }

    /**
     * Set refresh token
     * @param {string} token - Refresh token
     */
    setRefreshToken(token) {
        this.refreshToken = token;
        if (token) {
            localStorage.setItem('refresh_token', token);
        } else {
            localStorage.removeItem('refresh_token');
        }
    }

    /**
     * Get authentication token
     * @returns {string|null}
     */
    getToken() {
        return this.token;
    }

    /**
     * Decode JWT token
     * @param {string} token - JWT token
     * @returns {object|null}
     */
    decodeToken(token = this.token) {
        if (!token) return null;

        try {
            const parts = token.split('.');
            if (parts.length !== 3) return null;

            const decoded = JSON.parse(atob(parts[1]));
            return decoded;
        } catch (error) {
            console.error('Failed to decode token:', error);
            return null;
        }
    }

    /**
     * Check if token is expired
     * @returns {boolean}
     */
    isTokenExpired() {
        const decoded = this.decodeToken();
        if (!decoded || !decoded.exp) return true;

        const now = Math.floor(Date.now() / 1000);
        return decoded.exp <= now;
    }

    /**
     * Get token expiration time
     * @returns {Date|null}
     */
    getTokenExpiration() {
        const decoded = this.decodeToken();
        if (!decoded || !decoded.exp) return null;

        return new Date(decoded.exp * 1000);
    }

    // ===== User Management =====

    /**
     * Set current user
     * @param {object} user - User object
     */
    setUser(user) {
        this.user = user;
        localStorage.setItem('user', JSON.stringify(user));
        this.emitUserChange();
    }

    /**
     * Load user from storage
     * @returns {object|null}
     */
    loadUser() {
        try {
            const stored = localStorage.getItem('user');
            return stored ? JSON.parse(stored) : null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Get current user
     * @returns {object|null}
     */
    getUser() {
        return this.user;
    }

    /**
     * Check if user has specific role
     * @param {string} role - Role name
     * @returns {boolean}
     */
    hasRole(role) {
        return this.user && this.user.role === role;
    }

    /**
     * Check if user has specific permission
     * @param {string} permission - Permission name
     * @returns {boolean}
     */
    hasPermission(permission) {
        if (!this.user || !this.user.permissions) return false;
        return this.user.permissions.includes(permission);
    }

    /**
     * Check if user is admin
     * @returns {boolean}
     */
    isAdmin() {
        return this.hasRole('admin') || this.hasRole('school_admin');
    }

    /**
     * Check if user is bidder
     * @returns {boolean}
     */
    isBidder() {
        return this.hasRole('bidder');
    }

    // ===== Authentication State =====

    /**
     * Check if user is authenticated
     * @returns {boolean}
     */
    isAuthenticated() {
        return !!this.token && !this.isTokenExpired();
    }

    /**
     * Check if 2FA is required
     * @returns {boolean}
     */
    is2FARequired() {
        return this.require2FA;
    }

    /**
     * Clear all authentication data
     */
    clearAuth() {
        this.user = null;
        this.token = null;
        this.refreshToken = null;
        this.require2FA = false;

        localStorage.removeItem('auth_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        localStorage.removeItem('2fa_required');
        localStorage.removeItem('2fa_token');

        apiClient.setToken(null);
        this.emitUserChange();
    }

    // ===== Event Handling =====

    /**
     * Event handlers for auth changes
     */
    handlers = [];

    /**
     * Register auth change handler
     * @param {function} handler - Handler function
     */
    onChange(handler) {
        this.handlers.push(handler);
    }

    /**
     * Remove auth change handler
     * @param {function} handler - Handler function
     */
    offChange(handler) {
        const index = this.handlers.indexOf(handler);
        if (index > -1) {
            this.handlers.splice(index, 1);
        }
    }

    /**
     * Emit user change event
     */
    emitUserChange() {
        this.handlers.forEach(handler => {
            try {
                handler(this.user);
            } catch (error) {
                console.error('Error in auth change handler:', error);
            }
        });

        // Dispatch custom event for other listeners
        window.dispatchEvent(new CustomEvent('authChange', { detail: this.user }));
    }
}

// Create global instance
window.authManager = new AuthManager();

// Listen for storage changes in other tabs
window.addEventListener('storage', (event) => {
    if (event.key === 'auth_token') {
        window.location.reload();
    }
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthManager;
}
