// Gearnomic � State persistence, cloud sync, migrations, and data import/export
// ── Persistence ────────────────────────────────────────────
function saveState() {
  state._savedAt = Date.now();
  if (_user) {
    // Signed-in: Supabase is the sole source of truth — no localStorage write.
    // beforeunload/visibilitychange flush any pending sync via keepalive fetch.
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(syncToCloud, 400);
  } else {
    // Guest: localStorage is the only persistence available.
    try { localStorage.setItem('trailkit_v1', JSON.stringify(state)); } catch(e) {}
  }
}

// Flush a pending sync immediately using fetch keepalive so the request
// survives page unload. Called from beforeunload and visibilitychange.
function flushToCloud() {
  if (!_user || window._adminImpersonateMode || !_syncTimer) return;
  clearTimeout(_syncTimer);
  _syncTimer = null;
  if (typeof SUPABASE_URL === 'undefined' || !_accessToken) {
    // Token not yet cached — fall back to the normal async path and hope the
    // browser keeps the tab alive long enough (e.g. tab switch, not close).
    syncToCloud();
    return;
  }
  try {
    fetch(`${SUPABASE_URL}/rest/v1/user_data`, {
      method:    'POST',
      keepalive: true,
      headers: {
        'apikey':        SUPABASE_ANON,
        'Authorization': `Bearer ${_accessToken}`,
        'Content-Type':  'application/json',
        'Prefer':        'resolution=merge-duplicates',
      },
      body: JSON.stringify({ user_id: _user.id, data: state }),
    });
  } catch(e) {}
}

// Writes the impersonated user's state back to their DB row.
// Kept separate from syncToCloud so a stale _adminImpersonateMode flag can never
// silently overwrite a real user's data during a normal save flow.
async function adminSyncToCloud() {
  const targetId = window._adminImpersonateUserId;
  const sb       = window._adminSb || _sb;
  if (!targetId || !sb) { setSyncIndicator('error'); return; }
  setSyncIndicator('saving');
  try {
    const { error } = await sb.from('user_data').upsert(
      { user_id: targetId, data: state },
      { onConflict: 'user_id' }
    );
    if (error) throw error;
    setSyncIndicator('saved');
  } catch(e) {
    setSyncIndicator('error');
    console.error('Admin sync failed:', e);
  }
}

async function syncToCloud() {
  if (window._adminImpersonateMode) {
    adminSyncToCloud();
    return;
  }
  if (!_supabaseReady() || !_user) return;
  setSyncIndicator('saving');
  const MAX_ATTEMPTS = 4;
  const BASE_DELAY   = 1500; // ms; doubles each retry: 1.5s → 3s → 6s → give up
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { error } = await _sb.from('user_data').upsert(
        { user_id: _user.id, data: state },
        { onConflict: 'user_id' }
      );
      if (error) throw error;
      setSyncIndicator('saved');
      return;
    } catch(e) {
      if (attempt === MAX_ATTEMPTS) {
        setSyncIndicator('error');
        console.error('Sync failed after retries:', e);
        return;
      }
      await new Promise(r => setTimeout(r, BASE_DELAY * Math.pow(2, attempt - 1)));
    }
  }
}

async function loadFromCloud() {
  if (!_supabaseReady() || !_user) return false;
  try {
    const { data, error } = await _sb.from('user_data')
      .select('*').eq('user_id', _user.id).single();
    if (error || !data?.data) return false;
    _isSupporter    = !!data.is_supporter;
    _isAmbassador   = !!data.is_ambassador;
    _supporterSince = data.supporter_since || null;
    // One-time migration: if a localStorage copy exists and is newer than Supabase
    // (unsync'd changes from before the Supabase-only model), push it up first.
    // Only runs when trailkit_v1 was written by the OLD system — loadState() no longer
    // writes it on initialization, so this can never fire on fresh demo data.
    try {
      const localRaw = localStorage.getItem('trailkit_v1');
      if (localRaw) {
        const localData = JSON.parse(localRaw);
        const localTs   = localData?._savedAt || 0;
        const cloudTs   = data.data?._savedAt  || 0;
        if (localTs > cloudTs) {
          state = localData;
          applyMigrations();
          // Only remove localStorage after Supabase confirms the write succeeded.
          const { error: pushErr } = await _sb.from('user_data').upsert(
            { user_id: _user.id, data: state }, { onConflict: 'user_id' }
          );
          if (!pushErr) localStorage.removeItem('trailkit_v1');
          if (typeof loadProfile === 'function') loadProfile().catch(() => {});
          return true;
        }
        // Cloud is newer — local copy is stale, safe to discard.
        localStorage.removeItem('trailkit_v1');
      }
    } catch(e) {}
    // Supabase is the sole source of truth — always use cloud data.
    state = data.data;
    applyMigrations();
    if (typeof loadProfile === 'function') loadProfile().catch(() => {});
    return true;
  } catch(e) { return false; }
}

