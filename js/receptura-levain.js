
let _levainSelectedMonth = null;

function initLevainDaily() {
  const now = new Date();
  _levainSelectedMonth = { year: now.getFullYear(), month: now.getMonth() };
  renderLevainMonthSelector();
}

async function renderLevainMonthSelector() {
  const { year, month } = _levainSelectedMonth;
  const MONTHS_SHORT = ['Jan','Feb','Már','Ápr','Máj','Jún','Júl','Aug','Sze','Okt','Nov','Dec'];
  const DAYS_HU = ['V','H','K','Sz','Cs','P','Szo'];

  // Load orders for this month
  let ordersForMonth = [];
  try {
    ordersForMonth = await sb.query('orders', {limit:5000,
      filter: `year=eq.${year}&month=eq.${month}`,
      limit: 5000
    });
  } catch(e) {}

  const daysWithOrders = [...new Set((ordersForMonth||[]).map(o=>o.day))].sort((a,b)=>a-b);

  // Baking days in this month
  const bakingDef = (R.settings && R.settings.bakingDaysDefault) || DEFAULT_BAKING_DAYS;
  const endOfMonth = new Date(year, month + 1, 0).getDate();
  const bakingDaysWithOrders = [];
  for (let d = 1; d <= endOfMonth; d++) {
    const dow = new Date(year, month, d).getDay();
    if (bakingDef.includes(dow) && daysWithOrders.includes(d)) bakingDaysWithOrders.push(d);
  }

  // Admin-style month tabs
  const monthNav = document.getElementById('levain-month-selector');
  const MONTHS_FULL_L = ['Január','Február','Március','Április','Május','Június','Július','Augusztus','Szeptember','Október','November','December'];
  if (monthNav) monthNav.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
      <button onclick="_levainSelectedMonth={year:${year-1},month:${month}};renderLevainMonthSelector()"
        style="padding:5px 12px;border:1.5px solid var(--border);border-radius:8px;background:white;cursor:pointer;font-size:0.82rem;font-family:'Kodchasan',sans-serif;color:var(--teal-dark)">◀ ${year-1}</button>
      <span style="font-weight:700;color:var(--teal-dark);font-size:1rem;min-width:44px;text-align:center">${year}</span>
      <button onclick="_levainSelectedMonth={year:${year+1},month:${month}};renderLevainMonthSelector()"
        style="padding:5px 12px;border:1.5px solid var(--border);border-radius:8px;background:white;cursor:pointer;font-size:0.82rem;font-family:'Kodchasan',sans-serif;color:var(--teal-dark)">${year+1} ▶</button>
    </div>
    <div style="display:flex;gap:3px;margin-bottom:10px;width:100%">
      ${MONTHS_FULL_L.map((m, i) => `<button onclick="_levainSelectedMonth={year:${year},month:${i}};renderLevainMonthSelector()"
        style="flex:1;padding:6px 2px;border-radius:14px;border:1.5px solid ${i===month?'var(--teal)':'var(--border)'};
        background:${i===month?'var(--teal-pale)':'white'};color:${i===month?'var(--teal-dark)':'var(--text-soft)'};
        font-weight:${i===month?'700':'400'};font-size:0.72rem;cursor:pointer;font-family:'Kodchasan',sans-serif;min-width:0;text-align:center">${m}</button>`).join('')}
    </div>`;
  // Day selector - only days with orders
  const dayEl = document.getElementById('levain-day-selector');
  if (!dayEl) return;
  if (bakingDaysWithOrders.length === 0) {
    dayEl.innerHTML = '<p class="text-soft text-sm">Ebben a hónapban nincs rendelés sütési napokon.</p>';
    return;
  }
  dayEl.innerHTML = bakingDaysWithOrders.map(d => {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dow = new Date(year, month, d).getDay();
    return `<label style="display:inline-flex;align-items:center;gap:5px;padding:6px 12px;
      border:1.5px solid var(--teal);border-radius:20px;cursor:pointer;font-size:0.82rem;
      background:var(--teal-pale);transition:all 0.2s">
      <input type="checkbox" value="${dateStr}" style="accent-color:var(--teal)">
      ${DAYS_HU[dow]} ${d}. 📦
    </label>`;
  }).join('');
}

async function calcLevainDaily() {
  const selected = [...document.querySelectorAll('#levain-day-selector input:checked')].map(i=>i.value);
  if(selected.length === 0) { await alertDialog('Válassz legalább egy napot!'); return; }

  // Show loading
  document.getElementById('levain-daily-result').innerHTML = '<p style="color:var(--teal);padding:20px">⏳ Adatok betöltése...</p>';

  // Load from Supabase
  let mainData = JSON.parse(localStorage.getItem('kerek_admin_data') || '{}');
  try {
    const [clients, products, ordersRaw] = await Promise.all([
      sb.query('clients', {limit:5000}),
      sb.query('products', {limit:5000}),
      sb.query('orders', {limit:5000}),
    ]);
    mainData.clients = clients;
    mainData.products = products;
    mainData.orders = {};
    ordersRaw.forEach(o => {
      const key = `${o.client_id}-${o.year}-${o.month}-${o.day}`;
      if(!mainData.orders[key]) mainData.orders[key] = {};
      mainData.orders[key][o.product_id] = o.quantity;
    });
  } catch(e) { console.warn('Supabase hiba:', e.message); }

  const DAYS_HU = ['Vasárnap','Hétfő','Kedd','Szerda','Csütörtök','Péntek','Szombat'];
  const MONTHS_HU = ['január','február','március','április','május','június','július','augusztus','szeptember','október','november','december'];

  let html = '';
  let grandTotal = {levain:0, starter:0, flour:0, water:0, refillFlour:0, refillWater:0};

  selected.forEach(dateStr => {
    // Parse date without timezone issues: "2026-04-30" -> local date
    const [dy, dm, dd] = dateStr.split('-').map(Number);
    const d = new Date(dy, dm-1, dd);
    const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();

    // Sum all orders for this day + per-product breakdown
    let totalLevainNeeded = 0;
    const productBreakdown = []; // [{name, qty, levainG}]
    (mainData.clients||[]).forEach(c => {
      const key = `${c.id}-${y}-${m}-${day}`;
      const order = mainData.orders?.[key];
      if(!order) return;
      Object.entries(order).forEach(([prodId, qty]) => {
        if(!qty) return;
        const pid = parseInt(prodId);
        const prod = (mainData.products||[]).find(p => p.id === pid);
        const recipe = R.recipes.find(r => r.product_id === pid) ||
          (prod ? R.recipes.find(r =>
            r.name.toLowerCase().includes((prod.name||'').toLowerCase().slice(0,6)) ||
            (prod.name||'').toLowerCase().includes(r.name.toLowerCase().slice(0,6))
          ) : null);
        if(!recipe || !recipe.levainAmount) return;
        const scale = calcScaleFactor(recipe, qty);
        const levainG = Math.round(recipe.levainAmount * scale);
        totalLevainNeeded += levainG;
        // Accumulate per product (merge same recipe)
        const existing = productBreakdown.find(p => p.recipeId === recipe.id);
        if (existing) { existing.qty += qty; existing.levainG += levainG; }
        else productBreakdown.push({ recipeId: recipe.id, name: recipe.name, qty, levainG });
      });
    });

    if(totalLevainNeeded === 0) {
      const dateDisplayEmpty = `${DAYS_HU[d.getDay()]}, ${dy}. ${MONTHS_HU[dm-1]} ${dd}.`;
    html += `<div class="card mb-16"><div class="card-head"><div class="card-title">📅 ${dateDisplayEmpty}</div><span class="badge" style="background:var(--bg-soft);color:var(--text-soft)">Nincs levain rendelés</span></div><div class="card-body"><p class="text-soft text-sm">Erre a napra nincs rendelés, vagy a recepteknél nincs levain mennyiség beállítva.</p></div></div>`;
      return;
    }

    totalLevainNeeded = Math.round(totalLevainNeeded);
    const lev = calcLevain(totalLevainNeeded);
    const refill = calcRefill(lev.starter);

    grandTotal.levain += totalLevainNeeded;
    grandTotal.starter += lev.starter;
    grandTotal.flour += lev.flour;
    grandTotal.water += lev.water;
    grandTotal.refillFlour += refill.flour;
    grandTotal.refillWater += refill.water;

    const dateDisplay = `${DAYS_HU[d.getDay()]}, ${dy}. ${MONTHS_HU[dm-1]} ${dd}.`;
    // Product breakdown HTML
    const prodBreakdownHtml = productBreakdown.length > 0
      ? `<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
          <div style="font-size:0.78rem;font-weight:700;color:var(--teal-dark);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.04em">Termékenkénti lebontás</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
            ${productBreakdown.sort((a,b)=>b.levainG-a.levainG).map(p => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:5px 10px;background:var(--teal-pale);border-radius:8px;font-size:0.82rem">
                <span style="color:var(--teal-dark);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:8px">${esc(p.name)}</span>
                <div style="display:flex;gap:8px;flex-shrink:0;align-items:center">
                  <span style="color:var(--text-soft);font-size:0.75rem">${p.qty} db</span>
                  <span style="font-weight:700;color:var(--teal-dark)">${p.levainG.toLocaleString()} g</span>
                </div>
              </div>`).join('')}
            ${productBreakdown.length % 2 !== 0 ? '<div></div>' : ''}
          </div>
        </div>`
      : '';
    html += `<div class="card mb-16">
      <div class="card-head"><div class="card-title">🧫 ${dateDisplay}</div><span class="badge badge-gold">${totalLevainNeeded}g levain</span></div>
      <div class="card-body">
        <div class="levain-box" style="margin:0">
          <h3>Levain elkészítése</h3>
          <div class="levain-grid">
            <div>
              <div class="levain-col-title">Levain (${totalLevainNeeded}g)</div>
              <div class="levain-line"><span>Kovász (33%)</span><span class="levain-val">${lev.starter}g</span></div>
              <div class="levain-line"><span>Víz (30%)</span><span class="levain-val">${lev.water}g</span></div>
              <div class="levain-line"><span>Barnarizs liszt (37%)</span><span class="levain-val">${lev.flour}g</span></div>
            </div>
            <div>
              <div class="levain-col-title">Visszatöltés üvegbe</div>
              <div class="levain-line"><span>Barnarizs liszt (52%)</span><span class="levain-val">${refill.flour}g</span></div>
              <div class="levain-line"><span>Víz (48%)</span><span class="levain-val">${refill.water}g</span></div>
            </div>
          </div>
        </div>
        ${prodBreakdownHtml}
      </div>
    </div>`;
  });

  // Grand total if multiple days
  if(selected.length > 1) {
    html += `<div style="background:var(--teal-dark);border-radius:14px;padding:20px;color:var(--cream)">
      <div style="font-family:'Fraunces',serif;color:var(--gold-light);font-size:1rem;margin-bottom:14px;font-style:italic">📊 Összesített levain igény (${selected.length} nap)</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;font-size:0.85rem">
        <div>
          <div style="color:var(--teal-mid);font-size:0.7rem;text-transform:uppercase;margin-bottom:6px">Levain összesen</div>
          <div>Kovász: <b style="color:var(--gold)">${grandTotal.starter}g</b></div>
          <div>Víz: <b style="color:var(--gold)">${grandTotal.water}g</b></div>
          <div>Barnarizs liszt: <b style="color:var(--gold)">${grandTotal.flour}g</b></div>
        </div>
        <div>
          <div style="color:var(--teal-mid);font-size:0.7rem;text-transform:uppercase;margin-bottom:6px">Visszatöltés összesen</div>
          <div>Barnarizs liszt: <b style="color:var(--gold)">${grandTotal.refillFlour}g</b></div>
          <div>Víz: <b style="color:var(--gold)">${grandTotal.refillWater}g</b></div>
        </div>
      </div>
    </div>`;
  }

  // Add "Levain rögzítése" button at the bottom
  const totalLevainG = grandTotal.starter + grandTotal.water + grandTotal.flour;
  if (totalLevainG > 0) {
    html += `<div style="margin-top:16px;text-align:center">
      <button onclick="recordLevainBatch(${totalLevainG})"
        style="padding:12px 28px;background:var(--teal-dark);color:var(--gold);border:none;
        border-radius:10px;font-size:0.9rem;font-weight:700;cursor:pointer;
        font-family:'Kodchasan',sans-serif">
        🧫 Levain rögzítése készletbe (${totalLevainG.toLocaleString()}g)
      </button>
      <div style="font-size:0.75rem;color:var(--text-soft);margin-top:6px">
        Ez hozzáadja a kész levaint a félkész készlethez (FIFO)
      </div>
    </div>`;
  }

  document.getElementById('levain-daily-result').innerHTML = html;
}

