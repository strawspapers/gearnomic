// Gearnomic � Food Planning tab: meal plans, recipe library, and shopping list
// ============================================================
// FOOD PLANNING
// ============================================================
const MEAL_TIMES  = ['breakfast','snack','lunch','dinner'];
const MEAL_LABELS = { breakfast:'Breakfast', snack:'Snack', lunch:'Lunch', dinner:'Dinner' };
const MEAL_ICONS  = { breakfast:'', snack:'', lunch:'', dinner:'' };
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
  const dbView = document.getElementById('food-sub-db');
  if (dbView) dbView.style.display = view === 'db' ? '' : 'none';
  // Sync sub-nav active state
  document.querySelectorAll('#food-sub-nav .sub-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.sub === view);
  });
  // Show + New plan button only in plans view
  const btnPlan = document.getElementById('btn-food-plan');
  if (btnPlan) btnPlan.style.display = view === 'plans' ? '' : 'none';

  // Show upgrade nudge for free users who've used their 1-plan slot
  let banner = document.getElementById('food-free-banner');
  const showBanner = !_isSupporter && !_isAmbassador && state.food_plans.length >= 1;
  if (showBanner) {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'food-free-banner';
      banner.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:var(--accent-l);border:1px solid var(--accent);border-radius:var(--r-lg);padding:.625rem 1rem;margin-bottom:1rem;font-size:13px';
      banner.innerHTML = `
        <span style="color:var(--text-1)">
          <strong>Free accounts include 1 meal plan.</strong> Upgrade for unlimited plans.
        </span>
        <button class="btn btn-primary btn-sm" onclick="openUpgradeModal('Free accounts include 1 meal plan. Upgrade for unlimited.')">Upgrade</button>`;
      const view = document.getElementById('food-plans-view');
      if (view) view.insertBefore(banner, view.firstChild);
    }
    banner.style.display = 'flex';
  } else {
    if (banner) banner.style.display = 'none';
  }

  if (view === 'recipes') renderRecipeLibrary();
  else if (view === 'db') renderRecipeDbInline();
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
      <p style="max-width:360px;margin:0 auto .875rem">No meal plans yet. Build a meal plan to track calories and food weight per trip.</p>
      <button class="btn btn-primary" onclick="openNewFoodPlan()">+ New plan</button>
    </div>`;
    return;
  }
  grid.innerHTML = state.food_plans.map(plan => {
    const trip    = plan.trip_id ? state.trips.find(t => t.id === plan.trip_id) : null;
    const meals   = (plan.meals || []).map(mealItemEffective);
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
      ${(() => { const r = resolvedPackedWeight(plan); return r ? `<div style="font-size:11px;color:var(--text-3);margin-top:4px">Packed: <span class="mono">${wg(r.weight)}</span> <span style="opacity:.65">(${r.source})</span></div>` : ''; })()}
    </div>`;
  }).join('');
  if (activeFoodPlanId) renderFoodPlanDetail(state.food_plans.find(p => p.id === activeFoodPlanId));
}

