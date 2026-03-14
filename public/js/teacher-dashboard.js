/**
 * Teacher Dashboard - Manage students and artwork submissions
 * File: public/js/teacher-dashboard.js
 * Created: February 3, 2026
 * 
 * Features:
 * - CSV upload for student lists
 * - Generate unique registration tokens
 * - Display student registration links
 * - Copy links to clipboard
 * - View submission status
 */

class TeacherDashboard {
    constructor() {
        this.apiClient = globalThis.apiClient;
        this.authManager = globalThis.authManager;
        this.uiComponents = globalThis.UIComponents;
        this.tokens = [];
        this.students = [];
        this.teacherName = '';
        this.schoolName = '';
        this.schoolId = null;
        this.currentThemePreset = null;
    }

    // Preset display metadata — primary hex used for swatch background colour
    static get PRESETS() {
        return [
            { key: 'crimson-gold',  label: 'Crimson & Gold',  primary: '#9B1B30', secondary: '#B8860B' },
            { key: 'navy-gold',     label: 'Navy & Gold',     primary: '#003087', secondary: '#C5A028' },
            { key: 'forest-gold',   label: 'Forest & Gold',   primary: '#1B5E20', secondary: '#B7820A' },
            { key: 'purple-gold',   label: 'Purple & Gold',   primary: '#4A1D7B', secondary: '#C5A028' },
            { key: 'scarlet-gray',  label: 'Scarlet & Gray',  primary: '#BB0000', secondary: '#666666' },
            { key: 'royal-blue',    label: 'Royal Blue',      primary: '#003FA5', secondary: '#4A90C4' },
            { key: 'orange-black',  label: 'Orange & Black',  primary: '#C85200', secondary: '#1A1A1A' },
        ];
    }

    /**
     * Initialize the teacher dashboard
     */
    async init() {
        // Check authentication and authorization
        if (!this.uiComponents.requireAuth()) {
            return;
        }

        // Initialize navbar
        this.uiComponents.initializeNavbar();

        // Set up event listeners
        this.setupEventListeners();

        // Load teacher data
        await this.loadTeacherData();

        // Load teacher name + school for email attribution
        await this.loadTeacherInfo();

        // Initialise theme tab now that schoolId is known
        await this.initThemeTab();
    }

