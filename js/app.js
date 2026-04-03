// ============================================================
// Gearnomic — Application Logic
// ============================================================

// ── Supabase ────────────────────────────────────────────────
let _sb = null;           // Supabase client
let _user = null;         // current auth.User
let _syncTimer = null;    // debounce handle

function _supabaseReady() {
  if (_sb) return true;
  if (typeof supabase === 'undefined' || typeof SUPABASE_URL === 'undefined') return false;
  if (!SUPABASE_URL || SUPABASE_URL === 'YOUR_PROJECT_URL') return false;
  try { _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON); return true; }
  catch(e) { return false; }
}

// ── State ──────────────────────────────────────────────────
let state = { items: [], trips: [], wishlist: [], categories: [], templates: [], trip_types: [], food_plans: [], recipes: [], custom_fields: [] };

// ── Persistence ────────────────────────────────────────────
function saveState() {
  try { localStorage.setItem('trailkit_v1', JSON.stringify(state)); } catch(e) {}
  // Debounced cloud sync — fires 1.5s after last write
  if (_user) {
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(syncToCloud, 1500);
  }
}

async function syncToCloud() {
  if (!_supabaseReady() || !_user) return;
  setSyncIndicator('saving');
  try {
    const { error } = await _sb.from('user_data').upsert(
      { user_id: _user.id, data: state },
      { onConflict: 'user_id' }
    );
    if (error) throw error;
    setSyncIndicator('saved');
  } catch(e) {
    setSyncIndicator('error');
    console.error('Sync failed:', e);
  }
}

async function loadFromCloud() {
  if (!_supabaseReady() || !_user) return false;
  try {
    const { data, error } = await _sb.from('user_data')
      .select('data').eq('user_id', _user.id).single();
    if (error || !data?.data) return false;
    state = data.data;
    applyMigrations();
    try { localStorage.setItem('trailkit_v1', JSON.stringify(state)); } catch(e) {}
    return true;
  } catch(e) { return false; }
}

function applyMigrations() {
  if (!state.templates)    state.templates    = JSON.parse(JSON.stringify(SEED_DATA.templates));
  if (!state.trip_types)   state.trip_types   = JSON.parse(JSON.stringify(SEED_DATA.trip_types));
  if (!state.categories)   state.categories   = JSON.parse(JSON.stringify(SEED_DATA.categories));
  if (!state.food_plans)   state.food_plans   = [];
  if (!state.recipes)      state.recipes      = JSON.parse(JSON.stringify(SEED_DATA.recipes));
  if (!state.custom_fields) state.custom_fields = [];
  state.categories.forEach((cat, i) => {
    if (!cat.color) cat.color = SEED_DATA.categories[i]?.color || '#888';
  });
  state.trips.forEach(t => { if (!t.carry_types) t.carry_types = {}; });
  state.templates.forEach(t => { if (!t.carry_types) t.carry_types = {}; });
}

