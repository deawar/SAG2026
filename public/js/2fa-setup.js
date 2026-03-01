/**
 * 2FA Setup Handler
 * Manages TOTP setup and verification flow
 */

class TwoFactorAuthSetup {
    constructor() {
        this.currentSecret = null;
        this.currentQrCode = null;
        this.currentBackupCodes = null;
    }

    /**
     * Initialize 2FA setup page
     */
    async init() {
        // Redirect if not authenticated
        if (!authManager.getToken()) {
            window.location.href = '/';
            return;
        }
        this.setupEventListeners();
        // Auto-generate QR code on page load so it's visible in step 1
        await this.startSetup();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Next button (Step 1 to Step 2) - QR is already shown, just navigate
        const nextBtn = document.getElementById('next-2fa-btn');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (!this.currentSecret) {
                    UIComponents.showAlert('QR code is still loading, please wait...', 'info', 3000);
                    return;
                }
                this.goToStep2();
            });
        }

        // Copy secret button
        const copyBtn = document.getElementById('copy-secret-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                this.copySecretToClipboard();
            });
        }

        // Verify button (Step 2)
        const verifyBtn = document.getElementById('verify-2fa-btn');
        if (verifyBtn) {
            verifyBtn.addEventListener('click', async () => {
                await this.verify2FA();
            });
        }

        // Back button
        const backBtn = document.getElementById('back-2fa-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                this.goBack();
            });
        }

        // Complete button (after backup codes) - redirect to the right dashboard
        const completeBtn = document.getElementById('complete-2fa-btn');
        if (completeBtn) {
            completeBtn.addEventListener('click', () => {
                const user = authManager.getUser();
                const adminRoles = ['SUPER_ADMIN', 'SITE_ADMIN', 'SCHOOL_ADMIN'];
                if (user && adminRoles.includes(user.role)) {
                    window.location.href = '/admin-dashboard.html';
                } else {
                    window.location.href = '/user-dashboard.html';
                }
            });
        }

        // Download backup codes
        const downloadBtn = document.getElementById('download-codes-btn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => {
                this.downloadBackupCodes();
            });
        }

        // Copy backup codes
        const copyCodesBtn = document.getElementById('copy-codes-btn');
        if (copyCodesBtn) {
            copyCodesBtn.addEventListener('click', () => {
                this.copyBackupCodesToClipboard();
            });
        }
    }

    /**
     * Start 2FA setup - call backend to generate secret and QR code
     */
    async startSetup() {
        const loader = UIComponents.showLoading('Generating QR code...');

        try {
            const response = await apiClient.request('POST', '/api/auth/2fa/setup', {
                headers: { 'Authorization': `Bearer ${authManager.getToken()}` }
            });

            if (response.success && response.data) {
                this.currentSecret = response.data.secret;
                this.currentQrCode = response.data.qrCode;
                this.currentBackupCodes = response.data.backupCodes || [];

                // Display QR code
                this.displayQRCode(response.data.qrCode);
                
                // Display secret code
                this.displaySecretCode(response.data.secret);

                // Move to step 2
                this.goToStep2();

                UIComponents.hideLoading(loader);
            } else {
                UIComponents.hideLoading(loader);
                UIComponents.showAlert('Failed to generate 2FA setup', 'error', 5000);
            }
        } catch (error) {
            UIComponents.hideLoading(loader);
            UIComponents.showAlert('Error: ' + error.message, 'error', 5000);
        }
    }

    /**
     * Display QR code
     */
    displayQRCode(qrCodeUrl) {
        const qrImg = document.getElementById('qr-code');
        if (qrImg && qrCodeUrl) {
            // QR code is a data URL or image URL
            qrImg.src = qrCodeUrl;
            qrImg.alt = 'QR code for 2FA setup - scan with authenticator app';
        }
    }

    /**
     * Display secret code for manual entry
     */
    displaySecretCode(secret) {
        const secretEl = document.getElementById('secret-code');
        if (secretEl && secret) {
            // Show only the first 12 characters, rest as dots for privacy
            const displaySecret = secret.substring(0, 12) + '•'.repeat(Math.max(0, secret.length - 12));
            secretEl.textContent = displaySecret;
            secretEl.dataset.fullSecret = secret;
        }
    }

    /**
     * Copy secret code to clipboard
     */
    copySecretToClipboard() {
        const secretEl = document.getElementById('secret-code');
        if (secretEl && secretEl.dataset.fullSecret) {
            navigator.clipboard.writeText(secretEl.dataset.fullSecret).then(() => {
                UIComponents.showAlert('Secret code copied to clipboard', 'success', 2000);
            }).catch(() => {
                UIComponents.showAlert('Failed to copy code', 'error', 3000);
            });
        }
    }

    /**
     * Verify 2FA code
     */
    async verify2FA() {
        const codeInput = document.getElementById('2fa-code-input');
        const code = codeInput?.value?.trim();

        if (!code || code.length !== 6 || !/^\d+$/.test(code)) {
            UIComponents.showAlert('Please enter a valid 6-digit code', 'error', 3000);
            return;
        }

        const loader = UIComponents.showLoading('Verifying code...');

        try {
            const response = await apiClient.request('POST', '/api/auth/2fa/verify', {
                body: {
                    secret: this.currentSecret,
                    code: code
                },
                headers: { 'Authorization': `Bearer ${authManager.getToken()}` }
            });

            if (response.success) {
                UIComponents.hideLoading(loader);
                UIComponents.showAlert('2FA enabled successfully!', 'success', 2000);
                
                // Move to backup codes step
                setTimeout(() => {
                    this.goToStep3();
                }, 500);
            } else {
                UIComponents.hideLoading(loader);
                UIComponents.showAlert(response.message || 'Invalid code', 'error', 3000);
                codeInput.value = '';
                codeInput.focus();
            }
        } catch (error) {
            UIComponents.hideLoading(loader);
            UIComponents.showAlert('Error: ' + error.message, 'error', 5000);
        }
    }

    /**
     * Go to step 2 (verify code)
     */
    goToStep2() {
        const step1 = document.getElementById('step-1-fieldset');
        const step2 = document.getElementById('step-2-fieldset');
        const progress = document.querySelector('[role="progressbar"]');

        if (step1) step1.style.display = 'none';
        if (step2) step2.style.display = 'block';
        if (progress) {
            progress.setAttribute('aria-valuenow', '2');
            const steps = document.querySelectorAll('.progress-step');
            steps.forEach((step, i) => {
                if (i === 0) step.classList.remove('active');
                if (i === 1) {
                    step.classList.add('active');
                    step.setAttribute('aria-current', 'step');
                }
            });
        }

        // Focus on code input
        const codeInput = document.getElementById('2fa-code-input');
        if (codeInput) codeInput.focus();
    }

    /**
     * Go to step 3 (success / backup codes already shown in step 2)
     */
    goToStep3() {
        const form = document.getElementById('2fa-form');
        const successSection = document.getElementById('success-section');

        if (form) form.style.display = 'none';
        if (successSection) successSection.style.display = 'block';
    }

    /**
     * Display backup codes
     */
    displayBackupCodes() {
        const codesList = document.getElementById('backup-codes-list');
        if (codesList && this.currentBackupCodes.length > 0) {
            codesList.innerHTML = this.currentBackupCodes
                .map(code => `<li class="backup-code"><code>${code}</code></li>`)
                .join('');
        }
    }

    /**
     * Download backup codes as text file
     */
    downloadBackupCodes() {
        const codesText = 'Silent Auction Gallery - Backup Codes\n' +
                         '=====================================\n\n' +
                         'Save these codes in a safe place. Each code can be used once if you lose access to your authenticator app.\n\n' +
                         this.currentBackupCodes.join('\n');

        const element = document.createElement('a');
        element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(codesText));
        element.setAttribute('download', 'sag-backup-codes.txt');
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);

        UIComponents.showAlert('Backup codes downloaded', 'success', 2000);
    }

    /**
     * Copy backup codes to clipboard
     */
    copyBackupCodesToClipboard() {
        const codesText = this.currentBackupCodes.join('\n');
        navigator.clipboard.writeText(codesText).then(() => {
            UIComponents.showAlert('Backup codes copied to clipboard', 'success', 2000);
        }).catch(() => {
            UIComponents.showAlert('Failed to copy codes', 'error', 3000);
        });
    }

    /**
     * Go back to previous step
     */
    goBack() {
        const step2 = document.getElementById('step-2-fieldset');
        const step1 = document.getElementById('step-1-fieldset');

        if (step2 && step2.style.display !== 'none') {
            if (step2) step2.style.display = 'none';
            if (step1) step1.style.display = 'block';

            const progress = document.querySelector('[role="progressbar"]');
            if (progress) {
                progress.setAttribute('aria-valuenow', '1');
                const steps = document.querySelectorAll('.progress-step');
                steps.forEach((step, i) => {
                    if (i === 0) step.classList.add('active');
                    if (i === 1) step.classList.remove('active');
                });
            }
        }
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    const twoFactorSetup = new TwoFactorAuthSetup();
    await twoFactorSetup.init();
});
