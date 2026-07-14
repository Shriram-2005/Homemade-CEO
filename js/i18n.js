/**
 * i18n.js - Translation Dictionary & Logic
 */
const I18N = {
  en: {
    "nav-home": "Home",
    "nav-chat": "Seller Chat",
    "nav-dash": "Officer Dashboard",
    "btn-human": "📞 Talk to a Human",
    "hero-title": "Turn Your Home Skills Into a Business",
    "hero-sub": "Homemade CEO helps you calculate profits, get verified, and start selling online via WhatsApp.",
    "role-seller": "I am a Seller",
    "role-officer": "I am an Officer",
    "chat-input-placeholder": "Type your reply...",
    "btn-reset": "Reset",
    "sidebar-tips-title": "Tips for Demo",
    "tip-start-title": "Getting Started",
    "tip-start-text": "Tap the quick reply buttons or type your name to begin.",
    "tip-products-title": "Try These Products",
    "tip-products-text": "\"Banana Chips\", \"Coconut Oil\", \"Mango Pickle\"",
    "tip-egg-title": "Easter Egg",
    "tip-egg-text": "Type 'ente kerala' or 'sadya' to discover a surprise."
  },
  ml: {
    "nav-home": "ഹോം",
    "nav-chat": "വ്യാപാരി ചാറ്റ്",
    "nav-dash": "ഓഫീസർ ഡാഷ്‌ബോർഡ്",
    "btn-human": "📞 ഒരു മനുഷ്യനുമായി സംസാരിക്കുക",
    "hero-title": "നിങ്ങളുടെ വീട്ടിലെ കഴിവുകൾ ഒരു ബിസിനസ്സ് ആക്കി മാറ്റുക",
    "hero-sub": "ലാഭം കണക്കാക്കാനും, സ്ഥിരീകരണം നേടാനും, WhatsApp വഴി ഓൺലൈനായി വിൽക്കാനും Homemade CEO നിങ്ങളെ സഹായിക്കുന്നു.",
    "role-seller": "ഞാൻ ഒരു വ്യാപാരിയാണ്",
    "role-officer": "ഞാൻ ഒരു ഓഫീസറാണ്",
    "chat-input-placeholder": "നിങ്ങളുടെ മറുപടി ടൈപ്പ് ചെയ്യുക...",
    "btn-reset": "റീസെറ്റ്",
    "sidebar-tips-title": "ഡെമോയ്ക്കുള്ള നുറുങ്ങുകൾ",
    "tip-start-title": "തുടങ്ങാം",
    "tip-start-text": "തുടങ്ങാനായി ക്വിക്ക് റിപ്ലൈ ബട്ടണുകൾ അമർത്തുകയോ പേര് ടൈപ്പ് ചെയ്യുകയോ ചെയ്യുക.",
    "tip-products-title": "ഈ ഉൽപ്പന്നങ്ങൾ പരീക്ഷിക്കുക",
    "tip-products-text": "\"നേന്ത്രക്കായ ഉപ്പേരി\", \"വെളിച്ചെണ്ണ\", \"മാങ്ങ അച്ചാർ\"",
    "tip-egg-title": "സർപ്രൈസ്",
    "tip-egg-text": "'ente kerala' അല്ലെങ്കിൽ 'sadya' എന്ന് ടൈപ്പ് ചെയ്യുക."
  }
};

let currentLang = localStorage.getItem('hc_lang') || 'ml';

// Immediately configure Jami before DOMContentLoaded
if (window.JAMI_CONFIG) {
  window.JAMI_CONFIG.malayalam = (currentLang === 'ml');
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (I18N[currentLang][key]) {
      if (el.tagName === 'INPUT' && el.type === 'text') {
        el.placeholder = I18N[currentLang][key];
      } else {
        el.textContent = I18N[currentLang][key];
      }
    }
  });

  // Update Jami config if it exists
  if (window.JAMI_CONFIG) {
    window.JAMI_CONFIG.malayalam = (currentLang === 'ml');
  }

  // Update toggle button text
  const toggleBtn = document.getElementById('lang-toggle');
  if (toggleBtn) {
    toggleBtn.textContent = currentLang === 'en' ? 'മലയാളം' : 'English';
  }
}

function toggleLanguage() {
  currentLang = currentLang === 'en' ? 'ml' : 'en';
  localStorage.setItem('hc_lang', currentLang);
  applyTranslations();
  
  // If in chat, reload to reset state with new language (simplest approach for a prototype)
  if (window.location.pathname.includes('chat')) {
    if (confirm('Changing language will reset the current chat. Continue?')) {
       location.reload();
    } else {
       // revert
       currentLang = currentLang === 'en' ? 'ml' : 'en';
       localStorage.setItem('hc_lang', currentLang);
       applyTranslations();
    }
  }
}

window.changeLanguage = function(langCode) {
  currentLang = langCode;
  localStorage.setItem('hc_lang', currentLang);
  applyTranslations();
};

document.addEventListener('DOMContentLoaded', () => {
  applyTranslations();
  
  const toggleBtn = document.getElementById('lang-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleLanguage);
  }
});
