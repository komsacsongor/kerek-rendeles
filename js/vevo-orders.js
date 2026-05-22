// ===== ORDER TABLE =====
function isMobile() { return window.innerWidth <= 640; }

// Per-day category filter state: { day: 'category' | 'all' } (only used in mobile A day view)
let selectedCategoryByDay = {};

// Tracks days manually toggled OPEN by the user (persists across renders) - mobile A
let openDaysManual = new Set();

// View toggle state ('day' = A model, 'product' = C model)
let vevoView = 'day';

// Global category filter (used in C product-pivot view, both desktop and mobile)
let selectedCategoryGlobal = 'all';

// Elapsed section open state for desktop A view
let elapsedOpenDesktop = false;

// Load view preference from localStorage
function loadViewPref() {
  try {
    const v = localStorage.getItem('kerek_view_pref');
    if (v === 'day' || v === 'product') vevoView = v;
  } catch(e) {}
}
function saveViewPref(v) {
  try { localStorage.setItem('kerek_view_pref', v); } catch(e) {}
}

function switchView(v) {
  if (v !== 'day' && v !== 'product') return;
  vevoView = v;
  saveViewPref(v);
  renderOrderTable();
  updateHeroTotal();
}

function getCategories(prods) {
  const cats = [...new Set(prods.map(p => p.category).filter(Boolean))];
  return cats;
}

function mobChangeCategoryDay(day, cat) {
  selectedCategoryByDay[day] = cat;
  if (typeof KEREKAnalytics !== 'undefined') KEREKAnalytics.categoryFilter(day, cat);
  renderMobileOrderCards();
}

function toggleElapsedSection() {
  const body = document.getElementById('mob-elapsed-body');
  const arrow = document.getElementById('mob-elapsed-arrow');
  if (!body) return;
  body.classList.toggle('open');
  if (arrow) arrow.textContent = body.classList.contains('open') ? '▴' : '▾';
}

function renderOrderTable() {
  if(!currentUser) return;
  // Dispatcher based on viewport + vevoView
  const pivotDiv = document.getElementById('product-pivot-view');
  const desktopTblDiv = document.getElementById('order-table-wrap');
  const mobileCardsDiv = document.getElementById('mobile-order-cards');
  const updateToggle = () => {
    const tb = document.getElementById('view-toggle-bar');
    if (tb) {
      const dBtn = document.getElementById('view-btn-day');
      const pBtn = document.getElementById('view-btn-product');
      if (dBtn) dBtn.classList.toggle('active', vevoView === 'day');
      if (pBtn) pBtn.classList.toggle('active', vevoView === 'product');
    }
  };
  updateToggle();

  if (vevoView === 'product') {
    if (pivotDiv) pivotDiv.style.display = 'block';
    if (desktopTblDiv) desktopTblDiv.style.display = 'none';
    if (mobileCardsDiv) mobileCardsDiv.style.display = 'none';
    renderProductPivot();
    return;
  }
  // Day view
  if (pivotDiv) pivotDiv.style.display = 'none';
  if (isMobile()) {
    if (desktopTblDiv) desktopTblDiv.style.display = 'none';
    if (mobileCardsDiv) mobileCardsDiv.style.display = 'block';
    renderMobileOrderCards();
  } else {
    if (desktopTblDiv) desktopTblDiv.style.display = 'block';
    if (mobileCardsDiv) mobileCardsDiv.style.display = 'none';
    renderDesktopDayTable();
  }
}

