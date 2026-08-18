/**
 * Authentication Manager
 * Handles user authentication, registration, and auth state.
 * The access token is an httpOnly cookie — JS never reads or stores it.
 * A non-sensitive expiry HINT (auth_expires_at epoch ms) is kept in
 * localStorage so isAuthenticated() can return false when the cookie has
 * likely expired, without exposing the token itself.
 */

class AuthManager {
  constructor() {
    this.user = this.loadUser();
    this.refreshToken = null; // refresh token is an httpOnly cookie, not JS-readable
    this.require2FA = localStorage.getItem('2fa_required') === 'true';

    // Load the non-sensitive expiry hint
    this._loadAuthExpiry();

    // Auto-refresh token before expiry
    this.setupTokenRefresh();
  }

  // ===== Expiry Hint Helpers =====

  /**
   * Store a non-sensitive expiry hint in localStorage.
   * @param {number|string} expiresIn - seconds (number) or a string like '15m'; default 15m.
   */
  _setAuthExpiry(expiresIn) {
    let ms = 15 * 60 * 1000;
    if (typeof expiresIn === 'number') { ms = expiresIn * 1000; }
    // string form: only '15m' style supported; fall through to default for anything else
    this.authExpiresAt = Date.now() + ms;
    localStorage.setItem('auth_expires_at', String(this.authExpiresAt));
  }

  /**
   * Load the expiry hint from localStorage into memory.
   * @returns {number} epoch ms, or 0 if absent/invalid.
   */
  _loadAuthExpiry() {
    const v = Number(localStorage.getItem('auth_expires_at'));
    this.authExpiresAt = Number.isFinite(v) ? v : 0;
    return this.authExpiresAt;
  }

  /**
     * Register new user
     * @param {object} userData - User registration data
     * @returns {Promise}
     */
  async register(userData) {
    try {
      const response = await apiClient.register({
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
        password: userData.password,
        school_id: userData.schoolId,
        phone: userData.phone
      });

      // Handle successful registration response from server
      if (response.success && response.data) {
        // accessToken and refreshToken are httpOnly cookies — not in JS-visible data.
        const { expiresIn, ...userInfo } = response.data;

        // Store expiry hint and user data
        this._setAuthExpiry(expiresIn);
        this.setUser(userInfo);

        return { success: true, user: userInfo };
      }

      return { success: false, error: response.message || 'Registration failed' };
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

      // Check for 2FA requirement (new format)
      if (response.data?.requiresMfa || response.requires_2fa) {
        this.require2FA = true;
        localStorage.setItem('2fa_required', 'true');
        localStorage.setItem('2fa_token', response.data?.tempToken || response.temp_token);
        localStorage.setItem('2fa_user_id', response.data?.userId || '');
        return { success: false, requires2FA: true };
      }

      // Handle successful login with new response format
      if (response.data?.userId || response.data?.email) {
        this._setAuthExpiry(response.data.expiresIn);

        // Set user object from response data
        this.setUser({
          id: response.data.userId,
          email: response.data.email,
          firstName: response.data.firstName || '',
          lastName: response.data.lastName || '',
          role: response.data.role,
          schoolId: response.data.schoolId || null
        });

        this.require2FA = false;
        localStorage.removeItem('2fa_required');
        localStorage.removeItem('2fa_token');
        return { success: true, user: this.user };
      }

      // Handle old response format for backward compatibility
      if (response.token) {
        this._setAuthExpiry(response.expiresIn);
        this.setUser(response.user);
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
        this._setAuthExpiry(response.expiresIn);
        this.setUser(response.user);
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
     * The access token is an httpOnly cookie — the browser sends it automatically.
     * Gates on this.user (presence of a user session) rather than a JS-visible token.
     * @returns {Promise<boolean>}
     */
  async refreshAccessToken() {
    if (!this.user) {
      this.clearAuth();
      return false;
    }

    try {
      const response = await apiClient.refreshToken();

      if (response?.data) {
        this._setAuthExpiry(response.data.expiresIn);
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
      // Refresh while user session exists — fires at 14 min so the cookie is
      // still valid when the 15-min expiry hits
      if (this.user) {
        await this.refreshAccessToken();
      }
    }, 14 * 60 * 1000); // 14 minutes (1 min before the 15-min access token expires)
  }

  /**
     * Get current user from server
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
    } catch {
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
    if (!this.user || !this.user.permissions) {return false;}
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
     * Check if user is authenticated.
     * Uses the non-sensitive expiry hint: true only when a user session exists
     * AND the hint indicates the cookie has not yet expired.
     * @returns {boolean}
     */
  isAuthenticated() {
    return !!this.user && Date.now() < (this.authExpiresAt || 0);
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
    this.refreshToken = null;
    this.require2FA = false;
    this.authExpiresAt = 0;

    localStorage.removeItem('auth_expires_at');
    localStorage.removeItem('user');
    localStorage.removeItem('2fa_required');
    localStorage.removeItem('2fa_token');

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
  if (event.key === 'user' || event.key === 'auth_expires_at') {
    window.location.reload();
  }
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AuthManager;
}
