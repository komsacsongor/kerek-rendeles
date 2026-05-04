// ===== NAVIGATION =====
const VIEW_TITLES = {
  recipes:'Receptek', 'recipe-detail':'Recept részletei', 'op-select':'Üzemi nézet – termékkiválasztás',
  'op-detail':'Üzemi nézet', ingredients:'Nyersanyag árjegyzék', 'settings-r':'Beállítások',
  'cost-analysis':'Önköltség elemzés', stock:'Készletkezelés', 'levain-daily':'Napi levain igény', 'production-prep':'Gyártás előkészítés'
};
function nav(id) {
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const el = document.getElementById('view-'+id);
  if (el) el.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n=>{
    if(n.getAttribute('onclick')?.includes(`'${id}'`)) n.classList.add('active');
  });
  document.getElementById('topbar-title').textContent = VIEW_TITLES[id]||id;
  const renders = {
    recipes: renderRecipes, 'op-select': renderOpSelect,
    ingredients: renderIngredients, 'settings-r': renderSettings,
    'cost-analysis': renderCostAnalysis, stock: renderStock,
    'levain-daily': () => { initLevainDaily(); },
    'production-prep': () => { initLevainDaily(); initProductionPrep(); },
  };
  renders[id]?.();
}

// ===== HELPERS =====
function getIng(id) { return R.ingredients.find(i=>i.id===id); }

// FIFO price: use oldest batch first
function getFifoPrice(ing) {
  if (!ing) return 0;
  if (!ing.suppliers || ing.suppliers.length === 0) return ing.pricePerG || 0;
  // Sort by date ascending (oldest first = FIFO)
  const sorted = [...ing.suppliers].sort((a,b) => new Date(a.date) - new Date(b.date));
  // Use first batch with stock > 0, else use latest
  const active = sorted.find(s => (s.stock||0) > 0) || sorted[sorted.length-1];
  return active.priceNet / active.package;
}

// Get current effective price per gram (FIFO)
function getIngPricePerG(ingId) {
  const ing = getIng(ingId);
  if (!ing) return 0;
  return getFifoPrice(ing);
}

// Determine ingredient display category
function getIngSubType(ing) {
  if (!ing) return 'other_dry';
  return ing.subType || 'other_dry';
}

// Category labels for display
function subTypeLabel(subType) {
  return {
    flour: '🌾 Száraz (liszt/korpa)',
    other_dry: '🧂 Egyéb száraz',
    wet: '💧 Nedves',
    starter: '🧫 Levain',
  }[subType] || '🧂 Egyéb';
}

function subTypeHeadClass(subType) {
  return {flour:'dry', other_dry:'other-dry', wet:'wet', starter:'levain'}[subType] || 'other-dry';
}

function calcRawWeight(recipe, pieces) {
  const unitWeight = recipe.unitWeight || recipe.basePortion;
  const totalBaked = pieces * unitWeight;
  return Math.round(totalBaked / (1 - (recipe.bakeLoss||R.settings.bakeLoss) / 100));
}
function calcLevain(levainAmount) {
  const s = R.settings.levain;
  const starter = Math.round(levainAmount * s.starter / 100);
  const water = Math.round(levainAmount * s.water / 100);
  const flour = levainAmount - starter - water;
  return { starter, water, flour, total: starter + water + flour };
}
function calcRefill(starterTaken) {
  const s = R.settings.refill;
  return {
    flour: Math.round(starterTaken * s.flour / 100),
    water: Math.round(starterTaken * s.water / 100),
  };
}
function scaleIngredient(baseAmount, basePortion, targetRaw) {
  return Math.round(baseAmount * targetRaw / basePortion * 10) / 10;
}
function calcIngCost(ingId, amount) {
  const ing = getIng(ingId);
  if (!ing) return 0;
  return Math.round(getFifoPrice(ing) * amount * 1000) / 1000;
}

// Get total stock across all suppliers
function getTotalStock(ing) {
  if (!ing.suppliers) return ing.stock || 0;
  return ing.suppliers.reduce((a, s) => a + (s.stock || 0), 0);
}
function calcRecipeCost(recipe, pieces) {
  const s = R.settings;
  const unitWeight = recipe.unitWeight || recipe.basePortion;
  const totalBaked = pieces * unitWeight;
  const rawWeight = calcRawWeight(recipe, pieces);
  const scale = rawWeight / recipe.basePortion;

  // Raw material cost
  let rawCost = 0;
  const levain = calcLevain(recipe.levainAmount * scale);
  rawCost += calcIngCost(4, levain.starter); // kovász
  rawCost += calcIngCost(9, levain.flour);   // barnarizs
  rawCost += calcIngCost(1, levain.water);   // víz

  [...(recipe.dryIngredients||[]), ...(recipe.wetIngredients||[])].forEach(ing=>{
    rawCost += calcIngCost(ing.ingredientId, ing.amount * scale);
  });

  // Other costs
  const laborCost = (recipe.laborH||1) * s.labor;
  const electricityCost = (recipe.electricity||5) * s.electricity;
  const toolCost = s.toolWear;
  const consumablesCost = s.consumables;
  const totalCost = rawCost + laborCost + electricityCost + toolCost + consumablesCost;
  const costPerUnit = totalCost / pieces;
  const priceNet = costPerUnit / (1 - s.margin/100);
  const priceGross = priceNet * (1 + s.vat/100);

  return { rawCost, laborCost, electricityCost, toolCost, consumablesCost,
    totalCost, costPerUnit, priceNet, priceGross };
}

// ===== MODAL TABS =====
function switchModalTab(btn, tabId) {
  document.querySelectorAll('.modal-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.modal-tab-content').forEach(t=>t.style.display='none');
  btn.classList.add('active');
  document.getElementById(tabId).style.display='block';
  if (tabId==='rtab-cost') renderCostPreview();
}

function renderCostPreview() {
  const laborH = parseFloat(document.getElementById('r-labor-h').value)||1;
  const elec = parseFloat(document.getElementById('r-electricity').value)||5;
  const s = R.settings;
  const laborCost = laborH * s.labor;
  const elecCost = elec * s.electricity;
  const fixedCost = laborCost + elecCost + s.toolWear + s.consumables;
  document.getElementById('cost-preview').innerHTML = `
    <div class="cost-box">
      <div class="cost-row"><span>Munkaóra (${laborH}h × ${s.labor} lej)</span><span>${laborCost.toFixed(2)} lej</span></div>
      <div class="cost-row"><span>Áram (${elec}kWh × ${s.electricity} lej)</span><span>${elecCost.toFixed(2)} lej</span></div>
      <div class="cost-row"><span>Eszközkopás + fogyóeszköz</span><span>${(s.toolWear+s.consumables).toFixed(2)} lej</span></div>
      <div style="font-weight:700;color:var(--teal-dark);margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">Fix költség összesen: ${fixedCost.toFixed(2)} lej/sütés</div>
    </div>
    <p class="text-xs text-soft mt-16">A nyersanyagköltség a receptben megadott összetevők és az árjegyzék alapján kerül kiszámításra.</p>`;
}

// ===== MODAL UTILS =====
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open');}));

// ===== TOAST =====
function toast(msg, isError=false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  el.style.opacity = '1';
  el.style.background = isError ? '#b91c1c' : '';
  if(isError) console.error('KEREK:', msg);
  clearTimeout(el._t);
  const duration = isError ? 8000 : 3200;
  el._t = setTimeout(() => { el.style.opacity='0'; setTimeout(()=>el.style.display='none',300); el.style.background=''; }, duration);
}
