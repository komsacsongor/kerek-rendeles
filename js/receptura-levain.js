// ===== LEVAIN DAILY =====
function getBakingDaysRange(fromDate, numDays) {
  const bakingDef = (R.settings && R.settings.bakingDaysDefault) || JSON.parse(localStorage.getItem('kerek_admin_data') || '{}').bakingDaysDefault || DEFAULT_BAKING_DAYS;
  const result = [];
  const d = new Date(fromDate);
  d.setHours(0,0,0,0);
  for(let i = 0; i < numDays; i++) {
    const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
    // Build date string using LOCAL date parts (no UTC conversion)
    const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const cal = (JSON.parse(localStorage.getItem('kerek_admin_data')||'{}').bakingCalendar||{})[`${y}-${m}`] || {extra:[],removed:[]};
    const isDefault = bakingDef.includes(d.getDay());
    const isExtra = cal.extra?.includes(ds);
    const isRemoved = cal.removed?.includes(ds);
    if((isDefault || isExtra) && !isRemoved) result.push(new Date(d));
    d.setDate(d.getDate()+1);
  }
  return result;
}

function initLevainDaily() {
  const now = new Date();
  const days = getBakingDaysRange(now, 30);
  const DAYS_HU = ['Vas','Hét','Kedd','Sze','Csüt','Pén','Szo'];
  const MONTHS_SHORT = ['Jan','Feb','Már','Ápr','Máj','Jún','Júl','Aug','Sze','Okt','Nov','Dec'];
  document.getElementById('levain-day-selector').innerHTML = days.map(d =>
    `<label style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border:1.5px solid var(--border);border-radius:20px;cursor:pointer;font-size:0.82rem;background:white;transition:all 0.2s">
      <input type="checkbox" value="${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}" style="accent-color:var(--teal)">
      ${DAYS_HU[d.getDay()]} ${d.getDate()}. ${MONTHS_SHORT[d.getMonth()]}
    </label>`
  ).join('') || '<p class="text-soft text-sm">Nincs sütési nap beállítva (alap: kedd + péntek).</p>';
}

async function calcLevainDaily() {
  const selected = [...document.querySelectorAll('#levain-day-selector input:checked')].map(i=>i.value);
  if(selected.length === 0) { alert('Válassz legalább egy napot!'); return; }

  // Show loading
  document.getElementById('levain-daily-result').innerHTML = '<p style="color:var(--teal);padding:20px">⏳ Adatok betöltése...</p>';

  // Load from Supabase
  let mainData = JSON.parse(localStorage.getItem('kerek_admin_data') || '{}');
  try {
    const [clients, products, ordersRaw] = await Promise.all([
      sb.query('clients'),
      sb.query('products'),
      sb.query('orders'),
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

    // Sum all orders for this day
    let totalLevainNeeded = 0;
    R.recipes.forEach(recipe => {
      // Check all clients' orders for this recipe on this day
      (mainData.clients||[]).forEach(c => {
        // Order key format: clientId-year-monthIndex(0-based)-day
        const key = `${c.id}-${y}-${m}-${day}`;
        const order = mainData.orders?.[key];
        if(!order) return;
        // Find product matching recipe
        (mainData.products||[]).forEach(p => {
          if(!order[p.id]) return;
          // Match recipe to product by name (approximate)
          const recipeMatch = R.recipes.find(rec =>
            rec.name.toLowerCase().includes(p.name.toLowerCase().slice(0,8)) ||
            p.name.toLowerCase().includes(rec.name.toLowerCase().slice(0,8))
          );
          if(!recipeMatch) return;
          const qty = order[p.id];
          const rawWeight = calcRawWeight(recipeMatch, qty);
          const scale = rawWeight / recipeMatch.basePortion;
          totalLevainNeeded += recipeMatch.levainAmount * scale;
        });
      });
    });

    if(totalLevainNeeded === 0) {
      const dateDisplayEmpty = `${DAYS_HU[d.getDay()]}, ${dy}. ${MONTHS_HU[dm-1]} ${dd}.`;
    html += `<div class="card mb-16"><div class="card-head"><div class="card-title">🧫 ${dateDisplayEmpty}</div></div><div class="card-body"><p class="text-soft text-sm">Nincs rendelés erre a napra.</p></div></div>`;
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

  document.getElementById('levain-daily-result').innerHTML = html;
}