    /**
     * Set up all event listeners
     */
    setupEventListeners() {
        // CSV upload form
        const csvForm = document.getElementById('csv-upload-form');
        if (csvForm) {
            csvForm.addEventListener('submit', (e) => this.handleCSVUpload(e));
        }

        // Mobile sidebar toggle
        const sidebarToggle = document.getElementById('sidebar-toggle');
        const sidebar = document.getElementById('dashboard-sidebar');
        if (sidebarToggle && sidebar) {
            sidebarToggle.addEventListener('click', () => {
                const isOpen = sidebar.classList.toggle('open');
                sidebarToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            });
        }

        // Sidebar navigation
        const sidebarLinks = document.querySelectorAll('.sidebar-link');
        sidebarLinks.forEach(link => {
            link.addEventListener('click', (e) => this.handleSectionChange(e));
        });

        // Copy to clipboard buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('copy-link-btn')) {
                this.copyLinkToClipboard(e.target);
            }
        });

        // Select all checkbox
        const selectAll = document.getElementById('select-all-students');
        if (selectAll) {
            selectAll.addEventListener('change', () => {
                document.querySelectorAll('.student-select').forEach(cb => {
                    cb.checked = selectAll.checked;
                });
            });
        }

        // Action buttons
        const saveBtn = document.getElementById('save-changes-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveStudentChanges());
        }
        const sendSelectedBtn = document.getElementById('send-selected-btn');
        if (sendSelectedBtn) {
            sendSelectedBtn.addEventListener('click', () => this.sendInvites('selected'));
        }
        const sendAllBtn = document.getElementById('send-all-btn');
        if (sendAllBtn) {
            sendAllBtn.addEventListener('click', () => this.sendInvites('all'));
        }

        // Create auction button
        const createAuctionBtn = document.getElementById('create-auction-btn');
        if (createAuctionBtn) {
            createAuctionBtn.addEventListener('click', () => this.showAuctionModal());
        }

        // Auction modal cancel button
        const cancelBtn = document.getElementById('auction-cancel-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.hideAuctionModal());
        }

        // Auction modal close button
        const modalClose = document.querySelector('#auction-form-modal .modal-close');
        if (modalClose) {
            modalClose.addEventListener('click', () => this.hideAuctionModal());
        }

        // Close modal on backdrop click
        const auctionModal = document.getElementById('auction-form-modal');
        if (auctionModal) {
            auctionModal.addEventListener('click', (e) => {
                if (e.target === auctionModal) this.hideAuctionModal();
            });
        }

        // Theme buttons
        const saveThemeBtn    = document.getElementById('save-theme-btn');
        const previewThemeBtn = document.getElementById('preview-theme-btn');
        const resetThemeBtn   = document.getElementById('reset-theme-btn');
        if (saveThemeBtn)    saveThemeBtn.addEventListener('click',    () => this.saveTheme());
        if (previewThemeBtn) previewThemeBtn.addEventListener('click', () => this.previewTheme());
        if (resetThemeBtn)   resetThemeBtn.addEventListener('click',   () => this.resetTheme());
    }

    /**
     * Handle CSV file upload
     * Parses CSV and generates registration tokens
     * @param {Event} e - Submit event
     */
    async handleCSVUpload(e) {
        e.preventDefault();

        const fileInput = document.getElementById('csv-file');
        const file = fileInput.files[0];

        if (!file) {
            this.showMessage('Please select a CSV file', 'error');
            return;
        }

        // Validate file type
        if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
            this.showMessage('Please upload a valid CSV file', 'error');
            return;
        }

        // Parse CSV
        try {
            const students = await this.parseCSV(file);
            
            if (students.length === 0) {
                this.showMessage('CSV file appears to be empty', 'error');
                return;
            }

            // Upload and generate tokens
            await this.uploadStudentsAndGenerateTokens(students);
            
        } catch (error) {
            console.error('CSV parsing error:', error);
            this.showMessage('Error parsing CSV file: ' + error.message, 'error');
        }
    }

    /**
     * Parse CSV file
     * Expected format: Name, Email
     * @param {File} file - CSV file
     * @returns {Promise<Array>} Array of student objects
     */
    async parseCSV(file) {
        const text = await file.text();
        const lines = text.trim().split('\n');
        const students = [];

        // Skip header row
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (!line) continue; // Skip empty lines

            const [name, email] = line.split(',').map(s => s.trim());

            if (!name || !email) {
                console.warn(`Skipping invalid row ${i}: ${line}`);
                continue;
            }

            // Basic email validation
            if (!this.isValidEmail(email)) {
                console.warn(`Skipping invalid email in row ${i}: ${email}`);
                continue;
            }

            students.push({ name, email });
        }

        return students;
    }

    /**
     * Validate email format
     * @param {string} email - Email to validate
     * @returns {boolean} True if valid
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Upload students and generate registration tokens
     * @param {Array} students - Array of student objects
     */
    async uploadStudentsAndGenerateTokens(students) {
        const statusDiv = document.getElementById('upload-status');
        
        try {
            statusDiv.style.display = 'block';
            statusDiv.className = 'alert alert-info';
            statusDiv.textContent = `Processing ${students.length} students...`;

            const response = await this.apiClient.post('/api/teacher/csv-upload', {
                students: students
            });

            if (response.success) {
                this.students = students;
                this.tokens = response.tokens || [];
                this.displayStudentTokens();

                statusDiv.className = 'alert alert-success';
                statusDiv.textContent = `Successfully created registration links for ${this.tokens.length} students`;

                // Clear file input
                document.getElementById('csv-file').value = '';
            } else {
                statusDiv.className = 'alert alert-error';
                statusDiv.textContent = response.message || 'Error uploading students';
            }
        } catch (error) {
            console.error('Upload error:', error);
            statusDiv.className = 'alert alert-error';
            statusDiv.textContent = 'Error uploading students: ' + error.message;
        }
    }

    /**
     * Display student registration tokens in an editable table
     */
    displayStudentTokens() {
        const card = document.getElementById('student-links-card');
        const tbody = document.getElementById('student-links-tbody');

        tbody.innerHTML = '';

        this.tokens.forEach(token => {
            const row = document.createElement('tr');
            row.dataset.tokenId = token.id;
            const registrationLink = `${globalThis.location.origin}/register.html?token=${token.token}&email=${encodeURIComponent(token.studentEmail)}`;

            row.innerHTML = `
                <td><input type="checkbox" class="student-select" data-id="${this.escapeHtml(token.id)}"
                           aria-label="Select ${this.escapeHtml(token.studentName)}"></td>
                <td><input type="text" class="edit-name" data-id="${this.escapeHtml(token.id)}"
                           value="${this.escapeHtml(token.studentName)}"
                           aria-label="Student name" style="width:100%;box-sizing:border-box;"></td>
                <td><input type="email" class="edit-email" data-id="${this.escapeHtml(token.id)}"
                           value="${this.escapeHtml(token.studentEmail)}"
                           aria-label="Student email" style="width:100%;box-sizing:border-box;"></td>
                <td>
                    <div class="link-wrapper">
                        <code class="registration-link" style="word-break:break-all;font-size:0.75em;">${registrationLink}</code>
                    </div>
                </td>
                <td><span class="badge badge-${token.used ? 'success' : 'pending'}">${token.used ? 'Registered' : 'Pending'}</span></td>
                <td>
                    <button class="copy-link-btn" data-link="${registrationLink}"
                            aria-label="Copy registration link for ${this.escapeHtml(token.studentName)}">
                        Copy
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });

        card.style.display = 'block';

        // Reset select-all checkbox
        const selectAll = document.getElementById('select-all-students');
        if (selectAll) selectAll.checked = false;
    }

    /**
     * Load teacher name and school name for email attribution
     */
    async loadTeacherInfo() {
        try {
            const response = await this.apiClient.get('/api/teacher/teacher-info');
            if (response.success && response.data) {
                this.teacherName = response.data.teacherName || '';
                this.schoolName = response.data.schoolName || '';
                this.schoolId   = response.data.schoolId   || null;
            }
        } catch (error) {
            console.error('Failed to load teacher info:', error);
        }
    }

    /**
     * Populate the School Theme tab with preset swatches and custom colour inputs,
     * then fetch the school's current theme from the API.
     */
    async initThemeTab() {
        const swatchContainer = document.getElementById('theme-swatches');
        const colorGrid       = document.getElementById('theme-colors-grid');

        this._renderSwatches(swatchContainer);
        this._renderColorInputs(colorGrid);

        if (this.schoolId) {
            await this._loadCurrentThemeFromAPI(swatchContainer, colorGrid);
        }
    }

    /** Render preset swatch buttons and wire click → live preview */
    _renderSwatches(container) {
        if (!container) return;
        container.innerHTML = TeacherDashboard.PRESETS.map(p => `
            <button type="button"
                    class="theme-swatch"
                    data-preset="${this.escapeHtml(p.key)}"
                    aria-pressed="false"
                    title="${this.escapeHtml(p.label)}"
                    style="background:${p.primary};"
                    aria-label="${this.escapeHtml(p.label)}">
                <span class="theme-swatch-label">${this.escapeHtml(p.label)}</span>
            </button>
        `).join('');

        container.addEventListener('click', (e) => {
            const btn = e.target.closest('.theme-swatch');
            if (!btn) return;
            container.querySelectorAll('.theme-swatch').forEach(b => b.setAttribute('aria-pressed', 'false'));
            btn.setAttribute('aria-pressed', 'true');
            this.currentThemePreset = btn.dataset.preset;
            const preset = TeacherDashboard.PRESETS.find(p => p.key === this.currentThemePreset);
            if (preset) ThemeManager.apply({ primary: preset.primary, secondary: preset.secondary });
        });
    }

    /** Render custom hex colour inputs and wire picker ↔ text sync */
    _renderColorInputs(grid) {
        if (!grid) return;
        const fields = [
            { key: 'primary',        label: 'Primary' },
            { key: 'primaryDark',    label: 'Primary Dark' },
            { key: 'primaryLight',   label: 'Primary Light' },
            { key: 'secondary',      label: 'Secondary' },
            { key: 'secondaryDark',  label: 'Secondary Dark' },
            { key: 'secondaryLight', label: 'Secondary Light' },
        ];
        grid.innerHTML = fields.map(f => `
            <div class="color-input-group">
                <label for="color-${f.key}">${this.escapeHtml(f.label)}</label>
                <input type="color" id="color-${f.key}" name="${f.key}" value="#000000">
                <input type="text"  id="color-${f.key}-hex" placeholder="#000000"
                       pattern="^#[0-9A-Fa-f]{6}$" aria-label="${this.escapeHtml(f.label)} hex value"
                       style="width:7rem;">
            </div>
        `).join('');

        fields.forEach(({ key }) => {
            const picker = document.getElementById(`color-${key}`);
            const hex    = document.getElementById(`color-${key}-hex`);
            if (!picker || !hex) return;
            picker.addEventListener('input', () => { hex.value = picker.value; });
            hex.addEventListener('change', () => {
                if (/^#[0-9A-Fa-f]{6}$/.test(hex.value)) picker.value = hex.value;
            });
        });
    }

    /** Fetch the saved theme from the API and pre-fill the form */
    async _loadCurrentThemeFromAPI(swatchContainer, colorGrid) {
        try {
            const res  = await fetch(`/api/schools/${this.schoolId}/theme`);
            const data = await res.json();
            if (!data.success || !data.data) return;

            const { preset, resolved } = data.data;

            if (preset && swatchContainer) {
                this.currentThemePreset = preset;
                const active = swatchContainer.querySelector(`[data-preset="${preset}"]`);
                if (active) active.setAttribute('aria-pressed', 'true');
            }

            if (resolved && colorGrid) {
                Object.entries(resolved).forEach(([key, val]) => {
                    const picker = document.getElementById(`color-${key}`);
                    const hex    = document.getElementById(`color-${key}-hex`);
                    if (picker) picker.value = val;
                    if (hex)    hex.value    = val;
                });
            }
        } catch (err) {
            console.warn('Could not load school theme:', err);
        }
    }

    /**
     * Save the current theme (preset + optional custom overrides) to the API.
     */
    async saveTheme() {
        if (!this.schoolId) {
            this.showMessage('No school associated with your account.', 'error');
            return;
        }

        // Collect custom colours (only if all six are valid hex)
        const colorKeys = ['primary','primaryDark','primaryLight','secondary','secondaryDark','secondaryLight'];
        const customColors = {};
        let hasCustom = false;
        let invalidKey = null;

        for (const key of colorKeys) {
            const hex = document.getElementById(`color-${key}-hex`)?.value?.trim() || '';
            if (hex && hex !== '#000000') {
                if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
                    invalidKey = key;
                    break;
                }
                customColors[key] = hex;
                hasCustom = true;
            }
        }

        if (invalidKey) {
            this.showMessage(`Invalid hex colour for "${invalidKey}". Use format #RRGGBB.`, 'error');
            return;
        }

        const body = {
            preset: this.currentThemePreset || null,
            colors: hasCustom ? customColors : null,
        };

        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch(`/api/schools/${this.schoolId}/theme`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (data.success) {
                this.showMessage('Theme saved.', 'success');
                if (data.data?.resolved) ThemeManager.apply(data.data.resolved);
            } else {
                this.showMessage(data.message || 'Failed to save theme.', 'error');
            }
        } catch (err) {
            console.error('Theme save error:', err);
            this.showMessage('An error occurred saving the theme.', 'error');
        }
    }

    /**
     * Live-preview the currently selected preset or custom colours without saving.
     */
    previewTheme() {
        const colorKeys = ['primary','primaryDark','primaryLight','secondary','secondaryDark','secondaryLight'];
        const custom = {};
        let hasCustom = false;

        for (const key of colorKeys) {
            const val = document.getElementById(`color-${key}-hex`)?.value?.trim() || '';
            if (val && /^#[0-9A-Fa-f]{6}$/.test(val) && val !== '#000000') {
                custom[key] = val;
                hasCustom = true;
            }
        }

        if (hasCustom) {
            ThemeManager.apply(custom);
        } else if (this.currentThemePreset) {
            const preset = TeacherDashboard.PRESETS.find(p => p.key === this.currentThemePreset);
            if (preset) ThemeManager.apply({ primary: preset.primary, secondary: preset.secondary });
        } else {
            this.showMessage('Select a preset or enter custom colours to preview.', 'info');
        }
    }

    /**
     * Reset the page theme to defaults and clear selections.
     */
    resetTheme() {
        ThemeManager.reset();
        this.currentThemePreset = null;
        document.querySelectorAll('.theme-swatch').forEach(b => b.setAttribute('aria-pressed', 'false'));
        const colorKeys = ['primary','primaryDark','primaryLight','secondary','secondaryDark','secondaryLight'];
        colorKeys.forEach(key => {
            const picker = document.getElementById(`color-${key}`);
            const hex    = document.getElementById(`color-${key}-hex`);
            if (picker) picker.value = '#000000';
            if (hex)    hex.value    = '';
        });
    }

    /**
     * Save edited student name/email for changed rows
     */
    async saveStudentChanges() {
        const nameInputs = document.querySelectorAll('.edit-name');
        const emailInputs = document.querySelectorAll('.edit-email');

        // Build a map of id -> { name, email } from current inputs
        const updated = {};
        nameInputs.forEach(input => {
            updated[input.dataset.id] = { name: input.value.trim() };
        });
        emailInputs.forEach(input => {
            if (updated[input.dataset.id]) {
                updated[input.dataset.id].email = input.value.trim();
            }
        });

        // Find tokens that differ from stored values
        const toSave = this.tokens.filter(token => {
            const u = updated[token.id];
            return u && (u.name !== token.studentName || u.email !== token.studentEmail);
        });

        if (toSave.length === 0) {
            this.showMessage('No changes to save.', 'info');
            return;
        }

        let saved = 0;
        const errors = [];

        for (const token of toSave) {
            const u = updated[token.id];
            try {
                const response = await this.apiClient.put(`/api/teacher/tokens/${token.id}`, {
                    studentName: u.name,
                    studentEmail: u.email
                });
                if (response.success) {
                    token.studentName = u.name;
                    token.studentEmail = u.email;
                    saved++;
                } else {
                    errors.push(`${token.studentEmail}: ${response.message}`);
                }
            } catch (err) {
                errors.push(`${token.studentEmail}: ${err.message}`);
            }
        }

        if (errors.length) {
            this.showMessage(`Saved ${saved}, failed ${errors.length}: ${errors.join('; ')}`, 'error');
        } else {
            this.showMessage(`Saved changes for ${saved} student${saved === 1 ? '' : 's'}.`, 'success');
        }
    }

    /**
     * Send registration invite emails
     * @param {'selected'|'all'} mode
     */
    async sendInvites(mode) {
        let tokenIds;

        if (mode === 'selected') {
            const checked = document.querySelectorAll('.student-select:checked');
            tokenIds = Array.from(checked).map(cb => cb.dataset.id);
            if (tokenIds.length === 0) {
                this.showMessage('Please select at least one student.', 'error');
                return;
            }
        } else {
            tokenIds = this.tokens.map(t => t.id);
            if (tokenIds.length === 0) {
                this.showMessage('No students to send invites to.', 'error');
                return;
            }
        }

        try {
            const response = await this.apiClient.post('/api/teacher/send-invites', { tokenIds });
            if (response.success) {
                this.showMessage(response.message, 'success');
            } else {
                this.showMessage(response.message || 'Failed to send invites.', 'error');
            }
        } catch (error) {
            console.error('Send invites error:', error);
            this.showMessage('Error sending invites: ' + error.message, 'error');
        }
    }

    /**
     * Copy link to clipboard
     * @param {HTMLElement} button - Copy button element
     */
    copyLinkToClipboard(button) {
        const link = button.dataset.link;

        navigator.clipboard.writeText(link).then(() => {
            const originalText = button.textContent;
            button.textContent = 'Copied!';
            
            setTimeout(() => {
                button.textContent = originalText;
            }, 2000);
        }).catch(error => {
            console.error('Copy error:', error);
            this.showMessage('Failed to copy link', 'error');
        });
    }

    /**
     * Handle sidebar section changes
     * @param {Event} e - Click event
     */
    handleSectionChange(e) {
        e.preventDefault();

        const section = e.target.dataset.section;
        
        // Hide all sections
        document.querySelectorAll('.dashboard-section').forEach(section => {
            section.style.display = 'none';
            section.classList.remove('active');
        });

        // Update active link
        document.querySelectorAll('.sidebar-link').forEach(link => {
            link.classList.remove('active');
        });
        e.target.classList.add('active');

        // Show selected section
        const sectionId = `${section}-section`;
        const sectionElement = document.getElementById(sectionId);
        if (sectionElement) {
            sectionElement.style.display = 'block';
            sectionElement.classList.add('active');
        }

        // Close sidebar on mobile after selecting a section
        const sidebar = document.getElementById('dashboard-sidebar');
        const sidebarToggle = document.getElementById('sidebar-toggle');
        if (sidebar && window.innerWidth < 769) {
            sidebar.classList.remove('open');
            if (sidebarToggle) sidebarToggle.setAttribute('aria-expanded', 'false');
        }
    }

    /**
     * Load teacher data (submissions, auctions)
     */
    async loadTeacherData() {
        // Run independently so one failure doesn't block the other
        try {
            const submissionsResponse = await this.apiClient.request('GET','/api/teacher/submissions');
            if (submissionsResponse.success) {
                this.displaySubmissions(submissionsResponse.data);
            }
        } catch (error) {
            console.error('Error loading submissions:', error);
        }

        try {
            // Load auctions
            const auctionsResponse = await this.apiClient.request('GET','/api/teacher/auctions');
            if (auctionsResponse.success) {
                this.displayAuctions(auctionsResponse.data);
            }
        } catch (error) {
            console.error('Error loading teacher data:', error);
        }
    }

    /**
     * Display artwork submissions
     * @param {Array} submissions - Array of submission objects
     */
    displaySubmissions(submissions) {
        const grid = document.getElementById('submissions-grid');

        if (!submissions || submissions.length === 0) {
            grid.innerHTML = '<p>No submissions yet. Student artwork will appear here.</p>';
            return;
        }

        grid.innerHTML = submissions.map(submission => `
            <div class="submission-card">
                <div class="submission-image">
                    <img src="${this.escapeHtml(submission.imageUrl)}" 
                         alt="${this.escapeHtml(submission.title)}">
                </div>
                <div class="submission-info">
                    <h4>${this.escapeHtml(submission.title)}</h4>
                    <p class="student-name">By ${this.escapeHtml(submission.studentName)}</p>
                    <p class="status">
                        <span class="badge badge-${submission.status.toLowerCase()}">
                            ${submission.status}
                        </span>
                    </p>
                    <div class="submission-actions">
                        <button class="btn btn-sm btn-primary" data-id="${submission.id}" 
                                aria-label="Approve ${submission.title}">
                            Approve
                        </button>
                        <button class="btn btn-sm btn-secondary" data-id="${submission.id}" 
                                aria-label="Reject ${submission.title}">
                            Reject
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    /**
     * Display teacher's auctions
     * @param {Array} auctions - Array of auction objects
     */
    displayAuctions(auctions) {
        const list = document.getElementById('auctions-list');

        if (!auctions || auctions.length === 0) {
            list.innerHTML = '<p class="text-muted">No auctions yet. Use the button above to create your first auction.</p>';
            return;
        }

        list.innerHTML = auctions.map(auction => {
            const status = auction.auction_status || '';
            const statusClass = { LIVE: 'success', APPROVED: 'success', DRAFT: 'warning', ENDED: 'error', CANCELLED: 'error' }[status] || 'default';
            const startsAt = auction.starts_at ? new Date(auction.starts_at).toLocaleString() : '—';
            const endsAt   = auction.ends_at   ? new Date(auction.ends_at).toLocaleString()   : '—';
            const isDraft  = status === 'DRAFT';

            return `
            <div class="auction-item card" style="margin-bottom:1rem; padding:1rem;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:0.5rem;">
                    <div>
                        <h4 style="margin:0 0 0.25rem;">${this.escapeHtml(auction.title || '')}</h4>
                        <p style="margin:0 0 0.5rem; color:var(--color-text-muted, #666);">
                            ${startsAt} &ndash; ${endsAt}
                        </p>
                        <p style="margin:0;">
                            <span class="badge badge-${statusClass}">${status}</span>
                            &nbsp;
                            <span class="text-muted">${auction.bid_count || 0} bids</span>
                            ${auction.current_high_bid ? ` &middot; high bid $${Number.parseFloat(auction.current_high_bid).toFixed(2)}` : ''}
                        </p>
                    </div>
                    <div style="display:flex; gap:0.5rem; flex-shrink:0;">
                        ${isDraft ? `<button class="btn btn-sm btn-secondary edit-auction-btn" data-auction-id="${this.escapeHtml(auction.id)}">Edit</button>` : ''}
                        <a href="/auction-detail.html?id=${this.escapeHtml(auction.id)}" class="btn btn-sm btn-primary">View</a>
                    </div>
                </div>
            </div>`;
        }).join('');

        // Wire edit buttons
        list.querySelectorAll('.edit-auction-btn').forEach(btn => {
            btn.addEventListener('click', () => this.showAuctionModal(btn.dataset.auctionId));
        });
    }

    /**
     * Show the create/edit auction modal.
     * @param {string|null} auctionId - Pass an ID to edit an existing draft, null to create.
     */
    async showAuctionModal(auctionId = null) {
        const modal     = document.getElementById('auction-form-modal');
        const titleEl   = document.getElementById('auction-modal-title');
        const form      = document.getElementById('auction-form');
        if (!modal || !form) return;

        // Reset form fields
        form.reset();

        // Replace any previous submit handler (onsubmit ensures only one handler exists)
        form.onsubmit = (e) => this.handleAuctionSubmit(e, auctionId);

        const submitBtn = document.getElementById('auction-submit-btn');
        if (auctionId) {
            titleEl.textContent = 'Edit Auction';
            if (submitBtn) submitBtn.textContent = 'Save Changes';
            await this._prefillAuctionForm(auctionId);
        } else {
            titleEl.textContent = 'Create New Auction';
            if (submitBtn) submitBtn.textContent = 'Create Auction';
        }

        modal.style.display = 'flex';
        modal.removeAttribute('aria-hidden');
        document.getElementById('auction-title').focus();
    }

    /** Fetch an existing auction and populate the modal form fields */
    async _prefillAuctionForm(auctionId) {
        try {
            const token = localStorage.getItem('auth_token');
            const res   = await fetch(`/api/auctions/${auctionId}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            const data = await res.json();
            const a = data.auction;
            if (!a) return;
            document.getElementById('auction-title').value       = a.title || '';
            document.getElementById('auction-description').value = a.description || '';
            if (a.starts_at) document.getElementById('auction-start').value = a.starts_at.slice(0, 16);
            if (a.ends_at)   document.getElementById('auction-end').value   = a.ends_at.slice(0, 16);
        } catch (err) {
            console.error('Failed to load auction for editing:', err);
        }
    }

    /** Hide the auction modal */
    hideAuctionModal() {
        const modal = document.getElementById('auction-form-modal');
        if (modal) {
            modal.style.display = 'none';
            modal.setAttribute('aria-hidden', 'true');
        }
    }

    /**
     * Handle auction form submission (create or update).
     * @param {Event} e
     * @param {string|null} auctionId - null = create, string = update
     */
    async handleAuctionSubmit(e, auctionId) {
        e.preventDefault();

        const title     = document.getElementById('auction-title').value.trim();
        const description = document.getElementById('auction-description').value.trim();
        const startTime = document.getElementById('auction-start').value;
        const endTime   = document.getElementById('auction-end').value;

        if (!title || !startTime || !endTime) {
            this.showMessage('Title, start date, and end date are required.', 'error');
            return;
        }
        if (new Date(endTime) <= new Date(startTime)) {
            this.showMessage('End date/time must be after start date/time.', 'error');
            return;
        }

        const token = localStorage.getItem('auth_token');
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        };
        const body = JSON.stringify({ title, description, startTime, endTime });

        try {
            const url    = auctionId ? `/api/auctions/${auctionId}` : '/api/auctions';
            const method = auctionId ? 'PUT' : 'POST';
            const res    = await fetch(url, { method, headers, body });
            const data   = await res.json();

            if (!res.ok) {
                this.showMessage(data.message || 'Failed to save auction.', 'error');
                return;
            }

            this.hideAuctionModal();
            this.showMessage(auctionId ? 'Auction updated.' : 'Auction created.', 'success');
            // Reload auctions list
            const auctionsRes = await this.apiClient.request('GET','/api/teacher/auctions');
            if (auctionsRes.success) this.displayAuctions(auctionsRes.data);
        } catch (err) {
            console.error('Auction save error:', err);
            this.showMessage('An error occurred. Please try again.', 'error');
        }
    }

    /**
     * Show alert message
     * @param {string} message - Message to display
     * @param {string} type - Message type (success, error, info, warning)
     */
    showMessage(message, type = 'info') {
        const alertContainer = document.getElementById('alert-container');
        const alert = document.createElement('div');
        alert.className = `alert alert-${type}`;
        alert.setAttribute('role', 'alert');
        alert.innerHTML = `
            <p>${this.escapeHtml(message)}</p>
            <button class="alert-close" aria-label="Close alert">&times;</button>
        `;

        alertContainer.appendChild(alert);

        // Close button
        alert.querySelector('.alert-close').addEventListener('click', () => {
            alert.remove();
        });

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (alert.parentElement) {
                alert.remove();
            }
        }, 5000);
    }

    /**
     * Escape HTML special characters
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replaceAll(/[&<>"']/g, m => map[m]);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const dashboard = new TeacherDashboard();
    dashboard.init();
});