// Called after sign-in to fetch supporter status without overwriting local state
async function loadSupporterStatus() {
  if (!_supabaseReady() || !_user) return;
  try {
    const { data } = await _sb.from('user_data')
      .select('*').eq('user_id', _user.id).single();
    _isSupporter    = !!(data?.is_supporter);
    _isAmbassador   = !!(data?.is_ambassador);
    _supporterSince = data?.supporter_since || null;
  } catch(e) { _isSupporter = false; _isAmbassador = false; _supporterSince = null; }
}

// Current schema version. Bump this when adding a new structural migration below.
// Cheap field-existence guards always run; numbered migrations only run when
// state._schemaVersion is behind, so old migrations are skipped on every subsequent load.
const SCHEMA_VERSION = 2;

// Parse a legacy combined qty string (e.g. "2 oz", "1 tsp") into {qty, unit}.
function _parseIngAmt(raw) {
  if (!raw) return { qty: '', unit: '' };
  const s = raw.trim();
  if (/^to taste$/i.test(s))  return { qty: '', unit: 'to taste' };
  if (/^a?\s*pinch$/i.test(s)) return { qty: '', unit: 'pinch' };
  const unitMap = {
    oz: 'oz', ounce: 'oz', ounces: 'oz',
    g: 'g', gram: 'g', grams: 'g',
    ml: 'ml',
    cup: 'cup', cups: 'cup',
    tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
    tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
    pkg: 'pkg', pack: 'pkg', packet: 'pkg', packets: 'pkg',
    pinch: 'pinch',
  };
  const m = s.match(/^([¼½¾⅓⅔⅛⅜⅝⅞\d.,\/]+)\s*(.*)$/);
  if (m) {
    const num  = m[1].trim();
    const tail = m[2].trim();
    const unit = unitMap[tail.toLowerCase()] ?? tail;
    return { qty: num, unit };
  }
  if (/^[¼½¾⅓⅔⅛⅜⅝⅞\d.,\/]+$/.test(s)) return { qty: s, unit: '' };
  return { qty: '', unit: s, _unparsed: true };
}

