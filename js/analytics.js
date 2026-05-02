// Gearnomic — Analytics tab: adventure stats, gear performance, and weight/cost charts
// ============================================================
// ANALYTICS
// ============================================================
// â”€â”€ Adventure stats year state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let _adventureYear = 'all'; // 'all' | 'year' | number (e.g. 2024)

function setAdventureYear(mode, year) {
  if (mode === 'all')  _adventureYear = 'all';
  else if (mode === 'year') _adventureYear = new Date().getFullYear();
  else if (mode === 'pick') _adventureYear = parseInt(year);

  // Update button states
  const btnAll  = document.getElementById('adv-btn-alltime');
  const btnYear = document.getElementById('adv-btn-year');
  const picker  = document.getElementById('adv-year-picker');
  const curYear = new Date().getFullYear();

  if (btnAll)  btnAll.className  = `btn btn-xs ${_adventureYear === 'all' ? 'btn-primary' : 'btn-ghost'}`;
  if (btnYear) btnYear.className = `btn btn-xs ${_adventureYear === curYear ? 'btn-primary' : 'btn-ghost'}`;
  if (picker) {
    const isPickedYear = typeof _adventureYear === 'number' && _adventureYear !== curYear;
    picker.style.display = isPickedYear ? '' : 'none';
    if (isPickedYear) picker.value = _adventureYear;
  }

  // Re-render with new filter
  const completedTrips = state.trips.filter(t => t.status === 'completed');
  renderAdventureStats(completedTrips);
}

