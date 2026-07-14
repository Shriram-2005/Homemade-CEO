/**
 * jami.js - Jami AI State Machine & LLM Connector
 *
 * ARCHITECTURE:
 *   • State machine controls WHAT to ask and WHEN to transition
 *   • LLM (or mock) generates HOW Jami says it
 *   • Data extraction is deterministic (regex-based)
 *
 * DEPENDENCIES: margin.js, store.js (load before this file)
 *
 * TO USE A REAL LLM: set JAMI_CONFIG.mock = false and fill in apiKey + provider.
 */

// ================================================================
//  CONFIGURATION - Edit here to enable real LLM API
// ================================================================
const JAMI_CONFIG = {
  mock:     true,               // false = use real API
  provider: 'openai',           // 'openai' | 'anthropic' | 'gemini'
  apiKey:   '',                 // Your API key here
  model:    'gpt-4o',          // e.g. 'gpt-4o', 'claude-3-5-sonnet-20241022', 'gemini-2.5-flash'
  baseUrl:  'https://api.openai.com/v1',
  malayalam: false,             // Toggled by the chat UI
  voiceOn:  true                // Auto-play TTS toggle
};

// Attempt to load .env file for local prototyping
window.initializeJami = async () => {
  try {
    const res = await fetch('/.env');
    if (res.ok) {
      const text = await res.text();
      const match = text.match(/GEMINI_API_KEY=(.+)/);
      if (match && match[1]) {
        JAMI_CONFIG.apiKey = match[1].trim();
        JAMI_CONFIG.provider = 'gemini';
        JAMI_CONFIG.model = 'gemini-2.5-flash';
        JAMI_CONFIG.mock = false;
        console.log("Loaded Gemini API key from .env");
      }
    }
  } catch (e) {
    console.log("No .env found, using mock mode or manual settings.");
  }
};

// ================================================================
//  CONVERSATION STATES
// ================================================================
const STATE = Object.freeze({
  AWAITING_LANGUAGE:       'AWAITING_LANGUAGE',
  AWAITING_NAME:           'AWAITING_NAME',
  AWAITING_DISTRICT:       'AWAITING_DISTRICT',
  AWAITING_PRODUCT:        'AWAITING_PRODUCT',
  AWAITING_DESCRIPTION:    'AWAITING_DESCRIPTION',
  AWAITING_PHOTO:          'AWAITING_PHOTO',
  AWAITING_RAW_MATERIALS:  'AWAITING_RAW_MATERIALS',
  AWAITING_PACKAGING:      'AWAITING_PACKAGING',
  AWAITING_LABOR_HOURS:    'AWAITING_LABOR_HOURS',
  AWAITING_LABOR_RATE:     'AWAITING_LABOR_RATE',
  AWAITING_OVERHEAD:       'AWAITING_OVERHEAD',
  AWAITING_WASTAGE:        'AWAITING_WASTAGE',
  AWAITING_UNITS_PER_BATCH:'AWAITING_UNITS_PER_BATCH',
  AWAITING_PRICE:          'AWAITING_PRICE',
  COACHING:                'COACHING',
  AWAITING_NEW_PRICE:      'AWAITING_NEW_PRICE',
  VALIDATED:               'VALIDATED'
});

// ================================================================
//  SESSION STATE
// ================================================================
let _session = null;

function initSession() {
  const id = Store.generateId();
  _session = {
    id,
    state: STATE.AWAITING_LANGUAGE,
    history: [],   // [{role:'user'|'assistant', content:''}]
    data: {
      name: '', district: '',
      product: { name: '', description: '', photoUrl: null },
      costs: {
        rawMaterials: 0, packaging: 0,
        laborHours: 0,   laborRate: 50,
        overhead: 0,     wastagePercent: 0,
        unitsPerBatch: 1
      },
      sellingPrice: 0,
      margin: null
    }
  };
  Store.setCurrentSessionId(id);
  return _session;
}

function getSession() { return _session; }

// ================================================================
//  GLOBAL INTERFACE
// ================================================================
window.getOpeningMessage = getOpeningMessage;
window.processUserMessage = processUserMessage;
window.getSession = getSession;
window.getQuickReplies = _getQuickReplies;

