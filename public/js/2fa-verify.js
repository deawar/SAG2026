/**
 * 2FA Verification Handler
 * Manages 2FA verification during login
 */

class TwoFactorAuthVerify {
    constructor() {
        this.tempToken = null;
        this.userId = null;
    }

    /**
     * Initialize 2FA verification
     */
    async init() {
        // Check if we have a temp token in localStorage (set after login with 2FA enabled)
        this.tempToken = localStorage.getItem('2fa_token');
        this.userId = localStorage.getItem('2fa_user_id');

        if (!this.tempToken || !this.userId) {
            // Redirect to home if no 2FA verification needed
            window.location.href = '/';
            return;
        }

        this.setupEventListeners();
        this.focusCodeInput();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Verify button
        const verifyBtn = document.getElementById('verify-2fa-login-btn');
        if (verifyBtn) {
            verifyBtn.addEventListener('click', async () => {
                await this.verify();
            });
        }

        // Code input - allow Enter key
        const codeInput = document.getElementById('2fa-login-code');
        if (codeInput) {
            codeInput.addEventListener('keypress', async (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    await this.verify();
                }
            });
        }

        // Use backup code button
        const backupBtn = document.getElementById('use-backup-code-btn');
        if (backupBtn) {
            backupBtn.addEventListener('click', () => {
                this.toggleBackupCodeInput();
            });
        }
    }

    /**
     * Verify 2FA code
     */
    async verify() {
        const codeInput = document.getElementById('2fa-login-code');
        const code = codeInput?.value?.trim();

        if (!code || code.length !== 6 || !/^\d+$/.test(code)) {
            UIComponents.showAlert('Please enter a valid 6-digit code', 'error', 3000);
            return;
        }

        const loader = UIComponents.showLoading('Verifying code...');

        try {
            // Call backend to verify 2FA code and complete login
            const response = await fetch('/api/auth/verify-2fa', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.tempToken}`
                },
                body: JSON.stringify({ code })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                UIComponents.hideLoading(loader);
                
                // Store the real access token
                authManager.setToken(data.data.accessToken);
                if (data.data.refreshToken) {
                    authManager.setRefreshToken(data.data.refreshToken);
                }
                authManager.setUser({
                    id: this.userId,
                    email: data.data.email,
                    role: data.data.role
                });

                // Clear 2FA temp data
                localStorage.removeItem('2fa_token');
                localStorage.removeItem('2fa_user_id');

                UIComponents.showAlert('Login successful!', 'success', 2000);
                setTimeout(() => {
                    window.location.href = '/';
                }, 500);
            } else {
                UIComponents.hideLoading(loader);
                UIComponents.showAlert(data.message || 'Invalid code', 'error', 3000);
                codeInput.value = '';
                codeInput.focus();
            }
        } catch (error) {
            UIComponents.hideLoading(loader);
            UIComponents.showAlert('Error: ' + error.message, 'error', 5000);
        }
    }

    /**
     * Toggle backup code input
     */
    toggleBackupCodeInput() {
        const backupSection = document.getElementById('backup-code-section');
        if (backupSection) {
            if (backupSection.style.display === 'none') {
                backupSection.style.display = 'block';
                const backupInput = document.getElementById('2fa-login-backup-code');
                if (backupInput) backupInput.focus();
            } else {
                backupSection.style.display = 'none';
            }
        }
    }

    /**
     * Focus code input
     */
    focusCodeInput() {
        const codeInput = document.getElementById('2fa-login-code');
        if (codeInput) {
            setTimeout(() => codeInput.focus(), 100);
        }
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    const twoFactorVerify = new TwoFactorAuthVerify();
    await twoFactorVerify.init();
});
