// Gearnomic — Core: globals, utilities, navigation, dashboard, wishlist, settings, sharing, and boot
// ============================================================
// Gearnomic — Application Logic
// ============================================================

// ── Supabase ────────────────────────────────────────────────
let _sb = null;           // Supabase client
let _user = null;         // current auth.User
let _syncTimer = null;    // debounce handle
let _isSupporter    = false; // paid supporter status
let _isAmbassador   = false; // comped/influencer account
let _supporterSince = null;  // ISO date string, used for Founder badge
let _profile        = null;  // loaded Supabase profiles row
let _username       = null;  // shorthand for _profile?.username
let _unameCheckTimer = null; // debounce for username availability check

// Subscriber cutoff: anyone who paid before this date gets the Founder badge
const FOUNDER_CUTOFF = '2026-09-01';

// Returns badge metadata for the current user, or null for free accounts.
function userTierBadge() {
  if (_isAmbassador) return { label: 'Ambassador', bg: '#6a3db8', color: '#fff' };
  if (_isSupporter && _supporterSince && _supporterSince < FOUNDER_CUTOFF)
    return { label: 'Founder', bg: '#B87B0A', color: '#fff' };
  if (_isSupporter) return { label: 'Supporter', bg: 'var(--primary)', color: '#fff' };
  return null;
}
function tierBadgeHtml() {
  const b = userTierBadge();
  if (!b) return '';
  return `<span style="background:${b.bg};color:${b.color};font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;letter-spacing:.04em">${b.label.toUpperCase()}</span>`;
}
let _myKitId = null;      // ID of the auto-created "My Kit" loadout for new users this session


function _supabaseReady() {
  if (_sb) return true;
  if (typeof supabase === 'undefined' || typeof SUPABASE_URL === 'undefined') return false;
  if (!SUPABASE_URL || SUPABASE_URL === 'YOUR_PROJECT_URL') return false;
  try {
    _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      }
    });
    return true;
  }
  catch(e) { return false; }
}

// ── State ──────────────────────────────────────────────────
let state = { items: [], trips: [], wishlist: [], categories: [], templates: [], trip_types: [], food_plans: [], recipes: [], custom_fields: [] };


// ── ID generation ──────────────────────────────────────────
function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── Weight unit state ──────────────────────────────────────
let _units = 'metric'; // 'metric' | 'imperial'

function wg(g) {
  if (!g) return '—';
  if (_units === 'imperial') {
    const oz = g / 28.3495;
    return oz >= 16 ? `${(oz / 16).toFixed(2)} lb` : `${oz.toFixed(1)} oz`;
  }
  return g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`;
}
function woz(g) {
  if (!g) return '';
  if (_units === 'imperial') {
    // Cross-unit: primary is imperial, secondary shows metric
    return g >= 1000 ? `${(g/1000).toFixed(2)} kg` : `${Math.round(g)} g`;
  }
  return `${(g / 28.3495).toFixed(1)} oz`;
}
function toggleUnits() {
  _units = _units === 'metric' ? 'imperial' : 'metric';
  syncUnitBtns();
  if (!state.profile) state.profile = {};
  state.profile.units = _units;
  saveState();
  refreshAll();
}

// Unit helpers for forms
function weightLabel() { return _units === 'imperial' ? 'Weight (oz)' : 'Weight (grams)'; }
function weightPlaceholder() { return _units === 'imperial' ? '0.0 oz' : '0 g'; }
function weightStep() { return _units === 'imperial' ? '0.01' : '0.1'; }
// Convert grams → display unit for pre-filling form fields
function gToDisplay(g) { return !g ? '' : _units === 'imperial' ? (g / 28.3495).toFixed(2) : g; }
// Convert display value → grams for storage
function displayToG(v) { return _units === 'imperial' ? (parseFloat(v) || 0) * 28.3495 : (parseFloat(v) || 0); }
const dpg = (c, w) => c && w ? `$${(c / w).toFixed(3)}` : '—';
const usd = v => v ? `$${Number(v).toFixed(2).replace(/\.00$/, '')}` : '—';
const pct = (a, b) => b ? Math.min(100, Math.round(a / b * 100)) : 0;
const esc     = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
// Only allow http/https URLs as href values — blocks javascript: and data: URI injection.
const safeHref = u => (typeof u === 'string' && /^https?:\/\//i.test(u.trim())) ? u.trim() : '#';

const COND_BADGE = {
  '':        'badge-gray',
  excellent: 'badge-green',
  good:      'badge-blue',
  fair:      'badge-amber',
  poor:      'badge-red'
};
const COND_LABEL = { '': '—', excellent: 'Excellent', good: 'Good', fair: 'Fair', poor: 'Poor' };
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
  const qtys = trip.item_quantities || {};
  return tripUniqueItems(trip).reduce((s, item) => {
    const qty = qtys[item.id] ?? 1;
    return s + (item.weight_g || 0) * qty;
  }, 0);
}

// Returns deduplicated item objects across all loadouts attached to a trip
function tripUniqueItems(trip) {
  const seen = new Set();
  const items = [];
  (trip.loadout_ids || []).forEach(lid => {
    const loadout = state.templates.find(t => t.id === lid);
    if (!loadout) return;
    (loadout.gear_ids || []).forEach(itemId => {
      if (!seen.has(itemId)) {
        seen.add(itemId);
        const item = state.items.find(i => i.id === itemId);
        if (item) items.push(item);
      }
    });
  });
  return items;
}

// Get per-trip quantity for an item (defaults to 1)
function tripItemQty(trip, itemId) {
  return (trip.item_quantities || {})[itemId] ?? 1;
}

// Set per-trip quantity for an item
function setTripItemQty(tripId, itemId, qty) {
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip) return;
  if (!trip.item_quantities) trip.item_quantities = {};
  const n = Math.max(0, parseInt(qty) || 1);
  if (n === 1) {
    delete trip.item_quantities[itemId]; // clean up — 1 is the default
  } else {
    trip.item_quantities[itemId] = n;
  }
  saveState();
  renderTripDetail(trip);
}

// Get carry type for an item across any attached loadout
function tripCarryType(trip, itemId) {
  for (const lid of (trip.loadout_ids || [])) {
    const loadout = state.templates.find(t => t.id === lid);
    if (loadout?.carry_types?.[itemId]) return loadout.carry_types[itemId];
  }
  return 'packed';
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
let currentTab = 'gear';

function showTab(name) {
  if (currentTab === 'gear' && name !== 'gear' && _bulkMode) {
    _bulkMode = false;
    _bulkSelected.clear();
  }
  if (typeof closeDrawers === 'function') closeDrawers();
  currentTab = name;
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
  // Sync mobile bottom nav
  document.querySelectorAll('.mob-tab[data-tab]').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  const renders = { dashboard: renderDashboard, gear: renderGear, trips: renderTrips, templates: renderTemplates, wishlist: renderWishlist, food: renderFood, analytics: renderAnalytics };
  if (renders[name]) renders[name]();
}

function openMobileMore() {
  document.getElementById('mobile-more-overlay').style.display = 'block';
  document.getElementById('mobile-more-drawer').style.display  = 'block';
}
function closeMobileMore() {
  document.getElementById('mobile-more-overlay').style.display = 'none';
  document.getElementById('mobile-more-drawer').style.display  = 'none';
}

function openMobileAccountMenu() {
  // On mobile, open a simple bottom sheet with account actions
  const isUser = !!_user;
  const html = isUser
    ? `<div style="padding:.5rem 0">
        <div style="font-size:12px;color:var(--text-3);padding:8px 0 12px;border-bottom:.5px solid var(--border-2);margin-bottom:8px">${esc(_user.email)}</div>
        <button class="mob-drawer-btn" style="width:100%;margin-bottom:6px" onclick="openSettings();closeModal()">Settings</button>
        <button class="mob-drawer-btn" style="width:100%;margin-bottom:6px" onclick="toggleUnits();closeModal()">Switch units (${_units === 'metric' ? 'metric → imperial' : 'imperial → metric'})</button>
        <button class="mob-drawer-btn" style="width:100%;margin-bottom:6px" onclick="exportData();closeModal()">↓ Export data</button>
        <button class="mob-drawer-btn" style="width:100%;color:var(--danger);margin-bottom:6px" onclick="signOut();closeModal()">→ Sign out</button>
      </div>
      <div class="form-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button></div>`
    : `<div style="padding:.5rem 0">
        <button class="mob-drawer-btn" style="width:100%;margin-bottom:8px" onclick="showAuthModal();closeModal()">Sign in / Create account</button>
        <button class="mob-drawer-btn" style="width:100%;margin-bottom:8px" onclick="toggleUnits();closeModal()">Switch units (${_units === 'metric' ? 'metric → imperial' : 'imperial → metric'})</button>
      </div>
      <div class="form-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button></div>`;
  openModal('Account', html);
}

// Keep mobile unit btn in sync
function syncUnitBtns() {
  const isMetric = _units === 'metric';
  const html = `<span style="opacity:${isMetric ? '1' : '.4'}">g</span><span style="opacity:.3;margin:0 3px">|</span><span style="opacity:${isMetric ? '.4' : '1'}">oz</span>`;
  const d = document.getElementById('unit-toggle-btn');
  const m = document.getElementById('unit-toggle-btn-mobile');
  if (d) d.innerHTML = html;
  if (m) m.innerHTML = html;
}

// ============================================================
// TRIP TYPES  — dynamic, user-extensible
// ============================================================

function tripTypeOptions(selected) {
  const opts = state.trip_types.map(t =>
    `<option value="${esc(t.value)}" ${t.value === selected ? 'selected' : ''}>${esc(t.label)}</option>`
  ).join('');
  return opts + `<option value="__new__" style="color:var(--accent)">＋ Add new type—</option>`;
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
  openModal('Manage trip types', `
    <p style="font-size:13px;color:var(--text-2);margin-bottom:1rem">
      Built-in types can't be removed. Delete a custom type to remove it (trips using it will be reassigned to "Other").
    </p>

    <!-- Built-in types -->
    <div style="margin-bottom:1rem">
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.5rem">Built-in</div>
      ${state.trip_types.filter(t => t.system).map(t =>
        `<div style="display:flex;align-items:center;padding:7px 10px;border-radius:var(--r-md);background:var(--surface-2);margin-bottom:4px;font-size:13px">
          <span>${esc(t.label)}</span>
        </div>`).join('')}
    </div>

    <!-- Custom types -->
    <div style="margin-bottom:1rem">
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.5rem">Custom</div>
      <div id="mtt-custom-list">
        ${custom.length
          ? custom.map(t =>
              `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border-radius:var(--r-md);border:1px solid var(--border);margin-bottom:4px;font-size:13px">
                <span>${esc(t.label)}</span>
                <button class="btn btn-xs btn-danger" onclick="deleteTripType('${esc(t.value)}')">Delete</button>
              </div>`).join('')
          : `<div style="font-size:13px;color:var(--text-3);padding:6px 0 8px">No custom types yet.</div>`
        }
      </div>
    </div>

    <!-- Add new type inline -->
    <div style="border-top:.5px solid var(--border-2);padding-top:.875rem">
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.5rem">Add a new type</div>
      <div style="display:flex;gap:6px;align-items:center">
        <input class="input" id="mtt-new-input" placeholder="e.g. Ski touring, Trail running…"
          style="flex:1" onkeydown="if(event.key==='Enter'){event.preventDefault();addTripTypeFromManager();}">
        <button class="btn btn-primary btn-sm" onclick="addTripTypeFromManager()">Add</button>
      </div>
      <div id="mtt-error" style="display:none;font-size:12px;color:var(--danger);margin-top:4px"></div>
    </div>

    <div class="form-actions"><button class="btn btn-ghost" onclick="closeModal()">Done</button></div>`);
  setTimeout(() => document.getElementById('mtt-new-input')?.focus(), 50);
}

function addTripTypeFromManager() {
  const input = document.getElementById('mtt-new-input');
  const errEl = document.getElementById('mtt-error');
  if (!input) return;
  const label = input.value.trim();
  if (!label) { input.focus(); return; }
  const value = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  if (!value) {
    if (errEl) { errEl.textContent = 'Name must contain letters or numbers.'; errEl.style.display = 'block'; }
    return;
  }
  if (state.trip_types.find(t => t.value === value || t.label.toLowerCase() === label.toLowerCase())) {
    if (errEl) { errEl.textContent = `"${label}" already exists.`; errEl.style.display = 'block'; }
    input.select();
    return;
  }
  state.trip_types.push({ value, label, system: false });
  saveState();
  input.value = '';
  if (errEl) errEl.style.display = 'none';
  toast(`"${label}" added!`);
  refreshTripTypesList();
  input.focus();
}

