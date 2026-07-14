/**
 * chat-ui.js — Voice-Forward Assistant Redesign
 *
 * Handles DOM interactions, speech synthesis (TTS), speech recognition (STT),
 * message rendering, file uploads, and settings modal.
 */

const ChatUI = (() => {
  let _inputDisabled = false;
  let _synth = window.speechSynthesis;
  let _recognition = window.SpeechRecognition || window.webkitSpeechRecognition ? new (window.SpeechRecognition || window.webkitSpeechRecognition)() : null;
  let _ttsSpeed = 1.0;

  // Global Audio Unlocker to bypass strict browser autoplay policies for async TTS
  let _audioUnlocked = false;
  document.addEventListener('click', () => {
    if (!_audioUnlocked) {
      const unlockAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
      unlockAudio.volume = 0;
      unlockAudio.play().catch(()=>{});
      _audioUnlocked = true;
    }
  }, { once: true });

  // Warm up voices immediately so they are ready by the time Jami speaks
  if (_synth) {
    _synth.getVoices();
    if (_synth.onvoiceschanged !== undefined) {
      _synth.onvoiceschanged = () => _synth.getVoices();
    }
  }

  // Initialize Speech Recognition if supported
  if (_recognition) {
    _recognition.continuous = false;
    _recognition.interimResults = false;
    _recognition.lang = 'en-IN'; // Will be updated dynamically based on language
  }

  // ─── DOM REFS ──────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const msgArea    = () => $('messages');
  const msgInput   = () => $('message-input');
  const sendBtn    = () => $('send-btn');
  const attachBtn  = () => $('attach-btn');
  const fileInput  = () => $('file-input');
  const threeDotBtn= () => $('three-dot-btn');
  const optionsMenu= () => $('options-dropdown');
  const micBtn     = () => $('mic-btn');
  const kbToggle   = () => $('keyboard-toggle-btn');
  const kbWrap     = () => $('keyboard-input-wrap');

  // ─── INIT ─────────────────────────────────────────────────────────────
  async function init() {
    Store.init();
    
    // Wait for JAMI config/env to load before starting
    if (typeof window.initializeJami === 'function') {
      await window.initializeJami();
    }
    
    initSession();

    // Wire up events
    sendBtn().addEventListener('click', handleSend);
    msgInput().addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });
    attachBtn().addEventListener('click', () => fileInput().click());
    fileInput().addEventListener('change', handleFileSelect);
    
    // Keyboard / Mic toggle
    kbToggle().addEventListener('click', () => {
      kbWrap().classList.toggle('hidden');
      if (!kbWrap().classList.contains('hidden')) {
        msgInput().focus();
      }
    });

    // 3-Dot Menu Toggle
    threeDotBtn().addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = optionsMenu();
      menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', () => {
      optionsMenu().style.display = 'none';
    });

    // Reset Chat Button
    const menuReset = $('menu-reset-chat');
    if (menuReset) {
      menuReset.addEventListener('click', () => {
        if (confirm('Are you sure you want to start a fresh conversation?')) {
          Store.resetLiveSellers();
          location.reload();
        }
      });
    }
    
    // Language options
    $('menu-lang-en').addEventListener('click', () => { JAMI_CONFIG.malayalam = false; alert("Language set to English"); });
    $('menu-lang-ml').addEventListener('click', () => { JAMI_CONFIG.malayalam = true; alert("ഭാഷ മലയാളത്തിലേക്ക് മാറ്റി"); });

    // Text Size options
    const sizes = ['sm', 'mid', 'md', 'lg', 'xl'];
    sizes.forEach(sz => {
      $(`menu-size-${sz}`).addEventListener('click', () => {
        document.body.className = document.body.className.replace(/text-size-\w+/g, '');
        document.body.classList.add(`text-size-${sz}`);
      });
    });

    // Voice Toggle
    const voiceToggleBtn = $('menu-voice-toggle');
    if (voiceToggleBtn) {
      voiceToggleBtn.addEventListener('click', () => {
        if (JAMI_CONFIG.voiceOn) {
          JAMI_CONFIG.voiceOn = false;
          $('voice-toggle-text').textContent = 'Voice: OFF';
          _synth.cancel();
          document.querySelectorAll('.tts-btn').forEach(b => b.classList.remove('playing'));
        } else {
          JAMI_CONFIG.voiceOn = true;
          $('voice-toggle-text').textContent = 'Voice: ON';
        }
      });
    }

    lucide.createIcons();

    // Voice Recording
    if (_recognition) {
      micBtn().addEventListener('click', toggleRecording);
      _recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        msgInput().value = transcript;
        handleSend();
      };
      _recognition.onend = () => {
        micBtn().classList.remove('listening');
      };
      _recognition.onerror = (e) => {
        console.error('Speech recognition error', e.error);
        micBtn().classList.remove('listening');
        showToast('Microphone error: ' + e.error);
      };
    } else {
      micBtn().addEventListener('click', () => showToast('Speech recognition not supported in this browser.'));
    }
    const settingsBtn = $('settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => $('settings-modal').classList.remove('hidden'));
      $('modal-close-btn').addEventListener('click', () => $('settings-modal').classList.add('hidden'));
      $('modal-save-btn').addEventListener('click', saveSettings);
      $('settings-modal').addEventListener('click', e => {
        if (e.target === $('settings-modal')) $('settings-modal').classList.add('hidden');
      });
    }
    // Resume or Start conversation
    const session = getSession();
    if (session.history && session.history.length > 0) {
      session.history.forEach(msg => {
        const text = msg.content || msg.text || '';
        if (msg.role === 'assistant' || msg.role === 'jami') {
          addJamiMessage(text, msg.special, false); // false to not autoplay
        } else {
          addUserMessage(text);
        }
      });
      scrollToBottom();
      _updateJourneyBar(session.state);
      
      // Restore quick replies for the current state if any
      if (typeof window.getQuickReplies === 'function') {
        showQuickReplies(window.getQuickReplies(session.state));
      }
    } else {
      _startConversation();
      _updateJourneyBar('onboarding');
    }
  }

  function toggleRecording() {
    if (micBtn().classList.contains('listening')) {
      _recognition.stop();
      micBtn().classList.remove('listening');
    } else {
      _recognition.lang = (window.JAMI_CONFIG && window.JAMI_CONFIG.malayalam) ? 'ml-IN' : 'en-IN';
      try {
        _recognition.start();
        micBtn().classList.add('listening');
      } catch (e) {
        console.error(e);
      }
    }
  }

  async function _startConversation() {
    setInputDisabled(true);
    showTypingIndicator();
    await delay(1400);
    removeTypingIndicator();

    const response = await getOpeningMessage();
    addJamiMessage(response.text, response.special);
    showQuickReplies(response.quickReplies);
    setInputDisabled(false);
  }

  // ─── MESSAGE HANDLERS ─────────────────────────────────────────────────
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
    await delay(900 + Math.random() * 900);
    removeTypingIndicator();

    const response = await processUserMessage(text);
    addJamiMessage(response.text, response.special);
    showQuickReplies(response.quickReplies);
    scrollToBottom();
    _updateJourneyBar(response.state);

    if (response.state !== STATE.VALIDATED) {
      setInputDisabled(false);
      // Removed auto-focus so mobile keyboard doesn't pop up over voice UI
    }
  }

  async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

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
      showQuickReplies(response.quickReplies);
      scrollToBottom();

      setInputDisabled(false);
    };

    reader.readAsDataURL(file);
  }

  // ─── RENDER: JAMI MESSAGE ─────────────────────────────────────────────
  function addJamiMessage(text, special = null, autoPlay = true) {
    const time = _formatTime(new Date());
    const el = document.createElement('div');
    el.className = 'message jami';

    const specialHtml = special ? _renderSpecial(special) : '';
    
    // Auto-play TTS
    const isMl = window.JAMI_CONFIG && window.JAMI_CONFIG.malayalam;
    const langCode = isMl ? 'ml-IN' : 'en-IN';
    if (autoPlay && window.JAMI_CONFIG && window.JAMI_CONFIG.voiceOn) {
      playTTS(text, langCode, el);
    }

    el.innerHTML = `
      <div style="display:flex; gap:12px; max-width: 85%;">
        <div class="tts-container" style="display:flex; flex-direction:column; align-items:center; width:40px;">
          <button class="tts-btn" aria-label="Play audio">
            <i data-lucide="play" class="icon-sm tts-icon"></i>
          </button>
          <button class="tts-speed-btn" style="font-size:12px; font-weight:bold; margin-top:4px; padding:2px 6px; border-radius:4px; border:none; background:var(--slate-100); cursor:pointer; color:var(--slate-700);">1x</button>
        </div>
        <div style="flex:1">
          <div class="bubble bubble-jami">
            <p class="bubble-text">${_escapeHtml(text).replace(/\n/g, '<br>')}</p>
          </div>
          ${specialHtml}
        </div>
      </div>
    `;

    msgArea().appendChild(el);
    lucide.createIcons({ root: el });

    // Wire TTS button
    const ttsBtn = el.querySelector('.tts-btn');
    const ttsIcon = el.querySelector('.tts-icon');
    const speedBtn = el.querySelector('.tts-speed-btn');
    
    // Set initial speed text
    speedBtn.textContent = _ttsSpeed + 'x';
    
    speedBtn.addEventListener('click', () => {
      if (_ttsSpeed === 1.0) _ttsSpeed = 1.5;
      else if (_ttsSpeed === 1.5) _ttsSpeed = 0.5;
      else _ttsSpeed = 1.0;
      
      // Update ALL speed buttons
      document.querySelectorAll('.tts-speed-btn').forEach(btn => btn.textContent = _ttsSpeed + 'x');
      
      if (_synth.speaking) {
         window._speedChangeRequested = true;
         _synth.cancel(); 
         setTimeout(() => {
           playTTS(text, langCode, el, window._activeBoundaryIndex || 0);
         }, 100);
      }
    });

    ttsBtn.addEventListener('click', () => {
      if (_synth.speaking) {
        window._speedChangeRequested = false;
        _synth.cancel();
        document.querySelectorAll('.tts-btn').forEach(b => {
          b.classList.remove('playing');
          const i = b.querySelector('.tts-icon');
          if(i) {
            i.setAttribute('data-lucide', 'play');
            lucide.createIcons({ root: b });
          }
        });
      } else {
        window._speedChangeRequested = false;
        playTTS(text, langCode, el);
      }
    });

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

  function playTTS(text, langCode, messageContainer, startIndex = 0) {
    // Only cancel if this is a fresh play, not a speed change resumption
    if (!window._speedChangeRequested) {
      if (window._currentAudio) {
        window._currentAudio.pause();
        window._currentAudio.currentTime = 0;
      }
      if (_synth) _synth.cancel();
      window._activeBoundaryIndex = 0;
    }
    
    // Reset all icons to play
    document.querySelectorAll('.tts-btn').forEach(b => {
      b.classList.remove('playing');
      const i = b.querySelector('.tts-icon');
      if (i) {
        i.setAttribute('data-lucide', 'play');
        lucide.createIcons({ root: b });
      }
    });

    const playUtterance = (segmentText, segmentLang, startIdx) => {
      return new Promise((resolve) => {
        const strippedFullText = segmentText.replace(/<[^>]+>/g, '');
        const textToPlay = strippedFullText.substring(startIdx || 0);
        if (!textToPlay.trim()) return resolve();
        
        const tl = segmentLang.includes('ml') ? 'ml' : 'en';
        // Use Google Translate TTS for guaranteed high-quality female pronunciation
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${tl}&q=${encodeURIComponent(textToPlay)}`;
        
        const audio = new Audio(url);
        audio.playbackRate = _ttsSpeed;
        window._currentAudio = audio;
        
        audio.onended = resolve;
        audio.onerror = () => {
          if (!window._speedChangeRequested) resolve();
        };
        
        audio.play().catch(e => {
          console.error("Audio play failed:", e);
          resolve();
        });
      });
    };

    const runTTS = async () => {
      const btn = messageContainer ? messageContainer.querySelector('.tts-btn') : null;
      if (btn) {
        btn.classList.add('playing');
        const icon = btn.querySelector('.tts-icon');
        if (icon) {
          icon.setAttribute('data-lucide', 'pause');
          lucide.createIcons({ root: btn });
        }
      }

      if (text.includes('/') && text.includes('ദയവായി')) {
        const parts = text.split('/');
        // If startIndex is beyond part 1, we just play part 2
        const p1 = parts[0].trim();
        const p2 = parts[1].trim();
        if (startIndex < p1.length) {
           await playUtterance(p1, 'en-IN', startIndex);
           if (!window._speedChangeRequested) {
             window._activeBoundaryIndex = p1.length + 3; // roughly past the '/'
             await playUtterance(p2, 'ml-IN', 0);
           }
        } else {
           const adjustedStart = Math.max(0, startIndex - p1.length - 3);
           await playUtterance(p2, 'ml-IN', adjustedStart);
        }
      } else {
        await playUtterance(text, langCode, startIndex);
      }

      if (btn && !window._speedChangeRequested) {
        btn.classList.remove('playing');
        const icon = btn.querySelector('.tts-icon');
        if (icon) {
          icon.setAttribute('data-lucide', 'play');
          lucide.createIcons({ root: btn });
        }
      }
    };

    runTTS();
  }

  // ─── RENDER: USER MESSAGE ─────────────────────────────────────────────
  function addUserMessage(text) {
    const time = _formatTime(new Date());
    const el = document.createElement('div');
    el.className = 'message user';
    el.innerHTML = `
      <div class="bubble bubble-user">
        <p class="bubble-text">${_escapeHtml(text)}</p>
      </div>
    `;
    msgArea().appendChild(el);
  }

  function addUserPhotoMessage(src) {
    const el = document.createElement('div');
    el.className = 'message user';
    el.innerHTML = `
      <div class="bubble bubble-user photo-bubble">
        <img src="${src}" alt="Product photo" class="chat-photo">
      </div>
    `;
    msgArea().appendChild(el);
  }

  // ─── RENDER: SPECIAL CARDS ────────────────────────────────────────────
  function _renderSpecial(special) {
    switch (special.type) {
      case 'photo_upload':
        return `
          <div class="receipt-card" style="cursor:pointer;" onclick="document.getElementById('file-input').click()">
            <div class="receipt-icon"><i data-lucide="camera" class="icon-lg"></i></div>
            <div>
              <div style="font-weight:700; color:var(--navy); font-size:1.1rem;">Upload Photo</div>
              <div style="font-size:0.9rem; color:var(--slate-500)">Tap here to open camera</div>
            </div>
          </div>`;

      case 'receipt_card':
        return `
          <div class="receipt-card">
            <div class="receipt-icon"><i data-lucide="${special.icon || 'indian-rupee'}" class="icon-lg"></i></div>
            <div>
              <div style="font-size:0.9rem; color:var(--slate-500); text-transform:uppercase; letter-spacing:1px; font-weight:600">${special.label}</div>
              <div class="receipt-value">${special.value}</div>
            </div>
          </div>`;

      case 'margin_card':
        return _renderMarginCard(special.margin);

      case 'product_video_card':
        return _renderProductVideoCard(special);

      default:
        return '';
    }
  }

  function _renderMarginCard(m) {
    const cls = m.pass ? 'pass' : 'fail';
    const rupee = '&#8377;';
    const breakdownRows = m.breakdown.map(item => `
      <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:1.1rem; color:var(--slate-600)">
        <span>${item.label}</span>
        <span>${rupee}${item.amount.toFixed(0)}</span>
      </div>`).join('');

    return `
      <div style="background:white; border:2px solid var(--gold); border-radius:16px; padding:20px; margin-top:10px; box-shadow: 0 4px 15px rgba(200,134,10,0.1)">
        <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid var(--slate-200); padding-bottom:12px; margin-bottom:12px;">
          <strong style="color:var(--navy); font-size:1.2rem;">Cost Breakdown</strong>
        </div>
        ${breakdownRows}
        <div style="display:flex; justify-content:space-between; margin-top:16px; font-weight:700; font-size:1.2rem; color:var(--navy)">
          <span>Total Cost</span>
          <span>${rupee}${m.totalCost.toFixed(0)}</span>
        </div>
      </div>`;
  }

  function _renderProductVideoCard(special) {
    const photoUrl = special.photoUrl || '';
    
    return `
      <div class="product-video-card">
        <div class="product-video-container">
          <img src="${photoUrl}" class="product-video-img" alt="AI Edited Product">
        </div>
        <div class="video-caption">
          <i data-lucide="sparkles" class="icon-sm" style="color:var(--gold)"></i> 
          <span data-i18n="ai-enhancing">AI is enhancing your product photo...</span>
        </div>
        
        <div class="receipt-card" style="background:var(--success-bg); border-color:var(--success); flex-direction:column; align-items:flex-start; margin-top:16px;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div class="receipt-icon" style="background:var(--success); color:white;"><i data-lucide="check-circle-2" class="icon-lg"></i></div>
            <div>
              <div style="font-weight:700; color:var(--success); font-size:1.3rem;">Product Validated!</div>
              <div style="color:var(--success); font-size:1rem;">Kudumbashree Approved</div>
            </div>
          </div>
          <button class="view-listing-btn" onclick="window.location.href='landing.html?seller=${special.sellerId}'">
            <i data-lucide="external-link" class="icon-sm"></i> View Your Storefront
          </button>
        </div>
      </div>
    `;
  }

  // ─── TYPING INDICATOR ────────────────────────────────────────────────
  function showTypingIndicator() {
    if (document.getElementById('typing-indicator')) return;
    const el = document.createElement('div');
    el.className = 'message jami';
    el.id = 'typing-indicator';
    el.innerHTML = `
      <div style="display:flex; gap:12px; max-width: 85%;">
        <div class="tts-btn" style="opacity:0.3"><i data-lucide="volume-2" class="icon-sm"></i></div>
        <div class="bubble bubble-jami" style="display:flex; align-items:center; height:48px;">
          <span class="dot" style="animation: typing 1.4s infinite 0s both; width:6px; height:6px; background:var(--gold); border-radius:50%; margin:0 3px;"></span>
          <span class="dot" style="animation: typing 1.4s infinite 0.2s both; width:6px; height:6px; background:var(--gold); border-radius:50%; margin:0 3px;"></span>
          <span class="dot" style="animation: typing 1.4s infinite 0.4s both; width:6px; height:6px; background:var(--gold); border-radius:50%; margin:0 3px;"></span>
        </div>
      </div>`;
    msgArea().appendChild(el);
    lucide.createIcons({ root: el });
    scrollToBottom();
  }

  function removeTypingIndicator() {
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();
  }

  // ─── SETTINGS MODAL ──────────────────────────────────────────────────
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
      showToast('API connected — Jami will use real LLM responses');
    } else {
      JAMI_CONFIG.mock = true;
      $('api-mode-badge').textContent = 'MOCK';
      $('api-mode-badge').className = 'mode-pill';
      showToast('Using mock responses (no API key set)');
    }
    $('settings-modal').classList.add('hidden');
  }

  // ─── UTILITIES ───────────────────────────────────────────────────────
  function setInputDisabled(disabled) {
    _inputDisabled = disabled;
    msgInput().disabled = disabled;
    sendBtn().disabled  = disabled;
    micBtn().disabled = disabled;
    micBtn().style.opacity = disabled ? '0.5' : '1';
    
    const isMl = window.JAMI_CONFIG && window.JAMI_CONFIG.malayalam;
    const label = $('mic-btn').querySelector('.mic-label');
    if (disabled) {
      msgInput().placeholder = isMl ? 'ജാമി ചിന്തിക്കുന്നു...' : 'Jami is thinking…';
      if(label) label.textContent = isMl ? 'കാത്തിരിക്കുക...' : 'Wait...';
    } else {
      msgInput().placeholder = isMl ? 'നിങ്ങളുടെ മറുപടി ടൈപ്പ് ചെയ്യുക...' : 'Type your reply to Jami…';
      if(label) label.textContent = isMl ? 'സംസാരിക്കാൻ ടാപ്പ് ചെയ്യുക' : 'Tap to Speak';
    }
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

  function showQuickReplies(options) {
    const container = document.getElementById('quick-replies-container');
    if (!container) return;
    container.innerHTML = '';
    if (!options || options.length === 0) {
      container.style.display = 'none';
      return;
    }
    container.style.display = 'flex';
    options.forEach(opt => {
      // Chunk options: opt might be an object { label, icon } or just string
      const label = opt.label || opt;
      const iconName = opt.icon || 'message-square';

      const btn = document.createElement('div');
      btn.className = 'quick-reply-chunky';
      btn.innerHTML = `<i data-lucide="${iconName}" class="icon-lg"></i><span>${label}</span>`;
      btn.onclick = () => {
        msgInput().value = label;
        handleSend();
      };
      container.appendChild(btn);
    });
    lucide.createIcons({ root: container });
  }

  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ─── JOURNEY BAR (Top Stepper) ──────────────────────────────────────
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
    'AWAITING_UNITS_PER_BATCH': 'costing',
    'AWAITING_PRICE':         'costing',
    'COACHING':               'costing',
    'AWAITING_NEW_PRICE':     'costing',
    'VALIDATED':              'validated'
  };
  const STEP_ORDER = ['onboarding','intake','costing','validated'];

  function _updateJourneyBar(state) {
    const active = STATE_TO_STEP[state] || 'onboarding';
    const activeIdx = STEP_ORDER.indexOf(active);

    const wrappers = document.querySelectorAll('.step-wrapper');
    const lines = document.querySelectorAll('.step-line');

    wrappers.forEach((wrapper, idx) => {
      // Clear previous states
      wrapper.classList.remove('active', 'passed');
      
      if (idx === activeIdx) {
        wrapper.classList.add('active'); // Current step
      } else if (idx < activeIdx) {
        wrapper.classList.add('passed'); // Completed step
      }
    });

    lines.forEach((line, idx) => {
      line.classList.remove('active', 'passed');
      if (idx < activeIdx) line.classList.add('passed');
      else if (idx === activeIdx) line.classList.add('active');
    });
  }

  return { init, showQuickReplies };
})();

document.addEventListener('DOMContentLoaded', ChatUI.init);
