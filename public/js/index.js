/**
 * Homepage Initialization
 * Handles homepage functionality and interactions
 */

document.addEventListener('DOMContentLoaded', async () => {
  await initializePage();
});

async function initializePage() {
  console.log('=== initializePage called ===');

  // Initialize navbar (shared across all pages)
  UIComponents.initializeNavbar();

  // Setup page-specific event listeners
  setupPageEventListeners();

  // Load hero carousel
  initCarousel();

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
 * Setup page-specific event listeners (not shared navbar)
 */
function setupPageEventListeners() {
  console.log('=== setupPageEventListeners called ===');

  // Mobile menu toggle is handled by UIComponents.initializeNavbar()

  // Login form
  const loginForm = document.getElementById('login-form');
  console.log('Login form found:', !!loginForm);
  if (loginForm) {
    console.log('Attaching submit listener to login form');
    loginForm.addEventListener('submit', handleLogin);
  } else {
    console.error('Login form NOT found in DOM');
  }

  // Register form
  const registerForm = document.getElementById('register-form');
  console.log('Register form found:', !!registerForm);
  if (registerForm) {
    console.log('Attaching submit listener to register form');
    registerForm.addEventListener('submit', handleRegister);

    // Also attach to button click for reliability
    const submitBtn = registerForm.querySelector('button[type="submit"]');
    console.log('Submit button found:', !!submitBtn, submitBtn);
    if (submitBtn) {
      console.log('Attaching click listener to register button');
      submitBtn.addEventListener('click', (e) => {
        console.log('Register button clicked');
        handleRegister(e);
      });
    } else {
      console.warn('Submit button NOT found in register form');
    }
  } else {
    console.error('Register form NOT found in DOM');
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

  console.log('=== setupEventListeners complete ===');
}

/**
 * Handle login form submission
 * @param {Event} event
 */
async function handleLogin(event) {
  event.preventDefault();

  const email = document.getElementById('login-email')?.value;
  const password = document.getElementById('login-password')?.value;
  document.getElementById('login-remember')?.checked;

  if (!email || !password) {
    UIComponents.showAlert('Email and password required', 'error', 3000);
    return;
  }

  const loader = UIComponents.showLoading('Logging in...');

  try {
    const result = await authManager.login(email, password);

    if (result.requires2FA) {
      // 2FA is required, redirect to verification page
      UIComponents.hideLoading(loader);
      UIComponents.showAlert('Check your authenticator app for the verification code', 'info', 3000);
      setTimeout(() => {
        window.location.href = '/2fa-verify.html';
      }, 500);
    } else if (result.success) {
      UIComponents.hideLoading(loader);
      UIComponents.showAlert('Login successful!', 'success', 3000);

      // Close modal
      const modal = document.getElementById('login-modal');
      if (modal) {modal.style.display = 'none';}

      // Clear form
      document.getElementById('login-form').reset();

      // Update UI
      UIComponents.updateAuthUI();

      // Connect WebSocket
      try {
        await websocketClient.connect();
      } catch (error) {
        console.warn('Failed to connect WebSocket:', error);
      }
    } else {
      UIComponents.hideLoading(loader);
      UIComponents.showAlert(result.error || 'Login failed', 'error', 5000);
    }
  } catch (error) {
    UIComponents.hideLoading(loader);
    UIComponents.showAlert(`Login error: ${error.message}`, 'error', 5000);
  }
}

/**
 * Handle register form submission
 * @param {Event} event
 */
async function handleRegister(event) {
  event.preventDefault();
  console.log('Register form submitted - redirecting to registration page');

  // Redirect to the dedicated multi-step registration page
  window.location.href = '/register.html';
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
    if (!grid) {return;}

    const auctions = response?.auctions;
    if (!Array.isArray(auctions)) {return;}

    grid.innerHTML = '';

    if (auctions.length === 0) {
      grid.innerHTML = '<p class="text-muted">No active auctions at the moment. Check back soon!</p>';
      return;
    }

    auctions.forEach(auction => {
      const card = createAuctionCard(auction);
      grid.appendChild(card);
    });

    // Apply the school theme of the first featured auction
    if (auctions[0]?.schoolId) {
      applyFeaturedSchoolTheme(auctions[0].schoolId);
    }
  } catch (error) {
    console.error('Failed to load auctions:', error);
    const grid = document.getElementById('featured-auctions-grid');
    if (grid) {
      grid.innerHTML = '<p class="text-muted">Failed to load auctions. Please try again later.</p>';
    }
  }
}

/**
 * Fetch and apply a school's colour theme to the homepage.
 * Non-critical — failure is silently swallowed so it never breaks the page.
 * @param {string} schoolId
 */
async function applyFeaturedSchoolTheme(schoolId) {
  try {
    const res = await fetch(`/api/schools/${schoolId}/theme`);
    const data = await res.json();
    if (data.success && data.data?.resolved) {
      ThemeManager.apply(data.data.resolved);
    }
  } catch (err) {
    console.warn('Could not load featured school theme:', err);
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

  const timeRemaining = calculateTimeRemaining(auction.endTime);
  const status = getAuctionStatus(auction);
  const imageSrc = auction.image || '/images/placeholder-art.svg';

  card.innerHTML = `
        <div class="auction-card-image">
            <img src="${escapeHtml(imageSrc)}"
                 alt="${escapeHtml(auction.title || 'Auction')}"
                 class="auction-img" loading="lazy">
            <span class="status-badge status-${status.toLowerCase()}">${status}</span>
        </div>
        <div class="auction-card-body">
            <h3 class="auction-title">${escapeHtml(auction.title || 'Untitled Auction')}</h3>
            <p class="auction-school">${escapeHtml(auction.school || '')}</p>
            <div class="auction-stats">
                <span class="current-bid">
                    <strong>${UIComponents.formatCurrency(auction.currentBid || 0)}</strong>
                </span>
                <span class="bid-count">${auction.bidCount || 0} bids</span>
            </div>
            <p class="time-remaining">${timeRemaining}</p>
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
  if (!endTime) {return 'Unknown';}
  const end = new Date(endTime);
  const now = new Date();
  const diff = end - now;

  if (diff <= 0) {return 'Ended';}

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `${days}d ${hours}h`;
  } if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Get auction status
 * @param {object} auction - Auction data
 * @returns {string}
 */
function getAuctionStatus(auction) {
  const end = new Date(auction.endTime);
  const now = new Date();
  const diff = end - now;

  if (diff <= 0) {return 'Closed';}
  if (diff <= 60 * 60 * 1000) {return 'Ending Soon';} // Less than 1 hour
  return 'Active';
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
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * Handle 2FA verification
 * @param {Event} event
 */
// =====================================================================
// Hero Carousel
// =====================================================================

const CAROUSEL_INTERVAL = 4000;
const CAROUSEL_FALLBACKS = [
  { id: 'f1', title: 'Artwork Coming Soon',         artistName: 'Silent Auction Gallery', medium: null, imageUrl: '/images/placeholder-art.svg', auctionId: null },
  { id: 'f2', title: 'Student Art Showcase',        artistName: 'Silent Auction Gallery', medium: null, imageUrl: '/images/hero-art.svg',         auctionId: null },
  { id: 'f3', title: 'Supporting Education Through Art', artistName: 'Silent Auction Gallery', medium: null, imageUrl: '/images/placeholder.svg',  auctionId: null }
];

let _slides = [];
let _slideIndex = 0;
let _carouselTimer = null;
let _infoVisible = false;

async function initCarousel() {
  let slides = [];
  try {
    const res = await fetch('/api/auctions/carousel');
    const data = await res.json();
    if (data.success && Array.isArray(data.artwork) && data.artwork.length > 0) {
      slides = data.artwork;
    }
  } catch (err) { console.warn('Carousel fetch failed, using fallbacks:', err); }

  _slides = slides.length > 0 ? slides : CAROUSEL_FALLBACKS;
  _slideIndex = 0;

  const track   = document.getElementById('carousel-track');
  const dotsEl  = document.getElementById('carousel-dots');
  const prevBtn = document.getElementById('carousel-prev');
  const nextBtn = document.getElementById('carousel-next');
  const infoEl  = document.getElementById('carousel-info');
  if (!track) { return; }

  const loggedIn = authManager.isAuthenticated();

  // Build slides
  track.innerHTML = _slides.map((s, i) => `
    <div class="carousel-slide${i === 0 ? ' active' : ''}" data-index="${i}">
      <img src="${escapeHtml(s.imageUrl)}" alt="${escapeHtml(s.title || 'Artwork')}" class="carousel-img" loading="${i === 0 ? 'eager' : 'lazy'}">
    </div>
  `).join('');

  // Build dots
  if (dotsEl) {
    dotsEl.innerHTML = _slides.map((_, i) =>
      `<button class="carousel-dot${i === 0 ? ' active' : ''}" data-dot="${i}" aria-label="Slide ${i + 1}"></button>`
    ).join('');
    dotsEl.querySelectorAll('.carousel-dot').forEach(dot =>
      dot.addEventListener('click', () => { _carouselGoTo(Number.parseInt(dot.dataset.dot, 10)); _resetTimer(); })
    );
  }

  // Prev arrow — logged-in only
  if (prevBtn) {
    prevBtn.style.display = loggedIn ? '' : 'none';
    if (loggedIn) {
      prevBtn.addEventListener('click', () => { _carouselStep(-1); _resetTimer(); });
    }
  }

  // Next arrow — always visible
  if (nextBtn) {
    nextBtn.addEventListener('click', () => { _carouselStep(1); _resetTimer(); });
  }

  // Artist info on click — logged-in only
  if (loggedIn && infoEl) {
    track.addEventListener('click', () => {
      const s = _slides[_slideIndex];
      if (!s) { return; }
      const meta = [s.artistName, s.medium].filter(Boolean).join(' · ');
      infoEl.innerHTML = `
        <div class="carousel-info-title">${escapeHtml(s.title || 'Untitled')}</div>
        <div class="carousel-info-meta">${escapeHtml(meta)}</div>
      `;
      _infoVisible = !_infoVisible;
      infoEl.classList.toggle('visible', _infoVisible);
    });
  }

  // Pause on hover
  const container = document.getElementById('hero-carousel');
  if (container) {
    container.addEventListener('mouseenter', () => { clearInterval(_carouselTimer); _carouselTimer = null; });
    container.addEventListener('mouseleave', _startTimer);
  }

  _startTimer();
}

function _carouselGoTo(index) {
  const slideEls = document.querySelectorAll('.carousel-slide');
  const dotEls   = document.querySelectorAll('.carousel-dot');
  const infoEl   = document.getElementById('carousel-info');

  slideEls[_slideIndex]?.classList.remove('active');
  dotEls[_slideIndex]?.classList.remove('active');

  _slideIndex = ((index % _slides.length) + _slides.length) % _slides.length;
  _infoVisible = false;
  if (infoEl) { infoEl.classList.remove('visible'); }

  slideEls[_slideIndex]?.classList.add('active');
  dotEls[_slideIndex]?.classList.add('active');
}

function _carouselStep(dir) { _carouselGoTo(_slideIndex + dir); }

function _startTimer() { _carouselTimer = setInterval(() => _carouselStep(1), CAROUSEL_INTERVAL); }

function _resetTimer() { clearInterval(_carouselTimer); _startTimer(); }

// Exposed globally so HTML onsubmit handlers can call it
globalThis.handleVerify2FA = handleVerify2FA;
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
      if (modal) {modal.style.display = 'none';}

      UIComponents.updateAuthUI();
    } else {
      UIComponents.hideLoading(loader);
      UIComponents.showAlert(result.error || '2FA verification failed', 'error', 5000);
    }
  } catch (error) {
    UIComponents.hideLoading(loader);
    UIComponents.showAlert(`Verification error: ${error.message}`, 'error', 5000);
  }
}
