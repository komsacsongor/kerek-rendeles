// ===== RENDER RECIPES =====
function renderRecipes() {
  // Filter buttons
  const cats = ['Mind', ...R.recipeCategories];
  let activeCat = 'Mind';
  document.getElementById('recipe-filter-btns').innerHTML = cats.map(c=>
    `<button class="btn ${c==='Mind'?'btn-primary':'btn-ghost'} btn-sm" onclick="filterRecipes('${c}',this)">${c}</button>`
  ).join('');

  renderRecipeGrid('Mind');
}

function filterRecipes(cat, btn) {
  document.querySelectorAll('#recipe-filter-btns .btn').forEach(b=>{
    b.className = b===btn ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
  });
  renderRecipeGrid(cat);
}

function renderRecipeGrid(cat) {
  // Only active (non-archived) recipes
  const active = R.recipes.filter(r => !r.archived);
  const filtered = cat==='Mind' ? active : active.filter(r=>r.category===cat);
  document.getElementById('recipes-grid').innerHTML = filtered.map(r => {
    const cost = calcRecipeCost(r, 10);
    return `<div class="recipe-card" onclick="openRecipeDetail(${r.id})">
      <div class="recipe-card-img">🍞</div>
      <div class="recipe-card-body">
        <div class="recipe-card-name">${r.name}</div>
        <div class="recipe-card-meta">
          <span class="badge badge-teal">${r.category}</span>
          <span>${r.unitWeight||r.basePortion}g/db</span>
          ${r.productCode ? `<span style="font-family:monospace;font-size:0.68rem;color:var(--text-soft)">${r.productCode}</span>` : ''}
        </div>
        <div class="recipe-card-price">${cost.priceGross.toFixed(2)} lej <span style="font-size:0.75rem;color:var(--text-soft)">/db bruttó</span></div>
      </div>
    </div>`;
  }).join('') || '<p class="text-soft text-sm">Nincs recept ebben a kategóriában.</p>';

  // Archív receptek szekció
  renderArchivedRecipes();
}

