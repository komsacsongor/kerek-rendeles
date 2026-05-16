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
      filter: `year=eq.${year}&month=eq.${month}`,
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

  // Admin-style month selector
  const MONTHS_FULL = ['Január','Február','Március','Április','Május','Június','Július','Augusztus','Szeptember','Október','November','December'];
  let html = `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
    <button onclick="_prodSelectedMonth={year:${year-1},month:${month}};renderProdMonthSelector()"
      style="padding:5px 12px;border:1.5px solid var(--border);border-radius:8px;background:white;cursor:pointer;font-size:0.82rem;font-family:'Kodchasan',sans-serif;color:var(--teal-dark)">◀ ${year-1}</button>
    <span style="font-weight:700;color:var(--teal-dark);font-size:1rem;min-width:44px;text-align:center">${year}</span>
    <button onclick="_prodSelectedMonth={year:${year+1},month:${month}};renderProdMonthSelector()"
      style="padding:5px 12px;border:1.5px solid var(--border);border-radius:8px;background:white;cursor:pointer;font-size:0.82rem;font-family:'Kodchasan',sans-serif;color:var(--teal-dark)">${year+1} ▶</button>
  </div>
  <div style="display:flex;gap:3px;margin-bottom:10px;width:100%">
    ${MONTHS_FULL.map((m, i) => `<button onclick="_prodSelectedMonth={year:${year},month:${i}};renderProdMonthSelector()"
      style="flex:1;padding:6px 2px;border-radius:14px;border:1.5px solid ${i===month?'var(--teal)':'var(--border)'};
      background:${i===month?'var(--teal-pale)':'white'};color:${i===month?'var(--teal-dark)':'var(--text-soft)'};
      font-weight:${i===month?'700':'400'};font-size:0.72rem;cursor:pointer;font-family:'Kodchasan',sans-serif;min-width:0;text-align:center">${m}</button>`).join('')}
  </div>`;

  if (bakingDays.length === 0) {
    html += '<p class="text-soft text-sm">Nincs sütési nap ebben a hónapban.</p>';
  } else {
    const DAYS_HU = ['V','H','K','Sz','Cs','P','Szo'];
    // Only show days WITH orders
    const bakingDaysWithOrders = bakingDays.filter(d => daysWithOrders.includes(d));
    
    if (bakingDaysWithOrders.length === 0) {
      html += '';
    } else {
      html += '<div style="display:flex;gap:6px;flex-wrap:wrap">';
      bakingDaysWithOrders.forEach(d => {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dow = new Date(year, month, d).getDay();
        html += `<label style="display:inline-flex;align-items:center;gap:5px;padding:6px 12px;
          border:1.5px solid var(--teal);border-radius:20px;cursor:pointer;font-size:0.82rem;
          background:var(--teal-pale);transition:all 0.2s">
          <input type="checkbox" value="${dateStr}" checked style="accent-color:var(--teal)">
          ${DAYS_HU[dow]} ${d}. 📦
        </label>`;
      });
      html += '</div>';
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

      const rawWeight = calcRawWeight(recipe, totalPieces); // display only
      recipeBreakdown[recipe.id].rawWeight += rawWeight;

      const scale = calcScaleFactor(recipe, totalPieces); // no bake_loss

      // Levain egységként (Kész levain ID=105) – nem bontjuk víz+lisztre
      // A levain előkészítés a Napi levain igény nézetben történik
      if (recipe.levainAmount > 0) {
        addNeed(needs, 105, recipe.levainAmount * scale, 'Kész levain');
      }

      // Use allIngredients (all sub_types with ingredient_id links) if available
      const allIng = recipe.allIngredients && recipe.allIngredients.length > 0
        ? recipe.allIngredients
        : [...(recipe.dryIngredients||[]), ...(recipe.otherDryIngredients||[]),
           ...(recipe.wetIngredients||[]), ...(recipe.starterIngredients||[])];
      allIng.forEach(ing => {
        addNeed(needs, ing.ingredientId, ing.amount * scale, ing.name);
      });
    });
  });

  function addNeed(needs, ingId, amount, nameHint) {
    if (!ingId) {
      // No ID - use name as key, mark as unlinked
      const key = 'name:' + (nameHint||'?');
      if(!needs[key]) needs[key] = {name: nameHint||'?', ingId: null, total:0, cost:0, subType:'other_dry', unlinked:true};
      needs[key].total += amount;
      return;
    }
    if(!needs[ingId]) {
      const ing = getIng(ingId);
      needs[ingId] = {name: ing?.name||'?', ingId, total:0, cost:0, subType: ing?.subType||'other_dry'};
    }
    needs[ingId].total += amount;
    needs[ingId].cost += calcIngCost ? calcIngCost(ingId, amount) : 0;
  }

  const hasAnyOrders = Object.values(dayBreakdown).some(day => Object.keys(day).length > 0);
  if(!hasAnyOrders) {
    document.getElementById('prod-prep-result').innerHTML = '<p class="text-soft text-sm">Nincs rendelés a kiválasztott napokra.</p>';
    return;
  }

  let html = '';

  // === PER-RECIPE SCALED BREAKDOWN (collapsible, sub-type grouped) ===
  const DAYS_HU_S = ['V','H','K','Sz','Cs','P','Szo'];
  const SUB_LABELS = {flour:'🌾 Száraz (liszt/korpa)', other_dry:'🧂 Egyéb száraz', wet:'💧 Nedves', starter:'🧫 Kovász', raw_grain:'🌱 Nyers mag'};
  
  html += `<div class="card mb-16">
    <div class="card-head" style="display:flex;justify-content:space-between;align-items:center">
      <div class="card-title">📋 Termékenkénti recept összesítő</div>
      <div style="display:flex;gap:6px">
        <button onclick="document.querySelectorAll('.prod-recipe-body').forEach(el=>el.style.display='block')" 
          style="font-size:0.75rem;padding:3px 10px;background:var(--bg-soft);border:1px solid var(--border);border-radius:6px;cursor:pointer">Mind kinyit</button>
        <button onclick="document.querySelectorAll('.prod-recipe-body').forEach(el=>el.style.display='none')"
          style="font-size:0.75rem;padding:3px 10px;background:var(--bg-soft);border:1px solid var(--border);border-radius:6px;cursor:pointer">Mind becsuk</button>
      </div>
    </div>
    <div class="card-body-np">`;

  let recipeIdx = 0;
  Object.values(recipeBreakdown).forEach(({ recipe, totalPieces, rawWeight, days }) => {
    const basePortion = recipe.basePortion || 1000;
    // scaleFactor = no bake_loss (recipe amounts already include it)
    const scaleFactor = calcScaleFactor(recipe, totalPieces);
    const rid = 'prod-recipe-' + (recipeIdx++);
    // First recipe open, rest closed
    const openDefault = recipeIdx === 1;

    // Per-day summary
    const dayBadges = Object.entries(days).sort().map(([ds, pieces]) => {
      const [dy,dm,dd] = ds.split('-').map(Number);
      const dow = new Date(dy,dm-1,dd).getDay();
      return `<span style="font-size:0.72rem;padding:2px 8px;background:rgba(255,255,255,0.25);color:white;border-radius:10px;white-space:nowrap;font-weight:600">${DAYS_HU_S[dow]} ${dd}.: ${pieces} db</span>`;
    }).join('');

    html += `<div style="margin-bottom:8px;border-radius:10px;overflow:hidden;border:1.5px solid rgba(6,76,72,0.15);box-shadow:0 1px 4px rgba(0,0,0,0.06)">
      <div onclick="const b=document.getElementById('${rid}');const arr=b.parentElement.querySelector('.prod-arr');b.style.display=b.style.display==='none'?'block':'none';arr.textContent=b.style.display==='none'?'▾':'▴'"
        style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;cursor:pointer;
        background:#43AAA0;user-select:none">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0">
          <span style="font-weight:700;font-size:0.9rem;color:white;font-family:'Fraunces',serif">${esc(recipe.name)}</span>
          <div style="display:flex;gap:5px;flex-wrap:wrap">${dayBadges}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-shrink:0">
          <span style="background:rgba(239,176,54,0.3);color:#1a1a00;border:1px solid rgba(239,176,54,0.5);border-radius:12px;padding:2px 10px;font-size:0.78rem;font-weight:700">${totalPieces} db</span>
          <span style="background:rgba(255,255,255,0.2);color:white;border-radius:12px;padding:2px 10px;font-size:0.78rem">${(rawWeight/1000).toFixed(2)} kg nyers</span>
          <span class="prod-arr" style="color:white;font-size:0.9rem">${openDefault ? '▴' : '▾'}</span>
        </div>
      </div>
      <div id="${rid}" class="prod-recipe-body" style="display:${openDefault ? 'block' : 'none'};padding:12px 16px">`;

    // Group ingredients by sub_type
    const allIng = recipe.allIngredients && recipe.allIngredients.length > 0
      ? recipe.allIngredients
      : [...(recipe.dryIngredients||[]), ...(recipe.otherDryIngredients||[]),
         ...(recipe.wetIngredients||[]), ...(recipe.starterIngredients||[])];

    // Levain: egyetlen "Kész levain" sor (nem bontjuk víz+liszt összetevőkre)
    // A levain előkészítés külön flow (Napi levain igény nézet)
    const levIng = [];
    if (recipe.levainAmount > 0) {
      const levTotal = Math.round(recipe.levainAmount * scaleFactor);
      levIng.push({name:'Kész levain', ingredientId:105, amount:recipe.levainAmount, subType:'starter', _scaledG: levTotal});
    }

    const allWithLev = [...allIng.filter(i => i.ingredientId !== 105), ...levIng];
    const grouped = {};
    allWithLev.forEach(ing => {
      const st = ing.subType || 'other_dry';
      if (!grouped[st]) grouped[st] = [];
      grouped[st].push(ing);
    });

    ['flour','other_dry','wet','starter','raw_grain'].forEach(st => {
      if (!grouped[st] || grouped[st].length === 0) return;
      // Deduplicate by ingredient_id
      const dedupMap = {};
      grouped[st].forEach(ing => {
        const key = ing.ingredientId ? 'id:'+ing.ingredientId : 'name:'+ing.name;
        const scaledG = ing._scaledG !== undefined ? ing._scaledG : Math.round(ing.amount * scaleFactor);
        const ingMaster = ing.ingredientId ? getIng(ing.ingredientId) : null;
        const displayName = ingMaster?.name || ing.name;
        if (dedupMap[key]) { dedupMap[key].scaledG += scaledG; }
        else { dedupMap[key] = { displayName, scaledG, ingMaster }; }
      });
      const stBg = {flour:'rgba(251,191,36,0.14)', other_dry:'rgba(139,92,246,0.10)', wet:'rgba(59,130,246,0.10)', starter:'rgba(20,184,166,0.14)', raw_grain:'rgba(107,114,128,0.10)'}[st] || 'rgba(0,0,0,0.04)';
      const stColor = {flour:'#92400e', other_dry:'#5b21b6', wet:'#1d4ed8', starter:'var(--teal-dark)', raw_grain:'#374151'}[st] || 'var(--teal-dark)';
      const totalSectionG = Object.values(dedupMap).reduce((s,i) => s+i.scaledG, 0);
      const pctOfTotal = rawWeight > 0 ? (totalSectionG/rawWeight*100).toFixed(1) : 0;
      html += `<div style="margin-bottom:8px;border-radius:8px;overflow:hidden;border:1px solid rgba(0,0,0,0.06)">
        <div style="background:${stBg};padding:6px 12px;display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:0.78rem;font-weight:700;color:${stColor}">${SUB_LABELS[st]||st}</span>
          <span style="font-size:0.78rem;color:${stColor}">${pctOfTotal}%</span>
        </div>`;
      // 2-column grid inside section
      const dedupItems = Object.values(dedupMap);
      html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:0">`;
      dedupItems.forEach(item => {
        const pct = rawWeight > 0 ? (item.scaledG/rawWeight*100).toFixed(1) : '—';
        const cost = item.ingMaster && getFifoPrice(item.ingMaster) > 0 ? (getFifoPrice(item.ingMaster) * item.scaledG).toFixed(2) : null;
        html += `<div style="display:flex;align-items:center;padding:4px 10px;border-top:1px solid rgba(0,0,0,0.04);font-size:0.79rem;gap:4px">
          <span style="flex:1;color:var(--teal-dark);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(item.displayName)}</span>
          <span style="font-weight:700;color:var(--teal-dark);min-width:50px;text-align:right;flex-shrink:0">${item.scaledG.toLocaleString()} g</span>
          <span style="color:var(--text-soft);font-size:0.68rem;width:30px;text-align:right;flex-shrink:0">${pct}%</span>
          <span style="color:var(--gold-dark);font-size:0.7rem;min-width:44px;text-align:right;flex-shrink:0">${cost ? cost+' lej' : '—'}</span>
        </div>`;
      });
      // If odd number, add empty cell for grid alignment
      if (dedupItems.length % 2 !== 0) html += `<div></div>`;
      html += `</div>`;
      html += `</div>`;
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
    const stBgSum = {flour:'rgba(251,191,36,0.14)', other_dry:'rgba(139,92,246,0.10)', wet:'rgba(59,130,246,0.10)', starter:'rgba(20,184,166,0.14)'};
    const stColorSum = {flour:'#92400e', other_dry:'#5b21b6', wet:'#1d4ed8', starter:'var(--teal-dark)'};
    ['flour','other_dry','wet','starter'].forEach(st => {
      if(!groups[st] || groups[st].length === 0) return;
      const stItems = groups[st].sort((a,b)=>b.total-a.total);
      const stTotal = stItems.reduce((s,n)=>s+Math.round(n.total),0);
      html += `<div style="margin:0 16px 10px;border-radius:8px;overflow:hidden;border:1px solid rgba(0,0,0,0.06)">
        <div style="background:${stBgSum[st]||'#f9fafb'};padding:6px 12px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(0,0,0,0.06)">
          <span style="font-size:0.78rem;font-weight:700;color:${stColorSum[st]||'var(--teal-dark)'}">${subTypeLabel(st)}</span>
          <span style="font-size:0.78rem;color:${stColorSum[st]||'var(--teal-dark)'};font-weight:600">${stTotal.toLocaleString()} g</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0">`;
      stItems.forEach((n,idx) => {
        const ing = getIng(n.ingId);
        const stock = getTotalStock(ing);
        const enough = stock >= Math.round(n.total);
        const critical = !enough && stock > 0;
        grandCost += n.cost;
        const statusColor = enough ? '#059669' : critical ? '#d97706' : '#dc2626';
        const statusIcon = enough ? '✓' : critical ? '⚠' : '✗';
        html += `<div style="display:flex;align-items:center;padding:5px 12px;border-top:1px solid rgba(0,0,0,0.04);font-size:0.79rem;gap:4px;${idx%2===1?'border-left:1px solid rgba(0,0,0,0.04)':''}">
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--teal-dark)">${n.name}</span>
          <span style="font-weight:700;color:var(--teal-dark);min-width:54px;text-align:right;flex-shrink:0">${Math.round(n.total).toLocaleString()} g</span>
          <span style="color:${statusColor};font-size:0.72rem;margin-left:4px;flex-shrink:0">${statusIcon}</span>
        </div>`;
      });
      if (stItems.length % 2 !== 0) html += `<div></div>`;
      html += `</div></div>`;
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

  // Show 'Sütés elvégezve' button in top bar
  const doneBtnTop = document.getElementById('prod-done-btn-top');
  if (doneBtnTop) doneBtnTop.style.display = 'inline-block';
}

// ===== SÜTÉS ELVÉGEZVE – FIFO LEVONAT =====
async function confirmBakingDone() {
  const needs = window._lastProductionNeeds;
  const days = window._lastProductionDays;
  if (!needs || Object.keys(needs).length === 0) {
    toast('⚠️ Előbb számítsd ki az előkészítést!', true); return;
  }

  const confirmed = confirm(
    'Rögzíted a sütést elvégezve?\n\n' +
    'Ez levonja az alapanyagokat a készletből (FIFO):\n' +
    Object.values(needs).filter(n=>n.ingId).map(n => `• ${n.name}: ${Math.round(n.total).toLocaleString()}g`).join('\n') +
    '\n\nA művelet nem visszavonható!'
  );
  if (!confirmed) return;

  const btn = document.getElementById('prod-done-btn');
  if (btn) { btn.textContent = '⏳ Feldolgozás...'; btn.disabled = true; }

  try {
    const usage = [];
    let totalCost = 0;

    for (const [key, need] of Object.entries(needs)) {
      if (!need.ingId || need.total <= 0) continue;
      let remaining = need.total;

      // FIFO: deduct from oldest batches first
      const batches = R.batches
        .filter(b => b.ingredientId === need.ingId && b.qtyRemainingG > 0)
        .sort((a,b) => a.receivedDate.localeCompare(b.receivedDate));

      for (const batch of batches) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, batch.qtyRemainingG);
        const cost = take * batch.pricePerG;
        totalCost += cost;
        usage.push({ ingredient_id: need.ingId, batch_id: batch.id, qty_g: take, cost });

        // Update batch in DB
        batch.qtyRemainingG -= take;
        remaining -= take;
        try {
          await sb.update('ingredient_batches',
            { qty_remaining_g: Math.max(0, batch.qtyRemainingG) },
            `id=eq.${batch.id}`);
        } catch(e) { console.warn('batch update:', e.message); }
      }

      // Update local ingredient stock
      const ing = getIng(need.ingId);
      if (ing) {
        ing.totalStockG = Math.max(0, (ing.totalStockG || 0) - need.total);
        const remaining_batches = R.batches.filter(b => b.ingredientId === need.ingId && b.qtyRemainingG > 0);
        const fifoB = [...remaining_batches].sort((a,b) => a.receivedDate.localeCompare(b.receivedDate))[0];
        ing.fifoPrice = fifoB ? fifoB.pricePerG : 0;
        const tot = ing.totalStockG;
        ing.avgPrice = tot > 0 ? remaining_batches.reduce((s,b) => s + b.pricePerG * b.qtyRemainingG, 0) / tot : 0;
      }
    }

    // Save production log
    const now = new Date().toISOString().slice(0,10);
    await sb.insert('production_logs', {
      date: now,
      log_type: 'customer',
      pieces_planned: 0,
      pieces_actual: 0,
      ingredient_usage: JSON.stringify(usage),
      total_cost: totalCost,
      notes: `Sütési napok: ${days?.join(', ') || '—'}`
    });

    const topBtn = document.getElementById('prod-done-btn-top');
    if (topBtn) { topBtn.style.display = 'none'; }
    if (btn) { btn.style.display = 'none'; btn.textContent = '✅ Sütés elvégezve'; btn.disabled = false; }
    toast(`✅ Sütés rögzítve! ${usage.length} alapanyag levonva. Önköltség: ${totalCost.toFixed(2)} lej`);
    renderStock();
    renderStockAlerts();
    window._lastProductionNeeds = {};
  } catch(e) {
    toast('⚠️ Hiba: ' + e.message, true);
    if (btn) { btn.textContent = '✅ Sütés elvégezve → Készlet levonása'; btn.disabled = false; }
  }
}