async function recordLevainBatch(totalG) {
  if (!(await confirmDialog(`Rögzíted ${totalG.toLocaleString()}g kész levaint a készletbe?\n\nEz bevételezésként kerül a Kész levain alapanyaghoz.`))) return;
  try {
    const today = new Date();
    const dateStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
    await sb.insert('ingredient_batches', {
      ingredient_id: 105,
      received_date: dateStr,
      qty_received_g: totalG,
      qty_remaining_g: totalG,
      price_per_g: 0,
      supplier_name: 'Saját előállítás',
      source_type: 'processing',
      notes: 'Napi levain – ' + dateStr
    });
    // Update local R.batches
    if (!R.batches) R.batches = [];
    R.batches.push({
      ingredientId: 105,
      receivedDate: dateStr,
      qtyReceivedG: totalG,
      qtyRemainingG: totalG,
      pricePerG: 0,
      supplierName: 'Saját előállítás',
      sourceType: 'processing',
    });
    // Update ingredient totalStockG
    const ing = R.ingredients?.find(i => i.id === 105);
    if (ing) ing.totalStockG = (ing.totalStockG || 0) + totalG;
    toast(`✅ ${totalG.toLocaleString()}g kész levain rögzítve!`);
  } catch(e) { toast('⚠️ Hiba: ' + e.message, true); }
}