// ================================================================
//  PUBLIC API
// ================================================================

/** Called once when chat loads - returns Jami's opening message */
async function getOpeningMessage() {
  const response = await _generateResponse(_session.state, null);
  _session.history.push({ role: 'assistant', content: response.text });
  return response;
}

/** Main entry point - called for every text message from the user */
async function processUserMessage(userText) {
  _session.history.push({ role: 'user', content: userText });

  // 1. Extract structured data from the user's text
  _extractData(userText, _session.state, _session.data);

  // 1.5 Kerala District Validation
  if (_session.state === STATE.AWAITING_DISTRICT) {
    const keralaDistricts = ['thiruvananthapuram', 'kollam', 'pathanamthitta', 'alappuzha', 'kottayam', 'idukki', 'ernakulam', 'thrissur', 'palakkad', 'malappuram', 'kozhikode', 'wayanad', 'kannur', 'kasaragod'];
    const entered = _session.data.district.toLowerCase();
    const isValid = keralaDistricts.some(d => entered.includes(d));
    if (!isValid) {
      const msg = JAMI_CONFIG.malayalam
        ? `ക്ഷമിക്കണം, ഹോംമെയ്ഡ് സിഇഒ നിലവിൽ കേരളത്തിൽ മാത്രമേ ലഭ്യമാകൂ. താങ്കൾ നൽകിയ സ്ഥലം കേരളത്തിലാണോ എന്ന് പരിശോധിക്കാമോ?`
        : `I'm sorry, but Homemade CEO is currently only available for sellers based in Kerala. Could you please check if your district is within Kerala?`;
      _session.history.push({ role: 'assistant', content: msg });
      _persistSession();
      return { text: msg, state: STATE.AWAITING_DISTRICT, special: null, quickReplies: [] };
    }
  }

  // 2. Calculate margin if we now have a selling price
  const priceStates = [STATE.AWAITING_PRICE, STATE.AWAITING_NEW_PRICE];
  if (priceStates.includes(_session.state) && _session.data.sellingPrice > 0) {
    _session.data.margin = MarginCalculator.calculate({
      ...  _session.data.costs,
      sellingPrice: _session.data.sellingPrice
    });
  }

  // 3. Advance state
  _session.state = _nextState(_session.state, _session.data);

  // 4. Generate Jami's response
  const response = await _generateResponse(_session.state, userText);
  _session.history.push({ role: 'assistant', content: response.text });

  // 5. Persist to dashboard
  _persistSession();

  return response;
}

/** Called after the user selects a photo from the file picker */
async function processPhotoUpload(photoUrl) {
  // If we have real API enabled and it's Gemini, let's validate the image
  if (!JAMI_CONFIG.mock && JAMI_CONFIG.provider === 'gemini') {
    try {
      const d = _session.data;
      const promptText = `You are a product validator. The user claims this product is "${d.product.name}" and the preparation procedure is "${d.product.description}". Does the image match the product name and the preparation method? Return a JSON object: {"matches": true|false, "reason": "brief polite explanation if false"}`;
      
      const b64Data = photoUrl.split(',')[1];
      const mimeType = photoUrl.substring(photoUrl.indexOf(':') + 1, photoUrl.indexOf(';'));

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${JAMI_CONFIG.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: promptText },
                { inline_data: { mime_type: mimeType, data: b64Data } }
              ]
            }],
            generationConfig: { response_mime_type: "application/json" }
          })
        }
      );

      if (res.ok) {
        const data = await res.json();
        const jsonText = data.candidates[0].content.parts[0].text;
        const validation = JSON.parse(jsonText);
        
        if (!validation.matches) {
          // It doesn't match! Ask the user to clarify politely.
          const text = (JAMI_CONFIG.malayalam) 
            ? `ക്ഷമിക്കണം, നിങ്ങൾ അയച്ച ഫോട്ടോയും "${d.product.name}" എന്ന പേരും പൊരുത്തപ്പെടുന്നില്ല എന്ന് തോന്നുന്നു. ${validation.reason}. ശരിയായ ഫോട്ടോ ഒന്നുകൂടി അയക്കാമോ?`
            : `I'm a bit confused! The photo doesn't quite look like "${d.product.name}" prepared the way you described. ${validation.reason}. Could you please check and upload the correct photo?`;
          
          _session.history.push({ role: 'assistant', content: text });
          _persistSession();
          return { text, state: STATE.AWAITING_PHOTO, special: { type: 'photo_upload' }, quickReplies: [] };
        }
      }
    } catch (err) {
      console.error("Gemini Vision Validation Error:", err);
      // Fallback to normal flow if error
    }
  }

  // Set the Flank image with CSS in the UI (Simulating realistic illustration via CSS filter on uploaded image)
  const leftFlank = document.getElementById('left-flank');
  const rightFlank = document.getElementById('right-flank');
  if (leftFlank && rightFlank) {
    leftFlank.style.backgroundImage = `url(${photoUrl})`;
    rightFlank.style.backgroundImage = `url(${photoUrl})`;
  }

  _session.data.product.photoUrl = photoUrl;
  _session.state = STATE.AWAITING_RAW_MATERIALS;

  const response = await _generateResponse(STATE.AWAITING_RAW_MATERIALS, '[photo]');
  _session.history.push({ role: 'assistant', content: response.text });
  _persistSession();
  return response;
}

