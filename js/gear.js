// Gearnomic — Gear Closet tab: table, CRUD, bulk actions, drag-and-drop, categories, and custom fields
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

  const sort = document.getElementById('gear-sort')?.value;
  const groupByCategory = sort === 'custom';

  let html = '';

  if (groupByCategory) {
    // Group by category and show headers with drag support
    const catOrder = categoryNames();
    const byCat = {};
    filtered.forEach(item => {
      if (!byCat[item.category]) byCat[item.category] = [];
      byCat[item.category].push(item);
    });

    const sortedCats = Object.keys(byCat).sort((a, b) => {
      const ai = catOrder.indexOf(a), bi = catOrder.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1; if (bi === -1) return -1;
      return ai - bi;
    });

    sortedCats.forEach(cat => {
      const catEsc = JSON.stringify(cat);
      html += `
        <div class="gear-cards-cat-header"
          data-cat="${esc(cat)}"
          ondragover="onCategoryDragOver(event,${catEsc})"
          ondragleave="onCategoryDragLeave(event)"
          ondrop="onCategoryDrop(event,${catEsc})">
          <span class="gear-handle" style="margin-right:8px;cursor:grab;user-select:none" title="Drag to move items here">⠿</span>
          <span style="font-weight:500;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-2)">${esc(cat)}</span>
        </div>`;

      byCat[cat].forEach(item => {
        const isSel = _bulkSelected.has(item.id);
        const catEsc = JSON.stringify(item.category);
        html += `<div class="gear-card ${isSel ? 'bulk-selected' : ''}" data-item-id="${item.id}" data-item-cat="${esc(item.category)}"
          draggable="true"
          ondragstart="onItemDragStart(event,'${item.id}')"
          ondragend="onItemDragEnd()"
          ondragover="onCategoryDragOver(event,${catEsc})"
          ondragleave="onCategoryDragLeave(event)"
          ondrop="onCategoryDrop(event,${catEsc})"
          onclick="${_bulkMode ? `toggleItemSelect('${item.id}')` : `toggleExpand('${item.id}')`}">
          <div class="gear-card-main">
            <div style="flex:1;min-width:0">
              <div style="font-weight:500;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(item.name)}${_replaceFlags[item.id] ? `<span class="replace-flag-dot" title="Flagged for replacement on: ${esc(_replaceFlags[item.id].join(', '))}"></span>` : ''}</div>
              <div style="font-size:12px;color:var(--text-3);margin-top:2px">${esc(item.brand||'')}${item.brand ? ' · ' : ''}${item.model ? esc(item.model) + ' · ' : ''}${badge('badge-gray', item.category)}</div>
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
              : `<button class="btn btn-xs" style="margin-left:10px;flex-shrink:0" onclick="event.stopPropagation();openEditItem('${item.id}')">Edit</button>`}
          </div>
          ${item.condition && item.condition !== '' ? `<div style="margin-top:6px">${badge(COND_BADGE[item.condition]||'badge-gray', COND_LABEL[item.condition])}</div>` : ''}
        </div>`;
      });
    });
  } else {
    // Flat list without categories
    html = filtered.map(item => {
      const isSel = _bulkSelected.has(item.id);
      return `<div class="gear-card ${isSel ? 'bulk-selected' : ''}" data-item-id="${item.id}"
        onclick="${_bulkMode ? `toggleItemSelect('${item.id}')` : `toggleExpand('${item.id}')`}">
        <div class="gear-card-main">
          <div style="flex:1;min-width:0">
            <div style="font-weight:500;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(item.name)}${_replaceFlags[item.id] ? `<span class="replace-flag-dot" title="Flagged for replacement on: ${esc(_replaceFlags[item.id].join(', '))}"></span>` : ''}</div>
            <div style="font-size:12px;color:var(--text-3);margin-top:2px">${esc(item.brand||'')}${item.brand ? ' · ' : ''}${item.model ? esc(item.model) + ' · ' : ''}${badge('badge-gray', item.category)}</div>
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
            : `<button class="btn btn-xs" style="margin-left:10px;flex-shrink:0" onclick="event.stopPropagation();openEditItem('${item.id}')">Edit</button>`}
        </div>
        ${item.condition && item.condition !== '' ? `<div style="margin-top:6px">${badge(COND_BADGE[item.condition]||'badge-gray', COND_LABEL[item.condition])}</div>` : ''}
      </div>`;
    }).join('');
  }

  cardsEl.innerHTML = html;
}