function loadState() {
  try {
    const raw = localStorage.getItem('trailkit_v1');
    if (raw) {
      state = JSON.parse(raw);
      applyMigrations();
      return;
    }
  } catch(e) {}
  state = {
    items:         JSON.parse(JSON.stringify(SEED_DATA.items)),
    trips:         JSON.parse(JSON.stringify(SEED_DATA.trips)),
    wishlist:      JSON.parse(JSON.stringify(SEED_DATA.wishlist)),
    categories:    JSON.parse(JSON.stringify(SEED_DATA.categories)),
    templates:     JSON.parse(JSON.stringify(SEED_DATA.templates)),
    trip_types:    JSON.parse(JSON.stringify(SEED_DATA.trip_types)),
    food_plans:    [],
    recipes:       JSON.parse(JSON.stringify(SEED_DATA.recipes)),
    custom_fields: [],
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
// Carry type lives on trips/templates, not on items
// Cycle order: packed (default) → worn → consumable → packed
const CARRY_CYCLE  = { packed: 'worn', worn: 'consumable', consumable: 'packed' };
const CARRY_LABEL  = { packed: 'packed', worn: 'W worn', consumable: 'C consumable' };
const CARRY_BADGE_CLASS = { packed: 'carry-packed', worn: 'carry-worn', consumable: 'carry-consumable' };

function getCarryType(container, itemId) {
  return (container.carry_types || {})[itemId] || 'packed';
}

function cycleCarryType(containerId, itemId, isTemplate) {
  const list = isTemplate ? state.templates : state.trips;
  const obj  = list.find(t => t.id === containerId);
  if (!obj) return;
  if (!obj.carry_types) obj.carry_types = {};
  const next = CARRY_CYCLE[obj.carry_types[itemId] || 'packed'];
  if (next === 'packed') delete obj.carry_types[itemId];
  else obj.carry_types[itemId] = next;
  saveState();
  if (isTemplate) renderTemplateDetail(state.templates.find(t => t.id === containerId));
  else renderTripDetail(state.trips.find(t => t.id === containerId));
}

function carryCell(containerId, itemId, isTemplate) {
  const ct = getCarryType(
    (isTemplate ? state.templates : state.trips).find(t => t.id === containerId) || {},
    itemId
  );
  const labels = { packed: '—', worn: 'Worn', consumable: 'Consumable' };
  const styles  = {
    packed:     'color:var(--text-3);font-size:11px',
    worn:       'display:inline-flex;align-items:center;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:500;background:var(--warning-bg);color:var(--warning-text)',
    consumable: 'display:inline-flex;align-items:center;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:500;background:var(--info-bg);color:var(--info-text)',
  };
  return `<td onclick="event.stopPropagation();cycleCarryType('${containerId}','${itemId}',${isTemplate})"
    title="Click to cycle: packed → worn → consumable"
    style="cursor:pointer;white-space:nowrap">
    <span style="${styles[ct]}">${labels[ct]}</span>
  </td>`;
}
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
  const cat = (state.categories || []).find(c => c.name === name);
  return cat ? cat.color : '#888';
}

function categoryTarget(name) {
  const cat = (state.categories || []).find(c => c.name === name);
  return cat ? cat.target_g : null;
}

function categoryNames() {
  const fromItems = [...new Set(state.items.map(i => i.category))];
  const fromCats  = (state.categories || []).map(c => c.name);
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
  const renders = { dashboard: renderDashboard, gear: renderGear, trips: renderTrips, templates: renderTemplates, wishlist: renderWishlist, food: renderFood, analytics: renderAnalytics };
  if (renders[name]) renders[name]();
}

// ============================================================
// TRIP TYPES  — dynamic, user-extensible
// ============================================================

function tripTypeOptions(selected) {
  const opts = state.trip_types.map(t =>
    `<option value="${esc(t.value)}" ${t.value === selected ? 'selected' : ''}>${esc(t.label)}</option>`
  ).join('');
  return opts + `<option value="__new__" style="color:var(--accent)">＋ Add new type…</option>`;
}

function handleTripTypeChange(prefix) {
  const sel = document.getElementById(prefix + '-type');
  const row = document.getElementById(prefix + '-new-type-row');
  if (!sel || !row) return;
  if (sel.value === '__new__') {
    row.style.display = 'flex';
    const input = document.getElementById(prefix + '-new-type-input');
    if (input) { input.value = ''; input.focus(); }
  } else {
    row.style.display = 'none';
  }
}

function confirmNewTripType(prefix) {
  const input = document.getElementById(prefix + '-new-type-input');
  const sel   = document.getElementById(prefix + '-type');
  if (!input || !sel) return;
  const label = input.value.trim();
  if (!label) { input.focus(); return; }
  const value = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  if (!value) { toast('Type name must contain letters or numbers.'); return; }
  if (state.trip_types.find(t =>
    t.value === value || t.label.toLowerCase() === label.toLowerCase()
  )) { toast('That trip type already exists.'); input.select(); return; }
  state.trip_types.push({ value, label, system: false });
  saveState();
  sel.innerHTML = tripTypeOptions(value);
  sel.value = value;
  document.getElementById(prefix + '-new-type-row').style.display = 'none';
  input.value = '';
  toast(`"${label}" added as a trip type!`);
}

function cancelNewTripType(prefix) {
  const sel = document.getElementById(prefix + '-type');
  const row = document.getElementById(prefix + '-new-type-row');
  if (sel) sel.value = state.trip_types.find(t => t.value !== '__new__')?.value || 'backpacking';
  if (row) row.style.display = 'none';
  const input = document.getElementById(prefix + '-new-type-input');
  if (input) input.value = '';
}

function newTripTypeKeydown(e, prefix) {
  if (e.key === 'Enter') { e.preventDefault(); confirmNewTripType(prefix); }
  if (e.key === 'Escape') cancelNewTripType(prefix);
}

function openManageTripTypes() {
  const custom = state.trip_types.filter(t => !t.system);
  const html = `
    <p style="font-size:13px;color:var(--text-2);margin-bottom:1rem">
      Built-in types can't be removed. Deleting a custom type won't affect trips already using it — they keep the stored value.
    </p>
    <div style="margin-bottom:1rem">
      <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.5rem">Built-in</div>
      ${state.trip_types.filter(t => t.system).map(t =>
        `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border-radius:var(--r-md);background:var(--surface-2);margin-bottom:4px;font-size:13px">
          <span>${esc(t.label)}</span>
          <span style="font-size:11px;color:var(--text-3);font-family:monospace">${esc(t.value)}</span>
        </div>`).join('')}
    </div>
    <div>
      <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.5rem">Custom</div>
      ${custom.length
        ? custom.map(t =>
            `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border-radius:var(--r-md);border:1px solid var(--border);margin-bottom:4px;font-size:13px">
              <span>${esc(t.label)}</span>
              <div style="display:flex;align-items:center;gap:10px">
                <span style="font-size:11px;color:var(--text-3);font-family:monospace">${esc(t.value)}</span>
                <button class="btn btn-xs btn-danger" onclick="deleteTripType('${esc(t.value)}')">Delete</button>
              </div>
            </div>`).join('')
        : `<div style="font-size:13px;color:var(--text-3);padding:8px 0">No custom types yet — add one from any trip or template form.</div>`
      }
    </div>
    <div class="form-actions"><button class="btn btn-ghost" onclick="closeModal()">Done</button></div>`;
  openModal('Manage trip types', html);
}

function deleteTripType(value) {
  const t = state.trip_types.find(t => t.value === value);
  if (!t || t.system) return;
  if (!confirm(`Delete trip type "${t.label}"?`)) return;
  state.trip_types = state.trip_types.filter(t => t.value !== value);
  saveState();
  openManageTripTypes();
  toast(`"${t.label}" deleted.`);
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

  const totalW   = state.items.reduce((s, i) => s + (i.weight_g || 0), 0);
  const totalCost= state.items.reduce((s, i) => s + (i.cost_usd || 0), 0);
  const upcoming = state.trips.filter(t => t.status === 'planning' || t.status === 'confirmed');

  document.getElementById('dash-metrics').innerHTML = `
    <div class="metric-card"><div class="metric-label">Total items</div><div class="metric-val">${state.items.length}</div><div class="metric-sub">${state.templates.length} saved templates</div></div>
    <div class="metric-card"><div class="metric-label">Total gear weight</div><div class="metric-val">${wg(totalW)}</div><div class="metric-sub">across all ${state.items.length} items</div></div>
    <div class="metric-card"><div class="metric-label">Tracked value</div><div class="metric-val">${usd(totalCost)}</div><div class="metric-sub">avg ${usd(totalCost / (state.items.filter(i => i.cost_usd > 0).length || 1))}/item</div></div>
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
let showMiscCol    = false;

function toggleMiscCol() {
  showMiscCol = !showMiscCol;
  const btn = document.getElementById('btn-toggle-misc');
  if (btn) {
    btn.textContent = showMiscCol ? 'Misc on' : 'Misc off';
    btn.classList.toggle('btn-primary', showMiscCol);
  }
  renderGear();
}

function renderGear() {
  populateCatFilter('gear-filter-cat');

  const q    = document.getElementById('gear-search').value.toLowerCase();
  const cat  = document.getElementById('gear-filter-cat').value;
  const cond = document.getElementById('gear-filter-cond').value;
  const sort = document.getElementById('gear-sort').value;

  let filtered = state.items.filter(i => {
    if (q && !`${i.name} ${i.brand || ''} ${i.model || ''}`.toLowerCase().includes(q)) return false;
    if (cat && i.category !== cat) return false;
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
  document.getElementById('gear-summary').innerHTML =
    `<strong>${filtered.length}</strong> items &nbsp;·&nbsp; total: <strong>${wg(totalW)}</strong> &nbsp;·&nbsp; tracked value: <strong>${usd(totalC)}</strong>`;

  const visibleCustomFields = (state.custom_fields || []).filter(f => f.show_column);
  const cols = 9 + (showMiscCol ? 1 : 0) + visibleCustomFields.length;

  // Render header dynamically so colspan stays correct
  document.getElementById('gear-thead').innerHTML = `<tr>
    <th style="width:28px;padding:6px 4px"></th>
    <th>Item</th><th>Category</th><th>Weight</th><th>Cost</th>
    <th>$/gram</th><th>Condition</th><th>Usage</th>
    ${showMiscCol ? '<th>Misc</th>' : ''}
    ${visibleCustomFields.map(f => `<th style="min-width:80px">${esc(f.name)}${f.unit ? '<span style="font-size:10px;color:var(--text-3);font-weight:400"> '+esc(f.unit)+'</span>' : ''}</th>`).join('')}
    <th></th>
  </tr>`;

  let html = '';
  let lastCat = null;
  const inCatSort = sort === 'category';

  filtered.forEach(item => {
    if (inCatSort && item.category !== lastCat) {
      lastCat = item.category;
      html += `<tr class="cat-header-row" data-cat="${esc(item.category)}">
        <td colspan="${cols}">${esc(item.category)}</td>
      </tr>`;
    }
    html += gearRow(item, cols, inCatSort, visibleCustomFields);
  });

  if (!filtered.length) {
    html = `<tr><td colspan="${cols}"><div class="empty-state"><p>No items match your filters.</p><button class="btn btn-sm" onclick="clearGearFilters()">Clear filters</button></div></td></tr>`;
  }

  document.getElementById('gear-tbody').innerHTML = html;
}

function gearRow(item, cols, inCatSort, visibleCustomFields) {
  visibleCustomFields = visibleCustomFields || [];
  const isExpanded = gearExpandedId === item.id;
  const customVals = item.custom_values || {};
  const allFields  = state.custom_fields || [];

  // Custom field cells (inline-editable)
  const customCells = visibleCustomFields.map(field => {
    const val = customVals[field.id];
    const isEditing = _editCell && _editCell.itemId === item.id && _editCell.fieldId === field.id;
    if (isEditing) {
      return `<td onclick="event.stopPropagation()" style="padding:4px 8px">
        <input class="input" id="ce-${item.id}-${field.id}"
          type="${field.type === 'number' ? 'number' : 'text'}"
          value="${esc(val != null ? val : '')}"
          style="width:80px;height:26px;font-size:12px;padding:0 6px"
          onblur="saveInlineEdit('${item.id}','${field.id}',this.value)"
          onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape'){cancelInlineEdit();renderGear();}">
      </td>`;
    }
    return `<td onclick="event.stopPropagation();startInlineEdit('${item.id}','${field.id}')"
      style="cursor:text;font-size:12px;color:${val!=null?'var(--text-1)':'var(--text-3)'}"
      title="Click to edit ${esc(field.name)}">
      ${val != null ? esc(String(val)) : '—'}
    </td>`;
  }).join('');

  // Custom fields in the expanded detail panel
  const customFieldsSection = `
    <div style="margin-bottom:10px">
      <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:6px">Custom fields</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        ${allFields.map(f => {
          const v = customVals[f.id];
          return `<div style="display:inline-flex;align-items:center;gap:4px;border:.5px solid var(--border);border-radius:var(--r-md);padding:3px 8px;background:var(--surface)">
            <span style="font-size:11px;color:var(--text-3)">${esc(f.name)}${f.unit?' ('+esc(f.unit)+')':''}</span>
            <input type="${f.type==='number'?'number':'text'}"
              value="${esc(v!=null?v:'')}"
              placeholder="—"
              style="width:60px;height:22px;font-size:12px;border:none;background:transparent;outline:none;color:var(--text-1);padding:0 2px"
              onchange="updateCustomValue('${item.id}','${f.id}',this.value)"
              onclick="event.stopPropagation()">
          </div>`;
        }).join('')}
        <button class="btn btn-xs" onclick="event.stopPropagation();openAddCustomField('${item.id}')">+ Add field</button>
      </div>
    </div>`;

  const detailHtml = isExpanded ? `
    <tr class="detail-row" id="det-${item.id}">
      <td colspan="${cols}">
        <div class="detail-inner">
          <div class="info-grid">
            ${item.model            ? `<div class="info-pair"><div class="info-key">Model</div><div class="info-val">${esc(item.model)}</div></div>` : ''}
            ${item.misc_stat        ? `<div class="info-pair"><div class="info-key">Misc</div><div class="info-val">${esc(item.misc_stat)}</div></div>` : ''}
            ${item.purchase_date    ? `<div class="info-pair"><div class="info-key">Purchased</div><div class="info-val">${item.purchase_date}</div></div>` : ''}
            ${item.purchase_retailer? `<div class="info-pair"><div class="info-key">Retailer</div><div class="info-val">${esc(item.purchase_retailer)}</div></div>` : ''}
          </div>
          ${customFieldsSection}
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

  const miscCell = showMiscCol
    ? `<td style="font-size:12px;color:var(--text-2);max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(item.misc_stat || '')}">${esc(item.misc_stat || '—')}</td>`
    : '';

  const handleCell = inCatSort
    ? `<td class="gear-handle-cell" onclick="event.stopPropagation();openCategoryPickerMobile('${item.id}')" title="Drag to move category · Tap to pick on mobile">
        <span class="gear-handle">⠿</span>
       </td>`
    : `<td style="width:28px"></td>`;

  return `<tr class="expandable"
    draggable="${inCatSort}"
    data-item-id="${item.id}"
    data-item-cat="${esc(item.category)}"
    ondragstart="onItemDragStart(event,'${item.id}')"
    ondragend="onItemDragEnd()"
    ondragover="onRowDragOver(event,'${esc(item.category)}')"
    ondragleave="onRowDragLeave(event)"
    ondrop="onRowDrop(event)"
    onclick="toggleExpand('${item.id}')">
    ${handleCell}

    ${editableCell(item, 'name',
        `<div class="item-name">${esc(item.name)}</div><div class="item-sub">${esc(item.brand || '')}</div>`,
        cellInput(item.id, 'name', item.name, 'text', 'placeholder="Item name"'))}

    ${editableCell(item, 'category',
        badge('badge-gray', item.category),
        cellSelect(item.id, 'category', item.category,
          categoryNames().map(c => [c, c])))}

    ${editableCell(item, 'weight_g',
        `<span class="mono">${wg(item.weight_g)}</span><br><span style="font-size:10px;color:var(--text-3)">${woz(item.weight_g)}</span>`,
        cellInput(item.id, 'weight_g', item.weight_g || '', 'number', 'min="0" step="0.1" placeholder="grams"'))}

    ${editableCell(item, 'cost_usd',
        usd(item.cost_usd),
        cellInput(item.id, 'cost_usd', item.cost_usd || '', 'number', 'min="0" step="0.01" placeholder="0.00"'))}

    <td class="mono" style="color:var(--text-3);font-size:12px">${dpg(item.cost_usd, item.weight_g)}</td>

    ${editableCell(item, 'condition',
        badge(COND_BADGE[item.condition] || 'badge-gray', COND_LABEL[item.condition] || item.condition),
        cellSelect(item.id, 'condition', item.condition,
          [['excellent','Excellent'],['good','Good'],['fair','Fair'],['poor','Poor']]))}

    <td onclick="event.stopPropagation()" class="editable-cell" style="white-space:nowrap;font-size:11px">
      <span onclick="startCellEdit(event,'${item.id}','usage_days')" title="Click to edit days">
        ${isEditing(item.id, 'usage_days')
          ? cellInput(item.id, 'usage_days', item.usage_days || 0, 'number', 'min="0" style="width:44px"')
          : `<span style="color:var(--text-2)">${item.usage_days || 0}d</span>`}
      </span>
      ${item.usage_nights != null ? ` · <span onclick="startCellEdit(event,'${item.id}','usage_nights')" title="Click to edit nights">
        ${isEditing(item.id, 'usage_nights')
          ? cellInput(item.id, 'usage_nights', item.usage_nights || 0, 'number', 'min="0" style="width:44px"')
          : `<span style="color:var(--text-3)">${item.usage_nights}n</span>`}
      </span>` : ''}
    </td>

    ${showMiscCol ? editableCell(item, 'misc_stat',
        `<span style="font-size:12px;color:var(--text-2);max-width:120px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(item.misc_stat || '')}">${esc(item.misc_stat || '—')}</span>`,
        cellInput(item.id, 'misc_stat', item.misc_stat || '', 'text', 'placeholder="notes, specs…"')) : ''}

    ${customCells}

    <td onclick="event.stopPropagation()">
      <button class="btn-icon" title="Edit all fields" onclick="openEditItem('${item.id}')">✎</button>
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
        <label class="form-label" style="display:flex;justify-content:space-between;align-items:center">
          Category
          <button type="button" class="btn btn-xs btn-ghost" style="font-size:11px" onclick="openManageCategoriesFromForm()">Manage</button>
        </label>
        <select class="select input-full" id="f-cat">${catOptions(item.category || 'Pack')}</select>
      </div>
      <div class="form-row"><label class="form-label">Weight (grams)</label><input class="input input-full" id="f-weight" type="number" min="0" step="0.1" value="${item.weight_g || ''}"></div>
      <div class="form-row"><label class="form-label">Cost (USD)</label><input class="input input-full" id="f-cost" type="number" min="0" step="0.01" value="${item.cost_usd || ''}"></div>
      <div class="form-row">
        <label class="form-label">Condition</label>
        <select class="select input-full" id="f-cond">
          <option value="excellent" ${item.condition === 'excellent' ? 'selected' : ''}>Excellent</option>
          <option value="good" ${(!item.condition || item.condition === 'good') ? 'selected' : ''}>Good</option>
          <option value="fair" ${item.condition === 'fair' ? 'selected' : ''}>Fair</option>
          <option value="poor" ${item.condition === 'poor' ? 'selected' : ''}>Poor</option>
        </select>
      </div>
      <div class="form-row"><label class="form-label">Purchase date</label><input class="input input-full" id="f-date" type="date" value="${item.purchase_date || ''}"></div>
      <div class="form-row"><label class="form-label">Retailer</label><input class="input input-full" id="f-retailer" value="${esc(item.purchase_retailer || '')}" placeholder="e.g. REI, Amazon"></div>
    </div>
    <div class="form-row"><label class="form-label">Product URL</label><input class="input input-full" id="f-url" value="${esc(item.product_url || '')}" placeholder="https://"></div>
    <div class="form-row">
      <label class="form-label">Misc <span style="font-size:10px;font-weight:400;color:var(--text-3);text-transform:none;letter-spacing:0">(shown in optional Misc column on Gear Closet)</span></label>
      <input class="input input-full" id="f-misc" value="${esc(item.misc_stat || '')}" placeholder="e.g. R-value 4.5 · 400 lumens · internal frame · 40L">
    </div>
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
    carry_type:       undefined,   // carry type now lives on trip/template, not the item
    condition:        document.getElementById('f-cond').value,
    misc_stat:        document.getElementById('f-misc').value.trim() || null,
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

  // Handle wishlist → gear closet conversion
  if (!id && window._convertFromWishId) {
    const wid = window._convertFromWishId;
    window._convertFromWishId = null;
    setTimeout(() => {
      if (confirm('Item added to Gear Closet! Remove it from your wishlist?')) {
        state.wishlist = state.wishlist.filter(w => w.id !== wid);
        saveState();
        if (currentTab === 'wishlist') renderWishlist();
      }
    }, 300);
  }
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
  if (!el) return;
  const current = el.value;
  while (el.options.length > 1) el.remove(1);
  categoryNames().forEach(c => {
    const o = document.createElement('option');
    o.value = c; o.textContent = c;
    el.appendChild(o);
  });
  if ([...el.options].some(o => o.value === current)) el.value = current;
}

// ============================================================
// TRIPS
// ============================================================
let activeTripId = null;

function renderTrips() {
  const planning   = state.trips.filter(t => t.status === 'planning');
  const confirmed  = state.trips.filter(t => t.status === 'confirmed');
  const past       = state.trips.filter(t => t.status === 'completed' || t.status === 'cancelled');

  document.getElementById('trips-summary').textContent =
    `${state.trips.length} trip${state.trips.length !== 1 ? 's' : ''} · ${planning.length} planning · ${confirmed.length} confirmed`;

  function section(label, trips) {
    if (!trips.length) return '';
    return `<div style="margin-bottom:1.5rem">
      <div class="section-divider">${label}</div>
      <div class="trips-grid">${trips.map(t => tripCard(t)).join('')}</div>
    </div>`;
  }

  const html = planning.length || confirmed.length || past.length
    ? section('Planning', planning) + section('Confirmed', confirmed) + section('Past trips', past)
    : `<div class="empty-state"><p>No trips yet. Plan your first adventure!</p><button class="btn btn-primary" onclick="document.getElementById('btn-add-trip').click()">+ New Trip</button></div>`;

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
      ${nights != null ? ` · <strong>${nights}</strong> night${nights !== 1 ? 's' : ''}` : ''}
      ${t.miles ? ` · <strong>${t.miles}</strong> mi` : ''}
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
  renderTrips(); // re-renders grid with active card highlighted
  renderTripDetail(trip);
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

  const tw    = tripWeight(trip);
  const wornW = (trip.gear_ids || []).reduce((s, id) => {
    const item = state.items.find(i => i.id === id);
    return s + (item && getCarryType(trip, id) === 'worn' ? (item.weight_g || 0) : 0);
  }, 0);
  const consW = (trip.gear_ids || []).reduce((s, id) => {
    const item = state.items.find(i => i.id === id);
    return s + (item && getCarryType(trip, id) === 'consumable' ? (item.weight_g || 0) : 0);
  }, 0);
  const baseW  = tw - wornW - consW;
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
      ${trip.miles ? `<div class="info-pair"><div class="info-key">Distance</div><div class="info-val">${trip.miles} mi${nights ? ` · ${(trip.miles / nights).toFixed(1)} mi/day` : ''}</div></div>` : ''}
    </div>

    ${trip.notes ? `<p style="font-size:13px;color:var(--text-2);margin-bottom:1rem;padding:.75rem;background:var(--surface-2);border-radius:var(--r-md)">${esc(trip.notes)}</p>` : ''}

    <div style="margin-bottom:1rem">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;flex-wrap:wrap;gap:8px">
        <span>
          Base: <strong class="mono">${wg(baseW)}</strong>
          &nbsp;·&nbsp; Worn: <strong class="mono">${wg(wornW)}</strong>
          ${consW ? `&nbsp;·&nbsp; Consumable: <strong class="mono">${wg(consW)}</strong>` : ''}
          &nbsp;·&nbsp; Total: <strong class="mono">${wg(tw)}</strong>
        </span>
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
        <thead><tr>
          <th style="width:28px;padding:6px 4px"></th>
          <th>Item</th><th>Weight</th><th>Carry</th><th>Cost</th>
        </tr></thead>
        <tbody>${catGroupedGearTable(trip.gear_ids||[], trip.id, false, 5) || '<tr><td colspan="5"><div class="empty-state">No gear added yet.</div></td></tr>'}</tbody>
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
        <label class="form-label" style="display:flex;align-items:center;justify-content:space-between">
          Type
          <button type="button" class="btn btn-xs btn-ghost" style="font-size:11px" onclick="openManageTripTypes()">Manage types</button>
        </label>
        <select class="select input-full" id="tf-type" onchange="handleTripTypeChange('tf')">
          ${tripTypeOptions(trip.trip_type || 'backpacking')}
        </select>
        <div id="tf-new-type-row" style="display:none;margin-top:6px;gap:6px;align-items:center">
          <input class="input" id="tf-new-type-input" placeholder="e.g. Ski touring, Trail running…"
            style="flex:1" onkeydown="newTripTypeKeydown(event,'tf')">
          <button type="button" class="btn btn-sm btn-primary" onclick="confirmNewTripType('tf')">Add</button>
          <button type="button" class="btn btn-sm" onclick="cancelNewTripType('tf')">Cancel</button>
        </div>
      </div>
      <div class="form-row"><label class="form-label">Weight target (grams)</label><input class="input input-full" id="tf-target" type="number" min="0" value="${trip.weight_target_g || ''}" placeholder="e.g. 10000"></div>
      <div class="form-row"><label class="form-label">Distance (miles)</label><input class="input input-full" id="tf-miles" type="number" min="0" step="0.1" value="${trip.miles || ''}" placeholder="e.g. 28.5"></div>
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
    trip_type:        document.getElementById('tf-type').value === '__new__' ? 'other' : document.getElementById('tf-type').value,
    weight_target_g:  parseInt(document.getElementById('tf-target').value) || null,
    miles:            parseFloat(document.getElementById('tf-miles').value) || null,
    notes:            document.getElementById('tf-notes').value.trim(),
    gear_ids:         id ? (state.trips.find(t => t.id === id)?.gear_ids || []) : [],
    gear_overrides:   id ? (state.trips.find(t => t.id === id)?.gear_overrides || {}) : {},
    carry_types:      id ? (state.trips.find(t => t.id === id)?.carry_types || {}) : {},
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
              <button class="btn btn-xs" style="border-color:var(--success);color:var(--success-text)" onclick="convertWishToGear('${w.id}')" title="Move to Gear Closet">→ Closet</button>
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

function convertWishToGear(id) {
  const w = state.wishlist.find(w => w.id === id);
  if (!w) return;
  // Map wishlist fields to gear item form, pre-fill category from item type name
  const catMatch = state.categories.find(c =>
    c.name.toLowerCase().includes(w.name.toLowerCase()) ||
    w.name.toLowerCase().includes(c.name.toLowerCase().split(' ')[0])
  );
  const prefilled = {
    id: '',
    name: [w.brand, w.model].filter(Boolean).join(' ') || w.name,
    brand:        w.brand  || '',
    model:        w.model  || '',
    category:     catMatch ? catMatch.name : (state.categories[0]?.name || 'Pack'),
    weight_g:     w.weight_g  || 0,
    cost_usd:     w.cost_usd  || 0,
    volume_liters: w.volume_liters || null,
    frame_type:   w.frame_type || null,
    product_url:  w.product_url || null,
    condition:    'excellent',
    usage_days:   0,
    usage_nights: 0,
    misc_stat:    null,
    notes:        w.notes || '',
    purchase_date: null,
    purchase_retailer: null,
  };
  // Store wishlist id to remove after successful save
  window._convertFromWishId = id;
  openModal('Add to Gear Closet', itemFormHtml(prefilled) +
    `<p style="font-size:11.5px;color:var(--text-3);margin-top:.5rem">
       Saving will add this to your Gear Closet. You can choose to keep or remove the wishlist entry afterwards.
    </p>`);
}

// Hook into saveItem to handle the post-conversion wishlist removal
// ============================================================
// ANALYTICS
// ============================================================
let chartWeight = null, chartCost = null;

function renderAnalytics() {
  const allW   = state.items.reduce((s, i) => s + (i.weight_g || 0), 0);
  const totalC = state.items.reduce((s, i) => s + (i.cost_usd || 0), 0);
  const itemCount = state.items.length;
  document.getElementById('analytics-metrics').innerHTML = `
    <div class="metric-card"><div class="metric-label">Total weight</div><div class="metric-val">${wg(allW)}</div><div class="metric-sub">${woz(allW)}</div></div>
    <div class="metric-card"><div class="metric-label">Tracked value</div><div class="metric-val">${usd(totalC)}</div><div class="metric-sub">avg ${usd(totalC / (state.items.filter(i=>i.cost_usd>0).length||1))}/item</div></div>
    <div class="metric-card"><div class="metric-label">Items in closet</div><div class="metric-val">${itemCount}</div><div class="metric-sub">${state.trips.length} trips logged</div></div>
    <div class="metric-card"><div class="metric-label">Missing cost data</div><div class="metric-val">${state.items.filter(i=>!i.cost_usd).length}</div><div class="metric-sub">items without a price</div></div>`;

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

  // Weight breakdown using per-template carry types
  const wornW = validIds.reduce((s, id) => {
    const item = state.items.find(i => i.id === id);
    return s + (item && getCarryType(tmpl, id) === 'worn' ? (item.weight_g || 0) : 0);
  }, 0);
  const consW = validIds.reduce((s, id) => {
    const item = state.items.find(i => i.id === id);
    return s + (item && getCarryType(tmpl, id) === 'consumable' ? (item.weight_g || 0) : 0);
  }, 0);
  const baseW = tw - wornW - consW;

  // Category pill bar
  const catPills = Object.entries(cats).map(([cat, count]) =>
    `<span class="cat-pill">
      <span class="cat-pill-dot" style="background:${categoryColor(cat)}"></span>
      ${esc(cat)} <span style="color:var(--text-3)">(${count})</span>
    </span>`
  ).join('');

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

    <div style="display:flex;gap:20px;font-size:13px;margin-bottom:1rem;flex-wrap:wrap">
      <span>Items: <strong>${validIds.length}</strong>${missing ? ` <span style="color:var(--danger);font-size:11px">(${missing} missing)</span>` : ''}</span>
      <span>Base: <strong class="mono">${wg(baseW)}</strong></span>
      ${wornW ? `<span>Worn: <strong class="mono">${wg(wornW)}</strong></span>` : ''}
      ${consW ? `<span>Consumable: <strong class="mono">${wg(consW)}</strong></span>` : ''}
      <span style="color:var(--text-3)">Total: <span class="mono">${wg(tw)}</span></span>
      ${tmpl.created_at ? `<span style="color:var(--text-3)">Created: ${tmpl.created_at}</span>` : ''}
    </div>

    <div class="cat-pills" style="margin-bottom:1.25rem">${catPills}</div>
    <p style="font-size:11px;color:var(--text-3);margin-bottom:.75rem">
      Drag ⠿ to move category · Tap ⠿ on mobile · Click carry badge to cycle: blank = packed ·
      <span style="background:var(--warning-bg);color:var(--warning-text);padding:1px 5px;border-radius:10px;font-weight:500">W</span> worn ·
      <span style="background:var(--info-bg);color:var(--info-text);padding:1px 5px;border-radius:10px;font-weight:500">C</span> consumable
    </p>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>
          <th style="width:28px;padding:6px 4px"></th>
          <th>Item</th><th>Weight</th><th>Carry</th><th>Cost</th>
        </tr></thead>
        <tbody>${catGroupedGearTable(validIds, tmpl.id, true, 5)}</tbody>
      </table>
    </div>`;
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
        <label class="form-label" style="display:flex;align-items:center;justify-content:space-between">
          Trip type
          <button type="button" class="btn btn-xs btn-ghost" style="font-size:11px" onclick="openManageTripTypes()">Manage types</button>
        </label>
        <select class="select input-full" id="tmf-type" onchange="handleTripTypeChange('tmf')">
          ${tripTypeOptions(tmpl.trip_type || 'backpacking')}
        </select>
        <div id="tmf-new-type-row" style="display:none;margin-top:6px;gap:6px;align-items:center">
          <input class="input" id="tmf-new-type-input" placeholder="e.g. Ski touring, Trail running…"
            style="flex:1" onkeydown="newTripTypeKeydown(event,'tmf')">
          <button type="button" class="btn btn-sm btn-primary" onclick="confirmNewTripType('tmf')">Add</button>
          <button type="button" class="btn btn-sm" onclick="cancelNewTripType('tmf')">Cancel</button>
        </div>
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
    </div>
    <input type="hidden" id="tmf-created-from" value="${esc(tmpl.created_from || '')}">
    <input type="hidden" id="tmf-original-date" value="${esc(tmpl.created_at || '')}">
    <input type="hidden" id="tmf-carry-types" value="${esc(JSON.stringify(tmpl.carry_types || {}))}">`;
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
  if (!gearIds.length) { alert('Please select at least one gear item.'); return; }

  // Read preserved fields from hidden inputs
  const createdFrom = (document.getElementById('tmf-created-from')?.value) || null;
  const originalDate = (document.getElementById('tmf-original-date')?.value) || null;
  let inheritedCarryTypes = {};
  try { inheritedCarryTypes = JSON.parse(document.getElementById('tmf-carry-types')?.value || '{}'); } catch(e) {}

  const isNew = !id;
  const existing = id ? state.templates.find(t => t.id === id) : null;

  const data = {
    id:           id || uid('tmpl'),
    name,
    description:  document.getElementById('tmf-desc').value.trim(),
    trip_type:    document.getElementById('tmf-type').value === '__new__' ? 'other' : document.getElementById('tmf-type').value,
    gear_ids:     gearIds,
    // Carry types: keep existing template's map, or inherit from trip when saving-as-template
    carry_types:  existing ? (existing.carry_types || {}) : inheritedCarryTypes,
    created_from: existing ? (existing.created_from || null) : (createdFrom || null),
    created_at:   existing ? (existing.created_at || new Date().toISOString().slice(0, 10))
                           : (originalDate || new Date().toISOString().slice(0, 10)),
  };

  if (existing) {
    const idx = state.templates.findIndex(t => t.id === id);
    if (idx >= 0) state.templates[idx] = data;
  } else {
    state.templates.push(data);
  }

  saveState();
  closeModal();
  activeTemplateId = data.id;
  // Always refresh templates grid so it's ready when user navigates there
  renderTemplates();
  toast(isNew ? 'Template created!' : 'Template updated!');
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
  const pseudo = {
    id: '',
    name: trip.name + ' kit',
    description: `Based on my ${trip.name} trip. ${trip.location ? trip.location + '. ' : ''}${trip.notes || ''}`.trim(),
    trip_type:    trip.trip_type || 'backpacking',
    gear_ids:     [...(trip.gear_ids || [])],
    carry_types:  { ...(trip.carry_types || {}) },
    created_from: trip.id,
  };
  openModal('Save trip as template', templateFormHtml(pseudo));
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
    trip.gear_ids     = [...(tmpl.gear_ids || [])];
    trip.gear_overrides = {};
    trip.carry_types  = { ...(tmpl.carry_types || {}) };
  } else {
    // Merge gear ids
    const existing = new Set(trip.gear_ids || []);
    (tmpl.gear_ids || []).forEach(id => existing.add(id));
    trip.gear_ids = [...existing];
    // Merge carry types: trip's existing types take priority over template's
    trip.carry_types = { ...(tmpl.carry_types || {}), ...(trip.carry_types || {}) };
  }
  _applySelectedTemplate = null;
  _applySelectedTrip     = null;
  _applyMode             = null;
  saveState();
}

// ============================================================
// DRAG & DROP — handle-initiated, section-aware, mobile-friendly
// ============================================================
let _dragItemId   = null;
let _dropTargetCat = null;

function onItemDragStart(e, itemId) {
  // Only allow drag when initiated from the handle cell
  if (!e.target.closest('.gear-handle-cell')) {
    e.preventDefault(); return;
  }
  _dragItemId = itemId;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', itemId);
  setTimeout(() => {
    document.querySelector(`tr[data-item-id="${itemId}"]`)?.classList.add('gear-row-dragging');
  }, 0);
}

function onItemDragEnd() {
  _dragItemId    = null;
  _dropTargetCat = null;
  document.querySelectorAll('.gear-row-dragging').forEach(r => r.classList.remove('gear-row-dragging'));
  document.querySelectorAll('.cat-section-highlight').forEach(r => r.classList.remove('cat-section-highlight'));
}

function onRowDragOver(e, itemCat) {
  if (!_dragItemId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (_dropTargetCat === itemCat) return; // already highlighted
  _dropTargetCat = itemCat;
  // Remove previous highlights
  document.querySelectorAll('.cat-section-highlight').forEach(r => r.classList.remove('cat-section-highlight'));
  // Highlight every row in this category section
  document.querySelectorAll(`tr[data-item-cat="${itemCat}"], tr[data-cat="${itemCat}"]`)
    .forEach(r => r.classList.add('cat-section-highlight'));
}

function onRowDragLeave(e) {
  // Clear highlights only when the pointer leaves all draggable rows entirely
  if (!e.relatedTarget || !e.relatedTarget.closest('[data-item-cat], [data-cat]')) {
    document.querySelectorAll('.cat-section-highlight').forEach(r => r.classList.remove('cat-section-highlight'));
    _dropTargetCat = null;
  }
}

function onRowDrop(e) {
  e.preventDefault();
  const itemId  = e.dataTransfer.getData('text/plain') || _dragItemId;
  const catName = _dropTargetCat || e.currentTarget.dataset.itemCat;
  document.querySelectorAll('.cat-section-highlight').forEach(r => r.classList.remove('cat-section-highlight'));
  if (!itemId || !catName) return;
  const item = state.items.find(i => i.id === itemId);
  if (!item || item.category === catName) return;
  item.category = catName;
  saveState();
  renderGear();
  toast(`Moved "${item.name}" → ${catName}`);
}

// Mobile: tap the handle to pick a category from a list
function openCategoryPickerMobile(itemId) {
  const item = state.items.find(i => i.id === itemId);
  if (!item) return;
  const cats = categoryNames();
  openModal(`Move to category`, `
    <p style="font-size:13px;color:var(--text-2);margin-bottom:.875rem">
      Moving: <strong>${esc(item.name)}</strong>
    </p>
    <div style="display:flex;flex-direction:column;gap:5px">
      ${cats.map(c => `
        <button class="btn ${c === item.category ? 'btn-primary' : ''}"
          style="justify-content:flex-start;gap:10px"
          onclick="moveToCat('${itemId}','${c.replace(/'/g,"\\'")}')">
          <span style="width:10px;height:10px;border-radius:50%;background:${categoryColor(c)};flex-shrink:0;display:inline-block"></span>
          ${esc(c)}
          ${c === item.category ? '<span style="margin-left:auto;font-size:11px;opacity:.7">current</span>' : ''}
        </button>`).join('')}
    </div>
    <div class="form-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button></div>`);
}