// ================================================================
//  DATA EXTRACTION  (deterministic, no LLM needed)
// ================================================================
function _extractData(text, state, data) {
  const num = _extractNumber(text);

  switch (state) {
    case STATE.AWAITING_LANGUAGE:
      if (text.toLowerCase().includes('മലയാളം') || text.toLowerCase().includes('malayalam')) {
        JAMI_CONFIG.malayalam = true;
        localStorage.setItem('hc_lang', 'ml');
        if (typeof window.changeLanguage === 'function') window.changeLanguage('ml');
      } else {
        JAMI_CONFIG.malayalam = false;
        localStorage.setItem('hc_lang', 'en');
        if (typeof window.changeLanguage === 'function') window.changeLanguage('en');
      }
      break;
    case STATE.AWAITING_NAME:
      data.name = _extractName(text) || text.trim().split(/\s+/).slice(0, 2).join(' ');
      break;
    case STATE.AWAITING_DISTRICT:
      // Take the first recognisable word - strips trailing punctuation
      data.district = text.trim().replace(/[.,!?]+$/, '').split(/\s+/).slice(0, 2).join(' ');
      break;
    case STATE.AWAITING_PRODUCT:
      data.product.name = text.trim();
      break;
    case STATE.AWAITING_DESCRIPTION:
      data.product.description = text.trim();
      break;
    case STATE.AWAITING_RAW_MATERIALS:
      if (num !== null) data.costs.rawMaterials = num;
      break;
    case STATE.AWAITING_PACKAGING:
      if (num !== null) data.costs.packaging = num;
      break;
    case STATE.AWAITING_LABOR_HOURS:
      if (num !== null) data.costs.laborHours = num;
      break;
    case STATE.AWAITING_LABOR_RATE:
      // If they type "ok" or similar - use the default 50
      data.costs.laborRate = num !== null ? num : 50;
      break;
    case STATE.AWAITING_OVERHEAD:
      data.costs.overhead = num !== null ? num : 0;
      break;
    case STATE.AWAITING_WASTAGE:
      data.costs.wastagePercent = num !== null ? num : 0;
      break;
    case STATE.AWAITING_UNITS_PER_BATCH:
      if (num !== null) data.costs.unitsPerBatch = num;
      break;
    case STATE.AWAITING_PRICE:
    case STATE.AWAITING_NEW_PRICE:
      if (num !== null) data.sellingPrice = num;
      break;
  }
}

