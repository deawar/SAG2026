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
}

// Create global instance
window.UIComponents = UIComponents;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIComponents;
}
