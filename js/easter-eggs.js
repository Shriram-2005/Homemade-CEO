/**
 * easter-eggs.js — Kerala Easter Eggs for Homemade CEO
 *
 * Six hidden interactive moments woven through the prototype.
 * Each references something specific to Kerala's culture.
 *
 * 1. Thrissur Pooram  — click the HC logo 5× rapidly
 * 2. Vallam Kali      — search "onam" in dashboard
 * 3. Koottayma        — search "koottayma" or "kudumbashree" in dashboard
 * 4. Kathakali        — hover product hero image 7× on landing page
 * 5. Sadya            — type "sadya" in chat input
 * 6. Ente Kerala      — type "ente kerala" in chat input
 */

(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────
     SHARED INFRASTRUCTURE
  ───────────────────────────────────────────────────────── */

  // Inject shared styles once
  const _styles = document.createElement('style');
  _styles.textContent = `
    /* Easter egg toast */
    .ee-toast {
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%) translateY(16px);
      background: #0C1B3A;
      color: white;
      padding: 14px 20px 14px 16px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      gap: 14px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(200,134,10,0.2);
      z-index: 99999;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.35s ease, transform 0.35s ease;
      font-family: 'Inter', sans-serif;
      max-width: 380px;
      min-width: 260px;
      border-left: 4px solid #C8860A;
    }
    .ee-toast.ee-toast--visible {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    .ee-toast--green  { border-left-color: #15803D; }
    .ee-toast--teal   { border-left-color: #1B6B7A; }
    .ee-toast--red    { border-left-color: #8B1A1A; }
    .ee-toast-icon    { font-size: 1.75rem; flex-shrink: 0; line-height: 1; }
    .ee-toast-title   { font-weight: 700; font-size: 0.9375rem; margin-bottom: 2px; }
    .ee-toast-text    { font-size: 0.8125rem; color: rgba(255,255,255,0.6); line-height: 1.45; }

    /* Kerala confetti particle */
    .ee-confetti {
      position: fixed;
      pointer-events: none;
      z-index: 99998;
      border-radius: 2px;
      animation: ee-fall linear forwards;
    }
    @keyframes ee-fall {
      0%   { transform: translateY(-20px) rotate(0deg);   opacity: 1; }
      100% { transform: translateY(105vh) rotate(720deg); opacity: 0; }
    }

    /* Vallam Kali — snake boat */
    .ee-boat {
      position: fixed;
      bottom: 28px;
      pointer-events: none;
      z-index: 99997;
      transition: left 3.5s cubic-bezier(0.25, 0, 0.75, 1);
    }

    /* Kathakali mask overlay */
    .ee-kathakali {
      position: fixed;
      bottom: 48px;
      right: 48px;
      z-index: 99997;
      pointer-events: none;
      animation: ee-katha-in 0.5s ease both;
      filter: drop-shadow(0 8px 24px rgba(139,26,26,0.5));
    }
    @keyframes ee-katha-in {
      from { opacity: 0; transform: scale(0.4) rotate(-15deg); }
      to   { opacity: 1; transform: scale(1) rotate(0deg); }
    }
    @keyframes ee-katha-out {
      from { opacity: 1; transform: scale(1); }
      to   { opacity: 0; transform: scale(0.4) rotate(15deg); }
    }
    .ee-kathakali.leaving { animation: ee-katha-out 0.45s ease forwards; }

    /* Nilavilakku (lamp) glow for validated state — used in chat.css too */
    @keyframes lampGlow {
      0%,100% { filter: drop-shadow(0 0 4px rgba(200,134,10,0.5)); }
      50% { filter: drop-shadow(0 0 16px rgba(200,134,10,0.9)) drop-shadow(0 0 4px rgba(200,134,10,0.5)); }
    }
  `;
  document.head.appendChild(_styles);

  // ── Show toast ─────────────────────────────────────────────
  let _activeToast = null;
  function showToast(iconHTML, title, text, variant = '', duration = 5000) {
    if (_activeToast) { _activeToast.remove(); }

    const t = document.createElement('div');
    t.className = `ee-toast${variant ? ' ee-toast--' + variant : ''}`;
    t.innerHTML = `
      <div class="ee-toast-icon">${iconHTML}</div>
      <div>
        <div class="ee-toast-title">${title}</div>
        <div class="ee-toast-text">${text}</div>
      </div>`;
    document.body.appendChild(t);
    _activeToast = t;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => t.classList.add('ee-toast--visible'));
    });

    setTimeout(() => {
      t.classList.remove('ee-toast--visible');
      setTimeout(() => { if (t.parentNode) t.remove(); }, 400);
    }, duration);
  }

  // ── Kerala confetti ─────────────────────────────────────────
  const KERALA_COLORS = ['#C8860A','#8B1A1A','#2D5A27','#1B6B7A','#F7EDD8','#0C1B3A','#E09A1A'];
  function launchConfetti(count = 110) {
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const p = document.createElement('div');
        const color = KERALA_COLORS[Math.floor(Math.random() * KERALA_COLORS.length)];
        const size  = 5 + Math.random() * 9;
        const dur   = 1.6 + Math.random() * 1.8;
        p.className = 'ee-confetti';
        p.style.cssText = `
          width:${size}px; height:${size}px;
          background:${color};
          left:${Math.random() * 100}vw;
          top:-12px;
          border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
          animation-duration:${dur}s;
        `;
        document.body.appendChild(p);
        p.addEventListener('animationend', () => p.remove());
      }, i * 18);
    }
  }

  /* ─────────────────────────────────────────────────────────
     EASTER EGG 1 — Thrissur Pooram
     Trigger: click the HC logo 5× within 2.5 seconds
     Effect: Kerala-colour confetti + Pooram toast
  ───────────────────────────────────────────────────────── */
  function initThrissurPooram() {
    let clicks = 0, timer;

    // Match all logo elements across pages
    const logos = document.querySelectorAll(
      '.nav-logomark, .dash-brand-mark, .land-brand-mark, [data-easter="logo"]'
    );

    logos.forEach(el => {
      // Make it feel clickable
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        clicks++;
        clearTimeout(timer);
        timer = setTimeout(() => { clicks = 0; }, 2500);

        if (clicks >= 5) {
          clicks = 0;
          launchConfetti(130);
          showToast(
            '🐘',
            'Thrissur Pooram!',
            'നമ്മൾ നമുക്കായി — We for ourselves. Kerala's grandest festival, in your browser.',
            '',
            6000
          );
        }
      });
    });
  }

  /* ─────────────────────────────────────────────────────────
     EASTER EGG 2 — Vallam Kali (Snake Boat Race)
     Trigger: type "onam" in dashboard search
     Effect: snake boat sails across the bottom of the screen
  ───────────────────────────────────────────────────────── */
  function initVallamKali() {
    const search = document.getElementById('search-input');
    if (!search) return;

    let last = '';
    search.addEventListener('input', e => {
      const val = e.target.value.trim().toLowerCase();
      if (val === 'onam' && last !== 'onam') {
        triggerVallamKali();
      }
      last = val;
    });
  }

  function triggerVallamKali() {
    const boat = document.createElement('div');
    boat.className = 'ee-boat';
    boat.style.left = '-200px';
    boat.innerHTML = `
      <svg width="160" height="40" viewBox="0 0 160 40" xmlns="http://www.w3.org/2000/svg">
        <!-- Hull -->
        <path d="M5,28 Q80,12 155,28 Q80,40 5,28 Z" fill="#C8860A"/>
        <!-- Prow (serpent head) -->
        <path d="M153,28 Q162,22 160,34 Q156,32 153,28 Z" fill="#8B1A1A"/>
        <!-- Rowers (oars pattern) -->
        <line x1="25"  y1="26" x2="20"  y2="38" stroke="#F7EDD8" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="45"  y1="22" x2="40"  y2="38" stroke="#F7EDD8" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="65"  y1="20" x2="60"  y2="38" stroke="#F7EDD8" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="85"  y1="19" x2="80"  y2="38" stroke="#F7EDD8" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="105" y1="20" x2="100" y2="38" stroke="#F7EDD8" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="125" y1="22" x2="120" y2="38" stroke="#F7EDD8" stroke-width="1.5" stroke-linecap="round"/>
        <!-- Flag -->
        <line x1="80" y1="18" x2="80" y2="4"  stroke="#0C1B3A" stroke-width="1.5"/>
        <path d="M80,4 L94,8 L80,12 Z" fill="#F7EDD8"/>
      </svg>`;

    document.body.appendChild(boat);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        boat.style.left = 'calc(100vw + 200px)';
      });
    });

    setTimeout(() => boat.remove(), 4000);

    showToast(
      '🚣',
      'Vallam Kali!',
      'Happy Onam — Alappuzha Boat Race, in miniature. Search "koottayma" next!',
      'green',
      4000
    );
  }

  /* ─────────────────────────────────────────────────────────
     EASTER EGG 3 — Koottayma (Kudumbashree Motto)
     Trigger: type "koottayma" or "kudumbashree" in search
     Effect: Kudumbashree motto toast in Malayalam
  ───────────────────────────────────────────────────────── */
  function initKoottayma() {
    const search = document.getElementById('search-input');
    if (!search) return;

    let last = '';
    search.addEventListener('input', e => {
      const val = e.target.value.trim().toLowerCase();
      if ((val === 'koottayma' || val === 'kudumbashree') && last !== val) {
        showToast(
          '💛',
          'നമ്മൾ നമുക്കായി',
          'We for ourselves — Kudumbashree\'s founding spirit. Jami carries this forward for every homemaker in Kerala.',
          'teal',
          6000
        );
      }
      last = val;
    });
  }

  /* ─────────────────────────────────────────────────────────
     EASTER EGG 4 — Kathakali
     Trigger: hover the hero product image 7× on landing page
     Effect: Kathakali mask appears in corner, then fades out
  ───────────────────────────────────────────────────────── */
  function initKathakali() {
    const heroImg = document.getElementById('hero-image-side');
    if (!heroImg) return;

    let hoverCount = 0, hoverTimer;

    heroImg.style.cursor = 'default';
    heroImg.addEventListener('mouseenter', () => {
      hoverCount++;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => { hoverCount = 0; }, 4000);

      if (hoverCount >= 7) {
        hoverCount = 0;
        triggerKathakali();
      }
    });
  }

  function triggerKathakali() {
    const mask = document.createElement('div');
    mask.className = 'ee-kathakali';
    mask.innerHTML = `
      <svg width="130" height="155" viewBox="0 0 130 155" xmlns="http://www.w3.org/2000/svg">
        <!-- Crown / Kireetam -->
        <path d="M20,55 L38,20 L65,12 L92,20 L110,55" fill="#C8860A"/>
        <path d="M30,55 L46,28 L65,20 L84,28 L100,55" fill="#F5E6C0" stroke="#C8860A" stroke-width="1"/>
        <!-- Central crown jewel -->
        <circle cx="65" cy="24" r="6" fill="#8B1A1A"/>
        <circle cx="65" cy="24" r="3" fill="#C8860A"/>
        <!-- Face -->
        <ellipse cx="65" cy="95" rx="46" ry="58" fill="#F5E6C0" stroke="#8B1A1A" stroke-width="2.5"/>
        <!-- Eye surrounds (Kathakali eye paint - chutti) -->
        <ellipse cx="46" cy="83" rx="14" ry="9" fill="white" stroke="#1A1A2E" stroke-width="2"/>
        <ellipse cx="84" cy="83" rx="14" ry="9" fill="white" stroke="#1A1A2E" stroke-width="2"/>
        <!-- Pupils -->
        <ellipse cx="46" cy="83" rx="5.5" ry="5.5" fill="#1A1A2E"/>
        <ellipse cx="84" cy="83" rx="5.5" ry="5.5" fill="#1A1A2E"/>
        <!-- Eye shine -->
        <circle cx="48" cy="81" r="1.5" fill="white"/>
        <circle cx="86" cy="81" r="1.5" fill="white"/>
        <!-- Cheek paint (characteristic green arcs) -->
        <path d="M22,88 Q30,80 44,84" stroke="#2D5A27" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <path d="M108,88 Q100,80 86,84" stroke="#2D5A27" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <!-- Nose ornament -->
        <circle cx="65" cy="100" r="3.5" fill="none" stroke="#C8860A" stroke-width="2"/>
        <circle cx="65" cy="100" r="1" fill="#C8860A"/>
        <!-- Mouth (characteristic Kathakali smile curve) -->
        <path d="M48,116 Q65,130 82,116" fill="none" stroke="#8B1A1A" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M50,116 Q65,122 80,116" fill="rgba(139,26,26,0.15)"/>
        <!-- Cheek circles -->
        <circle cx="24" cy="98" r="9" fill="none" stroke="#C8860A" stroke-width="2"/>
        <circle cx="106" cy="98" r="9" fill="none" stroke="#C8860A" stroke-width="2"/>
        <!-- Eyebrow (bold arcs) -->
        <path d="M34,72 Q46,64 58,70" stroke="#1A1A2E" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M72,70 Q84,64 96,72" stroke="#1A1A2E" stroke-width="3" fill="none" stroke-linecap="round"/>
      </svg>`;

    document.body.appendChild(mask);

    setTimeout(() => {
      mask.classList.add('leaving');
      setTimeout(() => mask.remove(), 500);
    }, 3500);

    showToast(
      '🎭',
      'Kathakali Appears!',
      'Kerala\'s ancient storytelling art. Every product on this platform has its own story too.',
      'red',
      4000
    );
  }

  /* ─────────────────────────────────────────────────────────
     EASTER EGG 5 — Sadya
     Trigger: type "sadya" anywhere in chat input
     Effect: special Jami response hint + toast
     (Jami itself also catches this keyword in jami.js)
  ───────────────────────────────────────────────────────── */
  function initSadyaEgg() {
    const input = document.getElementById('message-input');
    if (!input) return;

    let shown = false;
    input.addEventListener('input', e => {
      if (!shown && e.target.value.toLowerCase().includes('sadya')) {
        shown = true;
        showToast(
          '🍌',
          'Onam Sadya!',
          'Jami loves a good feast. She\'ll have something to say about this — try sending it!',
          'green',
          3500
        );
        setTimeout(() => { shown = false; }, 8000);
      }
    });
  }

  /* ─────────────────────────────────────────────────────────
     EASTER EGG 6 — Ente Kerala
     Trigger: type "ente kerala" in chat input
     Effect: Kerala pride toast + small animation
  ───────────────────────────────────────────────────────── */
  function initEnteKerala() {
    const input = document.getElementById('message-input');
    if (!input) return;

    let shown = false;
    input.addEventListener('input', e => {
      if (!shown && e.target.value.toLowerCase().includes('ente kerala')) {
        shown = true;
        launchConfetti(60);
        showToast(
          '🌿',
          'എന്റെ കേരളം',
          '"God\'s Own Country" — and soon, every homemaker\'s own enterprise.',
          'teal',
          5000
        );
        setTimeout(() => { shown = false; }, 10000);
      }
    });
  }

  /* ─────────────────────────────────────────────────────────
     INIT — run all easter eggs on DOMContentLoaded
  ───────────────────────────────────────────────────────── */
  function init() {
    initThrissurPooram();
    initVallamKali();
    initKoottayma();
    initKathakali();
    initSadyaEgg();
    initEnteKerala();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
