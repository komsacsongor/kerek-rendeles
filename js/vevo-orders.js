// ===== ORDER TABLE =====
function isMobile() { return window.innerWidth <= 640; }

function renderOrderTable() {
  if(!currentUser) return; // null guard
  if(isMobile()) { renderMobileOrderCards(); return; }
  const prods = getActiveProds(selectedYear, selectedMonth);
  const days = getDays(selectedYear, selectedMonth);
  const now = new Date();

  document.getElementById('order-month-label').textContent = MONTHS[selectedMonth] + ' ' + selectedYear;

  // Check if any baking day is within 24h
  const urgentDay = days.find(d => isBakingDay(d) && hoursUntil(d) >= 0 && hoursUntil(d) < 24);
  if (urgentDay) checkDeadline(urgentDay.getDate());
  else document.getElementById('deadline-notice').classList.remove('show');

  if (prods.length === 0) {
    document.getElementById('order-table').innerHTML = '<tr><td style="padding:20px;color:var(--text-soft)">Erre a hónapra még nincs aktív terméklista.</td></tr>';
    return;
  }

  // Header
  let html = '<thead><tr><th class="col-date">Dátum</th>';
  prods.forEach(p => {
    html += `<th class="col-product" onclick="showProductModal(${p.id})" title="Kattints a termék adatlapjáért">
      <span class="prod-name">${esc(p.name)}</span>
      <span class="prod-weight">${esc(p.weight)}</span>
      <span class="prod-price">${p.price} lej</span>
    </th>`;
  });
  html += '<th style="min-width:70px">Összesen</th></tr></thead><tbody>';

  // Rows
  let grandTotal = 0;
  const colTotals = {};
  prods.forEach(p => colTotals[p.id] = 0);

  days.forEach(d => {
    const day = d.getDate();
    const dow = d.getDay();
    const baking = isBakingDay(d);
    const dayName = DAYS_HU[dow];
    const key = getOrderKey(currentUser.id, selectedYear, selectedMonth, day);
    const isPast = d < now && !isSameDay(d, now);

    if (!baking) {
      html += `<tr class="no-bake">
        <td class="col-date">${day}. ${dayName}</td>
        ${prods.map(() => '<td>—</td>').join('')}
        <td>—</td>
      </tr>`;
    } else {
      const rowOrders = appData.orders[key] || {};
      let rowTotal = 0;
      prods.forEach(p => rowTotal += (rowOrders[p.id]||0));
      grandTotal += rowTotal;

      // Is this baking day locked (< 24h)?
      const hoursLeft = hoursUntil(d);
      const isLocked = hoursLeft >= 0 && hoursLeft < 24;
      const isOver = d < now;

      html += `<tr class="baking-row" id="row-${day}">
        <td class="col-date">
          ${day}. <b>${dayName}</b>
          <span class="baking-label">🔥 Sütési nap${isLocked?' · ⏰ 24h':''}</span>
        </td>`;
      prods.forEach(p => {
        const val = rowOrders[p.id] || '';
        const disabled = isOver || isLocked ? 'disabled' : '';
        const cls = val ? 'has-value' : '';
        colTotals[p.id] += (rowOrders[p.id]||0);
        html += `<td><input type="number" min="0" max="99" value="${val}" placeholder="0"
          class="${cls}" ${disabled}
          data-day="${day}" data-pid="${p.id}"
          onchange="handleOrderChange(${day},${p.id},this)"
          oninput="handleOrderChange(${day},${p.id},this)"></td>`;
      });
      html += `<td style="font-weight:700;color:var(--teal-dark)">${rowTotal||'—'}</td></tr>`;
    }
  });

  // Column totals row
  html += `<tr class="total-row">
    <td class="col-date">Havi összesen</td>`;
  prods.forEach(p => html += `<td>${colTotals[p.id]||'—'}</td>`);
  html += `<td class="grand-total">${grandTotal} db</td></tr>`;

  // Value row
  let totalValue = 0;
  prods.forEach(p => totalValue += colTotals[p.id] * p.price);
  html += `<tr class="total-row" style="background:#f0faf8">
    <td class="col-date" style="color:var(--teal-dark)">Érték összesen</td>`;
  prods.forEach(p => {
    const val = colTotals[p.id] * p.price;
    html += `<td style="color:var(--gold-dark);font-weight:700">${val > 0 ? val + ' lej' : '—'}</td>`;
  });
  html += `<td style="background:var(--gold);color:var(--teal-dark);font-weight:800;font-family:'Fraunces',serif">${totalValue} lej</td></tr>`;

  html += '</tbody>';
  document.getElementById('order-table').innerHTML = html;
}

function isSameDay(a, b) {
  return a.getDate()===b.getDate() && a.getMonth()===b.getMonth() && a.getFullYear()===b.getFullYear();
}

