/**
 * ThemeManager — School Color Theming
 *
 * Manages the application of school-specific color themes at runtime.
 * When a school is selected, call ThemeManager.apply(school) to instantly
 * update all --school-* CSS variables, which cascade through the entire UI.
 *
 * Theme data shape:
 *   {
 *     id:              string   — unique school identifier (e.g. "lincoln-high")
 *     name:            string   — display name (e.g. "Lincoln High School")
 *     primary:         string   — hex color (e.g. "#A41034")
 *     primaryDark:     string   — darker shade for hover/focus states
 *     primaryLight:    string   — lighter shade for backgrounds/accents
 *     secondary:       string   — accent/secondary brand color
 *     secondaryDark:   string   — darker shade of secondary
 *     secondaryLight:  string   — lighter shade of secondary
 *   }
 *
 * Usage:
 *   ThemeManager.apply(schoolObject);      // apply a school theme
 *   ThemeManager.reset();                  // return to SAG defaults
 *   ThemeManager.getCurrent();             // returns stored school or null
 *   ThemeManager.restoreFromStorage();     // call on page load to persist theme
 */

const ThemeManager = (() => {
    const STORAGE_KEY = 'sag_school_theme';
    const ROOT = document.documentElement;

    // SAG default colors — matches the --school-* defaults in main.css
    const DEFAULTS = {
        id:             'default',
        name:           'Silent Auction Gallery',
        primary:        '#1976d2',
        primaryDark:    '#1565c0',
        primaryLight:   '#42a5f5',
        secondary:      '#388e3c',
        secondaryDark:  '#2e7d32',
        secondaryLight: '#66bb6a',
    };

    /**
     * Apply a school's color theme to the page.
     * @param {object} school - School theme data object (see shape above).
     */
    function apply(school) {
        if (!school || typeof school !== 'object') return;

        ROOT.style.setProperty('--school-primary',        school.primary        || DEFAULTS.primary);
        ROOT.style.setProperty('--school-primary-dark',   school.primaryDark    || DEFAULTS.primaryDark);
        ROOT.style.setProperty('--school-primary-light',  school.primaryLight   || DEFAULTS.primaryLight);
        ROOT.style.setProperty('--school-secondary',      school.secondary      || DEFAULTS.secondary);
        ROOT.style.setProperty('--school-secondary-dark', school.secondaryDark  || DEFAULTS.secondaryDark);
        ROOT.style.setProperty('--school-secondary-light',school.secondaryLight || DEFAULTS.secondaryLight);

        // Persist to localStorage so theme survives page navigation
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(school));
        } catch (e) {
            // Storage unavailable — theme still applied for this page
        }

        // Dispatch event so other modules can react (e.g. update school name in UI)
        document.dispatchEvent(new CustomEvent('schoolThemeChanged', { detail: school }));
    }

    /**
     * Reset all school colors back to SAG defaults.
     */
    function reset() {
        // Remove inline style overrides — CSS defaults take over
        ROOT.style.removeProperty('--school-primary');
        ROOT.style.removeProperty('--school-primary-dark');
        ROOT.style.removeProperty('--school-primary-light');
        ROOT.style.removeProperty('--school-secondary');
        ROOT.style.removeProperty('--school-secondary-dark');
        ROOT.style.removeProperty('--school-secondary-light');

        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (e) { /* ignore */ }

        document.dispatchEvent(new CustomEvent('schoolThemeChanged', { detail: null }));
    }

    /**
     * Get the currently stored school theme, or null if using defaults.
     * @returns {object|null}
     */
    function getCurrent() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? JSON.parse(stored) : null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Restore the saved school theme from localStorage.
     * Call this once on every page load (e.g. in a shared init script).
     */
    function restoreFromStorage() {
        const school = getCurrent();
        if (school && school.id !== 'default') {
            apply(school);
        }
    }

    return { apply, reset, getCurrent, restoreFromStorage };
})();

// Auto-restore on load so theme persists across page navigation
ThemeManager.restoreFromStorage();
