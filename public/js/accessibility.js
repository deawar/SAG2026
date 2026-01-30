/**
 * Accessibility Utilities
 * WCAG 2.1 AA Compliance Helpers
 */

class AccessibilityManager {
    constructor() {
        this.setupKeyboardNavigation();
        this.setupAriaLive();
        this.setupFocusManagement();
    }

    /**
     * Setup keyboard navigation
     */
    setupKeyboardNavigation() {
        // Escape key closes modals
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                const openModal = document.querySelector('.modal[style*="display: flex"]');
                if (openModal) {
                    openModal.style.display = 'none';
                }
            }
        });

        // Enter key activates buttons
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && event.target.hasAttribute('role') && 
                event.target.getAttribute('role') === 'button') {
                event.target.click();
            }
        });
    }

    /**
     * Setup ARIA live regions
     */
    setupAriaLive() {
        // Create or get main live region
        let liveRegion = document.querySelector('[aria-live="polite"]');
        if (!liveRegion) {
            liveRegion = document.createElement('div');
            liveRegion.setAttribute('aria-live', 'polite');
            liveRegion.setAttribute('aria-atomic', 'true');
            liveRegion.className = 'sr-only';
            document.body.appendChild(liveRegion);
        }

        window.announceLive = (message) => {
            liveRegion.textContent = message;
        };
    }

    /**
     * Setup focus management
     */
    setupFocusManagement() {
        // Move focus to main content when navigating
        document.addEventListener('click', (event) => {
            const link = event.target.closest('a');
            if (link && link.href && !link.href.startsWith('#')) {
                // Link is being followed, focus will be moved by page load
            }
        });

        // Restore focus after modal closes
        window.addEventListener('modalClosed', (event) => {
            this.restoreFocus();
        });
    }

    /**
     * Announce message to screen readers
     * @param {string} message - Message to announce
     * @param {string} type - Announcement type (polite, assertive)
     */
    static announce(message, type = 'polite') {
        const region = document.createElement('div');
        region.setAttribute('aria-live', type);
        region.setAttribute('aria-atomic', 'true');
        region.className = 'sr-only';
        region.textContent = message;

        document.body.appendChild(region);

        // Remove after announcement
        setTimeout(() => {
            region.remove();
        }, 1000);
    }

    /**
     * Set page title for screen readers
     * @param {string} title - Page title
     */
    static setPageTitle(title) {
        document.title = title;
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            const existingH1 = mainContent.querySelector('h1');
            if (existingH1) {
                existingH1.textContent = title;
            }
        }
    }

    /**
     * Create accessible alert
     * @param {string} message - Alert message
     * @param {string} type - Alert type
     */
    static createAlert(message, type = 'info') {
        const alert = document.createElement('div');
        alert.className = `alert alert-${type}`;
        alert.setAttribute('role', 'alert');
        alert.textContent = message;

        const container = document.getElementById('alert-container');
        if (container) {
            container.appendChild(alert);
        }

        return alert;
    }

    /**
     * Create accessible tooltip
     * @param {HTMLElement} element - Target element
     * @param {string} text - Tooltip text
     */
    static createTooltip(element, text) {
        const id = `tooltip-${Math.random().toString(36).substr(2, 9)}`;
        
        const tooltip = document.createElement('div');
        tooltip.id = id;
        tooltip.className = 'tooltip';
        tooltip.setAttribute('role', 'tooltip');
        tooltip.textContent = text;

        element.setAttribute('aria-describedby', id);
        element.parentNode.appendChild(tooltip);

        // Show on hover or focus
        element.addEventListener('mouseenter', () => {
            tooltip.style.display = 'block';
        });

        element.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
        });

        element.addEventListener('focus', () => {
            tooltip.style.display = 'block';
        });

        element.addEventListener('blur', () => {
            tooltip.style.display = 'none';
        });
    }

    /**
     * Create accessible combobox
     * @param {HTMLElement} container - Container element
     * @param {Array} options - Option objects with label, value
     * @param {function} onSelect - Selection callback
     */
    static createCombobox(container, options, onSelect) {
        const id = container.id || `combobox-${Math.random().toString(36).substr(2, 9)}`;
        
        const input = document.createElement('input');
        input.id = id;
        input.className = 'combobox-input';
        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-expanded', 'false');

        const listId = `${id}-listbox`;
        const listbox = document.createElement('ul');
        listbox.id = listId;
        listbox.className = 'combobox-listbox';
        listbox.setAttribute('role', 'listbox');

        input.setAttribute('aria-controls', listId);

        options.forEach((option, index) => {
            const item = document.createElement('li');
            item.setAttribute('role', 'option');
            item.setAttribute('id', `${id}-option-${index}`);
            item.textContent = option.label;
            item.className = 'combobox-option';

            item.addEventListener('click', () => {
                input.value = option.label;
                onSelect(option);
                input.setAttribute('aria-expanded', 'false');
                listbox.style.display = 'none';
            });

            listbox.appendChild(item);
        });

        input.addEventListener('focus', () => {
            input.setAttribute('aria-expanded', 'true');
            listbox.style.display = 'block';
        });

        input.addEventListener('blur', () => {
            setTimeout(() => {
                input.setAttribute('aria-expanded', 'false');
                listbox.style.display = 'none';
            }, 100);
        });

        input.addEventListener('input', (event) => {
            const filter = event.target.value.toLowerCase();
            listbox.querySelectorAll('[role="option"]').forEach(item => {
                const match = item.textContent.toLowerCase().includes(filter);
                item.style.display = match ? 'block' : 'none';
            });
        });

        container.appendChild(input);
        container.appendChild(listbox);

        return { input, listbox };
    }

    /**
     * Create accessible tabs
     * @param {HTMLElement} container - Container element
     * @param {Array} tabs - Tab objects with label, content
     */
    static createTabs(container, tabs) {
        const tablist = document.createElement('div');
        tablist.setAttribute('role', 'tablist');
        tablist.className = 'tabs-list';

        const tabpanels = document.createElement('div');
        tabpanels.className = 'tabs-content';

        tabs.forEach((tab, index) => {
            const tabId = `tab-${Math.random().toString(36).substr(2, 9)}`;
            const panelId = `panel-${tabId}`;

            // Tab button
            const tabBtn = document.createElement('button');
            tabBtn.setAttribute('role', 'tab');
            tabBtn.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
            tabBtn.setAttribute('aria-controls', panelId);
            tabBtn.className = `tab-button ${index === 0 ? 'active' : ''}`;
            tabBtn.textContent = tab.label;

            tabBtn.addEventListener('click', () => {
                // Deactivate all tabs
                tablist.querySelectorAll('[role="tab"]').forEach(t => {
                    t.setAttribute('aria-selected', 'false');
                    t.classList.remove('active');
                });

                tabpanels.querySelectorAll('[role="tabpanel"]').forEach(p => {
                    p.style.display = 'none';
                });

                // Activate current tab
                tabBtn.setAttribute('aria-selected', 'true');
                tabBtn.classList.add('active');
                document.getElementById(panelId).style.display = 'block';
            });

            tablist.appendChild(tabBtn);

            // Tab panel
            const panel = document.createElement('div');
            panel.setAttribute('role', 'tabpanel');
            panel.id = panelId;
            panel.setAttribute('aria-labelledby', tabId);
            panel.style.display = index === 0 ? 'block' : 'none';
            
            if (typeof tab.content === 'string') {
                panel.innerHTML = tab.content;
            } else {
                panel.appendChild(tab.content);
            }

            tabpanels.appendChild(panel);
        });

        container.appendChild(tablist);
        container.appendChild(tabpanels);
    }

    /**
     * Create accessible dialog/modal
     * @param {string} title - Dialog title
     * @param {string} content - Dialog content
     * @param {Array} buttons - Action buttons
     * @returns {Promise}
     */
    static createDialog(title, content, buttons = []) {
        return new Promise((resolve) => {
            const dialogId = `dialog-${Math.random().toString(36).substr(2, 9)}`;
            
            const dialog = document.createElement('div');
            dialog.id = dialogId;
            dialog.className = 'modal';
            dialog.setAttribute('role', 'dialog');
            dialog.setAttribute('aria-modal', 'true');
            dialog.setAttribute('aria-labelledby', `${dialogId}-title`);

            const content_div = document.createElement('div');
            content_div.className = 'modal-content modal-medium';

            const title_h2 = document.createElement('h2');
            title_h2.id = `${dialogId}-title`;
            title_h2.textContent = title;
            content_div.appendChild(title_h2);

            const body = document.createElement('div');
            if (typeof content === 'string') {
                body.innerHTML = content;
            } else {
                body.appendChild(content);
            }
            content_div.appendChild(body);

            const buttonGroup = document.createElement('div');
            buttonGroup.style.display = 'flex';
            buttonGroup.style.gap = '1rem';
            buttonGroup.style.justifyContent = 'flex-end';
            buttonGroup.style.marginTop = '2rem';

            buttons.forEach(btn => {
                const button = document.createElement('button');
                button.className = `btn ${btn.className || 'btn-secondary'}`;
                button.textContent = btn.label;

                button.addEventListener('click', () => {
                    dialog.remove();
                    resolve(btn.value || true);
                });

                buttonGroup.appendChild(button);
            });

            content_div.appendChild(buttonGroup);
            dialog.appendChild(content_div);
            dialog.style.display = 'flex';

            document.body.appendChild(dialog);

            // Focus trap
            const focusables = content_div.querySelectorAll('button, [href], input, select, textarea');
            if (focusables.length > 0) {
                focusables[0].focus();
            }
        });
    }

    /**
     * Check if user prefers reduced motion
     * @returns {boolean}
     */
    static prefersReducedMotion() {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    /**
     * Check if user prefers high contrast
     * @returns {boolean}
     */
    static prefersHighContrast() {
        return window.matchMedia('(prefers-contrast: more)').matches;
    }

    /**
     * Check if user prefers dark mode
     * @returns {boolean}
     */
    static prefersDarkMode() {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    /**
     * Get current page heading hierarchy
     * @returns {Array} Headings in order
     */
    static getHeadingHierarchy() {
        const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        return Array.from(headings).map(h => ({
            level: parseInt(h.tagName[1]),
            text: h.textContent,
            element: h,
        }));
    }

    /**
     * Validate heading hierarchy
     * @returns {object} Validation results
     */
    static validateHeadingHierarchy() {
        const headings = this.getHeadingHierarchy();
        const issues = [];

        for (let i = 0; i < headings.length - 1; i++) {
            const current = headings[i].level;
            const next = headings[i + 1].level;

            if (next - current > 1) {
                issues.push(`Heading level jump from H${current} to H${next}`);
            }
        }

        return {
            valid: issues.length === 0,
            issues: issues,
        };
    }

    /**
     * Restore focus to previously focused element
     */
    restoreFocus() {
        const previousFocus = window._previousFocus;
        if (previousFocus && document.body.contains(previousFocus)) {
            previousFocus.focus();
        }
    }

    /**
     * Save focus before navigation
     */
    saveFocus() {
        window._previousFocus = document.activeElement;
    }
}

// Create global instance
window.accessibilityManager = new AccessibilityManager();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AccessibilityManager;
}