// ================================================================
//  STATE TRANSITIONS
// ================================================================
const _LINEAR_TRANSITIONS = {
  [STATE.AWAITING_LANGUAGE]:      STATE.AWAITING_NAME,
  [STATE.AWAITING_NAME]:          STATE.AWAITING_DISTRICT,
  [STATE.AWAITING_DISTRICT]:      STATE.AWAITING_PRODUCT,
  [STATE.AWAITING_PRODUCT]:       STATE.AWAITING_DESCRIPTION,
  [STATE.AWAITING_DESCRIPTION]:   STATE.AWAITING_PHOTO,
  [STATE.AWAITING_PHOTO]:         STATE.AWAITING_RAW_MATERIALS,
  [STATE.AWAITING_RAW_MATERIALS]: STATE.AWAITING_PACKAGING,
  [STATE.AWAITING_PACKAGING]:     STATE.AWAITING_LABOR_HOURS,
  [STATE.AWAITING_LABOR_HOURS]:   STATE.AWAITING_LABOR_RATE,
  [STATE.AWAITING_LABOR_RATE]:    STATE.AWAITING_OVERHEAD,
  [STATE.AWAITING_OVERHEAD]:      STATE.AWAITING_WASTAGE,
  [STATE.AWAITING_WASTAGE]:       STATE.AWAITING_UNITS_PER_BATCH,
  [STATE.AWAITING_UNITS_PER_BATCH]: STATE.AWAITING_PRICE,
  [STATE.COACHING]:               STATE.AWAITING_NEW_PRICE
};

function _nextState(current, data) {
  // Price states branch based on margin result
  if (current === STATE.AWAITING_PRICE || current === STATE.AWAITING_NEW_PRICE) {
    if (data.margin) {
      return data.margin.pass ? STATE.VALIDATED : STATE.COACHING;
    }
    return current; // stay if no number extracted
  }

  return _LINEAR_TRANSITIONS[current] || current;
}

// ================================================================
//  RESPONSE GENERATION  (mock or real LLM)
// ================================================================
async function _generateResponse(state, userInput) {
  // Always use the hardcoded bilingual greeting for the very first step
  if (JAMI_CONFIG.mock || state === STATE.AWAITING_LANGUAGE) {
    return _getMockResponse(state, userInput);
  }

  try {
    return await _getLLMResponse(state);
  } catch (err) {
    console.warn('LLM error - falling back to mock:', err.message);
    return _getMockResponse(state, userInput);
  }
}

// ================================================================
//  REAL LLM CALLS
// ================================================================
async function _getLLMResponse(state) {
  const systemPrompt = _buildSystemPrompt(state);
  let text;

  if (JAMI_CONFIG.provider === 'anthropic') {
    text = await _callAnthropic(systemPrompt);
  } else if (JAMI_CONFIG.provider === 'gemini') {
    text = await _callGemini(systemPrompt);
  } else {
    text = await _callOpenAI(systemPrompt);
  }

  return { text, state, special: _getSpecialUI(state), quickReplies: _getQuickReplies(state) };
}

async function _callOpenAI(systemPrompt) {
  const messages = [
    { role: 'system', content: systemPrompt },
    ..._session.history.slice(-12)
  ];

  const res = await fetch(`${JAMI_CONFIG.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${JAMI_CONFIG.apiKey}`
    },
    body: JSON.stringify({ model: JAMI_CONFIG.model, messages, temperature: 0.7, max_tokens: 350 })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

async function _callAnthropic(systemPrompt) {
  const messages = _session.history.slice(-12).map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content
  }));

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': JAMI_CONFIG.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: JAMI_CONFIG.model || 'claude-3-5-sonnet-20241022',
      system: systemPrompt,
      messages,
      max_tokens: 350
    })
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.content[0].text.trim();
}

async function _callGemini(systemPrompt) {
  const contents = _session.history.slice(-12).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${JAMI_CONFIG.model || 'gemini-2.5-flash'}:generateContent?key=${JAMI_CONFIG.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 350 }
      })
    }
  );

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.candidates[0].content.parts[0].text.trim();
}

