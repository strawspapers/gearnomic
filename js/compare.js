// ── Gear Comparison Panel ─────────────────────────────────
// Compare 2–4 approved catalog items side-by-side.
// URL state: ?compare=id1,id2,... — read on load, updated on change.

let _cmpItems  = [];   // { id, brand, name, designation, manufacturer_weight_g, category, specs:[{name,unit,value}] }
let _cmpTimer  = null;
const CMP_MAX  = 4;

// ── Open / close ──────────────────────────────────────────

function openComparePanel() {
  document.getElementById('compare-panel').style.display = 'block';
  document.body.style.overflow = 'hidden';
  renderComparePanel();
  setTimeout(() => document.getElementById('cmp-search')?.focus(), 80);
}

function closeComparePanel() {
  document.getElementById('compare-panel').style.display = 'none';
  document.body.style.overflow = '';
  const url = new URL(window.location.href);
  url.searchParams.delete('compare');
  history.replaceState(null, '', url);
}

function clearCompare() {
  _cmpItems = [];
  updateCompareUrl();
  renderComparePanel();
}

// ── Search ────────────────────────────────────────────────

function cmpSearchDebounce() {
  clearTimeout(_cmpTimer);
  _cmpTimer = setTimeout(cmpSearchNow, 220);
}

async function cmpSearchNow() {
  const input   = document.getElementById('cmp-search');
  const results = document.getElementById('cmp-search-results');
  if (!results) return;
  const q = input?.value.trim();
  if (!q || q.length < 2) { results.style.display = 'none'; return; }

  if (!_sb) {
    results.innerHTML = '<div class="cmp-result-row" style="cursor:default;color:var(--text-3)">Sign in to search catalog</div>';
    results.style.display = 'block';
    return;
  }

  const { data } = await _sb
    .from('catalog_items')
    .select('id, brand, name, designation, manufacturer_weight_g, category')
    .eq('status', 'approved')
    .or(`brand.ilike.%${q}%,name.ilike.%${q}%,designation.ilike.%${q}%`)
    .order('brand')
    .limit(8);

  if (!data?.length) {
    results.innerHTML = '<div class="cmp-result-row" style="cursor:default;color:var(--text-3)">No items found</div>';
    results.style.display = 'block';
    return;
  }

  results.innerHTML = data.map(item => {
    const added = _cmpItems.some(c => c.id === item.id);
    const atMax = _cmpItems.length >= CMP_MAX;
    const disabled = !added && atMax;
    return `
      <div class="cmp-result-row${disabled ? ' disabled' : ''}"
        ${added || disabled ? '' : `onclick="cmpAdd('${item.id}')"`}>
        <div>
          <strong>${esc(item.brand)}</strong>
          <span style="color:var(--text-2);margin-left:6px">${esc(item.designation || item.name)}</span>
          ${item.manufacturer_weight_g != null ? `<span style="font-size:11px;color:var(--text-3);margin-left:8px">${item.manufacturer_weight_g}g</span>` : ''}
        </div>
        ${added
          ? '<span style="font-size:11px;color:var(--success)">Added ✓</span>'
          : disabled
            ? '<span style="font-size:11px;color:var(--text-3)">Max 4</span>'
            : '<span style="font-size:11px;color:var(--info)">+ Add</span>'}
      </div>`;
  }).join('');
  results.style.display = 'block';
}

// ── Add / remove items ────────────────────────────────────

