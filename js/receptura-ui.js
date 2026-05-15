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
    'cost-analysis': () => { if(typeof renderCostAnalysis === 'function') renderCostAnalysis(); }, stock: () => { renderStock(); renderStockAlerts(); },
    'levain-daily': () => { initLevainDaily(); },
    'production-prep': () => { initLevainDaily(); initProductionPrep(); },
    archiv: renderArchivView,
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
  return Math.round(totalBaked / (1 - (recipe.bakeLoss ?? R.settings.bakeLoss ?? 16) / 100));
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

// updateRecipeCatFilter – volt egy korábbi implementáció, jelenleg no-op
function updateRecipeCatFilter() {}

// Termékcsalád preview a receptúra modalban
function updateRecipeFamilyPreview() {
  const el = document.getElementById('r-family-preview');
  const val = document.getElementById('r-family-id')?.value;
  if (!el) return;
  if (!val) { el.textContent = ''; return; }
  const famId = parseInt(val);
  const parent = (_adminProductsCache||[]).find(p => p.id === famId);
  if (parent) {
    const members = (_adminProductsCache||[]).filter(p => p.product_family_id === famId || p.id === famId);
    el.innerHTML = `📦 Termékcsalád: <strong>${parent.name}</strong> (${members.length} tag)`;
    el.style.color = 'var(--teal-dark)';
  } else {
    el.textContent = '';
  }
}

// ===== AUTO MIN/MAX KALKULÁCIÓ =====
async function calcAutoMinMax() {
  // Rendelések az utolsó 90 napból
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffMonth = cutoff.getMonth();
  const cutoffYear = cutoff.getFullYear();

  let allOrders = [], allStatuses = [];
  try {
    [allOrders, allStatuses] = await Promise.all([
      sb.query('orders', { limit: 5000 }),
      sb.query('order_status', { limit: 2000 }),
    ]);
  } catch(e) { return; }

  const statusMap = {};
  (allStatuses||[]).forEach(s => {
    statusMap[`${s.client_id}-${s.year}-${s.month}-${s.day}`] = s.status;
  });

  // Filter: nem cancelled, és az elmúlt 90 napban
  const validOrders = (allOrders||[]).filter(o => {
    if (o.year < cutoffYear || (o.year === cutoffYear && o.month < cutoffMonth)) return false;
    const k = `${o.client_id}-${o.year}-${o.month}-${o.day}`;
    return statusMap[k] !== 'cancelled';
  });

  if (validOrders.length === 0) return;

  // Napi átlagos darabszám termékenként
  const days = new Set(validOrders.map(o => `${o.year}-${o.month}-${o.day}`)).size || 1;
  const productDailyAvg = {}; // productId → avg pieces/day
  const productTotals = {};
  validOrders.forEach(o => {
    productTotals[o.product_id] = (productTotals[o.product_id]||0) + o.quantity;
  });
  Object.keys(productTotals).forEach(pid => {
    productDailyAvg[pid] = productTotals[pid] / days;
  });

  // Ingredient napi fogyás = Σ(recipe.ingredient_amount × daily_pieces / base_portion)
  const ingDailyG = {}; // ingId → g/day

  R.recipes.filter(r => !r.archived && r.product_id).forEach(recipe => {
    const dailyPieces = productDailyAvg[recipe.product_id] || 0;
    if (dailyPieces === 0) return;
    const scale = dailyPieces; // per base_portion already in recipe amounts

    const allIng = [
      ...(recipe.dryIngredients||[]),
      ...(recipe.otherDryIngredients||[]),
      ...(recipe.wetIngredients||[]),
      ...(recipe.starterIngredients||[]),
    ];
    allIng.forEach(ing => {
      if (!ing.ingredientId) return;
      ingDailyG[ing.ingredientId] = (ingDailyG[ing.ingredientId]||0) + (ing.amount * scale / (recipe.basePortion||1000));
    });

    // Levain contribution
    if (recipe.levainAmount > 0) {
      const lev = calcLevain(recipe.levainAmount * scale);
      ingDailyG[4] = (ingDailyG[4]||0) + lev.starter * scale;  // id=4 Kovász
    }
  });

  if (Object.keys(ingDailyG).length === 0) return;

  // Calculate and save auto min/max for each ingredient
  const updates = [];
  R.ingredients.forEach(ing => {
    const dailyG = ingDailyG[ing.id] || 0;
    if (dailyG === 0) return;
    const autoMin = Math.ceil(dailyG * ing.leadTimeDays * ing.safetyFactor);
    const autoMax = Math.ceil(autoMin + dailyG * ing.orderCycleDays);
    if (autoMin !== ing.minStockAutoG || autoMax !== ing.maxStockAutoG) {
      ing.minStockAutoG = autoMin;
      ing.maxStockAutoG = autoMax;
      ing.autoUpdatedAt = new Date().toISOString();
      updates.push({ id: ing.id, min_stock_auto_g: autoMin, max_stock_auto_g: autoMax,
                     auto_updated_at: ing.autoUpdatedAt });
    }
  });

  // Batch save to DB
  for (const upd of updates) {
    try {
      await sb.update('ingredients', upd, `id=eq.${upd.id}`);
    } catch(e) { console.warn('autoMinMax save:', e.message); }
  }

  if (updates.length > 0) {
    console.log(`Auto min/max frissítve: ${updates.length} alapanyag`);
    // Re-render stock if visible
    if(typeof renderStock === 'function') renderStock();
    if(typeof renderStockAlerts === 'function') renderStockAlerts();
  }
}

// Override min/max kézzel
async function setStockOverride(ingId, minG, maxG) {
  const ing = getIng(ingId);
  if (!ing) return;
  ing.minStockOverrideG = minG !== null ? parseInt(minG) : null;
  ing.maxStockOverrideG = maxG !== null ? parseInt(maxG) : null;
  try {
    await sb.update('ingredients', {
      min_stock_override_g: ing.minStockOverrideG,
      max_stock_override_g: ing.maxStockOverrideG,
    }, `id=eq.${ingId}`);
    toast('✅ Kézi beállítás mentve.');
    renderStock();
  } catch(e) { toast('⚠️ Mentés sikertelen: ' + e.message, true); }
}

async function clearStockOverride(ingId) {
  await setStockOverride(ingId, null, null);
  toast('🤖 Visszaváltva automatikus számításra.');
}

// getTotalStock uses new batches structure
function getTotalStock(ing) {
  if (!ing) return 0;
  return ing.totalStockG || 0;
}