function moveToCat(itemId, catName) {
  const item = state.items.find(i => i.id === itemId);
  if (!item || item.category === catName) { closeModal(); return; }
  item.category = catName;
  saveState();
  closeModal();
  renderGear();
  toast(`Moved to ${catName}`);
}

function moveToCat(itemId, catName) {
  const item = state.items.find(i => i.id === itemId);
  if (!item || item.category === catName) { closeModal(); return; }
  item.category = catName;
  saveState();
  closeModal();
  // Re-render whatever context is currently open
  if (currentTab === 'gear') renderGear();
  else if (currentTab === 'trips' && activeTripId) renderTripDetail(state.trips.find(t => t.id === activeTripId));
  else if (currentTab === 'templates' && activeTemplateId) renderTemplateDetail(state.templates.find(t => t.id === activeTemplateId));
  else renderGear();
  toast(`Moved to ${catName}`);
}

// ── Shared category-grouped gear table ──────────────────────
// Renders tbody rows (with category headers) for a list of item ids.
// containerId / isTemplate are used only for carry type cycling.
// cols = total column count including the handle column.
function catGroupedGearTable(ids, containerId, isTemplate, cols) {
  const validIds = ids.filter(id => state.items.find(i => i.id === id));
  if (!validIds.length) return `<tr><td colspan="${cols}"><div class="empty-state">No gear added yet.</div></td></tr>`;

  // Group by category, preserving category order from state.categories
  const catOrder = categoryNames();
  const byCat = {};
  validIds.forEach(id => {
    const item = state.items.find(i => i.id === id);
    if (!item) return;
    if (!byCat[item.category]) byCat[item.category] = [];
    byCat[item.category].push({ item, id });
  });

  // Sort categories by global order, unknown cats go at end
  const sortedCats = Object.keys(byCat).sort((a, b) => {
    const ai = catOrder.indexOf(a), bi = catOrder.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1; if (bi === -1) return -1;
    return ai - bi;
  });

  return sortedCats.map(cat => {
    const entries = byCat[cat];
    const catHeader = `<tr class="cat-header-row" data-cat="${esc(cat)}">
      <td colspan="${cols}">${esc(cat)}</td>
    </tr>`;

    const rows = entries.map(({ item, id }) => {
      const ov = containerId && !isTemplate ? ((state.trips.find(t=>t.id===containerId)?.gear_overrides||{})[id]) : null;
      const effectiveW = ov != null ? ov : item.weight_g;
      const container  = isTemplate
        ? state.templates.find(t => t.id === containerId)
        : state.trips.find(t => t.id === containerId);

      return `<tr class="expandable"
        draggable="true"
        data-item-id="${item.id}"
        data-item-cat="${esc(item.category)}"
        ondragstart="onItemDragStart(event,'${item.id}')"
        ondragend="onItemDragEnd()"
        ondragover="onRowDragOver(event,'${esc(item.category)}')"
        ondragleave="onRowDragLeave(event)"
        ondrop="onRowDrop(event)">
        <td class="gear-handle-cell"
          onclick="event.stopPropagation();openCategoryPickerMobile('${item.id}')"
          title="Drag to move category · Tap on mobile">
          <span class="gear-handle">⠿</span>
        </td>
        <td><div class="item-name">${esc(item.name)}</div><div class="item-sub">${esc(item.brand||'')}</div></td>
        <td class="mono">${wg(effectiveW)}${ov!=null?` <span style="font-size:10px;color:var(--accent)">(override)</span>`:''}</td>
        ${container ? carryCell(containerId, id, isTemplate) : '<td></td>'}
        <td>${usd(item.cost_usd)}</td>
      </tr>`;
    }).join('');

    return catHeader + rows;
  }).join('');
}
const CAT_COLORS = [
  '#2A7048','#1A5C8A','#6B4E9E','#B87B0A','#8A4A2A',
  '#2A6A6A','#8A2A6A','#4A6A2A','#6A4A2A','#5A2A8A',
  '#C47B2A','#2A5A8A','#8A5A2A','#4A8A2A','#8A2A4A',
];