function neededMealsSummary(plan) {
  const d = plan.days, n = plan.nights ?? (plan.days - 1);
  return `${d} Breakfast${d !== 1 ? 's' : ''} · ${d} Lunch${d !== 1 ? 'es' : ''} · ${d} Snack${d !== 1 ? 's' : ''} · ${n} Dinner${n !== 1 ? 's' : ''}`;
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
  const meals = (plan.meals || []).map(mealItemEffective);
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
        <span><strong>${plan.days}</strong> breakfasts</span>
        <span><strong>${plan.days}</strong> snack sets</span>
        <span><strong>${plan.days}</strong> lunches</span>
        <span><strong>${nights}</strong> dinners</span>
      </div>
      <div style="margin-top:.5rem;color:var(--text-3)">Target: ${plan.cal_target_per_day.toLocaleString()} cal/day · ${plan.weight_target_g_per_day}g (~${(plan.weight_target_g_per_day/453.6).toFixed(1)}lb) food/day</div>
      <div style="margin-top:.375rem;display:flex;gap:14px;flex-wrap:wrap;font-size:11.5px;color:var(--text-3)">
        ${MEAL_TIMES.map(mt => `<span>${MEAL_LABELS[mt]}: <strong>${mealCalTarget(plan, mt)}</strong> cal</span>`).join('')}
        <button class="btn btn-xs" style="margin-left:auto" onclick="openEditFoodPlan('${plan.id}')">Adjust splits</button>
      </div>
    </div>`;

  // Summary metrics
  const calPct = targetCal ? Math.round(totalCal/targetCal*100) : 0;
  const wPct   = targetW   ? Math.round(totalW/targetW*100)     : 0;
  const metrics = `
    <div class="metrics-row" style="margin-bottom:1rem">
      <div class="metric-card"><div class="metric-label">Total calories</div><div class="metric-val">${totalCal.toLocaleString()}</div><div class="metric-sub">${calPct}% of ${(targetCal/1000).toFixed(1)}k target</div></div>
      <div class="metric-card"><div class="metric-label">Cal / day</div><div class="metric-val">${avgCalPD.toLocaleString()}</div><div class="metric-sub">target ${plan.cal_target_per_day.toLocaleString()}</div></div>
      <div class="metric-card"><div class="metric-label">Total food weight</div><div class="metric-val">${wg(totalW)}</div><div class="metric-sub">${wPct}% of ${wg(targetW)} target</div></div>
      <div class="metric-card"><div class="metric-label">Weight / day</div><div class="metric-val">${wg(avgWPD)}</div><div class="metric-sub">${(avgWPD/453.6).toFixed(1)} lb · target ${(plan.weight_target_g_per_day/453.6).toFixed(1)} lb</div></div>
    </div>`;

  // Packed weight section
  const auto = planPackedWeight(plan);
  const hasManual = plan.manual_packed_weight_g != null;
  const resolved = hasManual
    ? { weight: plan.manual_packed_weight_g, source: 'manual' }
    : auto.total > 0 ? { weight: auto.total, source: 'auto' } : null;
  const packedWeightSection = `
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:.875rem;padding:.625rem .875rem;border:.5px solid var(--border-2)">
      <span style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);flex-shrink:0">Packed weight</span>
      <span style="font-size:13px;color:var(--text-2)">
        Auto: ${auto.total > 0
          ? `<strong class="mono">${wg(auto.total)}</strong>${auto.count < auto.totalMeals ? ` <span style="font-size:11px;color:var(--text-3)">(${auto.count} of ${auto.totalMeals} meals)</span>` : ''}`
          : '<span style="color:var(--text-3)">—</span>'}
      </span>
      <span style="display:flex;align-items:center;gap:5px">
        <span style="font-size:13px;color:var(--text-2)">Manual:</span>
        <input class="input" type="number" min="0" style="width:80px;height:28px;font-size:12px"
          value="${hasManual ? plan.manual_packed_weight_g : ''}" placeholder="— g"
          oninput="saveManualPackedWeight('${plan.id}',this.value)">
        <span style="font-size:11px;color:var(--text-3)">g</span>
      </span>
      ${resolved ? `<span style="font-size:11px;padding:2px 8px;background:var(--surface-2);color:var(--text-2)">Using <strong>${resolved.source}</strong>: ${wg(resolved.weight)}</span>` : ''}
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
              <span style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-3)">${MEAL_LABELS[mt]}</span>
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
              <span style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.05em;color:var(--text-3)">${MEAL_LABELS[mt]}</span>
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
                <button class="btn btn-xs btn-danger" onclick="deleteMealItem('${plan.id}','${m.id}')">Remove</button>
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
        <div class="meal-day-grid">${slots}</div>
      </div>`;
  }).join('');

  document.getElementById('food-plan-detail').innerHTML = `
    <div class="card-header" style="margin-bottom:.75rem">
      <div>
        <span class="card-title" style="font-size:17px;font-family:var(--font-disp)">${esc(plan.name)}</span>
        ${trip ? `&nbsp;<span style="font-size:12px;color:var(--text-3)">· ${esc(trip.name)}</span>` : ''}
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-sm" onclick="openShoppingList('${plan.id}')">Shopping list</button>
        <button class="btn btn-sm" onclick="openEditFoodPlan('${plan.id}')">Edit plan</button>
        <button class="btn btn-sm btn-danger" onclick="deleteFoodPlan('${plan.id}')">Delete</button>
        <button class="btn btn-sm btn-ghost" onclick="closeFoodPlan()">Close</button>
      </div>
    </div>
    ${guidance}
    ${metrics}
    ${packedWeightSection}
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
          <span style="width:80px;font-size:12px;color:var(--text-2)">${MEAL_LABELS[mt]}</span>
          <input type="range" id="fp-split-${mt}" min="5" max="60" value="${pct}"
            style="flex:1;accent-color:var(--primary)"
            oninput="updateSplitPreview()">
          <span style="width:38px;text-align:right;font-size:12px;font-weight:500" id="fp-pct-${mt}">${pct}%</span>
          <span style="width:55px;text-align:right;font-size:11px;color:var(--text-3)" id="fp-cal-${mt}">${cal} cal</span>
        </div>`;
      }).join('')}
      <div id="fp-split-warning" style="display:none;font-size:12px;color:var(--danger);margin-top:.25rem">! Percentages must sum to 100% before saving</div>
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
  // Free accounts get 1 plan; supporters and ambassadors get unlimited
  if (!id && !_isSupporter && !_isAmbassador && state.food_plans.length >= 1) {
    openUpgradeModal('Free accounts include 1 meal plan. Upgrade for unlimited.');
    return;
  }
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
    manual_packed_weight_g: existing?.manual_packed_weight_g ?? null,
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
  const recs = state.recipes.filter(r => {
    const mt = Array.isArray(r.meal_time) ? r.meal_time : (r.meal_time ? [r.meal_time] : []);
    return !mt.length || mt.includes(mealTime) || mt.includes('snack');
  });

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
          ${recs.map(r => { const e = recipeEffective(r); return `<option value="${r.id}" data-cal="${e.cal}" data-w="${e.wg}">${esc(r.name)} (${e.cal} cal · ${e.wg}g)</option>`; }).join('')}
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
          ${recs.map(r => { const e = recipeEffective(r); return `<option value="${r.id}" data-cal="${e.cal}" data-w="${e.wg}">${esc(r.name)} (${e.cal} cal · ${e.wg}g)</option>`; }).join('')}
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
  const eff = recipeEffective(rec);
  if (nameEl) nameEl.value = rec.name;
  if (calEl)  calEl.value  = eff.cal;
  if (wgEl)   wgEl.value   = gToDisplay(eff.wg);
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

function openShoppingList(planId) {
  const plan = state.food_plans.find(p => p.id === planId);
  if (!plan) return;

  const meals = plan.meals || [];

  // Collect ingredients from every meal that has a recipe
  const recipeIdsSeen = new Set();
  const allIngredients = []; // [{ name, qty }]

  meals.forEach(meal => {
    if (!meal.recipe_id) return;
    const recipe = state.recipes.find(r => r.id === meal.recipe_id);
    if (!recipe || !recipe.ingredients?.length) return;
    if (!recipeIdsSeen.has(meal.recipe_id)) recipeIdsSeen.add(meal.recipe_id);
    recipe.ingredients.forEach(ing => {
      if (ing.name?.trim()) allIngredients.push({ name: ing.name.trim(), qty: (ing.qty || '').trim(), unit: (ing.unit || '').trim() });
    });
  });

  const recipeCount = recipeIdsSeen.size;
  const panel = document.getElementById('shopping-list-panel');

  if (allIngredients.length === 0) {
    panel.innerHTML = `
      <div class="sl-header">
        <div style="font-weight:600;font-size:16px">${esc(plan.name)}</div>
        <div style="font-size:12px;color:var(--text-3);margin-top:2px">No recipes with ingredients added yet.</div>
        <div style="margin-top:10px"><button class="btn btn-ghost" onclick="closeShoppingList()">Close</button></div>
      </div>`;
    panel.style.display = 'flex';
    return;
  }

  // Group by ingredient name (case-insensitive)
  // Within each group, sub-group by unit suffix to enable numeric summing
  const groups = {}; // key: lowercaseName → { displayName, qtys: { suffixKey → { num, suffix } | { raw, count } } }

  allIngredients.forEach(({ name, qty, unit }) => {
    const key = name.toLowerCase();
    if (!groups[key]) groups[key] = { displayName: name, qtys: {} };

    const num = parseFloat(qty);
    if (!isNaN(num) && qty !== '') {
      // Numeric qty — group by unit so identical units can be summed
      const sk = '__num__' + (unit || '').toLowerCase();
      if (!groups[key].qtys[sk]) groups[key].qtys[sk] = { num: 0, suffix: unit, isNum: true };
      groups[key].qtys[sk].num += num;
    } else if (unit) {
      // Non-numeric (e.g. "to taste", "pinch") — group by unit string
      const rk = '__raw__' + unit.toLowerCase();
      if (!groups[key].qtys[rk]) groups[key].qtys[rk] = { raw: unit, count: 0 };
      groups[key].qtys[rk].count++;
    } else {
      // No qty, no unit
      const rk = '__raw__';
      groups[key].qtys[rk] = groups[key].qtys[rk] || { raw: '', count: 0 };
      groups[key].qtys[rk].count++;
    }
  });

  // Sort alphabetically by ingredient name
  const sorted = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  const total = sorted.length;

  function formatQtys(qtys) {
    return Object.values(qtys).map(q => {
      if (q.isNum) {
        const n = q.num % 1 === 0 ? String(q.num) : q.num.toFixed(1);
        return q.suffix ? `${n} ${q.suffix}` : n;
      }
      if (q.raw === '') return q.count > 1 ? `×${q.count}` : '';
      return q.count > 1 ? `${q.raw} ×${q.count}` : q.raw;
    }).filter(Boolean).join(', ');
  }

  // Load persisted checked state
  const storageKey = `gn_shopping_${planId}`;
  let checked = new Set();
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) checked = new Set(JSON.parse(saved));
  } catch (_) {}

  function saveChecked() {
    try { localStorage.setItem(storageKey, JSON.stringify([...checked])); } catch (_) {}
  }

  function counterText() {
    const n = checked.size;
    return n === 0 ? `${total} item${total !== 1 ? 's' : ''}` : `${n} of ${total} checked`;
  }

  // Render panel
  const itemsHtml = sorted.map(([key, g]) => {
    const qty = formatQtys(g.qtys);
    const isChecked = checked.has(key);
    return `
      <div class="sl-item${isChecked ? ' checked' : ''}" data-key="${esc(key)}" onclick="slToggle(this,'${storageKey}')">
        <span class="sl-check"><span class="sl-check-mark"></span></span>
        <span class="sl-text">${esc(g.displayName)}</span>
        ${qty ? `<span class="sl-qty">${esc(qty)}</span>` : ''}
      </div>`;
  }).join('');

  panel.innerHTML = `
    <div class="sl-header">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <div>
          <div style="font-weight:600;font-size:16px">${esc(plan.name)}</div>
          <div id="sl-counter" style="font-size:12px;color:var(--text-3);margin-top:2px">${counterText()}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-sm btn-ghost" onclick="slClearAll('${planId}','${storageKey}')">Clear all</button>
          <button class="btn btn-sm btn-ghost" onclick="window.print()">Print</button>
          <button class="btn btn-sm btn-ghost" onclick="closeShoppingList()">Close</button>
        </div>
      </div>
      <div style="font-size:12px;color:var(--text-3);margin-top:6px">${recipeCount} recipe${recipeCount !== 1 ? 's' : ''} · ${plan.days} day${plan.days !== 1 ? 's' : ''}</div>
    </div>
    <div class="sl-body">${itemsHtml}</div>`;

  panel.style.display = 'flex';
}

function slToggle(el, storageKey) {
  const key = el.dataset.key;
  const isChecked = el.classList.toggle('checked');
  let checked = new Set();
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) checked = new Set(JSON.parse(saved));
  } catch (_) {}
  if (isChecked) checked.add(key); else checked.delete(key);
  try { localStorage.setItem(storageKey, JSON.stringify([...checked])); } catch (_) {}

  // Update counter
  const panel = document.getElementById('shopping-list-panel');
  const total = panel.querySelectorAll('.sl-item').length;
  const checkedCount = panel.querySelectorAll('.sl-item.checked').length;
  const counter = document.getElementById('sl-counter');
  if (counter) counter.textContent = checkedCount === 0 ? `${total} item${total !== 1 ? 's' : ''}` : `${checkedCount} of ${total} checked`;
}

function slClearAll(planId, storageKey) {
  const panel = document.getElementById('shopping-list-panel');
  panel.querySelectorAll('.sl-item.checked').forEach(el => el.classList.remove('checked'));
  try { localStorage.removeItem(storageKey); } catch (_) {}
  const counter = document.getElementById('sl-counter');
  const total = panel.querySelectorAll('.sl-item').length;
  if (counter) counter.textContent = `${total} item${total !== 1 ? 's' : ''}`;
}

function closeShoppingList() {
  const panel = document.getElementById('shopping-list-panel');
  panel.style.display = 'none';
  panel.innerHTML = '';
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
// -- Recipe filter state
let _rfMealFilter  = new Set();
let _rfPrepFilter  = new Set();
let _rfSearch      = '';

const PREP_METHODS  = ['hot', 'cold-soak', 'no-cook'];
const PREP_LABELS   = { hot: 'Hot', 'cold-soak': 'Cold soak', 'no-cook': 'No cook' };

function rfToggleMeal(mt) {
  if (_rfMealFilter.has(mt)) _rfMealFilter.delete(mt); else _rfMealFilter.add(mt);
  renderRecipeLibrary();
}
function rfTogglePrep(pm) {
  if (_rfPrepFilter.has(pm)) _rfPrepFilter.delete(pm); else _rfPrepFilter.add(pm);
  renderRecipeLibrary();
}
function rfSetSearch(q) {
  _rfSearch = q.toLowerCase();
  renderRecipeLibrary();
}

function renderRecipeLibrary() {
  const grid = document.getElementById('recipes-grid');
  if (!grid) return;

  // Filter bar
  const fb = document.getElementById('recipe-filter-bar');
  if (fb) {
    const chip = (label, active, onclick) =>
      '<span style="display:inline-block;padding:3px 10px;font-size:11px;cursor:pointer;border:1.5px solid;user-select:none;' + (active ? 'background:var(--text-1);color:var(--bg);border-color:var(--text-1);' : 'background:transparent;color:var(--text-2);border-color:var(--border-2);') + '" onclick="' + onclick + '">' + label + '</span>';
    fb.innerHTML =
      '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
      '<input class="input" id="rf-search" placeholder="Search recipes…" style="width:180px;height:28px;font-size:12px" value="' + esc(_rfSearch) + '" oninput="rfSetSearch(this.value)">' +
      '<span style="font-size:11px;color:var(--text-3)">Meal:</span>' +
      MEAL_TIMES.map(mt => chip(MEAL_LABELS[mt], _rfMealFilter.has(mt), "rfToggleMeal('" + mt + "')")).join('') +
      '<span style="font-size:11px;color:var(--text-3)">Prep:</span>' +
      PREP_METHODS.map(pm => chip(PREP_LABELS[pm], _rfPrepFilter.has(pm), "rfTogglePrep('" + pm + "')")).join('') +
      (_rfMealFilter.size || _rfPrepFilter.size || _rfSearch ? '<button class="btn btn-xs btn-ghost" onclick="_rfMealFilter.clear();_rfPrepFilter.clear();_rfSearch=\'\';renderRecipeLibrary()">Clear</button>' : '') +
      '</div>';
  }

  // Apply filters
  let recipes = state.recipes;
  if (_rfMealFilter.size) recipes = recipes.filter(r =>
    (Array.isArray(r.meal_time) ? r.meal_time : (r.meal_time ? [r.meal_time] : [])).some(v => _rfMealFilter.has(v)));
  if (_rfPrepFilter.size) recipes = recipes.filter(r =>
    (Array.isArray(r.prep_method) ? r.prep_method : (r.prep_method ? [r.prep_method] : [])).some(v => _rfPrepFilter.has(v)));
  if (_rfSearch) recipes = recipes.filter(r => r.name.toLowerCase().includes(_rfSearch));

  if (!state.recipes.length) {
    grid.innerHTML = '<div class="empty-state"><p>No recipes yet.</p><button class="btn btn-primary" onclick="openRecipeForm()">+ Add recipe</button></div>';
    return;
  }
  if (!recipes.length) {
    grid.innerHTML = '<div class="empty-state"><p>No recipes match your filters.</p></div>';
    return;
  }

  const prepBadge = pm => pm
    ? '<span style="display:inline-block;padding:1px 6px;font-size:10px;font-weight:500;background:var(--surface-2);color:var(--text-2);margin-left:5px">' + esc(PREP_LABELS[pm] || pm) + '</span>'
    : '';

  grid.innerHTML = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.875rem">' +
    recipes.map(r =>
      '<div style="border:1px solid var(--border-2);padding:1.125rem;background:transparent">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.5rem">' +
      '<div style="min-width:0">' +
      '<div style="font-weight:600;font-size:14px;letter-spacing:-.005em">' + esc(r.name) + '</div>' +
      '<div style="font-size:11px;color:var(--text-3);margin-top:3px;text-transform:uppercase;letter-spacing:.05em">' +
      (Array.isArray(r.meal_time) ? r.meal_time : (r.meal_time ? [r.meal_time] : [])).map(m => MEAL_LABELS[m]||m).filter(Boolean).join(', ') +
      (Array.isArray(r.prep_method) ? r.prep_method : (r.prep_method ? [r.prep_method] : [])).map(p => prepBadge(p)).join('') +
      (r.source ? ' · ' + esc(r.source) : '') +
      '</div></div>' +
      '<div style="display:flex;gap:4px;flex-shrink:0;margin-left:8px">' +
      '<button class="btn btn-xs" onclick="openRecipeForm(\'' + r.id + '\')">Edit</button>' +
      '<button class="btn btn-xs btn-danger" onclick="deleteRecipe(\'' + r.id + '\')">Remove</button>' +
      '</div></div>' +
      (r.description ? '<div style="font-size:12px;color:var(--text-2);margin-bottom:.5rem;line-height:1.4">' + esc(r.description) + '</div>' : '') +
      (() => { const eff = recipeEffective(r); return '<div style="display:flex;gap:16px;font-size:12.5px;border-top:1px solid var(--border-2);padding-top:.5rem;margin-bottom:.5rem">' +
      '<span><strong>' + eff.cal + '</strong> cal</span>' +
      '<span><strong>' + wg(eff.wg) + '</strong></span>' +
      '<span style="color:var(--text-3)">' + (eff.cal / (eff.wg || 1)).toFixed(1) + ' cal/g</span>' +
      (r.use_ingredient_totals ? '<span style="font-size:10px;color:var(--text-3)">(from ingredients)</span>' : '') +
      '</div>'; })() +
      (r.ingredients && r.ingredients.length ? '<div style="font-size:11.5px;color:var(--text-2);margin-bottom:.5rem">' +
        r.ingredients.map(i => {
          const qtyPart = [i.qty, i.unit].filter(Boolean).join(' ');
          return '<div style="padding:1px 0">' + (qtyPart ? '<span style="color:var(--text-3)">' + esc(qtyPart) + '</span> ' : '') + esc(i.name) + '</div>';
        }).join('') + '</div>' : '') +
      (r.prep_notes ? '<div style="font-size:11.5px;color:var(--text-3);font-style:italic;margin-bottom:.25rem">' + esc(r.prep_notes) + '</div>' : '') +
      (!_user ? '' :
        r.submitted_to_catalog === 'approved'
          ? '<div style="margin-top:.5rem"><span style="display:inline-block;font-size:10px;padding:2px 7px;background:#e8f5e9;color:#2e7d32;font-weight:500">In database</span></div>'
          : r.submitted_to_catalog === 'pending'
            ? '<div style="margin-top:.5rem"><span style="display:inline-block;font-size:10px;padding:2px 7px;background:var(--surface-2);color:var(--text-3);font-weight:500">In review</span></div>'
            : '<div style="margin-top:.5rem"><button class="btn btn-xs" onclick="submitRecipeToCatalog(\'' + r.id + '\')">Submit to database</button></div>') +
      '</div>'
    ).join('') + '</div>';
}
function openRecipeForm(id) {
  const r = id ? state.recipes.find(r => r.id === id) : null;
  openModal(r ? 'Edit recipe' : 'New recipe', recipeFormHtml(r));
}

function recipeFormHtml(r) {
  r = r || {};
  const KNOWN_UNITS = ['oz','g','ml','cup','tbsp','tsp','pkg','pinch','to taste'];
  const ings = (r.ingredients && r.ingredients.length) ? r.ingredients : [{ qty: '', unit: '', name: '' }];
  const ingRowHtml = i => {
    const unitVal  = i.unit || '';
    const isOther  = unitVal && !KNOWN_UNITS.includes(unitVal);
    const selVal   = isOther ? 'other' : unitVal;
    const otherVal = isOther ? unitVal : '';
    return `
    <div class="rf-ing-row" style="display:flex;gap:6px;margin-bottom:5px;align-items:center">
      <input class="input rf-ing-qty" type="number" min="0" step="any" style="width:52px;flex-shrink:0" placeholder="#" value="${esc(String(i.qty||''))}">
      <select class="select rf-ing-unit" style="width:86px;flex-shrink:0" onchange="rfUnitChange(this)">
        <option value="">—</option>
        ${KNOWN_UNITS.map(u => `<option value="${u}"${selVal===u?' selected':''}>${u}</option>`).join('')}
        <option value="other"${isOther?' selected':''}>other…</option>
      </select>
      <input class="input rf-ing-unit-other" style="width:58px;flex-shrink:0${isOther?'':';display:none'}" placeholder="unit" value="${esc(otherVal)}">
      <input class="input rf-ing-name" style="flex:1;min-width:0" placeholder="ingredient" value="${esc(i.name||'')}">
      <input class="input rf-ing-cal" type="number" min="0" style="width:54px;flex-shrink:0;text-align:right" placeholder="cal" title="Calories for this ingredient" value="${i.cal||''}" oninput="rfUpdateIngTotals()">
      <input class="input rf-ing-wg" type="number" min="0" style="width:48px;flex-shrink:0;text-align:right" placeholder="g" title="Weight (grams) for this ingredient" value="${i.weight_g||''}" oninput="rfUpdateIngTotals()">
      <button type="button" class="btn btn-xs btn-ghost" style="flex-shrink:0;padding:4px 8px" onclick="this.closest('.rf-ing-row').remove();rfUpdateIngTotals()">×</button>
    </div>`;
  };
  return `
    <div class="form-grid">
      <div class="form-row" style="grid-column:1/-1"><label class="form-label">Recipe name *</label>
        <input class="input input-full" id="rf-name" value="${esc(r.name||'')}" placeholder="e.g. Skurka Beans & Rice"></div>
      <div class="form-row" style="grid-column:1/-1"><label class="form-label">Description <span style="font-weight:400;color:var(--text-3)">(optional)</span></label>
        <input class="input input-full" id="rf-desc" value="${esc(r.description||'')}" placeholder="Short description of this recipe…"></div>
      <div class="form-row"><label class="form-label">Meal type <span style="font-weight:400;color:var(--danger)">*</span></label>
        <div id="rf-meal-checks" style="display:flex;gap:14px;flex-wrap:wrap;padding:4px 0">
          ${(() => { const cur = Array.isArray(r.meal_time) ? r.meal_time : (r.meal_time ? [r.meal_time] : ['dinner']); return MEAL_TIMES.map(mt => `<label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:13px"><input type="checkbox" value="${mt}" ${cur.includes(mt)?'checked':''} style="cursor:pointer"> ${MEAL_LABELS[mt]}</label>`).join(''); })()}
        </div></div>
      <div class="form-row"><label class="form-label">Prep method <span style="font-weight:400;color:var(--danger)">*</span></label>
        <div id="rf-prep-checks" style="display:flex;gap:14px;flex-wrap:wrap;padding:4px 0">
          ${(() => { const cur = Array.isArray(r.prep_method) ? r.prep_method : (r.prep_method ? [r.prep_method] : []); return PREP_METHODS.map(pm => `<label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:13px"><input type="checkbox" value="${pm}" ${cur.includes(pm)?'checked':''} style="cursor:pointer"> ${PREP_LABELS[pm]}</label>`).join(''); })()}
        </div></div>
      <div class="form-row"><label class="form-label">Calories (per serving)</label>
        <input class="input input-full" id="rf-cal" type="number" min="0" value="${r.cal_per_serving||''}"></div>
      <div class="form-row"><label class="form-label">Weight g (per serving)</label>
        <input class="input input-full" id="rf-wg" type="number" min="0" value="${r.weight_g_per_serving||''}"></div>
    </div>
    <div class="form-row"><label class="form-label">Packed weight <span style="font-weight:400;color:var(--text-3)">(total grams when packed, optional)</span></label>
      <input class="input input-full" id="rf-packed-wg" type="number" min="0" placeholder="e.g. 285" value="${r.packed_weight_g != null ? r.packed_weight_g : ''}"></div>
    <div class="form-row"><label class="form-label">Source / credit</label>
      <input class="input input-full" id="rf-src" value="${esc(r.source||'')}" placeholder="e.g. Andrew Skurka"></div>
    <div class="form-row">
      <label class="form-label" style="display:flex;justify-content:space-between">
        <span>Ingredients</span>
        <span style="font-size:10px;font-weight:400;color:var(--text-3);letter-spacing:0;text-transform:none">cal &nbsp;&nbsp;&nbsp; g</span>
      </label>
      <div id="rf-ingredients-list">${ings.map(ingRowHtml).join('')}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;flex-wrap:wrap;gap:8px">
        <button type="button" class="btn btn-xs" onclick="rfAddIngredient()">+ Add ingredient</button>
        <span id="rf-ing-totals" style="font-size:12px;color:var(--text-3)">Ingredients total: <strong id="rf-ing-cal-sum">0</strong> cal · <strong id="rf-ing-wg-sum">0</strong> g</span>
      </div>
      <div style="margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-size:12px;color:var(--text-2)">Use for card &amp; meal planning:</span>
        <div style="display:flex;gap:0">
          <button type="button" id="rf-src-btn-keyed"
            class="btn btn-xs${!r.use_ingredient_totals ? ' btn-primary' : ''}"
            onclick="rfSetCalSource('keyed')">Keyed values</button>
          <button type="button" id="rf-src-btn-summed"
            class="btn btn-xs${r.use_ingredient_totals ? ' btn-primary' : ''}"
            onclick="rfSetCalSource('summed')">Ingredient totals</button>
        </div>
      </div>
      <input type="hidden" id="rf-cal-source" value="${r.use_ingredient_totals ? 'summed' : 'keyed'}">
    </div>
    <div class="form-row"><label class="form-label">Prep notes</label>
      <textarea class="input input-full" id="rf-prep" rows="3" placeholder="Preparation method, cook time, water temperature, tips...">${esc(r.prep_notes||'')}</textarea></div>
    <div class="form-actions">
      <button class="btn btn-primary" onclick="saveRecipe('${r.id||''}')">Save recipe</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`;
}

function rfUpdateIngTotals() {
  let totalCal = 0, totalWg = 0;
  document.querySelectorAll('#rf-ingredients-list .rf-ing-row').forEach(row => {
    totalCal += parseInt(row.querySelector('.rf-ing-cal')?.value) || 0;
    totalWg  += parseInt(row.querySelector('.rf-ing-wg')?.value)  || 0;
  });
  const calEl = document.getElementById('rf-ing-cal-sum');
  const wgEl  = document.getElementById('rf-ing-wg-sum');
  if (calEl) calEl.textContent = totalCal;
  if (wgEl)  wgEl.textContent  = totalWg;
}

function rfSetCalSource(source) {
  const hidden = document.getElementById('rf-cal-source');
  if (hidden) hidden.value = source;
  const keyed  = document.getElementById('rf-src-btn-keyed');
  const summed = document.getElementById('rf-src-btn-summed');
  if (keyed)  keyed.classList.toggle('btn-primary',  source === 'keyed');
  if (summed) summed.classList.toggle('btn-primary', source === 'summed');
}

function rfUnitChange(sel) {
  const other = sel.closest('.rf-ing-row')?.querySelector('.rf-ing-unit-other');
  if (!other) return;
  other.style.display = sel.value === 'other' ? '' : 'none';
  if (sel.value === 'other') other.focus();
}

function rfAddIngredient() {
  const list = document.getElementById('rf-ingredients-list');
  if (!list) return;
  const row = document.createElement('div');
  row.className = 'rf-ing-row';
  row.style.cssText = 'display:flex;gap:6px;margin-bottom:5px;align-items:center';
  row.innerHTML = `
    <input class="input rf-ing-qty" type="number" min="0" step="any" style="width:52px;flex-shrink:0" placeholder="#">
    <select class="select rf-ing-unit" style="width:86px;flex-shrink:0" onchange="rfUnitChange(this)">
      <option value="">—</option>
      ${['oz','g','ml','cup','tbsp','tsp','pkg','pinch','to taste'].map(u=>`<option value="${u}">${u}</option>`).join('')}
      <option value="other">other…</option>
    </select>
    <input class="input rf-ing-unit-other" style="width:58px;flex-shrink:0;display:none" placeholder="unit">
    <input class="input rf-ing-name" style="flex:1;min-width:0" placeholder="ingredient">
    <input class="input rf-ing-cal" type="number" min="0" style="width:54px;flex-shrink:0;text-align:right" placeholder="cal" title="Calories" oninput="rfUpdateIngTotals()">
    <input class="input rf-ing-wg" type="number" min="0" style="width:48px;flex-shrink:0;text-align:right" placeholder="g" title="Weight (g)" oninput="rfUpdateIngTotals()">
    <button type="button" class="btn btn-xs btn-ghost" style="flex-shrink:0;padding:4px 8px" onclick="this.closest('.rf-ing-row').remove();rfUpdateIngTotals()">×</button>`;
  list.appendChild(row);
  row.querySelector('.rf-ing-qty').focus();
}

function saveRecipe(id) {
  const name = document.getElementById('rf-name').value.trim();
  if (!name) { alert('Recipe name required.'); return; }
  const ingredients = Array.from(document.querySelectorAll('#rf-ingredients-list .rf-ing-row')).map(row => {
    const unitSel = row.querySelector('.rf-ing-unit')?.value || '';
    const unit = unitSel === 'other'
      ? (row.querySelector('.rf-ing-unit-other')?.value.trim() || '')
      : unitSel;
    const cal      = parseInt(row.querySelector('.rf-ing-cal')?.value) || 0;
    const weight_g = parseInt(row.querySelector('.rf-ing-wg')?.value)  || 0;
    return {
      qty:  row.querySelector('.rf-ing-qty')?.value.trim() || '',
      unit,
      name: row.querySelector('.rf-ing-name')?.value.trim() || '',
      ...(cal      ? { cal }      : {}),
      ...(weight_g ? { weight_g } : {}),
    };
  }).filter(i => i.name);
  const mealTimes  = Array.from(document.querySelectorAll('#rf-meal-checks input:checked')).map(el => el.value);
  const prepMethods = Array.from(document.querySelectorAll('#rf-prep-checks input:checked')).map(el => el.value);
  if (!mealTimes.length)  { alert('Please select at least one meal type.'); return; }
  if (!prepMethods.length) { alert('Please select at least one prep method.'); return; }
  const useIngTotals = document.getElementById('rf-cal-source')?.value === 'summed';
  const existing = id ? state.recipes.find(r => r.id === id) : null;
  const data = {
    id:   id || uid('rec'),
    name,
    meal_time:             mealTimes,
    prep_method:           prepMethods,
    description:           document.getElementById('rf-desc')?.value.trim() || '',
    cal_per_serving:       parseInt(document.getElementById('rf-cal').value) || 0,
    weight_g_per_serving:  parseInt(document.getElementById('rf-wg').value) || 0,
    use_ingredient_totals: useIngTotals,
    packed_weight_g:       (() => { const v = parseInt(document.getElementById('rf-packed-wg')?.value); return isNaN(v) ? null : v; })(),
    source:                document.getElementById('rf-src').value.trim(),
    prep_notes:            document.getElementById('rf-prep').value.trim(),
    ingredients,
    // Preserve catalog submission state if editing
    ...(existing?.submitted_to_catalog ? { submitted_to_catalog: existing.submitted_to_catalog } : {}),
    ...(existing?.catalog_recipe_id    ? { catalog_recipe_id:    existing.catalog_recipe_id    } : {}),
  };
  if (id) {
    const idx = state.recipes.findIndex(r => r.id === id);
    if (idx >= 0) state.recipes[idx] = data;
  } else {
    state.recipes.push(data);
  }
  saveState(); closeModal(); renderRecipeLibrary();
  toast(id ? 'Recipe updated!' : 'Recipe saved!');
}

// Returns a meal item with cal, weight_g, and name resolved live from the referenced recipe.
// Falls back to the stored snapshot values if the recipe no longer exists.
function mealItemEffective(m) {
  if (!m.recipe_id) return m;
  const rec = state.recipes.find(r => r.id === m.recipe_id);
  if (!rec) return m;
  const eff = recipeEffective(rec);
  return { ...m, name: rec.name, cal: eff.cal, weight_g: eff.wg };
}

// Auto-sum packed_weight_g across all meals in a plan that reference a recipe with packed_weight_g set.
function planPackedWeight(plan) {
  const meals = (plan.meals || []).filter(m => {
    if (!m.recipe_id) return false;
    const r = state.recipes.find(r => r.id === m.recipe_id);
    return r?.packed_weight_g != null;
  });
  const total = meals.reduce((s, m) => {
    const r = state.recipes.find(r => r.id === m.recipe_id);
    return s + (r?.packed_weight_g || 0);
  }, 0);
  return { total, count: meals.length, totalMeals: (plan.meals || []).length };
}

// Returns the resolved packed weight: manual if set, otherwise auto-sum. Null if neither.
function resolvedPackedWeight(plan) {
  if (plan.manual_packed_weight_g != null) return { weight: plan.manual_packed_weight_g, source: 'manual' };
  const { total, count } = planPackedWeight(plan);
  return total > 0 ? { weight: total, source: 'auto', count } : null;
}

function saveManualPackedWeight(planId, value) {
  const plan = state.food_plans.find(p => p.id === planId);
  if (!plan) return;
  const g = parseInt(value);
  plan.manual_packed_weight_g = (value === '' || isNaN(g)) ? null : g;
  saveState();
  renderFoodPlanGrid();
}

// Returns the effective cal and weight for a recipe based on user's choice.
function recipeEffective(r) {
  if (r.use_ingredient_totals && (r.ingredients || []).length) {
    return {
      cal: (r.ingredients).reduce((s, i) => s + (i.cal      || 0), 0),
      wg:  (r.ingredients).reduce((s, i) => s + (i.weight_g || 0), 0),
    };
  }
  return { cal: r.cal_per_serving || 0, wg: r.weight_g_per_serving || 0 };
}

function deleteRecipe(id) {
  if (!confirm('Delete this recipe?')) return;
  state.recipes = state.recipes.filter(r => r.id !== id);
  saveState(); renderRecipeLibrary();
  toast('Recipe deleted.');
}

// ── Submit recipe to community database ───────────────────
async function submitRecipeToCatalog(id) {
  if (!_sb || !_user) {
    alert('Sign in to submit recipes to the community database.');
    return;
  }
  const r = state.recipes.find(rec => rec.id === id);
  if (!r) return;

  const payload = {
    name:         r.name,
    description:  r.description || null,
    meal_time:    Array.isArray(r.meal_time)   ? r.meal_time   : (r.meal_time   ? [r.meal_time]   : null),
    prep_method:  Array.isArray(r.prep_method) ? r.prep_method : (r.prep_method ? [r.prep_method] : null),
    servings:     null,
    ingredients:  (r.ingredients && r.ingredients.length) ? r.ingredients : null,
    prep_notes:   r.prep_notes  || null,
    source:       r.source      || null,
    status:       'pending',
    submitted_by: _user.id,
  };

  try {
    const { error } = await _sb.from('recipes_catalog').insert(payload);
    if (error) { alert('Submit failed: ' + error.message); return; }
  } catch (e) {
    alert('Submit failed: ' + (e.message || 'Unknown error'));
    return;
  }

  r.submitted_to_catalog = 'pending';
  saveState();
  renderRecipeLibrary();
  toast('Recipe submitted for review — thanks!');
}

// ── Recipe database (community, inline panel) ─────────────
let _recipeCatalogCache = null;
let _recipeCatalogError = null;
let _rdbMealFilter = new Set();
let _rdbPrepFilter = new Set();

async function fetchRecipeDb() {
  if (!_sb) { renderRecipeDbInline(); return; }
  _recipeCatalogError = null;
  const { data, error } = await _sb
    .from('recipes_catalog')
    .select('id, name, description, meal_time, prep_method, servings, ingredients, prep_notes, source')
    .eq('status', 'approved')
    .order('meal_time')
    .order('name');
  if (error) {
    _recipeCatalogError = error.message || 'Failed to load recipes';
    _recipeCatalogCache = [];
  } else {
    _recipeCatalogCache = data || [];
  }
  renderRecipeDbInline();
}

function retryRecipeDb() {
  _recipeCatalogCache = null;
  _recipeCatalogError = null;
  renderRecipeDbInline();
  fetchRecipeDb();
}

function rdbToggleMeal(mt) {
  if (_rdbMealFilter.has(mt)) _rdbMealFilter.delete(mt); else _rdbMealFilter.add(mt);
  renderRecipeDbInline();
}

function rdbTogglePrep(pm) {
  if (_rdbPrepFilter.has(pm)) _rdbPrepFilter.delete(pm); else _rdbPrepFilter.add(pm);
  renderRecipeDbInline();
}

function recipeDbInlineSearch() {
  renderRecipeDbInline();
}

function renderRecipeDbInline() {
  const body      = document.getElementById('food-db-body');
  const foot      = document.getElementById('food-db-foot');
  const filterBar = document.getElementById('food-db-filter-bar');
  if (!body) return;

  if (!_sb) {
    body.innerHTML = '<div style="padding:20px 0;font-size:12px;color:var(--text-3)">Sign in to browse the recipe database.</div>';
    return;
  }
  if (_recipeCatalogError) {
    body.innerHTML = `<div style="padding:20px 0;font-size:12px;color:var(--text-3)">Could not load recipes.<br><button onclick="retryRecipeDb()" style="margin-top:8px;font-size:11px;padding:4px 10px;cursor:pointer;border:1px solid var(--border);border-radius:4px;background:var(--bg-2)">Retry</button></div>`;
    return;
  }
  if (!_recipeCatalogCache) {
    body.innerHTML = '<div style="padding:20px 0;font-size:12px;color:var(--text-3)">Loading…</div>';
    fetchRecipeDb();
    return;
  }

  // Filter chips
  if (filterBar) {
    const chip = (label, active, fn) =>
      `<span style="display:inline-block;padding:3px 10px;font-size:11px;cursor:pointer;border:1.5px solid;user-select:none;${active ? 'background:var(--text-1);color:var(--bg);border-color:var(--text-1)' : 'background:transparent;color:var(--text-2);border-color:var(--border-2)'}" onclick="${fn}">${label}</span>`;
    filterBar.innerHTML =
      '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
      '<span style="font-size:11px;color:var(--text-3)">Meal:</span>' +
      MEAL_TIMES.map(mt => chip(MEAL_LABELS[mt], _rdbMealFilter.has(mt), `rdbToggleMeal('${mt}')`)).join('') +
      '<span style="font-size:11px;color:var(--text-3)">Prep:</span>' +
      PREP_METHODS.map(pm => chip(PREP_LABELS[pm], _rdbPrepFilter.has(pm), `rdbTogglePrep('${pm}')`)).join('') +
      ((_rdbMealFilter.size || _rdbPrepFilter.size) ? ' <button class="btn btn-xs btn-ghost" onclick="_rdbMealFilter.clear();_rdbPrepFilter.clear();renderRecipeDbInline()">Clear</button>' : '') +
      '</div>';
  }

  const q = (document.getElementById('food-db-search')?.value || '').toLowerCase();
  const myRecipeCatalogIds = new Set(
    (state.recipes || []).map(r => r.catalog_recipe_id).filter(Boolean)
  );

  let items = _recipeCatalogCache;
  if (_rdbMealFilter.size) items = items.filter(i =>
    (Array.isArray(i.meal_time) ? i.meal_time : (i.meal_time ? [i.meal_time] : [])).some(v => _rdbMealFilter.has(v)));
  if (_rdbPrepFilter.size) items = items.filter(i =>
    (Array.isArray(i.prep_method) ? i.prep_method : (i.prep_method ? [i.prep_method] : [])).some(v => _rdbPrepFilter.has(v)));
  if (q) items = items.filter(i => {
    const mt = Array.isArray(i.meal_time)   ? i.meal_time.join(' ')   : (i.meal_time   || '');
    const pm = Array.isArray(i.prep_method) ? i.prep_method.join(' ') : (i.prep_method || '');
    return `${i.name} ${i.description || ''} ${mt} ${pm}`.toLowerCase().includes(q);
  });

  if (!items.length) {
    body.innerHTML = '<div style="padding:20px 0;font-size:12px;color:var(--text-3)">No recipes found.</div>';
    if (foot) foot.innerHTML = '';
    return;
  }

  const byMeal = {};
  items.forEach(i => {
    const firstMeal = Array.isArray(i.meal_time) ? i.meal_time[0] : i.meal_time;
    const c = MEAL_LABELS[firstMeal] || firstMeal || 'Other';
    (byMeal[c] = byMeal[c] || []).push(i);
  });
  const mealOrder = MEAL_TIMES.map(mt => MEAL_LABELS[mt]);
  const sortedMeals = Object.keys(byMeal).sort((a, b) => {
    const ai = mealOrder.indexOf(a), bi = mealOrder.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1; if (bi === -1) return -1;
    return ai - bi;
  });

  body.innerHTML = sortedMeals.map(meal => `
    <div class="drawer-cat-lbl">${esc(meal)}</div>
    ${byMeal[meal].map(item => {
      const already    = myRecipeCatalogIds.has(item.id);
      const prepLabel  = PREP_LABELS[item.prep_method] || '';
      const sub        = [prepLabel, item.description].filter(Boolean).join(' · ');
      return `<div class="drawer-item${already ? ' checked' : ''}" onclick="${already ? '' : "addRecipeFromDb('" + item.id + "')"}">
        <span class="d-toggle">${already ? '✓' : '+'}</span>
        <div class="d-info">
          <div class="d-name">${esc(item.name)}</div>
          ${sub ? `<div class="d-sub">${esc(sub)}</div>` : ''}
        </div>
      </div>`;
    }).join('')}`).join('');

  if (foot) {
    const addedCount = myRecipeCatalogIds.size;
    foot.innerHTML = `
      <div class="drawer-foot-count">${addedCount} recipe${addedCount !== 1 ? 's' : ''} from database</div>
      <div class="drawer-foot-sub">added recipes go to your library</div>`;
  }
}

function addRecipeFromDb(catalogId) {
  const dbItem = _recipeCatalogCache?.find(i => i.id === catalogId);
  if (!dbItem) return;
  if ((state.recipes || []).find(r => r.catalog_recipe_id === catalogId)) return;

  state.recipes.push({
    id:                   uid('rec'),
    name:                 dbItem.name,
    description:          dbItem.description || '',
    meal_time:    Array.isArray(dbItem.meal_time)   ? dbItem.meal_time   : (dbItem.meal_time   ? [dbItem.meal_time]   : ['dinner']),
    prep_method:  Array.isArray(dbItem.prep_method) ? dbItem.prep_method : (dbItem.prep_method ? [dbItem.prep_method] : []),
    cal_per_serving:      0,
    weight_g_per_serving: 0,
    source:               dbItem.source    || '',
    prep_notes:           dbItem.prep_notes || '',
    ingredients:          dbItem.ingredients || [],
    catalog_recipe_id:    catalogId,
  });
  saveState();
  renderRecipeDbInline();
  toast('Recipe added to your library.');
}

