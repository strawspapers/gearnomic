// Gearnomic � Trips and Loadouts tabs: trip list/detail/CRUD, loadout library, and apply-to-trip workflow
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
    : `<div class="empty-state">
        <p style="max-width:380px;margin:0 auto .875rem">No trips yet. Create your first trip to start planning loadouts, tracking base weight, and logging how your kit performs.</p>
        <button class="btn btn-primary" onclick="document.getElementById('btn-add-trip').click()">+ Plan a trip</button>
      </div>`;

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

  return `<div style="display:flex;align-items:center;gap:12px;padding:.625rem .875rem;background:var(--surface);border:1px solid ${isActive ? 'var(--primary)' : 'var(--border)'};border-radius:var(--r-lg);transition:border-color .12s"
    onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='${isActive ? 'var(--primary)' : 'var(--border)'}'">
    <div style="flex:1;min-width:0;cursor:pointer" onclick="openTripDetail('${t.id}')">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">
        <span style="font-weight:500;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.name)}</span>
        ${badge(STATUS_BADGE[t.status] || 'badge-gray', STATUS_LABEL[t.status] || t.status)}
      </div>
      <div style="font-size:11.5px;color:var(--text-3)">
        ${t.location ? esc(t.location) + ' · ' : ''}${t.start_date || 'No date'}${nights != null ? ` · ${nights}n` : ''}
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
      <div style="text-align:right">
        <div class="mono" style="font-size:12px;font-weight:500">${wg(tw)}</div>
        <div style="font-size:11px;color:var(--text-3)">${loadoutCount} loadout${loadoutCount !== 1 ? 's' : ''}</div>
      </div>
      <button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();copyGearMarkdown('${t.id}','trip')" title="Copy as markdown">Copy as markdown</button>
      <button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();shareItem('${t.id}','trip')" title="Share trip">Share ↗</button>
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

// Returns map of itemId → [tripName, …] for 'replace' flags on completed trips
function getReplaceFlagTrips() {
  const map = {};
  state.trips.filter(t => t.status === 'completed').forEach(trip => {
    Object.entries(trip.item_feedback || {}).forEach(([itemId, fb]) => {
      if (fb.flag === 'replace') {
        if (!map[itemId]) map[itemId] = [];
        map[itemId].push(trip.name);
      }
    });
  });
  return map;
}

function renderTripDetail(trip) {
  const wrap = document.getElementById('trip-detail-wrap');
  wrap.style.display = 'block';

  const tw     = tripWeight(trip);
  const items  = tripUniqueItems(trip);
  const wornW  = items.reduce((s, i) => {
    const qty = tripItemQty(trip, i.id);
    return s + (tripCarryType(trip, i.id) === 'worn' ? (i.weight_g||0) * qty : 0);
  }, 0);
  const consW  = items.reduce((s, i) => {
    const qty = tripItemQty(trip, i.id);
    return s + (tripCarryType(trip, i.id) === 'consumable' ? (i.weight_g||0) * qty : 0);
  }, 0);
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
        <button class="btn btn-xs btn-danger" onclick="detachLoadout('${trip.id}','${lid}')" title="Detach loadout">Remove</button>
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
          <button class="btn btn-xs btn-danger" onclick="detachMealPlan('${trip.id}')">Remove</button>
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
        <button class="btn btn-sm" onclick="copyGearMarkdown('${trip.id}','trip')" title="Copy as markdown for Reddit">Copy as markdown</button>
        <button class="btn btn-sm" onclick="shareItem('${trip.id}','trip')">Share ↗</button>
        <button class="btn btn-sm btn-danger" onclick="deleteTrip('${trip.id}')">Delete</button>
        <button class="btn btn-sm btn-ghost" onclick="closeTripDetail()">Close</button>
      </div>
    </div>

    <!-- INFO ROW -->
    <div class="info-grid" style="margin-bottom:.875rem">
      ${trip.location   ? `<div class="info-pair"><div class="info-key">Location</div><div class="info-val">${esc(trip.location)}</div></div>` : ''}
      ${trip.start_date ? `<div class="info-pair"><div class="info-key">Dates</div><div class="info-val">${trip.start_date}${trip.end_date?' → '+trip.end_date:''}</div></div>` : ''}
      ${nights != null  ? `<div class="info-pair"><div class="info-key">Nights</div><div class="info-val">${nights}</div></div>` : ''}
      ${trip.miles      ? `<div class="info-pair"><div class="info-key">Distance</div><div class="info-val">${trip.miles} mi${nights?` · ${(trip.miles/nights).toFixed(1)} mi/day`:''}</div></div>` : ''}
      ${trip.route_url  ? `<div class="info-pair"><div class="info-key">Route</div><div class="info-val"><a href="${safeHref(trip.route_url)}" target="_blank" rel="noopener noreferrer" style="color:var(--primary);text-decoration:none">View route ↗</a></div></div>` : ''}
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

    <!-- FULL GEAR LIST (collapsed, open by default for completed trips) -->
    <details style="margin-top:.25rem" ${trip.status === 'completed' ? 'open' : ''}>
      <summary style="font-size:13px;font-weight:500;cursor:pointer;padding:6px 0;user-select:none">
        Full gear list (${allGearIds.length} items across all loadouts)${trip.status === 'completed' ? ' — rate each item below' : ''}
      </summary>
      <div class="table-wrap" style="margin-top:.5rem">
        <table class="data-table">
          <thead><tr>
            <th style="width:28px;padding:6px 4px"></th>
            <th>Item</th><th>Weight</th><th>Carry</th><th>Qty</th><th>Cost</th>
          </tr></thead>
          <tbody id="trip-detail-gear-tbody">
            ${allGearIds.length
              ? catGroupedGearTableFromIds(allGearIds, trip)
              : '<tr><td colspan="6"><div class="empty-state">No gear in attached loadouts.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </details>

    <!-- TRIP NOTES SECTION -->
    <div style="margin-top:1.5rem">
      <label style="display:block;font-family:var(--font-disp);font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:.5rem">Trip notes</label>
      <textarea id="trip-notes-${trip.id}"
        class="trip-notes-textarea"
        placeholder="How did it go? What worked, what didn't..."
        style="width:100%;font-family:var(--font-text);font-size:13px;padding:.75rem;border:.5px solid var(--border);border-radius:var(--r-md);background:var(--surface);color:var(--text-1);resize:vertical;min-height:120px;line-height:1.5"
        onkeyup="debounceAutoSaveTripNotes('${trip.id}')">${esc(trip.notes || '')}</textarea>
    </div>`;
}