let _catDragIdx = null;

function openManageCategories() {
  const rows = state.categories.map((cat, idx) => `
    <div class="cat-mgmt-row" data-idx="${idx}"
      draggable="true"
      ondragstart="onCatMgmtDragStart(event,${idx})"
      ondragover="onCatMgmtDragOver(event,${idx})"
      ondragleave="onCatMgmtDragLeave(event,${idx})"
      ondrop="onCatMgmtDrop(event,${idx})"
      ondragend="onCatMgmtDragEnd()">
      <span class="cat-mgmt-handle" title="Drag to reorder">⠿</span>
      <span class="cat-color-dot" style="background:${cat.color}"
        onclick="openColorPicker(${idx})" title="Change color"></span>
      <span class="cat-mgmt-name" id="cat-lbl-${idx}"
        onclick="startRenameCategory(${idx})" title="Click to rename">${esc(cat.name)}</span>
      <input class="input cat-mgmt-target" id="cat-inp-${idx}" type="number" min="0" step="100"
        value="${cat.target_g || ''}" placeholder="Target g"
        title="Weight target in grams"
        onchange="updateCategoryTarget(${idx}, this.value)"
        onclick="event.stopPropagation()">
      <button class="btn btn-xs btn-danger" onclick="event.stopPropagation();deleteCategory('${esc(cat.name)}')" title="Delete">✕</button>
    </div>`).join('');

  const usedByItems = new Set(state.items.map(i => i.category));
  const itemCount = name => state.items.filter(i => i.category === name).length;

  openModal('Manage categories', `
    <p style="font-size:12.5px;color:var(--text-2);margin-bottom:.875rem">
      Drag ⠿ to reorder · Click a name to rename · Set a weight target per category
    </p>
    <div id="cat-mgmt-list">${rows}</div>
    <div style="margin-top:1rem;padding-top:.875rem;border-top:1px solid var(--border-2)">
      <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.5rem">Add new category</div>
      <div style="display:flex;gap:8px">
        <input class="input" id="new-cat-name" placeholder="Category name…" style="flex:1"
          onkeydown="if(event.key==='Enter')addCategory()">
        <button class="btn btn-sm btn-primary" onclick="addCategory()">Add</button>
      </div>
    </div>
    <div class="form-actions"><button class="btn btn-ghost" onclick="closeModal()">Done</button></div>
    <div id="color-picker-wrap" style="display:none;margin-top:.5rem;padding:.75rem;background:var(--surface-2);border-radius:var(--r-md);border:.5px solid var(--border)">
      <div style="font-size:11px;color:var(--text-3);margin-bottom:.5rem">Choose colour</div>
      <div class="color-swatches">${CAT_COLORS.map(c =>
        `<div class="color-swatch" style="background:${c}" data-color="${c}" onclick="pickColor(event,'${c}')"></div>`
      ).join('')}</div>
    </div>`);
}