function deleteTripType(value) {
  const t = state.trip_types.find(t => t.value === value);
  if (!t || t.system) return;

  // Check how many trips use this type
  const tripsUsingType = state.trips.filter(trip => trip.trip_type === value);
  const count = tripsUsingType.length;

  if (count > 0) {
    // Warn user about affected trips
    openModal(`Delete "${t.label}"?`, `
      <p style="font-size:13px;color:var(--text-2);margin-bottom:1rem">
        <strong>${count}</strong> trip${count !== 1 ? 's' : ''} ${count !== 1 ? 'are' : 'is'} using this type.
      </p>
      <p style="font-size:13px;color:var(--text-2);margin-bottom:1.5rem">
        If you delete "${t.label}", these trips will be reassigned to "Other". This cannot be undone.
      </p>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="confirmDeleteTripType('${esc(value)}')">Delete and reassign</button>
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      </div>`);
  } else {
    // No trips using it, simple confirmation
    if (!confirm(`Delete trip type "${t.label}"?`)) return;
    state.trip_types = state.trip_types.filter(t => t.value !== value);
    saveState();
    toast(`"${t.label}" deleted.`);
    refreshTripTypesList();
  }
}

function confirmDeleteTripType(value) {
  const t = state.trip_types.find(t => t.value === value);
  if (!t) return;

  // Find "other" trip type (should be built-in)
  const otherType = state.trip_types.find(t => t.value === 'other');
  if (!otherType) {
    toast('Error: "other" trip type not found.');
    return;
  }

  // Reassign all trips using this type to "other"
  const tripsUsingType = state.trips.filter(trip => trip.trip_type === value);
  tripsUsingType.forEach(trip => { trip.trip_type = 'other'; });

  // Delete the type
  state.trip_types = state.trip_types.filter(t => t.value !== value);
  saveState();
  closeModal();
  toast(`"${t.label}" deleted. ${tripsUsingType.length} trip${tripsUsingType.length !== 1 ? 's' : ''} reassigned to Other.`);
  refreshTripTypesList();
}

function refreshTripTypesList() {
  // Refresh the custom types list in-place without closing the modal
  const listEl = document.getElementById('mtt-custom-list');
  if (listEl) {
    const custom = state.trip_types.filter(t => !t.system);
    listEl.innerHTML = custom.length
      ? custom.map(t =>
          `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border-radius:var(--r-md);border:1px solid var(--border);margin-bottom:4px;font-size:13px">
            <span>${esc(t.label)}</span>
            <button class="btn btn-xs btn-danger" onclick="deleteTripType('${esc(t.value)}')">Delete</button>
          </div>`).join('')
      : `<div style="font-size:13px;color:var(--text-3);padding:6px 0 8px">No custom types yet.</div>`;
  } else {
    openManageTripTypes(); // fallback if called from outside the modal
  }
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

  const totalW    = state.items.reduce((s, i) => s + (i.weight_g || 0), 0);
  const totalCost = state.items.reduce((s, i) => s + (i.cost_usd || 0), 0);
  const upcoming  = state.trips.filter(t => t.status === 'planning' || t.status === 'confirmed');
  const nextTrip  = upcoming.sort((a,b) => (a.start_date||'z').localeCompare(b.start_date||'z'))[0];
  const daysToNext = nextTrip?.start_date
    ? Math.ceil((new Date(nextTrip.start_date) - new Date()) / 86400000)
    : null;

  // Metrics — current snapshot
  document.getElementById('dash-metrics').innerHTML = `
    <div class="metric-card">
      <div class="metric-label">Items in closet</div>
      <div class="metric-val">${state.items.length}</div>
      <div class="metric-sub">${wg(totalW)} total weight</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Tracked value</div>
      <div class="metric-val">${usd(totalCost)}</div>
      <div class="metric-sub">${state.items.filter(i=>i.cost_usd>0).length} items with cost data</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Upcoming trips</div>
      <div class="metric-val">${upcoming.length}</div>
      <div class="metric-sub">${state.trips.filter(t=>t.status==='completed').length} completed</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Next trip in</div>
      <div class="metric-val">${daysToNext != null ? (daysToNext <= 0 ? 'Today!' : daysToNext + 'd') : '—'}</div>
      <div class="metric-sub">${nextTrip ? esc(nextTrip.name) : 'No upcoming trips'}</div>
    </div>`;

  // Upcoming trips list
  document.getElementById('dash-trips').innerHTML = !upcoming.length
    ? `<div class="empty-state"><p>No upcoming trips.</p><button class="btn btn-sm btn-primary" onclick="showTab('trips')">Plan a trip</button></div>`
    : upcoming.map(t => {
        const tw = tripWeight(t);
        const nights = t.start_date && t.end_date
          ? Math.round((new Date(t.end_date) - new Date(t.start_date)) / 86400000) : null;
        return `<div class="dash-trip-row" onclick="showTab('trips');openTripDetail('${t.id}')">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div class="dash-trip-name">${esc(t.name)}</div>
            ${badge(STATUS_BADGE[t.status] || 'badge-gray', STATUS_LABEL[t.status] || t.status)}
          </div>
          <div class="dash-trip-meta">
            ${esc(t.location || 'Location TBD')}${nights != null ? ` · ${nights} nights` : ''}${t.miles ? ` · ${t.miles} mi` : ''}
          </div>
          ${t.weight_target_g ? `${prog(tw, t.weight_target_g)}
            <div style="font-size:11px;color:var(--text-3);margin-top:3px">${wg(tw)} / ${wg(t.weight_target_g)} target</div>` : `
            <div style="font-size:12px;color:var(--text-3);margin-top:4px">${(t.loadout_ids||[]).length} loadout${(t.loadout_ids||[]).length!==1?'s':''} · ${wg(tw)}</div>`}
        </div>`;
      }).join('');

  // Next trip gear weight breakdown by category
  const nextEl     = document.getElementById('dash-next-trip');
  const nextNameEl = document.getElementById('dash-next-trip-name');
  const nextItems  = nextTrip ? tripUniqueItems(nextTrip) : [];
  if (!nextTrip || !nextItems.length) {
    if (nextNameEl) nextNameEl.textContent = '—';
    nextEl.innerHTML = `<div class="empty-state"><p>No loadouts attached to next trip yet.</p></div>`;
  } else {
    if (nextNameEl) nextNameEl.textContent = nextTrip.name;
    const cw = {};
    nextItems.forEach(item => {
      cw[item.category] = (cw[item.category] || 0) + (item.weight_g || 0);
    });
    const tw    = tripWeight(nextTrip);
    const wornW = nextItems.reduce((s, item) => {
      return s + (tripCarryType(nextTrip, item.id) === 'worn' ? (item.weight_g||0) : 0);
    }, 0);
    const sortedCW = Object.entries(cw).sort((a,b) => b[1]-a[1]);
    const maxCW = sortedCW[0]?.[1] || 1;
    nextEl.innerHTML = `
      <div style="font-size:12px;color:var(--text-3);margin-bottom:.75rem">
        Total: <strong class="mono">${wg(tw)}</strong>
        · Base: <strong class="mono">${wg(tw-wornW)}</strong>
        · Worn: <strong class="mono">${wg(wornW)}</strong>
      </div>
      ${sortedCW.map(([cat, w]) => `
        <div class="cat-bar-row">
          <span class="cat-bar-name">${esc(cat)}</span>
          <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${Math.round(w/maxCW*100)}%;background:${categoryColor(cat)}"></div></div>
          <span class="cat-bar-val">${wg(w)}</span>
        </div>`).join('')}`;
  }

  // Heaviest items
  const heavy = [...state.items].filter(i => i.weight_g > 0).sort((a,b) => b.weight_g - a.weight_g).slice(0, 8);
  document.getElementById('dash-heavy').innerHTML = !heavy.length
    ? `<tr><td colspan="5"><div class="empty-state">No gear yet.</div></td></tr>`
    : heavy.map(i => `<tr onclick="showTab('gear')" style="cursor:pointer">
        <td><div class="item-name">${esc(i.name)}</div><div class="item-sub">${esc(i.brand||'')}</div></td>
        <td>${badge('badge-gray', i.category)}</td>
        <td class="mono">${wg(i.weight_g)}<br><span style="font-size:10px;color:var(--text-3)">${woz(i.weight_g)}</span></td>
        <td>${usd(i.cost_usd)}</td>
        <td class="mono" style="color:var(--text-2)">${dpg(i.cost_usd, i.weight_g)}</td>
      </tr>`).join('');

  // Trip weight sparkline
  renderSparkline();
}