function renderAdventureStats(completedTrips) {
  const el   = document.getElementById('analytics-adventure');
  const card = document.getElementById('analytics-adventure-card');
  if (!el) return;

  const curYear = new Date().getFullYear();

  // Build year picker options from years that have completed trips
  const yearsWithTrips = [...new Set(
    completedTrips
      .filter(t => t.start_date)
      .map(t => parseInt(t.start_date.slice(0, 4)))
      .filter(y => !isNaN(y))
  )].sort((a, b) => b - a);

  const picker = document.getElementById('adv-year-picker');
  if (picker && yearsWithTrips.length > 1) {
    picker.innerHTML = yearsWithTrips.map(y =>
      `<option value="${y}" ${y === _adventureYear ? 'selected' : ''}>${y}</option>`
    ).join('');
  }

  // Filter trips to selected period
  let trips = completedTrips;
  let periodLabel = 'all time';
  if (_adventureYear !== 'all') {
    trips = completedTrips.filter(t => {
      const y = t.start_date ? parseInt(t.start_date.slice(0, 4)) : null;
      return y === _adventureYear;
    });
    periodLabel = _adventureYear === curYear ? 'this year' : String(_adventureYear);
  }

  // Show year picker button only if there are multiple years of data
  const btnYear = document.getElementById('adv-btn-year');
  const pickerBtn = document.getElementById('adv-year-picker');
  if (yearsWithTrips.length > 1 && btnYear) {
    // Show "pick year" option â€” make the year button open the picker
    btnYear.title = 'Filter by year';
    if (yearsWithTrips.length > 2 && pickerBtn) {
      // More than 2 years â€” show dropdown when not on "all time"
      if (_adventureYear !== 'all' && _adventureYear !== curYear) {
        pickerBtn.style.display = '';
      }
    }
  }

  // Bike trip types
  const BIKE_TYPES = new Set(
    state.trip_types
      .filter(t => t.value === 'bikepacking' || /bike|cycl/i.test(t.value + t.label))
      .map(t => t.value)
  );

  const totalTrips = trips.length;

  const tripNights = t => {
    if (t.start_date && t.end_date)
      return Math.max(0, Math.round((new Date(t.end_date) - new Date(t.start_date)) / 86400000));
    return t.nights || 0;
  };

  const totalNights = trips.reduce((s, t) => s + tripNights(t), 0);

  const hikingTrips    = trips.filter(t => !BIKE_TYPES.has(t.trip_type) && t.miles > 0);
  const totalHikedMiles = hikingTrips.reduce((s, t) => s + (parseFloat(t.miles) || 0), 0);

  const bikeTrips      = trips.filter(t => BIKE_TYPES.has(t.trip_type) && t.miles > 0);
  const totalBikedMiles = bikeTrips.reduce((s, t) => s + (parseFloat(t.miles) || 0), 0);

  const furthest = trips.filter(t => t.miles > 0).sort((a, b) => b.miles - a.miles)[0];

  const longestTrip = trips
    .map(t => ({ trip: t, nights: tripNights(t) }))
    .sort((a, b) => b.nights - a.nights)[0];

  if (!completedTrips.length) {
    el.innerHTML = `<div class="empty-state" style="padding:1rem"><p>No completed trips yet. Mark a trip as completed to see your adventure stats.</p></div>`;
    return;
  }

  if (!totalTrips && _adventureYear !== 'all') {
    el.innerHTML = `<div style="font-size:13px;color:var(--text-3);text-align:center;padding:1.25rem">No completed trips in ${periodLabel}.</div>`;
    return;
  }

  const fmt = n => n % 1 === 0 ? n : n.toFixed(1);

  const statItem = (label, value, sub) => `
    <div style="text-align:center;padding:1rem .75rem;min-width:90px">
      <div style="font-size:28px;font-weight:600;font-family:var(--font-disp);color:var(--primary);line-height:1.1">${value}</div>
      <div style="font-size:12px;font-weight:500;color:var(--text-1);margin-top:4px">${label}</div>
      ${sub ? `<div style="font-size:11px;color:var(--text-3);margin-top:2px">${sub}</div>` : ''}
    </div>`;

  const divider = `<div style="width:1px;background:var(--border-2);margin:.5rem 0"></div>`;

  // Compare to previous period if viewing a specific year
  let comparisonNote = '';
  if (typeof _adventureYear === 'number') {
    const prevTrips = completedTrips.filter(t => {
      const y = t.start_date ? parseInt(t.start_date.slice(0, 4)) : null;
      return y === _adventureYear - 1;
    });
    const prevNights = prevTrips.reduce((s, t) => s + tripNights(t), 0);
    const prevMiles  = prevTrips.reduce((s, t) => s + (parseFloat(t.miles) || 0), 0);
    const curMiles   = totalHikedMiles + totalBikedMiles;
    const allMiles   = prevMiles;
    if (prevTrips.length) {
      const nightsDiff = totalNights - prevNights;
      const milesDiff  = curMiles - allMiles;
      const parts = [];
      if (nightsDiff !== 0) parts.push(`${nightsDiff > 0 ? '+' : ''}${nightsDiff} nights vs ${_adventureYear - 1}`);
      if (milesDiff  !== 0 && (totalHikedMiles || totalBikedMiles)) parts.push(`${milesDiff > 0 ? '+' : ''}${fmt(milesDiff)} miles vs ${_adventureYear - 1}`);
      if (parts.length) comparisonNote = parts.join(' Â· ');
    }
  }

  const stats = [
    statItem('Trips', totalTrips, periodLabel),
    totalNights ? statItem('Nights camped', totalNights,
      longestTrip?.nights ? `Longest: ${longestTrip.nights}n` : null) : null,
    totalHikedMiles ? statItem('Miles hiked', fmt(totalHikedMiles),
      `${hikingTrips.length} trip${hikingTrips.length !== 1 ? 's' : ''}`) : null,
    totalBikedMiles ? statItem('Miles biked', fmt(totalBikedMiles),
      `${bikeTrips.length} trip${bikeTrips.length !== 1 ? 's' : ''}`) : null,
    furthest ? statItem('Longest trip', `${fmt(furthest.miles)} mi`, esc(furthest.name)) : null,
  ].filter(Boolean);

  el.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;justify-content:space-around;gap:.25rem;padding:.25rem 0">
      ${stats.join(divider)}
    </div>
    ${comparisonNote ? `<div style="font-size:11.5px;color:var(--text-3);text-align:center;padding:.5rem 0;border-top:.5px solid var(--border-2);margin-top:.25rem">${comparisonNote}</div>` : ''}
    ${!comparisonNote && totalTrips < 3 && _adventureYear === 'all' ? `<div style="font-size:12px;color:var(--text-3);text-align:center;padding:.625rem 0;border-top:.5px solid var(--border-2);margin-top:.25rem">
      Stats grow as you log more completed trips. <a onclick="showTab('trips')" style="cursor:pointer">Add a trip</a>
    </div>` : ''}`;
}

let chartWeight = null, chartCost = null, chartTrips = null;

function renderAnalytics() {
  // Zero-items empty state
  if (!state.items.length) {
    document.getElementById('analytics-metrics').innerHTML =
      `<div class="empty-state" style="grid-column:1/-1;padding:3rem 1rem">
        <p style="max-width:360px;margin:0 auto">Add gear to your closet to start seeing weight and cost breakdowns.</p>
      </div>`;
    return;
  }

  // â”€â”€ Aggregate data (always needed) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Adventure stats (all users) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  renderAdventureStats(completedTrips);

  // â”€â”€ Free tier: real metrics where possible, blurred for Supporter-only â”€
  if (!_isSupporter) {
    // Reusable blur overlay wrapper â€” title stays outside, only content is blurred
    const blurWrap = (content) => `
      <div style="position:relative;border-radius:var(--r-md);overflow:hidden">
        <div style="filter:blur(5px);pointer-events:none;user-select:none">${content}</div>
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(237,232,223,.55);backdrop-filter:blur(2px)">
          <div style="font-size:12px;font-weight:500;margin-bottom:.5rem;color:var(--text-1)">Supporter feature</div>
          <button class="btn btn-primary btn-sm" onclick="openUpgradeModal()">Upgrade to unlock</button>
        </div>
      </div>`;

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
        <div class="metric-label">Avg cost efficiency</div>
        <div style="filter:blur(5px);pointer-events:none;user-select:none">
          <div class="metric-val">$1.84</div>
          <div class="metric-sub">per gram Â· 24 items</div>
        </div>
        <div style="position:absolute;bottom:0;left:0;right:0;top:36px;display:flex;align-items:center;justify-content:center">
          <button class="btn btn-xs btn-primary" onclick="openUpgradeModal()">Upgrade</button>
        </div>
      </div>
      <div class="metric-card" style="position:relative;overflow:hidden">
        <div class="metric-label">Gear never used</div>
        <div style="filter:blur(5px);pointer-events:none;user-select:none">
          <div class="metric-val">8</div>
          <div class="metric-sub">32% of closet untested</div>
        </div>
        <div style="position:absolute;bottom:0;left:0;right:0;top:36px;display:flex;align-items:center;justify-content:center">
          <button class="btn btn-xs btn-primary" onclick="openUpgradeModal()">Upgrade</button>
        </div>
      </div>`;

    // Weight by category â€” visible for free
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

    // Cost distribution â€” title stays, canvas blurred
    const ctxC = document.getElementById('chart-cost');
    if (ctxC) {
      const parent = ctxC.parentElement;
      // Remove any existing overlay
      parent.querySelectorAll('.analytics-lock-overlay').forEach(d => d.remove());
      parent.style.position = 'relative';
      ctxC.style.filter = 'blur(4px)';
      const overlay = document.createElement('div');
      overlay.className = 'analytics-lock-overlay';
      overlay.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(237,232,223,.5);backdrop-filter:blur(2px);border-radius:var(--r-lg)';
      overlay.innerHTML = `<div style="font-size:12px;font-weight:500;margin-bottom:.5rem;color:var(--text-1)">Supporter feature</div><button class="btn btn-primary btn-sm" onclick="openUpgradeModal()">Upgrade to unlock</button>`;
      parent.appendChild(overlay);
    }

    // Weight targets â€” visible for free
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

    // Trip weight history â€” title visible in HTML, content blurred
    const tripWrap  = document.getElementById('analytics-trips-chart-wrap');
    const tripEmpty = document.getElementById('analytics-trips-empty');
    if (tripWrap) tripWrap.innerHTML = blurWrap(`
      <div style="height:160px;background:linear-gradient(to right,var(--surface-2),var(--surface-3));border-radius:var(--r-md);display:flex;align-items:flex-end;justify-content:space-around;padding:16px 12px">
        ${[60,80,45,95,70,55,85].map(h => `<div style="width:24px;background:var(--primary-l);border-radius:3px 3px 0 0;height:${h}%"></div>`).join('')}
      </div>`);
    if (tripEmpty) tripEmpty.style.display = 'none';

    // Value analysis â€” title visible in HTML, content blurred
    document.getElementById('analytics-value').innerHTML = blurWrap(`
      ${['Titanium Spork','Wind Shirt','Cuben Stuff Sack','Sleeping Pad Liner'].map((n,i) =>
        `<div style="display:flex;justify-content:space-between;font-size:13px;padding:6px 0;border-bottom:1px solid var(--border-2)">
          <span>${n}</span><span style="color:var(--${i<2?'success':'danger'})">${i<2?'$0.00'+ (i===0?'2':'8'):'$1.'+i+'0'}/g</span>
        </div>`).join('')}`);

    // Gear never used â€” title visible in HTML, content blurred
    document.getElementById('analytics-unused').innerHTML = blurWrap(`
      ${['Rain Jacket','Bivy Cover','Ice Axe','Crampons','Gaiters'].map(n =>
        `<div style="padding:6px 0;border-bottom:1px solid var(--border-2);font-size:13px;color:var(--text-2)">${n}</div>`
      ).join('')}`);

    // Most used table â€” title visible in HTML, rows blurred
    document.getElementById('analytics-usage').innerHTML = `
      <tr><td colspan="5" style="padding:0">
        ${blurWrap(`
          <table style="width:100%;border-collapse:collapse">
            ${['Trail Runners','Sleeping Bag','Backpack','Rain Jacket','Water Filter'].map(n =>
              `<tr><td style="padding:8px 12px;font-size:13px;color:var(--text-2);border-bottom:1px solid var(--border-2)">${n}</td><td style="padding:8px 12px;font-size:12px;color:var(--text-3)">124 days</td></tr>`
            ).join('')}
          </table>`)}
      </td></tr>`;

    // Field performance â€” blurred for free users
    document.getElementById('analytics-field-performance').innerHTML = blurWrap(`
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem">
        <div>
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--success);margin-bottom:.375rem">Consistently praised</div>
          ${['Trail Runners','Sleeping Bag','Rain Jacket'].map(n =>
            `<div style="display:flex;justify-content:space-between;font-size:12px;padding:5px 0;border-bottom:.5px solid var(--border-2)">
              <span style="font-weight:500">${n}</span><span style="color:var(--success)">3Ã—</span>
            </div>`).join('')}
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--warning);margin-bottom:.375rem">Flagged for replacement</div>
          ${['Trekking Poles','Bivy Cover'].map(n =>
            `<div style="display:flex;justify-content:space-between;font-size:12px;padding:5px 0;border-bottom:.5px solid var(--border-2)">
              <span style="font-weight:500">${n}</span><span style="color:var(--warning)">2Ã—</span>
            </div>`).join('')}
        </div>
      </div>`);
    return;
  }

  // â”€â”€ Supporter tier: full analytics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      <div class="metric-val">${avgDpg > 0 ? '$' + avgDpg.toFixed(2) : 'â€”'}</div>
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
    ? `<div class="empty-state"><p>Everything has been used at least once.</p></div>`
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
        <td class="mono">${i.usage_nights || 'â€”'}</td>
        <td>${badge(COND_BADGE[i.condition]||'badge-gray', COND_LABEL[i.condition]||'â€”')}</td>
      </tr>`).join('');

  // Field performance
  const workedCounts = {}, replaceCounts = {};
  completedTrips.forEach(trip => {
    Object.entries(trip.item_feedback || {}).forEach(([itemId, fb]) => {
      if (fb.flag === 'worked')  workedCounts[itemId]  = (workedCounts[itemId]  || 0) + 1;
      if (fb.flag === 'replace') replaceCounts[itemId] = (replaceCounts[itemId] || 0) + 1;
    });
  });
  const topWorked  = Object.entries(workedCounts).sort((a,b)=>b[1]-a[1]).slice(0,6)
    .map(([id,n]) => ({ item: state.items.find(i=>i.id===id), n })).filter(x=>x.item);
  const topReplace = Object.entries(replaceCounts).sort((a,b)=>b[1]-a[1]).slice(0,6)
    .map(([id,n]) => ({ item: state.items.find(i=>i.id===id), n })).filter(x=>x.item);
  const fpRow = (x, color) =>
    `<div style="display:flex;justify-content:space-between;align-items:baseline;font-size:12px;padding:5px 0;border-bottom:.5px solid var(--border-2)">
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500">${esc(x.item.name)}</span>
      <span style="color:var(--text-3);font-size:11px;margin-left:6px;flex-shrink:0">${esc(x.item.category)}</span>
      <span style="color:${color};font-weight:600;margin-left:10px;flex-shrink:0">${x.n}Ã—</span>
    </div>`;
  document.getElementById('analytics-field-performance').innerHTML =
    (!topWorked.length && !topReplace.length)
    ? `<div class="empty-state"><p>No field feedback yet. Open a completed trip and rate each item.</p></div>`
    : `<div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem">
        <div>
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--success);margin-bottom:.375rem">Consistently praised</div>
          ${topWorked.length ? topWorked.map(x => fpRow(x,'var(--success)')).join('') : '<div style="font-size:12px;color:var(--text-3)">None yet</div>'}
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--warning);margin-bottom:.375rem">Flagged for replacement</div>
          ${topReplace.length ? topReplace.map(x => fpRow(x,'var(--warning)')).join('') : '<div style="font-size:12px;color:var(--text-3)">None yet</div>'}
        </div>
      </div>`;
}