// ================================================================
//  SYSTEM PROMPT BUILDER (for real LLM mode)
// ================================================================
function _buildSystemPrompt(state) {
  const d   = _session.data;
  const m   = d.margin;
  const lang = JAMI_CONFIG.malayalam
    ? 'You MUST respond entirely in Malayalam script (not transliteration). Use only Malayalam Unicode characters.'
    : 'Respond in warm, simple English.';

  const persona = `You are Jami, a warm and dignified AI business partner for rural women entrepreneurs in Kerala, India.
You work with "Homemade CEO" - backed by Kudumbashree and LSGD (Local Self Government Department).
Your tone: encouraging, respectful, practical. These women are entrepreneurs, NOT aid recipients. Never use condescending language.
Keep responses SHORT - 2 to 4 sentences maximum. Be conversational, not formal. Do NOT use emojis or icons of any kind..
${lang}`;

  const context = `Current seller context:
- Name: ${d.name || '(not yet known)'}
- District: ${d.district || '(not yet known)'}
- Product: ${d.product.name || '(not yet specified)'}
- Description: ${d.product.description || '(not yet given)'}
- Raw materials cost: ₹${d.costs.rawMaterials}
- Packaging cost: ₹${d.costs.packaging}
- Labor: ${d.costs.laborHours} hours × ₹${d.costs.laborRate}/hr
- Overhead: ₹${d.costs.overhead}
- Wastage: ${d.costs.wastagePercent}%
- Units per batch: ${d.costs.unitsPerBatch}
- Selling price: ₹${d.sellingPrice}
- Margin: ${m ? m.marginPercent + '%' : 'not yet calculated'}`;

  const instruction = _buildStateInstruction(state, d, m);

  return `${persona}\n\n${context}\n\nYOUR TASK FOR THIS MESSAGE:\n${instruction}`;
}

function _buildStateInstruction(state, d, m) {
  switch (state) {
    case STATE.AWAITING_NAME:
      return `Greet the seller warmly as their new business partner. Welcome them to Homemade CEO. Ask for their name. Be warm and genuinely encouraging - this might be their first step toward financial independence.`;

    case STATE.AWAITING_DISTRICT:
      return `You now know their name is "${d.name}". React warmly to their name. Then ask which district in Kerala they are from.`;

    case STATE.AWAITING_PRODUCT:
      return `You know they are ${d.name} from ${d.district}. Express genuine excitement about working with them. Ask what product they want to sell. Be encouraging - remind them every great business starts with one great product.`;

    case STATE.AWAITING_DESCRIPTION:
      return `They want to sell "${d.product.name}". React positively to that choice. Ask them to describe it - how they make it, what makes theirs special or different.`;

    case STATE.AWAITING_PHOTO:
      return `They described their ${d.product.name}. Praise their description. Now ask them to share a photo using the attachment button below. Explain briefly that a great photo is what makes customers stop and take notice.`;

    case STATE.AWAITING_RAW_MATERIALS:
      return `They have shared a photo. Praise it briefly. Now tell them you'll do a quick financial check to make sure the business is profitable. Ask for raw material cost per batch - all ingredients and materials combined, in rupees.`;

    case STATE.AWAITING_PACKAGING:
      return `Their raw material cost is ₹${d.costs.rawMaterials}. Now ask for packaging cost per batch - bottles, covers, labels, boxes. Mention this is something many home sellers forget to include.`;

    case STATE.AWAITING_LABOR_HOURS:
      return `Got packaging cost. Now ask how many hours it takes to make one complete batch of ${d.product.name}.`;

    case STATE.AWAITING_LABOR_RATE:
      return `They said ${d.costs.laborHours} hours. Now ask what hourly wage feels fair for their skill and time. Suggest that ₹50/hour (₹400/day) is a common fair rate in Kerala - but let them decide.`;

    case STATE.AWAITING_OVERHEAD:
      return `Now ask about overhead costs - gas, electricity, water for production, any delivery charges. Mention this is a cost many sellers forget, and even small amounts matter.`;

    case STATE.AWAITING_WASTAGE:
      return `Almost done with batch costs. Ask roughly what percentage of raw materials goes to waste during production or as unsold product. Explain why even 5-10% matters for accurate pricing.`;

    case STATE.AWAITING_UNITS_PER_BATCH:
      return `Now ask how many units or items they get from making one single batch. Explain that we need this to calculate the true cost per unit.`;

    case STATE.AWAITING_PRICE:
      return `All costs are collected. Now ask what price per unit they were planning to sell their ${d.product.name} for. Just ask simply and clearly.`;

    case STATE.COACHING:
      return `Their margin is ${m?.marginPercent?.toFixed(1)}% which is below the 5% minimum target for a healthy business.
Total cost is ₹${m?.totalCost?.toFixed(0)} per unit. Their selling price was ₹${d.sellingPrice}.
The minimum selling price needed for 5% margin is ₹${m?.targetPrice}.
Their highest cost is "${m?.highestCost?.label}" at ₹${m?.highestCost?.amount?.toFixed(0)}.
Explain this gently and clearly. Suggest pricing at ₹${m?.targetPrice} or above. Ask if they'd like to try a new price.`;

    case STATE.AWAITING_NEW_PRICE:
      return `They are reconsidering their price. Ask them what new selling price they'd like to try. Be encouraging.`;

    case STATE.VALIDATED:
      return `Congratulations! Their margin is ${m?.marginPercent?.toFixed(1)}% which PASSES the 5% threshold.
Celebrate this genuinely - this is a real milestone. Tell them their product is financially sound and profitable.
Mention that their listing is being created now and they will be an official Homemade CEO entrepreneur.`;

    default:
      return 'Continue the conversation warmly and helpfully.';
  }
}