function renderArchivedRecipes() {
  const archived = R.recipes.filter(r => r.archived);
  let el = document.getElementById('archived-recipes-section');
  if(!el) return;
  if(archived.length === 0) { el.style.display='none'; return; }
  el.style.display = 'block';
  el.innerHTML = `
    <div style="border-top:2px dashed var(--border);margin-top:32px;padding-top:20px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <span style="font-family:'Fraunces',serif;font-size:1rem;color:var(--text-soft)">🗃 Archív receptek</span>
        <span class="badge" style="background:var(--bg-soft);color:var(--text-soft)">${archived.length} db</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px">
        ${archived.map(r=>`
          <div class="recipe-card" style="opacity:0.6;border-style:dashed">
            <div class="recipe-card-body">
              <div class="recipe-card-name" style="color:var(--text-soft)">${r.name}</div>
              <div class="recipe-card-meta">
                <span class="badge" style="background:var(--bg-soft)">${r.category}</span>
              </div>
              <div style="display:flex;gap:8px;margin-top:10px">
                <button class="btn btn-sm" style="background:var(--teal);color:#fff;flex:1" onclick="restoreRecipe(${r.id})">↩ Visszaállítás</button>
                <button class="btn btn-sm btn-danger" onclick="deleteArchivedRecipe(${r.id})">🗑</button>
              </div>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

// ===== RECIPE DETAIL =====
let currentRecipeId = null;
function openRecipeDetail(id) {
  currentRecipeId = id;
  document.getElementById('scale-pieces').value = 10;
  nav('recipe-detail');
  renderRecipeDetail();
}

function renderRecipeDetail() {
  const r = R.recipes.find(r=>r.id===currentRecipeId);
  if (!r) return;
  const pieces = parseInt(document.getElementById('scale-pieces').value)||10;
  const vBadge = r.version > 1 ? ` <span style="font-size:.75rem;background:var(--gold);color:#000;padding:2px 7px;border-radius:20px;font-family:Kodchasan,sans-serif;font-weight:700">v${r.version}</span>` : '';
  document.getElementById('detail-title').innerHTML = r.name + vBadge;

  // Scale info
  const rawWeight = calcRawWeight(r, pieces);
  const bakedWeight = pieces * (r.unitWeight||r.basePortion);
  const levainNeeded = Math.round(r.levainAmount * rawWeight / r.basePortion);
  document.getElementById('scale-raw-weight').textContent = rawWeight.toLocaleString();
  document.getElementById('scale-baked-weight').textContent = bakedWeight.toLocaleString();
  document.getElementById('scale-levain').textContent = levainNeeded;

  // Levain box
  renderLevainBox('levain-box', levainNeeded, r.levainAmount * rawWeight / r.basePortion);

  // Ingredients
  renderIngredientsDetail(r, pieces, rawWeight);

  // Cost
  renderCostDetail(r, pieces);

  // Process
  renderProcessDetail(r);
}

function renderLevainBox(containerId, levainTotal, levainBase) {
  const lev = calcLevain(levainTotal);
  const refill = calcRefill(lev.starter);
  document.getElementById(containerId).innerHTML = `
    <h3>🧫 Levain & Kovász kalkulátor</h3>
    <div class="levain-grid">
      <div>
        <div class="levain-col-title">Levain elkészítése</div>
        <div class="levain-line"><span>Kovász (33%)</span><div><span class="levain-val">${lev.starter} g</span></div></div>
        <div class="levain-line"><span>Víz (30%)</span><div><span class="levain-val">${lev.water} g</span></div></div>
        <div class="levain-line"><span>Barnarizs liszt (37%)</span><div><span class="levain-val">${lev.flour} g</span></div></div>
        <div class="levain-line" style="border-top:1px solid rgba(255,255,255,0.2);margin-top:4px;padding-top:6px">
          <span style="font-weight:700">Levain összesen</span>
          <span class="levain-val" style="font-size:1.1rem">${lev.total} g</span>
        </div>
      </div>
      <div>
        <div class="levain-col-title">Visszatöltés az üvegbe</div>
        <div class="levain-line"><span>Kivett kovász</span><span class="levain-val">${lev.starter} g</span></div>
        <div class="levain-line"><span>Barnarizs liszt (52%)</span><span class="levain-val">${refill.flour} g</span></div>
        <div class="levain-line"><span>Víz (48%)</span><span class="levain-val">${refill.water} g</span></div>
        <div class="levain-line" style="border-top:1px solid rgba(255,255,255,0.2);margin-top:4px;padding-top:6px">
          <span style="font-weight:700">Visszatölt összesen</span>
          <span class="levain-val">${refill.flour+refill.water} g</span>
        </div>
      </div>
    </div>`;
}

function renderIngredientsDetail(recipe, pieces, rawWeight) {
  const scale = rawWeight / recipe.basePortion;
  const allIngs = [...(recipe.dryIngredients||[]), ...(recipe.wetIngredients||[])];
  const totalBase = allIngs.reduce((a,i)=>a+i.amount, 0) + recipe.levainAmount;

  // Group by subType
  const groups = {};
  allIngs.forEach(ing => {
    const baseIng = getIng(ing.ingredientId);
    const subType = baseIng ? getIngSubType(baseIng) : (recipe.dryIngredients?.includes(ing) ? 'flour' : 'wet');
    if (!groups[subType]) groups[subType] = {items:[], total:0};
    groups[subType].items.push(ing);
    groups[subType].total += ing.amount;
  });

  // Display order
  const order = ['flour', 'other_dry', 'wet'];
  let html = '';
  let grandIngCost = 0;

  order.forEach(subType => {
    const grp = groups[subType];
    if (!grp || grp.items.length === 0) return;
    const grpPct = ((grp.total / totalBase) * 100).toFixed(1);
    const headClass = subTypeHeadClass(subType);
    html += `<div class="ing-section">
      <div class="ing-section-head ${headClass}">${subTypeLabel(subType)} <span>${grpPct}%</span></div>`;

    let sectionCost = 0;
    grp.items.forEach(ing => {
      const scaled = Math.round(ing.amount * scale * 10) / 10;
      const pct = ((ing.amount / totalBase) * 100).toFixed(1);
      const cost = calcIngCost(ing.ingredientId, scaled);
      sectionCost += cost;
      grandIngCost += cost;
      const baseIng = getIng(ing.ingredientId);
      const supplier = baseIng?.suppliers?.[0]?.source || '—';
      const fifoPrice = baseIng ? (getFifoPrice(baseIng) * 1000).toFixed(3) : '—';

      html += `<div class="ing-row">
        <span class="ing-name">${ing.name}
          ${baseIng ? `<span class="ing-source" onclick="showIngDetail(${ing.ingredientId})" title="Kattints az árjegyzék tételre">🔍 ${supplier}</span>` : ''}
        </span>
        <span class="ing-pct">${pct}%</span>
        <span class="ing-amount">${scaled} g</span>
        <span class="ing-cost" title="${fifoPrice} lej/kg">${cost > 0 ? cost.toFixed(3)+' lej' : '—'}</span>
      </div>`;
    });

    // Section cost total
    html += `<div class="ing-row" style="background:#f7f5f0;font-weight:600;font-size:0.78rem">
      <span class="ing-name" style="color:var(--text-soft)">Szekció összesen</span>
      <span class="ing-pct"></span>
      <span class="ing-amount" style="color:var(--text-soft)">${Math.round(grp.items.reduce((a,i)=>a+i.amount*scale,0)*10)/10} g</span>
      <span class="ing-cost" style="color:var(--gold-dark)">${sectionCost.toFixed(3)} lej</span>
    </div>`;
    html += `</div>`;
  });

  // Levain row
  const levainScaled = Math.round(recipe.levainAmount * scale);
  const levainPct = ((recipe.levainAmount / totalBase) * 100).toFixed(1);
  const levainCost = calcIngCost(4, calcLevain(levainScaled).starter) +
    calcIngCost(9, calcLevain(levainScaled).flour) +
    calcIngCost(1, calcLevain(levainScaled).water);
  grandIngCost += levainCost;

  html += `<div class="ing-section">
    <div class="ing-section-head levain">🧫 Levain <span>${levainPct}%</span></div>
    <div class="ing-row">
      <span class="ing-name">Levain összesen</span>
      <span class="ing-pct">${levainPct}%</span>
      <span class="ing-amount">${levainScaled} g</span>
      <span class="ing-cost">${levainCost.toFixed(3)} lej</span>
    </div>
  </div>`;

  // Grand total row
  html += `<div style="background:var(--teal-pale);border-radius:10px;padding:10px 14px;margin-top:8px;display:flex;justify-content:space-between;align-items:center">
    <span style="font-weight:700;color:var(--teal-dark)">🧾 Nyersanyag összköltség</span>
    <span style="font-family:'Fraunces',serif;font-size:1.2rem;color:var(--gold-dark);font-weight:700">${grandIngCost.toFixed(2)} lej</span>
  </div>`;

  document.getElementById('ingredients-detail').innerHTML = html;
  document.getElementById('total-pct-badge').innerHTML = `<span class="badge badge-green">✓ Ellenőrzött</span>`;
}

// Show ingredient detail popup
function showIngDetail(ingId) {
  const ing = getIng(ingId);
  if (!ing) return;
  const suppliers = ing.suppliers || [];
  const totalStock = getTotalStock(ing);
  let msg = `📦 ${ing.name}

`;
  msg += `Kategória: ${ing.cat} (${subTypeLabel(ing.subType)})
`;
  msg += `Teljes készlet: ${totalStock.toLocaleString()} g

`;
  msg += `Beszállítók (FIFO sorrendben):
`;
  const sorted = [...suppliers].sort((a,b) => new Date(a.date)-new Date(b.date));
  sorted.forEach((s,i) => {
    const ppg = (s.priceNet/s.package*1000).toFixed(3);
    msg += `${i+1}. ${s.source||'—'}: ${s.priceGross} lej/${s.package}g | ${ppg} lej/kg | Készlet: ${(s.stock||0)}g | ${s.date}
`;
  });
  alert(msg);
}

function renderCostDetail(r, pieces) {
  const c = calcRecipeCost(r, pieces);
  const c15 = calcRecipeCost(r, 15);

  let html = `<div class="cost-box">
    <div style="font-weight:600;font-size:0.85rem;color:var(--teal-dark);margin-bottom:10px">Jelenlegi: ${pieces} db</div>
    <div class="cost-row"><span>Nyersanyag</span><span>${c.rawCost.toFixed(2)} lej</span></div>
    <div class="cost-row"><span>Munkaóra (${r.laborH||1}h × ${R.settings.labor} lej)</span><span>${c.laborCost.toFixed(2)} lej</span></div>
    <div class="cost-row"><span>Áram (${r.electricity||5} kWh × ${R.settings.electricity} lej)</span><span>${c.electricityCost.toFixed(2)} lej</span></div>
    <div class="cost-row"><span>Eszközkopás + fogyóeszköz</span><span>${(c.toolCost+c.consumablesCost).toFixed(2)} lej</span></div>
  </div>
  <div class="cost-total">
    <div class="cost-total-row"><span class="lbl">Önköltség összesen</span><span class="val">${c.totalCost.toFixed(2)} lej</span></div>
    <div class="cost-total-row main"><span class="lbl">Egységköltség / db</span><span class="val">${c.costPerUnit.toFixed(2)} lej</span></div>
    <div class="cost-total-row"><span class="lbl">Javasolt ár (nettó, ${R.settings.margin}% haszon)</span><span class="val">${c.priceNet.toFixed(2)} lej</span></div>
    <div class="cost-total-row"><span class="lbl">Javasolt ár (bruttó, ${R.settings.vat}% ÁFA)</span><span class="val" style="font-size:1.4rem">${c.priceGross.toFixed(2)} lej</span></div>
  </div>`;

  if (pieces !== 15) {
    const saving = (c.costPerUnit - c15.costPerUnit).toFixed(2);
    html += `<div style="background:var(--green-pale);border-radius:10px;padding:12px 14px;margin-top:10px;font-size:0.82rem;">
      <div style="font-weight:700;color:var(--green);margin-bottom:4px">📈 Optimalizálási lehetőség</div>
      <div style="color:#065f46">15 db sütésnél: <b>${c15.costPerUnit.toFixed(2)} lej/db</b> önköltség</div>
      <div style="color:#065f46">Megtakarítás: <b>${saving} lej/db</b> (${((saving/c.costPerUnit)*100).toFixed(1)}%)</div>
    </div>`;
  }

  document.getElementById('cost-detail').innerHTML = html;
}

function renderProcessDetail(r) {
  document.getElementById('process-detail').innerHTML = (r.steps||[]).map((s,i)=>`
    <div class="step-item">
      <div class="step-num">${i+1}</div>
      <div class="step-content">
        <div class="step-title">${s.title}</div>
        <div class="step-desc">${s.desc}</div>
        ${s.timer?`<div class="step-timer">⏱ ${s.timer} perc</div>`:''}
      </div>
    </div>`).join('');
}

function changeScale(delta) {
  const input = document.getElementById('scale-pieces');
  input.value = Math.max(1, (parseInt(input.value)||10) + delta);
  renderRecipeDetail();
}

function toggleArchivedSection(btn) {
  const sec = document.getElementById('archived-recipes-section');
  if(!sec) return;
  const visible = sec.style.display !== 'none' && sec.innerHTML !== '';
  if(visible) {
    sec.style.display = 'none';
    btn.style.color = 'var(--text-soft)';
  } else {
    renderArchivedRecipes();
    sec.style.display = 'block';
    btn.style.color = 'var(--teal)';
    btn.style.fontWeight = '600';
  }
}

function renderArchivView() {
  const archived = R.recipes.filter(r => r.archived);
  const el = document.getElementById('archiv-grid');
  if(!el) return;
  if(archived.length === 0) {
    el.innerHTML = '<p class="text-soft text-sm" style="padding:32px 0">Nincs archivált recept.</p>';
    return;
  }
  el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;padding:8px 0">
    ${archived.map(r=>`
      <div class="recipe-card" style="opacity:0.75;border:1.5px dashed var(--border)">
        <div class="recipe-card-body">
          <div class="recipe-card-name" style="color:var(--text-soft)">${r.name}</div>
          <div class="recipe-card-meta" style="margin-bottom:10px">
            <span class="badge" style="background:var(--bg-soft);color:var(--text-soft)">${r.category}</span>
            ${r.productCode ? `<span style="font-family:monospace;font-size:0.68rem;color:var(--text-soft)">${r.productCode}</span>` : ''}
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-sm" style="background:var(--teal);color:#fff;flex:1" onclick="restoreRecipe(${r.id})">↩ Visszaállítás</button>
            <button class="btn btn-sm btn-danger" onclick="deleteArchivedRecipe(${r.id})" title="Végleges törlés">🗑</button>
          </div>
        </div>
      </div>`).join('')}
  </div>`;
}

// ===== NYOMTATHATÓ ADATLAP =====
function printRecipeDatasheet() {
  const r = R.recipes.find(x => x.id === currentRecipeId);
  if (!r) return;
  const pieces = parseInt(document.getElementById('scale-pieces').value) || 10;
  const rawWeight = calcRawWeight(r, pieces);
  const scale = rawWeight / r.basePortion;

  // Product image
  const prod = (typeof _adminProductsCache !== 'undefined' ? _adminProductsCache : []).find(p => p.id === r.product_id);
  const imgHtml = prod?.image
    ? `<img src="${prod.image}" style="width:140px;height:140px;object-fit:cover;border-radius:10px;border:2px solid #e5e7eb">`
    : `<div style="width:140px;height:140px;border-radius:10px;border:2px solid #e5e7eb;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:2rem">🍞</div>`;

  // Ingredients
  const dryRows = (r.dryIngredients||[]).map(i => {
    const scaled = Math.round(i.amount * scale);
    const pct = Math.round(i.amount / r.basePortion * 100);
    return `<tr><td>${i.name}</td><td style="text-align:right">${i.amount} g</td><td style="text-align:right">${scaled} g</td><td style="text-align:right;color:#6b7280">${pct}%</td></tr>`;
  }).join('');
  const wetRows = (r.wetIngredients||[]).map(i => {
    const scaled = Math.round(i.amount * scale);
    const pct = Math.round(i.amount / r.basePortion * 100);
    return `<tr><td>${i.name}</td><td style="text-align:right">${i.amount} g</td><td style="text-align:right">${scaled} g</td><td style="text-align:right;color:#6b7280">${pct}%</td></tr>`;
  }).join('');

  // Steps
  const stepsHtml = (r.steps||[]).map((s,i) => `<div style="margin-bottom:8px"><span style="font-weight:700;color:#064C48">${i+1}.</span> <strong>${s.name||''}</strong>${s.desc ? ' – '+s.desc : ''}${s.time ? ` <span style="color:#6b7280">(${s.time} perc)</span>` : ''}</div>`).join('');

  // Nutrition
  const nut = r.nutrition || {};
  const nutHtml = Object.keys(nut).length ? `
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <tr style="background:#f3f4f6"><th style="text-align:left;padding:4px 8px">Tápanyag</th><th style="text-align:right;padding:4px 8px">100g-ban</th></tr>
      ${nut.energy ? `<tr><td style="padding:3px 8px">Energia</td><td style="text-align:right;padding:3px 8px">${nut.energy} kcal</td></tr>` : ''}
      ${nut.fat !== undefined ? `<tr style="background:#f9fafb"><td style="padding:3px 8px">Zsír</td><td style="text-align:right;padding:3px 8px">${nut.fat} g</td></tr>` : ''}
      ${nut.carbs !== undefined ? `<tr><td style="padding:3px 8px">Szénhidrát</td><td style="text-align:right;padding:3px 8px">${nut.carbs} g</td></tr>` : ''}
      ${nut.protein !== undefined ? `<tr style="background:#f9fafb"><td style="padding:3px 8px">Fehérje</td><td style="text-align:right;padding:3px 8px">${nut.protein} g</td></tr>` : ''}
      ${nut.fiber !== undefined ? `<tr><td style="padding:3px 8px">Rost</td><td style="text-align:right;padding:3px 8px">${nut.fiber} g</td></tr>` : ''}
      ${nut.salt !== undefined ? `<tr style="background:#f9fafb"><td style="padding:3px 8px">Só</td><td style="text-align:right;padding:3px 8px">${nut.salt} g</td></tr>` : ''}
    </table>` : '<p style="color:#9ca3af;font-size:12px">Nincs tápérték adat</p>';

  const today = new Date().toLocaleDateString('hu-HU');
  const verLabel = `v${r.version||1}`;

  const html = `<!DOCTYPE html>
<html lang="hu">
<head>
<meta charset="UTF-8">
<title>${r.name} – Adatlap</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=Kodchasan:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Kodchasan', sans-serif; color: #1f2937; padding: 20px 28px; font-size: 13px; }
  h1 { font-family: 'Fraunces', serif; color: #064C48; font-size: 22px; }
  h2 { font-family: 'Fraunces', serif; color: #064C48; font-size: 15px; margin: 16px 0 8px; border-bottom: 2px solid #EFB036; padding-bottom: 3px; }
  h3 { font-size: 13px; font-weight: 700; color: #374151; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #064C48; color: white; padding: 5px 8px; text-align: left; font-weight: 600; }
  td { padding: 4px 8px; border-bottom: 1px solid #f3f4f6; }
  tr:nth-child(even) td { background: #f9fafb; }
  .header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; border-bottom: 3px solid #064C48; padding-bottom: 12px; }
  .header-left h1 { margin-bottom: 4px; }
  .badge { display: inline-block; background: #EFB036; color: #000; padding: 2px 10px; border-radius: 20px; font-weight: 700; font-size: 12px; margin-right: 6px; }
  .meta { color: #6b7280; font-size: 11px; margin-top: 4px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
  .box { background: #f9fafb; border-radius: 8px; padding: 12px; border: 1px solid #e5e7eb; }
  .box-val { font-size: 20px; font-weight: 700; color: #064C48; }
  .box-label { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .sep { height: 1px; background: #e5e7eb; margin: 14px 0; }
  .footer { margin-top: 20px; text-align: right; color: #9ca3af; font-size: 10px; border-top: 1px solid #e5e7eb; padding-top: 8px; }
  .marketing { background: #f0fdf4; border-left: 3px solid #064C48; padding: 10px 12px; border-radius: 0 8px 8px 0; font-size: 12px; color: #374151; line-height: 1.6; }
  .allergen { display: inline-block; background: #fef3c7; border: 1px solid #EFB036; border-radius: 4px; padding: 2px 8px; margin: 2px; font-size: 11px; font-weight: 600; }
  @media print {
    body { padding: 10px 16px; }
    @page { margin: 1cm; size: A4; }
  }
</style>
</head>
<body>
<div class="header">
  <div class="header-left">
    <h1>${r.name}</h1>
    <div style="margin-top:6px">
      <span class="badge">${verLabel}</span>
      <span class="badge" style="background:#064C48;color:white">${r.category||'Egyéb'}</span>
    </div>
    <div class="meta">Nyomtatva: ${today} &nbsp;|&nbsp; Alap adag: ${r.basePortion}g &nbsp;|&nbsp; Egység: ${r.unitWeight||r.basePortion}g &nbsp;|&nbsp; Sütési veszteség: ${r.bakeLoss||16}%</div>
    ${r.allergens ? `<div style="margin-top:6px"><strong>Allergének:</strong> ${r.allergens.split(',').map(a=>`<span class="allergen">${a.trim()}</span>`).join('')}</div>` : ''}
  </div>
  <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
    ${imgHtml}
    ${prod?.price ? `<div style="font-size:12px;color:#064C48;font-weight:700">${prod.price} lej</div>` : ''}
  </div>
</div>

${r.marketing ? `<div class="marketing" style="margin-bottom:14px">${r.marketing}</div>` : ''}

<div class="grid3" style="margin-bottom:14px">
  <div class="box"><div class="box-val">${r.temp1||230}°C → ${r.temp2||185}°C</div><div class="box-label">Sütési hőmérséklet</div></div>
  <div class="box"><div class="box-val">${r.time1||20} + ${r.time2||70} perc</div><div class="box-label">Sütési idő</div></div>
  <div class="box"><div class="box-val">${r.levainAmount||0}g</div><div class="box-label">Levain (1 adaghoz)</div></div>
</div>

<h2>🌾 Hozzávalók – ${pieces} db / ${rawWeight.toLocaleString()}g nyers</h2>
<div class="grid2">
  <div>
    <h3>Száraz</h3>
    <table>
      <tr><th>Összetevő</th><th style="text-align:right">Alap</th><th style="text-align:right">${pieces} db</th><th style="text-align:right">%</th></tr>
      ${dryRows || '<tr><td colspan="4" style="color:#9ca3af">–</td></tr>'}
      <tr style="font-weight:700;background:#e5e7eb"><td>Összesen</td><td style="text-align:right">${(r.dryIngredients||[]).reduce((s,i)=>s+i.amount,0)}g</td><td style="text-align:right">${Math.round((r.dryIngredients||[]).reduce((s,i)=>s+i.amount,0)*scale)}g</td><td></td></tr>
    </table>
  </div>
  <div>
    <h3>Nedves / egyéb</h3>
    <table>
      <tr><th>Összetevő</th><th style="text-align:right">Alap</th><th style="text-align:right">${pieces} db</th><th style="text-align:right">%</th></tr>
      ${wetRows || '<tr><td colspan="4" style="color:#9ca3af">–</td></tr>'}
      <tr style="font-weight:700;background:#e5e7eb"><td>Összesen</td><td style="text-align:right">${(r.wetIngredients||[]).reduce((s,i)=>s+i.amount,0)}g</td><td style="text-align:right">${Math.round((r.wetIngredients||[]).reduce((s,i)=>s+i.amount,0)*scale)}g</td><td></td></tr>
    </table>
  </div>
</div>

${stepsHtml ? `<h2>📋 Technológiai folyamat</h2><div>${stepsHtml}</div>` : ''}

<div class="grid2" style="margin-top:14px">
  <div>
    <h2>📊 Tápérték (100g)</h2>
    ${nutHtml}
  </div>
  <div>
    <h2>🏷️ Összetevő lista</h2>
    <p style="font-size:12px;line-height:1.7;color:#374151">${r.ingredientLabel || '<span style="color:#9ca3af">Nincs megadva</span>'}</p>
  </div>
</div>

<div class="footer">KEREK Pékség &nbsp;|&nbsp; ${r.name} – ${verLabel} &nbsp;|&nbsp; ${today}</div>
<script>window.onload=()=>{ window.print(); }</script>
</body></html>`;

  const w = window.open('', '_blank', 'width=900,height=1100');
  w.document.write(html);
  w.document.close();
}
