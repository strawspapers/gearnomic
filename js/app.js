// ============================================================
// Gearnomic — Application Logic
// ============================================================

// ── Supabase ────────────────────────────────────────────────
let _sb = null;           // Supabase client
let _user = null;         // current auth.User
let _syncTimer = null;    // debounce handle
let _isSupporter = false; // paid supporter status

// ── Free tier limits ─────────────────────────────────────────
const FREE_LIMITS = {
  items:     30,
  trips:     3,
  templates: 2,
};

// Returns true if the user can proceed; false + shows upgrade modal if not.
// pass `count` = current count, `kind` = 'items'|'trips'|'templates'
function checkLimit(kind, count) {
  if (_isSupporter) return true;
  const limit = FREE_LIMITS[kind];
  if (limit == null || count < limit) return true;
  const labels = { items: 'gear items', trips: 'trips', templates: 'loadouts' };
  openUpgradeModal(`Free accounts include up to ${limit} ${labels[kind] || kind}. Upgrade to add unlimited ${labels[kind] || kind}.`);
  return false;
}

// Shows upgrade modal for features that are entirely Supporter-only.
// Returns true if supporter, false + modal if not.
function requireSupporter(featureName) {
  if (_isSupporter) return true;
  openUpgradeModal(`${featureName} is a Supporter feature. Upgrade to unlock it.`);
  return false;
}

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
  // Cloud sync only for Supporters
  if (_user && _isSupporter) {
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(syncToCloud, 1500);
  }
}

async function syncToCloud() {
  if (!_supabaseReady() || !_user || !_isSupporter) return;
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
      .select('data,is_supporter,supporter_since').eq('user_id', _user.id).single();
    if (error || !data?.data) return false;
    _isSupporter = !!data.is_supporter;
    state = data.data;
    applyMigrations();
    try { localStorage.setItem('trailkit_v1', JSON.stringify(state)); } catch(e) {}
    return true;
  } catch(e) { return false; }
}

// Called after sign-in to fetch supporter status without overwriting local state
async function loadSupporterStatus() {
  if (!_supabaseReady() || !_user) return;
  try {
    const { data } = await _sb.from('user_data')
      .select('is_supporter').eq('user_id', _user.id).single();
    _isSupporter = !!(data?.is_supporter);
  } catch(e) { _isSupporter = false; }
}

function applyMigrations() {
  if (!state.templates)     state.templates     = [];
  if (!state.trip_types)    state.trip_types    = JSON.parse(JSON.stringify(SEED_DATA.trip_types));
  // Always ensure all built-in system types exist — they may have been lost
  // if trip_types was saved as an empty array or before the system types were added
  SEED_DATA.trip_types.forEach(sys => {
    if (!state.trip_types.find(t => t.value === sys.value)) {
      state.trip_types.unshift({ ...sys });
    }
  });
  if (!state.categories)    state.categories    = JSON.parse(JSON.stringify(SEED_DATA.categories));
  if (!state.food_plans)    state.food_plans    = [];
  // Ensure demo food plan exists so free users can explore the feature
  if (!state.food_plans.find(p => p.id === 'fp_demo')) {
    state.food_plans.unshift(JSON.parse(JSON.stringify(DEMO_FOOD_PLAN)));
  }
  if (!state.recipes)       state.recipes       = JSON.parse(JSON.stringify(SEED_DATA.recipes));
  if (!state.custom_fields) state.custom_fields = [];
  state.categories.forEach((cat, i) => {
    if (!cat.color) cat.color = SEED_DATA.categories[i]?.color || '#888';
  });
  state.templates.forEach(t => { if (!t.carry_types) t.carry_types = {}; });
  // Apply saved unit preference
  if (state.profile?.units) _units = state.profile.units;

  // ── Migration: trip.gear_ids → loadout_ids ──────────────────
  // Any trip that still has gear_ids (old model) gets an auto-created
  // loadout so no gear is lost. The trip then references it via loadout_ids.
  state.trips.forEach(t => {
    if (!t.carry_types)  t.carry_types  = {};
    if (!t.meal_plan_id) t.meal_plan_id = null;

    if (t.gear_ids && t.gear_ids.length && !t.loadout_ids) {
      // Create an auto-loadout from the trip's existing gear list
      const autoLoadout = {
        id:           uid('tmpl'),
        name:         t.name + ' — Gear',
        description:  'Automatically created from trip gear list.',
        trip_type:    t.trip_type || 'backpacking',
        gear_ids:     [...t.gear_ids],
        carry_types:  { ...(t.carry_types || {}) },
        created_from: t.id,
        created_at:   new Date().toISOString().slice(0, 10),
      };
      state.templates.push(autoLoadout);
      t.loadout_ids = [autoLoadout.id];
    } else if (!t.loadout_ids) {
      t.loadout_ids = [];
    }
    // Remove old fields now that migration is done
    delete t.gear_ids;
    delete t.carry_types;
    delete t.gear_overrides;
  });
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
  // First visit — start with demo data so new users can explore the app.
  // Generic labeled items only (no personal data).
  const demoItems = JSON.parse(JSON.stringify(DEMO_DATA.items));
  const demoTrip  = JSON.parse(JSON.stringify(DEMO_DATA.trip));
  const demoTmpl  = JSON.parse(JSON.stringify(DEMO_DATA.template));

  state = {
    items:         demoItems,
    trips:         [demoTrip],
    wishlist:      [],
    categories:    JSON.parse(JSON.stringify(SEED_DATA.categories)),
    templates:     [demoTmpl],
    trip_types:    JSON.parse(JSON.stringify(SEED_DATA.trip_types)),
    food_plans:    [JSON.parse(JSON.stringify(DEMO_FOOD_PLAN))],
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
    const oz = g / 28.3495;
    return oz >= 16 ? `${(oz / 16).toFixed(2)} lb` : `${oz.toFixed(1)} oz`;
  }
  return `${(g / 28.3495).toFixed(1)} oz`;
}
function toggleUnits() {
  _units = _units === 'metric' ? 'imperial' : 'metric';
  const btn = document.getElementById('unit-toggle-btn');
  if (btn) btn.textContent = _units === 'metric' ? 'g' : 'oz';
  // Persist to profile
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
const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

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
  return tripUniqueItems(trip).reduce((s, item) => s + (item.weight_g || 0), 0);
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
let currentTab = 'dashboard';

function showTab(name) {
  if (currentTab === 'gear' && name !== 'gear' && _bulkMode) {
    _bulkMode = false;
    _bulkSelected.clear();
  }
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
  openModal('Manage trip types', `
    <p style="font-size:13px;color:var(--text-2);margin-bottom:1rem">
      Built-in types can't be removed. Custom types can be deleted — trips using them keep their stored value.
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
  // Refresh the custom list in-place without closing the modal
  const listEl = document.getElementById('mtt-custom-list');
  if (listEl) {
    const custom = state.trip_types.filter(t => !t.system);
    listEl.innerHTML = custom.map(t =>
      `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border-radius:var(--r-md);border:1px solid var(--border);margin-bottom:4px;font-size:13px">
        <span>${esc(t.label)}</span>
        <button class="btn btn-xs btn-danger" onclick="deleteTripType('${esc(t.value)}')">Delete</button>
      </div>`).join('');
  }
  input.focus();
}

function deleteTripType(value) {
  const t = state.trip_types.find(t => t.value === value);
  if (!t || t.system) return;
  if (!confirm(`Delete trip type "${t.label}"?`)) return;
  state.trip_types = state.trip_types.filter(t => t.value !== value);
  saveState();
  toast(`"${t.label}" deleted.`);
  // Refresh the list in-place
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
// GEAR CLOSET
// ============================================================
let gearExpandedId = null;
let showMiscCol    = false;

// ── Column visibility ─────────────────────────────────────
const DEFAULT_COLS = new Set(['name','category','weight','cost','dpg','condition','usage']);
let _visibleCols = new Set(DEFAULT_COLS);

function openColumnChooser() {
  const allCols = [
    { id: 'category',  label: 'Category' },
    { id: 'cost',      label: 'Cost' },
    { id: 'dpg',       label: '$/gram' },
    { id: 'condition', label: 'Condition' },
    { id: 'usage',     label: 'Usage' },
  ];
  const rows = allCols.map(c => `
    <label style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:.5px solid var(--border-2);cursor:pointer;font-size:13px">
      <input type="checkbox" ${_visibleCols.has(c.id) ? 'checked' : ''}
        onchange="toggleCol('${c.id}',this.checked)"
        style="width:16px;height:16px;accent-color:var(--primary)">
      ${c.label}
    </label>`).join('');

  openModal('Columns', `
    <p style="font-size:13px;color:var(--text-2);margin-bottom:.75rem">Choose which columns appear in the Gear Closet. Name and Weight are always shown.</p>
    ${rows}
    <div class="form-actions">
      <button class="btn btn-ghost btn-sm" onclick="resetCols()">Reset to default</button>
      <button class="btn btn-ghost" onclick="closeModal()">Done</button>
    </div>`);
}

function toggleCol(colId, visible) {
  if (visible) _visibleCols.add(colId);
  else _visibleCols.delete(colId);
  renderGear();
}

function resetCols() {
  _visibleCols = new Set(DEFAULT_COLS);
  closeModal();
  renderGear();
}

// ── Bulk actions ──────────────────────────────────────────
let _bulkSelected = new Set();
let _bulkMode = false;

function toggleBulkMode() {
  _bulkMode = !_bulkMode;
  if (!_bulkMode) _bulkSelected.clear();
  const btn = document.getElementById('btn-bulk-select');
  const bar = document.getElementById('bulk-bar');
  if (btn) {
    btn.textContent = _bulkMode ? 'Done' : 'Bulk update';
    btn.classList.toggle('btn-primary', _bulkMode);
  }
  if (bar) bar.style.display = _bulkMode ? 'flex' : 'none';
  renderGear();
}

function toggleItemSelect(itemId) {
  if (_bulkSelected.has(itemId)) _bulkSelected.delete(itemId);
  else _bulkSelected.add(itemId);
  updateBulkCount();
  // Sync checkbox and row highlight
  const row = document.querySelector(`tr[data-item-id="${itemId}"]`);
  if (row) {
    row.classList.toggle('bulk-selected', _bulkSelected.has(itemId));
    const cb = row.querySelector('.bulk-checkbox');
    if (cb) cb.checked = _bulkSelected.has(itemId);
  }
  // Also sync mobile card
  const card = document.querySelector(`.gear-card[data-item-id="${itemId}"]`);
  if (card) {
    card.classList.toggle('bulk-selected', _bulkSelected.has(itemId));
    const cb = card.querySelector('.bulk-checkbox');
    if (cb) cb.checked = _bulkSelected.has(itemId);
  }
}

function bulkSelectAll() {
  document.querySelectorAll('[data-item-id]').forEach(el => {
    const id = el.dataset.itemId;
    if (id) {
      _bulkSelected.add(id);
      el.classList.add('bulk-selected');
    }
  });
  updateBulkCount();
}

function updateBulkCount() {
  const el = document.getElementById('bulk-count');
  if (el) el.textContent = `${_bulkSelected.size} item${_bulkSelected.size !== 1 ? 's' : ''} selected`;
}

function clearBulkSelection() {
  _bulkSelected.clear();
  _bulkMode = false;
  const btn = document.getElementById('btn-bulk-select');
  const bar = document.getElementById('bulk-bar');
  if (btn) { btn.textContent = 'Bulk update'; btn.classList.remove('btn-primary'); }
  if (bar) bar.style.display = 'none';
  renderGear();
}

function bulkDelete() {
  const count = _bulkSelected.size;
  if (!count) { toast('No items selected.'); return; }
  if (!confirm(`Delete ${count} item${count !== 1 ? 's' : ''}? This cannot be undone.`)) return;
  state.items = state.items.filter(i => !_bulkSelected.has(i.id));
  state.templates.forEach(t => {
    t.gear_ids = (t.gear_ids || []).filter(id => !_bulkSelected.has(id));
    if (t.carry_types) _bulkSelected.forEach(id => delete t.carry_types[id]);
  });
  saveState();
  clearBulkSelection();
  if (currentTab === 'dashboard') renderDashboard();
  toast(`${count} item${count !== 1 ? 's' : ''} deleted.`);
}

function bulkRecategorize() {
  const count = _bulkSelected.size;
  if (!count) { toast('No items selected.'); return; }
  const cats = categoryNames();
  openModal('Move to category', `
    <p style="font-size:13px;color:var(--text-2);margin-bottom:.75rem">
      Move <strong>${count} item${count !== 1 ? 's' : ''}</strong> to:
    </p>
    <div style="display:flex;flex-direction:column;gap:5px;max-height:50vh;overflow-y:auto">
      ${cats.map(c => `
        <button class="btn" style="justify-content:flex-start;text-align:left;gap:10px"
          onclick="bulkSetCategory('${esc(c)}')">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${categoryColor(c)};flex-shrink:0"></span>
          ${esc(c)}
        </button>`).join('')}
    </div>
    <div class="form-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button></div>`);
}

function bulkSetCategory(cat) {
  state.items.forEach(i => { if (_bulkSelected.has(i.id)) i.category = cat; });
  saveState();
  closeModal();
  clearBulkSelection();
  toast(`Moved ${_bulkSelected.size || 'selected items'} to ${cat}.`);
}

function bulkAddToLoadout() {
  const count = _bulkSelected.size;
  if (!count) { toast('No items selected.'); return; }
  if (!state.templates.length) { toast('No loadouts yet. Create one first.'); return; }
  openModal('Add to loadout', `
    <p style="font-size:13px;color:var(--text-2);margin-bottom:.75rem">
      Add <strong>${count} item${count !== 1 ? 's' : ''}</strong> to:
    </p>
    <div style="display:flex;flex-direction:column;gap:5px;max-height:50vh;overflow-y:auto">
      ${state.templates.map(l => {
        const lw = (l.gear_ids||[]).reduce((s,id) => {
          const item = state.items.find(i=>i.id===id); return s+(item?.weight_g||0);
        }, 0);
        return `<button class="btn" style="justify-content:space-between;text-align:left"
          onclick="bulkAddItemsToLoadout('${l.id}')">
          <span>${esc(l.name)} <span style="font-size:11px;color:var(--text-3)">${(l.gear_ids||[]).length} items</span></span>
          <span class="mono" style="font-size:12px;color:var(--text-3)">${wg(lw)}</span>
        </button>`;
      }).join('')}
    </div>
    <div class="form-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button></div>`);
}

function bulkAddItemsToLoadout(loadoutId) {
  const loadout = state.templates.find(t => t.id === loadoutId);
  if (!loadout) return;
  const existing = new Set(loadout.gear_ids || []);
  _bulkSelected.forEach(id => existing.add(id));
  loadout.gear_ids = [...existing];
  saveState();
  closeModal();
  clearBulkSelection();
  toast(`Added to ${loadout.name}.`);
}

// ── Mobile card rendering ─────────────────────────────────
function renderGearCards(filtered) {
  const cardsEl = document.getElementById('gear-cards');
  if (!cardsEl) return;
  if (!filtered.length) {
    cardsEl.innerHTML = `<div class="empty-state" style="padding:2rem"><p>No items match your filters.</p><button class="btn btn-sm" onclick="clearGearFilters()">Clear filters</button></div>`;
    return;
  }
  cardsEl.innerHTML = filtered.map(item => {
    const isSel = _bulkSelected.has(item.id);
    return `<div class="gear-card ${isSel ? 'bulk-selected' : ''}" data-item-id="${item.id}"
      onclick="${_bulkMode ? `toggleItemSelect('${item.id}')` : `toggleExpand('${item.id}')`}">
      <div class="gear-card-main">
        <div style="flex:1;min-width:0">
          <div style="font-weight:500;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(item.name)}</div>
          <div style="font-size:12px;color:var(--text-3);margin-top:2px">${esc(item.brand||'')}${item.brand && item.category ? ' · ' : ''}${badge('badge-gray', item.category)}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;margin-left:12px">
          <div class="mono" style="font-size:14px;font-weight:500">${wg(item.weight_g)}</div>
          <div style="font-size:11px;color:var(--text-3)">${item.cost_usd ? usd(item.cost_usd) : ''}</div>
        </div>
        ${_bulkMode
          ? `<label style="margin-left:10px;display:flex;align-items:center;cursor:pointer" onclick="event.stopPropagation()">
              <input type="checkbox" class="bulk-checkbox"
                ${isSel ? 'checked' : ''}
                style="width:18px;height:18px;accent-color:var(--primary);cursor:pointer"
                onchange="toggleItemSelect('${item.id}')"
                onclick="event.stopPropagation()">
            </label>`
          : `<button class="btn btn-xs" style="margin-left:10px;flex-shrink:0" onclick="event.stopPropagation();openEditItem('${item.id}')">✎</button>`}
      </div>
      ${item.condition && item.condition !== '' ? `<div style="margin-top:6px">${badge(COND_BADGE[item.condition]||'badge-gray', COND_LABEL[item.condition])}</div>` : ''}
    </div>`;
  }).join('');
}

// ── Quick-add gear ─────────────────────────────────────────
function openQuickAdd() {
  openModal('Quick-add gear', `
    <p style="font-size:13px;color:var(--text-2);margin-bottom:.875rem">Add an item to your Gear Closet in seconds. Fill in more details later by clicking the item.</p>
    <div class="form-grid">
      <div class="form-row" style="grid-column:1/-1">
        <label class="form-label">Item name *</label>
        <input class="input input-full" id="qa-name" placeholder="e.g. Sleeping bag" autofocus>
      </div>
      <div class="form-row">
        <label class="form-label">Category</label>
        <select class="select input-full" id="qa-cat">${catOptions('')}</select>
      </div>
      <div class="form-row">
        <label class="form-label">${weightLabel()}</label>
        <input class="input input-full" id="qa-weight" type="number" min="0" step="${weightStep()}" placeholder="${weightPlaceholder()}">
      </div>
      <div class="form-row">
        <label class="form-label">Cost ($)</label>
        <input class="input input-full" id="qa-cost" type="number" min="0" step="0.01" placeholder="0.00">
      </div>
      <div class="form-row">
        <label class="form-label">Brand</label>
        <input class="input input-full" id="qa-brand" placeholder="e.g. Big Agnes">
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-primary" onclick="saveQuickAdd(false)">Add item</button>
      <button class="btn btn-ghost btn-sm" onclick="saveQuickAdd(true)">Add &amp; add another</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`);
}

function saveQuickAdd(addAnother) {
  if (!checkLimit('items', state.items.length)) return;
  const name = document.getElementById('qa-name')?.value.trim();
  if (!name) { document.getElementById('qa-name')?.focus(); return; }
  const item = {
    id:         uid('i'),
    name,
    brand:      document.getElementById('qa-brand')?.value.trim() || '',
    category:   document.getElementById('qa-cat')?.value || categoryNames()[0] || 'Other',
    weight_g:   displayToG(document.getElementById('qa-weight')?.value),
    cost_usd:   parseFloat(document.getElementById('qa-cost')?.value)   || 0,
    condition:  'good',
    usage_days: 0, usage_nights: 0,
  };
  state.items.push(item);
  saveState();
  if (currentTab === 'gear') renderGear();
  if (currentTab === 'dashboard') renderDashboard();
  toast(`"${name}" added!`);
  if (addAnother) openQuickAdd();
  else closeModal();
}

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
    if (sort === 'name')   return a.name.localeCompare(b.name);
    if (sort === 'usage')  return (b.usage_days || 0) - (a.usage_days || 0);
    if (sort === 'custom') return 0;
    // "Group by category" — use state.categories order, not alphabetical
    const catOrd = categoryNames();
    const ai = catOrd.indexOf(a.category); const bi = catOrd.indexOf(b.category);
    const ao = ai === -1 ? 999 : ai;      const bo = bi === -1 ? 999 : bi;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name);
  });

  const totalW = filtered.reduce((s, i) => s + (i.weight_g || 0), 0);
  const totalC = filtered.reduce((s, i) => s + (i.cost_usd || 0), 0);
  document.getElementById('gear-summary').innerHTML =
    `<strong>${filtered.length}</strong> items &nbsp;·&nbsp; total: <strong>${wg(totalW)}</strong> &nbsp;·&nbsp; tracked value: <strong>${usd(totalC)}</strong>`;

  const visibleCustomFields = (state.custom_fields || []).filter(f => f.show_column);
  const cols = 2 + (_visibleCols.has('category')?1:0) + (_visibleCols.has('cost')?1:0) +
    (_visibleCols.has('dpg')?1:0) + (_visibleCols.has('condition')?1:0) +
    (_visibleCols.has('usage')?1:0) + (showMiscCol?1:0) + visibleCustomFields.length + 1;

  document.getElementById('gear-thead').innerHTML = `<tr>
    <th style="width:28px;padding:6px 4px"></th>
    <th>Item</th>
    ${_visibleCols.has('category') ? '<th>Category</th>' : ''}
    <th>Weight</th>
    ${_visibleCols.has('cost')      ? '<th>Cost</th>'      : ''}
    ${_visibleCols.has('dpg')       ? '<th>$/gram</th>'    : ''}
    ${_visibleCols.has('condition') ? '<th>Condition</th>' : ''}
    ${_visibleCols.has('usage')     ? '<th>Usage</th>'     : ''}
    ${showMiscCol ? '<th>Misc</th>' : ''}
    ${visibleCustomFields.map(f => `<th style="min-width:80px">${esc(f.name)}${f.unit ? '<span style="font-size:10px;color:var(--text-3);font-weight:400"> '+esc(f.unit)+'</span>' : ''}</th>`).join('')}
    <th></th>
  </tr>`;

  // Render mobile cards
  renderGearCards(filtered);

  let html = '';
  let lastCat = null;
  const inCatSort    = sort === 'category';
  const inCustomSort = sort === 'custom';
  const showHandle   = inCatSort || inCustomSort;

  filtered.forEach(item => {
    if (inCatSort && item.category !== lastCat) {
      lastCat = item.category;
      // Category header: handle span (draggable) + name spanning remaining cols
      html += `<tr class="cat-header-row" data-cat="${esc(item.category)}"
        ondragover="onCatHeaderDragOver(event,'${esc(item.category)}')"
        ondragleave="onCatHeaderDragLeave(event)"
        ondrop="onCatHeaderDrop(event,'${esc(item.category)}')">
        <td style="width:28px;padding:0 4px;text-align:center">
          <span class="gear-handle cat-drag-handle"
            draggable="true"
            title="Drag to reorder this category"
            ondragstart="onCatHeaderDragStart(event,'${esc(item.category)}')"
            ondragend="onCatHeaderDragEnd()">⠿</span>
        </td>
        <td colspan="${cols - 1}">${esc(item.category)}</td>
      </tr>`;
    }
    html += gearRow(item, cols, inCatSort, inCustomSort, visibleCustomFields);
  });

  if (!filtered.length) {
    html = `<tr><td colspan="${cols}"><div class="empty-state"><p>No items match your filters.</p><button class="btn btn-sm" onclick="clearGearFilters()">Clear filters</button></div></td></tr>`;
  }

  document.getElementById('gear-tbody').innerHTML = html;
}

