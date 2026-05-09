// ── Dual Drawer System ────────────────────────────────────
// drawerGearDatabase — shared: gear closet page + loadout builder
// drawerGearCloset   — loadout builder only

let _drawerOpen   = null;   // 'db' | 'closet' | null
let _gearDbCache  = null;   // catalog items, fetched once on first open
let _drawerTmplId = null;   // template being edited in the closet drawer

// ── Open / close ──────────────────────────────────────────

function openDrawerDb() {
  if (_drawerOpen === 'db') { closeDrawers(); return; }
  closeDrawers(true);
  _drawerOpen = 'db';
  document.body.classList.add('drawer-db-open');
  if (_gearDbCache) {
    renderDrawerDb();
  } else {
    renderDrawerDb(); // shows "loading…" immediately
    fetchGearDb();
  }
}

function openDrawerCloset(tmplId) {
  if (_drawerOpen === 'closet' && _drawerTmplId === tmplId) { closeDrawers(); return; }
  closeDrawers(true);
  _drawerTmplId = tmplId;
  _drawerOpen = 'closet';
  document.body.classList.add('drawer-closet-open');
  renderDrawerCloset();
}

function closeDrawers(silent) {
  _drawerOpen = null;
  document.body.classList.remove('drawer-db-open', 'drawer-closet-open');
  if (!silent) {
    const dbIn = document.getElementById('drawer-db-search');
    if (dbIn) dbIn.value = '';
    const clIn = document.getElementById('drawer-closet-search');
    if (clIn) clIn.value = '';
  }
}

// ── Gear Database drawer ──────────────────────────────────

async function fetchGearDb() {
  if (!_sb) { renderDrawerDb(); return; }
  const { data, error } = await _sb
    .from('catalog_items')
    .select('id, brand, name, designation, manufacturer_weight_g, category')
    .eq('status', 'approved')
    .order('category')
    .order('brand');
  if (!error) _gearDbCache = data || [];
  renderDrawerDb();
}

function renderDrawerDb() {
  const body   = document.getElementById('drawer-db-body');
  const foot   = document.getElementById('drawer-db-foot');
  if (!body) return;

  if (!_sb) {
    body.innerHTML = '<div style="padding:20px 14px;font-size:12px;color:var(--text-3)">Sign in to browse the gear database.</div>';
    return;
  }
  if (!_gearDbCache) {
    body.innerHTML = '<div style="padding:20px 14px;font-size:12px;color:var(--text-3)">Loading catalog…</div>';
    return;
  }

  const q = (document.getElementById('drawer-db-search')?.value || '').toLowerCase();
  const closetCatalogIds = new Set(
    (state.items || []).map(i => i.catalog_item_id).filter(Boolean)
  );

  const items = q
    ? _gearDbCache.filter(i =>
        `${i.brand} ${i.name} ${i.designation || ''} ${i.category || ''}`.toLowerCase().includes(q))
    : _gearDbCache;

  if (!items.length) {
    body.innerHTML = '<div style="padding:20px 14px;font-size:12px;color:var(--text-3)">No items found.</div>';
    updateDrawerDbFoot(foot, closetCatalogIds.size);
    return;
  }

  const byCat = {};
  items.forEach(i => {
    const c = i.category || 'Uncategorized';
    (byCat[c] = byCat[c] || []).push(i);
  });

  body.innerHTML = Object.entries(byCat).map(([cat, rows]) => `
    <div class="drawer-cat-lbl">${esc(cat)}</div>
    ${rows.map(item => {
      const checked = closetCatalogIds.has(item.id);
      const wt  = item.manufacturer_weight_g != null ? wg(item.manufacturer_weight_g) : '';
      const sub = [item.brand, wt].filter(Boolean).join(' · ');
      return `<div class="drawer-item${checked ? ' checked' : ''}" onclick="toggleDbItem('${item.id}')">
        <div class="d-check"></div>
        <div class="d-info">
          <div class="d-name">${esc(item.designation || item.name)}</div>
          ${sub ? `<div class="d-sub">${esc(sub)}</div>` : ''}
        </div>
      </div>`;
    }).join('')}`).join('');

  updateDrawerDbFoot(foot, closetCatalogIds.size);
}

function updateDrawerDbFoot(foot, count) {
  if (!foot) return;
  foot.innerHTML = `
    <div class="drawer-foot-count">${count} item${count !== 1 ? 's' : ''} from catalog</div>
    <div class="drawer-foot-sub">items added go straight to your closet</div>`;
}

