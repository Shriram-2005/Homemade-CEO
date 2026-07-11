/**
 * jami.js — Jami AI State Machine & LLM Connector
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
//  CONFIGURATION — Edit here to enable real LLM API
// ================================================================
const JAMI_CONFIG = {
  mock:     true,               // false = use real API
  provider: 'openai',           // 'openai' | 'anthropic' | 'gemini'
  apiKey:   '',                 // Your API key here
  model:    'gpt-4o',          // e.g. 'gpt-4o', 'claude-3-5-sonnet-20241022', 'gemini-1.5-flash'
  baseUrl:  'https://api.openai.com/v1',
  malayalam: false              // Toggled by the chat UI
};

// ================================================================
//  CONVERSATION STATES
// ================================================================
const STATE = Object.freeze({
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
    state: STATE.AWAITING_NAME,
    history: [],   // [{role:'user'|'assistant', content:''}]
    data: {
      name: '', district: '',
      product: { name: '', description: '', photoUrl: null },
      costs: {
        rawMaterials: 0, packaging: 0,
        laborHours: 0,   laborRate: 50,
        overhead: 0,     wastagePercent: 0
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
//  PUBLIC API
// ================================================================

/** Called once when chat loads — returns Jami's opening message */
async function getOpeningMessage() {
  const response = await _generateResponse(STATE.AWAITING_NAME, null);
  _session.history.push({ role: 'assistant', content: response.text });
  return response;
}

