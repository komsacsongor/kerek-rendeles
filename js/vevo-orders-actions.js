// =============================================================
// KEREK Megrendelő – Megrendelő AKCIÓ funkciók (qty változás, save, clear, deadline) (v2.32.0 M9 bontás)
// Eredetileg: js/vevo-orders.js (921 sor)
// =============================================================


// v2.53.21: csak a vevő által ténylegesen módosított napokat jelöljük "dirty"-nek,
// hogy a saveOrder NE állítsa vissza pending-re a nem érintett (pl. korábban jóváhagyott) napokat.
const _dirtyOrderDays = new Set();
function markOrderDirty(day) {
  if (currentUser) _dirtyOrderDays.add(getOrderKey(currentUser.id, selectedYear, selectedMonth, day));
}

function pivotChangeQty(day, pid, delta) {
  if (!currentUser) return;
  const key = getOrderKey(currentUser.id, selectedYear, selectedMonth, day);
  if (!appData.orders[key]) appData.orders[key] = {};
  const current = appData.orders[key][pid] || 0;
  const newVal = Math.max(0, current + delta);
  if (newVal > 0) appData.orders[key][pid] = newVal;
  else {
    delete appData.orders[key][pid];
    // C3 fix: Delete from Supabase immediately on qty=0 (prevent data corruption)
    if (current > 0) {
      sb.delete('orders',
        `client_id=eq.${currentUser.id}&year=eq.${selectedYear}&month=eq.${selectedMonth}&day=eq.${day}&product_id=eq.${pid}`
      ).catch(e => console.warn('qty0 delete:', e.message));
    }
  }
  if (Object.keys(appData.orders[key]).length === 0) delete appData.orders[key];
  markOrderDirty(day);
  // Re-render the pivot fully (cheaper than surgical update; only ~150 cells)
  renderProductPivot();
  if (typeof KEREKAnalytics !== 'undefined') KEREKAnalytics.qtyChange(day, pid, newVal);
}

function isSameDay(a, b) {
  return a.getDate()===b.getDate() && a.getMonth()===b.getMonth() && a.getFullYear()===b.getFullYear();
}

// Default deadline: previous day 18:00 (when admin hasn't set custom deadline)

function defaultDeadlinePassed(bakingDate) {
  const dl = new Date(bakingDate);
  dl.setDate(dl.getDate() - 1);
  dl.setHours(18, 0, 0, 0);
  return new Date() >= dl;
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
  let total = 0, qtyTotal = 0;
  days.forEach(d => {
    const key = getOrderKey(currentUser.id, selectedYear, selectedMonth, d.getDate());
    if (appData.orders[key]) {
      Object.entries(appData.orders[key]).forEach(([pid,qty]) => {
        const p = appData.products.find(p=>p.id==pid);
        // v2.38.6 fix: explicit number conversion + 0 fallback to avoid NaN if price missing
        if (p && typeof p.price === 'number') total += p.price * (Number(qty) || 0);
        qtyTotal += Number(qty) || 0;
      });
    }
  });
  // v2.38.6: NaN guard for total and qtyTotal
  total = Number(total) || 0;
  qtyTotal = Number(qtyTotal) || 0;
  document.getElementById('hero-amount').innerHTML = `${total}<span class="currency">lej</span>`;
  // Sticky bottom bar
  const stickyQty = document.getElementById('sticky-qty');
  const stickyVal = document.getElementById('sticky-val');
  if (stickyQty) stickyQty.textContent = qtyTotal + ' db';
  if (stickyVal) stickyVal.innerHTML = total + '<span style="font-size:.72em;margin-left:3px;color:var(--gold-light)">lej</span>';
}

async function saveOrder() {
  // Save orders to Supabase
  const upserts = [];
  getDays(selectedYear, selectedMonth).forEach(d => {
    const day = d.getDate();
    const key = getOrderKey(currentUser.id, selectedYear, selectedMonth, day);
    if(appData.orders[key]) {
      Object.entries(appData.orders[key]).forEach(([pid, qty]) => {
        const product_id = parseInt(pid);
        const quantity = Number(qty);
        if (!Number.isInteger(product_id) || !Number.isFinite(quantity) || quantity <= 0) return;
        upserts.push({
          client_id: currentUser.id,
          year: selectedYear,
          month: selectedMonth,
          day: day,
          product_id: product_id,
          quantity: quantity
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
      // v2.53.21 FIX: CSAK a vevő által ténylegesen módosított (dirty) napokat reseteljük,
      // ne az összes rendelt napot (különben a korábban jóváhagyott napok is visszaesnének).
      const affectedDays = [...new Set(upserts.map(u => u.day))].filter(day =>
        _dirtyOrderDays.has(getOrderKey(currentUser.id, selectedYear, selectedMonth, day)));
      for (const day of affectedDays) {
        const key = getOrderKey(currentUser.id, selectedYear, selectedMonth, day);
        const st = (appData.orderStatus && appData.orderStatus[key]) || {};
        if (st.status === 'confirmed' || st.status === 'modified' || st.status === 'cancelled') {
          const newRow = { client_id: currentUser.id, year: selectedYear, month: selectedMonth, day,
            status: 'pending', admin_note: st.admin_note || null };
          await sb.upsert('order_status', newRow, 'client_id,year,month,day');
          if (!appData.orderStatus) appData.orderStatus = {};
          appData.orderStatus[key] = { ...st, status: 'pending' };
        }
      }
      // elmentett napok dirty-jelének törlése (már szinkronban a DB-vel)
      [...new Set(upserts.map(u => u.day))].forEach(day =>
        _dirtyOrderDays.delete(getOrderKey(currentUser.id, selectedYear, selectedMonth, day)));
      // Admin értesítés új/módosított rendelésről (60s throttle, hogy ne spammeljen)
      try {
        const now = Date.now();
        if (typeof sendPushToClient === 'function' && (now - _lastAdminOrderPush > 60000)) {
          _lastAdminOrderPush = now;
          const vn = currentUser?.name || 'Vevő';
          sendPushToClient('ADMIN', 'new_order', '🛒 Új rendelés',
            `${vn} rendelt — ${selectedYear}. ${selectedMonth + 1}. hónap`).catch(()=>{});
        }
      } catch(_) {}
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
  if (!(await confirmDialog('Biztosan törlöd az összes rendelést ebben a hónapban?'))) return;
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

function mobChangeQty(day, pid, delta) {
  const key = getOrderKey(currentUser.id, selectedYear, selectedMonth, day);
  if(!appData.orders[key]) appData.orders[key] = {};
  const current = appData.orders[key][pid] || 0;
  const newVal = Math.max(0, current + delta);
  if(newVal > 0) appData.orders[key][pid] = newVal;
  else {
    delete appData.orders[key][pid];
    // C3 fix: Delete from Supabase immediately on qty=0 (prevent data corruption)
    if (current > 0) {
      sb.delete('orders',
        `client_id=eq.${currentUser.id}&year=eq.${selectedYear}&month=eq.${selectedMonth}&day=eq.${day}&product_id=eq.${pid}`
      ).catch(e => console.warn('qty0 delete:', e.message));
    }
  }
  if(Object.keys(appData.orders[key]).length === 0) delete appData.orders[key];
  markOrderDirty(day);

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
  // Unified renderer adapts via CSS - just re-render whatever view is active
  renderOrderTable();
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

// U1: Copy previous month's order pattern by weekday
// Logic: for each baking day this month, copy the order from the previous month's
// LAST baking day matching the same weekday. Current month baking days that have
// no matching weekday source are left empty and reported in a persistent banner.
