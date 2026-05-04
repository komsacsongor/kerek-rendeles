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
  document.getElementById('detail-title').textContent = r.name;

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