// ── Category reorder drag ────────────────────────────────────
function onCatMgmtDragStart(e, idx) {
  _catDragIdx = idx;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(idx));
}
function onCatMgmtDragOver(e, idx) {
  e.preventDefault();
  if (_catDragIdx === null || _catDragIdx === idx) return;
  document.querySelectorAll('.cat-mgmt-row').forEach(r => r.classList.remove('cat-drag-over'));
  document.querySelector(`.cat-mgmt-row[data-idx="${idx}"]`)?.classList.add('cat-drag-over');
}
function onCatMgmtDragLeave(e, idx) {
  document.querySelector(`.cat-mgmt-row[data-idx="${idx}"]`)?.classList.remove('cat-drag-over');
}
function onCatMgmtDrop(e, toIdx) {
  e.preventDefault();
  document.querySelectorAll('.cat-drag-over').forEach(r => r.classList.remove('cat-drag-over'));
  if (_catDragIdx === null || _catDragIdx === toIdx) return;
  const moved = state.categories.splice(_catDragIdx, 1)[0];
  state.categories.splice(toIdx, 0, moved);
  _catDragIdx = null;
  saveState();
  openManageCategories();
  if (currentTab === 'gear') renderGear();
}
function onCatMgmtDragEnd() {
  _catDragIdx = null;
  document.querySelectorAll('.cat-drag-over').forEach(r => r.classList.remove('cat-drag-over'));
}

// ── Rename ──────────────────────────────────────────────────
function startRenameCategory(idx) {
  const lbl = document.getElementById(`cat-lbl-${idx}`);
  if (!lbl) return;
  const cat = state.categories[idx];
  const html = lbl.outerHTML;
  lbl.outerHTML = `<input class="input cat-mgmt-name" id="cat-lbl-${idx}"
    style="flex:1;height:28px;font-size:13px"
    value="${esc(cat.name)}"
    onblur="finishRenameCategory(${idx})"
    onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape'){this.value='${esc(cat.name)}';this.blur();}"
    onclick="event.stopPropagation()">`;
  setTimeout(() => { const el = document.getElementById(`cat-lbl-${idx}`); if (el) { el.focus(); el.select(); } }, 0);
}

function finishRenameCategory(idx) {
  const input = document.getElementById(`cat-lbl-${idx}`);
  if (!input || input.tagName !== 'INPUT') return;
  const newName = input.value.trim();
  const cat = state.categories[idx];
  if (!newName || newName === cat.name) { openManageCategories(); return; }
  if (state.categories.find((c, i) => i !== idx && c.name.toLowerCase() === newName.toLowerCase())) {
    toast('A category with that name already exists.');
    input.select(); return;
  }
  const oldName = cat.name;
  cat.name = newName;
  state.items.forEach(item => { if (item.category === oldName) item.category = newName; });
  saveState();
  openManageCategories();
  if (currentTab === 'gear') renderGear();
  toast(`Renamed to "${newName}"`);
}

// ── Add / delete ────────────────────────────────────────────
function addCategory() {
  const input = document.getElementById('new-cat-name');
  const name = input?.value.trim();
  if (!name) { input?.focus(); return; }
  if (state.categories.find(c => c.name.toLowerCase() === name.toLowerCase())) {
    toast('That category already exists.'); return;
  }
  const color = CAT_COLORS[state.categories.length % CAT_COLORS.length];
  state.categories.push({ name, target_g: null, color });
  saveState();
  openManageCategories();
  if (currentTab === 'gear') renderGear();
  toast(`"${name}" added!`);
}

function deleteCategory(name) {
  const count = state.items.filter(i => i.category === name).length;
  const msg = count
    ? `"${name}" is used by ${count} item${count !== 1 ? 's' : ''}. Delete the category anyway? Those items will keep their category label but won't appear in any category group until you reassign them.`
    : `Delete category "${name}"?`;
  if (!confirm(msg)) return;
  state.categories = state.categories.filter(c => c.name !== name);
  saveState();
  openManageCategories();
  if (currentTab === 'gear') renderGear();
  toast(`"${name}" deleted.`);
}

function updateCategoryTarget(idx, value) {
  const cat = state.categories[idx];
  if (cat) { cat.target_g = parseInt(value) || null; saveState(); }
}

// ── Colour picker ────────────────────────────────────────────
let _colorPickerIdx = null;
function openColorPicker(idx) {
  _colorPickerIdx = idx;
  const wrap = document.getElementById('color-picker-wrap');
  if (!wrap) return;
  const cat = state.categories[idx];
  wrap.style.display = 'block';
  wrap.querySelectorAll('.color-swatch').forEach(s => {
    s.classList.toggle('selected', s.dataset.color === cat.color);
  });
}
function pickColor(e, color) {
  e.stopPropagation();
  if (_colorPickerIdx === null) return;
  state.categories[_colorPickerIdx].color = color;
  saveState();
  openManageCategories();
  if (currentTab === 'gear') renderGear();
  if (currentTab === 'analytics') renderAnalytics();
}

// ── Also expose "Add category" from gear form ────────────────
function openManageCategoriesFromForm() {
  const prev = document.getElementById('f-cat')?.value;
  openManageCategories();
  // After closing, the form will rebuild its select from state
  window._pendingCatSelect = prev;
}

// ============================================================
// FOOD PLANNING
// ============================================================
const MEAL_TIMES  = ['breakfast','snack','lunch','dinner'];
const MEAL_LABELS = { breakfast:'Breakfast', snack:'Snack', lunch:'Lunch', dinner:'Dinner' };
const MEAL_ICONS  = { breakfast:'☀', snack:'🌿', lunch:'☁', dinner:'★' };
// Backpacking calorie targets per meal (summing to ~3000/day default)
const MEAL_CAL_GUIDE = { breakfast:650, snack:500, lunch:750, dinner:900 };

let activeFoodPlanId = null;
let foodView = 'plans'; // 'plans' | 'recipes'

function setFoodView(view) {
  foodView = view;
  document.getElementById('food-plans-view').style.display    = view === 'plans'   ? '' : 'none';
  document.getElementById('food-recipes-view').style.display  = view === 'recipes' ? '' : 'none';
  const btnPlan    = document.getElementById('btn-food-plan');
  const btnRecipes = document.getElementById('btn-food-recipes');
  if (btnPlan)    btnPlan.textContent    = view === 'plans' ? '+ New plan' : 'Meal plans';
  if (btnRecipes) btnRecipes.textContent = view === 'recipes' ? 'Meal plans' : 'Recipe library';
  if (btnPlan)    btnPlan.onclick    = view === 'plans' ? () => { setFoodView('plans'); openNewFoodPlan(); } : () => setFoodView('plans');
  if (btnRecipes) btnRecipes.onclick = view === 'recipes' ? () => setFoodView('plans') : () => setFoodView('recipes');
  if (view === 'recipes') renderRecipeLibrary();
  else renderFoodPlanGrid();
}

function renderFood() {
  setFoodView(foodView);
}

