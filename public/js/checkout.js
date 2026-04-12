/**
 * checkout.js — Payment checkout page logic
 * Requires: Stripe.js v3 (loaded by checkout.html), auth-manager.js, api-client.js
 */

(function () {
  'use strict';

  // ── Auth guard ──────────────────────────────────────────────────────────────
  function getToken() {
    return localStorage.getItem('auth_token');
  }

  function redirectToLogin() {
    window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.href);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatCurrency(cents) {
    const amount = typeof cents === 'number' ? cents : parseFloat(cents) || 0;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  }

  function showError(msg) {
    const el = document.getElementById('checkout-error');
    if (!el) { return; }
    el.textContent = msg;
    el.style.display = 'block';
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideError() {
    const el = document.getElementById('checkout-error');
    if (el) { el.style.display = 'none'; }
  }

  function setPayBtnState(busy) {
    const btn = document.getElementById('pay-btn');
    if (!btn) { return; }
    btn.disabled = busy;
    btn.textContent = busy ? 'Processing…' : 'Pay Now';
  }

  // ── Order summary ────────────────────────────────────────────────────────────
  function renderOrderSummary(win) {
    const el = document.getElementById('order-summary');
    if (!el) { return; }

    const platformFeeRate = 0.0365; // 3.65 % — matches backend default
    const fee = win.winningBid * platformFeeRate;
    const total = win.winningBid + fee;

    el.innerHTML = `
      <div class="order-line">
        <span>Auction</span>
        <span>${escapeHtml(win.auctionTitle || '')}</span>
      </div>
      ${win.artworkTitle ? `<div class="order-line"><span>Artwork</span><span>${escapeHtml(win.artworkTitle)}</span></div>` : ''}
      <div class="order-line">
        <span>Winning bid</span>
        <span>${formatCurrency(win.winningBid)}</span>
      </div>
      <div class="order-line">
        <span>Platform fee (3.65%)</span>
        <span>${formatCurrency(fee)}</span>
      </div>
      <div class="order-line order-total">
        <span>Total due</span>
        <span>${formatCurrency(total)}</span>
      </div>
    `;

    // Update pay button label with amount
    const btn = document.getElementById('pay-btn');
    if (btn) { btn.textContent = `Pay ${formatCurrency(total)}`; }

    return total;
  }

  // ── Pre-fill shipping address from profile ──────────────────────────────────
  async function prefillAddress(token) {
    try {
      const res = await fetch('/api/user/profile', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) { return; }
      const data = await res.json();
      const addr = data.user?.address || data.address || {};
      if (addr.line1)   { document.getElementById('address-line1').value  = addr.line1;   }
      if (addr.city)    { document.getElementById('address-city').value   = addr.city;    }
      if (addr.state)   { document.getElementById('address-state').value  = addr.state;   }
      if (addr.zip)     { document.getElementById('address-zip').value    = addr.zip;     }
      if (addr.country) { document.getElementById('address-country').value = addr.country; }
    } catch (_) { /* non-fatal */ }
  }

  // ── Main ─────────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    const token = getToken();
    if (!token) { return redirectToLogin(); }

    // Parse auctionId from ?auctionId=<id>
    const params = new URLSearchParams(window.location.search);
    const auctionId = params.get('auctionId');
    if (!auctionId) {
      showError('No auction specified. Please go back to your dashboard.');
      return;
    }

    // ── 1. Fetch win details ──────────────────────────────────────────────────
    let win;
    try {
      const res = await fetch(`/api/user/wins/${encodeURIComponent(auctionId)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showError(data.message || 'Could not load your win details. Please try again.');
        return;
      }
      win = data.win;
    } catch (err) {
      showError('Network error loading order details. Please try again.');
      return;
    }

    const totalAmount = renderOrderSummary(win);
    await prefillAddress(token);

    // ── 2. Init Stripe Elements ───────────────────────────────────────────────
    let stripe = null;
    let cardElement = null;

    try {
      const cfgRes = await fetch('/api/config/stripe-key');
      const cfg = await cfgRes.json();

      if (cfg.publishableKey) {
        stripe = Stripe(cfg.publishableKey); // eslint-disable-line no-undef
        const elements = stripe.elements();
        cardElement = elements.create('card', { hidePostalCode: true });
        cardElement.mount('#stripe-card-element');

        cardElement.on('change', (event) => {
          const errEl = document.getElementById('stripe-card-errors');
          if (errEl) { errEl.textContent = event.error ? event.error.message : ''; }
        });
      } else {
        // No Stripe key configured — show a clear message in the card widget area
        const cardEl = document.getElementById('stripe-card-element');
        if (cardEl) {
          cardEl.innerHTML = '<p style="color:#888;font-size:.875rem;">Payment gateway not configured. Contact support.</p>';
        }
        setPayBtnState(true);
      }
    } catch (err) {
      showError('Could not load payment form. Please refresh and try again.');
      return;
    }

    // ── 3. Form submit ────────────────────────────────────────────────────────
    const form = document.getElementById('payment-form');
    if (!form) { return; }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError();

      // Validate shipping fields
      const line1   = document.getElementById('address-line1').value.trim();
      const city    = document.getElementById('address-city').value.trim();
      const state   = document.getElementById('address-state').value.trim();
      const zip     = document.getElementById('address-zip').value.trim();
      const country = document.getElementById('address-country').value.trim();

      if (!line1 || !city || !state || !zip) {
        showError('Please fill in all shipping address fields.');
        return;
      }

      if (!stripe || !cardElement) {
        showError('Payment gateway is not available. Please contact support.');
        return;
      }

      setPayBtnState(true);

      // Tokenize — raw card data never leaves the browser
      const { token: stripeToken, error } = await stripe.createToken(cardElement, {
        address_line1:   line1,
        address_city:    city,
        address_state:   state,
        address_zip:     zip,
        address_country: country,
      });

      if (error) {
        const errEl = document.getElementById('stripe-card-errors');
        if (errEl) { errEl.textContent = error.message; }
        setPayBtnState(false);
        return;
      }

      // POST to backend — token only, no raw card data
      try {
        const res = await fetch('/api/payments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            auctionId,
            amount: totalAmount,
            paymentToken: stripeToken.id,
            description: `Payment for ${win.auctionTitle}`,
            shippingAddress: { line1, city, state, zip, country },
          }),
        });

        const data = await res.json();

        if (res.ok && data.success) {
          window.location.href = `/thank-you.html?transactionId=${encodeURIComponent(data.data?.transactionId || '')}`;
          return;
        }

        // 4xx / 5xx error from backend
        showError(data.message || 'Payment failed. Please try again or contact support.');
        setPayBtnState(false);
      } catch (netErr) {
        showError('Network error submitting payment. Please check your connection and try again.');
        setPayBtnState(false);
      }
    });
  });
}());
