/**
 * UI Components Library
 * Reusable UI components and utilities
 */

class UIComponents {
    /**
     * Show alert message
     * @param {string} message - Alert message
     * @param {string} type - Alert type (success, error, warning, info)
     * @param {number} duration - Duration in milliseconds (0 = persistent)
     */
    static showAlert(message, type = 'info', duration = 5000) {
        const container = document.getElementById('alert-container');
        if (!container) return;

        const alert = document.createElement('div');
        alert.className = `alert alert-${type}`;
        alert.setAttribute('role', 'alert');
        alert.innerHTML = `
            <p>${this.escapeHtml(message)}</p>
            <button class="alert-close" aria-label="Close alert" style="background: none; border: none; color: inherit; cursor: pointer; font-size: 1.5em; padding: 0;">&times;</button>
        `;

        container.appendChild(alert);

        const closeButton = alert.querySelector('.alert-close');
        closeButton.addEventListener('click', () => {
            alert.remove();
        });

        if (duration > 0) {
            setTimeout(() => {
                alert.remove();
            }, duration);
        }

        return alert;
    }

    /**
     * Show loading spinner
     * @param {string} message - Loading message
     * @returns {HTMLElement}
     */
    static showLoading(message = 'Loading...') {
        const loader = document.createElement('div');
        loader.className = 'loading-overlay';
        loader.innerHTML = `
            <div class="loading-content">
                <div class="loading"></div>
                <p>${this.escapeHtml(message)}</p>
            </div>
        `;
        document.body.appendChild(loader);
        return loader;
    }

    /**
     * Hide loading spinner
     * @param {HTMLElement} loader - Loading element
     */
    static hideLoading(loader) {
        if (loader && loader.parentNode) {
            loader.parentNode.removeChild(loader);
        }
    }

