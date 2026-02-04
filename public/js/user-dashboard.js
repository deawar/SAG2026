/**
 * User Dashboard Module
 * Handles user account management, bid history, and security settings
 */

class UserDashboard {
    constructor() {
        this.currentTab = 'active-bids';
        this.user = null;
        this.init();
    }

    /**
     * Initialize dashboard
     */
    async init() {
        await this.loadUserData();
        this.attachEventListeners();
        this.setupTabs();
    }

    /**
     * Load user data from API
     */
    async loadUserData() {
        try {
            const response = await fetch('/api/user/profile', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                },
            });

            const data = await response.json();

            if (!response.ok) {
                if (response.status === 401) {
                    window.location.href = '/login.html';
                } else {
                    UIComponents.showAlert(data.message || 'Failed to load user data', 'error');
                }
                return;
            }

            this.user = data.user;
            this.displayUserData();
        } catch (error) {
            console.error('Load user data error:', error);
            UIComponents.createToast({
                message: 'Connection error',
                type: 'error',
            });
        }
    }

    /**
     * Display user data in dashboard
     */
    displayUserData() {
        if (!this.user) return;

        // Update profile section
        const nameInput = document.querySelector('input[name="full-name"]');
        if (nameInput) nameInput.value = this.user.fullName || '';

        const emailInput = document.querySelector('input[name="email"]');
        if (emailInput) emailInput.value = this.user.email || '';

        const phoneInput = document.querySelector('input[name="phone"]');
        if (phoneInput) phoneInput.value = this.user.phone || '';

        // Update address section
        const streetInput = document.querySelector('input[name="street"]');
        if (streetInput) streetInput.value = this.user.address?.street || '';

        const cityInput = document.querySelector('input[name="city"]');
        if (cityInput) cityInput.value = this.user.address?.city || '';

        const stateInput = document.querySelector('input[name="state"]');
        if (stateInput) stateInput.value = this.user.address?.state || '';

        const zipInput = document.querySelector('input[name="zip"]');
        if (zipInput) zipInput.value = this.user.address?.zip || '';

        // Update notification preferences
        this.loadNotificationPreferences();

        // Update security settings
        this.load2FAStatus();

        // Load bid data
        this.loadActiveBids();
        this.loadBidHistory();
        this.loadWins();
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Profile form
        const profileForm = document.querySelector('[data-form="profile"]');
        if (profileForm) {
            const submitBtn = profileForm.querySelector('button[type="submit"]');
            submitBtn?.addEventListener('click', (e) => this.saveProfile(e, profileForm));
        }

        // Address form
        const addressForm = document.querySelector('[data-form="address"]');
        if (addressForm) {
            const submitBtn = addressForm.querySelector('button[type="submit"]');
            submitBtn?.addEventListener('click', (e) => this.saveAddress(e, addressForm));
        }

        // Password change form
        const passwordForm = document.querySelector('[data-form="password"]');
        if (passwordForm) {
            const submitBtn = passwordForm.querySelector('button[type="submit"]');
            submitBtn?.addEventListener('click', (e) => this.changePassword(e, passwordForm));
        }

        // Notification preferences
        const notifCheckboxes = document.querySelectorAll('input[name^="notification-"]');
        notifCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => this.saveNotificationPreferences());
        });

        // 2FA toggle
        const enable2FABtn = document.querySelector('[data-enable-2fa]');
        if (enable2FABtn) {
            enable2FABtn.addEventListener('click', () => {
                window.location.href = '/2fa-setup.html';
            });
        }

        // Delete account button
        const deleteBtn = document.querySelector('[data-delete-account]');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => this.confirmDeleteAccount());
        }

        // Logout button
        const logoutBtn = document.querySelector('[data-logout]');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }
    }

    /**
     * Setup tab navigation
     */
    setupTabs() {
        const tabButtons = document.querySelectorAll('.tab-button');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;
                this.switchTab(tabName);
            });
        });
    }

    /**
     * Switch tab
     */
    switchTab(tabName) {
        // Update buttons
        const tabButtons = document.querySelectorAll('.tab-button');
        tabButtons.forEach(btn => {
            btn.classList.remove('active');
            btn.setAttribute('aria-selected', 'false');
        });

        const activeBtn = document.querySelector(`.tab-button[data-tab="${tabName}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
            activeBtn.setAttribute('aria-selected', 'true');
        }

        // Update panels
        const tabPanels = document.querySelectorAll('.tab-panel');
        tabPanels.forEach(panel => {
            panel.classList.remove('active');
            panel.setAttribute('aria-hidden', 'true');
        });

        const activePanel = document.querySelector(`.tab-panel[data-tab="${tabName}"]`);
        if (activePanel) {
            activePanel.classList.add('active');
            activePanel.setAttribute('aria-hidden', 'false');

            // Load data for this tab
            if (tabName === 'active-bids') {
                this.loadActiveBids();
            } else if (tabName === 'bid-history') {
                this.loadBidHistory();
            } else if (tabName === 'my-wins') {
                this.loadWins();
            }
        }

        this.currentTab = tabName;
    }

    /**
     * Load active bids
     */
    async loadActiveBids() {
        try {
            const response = await fetch('/api/user/bids/active', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                },
            });

            const data = await response.json();

            if (response.ok) {
                this.displayActiveBids(data.bids || []);
            }
        } catch (error) {
            console.error('Load active bids error:', error);
        }
    }

    /**
     * Display active bids
     */
    displayActiveBids(bids) {
        const list = document.querySelector('[data-list="active-bids"]');
        if (!list) return;

        list.innerHTML = '';

        if (bids.length === 0) {
            list.innerHTML = '<p class="text-muted">No active bids</p>';
            return;
        }

        bids.forEach(bid => {
            const item = document.createElement('li');
            item.className = 'bid-item';
            item.innerHTML = `
                <div class="bid-info">
                    <h4><a href="/auction-detail.html?id=${bid.auctionId}">${this.escapeHtml(bid.auctionTitle)}</a></h4>
                    <p class="auction-school">${this.escapeHtml(bid.school || 'N/A')}</p>
                </div>
                <div class="bid-amount">
                    <strong>${UIComponents.formatCurrency(bid.amount)}</strong>
                </div>
                <div class="bid-time">
                    Placed ${UIComponents.formatDate(bid.createdAt)}
                </div>
            `;
            list.appendChild(item);
        });

        // Update badge
        const badge = document.querySelector('[data-badge="active-bids"]');
        if (badge) {
            badge.textContent = bids.length;
        }
    }

    /**
     * Load bid history
     */
    async loadBidHistory() {
        try {
            const response = await fetch('/api/user/bids/history', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                },
            });

            const data = await response.json();

            if (response.ok) {
                this.displayBidHistory(data.bids || []);
            }
        } catch (error) {
            console.error('Load bid history error:', error);
        }
    }

    /**
     * Display bid history
     */
    displayBidHistory(bids) {
        const list = document.querySelector('[data-list="bid-history"]');
        if (!list) return;

        list.innerHTML = '';

        if (bids.length === 0) {
            list.innerHTML = '<p class="text-muted">No bid history</p>';
            return;
        }

        bids.forEach(bid => {
            const item = document.createElement('li');
            item.className = 'bid-item';
            const status = bid.isWinning ? '✓ Winning' : bid.isOutbid ? '✕ Outbid' : 'Placed';
            item.innerHTML = `
                <div class="bid-info">
                    <h4><a href="/auction-detail.html?id=${bid.auctionId}">${this.escapeHtml(bid.auctionTitle)}</a></h4>
                    <p class="bid-status">${status}</p>
                </div>
                <div class="bid-amount">
                    <strong>${UIComponents.formatCurrency(bid.amount)}</strong>
                </div>
                <div class="bid-time">
                    ${UIComponents.formatDateTime(bid.createdAt)}
                </div>
            `;
            list.appendChild(item);
        });
    }

    /**
     * Load user wins
     */
    async loadWins() {
        try {
            const response = await fetch('/api/user/wins', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                },
            });

            const data = await response.json();

            if (response.ok) {
                this.displayWins(data.wins || []);
            }
        } catch (error) {
            console.error('Load wins error:', error);
        }
    }

    /**
     * Display wins
     */
    displayWins(wins) {
        const list = document.querySelector('[data-list="my-wins"]');
        if (!list) return;

        list.innerHTML = '';

        if (wins.length === 0) {
            list.innerHTML = '<p class="text-muted">No winning bids yet</p>';
            return;
        }

        wins.forEach(win => {
            const item = document.createElement('li');
            item.className = 'win-item';
            item.innerHTML = `
                <div class="win-info">
                    <h4><a href="/auction-detail.html?id=${win.auctionId}">${this.escapeHtml(win.auctionTitle)}</a></h4>
                    <p class="win-amount">Winning bid: <strong>${UIComponents.formatCurrency(win.winningBid)}</strong></p>
                </div>
                <div class="win-status">${win.shipped ? '📦 Shipped' : '⏳ Processing'}</div>
            `;
            list.appendChild(item);
        });

        // Update badge
        const badge = document.querySelector('[data-badge="my-wins"]');
        if (badge) {
            badge.textContent = wins.length;
        }
    }

    /**
     * Save profile information
     */
    async saveProfile(e, form) {
        e.preventDefault();

        const errors = UIComponents.validateForm(form);
        if (!errors.isValid) {
            UIComponents.displayFormErrors(form, errors.errors);
            return;
        }

        UIComponents.clearFormErrors(form);

        const fullName = form.querySelector('input[name="full-name"]')?.value;
        const email = form.querySelector('input[name="email"]')?.value;
        const phone = form.querySelector('input[name="phone"]')?.value;

        try {
            const loader = UIComponents.showLoading('Saving profile...');

            const response = await fetch('/api/user/profile', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                },
                body: JSON.stringify({
                    fullName,
                    email,
                    phone,
                }),
            });

            UIComponents.hideLoading(loader);

            if (!response.ok) {
                const data = await response.json();
                UIComponents.showAlert(data.message || 'Failed to save profile', 'error');
                return;
            }

            UIComponents.createToast({
                message: 'Profile updated successfully',
                type: 'success',
            });
        } catch (error) {
            console.error('Save profile error:', error);
            UIComponents.createToast({
                message: 'Connection error',
                type: 'error',
            });
        }
    }

    /**
     * Save address
     */
    async saveAddress(e, form) {
        e.preventDefault();

        const errors = UIComponents.validateForm(form);
        if (!errors.isValid) {
            UIComponents.displayFormErrors(form, errors.errors);
            return;
        }

        UIComponents.clearFormErrors(form);

        const street = form.querySelector('input[name="street"]')?.value;
        const city = form.querySelector('input[name="city"]')?.value;
        const state = form.querySelector('input[name="state"]')?.value;
        const zip = form.querySelector('input[name="zip"]')?.value;

        try {
            const loader = UIComponents.showLoading('Saving address...');

            const response = await fetch('/api/user/address', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                },
                body: JSON.stringify({
                    street,
                    city,
                    state,
                    zip,
                }),
            });

            UIComponents.hideLoading(loader);

            if (!response.ok) {
                const data = await response.json();
                UIComponents.showAlert(data.message || 'Failed to save address', 'error');
                return;
            }

            UIComponents.createToast({
                message: 'Address saved successfully',
                type: 'success',
            });
        } catch (error) {
            console.error('Save address error:', error);
            UIComponents.createToast({
                message: 'Connection error',
                type: 'error',
            });
        }
    }

    /**
     * Change password
     */
    async changePassword(e, form) {
        e.preventDefault();

        const oldPassword = form.querySelector('input[name="old-password"]')?.value;
        const newPassword = form.querySelector('input[name="new-password"]')?.value;
        const confirmPassword = form.querySelector('input[name="confirm-password"]')?.value;

        const errors = {};

        if (!oldPassword) errors.oldpassword = 'Current password is required';
        if (!newPassword) errors.newpassword = 'New password is required';
        else {
            const strength = UIComponents.validatePassword(newPassword);
            if (strength.score < 2) errors.newpassword = 'Password too weak';
        }
        if (newPassword !== confirmPassword) errors.confirmpassword = 'Passwords do not match';

        if (Object.keys(errors).length > 0) {
            UIComponents.displayFormErrors(form, errors);
            return;
        }

        UIComponents.clearFormErrors(form);

        try {
            const loader = UIComponents.showLoading('Changing password...');

            const response = await fetch('/api/user/password', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                },
                body: JSON.stringify({
                    oldPassword,
                    newPassword,
                }),
            });

            UIComponents.hideLoading(loader);

            if (!response.ok) {
                const data = await response.json();
                UIComponents.showAlert(data.message || 'Failed to change password', 'error');
                return;
            }

            UIComponents.createToast({
                message: 'Password changed successfully',
                type: 'success',
            });

            form.reset();
        } catch (error) {
            console.error('Change password error:', error);
            UIComponents.createToast({
                message: 'Connection error',
                type: 'error',
            });
        }
    }

    /**
     * Load notification preferences
     */
    loadNotificationPreferences() {
        if (!this.user?.notifications) return;

        const prefs = this.user.notifications;

        const checkboxes = {
            'notification-bids': prefs.bids,
            'notification-auctions': prefs.auctions,
            'notification-messages': prefs.messages,
            'notification-winners': prefs.winners,
            'notification-updates': prefs.updates,
        };

        Object.entries(checkboxes).forEach(([name, value]) => {
            const checkbox = document.querySelector(`input[name="${name}"]`);
            if (checkbox) checkbox.checked = value;
        });
    }

    /**
     * Save notification preferences
     */
    async saveNotificationPreferences() {
        const prefs = {
            bids: document.querySelector('input[name="notification-bids"]')?.checked,
            auctions: document.querySelector('input[name="notification-auctions"]')?.checked,
            messages: document.querySelector('input[name="notification-messages"]')?.checked,
            winners: document.querySelector('input[name="notification-winners"]')?.checked,
            updates: document.querySelector('input[name="notification-updates"]')?.checked,
        };

        try {
            const response = await fetch('/api/user/notifications', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                },
                body: JSON.stringify(prefs),
            });

            if (!response.ok) {
                console.error('Failed to save notification preferences');
            }
        } catch (error) {
            console.error('Save notification preferences error:', error);
        }
    }

    /**
     * Load 2FA status
     */
    load2FAStatus() {
        const is2FAEnabled = this.user?.twoFactorEnabled;

        const enableBtn = document.querySelector('[data-enable-2fa]');
        const disableBtn = document.querySelector('[data-disable-2fa]');
        const statusText = document.querySelector('[data-2fa-status]');

        if (is2FAEnabled) {
            if (enableBtn) enableBtn.style.display = 'none';
            if (disableBtn) disableBtn.style.display = 'block';
            if (statusText) statusText.textContent = '✓ Enabled';
        } else {
            if (enableBtn) enableBtn.style.display = 'block';
            if (disableBtn) disableBtn.style.display = 'none';
            if (statusText) statusText.textContent = '✕ Disabled';
        }

        disableBtn?.addEventListener('click', () => this.disable2FA());
    }

    /**
     * Disable 2FA
     */
    async disable2FA() {
        const confirm = await UIComponents.showConfirmation(
            'Are you sure? You will need to re-enable 2FA on your next login.',
            'Disable 2FA'
        );

        if (!confirm) return;

        try {
            const loader = UIComponents.showLoading('Disabling 2FA...');

            const response = await fetch('/api/user/2fa', {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                },
            });

            UIComponents.hideLoading(loader);

            if (!response.ok) {
                UIComponents.showAlert('Failed to disable 2FA', 'error');
                return;
            }

            this.user.twoFactorEnabled = false;
            this.load2FAStatus();
            UIComponents.createToast({
                message: '2FA disabled successfully',
                type: 'success',
            });
        } catch (error) {
            console.error('Disable 2FA error:', error);
            UIComponents.createToast({
                message: 'Connection error',
                type: 'error',
            });
        }
    }

    /**
     * Confirm delete account
     */
    async confirmDeleteAccount() {
        const confirm = await UIComponents.showConfirmation(
            'Are you absolutely sure? This cannot be undone. All your bids and data will be permanently deleted.',
            'Delete Account'
        );

        if (!confirm) return;

        this.deleteAccount();
    }

    /**
     * Delete account
     */
    async deleteAccount() {
        try {
            const loader = UIComponents.showLoading('Deleting account...');

            const response = await fetch('/api/user', {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                },
            });

            UIComponents.hideLoading(loader);

            if (!response.ok) {
                UIComponents.showAlert('Failed to delete account', 'error');
                return;
            }

            localStorage.removeItem('authToken');
            UIComponents.createToast({
                message: 'Account deleted successfully',
                type: 'success',
            });

            setTimeout(() => window.location.href = '/index.html', 1500);
        } catch (error) {
            console.error('Delete account error:', error);
            UIComponents.createToast({
                message: 'Connection error',
                type: 'error',
            });
        }
    }

    /**
     * Logout
     */
    logout() {
        localStorage.removeItem('authToken');
        UIComponents.createToast({
            message: 'Logged out successfully',
            type: 'success',
        });

        setTimeout(() => window.location.href = '/index.html', 1000);
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
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Initialize navbar (shared across all pages)
    UIComponents.initializeNavbar();
    
    // Initialize user dashboard
    window.userDashboard = new UserDashboard();
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UserDashboard;
}