// Drag handlers for mobile gear cards grouped by category
function onCategoryDragOver(e, targetCat) {
  if (!_dragItemId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  // Highlight the category section when dragging over items
  document.querySelectorAll(`[data-item-cat="${esc(targetCat)}"], [data-cat="${esc(targetCat)}"]`)
    .forEach(el => el.classList.add('cat-section-highlight'));
}

function onCategoryDragLeave(e) {
  // Only clear if we're really leaving the category
  if (!e.relatedTarget || !e.relatedTarget.closest('[data-item-cat], [data-cat]')) {
    document.querySelectorAll('.cat-section-highlight')
      .forEach(el => el.classList.remove('cat-section-highlight'));
  }
}

function onCategoryDrop(e, targetCat) {
  e.preventDefault();
  const draggedId = e.dataTransfer.getData('text/plain') || _dragItemId;
  if (!draggedId || !targetCat) return;

  const item = state.items.find(i => i.id === draggedId);
  if (!item || item.category === targetCat) {
    document.querySelectorAll('.cat-section-highlight')
      .forEach(el => el.classList.remove('cat-section-highlight'));
    return;
  }

  item.category = targetCat;
  saveState();
  renderGear();
  toast(`Moved "${item.name}" → ${targetCat}`);
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
  if (!checkLimit('items')) return;
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

let _replaceFlags = {};

// ── Catalog search state ────────────────────────────────────
let _catalogSearchTimer  = null;
let _catalogResults      = [];      // current search result set, indexed by position
let _catalogSelectedId   = null;    // catalog_item_id chosen for the current add session
let _pendingCatalogSubmit = null;   // item data waiting for catalog submission prompt

function renderGear() {
  _replaceFlags = getReplaceFlagTrips();
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

  // Full closet empty state — shown when there are no items at all
  if (!state.items.length) {
    document.getElementById('gear-summary').innerHTML = '';
    const emptyHtml = `<div class="empty-state">
      <p style="max-width:380px;margin:0 auto .875rem">Nothing here yet. Add your first piece of gear to start tracking weight and cost, building loadouts, and planning trips.</p>
      <button class="btn btn-primary" onclick="openAddItemModal()">+ Add your first item</button>
    </div>`;
    document.getElementById('gear-cards').innerHTML = emptyHtml;
    document.getElementById('gear-tbody').innerHTML = `<tr><td colspan="10">${emptyHtml}</td></tr>`;
    document.getElementById('gear-thead').innerHTML = '';
    return;
  }

  const totalW = filtered.reduce((s, i) => s + (i.weight_g || 0), 0);
  const totalC = filtered.reduce((s, i) => s + (i.cost_usd || 0), 0);
  document.getElementById('gear-summary').innerHTML =
    `<strong>${filtered.length}</strong> items &nbsp;·&nbsp; total: <strong>${wg(totalW)}</strong> &nbsp;·&nbsp; tracked value: <strong>${usd(totalC)}</strong>`;

  const visibleCustomFields = (state.custom_fields || []).filter(f => f.show_column);
  const cols = 3 + (_visibleCols.has('category')?1:0) + (_visibleCols.has('cost')?1:0) +
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
            ${item.product_url ? `<a href="${safeHref(item.product_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-xs">View product ↗</a>` : ''}
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
        `<div class="item-name">${esc(item.name)}${_replaceFlags[item.id] ? `<span class="replace-flag-dot" title="Flagged for replacement on: ${esc(_replaceFlags[item.id].join(', '))}"></span>` : ''}</div><div class="item-sub">${esc(item.brand || '')}</div>`,
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

    <td class="gear-edit-col" onclick="event.stopPropagation()">
      <button class="gear-edit-btn" title="Edit all fields" onclick="openEditItem('${item.id}')">✎</button>
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
  const isNew = !item.id;

  // Catalog search section — only shown when adding a new item and Supabase is available
  const catalogSection = isNew && _supabaseReady() ? `
    <div id="catalog-search-wrap" style="margin-bottom:1rem;padding-bottom:1rem;border-bottom:.5px solid var(--border-2)">
      <label class="form-label">Search catalog <span style="font-size:10px;font-weight:400;color:var(--text-3);text-transform:none;letter-spacing:0">— find your item and pre-fill the form</span></label>
      <div style="position:relative">
        <input class="input input-full" id="catalog-search-input"
          placeholder="e.g. Big Agnes · Copper Spur · sleeping bag…"
          oninput="catalogSearchDebounced()" autocomplete="off">
        <div id="catalog-search-results"
          style="display:none;position:absolute;left:0;right:0;top:calc(100% + 4px);
                 background:var(--surface);border:1px solid var(--border);
                 border-radius:var(--r-lg);box-shadow:var(--shadow-md);z-index:50;overflow:hidden;max-height:280px;overflow-y:auto">
        </div>
      </div>
      <div id="catalog-selected-badge" style="display:none;margin-top:6px;font-size:12px;color:var(--primary)">
        ✓ Pre-filled from catalog.
        <button type="button" style="background:none;border:none;color:var(--text-3);font-size:12px;cursor:pointer;padding:0 0 0 4px;text-decoration:underline;font-family:inherit" onclick="clearCatalogSelection()">Clear</button>
      </div>
    </div>` : '';

  return `
    ${catalogSection}
    <input type="hidden" id="f-catalog-id" value="${esc(item.catalog_item_id || '')}">
    <div class="form-grid">
      <div class="form-row"><label class="form-label">Name *</label><input class="input input-full" id="f-name" value="${esc(item.name || '')}" placeholder="e.g. Sleeping bag" required></div>
      <div class="form-row"><label class="form-label">Brand</label><input class="input input-full" id="f-brand" value="${esc(item.brand || '')}" placeholder="e.g. Big Agnes"></div>
      <div class="form-row"><label class="form-label">Model</label><input class="input input-full" id="f-model" value="${esc(item.model || '')}" placeholder="e.g. Copper Spur HV UL2"></div>
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
    if (!checkLimit('items')) return;
    openAddItemModal();
  });
});

function showSavePromptBanner() {
  if (_user) return; // signed in — no banner needed
  if (sessionStorage.getItem('gn_save_prompt_dismissed')) return;
  const banner = document.getElementById('save-prompt-banner');
  if (!banner || banner.dataset.shown) return;
  banner.dataset.shown = '1';
  banner.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;
      background:var(--accent-l);border:1px solid var(--accent);border-radius:var(--r-lg);
      padding:.625rem 1rem;margin-bottom:1rem;font-size:13px">
      <span style="color:var(--text-1)">Your gear is saved on this device. <strong>Create a free account</strong> to keep it safe and access it anywhere.</span>
      <div style="display:flex;gap:8px;align-items:center;flex-shrink:0">
        <button class="btn btn-primary btn-sm" onclick="showAuthModal()">Sign up</button>
        <button class="btn btn-ghost btn-sm" onclick="dismissSavePrompt()">Dismiss</button>
      </div>
    </div>`;
  banner.style.display = 'block';
}

function dismissSavePrompt() {
  sessionStorage.setItem('gn_save_prompt_dismissed', '1');
  const banner = document.getElementById('save-prompt-banner');
  if (banner) { banner.style.display = 'none'; banner.innerHTML = ''; }
}

function hideSavePromptBanner() {
  const banner = document.getElementById('save-prompt-banner');
  if (banner) { banner.style.display = 'none'; banner.innerHTML = ''; }
}

function clearDemoDataOnFirstItem() {
  const hasDemoTrip = state.trips.some(t => t.id === DEMO_DATA.trip.id);
  const hasDemoTmpl = state.templates.some(t => t.id === DEMO_DATA.template.id);
  if (!hasDemoTrip && !hasDemoTmpl) return; // already cleared
  state.trips     = state.trips.filter(t => t.id !== DEMO_DATA.trip.id);
  state.templates = state.templates.filter(t => t.id !== DEMO_DATA.template.id);
  saveState();
  toast('Demo data cleared — this is your account now.');
}

function saveItem(id) {
  const name = document.getElementById('f-name').value.trim();
  if (!name) { alert('Name is required.'); return; }

  const catalogId = document.getElementById('f-catalog-id')?.value.trim() || null;

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
    catalog_item_id:  catalogId || undefined,
  };

  const isNew = !id;
  if (id) {
    const idx = state.items.findIndex(i => i.id === id);
    if (idx >= 0) state.items[idx] = data;
  } else {
    state.items.push(data);
  }

  saveState(); closeModal(); renderGear();
  if (currentTab === 'dashboard') renderDashboard();
  toast(id ? 'Item updated!' : 'Item added!');

  if (isNew && !_user && state.items.length === 1) {
    clearDemoDataOnFirstItem();
    // Show banner after a brief delay so the toast doesn't compete
    setTimeout(showSavePromptBanner, 800);
  }

  // Offer catalog submission for new manually-added items (no catalog match),
  // once per session, only when signed in (catalog insert requires auth)
  if (isNew && !catalogId && _user && _supabaseReady()
      && !sessionStorage.getItem('gn_catalog_prompted')) {
    _pendingCatalogSubmit = data;
    setTimeout(showCatalogSubmitPrompt, 700);
  }

  // Reset catalog selection state for the next add
  _catalogSelectedId = null;

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

// ── Catalog search & submission ─────────────────────────────

function openAddItemModal() {
  _catalogSelectedId = null;
  _catalogResults    = [];
  openModal('Add gear item', itemFormHtml());
}

function catalogSearchDebounced() {
  clearTimeout(_catalogSearchTimer);
  const q = document.getElementById('catalog-search-input')?.value.trim();
  const resultsEl = document.getElementById('catalog-search-results');
  if (!q || q.length < 2) {
    if (resultsEl) resultsEl.style.display = 'none';
    return;
  }
  _catalogSearchTimer = setTimeout(() => runCatalogSearch(q), 300);
}

async function runCatalogSearch(q) {
  if (!_supabaseReady()) return;
  const resultsEl = document.getElementById('catalog-search-results');
  if (!resultsEl) return;

  resultsEl.style.display = 'block';
  resultsEl.innerHTML = `<div style="padding:10px 12px;font-size:13px;color:var(--text-3)">Searching…</div>`;

  // Escape % and _ so they are treated as literals in the ilike pattern
  const safe = q.replace(/%/g, '\\%').replace(/_/g, '\\_');
  const { data, error } = await _sb.from('catalog_items')
    .select('id,brand,name,designation,manufacturer_weight_g,url')
    .eq('status', 'approved')
    .or(`brand.ilike.%${safe}%,name.ilike.%${safe}%,designation.ilike.%${safe}%`)
    .limit(8);

  if (error) { resultsEl.style.display = 'none'; return; }

  _catalogResults = data || [];

  if (!_catalogResults.length) {
    resultsEl.innerHTML = `
      <div style="padding:10px 12px;font-size:13px;color:var(--text-3)">
        No matches —
        <button type="button"
          style="background:none;border:none;color:var(--primary);font-size:13px;cursor:pointer;padding:0;font-family:inherit"
          onclick="dismissCatalogSearch()">add manually</button>
      </div>`;
    return;
  }

  resultsEl.innerHTML = _catalogResults.map((item, i) => {
    const weight = item.manufacturer_weight_g ? wg(item.manufacturer_weight_g) : '';
    const desig  = item.designation ? ` <span style="color:var(--text-3)">${esc(item.designation)}</span>` : '';
    return `
      <div class="catalog-result-row" onclick="selectCatalogResult(${i})">
        <div style="font-size:13px;font-weight:500">${esc(item.brand)} ${esc(item.name)}${desig}</div>
        ${weight ? `<div style="font-size:11px;color:var(--text-3);margin-top:1px">${weight}</div>` : ''}
      </div>`;
  }).join('');
}

function selectCatalogResult(idx) {
  const item = _catalogResults[idx];
  if (!item) return;

  _catalogSelectedId = item.id;

  // Fill form fields — designation maps to model (the specific variant name)
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set('f-catalog-id', item.id);
  set('f-brand', item.brand || '');
  set('f-name',  item.name  || '');
  set('f-model', item.designation || '');
  if (item.manufacturer_weight_g) set('f-weight', gToDisplay(item.manufacturer_weight_g));
  if (item.url) set('f-url', item.url);

  // Hide results, update search input to show what was picked, show badge
  const resultsEl = document.getElementById('catalog-search-results');
  if (resultsEl) resultsEl.style.display = 'none';
  const inputEl = document.getElementById('catalog-search-input');
  if (inputEl) inputEl.value = [item.brand, item.name, item.designation].filter(Boolean).join(' ');
  const badge = document.getElementById('catalog-selected-badge');
  if (badge) badge.style.display = 'block';

  // Focus name field so user can continue filling the form
  document.getElementById('f-name')?.focus();
}

function clearCatalogSelection() {
  _catalogSelectedId = null;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set('f-catalog-id', '');
  const inputEl = document.getElementById('catalog-search-input');
  if (inputEl) { inputEl.value = ''; inputEl.focus(); }
  const badge = document.getElementById('catalog-selected-badge');
  if (badge) badge.style.display = 'none';
  const resultsEl = document.getElementById('catalog-search-results');
  if (resultsEl) resultsEl.style.display = 'none';
}

function dismissCatalogSearch() {
  // User chose to add manually — collapse the search section
  const wrap = document.getElementById('catalog-search-wrap');
  if (wrap) wrap.style.display = 'none';
}

// ── Catalog submission prompt & form ────────────────────────

function showCatalogSubmitPrompt() {
  const item = _pendingCatalogSubmit;
  if (!item) return;
  sessionStorage.setItem('gn_catalog_prompted', '1');
  openModal('Add to catalog?', `
    <p style="font-size:13px;color:var(--text-2);margin-bottom:1rem">
      <strong>${esc(item.name)}</strong> isn't in our community catalog yet.
      Submit it so other hikers can find it — it'll be reviewed before going live.
    </p>
    <div class="form-actions">
      <button class="btn btn-primary" onclick="closeModal();openCatalogSubmitModal()">Submit for review</button>
      <button class="btn btn-ghost" onclick="closeModal()">Not now</button>
    </div>`);
}

function openCatalogSubmitModal() {
  const item = _pendingCatalogSubmit || {};
  const disciplines = ['hiking','backpacking','bikepacking','bike touring','fastpacking'];
  const discBoxes = disciplines.map(d => `
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;padding:3px 0">
      <input type="checkbox" value="${d}" class="cs-disc"
        style="width:15px;height:15px;accent-color:var(--primary);flex-shrink:0">
      ${d.charAt(0).toUpperCase() + d.slice(1)}
    </label>`).join('');

  openModal('Submit to catalog', `
    <p style="font-size:13px;color:var(--text-2);margin-bottom:1rem">
      Help the community! Your submission will be reviewed before going live.
    </p>
    <div class="form-grid">
      <div class="form-row">
        <label class="form-label">Brand *</label>
        <input class="input input-full" id="cs-brand" value="${esc(item.brand || '')}" placeholder="e.g. Big Agnes">
      </div>
      <div class="form-row">
        <label class="form-label">Name *</label>
        <input class="input input-full" id="cs-name" value="${esc(item.name || '')}" placeholder="e.g. Copper Spur">
      </div>
    </div>
    <div class="form-row">
      <label class="form-label">Designation <span style="font-size:10px;font-weight:400;color:var(--text-3);text-transform:none;letter-spacing:0">model or variant — e.g. "HV UL2", "40L", "1+"</span></label>
      <input class="input input-full" id="cs-designation" value="${esc(item.model || '')}" placeholder="e.g. HV UL2">
    </div>
    <div class="form-row" style="margin-bottom:.875rem">
      <label class="form-label">Discipline</label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px;margin-top:4px">${discBoxes}</div>
    </div>
    <div class="form-grid">
      <div class="form-row">
        <label class="form-label">Manufacturer weight (grams)</label>
        <input class="input input-full" id="cs-weight" type="number" min="0" step="0.1"
          value="${item.weight_g ? Math.round(item.weight_g) : ''}">
      </div>
      <div class="form-row">
        <label class="form-label">Product URL</label>
        <input class="input input-full" id="cs-url" value="${esc(item.product_url || '')}" placeholder="https://">
      </div>
    </div>
    <div class="form-row">
      <label class="form-label">Description</label>
      <textarea class="input input-full" id="cs-desc" rows="2" style="height:56px"
        placeholder="Brief description…"></textarea>
    </div>
    <div class="form-actions">
      <button class="btn btn-primary" onclick="submitToCatalog()">Submit for review</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`);
}

async function submitToCatalog() {
  if (!_supabaseReady() || !_user) {
    alert('You need to be signed in to submit to the catalog.');
    return;
  }

  const val = id => document.getElementById(id)?.value?.trim() || '';

  const brand = val('cs-brand');
  const name  = val('cs-name');
  if (!brand || !name) { alert('Brand and name are required.'); return; }

  const discipline = [...document.querySelectorAll('.cs-disc:checked')].map(el => el.value);
  const rawWeight  = val('cs-weight');
  const mfgWeight  = rawWeight ? parseFloat(rawWeight) : null;

  const payload = {
    brand,
    name,
    designation:           val('cs-designation') || null,
    discipline:            discipline.length ? discipline : null,
    manufacturer_weight_g: rawWeight && !isNaN(mfgWeight) ? mfgWeight : null,
    url:                   val('cs-url') || null,
    description:           val('cs-desc') || null,
    status:                'pending',
    submitted_by:          _user.id,
  };

  try {
    const { error } = await _sb.from('catalog_items').insert(payload);
    if (error) { alert('Submit failed: ' + error.message); return; }
  } catch(e) {
    alert('Submit failed: ' + (e.message || 'Unknown error'));
    return;
  }

  closeModal();
  _pendingCatalogSubmit = null;
  toast('Submitted for review — thanks for contributing!');
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
          <button class="btn btn-xs" style="flex:1" onclick="reorderItem('${itemId}','${i.id}','before')">→ Before</button>
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
        <td><div class="item-name">${esc(item.name)}</div><div class="item-sub">${esc(item.brand||'')}${item.brand ? ' · ' : ''}${item.model ? esc(item.model) + ' · ' : ''}${badge('badge-gray', item.category)}</div></td>
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
      <button class="btn btn-xs btn-danger" onclick="event.stopPropagation();deleteCategory('${esc(cat.name)}')" title="Delete">Remove</button>
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

