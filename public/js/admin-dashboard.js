/**
 * Admin Dashboard Module
 * Handles admin controls for auctions, users, payments, and reporting
 */

class AdminDashboard {
    constructor() {
        this.currentTab = 'overview';
        this.init();
    }

    /**
     * Initialize admin dashboard
     */
    async init() {
        this.checkAdminAccess();
        this.attachEventListeners();
        this.setupTabs();
        this.loadDashboardData();
    }

    /**
     * Check if user has admin access
     */
    checkAdminAccess() {
        const token = localStorage.getItem('authToken');
        const userRole = localStorage.getItem('userRole');

        if (!token || userRole !== 'admin') {
            window.location.href = '/user-dashboard.html';
        }
    }

    /**
     * Load dashboard data
     */
    async loadDashboardData() {
        try {
            const response = await fetch('/api/admin/dashboard', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                },
            });

            const data = await response.json();

            if (!response.ok) {
                UIComponents.showAlert(data.message || 'Failed to load dashboard', 'error');
                return;
            }

            this.displayStatistics(data.statistics);
            this.displayActivityLog(data.recentActivity);
            this.displayHealthIndicators(data.health);
        } catch (error) {
            console.error('Load dashboard error:', error);
        }
    }

    /**
     * Display statistics cards
     */
    displayStatistics(stats) {
        const container = document.querySelector('.admin-stats-grid');
        if (!container) return;

        const cards = [
            { label: 'Active Auctions', value: stats.activeAuctions || 0, icon: '🔴' },
            { label: 'Total Bids', value: stats.totalBids || 0, icon: '🏆' },
            { label: 'Revenue', value: `$${(stats.revenue || 0).toFixed(2)}`, icon: '💰' },
            { label: 'Active Users', value: stats.activeUsers || 0, icon: '👥' },
        ];

        cards.forEach(card => {
            const statCard = container.querySelector(`[data-stat="${card.label.toLowerCase().replace(' ', '-')}"]`);
            if (statCard) {
                statCard.setAttribute('aria-live', 'polite');
                statCard.innerHTML = `
                    <div class="stat-icon">${card.icon}</div>
                    <div class="stat-content">
                        <h3>${card.label}</h3>
                        <p class="stat-value">${card.value}</p>
                    </div>
                `;
            }
        });
    }

    /**
     * Display activity log
     */
    displayActivityLog(activities) {
        const list = document.querySelector('[data-list="activity-log"]');
        if (!list || !activities) return;

        list.innerHTML = '';

        if (activities.length === 0) {
            list.innerHTML = '<p class="text-muted">No recent activity</p>';
            return;
        }

        activities.forEach(activity => {
            const item = document.createElement('li');
            item.className = 'activity-item';
            item.innerHTML = `
                <div class="activity-icon">${this.getActivityIcon(activity.type)}</div>
                <div class="activity-content">
                    <p class="activity-description">${this.escapeHtml(activity.description)}</p>
                    <p class="activity-time">${UIComponents.formatDateTime(activity.timestamp)}</p>
                </div>
            `;
            list.appendChild(item);
        });
    }

    /**
     * Display health indicators
     */
    displayHealthIndicators(health) {
        if (!health) return;

        const indicators = {
            'server-status': health.serverStatus,
            'database-status': health.databaseStatus,
            'api-status': health.apiStatus,
            'payment-status': health.paymentStatus,
        };

        Object.entries(indicators).forEach(([key, status]) => {
            const indicator = document.querySelector(`[data-health="${key}"]`);
            if (indicator) {
                const isHealthy = status === 'healthy';
                indicator.className = `health-indicator status-${isHealthy ? 'healthy' : 'unhealthy'}`;
                indicator.textContent = `${isHealthy ? '✓' : '✕'} ${status}`;
            }
        });
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Create auction button
        const createBtn = document.querySelector('[data-create-auction]');
        if (createBtn) {
            createBtn.addEventListener('click', () => this.showCreateAuctionModal());
        }

        // Search and filter listeners
        const auctionSearch = document.querySelector('input[name="auction-search"]');
        if (auctionSearch) {
            auctionSearch.addEventListener('input', UIComponents.debounce(() => {
                this.searchAuctions(auctionSearch.value);
            }, 500));
        }

        const userSearch = document.querySelector('input[name="user-search"]');
        if (userSearch) {
            userSearch.addEventListener('input', UIComponents.debounce(() => {
                this.searchUsers(userSearch.value);
            }, 500));
        }

        const paymentSearch = document.querySelector('input[name="payment-search"]');
        if (paymentSearch) {
            paymentSearch.addEventListener('input', UIComponents.debounce(() => {
                this.searchPayments(paymentSearch.value);
            }, 500));
        }
    }

    /**
     * Setup tab navigation
     */
    setupTabs() {
        const tabButtons = document.querySelectorAll('[role="tab"]');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;
                this.switchTab(tabName);
            });
        });
    }

    /**
     * Switch admin tab
     */
    switchTab(tabName) {
        // Update buttons
        const tabButtons = document.querySelectorAll('[role="tab"]');
        tabButtons.forEach(btn => {
            btn.classList.remove('active');
            btn.setAttribute('aria-selected', 'false');
        });

        const activeBtn = document.querySelector(`[role="tab"][data-tab="${tabName}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
            activeBtn.setAttribute('aria-selected', 'true');
        }

        // Update panels
        const tabPanels = document.querySelectorAll('[role="tabpanel"]');
        tabPanels.forEach(panel => {
            panel.classList.remove('active');
            panel.setAttribute('aria-hidden', 'true');
        });

        const activePanel = document.querySelector(`[role="tabpanel"][data-tab="${tabName}"]`);
        if (activePanel) {
            activePanel.classList.add('active');
            activePanel.setAttribute('aria-hidden', 'false');

            // Load data for this tab
            if (tabName === 'auctions') {
                this.loadAuctions();
            } else if (tabName === 'users') {
                this.loadUsers();
            } else if (tabName === 'payments') {
                this.loadPayments();
            } else if (tabName === 'reports') {
                this.loadReports();
            }
        }

        this.currentTab = tabName;
    }

    /**
     * Load auctions
     */
    async loadAuctions() {
        try {
            const response = await fetch('/api/admin/auctions', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                },
            });

            const data = await response.json();

            if (response.ok) {
                this.displayAuctionsTable(data.auctions);
            }
        } catch (error) {
            console.error('Load auctions error:', error);
        }
    }

    /**
     * Display auctions table
     */
    displayAuctionsTable(auctions) {
        const tbody = document.querySelector('table[data-table="auctions"] tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        auctions.forEach(auction => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${this.escapeHtml(auction.title)}</td>
                <td>${auction.status}</td>
                <td>${auction.bidCount}</td>
                <td>${UIComponents.formatCurrency(auction.currentBid)}</td>
                <td>${UIComponents.formatDate(auction.createdAt)}</td>
                <td>
                    <button class="btn btn-sm btn-primary" data-edit-auction="${auction.id}">Edit</button>
                    <button class="btn btn-sm btn-danger" data-delete-auction="${auction.id}">Delete</button>
                </td>
            `;
            tbody.appendChild(row);

            // Attach action listeners
            row.querySelector(`[data-edit-auction]`)?.addEventListener('click', () => {
                this.editAuction(auction.id);
            });

            row.querySelector(`[data-delete-auction]`)?.addEventListener('click', () => {
                this.deleteAuction(auction.id);
            });
        });
    }

    /**
     * Load users
     */
    async loadUsers() {
        try {
            const response = await fetch('/api/admin/users', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                },
            });

            const data = await response.json();

            if (response.ok) {
                this.displayUsersTable(data.users);
            }
        } catch (error) {
            console.error('Load users error:', error);
        }
    }

    /**
     * Display users table
     */
    displayUsersTable(users) {
        const tbody = document.querySelector('table[data-table="users"] tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        users.forEach(user => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${this.escapeHtml(user.fullName)}</td>
                <td>${this.escapeHtml(user.email)}</td>
                <td>${user.role || 'user'}</td>
                <td>${user.totalBids}</td>
                <td>${UIComponents.formatDate(user.createdAt)}</td>
                <td>
                    <button class="btn btn-sm btn-primary" data-edit-user="${user.id}">Edit</button>
                    <button class="btn btn-sm btn-danger" data-ban-user="${user.id}">Ban</button>
                </td>
            `;
            tbody.appendChild(row);

            row.querySelector(`[data-edit-user]`)?.addEventListener('click', () => {
                this.editUser(user.id);
            });

            row.querySelector(`[data-ban-user]`)?.addEventListener('click', () => {
                this.banUser(user.id);
            });
        });
    }

    /**
     * Load payments
     */
    async loadPayments() {
        try {
            const response = await fetch('/api/admin/payments', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                },
            });

            const data = await response.json();

            if (response.ok) {
                this.displayPaymentsTable(data.payments);
            }
        } catch (error) {
            console.error('Load payments error:', error);
        }
    }

    /**
     * Display payments table
     */
    displayPaymentsTable(payments) {
        const tbody = document.querySelector('table[data-table="payments"] tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        payments.forEach(payment => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${this.escapeHtml(payment.id)}</td>
                <td>${this.escapeHtml(payment.userName)}</td>
                <td>${UIComponents.formatCurrency(payment.amount)}</td>
                <td><span class="badge badge-${payment.status}">${payment.status}</span></td>
                <td>${UIComponents.formatDateTime(payment.createdAt)}</td>
                <td>
                    <button class="btn btn-sm btn-primary" data-view-payment="${payment.id}">View</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    /**
     * Load reports
     */
    async loadReports() {
        try {
            const response = await fetch('/api/admin/reports', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                },
            });

            const data = await response.json();

            if (response.ok) {
                this.displayReports(data.reports);
            }
        } catch (error) {
            console.error('Load reports error:', error);
        }
    }

    /**
     * Display reports
     */
    displayReports(reports) {
        const container = document.querySelector('[data-list="reports"]');
        if (!container || !reports) return;

        container.innerHTML = '';

        Object.entries(reports).forEach(([key, report]) => {
            const card = document.createElement('div');
            card.className = 'report-card';
            card.innerHTML = `
                <h3>${report.title}</h3>
                <p>${report.description}</p>
                <div class="report-stats">
                    <span>${report.value}</span>
                </div>
                <button class="btn btn-secondary" data-export-report="${key}">Export</button>
            `;
            container.appendChild(card);

            card.querySelector('[data-export-report]')?.addEventListener('click', () => {
                this.exportReport(key);
            });
        });
    }

    /**
     * Search auctions
     */
    async searchAuctions(query) {
        try {
            const response = await fetch(`/api/admin/auctions/search?q=${encodeURIComponent(query)}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                },
            });

            const data = await response.json();

            if (response.ok) {
                this.displayAuctionsTable(data.auctions);
            }
        } catch (error) {
            console.error('Search auctions error:', error);
        }
    }

    /**
     * Search users
     */
    async searchUsers(query) {
        try {
            const response = await fetch(`/api/admin/users/search?q=${encodeURIComponent(query)}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                },
            });

            const data = await response.json();

            if (response.ok) {
                this.displayUsersTable(data.users);
            }
        } catch (error) {
            console.error('Search users error:', error);
        }
    }

    /**
     * Search payments
     */
    async searchPayments(query) {
        try {
            const response = await fetch(`/api/admin/payments/search?q=${encodeURIComponent(query)}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                },
            });

            const data = await response.json();

            if (response.ok) {
                this.displayPaymentsTable(data.payments);
            }
        } catch (error) {
            console.error('Search payments error:', error);
        }
    }

    /**
     * Edit auction
     */
    editAuction(auctionId) {
        UIComponents.showModal('auction-edit-modal');
        // Load auction data and populate form
        fetch(`/api/admin/auctions/${auctionId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
        })
            .then(r => r.json())
            .then(data => {
                // Populate modal form
                document.querySelector('input[name="auction-title"]').value = data.auction.title;
                // ... populate other fields
            });
    }

    /**
     * Delete auction
     */
    async deleteAuction(auctionId) {
        const confirm = await UIComponents.showConfirmation(
            'Are you sure you want to delete this auction? This action cannot be undone.',
            'Delete Auction'
        );

        if (!confirm) return;

        try {
            const response = await fetch(`/api/admin/auctions/${auctionId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                },
            });

            if (!response.ok) {
                UIComponents.showAlert('Failed to delete auction', 'error');
                return;
            }

            UIComponents.createToast({
                message: 'Auction deleted successfully',
                type: 'success',
            });

            this.loadAuctions();
        } catch (error) {
            console.error('Delete auction error:', error);
        }
    }

    /**
     * Edit user
     */
    editUser(userId) {
        UIComponents.showModal('user-edit-modal');
        // Load user data
        fetch(`/api/admin/users/${userId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
        })
            .then(r => r.json())
            .then(data => {
                // Populate modal form
                document.querySelector('input[name="user-email"]').value = data.user.email;
            });
    }

    /**
     * Ban user
     */
    async banUser(userId) {
        const confirm = await UIComponents.showConfirmation(
            'Ban this user from the platform?',
            'Ban User'
        );

        if (!confirm) return;

        try {
            const response = await fetch(`/api/admin/users/${userId}/ban`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                },
            });

            if (!response.ok) {
                UIComponents.showAlert('Failed to ban user', 'error');
                return;
            }

            UIComponents.createToast({
                message: 'User banned successfully',
                type: 'success',
            });

            this.loadUsers();
        } catch (error) {
            console.error('Ban user error:', error);
        }
    }

    /**
     * Show create auction modal
     */
    showCreateAuctionModal() {
        UIComponents.showModal('auction-create-modal');
    }

    /**
     * Export report
     */
    async exportReport(reportType) {
        try {
            const response = await fetch(`/api/admin/reports/${reportType}/export`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                },
            });

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `report-${reportType}-${Date.now()}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();

            UIComponents.createToast({
                message: 'Report exported successfully',
                type: 'success',
            });
        } catch (error) {
            console.error('Export report error:', error);
            UIComponents.createToast({
                message: 'Failed to export report',
                type: 'error',
            });
        }
    }

    /**
     * Get activity icon
     */
    getActivityIcon(type) {
        const icons = {
            'auction_created': '✨',
            'auction_ended': '⛔',
            'bid_placed': '🏆',
            'payment_received': '💰',
            'user_registered': '👤',
            'user_banned': '🚫',
        };
        return icons[type] || '📋';
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
    // Require admin authentication - redirect to home if not logged in as admin
    UIComponents.requireAdminAuth('/');
    
    // Initialize navbar (shared across all pages)
    UIComponents.initializeNavbar();
    
    // Initialize admin dashboard
    window.adminDashboard = new AdminDashboard();
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AdminDashboard;
}