// ================================================================
//  SPECIAL UI ELEMENTS
// ================================================================
function _getSpecialUI(state) {
  const m = _session?.data?.margin;

  if (state === STATE.AWAITING_PHOTO) {
    return { type: 'photo_upload' };
  }
  if (state === STATE.COACHING && m) {
    return { type: 'margin_card', margin: m };
  }
  if (state === STATE.VALIDATED && m) {
    return { 
      type: 'product_video_card', 
      margin: m, 
      sellerId: _session.id,
      photoUrl: _session.data.product.photoUrl || 'assets/default-product.jpg'
    };
  }
  return null;
}

function _getQuickReplies(state) {
  const isMl = JAMI_CONFIG.malayalam;
  switch (state) {
    case STATE.AWAITING_LANGUAGE:
      return [{label: 'English', icon: 'languages'}, {label: 'മലയാളം', icon: 'languages'}];
    case STATE.AWAITING_DISTRICT:
      return isMl 
        ? [{label:'തിരുവനന്തപുരം',icon:'map-pin'}, {label:'കൊല്ലം',icon:'map-pin'}, {label:'എറണാകുളം',icon:'map-pin'}, {label:'കോഴിക്കോട്',icon:'map-pin'}]
        : [{label:'Thiruvananthapuram',icon:'map-pin'}, {label:'Kollam',icon:'map-pin'}, {label:'Ernakulam',icon:'map-pin'}, {label:'Kozhikode',icon:'map-pin'}];
    case STATE.AWAITING_PRODUCT:
      return isMl
        ? [{label:'നേന്ത്രക്കായ ഉപ്പേരി',icon:'package'}, {label:'മാങ്ങ അച്ചാർ',icon:'package'}, {label:'വെളിച്ചെണ്ണ',icon:'package'}, {label:'കൈത്തറി വസ്ത്രം',icon:'shirt'}]
        : [{label:'Banana Chips',icon:'package'}, {label:'Mango Pickle',icon:'package'}, {label:'Coconut Oil',icon:'package'}, {label:'Handloom Cloth',icon:'shirt'}];
    case STATE.AWAITING_LABOR_RATE:
      return [{label:'₹50',icon:'indian-rupee'}, {label:'₹75',icon:'indian-rupee'}, {label:'₹100',icon:'indian-rupee'}];
    case STATE.COACHING:
      return isMl ? [{label:'പുതിയ വില നൽകാം',icon:'tag'}] : [{label:'Set a new price',icon:'tag'}];
    default:
      return [];
  }
}

