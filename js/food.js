// Gearnomic — Food Planning tab: meal plans, recipe library, and shopping list
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
          <strong>Exploring meal planning</strong> â€” feel free to try it out. You'll need a Supporter account to save your plans.
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

// â”€â”€ Food plan grid â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      <div class="trip-card-meta">${trip ? esc(trip.name) + ' Â· ' : ''}${plan.days} days Â· ${neededMealsSummary(plan)}</div>
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
  return `${d} Breakfast${d !== 1 ? 's' : ''} Â· ${d} Lunch${d !== 1 ? 'es' : ''} Â· ${d} Snack${d !== 1 ? 's' : ''} Â· ${n} Dinner${n !== 1 ? 's' : ''}`;
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
        <span><strong>${plan.days}</strong> breakfasts</span>
        <span><strong>${plan.days}</strong> snack sets</span>
        <span><strong>${plan.days}</strong> lunches</span>
        <span><strong>${nights}</strong> dinners</span>
      </div>
      <div style="margin-top:.5rem;color:var(--text-3)">Target: ${plan.cal_target_per_day.toLocaleString()} cal/day Â· ${plan.weight_target_g_per_day}g (~${(plan.weight_target_g_per_day/453.6).toFixed(1)}lb) food/day</div>
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
      <div class="metric-card"><div class="metric-label">Weight / day</div><div class="metric-val">${wg(avgWPD)}</div><div class="metric-sub">${(avgWPD/453.6).toFixed(1)} lb Â· target ${(plan.weight_target_g_per_day/453.6).toFixed(1)} lb</div></div>
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
        // Slot is disabled â€” show a minimal "skipped" tile with re-enable option
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
            ${dayCal ? `${dayCal.toLocaleString()} cal Â· ${wg(dayW)}` : 'No meals logged yet'}
          </span>
        </div>
        <div class="meal-day-grid">${slots}</div>
      </div>`;
  }).join('');

  document.getElementById('food-plan-detail').innerHTML = `
    <div class="card-header" style="margin-bottom:.75rem">
      <div>
        <span class="card-title" style="font-size:17px;font-family:var(--font-disp)">${esc(plan.name)}</span>
        ${trip ? `&nbsp;<span style="font-size:12px;color:var(--text-3)">Â· ${esc(trip.name)}</span>` : ''}
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
    ${dayHtml}`;
}

// â”€â”€ Food plan CRUD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
          <option value="">â€” No trip â€”</option>${tripOptions}
        </select></div>
      <div class="form-row"><label class="form-label">Days out</label>
        <input class="input input-full" id="fp-days" type="number" min="1" max="30" value="${plan.days||3}">
        <div class="form-hint">Dinners = days âˆ’ 1 (no dinner on last day)</div></div>
      <div class="form-row"><label class="form-label">Calorie target / day</label>
        <select class="select input-full" id="fp-cal" onchange="onFpCalChange()">
          <option value="2500" ${plan.cal_target_per_day===2500?'selected':''}>2,500 â€” Easy/moderate day hikes</option>
          <option value="3000" ${(!plan.cal_target_per_day||plan.cal_target_per_day===3000)?'selected':''}>3,000 â€” Standard backpacking (default)</option>
          <option value="3500" ${plan.cal_target_per_day===3500?'selected':''}>3,500 â€” Big miles / elevation gain</option>
          <option value="4000" ${plan.cal_target_per_day===4000?'selected':''}>4,000 â€” Ultra-long days / cold weather</option>
          <option value="custom" ${![2500,3000,3500,4000].includes(plan.cal_target_per_day)&&plan.cal_target_per_day?'selected':''}>Customâ€¦</option>
        </select>
        <div id="fp-cal-custom-row" style="display:${![2500,3000,3500,4000].includes(plan.cal_target_per_day)&&plan.cal_target_per_day?'flex':'none'};gap:8px;align-items:center;margin-top:6px">
          <input class="input" id="fp-cal-custom" type="number" min="1000" max="8000" step="50"
            value="${![2500,3000,3500,4000].includes(plan.cal_target_per_day)&&plan.cal_target_per_day?plan.cal_target_per_day:''}"
            placeholder="e.g. 2800" style="width:120px" oninput="updateSplitPreview()">
          <span style="font-size:12px;color:var(--text-3)">calories / day</span>
        </div></div>
      <div class="form-row"><label class="form-label">Food weight target / day</label>
        <select class="select input-full" id="fp-wt" onchange="onFpWtChange()">
          <option value="680"  ${plan.weight_target_g_per_day===680?'selected':''}>680g (1.5 lb) â€” Ultralight</option>
          <option value="800"  ${(!plan.weight_target_g_per_day||plan.weight_target_g_per_day===800)?'selected':''}>800g (1.75 lb) â€” Standard UL (default)</option>
          <option value="907"  ${plan.weight_target_g_per_day===907?'selected':''}>907g (2.0 lb) â€” Traditional planning</option>
          <option value="1100" ${plan.weight_target_g_per_day===1100?'selected':''}>1,100g (2.4 lb) â€” Cold/hard trips</option>
          <option value="custom" ${![680,800,907,1100].includes(plan.weight_target_g_per_day)&&plan.weight_target_g_per_day?'selected':''}>Customâ€¦</option>
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

// â”€â”€ Meal items â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function openAddMeal(planId, day, mealTime) {
  const plan = state.food_plans.find(p => p.id === planId);
  if (!plan) return;
  const guideCal = mealCalTarget(plan, mealTime);
  const recs = state.recipes.filter(r => !r.meal_time || r.meal_time === mealTime || r.meal_time === 'snack');

  if (!_isSupporter) {
    // Free users: recipe-only picker â€” no manual entry
    if (!recs.length) {
      toast('No recipes available for this meal slot.');
      return;
    }
    openModal(`Add ${MEAL_LABELS[mealTime]} â€” Day ${day}`, `
      <p style="font-size:13px;color:var(--text-2);margin-bottom:.75rem">Choose from the starter recipes:</p>
      <div class="form-row">
        <select class="select input-full" id="mi-recipe" onchange="fillFromRecipe()">
          <option value="">â€” select a recipe â€”</option>
          ${recs.map(r => `<option value="${r.id}" data-cal="${r.cal_per_serving}" data-w="${r.weight_g_per_serving}">${esc(r.name)} (${r.cal_per_serving} cal Â· ${r.weight_g_per_serving}g)</option>`).join('')}
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
          <option value="">â€” type manually â€”</option>
          ${recs.map(r => `<option value="${r.id}" data-cal="${r.cal_per_serving}" data-w="${r.weight_g_per_serving}">${esc(r.name)} (${r.cal_per_serving} cal Â· ${r.weight_g_per_serving}g)</option>`).join('')}
        </select></div>` : '';

  openModal(`Add ${MEAL_LABELS[mealTime]} â€” Day ${day}`, `
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
      <input class="input input-full" id="mi-notes" placeholder="brand, prep notesâ€¦"></div>
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
      if (ing.name?.trim()) allIngredients.push({ name: ing.name.trim(), qty: (ing.qty || '').trim() });
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
  const groups = {}; // key: lowercaseName â†’ { displayName, qtys: { suffixKey â†’ { num, suffix } | { raw, count } } }

  allIngredients.forEach(({ name, qty }) => {
    const key = name.toLowerCase();
    if (!groups[key]) groups[key] = { displayName: name, qtys: {} };

    if (!qty) {
      const rk = '__raw__';
      groups[key].qtys[rk] = groups[key].qtys[rk] || { raw: '', count: 0 };
      groups[key].qtys[rk].count++;
      return;
    }

    const m = qty.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
    if (m) {
      const num    = parseFloat(m[1]);
      const suffix = m[2].trim();
      const sk     = '__num__' + suffix.toLowerCase();
      if (!groups[key].qtys[sk]) groups[key].qtys[sk] = { num: 0, suffix, isNum: true };
      groups[key].qtys[sk].num += num;
    } else {
      const rk = '__raw__' + qty.toLowerCase();
      if (!groups[key].qtys[rk]) groups[key].qtys[rk] = { raw: qty, count: 0 };
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
      if (q.raw === '') return q.count > 1 ? `Ã—${q.count}` : '';
      return q.count > 1 ? `${q.raw} Ã—${q.count}` : q.raw;
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
      <div style="font-size:12px;color:var(--text-3);margin-top:6px">${recipeCount} recipe${recipeCount !== 1 ? 's' : ''} Â· ${plan.days} day${plan.days !== 1 ? 's' : ''}</div>
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
    // Re-enabling â€” just remove the explicit override so it falls back to default (enabled)
    delete plan.day_config[day][mealTime];
    if (Object.keys(plan.day_config[day]).length === 0) delete plan.day_config[day];
  } else {
    // Disabling â€” also remove any logged meals for this slot
    plan.meals = (plan.meals || []).filter(m => !(m.day === day && m.meal_time === mealTime));
    plan.day_config[day][mealTime] = false;
  }

  saveState();
  renderFoodPlanDetail(plan);
}

// â”€â”€ Recipe library â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
              ${MEAL_LABELS[r.meal_time]||r.meal_time}
              ${r.source ? ` Â· ${esc(r.source)}` : ''}
            </div>
          </div>
          <div style="display:flex;gap:5px">
            <button class="btn btn-xs" onclick="openRecipeForm('${r.id}')">Edit</button>
            <button class="btn btn-xs btn-danger" onclick="deleteRecipe('${r.id}')">Remove</button>
          </div>
        </div>
        <div style="display:flex;gap:16px;font-size:12.5px;margin-bottom:.625rem">
          <span><strong>${r.cal_per_serving}</strong> cal</span>
          <span><strong>${wg(r.weight_g_per_serving)}</strong></span>
          <span style="color:var(--text-3)">${(r.cal_per_serving/(r.weight_g_per_serving||1)).toFixed(1)} cal/g</span>
        </div>
        ${r.ingredients?.length ? `
          <div style="font-size:11.5px;color:var(--text-2);margin-bottom:.5rem">
            ${r.ingredients.map(i => `<div style="padding:1px 0">${i.qty ? `<span style="color:var(--text-3)">${esc(i.qty)}</span> ` : ''}${esc(i.name)}</div>`).join('')}
          </div>` : ''}
        ${r.prep_notes ? `<div style="font-size:11.5px;color:var(--text-3);font-style:italic;margin-top:.25rem">${esc(r.prep_notes)}</div>` : ''}
      </div>`).join('') + '</div>';
}

function openRecipeForm(id) {
  const r = id ? state.recipes.find(r => r.id === id) : null;
  openModal(r ? 'Edit recipe' : 'New recipe', recipeFormHtml(r));
}

function recipeFormHtml(r) {
  r = r || {};
  const ings = (r.ingredients && r.ingredients.length) ? r.ingredients : [{ qty: '', name: '' }];
  const ingRowHtml = i => `
    <div class="rf-ing-row" style="display:flex;gap:6px;margin-bottom:5px">
      <input class="input rf-ing-qty" style="width:90px;flex-shrink:0" placeholder="qty" value="${esc(i.qty||'')}">
      <input class="input rf-ing-name" style="flex:1;min-width:0" placeholder="ingredient" value="${esc(i.name||'')}">
      <button type="button" class="btn btn-xs btn-ghost" style="flex-shrink:0;padding:4px 8px" onclick="this.closest('.rf-ing-row').remove()">Ã—</button>
    </div>`;
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
    <div class="form-row">
      <label class="form-label">Ingredients</label>
      <div id="rf-ingredients-list">${ings.map(ingRowHtml).join('')}</div>
      <button type="button" class="btn btn-xs" style="margin-top:4px" onclick="rfAddIngredient()">+ Add ingredient</button>
    </div>
    <div class="form-row"><label class="form-label">Prep notes</label>
      <textarea class="input input-full" id="rf-prep" rows="3" placeholder="Preparation method, cook time, water temperature, tips...">${esc(r.prep_notes||'')}</textarea></div>
    <div class="form-actions">
      <button class="btn btn-primary" onclick="saveRecipe('${r.id||''}')">Save recipe</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`;
}