function renderSparkline() {
  const el   = document.getElementById('dash-sparkline');
  const card = document.getElementById('dash-sparkline-card');
  if (!el) return;

  const completed = [...state.trips]
    .filter(t => t.status === 'completed' && t.start_date)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  if (completed.length < 2) {
    if (card) card.style.display = 'none';
    return;
  }
  if (card) card.style.display = '';

  const weights = completed.map(t => {
    const items = tripUniqueItems(t);
    const worn  = items.reduce((s, i) => s + (tripCarryType(t, i.id) === 'worn' ? (i.weight_g||0) : 0), 0);
    return tripWeight(t) - worn; // base weight
  });

  const W = 480, H = 100, pad = { t: 12, r: 16, b: 28, l: 44 };
  const iW = W - pad.l - pad.r;
  const iH = H - pad.t - pad.b;
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const range = maxW - minW || 1;

  const pts = weights.map((w, i) => {
    const x = pad.l + (i / (weights.length - 1)) * iW;
    const y = pad.t + iH - ((w - minW) / range) * iH;
    return [x, y];
  });

  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const areaD = `${pathD} L${pts[pts.length-1][0].toFixed(1)},${(pad.t+iH).toFixed(1)} L${pad.l},${(pad.t+iH).toFixed(1)} Z`;

  // Y axis labels
  const yLabels = [minW, (minW+maxW)/2, maxW].map((w, i) => {
    const y = pad.t + iH - (i * iH / 2);
    return `<text x="${pad.l - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--text-3)">${wg(w)}</text>`;
  }).join('');

  // X axis labels (trip names, truncated)
  const xLabels = completed.map((t, i) => {
    if (completed.length > 6 && i % 2 !== 0) return '';
    const x = pad.l + (i / (weights.length - 1)) * iW;
    const name = t.name.length > 12 ? t.name.slice(0, 11) + '…' : t.name;
    return `<text x="${x.toFixed(1)}" y="${H - 4}" text-anchor="middle" font-size="9" fill="var(--text-3)">${esc(name)}</text>`;
  }).join('');

  // Dots with tooltips
  const dots = pts.map((p, i) => {
    const t = completed[i];
    const bw = weights[i];
    return `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4"
      fill="var(--primary)" stroke="#fff" stroke-width="2"
      style="cursor:pointer"
      onclick="showTab('trips');openTripDetail('${t.id}')"
      title="${esc(t.name)}: ${wg(bw)} base">
      <title>${esc(t.name)}: ${wg(bw)} base weight</title>
    </circle>`;
  }).join('');

  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;display:block;overflow:visible">
      <defs>
        <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="var(--primary)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${areaD}" fill="url(#spark-grad)"/>
      <path d="${pathD}" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linejoin="round"/>
      ${yLabels}
      ${xLabels}
      ${dots}
    </svg>`;
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
    ? `<tr><td colspan="8"><div class="empty-state">
        <p style="max-width:360px;margin:0 auto .875rem">${state.wishlist.length ? 'No items match your filters.' : 'Nothing on your wishlist. Add gear you\'re researching before committing to a purchase.'}</p>
        ${!state.wishlist.length
          ? `<button class="btn btn-primary" onclick="document.getElementById('btn-add-wish').click()">+ Add to wishlist</button>`
          : `<button class="btn btn-sm" onclick="document.getElementById('wish-filter-cat').value='';renderWishlist()">Clear filters</button>`}
      </div></td></tr>`
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
              ${w.product_url ? `<a href="${safeHref(w.product_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-xs">↗</a>` : ''}
              <button class="btn btn-xs" style="border-color:var(--success);color:var(--success-text)" onclick="convertWishToGear('${w.id}')" title="Move to Gear Closet">→ Closet</button>
              <button class="btn btn-xs" onclick="openEditWish('${w.id}')">Edit</button>
              <button class="btn btn-xs btn-danger" onclick="deleteWish('${w.id}')">Remove</button>
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
      <div class="form-row"><label class="form-label">${weightLabel()}</label><input class="input input-full" id="wf-weight" type="number" min="0" step="${weightStep()}" value="${gToDisplay(w.weight_g)}" placeholder="${weightPlaceholder()}"></div>
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
    weight_g:     displayToG(document.getElementById('wf-weight').value) || null,
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

// ============================================================
// USER SETTINGS & PROFILE
// ============================================================

// ── Stripe price IDs ──────────────────────────────────────────────────────
const STRIPE_MONTHLY_URL = 'https://buy.stripe.com/fZueVcbH45PVeVN1Dm0oM04';
const STRIPE_ANNUAL_URL  = 'https://buy.stripe.com/cNidR85iGbaf4h995O0oM05';

function openUpgradeModal(reason) {
  const reasonHtml = reason
    ? `<div style="background:var(--surface-2);border-left:3px solid var(--accent);border-radius:var(--r-md);padding:.625rem .875rem;margin-bottom:1.25rem;font-size:13px;color:var(--text-2)">${esc(reason)}</div>`
    : '';
  openModal('Become a Supporter', `
    ${reasonHtml}
    <div style="text-align:center;padding:.5rem 0 1rem">
      <div style="font-size:32px;margin-bottom:.5rem"></div>
      <p style="font-size:15px;font-weight:500;margin-bottom:.375rem">Unlock the full Gearnomic experience</p>
      <p style="font-size:13px;color:var(--text-2);margin-bottom:1.5rem;line-height:1.6">
        Supporters get unlimited meal plans, full analytics, unlimited gear &amp; trips, custom fields, and more.
      </p>
    </div>

    <!-- Plan cards — annual is the primary CTA -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:1.25rem">
      <div style="border:2px solid var(--primary);border-radius:var(--r-lg);padding:1rem;text-align:center;position:relative">
        <div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:var(--primary);color:#fff;font-size:10px;font-weight:600;padding:2px 10px;border-radius:99px;white-space:nowrap">RECOMMENDED</div>
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.375rem">Annual</div>
        <div style="font-size:26px;font-weight:600;font-family:var(--font-disp)">$12</div>
        <div style="font-size:12px;color:var(--text-3);margin-bottom:.875rem">per year — $1/mo</div>
        <a href="${STRIPE_ANNUAL_URL}?prefilled_email=${encodeURIComponent(_user?.email||'')}&client_reference_id=${encodeURIComponent(_user?.id||'')}"
          target="_blank" class="btn btn-primary btn-sm" style="display:block;text-align:center">
          Subscribe annually
        </a>
      </div>
      <div style="border:1.5px solid var(--border);border-radius:var(--r-lg);padding:1rem;text-align:center">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.375rem">Monthly</div>
        <div style="font-size:26px;font-weight:600;font-family:var(--font-disp)">$2</div>
        <div style="font-size:12px;color:var(--text-3);margin-bottom:.875rem">per month</div>
        <a href="${STRIPE_MONTHLY_URL}?prefilled_email=${encodeURIComponent(_user?.email||'')}&client_reference_id=${encodeURIComponent(_user?.id||'')}"
          target="_blank" class="btn btn-sm" style="display:block;text-align:center">
          Subscribe monthly
        </a>
      </div>
    </div>

    <!-- What you get -->
    <div style="background:var(--surface-2);border-radius:var(--r-md);padding:.875rem 1rem;margin-bottom:1rem">
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.5rem">What supporters get</div>
      ${[
        'Unlimited meal plans — attach to any trip',
        'Unlimited gear items, trips &amp; loadouts',
        'Full analytics — value, usage &amp; trip history',
        'Custom gear fields',
        'Automatic backup &amp; priority support',
      ].map(f => `<div style="font-size:13px;color:var(--text-1);padding:3px 0">✓ ${f}</div>`).join('')}
    </div>

    <p style="font-size:11.5px;color:var(--text-3);text-align:center;line-height:1.5">
      Cancel any time. Sharing is always free for everyone.
    </p>
    <div class="form-actions"><button class="btn btn-ghost" onclick="closeModal()">Maybe later</button></div>`);
}

// ── Social link helpers ───────────────────────────────────
function _stravaHandle(url) {
  return (url || '').replace(/^https?:\/\//i, '').replace(/^(?:www\.)?strava\.com\/athletes\//i, '').replace(/\/$/, '');
}
function _instaHandle(url) {
  return (url || '').replace(/^https?:\/\//i, '').replace(/^(?:www\.)?instagram\.com\//i, '').replace(/\/$/, '');
}
function _buildSocialUrl(prefix, handle) {
  const h = (handle || '').trim();
  if (!h) return null;
  if (/^https?:\/\//i.test(h)) return h;
  return 'https://' + prefix + h;
}

// ── Profile modal ─────────────────────────────────────────
function openProfile() {
  if (!_user) { toast('Sign in to access your profile.'); return; }

  const lp = state.profile || {};
  const pp = _profile || {};
  const hasUsername = !!_username;

  const customLinksHtml = (_isSupporter || _isAmbassador) ? (() => {
    const MAX_CL = 5;
    const links = pp.custom_links || [];
    // Show at least 1 row; show as many as already saved (up to max)
    const initialCount = Math.max(1, Math.min(links.length, MAX_CL));
    const rows = Array.from({length: initialCount}, (_, i) => {
      const cl = links[i] || {};
      return `<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px" class="s-cl-row">
        <input class="input" style="flex:1;min-width:0" id="s-cl-label-${i}" placeholder="Label" value="${esc(cl.label||'')}">
        <input class="input" style="flex:2;min-width:0" id="s-cl-url-${i}" placeholder="https://" value="${esc(cl.url||'')}">
        <label style="display:flex;align-items:center;gap:4px;font-size:12px;white-space:nowrap;cursor:pointer">
          <input type="checkbox" id="s-cl-on-${i}" ${cl.enabled ? 'checked' : ''} style="accent-color:var(--primary)"> On
        </label>
      </div>`;
    }).join('');
    const addBtnStyle = initialCount >= MAX_CL ? 'display:none' : '';
    return `<div>
      <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.625rem">Custom links <span style="font-weight:400;text-transform:none;letter-spacing:0">(up to ${MAX_CL} · Supporter)</span></div>
      <div id="s-cl-list">${rows}</div>
      <button type="button" id="s-cl-add" class="btn btn-xs" style="${addBtnStyle}margin-top:4px" onclick="clAddRow()">+ Add link</button>
    </div>`;
  })() : '';

  const prefixInput = (id, prefix, storedUrl, placeholder) => `
    <div style="display:flex;align-items:stretch;border:1px solid var(--border);border-radius:var(--r-md);overflow:hidden;background:var(--surface)">
      <span style="padding:8px 10px;font-size:12px;color:var(--text-3);background:var(--surface-2);border-right:1px solid var(--border-2);white-space:nowrap;display:flex;align-items:center">${esc(prefix)}</span>
      <input id="${id}" value="${esc(placeholder(storedUrl))}" placeholder="username"
        style="flex:1;min-width:0;border:none;outline:none;padding:8px 10px;font-size:14px;font-family:inherit;background:var(--surface)" autocomplete="off" autocapitalize="none">
    </div>`;

  openModal('Profile', `
    <div style="display:flex;flex-direction:column;gap:1.25rem">

      <!-- Username -->
      <div>
        <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.375rem">Username</div>
        <div style="font-size:12px;color:var(--text-3);margin-bottom:.5rem">
          Permanent once set · public profile at <strong>gearnomic.com/username</strong>
        </div>
        ${hasUsername
          ? `<div style="display:flex;align-items:center;gap:10px">
              <span style="font-size:14px;font-weight:500;color:var(--primary)">@${esc(_username)}</span>
              <a href="/${esc(_username)}" target="_blank" class="btn btn-sm btn-ghost" style="font-size:12px">View profile ↗</a>
            </div>`
          : `<div>
              <div style="display:flex;gap:8px;align-items:center">
                <input class="input" id="s-username" placeholder="yourname" autocomplete="off" autocapitalize="none"
                  style="width:200px;font-family:monospace" oninput="checkUsernameAvailability(this.value)">
                <span id="s-uname-status" style="font-size:12px;color:var(--text-3)"></span>
              </div>
              <div style="font-size:11px;color:var(--accent);margin-top:4px">⚠ Usernames cannot be changed after being set.</div>
              <div style="font-size:11px;color:var(--text-3);margin-top:2px">3–30 chars · lowercase letters, numbers, - and _ only</div>
            </div>`
        }
      </div>

      <!-- Avatar + Display name + Bio -->
      <div>
        <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.625rem">Profile</div>

        <!-- Avatar upload -->
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:1rem">
          <div style="position:relative;flex-shrink:0">
            <div id="s-avatar-preview" style="width:64px;height:64px;border-radius:50%;background:var(--primary-l);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:600;color:#fff;overflow:hidden;cursor:pointer" onclick="document.getElementById('s-avatar-file').click()">
              ${pp.avatar_url
                ? `<img src="${esc(pp.avatar_url)}" style="width:64px;height:64px;object-fit:cover;border-radius:50%;display:block">`
                : esc((lp.display_name || _username || '').split(/\s+/).map(w=>w[0]?.toUpperCase()).join('').slice(0,2) || '?')}
            </div>
            <button type="button" onclick="document.getElementById('s-avatar-file').click()"
              style="position:absolute;bottom:-2px;right:-2px;width:22px;height:22px;border-radius:50%;background:var(--surface);border:1.5px solid var(--border);font-size:12px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center"
              title="Change photo">✎</button>
          </div>
          <div>
            <div style="font-size:13px;font-weight:500;color:var(--text-1)">Profile photo</div>
            <div style="font-size:11px;color:var(--text-3);margin-top:2px">JPG or PNG · max 2 MB</div>
            <div id="s-avatar-status" style="font-size:11px;margin-top:2px"></div>
          </div>
          <input type="file" id="s-avatar-file" accept="image/jpeg,image/png" style="display:none" onchange="uploadAvatar(this)">
        </div>

        <div class="form-row" style="margin-bottom:.75rem">
          <label class="form-label">Display name</label>
          <input class="input input-full" id="s-display-name" value="${esc(lp.display_name || '')}" placeholder="Your name on trail">
        </div>
        <div class="form-row">
          <label class="form-label">Bio</label>
          <textarea class="input input-full" id="s-bio" rows="1" placeholder="A few words about your hiking style, goals, or favorite trails…" style="resize:vertical">${esc(pp.bio||'')}</textarea>
        </div>
      </div>

      <!-- Social links — stacked, full width -->
      <div>
        <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.625rem">Social links</div>
        <div style="display:flex;flex-direction:column;gap:.625rem">
          <div class="form-row">
            <label class="form-label">Strava</label>
            ${prefixInput('s-strava', 'strava.com/athletes/', pp.social_strava, _stravaHandle)}
          </div>
          <div class="form-row">
            <label class="form-label">Instagram</label>
            ${prefixInput('s-instagram', 'instagram.com/', pp.social_instagram, _instaHandle)}
          </div>
          <div class="form-row">
            <label class="form-label">YouTube</label>
            <input class="input input-full" id="s-youtube" value="${esc(pp.social_youtube||'')}" placeholder="youtube.com/@channel">
          </div>
          <div class="form-row">
            <label class="form-label">Website</label>
            <input class="input input-full" id="s-website" value="${esc(pp.social_website||'')}" placeholder="yoursite.com">
          </div>
        </div>
      </div>

      ${customLinksHtml}

      <!-- Visibility -->
      ${hasUsername ? `<div>
        <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.375rem">Public profile — what's visible</div>
        <div style="font-size:12px;color:var(--text-3);margin-bottom:.625rem">Nothing is public by default.</div>
        ${[
          ['s-pub-bio',      pp.public_bio,      'Bio &amp; social links'],
          ['s-pub-loadouts', pp.public_loadouts,  'Featured loadouts'],
          ['s-pub-trips',    pp.public_trips,     'Adventure stats'],
          ['s-pub-gear',     pp.public_gear,      'Gear list'],
        ].map(([id, val, label]) => `
          <label style="display:flex;align-items:center;gap:10px;padding:7px 0;cursor:pointer;border-bottom:.5px solid var(--border-2)">
            <input type="checkbox" id="${id}" ${val ? 'checked' : ''} style="accent-color:var(--primary);width:16px;height:16px">
            <span style="font-size:13px">${label}</span>
          </label>`).join('')}
      </div>` : ''}

    </div>
    <div class="form-actions">
      <button class="btn btn-primary" onclick="saveProfileModal()">Save profile</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`);
}

// ── Settings modal (account / preferences only) ───────────
function openSettings() {
  if (!_user) { toast('Sign in to access settings.'); return; }

  const lp  = state.profile || {};
  const email = _user.email || '';

  openModal('Settings', `
    <div style="display:flex;flex-direction:column;gap:1.25rem">

      <!-- Account -->
      <div>
        <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.625rem">Account</div>
        <div style="font-size:13px;color:var(--text-2);margin-bottom:.5rem">${esc(email)}</div>
        ${_isSupporter || _isAmbassador
          ? `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              ${tierBadgeHtml()}
              <span style="font-size:13px;color:var(--text-2)">Cloud sync active. Thank you for supporting Gearnomic!</span>
              ${_isSupporter ? `<a href="https://billing.stripe.com/p/login/00w5kCeTg0vBcNF0zi0oM00" target="_blank" class="btn btn-sm btn-ghost">Manage subscription</a>` : ''}
            </div>`
          : `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <span style="font-size:13px;color:var(--text-2)">Free — cloud sync included. Upgrade for unlimited meal plans &amp; full analytics.</span>
              <button class="btn btn-sm btn-primary" onclick="closeModal();openUpgradeModal()">Upgrade</button>
            </div>`
        }
      </div>

      <!-- Preferences -->
      <div>
        <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.625rem">Preferences</div>
        <div class="form-grid">
          <div class="form-row">
            <label class="form-label">Units</label>
            <select class="select input-full" id="s-units">
              <option value="metric"   ${(lp.units||'metric')==='metric'   ?'selected':''}>Metric (kg / g)</option>
              <option value="imperial" ${lp.units==='imperial'?'selected':''}>Imperial (lb / oz)</option>
            </select>
          </div>
          <div class="form-row">
            <label class="form-label">Base weight target (g)</label>
            <input class="input input-full" id="s-bw-target" type="number" min="0" step="100"
              value="${lp.base_weight_target_g || ''}" placeholder="e.g. 4500">
          </div>
        </div>
      </div>

      <!-- Security -->
      <div>
        <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.625rem">Security</div>
        <div class="form-grid">
          <div class="form-row">
            <label class="form-label">New password</label>
            <input class="input input-full" id="s-new-pw" type="password" placeholder="Leave blank to keep current">
          </div>
          <div class="form-row">
            <label class="form-label">Confirm new password</label>
            <input class="input input-full" id="s-confirm-pw" type="password" placeholder="Repeat new password">
          </div>
        </div>
        <button class="btn btn-sm" onclick="changePassword()">Update password</button>
      </div>

      <!-- Data -->
      <div>
        <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.625rem">Data</div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          <button class="btn btn-sm" onclick="exportData()">Export all data as JSON</button>
          <button class="btn btn-sm" onclick="document.getElementById('import-file').click()">Import from JSON</button>
          ${_user ? `<button class="btn btn-sm" onclick="syncToCloud().then(()=>toast('Synced!'))">Force sync to cloud</button>` : ''}
          <button class="btn btn-sm" onclick="confirmLoadSampleGear()">Load sample gear</button>
        </div>
      </div>

      <!-- Feedback -->
      <div>
        <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.625rem">Feedback</div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          <button class="btn btn-sm" onclick="openFeedbackModal('bug')">Report a bug</button>
          <button class="btn btn-sm" onclick="openFeedbackModal('feature')">Request a feature</button>
        </div>
      </div>

      <!-- Danger zone -->
      <div style="border-top:.5px solid var(--border);padding-top:1rem">
        <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--danger);margin-bottom:.625rem">Account</div>
        <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
          <button class="btn btn-sm btn-danger" onclick="signOut();closeModal()">Sign out</button>
          <button class="btn btn-sm" style="color:var(--danger);border-color:var(--danger-bg)" onclick="confirmDeleteAccount()">Delete account</button>
        </div>
      </div>

    </div>
    <div class="form-actions">
      <button class="btn btn-primary" onclick="saveSettings()">Save settings</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`);
}

// ── Profile modal save ────────────────────────────────────
async function saveProfileModal() {
  if (!state.profile) state.profile = {};

  // Username — only if not already set
  let usernameToSet = null;
  if (!_username) {
    const raw = (document.getElementById('s-username')?.value || '').trim().toLowerCase();
    if (raw) {
      if (!/^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/.test(raw)) {
        toast('Username must be 3–30 chars, letters/numbers/- only.'); return;
      }
      if (RESERVED_USERNAMES.has(raw)) { toast('That username is reserved.'); return; }
      const statusEl = document.getElementById('s-uname-status');
      if (statusEl?.textContent.includes('Taken')) { toast('That username is already taken.'); return; }
      usernameToSet = raw;
    }
  }

  // Persist display_name locally so it shows in the app immediately
  state.profile.display_name = document.getElementById('s-display-name')?.value.trim() || null;
  saveState();

  if (_supabaseReady() && _user) {
    const ok = await saveProfile(usernameToSet);
    closeModal();
    if (ok) toast('Profile saved!');
  } else {
    closeModal();
    toast('Profile saved locally.');
  }
}

// ── Settings save (local prefs only) ─────────────────────
async function saveSettings() {
  if (!state.profile) state.profile = {};
  state.profile.units                = document.getElementById('s-units')?.value || 'metric';
  state.profile.base_weight_target_g = parseInt(document.getElementById('s-bw-target')?.value) || null;
  saveState();
  closeModal();
  toast('Settings saved!');
}

// ── Reserved usernames ────────────────────────────────────
const RESERVED_USERNAMES = new Set([
  'login','logout','signup','register','auth','oauth','callback','verify','reset','password',
  'settings','account','profile','dashboard','admin','share','api','pricing','plans','upgrade',
  'billing','subscribe','subscription','checkout','about','contact','help','support','faq',
  'terms','privacy','legal','blog','changelog','press','careers','jobs','team','mission',
  'www','mail','email','static','assets','cdn','dev','staging','beta','app','web','mobile',
  'feed','rss','sitemap','robots','404','500','error','pack','gear','kit','trip','trips',
  'list','lists','loadout','loadouts','recipe','recipes','meal','meals','stable','bike',
  'explore','discover','search','u','user','users','gearnomic','anthropic','administrator',
  'moderator','mod','official','staff','new','edit','delete','create','update','save',
  'import','export','download','upload','invite','refer','referral','affiliate','ambassador',
  'founder','supporter','public','private','null','undefined','root','home','index',
  'welcome','start','getting-started','onboarding','tour','demo','test','sandbox',
]);

// ── Custom link row add ────────────────────────────────────
function clAddRow() {
  const list = document.getElementById('s-cl-list');
  const addBtn = document.getElementById('s-cl-add');
  if (!list || !addBtn) return;
  const MAX_CL = 5;
  const idx = list.querySelectorAll('.s-cl-row').length;
  if (idx >= MAX_CL) { addBtn.style.display = 'none'; return; }
  const row = document.createElement('div');
  row.className = 's-cl-row';
  row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:6px';
  row.innerHTML = `
    <input class="input" style="flex:1;min-width:0" id="s-cl-label-${idx}" placeholder="Label">
    <input class="input" style="flex:2;min-width:0" id="s-cl-url-${idx}" placeholder="https://">
    <label style="display:flex;align-items:center;gap:4px;font-size:12px;white-space:nowrap;cursor:pointer">
      <input type="checkbox" id="s-cl-on-${idx}" checked style="accent-color:var(--primary)"> On
    </label>`;
  list.appendChild(row);
  row.querySelector('input').focus();
  if (idx + 1 >= MAX_CL) addBtn.style.display = 'none';
}

// ── Avatar upload ─────────────────────────────────────────
async function uploadAvatar(input) {
  const file = input.files?.[0];
  if (!file) return;

  const statusEl = document.getElementById('s-avatar-status');
  const setStatus = (msg, color) => { if (statusEl) { statusEl.textContent = msg; statusEl.style.color = color || 'var(--text-3)'; } };

  if (!['image/jpeg', 'image/png'].includes(file.type)) {
    setStatus('JPG or PNG only.', 'var(--danger)'); return;
  }
  if (file.size > 2 * 1024 * 1024) {
    setStatus('File must be under 2 MB.', 'var(--danger)'); return;
  }
  if (!_supabaseReady() || !_user) { toast('Sign in to upload a photo.'); return; }

  setStatus('Uploading…', 'var(--text-3)');

  // Always upload to the same path so re-uploads overwrite the previous file.
  // upsert:true is the critical flag — without it a second upload would error
  // instead of replacing the existing object, and old files would accumulate.
  const path = `${_user.id}/avatar.jpg`;
  const { error: upErr } = await _sb.storage.from('avatars').upload(path, file, {
    contentType: file.type,
    upsert: true,
  });

  if (upErr) { setStatus('Upload failed: ' + upErr.message, 'var(--danger)'); return; }

  const { data: { publicUrl } } = _sb.storage.from('avatars').getPublicUrl(path);

  // Persist the URL to the profiles row
  const { error: saveErr } = await _sb.from('profiles')
    .upsert({ id: _user.id, avatar_url: publicUrl }, { onConflict: 'id' });

  if (saveErr) { setStatus('Photo saved but profile update failed.', 'var(--danger)'); return; }

  // Update the preview in the modal (cache-bust so the browser doesn't show the old image)
  const preview = document.getElementById('s-avatar-preview');
  if (preview) {
    preview.innerHTML = `<img src="${esc(publicUrl)}?t=${Date.now()}" style="width:64px;height:64px;object-fit:cover;border-radius:50%;display:block">`;
  }

  if (_profile) _profile.avatar_url = publicUrl;
  setStatus('Photo updated!', 'var(--success)');
}

// ── Username availability check ───────────────────────────
function checkUsernameAvailability(raw) {
  clearTimeout(_unameCheckTimer);
  const el = document.getElementById('s-uname-status');
  if (!el) return;
  const val = raw.trim().toLowerCase();
  if (!val) { el.textContent = ''; return; }
  if (!/^[a-z0-9][a-z0-9_-]*[a-z0-9]$/.test(val) || val.length < 3) {
    el.textContent = 'Invalid format'; el.style.color = 'var(--danger)'; return;
  }
  if (RESERVED_USERNAMES.has(val)) {
    el.textContent = '✗ Reserved'; el.style.color = 'var(--danger)'; return;
  }
  el.textContent = 'Checking…'; el.style.color = 'var(--text-3)';
  _unameCheckTimer = setTimeout(async () => {
    if (!_supabaseReady()) return;
    const { data } = await _sb.from('profiles').select('id').eq('username', val).neq('id', _user?.id ?? '').maybeSingle();
    if (!el.isConnected) return;
    if (data) { el.textContent = '✗ Taken'; el.style.color = 'var(--danger)'; }
    else      { el.textContent = '✓ Available'; el.style.color = 'var(--success)'; }
  }, 400);
}

// ── Load profile from Supabase ────────────────────────────
async function loadProfile() {
  if (!_supabaseReady() || !_user) return;
  try {
    const { data } = await _sb.from('profiles').select('*').eq('id', _user.id).maybeSingle();
    _profile  = data || null;
    _username = data?.username || null;
  } catch(e) { /* non-fatal */ }
}

// ── Save profile to Supabase ──────────────────────────────
async function saveProfile(usernameToSet) {
  if (!_supabaseReady() || !_user) return false;
  try {
    return await _saveProfileInner(usernameToSet);
  } catch(e) {
    console.error('[profile] unexpected error:', e);
    toast('Profile save error: ' + e.message);
    return false;
  }
}

async function _saveProfileInner(usernameToSet) {

  // Collect custom links from however many rows are currently in the DOM
  const custom_links = [];
  if (_isSupporter || _isAmbassador) {
    const rowCount = document.getElementById('s-cl-list')?.querySelectorAll('.s-cl-row').length ?? 0;
    for (let i = 0; i < rowCount; i++) {
      const label   = document.getElementById('s-cl-label-' + i)?.value.trim() || '';
      const url     = document.getElementById('s-cl-url-' + i)?.value.trim()   || '';
      const enabled = document.getElementById('s-cl-on-' + i)?.checked ?? false;
      if (label || url) custom_links.push({ label, url, enabled });
    }
  }

  // Build snapshot data for public display
  const hasUsername = !!(_username || usernameToSet);
  const pub_loadouts = hasUsername && !!document.getElementById('s-pub-loadouts')?.checked;
  const pub_trips    = hasUsername && !!document.getElementById('s-pub-trips')?.checked;
  const pub_gear     = hasUsername && !!document.getElementById('s-pub-gear')?.checked;

  const snap_loadouts = pub_loadouts
    ? (state.templates || []).map(t => ({
        name: t.name, description: t.description || '',
        items_count: (t.gear_ids || []).filter(id => state.items.find(i => i.id === id)).length,
        total_weight_g: (t.gear_ids || []).reduce((s, id) => {
          const item = state.items.find(i => i.id === id);
          return s + (item?.weight_g || 0);
        }, 0),
      }))
    : null;

  const snap_trips = pub_trips ? {
    total_trips:    (state.trips || []).length,
    completed:      (state.trips || []).filter(t => t.status === 'completed').length,
    total_distance: (state.trips || []).reduce((s, t) => s + (t.distance_km || 0), 0) || null,
  } : null;

  const snap_gear = pub_gear
    ? (state.items || []).map(i => ({ name: i.name, brand: i.brand || '', category: i.category, weight_g: i.weight_g || 0 }))
    : null;

  const payload = {
    id: _user.id,
    display_name:     state.profile?.display_name || null,
    bio:              document.getElementById('s-bio')?.value.trim() || null,
    social_strava:    _buildSocialUrl('strava.com/athletes/', document.getElementById('s-strava')?.value),
    social_instagram: _buildSocialUrl('instagram.com/',       document.getElementById('s-instagram')?.value),
    social_youtube:   document.getElementById('s-youtube')?.value.trim()   || null,
    social_website:   document.getElementById('s-website')?.value.trim()   || null,
    custom_links,
    public_bio:      hasUsername && !!document.getElementById('s-pub-bio')?.checked,
    public_loadouts: pub_loadouts,
    public_trips:    pub_trips,
    public_gear:     pub_gear,
    snap_loadouts,
    snap_trips,
    snap_gear,
    is_supporter:    _isSupporter,
    is_ambassador:   _isAmbassador,
    supporter_since: _supporterSince,
  };

  if (usernameToSet) payload.username = usernameToSet;

  const { error } = await _sb.from('profiles').upsert(payload, { onConflict: 'id' });
  if (error) {
    console.error('[profile] save failed:', error);
    toast('Profile save failed: ' + error.message);
    return false;
  }

  await loadProfile();
  return true;
}

async function changePassword() {
  const pw1 = document.getElementById('s-new-pw')?.value;
  const pw2 = document.getElementById('s-confirm-pw')?.value;
  if (!pw1) { toast('Enter a new password first.'); return; }
  if (pw1.length < 6) { toast('Password must be at least 6 characters.'); return; }
  if (pw1 !== pw2) { toast('Passwords do not match.'); return; }
  if (!_supabaseReady()) return;
  const { error } = await _sb.auth.updateUser({ password: pw1 });
  if (error) toast('Error: ' + error.message);
  else {
    document.getElementById('s-new-pw').value = '';
    document.getElementById('s-confirm-pw').value = '';
    toast('Password updated!');
  }
}

async function confirmDeleteAccount() {
  if (!confirm('Delete your account? This permanently removes all your data from the cloud. Your local copy is unaffected.\n\nThis cannot be undone.')) return;
  if (!_supabaseReady()) return;
  // Delete cloud data row first, then the auth user
  await _sb.from('user_data').delete().eq('user_id', _user.id);
  const { error } = await _sb.auth.admin?.deleteUser(_user.id).catch(() => ({ error: null }));
  // Fall back to signOut if admin API not available (it won't be from client)
  await _sb.auth.signOut();
  _user = null;
  closeModal();
  updateHeaderAuth();
  toast('Account data deleted. You have been signed out.');
}

function openFeedbackModal(type) {
  const isBug = type !== 'feature';
  const title = isBug ? 'Report a bug' : 'Request a feature';
  const placeholder = isBug
    ? 'Describe what happened, what you expected to happen, and the steps to reproduce it…'
    : 'Describe the feature you\'d like to see and how it would help your workflow…';
  const subject = isBug ? 'Bug report — Gearnomic' : 'Feature request — Gearnomic';
  const currentTab = document.querySelector('.nav-tab.active')?.dataset?.tab || '';
  const context = isBug
    ? `\n\n---\nPage: ${currentTab || 'unknown'}\nUser: ${_user?.email || 'not signed in'}`
    : '';

  openModal(title, `
    <p style="font-size:13px;color:var(--text-2);margin-bottom:1rem;line-height:1.6">
      ${isBug
        ? 'Found something broken? Let us know and we\'ll fix it.'
        : 'Have an idea that would make Gearnomic better? We\'d love to hear it.'}
    </p>
    <div class="form-row">
      <label class="form-label">${isBug ? 'What went wrong?' : 'Describe the feature'} *</label>
      <textarea class="input input-full" id="fb-message" rows="5"
        placeholder="${placeholder}"
        style="height:120px;resize:vertical"></textarea>
    </div>
    <div class="form-row">
      <label class="form-label">Your email <span style="color:var(--text-3);font-weight:400">(optional — for follow-up)</span></label>
      <input class="input input-full" id="fb-email" type="email"
        value="${_user?.email || ''}" placeholder="you@example.com">
    </div>
    <div id="fb-error" style="display:none;font-size:12px;color:var(--danger);margin-bottom:.5rem"></div>
    <div class="form-actions">
      <button class="btn btn-primary" onclick="submitFeedback('${type}','${encodeURIComponent(subject)}')">Send</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`);
  setTimeout(() => document.getElementById('fb-message')?.focus(), 100);
}

function submitFeedback(type, encodedSubject) {
  const message = document.getElementById('fb-message')?.value.trim();
  const email   = document.getElementById('fb-email')?.value.trim();
  const errEl   = document.getElementById('fb-error');

  if (!message) {
    errEl.textContent = 'Please describe the ' + (type === 'bug' ? 'bug' : 'feature') + ' before sending.';
    errEl.style.display = 'block';
    document.getElementById('fb-message')?.focus();
    return;
  }
  errEl.style.display = 'none';

  const subject = decodeURIComponent(encodedSubject);
  const from    = email ? `From: ${email}\n` : '';
  const tab     = document.querySelector('.nav-tab.active')?.dataset?.tab || 'unknown';
  const user    = _user?.email || 'not signed in';
  const body    = `${message}\n\n---\n${from}Page: ${tab}\nAccount: ${user}`;

  const mailto = `mailto:hello@gearnomic.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailto;

  closeModal();
  toast('Opening your email client…');
}

