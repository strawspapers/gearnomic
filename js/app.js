// ============================================================
// Gearnomic — Application Logic
// ============================================================

// ── State ──────────────────────────────────────────────────
let state = { items: [], trips: [], wishlist: [], categories: [], templates: [] };

// ── Persistence ────────────────────────────────────────────
function saveState() {
  try { localStorage.setItem('trailkit_v1', JSON.stringify(state)); } catch(e) {}
}

function loadState() {
  try {
    const raw = localStorage.getItem('trailkit_v1');
    if (raw) {
      state = JSON.parse(raw);
      // Migrate: older saves won't have templates
      if (!state.templates) state.templates = JSON.parse(JSON.stringify(SEED_DATA.templates));
      return;
    }
  } catch(e) {}
  // First run — load seed data
  state = {
    items:      JSON.parse(JSON.stringify(SEED_DATA.items)),
    trips:      JSON.parse(JSON.stringify(SEED_DATA.trips)),
    wishlist:   JSON.parse(JSON.stringify(SEED_DATA.wishlist)),
    categories: JSON.parse(JSON.stringify(SEED_DATA.categories)),
    templates:  JSON.parse(JSON.stringify(SEED_DATA.templates)),
  };
  saveState();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'trailkit-export.json';
  a.click();
  toast('Data exported!');
}