function rfAddIngredient() {
  const list = document.getElementById('rf-ingredients-list');
  if (!list) return;
  const row = document.createElement('div');
  row.className = 'rf-ing-row';
  row.style.cssText = 'display:flex;gap:6px;margin-bottom:5px';
  row.innerHTML = `
    <input class="input rf-ing-qty" style="width:90px;flex-shrink:0" placeholder="qty" value="">
    <input class="input rf-ing-name" style="flex:1;min-width:0" placeholder="ingredient" value="">
    <button type="button" class="btn btn-xs btn-ghost" style="flex-shrink:0;padding:4px 8px" onclick="this.closest('.rf-ing-row').remove()">Ã—</button>`;
  list.appendChild(row);
  row.querySelector('.rf-ing-qty').focus();
}

function saveRecipe(id) {
  const name = document.getElementById('rf-name').value.trim();
  if (!name) { alert('Recipe name required.'); return; }
  const ingredients = Array.from(document.querySelectorAll('#rf-ingredients-list .rf-ing-row')).map(row => ({
    qty:  row.querySelector('.rf-ing-qty').value.trim(),
    name: row.querySelector('.rf-ing-name').value.trim(),
  })).filter(i => i.name);
  const data = {
    id:   id || uid('rec'),
    name,
    meal_time:            document.getElementById('rf-meal').value,
    cal_per_serving:      parseInt(document.getElementById('rf-cal').value) || 0,
    weight_g_per_serving: parseInt(document.getElementById('rf-wg').value) || 0,
    source:               document.getElementById('rf-src').value.trim(),
    prep_notes:           document.getElementById('rf-prep').value.trim(),
    ingredients,
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

