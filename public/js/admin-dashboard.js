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
        const token = localStorage.getItem('auth_token');
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const userRole = user.role;

        if (!token || !['SITE_ADMIN', 'SCHOOL_ADMIN'].includes(userRole)) {
            window.location.href = '/user-dashboard.html';
        }
    }

    /**
     * Load dashboard data
     */
    async loadDashboardData() {
        const headers = { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` };
        try {
            const [statsRes, healthRes, activityRes] = await Promise.all([
                fetch('/api/admin/dashboard/stats', { headers }),
                fetch('/api/admin/dashboard/health', { headers }),
                fetch('/api/admin/audit-logs?limit=10', { headers }),
            ]);

            if (statsRes.ok) {
                const statsData = await statsRes.json();
                this.displayStatistics(statsData.stats);
            }
            if (healthRes.ok) {
                const healthData = await healthRes.json();
                this.displayHealthIndicators(healthData.health);
            }
            if (activityRes.ok) {
                const activityData = await activityRes.json();
                this.displayActivityLog(activityData.logs);
            }
        } catch (error) {
            console.error('Load dashboard error:', error);
        }
    }

    /**
     * Display statistics cards
     */
    displayStatistics(stats) {
        const el = (id) => document.getElementById(id);
        if (el('stat-active-auctions')) el('stat-active-auctions').textContent = stats.activeAuctions || 0;
        if (el('stat-total-bids')) el('stat-total-bids').textContent = stats.pendingApprovals || 0;
        if (el('stat-total-revenue')) el('stat-total-revenue').textContent = `$${(stats.dailyRevenue || 0).toFixed(2)}`;
        if (el('stat-active-users')) el('stat-active-users').textContent = stats.totalUsers || 0;
    }

    /**
     * Display activity log
     */
    displayActivityLog(activities) {
        const list = document.getElementById('recent-activity');
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
        const container = document.getElementById('system-health');
        if (!health || !container) return;

        const indicators = {
            'Database': health.database,
            'Server': health.serverStatus || 'healthy',
            'API': health.apiStatus || 'healthy',
        };

        container.innerHTML = Object.entries(indicators).map(([label, status]) => {
            const isHealthy = (status || '').toUpperCase() === 'HEALTHY' || status === 'healthy';
            return `<div class="health-indicator status-${isHealthy ? 'healthy' : 'unhealthy'}">
                ${isHealthy ? '✓' : '✕'} ${label}: ${status || 'unknown'}
            </div>`;
        }).join('');
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Create auction button
        const createBtn = document.getElementById('create-auction-btn');
        if (createBtn) {
            createBtn.addEventListener('click', () => this.showCreateAuctionModal());
        }

        // Add user button
        const createUserBtn = document.getElementById('create-user-btn');
        if (createUserBtn) {
            createUserBtn.addEventListener('click', () => this.showCreateUserModal());
        }

        // Admin dropdown toggle
        const adminUserBtn = document.getElementById('admin-user-btn');
        const adminDropdown = document.getElementById('admin-dropdown');
        if (adminUserBtn && adminDropdown) {
            adminUserBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = adminDropdown.style.display !== 'none';
                adminDropdown.style.display = isOpen ? 'none' : 'block';
                adminUserBtn.setAttribute('aria-expanded', !isOpen);
            });
            document.addEventListener('click', (e) => {
                if (!adminUserBtn.contains(e.target) && !adminDropdown.contains(e.target)) {
                    adminDropdown.style.display = 'none';
                    adminUserBtn.setAttribute('aria-expanded', 'false');
                }
            });
        }

        // Modal close buttons
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                const modal = btn.closest('.modal');
                if (modal) {
                    modal.style.display = 'none';
                    modal.setAttribute('aria-hidden', 'true');
                }
            });
        });

        // Close modals on backdrop click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                    modal.setAttribute('aria-hidden', 'true');
                }
            });
        });

        // Navbar tab links
        document.querySelectorAll('.nav-link[data-tab]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const tab = link.getAttribute('data-tab');
                const panelId = tab + '-tab';
                this.switchTab(panelId);
                // Update active nav link
                document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
                link.classList.add('active');
            });
        });

        // Search and filter listeners
        const auctionSearch = document.getElementById('auction-search');
        if (auctionSearch) {
            auctionSearch.addEventListener('input', UIComponents.debounce(() => {
                this.searchAuctions(auctionSearch.value);
            }, 500));
        }

        const userSearch = document.getElementById('user-search');
        if (userSearch) {
            userSearch.addEventListener('input', UIComponents.debounce(() => {
                this.searchUsers(userSearch.value);
            }, 500));
        }

        const paymentSearch = document.getElementById('payment-search');
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
                this.switchTab(btn.getAttribute('aria-controls'));
            });
        });
    }

    /**
     * Switch admin tab — uses aria-controls panel ID
     */
    switchTab(panelId) {
        // Update buttons
        document.querySelectorAll('[role="tab"]').forEach(btn => {
            btn.classList.remove('active');
            btn.setAttribute('aria-selected', 'false');
        });

        const activeBtn = document.querySelector(`[role="tab"][aria-controls="${panelId}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
            activeBtn.setAttribute('aria-selected', 'true');
        }

        // Update panels
        document.querySelectorAll('[role="tabpanel"]').forEach(panel => {
            panel.classList.remove('active');
            panel.style.display = 'none';
            panel.setAttribute('aria-hidden', 'true');
        });

        const activePanel = document.getElementById(panelId);
        if (activePanel) {
            activePanel.classList.add('active');
            activePanel.style.display = '';
            activePanel.setAttribute('aria-hidden', 'false');

            if (panelId === 'auctions-tab') this.loadAuctions();
            else if (panelId === 'users-tab') this.loadUsers();
            else if (panelId === 'payments-tab') this.loadPayments();
            else if (panelId === 'reports-tab') this.loadReports();
        }

        this.currentTab = panelId;
    }

    /**
     * Load auctions
     */
    async loadAuctions(status = 'LIVE') {
        try {
            const response = await fetch(`/api/admin/auctions?status=${encodeURIComponent(status)}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                },
            });

            if (!response.ok) {
                console.error('Load auctions failed:', response.status);
                return;
            }

            const data = await response.json();
            this.displayAuctionsTable(data.auctions || []);
        } catch (error) {
            console.error('Load auctions error:', error);
        }
    }

    /**
     * Display auctions table
     */
    displayAuctionsTable(auctions) {
        const tbody = document.getElementById('auctions-table-body');
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
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                },
            });

            if (!response.ok) {
                console.error('Load users failed:', response.status);
                return;
            }

            const data = await response.json();
            this.displayUsersTable(data.users || []);
        } catch (error) {
            console.error('Load users error:', error);
        }
    }

    /**
     * Display users table
     */
    displayUsersTable(users) {
        const tbody = document.getElementById('users-table-body');
        if (!tbody) return;

        tbody.innerHTML = '';

        users.forEach(user => {
            const row = document.createElement('tr');
            const isActive = user.is_active !== false && user.status !== 'inactive';
            row.innerHTML = `
                <td>${this.escapeHtml(user.first_name && user.last_name ? user.first_name + ' ' + user.last_name : user.fullName || user.full_name || '')}</td>
                <td>${this.escapeHtml(user.email || '')}</td>
                <td>${user.role || 'user'}</td>
                <td><span class="badge badge-${isActive ? 'success' : 'error'}">${isActive ? 'Active' : 'Inactive'}</span></td>
                <td>${user.totalBids || 0}</td>
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
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                },
            });

            if (!response.ok) {
                console.error('Load payments failed:', response.status);
                return;
            }

            const data = await response.json();
            this.displayPaymentsTable(data.payments || []);
        } catch (error) {
            console.error('Load payments error:', error);
        }
    }

    /**
     * Display payments table
     */
    displayPaymentsTable(payments) {
        const tbody = document.getElementById('payments-table-body');
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
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
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
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
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
            const response = await fetch(`/api/admin/users?search=${encodeURIComponent(query)}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                },
            });

            if (!response.ok) {
                console.error('Search users failed:', response.status);
                return;
            }

            const data = await response.json();
            this.displayUsersTable(data.users || []);
        } catch (error) {
            console.error('Search users error:', error);
        }
    }

    /**
     * Search payments
     */
    async searchPayments(query) {
        try {
            const response = await fetch(`/api/admin/payments?status=${encodeURIComponent(query)}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                },
            });

            if (!response.ok) {
                console.error('Search payments failed:', response.status);
                return;
            }

            const data = await response.json();
            this.displayPaymentsTable(data.payments || []);
        } catch (error) {
            console.error('Search payments error:', error);
        }
    }

    /**
     * Edit auction
     */
    editAuction(auctionId) {
        const titleEl = document.getElementById('auction-modal-title');
        if (titleEl) titleEl.textContent = 'Edit Auction';
        UIComponents.showModal('auction-form-modal');
        // Load auction data and populate form
        fetch(`/api/admin/auctions/${auctionId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` },
        })
            .then(r => r.json())
            .then(data => {
                const form = document.getElementById('auction-form');
                if (form && data.auction) {
                    const titleInput = form.querySelector('input[name="auction-title"]');
                    if (titleInput) titleInput.value = data.auction.title;
                }
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
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
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
        UIComponents.showModal('user-detail-modal');
        const content = document.getElementById('user-detail-content');
        if (content) content.innerHTML = '<p class="loading-message">Loading user details...</p>';
        // Load user data
        fetch(`/api/admin/users/${userId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` },
        })
            .then(r => r.json())
            .then(data => {
                if (content && data.user) {
                    content.innerHTML = `
                        <div class="form-group">
                            <label>Name</label>
                            <p>${this.escapeHtml(data.user.fullName || data.user.full_name || '')}</p>
                        </div>
                        <div class="form-group">
                            <label>Email</label>
                            <p>${this.escapeHtml(data.user.email || '')}</p>
                        </div>
                        <div class="form-group">
                            <label>Role</label>
                            <p>${this.escapeHtml(data.user.role || '')}</p>
                        </div>
                        <div class="form-group">
                            <label>Status</label>
                            <p>${data.user.is_active !== false ? 'Active' : 'Inactive'}</p>
                        </div>
                    `;
                }
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
            const response = await fetch(`/api/admin/users/${userId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                },
            });

            if (!response.ok) {
                UIComponents.showAlert('Failed to deactivate user', 'error');
                return;
            }

            UIComponents.createToast({
                message: 'User deactivated successfully',
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
    showCreateUserModal() {
        const titleEl = document.getElementById('user-modal-title');
        if (titleEl) titleEl.textContent = 'Add New User';
        const content = document.getElementById('user-detail-content');
        if (content) {
            content.innerHTML = `
                <form id="create-user-form" class="admin-form">
                    <div class="form-group">
                        <label for="new-user-firstname">First Name</label>
                        <input type="text" id="new-user-firstname" class="form-control" required placeholder="Enter first name">
                    </div>
                    <div class="form-group">
                        <label for="new-user-lastname">Last Name</label>
                        <input type="text" id="new-user-lastname" class="form-control" required placeholder="Enter last name">
                    </div>
                    <div class="form-group">
                        <label for="new-user-email">Email</label>
                        <input type="email" id="new-user-email" class="form-control" required placeholder="Enter email address">
                    </div>
                    <div class="form-group">
                        <label for="new-user-role">Role</label>
                        <select id="new-user-role" class="form-control" required>
                            <option value="">Select role...</option>
                            <option value="STUDENT">Student</option>
                            <option value="TEACHER">Teacher</option>
                            <option value="SCHOOL_ADMIN">School Admin</option>
                            <option value="SITE_ADMIN">Site Admin</option>
                            <option value="BIDDER">Bidder</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="new-user-password">Password</label>
                        <input type="password" id="new-user-password" class="form-control" required placeholder="12+ chars, upper, lower, number, special">
                    </div>
                    <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1rem;">
                        <button type="button" class="btn btn-secondary" onclick="UIComponents.hideModal('user-detail-modal')">Cancel</button>
                        <button type="submit" class="btn btn-primary">Create User</button>
                    </div>
                </form>
            `;
            const form = document.getElementById('create-user-form');
            if (form) {
                form.addEventListener('submit', (e) => this.handleCreateUser(e));
            }
        }
        UIComponents.showModal('user-detail-modal');
    }

    async handleCreateUser(e) {
        e.preventDefault();
        const firstName = document.getElementById('new-user-firstname').value.trim();
        const lastName = document.getElementById('new-user-lastname').value.trim();
        const email = document.getElementById('new-user-email').value.trim();
        const selectedRole = document.getElementById('new-user-role').value;
        const password = document.getElementById('new-user-password').value;

        if (!firstName || !lastName || !email || !selectedRole || !password) {
            UIComponents.showAlert('Please fill in all fields', 'error');
            return;
        }

        // Register endpoint only supports 'student' and 'teacher' accountType.
        // For other roles, register as teacher first then promote via admin API.
        const registerAccountType = (selectedRole === 'STUDENT' || selectedRole === 'BIDDER') ? 'student' : 'teacher';
        const needsPromotion = !['STUDENT', 'TEACHER'].includes(selectedRole);

        try {
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
            };

            // Step 1: Register the user
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    firstName,
                    lastName,
                    email,
                    password,
                    accountType: registerAccountType,
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                UIComponents.showAlert(data.message || 'Failed to create user', 'error');
                return;
            }

            const userData = await response.json();

            // Step 2: If role is not STUDENT or TEACHER, promote via admin endpoint
            if (needsPromotion && userData.user && userData.user.id) {
                const roleRes = await fetch(`/api/admin/users/${userData.user.id}/role`, {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify({ newRole: selectedRole }),
                });

                if (!roleRes.ok) {
                    UIComponents.createToast({ message: `User created but role promotion to ${selectedRole} failed. Update role manually.`, type: 'warning' });
                }
            }

            UIComponents.hideModal('user-detail-modal');
            UIComponents.createToast({ message: 'User created successfully', type: 'success' });
            this.loadUsers();
        } catch (error) {
            console.error('Create user error:', error);
            UIComponents.showAlert('Failed to create user', 'error');
        }
    }

    showCreateAuctionModal() {
        const titleEl = document.getElementById('auction-modal-title');
        if (titleEl) titleEl.textContent = 'Create New Auction';
        const form = document.getElementById('auction-form');
        if (form) form.reset();
        UIComponents.showModal('auction-form-modal');
    }

    /**
     * Export report
     */
    async exportReport(reportType) {
        try {
            const response = await fetch(`/api/admin/reports/${reportType}/export`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
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