// ===== KÍSÉRLETI SÜTÉS =====
async function openExperimentalBake(recipeId) {
  // If no recipeId, show proper recipe picker modal
  if (!recipeId) {
    const active = R.recipes.filter(r => !r.archived);
    if (active.length === 0) { toast('Nincs aktív recept!', true); return; }
    // Show picker modal
    const picker = document.getElementById('exp-recipe-picker') || (() => {
      const m = document.createElement('div');
      m.id = 'exp-recipe-picker';
      m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
      document.body.appendChild(m); return m;
    })();
    picker.innerHTML = `<div style="background:white;border-radius:16px;padding:24px;width:100%;max-width:420px">
      <h3 style="font-family:'Fraunces',serif;color:var(--teal-dark);margin:0 0 16px">🧪 Kísérleti sütés – recept választás</h3>
      <div style="display:flex;flex-direction:column;gap:8px;max-height:50vh;overflow-y:auto">
        ${active.map(r => `<button onclick="document.getElementById('exp-recipe-picker').style.display='none';openExperimentalBake(${r.id})"
          style="text-align:left;padding:12px 16px;border:1.5px solid var(--border);border-radius:10px;background:white;cursor:pointer;font-family:'Kodchasan',sans-serif;font-size:0.9rem;color:var(--teal-dark);font-weight:600;transition:all 0.15s"
          onmouseover="this.style.background='var(--teal-pale)'" onmouseout="this.style.background='white'">
          ${esc(r.name)}
        </button>`).join('')}
      </div>
      <button onclick="document.getElementById('exp-recipe-picker').style.display='none'"
        style="width:100%;margin-top:12px;padding:8px;background:none;border:1px solid var(--border);border-radius:8px;cursor:pointer;font-family:'Kodchasan',sans-serif;color:var(--text-soft)">Mégse</button>
    </div>`;
    picker.style.display = 'flex';
    return; // Will be called again with recipeId
  }
  const recipe = R.recipes.find(r => r.id === recipeId);
  if (!recipe) { toast('Recept nem található!', true); return; }

  const modal = document.getElementById('exp-bake-modal') || (() => {
    const m = document.createElement('div');
    m.id = 'exp-bake-modal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    document.body.appendChild(m); return m;
  })();

  modal.innerHTML = `<div style="background:white;border-radius:16px;padding:24px;width:100%;max-width:420px">
    <h3 style="font-family:'Fraunces',serif;color:var(--teal-dark);margin:0 0 8px">🧪 Kísérleti sütés</h3>
    <div style="font-weight:600;margin-bottom:14px">${esc(recipe.name)}</div>
    <div style="background:#fef3c7;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:0.82rem;color:#92400e">
      ⚠️ A kísérleti sütés levonja az alapanyagokat a készletből, de <b>nem</b> kerül a rendelési statisztikákba.
    </div>
    <div style="margin-bottom:14px">
      <label style="font-size:0.82rem;font-weight:600;color:var(--teal-dark);display:block;margin-bottom:6px">Darabszám</label>
      <input type="number" id="exp-pieces" min="1" value="1" style="width:100%;padding:10px;border:1.5px solid var(--border);border-radius:8px;font-family:'Kodchasan',sans-serif;box-sizing:border-box">
    </div>
    <div style="margin-bottom:14px">
      <label style="font-size:0.82rem;font-weight:600;color:var(--teal-dark);display:block;margin-bottom:6px">Megjegyzés (opcionális)</label>
      <input type="text" id="exp-notes" placeholder="pl. új psyllium teszt, alacsonyabb só..." style="width:100%;padding:10px;border:1.5px solid var(--border);border-radius:8px;font-family:'Kodchasan',sans-serif;box-sizing:border-box">
    </div>
    <div id="exp-cost-preview" style="background:var(--bg-soft);border-radius:8px;padding:10px;margin-bottom:14px;font-size:0.8rem"></div>
    <div style="display:flex;gap:8px">
      <button onclick="confirmExperimentalBake(${recipeId})" class="btn btn-primary" style="flex:1">🧪 Rögzít + Készlet levonat</button>
      <button onclick="document.getElementById('exp-bake-modal').style.display='none'" style="padding:8px 14px;border:1px solid var(--border);background:none;border-radius:8px;cursor:pointer">Mégse</button>
    </div>
  </div>`;

  modal.style.display = 'flex';

  // Live cost preview
  const piecesEl = modal.querySelector('#exp-pieces');
  const previewEl = modal.querySelector('#exp-cost-preview');
  const updatePreview = () => {
    const pieces = parseInt(piecesEl.value) || 1;
    const raw = calcRawWeight(recipe, pieces);
    const scale = raw / recipe.basePortion;
    const allIng = recipe.allIngredients && recipe.allIngredients.length > 0
      ? recipe.allIngredients
      : [...(recipe.dryIngredients||[]),...(recipe.wetIngredients||[])];
    let cost = 0;
    allIng.forEach(ing => {
      if (ing.ingredientId) cost += getFifoPrice(getIng(ing.ingredientId)) * ing.amount * scale;
    });
    previewEl.innerHTML = `Nyers tömeg: <b>${raw.toLocaleString()}g</b> · Becsült önköltség: <b style="color:var(--gold-dark)">${cost.toFixed(2)} lej</b>`;
  };
  piecesEl.addEventListener('input', updatePreview);
  updatePreview();
}