// Debounced auto-save for trip notes
let _tripNotesTimeouts = {};
function debounceAutoSaveTripNotes(tripId) {
  if (_tripNotesTimeouts[tripId]) clearTimeout(_tripNotesTimeouts[tripId]);
  _tripNotesTimeouts[tripId] = setTimeout(() => {
    saveTripNotes(tripId);
  }, 1500);
}

function saveTripNotes(tripId) {
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip) return;
  const textarea = document.getElementById(`trip-notes-${tripId}`);
  if (!textarea) return;
  const notes = textarea.value.trim();
  if (notes === (trip.notes || '')) return; // No change
  trip.notes = notes || null;
  saveState();
  delete _tripNotesTimeouts[tripId];
}

// ── Item feedback (completed trips) ───────────────────────
function setItemFeedback(tripId, itemId, flag) {
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip) return;
  if (!trip.item_feedback) trip.item_feedback = {};
  const existing = trip.item_feedback[itemId] || {};
  const newFlag = existing.flag === flag ? null : flag;
  if (newFlag) {
    trip.item_feedback[itemId] = { flag: newFlag, note: existing.note || '' };
  } else {
    delete trip.item_feedback[itemId];
    delete _feedbackNoteTimers[`${tripId}__${itemId}`];
  }
  saveState();

  // Update button states in-place (no full re-render)
  const container = document.getElementById(`feedback-${tripId}-${itemId}`);
  if (container) {
    container.querySelectorAll('[data-flag]').forEach(btn => {
      const f = btn.dataset.flag;
      const active = f === newFlag;
      if (f === 'worked') {
        btn.style.background  = active ? 'var(--success-bg)' : '';
        btn.style.borderColor = active ? 'var(--success)' : '';
        btn.style.color       = active ? 'var(--success-text)' : '';
      } else if (f === 'didnt_work') {
        btn.style.background  = active ? 'var(--danger-bg)' : '';
        btn.style.borderColor = active ? 'var(--danger)' : '';
        btn.style.color       = active ? 'var(--danger-text)' : '';
      } else if (f === 'replace') {
        btn.style.background  = active ? 'var(--warning-bg)' : '';
        btn.style.borderColor = active ? 'var(--warning)' : '';
        btn.style.color       = active ? 'var(--warning-text)' : '';
      }
    });
  }
  const noteWrap = document.getElementById(`feedback-note-wrap-${tripId}-${itemId}`);
  if (noteWrap) noteWrap.style.display = newFlag ? 'block' : 'none';
  if (!newFlag) {
    const noteInput = document.getElementById(`feedback-note-${tripId}-${itemId}`);
    if (noteInput) noteInput.value = '';
  }
}