function importData(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      state = JSON.parse(ev.target.result);
      saveState(); refreshAll();
      toast('Data imported successfully!');
    } catch { toast('Invalid JSON file.'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ── ID generation ──────────────────────────────────────────
function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── Utilities ──────────────────────────────────────────────
const wg  = g => !g ? '—' : g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`;
const woz = g => !g ? '' : `${(g / 28.35).toFixed(1)} oz`;
const dpg = (c, w) => c && w ? `$${(c / w).toFixed(3)}` : '—';
const usd = v => v ? `$${Number(v).toFixed(2).replace(/\.00$/, '')}` : '—';
const pct = (a, b) => b ? Math.min(100, Math.round(a / b * 100)) : 0;
const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const COND_BADGE = {
  excellent: 'badge-green',
  good:      'badge-blue',
  fair:      'badge-amber',
  poor:      'badge-red'
};
const COND_LABEL = { excellent: 'Excellent', good: 'Good', fair: 'Fair', poor: 'Poor' };
const CARRY_BADGE = { packed: 'badge-green', worn: 'badge-blue', not_carried: 'badge-gray' };
const CARRY_LABEL = { packed: 'Packed', worn: 'Worn', not_carried: 'Not carried' };
const STATUS_BADGE = { planning: 'badge-amber', confirmed: 'badge-blue', completed: 'badge-dark', cancelled: 'badge-gray' };
const STATUS_LABEL = { planning: 'Planning', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled' };

function badge(cls, text) { return `<span class="badge ${cls}">${esc(text)}</span>`; }
function progFill(p) { return p >= 100 ? 'prog-red' : p >= 80 ? 'prog-amber' : 'prog-green'; }
function prog(val, max, trackClass) {
  const p = pct(val, max);
  return `<div class="prog-track ${trackClass||''}"><div class="prog-fill ${progFill(p)}" style="width:${p}%"></div></div>`;
}

function tripWeight(trip) {
  return (trip.gear_ids || []).reduce((sum, id) => {
    const ov = (trip.gear_overrides || {})[id];
    const item = state.items.find(i => i.id === id);
    if (!item) return sum;
    return sum + (ov != null ? ov : (item.weight_g || 0));
  }, 0);
}

function categoryColor(name) {
  const cat = state.categories.find(c => c.name === name);
  return cat ? cat.color : '#888';
}

function categoryTarget(name) {
  const cat = state.categories.find(c => c.name === name);
  return cat ? cat.target_g : null;
}

function categoryNames() {
  const fromItems = [...new Set(state.items.map(i => i.category))];
  const fromCats  = state.categories.map(c => c.name);
  return [...new Set([...fromCats, ...fromItems])];
}

// ── Toast ──────────────────────────────────────────────────
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  el.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.style.display = 'none', 200); }, 2500);
}

// ── Navigation ─────────────────────────────────────────────
let currentTab = 'dashboard';

function showTab(name) {
  currentTab = name;
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
  const renders = { dashboard: renderDashboard, gear: renderGear, trips: renderTrips, templates: renderTemplates, wishlist: renderWishlist, analytics: renderAnalytics };
  if (renders[name]) renders[name]();
}

// ── Modal ──────────────────────────────────────────────────
function openModal(title, html) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-overlay').style.display = 'flex';
  const first = document.querySelector('#modal-body input, #modal-body select, #modal-body textarea');
  if (first) setTimeout(() => first.focus(), 100);
}
function closeModal() { document.getElementById('modal-overlay').style.display = 'none'; }
function handleOverlayClick(e) { if (e.target === document.getElementById('modal-overlay')) closeModal(); }

// ── Category options HTML ──────────────────────────────────
function catOptions(selected) {
  return categoryNames().map(c => `<option value="${esc(c)}" ${c === selected ? 'selected' : ''}>${esc(c)}</option>`).join('');
}

// ============================================================
// DASHBOARD
// ============================================================
function renderDashboard() {
  const d = new Date();
  document.getElementById('dash-date').textContent =
    d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const packed   = state.items.filter(i => i.carry_type !== 'not_carried');
  const worn     = state.items.filter(i => i.carry_type === 'worn');
  const allW     = state.items.reduce((s, i) => s + (i.weight_g || 0), 0);
  const wornW    = worn.reduce((s, i) => s + (i.weight_g || 0), 0);
  const baseW    = packed.filter(i => i.carry_type === 'packed').reduce((s, i) => s + (i.weight_g || 0), 0);
  const totalCost= state.items.reduce((s, i) => s + (i.cost_usd || 0), 0);
  const upcoming = state.trips.filter(t => t.status === 'planning' || t.status === 'confirmed');

  document.getElementById('dash-metrics').innerHTML = `
    <div class="metric-card"><div class="metric-label">Total items</div><div class="metric-val">${state.items.length}</div><div class="metric-sub">${packed.length} packed or worn</div></div>
    <div class="metric-card"><div class="metric-label">Base weight</div><div class="metric-val">${wg(baseW)}</div><div class="metric-sub">+ ${wg(wornW)} worn</div></div>
    <div class="metric-card"><div class="metric-label">Tracked value</div><div class="metric-val">${usd(totalCost)}</div><div class="metric-sub">avg ${usd(totalCost / state.items.filter(i => i.cost_usd > 0).length || 0)}/item</div></div>
    <div class="metric-card"><div class="metric-label">Upcoming trips</div><div class="metric-val">${upcoming.length}</div><div class="metric-sub">${state.trips.length} total logged</div></div>`;

  // Weight by category
  const cw = {};
  state.items.forEach(i => { cw[i.category] = (cw[i.category] || 0) + (i.weight_g || 0); });
  const sortedCW = Object.entries(cw).sort((a, b) => b[1] - a[1]);
  const maxCW = sortedCW[0]?.[1] || 1;
  document.getElementById('dash-cats').innerHTML = sortedCW.map(([cat, w]) => {
    const tgt = categoryTarget(cat);
    const pOver = tgt && w > tgt;
    const p = Math.round(w / maxCW * 100);
    return `<div class="cat-bar-row">
      <span class="cat-bar-name" title="${esc(cat)}">${esc(cat)}</span>
      <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${p}%;background:${categoryColor(cat)}"></div></div>
      <span class="cat-bar-val">${wg(w)}${pOver ? ` <span style="color:var(--danger)">▲</span>` : ''}</span>
    </div>`;
  }).join('');

  // Trips
  document.getElementById('dash-trips').innerHTML = !state.trips.length
    ? `<div class="empty-state"><p>No trips yet.</p></div>`
    : state.trips.map(t => {
        const tw = tripWeight(t);
        const p  = t.weight_target_g ? pct(tw, t.weight_target_g) : 0;
        return `<div class="dash-trip-row" onclick="showTab('trips');openTripDetail('${t.id}')">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div class="dash-trip-name">${esc(t.name)}</div>
            ${badge(STATUS_BADGE[t.status] || 'badge-gray', STATUS_LABEL[t.status] || t.status)}
          </div>
          <div class="dash-trip-meta">${esc(t.location || '')} · ${(t.gear_ids || []).length} items</div>
          ${t.weight_target_g ? `${prog(tw, t.weight_target_g)}
          <div style="font-size:11px;color:var(--text-3);margin-top:3px">${wg(tw)} / ${wg(t.weight_target_g)} target</div>` : ''}
        </div>`;
      }).join('');

  // Heaviest items
  const heavy = [...state.items].filter(i => i.weight_g > 0).sort((a, b) => b.weight_g - a.weight_g).slice(0, 6);
  document.getElementById('dash-heavy').innerHTML = heavy.map(i => `
    <tr>
      <td><div class="item-name">${esc(i.name)}</div><div class="item-sub">${esc(i.brand || '')}</div></td>
      <td>${badge('badge-gray', i.category)}</td>
      <td class="mono">${wg(i.weight_g)}<br><span style="font-size:10px;color:var(--text-3)">${woz(i.weight_g)}</span></td>
      <td>${usd(i.cost_usd)}</td>
      <td class="mono">${dpg(i.cost_usd, i.weight_g)}</td>
    </tr>`).join('');
}

// ============================================================
// GEAR CLOSET
// ============================================================
let gearExpandedId = null;

function renderGear() {
  populateCatFilter('gear-filter-cat');

  const q    = document.getElementById('gear-search').value.toLowerCase();
  const cat  = document.getElementById('gear-filter-cat').value;
  const pk   = document.getElementById('gear-filter-packed').value;
  const cond = document.getElementById('gear-filter-cond').value;
  const sort = document.getElementById('gear-sort').value;

  let filtered = state.items.filter(i => {
    if (q && !`${i.name} ${i.brand || ''} ${i.model || ''}`.toLowerCase().includes(q)) return false;
    if (cat && i.category !== cat) return false;
    if (pk === 'packed' && i.carry_type === 'not_carried') return false;
    if (pk === 'not' && i.carry_type !== 'not_carried') return false;
    if (cond && i.condition !== cond) return false;
    return true;
  });

  filtered.sort((a, b) => {
    if (sort === 'weight') return (b.weight_g || 0) - (a.weight_g || 0);
    if (sort === 'cost')   return (b.cost_usd || 0) - (a.cost_usd || 0);
    if (sort === 'dpg') {
      const da = a.cost_usd && a.weight_g ? a.cost_usd / a.weight_g : 9999;
      const db = b.cost_usd && b.weight_g ? b.cost_usd / b.weight_g : 9999;
      return da - db;
    }
    if (sort === 'name')  return a.name.localeCompare(b.name);
    if (sort === 'usage') return (b.usage_days || 0) - (a.usage_days || 0);
    // default: category
    const cc = a.category.localeCompare(b.category);
    return cc !== 0 ? cc : a.name.localeCompare(b.name);
  });

  const totalW = filtered.reduce((s, i) => s + (i.weight_g || 0), 0);
  const totalC = filtered.reduce((s, i) => s + (i.cost_usd || 0), 0);
  const wornW  = filtered.filter(i => i.carry_type === 'worn').reduce((s, i) => s + (i.weight_g || 0), 0);
  const baseW  = filtered.filter(i => i.carry_type === 'packed').reduce((s, i) => s + (i.weight_g || 0), 0);
  document.getElementById('gear-summary').innerHTML =
    `<strong>${filtered.length}</strong> items &nbsp;·&nbsp; base: <strong>${wg(baseW)}</strong> &nbsp;·&nbsp; worn: <strong>${wg(wornW)}</strong> &nbsp;·&nbsp; total: <strong>${wg(totalW)}</strong> &nbsp;·&nbsp; tracked value: <strong>${usd(totalC)}</strong>`;

  let html = '';
  let lastCat = null;
  filtered.forEach(item => {
    if (sort === 'category' && item.category !== lastCat) {
      lastCat = item.category;
      html += `<tr class="cat-header-row"><td colspan="9">${esc(item.category)}</td></tr>`;
    }
    html += gearRow(item);
  });

  if (!filtered.length) {
    html = `<tr><td colspan="9"><div class="empty-state"><p>No items match your filters.</p><button class="btn btn-sm" onclick="clearGearFilters()">Clear filters</button></div></td></tr>`;
  }

  document.getElementById('gear-tbody').innerHTML = html;
}

function gearRow(item) {
  const isExpanded = gearExpandedId === item.id;
  const detailHtml = isExpanded ? `
    <tr class="detail-row" id="det-${item.id}">
      <td colspan="9">
        <div class="detail-inner">
          <div class="info-grid">
            ${item.model ? `<div class="info-pair"><div class="info-key">Model</div><div class="info-val">${esc(item.model)}</div></div>` : ''}
            ${item.volume_liters ? `<div class="info-pair"><div class="info-key">Volume</div><div class="info-val">${item.volume_liters}L</div></div>` : ''}
            ${item.frame_type ? `<div class="info-pair"><div class="info-key">Frame</div><div class="info-val">${esc(item.frame_type)}</div></div>` : ''}
            ${item.misc_stat ? `<div class="info-pair"><div class="info-key">Spec</div><div class="info-val">${esc(item.misc_stat)}</div></div>` : ''}
            ${item.purchase_date ? `<div class="info-pair"><div class="info-key">Purchased</div><div class="info-val">${item.purchase_date}</div></div>` : ''}
            ${item.purchase_retailer ? `<div class="info-pair"><div class="info-key">Retailer</div><div class="info-val">${esc(item.purchase_retailer)}</div></div>` : ''}
          </div>
          ${item.notes ? `<p style="font-size:12.5px;color:var(--text-2);margin-bottom:10px">${esc(item.notes)}</p>` : ''}
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-xs" onclick="logUsage('${item.id}','day')">+ Log day</button>
            ${item.category === 'Sleep' || item.category === 'Shelter' ? `<button class="btn btn-xs" onclick="logUsage('${item.id}','night')">+ Log night</button>` : ''}
            ${item.product_url ? `<a href="${esc(item.product_url)}" target="_blank" class="btn btn-xs">View product ↗</a>` : ''}
            <button class="btn btn-xs" onclick="openEditItem('${item.id}')">Edit</button>
            <button class="btn btn-xs btn-danger" onclick="deleteItem('${item.id}')">Delete</button>
          </div>
        </div>
      </td>
    </tr>` : '';

  return `<tr class="expandable" onclick="toggleExpand('${item.id}')">
    <td><div class="item-name">${esc(item.name)}</div><div class="item-sub">${esc(item.brand || '')}</div></td>
    <td>${badge('badge-gray', item.category)}</td>
    <td class="mono">${wg(item.weight_g)}<br><span style="font-size:10px;color:var(--text-3)">${woz(item.weight_g)}</span></td>
    <td>${usd(item.cost_usd)}</td>
    <td class="mono" style="color:var(--text-2)">${dpg(item.cost_usd, item.weight_g)}</td>
    <td>${badge(CARRY_BADGE[item.carry_type] || 'badge-gray', CARRY_LABEL[item.carry_type] || item.carry_type)}</td>
    <td>${badge(COND_BADGE[item.condition] || 'badge-gray', COND_LABEL[item.condition] || item.condition)}</td>
    <td class="mono" style="font-size:11px;color:var(--text-3)">${item.usage_days || 0}d${item.usage_nights ? ` · ${item.usage_nights}n` : ''}</td>
    <td onclick="event.stopPropagation()">
      <button class="btn-icon" title="Edit" onclick="openEditItem('${item.id}')">✎</button>
    </td>
  </tr>${detailHtml}`;
}

function toggleExpand(id) {
  gearExpandedId = gearExpandedId === id ? null : id;
  renderGear();
}

function clearGearFilters() {
  document.getElementById('gear-search').value = '';
  document.getElementById('gear-filter-cat').value = '';
  document.getElementById('gear-filter-packed').value = '';
  document.getElementById('gear-filter-cond').value = '';
  renderGear();
}

function logUsage(id, type) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;
  item.usage_days = (item.usage_days || 0) + 1;
  if (type === 'night') item.usage_nights = (item.usage_nights || 0) + 1;
  saveState(); renderGear();
  toast(`${type === 'night' ? 'Night' : 'Day'} logged for ${item.name}`);
}

// ── Gear CRUD ──────────────────────────────────────────────
function itemFormHtml(item) {
  item = item || {};
  return `
    <div class="form-grid">
      <div class="form-row"><label class="form-label">Name *</label><input class="input input-full" id="f-name" value="${esc(item.name || '')}" placeholder="e.g. Zpacks Arc Blast" required></div>
      <div class="form-row"><label class="form-label">Brand</label><input class="input input-full" id="f-brand" value="${esc(item.brand || '')}" placeholder="e.g. Zpacks"></div>
      <div class="form-row"><label class="form-label">Model</label><input class="input input-full" id="f-model" value="${esc(item.model || '')}" placeholder="e.g. Arc Blast 55"></div>
      <div class="form-row">
        <label class="form-label">Category</label>
        <select class="select input-full" id="f-cat">${catOptions(item.category || 'Pack')}</select>
      </div>
      <div class="form-row"><label class="form-label">Weight (grams)</label><input class="input input-full" id="f-weight" type="number" min="0" step="0.1" value="${item.weight_g || ''}"></div>
      <div class="form-row"><label class="form-label">Cost (USD)</label><input class="input input-full" id="f-cost" type="number" min="0" step="0.01" value="${item.cost_usd || ''}"></div>
      <div class="form-row">
        <label class="form-label">Carry type</label>
        <select class="select input-full" id="f-carry">
          <option value="packed" ${item.carry_type === 'packed' ? 'selected' : ''}>Packed</option>
          <option value="worn" ${item.carry_type === 'worn' ? 'selected' : ''}>Worn</option>
          <option value="not_carried" ${item.carry_type === 'not_carried' ? 'selected' : ''}>Not carried</option>
        </select>
      </div>
      <div class="form-row">
        <label class="form-label">Condition</label>
        <select class="select input-full" id="f-cond">
          <option value="excellent" ${item.condition === 'excellent' ? 'selected' : ''}>Excellent</option>
          <option value="good" ${(!item.condition || item.condition === 'good') ? 'selected' : ''}>Good</option>
          <option value="fair" ${item.condition === 'fair' ? 'selected' : ''}>Fair</option>
          <option value="poor" ${item.condition === 'poor' ? 'selected' : ''}>Poor</option>
        </select>
      </div>
      <div class="form-row"><label class="form-label">Volume (liters)</label><input class="input input-full" id="f-liters" type="number" min="0" step="0.1" value="${item.volume_liters || ''}" placeholder="optional"></div>
      <div class="form-row"><label class="form-label">Frame type</label><input class="input input-full" id="f-frame" value="${esc(item.frame_type || '')}" placeholder="e.g. internal aluminum"></div>
      <div class="form-row"><label class="form-label">Purchase date</label><input class="input input-full" id="f-date" type="date" value="${item.purchase_date || ''}"></div>
      <div class="form-row"><label class="form-label">Retailer</label><input class="input input-full" id="f-retailer" value="${esc(item.purchase_retailer || '')}" placeholder="e.g. REI, Amazon"></div>
    </div>
    <div class="form-row"><label class="form-label">Product URL</label><input class="input input-full" id="f-url" value="${esc(item.product_url || '')}" placeholder="https://"></div>
    <div class="form-grid">
      <div class="form-row"><label class="form-label">Days used</label><input class="input input-full" id="f-days" type="number" min="0" value="${item.usage_days || 0}"></div>
      <div class="form-row"><label class="form-label">Nights (for sleep/shelter)</label><input class="input input-full" id="f-nights" type="number" min="0" value="${item.usage_nights || 0}"></div>
    </div>
    <div class="form-row"><label class="form-label">Notes</label><textarea class="input input-full" id="f-notes" rows="2" style="height:60px">${esc(item.notes || '')}</textarea></div>
    <div class="form-actions">
      <button class="btn btn-primary" onclick="saveItem('${item.id || ''}')">Save item</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`;
}

function openEditItem(id) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;
  openModal('Edit gear item', itemFormHtml(item));
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-add-item').addEventListener('click', () => {
    openModal('Add gear item', itemFormHtml());
  });
});

function saveItem(id) {
  const name = document.getElementById('f-name').value.trim();
  if (!name) { alert('Name is required.'); return; }

  const data = {
    name, id: id || uid('i'),
    brand:            document.getElementById('f-brand').value.trim(),
    model:            document.getElementById('f-model').value.trim(),
    category:         document.getElementById('f-cat').value,
    weight_g:         parseFloat(document.getElementById('f-weight').value) || 0,
    cost_usd:         parseFloat(document.getElementById('f-cost').value) || 0,
    carry_type:       document.getElementById('f-carry').value,
    condition:        document.getElementById('f-cond').value,
    volume_liters:    parseFloat(document.getElementById('f-liters').value) || null,
    frame_type:       document.getElementById('f-frame').value.trim() || null,
    purchase_date:    document.getElementById('f-date').value || null,
    purchase_retailer:document.getElementById('f-retailer').value.trim() || null,
    product_url:      document.getElementById('f-url').value.trim() || null,
    usage_days:       parseInt(document.getElementById('f-days').value) || 0,
    usage_nights:     parseInt(document.getElementById('f-nights').value) || 0,
    notes:            document.getElementById('f-notes').value.trim(),
  };

  if (id) {
    const idx = state.items.findIndex(i => i.id === id);
    if (idx >= 0) state.items[idx] = data;
  } else {
    state.items.push(data);
  }

  saveState(); closeModal(); renderGear();
  if (currentTab === 'dashboard') renderDashboard();
  toast(id ? 'Item updated!' : 'Item added!');
}

function deleteItem(id) {
  if (!confirm('Delete this item? It will also be removed from all trips.')) return;
  state.items = state.items.filter(i => i.id !== id);
  state.trips.forEach(t => { t.gear_ids = (t.gear_ids || []).filter(x => x !== id); });
  saveState(); closeModal(); renderGear();
  if (currentTab === 'dashboard') renderDashboard();
  toast('Item deleted.');
}

// ── Populate category filter ────────────────────────────────
function populateCatFilter(elId) {
  const el = document.getElementById(elId);
  if (!el || el.dataset.populated) return;
  el.dataset.populated = '1';
  categoryNames().forEach(c => {
    const o = document.createElement('option');
    o.value = c; o.textContent = c;
    el.appendChild(o);
  });
}

// ============================================================
// TRIPS
// ============================================================
let activeTripId = null;

function renderTrips() {
  const upcoming = state.trips.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
  const past     = state.trips.filter(t => t.status === 'completed' || t.status === 'cancelled');

  document.getElementById('trips-summary').textContent =
    `${state.trips.length} trips · ${upcoming.length} active or planned`;

  let html = '';
  if (upcoming.length) {
    html += `<div class="section-divider">Upcoming</div><div class="trips-grid">` +
      upcoming.map(t => tripCard(t)).join('') + `</div>`;
  }
  if (past.length) {
    html += `<div class="section-divider">Past trips</div><div class="trips-grid">` +
      past.map(t => tripCard(t)).join('') + `</div>`;
  }
  if (!state.trips.length) {
    html = `<div class="empty-state"><p>No trips yet. Plan your first adventure!</p></div>`;
  }

  document.getElementById('trips-grid').innerHTML = html;

  if (activeTripId) {
    const still = state.trips.find(t => t.id === activeTripId);
    if (still) renderTripDetail(still); else closeTripDetail();
  }
}

function tripCard(t) {
  const tw = tripWeight(t);
  const p  = t.weight_target_g ? pct(tw, t.weight_target_g) : 0;
  const nights = t.start_date && t.end_date
    ? Math.round((new Date(t.end_date) - new Date(t.start_date)) / 86400000)
    : null;
  return `<div class="trip-card ${activeTripId === t.id ? 'active' : ''}" onclick="openTripDetail('${t.id}')">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
      <div class="trip-card-name">${esc(t.name)}</div>
      ${badge(STATUS_BADGE[t.status] || 'badge-gray', STATUS_LABEL[t.status] || t.status)}
    </div>
    <div class="trip-card-meta">
      ${esc(t.location || 'Location TBD')}
      ${t.start_date ? ` · ${t.start_date}` : ''}
      ${nights != null ? ` · ${nights} nights` : ''}
    </div>
    <div class="trip-card-stats">
      <span>${(t.gear_ids || []).length} items</span>
      <span class="mono" style="color:${tw > (t.weight_target_g || Infinity) ? 'var(--danger)' : 'var(--success)'}">${wg(tw)}</span>
    </div>
    ${t.weight_target_g ? `${prog(tw, t.weight_target_g)}
    <div style="font-size:10px;color:var(--text-3);margin-top:3px">${p}% of ${wg(t.weight_target_g)} target</div>` : ''}
  </div>`;
}

function openTripDetail(id) {
  activeTripId = id;
  const trip = state.trips.find(t => t.id === id);
  if (!trip) return;
  renderTripDetail(trip);
  document.getElementById('trips-grid').innerHTML = document.getElementById('trips-grid').innerHTML; // force re-render for active class
  renderTrips(); // re-render to update active card highlight
  setTimeout(() => document.getElementById('trip-detail-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
}

function closeTripDetail() {
  activeTripId = null;
  document.getElementById('trip-detail-wrap').style.display = 'none';
  renderTrips();
}

function renderTripDetail(trip) {
  const wrap = document.getElementById('trip-detail-wrap');
  wrap.style.display = 'block';

  const tw     = tripWeight(trip);
  const wornW  = (trip.gear_ids || []).reduce((s, id) => {
    const item = state.items.find(i => i.id === id);
    return s + (item && item.carry_type === 'worn' ? (item.weight_g || 0) : 0);
  }, 0);
  const baseW  = tw - wornW;
  const nights = trip.start_date && trip.end_date
    ? Math.round((new Date(trip.end_date) - new Date(trip.start_date)) / 86400000) : null;
  const over   = trip.weight_target_g && tw > trip.weight_target_g;

  // Category breakdown for this trip
  const cw = {};
  (trip.gear_ids || []).forEach(id => {
    const item = state.items.find(i => i.id === id);
    if (item) cw[item.category] = (cw[item.category] || 0) + (item.weight_g || 0);
  });
  const maxCW = Math.max(...Object.values(cw), 1);

  const catBars = Object.entries(cw).sort((a, b) => b[1] - a[1]).map(([cat, w]) =>
    `<div class="w-bar-row">
      <span class="w-bar-label">${esc(cat)}</span>
      <div class="w-bar-track"><div class="w-bar-fill" style="width:${Math.round(w/maxCW*100)}%;background:${categoryColor(cat)}"></div></div>
      <span class="w-bar-vals">${wg(w)}</span>
    </div>`).join('');

  const gearRows = (trip.gear_ids || []).map(id => {
    const item = state.items.find(i => i.id === id);
    if (!item) return '';
    const ov = (trip.gear_overrides || {})[id];
    const effectiveW = ov != null ? ov : item.weight_g;
    return `<tr>
      <td><div class="item-name">${esc(item.name)}</div><div class="item-sub">${esc(item.brand || '')}</div></td>
      <td>${badge('badge-gray', item.category)}</td>
      <td class="mono">${wg(effectiveW)}${ov != null ? ` <span style="font-size:10px;color:var(--accent)">(override)</span>` : ''}</td>
      <td>${badge(CARRY_BADGE[item.carry_type] || 'badge-gray', CARRY_LABEL[item.carry_type] || item.carry_type)}</td>
      <td>${usd(item.cost_usd)}</td>
    </tr>`;
  }).join('');

  document.getElementById('trip-detail').innerHTML = `
    <div class="card-header" style="margin-bottom:.5rem">
      <div>
        <span class="card-title" style="font-size:17px;font-family:var(--font-disp)">${esc(trip.name)}</span>
        &nbsp;${badge(STATUS_BADGE[trip.status] || 'badge-gray', STATUS_LABEL[trip.status] || trip.status)}
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-sm" onclick="openEditTrip('${trip.id}')">Edit trip</button>
        <button class="btn btn-sm" style="border-color:var(--accent);color:var(--accent)" onclick="saveAsTemplate('${trip.id}')">Save as template</button>
        <button class="btn btn-sm btn-danger" onclick="deleteTrip('${trip.id}')">Delete</button>
        <button class="btn btn-sm btn-ghost" onclick="closeTripDetail()">Close ✕</button>
      </div>
    </div>

    <div class="info-grid" style="margin-bottom:1rem">
      ${trip.location ? `<div class="info-pair"><div class="info-key">Location</div><div class="info-val">${esc(trip.location)}</div></div>` : ''}
      ${trip.start_date ? `<div class="info-pair"><div class="info-key">Dates</div><div class="info-val">${trip.start_date}${trip.end_date ? ' → ' + trip.end_date : ''}</div></div>` : ''}
      ${nights != null ? `<div class="info-pair"><div class="info-key">Nights</div><div class="info-val">${nights}</div></div>` : ''}
    </div>

    ${trip.notes ? `<p style="font-size:13px;color:var(--text-2);margin-bottom:1rem;padding:.75rem;background:var(--surface-2);border-radius:var(--r-md)">${esc(trip.notes)}</p>` : ''}

    <div style="margin-bottom:1rem">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
        <span>Total: <strong class="mono">${wg(tw)}</strong> &nbsp; Base: <strong class="mono">${wg(baseW)}</strong> &nbsp; Worn: <strong class="mono">${wg(wornW)}</strong></span>
        ${trip.weight_target_g ? `<span style="color:var(--${over ? 'danger' : 'success'})">${over ? '↑ ' + wg(tw - trip.weight_target_g) + ' over' : '↓ ' + wg(trip.weight_target_g - tw) + ' under'} ${wg(trip.weight_target_g)} target</span>` : ''}
      </div>
      ${trip.weight_target_g ? prog(tw, trip.weight_target_g) : ''}
    </div>

    <div style="margin-bottom:1.25rem">${catBars}</div>

    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
      <span style="font-size:13px;font-weight:500">Packed gear (${(trip.gear_ids||[]).length} items)</span>
      <div style="display:flex;gap:6px">
        <button class="btn btn-sm" style="border-color:var(--accent);color:var(--accent)" onclick="openApplyTemplate('${trip.id}')">Apply template</button>
        <button class="btn btn-sm" onclick="toggleGearPicker('${trip.id}')">+ Add / remove gear</button>
      </div>
    </div>
    <div id="gear-picker-${trip.id}" style="display:none">
      <div class="picker-grid">${state.items.map(item => {
        const inTrip = (trip.gear_ids || []).includes(item.id);
        return `<div class="picker-item ${inTrip ? 'in' : ''}" onclick="toggleTripItem('${trip.id}','${item.id}')">${inTrip ? '✓ ' : ''}${esc(item.name)}</div>`;
      }).join('')}</div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Item</th><th>Category</th><th>Weight</th><th>Carry</th><th>Cost</th></tr></thead>
        <tbody>${gearRows || '<tr><td colspan="5"><div class="empty-state">No gear added yet.</div></td></tr>'}</tbody>
      </table>
    </div>`;
}

function toggleGearPicker(tripId) {
  const el = document.getElementById(`gear-picker-${tripId}`);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function toggleTripItem(tripId, itemId) {
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip) return;
  trip.gear_ids = trip.gear_ids || [];
  const idx = trip.gear_ids.indexOf(itemId);
  if (idx >= 0) trip.gear_ids.splice(idx, 1);
  else trip.gear_ids.push(itemId);
  saveState();
  renderTripDetail(trip);
  if (currentTab === 'dashboard') renderDashboard();
}

// ── Trip CRUD ──────────────────────────────────────────────
function tripFormHtml(trip) {
  trip = trip || {};
  return `
    <div class="form-grid">
      <div class="form-row"><label class="form-label">Trip name *</label><input class="input input-full" id="tf-name" value="${esc(trip.name || '')}" placeholder="e.g. JMT Section Hike"></div>
      <div class="form-row"><label class="form-label">Location</label><input class="input input-full" id="tf-loc" value="${esc(trip.location || '')}" placeholder="e.g. Sierra Nevada, CA"></div>
      <div class="form-row"><label class="form-label">Start date</label><input class="input input-full" id="tf-start" type="date" value="${trip.start_date || ''}"></div>
      <div class="form-row"><label class="form-label">End date</label><input class="input input-full" id="tf-end" type="date" value="${trip.end_date || ''}"></div>
      <div class="form-row">
        <label class="form-label">Status</label>
        <select class="select input-full" id="tf-status">
          <option value="planning" ${trip.status === 'planning' ? 'selected' : ''}>Planning</option>
          <option value="confirmed" ${trip.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
          <option value="completed" ${trip.status === 'completed' ? 'selected' : ''}>Completed</option>
          <option value="cancelled" ${trip.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
        </select>
      </div>
      <div class="form-row">
        <label class="form-label">Type</label>
        <select class="select input-full" id="tf-type">
          <option value="backpacking" ${(!trip.trip_type || trip.trip_type === 'backpacking') ? 'selected' : ''}>Backpacking</option>
          <option value="bikepacking" ${trip.trip_type === 'bikepacking' ? 'selected' : ''}>Bikepacking</option>
          <option value="car_camping" ${trip.trip_type === 'car_camping' ? 'selected' : ''}>Car camping</option>
          <option value="day_hike" ${trip.trip_type === 'day_hike' ? 'selected' : ''}>Day hike</option>
          <option value="other" ${trip.trip_type === 'other' ? 'selected' : ''}>Other</option>
        </select>
      </div>
      <div class="form-row"><label class="form-label">Weight target (grams)</label><input class="input input-full" id="tf-target" type="number" min="0" value="${trip.weight_target_g || ''}" placeholder="e.g. 10000"></div>
    </div>
    <div class="form-row"><label class="form-label">Notes</label><textarea class="input input-full" id="tf-notes" rows="2" style="height:60px">${esc(trip.notes || '')}</textarea></div>
    <div class="form-actions">
      <button class="btn btn-primary" onclick="saveTrip('${trip.id || ''}')">Save trip</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`;
}

function openEditTrip(id) {
  const trip = state.trips.find(t => t.id === id);
  if (!trip) return;
  openModal('Edit trip', tripFormHtml(trip));
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-add-trip').addEventListener('click', () => {
    openModal('New trip', tripFormHtml());
  });
});

function saveTrip(id) {
  const name = document.getElementById('tf-name').value.trim();
  if (!name) { alert('Name is required.'); return; }
  const data = {
    id: id || uid('t'),
    name,
    location:         document.getElementById('tf-loc').value.trim(),
    start_date:       document.getElementById('tf-start').value || null,
    end_date:         document.getElementById('tf-end').value || null,
    status:           document.getElementById('tf-status').value,
    trip_type:        document.getElementById('tf-type').value,
    weight_target_g:  parseInt(document.getElementById('tf-target').value) || null,
    notes:            document.getElementById('tf-notes').value.trim(),
    gear_ids:         id ? (state.trips.find(t => t.id === id)?.gear_ids || []) : [],
    gear_overrides:   id ? (state.trips.find(t => t.id === id)?.gear_overrides || {}) : {},
  };

  if (id) {
    const idx = state.trips.findIndex(t => t.id === id);
    if (idx >= 0) state.trips[idx] = data;
  } else {
    state.trips.push(data);
  }

  saveState(); closeModal();
  if (currentTab === 'trips') { activeTripId = data.id; renderTrips(); }
  if (currentTab === 'dashboard') renderDashboard();
  toast(id ? 'Trip updated!' : 'Trip created!');
}

function deleteTrip(id) {
  if (!confirm('Delete this trip?')) return;
  state.trips = state.trips.filter(t => t.id !== id);
  saveState(); closeTripDetail(); renderTrips();
  if (currentTab === 'dashboard') renderDashboard();
  toast('Trip deleted.');
}

// ============================================================
// WISHLIST
// ============================================================
function renderWishlist() {
  // Populate filter
  const catEl = document.getElementById('wish-filter-cat');
  if (!catEl.dataset.populated) {
    catEl.dataset.populated = '1';
    const types = [...new Set(state.wishlist.map(w => w.name))].sort();
    types.forEach(t => { const o = document.createElement('option'); o.value = t; o.textContent = t; catEl.appendChild(o); });
  }

  const cat  = catEl.value;
  const sort = document.getElementById('wish-sort').value;

  let filtered = state.wishlist.filter(w => !cat || w.name === cat);
  filtered.sort((a, b) => {
    if (sort === 'weight') return (a.weight_g || 9999) - (b.weight_g || 9999);
    if (sort === 'cost')   return (a.cost_usd || 9999) - (b.cost_usd || 9999);
    if (sort === 'name')   return a.name.localeCompare(b.name);
    // dpg
    const da = a.cost_usd && a.weight_g ? a.cost_usd / a.weight_g : 9999;
    const db = b.cost_usd && b.weight_g ? b.cost_usd / b.weight_g : 9999;
    return da - db;
  });

  document.getElementById('wish-tbody').innerHTML = !filtered.length
    ? `<tr><td colspan="8"><div class="empty-state"><p>No wishlist items.</p></div></td></tr>`
    : filtered.map(w => {
        // Find best matching owned item to compare weight
        const owned = state.items.filter(i =>
          i.name.toLowerCase().includes(w.name.toLowerCase()) ||
          w.name.toLowerCase().includes(i.category.toLowerCase().split(' ')[0])
        );
        const ownedW = owned.length ? Math.min(...owned.map(i => i.weight_g || 9999)) : null;
        const diff = ownedW && w.weight_g ? ownedW - w.weight_g : null;
        const vsOwned = diff != null
          ? `<span style="color:var(--${diff > 0 ? 'success' : 'danger'})">${diff > 0 ? '↓ saves ' + wg(diff) : '↑ ' + wg(Math.abs(diff)) + ' heavier'}</span>`
          : '—';

        return `<tr>
          <td><div class="item-name">${esc(w.name)}</div>${w.notes ? `<div class="item-sub">${esc(w.notes)}</div>` : ''}</td>
          <td><div class="item-name">${esc(w.brand || '—')}</div><div class="item-sub">${esc(w.model || '')}</div></td>
          <td class="mono">${wg(w.weight_g)}<br><span style="font-size:10px;color:var(--text-3)">${woz(w.weight_g)}</span></td>
          <td>${usd(w.cost_usd)}</td>
          <td class="mono">${dpg(w.cost_usd, w.weight_g)}</td>
          <td class="mono">${w.volume_liters ? w.volume_liters + 'L' : '—'}</td>
          <td style="font-size:12px">${vsOwned}</td>
          <td>
            <div style="display:flex;gap:4px">
              ${w.product_url ? `<a href="${esc(w.product_url)}" target="_blank" class="btn btn-xs">↗</a>` : ''}
              <button class="btn btn-xs" onclick="openEditWish('${w.id}')">✎</button>
              <button class="btn btn-xs btn-danger" onclick="deleteWish('${w.id}')">✕</button>
            </div>
          </td>
        </tr>`;
      }).join('');
}

function wishFormHtml(w) {
  w = w || {};
  return `
    <div class="form-grid">
      <div class="form-row"><label class="form-label">Type (item category) *</label><input class="input input-full" id="wf-name" value="${esc(w.name || '')}" placeholder="e.g. Pack, Pillow, Tent"></div>
      <div class="form-row"><label class="form-label">Brand</label><input class="input input-full" id="wf-brand" value="${esc(w.brand || '')}"></div>
      <div class="form-row"><label class="form-label">Model</label><input class="input input-full" id="wf-model" value="${esc(w.model || '')}"></div>
      <div class="form-row"><label class="form-label">Weight (grams)</label><input class="input input-full" id="wf-weight" type="number" min="0" step="0.1" value="${w.weight_g || ''}"></div>
      <div class="form-row"><label class="form-label">Cost (USD)</label><input class="input input-full" id="wf-cost" type="number" min="0" step="0.01" value="${w.cost_usd || ''}"></div>
      <div class="form-row"><label class="form-label">Volume (liters)</label><input class="input input-full" id="wf-liters" type="number" min="0" step="0.1" value="${w.volume_liters || ''}"></div>
      <div class="form-row"><label class="form-label">Frame type</label><input class="input input-full" id="wf-frame" value="${esc(w.frame_type || '')}"></div>
    </div>
    <div class="form-row"><label class="form-label">Product URL</label><input class="input input-full" id="wf-url" value="${esc(w.product_url || '')}" placeholder="https://"></div>
    <div class="form-row"><label class="form-label">Notes</label><textarea class="input input-full" id="wf-notes" rows="2" style="height:50px">${esc(w.notes || '')}</textarea></div>
    <div class="form-actions">
      <button class="btn btn-primary" onclick="saveWish('${w.id || ''}')">Save item</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`;
}

function openEditWish(id) {
  const w = state.wishlist.find(w => w.id === id);
  if (!w) return;
  openModal('Edit wishlist item', wishFormHtml(w));
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-add-wish').addEventListener('click', () => {
    openModal('Add to wishlist', wishFormHtml());
  });
});

function saveWish(id) {
  const name = document.getElementById('wf-name').value.trim();
  if (!name) { alert('Type is required.'); return; }
  const data = {
    id: id || uid('w'), name,
    brand:        document.getElementById('wf-brand').value.trim(),
    model:        document.getElementById('wf-model').value.trim(),
    weight_g:     parseFloat(document.getElementById('wf-weight').value) || null,
    cost_usd:     parseFloat(document.getElementById('wf-cost').value) || null,
    volume_liters:parseFloat(document.getElementById('wf-liters').value) || null,
    frame_type:   document.getElementById('wf-frame').value.trim() || null,
    product_url:  document.getElementById('wf-url').value.trim() || null,
    notes:        document.getElementById('wf-notes').value.trim(),
  };
  if (id) {
    const idx = state.wishlist.findIndex(w => w.id === id);
    if (idx >= 0) state.wishlist[idx] = data;
  } else {
    state.wishlist.push(data);
  }
  saveState(); closeModal(); renderWishlist();
  toast(id ? 'Wishlist item updated!' : 'Added to wishlist!');
}

function deleteWish(id) {
  if (!confirm('Remove from wishlist?')) return;
  state.wishlist = state.wishlist.filter(w => w.id !== id);
  saveState(); renderWishlist();
  toast('Removed from wishlist.');
}

// ============================================================
// ANALYTICS
// ============================================================
let chartWeight = null, chartCost = null;

function renderAnalytics() {
  const allW   = state.items.reduce((s, i) => s + (i.weight_g || 0), 0);
  const baseW  = state.items.filter(i => i.carry_type === 'packed').reduce((s, i) => s + (i.weight_g || 0), 0);
  const wornW  = state.items.filter(i => i.carry_type === 'worn').reduce((s, i) => s + (i.weight_g || 0), 0);
  const totalC = state.items.reduce((s, i) => s + (i.cost_usd || 0), 0);
  const missingCost = state.items.filter(i => !i.cost_usd).length;

  document.getElementById('analytics-metrics').innerHTML = `
    <div class="metric-card"><div class="metric-label">Total weight</div><div class="metric-val">${wg(allW)}</div><div class="metric-sub">${woz(allW)}</div></div>
    <div class="metric-card"><div class="metric-label">Base weight</div><div class="metric-val">${wg(baseW)}</div><div class="metric-sub">worn: ${wg(wornW)}</div></div>
    <div class="metric-card"><div class="metric-label">Tracked value</div><div class="metric-val">${usd(totalC)}</div><div class="metric-sub">${missingCost} items missing cost</div></div>
    <div class="metric-card"><div class="metric-label">Items</div><div class="metric-val">${state.items.length}</div><div class="metric-sub">${state.items.filter(i => i.carry_type !== 'not_carried').length} packed or worn</div></div>`;

  // Aggregate by category
  const cw = {}, cc = {};
  state.items.forEach(i => {
    cw[i.category] = (cw[i.category] || 0) + (i.weight_g || 0);
    if (i.cost_usd) cc[i.category] = (cc[i.category] || 0) + i.cost_usd;
  });
  const sortedW = Object.entries(cw).sort((a, b) => b[1] - a[1]);
  const sortedC = Object.entries(cc).filter(([,v]) => v > 0).sort((a, b) => b[1] - a[1]);

  // Chart: weight
  if (chartWeight) chartWeight.destroy();
  const ctxW = document.getElementById('chart-weight').getContext('2d');
  chartWeight = new Chart(ctxW, {
    type: 'bar',
    data: {
      labels: sortedW.map(([c]) => c),
      datasets: [{ data: sortedW.map(([,v]) => Math.round(v)), backgroundColor: sortedW.map(([c]) => categoryColor(c)), borderRadius: 4, borderSkipped: false }]
    },
    options: {
      indexAxis: 'y', plugins: { legend: { display: false } },
      scales: { x: { ticks: { callback: v => wg(v) }, grid: { color: '#f0ece4' } }, y: { grid: { display: false } } },
      animation: { duration: 400 }
    }
  });

  // Chart: cost
  if (chartCost) chartCost.destroy();
  const ctxC = document.getElementById('chart-cost').getContext('2d');
  chartCost = new Chart(ctxC, {
    type: 'doughnut',
    data: {
      labels: sortedC.map(([c]) => c),
      datasets: [{ data: sortedC.map(([,v]) => Math.round(v)), backgroundColor: sortedC.map(([c]) => categoryColor(c)), borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      plugins: {
        legend: { position: 'right', labels: { font: { size: 11 }, padding: 12 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: $${ctx.parsed.toFixed(0)}` } }
      },
      animation: { duration: 400 }
    }
  });

  // Targets
  document.getElementById('analytics-targets').innerHTML = state.categories
    .filter(cat => cat.target_g)
    .map(cat => {
      const w = cw[cat.name] || 0;
      const p = pct(w, cat.target_g);
      const cls = p >= 100 ? 'prog-red' : p >= 80 ? 'prog-amber' : 'prog-green';
      return `<div class="target-row">
        <span class="target-label" title="${esc(cat.name)}">${esc(cat.name)}</span>
        <div class="target-bar"><div class="target-fill ${cls}" style="width:${Math.min(100,p)}%;background:${cat.color}"></div></div>
        <span class="target-vals">${wg(w)} / ${wg(cat.target_g)} <span style="color:var(--${p >= 100 ? 'danger' : p >= 80 ? 'warning' : 'success'})">${p}%</span></span>
      </div>`;
    }).join('');

  // Usage table
  const byUsage = [...state.items].filter(i => i.usage_days > 0).sort((a, b) => b.usage_days - a.usage_days).slice(0, 10);
  document.getElementById('analytics-usage').innerHTML = !byUsage.length
    ? `<tr><td colspan="5"><div class="empty-state">No usage logged yet. Click a gear item to log days/nights.</div></td></tr>`
    : byUsage.map(i => `<tr>
        <td><div class="item-name">${esc(i.name)}</div><div class="item-sub">${esc(i.brand || '')}</div></td>
        <td>${badge('badge-gray', i.category)}</td>
        <td class="mono">${i.usage_days}</td>
        <td class="mono">${i.usage_nights || '—'}</td>
        <td>${badge(COND_BADGE[i.condition] || 'badge-gray', COND_LABEL[i.condition] || i.condition)}</td>
      </tr>`).join('');
}

