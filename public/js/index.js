/**
 * Homepage Initialization
 * Handles homepage functionality and interactions
 */

document.addEventListener('DOMContentLoaded', async () => {
    await initializePage();
});

async function initializePage() {
    // Initialize authentication UI
    updateAuthUI();
    
    // Setup event listeners
    setupEventListeners();
    
    // Load featured auctions
    await loadFeaturedAuctions();
    
    // Setup WebSocket if authenticated
    if (authManager.isAuthenticated()) {
        try {
            await websocketClient.connect();
        } catch (error) {
            console.warn('Failed to connect WebSocket:', error);
        }
    }
}

/**
 * Update authentication UI based on auth state
 */
function updateAuthUI() {
    const loginBtn = document.getElementById('login-btn');
    const userMenuBtn = document.getElementById('user-menu-btn');
    const userName = document.getElementById('user-name');

    if (authManager.isAuthenticated() && authManager.getUser()) {
        const user = authManager.getUser();
        if (loginBtn) loginBtn.style.display = 'none';
        if (userMenuBtn) {
            userMenuBtn.style.display = 'flex';
            if (userName) {
                userName.textContent = user.first_name || user.email;
            }
        }
    } else {
        if (loginBtn) loginBtn.style.display = 'block';
        if (userMenuBtn) userMenuBtn.style.display = 'none';
    }

    // Listen for auth changes
    authManager.onChange((user) => {
        updateAuthUI();
    });
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Login button
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            UIComponents.showModal('login-modal');
        });
    }

    // User menu toggle
    const userMenuBtn = document.getElementById('user-menu-btn');
    const userDropdown = document.getElementById('user-dropdown');
    if (userMenuBtn && userDropdown) {
        userMenuBtn.addEventListener('click', () => {
            userDropdown.style.display = userDropdown.style.display === 'none' ? 'block' : 'none';
        });

        document.addEventListener('click', (e) => {
            if (!userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) {
                userDropdown.style.display = 'none';
            }
        });
    }

    // Logout button
    const logoutBtn = document.querySelector('[id*="logout"]');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await authManager.logout();
            window.location.reload();
        });
    }

    // Mobile menu toggle
    const menuToggle = document.getElementById('menu-toggle');
    const navMenu = document.querySelector('.navbar-nav');
    if (menuToggle && navMenu) {
        menuToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
        });
    }

    // Browse Auctions button
    const browseBtn = document.querySelector('[href="/auctions.html"]');
    if (browseBtn) {
        browseBtn.addEventListener('click', (e) => {
            // Navigation will happen naturally
        });
    }

    // Login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Register form
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }

    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
            }
        });
    });

    // Close modal on backdrop click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
}

/**
 * Handle login form submission
 * @param {Event} event
 */
async function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const remember = document.getElementById('login-remember').checked;

    const loader = UIComponents.showLoading('Logging in...');

    try {
        const result = await authManager.login(email, password);

        if (result.success) {
            UIComponents.hideLoading(loader);
            UIComponents.showAlert('Login successful!', 'success', 3000);
            
            // Close modal
            const modal = document.getElementById('login-modal');
            if (modal) modal.style.display = 'none';

            // Clear form
            document.getElementById('login-form').reset();

            // Update UI
            updateAuthUI();

            // Connect WebSocket
            try {
                await websocketClient.connect();
            } catch (error) {
                console.warn('Failed to connect WebSocket:', error);
            }
        } else if (result.requires2FA) {
            UIComponents.hideLoading(loader);
            UIComponents.showAlert('2FA code sent to your email', 'info');
            // Show 2FA verification UI
            show2FAForm();
        } else {
            UIComponents.hideLoading(loader);
            UIComponents.showAlert(result.error || 'Login failed', 'error', 5000);
        }
    } catch (error) {
        UIComponents.hideLoading(loader);
        UIComponents.showAlert('Login error: ' + error.message, 'error', 5000);
    }
}

/**
 * Handle register form submission
 * @param {Event} event
 */
async function handleRegister(event) {
    event.preventDefault();

    const firstName = document.getElementById('register-first-name')?.value;
    const lastName = document.getElementById('register-last-name')?.value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const passwordConfirm = document.getElementById('register-confirm').value;
    const terms = document.getElementById('register-terms').checked;

    // Validate
    if (!email || !password) {
        UIComponents.showAlert('Please fill in all required fields', 'error');
        return;
    }

    if (password !== passwordConfirm) {
        UIComponents.showAlert('Passwords do not match', 'error');
        return;
    }

    if (!terms) {
        UIComponents.showAlert('You must agree to the terms', 'error');
        return;
    }

    const loader = UIComponents.showLoading('Creating account...');

    try {
        const result = await authManager.register({
            firstName,
            lastName,
            email,
            password,
        });

        if (result.success) {
            UIComponents.hideLoading(loader);
            UIComponents.showAlert('Account created successfully!', 'success', 3000);
            
            // Close modal
            const modal = document.getElementById('register-modal');
            if (modal) modal.style.display = 'none';

            // Clear form
            document.getElementById('register-form').reset();

            // Update UI
            updateAuthUI();

            // Connect WebSocket
            try {
                await websocketClient.connect();
            } catch (error) {
                console.warn('Failed to connect WebSocket:', error);
            }
        } else {
            UIComponents.hideLoading(loader);
            UIComponents.showAlert(result.error || 'Registration failed', 'error', 5000);
        }
    } catch (error) {
        UIComponents.hideLoading(loader);
        UIComponents.showAlert('Registration error: ' + error.message, 'error', 5000);
    }
}