/** Main entry point — called for every text message from the user */
async function processUserMessage(userText) {
  _session.history.push({ role: 'user', content: userText });

  // 1. Extract structured data from the user's text
  _extractData(userText, _session.state, _session.data);

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
    case STATE.AWAITING_NAME:
      data.name = _extractName(text) || text.trim().split(/\s+/).slice(0, 2).join(' ');
      break;
    case STATE.AWAITING_DISTRICT:
      // Take the first recognisable word — strips trailing punctuation
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
      // If they type "ok" or similar — use the default 50
      data.costs.laborRate = num !== null ? num : 50;
      break;
    case STATE.AWAITING_OVERHEAD:
      data.costs.overhead = num !== null ? num : 0;
      break;
    case STATE.AWAITING_WASTAGE:
      data.costs.wastagePercent = num !== null ? num : 0;
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
  [STATE.AWAITING_WASTAGE]:       STATE.AWAITING_PRICE,
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
  if (JAMI_CONFIG.mock) {
    return _getMockResponse(state, userInput);
  }

  try {
    return await _getLLMResponse(state);
  } catch (err) {
    console.warn('LLM error — falling back to mock:', err.message);
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

  return { text, state, special: _getSpecialUI(state) };
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
    `https://generativelanguage.googleapis.com/v1beta/models/${JAMI_CONFIG.model || 'gemini-1.5-flash'}:generateContent?key=${JAMI_CONFIG.apiKey}`,
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
You work with "Homemade CEO" — backed by Kudumbashree and LSGD (Local Self Government Department).
Your tone: encouraging, respectful, practical. These women are entrepreneurs, NOT aid recipients. Never use condescending language.
Keep responses SHORT — 2 to 4 sentences maximum. Be conversational, not formal. Use emojis sparingly for warmth.
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
- Selling price: ₹${d.sellingPrice}
- Margin: ${m ? m.marginPercent + '%' : 'not yet calculated'}`;

  const instruction = _buildStateInstruction(state, d, m);

  return `${persona}\n\n${context}\n\nYOUR TASK FOR THIS MESSAGE:\n${instruction}`;
}

function _buildStateInstruction(state, d, m) {
  switch (state) {
    case STATE.AWAITING_NAME:
      return `Greet the seller warmly as their new business partner. Welcome them to Homemade CEO. Ask for their name. Be warm and genuinely encouraging — this might be their first step toward financial independence.`;

    case STATE.AWAITING_DISTRICT:
      return `You now know their name is "${d.name}". React warmly to their name. Then ask which district in Kerala they are from.`;

    case STATE.AWAITING_PRODUCT:
      return `You know they are ${d.name} from ${d.district}. Express genuine excitement about working with them. Ask what product they want to sell. Be encouraging — remind them every great business starts with one great product.`;

    case STATE.AWAITING_DESCRIPTION:
      return `They want to sell "${d.product.name}". React positively to that choice. Ask them to describe it — how they make it, what makes theirs special or different.`;

    case STATE.AWAITING_PHOTO:
      return `They described their ${d.product.name}. Praise their description. Now ask them to share a photo using the attachment button below. Explain briefly that a great photo is what makes customers stop and take notice.`;

    case STATE.AWAITING_RAW_MATERIALS:
      return `They have shared a photo. Praise it briefly. Now tell them you'll do a quick financial check to make sure the business is profitable. Ask for raw material cost per batch — all ingredients and materials combined, in rupees.`;

    case STATE.AWAITING_PACKAGING:
      return `Their raw material cost is ₹${d.costs.rawMaterials}. Now ask for packaging cost per batch — bottles, covers, labels, boxes. Mention this is something many home sellers forget to include.`;

    case STATE.AWAITING_LABOR_HOURS:
      return `Got packaging cost. Now ask how many hours it takes to make one complete batch of ${d.product.name}.`;

    case STATE.AWAITING_LABOR_RATE:
      return `They said ${d.costs.laborHours} hours. Now ask what hourly wage feels fair for their skill and time. Suggest that ₹50/hour (₹400/day) is a common fair rate in Kerala — but let them decide.`;

    case STATE.AWAITING_OVERHEAD:
      return `Now ask about overhead costs — gas, electricity, water for production, any delivery charges. Mention this is a cost many sellers forget, and even small amounts matter.`;

    case STATE.AWAITING_WASTAGE:
      return `Almost done with costs. Ask roughly what percentage of raw materials goes to waste during production or as unsold product. Explain why even 5-10% matters for accurate pricing.`;

    case STATE.AWAITING_PRICE:
      return `All costs are collected. Now ask what price per unit they were planning to sell their ${d.product.name} for. Just ask simply and clearly.`;

    case STATE.COACHING:
      return `Their margin is ${m?.marginPercent?.toFixed(1)}% which is below the 100% minimum target for a healthy business.
Total cost is ₹${m?.totalCost?.toFixed(0)} per unit. Their selling price was ₹${d.sellingPrice}.
The minimum selling price needed for 100% margin is ₹${m?.targetPrice}.
Their highest cost is "${m?.highestCost?.label}" at ₹${m?.highestCost?.amount?.toFixed(0)}.
Explain this gently and clearly. Suggest pricing at ₹${m?.targetPrice} or above. Ask if they'd like to try a new price.`;

    case STATE.AWAITING_NEW_PRICE:
      return `They are reconsidering their price. Ask them what new selling price they'd like to try. Be encouraging.`;

    case STATE.VALIDATED:
      return `Congratulations! Their margin is ${m?.marginPercent?.toFixed(1)}% which PASSES the 100% threshold.
Celebrate this genuinely — this is a real milestone. Tell them their product is financially sound and profitable.
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
    return { type: 'validated_card', margin: m, sellerId: _session.id };
  }
  return null;
}

// ================================================================
//  MOCK RESPONSES (used when JAMI_CONFIG.mock = true)
// ================================================================
function _getMockResponse(state, userInput) {
  const d = _session.data;
  const m = d.margin;

  const en = {
    [STATE.AWAITING_NAME]: [
      "Namaskaram! 🙏 I'm Jami — your personal business partner from Homemade CEO. I'm here to help you turn your home skills and recipes into a real, profitable business — backed by Kudumbashree. What's your name?",
      "Welcome to Homemade CEO! I'm Jami. Together we're going to build something truly yours. Every great entrepreneur starts with a first step — and this is yours. What's your name?"
    ],
    [STATE.AWAITING_DISTRICT]: [
      `Lovely to meet you, ${d.name}! 😊 Such a wonderful name. Which district in Kerala are you from?`,
      `${d.name} — that's a beautiful name! I'm so glad you're here. Where in Kerala are you based?`
    ],
    [STATE.AWAITING_PRODUCT]: [
      `${d.name} from ${d.district}! 🌟 Wonderful — I'm genuinely excited to work with you. So tell me, what product are you thinking of selling? Don't hold back — I'd love to hear about it!`,
      `Great to have you here, ${d.name}! Every great business starts with one great product. What would you like to sell?`
    ],
    [STATE.AWAITING_DESCRIPTION]: [
      `Oh, ${d.product.name}! That's a fantastic choice — there's real demand for that. 🌿 Tell me more — how do you make it? What's your recipe or process? What makes yours different and special?`,
      `${d.product.name} — I love that! Walk me through how you make it. What's the story behind it? Customers love knowing the person and the process behind what they buy.`
    ],
    [STATE.AWAITING_PHOTO]: [
      `That sounds absolutely beautiful! 😍 A lovingly made product deserves to be seen. Can you share a photo of your ${d.product.name}? Tap the 📎 attachment button below. A great photo is what makes a customer stop scrolling and take notice!`,
      `Your ${d.product.name} sounds amazing — now let's show the world what it looks like! Please share a photo using the button below. 📸 Even a simple phone photo taken in good light works well.`
    ],
    [STATE.AWAITING_RAW_MATERIALS]: [
      `Wonderful photo! 📸 Now let's make sure your business is genuinely profitable — I'll ask a few quick questions about your costs. First: what do you spend on raw materials for one batch? (All ingredients and materials combined, in ₹)`,
      `Great! Now let's do the numbers together — I want to make sure you're pricing correctly so you earn what you truly deserve. What's your raw material cost per batch? (₹)`
    ],
    [STATE.AWAITING_PACKAGING]: [
      `Got it — ₹${d.costs.rawMaterials} for raw materials. Now, here's one many sellers forget: packaging. Covers, bottles, labels, boxes — how much does packaging cost per batch? (in ₹)`,
      `₹${d.costs.rawMaterials} noted! Packaging is something so many home sellers forget to count — bottles, bags, labels, stickers. How much does it cost per batch? (in ₹)`
    ],
    [STATE.AWAITING_LABOR_HOURS]: [
      `Perfect! ₹${d.costs.packaging} for packaging. Now — how many hours does it take you to make one complete batch of ${d.product.name}? Your time is one of your most important costs!`,
      `Good. Now let's count your most valuable resource — your time and skill! How many hours to make one full batch?`
    ],
    [STATE.AWAITING_LABOR_RATE]: [
      `${d.costs.laborHours} hours — that's real, skilled work! Your time has value and must be counted. What hourly rate feels fair to you? A common fair wage in Kerala is ₹50/hour (= ₹400/day). You can set any amount.`,
      `${d.costs.laborHours} hours of your expertise. What wage per hour should we count for your work? I'd suggest at least ₹50/hour — you're a skilled professional, and your time should be respected in the price.`
    ],
    [STATE.AWAITING_OVERHEAD]: [
      `Good — ₹${(d.costs.laborHours * d.costs.laborRate).toFixed(0)} for your labor. Now: overhead costs. This is another thing many sellers miss — gas or electricity for cooking/making, water, any delivery charges. What would you estimate per batch? (Enter 0 if truly none)`,
      `Now for something almost every home seller forgets: overhead. Gas, electricity, water, delivery charges. What's a rough estimate per batch in ₹? (Even a small amount adds up over time)`
    ],
    [STATE.AWAITING_WASTAGE]: [
      `Noted! One final cost question — roughly what percentage of your raw materials is wasted during production, or goes unsold? Even 5-10% is typical and should be part of your price. Just type a number like 5 or 10 (or 0 if you have no waste).`,
      `Almost there! What percentage of your materials typically gets wasted? This helps us price accurately so you don't lose money quietly. Type a number (e.g. 5 for 5%) or 0 if there's no waste.`
    ],
    [STATE.AWAITING_PRICE]: [
      `Excellent! I now have all your cost information — thank you for being so thorough. Now, the key question: what price per unit were you planning to charge customers for your ${d.product.name}? (in ₹)`,
      `Now for the most important question: what selling price per unit do you want to set for your ${d.product.name}? Give me your target price in ₹, and I'll calculate whether it's profitable for you.`
    ],
    [STATE.COACHING]: m ? [
      `I've calculated your numbers carefully. At ₹${d.sellingPrice}, your margin is ${m.marginPercent.toFixed(1)}% — we aim for at least 100% for a truly sustainable business.\n\nYour total cost is ₹${m.totalCost.toFixed(0)} per unit. Your highest cost is ${m.highestCost.label} (₹${m.highestCost.amount.toFixed(0)}). To reach 100% margin, you'd need to price at ₹${m.targetPrice} or above.\n\nDoes ₹${m.targetPrice} feel achievable in your market? What price would you like to try?`,
      `Let me be honest with you because I want your business to succeed. At ₹${d.sellingPrice}, you'd make ${m.marginPercent.toFixed(1)}% margin — we need at least 100% for a healthy business. Your costs add up to ₹${m.totalCost.toFixed(0)} per unit, so I'd suggest pricing at ₹${m.targetPrice}. What new price would you like to set?`
    ] : ['Let me recalculate your margin...'],
    [STATE.AWAITING_NEW_PRICE]: [
      `Good thinking — getting the price right is the foundation of everything. What price would you like to try? I'll recalculate immediately.`,
      `Absolutely, let's find the right price together. What new selling price would you like to set? (in ₹)`
    ],
    [STATE.VALIDATED]: m ? [
      `🎉 Congratulations, ${d.name}! Your ${d.product.name} has a margin of ${m.marginPercent.toFixed(1)}% — that means for every ₹100 you invest, you bring back ₹${(100 + m.marginPercent).toFixed(0)}. Your business is financially solid and ready to launch!\n\nI'm creating your product listing right now. You're officially a Homemade CEO entrepreneur! 🌟`,
      `${d.name}, this is a real achievement! 🌟 A ${m.marginPercent.toFixed(1)}% margin means your ${d.product.name} is genuinely profitable. Your product listing is being generated — customers in Kerala and beyond will soon discover your work. Welcome to Homemade CEO! 🎉`
    ] : ['Your product is validated! Congratulations!']
  };

  const ml = {
    [STATE.AWAITING_NAME]: [
      "നമസ്കാരം! 🙏 ഞാൻ ജാമി — Homemade CEO-യുടെ നിങ്ങളുടെ ബിസിനസ്സ് പങ്കാളി. കുടുംബശ്രീ-യുടെ പിന്തുണയോടെ, നിങ്ങളുടെ വീട്ടു നൈപുണ്യം ഒരു ലാഭകരമായ ബിസിനസ്സ് ആക്കി മാറ്റാൻ ഞാൻ ഇവിടെ ഉണ്ട്. ആദ്യം — നിങ്ങളുടെ പേര് എന്ത്?"
    ],
    [STATE.AWAITING_DISTRICT]: [
      `${d.name} — എന്തൊരു മനോഹരമായ പേര്! 😊 ഞാൻ ആകാംക്ഷയോടെ ഇരിക്കുകയാണ്. കേരളത്തിൽ ഏത് ജില്ലയിൽ നിന്നാണ് നിങ്ങൾ?`
    ],
    [STATE.AWAITING_PRODUCT]: [
      `${d.district}-ൽ നിന്നുള്ള ${d.name}! 🌟 ഞാൻ നിങ്ങളോടൊപ്പം ജോലി ചെയ്യാൻ ആകാംക്ഷയോടെ ഇരിക്കുകയാണ്. ഏത് ഉൽപ്പന്നം വിൽക്കാൻ ആഗ്രഹിക്കുന്നു? ധൈര്യമായി പറയൂ!`
    ],
    [STATE.AWAITING_DESCRIPTION]: [
      `${d.product.name}! ഒരു മികച്ച തിരഞ്ഞെടുപ്പ്! 🌿 ഇത് എങ്ങനെ നിർമ്മിക്കുന്നു? നിങ്ങളുടേത് എന്ത് പ്രത്യേകതയുണ്ട്? ഉപഭോക്താക്കൾ ഉൽപ്പന്നത്തിന് പിന്നിലെ കഥ അറിയാൻ ഇഷ്ടപ്പെടുന്നു.`
    ],
    [STATE.AWAITING_PHOTO]: [
      `ഹൃദ്യമായ വിവരണം! 😍 നിങ്ങളുടെ ${d.product.name}-ന്റെ ഒരു ഫോട്ടോ ഷെയർ ചെയ്യൂ — താഴെ 📎 ഐക്കൺ ടാപ്പ് ചെയ്യൂ. നല്ല ഫോട്ടോ ആണ് ഉപഭോക്താക്കളെ ആകർഷിക്കുന്നത്!`
    ],
    [STATE.AWAITING_RAW_MATERIALS]: [
      `ഭംഗിയായ ഫോട്ടോ! 📸 ഇനി ബിസിനസ്സ് ലാഭം ഉറപ്പാക്കാൻ ചില ചോദ്യങ്ങൾ. ആദ്യം: ഒരു ബാച്ചിന് അസംസ്കൃത വസ്തുക്കൾക്ക് (ingredients + materials) ആകെ എത്ര ₹ ചെലവ് ആകും?`
    ],
    [STATE.AWAITING_PACKAGING]: [
      `₹${d.costs.rawMaterials} — ശരി. ഇനി packaging — cover, bottle, label, box. ഒരു ബാച്ചിന് packaging-നു ആകെ എത്ര ₹? (ഇത് പലരും മറക്കുന്ന ഒരു cost ആണ്!)`
    ],
    [STATE.AWAITING_LABOR_HOURS]: [
      `ശരി. ഒരു ബാച്ച് ${d.product.name} ഉണ്ടാക്കാൻ ആകെ എത്ര മണിക്കൂർ വേണം? നിങ്ങളുടെ സമയം ഒരു important cost ആണ്!`
    ],
    [STATE.AWAITING_LABOR_RATE]: [
      `${d.costs.laborHours} മണിക്കൂർ — നിങ്ങളുടെ സമയത്തിന് മൂല്യം ഉണ്ട്! ഒരു മണിക്കൂറിന് ₹50 (ദിവസം ₹400) ഒരു ന്യായ നിരക്ക് ആണ്. നിങ്ങൾ ഏത് hourly rate ഉചിതം എന്ന് കരുതുന്നു?`
    ],
    [STATE.AWAITING_OVERHEAD]: [
      `നല്ലത്. ഇനി overhead — gas, electricity, delivery charges. ഒരു batch-നു ഇവ ഒക്കെ കൂടി ഏകദേശം എത്ര ₹? (0 ആണെങ്കിൽ 0 type ചെയ്യൂ)`
    ],
    [STATE.AWAITING_WASTAGE]: [
      `ഒരു ചോദ്യം കൂടി — production-ൽ ഏകദേശം എത്ര % material waste ആകും? (5-10% typical ആണ്, 0 ആണെങ്കിൽ 0 type ചെയ്യൂ)`
    ],
    [STATE.AWAITING_PRICE]: [
      `ഒരു unit ${d.product.name}-ന് നിങ്ങൾ ₹ എത്ര ഈടാക്കാൻ ആഗ്രഹിക്കുന്നു? ആ selling price ഒന്ന് പറയൂ.`
    ],
    [STATE.COACHING]: m ? [
      `കണക്ക് ശ്രദ്ധിക്കൂ: ₹${d.sellingPrice}-ൽ margin ${m.marginPercent.toFixed(1)}% — ലക്ഷ്യം 100%-ൽ കൂടുതൽ. Total cost ₹${m.totalCost.toFixed(0)} per unit. ₹${m.targetPrice}-ൽ ഓ അതിനു മുകളിലോ price ചെയ്‌താൽ 100% margin കിട്ടും. ഏത് പുതിയ price ആലോചിക്കുന്നു?`
    ] : ['...'],
    [STATE.AWAITING_NEW_PRICE]: [
      `ഏത് പുതിയ selling price ആണ് ആലോചിക്കുന്നത്? ഞാൻ ഉടൻ recalculate ചെയ്യാം.`
    ],
    [STATE.VALIDATED]: m ? [
      `🎉 ${d.name}, അഭിനന്ദനങ്ങൾ! ${d.product.name}-ന്റെ margin ${m.marginPercent.toFixed(1)}%! ₹100 invest ചെയ്‌താൽ ₹${(100 + m.marginPercent).toFixed(0)} ലഭിക്കും. നിങ്ങൾ ഒരു ലാഭകരമായ ബിസിനസ്സ് ഉടമ ആണ്! 🌟 നിങ്ങളുടെ product listing ഇപ്പോൾ create ചെയ്യുന്നു — Homemade CEO-ലേക്ക് സ്വാഗതം!`
    ] : ['അഭിനന്ദനങ്ങൾ!']
  };

  const lang = JAMI_CONFIG.malayalam ? 'ml' : 'en';
  const pool = (lang === 'ml' ? ml : en)[state];
  const text = Array.isArray(pool)
    ? pool[Math.floor(Math.random() * pool.length)]
    : pool || 'I understand. Let me help you with the next step.';

  return { text, state, special: _getSpecialUI(state) };
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
    STATE.AWAITING_PRICE, STATE.COACHING, STATE.AWAITING_NEW_PRICE,
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