function openPrivacyPolicy() {
  openModal('Privacy Policy', `
    <div style="font-size:13px;color:var(--text-2);line-height:1.7;max-height:60vh;overflow-y:auto">
      <p style="margin-bottom:.875rem"><strong>Last updated:</strong> ${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</p>

      <p style="margin-bottom:.875rem"><strong>What we collect</strong><br>
      When you create an account, we store your email address and the gear, trip, and planning data you enter into Gearnomic. This data is stored securely via Supabase.</p>

      <p style="margin-bottom:.875rem"><strong>What we don't collect</strong><br>
      We do not use advertising trackers, third-party analytics, or sell your data to anyone. We do not use cookies beyond what Supabase requires for authentication sessions.</p>

      <p style="margin-bottom:.875rem"><strong>Local storage</strong><br>
      Your data is also cached in your browser's localStorage for fast offline access. Clearing your browser data will remove this local copy but your cloud backup remains intact if you have an account.</p>

      <p style="margin-bottom:.875rem"><strong>Admin access</strong><br>
      Gearnomic's operator may access account data for the purpose of providing customer support. This access is logged and limited to diagnosing issues. We do not access your data for any other purpose.</p>

      <p style="margin-bottom:.875rem"><strong>Data deletion</strong><br>
      You can delete your account and all associated data at any time from Settings → Account → Delete account.</p>

      <p style="margin-bottom:.875rem"><strong>Contact</strong><br>
      For privacy questions, email <a href="mailto:hello@gearnomic.com">hello@gearnomic.com</a>.</p>
    </div>
    <div class="form-actions"><button class="btn btn-ghost" onclick="closeModal()">Close</button></div>`);
}