function gearRow(item, cols, inCatSort, inCustomSort, visibleCustomFields) {
  visibleCustomFields = visibleCustomFields || [];
  // In bulk mode, never show drag handles — show checkboxes instead
  const showHandle = !_bulkMode && (inCatSort || inCustomSort);
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

  const dragMode    = inCustomSort ? 'reorder' : 'recategorize';
  const handleFn    = inCustomSort ? `openReorderPickerMobile('${item.id}')` : `openCategoryPickerMobile('${item.id}')`;
  const handleTitle = inCustomSort ? 'Drag to reorder · Tap for options' : 'Drag to move category · Tap on mobile';
  const isBulkSel   = _bulkSelected.has(item.id);

  // First cell: drag handle, real checkbox (bulk mode), or empty
  const firstCell = showHandle
    ? `<td class="gear-handle-cell" title="${handleTitle}" onclick="event.stopPropagation();${handleFn}">
        <span class="gear-handle"
          draggable="true"
          ondragstart="onItemDragStart(event,'${item.id}','${dragMode}')"
          ondragend="onItemDragEnd()"
          onclick="event.stopPropagation();${handleFn}">⠿</span>
       </td>`
    : _bulkMode
    ? `<td style="width:36px;padding:4px;text-align:center" onclick="event.stopPropagation()">
        <input type="checkbox" class="bulk-checkbox"
          ${isBulkSel ? 'checked' : ''}
          style="width:16px;height:16px;accent-color:var(--primary);cursor:pointer;display:block;margin:auto"
          onchange="toggleItemSelect('${item.id}')"
          onclick="event.stopPropagation()">
       </td>`
    : `<td style="width:28px"></td>`;

  // In bulk mode, row click still expands (checkboxes handle selection)
  return `<tr class="expandable ${isBulkSel ? 'bulk-selected' : ''}"
    data-item-id="${item.id}"
    data-item-cat="${esc(item.category)}"
    ondragover="onRowDragOver(event,'${esc(item.category)}','${dragMode}')"
    ondragleave="onRowDragLeave(event)"
    ondrop="onRowDrop(event,'${dragMode}')"
    onclick="toggleExpand('${item.id}')">
    ${firstCell}

    ${editableCell(item, 'name',
        `<div class="item-name">${esc(item.name)}</div><div class="item-sub">${esc(item.brand || '')}</div>`,
        cellInput(item.id, 'name', item.name, 'text', 'placeholder="Item name"'))}

    ${_visibleCols.has('category') ? editableCell(item, 'category',
        badge('badge-gray', item.category),
        cellSelect(item.id, 'category', item.category,
          categoryNames().map(c => [c, c]))) : ''}

    ${editableCell(item, 'weight_g',
        `<span class="mono">${wg(item.weight_g)}</span><br><span style="font-size:10px;color:var(--text-3)">${woz(item.weight_g)}</span>`,
        cellInput(item.id, 'weight_g', item.weight_g || '', 'number', 'min="0" step="0.1" placeholder="grams"'))}

    ${_visibleCols.has('cost') ? editableCell(item, 'cost_usd',
        usd(item.cost_usd),
        cellInput(item.id, 'cost_usd', item.cost_usd || '', 'number', 'min="0" step="0.01" placeholder="0.00"')) : ''}

    ${_visibleCols.has('dpg') ? `<td class="mono" style="color:var(--text-3);font-size:12px">${dpg(item.cost_usd, item.weight_g)}</td>` : ''}

    ${_visibleCols.has('condition') ? editableCell(item, 'condition',
        badge(COND_BADGE[item.condition] || 'badge-gray', COND_LABEL[item.condition] || item.condition),
        cellSelect(item.id, 'condition', item.condition,
          [['','— (no condition)'],['excellent','Excellent'],['good','Good'],['fair','Fair'],['poor','Poor']])) : ''}

    ${_visibleCols.has('usage') ? `<td onclick="event.stopPropagation()" class="editable-cell" style="white-space:nowrap;font-size:11px">
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
    </td>` : ''}

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
      <div class="form-row"><label class="form-label">${weightLabel()}</label><input class="input input-full" id="f-weight" type="number" min="0" step="${weightStep()}" value="${gToDisplay(item.weight_g)}" placeholder="${weightPlaceholder()}"></div>
      <div class="form-row"><label class="form-label">Cost (USD)</label><input class="input input-full" id="f-cost" type="number" min="0" step="0.01" value="${item.cost_usd || ''}"></div>
      <div class="form-row">
        <label class="form-label">Condition</label>
        <select class="select input-full" id="f-cond">
          <option value=""      ${!item.condition ? 'selected' : ''}>— (no condition)</option>
          <option value="excellent" ${item.condition === 'excellent' ? 'selected' : ''}>Excellent</option>
          <option value="good"      ${item.condition === 'good' ? 'selected' : ''}>Good</option>
          <option value="fair"      ${item.condition === 'fair' ? 'selected' : ''}>Fair</option>
          <option value="poor"      ${item.condition === 'poor' ? 'selected' : ''}>Poor</option>
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
      ${item.id ? `<span style="flex:1"></span><button class="btn btn-danger" onclick="deleteItem('${item.id}')">Delete item</button>` : ''}
    </div>`;
}

