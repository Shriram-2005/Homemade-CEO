/**
 * landing-ui.js — Product Landing Page Renderer
 *
 * Reads seller ID from URL (?seller=<id>), fetches data from Store,
 * and dynamically populates the entire landing page.
 *
 * Dependencies: margin.js, store.js
 */

const LandingUI = (() => {

  function init() {
    Store.init();

    const params   = new URLSearchParams(window.location.search);
    const sellerId = params.get('seller');

    if (!sellerId) { _showError('No product selected.'); return; }

    const seller = Store.getById(sellerId);
    if (!seller)  { _showError('Product not found. It may have been removed.'); return; }

    _render(seller);
  }

  // ─────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────
  function _render(s) {
    const product = s.product || {};
    const name    = product.name    || 'Artisan Product';
    const desc    = product.description || `A lovingly crafted product from ${s.name || 'a Kerala home entrepreneur'}.`;
    const price   = s.sellingPrice  ? `₹${s.sellingPrice}` : 'Price on request';
    const maker   = s.name          || 'Kerala Homemaker';
    const district = s.district     || 'Kerala';
    const photoUrl = product.photoUrl || null;
    const margin  = s.margin;

    // Update <title>
    document.title = `${name} — ${maker} | Homemade CEO`;
    document.querySelector('meta[name="description"]')?.setAttribute('content',
      `${desc.slice(0, 150)} — Handmade by ${maker} from ${district}, Kerala.`);

    // WhatsApp link
    const waText  = encodeURIComponent(`Hi! I'm interested in ordering ${name} (₹${s.sellingPrice}). I found your product on Homemade CEO.`);
    const waPhone = ''; // seller's phone — can be added when real system connects
    const waHref  = waPhone
      ? `https://wa.me/${waPhone}?text=${waText}`
      : `https://wa.me/?text=${waText}`;

    // ─── Hero
    _setText('hero-product-name', name);
    _setText('hero-description',  desc);
    // Price: just the number — the ₹ symbol is already in the HTML as a separate span
    const priceNum = s.sellingPrice ? s.sellingPrice : 'Request';
    _setText('hero-price-amount', priceNum);
    _setText('hero-price-per', 'per unit · handmade');

    // Verified badge — preserve the gold dot span
    _setHtml('hero-verified-badge',
      `<span class="hero-eyebrow-dot"></span>Jami Verified · ${district}, Kerala`);

    // WA CTA buttons
    document.querySelectorAll('.wa-order-btn, #nav-wa-btn').forEach(btn => { btn.href = waHref; });
    const navBtn = document.getElementById('nav-wa-btn');
    if (navBtn) navBtn.href = waHref;

    // ─── Hero image
    const imgSide = document.getElementById('hero-image-side');
    if (photoUrl) {
      imgSide.innerHTML = `<img src="${photoUrl}" alt="${_esc(name)}" style="width:100%;height:100%;object-fit:cover;">\n`;
    } else {
      const { bg, fg } = _productGradient(name);
      imgSide.innerHTML = `
        <div class="product-placeholder" style="background:${bg};">
          <div class="product-placeholder-text" style="color:${fg};font-size:var(--text-3xl);opacity:0.18;">${name}</div>
          <div style="font-size:0.9rem;opacity:0.25;color:${fg};letter-spacing:0.08em;text-transform:uppercase;font-weight:600;font-family:var(--font-body);">Handmade · Kerala</div>
        </div>`;
    }

    // ─── Story section
    _setText('story-product-name', name);
    _setText('story-description',  desc);
    _setText('story-maker-name',   maker);
    _setText('story-maker-location', `${district}, Kerala`);
    _setText('story-maker-bio',
      `${maker} is a home entrepreneur from ${district}, Kerala. Her ${name} reflects ${district}'s rich culinary and craft heritage — made with care, using locally-sourced ingredients and traditional methods passed through generations.`);

    // Maker avatar initials + color
    const initials = maker.split(' ').slice(0,2).map(w => w[0]).join('');
    const avatarBg = _hashColor(s.id || maker);
    const avatarEl = document.getElementById('maker-avatar');
    if (avatarEl) {
      avatarEl.style.background = avatarBg;
      avatarEl.textContent = initials.toUpperCase();
    }

    // ─── CTA section
    _setText('cta-product-name', name);

    // ─── Share button
    const shareBtn = document.getElementById('share-btn');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        const url = window.location.href;
        if (navigator.share) {
          navigator.share({ title: name, text: desc, url });
        } else {
          navigator.clipboard.writeText(url).then(() => _toast('Link copied!'));
        }
      });
    }
  }

  // ─────────────────────────────────────────────────────────
  //  GRADIENT / EMOJI PLACEHOLDER
  // ─────────────────────────────────────────────────────────
  function _productGradient(name) {
    const lower = (name || '').toLowerCase();
    if (/chip|banana|nendran/.test(lower))    return { bg: 'linear-gradient(135deg, #F59E0B, #FBBF24)', fg: '#92400E', emoji: '🍌' };
    if (/coconut|oil|thengai/.test(lower))    return { bg: 'linear-gradient(135deg, #A7F3D0, #6EE7B7)', fg: '#065F46', emoji: '🥥' };
    if (/soap|sabun/.test(lower))             return { bg: 'linear-gradient(135deg, #C7D2FE, #A5B4FC)', fg: '#312E81', emoji: '🧼' };
    if (/achaar|pickle|mango|manga/.test(lower)) return { bg: 'linear-gradient(135deg, #FDE68A, #FCA5A5)', fg: '#7C3AED', emoji: '🥭' };
    if (/coffee|tea|chai/.test(lower))        return { bg: 'linear-gradient(135deg, #D97706, #92400E)', fg: '#FFFBEB', emoji: '☕' };
    if (/rice|ada|puttu/.test(lower))         return { bg: 'linear-gradient(135deg, #FEF3C7, #FDE68A)', fg: '#92400E', emoji: '🍚' };
    if (/spice|masala|curry/.test(lower))     return { bg: 'linear-gradient(135deg, #FCA5A5, #F87171)', fg: '#7F1D1D', emoji: '🌶️' };
    // Default warm gradient
    return { bg: `linear-gradient(135deg, #FAF7F0, #E8DFC8)`, fg: '#0F2044', emoji: '✨' };
  }

  // ─────────────────────────────────────────────────────────
  //  ERROR STATE
  // ─────────────────────────────────────────────────────────
  function _showError(msg) {
    document.body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:var(--cream);flex-direction:column;gap:16px;padding:40px;text-align:center;">
        <div style="font-size:3rem">😕</div>
        <h2 style="font-family:var(--font-heading);color:var(--navy)">Product Not Found</h2>
        <p style="color:var(--text-muted)">${msg}</p>
        <a href="dashboard.html" class="btn btn-primary" style="margin-top:8px">← Back to Dashboard</a>
      </div>`;
  }

  // ─────────────────────────────────────────────────────────
  //  UTILITIES
  // ─────────────────────────────────────────────────────────
  function _setText(id, val) { const e = document.getElementById(id); if (e) e.textContent = val || ''; }
  function _setHtml(id, val) { const e = document.getElementById(id); if (e) e.innerHTML = val || ''; }
  function _esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function _hashColor(str) {
    const colors = ['#0F2044','#1A3366','#B8822E','#1B7A3E','#6B3FA0','#B45309','#0369A1'];
    let h = 0;
    for (let c of (str||'')) h = ((h << 5) - h) + c.charCodeAt(0);
    return colors[Math.abs(h) % colors.length];
  }

  function _toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.querySelector('.toast-container')?.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', LandingUI.init);