// ── Changelog ───────────────────────────────────────────────
const CHANGELOG = [
  { id: 'cl005', date: 'April 10, 2026', text: 'Added empty states to all blank sections so the app feels less bare when you\'re just getting started.' },
  { id: 'cl004', date: 'April 10, 2026', text: 'Load sample gear now also loads a demo trip and demo loadout so you can explore the full app right away.' },
  { id: 'cl003', date: 'April 9, 2026', text: 'Shared trip URLs now include the meal plan — shared gear lists also show carry status (worn/consumable) and a weight breakdown.' },
  { id: 'cl002', date: 'April 9, 2026', text: 'Added "Copy as markdown" export for trips and loadouts — easy sharing on Reddit, Discord, and forums.' },
  { id: 'cl001', date: 'April 8, 2026', text: 'Item details (brand, model, weight, cost) now shown consistently across gear closet, loadouts, and shared views.' },
];

function updateChangelogDot() {
  const dot = document.getElementById('changelog-dot');
  if (!dot) return;
  const seen = localStorage.getItem('gn_changelog_seen');
  dot.style.display = (seen === CHANGELOG[0].id) ? 'none' : 'inline-block';
}

function openChangelog() {
  localStorage.setItem('gn_changelog_seen', CHANGELOG[0].id);
  updateChangelogDot();

  // Group entries by date
  const byDate = [];
  let current = null;
  for (const entry of CHANGELOG) {
    if (!current || current.date !== entry.date) {
      current = { date: entry.date, items: [] };
      byDate.push(current);
    }
    current.items.push(entry.text);
  }

  const rows = byDate.map(group => `
    <div style="margin-bottom:1.25rem">
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.5rem">${group.date}</div>
      <ul style="margin:0;padding-left:1.25rem;display:flex;flex-direction:column;gap:.375rem">
        ${group.items.map(t => `<li style="font-size:13px;color:var(--text-2);line-height:1.6">${t}</li>`).join('')}
      </ul>
    </div>`).join('');

  openModal("What's new", `
    <div style="max-height:60vh;overflow-y:auto;padding-right:4px">
      ${rows}
    </div>
    <div class="form-actions"><button class="btn btn-ghost" onclick="closeModal()">Close</button></div>`);
}

function openTerms() {
  openModal('Terms of Use', `
    <div style="font-size:13px;color:var(--text-2);line-height:1.7;max-height:60vh;overflow-y:auto">
      <p style="margin-bottom:.875rem"><strong>Last updated:</strong> ${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</p>

      <p style="margin-bottom:.875rem"><strong>Use at your own risk</strong><br>
      Gearnomic is a gear management and planning tool. Weight calculations, calorie estimates, and other metrics are for planning purposes only. Always exercise your own judgment when preparing for backcountry travel.</p>

      <p style="margin-bottom:.875rem"><strong>Your data</strong><br>
      You own your data. We don't claim any rights to the gear lists, trips, or other content you create. You can export or delete it at any time.</p>

      <p style="margin-bottom:.875rem"><strong>Service availability</strong><br>
      Gearnomic is provided free of charge. We reserve the right to modify or discontinue the service at any time. Data sync requires an active Supabase backend — offline/local mode always works without it.</p>

      <p style="margin-bottom:.875rem"><strong>Acceptable use</strong><br>
      Don't use Gearnomic to store illegal content or attempt to access other users' data. Shared links are public — don't include sensitive personal information in trip names or notes you intend to share.</p>

      <p style="margin-bottom:.875rem"><strong>Contact</strong><br>
      Questions? Email <a href="mailto:hello@gearnomic.com">hello@gearnomic.com</a>.</p>
    </div>
    <div class="form-actions"><button class="btn btn-ghost" onclick="closeModal()">Close</button></div>`);
}

// ============================================================
// ============================================================

// Generate a short random token (no external lib needed)
function nanoId(len) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  arr.forEach(b => { id += chars[b % chars.length]; });
  return id;
}

// Generate Reddit-friendly markdown for a gear list (trip or loadout)
function generateGearMarkdown(id, kind) {
  const obj = kind === 'trip'
    ? state.trips.find(t => t.id === id)
    : state.templates.find(t => t.id === id);
  if (!obj) return null;

  let gearIds = obj.gear_ids || [];
  const title = obj.name || (kind === 'trip' ? 'Trip' : 'Loadout');

  // Trips: get all gear from all loadouts
  if (kind === 'trip' && obj.loadout_ids) {
    const seen = new Set();
    gearIds = [];
    (obj.loadout_ids).forEach(lid => {
      const loadout = state.templates.find(t => t.id === lid);
      (loadout?.gear_ids || []).forEach(id => {
        if (!seen.has(id)) { seen.add(id); gearIds.push(id); }
      });
    });
  }

  // Get items and group by category
  const items = gearIds.map(id => state.items.find(i => i.id === id)).filter(Boolean);
  const catOrder = categoryNames();
  const byCat = {};
  items.forEach(item => {
    if (!byCat[item.category]) byCat[item.category] = [];
    byCat[item.category].push(item);
  });

  // Sort categories
  const sortedCats = Object.keys(byCat).sort((a, b) => {
    const ai = catOrder.indexOf(a), bi = catOrder.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1; if (bi === -1) return -1;
    return ai - bi;
  });

  // Calculate totals
  const baseW = items.reduce((s, i) => {
    const ct = getCarryTypeForMarkdown(id, i.id, kind);
    return s + (ct === 'packed' ? (i.weight_g || 0) : 0);
  }, 0);
  const wornW = items.reduce((s, i) => {
    const ct = getCarryTypeForMarkdown(id, i.id, kind);
    return s + (ct === 'worn' ? (i.weight_g || 0) : 0);
  }, 0);
  const consumW = items.reduce((s, i) => {
    const ct = getCarryTypeForMarkdown(id, i.id, kind);
    return s + (ct === 'consumable' ? (i.weight_g || 0) : 0);
  }, 0);
  const totalW = baseW + wornW + consumW;

  // Build markdown
  let md = `# ${title}\n\n`;

  // Header info for trips
  if (kind === 'trip') {
    if (obj.location) md += `**Location**: ${obj.location}\n`;
    if (obj.start_date) md += `**Dates**: ${obj.start_date}${obj.end_date ? ' → ' + obj.end_date : ''}\n`;
    if (obj.miles) md += `**Distance**: ${obj.miles} mi\n`;
    md += '\n';
  }

  // Weight summary
  md += `| Weight Summary | |\n`;
  md += `|---|---|\n`;
  md += `| Base | ${wg(baseW)} |\n`;
  if (wornW) md += `| Worn | ${wg(wornW)} |\n`;
  if (consumW) md += `| Consumable | ${wg(consumW)} |\n`;
  md += `| **Total** | **${wg(totalW)}** |\n\n`;

  // Gear list
  md += `## Gear List\n\n`;
  sortedCats.forEach(cat => {
    md += `### ${cat}\n\n`;
    md += `| Item | Brand | Model | Weight | Cost | Carry |\n`;
    md += `|---|---|---|---|---|---|\n`;
    byCat[cat].forEach(item => {
      const ct = getCarryTypeForMarkdown(id, item.id, kind);
      const carryLabel = ct === 'worn' ? 'worn' : ct === 'consumable' ? 'consumable' : 'packed';
      const branch = item.brand || '';
      const model = item.model || '';
      const cost = item.cost_usd ? `$${item.cost_usd.toFixed(2)}` : '';
      md += `| ${item.name} | ${branch} | ${model} | ${wg(item.weight_g)} | ${cost} | ${carryLabel} |\n`;
    });
    md += '\n';
  });

  // Footer
  md += `---\n\n*Shared from [Gearnomic](https://gearnomic.com)*`;

  return md;
}

