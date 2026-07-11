/**
 * store.js — Data Persistence Layer
 *
 * Uses localStorage to persist seller data across sessions.
 * Pre-seeded with 4 realistic Kerala sellers.
 * 
 * NOTE: margin.js must be loaded BEFORE store.js.
 */

const Store = (() => {
  const SELLERS_KEY = 'hceo_sellers_v2';
  const SESSION_KEY = 'hceo_session_id';

  // ─────────────────────────────────────────────────────────
  //  SEED DATA — 4 realistic Kerala sellers
  // ─────────────────────────────────────────────────────────
  const SEED_SELLERS = [
    {
      id: 'seed_meena_001',
      name: 'Meena Krishnan',
      district: 'Thrissur',
      isSeeded: true,
      status: 'validated',
      product: {
        name: 'Kerala Banana Chips',
        description: 'Crispy, traditionally-spiced banana chips made from raw nendran bananas. Hand-sliced and fried in pure coconut oil with the perfect balance of salt and black pepper. Family recipe, 25 years old.',
        photoUrl: null
      },
      costs: {
        rawMaterials: 120,
        packaging: 25,
        laborHours: 2,
        laborRate: 50,
        overhead: 15,
        wastagePercent: 8
      },
      sellingPrice: 560,
      margin: null,
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'seed_suma_002',
      name: 'Suma Rajan',
      district: 'Palakkad',
      isSeeded: true,
      status: 'intake',
      product: {
        name: 'Cold-Pressed Coconut Oil',
        description: 'Pure, traditional cold-pressed coconut oil extracted from fresh Kerala coconuts. No chemicals, no heat — only the original wood-press method.',
        photoUrl: null
      },
      costs: {
        rawMaterials: 180,
        packaging: 35,
        laborHours: 3,
        laborRate: 50,
        overhead: 20,
        wastagePercent: 5
      },
      sellingPrice: 350,
      margin: null,
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'seed_leela_003',
      name: 'Leela Thomas',
      district: 'Kottayam',
      isSeeded: true,
      status: 'onboarding',
      product: {
        name: 'Mixed Vegetable Achaar',
        description: '',
        photoUrl: null
      },
      costs: {
        rawMaterials: 0, packaging: 0, laborHours: 0,
        laborRate: 50, overhead: 0, wastagePercent: 0
      },
      sellingPrice: 0,
      margin: null,
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'seed_radha_004',
      name: 'Radha Menon',
      district: 'Ernakulam',
      isSeeded: true,
      status: 'validated',
      product: {
        name: 'Handmade Coconut Soap',
        description: 'Natural, chemical-free soaps crafted from virgin coconut oil, neem extract, and turmeric. Each bar is hand-poured and cured for 4 weeks for the perfect lather.',
        photoUrl: null
      },
      costs: {
        rawMaterials: 80,
        packaging: 20,
        laborHours: 1.5,
        laborRate: 50,
        overhead: 10,
        wastagePercent: 3
      },
      sellingPrice: 420,
      margin: null,
      createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
    }
  ];

  // ─────────────────────────────────────────────────────────
  //  PUBLIC API
  // ─────────────────────────────────────────────────────────

  /** Initialize — seeds localStorage if empty */
  function init() {
    const existing = _getAll();
    const seedIds  = SEED_SELLERS.map(s => s.id);
    const hasSeeds = existing.some(s => seedIds.includes(s.id));

    if (!hasSeeds) {
      // Calculate margins for seeded sellers that have full cost data
      const seeded = SEED_SELLERS.map(seller => {
        if (seller.costs.rawMaterials > 0 && seller.sellingPrice > 0) {
          seller.margin = MarginCalculator.calculate({
            ...seller.costs,
            sellingPrice: seller.sellingPrice
          });
        }
        return seller;
      });

      const merged = [...seeded, ...existing.filter(s => !seedIds.includes(s.id))];
      localStorage.setItem(SELLERS_KEY, JSON.stringify(merged));
    }
  }

  /** Get all sellers */
  function getAll() { return _getAll(); }

  /** Get seller by ID */
  function getById(id) {
    return _getAll().find(s => s.id === id) || null;
  }

  /** Save or update a seller */
  function save(seller) {
    const all = _getAll();
    const idx = all.findIndex(s => s.id === seller.id);
    if (idx >= 0) {
      all[idx] = seller;
    } else {
      all.unshift(seller);
    }
    localStorage.setItem(SELLERS_KEY, JSON.stringify(all));
    return seller;
  }

  /** Generate a unique seller ID */
  function generateId() {
    return 'seller_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /** Track the current live demo session seller ID */
  function setCurrentSessionId(id) { sessionStorage.setItem(SESSION_KEY, id); }
  function getCurrentSessionId()    { return sessionStorage.getItem(SESSION_KEY); }

  /** Reset: remove all non-seeded sellers (useful for demo reset) */
  function resetLiveSellers() {
    const all = _getAll().filter(s => s.isSeeded);
    localStorage.setItem(SELLERS_KEY, JSON.stringify(all));
    sessionStorage.removeItem(SESSION_KEY);
  }

  // ─────────────────────────────────────────────────────────
  //  INTERNAL
  // ─────────────────────────────────────────────────────────
  function _getAll() {
    try {
      return JSON.parse(localStorage.getItem(SELLERS_KEY) || '[]');
    } catch { return []; }
  }

  return { init, getAll, getById, save, generateId, setCurrentSessionId, getCurrentSessionId, resetLiveSellers };
})();