// ============================================================
// TEMPLATES
// ============================================================
let activeTemplateId = null;

// ── Helpers ────────────────────────────────────────────────
function templateWeight(tmpl) {
  return (tmpl.gear_ids || []).reduce((s, id) => {
    const item = state.items.find(i => i.id === id);
    return s + (item ? (item.weight_g || 0) : 0);
  }, 0);
}

function templateCategorySummary(tmpl) {
  const cats = {};
  (tmpl.gear_ids || []).forEach(id => {
    const item = state.items.find(i => i.id === id);
    if (item) cats[item.category] = (cats[item.category] || 0) + 1;
  });
  return cats;
}

// ── Render grid ────────────────────────────────────────────
function renderTemplates() {
  document.getElementById('templates-summary').textContent =
    `${state.templates.length} saved template${state.templates.length !== 1 ? 's' : ''} — apply any to a trip to replace or merge gear`;

  const grid = document.getElementById('templates-grid');
  if (!state.templates.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <p>No templates yet.<br>Create one from scratch, or open a trip and click "Save as template".</p>
      <button class="btn btn-primary" onclick="openTemplateForm()">+ New Template</button>
    </div>`;
  } else {
    grid.innerHTML = state.templates.map(t => templateCard(t)).join('');
  }

  if (activeTemplateId) {
    const still = state.templates.find(t => t.id === activeTemplateId);
    if (still) renderTemplateDetail(still);
    else closeTemplateDetail();
  }
}

function templateCard(tmpl) {
  const tw = templateWeight(tmpl);
  const cats = templateCategorySummary(tmpl);
  const catCount = Object.keys(cats).length;
  const sourceTrip = tmpl.created_from ? state.trips.find(t => t.id === tmpl.created_from) : null;

  return `<div class="template-card ${activeTemplateId === tmpl.id ? 'active' : ''}" onclick="openTemplateDetail('${tmpl.id}')">
    <div class="template-card-accent"></div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div class="template-card-name">${esc(tmpl.name)}</div>
      ${badge('badge-gray', tmpl.trip_type || 'backpacking')}
    </div>
    <div class="template-card-desc">${esc(tmpl.description || 'No description')}</div>
    <div class="template-card-stats">
      <span><strong>${(tmpl.gear_ids || []).length}</strong> items</span>
      <span><strong class="mono">${wg(tw)}</strong> total</span>
      <span><strong>${catCount}</strong> categories</span>
    </div>
    ${sourceTrip ? `<div style="font-size:11px;color:var(--text-3);margin-top:6px;padding-left:4px">Saved from: ${esc(sourceTrip.name)}</div>` : ''}
    <div class="template-card-actions" onclick="event.stopPropagation()">
      <button class="btn btn-sm btn-primary" onclick="openApplyTemplateFromLib('${tmpl.id}')">Apply to trip…</button>
      <button class="btn btn-sm" onclick="openTemplateForm('${tmpl.id}')">Edit</button>
      <button class="btn btn-sm btn-danger" onclick="deleteTemplate('${tmpl.id}')">Delete</button>
    </div>
  </div>`;
}

// ── Detail view ────────────────────────────────────────────
function openTemplateDetail(id) {
  activeTemplateId = id;
  const tmpl = state.templates.find(t => t.id === id);
  if (!tmpl) return;
  renderTemplates();
  renderTemplateDetail(tmpl);
  setTimeout(() => document.getElementById('template-detail-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
}

function closeTemplateDetail() {
  activeTemplateId = null;
  document.getElementById('template-detail-wrap').style.display = 'none';
  renderTemplates();
}

function renderTemplateDetail(tmpl) {
  const wrap = document.getElementById('template-detail-wrap');
  wrap.style.display = 'block';

  const tw = templateWeight(tmpl);
  const cats = templateCategorySummary(tmpl);
  const validIds = (tmpl.gear_ids || []).filter(id => state.items.find(i => i.id === id));
  const missing  = (tmpl.gear_ids || []).length - validIds.length;

  // Category pill bar
  const catPills = Object.entries(cats).map(([cat, count]) =>
    `<span class="cat-pill">
      <span class="cat-pill-dot" style="background:${categoryColor(cat)}"></span>
      ${esc(cat)} <span style="color:var(--text-3)">(${count})</span>
    </span>`
  ).join('');

  // Gear grid grouped by category
  const byCat = {};
  validIds.forEach(id => {
    const item = state.items.find(i => i.id === id);
    if (!item) return;
    if (!byCat[item.category]) byCat[item.category] = [];
    byCat[item.category].push(item);
  });

  const gearHtml = Object.entries(byCat).map(([cat, items]) => `
    <div style="margin-bottom:1rem">
      <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:5px">${esc(cat)}</div>
      <div class="template-gear-grid">
        ${items.map(item => `
          <div class="template-gear-item">
            <span class="template-gear-dot" style="background:${categoryColor(item.category)}"></span>
            <div style="min-width:0">
              <div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(item.name)}</div>
              <div style="color:var(--text-3);font-size:11px">${wg(item.weight_g)}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>`).join('');

  document.getElementById('template-detail').innerHTML = `
    <div class="card-header" style="margin-bottom:.75rem">
      <div>
        <span class="card-title" style="font-size:17px;font-family:var(--font-disp)">${esc(tmpl.name)}</span>
        &nbsp;${badge('badge-gray', tmpl.trip_type || 'backpacking')}
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-sm btn-primary" onclick="openApplyTemplateFromLib('${tmpl.id}')">Apply to trip…</button>
        <button class="btn btn-sm" onclick="openTemplateForm('${tmpl.id}')">Edit</button>
        <button class="btn btn-sm btn-ghost" onclick="closeTemplateDetail()">Close ✕</button>
      </div>
    </div>

    ${tmpl.description ? `<p style="font-size:13px;color:var(--text-2);margin-bottom:1rem">${esc(tmpl.description)}</p>` : ''}

    <div style="display:flex;gap:20px;font-size:13px;margin-bottom:1rem">
      <span>Items: <strong>${validIds.length}</strong>${missing ? ` <span style="color:var(--danger);font-size:11px">(${missing} missing from closet)</span>` : ''}</span>
      <span>Total weight: <strong class="mono">${wg(tw)}</strong></span>
      <span>Categories: <strong>${Object.keys(cats).length}</strong></span>
      ${tmpl.created_at ? `<span style="color:var(--text-3)">Created: ${tmpl.created_at}</span>` : ''}
    </div>

    <div class="cat-pills" style="margin-bottom:1.25rem">${catPills}</div>

    ${gearHtml}`;
}

// ── Template form (create / edit) ──────────────────────────
function openTemplateForm(id) {
  const tmpl = id ? state.templates.find(t => t.id === id) : null;
  openModal(tmpl ? 'Edit template' : 'New template', templateFormHtml(tmpl));
}

function templateFormHtml(tmpl) {
  tmpl = tmpl || {};
  const selectedIds = new Set(tmpl.gear_ids || []);

  const byCat = {};
  state.items.forEach(item => {
    if (!byCat[item.category]) byCat[item.category] = [];
    byCat[item.category].push(item);
  });

  const gearPickerHtml = Object.entries(byCat).map(([cat, items]) => `
    <div style="margin-bottom:.875rem">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
        <span style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3)">${esc(cat)}</span>
        <button type="button" class="btn btn-xs" onclick="toggleCategoryInTemplate('${esc(cat)}')">Toggle all</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">
        ${items.map(item => `
          <label style="display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border:1px solid var(--border);border-radius:var(--r-md);font-size:12px;cursor:pointer;transition:all .12s;background:${selectedIds.has(item.id) ? 'var(--accent-l)' : 'var(--surface)'}">
            <input type="checkbox" value="${item.id}" ${selectedIds.has(item.id) ? 'checked' : ''}
              style="width:13px;height:13px;accent-color:var(--accent)"
              onchange="this.parentElement.style.background=this.checked?'var(--accent-l)':'var(--surface)';this.parentElement.style.borderColor=this.checked?'var(--accent)':'var(--border)'">
            <span>${esc(item.name)}</span>
            <span style="color:var(--text-3);font-size:10px">${wg(item.weight_g)}</span>
          </label>`).join('')}
      </div>
    </div>`).join('');

  return `
    <div class="form-grid">
      <div class="form-row"><label class="form-label">Template name *</label><input class="input input-full" id="tmf-name" value="${esc(tmpl.name || '')}" placeholder="e.g. 3-Season Ultralight Base"></div>
      <div class="form-row">
        <label class="form-label">Trip type</label>
        <select class="select input-full" id="tmf-type">
          <option value="backpacking" ${(!tmpl.trip_type||tmpl.trip_type==='backpacking')?'selected':''}>Backpacking</option>
          <option value="bikepacking" ${tmpl.trip_type==='bikepacking'?'selected':''}>Bikepacking</option>
          <option value="car_camping" ${tmpl.trip_type==='car_camping'?'selected':''}>Car camping</option>
          <option value="day_hike" ${tmpl.trip_type==='day_hike'?'selected':''}>Day hike</option>
          <option value="other" ${tmpl.trip_type==='other'?'selected':''}>Other</option>
        </select>
      </div>
    </div>
    <div class="form-row"><label class="form-label">Description</label>
      <input class="input input-full" id="tmf-desc" value="${esc(tmpl.description || '')}" placeholder="When would you use this kit?"></div>

    <div style="margin-bottom:.5rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
        <label class="form-label" style="margin:0">Gear items</label>
        <span id="tmf-count" style="font-size:12px;color:var(--text-3)"></span>
      </div>
      <div style="max-height:340px;overflow-y:auto;padding:.75rem;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-md)" id="tmf-picker" oninput="updateTemplateCount()">
        ${gearPickerHtml}
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-primary" onclick="saveTemplate('${tmpl.id || ''}')">Save template</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`;
}

function toggleCategoryInTemplate(cat) {
  const boxes = document.querySelectorAll('#tmf-picker input[type=checkbox]');
  // Find if all items in this cat are checked
  const catBoxes = [...boxes].filter(cb => {
    const item = state.items.find(i => i.id === cb.value);
    return item && item.category === cat;
  });
  const allChecked = catBoxes.every(cb => cb.checked);
  catBoxes.forEach(cb => {
    cb.checked = !allChecked;
    cb.parentElement.style.background = cb.checked ? 'var(--accent-l)' : 'var(--surface)';
    cb.parentElement.style.borderColor = cb.checked ? 'var(--accent)' : 'var(--border)';
  });
  updateTemplateCount();
}

function updateTemplateCount() {
  const checked = document.querySelectorAll('#tmf-picker input[type=checkbox]:checked').length;
  const el = document.getElementById('tmf-count');
  if (el) el.textContent = `${checked} item${checked !== 1 ? 's' : ''} selected`;
}

function saveTemplate(id) {
  const name = document.getElementById('tmf-name').value.trim();
  if (!name) { alert('Template name is required.'); return; }

  const gearIds = [...document.querySelectorAll('#tmf-picker input[type=checkbox]:checked')].map(cb => cb.value);

  const data = {
    id: id || uid('tmpl'),
    name,
    description: document.getElementById('tmf-desc').value.trim(),
    trip_type:   document.getElementById('tmf-type').value,
    gear_ids:    gearIds,
    created_from: id ? (state.templates.find(t => t.id === id)?.created_from || null) : null,
    created_at:  id ? (state.templates.find(t => t.id === id)?.created_at || new Date().toISOString().slice(0,10)) : new Date().toISOString().slice(0,10),
  };

  if (id) {
    const idx = state.templates.findIndex(t => t.id === id);
    if (idx >= 0) state.templates[idx] = data;
  } else {
    state.templates.push(data);
  }

  saveState(); closeModal();
  activeTemplateId = data.id;
  if (currentTab === 'templates') renderTemplates();
  toast(id ? 'Template updated!' : 'Template created!');
}

function deleteTemplate(id) {
  if (!confirm('Delete this template?')) return;
  state.templates = state.templates.filter(t => t.id !== id);
  saveState();
  if (activeTemplateId === id) closeTemplateDetail();
  else renderTemplates();
  toast('Template deleted.');
}

// ── Save trip → template ────────────────────────────────────
function saveAsTemplate(tripId) {
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip) return;
  // Pre-fill a new template form using this trip's gear list
  const pseudo = {
    id: '',
    name: trip.name + ' kit',
    description: `Based on my ${trip.name} trip. ${trip.location ? trip.location + '. ' : ''}${trip.notes || ''}`.trim(),
    trip_type: trip.trip_type || 'backpacking',
    gear_ids: [...(trip.gear_ids || [])],
    created_from: trip.id,
  };
  openModal('Save trip as template', templateFormHtml(pseudo));
  // Override save to stamp created_from
  setTimeout(updateTemplateCount, 50);
}

// ── Apply template to a trip ───────────────────────────────
// Called from trip detail "Apply template" button
function openApplyTemplate(tripId) {
  if (!state.templates.length) {
    toast('No templates saved yet. Create one first.');
    return;
  }
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip) return;
  openModal('Apply template to trip', applyTemplatePicker(tripId, trip));
}