function renderDesktopDayTable() {
  if(!currentUser) return;
  const prods = getActiveProds(selectedYear, selectedMonth);
  const allDays = getDays(selectedYear, selectedMonth);
  const now = new Date();

  document.getElementById('order-month-label').textContent = MONTHS[selectedMonth] + ' ' + selectedYear;

  // Check if any baking day is within 24h
  const urgentDay = allDays.find(d => isBakingDay(d) && hoursUntil(d) >= 0 && hoursUntil(d) < 24);
  if (urgentDay) checkDeadline(urgentDay.getDate());
  else document.getElementById('deadline-notice').classList.remove('show');

  if (prods.length === 0) {
    document.getElementById('order-table').innerHTML = '<tr><td style="padding:20px;color:var(--text-soft)">Erre a hónapra még nincs aktív terméklista.</td></tr>';
    const elapsedDiv = document.getElementById('desktop-elapsed-section');
    if (elapsedDiv) elapsedDiv.innerHTML = '';
    return;
  }

  // Filter only baking days
  const bakingDays = allDays.filter(d => isBakingDay(d));
  // Split: elapsed (past) vs current/future
  const elapsedDays = bakingDays.filter(d => d < now && !isSameDay(d, now));
  const currentDays = bakingDays.filter(d => !(d < now && !isSameDay(d, now)));

  // Categories
  const cats = getCategories(prods);
  const hasMultiCats = cats.length > 1;
  const filteredProds = selectedCategoryGlobal === 'all' ? prods : prods.filter(p => p.category === selectedCategoryGlobal);

  // ===== ELAPSED SECTION (above table) =====
  const elapsedDiv = document.getElementById('desktop-elapsed-section');
  if (elapsedDiv) {
    if (elapsedDays.length === 0) {
      elapsedDiv.innerHTML = '';
    } else {
      let elapsedRows = '';
      elapsedDays.forEach(d => {
        const day = d.getDate();
        const dayName = DAYS_HU[d.getDay()];
        const key = getOrderKey(currentUser.id, selectedYear, selectedMonth, day);
        const rowOrders = appData.orders[key] || {};
        const rowTotal = Object.values(rowOrders).reduce((a,b)=>a+b,0);
        const rowVal = Object.entries(rowOrders).reduce((acc,[pid,q])=>{
          const p=appData.products.find(p=>p.id==pid); return acc+(p?p.price*q:0);
        },0);
        const orderSt = (appData.orderStatus && appData.orderStatus[key]) || {};
        const stStatus = orderSt.status || '';
        let badge = '<span style="color:#bbb;font-style:italic;font-size:.78rem">— nem rendeltél —</span>';
        if (stStatus === 'fulfilled') badge = '<span style="background:#d1fae5;color:#065f46;padding:3px 8px;border-radius:6px;font-size:.72rem;font-weight:600">🎉 Elkészült</span>';
        else if (stStatus === 'confirmed') badge = '<span style="background:#dcfce7;color:#166534;padding:3px 8px;border-radius:6px;font-size:.72rem;font-weight:600">✅ Jóváhagyva</span>';
        else if (stStatus === 'cancelled') badge = '<span style="background:#fee2e2;color:#b91c1c;padding:3px 8px;border-radius:6px;font-size:.72rem;font-weight:600">❌ Visszavonva</span>';
        else if (stStatus === 'pending' || stStatus === 'modified') badge = '<span style="background:#fef3c7;color:#92400e;padding:3px 8px;border-radius:6px;font-size:.72rem;font-weight:600">⚠️ Feldolgozás alatt</span>';

        elapsedRows += `<div style="display:flex;justify-content:space-between;align-items:center;background:#fff;border:1px solid var(--border);border-radius:8px;padding:8px 14px;margin-bottom:6px;opacity:.88">
          <div>
            <span style="font-weight:600;color:var(--text-soft)">🔥 ${dayName}, ${day}.</span>
            ${rowTotal>0 ? `<span style="margin-left:12px;color:var(--text-soft);font-size:.78rem">${rowTotal} db · ${rowVal} lej</span>` : ''}
          </div>
          ${badge}
        </div>`;
      });
      elapsedDiv.innerHTML = `<div class="desktop-elapsed-head" onclick="toggleElapsedDesktop()">
          <span style="font-weight:600;color:var(--text-soft);font-size:.88rem">🕰 Eltelt sütési napok (${elapsedDays.length})</span>
          <span id="desktop-elapsed-arrow" style="color:var(--text-soft)">${elapsedOpenDesktop?'▴':'▾'}</span>
        </div>
        <div class="desktop-elapsed-body ${elapsedOpenDesktop?'open':''}">${elapsedRows}</div>`;
    }
  }

  // ===== CATEGORY CHIP FILTER (above table) =====
  let chipBar = '';
  if (hasMultiCats) {
    chipBar = '<div class="desktop-cat-chips">' + ['all', ...cats].map(c => {
      const label = c === 'all' ? '🧺 Összes' : c;
      const active = selectedCategoryGlobal === c;
      return `<button class="desktop-cat-chip ${active?'active':''}" onclick="setGlobalCategory('${c.replace(/'/g,"\\'")}')">${label}</button>`;
    }).join('') + '</div>';
  }

  // ===== MAIN TABLE =====
  let html = '<thead><tr><th class="col-date sticky-col">Dátum</th>';
  const catGroups = {};
  filteredProds.forEach(p => {
    const cat = p.category || 'Egyéb';
    if (!catGroups[cat]) catGroups[cat] = [];
    catGroups[cat].push(p);
  });
  const hasCatsInFiltered = Object.keys(catGroups).length > 1;

  if (hasCatsInFiltered) {
    Object.entries(catGroups).forEach(([cat, catProds]) => {
      catProds.forEach((p, idx) => {
        const catLabel = idx === 0 ? `<span style="display:block;font-size:.6rem;color:var(--gold);font-weight:700;letter-spacing:.05em;text-transform:uppercase;margin-bottom:2px">${esc(cat)}</span>` : '';
        html += `<th class="col-product" onclick="showProductModal(${p.id})" title="Kattints a termék adatlapjáért">
          ${catLabel}
          <span class="prod-name">${esc(p.name)}</span>
          <span class="prod-weight">${esc(p.weight)}</span>
          <span class="prod-price">${p.price} lej</span>
        </th>`;
      });
    });
  } else {
    filteredProds.forEach(p => {
      html += `<th class="col-product" onclick="showProductModal(${p.id})" title="Kattints a termék adatlapjáért">
        <span class="prod-name">${esc(p.name)}</span>
        <span class="prod-weight">${esc(p.weight)}</span>
        <span class="prod-price">${p.price} lej</span>
      </th>`;
    });
  }
  html += '<th style="min-width:70px">Összesen</th></tr></thead><tbody>';

  // Rows: csak aktív/jövőbeli sütési napok
  let grandTotal = 0;
  const colTotals = {};
  filteredProds.forEach(p => colTotals[p.id] = 0);
  // Helper: today flag for highlighting
  const isToday = (d) => isSameDay(d, now);

  currentDays.forEach(d => {
    const day = d.getDate();
    const dow = d.getDay();
    const dayName = DAYS_HU[dow];
    const key = getOrderKey(currentUser.id, selectedYear, selectedMonth, day);
    const rowOrders = appData.orders[key] || {};
    const orderSt = (appData.orderStatus && appData.orderStatus[key]) || {};
    const isCancelled = orderSt.status === 'cancelled';
    let rowTotal = 0;
    if (!isCancelled) filteredProds.forEach(p => rowTotal += (rowOrders[p.id]||0));
    grandTotal += rowTotal;

    const hoursLeft = hoursUntil(d);
    const orderStDeadline = orderSt.deadline ? new Date(orderSt.deadline) : null;
    const deadlineHoursLeft = orderStDeadline ? (orderStDeadline - new Date()) / 36e5 : null;
    const isLocked = deadlineHoursLeft !== null ? deadlineHoursLeft <= 0 : (hoursLeft >= 0 && hoursLeft < 24);
    const isOver = d < now;
    const stStatus = orderSt.status || (rowTotal > 0 ? 'pending' : '');
    const stNote = orderSt.admin_note || '';
    const rowBg = stStatus === 'cancelled' ? 'background:#fff1f2' : stStatus === 'fulfilled' ? 'background:#ecfdf5' : stStatus === 'confirmed' ? 'background:#f0fdf4' : '';
    const todayHighlight = isToday(d) ? 'box-shadow:inset 4px 0 0 var(--gold);' : '';
    const colCount = filteredProds.length + 2;

    html += `<tr class="baking-row" id="row-${day}" style="${rowBg}${todayHighlight}">
      <td class="col-date sticky-col">
        ${day}. <b>${dayName}</b>
        <span class="baking-label">🔥 Sütési nap${isLocked?' · ⏰ 24h':''}${isToday(d)?' · MA':''}</span>
        ${stStatus === 'fulfilled' ? '<span style="background:#d1fae5;color:#065f46;border-radius:4px;padding:1px 6px;font-size:0.68rem;font-weight:600;display:inline-block;margin-top:3px">🎉 Elkészült</span>' : stStatus === 'confirmed' ? '<span style="background:#dcfce7;color:#166534;border-radius:4px;padding:1px 6px;font-size:0.68rem;font-weight:600;display:inline-block;margin-top:3px">✅ Jóváhagyva</span>' : ''}
        ${stStatus === 'cancelled' ? '<span style="background:#fee2e2;color:#b91c1c;border-radius:4px;padding:1px 6px;font-size:0.68rem;font-weight:600;display:inline-block;margin-top:3px">❌ Visszavonva</span>' : ''}
      </td>`;
    filteredProds.forEach(p => {
      const val = rowOrders[p.id] || '';
      const disabled = isOver || isLocked || stStatus === 'cancelled' || stStatus === 'fulfilled' ? 'disabled' : '';
      if (!isCancelled) colTotals[p.id] += (rowOrders[p.id]||0);
      html += `<td style="${stStatus==='modified'&&val?'background:#fffbeb':''}"><input type="number" min="0" max="99" value="${val}" placeholder="0"
        class="${val?'has-value':''}" ${disabled}
        data-day="${day}" data-pid="${p.id}"
        onchange="handleOrderChange(${day},${p.id},this)"
        oninput="handleOrderChange(${day},${p.id},this)"></td>`;
    });
    html += `<td style="font-weight:700;color:var(--teal-dark)">${rowTotal||'—'}</td></tr>`;

    if(stStatus === 'modified') {
      html += `<tr style="background:#fffbeb">
        <td colspan="${colCount}" style="padding:0">
          <div style="display:flex;align-items:center;gap:12px;padding:8px 16px;border-left:3px solid #f59e0b;border-bottom:1px solid #fde68a">
            <span style="font-size:0.88rem;color:#92400e;font-weight:600">✏️ A pékség módosította ezt a napot${stNote ? ': ' + esc(stNote) : ''}</span>
            <button onclick="vevoConfirmOrder(${selectedYear},${selectedMonth},${day})" style="margin-left:auto;background:#064C48;color:#EFB036;border:none;border-radius:8px;padding:7px 20px;font-size:0.84rem;font-weight:700;cursor:pointer;white-space:nowrap;letter-spacing:0.02em">✅ Elfogadom a módosítást</button>
          </div>
        </td>
      </tr>`;
    }
  });

  if (currentDays.length === 0) {
    html += `<tr><td colspan="${filteredProds.length + 2}" style="padding:20px;color:var(--text-soft);text-align:center">Ebben a hónapban már nincs aktív sütési nap. Nézd meg az eltelt szakaszt vagy válts hónapot.</td></tr>`;
  }

  html += `<tr class="total-row">
    <td class="col-date sticky-col">Havi összesen</td>`;
  filteredProds.forEach(p => html += `<td>${colTotals[p.id]||'—'}</td>`);
  html += `<td class="grand-total">${grandTotal} db</td></tr>`;

  let totalValue = 0;
  filteredProds.forEach(p => totalValue += colTotals[p.id] * p.price);
  html += `<tr class="total-row" style="background:#f0faf8">
    <td class="col-date sticky-col" style="color:var(--teal-dark)">Érték összesen</td>`;
  filteredProds.forEach(p => {
    const val = colTotals[p.id] * p.price;
    html += `<td style="color:var(--gold-dark);font-weight:700">${val > 0 ? val + ' lej' : '—'}</td>`;
  });
  html += `<td style="background:var(--gold);color:var(--teal-dark);font-weight:800;font-family:'Fraunces',serif">${totalValue} lej</td></tr>`;
  html += '</tbody>';

  // Update chip bar
  const chipDiv = document.getElementById('desktop-cat-chips-wrap');
  if (chipDiv) chipDiv.innerHTML = chipBar;
  document.getElementById('order-table').innerHTML = html;
}