function handleOrderChange(day, pid, input) {
  const qty = parseInt(input.value) || 0;
  const key = getOrderKey(currentUser.id, selectedYear, selectedMonth, day);
  if (!appData.orders[key]) appData.orders[key] = {};
  if (qty > 0) { appData.orders[key][pid] = qty; input.classList.add('has-value'); }
  else { delete appData.orders[key][pid]; input.classList.remove('has-value'); }
  if (Object.keys(appData.orders[key]).length === 0) delete appData.orders[key];
  updateHeroTotal();
  updateRowTotal(day);
  checkDeadlineForDay(day);
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
    if(upserts.length > 0) await sb.upsert('orders', upserts, 'client_id,year,month,day,product_id');
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

function clearOrder() {
  if (!confirm('Biztosan törlöd az összes rendelést ebben a hónapban?')) return;
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

  if(prods.length === 0) {
    container.innerHTML = '<div class="mob-day-card" style="padding:20px;text-align:center;color:var(--text-soft)">Erre a hónapra még nincs aktív terméklista.</div>';
    return;
  }

  let html = '';
  days.forEach(d => {
    const day = d.getDate();
    const dow = d.getDay();
    const baking = isBakingDay(d);
    const dayName = DAYS_HU[dow];
    const key = getOrderKey(currentUser.id, selectedYear, selectedMonth, day);
    const isOver = d < now && !isSameDay(d, now);
    const hoursLeft = hoursUntil(d);
    const isLocked = baking && hoursLeft >= 0 && hoursLeft < 24;
    const rowOrders = appData.orders[key] || {};
    const rowTotal = Object.values(rowOrders).reduce((a,b)=>a+b,0);
    const rowVal = Object.entries(rowOrders).reduce((acc,[pid,q])=>{ const p=appData.products.find(p=>p.id==pid); return acc+(p?p.price*q:0); },0);

    if(!baking) {
      html += `<div class="mob-day-card">
        <div class="mob-day-head no-bake">
          <div><div class="mob-day-name" style="color:#bbb;font-weight:400">${day}. ${dayName}</div></div>
          <span style="font-size:0.7rem;color:#ccc">Nincs sütés</span>
        </div>
      </div>`;
    } else {
      const lockedClass = (isOver || isLocked) ? 'mob-locked' : '';
      const orderSt = (appData.orderStatus && appData.orderStatus[key]) || {};
      const stStatus = orderSt.status || (rowTotal > 0 ? 'pending' : '');
      const stNote = orderSt.admin_note || '';
      let statusBanner = '';
      if (stStatus === 'confirmed') statusBanner = '<div style="background:#dcfce7;color:#166534;border-radius:8px;padding:6px 12px;margin:8px 0;font-size:0.82rem;font-weight:600">✅ Rendelésed jóváhagyva</div>';
      else if (stStatus === 'modified') statusBanner = '<div style="background:#fef3c7;color:#92400e;border-radius:8px;padding:8px 12px;margin:8px 0;font-size:0.82rem">' +
        '<div style="font-weight:700;margin-bottom:4px">✏️ Az adminisztrátor módosította a rendelésedet</div>' +
        (stNote ? '<div style="font-size:0.8rem;margin-bottom:8px">' + esc(stNote) + '</div>' : '') +
        '<button onclick="vevoConfirmOrder(' + selectedYear + ',' + selectedMonth + ',' + day + ')" style="background:var(--teal-dark);color:#fff;border:none;border-radius:8px;padding:7px 16px;font-size:0.82rem;font-weight:600;cursor:pointer;width:100%">✅ Elfogadom a módosítást</button>' +
        '</div>';
      else if (stStatus === 'cancelled') statusBanner = '<div style="background:#fee2e2;color:#b91c1c;border-radius:8px;padding:6px 12px;margin:8px 0;font-size:0.82rem;font-weight:600">❌ Rendelésed visszavonva</div>';
      const bodyAutoOpen = rowTotal > 0 || stStatus === 'modified' || stStatus === 'cancelled';
      const headStatusBadge = stStatus === 'confirmed' ? '<span style="background:#dcfce7;color:#166534;border-radius:6px;padding:2px 7px;font-size:0.68rem;font-weight:600">✅</span>'
        : stStatus === 'modified' ? '<span style="background:#fef3c7;color:#92400e;border-radius:6px;padding:2px 7px;font-size:0.68rem;font-weight:600">✏️ Módosítva</span>'
        : stStatus === 'cancelled' ? '<span style="background:#fee2e2;color:#b91c1c;border-radius:6px;padding:2px 7px;font-size:0.68rem;font-weight:600">❌</span>'
        : '';
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
          <div class="${lockedClass}">
            ${prods.map(p => {
              const qty = rowOrders[p.id] || 0;
              return `<div class="mob-product-row">
                <div class="mob-prod-info" onclick="showProductModal(${p.id})">
                  <div class="mob-prod-name">${esc(p.name)}</div>
                  <div class="mob-prod-weight">${esc(p.weight)}</div>
                  <div class="mob-prod-price">${p.price} lej/db ℹ️</div>
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
  if(arrow) arrow.textContent = body.classList.contains('open') ? '▴' : '▾';
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