    /**
     * Show modal dialog
     * @param {string} modalId - Modal ID
     */
    static showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'flex';
            modal.setAttribute('aria-hidden', 'false');
            this.trapFocus(modal);
        }
    }

    /**
     * Hide modal dialog
     * @param {string} modalId - Modal ID
     */
    static hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
            modal.setAttribute('aria-hidden', 'true');
            this.releaseFocus();
        }
    }

    /**
     * Toggle modal
     * @param {string} modalId - Modal ID
     */
    static toggleModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            if (modal.style.display === 'none' || !modal.style.display) {
                this.showModal(modalId);
            } else {
                this.hideModal(modalId);
            }
        }
    }

    /**
     * Trap focus within modal
     * @param {HTMLElement} element - Modal element
     */
    static trapFocus(element) {
        const focusableElements = element.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        element.addEventListener('keydown', (event) => {
            if (event.key !== 'Tab') return;

            if (event.shiftKey) {
                if (document.activeElement === firstElement) {
                    lastElement.focus();
                    event.preventDefault();
                }
            } else {
                if (document.activeElement === lastElement) {
                    firstElement.focus();
                    event.preventDefault();
                }
            }
        });
    }

    /**
     * Release focus trap
     */
    static releaseFocus() {
        // Reset focus to body
        document.body.focus();
    }

    /**
     * Format currency
     * @param {number} amount - Amount
     * @param {string} currency - Currency code (default: USD)
     * @returns {string}
     */
    static formatCurrency(amount, currency = 'USD') {
        try {
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: currency,
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            }).format(amount);
        } catch (error) {
            return `$${(amount || 0).toFixed(2)}`;
        }
    }

    /**
     * Format date
     * @param {Date|string} date - Date object or string
     * @param {object} options - Intl.DateTimeFormat options
     * @returns {string}
     */
    static formatDate(date, options = {}) {
        try {
            const dateObj = typeof date === 'string' ? new Date(date) : date;
            const defaultOptions = {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                ...options,
            };
            return new Intl.DateTimeFormat('en-US', defaultOptions).format(dateObj);
        } catch (error) {
            return String(date);
        }
    }

    /**
     * Format date and time
     * @param {Date|string} date - Date object or string
     * @returns {string}
     */
    static formatDateTime(date) {
        return this.formatDate(date, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    /**
     * Format time remaining
     * @param {number} milliseconds - Milliseconds remaining
     * @returns {string}
     */
    static formatTimeRemaining(milliseconds) {
        if (milliseconds <= 0) return 'Time\'s up!';

        const totalSeconds = Math.floor(milliseconds / 1000);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (days > 0) {
            return `${days}d ${hours}h`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        } else {
            return `${seconds}s`;
        }
    }

    /**
     * Escape HTML special characters
     * @param {string} text - Text to escape
     * @returns {string}
     */
    static escapeHtml(text) {
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
     * Validate email
     * @param {string} email - Email address
     * @returns {boolean}
     */
    static validateEmail(email) {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    }

    /**
     * Validate password strength
     * @param {string} password - Password
     * @returns {object} { strength: 'weak'|'fair'|'good'|'strong', score: 0-4 }
     */
    static validatePassword(password) {
        let score = 0;

        if (!password) return { strength: 'weak', score: 0 };

        if (password.length >= 8) score++;
        if (password.length >= 12) score++;
        if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
        if (/\d/.test(password) && /[!@#$%^&*]/.test(password)) score++;

        const strengths = ['weak', 'fair', 'good', 'strong'];
        return {
            strength: strengths[score],
            score: score,
        };
    }

    /**
     * Create badge element
     * @param {string} text - Badge text
     * @param {string} type - Badge type (primary, success, warning, error)
     * @returns {HTMLElement}
     */
    static createBadge(text, type = 'primary') {
        const badge = document.createElement('span');
        badge.className = `badge badge-${type}`;
        badge.textContent = text;
        return badge;
    }

    /**
     * Create button element
     * @param {object} options - Button options
     * @returns {HTMLElement}
     */
    static createButton(options = {}) {
        const button = document.createElement('button');
        button.type = options.type || 'button';
        button.className = `btn ${options.className || 'btn-primary'}`;
        button.textContent = options.text || '';
        button.disabled = options.disabled || false;
        
        if (options.ariaLabel) {
            button.setAttribute('aria-label', options.ariaLabel);
        }
        
        if (options.onClick) {
            button.addEventListener('click', options.onClick);
        }
        
        return button;
    }

    /**
     * Create form group
     * @param {object} options - Field options
     * @returns {HTMLElement}
     */
    static createFormGroup(options = {}) {
        const group = document.createElement('div');
        group.className = 'form-group';

        if (options.label) {
            const label = document.createElement('label');
            label.htmlFor = options.id;
            label.textContent = options.label;
            if (options.required) {
                label.setAttribute('aria-required', 'true');
            }
            group.appendChild(label);
        }

        if (options.type === 'textarea') {
            const textarea = document.createElement('textarea');
            textarea.id = options.id;
            textarea.className = 'form-control';
            textarea.placeholder = options.placeholder || '';
            textarea.required = options.required || false;
            textarea.value = options.value || '';
            group.appendChild(textarea);
        } else if (options.type === 'select') {
            const select = document.createElement('select');
            select.id = options.id;
            select.className = 'form-control';
            select.required = options.required || false;
            
            if (options.options) {
                options.options.forEach(opt => {
                    const option = document.createElement('option');
                    option.value = opt.value;
                    option.textContent = opt.label;
                    if (opt.selected) {
                        option.selected = true;
                    }
                    select.appendChild(option);
                });
            }
            
            group.appendChild(select);
        } else {
            const input = document.createElement('input');
            input.id = options.id;
            input.type = options.type || 'text';
            input.className = 'form-control';
            input.placeholder = options.placeholder || '';
            input.required = options.required || false;
            input.value = options.value || '';
            
            if (options.min) {
                input.min = options.min;
            }
            if (options.max) {
                input.max = options.max;
            }
            if (options.step) {
                input.step = options.step;
            }
            
            group.appendChild(input);
        }

        if (options.help) {
            const help = document.createElement('small');
            help.className = 'helper-text';
            help.textContent = options.help;
            group.appendChild(help);
        }

        return group;
    }

    /**
     * Create card element
     * @param {object} options - Card options
     * @returns {HTMLElement}
     */
    static createCard(options = {}) {
        const card = document.createElement('div');
        card.className = 'card';

        if (options.title) {
            const header = document.createElement('div');
            header.className = 'card-header';
            const title = document.createElement('h3');
            title.className = 'card-title';
            title.textContent = options.title;
            header.appendChild(title);
            card.appendChild(header);
        }

        const body = document.createElement('div');
        body.className = 'card-body';
        
        if (options.content) {
            if (typeof options.content === 'string') {
                body.innerHTML = options.content;
            } else {
                body.appendChild(options.content);
            }
        }
        
        card.appendChild(body);

        if (options.footer) {
            const footer = document.createElement('div');
            footer.className = 'card-footer';
            
            if (typeof options.footer === 'string') {
                footer.innerHTML = options.footer;
            } else {
                footer.appendChild(options.footer);
            }
            
            card.appendChild(footer);
        }

        return card;
    }

    /**
     * Show confirmation dialog
     * @param {string} message - Confirmation message
     * @param {string} title - Dialog title
     * @returns {Promise}
     */
    static showConfirmation(message, title = 'Confirm') {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.style.display = 'flex';
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            modal.setAttribute('aria-labelledby', 'confirm-title');

            modal.innerHTML = `
                <div class="modal-content modal-medium">
                    <h2 id="confirm-title">${this.escapeHtml(title)}</h2>
                    <p>${this.escapeHtml(message)}</p>
                    <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                        <button class="btn btn-secondary" id="confirm-cancel">Cancel</button>
                        <button class="btn btn-primary" id="confirm-ok">Confirm</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            const cancelBtn = modal.querySelector('#confirm-cancel');
            const okBtn = modal.querySelector('#confirm-ok');

            cancelBtn.addEventListener('click', () => {
                modal.remove();
                resolve(false);
            });

            okBtn.addEventListener('click', () => {
                modal.remove();
                resolve(true);
            });

            // Close on backdrop click
            modal.addEventListener('click', (event) => {
                if (event.target === modal) {
                    modal.remove();
                    resolve(false);
                }
            });

            okBtn.focus();
        });
    }

    /**
     * Create toast notification (non-blocking alert)
     * @param {object} options - Toast options
     * @returns {HTMLElement}
     */
    static createToast(options = {}) {
        const {
            message = '',
            type = 'info',
            duration = 5000,
            position = 'bottom-right',
        } = options;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type} toast-${position}`;
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        
        const icon = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ',
        }[type] || '✓';

        toast.innerHTML = `
            <span class="toast-icon">${icon}</span>
            <span class="toast-message">${this.escapeHtml(message)}</span>
            <button class="toast-close" aria-label="Close">×</button>
        `;

        // Add to document
        if (!document.querySelector('.toast-container')) {
            const container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const container = document.querySelector('.toast-container');
        container.appendChild(toast);

        // Close button handler
        const closeBtn = toast.querySelector('.toast-close');
        const removeToast = () => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        };
        closeBtn.addEventListener('click', removeToast);

        // Auto-dismiss
        if (duration > 0) {
            setTimeout(removeToast, duration);
        }

        return toast;
    }

    /**
     * Create dropdown component
     * @param {object} options - Dropdown options
     * @returns {HTMLElement}
     */
    static createDropdown(options = {}) {
        const {
            id = 'dropdown-' + Date.now(),
            label = 'Select option',
            items = [],
            onSelect = null,
            className = '',
        } = options;

        const wrapper = document.createElement('div');
        wrapper.className = `dropdown ${className}`;

        const button = document.createElement('button');
        button.id = id + '-btn';
        button.className = 'dropdown-btn';
        button.setAttribute('aria-haspopup', 'true');
        button.setAttribute('aria-expanded', 'false');
        button.innerHTML = `
            ${this.escapeHtml(label)}
            <span class="dropdown-arrow">▼</span>
        `;

        const menu = document.createElement('div');
        menu.className = 'dropdown-menu';
        menu.id = id + '-menu';
        menu.setAttribute('role', 'menu');
        menu.style.display = 'none';

        items.forEach((item, index) => {
            const menuItem = document.createElement('button');
            menuItem.className = 'dropdown-item';
            menuItem.type = 'button';
            menuItem.textContent = this.escapeHtml(item.label || '');
            menuItem.setAttribute('role', 'menuitem');
            
            menuItem.addEventListener('click', (e) => {
                e.preventDefault();
                if (onSelect) {
                    onSelect(item.value, item.label);
                }
                button.textContent = this.escapeHtml(item.label);
                menu.style.display = 'none';
                button.setAttribute('aria-expanded', 'false');
            });

            menu.appendChild(menuItem);
        });

        // Toggle menu
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const isOpen = menu.style.display !== 'none';
            menu.style.display = isOpen ? 'none' : 'block';
            button.setAttribute('aria-expanded', !isOpen);
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) {
                menu.style.display = 'none';
                button.setAttribute('aria-expanded', 'false');
            }
        });

        wrapper.appendChild(button);
        wrapper.appendChild(menu);

        return wrapper;
    }

    /**
     * Create tab component
     * @param {object} options - Tab options
     * @returns {HTMLElement}
     */
    static createTabs(options = {}) {
        const {
            id = 'tabs-' + Date.now(),
            tabs = [],
            activeIndex = 0,
            onTabChange = null,
        } = options;

        const container = document.createElement('div');
        container.className = 'tabs-container';
        container.id = id;

        // Tab buttons
        const tabList = document.createElement('div');
        tabList.className = 'tabs-list';
        tabList.setAttribute('role', 'tablist');

        tabs.forEach((tab, index) => {
            const button = document.createElement('button');
            button.className = `tab-button${index === activeIndex ? ' active' : ''}`;
            button.setAttribute('role', 'tab');
            button.setAttribute('aria-selected', index === activeIndex);
            button.setAttribute('aria-controls', `${id}-panel-${index}`);
            button.textContent = this.escapeHtml(tab.label || '');

            button.addEventListener('click', () => {
                // Remove active from all tabs/panels
                tabList.querySelectorAll('.tab-button').forEach(t => {
                    t.classList.remove('active');
                    t.setAttribute('aria-selected', 'false');
                });
                container.querySelectorAll('.tab-panel').forEach(p => {
                    p.classList.remove('active');
                    p.setAttribute('aria-hidden', 'true');
                });

                // Add active to clicked tab/panel
                button.classList.add('active');
                button.setAttribute('aria-selected', 'true');
                const panel = document.getElementById(`${id}-panel-${index}`);
                if (panel) {
                    panel.classList.add('active');
                    panel.setAttribute('aria-hidden', 'false');
                }

                if (onTabChange) {
                    onTabChange(index, tab);
                }
            });

            tabList.appendChild(button);
        });

        container.appendChild(tabList);

        // Tab panels
        tabs.forEach((tab, index) => {
            const panel = document.createElement('div');
            panel.className = `tab-panel${index === activeIndex ? ' active' : ''}`;
            panel.id = `${id}-panel-${index}`;
            panel.setAttribute('role', 'tabpanel');
            panel.setAttribute('aria-labelledby', `${id}-btn-${index}`);
            panel.setAttribute('aria-hidden', index !== activeIndex);

            if (typeof tab.content === 'string') {
                panel.innerHTML = tab.content;
            } else if (tab.content instanceof HTMLElement) {
                panel.appendChild(tab.content);
            }

            container.appendChild(panel);
        });

        return container;
    }

    /**
     * Validate form and return errors
     * @param {HTMLFormElement} form - Form element
     * @returns {object} { isValid: boolean, errors: {} }
     */
    static validateForm(form) {
        const errors = {};
        const inputs = form.querySelectorAll('input, textarea, select');

        inputs.forEach((input) => {
            const fieldName = input.name || input.id;
            const value = input.value.trim();

            // Check required
            if (input.hasAttribute('required') && !value) {
                errors[fieldName] = 'This field is required';
                return;
            }

            // Check email
            if (input.type === 'email' && value && !this.validateEmail(value)) {
                errors[fieldName] = 'Please enter a valid email';
                return;
            }

            // Check minimum length
            if (input.hasAttribute('minlength')) {
                const minLength = parseInt(input.getAttribute('minlength'));
                if (value && value.length < minLength) {
                    errors[fieldName] = `Must be at least ${minLength} characters`;
                    return;
                }
            }

            // Check pattern
            if (input.hasAttribute('pattern')) {
                const pattern = new RegExp(input.getAttribute('pattern'));
                if (value && !pattern.test(value)) {
                    errors[fieldName] = 'Invalid format';
                    return;
                }
            }

            // Check password strength
            if (input.type === 'password' && input.hasAttribute('data-require-strength')) {
                const strength = this.validatePassword(value);
                if (strength.score < 3) {
                    errors[fieldName] = 'Password is too weak';
                    return;
                }
            }
        });

        return {
            isValid: Object.keys(errors).length === 0,
            errors: errors,
        };
    }

    /**
     * Display form errors
     * @param {HTMLFormElement} form - Form element
     * @param {object} errors - Error object
     */
    static displayFormErrors(form, errors) {
        // Clear previous errors
        form.querySelectorAll('.error-message').forEach(el => el.remove());

        // Display new errors
        Object.entries(errors).forEach(([fieldName, message]) => {
            const input = form.querySelector(`[name="${fieldName}"], #${fieldName}`);
            if (input) {
                input.classList.add('error');
                input.setAttribute('aria-invalid', 'true');

                const errorDiv = document.createElement('div');
                errorDiv.className = 'error-message';
                errorDiv.setAttribute('role', 'alert');
                errorDiv.textContent = message;

                input.parentNode.insertBefore(errorDiv, input.nextSibling);
            }
        });
    }

    /**
     * Clear form errors
     * @param {HTMLFormElement} form - Form element
     */
    static clearFormErrors(form) {
        form.querySelectorAll('.error').forEach(el => {
            el.classList.remove('error');
            el.setAttribute('aria-invalid', 'false');
        });
        form.querySelectorAll('.error-message').forEach(el => el.remove());
    }

    /**
     * Create password strength indicator
     * @param {string} password - Password string
     * @returns {HTMLElement}
     */
    static createPasswordStrengthMeter(password = '') {
        const meter = document.createElement('div');
        meter.className = 'password-strength-meter';

        const strength = this.validatePassword(password);
        const colors = ['#d32f2f', '#f57c00', '#fbc02d', '#388e3c'];
        const labels = ['Weak', 'Fair', 'Good', 'Strong'];

        meter.innerHTML = `
            <div class="strength-bar">
                <div class="strength-fill" style="width: ${(strength.score / 4) * 100}%; background-color: ${colors[strength.score] || '#ccc'};"></div>
            </div>
            <span class="strength-label" style="color: ${colors[strength.score] || '#999'};">${labels[strength.score] || 'Invalid'}</span>
        `;

        return meter;
    }

    /**
     * Debounce function
     * @param {Function} func - Function to debounce
     * @param {number} delay - Delay in milliseconds
     * @returns {Function}
     */
    static debounce(func, delay = 300) {
        let timeoutId;
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    /**
     * Throttle function
     * @param {Function} func - Function to throttle
     * @param {number} limit - Limit in milliseconds
     * @returns {Function}
     */
    static throttle(func, limit = 300) {
        let inThrottle;
        return function (...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => (inThrottle = false), limit);
            }
        };
    }

    /**
     * Count down timer for auctions
     * @param {number} endTime - End time in milliseconds
     * @param {Function} callback - Callback on tick
     * @returns {Function} Stop function
     */
    static startCountdown(endTime, callback) {
        const updateCountdown = () => {
            const now = Date.now();
            const remaining = Math.max(0, endTime - now);

            callback(remaining);

            if (remaining > 0) {
                return setTimeout(updateCountdown, 1000);
            }
        };

        return updateCountdown();
    }
}

// Create global instance
window.UIComponents = UIComponents;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIComponents;
}
