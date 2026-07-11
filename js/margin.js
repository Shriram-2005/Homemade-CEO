/**
 * margin.js — Margin Calculation Engine
 * 
 * Pure functions. No dependencies.
 * Call MarginCalculator.calculate(inputs) to get full margin result.
 */

const MarginCalculator = (() => {

  /**
   * Calculate margin from cost inputs.
   * @param {Object} inputs
   * @param {number} inputs.rawMaterials   — raw ingredient/material cost per batch (₹)
   * @param {number} inputs.packaging      — packaging cost per batch (₹)
   * @param {number} inputs.laborHours     — hours to make one batch
   * @param {number} inputs.laborRate      — hourly wage rate (₹/hr)
   * @param {number} inputs.overhead       — electricity, gas, delivery etc per batch (₹)
   * @param {number} inputs.wastagePercent — % of raw materials that is wasted/unsold
   * @param {number} inputs.sellingPrice   — target selling price per unit (₹)
   * @returns {Object} Full margin result with breakdown
   */
  function calculate({ rawMaterials = 0, packaging = 0, laborHours = 0, laborRate = 50,
                        overhead = 0, wastagePercent = 0, sellingPrice = 0 }) {
    const rm    = parseFloat(rawMaterials)   || 0;
    const pkg   = parseFloat(packaging)      || 0;
    const lh    = parseFloat(laborHours)     || 0;
    const lr    = parseFloat(laborRate)      || 0;
    const oh    = parseFloat(overhead)       || 0;
    const wp    = parseFloat(wastagePercent) || 0;
    const sp    = parseFloat(sellingPrice)   || 0;

    const laborCost   = lh * lr;
    const wastageCost = rm * (wp / 100);
    const totalCost   = rm + pkg + laborCost + oh + wastageCost;

    const profit        = sp - totalCost;
    const marginPercent = totalCost > 0 ? (profit / totalCost) * 100 : 0;
    const pass          = marginPercent >= 100;

    // Minimum price needed for exactly 100% margin
    const targetPrice = Math.ceil(totalCost * 2);

    // Cost breakdown (only non-zero items)
    const breakdown = [
      { label: 'Raw Materials',     amount: rm,          icon: '🌿', key: 'rawMaterials' },
      { label: 'Packaging',         amount: pkg,         icon: '📦', key: 'packaging'    },
      { label: 'Your Labor',        amount: laborCost,   icon: '⏱️', key: 'labor'        },
      { label: 'Overhead / Delivery', amount: oh,        icon: '🚚', key: 'overhead'     },
      { label: 'Wastage',           amount: wastageCost, icon: '♻️', key: 'wastage'      }
    ].filter(c => c.amount > 0);

    // Largest cost line (for coaching guidance)
    const highestCost = breakdown.length > 0
      ? breakdown.reduce((a, b) => a.amount > b.amount ? a : b)
      : { label: 'Raw Materials', amount: rm };

    return {
      // Input echoes
      rawMaterials: rm, packaging: pkg, laborHours: lh, laborRate: lr,
      overhead: oh, wastagePercent: wp, sellingPrice: sp,
      // Calculated
      laborCost:   round2(laborCost),
      wastageCost: round2(wastageCost),
      totalCost:   round2(totalCost),
      profit:      round2(profit),
      marginPercent: Math.round(marginPercent * 10) / 10,
      pass,
      targetPrice,
      breakdown,
      highestCost
    };
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  return { calculate };
})();