// Called from template card / detail "Apply to trip…" button
function openApplyTemplateFromLib(templateId) {
  if (!state.trips.length) {
    toast('No trips yet. Create a trip first.');
    return;
  }
  const tmpl = state.templates.find(t => t.id === templateId);
  if (!tmpl) return;
  openModal('Apply template to trip', applyTemplateTripPicker(templateId, tmpl));
}

function applyTemplatePicker(tripId, trip) {
  const options = state.templates.map(tmpl => {
    const tw = templateWeight(tmpl);
    return `<div class="apply-option" onclick="selectTemplateForApply(this,'${tmpl.id}')" data-tid="${tmpl.id}">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="apply-option-title">${esc(tmpl.name)}</div>
        <span class="mono" style="font-size:12px;color:var(--text-3)">${wg(tw)}</span>
      </div>
      <div class="apply-option-desc">${esc(tmpl.description || '')} &nbsp;· ${(tmpl.gear_ids||[]).length} items</div>
    </div>`;
  }).join('');

  return `
    <p style="font-size:13px;color:var(--text-2);margin-bottom:1rem">Choose a template to apply to <strong>${esc(trip.name)}</strong>:</p>
    <div id="template-picker-list" style="max-height:260px;overflow-y:auto;margin-bottom:1rem">${options}</div>
    <div id="apply-mode-row" style="display:none;margin-bottom:1rem">
      <p style="font-size:12px;color:var(--text-2);margin-bottom:.5rem;font-weight:500">How would you like to apply it?</p>
      <div class="apply-option" onclick="selectApplyMode(this,'replace')">
        <div class="apply-option-title">Replace gear list</div>
        <div class="apply-option-desc">Clear all current gear and load the template. Existing overrides are removed.</div>
      </div>
      <div class="apply-option" onclick="selectApplyMode(this,'merge')">
        <div class="apply-option-title">Merge with current gear</div>
        <div class="apply-option-desc">Add template items that aren't already in the trip. Existing gear is kept.</div>
      </div>
    </div>
    <div id="apply-preview" style="display:none;font-size:12px;color:var(--text-2);padding:.625rem .875rem;background:var(--surface-2);border-radius:var(--r-md);margin-bottom:1rem"></div>
    <div class="form-actions">
      <button class="btn btn-primary" id="btn-do-apply" style="display:none" onclick="doApplyTemplate('${tripId}')">Apply</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`;
}