function openEditItem(id) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;
  openModal('Edit gear item', itemFormHtml(item));
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-add-item').addEventListener('click', () => {
    if (!checkLimit('items', state.items.length)) return;
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
    weight_g:         displayToG(document.getElementById('f-weight').value),
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
  if (!confirm('Delete this item? It will also be removed from all loadouts.')) return;
  state.items = state.items.filter(i => i.id !== id);
  // Remove from all loadouts (templates) that reference this item
  state.templates.forEach(t => {
    t.gear_ids = (t.gear_ids || []).filter(x => x !== id);
    if (t.carry_types) delete t.carry_types[id];
  });
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
  const planning  = state.trips.filter(t => t.status === 'planning');
  const confirmed = state.trips.filter(t => t.status === 'confirmed');
  const past      = state.trips.filter(t => t.status === 'completed' || t.status === 'cancelled');

  document.getElementById('trips-summary').textContent =
    `${state.trips.length} trip${state.trips.length !== 1 ? 's' : ''} · ${planning.length} planning · ${confirmed.length} confirmed`;

  function section(label, badgeCls, trips) {
    if (!trips.length) return '';
    return `<div style="margin-bottom:1.5rem">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:.625rem">
        <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--text-3)">${label}</span>
        <span class="badge ${badgeCls}">${trips.length}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${trips.map(t => tripCard(t)).join('')}
      </div>
    </div>`;
  }

  const html = state.trips.length
    ? section('Planning',   'badge-amber', planning)
    + section('Confirmed',  'badge-blue',  confirmed)
    + section('Past trips', 'badge-gray',  past)
    : `<div class="empty-state"><p>No trips yet. Plan your first adventure!</p>
       <button class="btn btn-primary" onclick="document.getElementById('btn-add-trip').click()">+ New Trip</button></div>`;

  document.getElementById('trips-grid').innerHTML = html;

  if (activeTripId) {
    const still = state.trips.find(t => t.id === activeTripId);
    if (still) renderTripDetail(still); else closeTripDetail();
  }
}

function tripCard(t) {
  const tw     = tripWeight(t);
  const nights = t.start_date && t.end_date
    ? Math.round((new Date(t.end_date) - new Date(t.start_date)) / 86400000) : null;
  const loadoutCount = (t.loadout_ids || []).length;
  const isActive = activeTripId === t.id;

  return `<div onclick="openTripDetail('${t.id}')"
    style="display:flex;align-items:center;gap:12px;padding:.625rem .875rem;background:var(--surface);border:1px solid ${isActive ? 'var(--primary)' : 'var(--border)'};border-radius:var(--r-lg);cursor:pointer;transition:border-color .12s"
    onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='${isActive ? 'var(--primary)' : 'var(--border)'}'">
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">
        <span style="font-weight:500;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.name)}</span>
        ${badge(STATUS_BADGE[t.status] || 'badge-gray', STATUS_LABEL[t.status] || t.status)}
      </div>
      <div style="font-size:11.5px;color:var(--text-3)">
        ${t.location ? esc(t.location) + ' · ' : ''}${t.start_date || 'No date'}${nights != null ? ` · ${nights}n` : ''}
      </div>
    </div>
    <div style="text-align:right;flex-shrink:0">
      <div class="mono" style="font-size:12px;font-weight:500">${wg(tw)}</div>
      <div style="font-size:11px;color:var(--text-3)">${loadoutCount} loadout${loadoutCount !== 1 ? 's' : ''}</div>
    </div>
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

  const tw     = tripWeight(trip);
  const items  = tripUniqueItems(trip);
  const wornW  = items.reduce((s, i) => s + (tripCarryType(trip, i.id) === 'worn'       ? (i.weight_g||0) : 0), 0);
  const consW  = items.reduce((s, i) => s + (tripCarryType(trip, i.id) === 'consumable' ? (i.weight_g||0) : 0), 0);
  const baseW  = tw - wornW - consW;
  const nights = trip.start_date && trip.end_date
    ? Math.round((new Date(trip.end_date) - new Date(trip.start_date)) / 86400000) : null;
  const over   = trip.weight_target_g && tw > trip.weight_target_g;

  // Per-loadout weight rows
  const loadoutRows = (trip.loadout_ids || []).map(lid => {
    const l = state.templates.find(t => t.id === lid);
    if (!l) return '';
    const lw = (l.gear_ids||[]).reduce((s,id) => {
      const item = state.items.find(i=>i.id===id);
      return s + (item?.weight_g||0);
    }, 0);
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:.5px solid var(--border-2)">
      <div>
        <span style="font-size:13px;font-weight:500">${esc(l.name)}</span>
        <span style="font-size:11px;color:var(--text-3);margin-left:8px">${(l.gear_ids||[]).length} items</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <span class="mono" style="font-size:12px">${wg(lw)}</span>
        <button class="btn btn-xs btn-danger" onclick="detachLoadout('${trip.id}','${lid}')" title="Detach loadout">✕</button>
      </div>
    </div>`;
  }).join('');

  // Meal plan section
  const mealPlan = trip.meal_plan_id ? state.food_plans.find(p => p.id === trip.meal_plan_id) : null;
  const mealPlanHtml = mealPlan
    ? `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0">
        <div>
          <span style="font-size:13px;font-weight:500">${esc(mealPlan.name)}</span>
          <span style="font-size:11px;color:var(--text-3);margin-left:8px">${mealPlan.days} days · ${mealPlan.cal_target_per_day?.toLocaleString()} cal/day</span>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-xs" onclick="showTab('food');openFoodPlan('${mealPlan.id}')">Open ↗</button>
          <button class="btn btn-xs btn-danger" onclick="detachMealPlan('${trip.id}')">✕</button>
        </div>
      </div>`
    : `<div style="padding:8px 0">
        ${_isSupporter
          ? `<button class="btn btn-sm" onclick="openAttachMealPlan('${trip.id}')">+ Attach meal plan</button>`
          : `<button class="btn btn-sm" onclick="openUpgradeModal('Food planning is a Supporter feature.')">+ Attach meal plan</button>`}
      </div>`;

  // Merged gear table across all loadouts
  const allGearIds = [...new Set((trip.loadout_ids||[]).flatMap(lid => {
    const l = state.templates.find(t=>t.id===lid);
    return l?.gear_ids || [];
  }))];

  document.getElementById('trip-detail').innerHTML = `
    <div class="card-header" style="margin-bottom:.75rem">
      <div>
        <span class="card-title" style="font-size:17px;font-family:var(--font-disp)">${esc(trip.name)}</span>
        &nbsp;${badge(STATUS_BADGE[trip.status]||'badge-gray', STATUS_LABEL[trip.status]||trip.status)}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-sm" onclick="openEditTrip('${trip.id}')">Edit</button>
        <button class="btn btn-sm" onclick="saveAsTemplate('${trip.id}')" title="Save merged gear as a new loadout">Save as loadout</button>
        <button class="btn btn-sm" onclick="shareItem('${trip.id}','trip')">Share ↗</button>
        <button class="btn btn-sm btn-danger" onclick="deleteTrip('${trip.id}')">Delete</button>
        <button class="btn btn-sm btn-ghost" onclick="closeTripDetail()">Close ✕</button>
      </div>
    </div>

    <!-- INFO ROW -->
    <div class="info-grid" style="margin-bottom:.875rem">
      ${trip.location   ? `<div class="info-pair"><div class="info-key">Location</div><div class="info-val">${esc(trip.location)}</div></div>` : ''}
      ${trip.start_date ? `<div class="info-pair"><div class="info-key">Dates</div><div class="info-val">${trip.start_date}${trip.end_date?' → '+trip.end_date:''}</div></div>` : ''}
      ${nights != null  ? `<div class="info-pair"><div class="info-key">Nights</div><div class="info-val">${nights}</div></div>` : ''}
      ${trip.miles      ? `<div class="info-pair"><div class="info-key">Distance</div><div class="info-val">${trip.miles} mi${nights?` · ${(trip.miles/nights).toFixed(1)} mi/day`:''}</div></div>` : ''}
    </div>
    ${trip.notes ? `<p style="font-size:13px;color:var(--text-2);margin-bottom:.875rem;padding:.625rem .75rem;background:var(--surface-2);border-radius:var(--r-md)">${esc(trip.notes)}</p>` : ''}

    <!-- WEIGHT SUMMARY -->
    <div style="margin-bottom:1rem">
      <div style="display:flex;gap:16px;font-size:13px;flex-wrap:wrap;margin-bottom:4px">
        <span>Base: <strong class="mono">${wg(baseW)}</strong></span>
        ${wornW ? `<span>Worn: <strong class="mono">${wg(wornW)}</strong></span>` : ''}
        ${consW ? `<span>Consumable: <strong class="mono">${wg(consW)}</strong></span>` : ''}
        <span>Total: <strong class="mono">${wg(tw)}</strong></span>
        ${trip.weight_target_g ? `<span style="color:var(--${over?'danger':'success'})">${over?'↑ '+wg(tw-trip.weight_target_g)+' over':'↓ '+wg(trip.weight_target_g-tw)+' under'} ${wg(trip.weight_target_g)} target</span>` : ''}
      </div>
      ${trip.weight_target_g ? prog(tw, trip.weight_target_g) : ''}
    </div>

    <div class="grid-2" style="margin-bottom:1rem">
      <!-- LOADOUTS SECTION -->
      <div class="card" style="padding:.875rem">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
          <span style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3)">Loadouts</span>
          <span style="font-size:11px;color:var(--text-3)">${allGearIds.length} items total · ${wg(tw)}</span>
        </div>
        ${loadoutRows || '<div style="font-size:13px;color:var(--text-3);padding:8px 0">No loadouts attached yet.</div>'}
        <div style="padding-top:8px;display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-sm" onclick="openAttachLoadout('${trip.id}')">+ Attach loadout</button>
        </div>
      </div>

      <!-- MEAL PLAN SECTION -->
      <div class="card" style="padding:.875rem">
        <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.5rem">Meal Plan</div>
        ${mealPlanHtml}
      </div>
    </div>

    <!-- FULL GEAR LIST (collapsed) -->
    <details style="margin-top:.25rem">
      <summary style="font-size:13px;font-weight:500;cursor:pointer;padding:6px 0;user-select:none">
        Full gear list (${allGearIds.length} items across all loadouts)
      </summary>
      <div class="table-wrap" style="margin-top:.5rem">
        <table class="data-table">
          <thead><tr>
            <th style="width:28px;padding:6px 4px"></th>
            <th>Item</th><th>Weight</th><th>Carry</th><th>Cost</th>
          </tr></thead>
          <tbody id="trip-detail-gear-tbody">
            ${allGearIds.length
              ? catGroupedGearTableFromIds(allGearIds, trip)
              : '<tr><td colspan="5"><div class="empty-state">No gear in attached loadouts.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </details>`;
}

// ── Loadout attach / detach ────────────────────────────────
function openAttachLoadout(tripId) {
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip) return;
  const attached = new Set(trip.loadout_ids || []);
  const available = state.templates.filter(l => !attached.has(l.id));
  if (!available.length) {
    openModal('Attach loadout', `
      <p style="font-size:13px;color:var(--text-2);margin-bottom:1rem">All your loadouts are already attached, or you have none yet.</p>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="closeModal();showTab('templates')">Go to Loadouts</button>
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      </div>`);
    return;
  }
  openModal('Attach a loadout', `
    <p style="font-size:13px;color:var(--text-2);margin-bottom:.875rem">Choose one or more loadouts to attach to <strong>${esc(trip.name)}</strong>:</p>
    <div style="display:flex;flex-direction:column;gap:5px;max-height:50vh;overflow-y:auto">
      ${available.map(l => {
        const lw = (l.gear_ids||[]).reduce((s,id) => {
          const item = state.items.find(i=>i.id===id);
          return s+(item?.weight_g||0);
        }, 0);
        return `<button class="btn" style="justify-content:space-between;text-align:left"
          onclick="attachLoadout('${tripId}','${l.id}')">
          <span>${esc(l.name)} <span style="font-size:11px;color:var(--text-3)">(${(l.gear_ids||[]).length} items)</span></span>
          <span class="mono" style="font-size:12px;color:var(--text-3)">${wg(lw)}</span>
        </button>`;
      }).join('')}
    </div>
    <div class="form-actions"><button class="btn btn-ghost" onclick="closeModal()">Done</button></div>`);
}

function attachLoadout(tripId, loadoutId) {
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip) return;
  if (!trip.loadout_ids) trip.loadout_ids = [];
  if (!trip.loadout_ids.includes(loadoutId)) trip.loadout_ids.push(loadoutId);
  saveState();
  closeModal();
  renderTripDetail(trip);
  toast('Loadout attached!');
}

function detachLoadout(tripId, loadoutId) {
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip) return;
  trip.loadout_ids = (trip.loadout_ids || []).filter(id => id !== loadoutId);
  saveState();
  renderTripDetail(trip);
  toast('Loadout detached.');
}

// ── Meal plan attach / detach ───────────────────────────────
function openAttachMealPlan(tripId) {
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip) return;
  if (!state.food_plans.length) {
    openModal('Attach meal plan', `
      <p style="font-size:13px;color:var(--text-2);margin-bottom:1rem">No meal plans yet. Create one in the Food tab first.</p>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="closeModal();showTab('food')">Go to Food Planning</button>
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      </div>`);
    return;
  }
  openModal('Attach a meal plan', `
    <p style="font-size:13px;color:var(--text-2);margin-bottom:.875rem">Choose a meal plan for <strong>${esc(trip.name)}</strong>:</p>
    <div style="display:flex;flex-direction:column;gap:5px;max-height:50vh;overflow-y:auto">
      ${state.food_plans.map(p => `
        <button class="btn ${trip.meal_plan_id === p.id ? 'btn-primary' : ''}"
          style="justify-content:space-between;text-align:left"
          onclick="attachMealPlan('${tripId}','${p.id}')">
          <span>${esc(p.name)} <span style="font-size:11px;opacity:.7">(${p.days} days · ${p.cal_target_per_day?.toLocaleString()} cal/day)</span></span>
          ${trip.meal_plan_id === p.id ? '<span style="font-size:11px">current</span>' : ''}
        </button>`).join('')}
    </div>
    <div class="form-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button></div>`);
}

function attachMealPlan(tripId, planId) {
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip) return;
  trip.meal_plan_id = planId;
  saveState();
  closeModal();
  renderTripDetail(trip);
  toast('Meal plan attached!');
}

function detachMealPlan(tripId) {
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip) return;
  trip.meal_plan_id = null;
  saveState();
  renderTripDetail(trip);
  toast('Meal plan removed.');
}

