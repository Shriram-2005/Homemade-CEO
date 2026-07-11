/**
 * dashboard-ui.js — Ops Dashboard Controller
 *
 * Renders the seller table with stats, search, filter, sort.
 * Reads from Store (localStorage). Live-refreshes every 5s.
 *
 * Dependencies: margin.js, store.js
 */

const DashboardUI = (() => {
  let _allSellers = [];
  let _filtered   = [];
  let _sortCol    = 'createdAt';
  let _sortDir    = 'desc';
  let _searchTerm = '';
  let _statusFilter = 'all';

  // ─────────────────────────────────────────────────────────
  //  INIT
  // ─────────────────────────────────────────────────────────
  function init() {
    Store.init();

    // Wire search + filter
    const searchEl = document.getElementById('search-input');
    const filterEl = document.getElementById('status-filter');
    const resetEl  = document.getElementById('reset-btn');

    searchEl.addEventListener('input', e => { _searchTerm = e.target.value.toLowerCase(); _applyFilters(); });
    filterEl.addEventListener('change', e => { _statusFilter = e.target.value; _applyFilters(); });
    resetEl.addEventListener('click', () => {
      if (confirm('Reset all live demo sellers? (Pre-seeded sellers will remain)')) {
        Store.resetLiveSellers();
        load();
        showToast('Demo sellers cleared');
      }
    });

    // Sort headers
    document.querySelectorAll('[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (_sortCol === col) { _sortDir = _sortDir === 'asc' ? 'desc' : 'asc'; }
        else { _sortCol = col; _sortDir = 'asc'; }
        _applyFilters();
        _updateSortHeaders();
      });
    });

    // Set today's date
    document.getElementById('dash-date').textContent = new Date().toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    load();

    // Auto-refresh every 5 seconds (picks up live demo sellers)
    setInterval(load, 5000);
  }

  function load() {
    _allSellers = Store.getAll();
    _applyFilters();
    _renderStats();
    _renderDistrictMap(_allSellers);
    _renderFunnel(_allSellers);
    _renderActivityFeed(_allSellers);
  }

  // ─────────────────────────────────────────────────────────
  //  FILTER + SORT
  // ─────────────────────────────────────────────────────────
  function _applyFilters() {
    let result = [..._allSellers];

    // Search
    if (_searchTerm) {
      result = result.filter(s =>
        (s.name || '').toLowerCase().includes(_searchTerm) ||
        (s.district || '').toLowerCase().includes(_searchTerm) ||
        (s.product?.name || '').toLowerCase().includes(_searchTerm)
      );
    }

    // Status filter
    if (_statusFilter !== 'all') {
      result = result.filter(s => s.status === _statusFilter);
    }

    // Sort
    result.sort((a, b) => {
      let av = _getVal(a, _sortCol);
      let bv = _getVal(b, _sortCol);
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return _sortDir === 'asc' ? -1 : 1;
      if (av > bv) return _sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    _filtered = result;
    _renderTable();
  }

  function _getVal(seller, col) {
    switch (col) {
      case 'name':     return seller.name || '';
      case 'district': return seller.district || '';
      case 'product':  return seller.product?.name || '';
      case 'status':   return seller.status || '';
      case 'margin':   return seller.margin?.marginPercent ?? -Infinity;
      case 'createdAt': return seller.createdAt || '';
      default: return '';
    }
  }

  // ─────────────────────────────────────────────────────────
  //  RENDER STATS
  // ─────────────────────────────────────────────────────────
  function _renderStats() {
    const all = _allSellers;
    const validated = all.filter(s => s.status === 'validated');
    const withMargin = all.filter(s => s.margin?.marginPercent != null);
    const avgMargin  = withMargin.length > 0
      ? withMargin.reduce((sum, s) => sum + s.margin.marginPercent, 0) / withMargin.length
      : 0;

    // Live sellers = ones created in this session (isLive flag) or this month
    const thisMonth = new Date();
    thisMonth.setDate(1);
    const thisMonthCount = all.filter(s => new Date(s.createdAt) >= thisMonth).length;

    _setEl('stat-total',     all.length);
    _setEl('stat-validated', validated.length);
    _setEl('stat-margin',    withMargin.length > 0 ? avgMargin.toFixed(1) + '%' : '—');
    _setEl('stat-month',     thisMonthCount);
  }

  // ─────────────────────────────────────────────────────────
  //  RENDER TABLE
  // ─────────────────────────────────────────────────────────
  function _renderTable() {
    const tbody = document.getElementById('sellers-tbody');
    const footer = document.getElementById('table-count');
    footer.textContent = `Showing ${_filtered.length} of ${_allSellers.length} sellers`;

    if (_filtered.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="6">
          <div class="empty-state">
            <div class="empty-state-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            </div>
            <h3>No sellers found</h3>
            <p>Try adjusting your search or filter.</p>
          </div>
        </td></tr>`;
      return;
    }

    tbody.innerHTML = _filtered.map(s => _renderRow(s)).join('');

    // Wire action buttons
    tbody.querySelectorAll('.action-btn-view').forEach(btn => {
      btn.addEventListener('click', () => {
        window.location.href = `landing.html?seller=${btn.dataset.id}`;
      });
    });
  }

  function _renderRow(s) {
    const initials = (s.name || '??').split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase();
    const avatarColor = _hashColor(s.id);
    const statusBadge = _statusBadge(s.status);
    const marginHtml  = _marginCell(s.margin);
    const productName = s.product?.name || '—';
    const timeAgo     = _timeAgo(s.createdAt);
    const hasListing  = s.status === 'validated' && s.product?.name;
    const isLive      = s.isLive;

    return `
      <tr>
        <td>
          <div class="seller-cell">
            <div class="seller-initials" style="background:${avatarColor}">${initials}</div>
            <div class="seller-info">
              <div class="seller-name">
                ${_esc(s.name)}
                ${isLive ? '<span class="live-tag"><span class="live-dot"></span> Live</span>' : ''}
              </div>
              <div class="seller-district">
                <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                ${_esc(s.district || 'Kerala')}
              </div>
            </div>
          </div>
        </td>
        <td style="color:var(--text-secondary);font-size:var(--text-sm)">${_esc(productName)}</td>
        <td>${statusBadge}</td>
        <td>${marginHtml}</td>
        <td style="color:var(--text-muted);font-size:var(--text-sm)">${timeAgo}</td>
        <td>
          <div class="action-group">
            <a class="action-btn action-btn-listing action-btn-view" data-id="${s.id}"
               href="landing.html?seller=${s.id}"
               ${!hasListing ? 'style="opacity:0.3;pointer-events:none" title="Product not yet validated"' : 'title="View product listing"'}>
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              Listing
            </a>
          </div>
        </td>
      </tr>`;
  }

  // ─────────────────────────────────────────────────────────
  //  HELPERS
  // ─────────────────────────────────────────────────────────
  function _statusBadge(status) {
    const map = {
      onboarding: ['badge-onboarding', 'Onboarding'],
      intake:     ['badge-intake',     'Product Intake'],
      validated:  ['badge-validated',  'Validated'],
      coaching:   ['badge-coaching',   'In Coaching']
    };
    const [cls, label] = map[status] || ['badge-onboarding', status || '—'];
    return `<span class="badge ${cls}">${label}</span>`;
  }

  function _marginCell(margin) {
    if (!margin) return '<span class="margin-val none">—</span>';
    const cls = margin.pass ? 'pass' : 'fail';
    return `<span class="margin-val ${cls}">${margin.marginPercent.toFixed(1)}%</span>`;
  }

  function _timeAgo(iso) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'Just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  }

  function _hashColor(str) {
    const colors = ['#0F2044','#1A3366','#B8822E','#1B7A3E','#6B3FA0','#B45309','#0369A1'];
    let hash = 0;
    for (let c of (str || '')) hash = ((hash << 5) - hash) + c.charCodeAt(0);
    return colors[Math.abs(hash) % colors.length];
  }

  function _updateSortHeaders() {
    const upDownSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 9l4-4 4 4"/><path d="M16 15l-4 4-4-4"/></svg>`;
    const upSVG     = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`;
    const downSVG   = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

    document.querySelectorAll('[data-sort]').forEach(th => {
      th.classList.remove('sorted');
      const icon = th.querySelector('.sort-icon');
      if (icon) icon.innerHTML = upDownSVG;
    });
    const active = document.querySelector(`[data-sort="${_sortCol}"]`);
    if (active) {
      active.classList.add('sorted');
      const icon = active.querySelector('.sort-icon');
      if (icon) icon.innerHTML = _sortDir === 'asc' ? upSVG : downSVG;
    }
  }

  function _setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function _esc(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.querySelector('.toast-container')?.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  // ─────────────────────────────────────────────────────────
  //  ANALYTICS: DISTRICT MAP
  // ─────────────────────────────────────────────────────────
  function _renderDistrictMap(sellers) {
    const el = document.getElementById('district-list');
    if (!el) return;

    // Count sellers per district
    const counts = {};
    sellers.forEach(s => {
      const d = s.district || 'Unknown';
      counts[d] = (counts[d] || 0) + 1;
    });

    // Top 6 districts
    const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,6);
    const max = sorted[0]?.[1] || 1;

    if (sorted.length === 0) {
      el.innerHTML = '<p style="font-size:11px;color:var(--text-muted);text-align:center;padding:16px">No district data yet</p>';
      return;
    }

    el.innerHTML = sorted.map(([district, count]) => `
      <div class="district-row">
        <div class="district-name" title="${_esc(district)}">${_esc(district)}</div>
        <div class="district-bar-wrap">
          <div class="district-bar" style="width:${Math.round((count/max)*100)}%"></div>
        </div>
        <div class="district-count">${count}</div>
      </div>`).join('');
  }

  // ─────────────────────────────────────────────────────────
  //  ANALYTICS: PIPELINE FUNNEL
  // ─────────────────────────────────────────────────────────
  function _renderFunnel(sellers) {
    const el = document.getElementById('funnel-list');
    if (!el) return;

    const stages = [
      { key: 'onboarding', label: 'Onboarding',    color: '#94A3B8' },
      { key: 'intake',     label: 'Product Intake', color: '#F59E0B' },
      { key: 'costing',    label: 'Cost Review',    color: '#3B82F6' },
      { key: 'coaching',   label: 'Coaching',       color: '#F97316' },
      { key: 'validated',  label: 'Validated',      color: '#22C55E' },
    ];

    const counts = {};
    sellers.forEach(s => { counts[s.status] = (counts[s.status]||0)+1; });
    const total = sellers.length || 1;

    el.innerHTML = stages.map(st => {
      const n = counts[st.key] || 0;
      const pct = Math.round((n/total)*100);
      return `
        <div class="funnel-stage">
          <div class="funnel-stage-header">
            <div class="funnel-stage-label">
              <span class="funnel-stage-dot" style="background:${st.color}"></span>
              ${st.label}
            </div>
            <div class="funnel-stage-count">${n}</div>
          </div>
          <div class="funnel-bar-wrap">
            <div class="funnel-bar" style="width:${pct}%;background:${st.color}"></div>
          </div>
        </div>`;
    }).join('');
  }

  // ─────────────────────────────────────────────────────────
  //  ANALYTICS: ACTIVITY FEED
  // ─────────────────────────────────────────────────────────
  function _renderActivityFeed(sellers) {
    const el = document.getElementById('activity-feed');
    if (!el) return;

    const statusMeta = {
      onboarding: { label: 'started onboarding with Jami',    color: '#94A3B8' },
      intake:     { label: 'submitted a product for review',  color: '#F59E0B' },
      costing:    { label: 'entered cost calculation flow',   color: '#3B82F6' },
      coaching:   { label: 'is in pricing coaching',          color: '#F97316' },
      validated:  { label: 'product validated — listing live!', color: '#22C55E' },
    };

    const recent = [...sellers]
      .sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''))
      .slice(0, 6);

    if (recent.length === 0) {
      el.innerHTML = '<p style="font-size:11px;color:var(--text-muted);text-align:center;padding:16px">No activity yet</p>';
      return;
    }

    el.innerHTML = recent.map(s => {
      const meta = statusMeta[s.status] || { label: 'joined', color: '#94A3B8' };
      return `
        <div class="activity-item">
          <div class="activity-dot" style="background:${meta.color}"></div>
          <div class="activity-text">
            <div class="activity-name">${_esc(s.name || 'New seller')}</div>
            <div class="activity-action">${meta.label}${s.product?.name ? ' &middot; ' + _esc(s.product.name) : ''}</div>
          </div>
          <div class="activity-time">${_timeAgo(s.createdAt)}</div>
        </div>`;
    }).join('');
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', DashboardUI.init);
