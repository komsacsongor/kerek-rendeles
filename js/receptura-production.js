// ===== PRODUCTION PREP =====
let _prodSelectedMonth = null; // {year, month} aktuális szelektor állapot

async function initProductionPrep() {
  const now = new Date();
  _prodSelectedMonth = { year: now.getFullYear(), month: now.getMonth() };
  await renderProdMonthSelector();
  renderStockAlerts();
}

async function renderProdMonthSelector() {
  const { year, month } = _prodSelectedMonth;
  const MONTHS_HU = ['Január','Február','Március','Április','Május','Június',
                      'Július','Augusztus','Szeptember','Október','November','December'];

  // Load orders for this month from Supabase
  let ordersForMonth = [];
  try {
    ordersForMonth = await sb.query('orders', {
      filter: `year=eq.${year},month=eq.${month}`,
      limit: 5000
    });
  } catch(e) {}

  // Days that have orders
  const daysWithOrders = [...new Set((ordersForMonth||[]).map(o=>o.day))].sort((a,b)=>a-b);

  // Baking days in this month
  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0).getDate();
  const bakingDef = (R.settings && R.settings.bakingDaysDefault) || DEFAULT_BAKING_DAYS || [2,5,6];
  const bakingDays = [];
  for (let d = 1; d <= endOfMonth; d++) {
    const dow = new Date(year, month, d).getDay();
    if (bakingDef.includes(dow)) bakingDays.push(d);
  }

  // Month nav
  const prevM = month === 0 ? {y: year-1, m: 11} : {y: year, m: month-1};
  const nextM = month === 11 ? {y: year+1, m: 0} : {y: year, m: month+1};

  let html = `<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
    <button onclick="_prodSelectedMonth={year:${prevM.y},month:${prevM.m}};renderProdMonthSelector()" class="btn btn-ghost btn-sm">◀</button>
    <span style="font-weight:700;font-size:1rem;color:var(--teal-dark)">${MONTHS_HU[month]} ${year}</span>
    <button onclick="_prodSelectedMonth={year:${nextM.y},month:${nextM.m}};renderProdMonthSelector()" class="btn btn-ghost btn-sm">▶</button>
    <span style="font-size:0.78rem;color:var(--text-soft)">${daysWithOrders.length} nap rendeléssel</span>
  </div>`;

  if (bakingDays.length === 0) {
    html += '<p class="text-soft text-sm">Nincs sütési nap ebben a hónapban.</p>';
  } else {
    const DAYS_HU = ['V','H','K','Sz','Cs','P','Szo'];
    const MONTHS_SHORT = ['jan','feb','már','ápr','máj','jún','júl','aug','sze','okt','nov','dec'];
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap">';
    bakingDays.forEach(d => {
      const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const hasOrder = daysWithOrders.includes(d);
      const dow = new Date(year, month, d).getDay();
      html += `<label style="display:inline-flex;align-items:center;gap:5px;padding:6px 12px;
        border:1.5px solid ${hasOrder ? 'var(--teal)' : 'var(--border)'};
        border-radius:20px;cursor:pointer;font-size:0.8rem;
        background:${hasOrder ? 'var(--teal-pale)' : 'white'};
        transition:all 0.2s" title="${hasOrder ? 'Van rendelés' : 'Nincs rendelés'}">
        <input type="checkbox" value="${dateStr}" ${hasOrder ? 'checked' : ''} style="accent-color:var(--teal)">
        ${DAYS_HU[dow]} ${d}. ${hasOrder ? '📦' : ''}
      </label>`;
    });
    html += '</div>';

    if (daysWithOrders.length === 0) {
      html += '<p class="text-soft text-sm" style="margin-top:8px">Ebben a hónapban nincs rendelés a sütési napokon.</p>';
    }
  }

  document.getElementById('prod-day-selector').innerHTML = html;
}

