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
            window.location.href = userRole === 'TEACHER'
                ? '/teacher-dashboard.html'
                : '/user-dashboard.html';
        }
    }

    /**
     * Load dashboard data
     */
    async loadDashboardData() {
        const headers = { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` };
        this.load2FAStatus();
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

        // Auction status filter
        const auctionFilter = document.getElementById('auction-status-filter');
        if (auctionFilter) {
            auctionFilter.addEventListener('change', () => this.loadAuctions(auctionFilter.value));
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

        // Payment gateway section
        this.initGatewaySection();
    }

    /**
     * Initialise the payment gateway section in the Payments tab.
     * SCHOOL_ADMIN sees their own school pre-selected; SITE_ADMIN gets a search picker.
     */
    initGatewaySection() {
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        const isSiteAdmin = currentUser.role === 'SITE_ADMIN';
        const schoolSearch = document.getElementById('gateway-school-search');
        const schoolSelect = document.getElementById('gateway-school-select');

        if (!schoolSearch || !schoolSelect) return;

        if (!isSiteAdmin) {
            // SCHOOL_ADMIN: hide the picker and use their school directly
            schoolSearch.style.display = 'none';
            schoolSelect.style.display = 'none';
            const schoolId   = currentUser.school_id   || currentUser.schoolId   || '';
            const schoolName = currentUser.school_name || currentUser.schoolName || 'Your school';
            if (schoolId) {
                const opt = document.createElement('option');
                opt.value = schoolId;
                opt.textContent = schoolName;
                opt.selected = true;
                schoolSelect.appendChild(opt);
            }
            // Show a static label instead
            const label = document.createElement('p');
            label.className = 'form-static';
            label.textContent = schoolName;
            schoolSearch.parentNode.insertBefore(label, schoolSearch);
        } else {
            // SITE_ADMIN: wire up live school search
            let searchTimeout;
            schoolSearch.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                const q = schoolSearch.value.trim();
                if (q.length < 2) {
                    schoolSelect.innerHTML = '<option value="">— Select a school —</option>';
                    return;
                }
                searchTimeout = setTimeout(async () => {
                    try {
                        const res = await fetch(`/api/schools?search=${encodeURIComponent(q)}`, {
                            headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` },
                        });
                        const data = await res.json();
                        const schools = data.data || [];
                        schoolSelect.innerHTML = '<option value="">— Select a school —</option>' +
                            schools.map(s =>
                                `<option value="${this.escapeHtml(String(s.id))}">${this.escapeHtml(s.name)}</option>`
                            ).join('');
                    } catch (err) {
                        console.error('School search error:', err);
                    }
                }, 300);
            });
        }

        const setupBtn = document.getElementById('setup-test-gateway-btn');
        if (setupBtn) setupBtn.addEventListener('click', () => this.setupTestGateway());

        const checkBtn = document.getElementById('check-gateway-btn');
        if (checkBtn) checkBtn.addEventListener('click', () => this.checkGatewayStatus());
    }

    /**
     * Set up a dummy test payment gateway for the selected school.
     */
    async setupTestGateway() {
        const schoolId = document.getElementById('gateway-school-select')?.value;
        const statusEl = document.getElementById('gateway-status');
        if (!schoolId) {
            if (statusEl) statusEl.innerHTML = '<p style="color:var(--color-error)">Please select a school first.</p>';
            return;
        }
        try {
            const res = await fetch(`/api/admin/schools/${encodeURIComponent(schoolId)}/test-gateway`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                },
            });
            const data = await res.json();
            if (statusEl) {
                const color = data.success ? 'var(--color-success, green)' : 'var(--color-error, red)';
                statusEl.innerHTML = `<p style="color:${color}">${this.escapeHtml(data.message)}</p>`;
            }
            if (data.success) {
                UIComponents.createToast({ message: data.message, type: data.alreadyExisted ? 'info' : 'success' });
            }
        } catch (err) {
            if (statusEl) statusEl.innerHTML = '<p style="color:var(--color-error)">Request failed. Please try again.</p>';
        }
    }

    /**
     * Check whether the selected school already has a payment gateway configured.
     */
    async checkGatewayStatus() {
        const schoolId = document.getElementById('gateway-school-select')?.value;
        const statusEl = document.getElementById('gateway-status');
        if (!schoolId) {
            if (statusEl) statusEl.innerHTML = '<p style="color:var(--color-error)">Please select a school first.</p>';
            return;
        }
        try {
            const res = await fetch(`/api/admin/schools/${encodeURIComponent(schoolId)}/gateways`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` },
            });
            const data = await res.json();
            if (!statusEl) return;
            if (!data.success) {
                statusEl.innerHTML = `<p style="color:var(--color-error)">${this.escapeHtml(data.message)}</p>`;
                return;
            }
            if (data.gateways.length === 0) {
                statusEl.innerHTML = '<p style="color:var(--color-warning, orange)">⚠ No payment gateway configured. Click "Setup Test Gateway" to add one.</p>';
            } else {
                const names = data.gateways.map(g =>
                    `<strong>${this.escapeHtml(g.gateway_name || g.gateway_type)}</strong>${g.is_primary ? ' (primary)' : ''}`
                ).join(', ');
                statusEl.innerHTML = `<p style="color:var(--color-success, green)">✓ Gateway configured: ${names}</p>`;
            }
        } catch (err) {
            if (statusEl) statusEl.innerHTML = '<p style="color:var(--color-error)">Request failed. Please try again.</p>';
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
    async loadAuctions(status = '') {
        const tbody = document.getElementById('auctions-table-body');
        try {
            const url = status
                ? `/api/admin/auctions?status=${encodeURIComponent(status)}`
                : '/api/admin/auctions';
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                },
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('Load auctions failed:', response.status, data);
                if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="loading-message" style="color:var(--color-error,red)">Failed to load auctions (${response.status}: ${data.message || data.error || 'unknown error'})</td></tr>`;
                return;
            }

            this.displayAuctionsTable(data.auctions || []);
        } catch (error) {
            console.error('Load auctions error:', error);
            if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="loading-message" style="color:var(--color-error,red)">Error loading auctions: ${this.escapeHtml(error.message)}</td></tr>`;
        }
    }

    /**
     * Display auctions table
     */
    displayAuctionsTable(auctions) {
        const tbody = document.getElementById('auctions-table-body');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (auctions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8">No auctions found.</td></tr>';
            return;
        }

        auctions.forEach(auction => {
            const row = document.createElement('tr');
            const status = auction.auction_status || auction.status || '';
            const endsAt = auction.ends_at ? new Date(auction.ends_at).toLocaleDateString() : '';
            const statusClass = {
                'LIVE': 'success', 'APPROVED': 'success', 'DRAFT': 'warning',
                'PENDING_APPROVAL': 'warning', 'ENDED': 'error', 'CANCELLED': 'error'
            }[status] || 'default';

            const canApprove = ['DRAFT', 'PENDING_APPROVAL'].includes(status);
            const canReject  = ['DRAFT', 'PENDING_APPROVAL'].includes(status);
            const canCancel  = ['APPROVED', 'LIVE'].includes(status);
            const canDelete  = ['DRAFT', 'CANCELLED', 'ENDED'].includes(status);

            const schoolName  = this.escapeHtml(auction.school_name  || auction.school_id || '—');
            const gatewayName = this.escapeHtml(auction.gateway_name || auction.gateway_type || '—');

            row.innerHTML = `
                <td>${this.escapeHtml(auction.title || '')}</td>
                <td>${schoolName}</td>
                <td>${gatewayName}</td>
                <td><span class="badge badge-${statusClass}">${status}</span></td>
                <td>-</td>
                <td>-</td>
                <td>${endsAt}</td>
                <td style="white-space:nowrap;">
                    ${canApprove ? `<button class="btn btn-sm btn-success" data-approve-auction="${auction.id}">Approve</button>` : ''}
                    ${canReject  ? `<button class="btn btn-sm btn-warning" data-reject-auction="${auction.id}">Reject</button>`   : ''}
                    ${canCancel  ? `<button class="btn btn-sm btn-warning" data-cancel-auction="${auction.id}">Cancel</button>`   : ''}
                    <button class="btn btn-sm btn-primary" data-edit-auction="${auction.id}">Edit</button>
                    ${canDelete  ? `<button class="btn btn-sm btn-danger"  data-delete-auction="${auction.id}">Delete</button>`   : ''}
                </td>
            `;
            tbody.appendChild(row);

            row.querySelector(`[data-approve-auction]`)?.addEventListener('click', () => {
                this.approveAuction(auction.id);
            });

            row.querySelector(`[data-reject-auction]`)?.addEventListener('click', () => {
                this.rejectAuction(auction.id);
            });

            row.querySelector(`[data-cancel-auction]`)?.addEventListener('click', () => {
                this.cancelAuction(auction.id);
            });

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
        const tbody = document.getElementById('users-table-body');
        try {
            const response = await fetch('/api/admin/users', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                },
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('Load users failed:', response.status, data);
                if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="loading-message" style="color:var(--color-error,red)">Failed to load users (${response.status}: ${data.message || data.error || 'unknown error'})</td></tr>`;
                return;
            }

            this.displayUsersTable(data.users || []);
        } catch (error) {
            console.error('Load users error:', error);
            if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="loading-message" style="color:var(--color-error,red)">Error loading users: ${this.escapeHtml(error.message)}</td></tr>`;
        }
    }

    /**
     * Display users table
     */
    displayUsersTable(users) {
        const tbody = document.getElementById('users-table-body');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="loading-message">No users found.</td></tr>';
            return;
        }

        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

        users.forEach(user => {
            const row = document.createElement('tr');
            const accountStatus = user.account_status || 'ACTIVE';
            const statusClass = { ACTIVE: 'success', SUSPENDED: 'warning', INACTIVE: 'error', LOCKED: 'error' }[accountStatus] || 'default';
            const mfaEnabled = user.two_fa_enabled || false;
            const name = this.escapeHtml(
                user.first_name && user.last_name
                    ? `${user.first_name} ${user.last_name}`
                    : user.fullName || user.full_name || ''
            );

            row.innerHTML = `
                <td>
                    <div>${name}</div>
                    <div class="text-muted text-sm">${this.escapeHtml(user.email || '')}</div>
                </td>
                <td class="col-hide-sm">${this.escapeHtml(user.role || '')}</td>
                <td><span class="badge badge-${statusClass}">${accountStatus}</span></td>
                <td class="col-hide-sm">
                    <span class="badge badge-${mfaEnabled ? 'success' : 'default'}">${mfaEnabled ? 'On' : 'Off'}</span>
                </td>
                <td class="col-hide-md">${this.escapeHtml(user.phone_number || '—')}</td>
                <td class="col-hide-md">${this.escapeHtml(user.school_name || '—')}</td>
                <td class="col-hide-md">${user.total_bids || 0}</td>
                <td style="white-space:nowrap;">
                    <button class="btn btn-sm btn-primary" data-edit-user="${user.id}">Edit</button>
                    <button class="btn btn-sm btn-warning" data-reset-pw-user="${user.id}" title="Generate password reset link">Reset PW</button>
                    <button class="btn btn-sm btn-danger" data-ban-user="${user.id}" title="Suspend account">Suspend</button>
                    ${currentUser && currentUser.role === 'SITE_ADMIN' ? `<button class="btn btn-sm btn-danger" data-delete-user="${user.id}" title="Permanently delete account">Delete</button>` : ''}
                </td>
            `;
            tbody.appendChild(row);

            row.querySelector(`[data-edit-user]`)?.addEventListener('click', () => {
                this.editUser(user.id);
            });

            row.querySelector(`[data-reset-pw-user]`)?.addEventListener('click', () => {
                this.resetUserPassword(user.id);
            });

            row.querySelector(`[data-ban-user]`)?.addEventListener('click', () => {
                this.banUser(user.id);
            });

            row.querySelector(`[data-delete-user]`)?.addEventListener('click', () => {
                this.deleteUser(user.id);
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
    async editAuction(auctionId) {
        const titleEl = document.getElementById('auction-modal-title');
        if (titleEl) titleEl.textContent = 'Edit Auction';

        const form = document.getElementById('auction-form');
        if (form) form.innerHTML = '<p class="loading-message">Loading auction data…</p>';
        UIComponents.showModal('auction-form-modal');

        try {
            const res  = await fetch(`/api/admin/auctions/${auctionId}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` },
            });
            const data = await res.json();
            const a    = data.auction;
            if (!a || !form) return;

            // Convert DB timestamps to datetime-local value (YYYY-MM-DDTHH:MM)
            const toLocal = (iso) => iso ? iso.slice(0, 16) : '';

            const isDraft = a.auction_status === 'DRAFT';
            const readonlyAttr = isDraft ? '' : 'readonly';
            const readonlyNote = isDraft ? '' : '<p class="form-help" style="color:var(--color-warning,orange);">Only DRAFT auctions can have their dates/details changed.</p>';

            form.innerHTML = `
                ${readonlyNote}
                <div class="form-group">
                    <label for="auction-title">Title <span aria-label="required">*</span></label>
                    <input type="text" id="auction-title" name="auction-title" class="form-control"
                           value="${this.escapeHtml(a.title || '')}" required ${readonlyAttr}>
                </div>
                <div class="form-group">
                    <label for="auction-description">Description</label>
                    <textarea id="auction-description" name="auction-description" class="form-control" rows="3"
                              ${readonlyAttr}>${this.escapeHtml(a.description || '')}</textarea>
                </div>
                <div class="form-group">
                    <label>School</label>
                    <p class="form-static">${this.escapeHtml(a.school_name || a.school_id || '—')}</p>
                </div>
                <div class="form-group">
                    <label for="auction-start">Start Date &amp; Time <span aria-label="required">*</span></label>
                    <input type="datetime-local" id="auction-start" name="auction-start" class="form-control"
                           value="${toLocal(a.starts_at)}" required ${readonlyAttr}>
                </div>
                <div class="form-group">
                    <label for="auction-end">End Date &amp; Time <span aria-label="required">*</span></label>
                    <input type="datetime-local" id="auction-end" name="auction-end" class="form-control"
                           value="${toLocal(a.ends_at)}" required ${readonlyAttr}>
                </div>
                <div style="display:flex; gap:1rem; justify-content:flex-end; margin-top:1rem;">
                    <button type="button" class="btn btn-secondary" onclick="UIComponents.hideModal('auction-form-modal')">Cancel</button>
                    ${isDraft ? `<button type="submit" class="btn btn-primary">Save Changes</button>` : ''}
                </div>
            `;

            if (isDraft) {
                form.onsubmit = (e) => this.handleUpdateAuction(e, auctionId);
            }
        } catch (err) {
            console.error('Edit auction load error:', err);
            if (form) form.innerHTML = '<p style="color:var(--color-error,red)">Failed to load auction data.</p>';
        }
    }

    async handleUpdateAuction(e, auctionId) {
        e.preventDefault();
        const title       = document.getElementById('auction-title')?.value.trim();
        const description = document.getElementById('auction-description')?.value.trim();
        const startTime   = document.getElementById('auction-start')?.value;
        const endTime     = document.getElementById('auction-end')?.value;

        if (!title || !startTime || !endTime) {
            UIComponents.showAlert('Please fill in all required fields', 'error');
            return;
        }
        if (new Date(endTime) <= new Date(startTime)) {
            UIComponents.showAlert('End time must be after start time', 'error');
            return;
        }

        try {
            const response = await fetch(`/api/auctions/${auctionId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                },
                body: JSON.stringify({ title, description: description || undefined, startTime, endTime }),
            });
            const data = await response.json();
            if (!response.ok) {
                UIComponents.showAlert(data.message || 'Failed to update auction', 'error');
                return;
            }
            UIComponents.hideModal('auction-form-modal');
            UIComponents.createToast({ message: 'Auction updated', type: 'success' });
            this.loadAuctions();
        } catch (err) {
            console.error('Update auction error:', err);
            UIComponents.showAlert('An error occurred. Please try again.', 'error');
        }
    }

    /**
     * Approve a PENDING_APPROVAL auction
     */
    async approveAuction(auctionId) {
        try {
            const response = await fetch(`/api/admin/auctions/${auctionId}/approve`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` },
            });
            const data = await response.json();
            if (!response.ok) {
                UIComponents.showAlert(data.message || 'Failed to approve auction', 'error');
                return;
            }
            UIComponents.createToast({ message: 'Auction approved', type: 'success' });
            this.loadAuctions();
        } catch (error) {
            console.error('Approve auction error:', error);
        }
    }

    /**
     * Reject a PENDING_APPROVAL auction
     */
    async rejectAuction(auctionId) {
        const reason = prompt('Reason for rejection (required):');
        if (!reason || !reason.trim()) return;

        try {
            const response = await fetch(`/api/admin/auctions/${auctionId}/reject`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                },
                body: JSON.stringify({ reason: reason.trim() }),
            });
            const data = await response.json();
            if (!response.ok) {
                UIComponents.showAlert(data.message || 'Failed to reject auction', 'error');
                return;
            }
            UIComponents.createToast({ message: 'Auction rejected', type: 'info' });
            this.loadAuctions();
        } catch (error) {
            console.error('Reject auction error:', error);
        }
    }

    /**
     * Force-cancel an APPROVED or LIVE auction
     */
    async cancelAuction(auctionId) {
        const reason = prompt('Reason for cancellation (required):');
        if (!reason || !reason.trim()) return;

        try {
            const response = await fetch(`/api/admin/auctions/${auctionId}/close`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                },
                body: JSON.stringify({ reason: reason.trim() }),
            });
            const data = await response.json();
            if (!response.ok) {
                UIComponents.showAlert(data.message || 'Failed to cancel auction', 'error');
                return;
            }
            UIComponents.createToast({ message: 'Auction cancelled', type: 'info' });
            this.loadAuctions();
        } catch (error) {
            console.error('Cancel auction error:', error);
        }
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
     * Initialise a school search picker inside an already-rendered form.
     * Expects: #school-search-input, #school-select already in the DOM.
     * currentSchoolId / currentSchoolName pre-populate the select when provided.
     */
    initSchoolPicker(currentSchoolId, currentSchoolName) {
        const input  = document.getElementById('school-search-input');
        const select = document.getElementById('school-select');
        if (!input || !select) return;

        // Pre-populate with current school
        if (currentSchoolId && currentSchoolName) {
            input.value = currentSchoolName;
            const opt = document.createElement('option');
            opt.value    = currentSchoolId;
            opt.selected = true;
            opt.textContent = currentSchoolName;
            select.appendChild(opt);
        }

        const doSearch = UIComponents.debounce(async () => {
            const q = input.value.trim();
            // Clear selection when user types something new
            select.value = '';
            if (q.length < 2) return;
            try {
                const res  = await fetch(`/api/schools?search=${encodeURIComponent(q)}`);
                const data = await res.json();
                const schools = data.data || [];
                select.innerHTML = '<option value="">-- No school / not affiliated --</option>' +
                    schools.map(s =>
                        `<option value="${this.escapeHtml(s.id)}">${this.escapeHtml(s.name)} — ${this.escapeHtml(s.city)}, ${this.escapeHtml(s.state_province)}</option>`
                    ).join('');
            } catch (err) {
                console.error('School search error:', err);
            }
        }, 400);

        input.addEventListener('input', doSearch);
    }

    /**
     * Edit user — shows an editable form pre-filled with current user data
     */
    editUser(userId) {
        const titleEl = document.getElementById('user-modal-title');
        if (titleEl) titleEl.textContent = 'Edit User';

        const content = document.getElementById('user-detail-content');
        if (content) content.innerHTML = '<p class="loading-message">Loading user details...</p>';

        UIComponents.showModal('user-detail-modal');

        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        const isSiteAdmin = currentUser.role === 'SITE_ADMIN';

        fetch(`/api/admin/users/${userId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` },
        })
            .then(r => r.json())
            .then(data => {
                const user = data.user;
                if (!content || !user) return;

                const fullName = this.escapeHtml(
                    user.first_name && user.last_name
                        ? `${user.first_name} ${user.last_name}`
                        : user.fullName || user.full_name || ''
                );
                const currentRole       = user.role || '';
                const currentStatus    = user.account_status || 'ACTIVE';
                const mfaEnabled       = user.two_fa_enabled || false;
                const currentSchoolId  = user.school_id  || '';
                const currentSchoolName = user.school_name || '';

                if (titleEl) titleEl.textContent = `Edit User: ${fullName}`;

                // School picker — SITE_ADMIN can reassign any school; SCHOOL_ADMIN sees read-only
                const schoolField = isSiteAdmin ? `
                    <div class="form-group">
                        <label for="school-search-input">School Affiliation</label>
                        <input type="text" id="school-search-input" class="form-control"
                               placeholder="Type to search schools..." autocomplete="off"
                               value="${this.escapeHtml(currentSchoolName)}">
                        <select id="school-select" class="form-control" style="margin-top:0.5rem;">
                            <option value="">-- No school / not affiliated --</option>
                        </select>
                        <small class="form-hint">Search then choose from the list, or leave blank to remove affiliation.</small>
                    </div>` : `
                    <div class="form-group">
                        <label>School Affiliation</label>
                        <p class="form-static">${this.escapeHtml(currentSchoolName || 'None')}</p>
                    </div>`;

                // Role dropdown only shown to SITE_ADMIN (SCHOOL_ADMIN can't change roles)
                const roleField = isSiteAdmin ? `
                    <div class="form-group">
                        <label for="edit-user-role">Role</label>
                        <select id="edit-user-role" class="form-control">
                            <option value="STUDENT"      ${currentRole === 'STUDENT'      ? 'selected' : ''}>Student</option>
                            <option value="TEACHER"      ${currentRole === 'TEACHER'      ? 'selected' : ''}>Teacher</option>
                            <option value="SCHOOL_ADMIN" ${currentRole === 'SCHOOL_ADMIN' ? 'selected' : ''}>School Admin</option>
                            <option value="SITE_ADMIN"   ${currentRole === 'SITE_ADMIN'   ? 'selected' : ''}>Site Admin</option>
                            <option value="BIDDER"       ${currentRole === 'BIDDER'       ? 'selected' : ''}>Bidder</option>
                        </select>
                    </div>` : `
                    <div class="form-group">
                        <label>Role</label>
                        <p class="form-static">${this.escapeHtml(currentRole)}</p>
                    </div>`;

                // MFA reset button only shown to SITE_ADMIN and only if MFA is enabled
                const mfaSection = isSiteAdmin ? `
                    <div class="form-group">
                        <label>Two-Factor Authentication</label>
                        <p class="form-static" style="display:flex; align-items:center; gap:0.75rem;">
                            <span class="badge badge-${mfaEnabled ? 'success' : 'default'}">${mfaEnabled ? 'Enabled' : 'Disabled'}</span>
                            <button type="button" class="btn btn-sm btn-danger" id="reset-mfa-btn"
                                ${!mfaEnabled ? 'disabled title="2FA is already disabled"' : 'title="Disable 2FA for this user"'}>
                                Disable 2FA
                            </button>
                        </p>
                    </div>` : '';

                content.innerHTML = `
                    <form id="edit-user-form" class="admin-form">
                        <div class="form-group">
                            <label for="edit-user-firstname">First Name</label>
                            <input type="text" id="edit-user-firstname" class="form-control" value="${this.escapeHtml(user.first_name || '')}" required>
                        </div>
                        <div class="form-group">
                            <label for="edit-user-lastname">Last Name</label>
                            <input type="text" id="edit-user-lastname" class="form-control" value="${this.escapeHtml(user.last_name || '')}" required>
                        </div>
                        <div class="form-group">
                            <label for="edit-user-email">Email</label>
                            <input type="email" id="edit-user-email" class="form-control" value="${this.escapeHtml(user.email || '')}" required>
                        </div>
                        <div class="form-group">
                            <label for="edit-user-phone">Mobile Number</label>
                            <input type="tel" id="edit-user-phone" class="form-control" value="${this.escapeHtml(user.phone_number || '')}" placeholder="+1 555 000 0000">
                        </div>
                        ${schoolField}
                        ${roleField}
                        <div class="form-group">
                            <label for="edit-user-status">Account Status</label>
                            <select id="edit-user-status" class="form-control">
                                <option value="ACTIVE"    ${currentStatus === 'ACTIVE'    ? 'selected' : ''}>Active</option>
                                <option value="SUSPENDED" ${currentStatus === 'SUSPENDED' ? 'selected' : ''}>Suspended</option>
                                <option value="INACTIVE"  ${currentStatus === 'INACTIVE'  ? 'selected' : ''}>Inactive</option>
                            </select>
                        </div>
                        ${mfaSection}
                        <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1rem; flex-wrap: wrap;">
                            <button type="button" class="btn btn-secondary" id="cancel-edit-user-btn">Cancel</button>
                            <button type="button" class="btn btn-warning" id="modal-reset-pw-btn">Send Password Reset</button>
                            <button type="submit" class="btn btn-primary">Save Changes</button>
                        </div>
                    </form>
                `;

                document.getElementById('cancel-edit-user-btn')?.addEventListener('click', () => {
                    UIComponents.hideModal('user-detail-modal');
                });

                document.getElementById('modal-reset-pw-btn')?.addEventListener('click', () => {
                    UIComponents.hideModal('user-detail-modal');
                    this.resetUserPassword(userId);
                });

                const form = document.getElementById('edit-user-form');
                if (form) {
                    form.addEventListener('submit', (e) => this.handleEditUser(e, userId, user, isSiteAdmin));
                }

                // Wire up school search picker (SITE_ADMIN only)
                if (isSiteAdmin) {
                    this.initSchoolPicker(currentSchoolId, currentSchoolName);
                }

                // MFA reset fires immediately on button click (not part of form submit)
                const mfaBtn = document.getElementById('reset-mfa-btn');
                if (mfaBtn) {
                    mfaBtn.addEventListener('click', () => this.handleResetMFA(userId));
                }
            })
            .catch(err => {
                if (content) content.innerHTML = '<p class="text-error">Failed to load user details.</p>';
                console.error('editUser fetch error:', err);
            });
    }

    /**
     * Handle edit user form submission — calls profile, role, and status endpoints as needed
     */
    async handleEditUser(e, userId, originalUser, isSiteAdmin) {
        e.preventDefault();

        const firstName   = document.getElementById('edit-user-firstname')?.value.trim();
        const lastName    = document.getElementById('edit-user-lastname')?.value.trim();
        const email       = document.getElementById('edit-user-email')?.value.trim();
        const phoneNumber = document.getElementById('edit-user-phone')?.value.trim() || null;
        const newRole     = isSiteAdmin ? document.getElementById('edit-user-role')?.value : null;
        const newStatus   = document.getElementById('edit-user-status')?.value;
        // School: get value from the select (empty string = remove affiliation, null = no change)
        const schoolSelect = isSiteAdmin ? document.getElementById('school-select') : null;
        const schoolId     = schoolSelect ? (schoolSelect.value || null) : undefined;

        if (!firstName || !lastName || !email) {
            UIComponents.showAlert('First name, last name, and email are required.', 'error');
            return;
        }

        const headers = {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
            'Content-Type': 'application/json',
        };

        try {
            const calls = [];

            // Profile update if any profile field changed
            const profileChanged =
                firstName   !== originalUser.first_name  ||
                lastName    !== originalUser.last_name   ||
                email       !== originalUser.email       ||
                phoneNumber !== (originalUser.phone_number || null) ||
                (schoolId !== undefined && schoolId !== (originalUser.school_id || null));

            if (profileChanged) {
                const profileBody = { firstName, lastName, email, phoneNumber };
                if (isSiteAdmin) profileBody.schoolId = schoolId;
                calls.push(
                    fetch(`/api/admin/users/${userId}/profile`, {
                        method: 'PUT',
                        headers,
                        body: JSON.stringify(profileBody),
                    }).then(async r => {
                        if (!r.ok) {
                            const err = await r.json().catch(() => ({}));
                            throw new Error(err.message || 'Failed to update profile.');
                        }
                    })
                );
            }

            // Role update (SITE_ADMIN only, if changed)
            if (isSiteAdmin && newRole && newRole !== originalUser.role) {
                calls.push(
                    fetch(`/api/admin/users/${userId}/role`, {
                        method: 'PUT',
                        headers,
                        body: JSON.stringify({ newRole }),
                    }).then(async r => {
                        if (!r.ok) {
                            const err = await r.json().catch(() => ({}));
                            throw new Error(err.message || 'Failed to update role.');
                        }
                    })
                );
            }

            // Status update if changed
            if (newStatus && newStatus !== (originalUser.account_status || 'ACTIVE')) {
                calls.push(
                    fetch(`/api/admin/users/${userId}/status`, {
                        method: 'PUT',
                        headers,
                        body: JSON.stringify({ newStatus }),
                    }).then(async r => {
                        if (!r.ok) {
                            const err = await r.json().catch(() => ({}));
                            throw new Error(err.message || 'Failed to update status.');
                        }
                    })
                );
            }

            await Promise.all(calls);

            UIComponents.hideModal('user-detail-modal');
            UIComponents.createToast({ message: 'User updated successfully', type: 'success' });
            this.loadUsers();
        } catch (error) {
            console.error('handleEditUser error:', error);
            UIComponents.showAlert(error.message || 'An error occurred while saving.', 'error');
        }
    }

    /**
     * Handle MFA reset for a user (SITE_ADMIN only)
     */
    async handleResetMFA(userId) {
        const confirmed = await UIComponents.showConfirmation(
            'This will disable two-factor authentication for this user and clear their authenticator secret. They will need to re-enroll MFA on next login. Continue?',
            'Reset MFA'
        );
        if (!confirmed) return;

        try {
            const response = await fetch(`/api/admin/users/${userId}/reset-mfa`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` },
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                UIComponents.showAlert(err.message || 'Failed to reset MFA.', 'error');
                return;
            }

            UIComponents.createToast({ message: 'MFA reset successfully. User will need to re-enroll.', type: 'success' });
            // Refresh the edit form to show MFA as disabled
            UIComponents.hideModal('user-detail-modal');
            this.loadUsers();
        } catch (error) {
            console.error('handleResetMFA error:', error);
            UIComponents.showAlert('An error occurred while resetting MFA.', 'error');
        }
    }

    /**
     * Admin-triggered password reset — generates a reset link and shows it to the admin
     */
    async resetUserPassword(userId) {
        const confirmed = await UIComponents.showConfirmation(
            'Send a password reset email to this user?',
            'Reset User Password'
        );
        if (!confirmed) return;

        try {
            const response = await fetch(`/api/admin/users/${userId}/reset-password`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` },
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                UIComponents.showAlert(data.message || 'Failed to send password reset.', 'error');
                return;
            }

            if (data.emailSent) {
                UIComponents.createToast({ message: `Password reset email sent to ${data.userEmail}.`, type: 'success' });
            } else {
                // Email failed — show fallback URL so admin can share it manually
                const alertContainer = document.getElementById('alert-container');
                if (alertContainer) {
                    alertContainer.innerHTML = `
                        <div class="alert alert-warning" role="alert" style="word-break:break-all;">
                            <strong>Email delivery failed for ${this.escapeHtml(data.userEmail)}.</strong><br>
                            Share this link with the user manually — it expires in 24 hours:<br>
                            <code style="user-select:all;">${this.escapeHtml(data.resetUrl)}</code>
                            <button type="button" class="btn btn-sm btn-primary" style="margin-top:0.5rem;"
                                onclick="navigator.clipboard.writeText('${(data.resetUrl || '').replace(/'/g, "\\'")}').then(() => this.textContent='Copied!')">
                                Copy Link
                            </button>
                        </div>`;
                    alertContainer.scrollIntoView({ behavior: 'smooth' });
                }
            }
        } catch (error) {
            console.error('resetUserPassword error:', error);
            UIComponents.showAlert('An error occurred.', 'error');
        }
    }

    /**
     * Permanently delete a user account (SITE_ADMIN only)
     */
    async deleteUser(userId) {
        const confirmed = await UIComponents.showConfirmation(
            'PERMANENTLY delete this user account? This cannot be undone.',
            'Delete User Account'
        );
        if (!confirmed) return;

        try {
            const response = await fetch(`/api/admin/users/${userId}/permanent`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ reason: 'Admin permanent delete' }),
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                UIComponents.showAlert(data.message || 'Failed to delete user.', 'error');
                return;
            }

            UIComponents.createToast({ message: 'User account permanently deleted.', type: 'success' });
            this.loadUsers();
        } catch (error) {
            console.error('deleteUser error:', error);
            UIComponents.showAlert('An error occurred.', 'error');
        }
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
                        <label for="new-user-phone">Mobile Number</label>
                        <input type="tel" id="new-user-phone" class="form-control" placeholder="+1 555 000 0000">
                    </div>
                    <div class="form-group">
                        <label for="school-search-input">School Affiliation</label>
                        <input type="text" id="school-search-input" class="form-control"
                               placeholder="Type to search schools..." autocomplete="off">
                        <select id="school-select" class="form-control" style="margin-top:0.5rem;">
                            <option value="">-- No school / not affiliated --</option>
                        </select>
                        <small class="form-hint">Search then choose from the list, or leave blank if not affiliated with a school.</small>
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
                        <button type="button" class="btn btn-secondary" id="cancel-create-user-btn">Cancel</button>
                        <button type="submit" class="btn btn-primary">Create User</button>
                    </div>
                </form>
            `;
            document.getElementById('cancel-create-user-btn')?.addEventListener('click', () => {
                UIComponents.hideModal('user-detail-modal');
            });
            const form = document.getElementById('create-user-form');
            if (form) {
                form.addEventListener('submit', (e) => this.handleCreateUser(e));
            }
            // Wire school picker (no current school since creating new user)
            this.initSchoolPicker(null, null);
        }
        UIComponents.showModal('user-detail-modal');
    }

    async handleCreateUser(e) {
        e.preventDefault();
        const firstName    = document.getElementById('new-user-firstname').value.trim();
        const lastName     = document.getElementById('new-user-lastname').value.trim();
        const email        = document.getElementById('new-user-email').value.trim();
        const phone        = document.getElementById('new-user-phone')?.value.trim() || null;
        const schoolId     = document.getElementById('school-select')?.value || null;
        const selectedRole = document.getElementById('new-user-role').value;
        const password     = document.getElementById('new-user-password').value;

        if (!firstName || !lastName || !email || !selectedRole || !password) {
            UIComponents.showAlert('Please fill in all required fields', 'error');
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
                    phone,
                    schoolId: schoolId || undefined,
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

        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        const isSiteAdmin = currentUser.role === 'SITE_ADMIN';
        const userSchoolId   = currentUser.school_id   || currentUser.schoolId   || '';
        const userSchoolName = currentUser.school_name || currentUser.schoolName || '';

        // School field: SITE_ADMIN gets a search picker; SCHOOL_ADMIN sees their own school
        const schoolField = isSiteAdmin ? `
            <div class="form-group">
                <label for="school-search-input">School <span aria-label="required">*</span></label>
                <input type="text" id="school-search-input" class="form-control"
                       placeholder="Type to search schools..." autocomplete="off">
                <select id="school-select" class="form-control" style="margin-top:0.5rem;" required>
                    <option value="">-- Select a school --</option>
                </select>
            </div>` : `
            <div class="form-group">
                <label>School</label>
                <p class="form-static">${this.escapeHtml(userSchoolName || 'Your school')}</p>
                <input type="hidden" id="school-select" value="${this.escapeHtml(userSchoolId)}">
            </div>`;

        const form = document.getElementById('auction-form');
        if (form) {
            form.innerHTML = `
                <div class="form-group">
                    <label for="auction-title">Title <span aria-label="required">*</span></label>
                    <input type="text" id="auction-title" name="auction-title" class="form-control" required placeholder="Auction title">
                </div>
                <div class="form-group">
                    <label for="auction-description">Description</label>
                    <textarea id="auction-description" name="auction-description" class="form-control" rows="3" placeholder="Auction description (optional)"></textarea>
                </div>
                ${schoolField}
                <div class="form-group">
                    <label for="auction-start">Start Date &amp; Time <span aria-label="required">*</span></label>
                    <input type="datetime-local" id="auction-start" name="auction-start" class="form-control" required>
                </div>
                <div class="form-group">
                    <label for="auction-end">End Date &amp; Time <span aria-label="required">*</span></label>
                    <input type="datetime-local" id="auction-end" name="auction-end" class="form-control" required>
                </div>
                <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1rem;">
                    <button type="button" class="btn btn-secondary" onclick="UIComponents.hideModal('auction-form-modal')">Cancel</button>
                    <button type="submit" class="btn btn-primary">Create Auction</button>
                </div>
            `;

            // Replace any previous submit handler (avoids duplicate-listener buildup)
            form.onsubmit = (e) => this.handleCreateAuction(e);

            // Wire school picker for SITE_ADMIN
            if (isSiteAdmin) {
                this.initSchoolPicker(null, null);
            }
        }

        UIComponents.showModal('auction-form-modal');
    }

    async handleCreateAuction(e) {
        e.preventDefault();
        const title       = document.getElementById('auction-title').value.trim();
        const description = document.getElementById('auction-description').value.trim();
        const startTime   = document.getElementById('auction-start').value;
        const endTime     = document.getElementById('auction-end').value;
        const schoolId    = document.getElementById('school-select')?.value || '';

        if (!title || !startTime || !endTime) {
            UIComponents.showAlert('Please fill in all required fields', 'error');
            return;
        }

        if (!schoolId) {
            UIComponents.showAlert('Please select a school for this auction', 'error');
            return;
        }

        if (new Date(endTime) <= new Date(startTime)) {
            UIComponents.showAlert('End time must be after start time', 'error');
            return;
        }

        try {
            const response = await fetch('/api/auctions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                },
                body: JSON.stringify({
                    title,
                    description: description || undefined,
                    schoolId,
                    startTime,
                    endTime,
                }),
            });

            if (response.ok) {
                UIComponents.hideModal('auction-form-modal');
                UIComponents.createToast({ message: 'Auction created successfully', type: 'success' });
                this.loadAuctions();
            } else {
                const data = await response.json();
                UIComponents.showAlert(data.message || 'Failed to create auction', 'error');
            }
        } catch (error) {
            console.error('Create auction error:', error);
            UIComponents.showAlert('Failed to create auction', 'error');
        }
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

    /**
     * Load and display current 2FA status for the logged-in admin
     */
    async load2FAStatus() {
        const statusText = document.getElementById('admin-2fa-status-text');
        const enableBtn = document.getElementById('admin-enable-2fa-btn');
        const disableBtn = document.getElementById('admin-disable-2fa-btn');

        try {
            const response = await fetch('/api/user/profile', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` },
            });
            if (!response.ok) return;
            const data = await response.json();
            const is2FAEnabled = data.data?.twoFactorEnabled || data.data?.two_fa_enabled;

            if (statusText) {
                statusText.textContent = is2FAEnabled
                    ? '2FA is currently enabled. Your account is protected.'
                    : '2FA is currently disabled. Enable it to add an extra layer of security.';
            }
            if (enableBtn) enableBtn.style.display = is2FAEnabled ? 'none' : 'inline-block';
            if (disableBtn) disableBtn.style.display = is2FAEnabled ? 'inline-block' : 'none';

            // Wire up buttons (only once)
            if (enableBtn && !enableBtn.dataset.listenerAttached) {
                enableBtn.dataset.listenerAttached = 'true';
                enableBtn.addEventListener('click', () => {
                    window.location.href = '/2fa-setup.html';
                });
            }
            if (disableBtn && !disableBtn.dataset.listenerAttached) {
                disableBtn.dataset.listenerAttached = 'true';
                disableBtn.addEventListener('click', () => this.disable2FA());
            }
        } catch (error) {
            if (statusText) statusText.textContent = 'Could not load 2FA status.';
        }
    }

    /**
     * Disable 2FA for the logged-in admin
     */
    async disable2FA() {
        const confirmed = window.confirm('Are you sure you want to disable 2FA on your account?');
        if (!confirmed) return;

        try {
            const response = await fetch('/api/auth/2fa/disable', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                },
            });
            if (response.ok) {
                UIComponents.showAlert && UIComponents.showAlert('2FA disabled successfully.', 'success', 3000);
                this.load2FAStatus();
            } else {
                const data = await response.json();
                alert(data.message || 'Failed to disable 2FA.');
            }
        } catch (error) {
            alert('Connection error while disabling 2FA.');
        }
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