// Helper to get carry type for markdown generation
function getCarryTypeForMarkdown(containerId, itemId, kind) {
  if (kind === 'template') {
    const tmpl = state.templates.find(t => t.id === containerId);
    return (tmpl?.carry_types || {})[itemId] || 'packed';
  } else if (kind === 'trip') {
    // Check loadouts' carry types for trips
    const trip = state.trips.find(t => t.id === containerId);
    if (trip) {
      for (const loadoutId of (trip.loadout_ids || [])) {
        const loadout = state.templates.find(t => t.id === loadoutId);
        const ct = loadout?.carry_types?.[itemId];
        if (ct) return ct;
      }
    }
  }
  return 'packed';
}

// Copy gear list as markdown to clipboard
async function copyGearMarkdown(id, kind) {
  const md = generateGearMarkdown(id, kind);
  if (!md) {
    toast('Could not generate markdown.');
    return;
  }

  try {
    await navigator.clipboard.writeText(md);
    toast('Markdown copied to clipboard!');
  } catch (err) {
    openModal('Copy to clipboard failed', `
      <p style="font-size:13px;color:var(--text-2);margin-bottom:1rem">Your browser doesn't support copying. Here's the markdown:</p>
      <textarea style="width:100%;height:300px;font-size:12px;font-family:monospace;padding:8px;border:.5px solid var(--border);border-radius:var(--r-md)" readonly onclick="this.select()">${md}</textarea>
      <div class="form-actions"><button class="btn btn-ghost" onclick="closeModal()">Close</button></div>`);
  }
}

function buildSharePayload(obj, kind) {
  const payload = JSON.parse(JSON.stringify(obj));

  // Embed full item objects so the share is self-contained
  let gearIds = obj.gear_ids || [];

  // Trips reference items via loadout_ids → each loadout's gear_ids
  if (kind === 'trip' && obj.loadout_ids) {
    const seen = new Set();
    gearIds = [];
    (obj.loadout_ids).forEach(lid => {
      const loadout = state.templates.find(t => t.id === lid);
      (loadout?.gear_ids || []).forEach(id => {
        if (!seen.has(id)) { seen.add(id); gearIds.push(id); }
      });
    });
    // Also embed each loadout so carry types are preserved
    payload._shared_loadouts = (obj.loadout_ids).map(lid =>
      state.templates.find(t => t.id === lid)
    ).filter(Boolean).map(l => JSON.parse(JSON.stringify(l)));

    // Also embed the meal plan if attached to this trip
    if (obj.meal_plan_id) {
      const mealPlan = state.food_plans.find(p => p.id === obj.meal_plan_id);
      if (mealPlan) {
        payload._shared_food_plan = JSON.parse(JSON.stringify(mealPlan));
      }
    }
  }

  payload._shared_items = gearIds.map(id => {
    const item = state.items.find(i => i.id === id);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }).filter(Boolean);

  payload._kind    = kind;
  payload._version = 1;
  return payload;
}

async function shareItem(id, kind) {
  if (!_supabaseReady()) {
    openModal('Sign in to share', `
      <p style="font-size:13px;color:var(--text-2);margin-bottom:1rem">
        Sharing requires a Gearnomic account so your link stays live. Sign in or create a free account to share.
      </p>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="closeModal();showAuthModal()">Sign in</button>
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      </div>`);
    return;
  }
  if (!_user) {
    openModal('Sign in to share', `
      <p style="font-size:13px;color:var(--text-2);margin-bottom:1rem">
        Sharing requires a Gearnomic account. Sign in or create a free account — sharing is free for everyone.
      </p>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="closeModal();showAuthModal()">Sign in</button>
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      </div>`);
    return;
  }

  const obj = kind === 'trip'
    ? state.trips.find(t => t.id === id)
    : state.templates.find(t => t.id === id);
  if (!obj) { toast('Could not find item to share.'); return; }

  toast('Creating share link—');

  try {
    console.log('[share] step 1: starting, kind=', kind, 'id=', id);

    const token   = nanoId(10);
    const payload = buildSharePayload(obj, kind);
    console.log('[share] step 2: payload built,', (JSON.stringify(payload).length / 1024).toFixed(1), 'KB,', (payload._shared_items || []).length, 'items');

    let _timeoutId;
    const insertResult = await Promise.race([
      _sb.from('shared_lists').insert({
        id:       token,
        owner_id: _user.id,
        kind,
        title:    obj.name,
        payload,
      }),
      new Promise((_, reject) => { _timeoutId = setTimeout(() => reject(new Error('timeout')), 30000); }),
    ]).then(
      result => { clearTimeout(_timeoutId); return result; },
      err    => { clearTimeout(_timeoutId); return { error: err }; }
    );

    console.log('[share] step 3: insert done, error=', insertResult?.error);

    if (insertResult?.error) {
      const isTimeout = insertResult.error.message === 'timeout';
      const isRls     = insertResult.error.message?.includes('row-level security');
      const isMissing = insertResult.error.message?.includes('does not exist');
      console.error('Share insert error:', insertResult.error);
      openModal('Share failed', `
        <p style="font-size:13px;color:var(--text-2);margin-bottom:.5rem">
          ${isTimeout ? 'The request timed out — Supabase did not respond in time.' : 'Could not create share link.'}
        </p>
        <p style="font-size:12px;color:var(--danger);margin-bottom:1rem;font-family:monospace">
          ${isTimeout
            ? `Check your connection and try again. If this keeps happening, verify the RLS insert policy on shared_lists allows <code>auth.uid() = owner_id</code>.`
            : isMissing
              ? `The shared_lists table is missing. Run <code>supabase/02_shared_lists.sql</code> in your Supabase SQL editor.`
              : isRls
                ? `Row-level security blocked the insert. Check that the RLS insert policy on shared_lists uses <code>with check (auth.uid() = owner_id)</code>.`
                : esc(insertResult.error.message)}
        </p>
        <div class="form-actions"><button class="btn btn-ghost" onclick="closeModal()">Close</button></div>`);
      return;
    }

    console.log('[share] step 4: building URL and opening modal');

    const url = `${window.location.origin}${window.location.pathname}#share=${token}`;
    const kindLabel = kind === 'template' ? 'loadout' : kind;
    openModal('Share link', `
      <p style="font-size:13px;color:var(--text-2);margin-bottom:1rem">
        Anyone with this link can view your <strong>${esc(obj.name)}</strong> ${kindLabel} and save it to their own account.
      </p>
      <div style="display:flex;gap:8px;align-items:center;background:var(--surface-2);border:.5px solid var(--border);border-radius:var(--r-md);padding:8px 12px;margin-bottom:1rem">
        <span style="font-size:12px;color:var(--text-2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:monospace">${url}</span>
        <button class="btn btn-sm" onclick="navigator.clipboard.writeText('${url}').then(()=>toast('Copied!')).catch(()=>this.previousElementSibling.select())">Copy</button>
      </div>
      <p style="font-size:11.5px;color:var(--text-3)">The link stays active until you delete this ${kindLabel}. Item weights and carry types are included.</p>
      <div class="form-actions"><button class="btn btn-ghost" onclick="closeModal()">Done</button></div>`);
  } catch (err) {
    console.error('Share error:', err);
    openModal('Share failed', `
      <p style="font-size:13px;color:var(--text-2);margin-bottom:.5rem">Could not create share link.</p>
      <p style="font-size:12px;color:var(--danger);margin-bottom:1rem;font-family:monospace">${esc(err.message || String(err))}</p>
      <div class="form-actions"><button class="btn btn-ghost" onclick="closeModal()">Close</button></div>`);
  }
}

// Called on page load when #share=TOKEN is in the URL
async function handleShareHash(token) {
  // Show a loading state in place of the normal app
  const overlay = document.createElement('div');
  overlay.id = 'share-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:var(--bg);z-index:400;overflow-y:auto;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:1rem';
  overlay.innerHTML = `<div style="font-family:var(--font-disp);font-size:22px;color:var(--text-1)">Loading shared list…</div>`;
  document.body.appendChild(overlay);

  try {
    if (!_supabaseReady()) {
      overlay.innerHTML = sharedErrorHtml('Sharing requires Supabase to be configured.', token);
      return;
    }
    const { data, error } = await _sb.from('shared_lists')
      .select('id,kind,title,payload,created_at')
      .eq('id', token)
      .single();

    if (error || !data) {
      overlay.innerHTML = sharedErrorHtml('This link has expired or does not exist.', token);
      return;
    }
    renderSharedView(overlay, data);
  } catch(e) {
    console.error('[share] handleShareHash error:', e);
    overlay.innerHTML = sharedErrorHtml('Could not load the shared list.', token);
  }
}

function sharedErrorHtml(msg, token) {
  return `<div style="text-align:center;padding:2rem;max-width:400px;margin:auto">
    <div style="font-size:40px;margin-bottom:1rem"></div>
    <div style="font-family:var(--font-disp);font-size:20px;margin-bottom:.5rem">Gearnomic</div>
    <p style="font-size:14px;color:var(--text-2);margin-bottom:1.5rem">${msg}</p>
    <a href="${window.location.pathname}" class="btn btn-primary">Open Gearnomic</a>
  </div>`;
}