function toggleElapsedDesktop() {
  elapsedOpenDesktop = !elapsedOpenDesktop;
  renderOrderTable();
}

function setGlobalCategory(cat) {
  selectedCategoryGlobal = cat;
  if (typeof KEREKAnalytics !== 'undefined') KEREKAnalytics.categoryFilter(0, cat);
  renderOrderTable();
}

// ===== PRODUCT PIVOT VIEW (C model) =====
// Used both on desktop and mobile via responsive CSS grid.
function renderProductPivot() {
  if(!currentUser) return;
  const prods = getActiveProds(selectedYear, selectedMonth);
  const allDays = getDays(selectedYear, selectedMonth);
  const now = new Date();
  const container = document.getElementById('product-pivot-view');
  if (!container) return;

  document.getElementById('order-month-label').textContent = MONTHS[selectedMonth] + ' ' + selectedYear;

  // Check if any baking day is within 24h
  const urgentDay = allDays.find(d => isBakingDay(d) && hoursUntil(d) >= 0 && hoursUntil(d) < 24);
  if (urgentDay) checkDeadline(urgentDay.getDate());
  else document.getElementById('deadline-notice').classList.remove('show');

  if (prods.length === 0) {
    container.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-soft)">Erre a hónapra még nincs aktív terméklista.</div>';
    return;
  }

  // All baking days in current month
  const bakingDays = allDays.filter(d => isBakingDay(d));
  if (bakingDays.length === 0) {
    container.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-soft)">Ebben a hónapban nincs beállított sütési nap.</div>';
    return;
  }

  // Categories
  const cats = getCategories(prods);
  const hasMultiCats = cats.length > 1;
  const filteredProds = selectedCategoryGlobal === 'all' ? prods : prods.filter(p => p.category === selectedCategoryGlobal);

  // Find any modified-status days (banner trigger)
  let hasModified = false;
  bakingDays.forEach(d => {
    const k = getOrderKey(currentUser.id, selectedYear, selectedMonth, d.getDate());
    const st = (appData.orderStatus && appData.orderStatus[k]) || {};
    if (st.status === 'modified') hasModified = true;
  });

  // Category chips
  let chipBar = '';
  if (hasMultiCats) {
    chipBar = '<div class="pivot-cat-chips">' + ['all', ...cats].map(c => {
      const label = c === 'all' ? '🧺 Összes' : c;
      const active = selectedCategoryGlobal === c;
      return `<button class="pivot-cat-chip ${active?'active':''}" onclick="setGlobalCategory('${c.replace(/'/g,"\\'")}')">${label}</button>`;
    }).join('') + '</div>';
  }

  // Modified banner
  const modBanner = hasModified
    ? `<div class="pivot-mod-banner">
        <span>✏️ Egy vagy több napon az adminisztrátor módosította a rendelésedet.</span>
        <button onclick="switchView('day')">Megnyitás Napi nézetben →</button>
      </div>` : '';

  // Empty state filtered
  if (filteredProds.length === 0) {
    container.innerHTML = chipBar + modBanner + '<div style="padding:30px;text-align:center;color:var(--text-soft)">Ebben a kategóriában nincs aktív termék.</div>';
    return;
  }

  // Render product cards
  let html = chipBar + modBanner;
  html += '<div class="pivot-grid">';
  filteredProds.forEach(p => {
    // Total qty for this product across all baking days (excluding cancelled)
    let prodTotalQty = 0;
    bakingDays.forEach(d => {
      const k = getOrderKey(currentUser.id, selectedYear, selectedMonth, d.getDate());
      const st = (appData.orderStatus && appData.orderStatus[k]) || {};
      if (st.status === 'cancelled') return;
      prodTotalQty += (appData.orders[k] || {})[p.id] || 0;
    });

    html += `<div class="pivot-prod-card">
      <div class="pivot-prod-head" onclick="showProductModal(${p.id})">
        <div class="pivot-prod-info">
          <div class="pivot-prod-name">${esc(p.name)}</div>
          <div class="pivot-prod-meta">${esc(p.weight)} · ${p.price} lej/db ${p.category ? '· '+esc(p.category) : ''}</div>
        </div>
        ${prodTotalQty > 0 ? `<div class="pivot-prod-total">${prodTotalQty} db<br><span class="sub">${prodTotalQty*p.price} lej</span></div>` : '<button class="pivot-info-btn" onclick="event.stopPropagation();showProductModal('+p.id+')">ℹ</button>'}
      </div>
      <div class="pivot-day-grid">`;

    bakingDays.forEach(d => {
      const day = d.getDate();
      const dow = d.getDay();
      const dayShort = DAYS_SHORT[dow] || DAYS_HU[dow].slice(0,2);
      const k = getOrderKey(currentUser.id, selectedYear, selectedMonth, day);
      const qty = (appData.orders[k] || {})[p.id] || 0;
      const orderSt = (appData.orderStatus && appData.orderStatus[k]) || {};
      const isPast = d < now && !isSameDay(d, now);
      const isTodayFlag = isSameDay(d, now);
      const hoursLeft = hoursUntil(d);
      const stDeadline = orderSt.deadline ? new Date(orderSt.deadline) : null;
      const dlLeft = stDeadline ? (stDeadline - new Date()) / 36e5 : null;
      const isLocked = dlLeft !== null ? dlLeft <= 0 : (hoursLeft >= 0 && hoursLeft < 24);
      const stStatus = orderSt.status || '';
      const disabled = isPast || isLocked || stStatus === 'cancelled' || stStatus === 'fulfilled';
      const stIcon = stStatus === 'fulfilled' ? '🎉' : stStatus === 'confirmed' ? '✅' : stStatus === 'modified' ? '✏️' : stStatus === 'cancelled' ? '❌' : '';

      const cellCls = ['pivot-day-cell'];
      if (isPast) cellCls.push('past');
      if (isLocked) cellCls.push('locked');
      if (isTodayFlag) cellCls.push('today');
      if (qty > 0) cellCls.push('has-qty');

      html += `<div class="${cellCls.join(' ')}">
        <div class="pivot-cell-label">${dayShort} ${stIcon}</div>
        <div class="pivot-cell-date">${day}</div>
        ${disabled
          ? `<div class="pivot-cell-readonly">${qty || '—'}</div>`
          : `<div class="pivot-cell-ctrl">
              <button class="pivot-qty-btn" onclick="pivotChangeQty(${day},${p.id},-1)" ${qty<=0?'disabled':''}>−</button>
              <span class="pivot-cell-qty">${qty}</span>
              <button class="pivot-qty-btn" onclick="pivotChangeQty(${day},${p.id},1)">＋</button>
            </div>`
        }
      </div>`;
    });

    html += '</div></div>';
  });
  html += '</div>';

  container.innerHTML = html;
  updateHeroTotal();
}

