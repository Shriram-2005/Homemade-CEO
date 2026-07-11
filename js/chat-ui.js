/**
 * chat-ui.js â€” WhatsApp-style Chat Interface Controller
 *
 * Handles all DOM interactions, message rendering, typing indicator,
 * file uploads, language toggle, and LLM settings modal.
 *
 * Dependencies (must be loaded first): margin.js, store.js, jami.js
 */

const ChatUI = (() => {
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //  STATE
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let _inputDisabled = false;

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //  DOM REFS
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const $ = id => document.getElementById(id);
  const msgArea    = () => $('messages');
  const msgInput   = () => $('message-input');
  const sendBtn    = () => $('send-btn');
  const attachBtn  = () => $('attach-btn');
  const fileInput  = () => $('file-input');
  const langToggle = () => $('lang-toggle');

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //  INIT
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function init() {
    Store.init();
    initSession();

    // Wire up events
    sendBtn().addEventListener('click', handleSend);
    msgInput().addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });
    attachBtn().addEventListener('click', () => fileInput().click());
    fileInput().addEventListener('change', handleFileSelect);
    langToggle().addEventListener('change', () => {
      JAMI_CONFIG.malayalam = langToggle().checked;
      const labels = document.querySelectorAll('.lang-label');
      labels.forEach((l, i) => l.classList.toggle('lang-label-active', i === (JAMI_CONFIG.malayalam ? 1 : 0)));
    });
    $('settings-btn').addEventListener('click', () => $('settings-modal').classList.remove('hidden'));
    $('modal-close-btn').addEventListener('click', () => $('settings-modal').classList.add('hidden'));
    $('modal-save-btn').addEventListener('click', saveSettings);
    $('settings-modal').addEventListener('click', e => {
      if (e.target === $('settings-modal')) $('settings-modal').classList.add('hidden');
    });

    // Show date header
    addDateSeparator();

    // Start conversation
    _startConversation();

    // Init journey bar
    _updateJourneyBar('onboarding');
  }

  async function _startConversation() {
    setInputDisabled(true);
    showTypingIndicator();
    await delay(1400);
    removeTypingIndicator();

    const response = await getOpeningMessage();
    addJamiMessage(response.text, response.special);
    setInputDisabled(false);
    msgInput().focus();
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //  MESSAGE HANDLERS
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function handleSend() {
    if (_inputDisabled) return;
    const text = msgInput().value.trim();
    if (!text) return;

    msgInput().value = '';
    setInputDisabled(true);

    addUserMessage(text);
    scrollToBottom();

    await delay(250);
    showTypingIndicator();
    await delay(900 + Math.random() * 900); // 0.9â€“1.8s thinking time
    removeTypingIndicator();

    const response = await processUserMessage(text);
    addJamiMessage(response.text, response.special);
    scrollToBottom();
    _updateJourneyBar(response.state);

    if (response.state !== STATE.VALIDATED) {
      setInputDisabled(false);
      msgInput().focus();
    }
  }

  async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';   // allow re-selecting same file

    setInputDisabled(true);
    const reader = new FileReader();

    reader.onload = async ev => {
      const base64 = ev.target.result;
      addUserPhotoMessage(base64);
      scrollToBottom();

      await delay(200);
      showTypingIndicator();
      await delay(900);
      removeTypingIndicator();

      const response = await processPhotoUpload(base64);
      addJamiMessage(response.text, response.special);
      scrollToBottom();

      setInputDisabled(false);
      msgInput().focus();
    };

    reader.readAsDataURL(file);
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //  RENDER: JAMI MESSAGE
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function addJamiMessage(text, special = null) {
    const time = _formatTime(new Date());
    const el = document.createElement('div');
    el.className = 'message jami';

    const avatarSrc = 'assets/jami-avatar.png';
    const specialHtml = special ? _renderSpecial(special) : '';

    el.innerHTML = `
      <img class="msg-avatar" src="${avatarSrc}" alt="Jami"
           onerror="this.style.display='none'">
      <div class="msg-content">
        <div class="bubble">
          <p class="bubble-text">${_escapeHtml(text).replace(/\n/g, '<br>')}</p>
          <div class="bubble-meta">
            <span class="bubble-time">${time}</span>
          </div>
        </div>
        ${specialHtml}
      </div>
    `;

    msgArea().appendChild(el);

    // Wire special card buttons
    if (special?.type === 'photo_upload') {
      setTimeout(() => {
        const btn = el.querySelector('.photo-upload-btn');
        if (btn) btn.addEventListener('click', () => fileInput().click());
      }, 50);
    }
    if (special?.type === 'validated_card') {
      setTimeout(() => {
        const btn = el.querySelector('.view-listing-btn');
        if (btn) {
          btn.addEventListener('click', () => {
            const sid = getSession()?.id;
            window.location.href = `landing.html?seller=${sid}`;
          });
        }
      }, 50);
    }

    scrollToBottom();
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //  RENDER: USER MESSAGE
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function addUserMessage(text) {
    const time = _formatTime(new Date());
    const el = document.createElement('div');
    el.className = 'message user';
    el.innerHTML = `
      <div class="bubble">
        <p class="bubble-text">${_escapeHtml(text)}</p>
        <div class="bubble-meta">
          <span class="bubble-time">${time}</span>
          <span class="read-ticks">âœ“âœ“</span>
        </div>
      </div>
    `;
    msgArea().appendChild(el);
  }

  function addUserPhotoMessage(src) {
    const time = _formatTime(new Date());
    const el = document.createElement('div');
    el.className = 'message user';
    el.innerHTML = `
      <div class="bubble photo-bubble">
        <img src="${src}" alt="Product photo" class="chat-photo">
        <div class="bubble-meta">
          <span class="bubble-time">${time}</span>
          <span class="read-ticks">âœ“âœ“</span>
        </div>
      </div>
    `;
    msgArea().appendChild(el);
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //  RENDER: SPECIAL CARDS
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function _renderSpecial(special) {
    switch (special.type) {
      case 'photo_upload':
        return `
          <div class="special-card upload-card">
            <div class="upload-card-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
            </div>
            <p>Share a photo of your product so customers can see what you're selling</p>
            <button class="photo-upload-btn">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Upload Photo
            </button>
          </div>`;

      case 'margin_card':
        return _renderMarginCard(special.margin);

      case 'validated_card':
        return _renderValidatedCard(special.margin);

      default:
        return '';
    }
  }

  function _renderMarginCard(m) {
    const cls = m.pass ? 'pass' : 'fail';
    const checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    const warnIcon  = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>`;
    const rupee = '&#8377;';
    const breakdownRows = m.breakdown.map(item => `
      <div class="cost-row">
        <span>${item.label}</span>
        <span>${rupee}${item.amount.toFixed(0)}</span>
      </div>`).join('');

    return `
      <div class="special-card margin-card ${cls}">
        <div class="margin-hd">
          <span class="margin-hd-label">Cost Breakdown</span>
          <span class="margin-badge ${cls}">${m.pass ? checkIcon + ' Profitable' : warnIcon + ' Below Target'}</span>
        </div>
        <div class="cost-breakdown">
          ${breakdownRows}
          <div class="cost-row total-row">
            <span>Total Cost</span>
            <span>${rupee}${m.totalCost.toFixed(0)}</span>
          </div>
          <div class="cost-row selling-row">
            <span>Selling Price</span>
            <span>${rupee}${m.sellingPrice.toFixed(0)}</span>
          </div>
        </div>
        <div class="margin-result">
          <span class="margin-pct ${cls}">${m.marginPercent.toFixed(1)}%</span>
          ${!m.pass ? `<span class="target-hint">Need ${rupee}${m.targetPrice}+ to qualify</span>` : ''}
        </div>
      </div>`;
  }

  function _renderValidatedCard(m) {
    // Nilavilakku (Kerala lamp) SVG icon â€” symbol of validation and light
    const lampSVG = `<svg class="lamp-icon" width="28" height="28" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
      <ellipse cx="12" cy="34" rx="7" ry="2" opacity="0.4"/>
      <rect x="11" y="16" width="2" height="18" rx="1"/>
      <path d="M6,16 Q12,10 18,16 Q16,21 12,21 Q8,21 6,16 Z"/>
      <path d="M12,10 Q10,5 12,1 Q14,5 12,10 Z" fill="#C8860A"/>
      <circle cx="12" cy="6" r="3" fill="rgba(200,134,10,0.35)"/>
    </svg>`;
    const arrowSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;
    return `
      <div class="special-card validated-card">
        <div class="validated-lamp">
          ${lampSVG}
          <div>
            <div class="validated-title">Product Validated!</div>
            <div class="validated-sub">${m.marginPercent.toFixed(1)}% margin \u00b7 Kudumbashree Approved</div>
          </div>
        </div>
        <button class="view-listing-btn">${arrowSVG} View Your Listing</button>
      </div>`;
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //  TYPING INDICATOR
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function showTypingIndicator() {
    if (document.getElementById('typing-indicator')) return;
    const el = document.createElement('div');
    el.className = 'message jami';
    el.id = 'typing-indicator';
    el.innerHTML = `
      <img class="msg-avatar" src="assets/jami-avatar.png" alt="Jami"
           onerror="this.style.display='none'">
      <div class="bubble typing-bubble">
        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
      </div>`;
    msgArea().appendChild(el);
    scrollToBottom();
  }

  function removeTypingIndicator() {
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //  DATE SEPARATOR
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function addDateSeparator() {
    const label = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
    const el = document.createElement('div');
    el.className = 'date-separator';
    el.innerHTML = `<span>${label}</span>`;
    msgArea().appendChild(el);
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //  SETTINGS MODAL
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function saveSettings() {
    const apiKey   = $('modal-api-key').value.trim();
    const provider = $('modal-provider').value;
    const model    = $('modal-model').value.trim();

    if (apiKey) {
      JAMI_CONFIG.apiKey   = apiKey;
      JAMI_CONFIG.provider = provider;
      JAMI_CONFIG.model    = model || JAMI_CONFIG.model;
      JAMI_CONFIG.mock     = false;
      $('api-mode-badge').textContent = 'LIVE';
      $('api-mode-badge').className = 'mode-pill live';
      showToast('API connected â€” Jami will use real LLM responses');
    } else {
      JAMI_CONFIG.mock = true;
      $('api-mode-badge').textContent = 'MOCK';
      $('api-mode-badge').className = 'mode-pill';
      showToast('Using mock responses (no API key set)');
    }

    $('settings-modal').classList.add('hidden');
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //  UTILITIES
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function setInputDisabled(disabled) {
    _inputDisabled     = disabled;
    msgInput().disabled = disabled;
    sendBtn().disabled  = disabled;
    msgInput().placeholder = disabled ? 'Jami is thinking…' : 'Type your reply to Jami…';
  }

  function scrollToBottom() {
    const area = msgArea();
    requestAnimationFrame(() => { area.scrollTop = area.scrollHeight; });
  }

  function _formatTime(date) {
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  function _escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(message, duration = 3000) {
    const container = document.querySelector('.toast-container');
    if (!container) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = message;
    container.appendChild(t);
    setTimeout(() => t.remove(), duration);
  }

  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //  JOURNEY BAR â€” updates progress steps
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Maps jami.js STATE constants â†’ journey bar step IDs
  const STATE_TO_STEP = {
    'AWAITING_NAME':          'onboarding',
    'AWAITING_DISTRICT':      'onboarding',
    'AWAITING_PRODUCT':       'intake',
    'AWAITING_DESCRIPTION':   'intake',
    'AWAITING_PHOTO':         'intake',
    'AWAITING_RAW_MATERIALS': 'costing',
    'AWAITING_PACKAGING':     'costing',
    'AWAITING_LABOR_HOURS':   'costing',
    'AWAITING_LABOR_RATE':    'costing',
    'AWAITING_OVERHEAD':      'costing',
    'AWAITING_WASTAGE':       'costing',
    'AWAITING_PRICE':         'costing',
    'COACHING':               'costing',
    'AWAITING_NEW_PRICE':     'costing',
    'VALIDATED':              'validated'
  };
  const STEP_ORDER = ['onboarding','intake','costing','validated'];

  const STEP_NUMBERS = { onboarding: '1', intake: '2', costing: '3', validated: '' };
  const CHECK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

  function _updateJourneyBar(state) {
    const active = STATE_TO_STEP[state] || 'onboarding';
    const activeIdx = STEP_ORDER.indexOf(active);
    STEP_ORDER.forEach((step, idx) => {
      const el = document.getElementById('jstep-' + step);
      if (!el) return;
      el.classList.remove('active', 'done');
      const ind = el.querySelector('.step-indicator');
      if (idx < activeIdx) {
        el.classList.add('done');
        if (ind) ind.innerHTML = CHECK_SVG;
      } else if (idx === activeIdx) {
        el.classList.add('active');
        if (ind && step !== 'validated') ind.innerHTML = STEP_NUMBERS[step];
      } else {
        if (ind && step !== 'validated') ind.innerHTML = STEP_NUMBERS[step];
      }
    });
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', ChatUI.init);
