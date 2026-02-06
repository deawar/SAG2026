/**
 * Authentication Pages Module
 * Handles multi-step forms: login, register, 2FA, password-reset
 */

class AuthPages {
    constructor() {
        this.currentStep = 1;
        this.totalSteps = 3;
        this.formData = {};
        this.init();
    }

    /**
     * Initialize auth page components
     */
    init() {
        // Detect which auth page we're on
        const path = window.location.pathname;

        if (path.includes('register')) {
            this.initRegister();
        } else if (path.includes('2fa-setup')) {
            this.init2FASetup();
        } else if (path.includes('2fa-verify')) {
            this.init2FAVerify();
        } else if (path.includes('password-reset')) {
            this.initPasswordReset();
        } else if (path.includes('login')) {
            this.initLogin();
        }
    }

    /**
     * Initialize login form
     */
    initLogin() {
        const form = document.getElementById('login-form');
        if (!form) return;

        const loginBtn = form.querySelector('button[type="submit"]');
        const emailInput = form.querySelector('input[type="email"]');
        const passwordInput = form.querySelector('input[type="password"]');

        loginBtn.addEventListener('click', (e) => this.handleLogin(e, form));

        // Validation on change
        emailInput.addEventListener('blur', () => this.validateEmail(emailInput));
        passwordInput.addEventListener('blur', () => this.validatePassword(passwordInput));

        // Remove error message when user starts typing
        emailInput.addEventListener('input', () => this.clearFieldError(emailInput));
        passwordInput.addEventListener('input', () => this.clearFieldError(passwordInput));
    }