function pivotChangeQty(day, pid, delta) {
  if (!currentUser) return;
  const key = getOrderKey(currentUser.id, selectedYear, selectedMonth, day);
  if (!appData.orders[key]) appData.orders[key] = {};
  const current = appData.orders[key][pid] || 0;
  const newVal = Math.max(0, current + delta);
  if (newVal > 0) appData.orders[key][pid] = newVal;
  else delete appData.orders[key][pid];
  if (Object.keys(appData.orders[key]).length === 0) delete appData.orders[key];
  // Re-render the pivot fully (cheaper than surgical update; only ~150 cells)
  renderProductPivot();
  if (typeof KEREKAnalytics !== 'undefined') KEREKAnalytics.qtyChange(day, pid, newVal);
}

function isSameDay(a, b) {
  return a.getDate()===b.getDate() && a.getMonth()===b.getMonth() && a.getFullYear()===b.getFullYear();
}

function handleOrderChange(day, pid, input) {
  const qty = parseInt(input.value) || 0;
  const key = getOrderKey(currentUser.id, selectedYear, selectedMonth, day);
  if (!appData.orders[key]) appData.orders[key] = {};
  if (qty > 0) { appData.orders[key][pid] = qty; input.classList.add('has-value'); }
  else {
    delete appData.orders[key][pid];
    input.classList.remove('has-value');
    // A3: Delete from Supabase immediately on qty=0
    sb.delete('orders',
      `client_id=eq.${currentUser.id}&year=eq.${selectedYear}&month=eq.${selectedMonth}&day=eq.${day}&product_id=eq.${pid}`
    ).catch(e => console.warn('qty0 delete:', e.message));
  }
  if (Object.keys(appData.orders[key]).length === 0) delete appData.orders[key];
  updateHeroTotal();
  updateRowTotal(day);
  checkDeadlineForDay(day);
  if (typeof KEREKAnalytics !== 'undefined') KEREKAnalytics.qtyChange(day, pid, qty);
}

function updateRowTotal(day) {
  const row = document.getElementById('row-' + day);
  if (!row) return;
  const key = getOrderKey(currentUser.id, selectedYear, selectedMonth, day);
  const rowOrders = appData.orders[key] || {};
  const total = Object.values(rowOrders).reduce((a,b)=>a+b,0);
  const lastTd = row.querySelector('td:last-child');
  if (lastTd) lastTd.textContent = total || '—';
}

function checkDeadlineForDay(day) {
  const d = new Date(selectedYear, selectedMonth, day);
  const hours = hoursUntil(d);
  if (hours >= 0 && hours < 24) checkDeadline(day);
}

function updateHeroTotal() {
  const prods = getActiveProds(selectedYear, selectedMonth);
  const days = getDays(selectedYear, selectedMonth);
  let total = 0;
  days.forEach(d => {
    const key = getOrderKey(currentUser.id, selectedYear, selectedMonth, d.getDate());
    if (appData.orders[key]) {
      Object.entries(appData.orders[key]).forEach(([pid,qty]) => {
        const p = appData.products.find(p=>p.id==pid);
        if (p) total += p.price * qty;
      });
    }
  });
  document.getElementById('hero-amount').innerHTML = `${total}<span class="currency">lej</span>`;
}

async function saveOrder() {
  // Save orders to Supabase
  const upserts = [];
  getDays(selectedYear, selectedMonth).forEach(d => {
    const day = d.getDate();
    const key = getOrderKey(currentUser.id, selectedYear, selectedMonth, day);
    if(appData.orders[key]) {
      Object.entries(appData.orders[key]).forEach(([pid, qty]) => {
        upserts.push({
          client_id: currentUser.id,
          year: selectedYear,
          month: selectedMonth,
          day: day,
          product_id: parseInt(pid),
          quantity: qty
        });
      });
    }
  });

  // Save message
  const msg = document.getElementById('order-message').value.trim();
  
  try {
    if(upserts.length > 0) {
      await sb.upsert('orders', upserts, 'client_id,year,month,day,product_id');
      // Ha jóváhagyott/módosított nap rendelését változtatta meg a vevő → vissza PENDING
      const affectedDays = [...new Set(upserts.map(u => u.day))];
      for (const day of affectedDays) {
        const key = getOrderKey(currentUser.id, selectedYear, selectedMonth, day);
        const st = (appData.orderStatus && appData.orderStatus[key]) || {};
        if (st.status === 'confirmed' || st.status === 'modified') {
          const newRow = { client_id: currentUser.id, year: selectedYear, month: selectedMonth, day,
            status: 'pending', admin_note: st.admin_note || null };
          await sb.upsert('order_status', newRow, 'client_id,year,month,day');
          if (!appData.orderStatus) appData.orderStatus = {};
          appData.orderStatus[key] = { ...st, status: 'pending' };
        }
      }
    }
    if(msg) {
      const now = Date.now();
      if(now - _lastMsgSent < 30000) {
        toast('⚠️ Kérjük várj 30 másodpercet üzenetek között!');
        document.getElementById('order-message').value = '';
        // Rendelés mégis elmegy, csak üzenet nem
      } else {
        await sb.insert('messages', {
          client_id: currentUser.id,
          year: selectedYear,
          month: selectedMonth,
          text: msg
        });
        _lastMsgSent = now;
      }
    }
    localStorage.setItem('kerek_vevo_data', JSON.stringify(appData));
    auditLog('order_save', currentUser?.name||currentUser?.id||'?', `${selectedYear}-${selectedMonth+1} hónap`);
    toast('✅ Rendelés elmentve! Köszönjük a megrendelést. 🌾');
    // Show order confirmation summary  
    const confirmEl = document.getElementById('order-confirm-msg');
    if(confirmEl) {
      confirmEl.style.display = 'block';
      setTimeout(() => confirmEl.style.display = 'none', 5000);
    }
  } catch(e) {
    console.error('saveOrder hiba:', e);
    toast('⚠️ Mentés sikertelen: ' + e.message, true);
  }
  document.getElementById('order-message').value = '';
}

