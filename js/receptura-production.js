// ===== PRODUCTION PREP =====
function initProductionPrep() {
  const now = new Date();
  const days = getBakingDaysRange(now, 30);
  const DAYS_HU = ['Vas','Hét','Kedd','Sze','Csüt','Pén','Szo'];
  const MONTHS_SHORT = ['Jan','Feb','Már','Ápr','Máj','Jún','Júl','Aug','Sze','Okt','Nov','Dec'];
  document.getElementById('prod-day-selector').innerHTML = days.map(d =>
    `<label style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border:1.5px solid var(--border);border-radius:20px;cursor:pointer;font-size:0.82rem;background:white;transition:all 0.2s">
      <input type="checkbox" value="${d.toISOString().slice(0,10)}" style="accent-color:var(--teal)">
      ${DAYS_HU[d.getDay()]} ${d.getDate()}. ${MONTHS_SHORT[d.getMonth()]}
    </label>`
  ).join('') || '<p class="text-soft text-sm">Nincs sütési nap a következő 30 napban.</p>';
  renderStockAlerts();
}

async function calcProductionPrep() {
  const selected = [...document.querySelectorAll('#prod-day-selector input:checked')].map(i=>i.value);
  if(selected.length === 0) {
    const levSel = [...document.querySelectorAll('#levain-day-selector input:checked')].map(i=>i.value);
    if(levSel.length > 0) { selected.push(...levSel); }
    else { alert('Válassz legalább egy napot!'); return; }
  }

  const DAYS_HU = ['Vasárnap','Hétfő','Kedd','Szerda','Csütörtök','Péntek','Szombat'];

  // Load confirmed orders from Supabase for selected days
  const needs = {};
  const dayBreakdown = {}; // dateStr -> { recipeId -> pieces }

  // Fetch all data in parallel
  const [allOrders, allStatuses, allClients] = await Promise.all([
    sb.query('orders', { limit: 5000 }),
    sb.query('order_status', { limit: 2000 }),
    sb.query('clients', { limit: 500 }),
  ]);

  // Build status lookup: "clientId-y-m-d" -> status
  const statusMap = {};
  (allStatuses||[]).forEach(s => { statusMap[`${s.client_id}-${s.year}-${s.month}-${s.day}`] = s.status; });

  // Build order lookup
  const orderMap = {};
  (allOrders||[]).forEach(o => {
    const k = `${o.client_id}-${o.year}-${o.month}-${o.day}`;
    if(!orderMap[k]) orderMap[k] = {};
    orderMap[k][o.product_id] = o.quantity;
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
        const stStatus = statusMap[k] || 'pending';
        // Count pending + confirmed (not cancelled)
        if (stStatus === 'cancelled') return;
        const order = orderMap[k];
        if(!order) return;
        const pid = recipe.product_id;
        if(pid && order[pid]) {
          totalPieces += order[pid];
        }
      });

      if(totalPieces === 0) return;
      dayBreakdown[dateStr][recipe.id] = (dayBreakdown[dateStr][recipe.id]||0) + totalPieces;

      const rawWeight = calcRawWeight(recipe, totalPieces);
      const scale = rawWeight / recipe.basePortion;

      // Levain ingredients
      const lev = calcLevain(recipe.levainAmount * scale);
      addNeed(needs, 4, lev.starter); // kovász
      addNeed(needs, 9, lev.flour);   // barnarizs liszt
      addNeed(needs, 1, lev.water);   // víz

      // Recipe ingredients
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

  // Check if there were any orders at all (even without ingredient_id)
  const hasAnyOrders = Object.values(dayBreakdown).some(day => Object.keys(day).length > 0);

  if(!hasAnyOrders) {
    document.getElementById('prod-prep-result').innerHTML = '<p class="text-soft text-sm">Nincs rendelés a kiválasztott napokra.</p>';
    return;
  }

  // Build order summary (always shown, regardless of ingredient links)
  let orderSummaryHtml = '<div class="card mb-16"><div class="card-head"><div class="card-title">📋 Rendelési összesítő</div></div><div class="card-body-np">';
  selected.forEach(dateStr => {
    const dayData = dayBreakdown[dateStr];
    if(!dayData || Object.keys(dayData).length === 0) return;
    const [dy,dm,dd] = dateStr.split('-').map(Number);
    const dow = new Date(dy,dm-1,dd).getDay();
    const dayNames = ['Vasárnap','Hétfő','Kedd','Szerda','Csütörtök','Péntek','Szombat'];
    const MONTHS_HU=['jan','feb','már','ápr','máj','jún','júl','aug','sze','okt','nov','dec'];
      orderSummaryHtml += `<div style="padding:10px 16px;border-bottom:1px solid var(--border)"><div style="font-weight:700;font-size:0.85rem;color:var(--teal-dark);margin-bottom:6px">${dayNames[dow]}, ${dy}. ${MONTHS_HU[dm-1]}. ${dd}.</div>`;
    Object.entries(dayData).forEach(([recipeId, pieces]) => {
      const recipe = activeRecipes.find(r=>r.id===parseInt(recipeId));
      if(!recipe) return;
      const rawW = calcRawWeight(recipe, pieces);
      orderSummaryHtml += `<div style="display:flex;justify-content:space-between;font-size:0.82rem;padding:3px 0">
        <span>${recipe.name}</span>
        <span><b style="color:var(--teal-dark)">${pieces} db</b> · ${(rawW/1000).toFixed(2)} kg nyers</span>
      </div>`;
    });
    orderSummaryHtml += '</div>';
  });
  orderSummaryHtml += '</div></div>';

  if(Object.keys(needs).length === 0) {
    // Orders exist but no ingredient_id links set up yet
    document.getElementById('prod-prep-result').innerHTML = orderSummaryHtml +
      '<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;color:#92400e;font-size:0.85rem">' +
      '⚠️ Az összetevők nincsenek az alapanyag listához kötve. A receptúra modulban állítsd be az összetevők <b>Alapanyag</b> hivatkozásait a pontos nyersanyag kalkulációhoz.</div>';
    return;
  }

  // Group by subType
  const groups = {flour:[], other_dry:[], wet:[], starter:[]};
  Object.values(needs).forEach(n => {
    const st = n.subType || 'other_dry';
    if(!groups[st]) groups[st] = [];
    groups[st].push(n);
  });

  let html = `<div class="card mb-16"><div class="card-head"><div class="card-title">🏭 Szükséges alapanyagok – ${selected.length} sütési napra</div></div><div class="card-body-np">`;
  const order = ['flour','other_dry','wet','starter'];
  let grandCost = 0;

  order.forEach(st => {
    if(!groups[st] || groups[st].length === 0) return;
    html += `<div style="padding:10px 16px;background:${st==='flour'?'#fffbf0':st==='wet'?'#eff8ff':st==='starter'?'var(--teal-pale)':'#f5f0fb'};border-bottom:1px solid var(--border)">
      <div style="font-weight:600;font-size:0.82rem;color:var(--teal-dark);margin-bottom:6px">${subTypeLabel(st)}</div>`;
    groups[st].sort((a,b)=>b.total-a.total).forEach(n => {
      const ing = getIng(n.ingId);
      const stock = getTotalStock(ing);
      const enough = stock >= Math.round(n.total);
      const critical = !enough && stock > ing?.criticalStock;
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
  </div>`;
  html += `</div></div>`;

  document.getElementById('prod-prep-result').innerHTML = html;

  // Save current needs for shopping list export
  window._lastProductionNeeds = needs;
  window._lastProductionDays = selected;
}