// ================================================================
//  MOCK RESPONSES (used when JAMI_CONFIG.mock = true)
// ================================================================
function _getMockResponse(state, userInput) {
  const d = _session.data;
  const m = d.margin;

  const en = {
    [STATE.AWAITING_LANGUAGE]: [
      "Namaskaram! I'm Jami. Please select your preferred language. / ദയവായി നിങ്ങളുടെ ഭാഷ തിരഞ്ഞെടുക്കുക."
    ],
    [STATE.AWAITING_NAME]: [
      "Welcome! I'm Jami. What is your name?"
    ],
    [STATE.AWAITING_DISTRICT]: [
      `Nice to meet you, ${d.name}! Which district in Kerala?`
    ],
    [STATE.AWAITING_PRODUCT]: [
      `What product will you sell?`
    ],
    [STATE.AWAITING_DESCRIPTION]: [
      `How do you make ${d.product.name}?`
    ],
    [STATE.AWAITING_PHOTO]: [
      `Please share a photo of your product.`
    ],
    [STATE.AWAITING_RAW_MATERIALS]: [
      `What is your raw material cost per batch (₹)?`
    ],
    [STATE.AWAITING_PACKAGING]: [
      `What is the packaging cost per batch (₹)?`
    ],
    [STATE.AWAITING_LABOR_HOURS]: [
      `How many hours to make one batch?`
    ],
    [STATE.AWAITING_LABOR_RATE]: [
      `What is your hourly labor rate (₹)?`
    ],
    [STATE.AWAITING_OVERHEAD]: [
      `Any overhead costs per batch (gas, electricity) in ₹?`
    ],
    [STATE.AWAITING_WASTAGE]: [
      `What percentage is wasted? (e.g., 5)`
    ],
    [STATE.AWAITING_UNITS_PER_BATCH]: [
      `How many units do you make per batch?`
    ],
    [STATE.AWAITING_PRICE]: [
      `What selling price per unit do you want to set (₹)?`
    ],
    [STATE.COACHING]: m ? [
      `Your margin is ${m.marginPercent.toFixed(1)}%. We recommend pricing at ₹${m.targetPrice}. What new price would you like?`
    ] : ['Let me recalculate...'],
    [STATE.AWAITING_NEW_PRICE]: [
      `What new price would you like to set (₹)?`
    ],
    [STATE.VALIDATED]: m ? [
      `Congratulations! Your product is validated and ready to launch.`
    ] : ['Your product is validated!']
  };

  const ml = {
    [STATE.AWAITING_LANGUAGE]: [
      "Namaskaram! I'm Jami. Please select your preferred language. / ദയവായി നിങ്ങളുടെ ഭാഷ തിരഞ്ഞെടുക്കുക."
    ],
    [STATE.AWAITING_NAME]: [
      "നമസ്കാരം! ഞാൻ ജാമി. നിങ്ങളുടെ പേര് എന്ത്?"
    ],
    [STATE.AWAITING_DISTRICT]: [
      `${d.name}, ഏത് ജില്ലയിലാണ് നിങ്ങൾ?`
    ],
    [STATE.AWAITING_PRODUCT]: [
      `ഏത് ഉൽപ്പന്നം വിൽക്കും?`
    ],
    [STATE.AWAITING_DESCRIPTION]: [
      `ഇത് എങ്ങനെ നിർമ്മിക്കുന്നു?`
    ],
    [STATE.AWAITING_PHOTO]: [
      `ഉൽപ്പന്നത്തിന്റെ ഒരു ഫോട്ടോ ഷെയർ ചെയ്യൂ.`
    ],
    [STATE.AWAITING_RAW_MATERIALS]: [
      `ഒരു ബാച്ചിന് അസംസ്കൃത വസ്തുക്കൾക്ക് എത്ര ₹ ആകും?`
    ],
    [STATE.AWAITING_PACKAGING]: [
      `ഒരു ബാച്ചിന് packaging-നു എത്ര ₹ ആകും?`
    ],
    [STATE.AWAITING_LABOR_HOURS]: [
      `ഒരു ബാച്ച് ഉണ്ടാക്കാൻ എത്ര മണിക്കൂർ വേണം?`
    ],
    [STATE.AWAITING_LABOR_RATE]: [
      `ഒരു മണിക്കൂറിന് നിങ്ങളുടെ കൂലി എത്ര ₹?`
    ],
    [STATE.AWAITING_OVERHEAD]: [
      `ഒരു ബാച്ചിന് gas, electricity ചെലവ് എത്ര ₹?`
    ],
    [STATE.AWAITING_WASTAGE]: [
      `എത്ര ശതമാനം waste ആകും? (ഉദാ: 5)`
    ],
    [STATE.AWAITING_UNITS_PER_BATCH]: [
      `ഒരു ബാച്ചിൽ എത്ര എണ്ണം ഉണ്ടാക്കും?`
    ],
    [STATE.AWAITING_PRICE]: [
      `ഒരു ഉൽപ്പന്നത്തിന് എത്ര ₹ വിലയിടും?`
    ],
    [STATE.COACHING]: m ? [
      `നിങ്ങളുടെ ലാഭം ${m.marginPercent.toFixed(1)}% ആണ്. ₹${m.targetPrice}-ന് വിൽക്കാൻ ഞങ്ങൾ നിർദ്ദേശിക്കുന്നു. പുതിയ വില എന്താണ്?`
    ] : ['...'],
    [STATE.AWAITING_NEW_PRICE]: [
      `പുതിയ വില എന്താണ് (₹)?`
    ],
    [STATE.VALIDATED]: m ? [
      `അഭിനന്ദനങ്ങൾ! നിങ്ങളുടെ ഉൽപ്പന്നം ലോഞ്ച് ചെയ്യാൻ തയ്യാറാണ്.`
    ] : ['അഭിനന്ദനങ്ങൾ!']
  };

  const lang = JAMI_CONFIG.malayalam ? 'ml' : 'en';
  const pool = (lang === 'ml' ? ml : en)[state];
  const text = Array.isArray(pool)
    ? pool[Math.floor(Math.random() * pool.length)]
    : pool || 'I understand. Let me help you with the next step.';

  return { text, state, special: _getSpecialUI(state), quickReplies: _getQuickReplies(state) };
}

