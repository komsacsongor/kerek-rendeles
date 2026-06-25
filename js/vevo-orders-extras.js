// =============================================================
// KEREK Megrendelő – Megrendelő EXTRA funkciók (PDF, copy last order, banner) (v2.32.0 M9 bontás)
// Eredetileg: js/vevo-orders.js (921 sor)
// =============================================================


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
  <title>KEREK Rendeles ${esc(currentUser.name)} ${selectedYear}</title>
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
  <p style="color:#666;font-size:12px;margin-bottom:16px">Vevő: <b>${esc(currentUser.name)}</b> &nbsp;|&nbsp; Generálva: ${new Date().toLocaleDateString('hu-HU')}</p>
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


async function copyLastOrder() {
  if (!currentUser) return;
  const targetDays = getDays(selectedYear, selectedMonth).filter(d => isBakingDay(d));
  if (targetDays.length === 0) { toast('Nincs sütési nap ebben a hónapban.', true); return; }

  // Fetch previous month's full orders
  const prevM = selectedMonth === 0 ? 11 : selectedMonth - 1;
  const prevY = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
  const MONTHS_HU = ['Január','Február','Március','Április','Május','Június','Július','Augusztus','Szeptember','Október','November','December'];

  let prevOrders = [];
  try {
    prevOrders = await sb.query('orders', {
      filter: `client_id=eq.${currentUser.id}&year=eq.${prevY}&month=eq.${prevM}`,
      order: 'day.asc', limit: 200
    }) || [];
  } catch(e) {
    toast('⚠️ Nem sikerült lekérdezni a múlt havi rendelést: ' + e.message, true);
    return;
  }
  if (prevOrders.length === 0) {
    toast(`⚠️ Nincs ${MONTHS_HU[prevM]} havi rendelésed, amit átemelhetnénk.`, true);
    return;
  }

  // Group prev month orders by day → {dayNum: {pid: qty}}
  const prevByDay = {};
  prevOrders.forEach(o => {
    if (!prevByDay[o.day]) prevByDay[o.day] = {};
    prevByDay[o.day][o.product_id] = o.quantity;
  });

  // Build weekday → last day mapping in prev month
  // (we want LAST instance of each weekday, since it's most recent intent)
  const prevDaysInMonth = new Date(prevY, prevM+1, 0).getDate();
  const lastByDow = {}; // {dow: dayNum}
  for (let dayNum = 1; dayNum <= prevDaysInMonth; dayNum++) {
    if (!prevByDay[dayNum]) continue;
    const dow = new Date(prevY, prevM, dayNum).getDay();
    lastByDow[dow] = dayNum; // overwrites = keeps last occurrence
  }

  // Pre-compute mapping result for confirm dialog
  const mappedDays = [];
  const unmappedDays = [];
  targetDays.forEach(td => {
    const dow = td.getDay();
    if (lastByDow[dow] !== undefined) mappedDays.push(td);
    else unmappedDays.push(td);
  });

  if (mappedDays.length === 0) {
    showCopyResultBanner(0, targetDays.length, MONTHS_HU[prevM], 'NO_MATCH');
    toast(`⚠️ A múlt havi (${MONTHS_HU[prevM]}) rendelésed sütési napjai nem egyeznek a mostani sütési napokkal.`, true);
    return;
  }

  const confirmMsg = `Átemelem a ${MONTHS_HU[prevM]} havi rendelési mintát:\n\n` +
    `✅ ${mappedDays.length} nap kap rendelést (hét napja szerint)\n` +
    (unmappedDays.length > 0 ? `⚠️ ${unmappedDays.length} nap üres marad (nincs múlt havi megfelelő nap)\n` : '') +
    `\nFolytatod?`;
  if (!(await confirmDialog(confirmMsg))) return;

  // Apply mapping
  mappedDays.forEach(td => {
    const dow = td.getDay();
    const srcDay = lastByDow[dow];
    const tk = getOrderKey(currentUser.id, selectedYear, selectedMonth, td.getDate());
    appData.orders[tk] = {...prevByDay[srcDay]};
    if (typeof markOrderDirty === 'function') markOrderDirty(td.getDate());
  });

  // Show persistent banner about unmapped days (toast not enough per user request)
  showCopyResultBanner(mappedDays.length, unmappedDays.length, MONTHS_HU[prevM], unmappedDays.length > 0 ? 'PARTIAL' : 'OK', unmappedDays);
  renderOrderTable();
  updateHeroTotal();
}

// Persistent banner shown above the order list after a copy operation.
// Replaces the toast (which disappears too quickly) for this important info.

function showCopyResultBanner(mappedCount, unmappedCount, monthName, mode, unmappedDays) {
  const wrap = document.getElementById('copy-result-banner');
  if (!wrap) return;
  if (mode === 'NO_MATCH') {
    wrap.innerHTML = `<div class="copy-banner error">
      <span class="copy-banner-icon">⚠️</span>
      <div>
        <strong>${monthName} havi minta nem alkalmazható.</strong>
        A múlt havi sütési napok hét napjai nem egyeznek a mostani sütési napokkal.
      </div>
      <button onclick="dismissCopyBanner()" aria-label="Bezár">✕</button>
    </div>`;
    return;
  }
  if (mode === 'OK') {
    wrap.innerHTML = `<div class="copy-banner success">
      <span class="copy-banner-icon">✅</span>
      <div>
        <strong>${monthName} havi rendelési minta átemelve!</strong>
        ${mappedCount} nap kapott rendelést. Ellenőrizd és mentsd a végén.
      </div>
      <button onclick="dismissCopyBanner()" aria-label="Bezár">✕</button>
    </div>`;
    return;
  }
  // PARTIAL
  const DAYS_HU = ['Vasárnap','Hétfő','Kedd','Szerda','Csütörtök','Péntek','Szombat'];
  const unmappedList = (unmappedDays||[]).map(d => `${d.getDate()}. ${DAYS_HU[d.getDay()]}`).join(', ');
  wrap.innerHTML = `<div class="copy-banner warning">
    <span class="copy-banner-icon">⚠️</span>
    <div>
      <strong>${monthName} havi minta részben átemelve.</strong>
      ${mappedCount} napra rendelést kaptál a hét napja szerint.
      <br>
      <span style="margin-top:4px;display:block"><strong>${unmappedCount} nap üres marad</strong> – ezekre múlt hónapban nem volt megfelelő sütési nap, kérjük rendeld meg külön:</span>
      <em style="color:var(--gold-dark);font-weight:600">${unmappedList}</em>
    </div>
    <button onclick="dismissCopyBanner()" aria-label="Bezár">✕</button>
  </div>`;
}

function dismissCopyBanner() {
  const wrap = document.getElementById('copy-result-banner');
  if (wrap) wrap.innerHTML = '';
}