// ── Food plan grid ──────────────────────────────────────────
function renderFoodPlanGrid() {
  const grid = document.getElementById('food-plans-grid');
  if (!grid) return;
  if (!state.food_plans.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <p>No meal plans yet. Create one to start planning food for a trip.</p>
      <button class="btn btn-primary" onclick="openNewFoodPlan()">+ New plan</button>
    </div>`;
    return;
  }
  grid.innerHTML = state.food_plans.map(plan => {
    const trip    = plan.trip_id ? state.trips.find(t => t.id === plan.trip_id) : null;
    const meals   = plan.meals || [];
    const totalCal = meals.reduce((s, m) => s + (m.cal || 0), 0);
    const totalW   = meals.reduce((s, m) => s + (m.weight_g || 0), 0);
    const targetCal = plan.cal_target_per_day * plan.days;
    const pct = targetCal ? Math.round(totalCal / targetCal * 100) : 0;
    return `<div class="trip-card ${activeFoodPlanId === plan.id ? 'active' : ''}" onclick="openFoodPlan('${plan.id}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
        <div class="trip-card-name">${esc(plan.name)}</div>
        <span class="badge badge-gray">${plan.days}d</span>
      </div>
      <div class="trip-card-meta">${trip ? esc(trip.name) + ' · ' : ''}${plan.days} days · ${neededMealsSummary(plan)}</div>
      <div class="trip-card-stats">
        <span>${meals.length} items logged</span>
        <span class="mono" style="color:var(--${pct < 60 ? 'danger' : 'success'})">${totalCal.toLocaleString()} cal</span>
      </div>
      ${targetCal ? `<div class="prog-track"><div class="prog-fill ${pct < 60 ? 'prog-amber' : pct >= 100 ? 'prog-green' : 'prog-green'}" style="width:${Math.min(100,pct)}%"></div></div>
      <div style="font-size:10px;color:var(--text-3);margin-top:3px">${pct}% of ${(targetCal/1000).toFixed(1)}k cal target</div>` : ''}
    </div>`;
  }).join('');
  if (activeFoodPlanId) renderFoodPlanDetail(state.food_plans.find(p => p.id === activeFoodPlanId));
}

function neededMealsSummary(plan) {
  const d = plan.days, n = plan.nights ?? (plan.days - 1);
  return `${d}B · ${d}L · ${d}S · ${n}D`;
}

function openFoodPlan(id) {
  activeFoodPlanId = id;
  const plan = state.food_plans.find(p => p.id === id);
  if (!plan) return;
  renderFoodPlanGrid();
  renderFoodPlanDetail(plan);
  setTimeout(() => document.getElementById('food-plan-detail-wrap')?.scrollIntoView({ behavior:'smooth', block:'start' }), 80);
}

function closeFoodPlan() {
  activeFoodPlanId = null;
  document.getElementById('food-plan-detail-wrap').style.display = 'none';
  renderFoodPlanGrid();
}

function renderFoodPlanDetail(plan) {
  if (!plan) return;
  const wrap = document.getElementById('food-plan-detail-wrap');
  wrap.style.display = 'block';
  const trip  = plan.trip_id ? state.trips.find(t => t.id === plan.trip_id) : null;
  const meals = plan.meals || [];
  const nights = plan.nights ?? (plan.days - 1);

  // Totals
  const totalCal = meals.reduce((s, m) => s + (m.cal || 0), 0);
  const totalW   = meals.reduce((s, m) => s + (m.weight_g || 0), 0);
  const avgCalPD = plan.days ? Math.round(totalCal / plan.days) : 0;
  const avgWPD   = plan.days ? Math.round(totalW   / plan.days) : 0;
  const targetCal = plan.cal_target_per_day * plan.days;
  const targetW   = plan.weight_target_g_per_day * plan.days;

  // Guidance banner
  const guidance = `
    <div style="background:var(--surface-2);border:.5px solid var(--border);border-radius:var(--r-lg);padding:.875rem 1.25rem;margin-bottom:1rem;font-size:12.5px">
      <div style="font-weight:500;margin-bottom:.375rem">For this ${plan.days}-day/${nights}-night trip you need:</div>
      <div style="display:flex;gap:20px;flex-wrap:wrap;color:var(--text-2)">
        <span>${MEAL_ICONS.breakfast} <strong>${plan.days}</strong> breakfasts</span>
        <span>${MEAL_ICONS.snack} <strong>${plan.days}</strong> snack sets</span>
        <span>${MEAL_ICONS.lunch} <strong>${plan.days}</strong> lunches</span>
        <span>${MEAL_ICONS.dinner} <strong>${nights}</strong> dinners</span>
      </div>
      <div style="margin-top:.5rem;color:var(--text-3)">Target: ${plan.cal_target_per_day.toLocaleString()} cal/day · ${plan.weight_target_g_per_day}g (~${(plan.weight_target_g_per_day/453.6).toFixed(1)}lb) food/day</div>
    </div>`;

  // Summary metrics
  const calPct = targetCal ? Math.round(totalCal/targetCal*100) : 0;
  const wPct   = targetW   ? Math.round(totalW/targetW*100)     : 0;
  const metrics = `
    <div class="metrics-row" style="grid-template-columns:repeat(4,1fr);margin-bottom:1rem">
      <div class="metric-card"><div class="metric-label">Total calories</div><div class="metric-val">${totalCal.toLocaleString()}</div><div class="metric-sub">${calPct}% of ${(targetCal/1000).toFixed(1)}k target</div></div>
      <div class="metric-card"><div class="metric-label">Cal / day</div><div class="metric-val">${avgCalPD.toLocaleString()}</div><div class="metric-sub">target ${plan.cal_target_per_day.toLocaleString()}</div></div>
      <div class="metric-card"><div class="metric-label">Total food weight</div><div class="metric-val">${wg(totalW)}</div><div class="metric-sub">${wPct}% of ${wg(targetW)} target</div></div>
      <div class="metric-card"><div class="metric-label">Weight / day</div><div class="metric-val">${wg(avgWPD)}</div><div class="metric-sub">${(avgWPD/453.6).toFixed(1)} lb · target ${(plan.weight_target_g_per_day/453.6).toFixed(1)} lb</div></div>
    </div>`;

  // Day-by-day grid
  const days = Array.from({ length: plan.days }, (_, i) => i + 1);
  const dayHtml = days.map(day => {
    const mealTypes = day === plan.days
      ? ['breakfast','snack','lunch'] // last day: no dinner (usually)
      : MEAL_TIMES;
    const dayMeals  = meals.filter(m => m.day === day);
    const dayCal    = dayMeals.reduce((s,m) => s + (m.cal||0), 0);
    const dayW      = dayMeals.reduce((s,m) => s + (m.weight_g||0), 0);
    const slots = mealTypes.map(mt => {
      const slotMeals = dayMeals.filter(m => m.meal_time === mt);
      const slotCal   = slotMeals.reduce((s,m) => s + (m.cal||0), 0);
      const guideCal  = MEAL_CAL_GUIDE[mt];
      const ok = slotCal >= guideCal * 0.75;
      return `
        <div style="border:.5px solid var(--border);border-radius:var(--r-md);padding:.625rem .75rem;min-height:80px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.05em;color:var(--text-3)">${MEAL_ICONS[mt]} ${MEAL_LABELS[mt]}</span>
            <div style="display:flex;align-items:center;gap:5px">
              ${slotCal ? `<span class="mono" style="font-size:11px;color:var(--${ok?'success':'warning'})">${slotCal} cal</span>` : `<span style="font-size:10px;color:var(--text-3)">~${guideCal} cal needed</span>`}
              <button class="btn btn-xs" onclick="openAddMeal('${plan.id}',${day},'${mt}')" style="padding:2px 7px">+</button>
            </div>
          </div>
          ${slotMeals.map(m => `
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;padding:2px 0;border-top:.5px solid var(--border-2)">
              <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(m.name)}">${esc(m.name)}</span>
              <div style="display:flex;gap:8px;align-items:center;flex-shrink:0;margin-left:6px">
                <span class="mono" style="color:var(--text-3);font-size:11px">${wg(m.weight_g)}</span>
                <button class="btn btn-xs btn-danger" style="padding:1px 5px" onclick="deleteMealItem('${plan.id}','${m.id}')">✕</button>
              </div>
            </div>`).join('')}
        </div>`;
    }).join('');

    return `
      <div style="margin-bottom:.875rem">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.375rem">
          <span style="font-weight:500;font-size:13px">Day ${day}${day===1?' (trail start)':day===plan.days?' (last day)':''}</span>
          <span style="font-size:12px;color:var(--${dayCal >= plan.cal_target_per_day*0.8?'success':'warning'})">
            ${dayCal ? `${dayCal.toLocaleString()} cal · ${wg(dayW)}` : 'No meals logged yet'}
          </span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(${mealTypes.length},1fr);gap:6px">${slots}</div>
      </div>`;
  }).join('');

  document.getElementById('food-plan-detail').innerHTML = `
    <div class="card-header" style="margin-bottom:.75rem">
      <div>
        <span class="card-title" style="font-size:17px;font-family:var(--font-disp)">${esc(plan.name)}</span>
        ${trip ? `&nbsp;<span style="font-size:12px;color:var(--text-3)">· ${esc(trip.name)}</span>` : ''}
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-sm" onclick="openEditFoodPlan('${plan.id}')">Edit plan</button>
        <button class="btn btn-sm btn-danger" onclick="deleteFoodPlan('${plan.id}')">Delete</button>
        <button class="btn btn-sm btn-ghost" onclick="closeFoodPlan()">Close ✕</button>
      </div>
    </div>
    ${guidance}
    ${metrics}
    ${dayHtml}`;
}

// ── Food plan CRUD ──────────────────────────────────────────
function openNewFoodPlan() {
  setFoodView('plans');
  openModal('New meal plan', foodPlanFormHtml());
}

function openEditFoodPlan(id) {
  const plan = state.food_plans.find(p => p.id === id);
  if (!plan) return;
  openModal('Edit meal plan', foodPlanFormHtml(plan));
}

function foodPlanFormHtml(plan) {
  plan = plan || {};
  const tripOptions = state.trips.map(t =>
    `<option value="${t.id}" ${plan.trip_id === t.id ? 'selected' : ''}>${esc(t.name)}</option>`
  ).join('');
  return `
    <div class="form-grid">
      <div class="form-row"><label class="form-label">Plan name *</label>
        <input class="input input-full" id="fp-name" value="${esc(plan.name||'')}" placeholder="e.g. Lost Coast 3-Day Food"></div>
      <div class="form-row"><label class="form-label">Link to trip (optional)</label>
        <select class="select input-full" id="fp-trip">
          <option value="">— No trip —</option>${tripOptions}
        </select></div>
      <div class="form-row"><label class="form-label">Days out</label>
        <input class="input input-full" id="fp-days" type="number" min="1" max="30" value="${plan.days||3}">
        <div class="form-hint">Dinners = days − 1 (no dinner on last day)</div></div>
      <div class="form-row"><label class="form-label">Calorie target / day</label>
        <select class="select input-full" id="fp-cal">
          <option value="2500" ${plan.cal_target_per_day===2500?'selected':''}>2,500 — Easy/moderate day hikes</option>
          <option value="3000" ${(!plan.cal_target_per_day||plan.cal_target_per_day===3000)?'selected':''}>3,000 — Standard backpacking (default)</option>
          <option value="3500" ${plan.cal_target_per_day===3500?'selected':''}>3,500 — Big miles / elevation gain</option>
          <option value="4000" ${plan.cal_target_per_day===4000?'selected':''}>4,000 — Ultra-long days / cold weather</option>
        </select></div>
      <div class="form-row"><label class="form-label">Food weight target / day</label>
        <select class="select input-full" id="fp-wt">
          <option value="680" ${plan.weight_target_g_per_day===680?'selected':''}>680g (1.5 lb) — Ultralight</option>
          <option value="800" ${(!plan.weight_target_g_per_day||plan.weight_target_g_per_day===800)?'selected':''}>800g (1.75 lb) — Standard UL (default)</option>
          <option value="907" ${plan.weight_target_g_per_day===907?'selected':''}>907g (2.0 lb) — Traditional planning</option>
          <option value="1100" ${plan.weight_target_g_per_day===1100?'selected':''}>1,100g (2.4 lb) — Cold/hard trips</option>
        </select></div>
    </div>
    <div class="form-actions">
      <button class="btn btn-primary" onclick="saveFoodPlan('${plan.id||''}')">Save plan</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`;
}

function saveFoodPlan(id) {
  const name = document.getElementById('fp-name').value.trim();
  if (!name) { alert('Plan name is required.'); return; }
  const isNew = !id;
  const existing = id ? state.food_plans.find(p => p.id === id) : null;
  const days = parseInt(document.getElementById('fp-days').value) || 3;
  const data = {
    id:    id || uid('fp'),
    name,
    trip_id: document.getElementById('fp-trip').value || null,
    days,
    cal_target_per_day:    parseInt(document.getElementById('fp-cal').value) || 3000,
    weight_target_g_per_day: parseInt(document.getElementById('fp-wt').value) || 800,
    meals: existing ? existing.meals : [],
  };

  if (existing) {
    const idx = state.food_plans.findIndex(p => p.id === id);
    if (idx >= 0) state.food_plans[idx] = data;
  } else {
    state.food_plans.push(data);
  }
  saveState(); closeModal();
  activeFoodPlanId = data.id;
  renderFoodPlanGrid();
  openFoodPlan(data.id);
  toast(isNew ? 'Meal plan created!' : 'Plan updated!');
}

function deleteFoodPlan(id) {
  if (!confirm('Delete this meal plan?')) return;
  state.food_plans = state.food_plans.filter(p => p.id !== id);
  saveState(); closeFoodPlan();
  toast('Plan deleted.');
}

// ── Meal items ──────────────────────────────────────────────
function openAddMeal(planId, day, mealTime) {
  const plan = state.food_plans.find(p => p.id === planId);
  if (!plan) return;
  const guideCal = MEAL_CAL_GUIDE[mealTime];
  // Build recipe options for this meal time
  const recs = state.recipes.filter(r => !r.meal_time || r.meal_time === mealTime || r.meal_time === 'snack');
  const recOpts = recs.length
    ? `<div class="form-row"><label class="form-label">Quick-fill from recipe</label>
        <select class="select input-full" id="mi-recipe" onchange="fillFromRecipe()">
          <option value="">— type manually —</option>
          ${recs.map(r => `<option value="${r.id}" data-cal="${r.cal_per_serving}" data-w="${r.weight_g_per_serving}">${esc(r.name)} (${r.cal_per_serving} cal · ${r.weight_g_per_serving}g)</option>`).join('')}
        </select></div>` : '';

  openModal(`Add ${MEAL_LABELS[mealTime]} — Day ${day}`, `
    ${recOpts}
    <div class="form-row"><label class="form-label">Food / item name *</label>
      <input class="input input-full" id="mi-name" placeholder="e.g. Instant oats + protein powder"></div>
    <div class="form-grid">
      <div class="form-row"><label class="form-label">Calories</label>
        <input class="input input-full" id="mi-cal" type="number" min="0" placeholder="~${guideCal}"></div>
      <div class="form-row"><label class="form-label">Weight (grams)</label>
        <input class="input input-full" id="mi-wg" type="number" min="0" placeholder="grams"></div>
    </div>
    <div class="form-row"><label class="form-label">Notes</label>
      <input class="input input-full" id="mi-notes" placeholder="brand, prep notes…"></div>
    <div class="form-actions">
      <button class="btn btn-primary" onclick="saveMealItem('${planId}',${day},'${mealTime}')">Add</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`);
}

function fillFromRecipe() {
  const sel = document.getElementById('mi-recipe');
  if (!sel || !sel.value) return;
  const rec = state.recipes.find(r => r.id === sel.value);
  if (!rec) return;
  const nameEl = document.getElementById('mi-name');
  const calEl  = document.getElementById('mi-cal');
  const wgEl   = document.getElementById('mi-wg');
  if (nameEl) nameEl.value = rec.name;
  if (calEl)  calEl.value  = rec.cal_per_serving;
  if (wgEl)   wgEl.value   = rec.weight_g_per_serving;
}

function saveMealItem(planId, day, mealTime) {
  const name = document.getElementById('mi-name').value.trim();
  if (!name) { alert('Food name required.'); return; }
  const plan = state.food_plans.find(p => p.id === planId);
  if (!plan) return;
  if (!plan.meals) plan.meals = [];
  const recipeEl = document.getElementById('mi-recipe');
  plan.meals.push({
    id:        uid('meal'),
    day,
    meal_time: mealTime,
    name,
    cal:       parseInt(document.getElementById('mi-cal').value) || 0,
    weight_g:  parseInt(document.getElementById('mi-wg').value)  || 0,
    notes:     document.getElementById('mi-notes').value.trim(),
    recipe_id: recipeEl?.value || null,
  });
  saveState(); closeModal();
  renderFoodPlanDetail(plan);
  toast('Added!');
}

function deleteMealItem(planId, mealId) {
  const plan = state.food_plans.find(p => p.id === planId);
  if (!plan) return;
  plan.meals = (plan.meals || []).filter(m => m.id !== mealId);
  saveState();
  renderFoodPlanDetail(plan);
}

// ── Recipe library ──────────────────────────────────────────
function renderRecipeLibrary() {
  const grid = document.getElementById('recipes-grid');
  if (!grid) return;
  if (!state.recipes.length) {
    grid.innerHTML = `<div class="empty-state"><p>No recipes yet.</p><button class="btn btn-primary" onclick="openRecipeForm()">+ Add recipe</button></div>`;
    return;
  }
  grid.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:.875rem">` +
    state.recipes.map(r => `
      <div class="card" style="margin-bottom:0">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:.5rem">
          <div>
            <div style="font-weight:500;font-size:14px">${esc(r.name)}</div>
            <div style="font-size:11px;color:var(--text-3);margin-top:2px">
              ${MEAL_ICONS[r.meal_time]||''} ${MEAL_LABELS[r.meal_time]||r.meal_time}
              ${r.source ? ` · ${esc(r.source)}` : ''}
            </div>
          </div>
          <div style="display:flex;gap:5px">
            <button class="btn btn-xs" onclick="openRecipeForm('${r.id}')">✎</button>
            <button class="btn btn-xs btn-danger" onclick="deleteRecipe('${r.id}')">✕</button>
          </div>
        </div>
        <div style="display:flex;gap:16px;font-size:12.5px;margin-bottom:.625rem">
          <span><strong>${r.cal_per_serving}</strong> cal</span>
          <span><strong>${wg(r.weight_g_per_serving)}</strong></span>
          <span style="color:var(--text-3)">${(r.cal_per_serving/(r.weight_g_per_serving||1)).toFixed(1)} cal/g</span>
        </div>
        ${r.ingredients?.length ? `
          <div style="font-size:11.5px;color:var(--text-2);margin-bottom:.5rem">
            ${r.ingredients.map(i => `<span style="margin-right:8px">${esc(i.name)}</span>`).join('')}
          </div>` : ''}
        ${r.prep_notes ? `<div style="font-size:11.5px;color:var(--text-3);font-style:italic">${esc(r.prep_notes)}</div>` : ''}
      </div>`).join('') + '</div>';
}

function openRecipeForm(id) {
  const r = id ? state.recipes.find(r => r.id === id) : null;
  openModal(r ? 'Edit recipe' : 'New recipe', recipeFormHtml(r));
}

function recipeFormHtml(r) {
  r = r || {};
  return `
    <div class="form-grid">
      <div class="form-row"><label class="form-label">Recipe name *</label>
        <input class="input input-full" id="rf-name" value="${esc(r.name||'')}" placeholder="e.g. Skurka Beans & Rice"></div>
      <div class="form-row"><label class="form-label">Meal type</label>
        <select class="select input-full" id="rf-meal">
          ${MEAL_TIMES.map(mt => `<option value="${mt}" ${(r.meal_time||'dinner')===mt?'selected':''}>${MEAL_LABELS[mt]}</option>`).join('')}
        </select></div>
      <div class="form-row"><label class="form-label">Calories (per serving)</label>
        <input class="input input-full" id="rf-cal" type="number" min="0" value="${r.cal_per_serving||''}"></div>
      <div class="form-row"><label class="form-label">Weight g (per serving)</label>
        <input class="input input-full" id="rf-wg" type="number" min="0" value="${r.weight_g_per_serving||''}"></div>
    </div>
    <div class="form-row"><label class="form-label">Source / credit</label>
      <input class="input input-full" id="rf-src" value="${esc(r.source||'')}" placeholder="e.g. Andrew Skurka"></div>
    <div class="form-row"><label class="form-label">Prep notes</label>
      <textarea class="input input-full" id="rf-prep" rows="2" style="height:56px">${esc(r.prep_notes||'')}</textarea></div>
    <div class="form-actions">
      <button class="btn btn-primary" onclick="saveRecipe('${r.id||''}')">Save recipe</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`;
}

function saveRecipe(id) {
  const name = document.getElementById('rf-name').value.trim();
  if (!name) { alert('Recipe name required.'); return; }
  const existing = id ? state.recipes.find(r => r.id === id) : null;
  const data = {
    id:   id || uid('rec'),
    name,
    meal_time:          document.getElementById('rf-meal').value,
    cal_per_serving:    parseInt(document.getElementById('rf-cal').value) || 0,
    weight_g_per_serving: parseInt(document.getElementById('rf-wg').value) || 0,
    source:    document.getElementById('rf-src').value.trim(),
    prep_notes: document.getElementById('rf-prep').value.trim(),
    ingredients: existing?.ingredients || [],
  };
  if (existing) {
    const idx = state.recipes.findIndex(r => r.id === id);
    if (idx >= 0) state.recipes[idx] = data;
  } else {
    state.recipes.push(data);
  }
  saveState(); closeModal(); renderRecipeLibrary();
  toast(id ? 'Recipe updated!' : 'Recipe saved!');
}

function deleteRecipe(id) {
  if (!confirm('Delete this recipe?')) return;
  state.recipes = state.recipes.filter(r => r.id !== id);
  saveState(); renderRecipeLibrary();
  toast('Recipe deleted.');
}

// ============================================================
// CUSTOM FIELDS
// ============================================================
let _editCell = null; // { itemId, field } — shared for both built-in and custom fields

// ── Built-in cell editing helpers ──────────────────────────

function startCellEdit(e, itemId, field) {
  e.stopPropagation();
  _editCell = { itemId, field };
  renderGear();
  setTimeout(() => {
    const el = document.getElementById(`gc-${itemId}-${field}`);
    if (el) { el.focus(); if (el.select) el.select(); }
  }, 20);
}

function saveCellEdit(itemId, field, value) {
  const item = state.items.find(i => i.id === itemId);
  if (item) {
    if (field === 'weight_g')  item.weight_g  = parseFloat(value) || 0;
    else if (field === 'cost_usd') item.cost_usd = parseFloat(value) || 0;
    else if (field === 'name')     item.name     = value.trim() || item.name;
    else if (field === 'condition') item.condition = value;
    else if (field === 'category') { item.category = value; }
    else if (field === 'misc_stat') item.misc_stat = value.trim() || null;
    else if (field === 'usage_days')   item.usage_days   = parseInt(value) || 0;
    else if (field === 'usage_nights') item.usage_nights = parseInt(value) || 0;
    saveState();
  }
  _editCell = null;
  renderGear();
  if (currentTab === 'dashboard') renderDashboard();
}

function cancelCellEdit() { _editCell = null; }

function isEditing(itemId, field) {
  return _editCell && _editCell.itemId === itemId && _editCell.field === field;
}

// Render a built-in editable cell
function editableCell(item, field, displayHtml, inputHtml, stopClick) {
  if (isEditing(item.id, field)) {
    return `<td onclick="event.stopPropagation()" style="padding:3px 6px">${inputHtml}</td>`;
  }
  return `<td onclick="event.stopPropagation();startCellEdit(event,'${item.id}','${field}')"
    class="editable-cell" title="Click to edit">${displayHtml}</td>`;
}

// Input builders
function cellInput(itemId, field, value, type, extraAttrs) {
  return `<input id="gc-${itemId}-${field}"
    type="${type || 'text'}" value="${esc(String(value ?? ''))}"
    ${extraAttrs || ''}
    style="width:100%;min-width:60px;height:26px;font-size:12px;padding:0 5px;border:1.5px solid var(--primary);border-radius:4px;background:var(--surface);color:var(--text-1)"
    onblur="saveCellEdit('${itemId}','${field}',this.value)"
    onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape'){cancelCellEdit();renderGear();}">`;
}

function cellSelect(itemId, field, value, options) {
  const opts = options.map(([v, l]) =>
    `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`).join('');
  return `<select id="gc-${itemId}-${field}"
    style="height:26px;font-size:12px;padding:0 4px;border:1.5px solid var(--primary);border-radius:4px;background:var(--surface);color:var(--text-1)"
    onchange="saveCellEdit('${itemId}','${field}',this.value)"
    onblur="saveCellEdit('${itemId}','${field}',this.value)"
    onkeydown="if(event.key==='Escape'){cancelCellEdit();renderGear();}">${opts}</select>`;
}

// Inline edit for custom fields
function startInlineEdit(itemId, fieldId) {
  _editCell = { itemId, fieldId };
  renderGear();
  setTimeout(() => {
    const el = document.getElementById(`ce-${itemId}-${fieldId}`);
    if (el) { el.focus(); el.select(); }
  }, 30);
}

function cancelInlineEdit() { _editCell = null; }

function saveInlineEdit(itemId, fieldId, value) {
  const item = state.items.find(i => i.id === itemId);
  if (item) {
    if (!item.custom_values) item.custom_values = {};
    const field = (state.custom_fields || []).find(f => f.id === fieldId);
    const parsed = field?.type === 'number' ? (value === '' ? null : parseFloat(value)) : (value.trim() || null);
    if (parsed === null) delete item.custom_values[fieldId];
    else item.custom_values[fieldId] = parsed;
    saveState();
  }
  _editCell = null;
  renderGear();
}

function updateCustomValue(itemId, fieldId, value) {
  const item = state.items.find(i => i.id === itemId);
  if (!item) return;
  if (!item.custom_values) item.custom_values = {};
  const field = (state.custom_fields || []).find(f => f.id === fieldId);
  const parsed = field?.type === 'number' ? (value === '' ? null : parseFloat(value)) : (value.trim() || null);
  if (parsed === null) delete item.custom_values[fieldId];
  else item.custom_values[fieldId] = parsed;
  saveState();
}

// Column manager modal — toggle column visibility, add/delete fields
function openColumnManager() {
  const fields = state.custom_fields || [];
  const fieldRows = fields.length ? fields.map((f, idx) => `
    <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:.5px solid var(--border-2)">
      <label style="display:flex;align-items:center;gap:7px;flex:1;cursor:pointer">
        <input type="checkbox" ${f.show_column ? 'checked' : ''}
          style="width:15px;height:15px;accent-color:var(--primary)"
          onchange="toggleCustomColumn('${f.id}',this.checked)">
        <span style="font-size:13px;font-weight:500">${esc(f.name)}</span>
        ${f.unit ? `<span style="font-size:11px;color:var(--text-3)">${esc(f.unit)}</span>` : ''}
        <span class="badge badge-gray">${esc(f.type)}</span>
      </label>
      <button class="btn btn-xs btn-danger" onclick="deleteCustomField('${f.id}')">Delete</button>
    </div>`).join('') : `<p style="font-size:13px;color:var(--text-3);padding:.5rem 0">No custom fields yet. Add one below.</p>`;

  openModal('Columns & custom fields', `
    <p style="font-size:12.5px;color:var(--text-2);margin-bottom:.875rem">
      Check fields to show them as columns in the Gear Closet. Click any cell in a column to edit inline.
    </p>
    <div style="margin-bottom:1.25rem">${fieldRows}</div>
    <div style="border-top:.5px solid var(--border);padding-top:.875rem">
      <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.5rem">Add new field</div>
      <div class="form-grid">
        <div class="form-row"><label class="form-label">Field name</label>
          <input class="input input-full" id="cf-name" placeholder="e.g. R-value, Fill power, Nights slept"
            onkeydown="if(event.key==='Enter')addCustomField()"></div>
        <div class="form-row"><label class="form-label">Type</label>
          <select class="select input-full" id="cf-type">
            <option value="number">Number</option>
            <option value="text">Text</option>
          </select></div>
      </div>
      <div class="form-row"><label class="form-label">Unit (optional)</label>
        <input class="input" id="cf-unit" placeholder="e.g. °F, fps, nights, L" style="width:180px"></div>
    </div>
    <div class="form-actions">
      <button class="btn btn-primary" onclick="addCustomField()">Add field</button>
      <button class="btn btn-ghost" onclick="closeModal()">Done</button>
    </div>`);
}

function addCustomField() {
  const name = document.getElementById('cf-name')?.value.trim();
  if (!name) { document.getElementById('cf-name')?.focus(); return; }
  if ((state.custom_fields || []).find(f => f.name.toLowerCase() === name.toLowerCase())) {
    toast('A field with that name already exists.'); return;
  }
  const field = {
    id:          uid('cf'),
    name,
    type:        document.getElementById('cf-type')?.value || 'text',
    unit:        document.getElementById('cf-unit')?.value.trim() || '',
    show_column: true,
  };
  if (!state.custom_fields) state.custom_fields = [];
  state.custom_fields.push(field);
  saveState();
  openColumnManager(); // re-render modal
  renderGear();
  toast(`"${name}" field added!`);
}

function toggleCustomColumn(fieldId, show) {
  const field = (state.custom_fields || []).find(f => f.id === fieldId);
  if (field) { field.show_column = show; saveState(); renderGear(); }
}

function deleteCustomField(fieldId) {
  const field = (state.custom_fields || []).find(f => f.id === fieldId);
  if (!field) return;
  if (!confirm(`Delete "${field.name}"? Values stored on gear items will also be removed.`)) return;
  state.custom_fields = state.custom_fields.filter(f => f.id !== fieldId);
  // Remove values from all items
  state.items.forEach(item => { if (item.custom_values) delete item.custom_values[fieldId]; });
  saveState();
  openColumnManager();
  renderGear();
  toast(`"${field.name}" deleted.`);
}

// Add custom field from the gear detail panel
function openAddCustomField(itemId) {
  openModal('Add custom field', `
    <p style="font-size:12.5px;color:var(--text-2);margin-bottom:.875rem">
      Fields are shared across all gear items. You can set the value for this item now and fill in others later.
    </p>
    <div class="form-grid">
      <div class="form-row"><label class="form-label">Field name *</label>
        <input class="input input-full" id="ncf-name" placeholder="e.g. R-value, Fill power, Temp rating"></div>
      <div class="form-row"><label class="form-label">Type</label>
        <select class="select input-full" id="ncf-type">
          <option value="number">Number</option>
          <option value="text">Text</option>
        </select></div>
    </div>
    <div class="form-grid">
      <div class="form-row"><label class="form-label">Unit (optional)</label>
        <input class="input input-full" id="ncf-unit" placeholder="e.g. °F, fps, nights"></div>
      <div class="form-row"><label class="form-label">Value for this item</label>
        <input class="input input-full" id="ncf-val" placeholder="optional"></div>
    </div>
    <div class="form-row" style="display:flex;align-items:center;gap:8px">
      <input type="checkbox" id="ncf-show" checked style="width:15px;height:15px;accent-color:var(--primary)">
      <label for="ncf-show" style="font-size:13px;cursor:pointer">Show as column in Gear Closet</label>
    </div>
    <div class="form-actions">
      <button class="btn btn-primary" onclick="saveNewCustomField('${itemId}')">Add field</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`);
  setTimeout(() => document.getElementById('ncf-name')?.focus(), 100);
}

function saveNewCustomField(itemId) {
  const name = document.getElementById('ncf-name')?.value.trim();
  if (!name) { alert('Field name is required.'); return; }
  if ((state.custom_fields || []).find(f => f.name.toLowerCase() === name.toLowerCase())) {
    // Field exists — just set the value for this item
    const existing = state.custom_fields.find(f => f.name.toLowerCase() === name.toLowerCase());
    const rawVal = document.getElementById('ncf-val')?.value.trim();
    if (rawVal) updateCustomValue(itemId, existing.id, rawVal);
    closeModal(); gearExpandedId = itemId; renderGear();
    toast(`Value set for "${name}"!`);
    return;
  }
  const field = {
    id:          uid('cf'),
    name,
    type:        document.getElementById('ncf-type')?.value || 'number',
    unit:        document.getElementById('ncf-unit')?.value.trim() || '',
    show_column: document.getElementById('ncf-show')?.checked ?? true,
  };
  if (!state.custom_fields) state.custom_fields = [];
  state.custom_fields.push(field);

  const rawVal = document.getElementById('ncf-val')?.value.trim();
  if (rawVal) updateCustomValue(itemId, field.id, rawVal);

  saveState();
  closeModal();
  gearExpandedId = itemId; // keep this item expanded after re-render
  renderGear();
  toast(`"${name}" field added!`);
}

// ============================================================
// AUTHENTICATION & SYNC UI
// ============================================================

function setSyncIndicator(status) {
  const el = document.getElementById('sync-indicator');
  if (!el) return;
  const states = {
    saving: '↑ Saving…',
    saved:  '✓ Synced',
    error:  '⚠ Sync failed',
    offline:'○ Offline mode',
  };
  el.textContent = states[status] || '';
  el.style.color = status === 'error' ? 'var(--danger)' : status === 'saved' ? 'var(--success)' : 'var(--text-3)';
}

function updateHeaderAuth() {
  const userInfo   = document.getElementById('auth-user-info');
  const anonInfo   = document.getElementById('auth-anon-actions');
  const loadingEl  = document.getElementById('auth-loading-indicator');
  const emailEl    = document.getElementById('auth-user-email');
  if (loadingEl) loadingEl.style.display = 'none';
  if (_user) {
    if (userInfo) { userInfo.style.display = 'flex'; }
    if (anonInfo) { anonInfo.style.display = 'none'; }
    if (emailEl)  { emailEl.textContent = _user.email; }
    setSyncIndicator('saved');
  } else {
    if (userInfo) { userInfo.style.display = 'none'; }
    if (anonInfo) { anonInfo.style.display = 'flex'; }
    setSyncIndicator('offline');
  }
}

function showAuthModal() {
  const el = document.getElementById('auth-modal-overlay');
  if (el) { el.style.display = 'flex'; }
  setTimeout(() => document.getElementById('auth-email')?.focus(), 100);
}

function hideAuthModal() {
  const el = document.getElementById('auth-modal-overlay');
  if (el) { el.style.display = 'none'; }
}

function switchAuthTab(tab) {
  const isSignin = tab === 'signin';
  const signinTab = document.getElementById('auth-tab-signin');
  const signupTab = document.getElementById('auth-tab-signup');
  const btn = document.getElementById('auth-submit-btn');
  if (signinTab) {
    signinTab.style.borderBottomColor = isSignin ? '#2A4032' : 'transparent';
    signinTab.style.color = isSignin ? '#2A4032' : '#888';
    signinTab.style.fontWeight = isSignin ? '500' : '400';
  }
  if (signupTab) {
    signupTab.style.borderBottomColor = !isSignin ? '#2A4032' : 'transparent';
    signupTab.style.color = !isSignin ? '#2A4032' : '#888';
    signupTab.style.fontWeight = !isSignin ? '500' : '400';
  }
  if (btn) btn.textContent = isSignin ? 'Sign in' : 'Create account';
  const errEl = document.getElementById('auth-error');
  if (errEl) errEl.style.display = 'none';
  document.getElementById('auth-email')?.focus();
}

function setAuthError(msg) {
  const el = document.getElementById('auth-error');
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

async function submitAuth() {
  const btn = document.getElementById('auth-submit-btn');
  const isSignup = btn?.textContent?.includes('Create');
  const email    = document.getElementById('auth-email')?.value.trim();
  const password = document.getElementById('auth-password')?.value;
  setAuthError('');

  if (!email || !password) { setAuthError('Please enter your email and password.'); return; }
  if (!_supabaseReady()) { setAuthError('Supabase not configured — see js/config.js.'); return; }

  if (btn) { btn.textContent = isSignup ? 'Creating account…' : 'Signing in…'; btn.disabled = true; }

  try {
    const { data, error } = isSignup
      ? await _sb.auth.signUp({ email, password })
      : await _sb.auth.signInWithPassword({ email, password });

    if (error) throw error;

    if (isSignup && data?.user && !data.session) {
      setAuthError('');
      if (btn) { btn.textContent = 'Create account'; btn.disabled = false; }
      toast('Check your email to confirm your account!');
      return;
    }
    // Auth state change listener handles the rest
  } catch(e) {
    setAuthError(e.message || 'Authentication failed.');
    if (btn) { btn.textContent = isSignup ? 'Create account' : 'Sign in'; btn.disabled = false; }
  }
}

async function signOut() {
  if (_supabaseReady()) await _sb.auth.signOut();
  _user = null;
  updateHeaderAuth();
  toast('Signed out.');
}

async function continueWithoutAccount() {
  hideAuthModal();
  updateHeaderAuth();
}

// ============================================================
function refreshAll() {
  renderDashboard();
  if (currentTab !== 'dashboard') showTab(currentTab);
}

document.addEventListener('DOMContentLoaded', async () => {
  // Load local data first so UI appears instantly
  loadState();

  // Set up filter listeners
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab));
  });
  ['gear-search','gear-filter-cat','gear-filter-cond','gear-sort'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input',  () => { if (currentTab === 'gear') renderGear(); });
    if (el) el.addEventListener('change', () => { if (currentTab === 'gear') renderGear(); });
  });
  ['wish-filter-cat','wish-sort'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => { if (currentTab === 'wishlist') renderWishlist(); });
  });

  // Initial render with local data
  renderDashboard();
  document.getElementById('dash-date').textContent =
    new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // ── Supabase auth ─────────────────────────────────────────
  if (!_supabaseReady()) {
    // No Supabase config — run fully locally, show sign-in nudge
    document.getElementById('auth-loading-indicator').style.display = 'none';
    document.getElementById('auth-anon-actions').style.display = 'flex';
    setSyncIndicator('offline');
    return;
  }

  // Check for an existing session
  const { data: { session } } = await _sb.auth.getSession();
  if (session?.user) {
    _user = session.user;
    const loaded = await loadFromCloud();
    if (loaded) refreshAll();
    updateHeaderAuth();
  } else {
    updateHeaderAuth();
    showAuthModal();
  }

  // React to sign-in / sign-out events (handles email magic links, OAuth, etc.)
  _sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      _user = session.user;
      hideAuthModal();

      // If cloud has data, load it; otherwise push local data up
      const cloudLoaded = await loadFromCloud();
      if (!cloudLoaded) {
        // First login — upload existing local data
        await syncToCloud();
      }
      refreshAll();
      updateHeaderAuth();
      toast('Signed in! Your data is syncing.');
    } else if (event === 'SIGNED_OUT') {
      _user = null;
      updateHeaderAuth();
    }
  });
});