let _feedbackNoteTimers = {};
function debounceItemFeedbackNote(tripId, itemId) {
  const key = `${tripId}__${itemId}`;
  if (_feedbackNoteTimers[key]) clearTimeout(_feedbackNoteTimers[key]);
  _feedbackNoteTimers[key] = setTimeout(() => saveItemFeedbackNote(tripId, itemId), 1500);
}
function saveItemFeedbackNote(tripId, itemId) {
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip || !trip.item_feedback?.[itemId]) return;
  const input = document.getElementById(`feedback-note-${tripId}-${itemId}`);
  if (!input) return;
  trip.item_feedback[itemId].note = input.value;
  saveState();
  delete _feedbackNoteTimers[`${tripId}__${itemId}`];
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
      <td style="width:28px"></td><td colspan="5">${esc(cat)}</td></tr>`;
    const isCompleted = trip.status === 'completed';
    const itemRows = catItems.map(item => {
      const ct  = tripCarryType(trip, item.id);
      const ctLabel = ct === 'worn' ? badge('carry-worn','W worn') : ct === 'consumable' ? badge('carry-consumable','C consumable') : '';
      const qty = tripItemQty(trip, item.id);
      const totalW = (item.weight_g || 0) * qty;
      const fb = isCompleted ? (trip.item_feedback?.[item.id] || null) : null;
      const fbWorked  = fb?.flag === 'worked';
      const fbBad     = fb?.flag === 'didnt_work';
      const fbReplace = fb?.flag === 'replace';
      const feedbackRow = isCompleted ? `<tr class="trip-feedback-row">
        <td style="width:28px;border-top:none"></td>
        <td colspan="5" style="padding:3px 0 8px;border-top:none">
          <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap" id="feedback-${trip.id}-${item.id}">
            <button class="btn btn-xs" data-flag="worked"
              style="font-size:11px;${fbWorked?'background:var(--success-bg);border-color:var(--success);color:var(--success-text)':''}"
              onclick="setItemFeedback('${trip.id}','${item.id}','worked')">Worked well</button>
            <button class="btn btn-xs" data-flag="didnt_work"
              style="font-size:11px;${fbBad?'background:var(--danger-bg);border-color:var(--danger);color:var(--danger-text)':''}"
              onclick="setItemFeedback('${trip.id}','${item.id}','didnt_work')">Didn't work</button>
            <button class="btn btn-xs" data-flag="replace"
              style="font-size:11px;${fbReplace?'background:var(--warning-bg);border-color:var(--warning);color:var(--warning-text)':''}"
              onclick="setItemFeedback('${trip.id}','${item.id}','replace')">Would replace</button>
          </div>
          <div id="feedback-note-wrap-${trip.id}-${item.id}" style="margin-top:5px;display:${fb?.flag ? 'block' : 'none'}">
            <input type="text" class="input" id="feedback-note-${trip.id}-${item.id}"
              value="${esc(fb?.note || '')}"
              placeholder="Short note (optional)"
              style="font-size:12px;height:28px;max-width:380px;width:100%"
              oninput="debounceItemFeedbackNote('${trip.id}','${item.id}')"
              onclick="event.stopPropagation()">
          </div>
        </td>
      </tr>` : '';
      return `<tr>
        <td style="width:28px"></td>
        <td><div class="item-name">${esc(item.name)}</div><div class="item-sub">${esc(item.brand||'')}</div></td>
        <td class="mono" style="font-size:12px">
          ${qty > 1 ? `${wg(totalW)} <span style="color:var(--text-3);font-size:11px">(${qty}×${wg(item.weight_g)})</span>` : wg(item.weight_g)}
        </td>
        <td>${ctLabel}</td>
        <td>
          <div style="display:flex;align-items:center;gap:4px">
            <button class="btn btn-xs btn-ghost" style="padding:2px 6px;min-width:22px"
              onclick="setTripItemQty('${trip.id}','${item.id}',${qty-1})">−</button>
            <span style="font-size:12px;min-width:16px;text-align:center">${qty}</span>
            <button class="btn btn-xs btn-ghost" style="padding:2px 6px;min-width:22px"
              onclick="setTripItemQty('${trip.id}','${item.id}',${qty+1})">+</button>
          </div>
        </td>
        <td style="font-size:12px">${usd(item.cost_usd)}</td>
      </tr>${feedbackRow}`;
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
    <div class="form-row"><label class="form-label">Route URL <span style="font-weight:400;color:var(--text-3)">(CalTopo, AllTrails, onX, etc.)</span></label><input class="input input-full" id="tf-route-url" type="url" value="${esc(trip.route_url || '')}" placeholder="https://caltopo.com/m/..."></div>
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
    if (!checkLimit('trips')) return;
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
    route_url:        document.getElementById('tf-route-url').value.trim() || null,
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
      <p style="max-width:380px;margin:0 auto .875rem">No loadouts yet. A loadout is a reusable collection of gear you can attach to any trip.</p>
      <button class="btn btn-primary" onclick="openTemplateForm()">+ New loadout</button>
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
      <button class="btn btn-sm" onclick="copyGearMarkdown('${tmpl.id}','template')" title="Copy as markdown for Reddit">Copy as markdown</button>
      <button class="btn btn-sm" onclick="shareItem('${tmpl.id}','template')" title="Share via link">Share ↗</button>
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
  const validIds = (tmpl.gear_ids||[]).filter(id => state.items.find(i => i.id === id));
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
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-sm btn-primary" onclick="openApplyTemplateFromLib('${tmpl.id}')">Attach to trip…</button>
        <button class="btn btn-sm" onclick="copyGearMarkdown('${tmpl.id}','template')" title="Copy as markdown for Reddit">Copy as markdown</button>
        <button class="btn btn-sm" onclick="shareItem('${tmpl.id}','template')" title="Share via link">Share ↗</button>
        <button class="btn btn-sm" onclick="openTemplateForm('${tmpl.id}')">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteTemplate('${tmpl.id}')">Delete</button>
        <button class="btn btn-sm btn-ghost" onclick="closeTemplateDetail()">Close</button>
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
  if (!id && !checkLimit('templates')) return;
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
    trip_type:    id ? (state.templates.find(t => t.id === id)?.trip_type || null) : null,
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
          <span style="font-size:11px;color:var(--text-3)">${already ? 'Attached' : badge(STATUS_BADGE[t.status]||'badge-gray', STATUS_LABEL[t.status]||t.status)}</span>
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