// Render the merged gear table for a trip (read-only, across all loadouts)
function catGroupedGearTableFromIds(gearIds, trip) {
  if (!gearIds.length) return '';
  const catOrder = categoryNames();
  const byCat = {};
  gearIds.forEach(id => {
    const item = state.items.find(i => i.id === id);
    if (!item) return;
    if (!byCat[item.category]) byCat[item.category] = [];
    byCat[item.category].push(item);
  });
  const sorted = Object.keys(byCat).sort((a,b) => {
    const ai = catOrder.indexOf(a); const bi = catOrder.indexOf(b);
    return (ai===-1?999:ai) - (bi===-1?999:bi);
  });
  return sorted.map(cat => {
    const catItems = byCat[cat];
    const headerRow = `<tr class="cat-header-row" data-cat="${esc(cat)}">
      <td style="width:28px"></td><td colspan="4">${esc(cat)}</td></tr>`;
    const itemRows = catItems.map(item => {
      const ct = tripCarryType(trip, item.id);
      const ctLabel = ct === 'worn' ? badge('carry-worn','W worn') : ct === 'consumable' ? badge('carry-consumable','C consumable') : '';
      return `<tr>
        <td style="width:28px"></td>
        <td><div class="item-name">${esc(item.name)}</div><div class="item-sub">${esc(item.brand||'')}</div></td>
        <td class="mono" style="font-size:12px">${wg(item.weight_g)}</td>
        <td>${ctLabel}</td>
        <td style="font-size:12px">${usd(item.cost_usd)}</td>
      </tr>`;
    }).join('');
    return headerRow + itemRows;
  }).join('');
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
    if (!checkLimit('trips', state.trips.length)) return;
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
    loadout_ids:      id ? (state.trips.find(t => t.id === id)?.loadout_ids || []) : [],
    meal_plan_id:     id ? (state.trips.find(t => t.id === id)?.meal_plan_id || null) : null,
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
// ANALYTICS
// ============================================================
let chartWeight = null, chartCost = null, chartTrips = null;

function renderAnalytics() {
  // ── Aggregate data (always needed) ────────────────────────
  const allW   = state.items.reduce((s, i) => s + (i.weight_g || 0), 0);
  const totalC = state.items.reduce((s, i) => s + (i.cost_usd || 0), 0);
  const priced = state.items.filter(i => i.cost_usd > 0 && i.weight_g > 0);
  const cw = {}, cc = {};
  state.items.forEach(i => {
    cw[i.category] = (cw[i.category] || 0) + (i.weight_g || 0);
    if (i.cost_usd) cc[i.category] = (cc[i.category] || 0) + i.cost_usd;
  });
  const sortedW = Object.entries(cw).sort((a,b) => b[1]-a[1]);
  const sortedC = Object.entries(cc).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  const completedTrips = state.trips.filter(t => t.status === 'completed');

  // ── Free tier: weight chart + 2 metrics + blurred preview ─
  if (!_isSupporter) {
    document.getElementById('analytics-metrics').innerHTML = `
      <div class="metric-card">
        <div class="metric-label">Total gear weight</div>
        <div class="metric-val">${wg(allW)}</div>
        <div class="metric-sub">${woz(allW)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Total tracked value</div>
        <div class="metric-val">${usd(totalC)}</div>
        <div class="metric-sub">${state.items.filter(i=>i.cost_usd>0).length} items with cost data</div>
      </div>
      <div class="metric-card" style="position:relative;overflow:hidden">
        <div style="filter:blur(4px);pointer-events:none;user-select:none">
          <div class="metric-label">Avg cost efficiency</div>
          <div class="metric-val">$1.84</div>
          <div class="metric-sub">per gram · 24 items</div>
        </div>
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
          <button class="btn btn-xs btn-primary" onclick="openUpgradeModal()">Supporter only</button>
        </div>
      </div>
      <div class="metric-card" style="position:relative;overflow:hidden">
        <div style="filter:blur(4px);pointer-events:none;user-select:none">
          <div class="metric-label">Gear never used</div>
          <div class="metric-val">8</div>
          <div class="metric-sub">32% of closet untested</div>
        </div>
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
          <button class="btn btn-xs btn-primary" onclick="openUpgradeModal()">Supporter only</button>
        </div>
      </div>`;

    // Free users get: weight chart + targets
    if (chartWeight) chartWeight.destroy();
    const ctxW = document.getElementById('chart-weight')?.getContext('2d');
    if (ctxW) chartWeight = new Chart(ctxW, {
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

    // Weight targets
    const targetsHtml = state.categories.filter(cat => cat.target_g).map(cat => {
      const w = cw[cat.name] || 0;
      const p = pct(w, cat.target_g);
      return `<div class="target-row">
        <span class="target-label">${esc(cat.name)}</span>
        <div class="target-bar"><div class="target-fill" style="width:${Math.min(100,p)}%;background:${cat.color}"></div></div>
        <span class="target-vals">${wg(w)} / ${wg(cat.target_g)} <span style="color:var(--${p>=100?'danger':p>=80?'warning':'success'})">${p}%</span></span>
      </div>`;
    }).join('');
    document.getElementById('analytics-targets').innerHTML = targetsHtml || `<div class="empty-state"><p>No category weight targets set.</p></div>`;

    // Blurred previews for paid sections
    const lockedHtml = (label) => `
      <div style="position:relative;border-radius:var(--r-lg);overflow:hidden">
        <div style="filter:blur(5px);pointer-events:none;user-select:none;padding:1rem">
          <div style="height:160px;background:linear-gradient(135deg,var(--surface-2),var(--surface-3));border-radius:var(--r-md);display:flex;align-items:center;justify-content:center">
            <div style="font-size:13px;color:var(--text-3)">${label}</div>
          </div>
        </div>
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(237,232,223,.5);backdrop-filter:blur(2px)">
          <div style="font-size:13px;font-weight:500;margin-bottom:.5rem;color:var(--text-1)">🔒 Supporter feature</div>
          <button class="btn btn-primary btn-sm" onclick="openUpgradeModal()">Upgrade to unlock</button>
        </div>
      </div>`;

    // Render locked sections in place of paid charts
    const tripWrap = document.getElementById('analytics-trips-chart-wrap');
    const tripEmpty = document.getElementById('analytics-trips-empty');
    if (tripWrap)  tripWrap.innerHTML  = lockedHtml('Trip weight history chart');
    if (tripEmpty) tripEmpty.style.display = 'none';
    document.getElementById('analytics-value').innerHTML  = lockedHtml('Best & worst value analysis');
    document.getElementById('analytics-unused').innerHTML = lockedHtml('Gear never used list');

    // Cost chart — blurred
    const ctxC = document.getElementById('chart-cost');
    if (ctxC) {
      const parent = ctxC.parentElement;
      parent.style.position = 'relative';
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(237,232,223,.6);backdrop-filter:blur(3px);border-radius:var(--r-lg)';
      overlay.innerHTML = `<div style="font-size:13px;font-weight:500;margin-bottom:.5rem;color:var(--text-1)">🔒 Supporter feature</div><button class="btn btn-primary btn-sm" onclick="openUpgradeModal()">Upgrade to unlock</button>`;
      parent.appendChild(overlay);
    }

    // Usage table — blurred
    document.getElementById('analytics-usage').innerHTML = `
      <tr><td colspan="5" style="padding:0">
        <div style="position:relative;overflow:hidden">
          <div style="filter:blur(3px);pointer-events:none;padding:8px 12px">
            ${['Trail Runners','Sleeping Bag','Backpack','Rain Jacket','Water Filter'].map(n =>
              `<div style="padding:6px 0;border-bottom:1px solid var(--border-2);font-size:13px;color:var(--text-2)">${n}</div>`
            ).join('')}
          </div>
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(237,232,223,.5)">
            <button class="btn btn-primary btn-sm" onclick="openUpgradeModal()">Upgrade to see usage data</button>
          </div>
        </div>
      </td></tr>`;
    return;
  }

  // ── Supporter tier: full analytics ────────────────────────
  const avgDpg = priced.length
    ? priced.reduce((s,i) => s + i.cost_usd/i.weight_g, 0) / priced.length : 0;
  const neverUsed = state.items.filter(i => !i.usage_days || i.usage_days === 0).length;

  document.getElementById('analytics-metrics').innerHTML = `
    <div class="metric-card">
      <div class="metric-label">Total gear weight</div>
      <div class="metric-val">${wg(allW)}</div>
      <div class="metric-sub">${woz(allW)}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Total tracked value</div>
      <div class="metric-val">${usd(totalC)}</div>
      <div class="metric-sub">avg ${usd(totalC/(state.items.filter(i=>i.cost_usd>0).length||1))}/item</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Avg cost efficiency</div>
      <div class="metric-val">${avgDpg > 0 ? '$' + avgDpg.toFixed(2) : '—'}</div>
      <div class="metric-sub">per gram across ${priced.length} priced items</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Gear never used</div>
      <div class="metric-val">${neverUsed}</div>
      <div class="metric-sub">${Math.round(neverUsed/Math.max(state.items.length,1)*100)}% of closet untested</div>
    </div>`;

  if (chartWeight) chartWeight.destroy();
  const ctxW = document.getElementById('chart-weight')?.getContext('2d');
  if (ctxW) chartWeight = new Chart(ctxW, {
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

  if (chartCost) chartCost.destroy();
  const ctxC = document.getElementById('chart-cost')?.getContext('2d');
  // Remove any overlay from free-tier render
  ctxC?.canvas?.parentElement?.querySelectorAll('div').forEach(d => d.remove());
  if (ctxC) chartCost = new Chart(ctxC, {
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

  const targetsHtml = state.categories.filter(cat => cat.target_g).map(cat => {
    const w = cw[cat.name] || 0;
    const p = pct(w, cat.target_g);
    return `<div class="target-row">
      <span class="target-label" title="${esc(cat.name)}">${esc(cat.name)}</span>
      <div class="target-bar"><div class="target-fill" style="width:${Math.min(100,p)}%;background:${cat.color}"></div></div>
      <span class="target-vals">${wg(w)} / ${wg(cat.target_g)} <span style="color:var(--${p>=100?'danger':p>=80?'warning':'success'})">${p}%</span></span>
    </div>`;
  }).join('');
  document.getElementById('analytics-targets').innerHTML = targetsHtml
    || `<div class="empty-state"><p>No category targets set. Open Manage categories to add weight goals.</p></div>`;

  // Trip weight history
  const tripsWrap  = document.getElementById('analytics-trips-chart-wrap');
  const tripsEmpty = document.getElementById('analytics-trips-empty');
  if (chartTrips) chartTrips.destroy();
  if (!completedTrips.length) {
    if (tripsWrap)  tripsWrap.innerHTML = '';
    if (tripsEmpty) tripsEmpty.style.display = 'block';
  } else {
    if (tripsEmpty) tripsEmpty.style.display = 'none';
    if (tripsWrap)  tripsWrap.innerHTML = '<canvas id="chart-trips" height="220"></canvas>';
    const sorted = [...completedTrips].sort((a,b)=>(a.start_date||'').localeCompare(b.start_date||''));
    const ctxT = document.getElementById('chart-trips')?.getContext('2d');
    if (ctxT) chartTrips = new Chart(ctxT, {
      type: 'bar',
      data: {
        labels: sorted.map(t => t.name),
        datasets: [{
          label: 'Total weight', data: sorted.map(t => Math.round(tripWeight(t))),
          backgroundColor: '#2A7048cc', borderRadius: 4, borderSkipped: false
        }, {
          label: 'Target', data: sorted.map(t => t.weight_target_g || null),
          type: 'line', borderColor: '#B87B0A', borderDash: [4,3],
          pointBackgroundColor: '#B87B0A', fill: false, tension: 0.3
        }]
      },
      options: {
        plugins: { legend: { labels: { font: { size: 11 } } } },
        scales: { y: { ticks: { callback: v => wg(v) }, grid: { color: '#f0ece4' } }, x: { grid: { display: false } } },
        animation: { duration: 400 }
      }
    });
  }

  // Best & worst value
  const valueSorted = [...priced].sort((a,b) => (a.cost_usd/a.weight_g)-(b.cost_usd/b.weight_g));
  const best  = valueSorted.slice(0, 4);
  const worst = valueSorted.slice(-4).reverse();
  document.getElementById('analytics-value').innerHTML = !priced.length
    ? `<div class="empty-state"><p>Add cost and weight data to see value rankings.</p></div>`
    : `<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--success);margin-bottom:.375rem">Best value</div>
      ${best.map(i => `<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:.5px solid var(--border-2)">
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(i.name)}</span>
        <span class="mono" style="color:var(--success);flex-shrink:0;margin-left:8px">${dpg(i.cost_usd,i.weight_g)}</span>
      </div>`).join('')}
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--danger);margin:.875rem 0 .375rem">Priciest per gram</div>
      ${worst.map(i => `<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:.5px solid var(--border-2)">
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(i.name)}</span>
        <span class="mono" style="color:var(--danger);flex-shrink:0;margin-left:8px">${dpg(i.cost_usd,i.weight_g)}</span>
      </div>`).join('')}`;

  // Never used
  const unused = state.items.filter(i => !i.usage_days || i.usage_days === 0);
  document.getElementById('analytics-unused').innerHTML = !unused.length
    ? `<div class="empty-state"><p>Everything has been used at least once. 🎉</p></div>`
    : `<div style="font-size:12px;color:var(--text-3);margin-bottom:.5rem">${unused.length} item${unused.length!==1?'s':''} with no logged usage</div>
      ${unused.slice(0,8).map(i => `
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;padding:5px 0;border-bottom:.5px solid var(--border-2)">
          <div><span style="font-weight:500">${esc(i.name)}</span><span style="font-size:11px;color:var(--text-3);margin-left:6px">${esc(i.category)}</span></div>
          <span class="mono" style="color:var(--text-3);flex-shrink:0;margin-left:8px">${wg(i.weight_g)}</span>
        </div>`).join('')}
      ${unused.length > 8 ? `<div style="font-size:11px;color:var(--text-3);padding-top:5px">+ ${unused.length-8} more</div>` : ''}`;

  // Most used
  const byUsage = [...state.items].filter(i => i.usage_days > 0).sort((a,b) => b.usage_days - a.usage_days).slice(0, 10);
  document.getElementById('analytics-usage').innerHTML = !byUsage.length
    ? `<tr><td colspan="5"><div class="empty-state">No usage logged yet. Click any gear item to log days and nights.</div></td></tr>`
    : byUsage.map(i => `<tr>
        <td><div class="item-name">${esc(i.name)}</div><div class="item-sub">${esc(i.brand||'')}</div></td>
        <td>${badge('badge-gray', i.category)}</td>
        <td class="mono">${i.usage_days}</td>
        <td class="mono">${i.usage_nights || '—'}</td>
        <td>${badge(COND_BADGE[i.condition]||'badge-gray', COND_LABEL[i.condition]||'—')}</td>
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
    `${state.templates.length} loadout${state.templates.length !== 1 ? 's' : ''} — attach one or more to any trip`;

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
      <button class="btn btn-sm btn-primary" onclick="openApplyTemplateFromLib('${tmpl.id}')">Attach to trip…</button>
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
        <button class="btn btn-sm btn-primary" onclick="openApplyTemplateFromLib('${tmpl.id}')">Attach to trip…</button>
        <button class="btn btn-sm" onclick="shareItem('${tmpl.id}','template')" title="Share via link">Share ↗</button>
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
  if (!id && !checkLimit('templates', state.templates.length)) return;
  const tmpl = id ? state.templates.find(t => t.id === id) : null;
  openModal(tmpl ? 'Edit loadout' : 'New loadout', templateFormHtml(tmpl));
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
  if (!name) { alert('Loadout name is required.'); return; }

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
  toast(isNew ? 'Loadout created!' : 'Loadout updated!');
}

function deleteTemplate(id) {
  if (!confirm('Delete this template?')) return;
  state.templates = state.templates.filter(t => t.id !== id);
  saveState();
  if (activeTemplateId === id) closeTemplateDetail();
  else renderTemplates();
  toast('Loadout deleted.');
}

// ── Save trip → template ────────────────────────────────────
function saveAsTemplate(tripId) {
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip) return;
  const mergedIds  = [...new Set((trip.loadout_ids||[]).flatMap(lid => {
    const l = state.templates.find(t=>t.id===lid);
    return l?.gear_ids||[];
  }))];
  const mergedCT = {};
  (trip.loadout_ids||[]).forEach(lid => {
    const l = state.templates.find(t=>t.id===lid);
    Object.assign(mergedCT, l?.carry_types||{});
  });
  const pseudo = {
    id: '',
    name: trip.name + ' loadout',
    description: `Based on ${trip.name}.${trip.location?' '+trip.location+'.':''} ${trip.notes||''}`.trim(),
    trip_type:    trip.trip_type || 'backpacking',
    gear_ids:     mergedIds,
    carry_types:  mergedCT,
    created_from: trip.id,
  };
  openModal('Save trip as loadout', templateFormHtml(pseudo));
  setTimeout(updateTemplateCount, 50);
}

// ── Attach loadout from loadout library to a trip ────────────
// Called from loadout card / detail "Attach to trip…" button
function openApplyTemplateFromLib(loadoutId) {
  if (!state.trips.length) {
    toast('No trips yet. Create a trip first.');
    return;
  }
  openModal('Attach loadout to trip', `
    <p style="font-size:13px;color:var(--text-2);margin-bottom:.875rem">Choose a trip to attach this loadout to:</p>
    <div style="display:flex;flex-direction:column;gap:5px;max-height:50vh;overflow-y:auto">
      ${state.trips.map(t => {
        const already = (t.loadout_ids||[]).includes(loadoutId);
        return `<button class="btn ${already?'btn-primary':''}"
          style="justify-content:space-between;text-align:left"
          onclick="${already ? '' : `attachLoadoutFromLib('${loadoutId}','${t.id}')`}"
          ${already ? 'disabled' : ''}>
          <span>${esc(t.name)}</span>
          <span style="font-size:11px;color:var(--text-3)">${already ? '✓ attached' : badge(STATUS_BADGE[t.status]||'badge-gray', STATUS_LABEL[t.status]||t.status)}</span>
        </button>`;
      }).join('')}
    </div>
    <div class="form-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button></div>`);
}

function attachLoadoutFromLib(loadoutId, tripId) {
  attachLoadout(tripId, loadoutId);
  toast('Loadout attached to trip!');
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
      <div class="apply-option-desc">${esc(trip.location||'')} · ${(trip.loadout_ids||[]).length} loadout${(trip.loadout_ids||[]).length!==1?'s':''} · ${wg(tw)}</div>
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
  showTab('trips');
  activeTripId = trip.id;
  renderTrips();
  openTripDetail(trip.id);
  toast(`Loadout "${tmpl.name}" attached to ${trip.name}!`);
}

function _doApply(trip, tmpl, mode) {
  if (!trip.loadout_ids) trip.loadout_ids = [];
  if (mode === 'replace') {
    // Replace = detach all current loadouts, attach this one
    trip.loadout_ids = [tmpl.id];
  } else {
    // Merge = attach this loadout if not already attached
    if (!trip.loadout_ids.includes(tmpl.id)) trip.loadout_ids.push(tmpl.id);
  }
  _applySelectedTemplate = null;
  _applySelectedTrip     = null;
  _applyMode             = null;
  saveState();
}

// ============================================================
// DRAG & DROP — handle-initiated, mode-aware (reorder or recategorize)
// ============================================================
let _dragItemId    = null;
let _dragMode      = null;   // 'reorder' | 'recategorize'
let _dropTargetCat = null;
let _dropTargetId  = null;   // item id we're hovering (for reorder)
let _dropPosition  = null;   // 'before' | 'after'

function onItemDragStart(e, itemId, mode) {
  _dragItemId = itemId;
  _dragMode   = mode || 'recategorize';
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', itemId);
  // Show whole row as faded while dragging
  setTimeout(() => {
    document.querySelector(`tr[data-item-id="${itemId}"]`)?.classList.add('gear-row-dragging');
  }, 0);
}

function onItemDragEnd() {
  _dragItemId    = null;
  _dragMode      = null;
  _dropTargetCat = null;
  _dropTargetId  = null;
  _dropPosition  = null;
  document.querySelectorAll('.gear-row-dragging').forEach(r => r.classList.remove('gear-row-dragging'));
  document.querySelectorAll('.cat-section-highlight').forEach(r => r.classList.remove('cat-section-highlight'));
  document.querySelectorAll('.drop-line-before, .drop-line-after').forEach(r => {
    r.classList.remove('drop-line-before', 'drop-line-after');
  });
}

function onRowDragOver(e, itemCat, mode) {
  if (!_dragItemId || _dragCatName) return;  // ignore if dragging a category header
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  if ((mode || _dragMode) === 'reorder') {
    // Show a drop line above or below this row
    const row = e.currentTarget;
    const targetId = row.dataset.itemId;
    if (!targetId || targetId === _dragItemId) return;
    const rect = row.getBoundingClientRect();
    const pos  = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    if (_dropTargetId === targetId && _dropPosition === pos) return; // no change
    // Clear previous indicators
    document.querySelectorAll('.drop-line-before, .drop-line-after').forEach(r => {
      r.classList.remove('drop-line-before', 'drop-line-after');
    });
    _dropTargetId = targetId;
    _dropPosition = pos;
    row.classList.add(pos === 'before' ? 'drop-line-before' : 'drop-line-after');
  } else {
    // Recategorize: highlight category section
    if (_dropTargetCat === itemCat) return;
    _dropTargetCat = itemCat;
    document.querySelectorAll('.cat-section-highlight').forEach(r => r.classList.remove('cat-section-highlight'));
    document.querySelectorAll(`tr[data-item-cat="${itemCat}"], tr[data-cat="${itemCat}"]`)
      .forEach(r => r.classList.add('cat-section-highlight'));
  }
}

function onRowDragLeave(e) {
  if (!e.relatedTarget || !e.relatedTarget.closest('[data-item-cat], [data-cat]')) {
    document.querySelectorAll('.cat-section-highlight').forEach(r => r.classList.remove('cat-section-highlight'));
    document.querySelectorAll('.drop-line-before, .drop-line-after').forEach(r => {
      r.classList.remove('drop-line-before', 'drop-line-after');
    });
    _dropTargetCat = null;
    _dropTargetId  = null;
    _dropPosition  = null;
  }
}

function onRowDrop(e, mode) {
  e.preventDefault();
  const draggedId = e.dataTransfer.getData('text/plain') || _dragItemId;

  if ((mode || _dragMode) === 'reorder') {
    const targetId = _dropTargetId || e.currentTarget.dataset.itemId;
    const pos      = _dropPosition || 'after';
    document.querySelectorAll('.drop-line-before, .drop-line-after').forEach(r => {
      r.classList.remove('drop-line-before', 'drop-line-after');
    });
    if (!draggedId || !targetId || draggedId === targetId) return;
    // Move in state.items
    const fromIdx = state.items.findIndex(i => i.id === draggedId);
    const toIdx   = state.items.findIndex(i => i.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = state.items.splice(fromIdx, 1);
    const insertAt = state.items.findIndex(i => i.id === targetId);
    state.items.splice(pos === 'before' ? insertAt : insertAt + 1, 0, moved);
    saveState();
    renderGear();
  } else {
    // Recategorize
    const catName = _dropTargetCat || e.currentTarget.dataset.itemCat;
    document.querySelectorAll('.cat-section-highlight').forEach(r => r.classList.remove('cat-section-highlight'));
    if (!draggedId || !catName) return;
    const item = state.items.find(i => i.id === draggedId);
    if (!item || item.category === catName) return;
    item.category = catName;
    saveState();
    renderGear();
    toast(`Moved "${item.name}" → ${catName}`);
  }
}

// ── Category header drag — reorder categories ───────────────
let _dragCatName     = null;
let _dropCatTarget   = null;

function onCatHeaderDragStart(e, catName) {
  _dragCatName = catName;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', catName);
  setTimeout(() => {
    document.querySelector(`tr.cat-header-row[data-cat="${catName}"]`)?.classList.add('gear-row-dragging');
  }, 0);
}

function onCatHeaderDragEnd() {
  if (_dragCatName) {
    document.querySelector(`tr.cat-header-row[data-cat="${_dragCatName}"]`)?.classList.remove('gear-row-dragging');
  }
  document.querySelectorAll('.drop-line-before,.drop-line-after').forEach(r => {
    r.classList.remove('drop-line-before','drop-line-after');
  });
  _dragCatName   = null;
  _dropCatTarget = null;
}

function onCatHeaderDragOver(e, catName) {
  if (!_dragCatName || _dragCatName === catName) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (_dropCatTarget === catName) return;
  document.querySelectorAll('.drop-line-before,.drop-line-after').forEach(r => {
    r.classList.remove('drop-line-before','drop-line-after');
  });
  _dropCatTarget = catName;
  const row = e.currentTarget;
  const rect = row.getBoundingClientRect();
  const pos  = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  row.classList.add(pos === 'before' ? 'drop-line-before' : 'drop-line-after');
}

function onCatHeaderDragLeave(e) {
  if (!e.relatedTarget || !e.relatedTarget.closest('tr.cat-header-row')) {
    document.querySelectorAll('.drop-line-before,.drop-line-after').forEach(r => {
      r.classList.remove('drop-line-before','drop-line-after');
    });
    _dropCatTarget = null;
  }
}

function onCatHeaderDrop(e, targetCat) {
  e.preventDefault();
  document.querySelectorAll('.drop-line-before,.drop-line-after').forEach(r => {
    r.classList.remove('drop-line-before','drop-line-after');
  });
  const srcCat = _dragCatName;
  _dragCatName = null; _dropCatTarget = null;
  if (!srcCat || srcCat === targetCat) return;

  const row = e.currentTarget;
  const rect = row.getBoundingClientRect();
  const pos  = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';

  // Ensure both categories exist in state.categories (items may have cats not in the list)
  const allCatNames = categoryNames();
  const cats = allCatNames.map(name => {
    return state.categories.find(c => c.name === name) || { name, color: '#888', target_g: null };
  });

  const fromIdx = cats.findIndex(c => c.name === srcCat);
  const [moved] = cats.splice(fromIdx, 1);
  const toIdx   = cats.findIndex(c => c.name === targetCat);
  cats.splice(pos === 'before' ? toIdx : toIdx + 1, 0, moved);

  state.categories = cats;
  saveState();
  renderGear();
}
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
  if (currentTab === 'gear') renderGear();
  else if (currentTab === 'trips' && activeTripId) renderTripDetail(state.trips.find(t => t.id === activeTripId));
  else if (currentTab === 'templates' && activeTemplateId) renderTemplateDetail(state.templates.find(t => t.id === activeTemplateId));
  else renderGear();
  toast(`Moved to ${catName}`);
}

// Mobile: tap handle in custom sort → pick position in list
function openReorderPickerMobile(itemId) {
  const item = state.items.find(i => i.id === itemId);
  if (!item) return;
  const idx = state.items.indexOf(item);
  // Show neighbours to move before/after
  openModal(`Reorder: ${esc(item.name)}`, `
    <p style="font-size:13px;color:var(--text-2);margin-bottom:.875rem">Move this item relative to another:</p>
    <div style="display:flex;flex-direction:column;gap:4px;max-height:55vh;overflow-y:auto">
      ${state.items.filter(i => i.id !== itemId).map(i => `
        <div style="display:flex;gap:5px">
          <button class="btn btn-xs" style="flex:1" onclick="reorderItem('${itemId}','${i.id}','before')">↑ Before</button>
          <span style="font-size:12px;padding:4px 8px;flex:3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(i.name)}</span>
          <button class="btn btn-xs" style="flex:1" onclick="reorderItem('${itemId}','${i.id}','after')">↓ After</button>
        </div>`).join('')}
    </div>
    <div class="form-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button></div>`);
}

function reorderItem(draggedId, targetId, pos) {
  const fromIdx = state.items.findIndex(i => i.id === draggedId);
  if (fromIdx === -1) return;
  const [moved] = state.items.splice(fromIdx, 1);
  const insertAt = state.items.findIndex(i => i.id === targetId);
  if (insertAt === -1) { state.items.push(moved); }
  else state.items.splice(pos === 'before' ? insertAt : insertAt + 1, 0, moved);
  saveState();
  closeModal();
  renderGear();
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
// Default meal calorie splits (percentages, must sum to 100)
// These are the plan defaults; each plan can store its own meal_splits object.
const MEAL_DEFAULT_SPLITS = { breakfast: 22, snack: 17, lunch: 25, dinner: 36 };

// Get the calorie target for a specific meal slot in a plan
function mealCalTarget(plan, mealTime) {
  const splits = plan.meal_splits || MEAL_DEFAULT_SPLITS;
  const pct = splits[mealTime] ?? MEAL_DEFAULT_SPLITS[mealTime] ?? 25;
  return Math.round((pct / 100) * (plan.cal_target_per_day || 3000));
}

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

  // Show/hide free-user banner
  let banner = document.getElementById('food-free-banner');
  if (!_isSupporter) {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'food-free-banner';
      banner.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:var(--accent-l);border:1px solid var(--accent);border-radius:var(--r-lg);padding:.625rem 1rem;margin-bottom:1rem;font-size:13px';
      banner.innerHTML = `
        <span style="color:var(--text-1)">
          🍽 <strong>Exploring meal planning</strong> — feel free to try it out. You'll need a Supporter account to save your plans.
        </span>
        <button class="btn btn-primary btn-sm" onclick="openUpgradeModal('Saving meal plans is a Supporter feature.')">Upgrade</button>`;
      const view = document.getElementById('food-plans-view');
      if (view) view.insertBefore(banner, view.firstChild);
    }
    banner.style.display = 'flex';
  } else {
    if (banner) banner.style.display = 'none';
  }

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
      <div style="margin-top:.375rem;display:flex;gap:14px;flex-wrap:wrap;font-size:11.5px;color:var(--text-3)">
        ${MEAL_TIMES.map(mt => `<span>${MEAL_ICONS[mt]} ${MEAL_LABELS[mt]}: <strong>${mealCalTarget(plan, mt)}</strong> cal</span>`).join('')}
        <button class="btn btn-xs" style="margin-left:auto" onclick="openEditFoodPlan('${plan.id}')">Adjust splits</button>
      </div>
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
  const dayConfig = plan.day_config || {};

  // Helper: is a meal slot enabled for a given day?
  // Default: all meals enabled on all days
  function slotEnabled(day, mt) {
    const dc = dayConfig[day];
    if (dc && mt in dc) return dc[mt];
    return true; // all slots on by default
  }

  const dayHtml = days.map(day => {
    const dayMeals = meals.filter(m => m.day === day);
    const dayCal   = dayMeals.reduce((s,m) => s + (m.cal||0), 0);
    const dayW     = dayMeals.reduce((s,m) => s + (m.weight_g||0), 0);

    const slots = MEAL_TIMES.map(mt => {
      const enabled   = slotEnabled(day, mt);
      const slotMeals = dayMeals.filter(m => m.meal_time === mt);
      const slotCal   = slotMeals.reduce((s,m) => s + (m.cal||0), 0);
      const guideCal  = mealCalTarget(plan, mt);
      const ok = slotCal >= guideCal * 0.75;

      if (!enabled) {
        // Slot is disabled — show a minimal "skipped" tile with re-enable option
        return `
          <div style="border:.5px dashed var(--border-2);border-radius:var(--r-md);padding:.5rem .75rem;min-height:60px;display:flex;flex-direction:column;justify-content:space-between;opacity:.55">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-3)">${MEAL_ICONS[mt]} ${MEAL_LABELS[mt]}</span>
              <button class="btn btn-xs" style="font-size:10px;color:var(--text-3)"
                onclick="toggleMealSlot('${plan.id}',${day},'${mt}',true)" title="Add this meal">+ Add</button>
            </div>
            <span style="font-size:10px;color:var(--text-3);margin-top:4px">Skipped</span>
          </div>`;
      }

      return `
        <div style="border:.5px solid var(--border);border-radius:var(--r-md);padding:.625rem .75rem;min-height:80px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.05em;color:var(--text-3)">${MEAL_ICONS[mt]} ${MEAL_LABELS[mt]}</span>
              <button class="btn btn-xs" style="font-size:10px;padding:1px 5px;color:var(--text-3);border-color:var(--border-2)"
                onclick="toggleMealSlot('${plan.id}',${day},'${mt}',false)" title="Skip this meal">Skip</button>
            </div>
            <div style="display:flex;align-items:center;gap:5px">
              ${slotCal
                ? `<span class="mono" style="font-size:11px;color:var(--${ok?'success':'warning'})">${slotCal} cal</span>`
                : `<span style="font-size:10px;color:var(--text-3)">~${guideCal} cal</span>`}
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
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">${slots}</div>
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
        <select class="select input-full" id="fp-cal" onchange="onFpCalChange()">
          <option value="2500" ${plan.cal_target_per_day===2500?'selected':''}>2,500 — Easy/moderate day hikes</option>
          <option value="3000" ${(!plan.cal_target_per_day||plan.cal_target_per_day===3000)?'selected':''}>3,000 — Standard backpacking (default)</option>
          <option value="3500" ${plan.cal_target_per_day===3500?'selected':''}>3,500 — Big miles / elevation gain</option>
          <option value="4000" ${plan.cal_target_per_day===4000?'selected':''}>4,000 — Ultra-long days / cold weather</option>
          <option value="custom" ${![2500,3000,3500,4000].includes(plan.cal_target_per_day)&&plan.cal_target_per_day?'selected':''}>Custom…</option>
        </select>
        <div id="fp-cal-custom-row" style="display:${![2500,3000,3500,4000].includes(plan.cal_target_per_day)&&plan.cal_target_per_day?'flex':'none'};gap:8px;align-items:center;margin-top:6px">
          <input class="input" id="fp-cal-custom" type="number" min="1000" max="8000" step="50"
            value="${![2500,3000,3500,4000].includes(plan.cal_target_per_day)&&plan.cal_target_per_day?plan.cal_target_per_day:''}"
            placeholder="e.g. 2800" style="width:120px" oninput="updateSplitPreview()">
          <span style="font-size:12px;color:var(--text-3)">calories / day</span>
        </div></div>
      <div class="form-row"><label class="form-label">Food weight target / day</label>
        <select class="select input-full" id="fp-wt" onchange="onFpWtChange()">
          <option value="680"  ${plan.weight_target_g_per_day===680?'selected':''}>680g (1.5 lb) — Ultralight</option>
          <option value="800"  ${(!plan.weight_target_g_per_day||plan.weight_target_g_per_day===800)?'selected':''}>800g (1.75 lb) — Standard UL (default)</option>
          <option value="907"  ${plan.weight_target_g_per_day===907?'selected':''}>907g (2.0 lb) — Traditional planning</option>
          <option value="1100" ${plan.weight_target_g_per_day===1100?'selected':''}>1,100g (2.4 lb) — Cold/hard trips</option>
          <option value="custom" ${![680,800,907,1100].includes(plan.weight_target_g_per_day)&&plan.weight_target_g_per_day?'selected':''}>Custom…</option>
        </select>
        <div id="fp-wt-custom-row" style="display:${![680,800,907,1100].includes(plan.weight_target_g_per_day)&&plan.weight_target_g_per_day?'flex':'none'};gap:8px;align-items:center;margin-top:6px">
          <input class="input" id="fp-wt-custom" type="number" min="200" max="3000" step="10"
            value="${![680,800,907,1100].includes(plan.weight_target_g_per_day)&&plan.weight_target_g_per_day?plan.weight_target_g_per_day:''}"
            placeholder="e.g. 850" style="width:100px">
          <span style="font-size:12px;color:var(--text-3)">grams / day</span>
          <span id="fp-wt-lb" style="font-size:11px;color:var(--text-3)"></span>
        </div></div>
    </div>

    <div style="border-top:.5px solid var(--border-2);padding-top:.875rem;margin-bottom:.875rem">
      <label class="form-label" style="margin-bottom:.5rem;display:flex;justify-content:space-between;align-items:center">
        Calorie split by meal
        <span id="fp-split-total" style="font-size:11px;font-weight:400;color:var(--text-3)">Total: 100%</span>
      </label>
      <p style="font-size:12px;color:var(--text-3);margin-bottom:.75rem">Adjust how daily calories are distributed across meals. Total must equal 100%.</p>
      ${MEAL_TIMES.map(mt => {
        const pct = (plan.meal_splits || MEAL_DEFAULT_SPLITS)[mt] ?? MEAL_DEFAULT_SPLITS[mt];
        const cal = Math.round((pct/100) * (plan.cal_target_per_day || 3000));
        return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:.625rem">
          <span style="width:80px;font-size:12px;color:var(--text-2)">${MEAL_ICONS[mt]} ${MEAL_LABELS[mt]}</span>
          <input type="range" id="fp-split-${mt}" min="5" max="60" value="${pct}"
            style="flex:1;accent-color:var(--primary)"
            oninput="updateSplitPreview()">
          <span style="width:38px;text-align:right;font-size:12px;font-weight:500" id="fp-pct-${mt}">${pct}%</span>
          <span style="width:55px;text-align:right;font-size:11px;color:var(--text-3)" id="fp-cal-${mt}">${cal} cal</span>
        </div>`;
      }).join('')}
      <div id="fp-split-warning" style="display:none;font-size:12px;color:var(--danger);margin-top:.25rem">⚠ Percentages must sum to 100% before saving</div>
    </div>
    <div class="form-actions">
      <button class="btn btn-primary" onclick="saveFoodPlan('${plan.id||''}')">Save plan</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`;
}

function onFpCalChange() {
  const sel = document.getElementById('fp-cal');
  const row = document.getElementById('fp-cal-custom-row');
  if (row) row.style.display = sel?.value === 'custom' ? 'flex' : 'none';
  if (sel?.value === 'custom') setTimeout(() => document.getElementById('fp-cal-custom')?.focus(), 50);
  updateSplitPreview();
}

function onFpWtChange() {
  const sel = document.getElementById('fp-wt');
  const row = document.getElementById('fp-wt-custom-row');
  if (row) row.style.display = sel?.value === 'custom' ? 'flex' : 'none';
  if (sel?.value === 'custom') setTimeout(() => document.getElementById('fp-wt-custom')?.focus(), 50);
}

// Returns the currently effective calorie value from the select or custom input
function getFpCalValue() {
  const sel = document.getElementById('fp-cal');
  if (sel?.value === 'custom') return parseInt(document.getElementById('fp-cal-custom')?.value) || 3000;
  return parseInt(sel?.value) || 3000;
}

function getFpWtValue() {
  const sel = document.getElementById('fp-wt');
  if (sel?.value === 'custom') return parseInt(document.getElementById('fp-wt-custom')?.value) || 800;
  return parseInt(sel?.value) || 800;
}

function updateSplitPreview() {
  const calPerDay = getFpCalValue();
  let total = 0;
  MEAL_TIMES.forEach(mt => {
    const pct = parseInt(document.getElementById(`fp-split-${mt}`)?.value) || 0;
    total += pct;
    const cal = Math.round((pct / 100) * calPerDay);
    const pctEl = document.getElementById(`fp-pct-${mt}`);
    const calEl = document.getElementById(`fp-cal-${mt}`);
    if (pctEl) pctEl.textContent = pct + '%';
    if (calEl) calEl.textContent = cal + ' cal';
  });
  const totalEl = document.getElementById('fp-split-total');
  const warnEl  = document.getElementById('fp-split-warning');
  const ok = total === 100;
  if (totalEl) {
    totalEl.textContent = `Total: ${total}%`;
    totalEl.style.color = ok ? 'var(--success)' : 'var(--danger)';
    totalEl.style.fontWeight = ok ? '400' : '600';
  }
  if (warnEl) warnEl.style.display = ok ? 'none' : 'block';
}

function saveFoodPlan(id) {
  if (!requireSupporter('Saving meal plans')) return;
  const name = document.getElementById('fp-name').value.trim();
  if (!name) { alert('Plan name is required.'); return; }

  // Validate meal splits sum to 100
  let splitTotal = 0;
  const meal_splits = {};
  MEAL_TIMES.forEach(mt => {
    const pct = parseInt(document.getElementById(`fp-split-${mt}`)?.value) || 0;
    meal_splits[mt] = pct;
    splitTotal += pct;
  });
  if (splitTotal !== 100) {
    alert(`Meal calorie splits must sum to 100% (currently ${splitTotal}%). Adjust the sliders before saving.`);
    return;
  }

  const isNew = !id;
  const existing = id ? state.food_plans.find(p => p.id === id) : null;
  const days = parseInt(document.getElementById('fp-days').value) || 3;
  const data = {
    id:    id || uid('fp'),
    name,
    trip_id: document.getElementById('fp-trip').value || null,
    days,
    cal_target_per_day:      getFpCalValue(),
    weight_target_g_per_day: getFpWtValue(),
    meal_splits,
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
  const guideCal = mealCalTarget(plan, mealTime);
  const recs = state.recipes.filter(r => !r.meal_time || r.meal_time === mealTime || r.meal_time === 'snack');

  if (!_isSupporter) {
    // Free users: recipe-only picker — no manual entry
    if (!recs.length) {
      toast('No recipes available for this meal slot.');
      return;
    }
    openModal(`Add ${MEAL_LABELS[mealTime]} — Day ${day}`, `
      <p style="font-size:13px;color:var(--text-2);margin-bottom:.75rem">Choose from the starter recipes:</p>
      <div class="form-row">
        <select class="select input-full" id="mi-recipe" onchange="fillFromRecipe()">
          <option value="">— select a recipe —</option>
          ${recs.map(r => `<option value="${r.id}" data-cal="${r.cal_per_serving}" data-w="${r.weight_g_per_serving}">${esc(r.name)} (${r.cal_per_serving} cal · ${r.weight_g_per_serving}g)</option>`).join('')}
        </select>
      </div>
      <input type="hidden" id="mi-name" value="">
      <input type="hidden" id="mi-cal"  value="">
      <input type="hidden" id="mi-wg"   value="">
      <input type="hidden" id="mi-notes" value="">
      <p style="font-size:11.5px;color:var(--text-3);margin-top:.75rem">
        Supporters can add any custom food item. <button class="btn btn-xs btn-primary" onclick="closeModal();openUpgradeModal('Custom meal items are a Supporter feature.')">Upgrade</button>
      </p>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="saveMealItem('${planId}',${day},'${mealTime}')">Add</button>
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      </div>`);
    return;
  }

  // Supporter: full form with manual entry + recipe quick-fill
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
      <div class="form-row"><label class="form-label">${weightLabel()}</label>
        <input class="input input-full" id="mi-wg" type="number" min="0" step="${weightStep()}" placeholder="${weightPlaceholder()}"></div>
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
  if (wgEl)   wgEl.value   = gToDisplay(rec.weight_g_per_serving);
}

function saveMealItem(planId, day, mealTime) {
  const recipeEl = document.getElementById('mi-recipe');

  // Free users: must pick a recipe, and can only add to the demo plan
  if (!_isSupporter) {
    if (!recipeEl?.value) {
      alert('Please select a recipe to add.');
      return;
    }
    // Auto-fill from recipe before saving (in case fillFromRecipe wasn't triggered)
    fillFromRecipe();
  }

  const name = document.getElementById('mi-name').value.trim();
  if (!name) { alert('Food name required.'); return; }
  const plan = state.food_plans.find(p => p.id === planId);
  if (!plan) return;
  if (!plan.meals) plan.meals = [];
  plan.meals.push({
    id:        uid('meal'),
    day,
    meal_time: mealTime,
    name,
    cal:       parseInt(document.getElementById('mi-cal').value)  || 0,
    weight_g:  displayToG(document.getElementById('mi-wg').value),
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

function toggleMealSlot(planId, day, mealTime, enabled) {
  const plan = state.food_plans.find(p => p.id === planId);
  if (!plan) return;
  if (!plan.day_config) plan.day_config = {};
  if (!plan.day_config[day]) plan.day_config[day] = {};

  if (enabled) {
    // Re-enabling — just remove the explicit override so it falls back to default (enabled)
    delete plan.day_config[day][mealTime];
    if (Object.keys(plan.day_config[day]).length === 0) delete plan.day_config[day];
  } else {
    // Disabling — also remove any logged meals for this slot
    plan.meals = (plan.meals || []).filter(m => !(m.day === day && m.meal_time === mealTime));
    plan.day_config[day][mealTime] = false;
  }

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
  if (!requireSupporter('Custom gear fields')) return;
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
  if (!requireSupporter('Custom gear fields')) return;
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

function toggleUserMenu() {
  const menu = document.getElementById('user-menu');
  if (!menu) return;
  const open = menu.style.display === 'block';
  menu.style.display = open ? 'none' : 'block';
}

// Close user menu when clicking anywhere outside it
document.addEventListener('click', e => {
  const btn  = document.getElementById('user-menu-btn');
  const menu = document.getElementById('user-menu');
  if (menu && menu.style.display === 'block' && !btn?.contains(e.target) && !menu.contains(e.target)) {
    menu.style.display = 'none';
  }
});

function setSyncIndicator(status) {
  const el = document.getElementById('sync-indicator');
  if (!el) return;
  const states = {
    saving:  '↑ Saving…',
    saved:   '✓ Synced',
    error:   '⚠ Sync failed',
    offline: '○ Local only',
    nosync:  '○ Local only',
  };
  el.textContent = states[status] || '';
  el.style.color = status === 'error'  ? 'var(--danger)'
                 : status === 'saved'  ? 'var(--success)'
                 : 'var(--text-3)';
}

function updateHeaderAuth() {
  const userInfo   = document.getElementById('auth-user-info');
  const anonInfo   = document.getElementById('auth-anon-actions');
  const loadingEl  = document.getElementById('auth-loading-indicator');
  const emailEl    = document.getElementById('auth-user-email');
  const nudgeEl    = document.getElementById('sync-upgrade-nudge');
  const tierEl     = document.getElementById('user-menu-tier');
  const footerSignin   = document.getElementById('footer-signin-link');
  const footerSettings = document.getElementById('footer-settings-link');
  if (loadingEl) loadingEl.style.display = 'none';

  if (_user) {
    if (userInfo) userInfo.style.display = 'flex';
    if (anonInfo) anonInfo.style.display = 'none';
    if (emailEl)  emailEl.textContent = _user.email;
    if (footerSignin)   footerSignin.style.display   = 'none';
    if (footerSettings) footerSettings.style.display = '';

    if (_isSupporter) {
      setSyncIndicator('saved');
      if (nudgeEl) nudgeEl.style.display = 'none';
      if (tierEl)  tierEl.innerHTML = `<span style="color:var(--success);font-weight:600">⛰ Supporter</span> <span style="color:var(--text-3)">· Sync active</span>`;
    } else {
      setSyncIndicator('nosync');
      if (nudgeEl) nudgeEl.style.display = 'flex';
      if (tierEl)  tierEl.innerHTML = `<span style="color:var(--text-2)">Free plan</span> <span style="color:var(--text-3)">· Local only</span>
        <button onclick="openUpgradeModal();toggleUserMenu()" style="display:block;margin-top:6px;width:100%;background:var(--primary);color:#fff;border:none;border-radius:var(--r-md);padding:6px 10px;font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;text-align:center">☁ Enable sync — $3.99/mo</button>`;
    }
  } else {
    if (userInfo) userInfo.style.display = 'none';
    if (anonInfo) anonInfo.style.display = 'flex';
    if (nudgeEl)  nudgeEl.style.display  = 'none';
    if (footerSignin)   footerSignin.style.display   = '';
    if (footerSettings) footerSettings.style.display = 'none';
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

async function diagnoseSupabase() {
  // Helper — show in modal error div OR fall back to alert
  function show(html, color) {
    const el = document.getElementById('auth-error');
    if (el) {
      el.style.display = 'block';
      el.style.background = color === 'green' ? '#eaf4ee' : color === 'blue' ? '#e8f4fd' : '#fdeaea';
      el.style.color      = color === 'green' ? '#1c5736' : color === 'blue' ? '#124471' : '#8c2020';
      el.innerHTML = html;
    } else {
      // Modal not visible — use toast + console
      toast('Check browser console (F12) for Supabase diagnostics');
      console.group('Gearnomic — Supabase Diagnostics');
      console.log(html.replace(/<[^>]+>/g, ''));
      console.groupEnd();
    }
  }

  // Step 1 — is config.js loaded at all?
  if (typeof SUPABASE_URL === 'undefined') {
    show('<strong>config.js not loaded.</strong> Make sure <code>js/config.js</code> is in your repo and listed in index.html before app.js.', 'red');
    return;
  }

  // Step 2 — are placeholder values still in place?
  if (!SUPABASE_URL || SUPABASE_URL === 'YOUR_PROJECT_URL') {
    show(`<strong>Project URL not set.</strong> The value currently being read from <code>config.js</code> is:<br>
<code style="word-break:break-all;background:rgba(0,0,0,.06);padding:2px 5px;border-radius:3px">${SUPABASE_URL || '(empty)'}</code><br><br>
If that doesn't match what you put in the file, GitHub Pages is serving a <strong>cached old version</strong> of config.js. Try:<br>
1. Hard refresh: <strong>Ctrl+Shift+R</strong> (Windows) / <strong>Cmd+Shift+R</strong> (Mac)<br>
2. Open an Incognito/Private window and try there<br>
3. Wait 2–5 minutes for GitHub Pages CDN to clear, then retry`, 'red');
    return;
  }
  if (!SUPABASE_ANON || SUPABASE_ANON === 'YOUR_ANON_PUBLIC_KEY') {
    show('<strong>Anon key not set.</strong> Open <code>js/config.js</code> and replace <code>YOUR_ANON_PUBLIC_KEY</code> with your anon key from Supabase → Settings → API.', 'red');
    return;
  }

  // Step 3 — URL format check
  const cleanUrl = SUPABASE_URL.trim().replace(/\/$/, '');
  if (!cleanUrl.startsWith('https://') || !cleanUrl.includes('.supabase.co')) {
    show(`<strong>URL format looks wrong.</strong><br>Expected: <code>https://abc123.supabase.co</code><br>Got: <code>${cleanUrl}</code><br>Copy it fresh from Supabase → Settings → API.`, 'red');
    return;
  }

  // Step 4 — actually try to reach the project
  show('Testing connection…', 'blue');
  try {
    const res = await fetch(`${cleanUrl}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_ANON.trim() }
    });

    if (res.status === 200) {
      const body = await res.json().catch(() => ({}));
      const emailEnabled = body?.external?.email !== false;
      if (emailEnabled) {
        show('✓ <strong>Connection OK and Email auth is enabled.</strong> If sign-in still fails, double-check your email/password, or try "Create account" first.', 'green');
      } else {
        show('✓ Connected, but <strong>Email auth is disabled</strong> in your Supabase project.<br>Go to Supabase → Authentication → Providers → Email → enable it.', 'red');
      }
    } else if (res.status === 401 || res.status === 403) {
      show(`<strong>Anon key rejected (${res.status}).</strong> Your key may have extra spaces or be from a different project. Copy it fresh from Supabase → Settings → API → anon public.`, 'red');
    } else {
      show(`<strong>Unexpected response ${res.status}.</strong> Your project may be paused. <a href="${cleanUrl}" target="_blank" style="color:inherit">Open your Supabase dashboard</a> to check — free projects pause after 7 days idle.`, 'red');
    }
  } catch(err) {
    // True network failure
    show(`<strong>Cannot reach Supabase.</strong> Most likely causes:<br>
1. <strong>Project is paused</strong> — free tier pauses after 7 days idle. <a href="https://supabase.com/dashboard" target="_blank" style="color:inherit">Open Supabase dashboard</a> and click "Restore".<br>
2. <strong>URL has a typo</strong> — currently using: <code style="word-break:break-all">${cleanUrl}</code><br>
3. <strong>Network/firewall</strong> blocking the request on this device.<br>
<span style="font-size:11px;opacity:.7">Error: ${err.message}</span>`, 'red');
  }
}

async function submitAuth() {
  const btn = document.getElementById('auth-submit-btn');
  const isSignup = btn?.textContent?.includes('Create');
  const email    = document.getElementById('auth-email')?.value.trim();
  const password = document.getElementById('auth-password')?.value;
  setAuthError('');

  if (!email || !password) { setAuthError('Please enter your email and password.'); return; }

  if (!_supabaseReady()) {
    await diagnoseSupabase();
    return;
  }

  if (btn) { btn.textContent = isSignup ? 'Creating account…' : 'Signing in…'; btn.disabled = true; }

  try {
    const { data, error } = isSignup
      ? await _sb.auth.signUp({ email, password })
      : await _sb.auth.signInWithPassword({ email, password });

    if (error) throw error;

    if (isSignup && data?.user && !data.session) {
      // Replace auth modal contents with a clear confirmation screen
      hideAuthModal();
      openModal('Check your inbox 📬', `
        <div style="text-align:center;padding:1rem 0 .5rem">
          <div style="font-size:52px;margin-bottom:1rem">📬</div>
          <p style="font-size:15px;font-weight:500;margin-bottom:.5rem;color:var(--text-1)">
            Confirmation email sent to:
          </p>
          <p style="font-size:14px;color:var(--primary);font-weight:600;margin-bottom:1.25rem;word-break:break-all">
            ${esc(email)}
          </p>
          <p style="font-size:13px;color:var(--text-2);line-height:1.7;margin-bottom:1rem">
            Click the link in that email to activate your account.<br>
            <span style="color:var(--text-3)">Don't see it? Check your spam folder.</span>
          </p>
          <p style="font-size:12px;color:var(--text-3);line-height:1.6">
            Once confirmed, come back here and sign in.
          </p>
        </div>
        <div class="form-actions" style="justify-content:center">
          <button class="btn btn-primary" onclick="closeModal();showAuthModal()">Sign in</button>
          <button class="btn btn-ghost" onclick="closeModal()">Done</button>
        </div>`);
      return;
    }
    // Auth state change listener handles the rest
  } catch(e) {
    if (btn) { btn.textContent = isSignup ? 'Create account' : 'Sign in'; btn.disabled = false; }
    const msg = e.message || '';
    if (msg.toLowerCase().includes('networkerror') || msg.toLowerCase().includes('fetch')) {
      // Run full diagnostics
      await diagnoseSupabase();
    } else if (msg.includes('Invalid login credentials')) {
      setAuthError('Wrong email or password. Try again, or use "Create account" to register.');
    } else if (msg.includes('Email not confirmed')) {
      setAuthError('Check your inbox — you need to confirm your email before signing in.');
    } else if (msg.includes('User already registered')) {
      setAuthError('An account with this email exists. Switch to "Sign in" instead.');
    } else {
      setAuthError(msg || 'Authentication failed. Check your config and try again.');
    }
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
// FORGOT PASSWORD & RECOVERY
// ============================================================

function showForgotPassword() {
  document.getElementById('forgot-panel').style.display = 'block';
  document.getElementById('auth-error').style.display = 'none';
  const email = document.getElementById('auth-email')?.value;
  const fp = document.getElementById('forgot-email');
  if (fp && email) fp.value = email;
  setTimeout(() => fp?.focus(), 50);
}

function hideForgotPassword() {
  document.getElementById('forgot-panel').style.display = 'none';
}

async function sendPasswordReset() {
  const email = document.getElementById('forgot-email')?.value.trim();
  if (!email) { document.getElementById('forgot-email')?.focus(); return; }
  if (!_supabaseReady()) { setAuthError('Supabase not configured.'); return; }

  const btn = document.querySelector('#forgot-panel button');
  if (btn) { btn.textContent = 'Sending…'; btn.disabled = true; }

  const { error } = await _sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.href.split('#')[0],
  });

  if (btn) { btn.textContent = 'Send reset link'; btn.disabled = false; }

  if (error) {
    setAuthError(error.message);
  } else {
    document.getElementById('forgot-panel').innerHTML = `
      <div style="text-align:center;padding:.5rem 0">
        <div style="font-size:24px;margin-bottom:.5rem">📬</div>
        <div style="font-size:14px;font-weight:500;margin-bottom:.375rem">Check your inbox</div>
        <p style="font-size:12px;color:#888">A reset link has been sent to <strong>${esc(email)}</strong>. Click it to set a new password.</p>
      </div>`;
  }
}

async function submitNewPassword() {
  const pw = document.getElementById('new-password')?.value;
  if (!pw || pw.length < 6) {
    setAuthError('Password must be at least 6 characters.');
    return;
  }
  if (!_supabaseReady()) return;

  const btn = document.querySelector('#recovery-panel button');
  if (btn) { btn.textContent = 'Updating…'; btn.disabled = true; }

  const { error } = await _sb.auth.updateUser({ password: pw });

  if (btn) { btn.textContent = 'Update password'; btn.disabled = false; }

  if (error) {
    setAuthError(error.message);
  } else {
    document.getElementById('recovery-panel').style.display = 'none';
    hideAuthModal();
    toast('Password updated! You are now signed in.');
  }
}

// ============================================================
// USER SETTINGS & PROFILE
// ============================================================

// ── Stripe price IDs — replace with your real IDs from Stripe Dashboard ──
// Products → your product → Prices → copy the price_live_... ID
const STRIPE_MONTHLY_URL = 'https://buy.stripe.com/00w5kCeTg0vBcNF0zi0oM00';
const STRIPE_ANNUAL_URL  = 'https://buy.stripe.com/aFa9AS9yWbaf8xp6XG0oM01';

function openUpgradeModal(reason) {
  const reasonHtml = reason
    ? `<div style="background:var(--surface-2);border-left:3px solid var(--accent);border-radius:var(--r-md);padding:.625rem .875rem;margin-bottom:1.25rem;font-size:13px;color:var(--text-2)">${esc(reason)}</div>`
    : '';
  openModal('Become a Supporter', `
    ${reasonHtml}
    <div style="text-align:center;padding:.5rem 0 1rem">
      <div style="font-size:32px;margin-bottom:.5rem">⛰</div>
      <p style="font-size:15px;font-weight:500;margin-bottom:.375rem">Unlock the full Gearnomic experience</p>
      <p style="font-size:13px;color:var(--text-2);margin-bottom:1.5rem;line-height:1.6">
        Supporters get unlimited gear, trips, templates, food planning, custom fields, full analytics, and cloud sync across all devices.
      </p>
    </div>

    <!-- Plan cards -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:1.25rem">
      <div style="border:1.5px solid var(--border);border-radius:var(--r-lg);padding:1rem;text-align:center">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.375rem">Monthly</div>
        <div style="font-size:26px;font-weight:600;font-family:var(--font-disp)">$3.99</div>
        <div style="font-size:12px;color:var(--text-3);margin-bottom:.875rem">per month</div>
        <a href="${STRIPE_MONTHLY_URL}?prefilled_email=${encodeURIComponent(_user?.email||'')}&client_reference_id=${encodeURIComponent(_user?.id||'')}"
          target="_blank" class="btn btn-sm" style="display:block;text-align:center">
          Subscribe monthly
        </a>
      </div>
      <div style="border:2px solid var(--primary);border-radius:var(--r-lg);padding:1rem;text-align:center;position:relative">
        <div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:var(--primary);color:#fff;font-size:10px;font-weight:600;padding:2px 10px;border-radius:99px;white-space:nowrap">BEST VALUE</div>
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.375rem">Annual</div>
        <div style="font-size:26px;font-weight:600;font-family:var(--font-disp)">$29</div>
        <div style="font-size:12px;color:var(--text-3);margin-bottom:.875rem">per year · $2.42/mo</div>
        <a href="${STRIPE_ANNUAL_URL}?prefilled_email=${encodeURIComponent(_user?.email||'')}&client_reference_id=${encodeURIComponent(_user?.id||'')}"
          target="_blank" class="btn btn-primary btn-sm" style="display:block;text-align:center">
          Subscribe annually
        </a>
      </div>
    </div>

    <!-- What you get -->
    <div style="background:var(--surface-2);border-radius:var(--r-md);padding:.875rem 1rem;margin-bottom:1rem">
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.5rem">What supporters get</div>
      ${[
        '♾ Unlimited gear items, trips & templates',
        '🍽 Save meal plans & attach them to trips',
        '📊 Full analytics — value, usage & trip history',
        '🔧 Custom gear fields',
        '☁ Cloud sync across all devices',
        '🔄 Automatic backup — never lose your list',
        '⚡ Priority support & early feature access',
      ].map(f => `<div style="font-size:13px;color:var(--text-1);padding:3px 0">✓ ${f}</div>`).join('')}
    </div>

    <p style="font-size:11.5px;color:var(--text-3);text-align:center;line-height:1.5">
      Cancel any time. Sharing is always free for everyone.
    </p>
    <div class="form-actions"><button class="btn btn-ghost" onclick="closeModal()">Maybe later</button></div>`);
}

function openSettings() {
  if (!_user) { toast('Sign in to access settings.'); return; }

  const profile = state.profile || {};
  const email   = _user.email || '';

  openModal('Settings', `
    <div style="display:flex;flex-direction:column;gap:1.25rem">

      <!-- Supporter status -->
      <div>
        <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.625rem">Supporter</div>
        ${_isSupporter
          ? `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <span style="background:var(--primary);color:#fff;font-size:11px;font-weight:600;padding:3px 10px;border-radius:99px">⛰ SUPPORTER</span>
              <span style="font-size:13px;color:var(--text-2)">Cloud sync is active. Thank you for supporting Gearnomic!</span>
              <a href="https://billing.stripe.com/p/login/00w5kCeTg0vBcNF0zi0oM00" target="_blank" class="btn btn-sm btn-ghost">Manage subscription</a>
            </div>`
          : `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <span style="font-size:13px;color:var(--text-2)">Free plan — data saved locally on this device only.</span>
              <button class="btn btn-sm btn-primary" onclick="closeModal();openUpgradeModal()">Upgrade for sync ☁</button>
            </div>`
        }
      </div>

      <!-- Profile -->
      <div>
        <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.625rem">Profile</div>
        <div class="form-grid">
          <div class="form-row">
            <label class="form-label">Display name</label>
            <input class="input input-full" id="s-display-name" value="${esc(profile.display_name || '')}" placeholder="Your name on trail">
          </div>
          <div class="form-row">
            <label class="form-label">Email</label>
            <input class="input input-full" value="${esc(email)}" disabled style="color:var(--text-3);cursor:not-allowed">
          </div>
        </div>
      </div>

      <!-- Preferences -->
      <div>
        <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.625rem">Preferences</div>
        <div class="form-grid">
          <div class="form-row">
            <label class="form-label">Units</label>
            <select class="select input-full" id="s-units">
              <option value="metric"   ${(profile.units||'metric')==='metric'   ?'selected':''}>Metric (kg / g)</option>
              <option value="imperial" ${profile.units==='imperial'?'selected':''}>Imperial (lb / oz)</option>
            </select>
          </div>
          <div class="form-row">
            <label class="form-label">Base weight target (g)</label>
            <input class="input input-full" id="s-bw-target" type="number" min="0" step="100"
              value="${profile.base_weight_target_g || ''}" placeholder="e.g. 4500">
          </div>
        </div>
      </div>

      <!-- Data -->
      <div>
        <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.625rem">Data</div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          <button class="btn btn-sm" onclick="exportData()">Export all data as JSON</button>
          <button class="btn btn-sm" onclick="document.getElementById('import-file').click()">Import from JSON</button>
          ${_isSupporter ? `<button class="btn btn-sm" onclick="syncToCloud().then(()=>toast('Synced!'))">Force sync to cloud</button>` : ''}
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

      <!-- Feedback -->
      <div>
        <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.625rem">Feedback</div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          <button class="btn btn-sm" onclick="openFeedbackModal('bug')">🐛 Report a bug</button>
          <button class="btn btn-sm" onclick="openFeedbackModal('feature')">✨ Request a feature</button>
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
      <button class="btn btn-primary" onclick="saveSettings()">Save changes</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`);
}

async function saveSettings() {
  if (!state.profile) state.profile = {};
  state.profile.display_name     = document.getElementById('s-display-name')?.value.trim() || null;
  state.profile.units            = document.getElementById('s-units')?.value || 'metric';
  state.profile.base_weight_target_g = parseInt(document.getElementById('s-bw-target')?.value) || null;
  saveState();
  closeModal();
  toast('Settings saved!');
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
  const title = isBug ? '🐛 Report a bug' : '✨ Request a feature';
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

      <p style="margin-bottom:.875rem"><strong>Data deletion</strong><br>
      You can delete your account and all associated data at any time from Settings → Account → Delete account.</p>

      <p style="margin-bottom:.875rem"><strong>Contact</strong><br>
      For privacy questions, email <a href="mailto:hello@gearnomic.com">hello@gearnomic.com</a>.</p>
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

// Build the payload to share — resolves item IDs to full objects so
// the recipient can import everything even if they have different item IDs
function buildSharePayload(obj, kind) {
  const payload = JSON.parse(JSON.stringify(obj));
  // Embed full item objects so the share is self-contained
  payload._shared_items = (obj.gear_ids || []).map(id => {
    const item = state.items.find(i => i.id === id);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }).filter(Boolean);
  payload._kind    = kind;
  payload._version = 1;
  return payload;
}

async function shareItem(id, kind) {
  if (!_supabaseReady()) {
    toast('Sign in to share — sharing requires a Gearnomic account.');
    return;
  }
  if (!_user) {
    toast('Sign in to share gear lists.');
    showAuthModal();
    return;
  }

  const obj = kind === 'trip'
    ? state.trips.find(t => t.id === id)
    : state.templates.find(t => t.id === id);
  if (!obj) return;

  const token   = nanoId(10);
  const payload = buildSharePayload(obj, kind);

  const { error } = await _sb.from('shared_lists').insert({
    id:       token,
    owner_id: _user.id,
    kind,
    title:    obj.name,
    payload,
  });

  if (error) { toast('Share failed: ' + error.message); return; }

  const url = `${window.location.origin}${window.location.pathname}#share=${token}`;
  try {
    await navigator.clipboard.writeText(url);
    openModal('Link copied! 🎉', `
      <p style="font-size:13px;color:var(--text-2);margin-bottom:1rem">
        Anyone with this link can view your <strong>${esc(obj.name)}</strong> ${kind} and save it to their own account.
      </p>
      <div style="display:flex;gap:8px;align-items:center;background:var(--surface-2);border:.5px solid var(--border);border-radius:var(--r-md);padding:8px 12px;margin-bottom:1rem">
        <span style="font-size:12px;color:var(--text-2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${url}</span>
        <button class="btn btn-sm" onclick="navigator.clipboard.writeText('${url}').then(()=>toast('Copied!'))">Copy</button>
      </div>
      <p style="font-size:11.5px;color:var(--text-3)">The link stays active until you delete this ${kind}. Item weights and carry types are included.</p>
      <div class="form-actions"><button class="btn btn-ghost" onclick="closeModal()">Done</button></div>`);
  } catch {
    // Clipboard blocked — just show the URL
    openModal('Share link', `
      <p style="font-size:13px;color:var(--text-2);margin-bottom:.75rem">Copy this link and share it:</p>
      <input class="input input-full" value="${url}" readonly onclick="this.select()" style="font-size:12px">
      <div class="form-actions"><button class="btn btn-ghost" onclick="closeModal()">Done</button></div>`);
  }
}

// Called on page load when #share=TOKEN is in the URL
async function handleShareHash(token) {
  // Show a loading state in place of the normal app
  const overlay = document.createElement('div');
  overlay.id = 'share-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:var(--bg);z-index:400;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:1rem';
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
    overlay.innerHTML = sharedErrorHtml('Could not load the shared list.', token);
  }
}

function sharedErrorHtml(msg, token) {
  return `<div style="text-align:center;padding:2rem;max-width:400px;margin:auto">
    <div style="font-size:40px;margin-bottom:1rem">🏕</div>
    <div style="font-family:var(--font-disp);font-size:20px;margin-bottom:.5rem">Gearnomic</div>
    <p style="font-size:14px;color:var(--text-2);margin-bottom:1.5rem">${msg}</p>
    <a href="${window.location.pathname}" class="btn btn-primary">Open Gearnomic</a>
  </div>`;
}

function renderSharedView(overlay, data) {
  const payload  = data.payload;
  const kind     = data.kind;
  const items    = payload._shared_items || [];
  const tw       = items.reduce((s, i) => s + (i.weight_g || 0), 0);

  // Group items by category for the list
  const byCat = {};
  items.forEach(item => {
    if (!byCat[item.category]) byCat[item.category] = [];
    byCat[item.category].push(item);
  });

  const gearHtml = Object.entries(byCat).map(([cat, catItems]) => `
    <div style="margin-bottom:1rem">
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--text-3);padding:4px 0;border-bottom:.5px solid var(--border);margin-bottom:5px">${esc(cat)}</div>
      ${catItems.map(item => `
        <div style="display:flex;justify-content:space-between;align-items:baseline;padding:5px 0;border-bottom:.5px solid var(--border-2)">
          <div>
            <span style="font-size:13px;font-weight:500">${esc(item.name)}</span>
            ${item.brand ? `<span style="font-size:11px;color:var(--text-3);margin-left:6px">${esc(item.brand)}</span>` : ''}
          </div>
          <div style="display:flex;gap:16px;font-size:12px;color:var(--text-2);flex-shrink:0;margin-left:12px">
            <span class="mono">${wg(item.weight_g)}</span>
            ${item.cost_usd ? `<span>${usd(item.cost_usd)}</span>` : ''}
          </div>
        </div>`).join('')}
    </div>`).join('');

  // Carry breakdown
  const wornW = items.filter((_, i) => {
    const id = payload.gear_ids?.[i];
    return id && getCarryType(payload, id) === 'worn';
  }).reduce((s, i) => s + (i.weight_g || 0), 0);

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
          ${payload.location    ? `<p style="font-size:13px;color:var(--text-3)">📍 ${esc(payload.location)}</p>` : ''}

          <!-- Stats row -->
          <div style="display:flex;gap:20px;font-size:13px;margin-top:.875rem;flex-wrap:wrap">
            <span><strong>${items.length}</strong> items</span>
            <span>Total: <strong class="mono">${wg(tw)}</strong></span>
            ${wornW ? `<span>Worn: <strong class="mono">${wg(wornW)}</strong></span>` : ''}
            ${payload.miles  ? `<span>📏 <strong>${payload.miles}</strong> mi</span>` : ''}
            ${payload.start_date ? `<span>📅 ${payload.start_date}</span>` : ''}
          </div>
        </div>

        <!-- Save CTA -->
        <div style="background:var(--accent-l);border:.5px solid var(--accent);border-radius:var(--r-lg);padding:1rem 1.25rem;margin-bottom:1.5rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap">
          <div>
            <div style="font-weight:500;font-size:14px;margin-bottom:2px">Save to your Gearnomic account</div>
            <div style="font-size:12px;color:var(--text-2)">Saves as a loadout you can attach to any trip</div>
          </div>
          <button class="btn btn-primary" onclick="saveSharedToProfile(${JSON.stringify(JSON.stringify(data)).slice(1,-1)})">
            Save to my account
          </button>
        </div>

        <!-- Gear list -->
        <div class="card">
          <div style="font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.875rem">Gear list</div>
          ${gearHtml || '<p style="color:var(--text-3);font-size:13px">No gear items in this list.</p>'}
        </div>

        <p style="text-align:center;font-size:12px;color:var(--text-3);margin-top:1.5rem">
          Shared via <a href="${window.location.pathname}" style="color:var(--accent)">Gearnomic</a>
        </p>
      </div>
    </div>`;
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

document.addEventListener('DOMContentLoaded', async () => {
  // Check for shared list link FIRST — before loading normal app state
  const hash = window.location.hash;
  const shareToken = hash.startsWith('#share=') ? hash.slice(7) : null;

  // Load local data so the app is ready in the background
  loadState();

  // Render dashboard immediately with local data — no waiting for auth
  renderDashboard();

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

  // Footer
  const yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
  document.getElementById('dash-date').textContent =
    new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // ── Supabase auth ─────────────────────────────────────────
  if (!_supabaseReady()) {
    document.getElementById('auth-loading-indicator').style.display = 'none';
    document.getElementById('auth-anon-actions').style.display = 'flex';
    setSyncIndicator('offline');
    if (shareToken) handleShareHash(shareToken);
    return;
  }

  const { data: { session } } = await _sb.auth.getSession();
  if (session?.user) {
    _user = session.user;
    const loaded = await loadFromCloud();
    if (loaded) refreshAll();
    updateHeaderAuth();
  } else {
    updateHeaderAuth();
    if (!shareToken) showAuthModal(); // don't cover the share view with auth modal
  }

  // Show shared list view if applicable (after auth check)
  if (shareToken) handleShareHash(shareToken);

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
      const cloudLoaded = await loadFromCloud(); // also sets _isSupporter
      if (!cloudLoaded) {
        await loadSupporterStatus();
        await syncToCloud();
      }
      refreshAll();
      updateHeaderAuth();
      toast('Signed in!' + (_isSupporter ? ' Your data is syncing.' : ' Upgrade to enable cloud sync.'));

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