function renderSharedView(overlay, data) {
  const payload  = data.payload;
  const kind     = data.kind;
  const items    = payload._shared_items || [];

  // Helper to get carry type for a shared item
  function getSharedCarryType(itemId) {
    // For trips, check loadouts' carry_types
    if (kind === 'trip' && payload._shared_loadouts) {
      for (const loadout of payload._shared_loadouts) {
        const ct = loadout.carry_types?.[itemId];
        if (ct) return ct;
      }
    }
    // For templates, check payload.carry_types
    if (kind === 'template') {
      return payload.carry_types?.[itemId] || 'packed';
    }
    return 'packed';
  }

  // Calculate weights by carry type
  const baseW = items.reduce((s, i) => {
    const ct = getSharedCarryType(i.id);
    return s + (ct === 'packed' ? (i.weight_g || 0) : 0);
  }, 0);
  const wornW = items.reduce((s, i) => {
    const ct = getSharedCarryType(i.id);
    return s + (ct === 'worn' ? (i.weight_g || 0) : 0);
  }, 0);
  const consumW = items.reduce((s, i) => {
    const ct = getSharedCarryType(i.id);
    return s + (ct === 'consumable' ? (i.weight_g || 0) : 0);
  }, 0);
  const tw = baseW + wornW + consumW;

  // Group items by category for the list
  const byCat = {};
  items.forEach(item => {
    if (!byCat[item.category]) byCat[item.category] = [];
    byCat[item.category].push(item);
  });

  const gearHtml = Object.entries(byCat).map(([cat, catItems]) => `
    <div style="margin-bottom:1rem">
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--text-3);padding:4px 0;border-bottom:.5px solid var(--border);margin-bottom:5px">${esc(cat)}</div>
      ${catItems.map(item => {
        const ct = getSharedCarryType(item.id);
        const carryBadge = ct === 'worn' ? '<span style="display:inline-block;padding:2px 6px;border-radius:12px;font-size:10px;font-weight:500;background:var(--warning-bg);color:var(--warning-text);margin-left:4px">worn</span>' :
                           ct === 'consumable' ? '<span style="display:inline-block;padding:2px 6px;border-radius:12px;font-size:10px;font-weight:500;background:var(--info-bg);color:var(--info-text);margin-left:4px">consumable</span>' :
                           '';
        return `
        <div style="display:flex;justify-content:space-between;align-items:baseline;padding:5px 0;border-bottom:.5px solid var(--border-2)">
          <div style="flex:1">
            <span style="font-size:13px;font-weight:500">${esc(item.name)}</span>
            ${item.brand ? `<span style="font-size:11px;color:var(--text-3);margin-left:6px">${esc(item.brand)}</span>` : ''}
            ${item.model ? `<span style="font-size:11px;color:var(--text-3);margin-left:6px">${esc(item.model)}</span>` : ''}
            ${carryBadge}
          </div>
          <div style="display:flex;gap:16px;font-size:12px;color:var(--text-2);flex-shrink:0;margin-left:12px;align-items:baseline">
            <span class="mono">${wg(item.weight_g)}</span>
            ${item.cost_usd ? `<span>${usd(item.cost_usd)}</span>` : ''}
            ${item.product_url ? `<a href="${safeHref(item.product_url)}" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:var(--primary);text-decoration:none">link ↗</a>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>`).join('');

  // Switch from centered loading state to scrollable page layout
  overlay.style.display = 'block';
  overlay.innerHTML = `
    <div style="min-height:100vh;background:var(--bg);padding:0">
      <!-- Header -->
      <div style="background:var(--surface);border-bottom:1px solid var(--border);padding:.75rem 1.25rem;display:flex;justify-content:space-between;align-items:center">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:30px;height:30px;background:#2A4032;border-radius:6px;display:flex;align-items:center;justify-content:center;font-family:Georgia,serif;font-size:11px;font-weight:700;color:#fff">GN</div>
          <span style="font-family:var(--font-disp);font-size:17px">Gearnomic</span>
        </div>
        <a href="${window.location.pathname}" class="btn btn-sm">Open my account</a>
      </div>

      <!-- Content -->
      <div style="max-width:680px;margin:0 auto;padding:2rem 1rem">
        <!-- Title card -->
        <div style="margin-bottom:1.5rem">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:.375rem">
            ${badge('badge-gray', kind)}
            <h1 style="font-family:var(--font-disp);font-size:26px;font-weight:400;margin:0">${esc(data.title)}</h1>
          </div>
          ${payload.description ? `<p style="font-size:14px;color:var(--text-2);margin:.5rem 0">${esc(payload.description)}</p>` : ''}
          ${payload.location    ? `<p style="font-size:13px;color:var(--text-3)"> ${esc(payload.location)}</p>` : ''}

          <!-- Stats row -->
          <div style="display:flex;gap:20px;font-size:13px;margin-top:.875rem;flex-wrap:wrap">
            <span><strong>${items.length}</strong> items</span>
            <span>Base: <strong class="mono">${wg(baseW)}</strong></span>
            ${wornW ? `<span><span style="display:inline-block;width:8px;height:8px;background:var(--warning-text);border-radius:2px;margin-right:4px;vertical-align:middle"></span>Worn: <strong class="mono">${wg(wornW)}</strong></span>` : ''}
            ${consumW ? `<span><span style="display:inline-block;width:8px;height:8px;background:var(--info-text);border-radius:2px;margin-right:4px;vertical-align:middle"></span>Consumable: <strong class="mono">${wg(consumW)}</strong></span>` : ''}
            <span style="color:var(--text-3)">Total: <strong class="mono">${wg(tw)}</strong></span>
            ${payload.miles  ? `<span><strong>${esc(String(payload.miles))}</strong> mi</span>` : ''}
            ${payload.start_date ? `<span>${esc(String(payload.start_date))}</span>` : ''}
          </div>
        </div>

        <!-- Save CTA -->
        <div style="background:var(--accent-l);border:.5px solid var(--accent);border-radius:var(--r-lg);padding:1rem 1.25rem;margin-bottom:1.5rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap">
          <div>
            <div style="font-weight:500;font-size:14px;margin-bottom:2px">Save to your Gearnomic account</div>
            <div style="font-size:12px;color:var(--text-2)">Saves as a loadout you can attach to any trip</div>
          </div>
          <button class="btn btn-primary" id="save-shared-btn">
            Save to my account
          </button>
        </div>

        <!-- Gear list -->
        <div class="card">
          <div style="font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.875rem">Gear list</div>
          ${gearHtml || '<p style="color:var(--text-3);font-size:13px">No gear items in this list.</p>'}
        </div>

        ${payload._shared_food_plan ? (() => {
          const mp = payload._shared_food_plan;
          const meals = mp.meals || [];
          const totalCal = meals.reduce((s, m) => s + (m.cal || 0), 0);
          const totalW = meals.reduce((s, m) => s + (m.weight_g || 0), 0);
          const dayCount = mp.days || 1;
          const nightCount = mp.nights ?? (dayCount - 1);

          const mealsByDay = {};
          meals.forEach(m => {
            if (!mealsByDay[m.day]) mealsByDay[m.day] = [];
            mealsByDay[m.day].push(m);
          });

          const dayHtml = Array.from({length: dayCount}, (_, i) => i + 1).map(day => {
            const dayMeals = mealsByDay[day] || [];
            const dayCal = dayMeals.reduce((s, m) => s + (m.cal || 0), 0);
            const dayW = dayMeals.reduce((s, m) => s + (m.weight_g || 0), 0);
            return `
              <div style="margin-bottom:.75rem;padding:.75rem;background:var(--surface-2);border-radius:var(--r-md)">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.375rem">
                  <span style="font-weight:500;font-size:13px">Day ${day}</span>
                  <span style="font-size:12px;color:var(--text-3)">${dayCal ? dayCal.toLocaleString() + ' cal · ' + wg(dayW) : 'No meals'}</span>
                </div>
                ${dayMeals.length > 0 ? `
                  <div style="font-size:12px;color:var(--text-2);display:flex;flex-direction:column;gap:3px">
                    ${dayMeals.map(m => `<div>• ${esc(m.name || m.recipe_name || 'Meal')}</div>`).join('')}
                  </div>` : ''}
              </div>`;
          }).join('');

          return `
            <div class="card" style="margin-top:1.5rem">
              <div style="font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.875rem">Meal plan</div>
              <div style="display:flex;gap:20px;font-size:13px;margin-bottom:1rem;flex-wrap:wrap">
                <span><strong>${esc(mp.name || 'Meal Plan')}</strong></span>
                <span><strong>${dayCount}</strong> days</span>
                <span>Total: <strong class="mono">${totalCal.toLocaleString()} cal</strong></span>
                <span><strong class="mono">${wg(totalW)}</strong> food</span>
              </div>
              <div>${dayHtml}</div>
            </div>`;
        })() : ''}

        <p style="text-align:center;font-size:12px;color:var(--text-3);margin-top:1.5rem">
          Shared via <a href="${window.location.pathname}" style="color:var(--accent)">Gearnomic</a>
        </p>
      </div>
    </div>`;

  // Wire save button via addEventListener — avoids embedding structured data in HTML attributes.
  document.getElementById('save-shared-btn')?.addEventListener('click', () => saveSharedToProfile(data.id));
}

async function saveSharedToProfile(token) {
  // Check auth first
  if (!_supabaseReady() || !_user) {
    // Store token, show auth modal, resume after sign-in
    window._pendingShareToken = token;
    hideSharedOverlay();
    showAuthModal();
    toast('Sign in to save this list to your account.');
    return;
  }
  await _doSaveShared(token);
}

async function _doSaveShared(token) {
  const { data, error } = await _sb.from('shared_lists')
    .select('kind,title,payload')
    .eq('id', token)
    .single();

  if (error || !data) { toast('Could not load the shared list.'); return; }

  const payload = data.payload;
  const sharedItems = payload._shared_items || [];

  // Merge new items into the user's closet (match on name+brand to avoid dupes)
  const addedIds = {};
  sharedItems.forEach(srcItem => {
    const exists = state.items.find(i =>
      i.name.toLowerCase() === srcItem.name.toLowerCase() &&
      (i.brand || '').toLowerCase() === (srcItem.brand || '').toLowerCase()
    );
    const targetId = exists ? exists.id : (() => {
      const newItem = { ...srcItem, id: uid('i'), custom_values: {} };
      state.items.push(newItem);
      return newItem.id;
    })();
    addedIds[srcItem.id] = targetId;
  });

  // Build template from shared trip/template — remap gear IDs
  const tmpl = {
    id:           uid('tmpl'),
    name:         payload.name || data.title,
    description:  payload.description || `Imported from a shared ${data.kind}.`,
    trip_type:    payload.trip_type || 'backpacking',
    gear_ids:     (payload.gear_ids || []).map(id => addedIds[id]).filter(Boolean),
    carry_types:  {},
    created_from: null,
    created_at:   new Date().toISOString().slice(0, 10),
  };

  // Remap carry types
  Object.entries(payload.carry_types || {}).forEach(([oldId, ct]) => {
    if (addedIds[oldId]) tmpl.carry_types[addedIds[oldId]] = ct;
  });

  state.templates.push(tmpl);
  saveState();
  hideSharedOverlay();
  refreshAll();
  showTab('templates');
  activeTemplateId = tmpl.id;
  renderTemplates();
  toast(`"${tmpl.name}" saved to your Templates! ${sharedItems.length} gear item(s) added to your Closet.`);
}

function hideSharedOverlay() {
  document.getElementById('share-overlay')?.remove();
  // Clear the hash without reloading
  history.replaceState(null, '', window.location.pathname);
}

// ============================================================
function refreshAll() {
  renderDashboard();
  if (currentTab !== 'dashboard') showTab(currentTab);
}

function exitImpersonate() {
  if (confirm('Exit admin mode? Any unsaved changes will be lost.')) {
    window._adminImpersonateMode = false;
    window.close();
  }
}

function setupListeners() {
  // Flush any pending cloud sync immediately when the user hides the tab or
  // navigates away, so a quick refresh doesn't lose unsaved gear.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && _syncTimer) {
      clearTimeout(_syncTimer);
      _syncTimer = null;
      syncToCloud();
    }
  }, { once: false });
  window.addEventListener('beforeunload', () => {
    if (_syncTimer) {
      clearTimeout(_syncTimer);
      _syncTimer = null;
      syncToCloud();
    }
  });

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
}

// ── Loadout routing ────────────────────────────────────────

function getOrCreateMyKit() {
  let kit = state.templates.find(t => t.name === 'My Kit');
  if (!kit) {
    kit = {
      id:          uid('tmpl'),
      name:        'My Kit',
      description: '',
      trip_type:   'backpacking',
      gear_ids:    [],
      carry_types: {},
      created_at:  new Date().toISOString().slice(0, 10),
      updated_at:  new Date().toISOString().slice(0, 10),
    };
    state.templates.push(kit);
    saveState();
  }
  return kit;
}

function routeOnLoad() {
  // Don't hijack the share overlay or admin impersonation view
  if (window.location.hash.startsWith('#share=') || window._adminImpersonateMode) return;

  if (state.items.length === 0) {
    // New user: create My Kit and open it in the loadout builder
    const kit = getOrCreateMyKit();
    _myKitId = kit.id;
    showTab('templates');
    setTimeout(() => openTemplateDetail(kit.id), 50);
  } else if (state.templates.length > 0) {
    // Returning user: open the most recently modified loadout
    const lastId = localStorage.getItem('gn_last_loadout_id');
    const target = (lastId && state.templates.find(t => t.id === lastId))
      || [...state.templates].sort((a, b) =>
           (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || '')
         )[0];
    showTab('templates');
    setTimeout(() => openTemplateDetail(target.id), 50);
  } else {
    // Gear exists but no loadouts yet — show empty loadout builder
    showTab('templates');
  }
}