function applyTemplateTripPicker(templateId, tmpl) {
  const options = state.trips.map(trip => {
    const tw = tripWeight(trip);
    return `<div class="apply-option" onclick="selectTripForApply(this,'${trip.id}')" data-tripid="${trip.id}">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="apply-option-title">${esc(trip.name)}</div>
        ${badge(STATUS_BADGE[trip.status]||'badge-gray', STATUS_LABEL[trip.status]||trip.status)}
      </div>
      <div class="apply-option-desc">${esc(trip.location||'')} · ${(trip.gear_ids||[]).length} items · ${wg(tw)}</div>
    </div>`;
  }).join('');

  return `
    <p style="font-size:13px;color:var(--text-2);margin-bottom:1rem">Apply <strong>${esc(tmpl.name)}</strong> to which trip?</p>
    <div id="trip-picker-list" style="max-height:220px;overflow-y:auto;margin-bottom:1rem">${options}</div>
    <div id="apply-mode-row2" style="display:none;margin-bottom:1rem">
      <p style="font-size:12px;color:var(--text-2);margin-bottom:.5rem;font-weight:500">How would you like to apply it?</p>
      <div class="apply-option" onclick="selectApplyMode2(this,'replace')">
        <div class="apply-option-title">Replace gear list</div>
        <div class="apply-option-desc">Clear all current gear and load the template.</div>
      </div>
      <div class="apply-option" onclick="selectApplyMode2(this,'merge')">
        <div class="apply-option-title">Merge with current gear</div>
        <div class="apply-option-desc">Add template items that aren't already in the trip.</div>
      </div>
    </div>
    <div id="apply-preview2" style="display:none;font-size:12px;color:var(--text-2);padding:.625rem .875rem;background:var(--surface-2);border-radius:var(--r-md);margin-bottom:1rem"></div>
    <div class="form-actions">
      <button class="btn btn-primary" id="btn-do-apply2" style="display:none" onclick="doApplyTemplateFromLib('${templateId}')">Apply</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`;
}