async function confirmExperimentalBake(recipeId) {
  const recipe = R.recipes.find(r => r.id === recipeId);
  if (!recipe) return;
  const pieces = parseInt(document.getElementById('exp-pieces')?.value) || 1;
  const notes = document.getElementById('exp-notes')?.value?.trim() || '';

  const rawWeight = calcRawWeight(recipe, pieces); // display only
  const scale = calcScaleFactor(recipe, pieces); // no bake_loss
  const allIng = recipe.allIngredients && recipe.allIngredients.length > 0
    ? recipe.allIngredients
    : [...(recipe.dryIngredients||[]),...(recipe.otherDryIngredients||[]),
       ...(recipe.wetIngredients||[]),...(recipe.starterIngredients||[])];

  // Build needs
  const needs = {};
  allIng.forEach(ing => {
    if (!ing.ingredientId) return;
    needs[ing.ingredientId] = (needs[ing.ingredientId]||0) + ing.amount * scale;
  });

  // FIFO deduction
  const usage = [];
  let totalCost = 0;
  for (const [ingId, qty] of Object.entries(needs)) {
    let rem = qty;
    const batches = R.batches.filter(b => b.ingredientId === parseInt(ingId) && b.qtyRemainingG > 0)
      .sort((a,b) => a.receivedDate.localeCompare(b.receivedDate));
    for (const batch of batches) {
      if (rem <= 0) break;
      const take = Math.min(rem, batch.qtyRemainingG);
      totalCost += take * batch.pricePerG;
      usage.push({ ingredient_id: parseInt(ingId), batch_id: batch.id, qty_g: take, cost: take * batch.pricePerG });
      batch.qtyRemainingG -= take; rem -= take;
      try { await sb.update('ingredient_batches', { qty_remaining_g: Math.max(0, batch.qtyRemainingG) }, `id=eq.${batch.id}`); } catch(e) {}
    }
    const ing = getIng(parseInt(ingId));
    if (ing) ing.totalStockG = Math.max(0, (ing.totalStockG||0) - qty);
  }

  try {
    await sb.insert('production_logs', {
      date: new Date().toISOString().slice(0,10),
      log_type: 'experimental',
      recipe_id: recipeId,
      pieces_planned: pieces,
      pieces_actual: pieces,
      ingredient_usage: JSON.stringify(usage),
      total_cost: totalCost,
      notes: notes || 'Kísérleti sütés'
    });
    document.getElementById('exp-bake-modal').style.display = 'none';
    toast(`✅ Kísérleti sütés rögzítve: ${pieces} db ${recipe.name}. Önköltség: ${totalCost.toFixed(2)} lej`);
    renderStock();
  } catch(e) { toast('⚠️ Hiba: ' + e.message, true); }
}