async function cmpAdd(id) {
  if (_cmpItems.length >= CMP_MAX) return;
  if (_cmpItems.some(c => c.id === id)) return;
  if (!_sb) return;

  document.getElementById('cmp-search-results').style.display = 'none';
  document.getElementById('cmp-search').value = '';

  const [{ data: item, error: itemErr }, { data: specRows }] = await Promise.all([
    _sb.from('catalog_items')
      .select('id, brand, name, designation, manufacturer_weight_g, category')
      .eq('id', id)
      .single(),
    _sb.from('catalog_item_specs')
      .select('value, spec_fields(name, unit)')
      .eq('catalog_item_id', id),
  ]);

  if (itemErr || !item) { toast('Could not load item.'); return; }

  _cmpItems.push({
    ...item,
    specs: (specRows || [])
      .map(s => ({ name: s.spec_fields?.name || '', unit: s.spec_fields?.unit || '', value: s.value }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  });

  updateCompareUrl();
  renderComparePanel();
}

function cmpRemove(id) {
  _cmpItems = _cmpItems.filter(c => c.id !== id);
  updateCompareUrl();
  renderComparePanel();
}

function updateCompareUrl() {
  const url = new URL(window.location.href);
  if (_cmpItems.length) {
    url.searchParams.set('compare', _cmpItems.map(c => c.id).join(','));
  } else {
    url.searchParams.delete('compare');
  }
  history.replaceState(null, '', url);
}

// ── Render ────────────────────────────────────────────────

function renderComparePanel() {
  const wrap = document.getElementById('cmp-table-wrap');
  if (!wrap) return;

  const countEl = document.getElementById('cmp-count');
  if (countEl) countEl.textContent = `${_cmpItems.length} / ${CMP_MAX}`;

  if (!_cmpItems.length) {
    wrap.innerHTML = `
      <div class="cmp-empty">
        <div class="cmp-empty-icon">⚖</div>
        <p>Search for catalog items above to compare them side-by-side.</p>
      </div>`;
    return;
  }

  // Collect all spec field names present in any selected item
  const fieldOrder = [];
  const fieldSeen  = new Set();
  _cmpItems.forEach(item => {
    (item.specs || []).forEach(s => {
      if (s.name && !fieldSeen.has(s.name)) {
        fieldSeen.add(s.name);
        fieldOrder.push({ name: s.name, unit: s.unit || '' });
      }
    });
  });

  // Rows: fixed header rows + spec rows
  const rows = [
    { label: 'Category',  unit: '',  type: 'category' },
    { label: 'Weight',    unit: 'g', type: 'weight'   },
    ...fieldOrder.map(f => ({ label: f.name, unit: f.unit, type: 'spec' })),
  ];

  // Get raw string value for a cell
  const getValue = (item, row) => {
    if (row.type === 'weight')   return item.manufacturer_weight_g != null ? String(item.manufacturer_weight_g) : null;
    if (row.type === 'category') return item.category || null;
    return item.specs?.find(s => s.name === row.label)?.value ?? null;
  };

  // Per-row numeric analysis for highlighting
  const analyzeRow = row => {
    const vals = _cmpItems.map(item => {
      const v = getValue(item, row);
      const n = parseFloat(v);
      return isNaN(n) ? null : n;
    });
    const nums = vals.filter(v => v !== null);
    if (nums.length < 2) return { min: null, max: null, vals };
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    return { min, max: min === max ? null : max, vals };
  };

  // Table
  const colPct = Math.floor(75 / _cmpItems.length);

  let html = `<div class="cmp-table-wrap"><table class="cmp-table">
    <thead><tr>
      <th style="width:25%">
        <span style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3)">Field</span>
      </th>
      ${_cmpItems.map(item => `
        <th style="width:${colPct}%">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px">
            <div>
              <div style="font-size:13px;font-weight:600;color:var(--text-1)">${esc(item.brand)}</div>
              <div style="font-size:12px;color:var(--text-2);margin-top:2px;font-weight:400">${esc(item.designation || item.name)}</div>
            </div>
            <button class="cmp-remove-btn" onclick="cmpRemove('${item.id}')" title="Remove" style="color:var(--text-3)">×</button>
          </div>
        </th>`).join('')}
    </tr></thead>
    <tbody>`;

  rows.forEach(row => {
    const { min, max, vals } = analyzeRow(row);

    html += `<tr>
      <td class="cmp-row-label">${esc(row.label)}${row.unit ? `<span class="cmp-row-unit">${esc(row.unit)}</span>` : ''}</td>`;

    _cmpItems.forEach((item, i) => {
      const raw = getValue(item, row);
      const num = vals[i];

      let cellClass = '';
      if (num !== null) {
        if (num === min)       cellClass = 'cmp-cell-best';
        else if (num === max)  cellClass = 'cmp-cell-worst';
      }

      let display = raw != null ? esc(raw) : '<span class="cmp-cell-null">—</span>';
      if (row.type === 'weight' && raw != null) display = raw + ' g';

      html += `<td class="${cellClass}">${display}</td>`;
    });

    html += '</tr>';
  });

  html += '</tbody></table></div>';

  if (!fieldOrder.length) {
    html += `<p class="cmp-hint">No spec data available for these items. Specs can be added in the admin panel.</p>`;
  }

  wrap.innerHTML = html;
}

// ── URL boot ──────────────────────────────────────────────

async function loadCompareFromUrl() {
  const param = new URLSearchParams(window.location.search).get('compare');
  if (!param) return;
  const ids = param.split(',').map(s => s.trim()).filter(Boolean).slice(0, CMP_MAX);
  if (!ids.length) return;
  openComparePanel();
  for (const id of ids) await cmpAdd(id);
}