function toggleDbItem(catalogId) {
  const dbItem = _gearDbCache?.find(i => i.id === catalogId);
  if (!dbItem) return;

  const existing = (state.items || []).find(i => i.catalog_item_id === catalogId);
  if (existing) {
    if (!confirm(`Remove "${existing.name}" from your Gear Closet?`)) return;
    state.items = state.items.filter(i => i.id !== existing.id);
  } else {
    if (!checkLimit('items')) return;
    const cat = state.categories.find(c =>
      c.name.toLowerCase() === (dbItem.category || '').toLowerCase()
    )?.name || dbItem.category || (state.categories[0]?.name || 'Misc');
    state.items.push({
      id:              uid('i'),
      name:            dbItem.designation || dbItem.name,
      brand:           dbItem.brand || '',
      model:           dbItem.designation || '',
      category:        cat,
      weight_g:        dbItem.manufacturer_weight_g || 0,
      cost_usd:        null,
      condition:       'good',
      notes:           '',
      product_url:     null,
      volume_liters:   null,
      catalog_item_id: catalogId,
    });
  }

  saveState();
  renderGear();
  renderDrawerDb();
}

// ── Gear Closet drawer (loadout builder) ──────────────────

function renderDrawerCloset() {
  const body = document.getElementById('drawer-closet-body');
  const foot = document.getElementById('drawer-closet-foot');
  if (!body) return;

  const tmpl = state.templates.find(t => t.id === _drawerTmplId);
  if (!tmpl) {
    body.innerHTML = '<div style="padding:20px 14px;font-size:12px;color:var(--text-3)">No loadout selected.</div>';
    return;
  }

  const q = (document.getElementById('drawer-closet-search')?.value || '').toLowerCase();
  const inLoadout = new Set(tmpl.gear_ids || []);

  const items = (state.items || []).filter(i =>
    !q || `${i.name} ${i.brand || ''}`.toLowerCase().includes(q)
  );

  if (!items.length) {
    body.innerHTML = '<div style="padding:20px 14px;font-size:12px;color:var(--text-3)">Your gear closet is empty.</div>';
    updateDrawerClosetFoot(foot, tmpl);
    return;
  }

  const catOrder = categoryNames();
  const byCat = {};
  items.forEach(i => {
    const c = i.category || 'Misc';
    (byCat[c] = byCat[c] || []).push(i);
  });
  const sortedCats = Object.keys(byCat).sort((a, b) => {
    const ai = catOrder.indexOf(a), bi = catOrder.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1; if (bi === -1) return -1;
    return ai - bi;
  });

  body.innerHTML = sortedCats.map(cat => `
    <div class="drawer-cat-lbl">${esc(cat)}</div>
    ${byCat[cat].map(item => {
      const checked = inLoadout.has(item.id);
      const wt  = item.weight_g ? wg(item.weight_g) : '';
      const sub = [item.brand, wt].filter(Boolean).join(' · ');
      return `<div class="drawer-item${checked ? ' checked' : ''}" onclick="toggleClosetItem('${item.id}')">
        <div class="d-check"></div>
        <div class="d-info">
          <div class="d-name">${esc(item.name)}</div>
          ${sub ? `<div class="d-sub">${esc(sub)}</div>` : ''}
        </div>
      </div>`;
    }).join('')}`).join('');

  updateDrawerClosetFoot(foot, tmpl);
}

function updateDrawerClosetFoot(foot, tmpl) {
  if (!foot) return;
  const validIds = (tmpl.gear_ids || []).filter(id => state.items.find(i => i.id === id));
  const baseW = validIds.reduce((s, id) => {
    const item = state.items.find(i => i.id === id);
    const ct = getCarryType(tmpl, id);
    return s + (item && ct !== 'worn' && ct !== 'consumable' ? (item.weight_g || 0) : 0);
  }, 0);
  foot.innerHTML = `
    <div class="drawer-foot-count">${validIds.length} item${validIds.length !== 1 ? 's' : ''} in loadout</div>
    <div class="drawer-foot-sub">Base weight: ${wg(baseW)}</div>`;
}

function toggleClosetItem(itemId) {
  const tmpl = state.templates.find(t => t.id === _drawerTmplId);
  if (!tmpl) return;
  if (!tmpl.gear_ids) tmpl.gear_ids = [];

  const idx = tmpl.gear_ids.indexOf(itemId);
  if (idx >= 0) {
    tmpl.gear_ids.splice(idx, 1);
  } else {
    tmpl.gear_ids.push(itemId);
  }

  saveState();
  renderTemplateDetail(tmpl);
  renderDrawerCloset();
}

// ── Search input handlers ─────────────────────────────────

function drawerDbSearch()     { renderDrawerDb(); }
function drawerClosetSearch() { renderDrawerCloset(); }
