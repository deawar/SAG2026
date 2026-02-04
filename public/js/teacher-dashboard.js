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
        this.apiClient = window.apiClient;
        this.authManager = window.authManager;
        this.uiComponents = window.UIComponents;
        this.tokens = [];
        this.students = [];
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
     * Display student registration tokens in table
     */
    displayStudentTokens() {
        const card = document.getElementById('student-links-card');
        const tbody = document.getElementById('student-links-tbody');

        // Clear existing rows
        tbody.innerHTML = '';

        // Add row for each token
        this.tokens.forEach(token => {
            const row = document.createElement('tr');
            const registrationLink = `${window.location.origin}/register.html?token=${token.token}&email=${encodeURIComponent(token.studentEmail)}`;
            
            row.innerHTML = `
                <td>${this.escapeHtml(token.studentName)}</td>
                <td>${this.escapeHtml(token.studentEmail)}</td>
                <td>
                    <div class="link-wrapper">
                        <code class="registration-link">${registrationLink}</code>
                        <button class="copy-link-btn" data-link="${registrationLink}" 
                                aria-label="Copy registration link for ${token.studentName}">
                            Copy
                        </button>
                    </div>
                </td>
                <td><span class="badge badge-pending">${token.used ? 'Registered' : 'Pending'}</span></td>
                <td>
                    <button class="btn btn-sm btn-secondary resend-link-btn" 
                            data-token="${token.token}"
                            aria-label="Resend link to ${token.studentName}">
                        Resend
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });

        // Show the card
        card.style.display = 'block';
    }

    /**
     * Copy link to clipboard
     * @param {HTMLElement} button - Copy button element
     */
    copyLinkToClipboard(button) {
        const link = button.getAttribute('data-link');

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

        const section = e.target.getAttribute('data-section');
        
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
    }

    /**
     * Load teacher data (submissions, auctions)
     */
    async loadTeacherData() {
        try {
            // Load submissions
            const submissionsResponse = await this.apiClient.get('/api/teacher/submissions');
            if (submissionsResponse.success) {
                this.displaySubmissions(submissionsResponse.data);
            }

            // Load auctions
            const auctionsResponse = await this.apiClient.get('/api/teacher/auctions');
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
            list.innerHTML = '<p>No auctions yet. <a href="/auctions.html">Create one</a></p>';
            return;
        }

        list.innerHTML = auctions.map(auction => `
            <div class="auction-item">
                <h4>${this.escapeHtml(auction.name)}</h4>
                <p class="auction-date">
                    ${new Date(auction.startTime).toLocaleDateString()} - 
                    ${new Date(auction.endTime).toLocaleDateString()}
                </p>
                <p class="auction-status">
                    <span class="badge badge-${auction.status.toLowerCase()}">
                        ${auction.status}
                    </span>
                </p>
                <div class="auction-stats">
                    <span class="stat">
                        <strong>${auction.bidCount}</strong> bids
                    </span>
                    <span class="stat">
                        <strong>$${(auction.currentHighBid || 0).toFixed(2)}</strong> current bid
                    </span>
                </div>
                <a href="/auction-detail.html?id=${auction.id}" class="btn btn-sm btn-primary">
                    View Details
                </a>
            </div>
        `).join('');
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
        return text.replace(/[&<>"']/g, m => map[m]);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const dashboard = new TeacherDashboard();
    dashboard.init();
});