async function clearOrder() {
  if (!confirm('Biztosan törlöd az összes rendelést ebben a hónapban?')) return;
  // Delete from Supabase
  try {
    await sb.delete('orders',
      `client_id=eq.${currentUser.id}&year=eq.${selectedYear}&month=eq.${selectedMonth}`);
  } catch(e) { console.warn('clearOrder delete:', e.message); }
  // Clear locally
  const days = getDays(selectedYear, selectedMonth);
  days.forEach(d => { delete appData.orders[getOrderKey(currentUser.id, selectedYear, selectedMonth, d.getDate())]; });
  localStorage.setItem('kerek_vevo_data', JSON.stringify(appData));
  renderOrderTable();
  updateHeroTotal();
  toast('Rendelések törölve.');
}


// ===== SUMMARY =====
function showPdfModal() {
  const modal = document.getElementById('pdf-modal');
  if(modal) modal.style.display='flex';
}

function openPdfSummary() {
  const MONTHS = ['Január','Február','Március','Április','Május','Június','Július','Augusztus','Szeptember','Október','November','December'];
  const DAYS_SHORT = ['Vas','Hét','Kedd','Sze','Csüt','Pén','Szo'];
  let grandTotal = 0, bodyHtml = '';

  for(let m=0; m<=11; m++){
    const days = getDays(selectedYear, m);
    const prods = getActiveProds(selectedYear, m);
    let monthTotal=0, rows='', hasOrders=false;
    days.forEach(d=>{
      const key = getOrderKey(currentUser.id, selectedYear, m, d.getDate());
      const ord = appData.orders[key];
      if(!ord) return;
      const dayTotal = prods.reduce((s,p)=>s+(ord[p.id]||0)*(p.price||0),0);
      if(!dayTotal) return;
      hasOrders=true; monthTotal+=dayTotal;
      const items = prods.filter(p=>(ord[p.id]||0)>0).map(p=>p.name+' × '+ord[p.id]+' db').join(', ');
      rows+=`<tr><td style="padding:6px 8px;border-bottom:1px solid #e0f2ef">${d.getDate()}. ${DAYS_SHORT[d.getDay()]}</td><td style="padding:6px 8px;border-bottom:1px solid #e0f2ef">${items}</td><td style="padding:6px 8px;border-bottom:1px solid #e0f2ef;text-align:right;font-weight:600">${dayTotal} lej</td></tr>`;
    });
    if(hasOrders){
      bodyHtml+=`<h3 style="color:#064C48;margin:20px 0 8px;font-size:14px;border-bottom:2px solid #EFB036;padding-bottom:4px">${MONTHS[m]} ${selectedYear}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <tr style="background:#064C48;color:white"><th style="padding:6px 8px;text-align:left">Nap</th><th style="padding:6px 8px;text-align:left">Termékek</th><th style="padding:6px 8px;text-align:right">Összeg</th></tr>
        ${rows}
        <tr style="background:#e0f2ef"><td colspan="2" style="padding:6px 8px;font-weight:700">Havi összesen</td><td style="padding:6px 8px;text-align:right;font-weight:700">${monthTotal} lej</td></tr>
      </table>`;
      grandTotal+=monthTotal;
    }
  }

  if(!bodyHtml){ toast('Nincs rendelés a megjelenítéshez!'); return; }

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>KEREK Rendeles ${currentUser.name} ${selectedYear}</title>
  <style>
    body{font-family:Arial,sans-serif;max-width:720px;margin:30px auto;color:#1A2E31;font-size:13px}
    @media print{body{margin:10px}.no-print{display:none}}
  </style></head><body>
  <div class="no-print" style="background:#064C48;color:white;padding:12px 20px;border-radius:10px;margin-bottom:20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
    <span style="font-size:1rem">📄 PDF mentéshez kattints: <b>Ctrl+P</b> (Windows) vagy <b>Cmd+P</b> (Mac)</span>
    <span style="background:rgba(255,255,255,0.2);padding:4px 12px;border-radius:20px;font-size:0.85rem">Célnyomtató: <b>PDF mentés</b> vagy <b>Save as PDF</b></span>
    <button onclick="window.print()" style="background:#EFB036;color:#1A2E31;border:none;padding:8px 18px;border-radius:8px;font-weight:700;cursor:pointer;font-size:0.9rem">🖨️ Nyomtatás / PDF</button>
  </div>
  <img src="https://komsacsongor.github.io/kerek-rendeles/img/logo_teal_vert.png" style="height:60px;margin-bottom:8px" alt="KEREK">
  <h2 style="color:#064C48;margin:0 0 4px">Rendelés összesítő – ${selectedYear}</h2>
  <p style="color:#666;font-size:12px;margin-bottom:16px">Vevő: <b>${currentUser.name}</b> &nbsp;|&nbsp; Generálva: ${new Date().toLocaleDateString('hu-HU')}</p>
  ${bodyHtml}
  <table style="width:100%;margin-top:20px;border-collapse:collapse">
    <tr style="background:#064C48;color:white">
      <td style="padding:10px 12px;font-weight:700;font-size:14px">ÉVES ÖSSZESEN</td>
      <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:14px">${grandTotal} lej</td>
    </tr>
  </table>
  <p style="color:#aaa;font-size:10px;text-align:center;margin-top:24px">KEREK Gluténmentes Pékség – komsacsongor.github.io/kerek-rendeles</p>
  </body></html>`;

  // Open in new tab - works on all browsers without popup blocker issues
  const blob = new Blob([html], {type: 'text/html;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  document.getElementById('pdf-modal').style.display='none';
}


function renderSummary() {
  const prods = getActiveProds(selectedYear, summaryMonth);
  const days = getDays(selectedYear, summaryMonth);
  const bakingDays = days.filter(d => isBakingDay(d));

  let html = '<thead><tr><th>Termék</th><th>Kategória</th>';
  bakingDays.forEach(d => html += `<th>${MONTHS[summaryMonth].slice(0,3)} ${d.getDate()}.<br><small>${DAYS_HU[d.getDay()].slice(0,3)}</small></th>`);
  html += '<th>Összesen</th><th>Érték</th></tr></thead><tbody>';

  let grandQty = 0, grandVal = 0;
  let hasData = false;
  prods.forEach(p => {
    const qties = bakingDays.map(d => (appData.orders[getOrderKey(currentUser.id, selectedYear, summaryMonth, d.getDate())]||{})[p.id]||0);
    const total = qties.reduce((a,b)=>a+b,0);
    if (total === 0) return;
    hasData = true;
    const val = total * p.price;
    grandQty += total; grandVal += val;
    html += `<tr><td><b>${esc(p.name)}</b> <small style="color:var(--text-soft)">${esc(p.weight)}</small></td><td>${esc(p.category)}</td>`;
    qties.forEach(q => html += `<td>${q||'—'}</td>`);
    html += `<td style="font-weight:700">${total}</td><td style="color:var(--gold-dark);font-weight:700">${val} lej</td></tr>`;
  });

  if (!hasData) {
    html += `<tr><td colspan="20" style="padding:20px;text-align:center;color:var(--text-soft)">Nincs megrendelés erre a hónapra.</td></tr>`;
  } else {
    html += `<tr class="total-row"><td colspan="2">ÖSSZESEN</td>`;
    bakingDays.forEach(() => html += '<td></td>');
    html += `<td>${grandQty} db</td><td>${grandVal} lej</td></tr>`;
  }
  html += '</tbody>';
  document.getElementById('summary-table').innerHTML = html;
}

// ===== MOBILE ORDER CARDS =====
function renderMobileOrderCards() {
  if(!currentUser) return;
  const prods = getActiveProds(selectedYear, selectedMonth);
  const days = getDays(selectedYear, selectedMonth);
  const now = new Date();
  const container = document.getElementById('mobile-order-cards');
  const desktopCard = document.querySelector('.card');
  if(desktopCard) desktopCard.style.display = 'none';
  if(!container) return;

  // Remove old sticky category tabs if they exist (legacy cleanup)
  const oldTabs = document.getElementById('category-tabs');
  if (oldTabs) oldTabs.remove();

  if(prods.length === 0) {
    container.innerHTML = '<div class="mob-day-card" style="padding:20px;text-align:center;color:var(--text-soft)">Erre a hónapra még nincs aktív terméklista.</div>';
    return;
  }

  // Categories for per-day chip filter
  const cats = getCategories(prods);
  const hasMultiCats = cats.length > 1;

  // Split: elapsed baking days (past) vs current/future baking days
  // Non-baking days are now completely hidden (user decision: long-term goal is to bake every day)
  const elapsedDays = [];
  const currentDays = [];
  days.forEach(d => {
    const baking = isBakingDay(d);
    if (!baking) return; // skip non-baking days entirely
    const isPast = d < now && !isSameDay(d, now);
    if (isPast) elapsedDays.push(d);
    else currentDays.push(d);
  });

  let html = '';

  // ===== ELAPSED SECTION (top, collapsed by default) =====
  if (elapsedDays.length > 0) {
    let elapsedItems = '';
    elapsedDays.forEach(d => {
      const day = d.getDate();
      const dow = d.getDay();
      const dayName = DAYS_HU[dow];
      const key = getOrderKey(currentUser.id, selectedYear, selectedMonth, day);
      const rowOrders = appData.orders[key] || {};
      const rowTotal = Object.values(rowOrders).reduce((a,b)=>a+b,0);
      const rowVal = Object.entries(rowOrders).reduce((acc,[pid,q])=>{
        const p=appData.products.find(p=>p.id==pid); return acc+(p?p.price*q:0);
      },0);
      const orderSt = (appData.orderStatus && appData.orderStatus[key]) || {};
      const stStatus = orderSt.status || '';

      let statusBadge = '';
      if (stStatus === 'fulfilled') statusBadge = '<span class="mob-elapsed-badge" style="background:#d1fae5;color:#065f46">🎉 Elkészült</span>';
      else if (stStatus === 'confirmed') statusBadge = '<span class="mob-elapsed-badge" style="background:#dcfce7;color:#166534">✅ Jóváhagyva</span>';
      else if (stStatus === 'cancelled') statusBadge = '<span class="mob-elapsed-badge" style="background:#fee2e2;color:#b91c1c">❌ Visszavonva</span>';
      else if (stStatus === 'pending' || stStatus === 'modified') statusBadge = '<span class="mob-elapsed-badge" style="background:#fef3c7;color:#92400e">⚠️ Feldolgozás alatt</span>';
      else statusBadge = '<span class="mob-elapsed-empty">— nem rendeltél —</span>';

      const summary = rowTotal > 0
        ? `<div class="mob-elapsed-day-items">${rowTotal} db · ${rowVal} lej</div>`
        : '';

      elapsedItems += `<div class="mob-elapsed-day">
        <div>
          <div class="mob-elapsed-day-name">🔥 ${dayName}, ${day}.</div>
          ${summary}
        </div>
        ${statusBadge}
      </div>`;
    });

    html += `<div class="mob-elapsed-section">
      <div class="mob-elapsed-head" onclick="toggleElapsedSection()">
        <span style="font-weight:600;color:var(--text-soft);font-size:0.85rem">🕰 Eltelt sütési napok (${elapsedDays.length})</span>
        <span id="mob-elapsed-arrow" style="color:var(--text-soft);font-size:0.9rem">▾</span>
      </div>
      <div class="mob-elapsed-body" id="mob-elapsed-body">
        ${elapsedItems}
      </div>
    </div>`;
  }

  // ===== CURRENT / FUTURE DAYS (only baking days) =====
  currentDays.forEach(d => {
    const day = d.getDate();
    const dow = d.getDay();
    const dayName = DAYS_HU[dow];
    const key = getOrderKey(currentUser.id, selectedYear, selectedMonth, day);
    const hoursLeft = hoursUntil(d);
    const mobOrderSt = (appData.orderStatus && appData.orderStatus[key]) || {};
    const mobDeadline = mobOrderSt.deadline ? new Date(mobOrderSt.deadline) : null;
    const mobDeadlineLeft = mobDeadline ? (mobDeadline - new Date()) / 36e5 : null;
    const isLocked = mobDeadlineLeft !== null ? mobDeadlineLeft <= 0 : (hoursLeft >= 0 && hoursLeft < 24);
    const rowOrders = appData.orders[key] || {};
    const rowTotal = Object.values(rowOrders).reduce((a,b)=>a+b,0);
    const rowVal = Object.entries(rowOrders).reduce((acc,[pid,q])=>{ const p=appData.products.find(p=>p.id==pid); return acc+(p?p.price*q:0); },0);

    {
      const lockedClass = isLocked ? 'mob-locked' : '';
      const orderSt = mobOrderSt;
      const stStatus = orderSt.status || (rowTotal > 0 ? 'pending' : '');
      const stNote = orderSt.admin_note || '';
      let statusBanner = '';
      if (stStatus === 'fulfilled') statusBanner = '<div style="background:#d1fae5;color:#065f46;border-radius:8px;padding:6px 12px;margin:8px 0;font-size:0.82rem;font-weight:700">🎉 Rendelésed elkészült!</div>';
      else if (stStatus === 'confirmed') statusBanner = '<div style="background:#dcfce7;color:#166534;border-radius:8px;padding:6px 12px;margin:8px 0;font-size:0.82rem;font-weight:600">✅ Rendelésed jóváhagyva</div>';
      else if (stStatus === 'modified') statusBanner = '<div style="background:#fef3c7;color:#92400e;border-radius:8px;padding:8px 12px;margin:8px 0;font-size:0.82rem">' +
        '<div style="font-weight:700;margin-bottom:4px">✏️ Az adminisztrátor módosította a rendelésedet</div>' +
        (stNote ? '<div style="font-size:0.8rem;margin-bottom:8px">' + esc(stNote) + '</div>' : '') +
        '<button onclick="vevoConfirmOrder(' + selectedYear + ',' + selectedMonth + ',' + day + ')" style="background:var(--teal-dark);color:#fff;border:none;border-radius:8px;padding:7px 16px;font-size:0.82rem;font-weight:600;cursor:pointer;width:100%">✅ Elfogadom a módosítást</button>' +
        '</div>';
      else if (stStatus === 'cancelled') statusBanner = '<div style="background:#fee2e2;color:#b91c1c;border-radius:8px;padding:6px 12px;margin:8px 0;font-size:0.82rem;font-weight:600">❌ Rendelésed visszavonva</div>';
      const bodyAutoOpen = openDaysManual.has(day) || rowTotal > 0 || stStatus === 'modified' || stStatus === 'cancelled';
      const headStatusBadge = stStatus === 'fulfilled' ? '<span style="background:#d1fae5;color:#065f46;border-radius:6px;padding:2px 7px;font-size:0.68rem;font-weight:600">🎉 Elkészült</span>'
        : stStatus === 'confirmed' ? '<span style="background:#dcfce7;color:#166534;border-radius:6px;padding:2px 7px;font-size:0.68rem;font-weight:600">✅</span>'
        : stStatus === 'modified' ? '<span style="background:#fef3c7;color:#92400e;border-radius:6px;padding:2px 7px;font-size:0.68rem;font-weight:600">✏️ Módosítva</span>'
        : stStatus === 'cancelled' ? '<span style="background:#fee2e2;color:#b91c1c;border-radius:6px;padding:2px 7px;font-size:0.68rem;font-weight:600">❌</span>'
        : '';

      // Per-day category filter chips
      const dayCat = selectedCategoryByDay[day] || 'all';
      const dayFilteredProds = dayCat === 'all' ? prods : prods.filter(p => p.category === dayCat);

      let catChips = '';
      if (hasMultiCats) {
        catChips = '<div class="mob-cat-chips">' + ['all', ...cats].map(cat => {
          const label = cat === 'all' ? '🧺 Összes' : cat;
          const active = dayCat === cat;
          const safeCat = cat.replace(/'/g,"\\'");
          return `<button class="mob-cat-chip ${active?'active':''}" onclick="event.stopPropagation();mobChangeCategoryDay(${day},'${safeCat}')">${label}</button>`;
        }).join('') + '</div>';
      }

      html += `<div class="mob-day-card" id="mob-card-${day}">
        <div class="mob-day-head baking" onclick="toggleMobCard(${day})">
          <div>
            <div class="mob-day-name">🔥 ${dayName}, ${day}.</div>
            ${isLocked ? '<div style="font-size:0.7rem;color:var(--gold-dark)">⏰ 24h határidő – következő sütésnél érvényes</div>' : ''}
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            ${headStatusBadge}
            ${rowTotal > 0 ? `<span class="mob-baking-badge">${rowTotal} db</span>` : ''}
            <span style="color:var(--teal-mid);font-size:0.85rem" id="mob-arrow-${day}">▾</span>
          </div>
        </div>
        <div class="mob-day-body ${bodyAutoOpen ? 'open' : ''}" id="mob-body-${day}">
          ${statusBanner}
          ${isLocked ? '<div class="mob-lock-notice">⏰ Ez a nap már zárolva van. A módosítás a következő sütésnél érvényes.</div>' : ''}
          ${catChips}
          <div class="${lockedClass}">
            ${dayFilteredProds.map(p => {
              const qty = rowOrders[p.id] || 0;
              return `<div class="mob-product-row">
                <div class="mob-prod-info" onclick="showProductModal(${p.id})">
                  <div class="mob-prod-name-row">
                    <span class="mob-prod-name">${esc(p.name)}</span>
                    <button class="mob-info-btn" onclick="event.stopPropagation();showProductModal(${p.id})">ℹ</button>
                  </div>
                  <div class="mob-prod-weight">${esc(p.weight)}</div>
                  <div class="mob-prod-price">${p.price} lej/db</div>
                </div>
                <div class="mob-qty-control">
                  <button class="mob-qty-btn" onclick="mobChangeQty(${day},${p.id},-1)">−</button>
                  <div class="mob-qty-display ${qty>0?'has-value':''}" id="mob-qty-${day}-${p.id}">${qty||0}</div>
                  <button class="mob-qty-btn" onclick="mobChangeQty(${day},${p.id},1)">＋</button>
                </div>
              </div>`;
            }).join('')}
          </div>
          ${rowTotal > 0 ? `<div class="mob-day-total"><span>Napi összesen</span><span>${rowTotal} db · ${rowVal} lej</span></div>` : ''}
        </div>
      </div>`;
    }
  });

  container.innerHTML = html;
  updateHeroTotal();
}

function toggleMobCard(day) {
  const body = document.getElementById('mob-body-' + day);
  const arrow = document.getElementById('mob-arrow-' + day);
  if(!body) return;
  body.classList.toggle('open');
  const isOpen = body.classList.contains('open');
  if (isOpen) openDaysManual.add(day);
  else openDaysManual.delete(day);
  if(arrow) arrow.textContent = isOpen ? '▴' : '▾';
}

function mobChangeQty(day, pid, delta) {
  const key = getOrderKey(currentUser.id, selectedYear, selectedMonth, day);
  if(!appData.orders[key]) appData.orders[key] = {};
  const current = appData.orders[key][pid] || 0;
  const newVal = Math.max(0, current + delta);
  if(newVal > 0) appData.orders[key][pid] = newVal;
  else delete appData.orders[key][pid];
  if(Object.keys(appData.orders[key]).length === 0) delete appData.orders[key];

  // Update display
  const display = document.getElementById(`mob-qty-${day}-${pid}`);
  if(display) {
    display.textContent = newVal;
    display.className = 'mob-qty-display' + (newVal > 0 ? ' has-value' : '');
  }

  // Update day total
  const rowOrders = appData.orders[key] || {};
  const rowTotal = Object.values(rowOrders).reduce((a,b)=>a+b,0);
  const rowVal = Object.entries(rowOrders).reduce((acc,[p,q])=>{
    const prod=appData.products.find(x=>x.id==p); return acc+(prod?prod.price*q:0);
  },0);

  // Update badge in header
  const card = document.getElementById('mob-card-' + day);
  if(card) {
    const badge = card.querySelector('.mob-baking-badge');
    const head = card.querySelector('.mob-day-head');
    if(rowTotal > 0) {
      if(badge) badge.textContent = rowTotal + ' db';
      else if(head) {
        const badgeDiv = document.createElement('span');
        badgeDiv.className = 'mob-baking-badge';
        badgeDiv.textContent = rowTotal + ' db';
        head.querySelector('div:last-child').prepend(badgeDiv);
      }
    } else if(badge) badge.remove();

    // Update total row
    let totalRow = card.querySelector('.mob-day-total');
    const body = document.getElementById('mob-body-' + day);
    if(rowTotal > 0) {
      if(totalRow) { totalRow.innerHTML = `<span>Napi összesen</span><span>${rowTotal} db · ${rowVal} lej</span>`; }
      else if(body) {
        const div = document.createElement('div');
        div.className = 'mob-day-total';
        div.innerHTML = `<span>Napi összesen</span><span>${rowTotal} db · ${rowVal} lej</span>`;
        body.appendChild(div);
      }
    } else if(totalRow) totalRow.remove();
  }

  updateHeroTotal();
  if (typeof KEREKAnalytics !== 'undefined') KEREKAnalytics.qtyChange(day, pid, newVal);
}

// Handle resize
window.addEventListener('resize', () => {
  const mob = document.getElementById('mobile-order-cards');
  const desktopCard = document.querySelector('.card');
  if(isMobile()) {
    if(mob) mob.style.display = 'block';
    if(desktopCard) desktopCard.style.display = 'none';
    renderMobileOrderCards();
  } else {
    if(mob) mob.style.display = 'none';
    if(desktopCard) desktopCard.style.display = '';
    renderOrderTable();
  }
});

async function sendMessageOnly() {
  if (!currentUser) return;
  const msg = document.getElementById('order-message')?.value?.trim();
  if (!msg) { toast('⚠️ Üzenet nem lehet üres!', true); return; }
  const now = Date.now();
  if (now - (_lastMsgSent||0) < 30000) {
    toast('⚠️ Kérjük várj 30 másodpercet üzenetek között!', true); return;
  }
  try {
    await sb.insert('messages', {
      client_id: currentUser.id,
      year: selectedYear,
      month: selectedMonth,
      text: msg
    });
    _lastMsgSent = now;
    document.getElementById('order-message').value = '';
    await loadMessage();
    toast('✅ Üzenet elküldve!');
  } catch(e) { toast('⚠️ Küldés sikertelen: ' + e.message, true); }
}

async function vevoConfirmOrder(year, month, day) {
  if (!currentUser) return;
  const key = getOrderKey(currentUser.id, year, month, day);
  try {
    await sb.upsert('order_status', {
      client_id: currentUser.id, year, month, day,
      status: 'confirmed', confirmed_at: new Date().toISOString()
    }, 'client_id,year,month,day');
    if (!appData.orderStatus) appData.orderStatus = {};
    appData.orderStatus[key] = { status: 'confirmed', admin_note: (appData.orderStatus[key]||{}).admin_note };
    toast('✅ Módosítás elfogadva!');
    renderOrderTable();
  } catch(e) { toast('⚠️ Hiba: ' + e.message); }
}

// U1: Copy last order
async function copyLastOrder() {
  const days = getDays(selectedYear, selectedMonth).filter(d => isBakingDay(d));
  if (days.length === 0) { toast('Nincs sütési nap ebben a hónapban.', true); return; }

  // Find the last day with an order (previous month or current)
  let srcKey = null, srcDay = null, srcLabel = '';
  // First check current month backward
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i];
    const k = getOrderKey(currentUser.id, selectedYear, selectedMonth, d.getDate());
    if (appData.orders[k] && Object.keys(appData.orders[k]).length > 0) {
      srcKey = k; srcDay = d;
      srcLabel = `${d.getDate()}. ${['Vas','Hét','Kedd','Sze','Csüt','Pén','Szo'][d.getDay()]}`;
      break;
    }
  }

  // If nothing in current month, check previous month from Supabase
  if (!srcKey) {
    try {
      const prevM = selectedMonth === 0 ? 11 : selectedMonth - 1;
      const prevY = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
      const prevOrders = await sb.query('orders', {
        filter: `client_id=eq.${currentUser.id}&year=eq.${prevY}&month=eq.${prevM}`,
        order: 'day.desc', limit: 50
      });
      if (prevOrders && prevOrders.length > 0) {
        const lastDay = prevOrders[0].day;
        const dayOrders = prevOrders.filter(o => o.day === lastDay);
        const MONTHS_HU = ['jan','feb','már','ápr','máj','jún','júl','aug','sze','okt','nov','dec'];
        srcLabel = `${prevY}. ${MONTHS_HU[prevM]}. ${lastDay}.`;
        srcKey = '__prev__';
        // Build order map
        const tempMap = {};
        dayOrders.forEach(o => { tempMap[o.product_id] = o.quantity; });
        if (!confirm(`Másoljuk a(z) ${srcLabel} rendelést az aktuális napokra?`)) return;
        // Apply to all days in current month
        const targetDays = getDays(selectedYear, selectedMonth).filter(d => isBakingDay(d));
        for (const td of targetDays) {
          const tk = getOrderKey(currentUser.id, selectedYear, selectedMonth, td.getDate());
          appData.orders[tk] = {...tempMap};
        }
        renderOrderTable(); updateHeroTotal();
        toast(`✅ Előző rendelés (${srcLabel}) másolva ${targetDays.length} napra!`);
        return;
      }
    } catch(e) { console.warn('copyLastOrder prev month:', e.message); }
    toast('Nincs korábbi rendelés amit másolni lehetne.', true); return;
  }

  if (!confirm(`Másoljuk a(z) ${srcLabel}-i rendelést az összes sütési napra?`)) return;
  const srcOrders = {...appData.orders[srcKey]};
  const targetDays = getDays(selectedYear, selectedMonth).filter(d => isBakingDay(d));
  for (const td of targetDays) {
    const tk = getOrderKey(currentUser.id, selectedYear, selectedMonth, td.getDate());
    appData.orders[tk] = {...srcOrders};
  }
  renderOrderTable(); updateHeroTotal();
  toast(`✅ Rendelés másolva ${targetDays.length} napra!`);
}