/**
 * Load featured auctions
 */
async function loadFeaturedAuctions() {
    try {
        const response = await apiClient.getAuctions({ 
            limit: 6, 
            status: 'active',
            sort: 'ending_soon'
        });

        const grid = document.getElementById('featured-auctions-grid');
        if (!grid || !response || !Array.isArray(response)) return;

        grid.innerHTML = '';

        if (response.length === 0) {
            grid.innerHTML = '<p>No active auctions at the moment</p>';
            return;
        }

        response.forEach(auction => {
            const card = createAuctionCard(auction);
            grid.appendChild(card);
        });
    } catch (error) {
        console.error('Failed to load auctions:', error);
        const grid = document.getElementById('featured-auctions-grid');
        if (grid) {
            grid.innerHTML = '<p>Failed to load auctions. Please try again later.</p>';
        }
    }
}

/**
 * Create auction card element
 * @param {object} auction - Auction data
 * @returns {HTMLElement}
 */
function createAuctionCard(auction) {
    const card = document.createElement('a');
    card.href = `/auction-detail.html?id=${auction.id}`;
    card.className = 'auction-card';
    card.setAttribute('role', 'listitem');
    
    const timeRemaining = calculateTimeRemaining(auction.end_time);
    const status = getAuctionStatus(auction);

    card.innerHTML = `
        <img src="${auction.artwork?.image_url || '/images/placeholder.jpg'}" 
             alt="${auction.artwork?.title || 'Artwork'}"
             class="auction-image">
        <div class="auction-body">
            <h3 class="auction-title">${escapeHtml(auction.artwork?.title || 'Unknown')}</h3>
            <p class="auction-artist">${escapeHtml(auction.artwork?.artist_name || 'Unknown Artist')}</p>
            
            <div class="auction-details">
                <div class="detail-item">
                    <span class="detail-label">Current Bid</span>
                    <span class="detail-value">${formatCurrency(auction.current_bid || auction.opening_bid)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Bids</span>
                    <span class="detail-value">${auction.bid_count || 0}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Time Left</span>
                    <span class="detail-value">${timeRemaining}</span>
                </div>
            </div>

            <div class="auction-timer">
                <span class="status-${status.toLowerCase()}">${status}</span>
                <span class="timer-value">${timeRemaining}</span>
            </div>
        </div>
    `;

    return card;
}

/**
 * Calculate time remaining
 * @param {string} endTime - End time ISO string
 * @returns {string}
 */
function calculateTimeRemaining(endTime) {
    const end = new Date(endTime);
    const now = new Date();
    const diff = end - now;

    if (diff <= 0) return 'Ended';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) {
        return `${days}d ${hours}h`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

/**
 * Get auction status
 * @param {object} auction - Auction data
 * @returns {string}
 */
function getAuctionStatus(auction) {
    const end = new Date(auction.end_time);
    const now = new Date();
    const diff = end - now;

    if (diff <= 0) return 'Closed';
    if (diff <= 60 * 60 * 1000) return 'Ending Soon'; // Less than 1 hour
    return 'Active';
}

/**
 * Format currency
 * @param {number} amount
 * @returns {string}
 */
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(amount || 0);
}

/**
 * Escape HTML
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
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
 * Show 2FA verification form
 */
function show2FAForm() {
    const modal = document.getElementById('login-modal');
    if (!modal) return;

    const form = document.getElementById('login-form');
    if (!form) return;

    const formContent = form.innerHTML;
    form.innerHTML = `
        <div class="form-group">
            <label for="2fa-code">2FA Code</label>
            <input 
                type="text" 
                id="2fa-code" 
                class="form-control" 
                placeholder="Enter 6-digit code"
                required
                aria-required="true"
            >
        </div>
        <button type="submit" class="btn btn-primary btn-block">Verify</button>
    `;

    form.removeEventListener('submit', handleLogin);
    form.addEventListener('submit', handleVerify2FA);
}

/**
 * Handle 2FA verification
 * @param {Event} event
 */
async function handleVerify2FA(event) {
    event.preventDefault();

    const code = document.getElementById('2fa-code').value;
    const loader = UIComponents.showLoading('Verifying...');

    try {
        const result = await authManager.verify2FA(code);

        if (result.success) {
            UIComponents.hideLoading(loader);
            UIComponents.showAlert('2FA verified!', 'success', 3000);
            
            const modal = document.getElementById('login-modal');
            if (modal) modal.style.display = 'none';

            updateAuthUI();
        } else {
            UIComponents.hideLoading(loader);
            UIComponents.showAlert(result.error || '2FA verification failed', 'error', 5000);
        }
    } catch (error) {
        UIComponents.hideLoading(loader);
        UIComponents.showAlert('Verification error: ' + error.message, 'error', 5000);
    }
}