// ================================================================
//  PERSIST SESSION → Dashboard
// ================================================================
function _persistSession() {
  const d = _session.data;

  const stateOrder = [
    STATE.AWAITING_NAME, STATE.AWAITING_DISTRICT, STATE.AWAITING_PRODUCT,
    STATE.AWAITING_DESCRIPTION, STATE.AWAITING_PHOTO,
    STATE.AWAITING_RAW_MATERIALS, STATE.AWAITING_PACKAGING,
    STATE.AWAITING_LABOR_HOURS,  STATE.AWAITING_LABOR_RATE,
    STATE.AWAITING_OVERHEAD,     STATE.AWAITING_WASTAGE,
    STATE.AWAITING_UNITS_PER_BATCH, STATE.AWAITING_PRICE,
    STATE.COACHING, STATE.AWAITING_NEW_PRICE,
    STATE.VALIDATED
  ];
  const idx    = stateOrder.indexOf(_session.state);
  const status = _session.state === STATE.VALIDATED ? 'validated'
               : idx >= 5 ? 'intake'
               : 'onboarding';

  Store.save({
    id: _session.id,
    name: d.name || 'New Seller',
    district: d.district || '',
    isLive: true,
    status,
    product: d.product,
    costs: d.costs,
    sellingPrice: d.sellingPrice,
    margin: d.margin,
    createdAt: new Date().toISOString()
  });
}

// ================================================================
//  UTILITY FUNCTIONS
// ================================================================
function _extractNumber(text) {
  // Handles: "₹250", "Rs.250", "250 rupees", "250.50", "1,250"
  const cleaned = text.replace(/[₹,]/g, '').replace(/Rs\.?\s*/gi, '');
  const match = cleaned.match(/\d+(?:\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

function _extractName(text) {
  const patterns = [
    /(?:i['\s]m|i am|my name is|call me|name is)\s+([A-Za-z\s]+)/i,
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)$/
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return null;
}
