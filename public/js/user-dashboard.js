/**
 * User Dashboard Module
 * Handles user account management, bid history, and security settings
 */

class UserDashboard {
  constructor() {
    this.currentTab = 'active-bids';
    this.user = null;
    this.init();
  }

  /**
     * Initialize dashboard
     */
  async init() {
    await this.loadUserData();
    this.attachEventListeners();
    this.setupTabs();
  }

  /**
     * Load user data from API
     */
  async loadUserData() {
    try {
      const response = await fetch('/api/user/profile', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = '/login.html';
        } else {
          UIComponents.showAlert(data.message || 'Failed to load user data', 'error');
        }
        return;
      }

      // Use data.data (the API response structure)
      this.user = data.data;
      this.displayUserData();
    } catch (error) {
      console.error('Load user data error:', error);
      UIComponents.createToast({
        message: 'Connection error',
        type: 'error'
      });
    }
  }

  /**
     * Display user data in dashboard
     */
  displayUserData() {
    if (!this.user) {return;}

    // Update profile section
    const nameInput = document.querySelector('input[name="full-name"]');
    if (nameInput) {nameInput.value = `${this.user.firstName || ''} ${this.user.lastName || ''}`.trim();}

    const emailInput = document.querySelector('input[name="email"]');
    if (emailInput) {emailInput.value = this.user.email || '';}

    const phoneInput = document.querySelector('input[name="phone"]');
    if (phoneInput) {phoneInput.value = this.user.phoneNumber || '';}

    // Update role display
    const roleDisplay = document.querySelector('[data-role-display]');
    if (roleDisplay) {roleDisplay.textContent = (this.user.role || 'User').toUpperCase();}

    // Update account status display
    const statusDisplay = document.querySelector('[data-status-display]');
    if (statusDisplay) {statusDisplay.textContent = this.user.accountStatus === 'ACTIVE' ? 'Active' : 'Inactive';}

    // Update notification preferences
    this.loadNotificationPreferences();

    // Update security settings
    this.load2FAStatus();

    // Show artwork tab and load data for students
    if (this.user.role === 'STUDENT') {
      const artworkTab = document.getElementById('tab-artwork');
      if (artworkTab) {artworkTab.style.display = '';}
      this.loadArtworkAuctions();
      this.loadArtworkSubmissions();
      this.setupArtworkForm();
    }

    // Load bid data
    this.loadActiveBids();
    this.loadBidHistory();
    this.loadWins();
  }

  /**
     * Attach event listeners
     */
  attachEventListeners() {
    // Profile form
    const profileForm = document.querySelector('[data-form="profile"]');
    if (profileForm) {
      const submitBtn = profileForm.querySelector('button[type="submit"]');
      submitBtn?.addEventListener('click', (e) => this.saveProfile(e, profileForm));
    }

    // Address form
    const addressForm = document.querySelector('[data-form="address"]');
    if (addressForm) {
      const submitBtn = addressForm.querySelector('button[type="submit"]');
      submitBtn?.addEventListener('click', (e) => this.saveAddress(e, addressForm));
    }

    // Password change form
    const passwordForm = document.querySelector('[data-form="password"]');
    if (passwordForm) {
      const submitBtn = passwordForm.querySelector('button[type="submit"]');
      submitBtn?.addEventListener('click', (e) => this.changePassword(e, passwordForm));
    }

    // Notification preferences
    const notifCheckboxes = document.querySelectorAll('input[name^="notification-"]');
    notifCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', () => this.saveNotificationPreferences());
    });

    // 2FA toggle
    const enable2FABtn = document.querySelector('[data-enable-2fa]');
    if (enable2FABtn) {
      enable2FABtn.addEventListener('click', () => {
        window.location.href = '/2fa-setup.html';
      });
    }

    // Delete account button
    const deleteBtn = document.querySelector('[data-delete-account]');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => this.confirmDeleteAccount());
    }

    // Logout button
    const logoutBtn = document.querySelector('[data-logout]');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.logout());
    }
  }

  /**
     * Setup tab navigation
     */
  setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabName = btn.getAttribute('aria-controls');
        this.switchTab(tabName);
      });
    });

    // Activate tab from URL hash (e.g. /user-dashboard.html#account)
    const hash = window.location.hash.slice(1);
    if (hash && document.getElementById(hash)) {
      this.switchTab(hash);
    }
  }

  /**
     * Switch tab
     */
  switchTab(tabName) {
    // Update buttons
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(btn => {
      btn.classList.remove('active');
      btn.setAttribute('aria-selected', 'false');
      btn.setAttribute('tabindex', '-1');
    });

    const activeBtn = document.querySelector(`.tab-button[aria-controls="${tabName}"]`);
    if (activeBtn) {
      activeBtn.classList.add('active');
      activeBtn.setAttribute('aria-selected', 'true');
      activeBtn.setAttribute('tabindex', '0');
    }

    // Update panels
    const tabPanels = document.querySelectorAll('.tab-content');
    tabPanels.forEach(panel => {
      panel.style.display = 'none';
      panel.setAttribute('aria-hidden', 'true');
    });

    const activePanel = document.getElementById(tabName);
    if (activePanel) {
      activePanel.style.display = '';
      activePanel.setAttribute('aria-hidden', 'false');

      // Load data for this tab
      if (tabName === 'active-bids') {
        this.loadActiveBids();
      } else if (tabName === 'bid-history') {
        this.loadBidHistory();
      } else if (tabName === 'wins') {
        this.loadWins();
      } else if (tabName === 'my-artwork') {
        this.loadArtworkSubmissions();
      }
    }

    this.currentTab = tabName;
  }

  /**
     * Load active bids
     */
  async loadActiveBids() {
    try {
      const response = await fetch('/api/user/bids/active', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        this.displayActiveBids(data.bids || []);
      }
    } catch (error) {
      console.error('Load active bids error:', error);
    }
  }

  /**
     * Display active bids
     */
  displayActiveBids(bids) {
    const list = document.querySelector('[data-list="active-bids"]');
    if (!list) {return;}

    list.innerHTML = '';

    if (bids.length === 0) {
      list.innerHTML = '<p class="text-muted">No active bids</p>';
      return;
    }

    bids.forEach(bid => {
      const item = document.createElement('li');
      item.className = 'bid-item';
      item.innerHTML = `
                <div class="bid-info">
                    <h4><a href="/auction-detail.html?id=${bid.auctionId}">${this.escapeHtml(bid.auctionTitle)}</a></h4>
                    <p class="auction-school">${this.escapeHtml(bid.school || 'N/A')}</p>
                </div>
                <div class="bid-amount">
                    <strong>${UIComponents.formatCurrency(bid.amount)}</strong>
                </div>
                <div class="bid-time">
                    Placed ${UIComponents.formatDate(bid.createdAt)}
                </div>
            `;
      list.appendChild(item);
    });

    // Update badge
    const badge = document.querySelector('[data-badge="active-bids"]');
    if (badge) {
      badge.textContent = bids.length;
    }
  }

  /**
     * Load bid history
     */
  async loadBidHistory() {
    try {
      const response = await fetch('/api/user/bids/history', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        this.displayBidHistory(data.bids || []);
      }
    } catch (error) {
      console.error('Load bid history error:', error);
    }
  }

  /**
     * Display bid history
     */
  displayBidHistory(bids) {
    const list = document.querySelector('[data-list="bid-history"]');
    if (!list) {return;}

    list.innerHTML = '';

    if (bids.length === 0) {
      list.innerHTML = '<p class="text-muted">No bid history</p>';
      return;
    }

    bids.forEach(bid => {
      const item = document.createElement('li');
      item.className = 'bid-item';
      const status = bid.isWinning ? '✓ Winning' : bid.isOutbid ? '✕ Outbid' : 'Placed';
      item.innerHTML = `
                <div class="bid-info">
                    <h4><a href="/auction-detail.html?id=${bid.auctionId}">${this.escapeHtml(bid.auctionTitle)}</a></h4>
                    <p class="bid-status">${status}</p>
                </div>
                <div class="bid-amount">
                    <strong>${UIComponents.formatCurrency(bid.amount)}</strong>
                </div>
                <div class="bid-time">
                    ${UIComponents.formatDateTime(bid.createdAt)}
                </div>
            `;
      list.appendChild(item);
    });
  }

  /**
     * Load user wins
     */
  async loadWins() {
    try {
      const response = await fetch('/api/user/wins', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        this.displayWins(data.wins || []);
      }
    } catch (error) {
      console.error('Load wins error:', error);
    }
  }

  /**
     * Display wins
     */
  displayWins(wins) {
    const list = document.querySelector('[data-list="my-wins"]');
    if (!list) {return;}

    list.innerHTML = '';

    if (wins.length === 0) {
      list.innerHTML = '<p class="text-muted">No winning bids yet</p>';
      return;
    }

    wins.forEach(win => {
      const item = document.createElement('li');
      item.className = 'win-item';
      const payAction = win.shipped
        ? `<div class="win-status">📦 Shipped</div>`
        : `<div class="win-status">
             <a href="/checkout.html?auctionId=${encodeURIComponent(win.auctionId)}"
                class="btn btn-primary btn-sm">Pay now</a>
           </div>`;
      item.innerHTML = `
                <div class="win-info">
                    <h4><a href="/auction-detail.html?id=${win.auctionId}">${this.escapeHtml(win.auctionTitle)}</a></h4>
                    <p class="win-amount">Winning bid: <strong>${UIComponents.formatCurrency(win.winningBid)}</strong></p>
                </div>
                ${payAction}
            `;
      list.appendChild(item);
    });

    // Update badge
    const badge = document.querySelector('[data-badge="my-wins"]');
    if (badge) {
      badge.textContent = wins.length;
    }
  }

  /**
     * Save profile information
     */
  async saveProfile(e, form) {
    e.preventDefault();

    const errors = UIComponents.validateForm(form);
    if (!errors.isValid) {
      UIComponents.displayFormErrors(form, errors.errors);
      return;
    }

    UIComponents.clearFormErrors(form);

    const fullName = form.querySelector('input[name="full-name"]')?.value;
    const email = form.querySelector('input[name="email"]')?.value;
    const phone = form.querySelector('input[name="phone"]')?.value;

    try {
      const loader = UIComponents.showLoading('Saving profile...');

      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          fullName,
          email,
          phone
        })
      });

      UIComponents.hideLoading(loader);

      if (!response.ok) {
        const data = await response.json();
        UIComponents.showAlert(data.message || 'Failed to save profile', 'error');
        return;
      }

      UIComponents.createToast({
        message: 'Profile updated successfully',
        type: 'success'
      });
    } catch (error) {
      console.error('Save profile error:', error);
      UIComponents.createToast({
        message: 'Connection error',
        type: 'error'
      });
    }
  }

  /**
     * Save address
     */
  async saveAddress(e, form) {
    e.preventDefault();

    const errors = UIComponents.validateForm(form);
    if (!errors.isValid) {
      UIComponents.displayFormErrors(form, errors.errors);
      return;
    }

    UIComponents.clearFormErrors(form);

    const street = form.querySelector('input[name="street"]')?.value;
    const city = form.querySelector('input[name="city"]')?.value;
    const state = form.querySelector('input[name="state"]')?.value;
    const zip = form.querySelector('input[name="zip"]')?.value;

    try {
      const loader = UIComponents.showLoading('Saving address...');

      const response = await fetch('/api/user/address', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          street,
          city,
          state,
          zip
        })
      });

      UIComponents.hideLoading(loader);

      if (!response.ok) {
        const data = await response.json();
        UIComponents.showAlert(data.message || 'Failed to save address', 'error');
        return;
      }

      UIComponents.createToast({
        message: 'Address saved successfully',
        type: 'success'
      });
    } catch (error) {
      console.error('Save address error:', error);
      UIComponents.createToast({
        message: 'Connection error',
        type: 'error'
      });
    }
  }

  /**
     * Change password
     */
  async changePassword(e, form) {
    e.preventDefault();

    const oldPassword = form.querySelector('input[name="old-password"]')?.value;
    const newPassword = form.querySelector('input[name="new-password"]')?.value;
    const confirmPassword = form.querySelector('input[name="confirm-password"]')?.value;

    const errors = {};

    if (!oldPassword) {errors.oldpassword = 'Current password is required';}
    if (!newPassword) {errors.newpassword = 'New password is required';}
    else {
      const strength = UIComponents.validatePassword(newPassword);
      if (strength.score < 2) {errors.newpassword = 'Password too weak';}
    }
    if (newPassword !== confirmPassword) {errors.confirmpassword = 'Passwords do not match';}

    if (Object.keys(errors).length > 0) {
      UIComponents.displayFormErrors(form, errors);
      return;
    }

    UIComponents.clearFormErrors(form);

    try {
      const loader = UIComponents.showLoading('Changing password...');

      const response = await fetch('/api/user/password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          oldPassword,
          newPassword
        })
      });

      UIComponents.hideLoading(loader);

      if (!response.ok) {
        const data = await response.json();
        UIComponents.showAlert(data.message || 'Failed to change password', 'error');
        return;
      }

      UIComponents.createToast({
        message: 'Password changed successfully',
        type: 'success'
      });

      form.reset();
    } catch (error) {
      console.error('Change password error:', error);
      UIComponents.createToast({
        message: 'Connection error',
        type: 'error'
      });
    }
  }

  /**
     * Load notification preferences
     */
  loadNotificationPreferences() {
    if (!this.user?.notifications) {return;}

    const prefs = this.user.notifications;

    const checkboxes = {
      'notification-bids': prefs.bids,
      'notification-auctions': prefs.auctions,
      'notification-messages': prefs.messages,
      'notification-winners': prefs.winners,
      'notification-updates': prefs.updates
    };

    Object.entries(checkboxes).forEach(([name, value]) => {
      const checkbox = document.querySelector(`input[name="${name}"]`);
      if (checkbox) {checkbox.checked = value;}
    });
  }

  /**
     * Save notification preferences
     */
  async saveNotificationPreferences() {
    const prefs = {
      bids: document.querySelector('input[name="notification-bids"]')?.checked,
      auctions: document.querySelector('input[name="notification-auctions"]')?.checked,
      messages: document.querySelector('input[name="notification-messages"]')?.checked,
      winners: document.querySelector('input[name="notification-winners"]')?.checked,
      updates: document.querySelector('input[name="notification-updates"]')?.checked
    };

    try {
      const response = await fetch('/api/user/notifications', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify(prefs)
      });

      if (!response.ok) {
        console.error('Failed to save notification preferences');
      }
    } catch (error) {
      console.error('Save notification preferences error:', error);
    }
  }

  /**
     * Load 2FA status
     */
  load2FAStatus() {
    const is2FAEnabled = this.user?.twoFactorEnabled;

    const enableBtn = document.querySelector('[data-enable-2fa]');
    const disableBtn = document.querySelector('[data-disable-2fa]');
    const statusText = document.querySelector('[data-2fa-status]');

    if (is2FAEnabled) {
      if (enableBtn) {enableBtn.style.display = 'none';}
      if (disableBtn) {disableBtn.style.display = 'block';}
      if (statusText) {statusText.textContent = '✓ Enabled';}
    } else {
      if (enableBtn) {enableBtn.style.display = 'block';}
      if (disableBtn) {disableBtn.style.display = 'none';}
      if (statusText) {statusText.textContent = '✕ Disabled';}
    }

    disableBtn?.addEventListener('click', () => this.disable2FA());
  }

  /**
     * Disable 2FA
     */
  async disable2FA() {
    const confirm = await UIComponents.showConfirmation(
      'Are you sure? You will need to re-enable 2FA on your next login.',
      'Disable 2FA'
    );

    if (!confirm) {return;}

    try {
      const loader = UIComponents.showLoading('Disabling 2FA...');

      const response = await fetch('/api/user/2fa', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });

      UIComponents.hideLoading(loader);

      if (!response.ok) {
        UIComponents.showAlert('Failed to disable 2FA', 'error');
        return;
      }

      this.user.twoFactorEnabled = false;
      this.load2FAStatus();
      UIComponents.createToast({
        message: '2FA disabled successfully',
        type: 'success'
      });
    } catch (error) {
      console.error('Disable 2FA error:', error);
      UIComponents.createToast({
        message: 'Connection error',
        type: 'error'
      });
    }
  }

  /**
     * Confirm delete account
     */
  async confirmDeleteAccount() {
    const confirm = await UIComponents.showConfirmation(
      'Are you absolutely sure? This cannot be undone. All your bids and data will be permanently deleted.',
      'Delete Account'
    );

    if (!confirm) {return;}

    this.deleteAccount();
  }

  /**
     * Delete account
     */
  async deleteAccount() {
    try {
      const loader = UIComponents.showLoading('Deleting account...');

      const response = await fetch('/api/user', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });

      UIComponents.hideLoading(loader);

      if (!response.ok) {
        UIComponents.showAlert('Failed to delete account', 'error');
        return;
      }

      localStorage.removeItem('auth_token');
      UIComponents.createToast({
        message: 'Account deleted successfully',
        type: 'success'
      });

      setTimeout(() => { window.location.href = '/index.html'; }, 1500);
    } catch (error) {
      console.error('Delete account error:', error);
      UIComponents.createToast({
        message: 'Connection error',
        type: 'error'
      });
    }
  }

  /**
     * Logout
     */
  logout() {
    localStorage.removeItem('auth_token');
    UIComponents.createToast({
      message: 'Logged out successfully',
      type: 'success'
    });

    setTimeout(() => { window.location.href = '/index.html'; }, 1000);
  }

  // -------------------------------------------------------------------------
  // Artwork (student only)
  // -------------------------------------------------------------------------

  /** Populate the auction dropdown in the submit form. */
  async loadArtworkAuctions() {
    try {
      const response = await fetch('/api/user/artwork/auctions', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
      });
      const data = await response.json();
      const select = document.getElementById('artwork-auction');
      if (!select) {return;}

      const auctions = data.auctions || [];
      if (auctions.length === 0) {
        select.innerHTML = '<option value="">No open auctions for your school</option>';
        return;
      }
      select.innerHTML = `<option value="">— Select an auction —</option>${
        auctions.map(a => `<option value="${a.id}">${this.escapeHtml(a.title)}</option>`).join('')}`;
    } catch (err) {
      console.error('Load artwork auctions error:', err);
    }
  }

  /** Load and render the student's existing submissions. */
  async loadArtworkSubmissions() {
    const list = document.getElementById('artwork-submissions-list');
    if (!list) {return;}

    try {
      const response = await fetch('/api/user/artwork', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
      });
      const data = await response.json();
      const submissions = data.artwork || [];

      // Update tab badge
      const badge = document.getElementById('artwork-count');
      if (badge) {badge.textContent = submissions.length;}

      if (submissions.length === 0) {
        list.innerHTML = '<li style="color:var(--color-gray);padding:1rem 0;">No submissions yet. Use the form above to submit your artwork.</li>';
        return;
      }

      const statusLabel = {
        SUBMITTED: { text: 'Pending Review', cls: 'status-pending' },
        PENDING_APPROVAL: { text: 'Pending Review', cls: 'status-pending' },
        APPROVED: { text: 'Approved',       cls: 'status-approved' },
        REJECTED: { text: 'Rejected',       cls: 'status-rejected' },
        WITHDRAWN: { text: 'Withdrawn',      cls: 'status-withdrawn' }
      };

      list.innerHTML = submissions.map(aw => {
        const s = statusLabel[aw.artwork_status] || { text: aw.artwork_status, cls: '' };
        const canWithdraw = ['SUBMITTED', 'PENDING_APPROVAL', 'REJECTED'].includes(aw.artwork_status);
        const thumb = aw.image_url
          ? `<img src="${this.escapeHtml(aw.image_url)}" alt="Artwork thumbnail" style="width:60px;height:60px;object-fit:cover;border-radius:4px;flex-shrink:0;">`
          : '<div style="width:60px;height:60px;background:#eee;border-radius:4px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:1.5rem;">🎨</div>';
        return `<li class="bid-item" style="display:flex;gap:1rem;align-items:flex-start;padding:1rem 0;border-bottom:1px solid #eee;">
                    ${thumb}
                    <div style="flex:1;min-width:0;">
                        <strong>${this.escapeHtml(aw.title)}</strong>
                        <p style="margin:0.25rem 0 0;font-size:0.85rem;color:var(--color-gray);">
                            ${this.escapeHtml(aw.auctionTitle)} &middot;
                            Starting bid: $${Number(aw.starting_bid_amount).toFixed(2)}
                        </p>
                        ${aw.rejection_reason ? `<p style="margin:0.25rem 0 0;font-size:0.85rem;color:var(--color-error);">Reason: ${this.escapeHtml(aw.rejection_reason)}</p>` : ''}
                    </div>
                    <div style="text-align:right;flex-shrink:0;">
                        <span class="status-badge ${s.cls}" style="display:block;margin-bottom:0.5rem;">${s.text}</span>
                        ${canWithdraw ? `<button class="btn btn-secondary" style="font-size:0.8rem;padding:0.25rem 0.75rem;" data-withdraw-id="${aw.id}">Withdraw</button>` : ''}
                    </div>
                </li>`;
      }).join('');

      // Delegate withdraw button clicks
      list.querySelectorAll('[data-withdraw-id]').forEach(btn => {
        btn.addEventListener('click', () => this.withdrawArtwork(btn.dataset.withdrawId));
      });
    } catch (err) {
      console.error('Load artwork submissions error:', err);
      if (list) {list.innerHTML = '<li>Error loading submissions.</li>';}
    }
  }

  /** Wire up the artwork upload form (image preview + submit). */
  setupArtworkForm() {
    const form = document.getElementById('artwork-upload-form');
    if (!form) {return;}

    // Image preview
    const imageInput = document.getElementById('artwork-image');
    imageInput?.addEventListener('change', () => {
      const file = imageInput.files[0];
      const preview = document.getElementById('artwork-image-preview');
      const img = document.getElementById('artwork-preview-img');
      if (!file || !preview || !img) {return;}

      if (file.size > 8 * 1024 * 1024) {
        UIComponents.showAlert('Image must be under 8 MB.', 'error');
        imageInput.value = '';
        preview.style.display = 'none';
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target.result;
        preview.style.display = 'block';
      };
      reader.readAsDataURL(file);
    });

    form.addEventListener('submit', (e) => this.handleArtworkSubmit(e));
  }

  /** Read image file as base64 data URL. */
  readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  /** Handle artwork form submission. */
  async handleArtworkSubmit(e) {
    e.preventDefault();

    const auctionId     = document.getElementById('artwork-auction')?.value;
    const title         = document.getElementById('artwork-title')?.value?.trim();
    const artistName    = document.getElementById('artwork-artist')?.value?.trim();
    const medium        = document.getElementById('artwork-medium')?.value?.trim();
    const startingBid   = document.getElementById('artwork-bid')?.value;
    const width         = document.getElementById('artwork-width')?.value;
    const height        = document.getElementById('artwork-height')?.value;
    const description   = document.getElementById('artwork-description')?.value?.trim();
    const imageFile     = document.getElementById('artwork-image')?.files[0];

    if (!auctionId || !title || !artistName || !startingBid) {
      UIComponents.showAlert('Please fill in all required fields.', 'error');
      return;
    }

    const btn = document.getElementById('artwork-submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }

    try {
      let imageData = null;
      if (imageFile) {
        imageData = await this.readFileAsDataURL(imageFile);
      }

      const response = await fetch('/api/user/artwork', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({ auctionId, title, artistName, medium, startingBid, width, height, description, imageData })
      });

      const data = await response.json();

      if (!response.ok) {
        UIComponents.showAlert(data.message || 'Submission failed', 'error');
        return;
      }

      UIComponents.createToast({ message: 'Artwork submitted for review!', type: 'success' });
      e.target.reset();
      document.getElementById('artwork-image-preview').style.display = 'none';
      await this.loadArtworkSubmissions();
    } catch (err) {
      console.error('Artwork submit error:', err);
      UIComponents.showAlert('Connection error. Please try again.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Submit Artwork'; }
    }
  }

  /** Withdraw an artwork submission. */
  async withdrawArtwork(artworkId) {
    if (!confirm('Withdraw this submission? This cannot be undone.')) {return;}

    try {
      const response = await fetch(`/api/user/artwork/${artworkId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
      });

      if (response.ok) {
        UIComponents.createToast({ message: 'Submission withdrawn.', type: 'success' });
        await this.loadArtworkSubmissions();
      } else {
        const data = await response.json();
        UIComponents.showAlert(data.message || 'Could not withdraw submission.', 'error');
      }
    } catch (err) {
      console.error('Withdraw artwork error:', err);
      UIComponents.showAlert('Connection error.', 'error');
    }
  }

  /**
     * Escape HTML special characters
     */
  escapeHtml(text) {
    if (!text) {return '';}
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  // Require authentication - redirect to home if not logged in
  UIComponents.requireAuth('/');

  // Initialize navbar (shared across all pages)
  UIComponents.initializeNavbar();

  // Initialize user dashboard
  window.userDashboard = new UserDashboard();
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UserDashboard;
}
