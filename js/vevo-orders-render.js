// =============================================================
// KEREK Megrendelő – Megrendelő RENDER funkciók (táblák, kártyák, pivot, summary) (v2.32.0 M9 bontás)
// Eredetileg: js/vevo-orders.js (921 sor)
// =============================================================


// ===== ORDER TABLE =====


// Per-day category filter state: { day: 'category' | 'all' } (only used in mobile A day view)
let selectedCategoryByDay = {};

// Tracks days manually toggled OPEN by the user (persists across renders) - mobile A
let openDaysManual = new Set();

// View toggle state ('day' = A model, 'product' = C model)
let vevoView = 'day';

// Global category filter (used in C product-pivot view, both desktop and mobile)
let selectedCategoryGlobal = 'all';

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
  // Simplified dispatcher: only two views (day | product). Day view uses unified card render
  // on both desktop and mobile.
  const pivotDiv = document.getElementById('product-pivot-view');
  const mobileCardsDiv = document.getElementById('mobile-order-cards');

  // Update toggle button state
  const dBtn = document.getElementById('view-btn-day');
  const pBtn = document.getElementById('view-btn-product');
  if (dBtn) dBtn.classList.toggle('active', vevoView === 'day');
  if (pBtn) pBtn.classList.toggle('active', vevoView === 'product');

  document.getElementById('order-month-label').textContent = MONTHS[selectedMonth] + ' ' + selectedYear;

  if (vevoView === 'product') {
    if (pivotDiv) pivotDiv.style.display = 'block';
    if (mobileCardsDiv) mobileCardsDiv.style.display = 'none';
    renderProductPivot();
    return;
  }
  // Day view (unified A model on both viewports)
  if (pivotDiv) pivotDiv.style.display = 'none';
  if (mobileCardsDiv) mobileCardsDiv.style.display = 'block';
  renderMobileOrderCards();
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
      ${typeof renderStandingBar === 'function' ? renderStandingBar(p.id) : ''}
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
      const isLocked = dlLeft !== null ? dlLeft <= 0 : defaultDeadlinePassed(d);
      const stStatus = orderSt.status || '';
      const disabled = isPast || isLocked || stStatus === 'cancelled' || stStatus === 'fulfilled';
      const stIcon = stStatus === 'fulfilled' ? '🎉' : stStatus === 'confirmed' ? '✅' : stStatus === 'modified' ? '✏️' : stStatus === 'cancelled' ? '❌' : stStatus === 'pending' ? '⏳' : '';
      // #1+#2: státusz-jelzés CSAK az aktuális+jövőbeli napokon, színes badge-ként (a múltbelin nincs)
      let stLabelStyle = '';
      if (!isPast && stStatus) {
        const stColor = (stStatus === 'confirmed' || stStatus === 'fulfilled') ? 'background:#dcfce7;color:#166534'
          : stStatus === 'cancelled' ? 'background:#fee2e2;color:#b91c1c'
          : 'background:#fef3c7;color:#92400e'; // pending / modified
        stLabelStyle = ` style="${stColor};border-radius:6px;padding:1px 6px;font-weight:700"`;
      }

      const cellCls = ['pivot-day-cell'];
      if (isPast) cellCls.push('past');
      if (isLocked) cellCls.push('locked');
      if (isTodayFlag) cellCls.push('today');
      if (qty > 0) cellCls.push('has-qty');

      html += `<div class="${cellCls.join(' ')}">
        <div class="pivot-cell-label"${stLabelStyle}>${dayShort}${(!isPast && stIcon) ? ' ' + stIcon : ''}</div>
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
    const isLocked = mobDeadlineLeft !== null ? mobDeadlineLeft <= 0 : defaultDeadlinePassed(d);
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

      const isTodayCard = isSameDay(d, now);
      html += `<div class="mob-day-card${isTodayCard?' today':''}" id="mob-card-${day}">
        <div class="mob-day-head baking" onclick="toggleMobCard(${day})">
          <div>
            <div class="mob-day-name">🔥 ${dayName}, ${day}.${isTodayCard?' <span style="color:var(--gold);font-weight:700;font-size:.72rem">· MA</span>':''}</div>
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