// ── Public profile renderer ───────────────────────────────
async function renderPublicProfile(slug) {
  document.title = '@' + slug + ' — Gearnomic';

  const st = document.createElement('style');
  st.textContent = `
    body{background:#EDE8DF!important;margin:0}
    .pp-head{background:#fff;border-bottom:1px solid #DDD6C8;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10}
    .pp-logo{display:flex;align-items:center;gap:10px;text-decoration:none;color:#18181A;font-weight:600;font-size:15px;font-family:-apple-system,BlinkMacSystemFont,'DM Sans',sans-serif}
    .pp-logo-mark{width:28px;height:28px;background:#2A4032;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff}
    .pp-cta{padding:6px 16px;background:#2A4032;color:#fff;border-radius:8px;font-size:13px;font-weight:500;text-decoration:none}
    .pp-page{max-width:720px;margin:0 auto;padding:32px 20px 64px;font-family:-apple-system,BlinkMacSystemFont,'DM Sans',sans-serif;color:#18181A}
    .pp-card{background:#fff;border-radius:16px;padding:28px;margin-bottom:20px;border:1px solid #DDD6C8}
    .pp-avatar{width:72px;height:72px;border-radius:50%;background:#3D6B4F;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:600;color:#fff;margin-bottom:16px;overflow:hidden;flex-shrink:0}
    .pp-username{font-size:22px;font-weight:600;font-family:Fraunces,Georgia,serif;margin-bottom:2px}
    .pp-displayname{font-size:14px;color:#5A5A52;margin-bottom:10px}
    .pp-badges{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
    .pp-badge{display:inline-block;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:.04em}
    .pp-bio{font-size:14px;color:#5A5A52;line-height:1.6;margin-bottom:14px;white-space:pre-wrap}
    .pp-socials{display:flex;flex-wrap:wrap;gap:8px}
    .pp-social{display:inline-flex;align-items:center;padding:5px 12px;border:1px solid #DDD6C8;border-radius:8px;font-size:13px;color:#18181A;text-decoration:none}
    .pp-social:hover{border-color:#2A4032}
    .pp-section{background:#fff;border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid #DDD6C8}
    .pp-section-title{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:#9A9A87;margin-bottom:14px}
    .pp-loadout{padding:10px 0;border-bottom:.5px solid #DDD6C8}
    .pp-loadout:last-child{border-bottom:none;padding-bottom:0}
    .pp-gear-row{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:.5px solid #DDD6C8}
    .pp-gear-row:last-child{border-bottom:none}
    .pp-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}
    .pp-stat{background:#F7F3ED;border-radius:10px;padding:12px;text-align:center}
    .pp-stat-val{font-size:22px;font-weight:600;color:#2A4032}
    .pp-stat-lbl{font-size:11px;color:#9A9A87;margin-top:3px}`;
  document.head.appendChild(st);

  document.body.innerHTML = `
    <div class="pp-head">
      <a class="pp-logo" href="/"><div class="pp-logo-mark">GN</div>Gearnomic</a>
      <a class="pp-cta" href="/">Track your kit →</a>
    </div>
    <div class="pp-page"><div id="pp-root" style="text-align:center;padding:60px;color:#9A9A87">Loading…</div></div>`;

  const root = document.getElementById('pp-root');

  if (!_supabaseReady()) { root.innerHTML = '<p>Could not connect.</p>'; return; }

  const { data: p } = await Promise.race([
    _sb.from('profiles').select('*').eq('username', slug).single(),
    new Promise(r => setTimeout(() => r({ data: null }), 8000)),
  ]).catch(() => ({ data: null }));

  if (!p) {
    root.innerHTML = `<div style="text-align:center;padding:60px">
      <h2 style="font-size:22px;margin-bottom:8px">@${esc(slug)} not found</h2>
      <p style="color:#9A9A87;margin-bottom:16px">This username doesn't exist on Gearnomic.</p>
      <a href="/" style="color:#2A4032">← Back to Gearnomic</a></div>`;
    return;
  }

  document.title = `${p.display_name || '@' + p.username} — Gearnomic`;

  const badge = (() => {
    if (p.is_ambassador) return '<span class="pp-badge" style="background:#6a3db8;color:#fff">AMBASSADOR</span>';
    if (p.is_supporter) {
      if (p.supporter_since && p.supporter_since < FOUNDER_CUTOFF)
        return '<span class="pp-badge" style="background:#B87B0A;color:#fff">FOUNDER</span>';
      return '<span class="pp-badge" style="background:#2A4032;color:#fff">SUPPORTER</span>';
    }
    return '';
  })();

  const initials = (p.display_name || p.username || '').split(/\s+/).map(w => w[0]?.toUpperCase()).join('').slice(0,2) || '?';
  const avatarHtml = p.avatar_url
    ? `<img src="${esc(p.avatar_url)}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;display:block">`
    : esc(initials);

  const socials = [];
  [['social_strava','Strava'],['social_instagram','Instagram'],['social_youtube','YouTube'],['social_website','Website']].forEach(([k,l]) => {
    if (!p[k]) return;
    const href = p[k].startsWith('http') ? p[k] : 'https://' + p[k];
    socials.push(`<a class="pp-social" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(l)}</a>`);
  });
  (p.custom_links||[]).filter(cl => cl.enabled && cl.url).forEach(cl => {
    const href = cl.url.startsWith('http') ? cl.url : 'https://' + cl.url;
    socials.push(`<a class="pp-social" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(cl.label||'Link')}</a>`);
  });

  const loadoutsSection = (p.public_loadouts && p.snap_loadouts?.length) ? `
    <div class="pp-section">
      <div class="pp-section-title">Featured loadouts</div>
      ${p.snap_loadouts.map(l => `<div class="pp-loadout">
        <div style="font-weight:500;font-size:14px">${esc(l.name)}</div>
        <div style="font-size:12px;color:#9A9A87">${l.items_count} items · ${wg(l.total_weight_g)}${l.description?' · '+esc(l.description):''}</div>
      </div>`).join('')}
    </div>` : '';

  const tripsSection = (p.public_trips && p.snap_trips) ? `
    <div class="pp-section">
      <div class="pp-section-title">Adventure stats</div>
      <div class="pp-stats">
        ${p.snap_trips.total_trips!=null?`<div class="pp-stat"><div class="pp-stat-val">${p.snap_trips.total_trips}</div><div class="pp-stat-lbl">Trips</div></div>`:''}
        ${p.snap_trips.completed!=null?`<div class="pp-stat"><div class="pp-stat-val">${p.snap_trips.completed}</div><div class="pp-stat-lbl">Completed</div></div>`:''}
        ${p.snap_trips.total_distance?`<div class="pp-stat"><div class="pp-stat-val">${p.snap_trips.total_distance}</div><div class="pp-stat-lbl">km hiked</div></div>`:''}
      </div>
    </div>` : '';

  const gearSection = (p.public_gear && p.snap_gear?.length) ? `
    <div class="pp-section">
      <div class="pp-section-title">Gear list</div>
      ${p.snap_gear.map(g => `<div class="pp-gear-row">
        <div><div style="font-size:13px;font-weight:500">${esc(g.name)}</div>
        <div style="font-size:11px;color:#9A9A87">${esc(g.brand||'')}${g.brand&&g.category?' · ':''}${esc(g.category||'')}</div></div>
        <div style="font-size:12px;font-family:monospace;color:#5A5A52">${wg(g.weight_g)}</div>
      </div>`).join('')}
    </div>` : '';

  const hasContent = loadoutsSection || tripsSection || gearSection || (p.public_bio && p.bio) || socials.length;

  root.outerHTML = `
    <div class="pp-card">
      <div class="pp-avatar">${avatarHtml}</div>
      <div class="pp-username">@${esc(p.username)}</div>
      ${p.display_name?`<div class="pp-displayname">${esc(p.display_name)}</div>`:''}
      ${badge?`<div class="pp-badges">${badge}</div>`:''}
      ${p.public_bio&&p.bio?`<div class="pp-bio">${esc(p.bio)}</div>`:''}
      ${socials.length?`<div class="pp-socials">${socials.join('')}</div>`:''}
    </div>
    ${loadoutsSection}${tripsSection}${gearSection}
    ${!hasContent?`<div class="pp-section" style="text-align:center;padding:32px"><p style="color:#9A9A87">This profile is private.</p></div>`:''}
    <div style="text-align:center;margin-top:24px;font-size:12px;color:#9A9A87">Built with <a href="/" style="color:#2A4032">Gearnomic</a></div>`;
}

document.addEventListener('DOMContentLoaded', async () => {
  // ── Public profile check — must run before anything else ─────────────
  const _pubSlug = (() => {
    const s = window.location.pathname.slice(1).split('/')[0].toLowerCase();
    return (s && !RESERVED_USERNAMES.has(s) && /^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/.test(s)) ? s : null;
  })();
  if (_pubSlug) { await renderPublicProfile(_pubSlug); return; }

  // ── Admin impersonation mode ───────────────────────────
  const hash = window.location.hash;
  // ── Admin impersonation mode ─────────────────────────────
  // Triggered by ?imp=TOKEN in the URL (set by admin.html's doImpersonate()).
  // The token is the localStorage key holding the payload — URL-carried token
  // avoids all window.opener cross-origin-policy and sessionStorage tab-scoping issues.
  const _impToken = new URLSearchParams(window.location.search).get('imp');
  if (_impToken) {
    const _storageKey = 'gn_imp_' + _impToken;
    let _impPayload = null;
    try {
      // Primary: window.opener — direct memory reference, works for file:// and
      // hosted URLs without Cross-Origin-Opener-Policy headers.
      if (window.opener && window.opener._pendingImpersonation) {
        _impPayload = window.opener._pendingImpersonation;
        window.opener._pendingImpersonation = null;
        console.log('[imp] payload from window.opener');
      }
      // Fallback: localStorage (may not work reliably on file:// in Firefox/Safari)
      if (!_impPayload) {
        const raw = localStorage.getItem(_storageKey);
        localStorage.removeItem(_storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Date.now() - (parsed.timestamp || 0) < 60000) {
            _impPayload = parsed;
            console.log('[imp] payload from localStorage');
          }
        }
      }
      if (!_impPayload) console.warn('[imp] no payload found — opener:', window.opener, 'ls key:', _storageKey);
    } catch(e) { console.warn('[imp] error reading payload:', e); }

    if (_impPayload) {
      try {
        const payload = _impPayload;
        state = payload.data || {};
        applyMigrations();
        _isSupporter = payload.isSupporter || false;

        // Service-role Supabase client for writing back to the impersonated user's row.
        // adminKey is only present when the payload came via window.opener (in-memory).
        // If it arrived via the localStorage fallback it will be absent — prompt for it.
        let adminKey = payload.adminKey;
        if (!adminKey && payload.adminUrl) {
          adminKey = window.prompt('Admin session opened via fallback channel.\nEnter the service-role key to enable saves:') || '';
        }
        if (payload.adminUrl && adminKey && typeof supabase !== 'undefined') {
          window._adminSb = supabase.createClient(payload.adminUrl, adminKey,
            { auth: { autoRefreshToken: false, persistSession: false } });
        }

        // Persistent admin banner
        const banner = document.createElement('div');
        banner.id = 'admin-impersonate-banner';
        banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#6a3db8;color:#fff;padding:8px 20px;font-size:13px;font-weight:500;display:flex;align-items:center;gap:12px;box-shadow:0 2px 8px rgba(0,0,0,.2)';
        banner.innerHTML = `
          <span style="background:rgba(255,255,255,.2);padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;letter-spacing:.06em">ADMIN MODE</span>
          <span>Viewing account: <strong>${esc(payload.email)}</strong></span>
          <span style="font-size:12px;opacity:.75">Any saves will write to their Supabase account</span>
          <button onclick="exitImpersonate()" style="margin-left:auto;padding:5px 14px;background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.3);border-radius:6px;color:#fff;font-size:12px;cursor:pointer">Exit admin mode</button>`;
        document.body.prepend(banner);
        const siteHeader = document.getElementById('site-header');
        if (siteHeader) siteHeader.style.top = banner.offsetHeight + 'px';

        window._adminImpersonateUserId = payload.userId;
        window._adminImpersonateUrl    = payload.adminUrl;
        window._adminImpersonateMode   = true;

        refreshAll();
        syncUnitBtns();
        setupListeners();
        // Remove the ?imp= token from the URL bar without triggering a reload
        history.replaceState(null, '', window.location.pathname);
        return; // ← skip ALL normal auth flow below
      } catch(e) {
        console.error('Admin impersonation setup failed:', e);
        alert('Impersonation error — ' + (e.message || e) + '\n\nCheck the browser console for details.');
      }
    } else {
      alert('Impersonation failed: could not read account data.\n\nMake sure popups are allowed and try again.');
    }
    // On failure fall through to normal Gearnomic auth flow
  }

  // Check for shared list link FIRST — before loading normal app state
  const shareToken = hash.startsWith('#share=') ? hash.slice(7) : null;

  // Load local data so the app is ready in the background
  loadState();
  syncUnitBtns();
  setupListeners();

  // Footer
  const yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
  updateChangelogDot();
  document.getElementById('dash-date').textContent =
    new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // ── Supabase auth ─────────────────────────────────────────
  if (!_supabaseReady()) {
    document.getElementById('auth-loading-indicator').style.display = 'none';
    document.getElementById('auth-anon-actions').style.display = 'flex';
    setSyncIndicator('offline');
    if (shareToken) handleShareHash(shareToken);
    else routeOnLoad();
    return;
  }

  let session = null;
  try {
    const res = await Promise.race([
      _sb.auth.getSession(),
      new Promise(r => setTimeout(() => r({ data: { session: null } }), 5000)),
    ]);
    session = res?.data?.session ?? null;
  } catch(e) { console.warn('[auth] getSession error:', e); }

  if (session?.user) {
    _user = session.user;
    const loaded = await Promise.race([
      loadFromCloud(),
      new Promise(r => setTimeout(() => r(false), 8000)),
    ]);
    if (loaded) refreshAll();
  }
  updateHeaderAuth();

  if (shareToken) handleShareHash(shareToken);
  else routeOnLoad();

  if (typeof loadCompareFromUrl === 'function') loadCompareFromUrl();

  // React to sign-in / sign-out / password recovery events
  _sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      _user = session?.user || null;
      showAuthModal();
      ['auth-tab-signin','auth-tab-signup','auth-submit-btn','forgot-panel'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      document.getElementById('recovery-panel').style.display = 'block';
      document.getElementById('auth-error').style.display = 'none';
      setTimeout(() => document.getElementById('new-password')?.focus(), 100);
      return;
    }

    if (event === 'SIGNED_IN' && session?.user) {
      _user = session.user;
      hideAuthModal();
      hideSavePromptBanner();
      const cloudLoaded = await loadFromCloud(); // also sets _isSupporter
      if (!cloudLoaded) {
        // Brand new user — no cloud data yet.
        // Reset to a clean empty state (don't keep the demo data).
        state = {
          items:         [],
          trips:         [],
          wishlist:      [],
          categories:    JSON.parse(JSON.stringify(SEED_DATA.categories)),
          templates:     [],
          trip_types:    JSON.parse(JSON.stringify(SEED_DATA.trip_types)),
          food_plans:    [JSON.parse(JSON.stringify(DEMO_FOOD_PLAN))],
          recipes:       JSON.parse(JSON.stringify(SEED_DATA.recipes)),
          custom_fields: [],
          profile:       { units: _units },
        };
        await loadSupporterStatus();
        await syncToCloud(); // save clean state to cloud
        saveState();         // update localStorage too
      }
      loadProfile().catch(() => {}); // non-blocking
      refreshAll();
      updateHeaderAuth();
      toast('Signed in! Your data is syncing.');

      // Route to the right loadout surface after sign-in
      if (!window._pendingShareToken) routeOnLoad();

      // Resume a pending share save if the user signed in to save a shared list
      if (window._pendingShareToken) {
        const t = window._pendingShareToken;
        window._pendingShareToken = null;
        await _doSaveShared(t);
      }
    } else if (event === 'SIGNED_OUT') {
      _user = null;
      updateHeaderAuth();
    }
  });
});