// Selection state for apply modals
let _applySelectedTemplate = null;
let _applySelectedTrip     = null;
let _applyMode             = null;

function selectTemplateForApply(el, templateId) {
  document.querySelectorAll('#template-picker-list .apply-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  _applySelectedTemplate = templateId;
  _applyMode = null;
  document.getElementById('apply-mode-row').style.display = 'block';
  document.querySelectorAll('#apply-mode-row .apply-option').forEach(o => o.classList.remove('selected'));
  document.getElementById('apply-preview').style.display = 'none';
  document.getElementById('btn-do-apply').style.display = 'none';
}

function selectApplyMode(el, mode) {
  document.querySelectorAll('#apply-mode-row .apply-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  _applyMode = mode;
  showApplyPreview('apply-preview', 'btn-do-apply');
}

function selectTripForApply(el, tripId) {
  document.querySelectorAll('#trip-picker-list .apply-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  _applySelectedTrip = tripId;
  _applyMode = null;
  document.getElementById('apply-mode-row2').style.display = 'block';
  document.querySelectorAll('#apply-mode-row2 .apply-option').forEach(o => o.classList.remove('selected'));
  document.getElementById('apply-preview2').style.display = 'none';
  document.getElementById('btn-do-apply2').style.display = 'none';
}

function selectApplyMode2(el, mode) {
  document.querySelectorAll('#apply-mode-row2 .apply-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  _applyMode = mode;
  showApplyPreview('apply-preview2', 'btn-do-apply2');
}

function showApplyPreview(previewId, btnId) {
  const tmplId  = _applySelectedTemplate || (document.getElementById('btn-do-apply') ? _applySelectedTemplate : null);
  const tripId  = _applySelectedTrip;
  const previewEl = document.getElementById(previewId);
  const btnEl   = document.getElementById(btnId);
  if (!previewEl || !btnEl) return;

  // Determine template and trip from context
  const tmpl = state.templates.find(t => t.id === (previewId === 'apply-preview' ? _applySelectedTemplate : tmplId));
  const trip = state.trips.find(t => t.id === (previewId === 'apply-preview2' ? _applySelectedTrip : _applySelectedTrip));
  if (!tmpl && !_applySelectedTemplate) return;

  const resolvedTmpl = tmpl || state.templates.find(t => t.id === _applySelectedTemplate);
  const resolvedTrip = trip;

  let newIds;
  if (_applyMode === 'replace') {
    newIds = [...(resolvedTmpl.gear_ids || [])];
  } else {
    const existing = new Set(resolvedTrip ? (resolvedTrip.gear_ids || []) : []);
    newIds = [...existing];
    (resolvedTmpl.gear_ids || []).forEach(id => { if (!existing.has(id)) newIds.push(id); });
  }

  const newW = newIds.reduce((s, id) => {
    const item = state.items.find(i => i.id === id);
    return s + (item ? item.weight_g || 0 : 0);
  }, 0);

  const currentCount = resolvedTrip ? (resolvedTrip.gear_ids || []).length : 0;
  const added = _applyMode === 'merge'
    ? newIds.length - currentCount
    : newIds.length - currentCount;

  previewEl.style.display = 'block';
  previewEl.innerHTML = _applyMode === 'replace'
    ? `Result: <strong>${newIds.length} items</strong>, <strong class="mono">${wg(newW)}</strong> total weight`
    : `Result: <strong>${newIds.length} items</strong> (+${Math.max(0, newIds.length - currentCount)} added), <strong class="mono">${wg(newW)}</strong> total weight`;

  btnEl.style.display = 'inline-flex';
}

function doApplyTemplate(tripId) {
  if (!_applySelectedTemplate || !_applyMode) return;
  const tmpl = state.templates.find(t => t.id === _applySelectedTemplate);
  const trip = state.trips.find(t => t.id === tripId);
  if (!tmpl || !trip) return;
  _doApply(trip, tmpl, _applyMode);
  closeModal();
  renderTripDetail(trip);
  renderTrips();
  toast(`Template "${tmpl.name}" applied!`);
}

function doApplyTemplateFromLib(templateId) {
  if (!_applySelectedTrip || !_applyMode) return;
  const tmpl = state.templates.find(t => t.id === templateId);
  const trip = state.trips.find(t => t.id === _applySelectedTrip);
  if (!tmpl || !trip) return;
  _doApply(trip, tmpl, _applyMode);
  closeModal();
  // Navigate to trip
  showTab('trips');
  activeTripId = trip.id;
  renderTrips();
  openTripDetail(trip.id);
  toast(`Template "${tmpl.name}" applied to ${trip.name}!`);
}

function _doApply(trip, tmpl, mode) {
  if (mode === 'replace') {
    trip.gear_ids = [...(tmpl.gear_ids || [])];
    trip.gear_overrides = {};
  } else {
    const existing = new Set(trip.gear_ids || []);
    (tmpl.gear_ids || []).forEach(id => existing.add(id));
    trip.gear_ids = [...existing];
  }
  _applySelectedTemplate = null;
  _applySelectedTrip     = null;
  _applyMode             = null;
  saveState();
}

// ============================================================
function refreshAll() {
  renderDashboard();
  if (currentTab !== 'dashboard') showTab(currentTab);
}

document.addEventListener('DOMContentLoaded', () => {
  loadState();

  // Nav
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab));
  });

  // Gear filters
  ['gear-search','gear-filter-cat','gear-filter-packed','gear-filter-cond','gear-sort'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => { if (currentTab === 'gear') renderGear(); });
    if (el) el.addEventListener('change', () => { if (currentTab === 'gear') renderGear(); });
  });

  // Wishlist filters
  ['wish-filter-cat','wish-sort'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => { if (currentTab === 'wishlist') renderWishlist(); });
  });

  // Templates
  document.getElementById('btn-add-template').addEventListener('click', () => openTemplateForm());

  // Initial render
  renderDashboard();

  // Set today's date
  document.getElementById('dash-date').textContent =
    new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
});