async function calcProductionPrep() {
  const selected = [...document.querySelectorAll('#prod-day-selector input:checked')].map(i=>i.value);
  if(selected.length === 0) { toast('Válassz legalább egy napot!', true); return; }

  const DAYS_HU = ['Vasárnap','Hétfő','Kedd','Szerda','Csütörtök','Péntek','Szombat'];
  const MONTHS_HU = ['jan','feb','már','ápr','máj','jún','júl','aug','sze','okt','nov','dec'];

  const needs = {};       // ingId -> {name, total, cost, subType}
  const dayBreakdown = {}; // dateStr -> { recipeId -> pieces }
  const recipeBreakdown = {}; // recipeId -> { dateStr -> pieces, totalPieces, rawWeight }

  const [allOrders, allStatuses, allClients] = await Promise.all([
    sb.query('orders', { limit: 5000 }),
    sb.query('order_status', { limit: 2000 }),
    sb.query('clients', { limit: 500 }),
  ]);

  const statusMap = {};
  (allStatuses||[]).forEach(s => { statusMap[`${s.client_id}-${s.year}-${s.month}-${s.day}`] = s.status; });

  const orderMap = {};
  (allOrders||[]).forEach(o => {
    const k = `${o.client_id}-${o.year}-${o.month}-${o.day}`;
    if(!orderMap[k]) orderMap[k] = {};
    orderMap[k][o.product_id] = (orderMap[k][o.product_id]||0) + o.quantity;
  });

  const activeRecipes = R.recipes.filter(r => !r.archived);

  selected.forEach(dateStr => {
    const [dy, dm, dd] = dateStr.split('-').map(Number);
    const d = new Date(dy, dm-1, dd);
    const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
    dayBreakdown[dateStr] = {};

    activeRecipes.forEach(recipe => {
      let totalPieces = 0;
      (allClients||[]).forEach(c => {
        const k = `${c.id}-${y}-${m}-${day}`;
        if (statusMap[k] === 'cancelled') return;
        const order = orderMap[k];
        if(!order || !recipe.product_id || !order[recipe.product_id]) return;
        totalPieces += order[recipe.product_id];
      });
      if(totalPieces === 0) return;

      dayBreakdown[dateStr][recipe.id] = (dayBreakdown[dateStr][recipe.id]||0) + totalPieces;

      // Per-recipe totals
      if (!recipeBreakdown[recipe.id]) recipeBreakdown[recipe.id] = { recipe, totalPieces: 0, rawWeight: 0, days: {} };
      recipeBreakdown[recipe.id].totalPieces += totalPieces;
      recipeBreakdown[recipe.id].days[dateStr] = (recipeBreakdown[recipe.id].days[dateStr]||0) + totalPieces;

      const rawWeight = calcRawWeight(recipe, totalPieces);
      recipeBreakdown[recipe.id].rawWeight += rawWeight;

      const scale = rawWeight / recipe.basePortion;

      // Ingredient needs (teljes rendelési igény)
      const lev = calcLevain(recipe.levainAmount * scale);
      addNeed(needs, 4, lev.starter);
      addNeed(needs, 9, lev.flour);
      addNeed(needs, 1, lev.water);

      [...(recipe.dryIngredients||[]), ...(recipe.wetIngredients||[])].forEach(ing => {
        if(ing.ingredientId) addNeed(needs, ing.ingredientId, ing.amount * scale);
      });
    });
  });

  function addNeed(needs, ingId, amount) {
    if(!needs[ingId]) {
      const ing = getIng(ingId);
      needs[ingId] = {name: ing?.name||'?', ingId, total:0, cost:0, subType: ing?.subType||'other_dry'};
    }
    needs[ingId].total += amount;
    needs[ingId].cost += calcIngCost(ingId, amount);
  }

  const hasAnyOrders = Object.values(dayBreakdown).some(day => Object.keys(day).length > 0);
  if(!hasAnyOrders) {
    document.getElementById('prod-prep-result').innerHTML = '<p class="text-soft text-sm">Nincs rendelés a kiválasztott napokra.</p>';
    return;
  }

  let html = '';

  // === PER-RECIPE BREAKDOWN ===
  html += `<div class="card mb-16"><div class="card-head"><div class="card-title">📋 Termékenkénti összesítő</div></div><div class="card-body-np">`;
  Object.values(recipeBreakdown).forEach(({ recipe, totalPieces, rawWeight, days }) => {
    html += `<div style="padding:12px 16px;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div style="font-weight:700;font-size:0.9rem;color:var(--teal-dark)">${esc(recipe.name)}</div>
        <div style="display:flex;gap:12px">
          <span class="badge badge-teal" style="font-size:0.8rem">${totalPieces} db</span>
          <span class="badge badge-gold" style="font-size:0.8rem">${(rawWeight/1000).toFixed(2)} kg nyers</span>
        </div>
      </div>`;
    // Per-day breakdown for this recipe
    html += `<div style="display:flex;gap:8px;flex-wrap:wrap">`;
    Object.entries(days).sort().forEach(([ds, pieces]) => {
      const [dy,dm,dd] = ds.split('-').map(Number);
      const dow = new Date(dy,dm-1,dd).getDay();
      const DAYS_HU_S = ['V','H','K','Sz','Cs','P','Szo'];
      html += `<span style="font-size:0.75rem;padding:2px 8px;background:var(--bg-soft);border-radius:12px;color:var(--teal-dark)">
        ${DAYS_HU_S[dow]} ${dd}.: <b>${pieces} db</b>
      </span>`;
    });
    html += `</div></div>`;
  });
  html += `</div></div>`;

  // === INGREDIENT NEEDS ===
  if(Object.keys(needs).length > 0) {
    html += `<div class="card mb-16"><div class="card-head"><div class="card-title">🏭 Összes nyersanyagigény (${selected.length} napra)</div></div><div class="card-body-np">`;
    const groups = {flour:[], other_dry:[], wet:[], starter:[]};
    Object.values(needs).forEach(n => { if(!groups[n.subType]) groups[n.subType]=[]; groups[n.subType].push(n); });
    let grandCost = 0;
    ['flour','other_dry','wet','starter'].forEach(st => {
      if(!groups[st] || groups[st].length === 0) return;
      html += `<div style="padding:10px 16px;background:${st==='flour'?'#fffbf0':st==='wet'?'#eff8ff':st==='starter'?'var(--teal-pale)':'#f5f0fb'};border-bottom:1px solid var(--border)">
        <div style="font-weight:600;font-size:0.82rem;color:var(--teal-dark);margin-bottom:6px">${subTypeLabel(st)}</div>`;
      groups[st].sort((a,b)=>b.total-a.total).forEach(n => {
        const ing = getIng(n.ingId);
        const stock = getTotalStock(ing);
        const enough = stock >= Math.round(n.total);
        const critical = !enough && stock > (ing?.criticalStock||0);
        grandCost += n.cost;
        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(0,0,0,0.04)">
          <span style="font-size:0.82rem">${n.name}</span>
          <div style="display:flex;gap:12px;align-items:center">
            <span style="font-weight:700;color:var(--teal-dark)">${Math.round(n.total).toLocaleString()} g</span>
            <span style="font-size:0.75rem;color:var(--gold-dark)">${n.cost.toFixed(2)} lej</span>
            <span class="badge ${enough?'badge-green':critical?'badge-gold':'badge-red'}" style="font-size:0.68rem">
              ${enough?'✓ Elegendő':critical?'⚠ Kritikus':'✗ Hiány'}
            </span>
          </div>
        </div>`;
      });
      html += `</div>`;
    });
    html += `<div style="padding:14px 16px;background:var(--teal-pale);display:flex;justify-content:space-between;font-weight:700">
      <span>Összes nyersanyagköltség</span>
      <span style="color:var(--gold-dark);font-family:'Fraunces',serif">${grandCost.toFixed(2)} lej</span>
    </div></div></div>`;
  } else {
    html += `<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;color:#92400e;font-size:0.85rem;margin-bottom:16px">
      ⚠️ Az összetevők nincsenek az alapanyag listához kötve. A receptúrában állítsd be az összetevők <b>Alapanyag</b> hivatkozásait.</div>`;
  }

  document.getElementById('prod-prep-result').innerHTML = html;
  window._lastProductionNeeds = needs;
  window._lastProductionDays = selected;
}