function applyMigrations() {
  // ── Field-existence guards (always run — cheap, idempotent) ─────
  if (!state.items)         state.items         = [];
  if (!state.trips)         state.trips         = [];
  if (!state.wishlist)      state.wishlist      = [];
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
  if (state.profile?.units) {
    _units = state.profile.units;
    syncUnitBtns();
  }

  // ── Numbered structural migrations (skip if already applied) ───
  const sv = state._schemaVersion || 0;

  if (sv < 1) {
    // Migration 1: trip.gear_ids → loadout_ids
    // Any trip that still has gear_ids (old model) gets an auto-created
    // loadout so no gear is lost. The trip then references it via loadout_ids.
    state.trips.forEach(t => {
      if (!t.carry_types)     t.carry_types     = {};
      if (!t.meal_plan_id)    t.meal_plan_id    = null;
      if (!t.item_quantities) t.item_quantities = {};
      if (!t.item_feedback)   t.item_feedback   = {};

      if (t.gear_ids && t.gear_ids.length && !t.loadout_ids) {
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
      delete t.gear_ids;
      delete t.carry_types;
      delete t.gear_overrides;
    });
  }

  if (sv < 2) {
    // Migration 2: ingredient {amount} or combined {qty} → {qty, unit}
    (state.recipes || []).forEach(recipe => {
      (recipe.ingredients || []).forEach(ing => {
        if ('unit' in ing) return; // already migrated
        const raw = ing.amount ?? ing.qty ?? '';
        const parsed = _parseIngAmt(String(raw));
        ing.qty  = parsed.qty;
        ing.unit = parsed.unit;
        if (parsed._unparsed) ing._unparsed_qty = raw;
        delete ing.amount;
      });
    });
  }

  // Add future migrations here as: if (sv < N) { ... }

  state._schemaVersion = SCHEMA_VERSION;
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
  // First visit — start with demo trips/loadout so new users can explore,
  // but keep the gear closet empty so the empty state is shown.
  const demoTrip  = JSON.parse(JSON.stringify(DEMO_DATA.trip));
  const demoTmpl  = JSON.parse(JSON.stringify(DEMO_DATA.template));

  state = {
    items:         [],
    trips:         [demoTrip],
    wishlist:      [],
    categories:    JSON.parse(JSON.stringify(SEED_DATA.categories)),
    templates:     [demoTmpl],
    trip_types:    JSON.parse(JSON.stringify(SEED_DATA.trip_types)),
    food_plans:    [JSON.parse(JSON.stringify(DEMO_FOOD_PLAN))],
    recipes:       JSON.parse(JSON.stringify(SEED_DATA.recipes)),
    custom_fields: [],
  };
  // Do NOT call saveState() here. Demo data lives in memory only.
  // Guests write to localStorage naturally on their first real interaction.
  // Signed-in users get this overwritten by loadFromCloud() immediately.
  // Calling saveState() here would write demo data to localStorage with a fresh
  // _savedAt timestamp, causing the migration guard in loadFromCloud() to mistake
  // it for real user data newer than Supabase and push it to the cloud.
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'trailkit-export.json';
  a.click();
  toast('Data exported!');
}

function confirmLoadSampleGear() {
  const hasTrip = state.trips.some(t => t.name === DEMO_DATA.trip.name);
  openModal('Load sample data?', `
    <p style="font-size:13px;color:var(--text-2);margin-bottom:.5rem">
      This will add the sample gear, loadout, and trip that new users see when they first open Gearnomic:
    </p>
    <ul style="font-size:13px;color:var(--text-2);margin:.5rem 0 1rem;padding-left:1.25rem">
      <li>${DEMO_DATA.items.length} generic gear items (duplicates skipped)</li>
      <li>1 loadout — <strong>${DEMO_DATA.template.name}</strong></li>
      <li>1 trip — <strong>${DEMO_DATA.trip.name}</strong></li>
    </ul>
    ${hasTrip ? `<p style="font-size:12px;color:var(--warning);margin-bottom:1rem">A trip named "${DEMO_DATA.trip.name}" already exists — it will be skipped.</p>` : ''}
    <div class="form-actions">
      <button class="btn btn-primary" onclick="loadSampleGear()">Load sample data</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`);
}

function loadSampleGear() {
  // 1. Add demo items, building an oldId → newId map for remapping references
  const existingKeys = new Set(state.items.map(i => `${i.name}|${i.brand}`));
  const idMap = {};
  let itemsAdded = 0;
  for (const seed of DEMO_DATA.items) {
    const newId = uid('i');
    idMap[seed.id] = newId;
    const key = `${seed.name}|${seed.brand}`;
    if (existingKeys.has(key)) continue;
    state.items.push({ ...seed, id: newId });
    existingKeys.add(key);
    itemsAdded++;
  }

  // 2. Add demo loadout with fresh ID, remapping gear_ids and carry_types
  const tmplId = uid('tmpl');
  const tmpl = JSON.parse(JSON.stringify(DEMO_DATA.template));
  tmpl.id        = tmplId;
  tmpl.gear_ids  = tmpl.gear_ids.map(id => idMap[id] || id);
  tmpl.carry_types = Object.fromEntries(
    Object.entries(tmpl.carry_types).map(([k, v]) => [idMap[k] || k, v])
  );
  state.templates.push(tmpl);

  // 3. Add demo trip with fresh ID referencing the new loadout, skip if name exists
  if (!state.trips.some(t => t.name === DEMO_DATA.trip.name)) {
    const trip = JSON.parse(JSON.stringify(DEMO_DATA.trip));
    trip.id          = uid('t');
    trip.loadout_ids = [tmplId];
    state.trips.push(trip);
  }

  saveState();
  refreshAll();
  closeModal();
  toast(`Sample data loaded: ${itemsAdded} items, 1 loadout, 1 trip added.`);
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