    /**
     * Handle login submission
     */
    async handleLogin(e, form) {
        e.preventDefault();

        const errors = UIComponents.validateForm(form);
        if (!errors.isValid) {
            UIComponents.displayFormErrors(form, errors.errors);
            return;
        }

        UIComponents.clearFormErrors(form);

        const email = form.querySelector('input[type="email"]').value;
        const password = form.querySelector('input[type="password"]').value;
        const rememberMe = form.querySelector('input[name="remember-me"]')?.checked;

        try {
            const loader = UIComponents.showLoading('Logging in...');

            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, rememberMe }),
            });

            const data = await response.json();
            UIComponents.hideLoading(loader);

            if (!response.ok) {
                UIComponents.showAlert(data.message || 'Login failed', 'error');
                return;
            }

            // Check if 2FA is required
            if (data.require2FA) {
                window.location.href = '/2fa-verify.html';
            } else {
                UIComponents.createToast({ message: 'Logged in successfully!', type: 'success' });
                setTimeout(() => window.location.href = '/index.html', 1000);
            }
        } catch (error) {
            console.error('Login error:', error);
            UIComponents.createToast({ message: 'Connection error', type: 'error' });
        }
    }

    /**
     * Initialize register form (multi-step)
     */
    initRegister() {
        this.currentStep = 1;
        this.totalSteps = 3;

        const form = document.getElementById('register-form');
        if (!form) return;

        const nextBtn = form.querySelector('#next-step-btn') || form.querySelector('.btn-next');
        const backBtn = form.querySelector('#prev-step-btn') || form.querySelector('.btn-back');
        const passwordInput = form.querySelector('input[name="password"]');

        nextBtn?.addEventListener('click', () => this.nextRegisterStep(form));
        backBtn?.addEventListener('click', () => this.prevRegisterStep(form));

        // Password requirement checker
        if (passwordInput) {
            passwordInput.addEventListener('input', () => this.updatePasswordRequirements(passwordInput));
            // Initialize requirements on page load
            this.updatePasswordRequirements(passwordInput);
        }

        // Age verification listener
        const dobInput = form.querySelector('input[name="dob"]');
        if (dobInput) {
            dobInput.addEventListener('change', () => this.checkCOPPA(form));
        }

        this.updateProgressIndicator();
    }

    /**
     * Validate current register step
     */
    validateRegisterStep(form) {
        const step = this.currentStep;
        let isValid = true;

        if (step === 1) {
            const fullName = form.querySelector('input[name="full-name"]');
            const email = form.querySelector('input[name="email"]');
            const dob = form.querySelector('input[name="dob"]');
            const password = form.querySelector('input[name="password"]');
            const confirmPass = form.querySelector('input[name="confirm-password"]');

            const errors = {};

            if (!fullName?.value.trim()) errors.fullname = 'Full name is required';
            if (!email?.value.trim()) errors.email = 'Email is required';
            else if (!UIComponents.validateEmail(email.value)) errors.email = 'Invalid email format';
            if (!dob?.value) errors.dob = 'Date of birth is required';
            if (!password?.value) {
                errors.password = 'Password is required';
            } else {
                // Check password complexity - must have all requirements
                const pwd = password.value;
                const requirements = {
                    minLength: pwd.length >= 12,
                    uppercase: /[A-Z]/.test(pwd),
                    lowercase: /[a-z]/.test(pwd),
                    number: /[0-9]/.test(pwd),
                    special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd)
                };

                const allMet = Object.values(requirements).every(req => req === true);
                
                if (!allMet) {
                    const missing = [];
                    if (!requirements.minLength) missing.push('12+ characters');
                    if (!requirements.uppercase) missing.push('uppercase letter');
                    if (!requirements.lowercase) missing.push('lowercase letter');
                    if (!requirements.number) missing.push('number');
                    if (!requirements.special) missing.push('special character');
                    errors.password = `Password must contain: ${missing.join(', ')}`;
                }
            }
            if (confirmPass?.value !== password?.value) errors.confirmpass = 'Passwords do not match';

            if (Object.keys(errors).length > 0) {
                UIComponents.displayFormErrors(form, errors);
                // Also show a toast for the password error
                if (errors.password) {
                    UIComponents.createToast({ message: errors.password, type: 'error' });
                }
                return false;
            }
        } else if (step === 2) {
            const street = form.querySelector('input[name="street"]');
            const city = form.querySelector('input[name="city"]');
            const state = form.querySelector('input[name="state"]');
            const zip = form.querySelector('input[name="zip"]');

            const errors = {};
            if (!street?.value.trim()) errors.street = 'Street address is required';
            if (!city?.value.trim()) errors.city = 'City is required';
            if (!state?.value.trim()) errors.state = 'State is required';
            if (!zip?.value.trim()) errors.zip = 'Postal code is required';

            if (Object.keys(errors).length > 0) {
                UIComponents.displayFormErrors(form, errors);
                return false;
            }
        } else if (step === 3) {
            const termsCheck = form.querySelector('input[name="accept-terms"]');
            const privacyCheck = form.querySelector('input[name="accept-privacy"]');

            if (!termsCheck?.checked || !privacyCheck?.checked) {
                UIComponents.showAlert('You must accept terms and privacy policy', 'warning');
                return false;
            }

            // Check COPPA if needed
            const coppaConsent = form.querySelector('input[name="parental-consent"]');
            if (coppaConsent && !coppaConsent.checked) {
                UIComponents.showAlert('Parental consent is required for users under 13', 'warning');
                return false;
            }
        }

        return true;
    }

    /**
     * Next register step
     */
    nextRegisterStep(form) {
        if (!this.validateRegisterStep(form)) return;

        if (this.currentStep < this.totalSteps) {
            this.saveStepData(form);
            this.currentStep++;
            this.updateProgressIndicator();
            this.showStep(form, this.currentStep);
            window.scrollTo(0, 0);
        } else {
            this.submitRegister(form);
        }
    }

    /**
     * Previous register step
     */
    prevRegisterStep(form) {
        if (this.currentStep > 1) {
            this.saveStepData(form);
            this.currentStep--;
            this.updateProgressIndicator();
            this.showStep(form, this.currentStep);
            window.scrollTo(0, 0);
        }
    }

    /**
     * Save step data
     */
    saveStepData(form) {
        const inputs = form.querySelectorAll('input, textarea, select');
        inputs.forEach((input) => {
            if (input.type === 'checkbox') {
                this.formData[input.name] = input.checked;
            } else {
                this.formData[input.name] = input.value;
            }
        });
    }

    /**
     * Show specific step
     */
    showStep(form, stepNumber) {
        const fieldsets = form.querySelectorAll('fieldset');
        fieldsets.forEach((fieldset, index) => {
            fieldset.style.display = (index + 1) === stepNumber ? 'block' : 'none';
        });
    }

    /**
     * Update progress indicator
     */
    updateProgressIndicator() {
        const steps = document.querySelectorAll('.progress-step');
        steps.forEach((step, index) => {
            step.classList.toggle('active', (index + 1) <= this.currentStep);
        });
    }

    /**
     * Check COPPA age requirement
     */
    checkCOPPA(form) {
        const dobInput = form.querySelector('input[name="dob"]');
        const parentalSection = form.querySelector('.parental-consent-section');

        if (!dobInput?.value || !parentalSection) return;

        const birthDate = new Date(dobInput.value);
        const today = new Date();
        const age = today.getFullYear() - birthDate.getFullYear();

        if (age < 13) {
            parentalSection.style.display = 'block';
            form.querySelector('input[name="parental-consent"]').setAttribute('required', 'true');
        } else {
            parentalSection.style.display = 'none';
            form.querySelector('input[name="parental-consent"]').removeAttribute('required');
        }
    }

    /**
     * Submit registration
     */
    async submitRegister(form) {
        this.saveStepData(form);

        try {
            const loader = UIComponents.showLoading('Creating account...');

            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.formData),
            });

            const data = await response.json();
            UIComponents.hideLoading(loader);

            if (!response.ok) {
                const errorMessage = data.message || 'Registration failed';
                UIComponents.createToast({ message: errorMessage, type: 'error' });
                UIComponents.showAlert(errorMessage, 'error');
                return;
            }

            UIComponents.createToast({ message: 'Account created successfully!', type: 'success' });
            setTimeout(() => window.location.href = '/login.html', 1500);
        } catch (error) {
            console.error('Registration error:', error);
            UIComponents.createToast({ message: 'Connection error: ' + error.message, type: 'error' });
        }
    }

    /**
     * Initialize 2FA setup
     */
    init2FASetup() {
        this.currentStep = 1;
        this.totalSteps = 2;

        const form = document.getElementById('twofa-setup-form');
        if (!form) return;

        const qrCode = form.querySelector('.qr-code');
        const manualEntry = form.querySelector('.manual-entry-details');
        const showManualBtn = form.querySelector('[data-show-manual]');

        // Toggle manual entry
        if (showManualBtn) {
            showManualBtn.addEventListener('click', () => {
                manualEntry.style.display = manualEntry.style.display === 'none' ? 'block' : 'none';
            });
        }

        // Generate QR code
        this.generateQRCode(qrCode);

        // Navigation
        const nextBtn = form.querySelector('.btn-next');
        const backBtn = form.querySelector('.btn-back');

        nextBtn?.addEventListener('click', () => this.next2FAStep(form));
        backBtn?.addEventListener('click', () => this.prev2FAStep(form));

        this.updateProgressIndicator();
    }

    /**
     * Generate QR code for 2FA
     */
    generateQRCode(container) {
        if (!container) return;

        // Placeholder: In production, use qrcode.js library
        // For now, show instruction
        container.innerHTML = `
            <div style="background: #f5f5f5; padding: 20px; border: 2px dashed #ccc; border-radius: 8px; text-align: center;">
                <p>📱 QR Code will be displayed here</p>
                <p style="font-size: 0.875rem; color: #666;">Use authenticator app to scan</p>
            </div>
        `;
    }

    /**
     * Navigate 2FA steps
     */
    next2FAStep(form) {
        if (this.currentStep < this.totalSteps) {
            this.currentStep++;
            this.updateProgressIndicator();
            this.showStep(form, this.currentStep);
        } else {
            this.submit2FASetup(form);
        }
    }

    prev2FAStep(form) {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.updateProgressIndicator();
            this.showStep(form, this.currentStep);
        }
    }

    /**
     * Submit 2FA setup
     */
    async submit2FASetup(form) {
        const codeInput = form.querySelector('input[name="twofa-code"]');
        const confirmCheck = form.querySelector('input[name="confirm-backup"]');

        if (!codeInput?.value.trim()) {
            UIComponents.showAlert('Please enter your 6-digit code', 'warning');
            return;
        }

        if (!confirmCheck?.checked) {
            UIComponents.showAlert('Please confirm you saved backup codes', 'warning');
            return;
        }

        try {
            const loader = UIComponents.showLoading('Enabling 2FA...');

            const response = await fetch('/api/auth/2fa/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: codeInput.value }),
            });

            UIComponents.hideLoading(loader);

            if (!response.ok) {
                UIComponents.showAlert('Invalid verification code', 'error');
                return;
            }

            UIComponents.createToast({ message: '2FA enabled successfully!', type: 'success' });
            setTimeout(() => window.location.href = '/user-dashboard.html', 1500);
        } catch (error) {
            console.error('2FA setup error:', error);
            UIComponents.createToast({ message: 'Connection error', type: 'error' });
        }
    }

    /**
     * Initialize 2FA verification
     */
    init2FAVerify() {
        const form = document.getElementById('twofa-verify-form');
        if (!form) return;

        const codeInput = form.querySelector('input[name="twofa-code"]');
        const backupForm = form.querySelector('[data-backup-form]');
        const useBackupBtn = form.querySelector('[data-use-backup]');

        // Auto-focus code input
        codeInput?.focus();

        // Toggle backup code form
        useBackupBtn?.addEventListener('click', () => {
            const isHidden = backupForm.style.display === 'none';
            backupForm.style.display = isHidden ? 'block' : 'none';
            if (isHidden) {
                form.querySelector('input[name="backup-code"]')?.focus();
            }
        });

        // Submit listener
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn?.addEventListener('click', (e) => this.submit2FAVerify(e, form));
    }

    /**
     * Submit 2FA verification
     */
    async submit2FAVerify(e, form) {
        e.preventDefault();

        const codeInput = form.querySelector('input[name="twofa-code"]');
        const backupCodeInput = form.querySelector('input[name="backup-code"]');
        const rememberDevice = form.querySelector('input[name="remember-device"]')?.checked;

        const code = codeInput?.value.trim();
        const backupCode = backupCodeInput?.value.trim();

        if (!code && !backupCode) {
            UIComponents.showAlert('Please enter a code', 'warning');
            return;
        }

        try {
            const loader = UIComponents.showLoading('Verifying...');

            const response = await fetch('/api/auth/2fa/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: code || undefined,
                    backupCode: backupCode || undefined,
                    rememberDevice,
                }),
            });

            UIComponents.hideLoading(loader);

            if (!response.ok) {
                UIComponents.showAlert('Invalid code', 'error');
                return;
            }

            UIComponents.createToast({ message: 'Verified successfully!', type: 'success' });
            setTimeout(() => window.location.href = '/user-dashboard.html', 1000);
        } catch (error) {
            console.error('2FA verify error:', error);
            UIComponents.createToast({ message: 'Connection error', type: 'error' });
        }
    }

    /**
     * Initialize password reset
     */
    initPasswordReset() {
        this.currentStep = 1;
        this.totalSteps = 3;

        const form = document.getElementById('password-reset-form');
        if (!form) return;

        const nextBtn = form.querySelector('.btn-next');
        const backBtn = form.querySelector('.btn-back');
        const resendBtn = form.querySelector('[data-resend-code]');

        nextBtn?.addEventListener('click', () => this.nextPasswordResetStep(form));
        backBtn?.addEventListener('click', () => this.prevPasswordResetStep(form));
        resendBtn?.addEventListener('click', () => this.resendResetCode(form));

        // Password input listener for strength meter
        const passwordInput = form.querySelector('input[name="new-password"]');
        if (passwordInput) {
            passwordInput.addEventListener('input', () => {
                const meter = document.querySelector('.password-strength-meter');
                if (meter) {
                    meter.replaceWith(UIComponents.createPasswordStrengthMeter(passwordInput.value));
                }
            });
        }

        this.updateProgressIndicator();
    }

    /**
     * Next password reset step
     */
    nextPasswordResetStep(form) {
        const step = this.currentStep;
        let isValid = false;

        if (step === 1) {
            const email = form.querySelector('input[name="email"]');
            if (email?.value && UIComponents.validateEmail(email.value)) {
                this.sendResetCode(form, email.value);
                isValid = true;
            } else {
                UIComponents.showAlert('Please enter a valid email', 'warning');
            }
        } else if (step === 2) {
            const code = form.querySelector('input[name="reset-code"]');
            if (code?.value.trim()) {
                isValid = true;
            } else {
                UIComponents.showAlert('Please enter the verification code', 'warning');
            }
        } else if (step === 3) {
            const newPass = form.querySelector('input[name="new-password"]');
            const confirmPass = form.querySelector('input[name="confirm-password"]');

            const errors = {};
            if (!newPass?.value) errors.newpassword = 'Password is required';
            else {
                const strength = UIComponents.validatePassword(newPass.value);
                if (strength.score < 2) errors.newpassword = 'Password too weak';
            }
            if (confirmPass?.value !== newPass?.value) errors.confirmpass = 'Passwords do not match';

            if (Object.keys(errors).length === 0) {
                isValid = true;
                this.submitPasswordReset(form);
            } else {
                UIComponents.displayFormErrors(form, errors);
            }
        }

        if (isValid && step < this.totalSteps) {
            this.currentStep++;
            this.updateProgressIndicator();
            this.showStep(form, this.currentStep);
            window.scrollTo(0, 0);
        }
    }

    /**
     * Previous password reset step
     */
    prevPasswordResetStep(form) {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.updateProgressIndicator();
            this.showStep(form, this.currentStep);
            window.scrollTo(0, 0);
        }
    }

    /**
     * Send reset code to email
     */
    async sendResetCode(form, email) {
        try {
            const response = await fetch('/api/auth/password-reset/send-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });

            const data = await response.json();

            if (!response.ok) {
                UIComponents.showAlert(data.message || 'Failed to send code', 'error');
                return false;
            }

            return true;
        } catch (error) {
            console.error('Send code error:', error);
            UIComponents.createToast({ message: 'Connection error', type: 'error' });
            return false;
        }
    }

    /**
     * Resend reset code
     */
    resendResetCode(form) {
        const email = form.querySelector('input[name="email"]');
        const timer = form.querySelector('[data-resend-timer]');

        if (!email?.value) {
            UIComponents.showAlert('Please go back and enter your email', 'warning');
            return;
        }

        this.sendResetCode(form, email.value);

        // Start cooldown timer
        let seconds = 60;
        const btn = event.target;
        btn.disabled = true;

        const countdown = setInterval(() => {
            seconds--;
            if (timer) timer.textContent = seconds;

            if (seconds === 0) {
                clearInterval(countdown);
                btn.disabled = false;
                if (timer) timer.textContent = '60';
            }
        }, 1000);
    }

    /**
     * Submit password reset
     */
    async submitPasswordReset(form) {
        const email = form.querySelector('input[name="email"]');
        const code = form.querySelector('input[name="reset-code"]');
        const newPassword = form.querySelector('input[name="new-password"]');

        try {
            const loader = UIComponents.showLoading('Resetting password...');

            const response = await fetch('/api/auth/password-reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email?.value,
                    code: code?.value,
                    newPassword: newPassword?.value,
                }),
            });

            const data = await response.json();
            UIComponents.hideLoading(loader);

            if (!response.ok) {
                UIComponents.showAlert(data.message || 'Reset failed', 'error');
                return;
            }

            UIComponents.createToast({ message: 'Password reset successfully!', type: 'success' });
            setTimeout(() => window.location.href = '/login.html', 1500);
        } catch (error) {
            console.error('Password reset error:', error);
            UIComponents.createToast({ message: 'Connection error', type: 'error' });
        }
    }

    /**
     * Validate email field
     */
    validateEmail(input) {
        const isValid = UIComponents.validateEmail(input.value);
        input.classList.toggle('error', !isValid && input.value);
        return isValid;
    }

    /**
     * Validate password field
     */
    validatePassword(input) {
        const isValid = input.value.length >= 8;
        input.classList.toggle('error', !isValid && input.value);
        return isValid;
    }

    /**
     * Update password requirements checklist
     */
    updatePasswordRequirements(passwordInput) {
        const password = passwordInput.value;
        
        // Define requirements
        const requirements = {
            'req-length': password.length >= 12,
            'req-uppercase': /[A-Z]/.test(password),
            'req-lowercase': /[a-z]/.test(password),
            'req-number': /[0-9]/.test(password),
            'req-special': /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
        };

        // Update UI
        Object.keys(requirements).forEach(reqId => {
            const reqElement = document.getElementById(reqId);
            if (reqElement) {
                reqElement.classList.toggle('met', requirements[reqId]);
                const check = reqElement.querySelector('.req-check');
                if (check) {
                    check.textContent = requirements[reqId] ? '✓' : '✗';
                }
            }
        });

        // Check if all requirements are met
        const allMet = Object.values(requirements).every(req => req === true);
        
        // Update password input styling
        if (password) {
            passwordInput.classList.toggle('valid', allMet);
            passwordInput.classList.toggle('error', !allMet);
        }
    }

    /**
     * Clear field error
     */
    clearFieldError(input) {
        input.classList.remove('error');
        const error = input.parentNode.querySelector('.error-message');
        if (error) error.remove();
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Initialize navbar (shared across all pages)
    UIComponents.initializeNavbar();
    
    // Initialize auth pages
    window.authPages = new AuthPages();
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthPages;
}
