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

  // Admin-style month selector
  const MONTHS_SHORT = ['Jan','Feb','Már','Ápr','Máj','Jún','Júl','Aug','Sze','Okt','Nov','Dec'];
  let html = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
    <button onclick="_prodSelectedMonth={year:${year-1},month:${month}};renderProdMonthSelector()" 
      class="btn btn-ghost btn-sm" style="font-size:0.78rem">◀ ${year-1}</button>
    <span style="font-weight:700;color:var(--teal-dark);font-size:0.9rem;flex:1;text-align:center">${year}</span>
    <button onclick="_prodSelectedMonth={year:${year+1},month:${month}};renderProdMonthSelector()"
      class="btn btn-ghost btn-sm" style="font-size:0.78rem">${year+1} ▶</button>
  </div>
  <div style="display:flex;gap:3px;flex-wrap:wrap;margin-bottom:12px">
    ${MONTHS_SHORT.map((m, i) => `<button onclick="_prodSelectedMonth={year:${year},month:${i}};renderProdMonthSelector()"
      style="padding:5px 8px;border-radius:16px;border:1.5px solid ${i===month?'var(--teal)':'var(--border)'};
      background:${i===month?'var(--teal-pale)':'white'};color:${i===month?'var(--teal-dark)':'var(--text-soft)'};
      font-weight:${i===month?'700':'400'};font-size:0.78rem;cursor:pointer;font-family:'Kodchasan',sans-serif">${m}</button>`).join('')}
  </div>`;

  if (bakingDays.length === 0) {
    html += '<p class="text-soft text-sm">Nincs sütési nap ebben a hónapban.</p>';
  } else {
    const DAYS_HU = ['V','H','K','Sz','Cs','P','Szo'];
    // Only show days WITH orders
    const bakingDaysWithOrders = bakingDays.filter(d => daysWithOrders.includes(d));
    
    if (bakingDaysWithOrders.length === 0) {
      html += '<p class="text-soft text-sm" style="margin-top:4px">Ebben a hónapban nincs rendelés a sütési napokon.</p>';
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

      const rawWeight = calcRawWeight(recipe, totalPieces);
      recipeBreakdown[recipe.id].rawWeight += rawWeight;

      const scale = rawWeight / recipe.basePortion;

      // Ingredient needs (teljes rendelési igény)
      const lev = calcLevain(recipe.levainAmount * scale);
      addNeed(needs, 4, lev.starter);
      addNeed(needs, 9, lev.flour);
      addNeed(needs, 1, lev.water);

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
    // FIX: use same scale as summary (includes bake loss)
    const scaleFactor = rawWeight / basePortion;
    const rid = 'prod-recipe-' + (recipeIdx++);
    // First recipe open, rest closed
    const openDefault = recipeIdx === 1;

    // Per-day summary
    const dayBadges = Object.entries(days).sort().map(([ds, pieces]) => {
      const [dy,dm,dd] = ds.split('-').map(Number);
      const dow = new Date(dy,dm-1,dd).getDay();
      return `<span style="font-size:0.72rem;padding:2px 8px;background:rgba(255,255,255,0.15);border-radius:10px">${DAYS_HU_S[dow]} ${dd}.: ${pieces} db</span>`;
    }).join('');

    html += `<div style="border-bottom:2px solid var(--teal-pale)">
      <div onclick="const b=document.getElementById('${rid}');b.style.display=b.style.display==='none'?'block':'none'"
        style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;cursor:pointer;background:var(--teal-pale);user-select:none">
        <div>
          <span style="font-weight:700;font-size:0.92rem;color:var(--teal-dark)">${esc(recipe.name)}</span>
          <span style="font-size:0.78rem;color:var(--text-soft);margin-left:10px">${dayBadges}</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-shrink:0">
          <span class="badge badge-teal">${totalPieces} db</span>
          <span class="badge badge-gold">${(rawWeight/1000).toFixed(2)} kg nyers</span>
          <span style="color:var(--text-soft);font-size:0.9rem">${openDefault ? '▴' : '▾'}</span>
        </div>
      </div>
      <div id="${rid}" class="prod-recipe-body" style="display:${openDefault ? 'block' : 'none'};padding:12px 16px">`;

    // Group ingredients by sub_type
    const allIng = recipe.allIngredients && recipe.allIngredients.length > 0
      ? recipe.allIngredients
      : [...(recipe.dryIngredients||[]), ...(recipe.otherDryIngredients||[]),
         ...(recipe.wetIngredients||[]), ...(recipe.starterIngredients||[])];

    // Add levain as starter ingredient
    const levIng = [];
    if (recipe.levainAmount > 0) {
      const lev = calcLevain(recipe.levainAmount * scaleFactor);
      levIng.push({name:'Kovász (starter)', ingredientId:4, amount:recipe.levainAmount, subType:'starter', _scaledG: Math.round(lev.starter)});
      levIng.push({name:'Víz (levainhez)', ingredientId:1, amount:0, subType:'wet', _scaledG: Math.round(lev.water)});
    }

    const allWithLev = [...allIng, ...levIng];
    const grouped = {};
    allWithLev.forEach(ing => {
      const st = ing.subType || 'other_dry';
      if (!grouped[st]) grouped[st] = [];
      grouped[st].push(ing);
    });

    ['flour','other_dry','wet','starter','raw_grain'].forEach(st => {
      if (!grouped[st] || grouped[st].length === 0) return;
      html += `<div style="margin-bottom:10px">
        <div style="font-size:0.72rem;font-weight:700;color:var(--text-soft);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:5px;padding-bottom:3px;border-bottom:1px solid var(--border)">${SUB_LABELS[st]||st}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:2px 20px">`;
      grouped[st].forEach(ing => {
        const scaledG = ing._scaledG !== undefined ? ing._scaledG : Math.round(ing.amount * scaleFactor);
        const ingMaster = ing.ingredientId ? getIng(ing.ingredientId) : null;
        const displayName = ingMaster?.name || ing.name;
        html += `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(0,0,0,0.05);font-size:0.8rem">
          <span style="color:var(--teal-dark)">${esc(displayName)}</span>
          <span style="font-weight:700;color:var(--gold-dark);margin-left:8px">${scaledG.toLocaleString()} g</span>
        </div>`;
      });
      html += `</div></div>`;
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

    if (btn) { btn.style.display = 'none'; btn.textContent = '✅ Sütés elvégezve → Készlet levonása'; btn.disabled = false; }
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
  const recipe = R.recipes.find(r => r.id === recipeId);
  if (!recipe) return;

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

  const rawWeight = calcRawWeight(recipe, pieces);
  const scale = rawWeight / recipe.basePortion;
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
