// ===== NAVIGATION =====
const VIEW_TITLES = {
  recipes:'Receptek', 'recipe-detail':'Recept részletei', 'op-select':'Üzemi nézet – termékkiválasztás',
  'op-detail':'Üzemi nézet', ingredients:'Nyersanyag árjegyzék', 'settings-r':'Beállítások',
  'cost-analysis':'Önköltség elemzés', stock:'Készletkezelés', 'levain-daily':'Napi levain igény', 'production-prep':'Gyártás előkészítés',
  'shopping':'🛒 Bevásárló lista', 'archiv':'Archív receptek', 'processing':'Malom / Feldolgozás', 'receptura-help':'Súgó'
};
function nav(id) {
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const el = document.getElementById('view-'+id);
  if (el) el.classList.add('active');
  // v2.39.0: data-action support + onclick legacy fallback
  document.querySelectorAll('.nav-item').forEach(n=>{
    const act = n.getAttribute('onclick') || '';
    const dataAct = n.getAttribute('data-action') || '';
    const dataArg = n.getAttribute('data-arg1') || '';
    if (act.includes(`'${id}'`) || (dataAct === 'nav' && dataArg === id)) n.classList.add('active');
  });
  document.getElementById('topbar-title').textContent = VIEW_TITLES[id]||id;
  const renders = {
    recipes: renderRecipes, 'op-select': renderOpSelect,
    ingredients: renderIngredients, 'settings-r': renderSettings,
    'cost-analysis': () => { if(typeof renderCostAnalysis === 'function') renderCostAnalysis(); }, stock: () => { renderStock(); renderStockAlerts(); },
    'levain-daily': () => { initLevainDaily(); },
    'processing': () => { initProcessingView(); },
    'receptura-help': () => { renderRecepturaHelp(); },
    'production-prep': () => { initLevainDaily(); initProductionPrep(); },
    archiv: renderArchivView,
    'shopping': () => { if(typeof renderShoppingList === 'function') renderShoppingList(); },
  };
  renders[id]?.();
}

// ===== HELPERS =====
function getIng(id) { return R.ingredients.find(i=>i.id===id); }

// FIFO price: use oldest batch first
function getFifoPrice(ing) {
  if (!ing) return 0;
  // 1. FIFO from batches (best)
  if (ing.fifoPrice && ing.fifoPrice > 0) return ing.fifoPrice;
  // 2. Manual base price fallback
  if (ing.basePriceG && ing.basePriceG > 0) return ing.basePriceG;
  // 3. Legacy suppliers
  if (ing.suppliers && ing.suppliers.length > 0) {
    const s = ing.suppliers.find(s => (s.stock || 0) > 0) || ing.suppliers[0];
    return s ? (s.pricePerKg || 0) / 1000 : 0;
  }
  return 0;
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

// Scale factor for ingredient calculation - NO bake_loss (recipe amounts already include it)
function calcScaleFactor(recipe, pieces) {
  const unitWeight = recipe.unitWeight || recipe.basePortion;
  return (pieces * unitWeight) / (recipe.basePortion || 1000);
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

    // Use allIngredients if available (all sub_types with ingredient_id links)
    const allIng = recipe.allIngredients && recipe.allIngredients.length > 0
      ? recipe.allIngredients
      : [...(recipe.dryIngredients||[]), ...(recipe.otherDryIngredients||[]),
         ...(recipe.wetIngredients||[]), ...(recipe.starterIngredients||[])];
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
    debugLog(`Auto min/max frissítve: ${updates.length} alapanyag`);
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

// ===== ÖNKÖLTSÉG ELEMZÉS =====
function renderCostAnalysis() {
  const tbody = document.getElementById('cost-analysis-tbody');
  const stats = document.getElementById('cost-stats');
  if (!tbody) return;

  const margin = (R.settings?.financialSettings?.targetMargin || 30) / 100;
  const laborH = R.settings?.financialSettings?.laborCostPerHour || 55;
  const electricKwh = R.settings?.financialSettings?.electricityCostPerKwh || 1.8;

  const rows = [];
  let totalRevPotential = 0, totalCostPotential = 0;

  R.recipes.filter(r => !r.archived).forEach(recipe => {
    // Find linked product
    const product = window._adminProductsCache?.find(p => p.id === recipe.product_id);
    const currentPrice = product?.price || 0;
    const basePortion = recipe.basePortion || 1000;
    const pieces = 1;
    const rawWeight = calcRawWeight(recipe, pieces);
    const scale = rawWeight / basePortion;

    // Ingredient cost
    const allIng = recipe.allIngredients && recipe.allIngredients.length > 0
      ? recipe.allIngredients
      : [...(recipe.dryIngredients||[]), ...(recipe.otherDryIngredients||[]),
         ...(recipe.wetIngredients||[]), ...(recipe.starterIngredients||[])];

    let ingCost = 0;
    allIng.forEach(ing => {
      const scaled = ing.amount * scale;
      if (ing.ingredientId) {
        const master = getIng(ing.ingredientId);
        ingCost += getFifoPrice(master) * scaled;
      }
    });

    // Levain cost
    if (recipe.levainAmount > 0) {
      const lev = calcLevain(recipe.levainAmount * scale);
      const kovasz = getIng(4);
      ingCost += getFifoPrice(kovasz) * lev.starter;
    }

    // Labor cost
    const laborCost = (recipe.laborH || 0) * laborH / (recipe.basePortion / (recipe.unitWeight || recipe.basePortion));

    // Electricity cost
    const elCost = (recipe.electricity || 0) * electricKwh / (recipe.basePortion / (recipe.unitWeight || recipe.basePortion));

    const totalCost = ingCost + laborCost + elCost;
    const suggestedPrice = margin > 0 ? totalCost / (1 - margin) : totalCost * 1.3;
    const diff = currentPrice - totalCost;
    const diffPct = totalCost > 0 ? (diff / totalCost * 100) : 0;

    // Optimal scale (15 db example)
    const optPieces = 15;
    const optRaw = calcRawWeight(recipe, optPieces);
    const optScale = optRaw / basePortion;
    let optIngCost = 0;
    allIng.forEach(ing => { if (ing.ingredientId) { const m = getIng(ing.ingredientId); optIngCost += getFifoPrice(m) * ing.amount * optScale; }});
    const optLaborCost = (recipe.laborH || 0) * laborH;
    const optCost = (optIngCost + optLaborCost + (recipe.electricity||0)*electricKwh) / optPieces;
    const saving = totalCost - optCost;

    totalRevPotential += currentPrice;
    totalCostPotential += totalCost;

    rows.push({ recipe, product, currentPrice, totalCost, suggestedPrice, diff, diffPct, optCost, saving, ingCost, laborCost, elCost });
  });

  // Stats cards
  const avgMargin = totalCostPotential > 0 ? ((totalRevPotential - totalCostPotential) / totalRevPotential * 100) : 0;
  const noPrice = rows.filter(r => r.currentPrice === 0).length;
  const belowCost = rows.filter(r => r.diff < 0).length;
  if (stats) stats.innerHTML = [
    {label:'Aktív receptek', val: rows.length, color:'var(--teal-dark)'},
    {label:'Átlagos fedezet', val: avgMargin.toFixed(1)+'%', color: avgMargin > 20 ? '#059669' : '#dc2626'},
    {label:'Nincs ár', val: noPrice, color: noPrice > 0 ? '#dc2626' : '#059669'},
    {label:'Önköltség alatt', val: belowCost, color: belowCost > 0 ? '#dc2626' : '#059669'},
  ].map(s => `<div class="card" style="border-left:4px solid ${s.color};padding:14px 18px">
    <div style="font-size:1.6rem;font-weight:800;color:${s.color};font-family:'Fraunces',serif">${s.val}</div>
    <div style="font-size:0.78rem;color:var(--text-soft);margin-top:2px">${s.label}</div>
  </div>`).join('');

  tbody.innerHTML = rows.map(r => {
    const hasPrice = r.currentPrice > 0;
    const ok = r.diff >= 0;
    const rowColor = !hasPrice ? '' : ok ? '' : 'background:#fff1f2';
    return `<tr style="${rowColor}">
      <td style="font-weight:600">${esc(r.recipe.name)}</td>
      <td class="num">${r.totalCost > 0 ? r.totalCost.toFixed(2)+' lej' : '<span style="color:var(--text-soft)">—</span>'}</td>
      <td class="num">${r.suggestedPrice > 0 ? r.suggestedPrice.toFixed(2)+' lej' : '—'}</td>
      <td class="num">${hasPrice ? r.currentPrice.toFixed(2)+' lej' : '<span style="color:#dc2626">Nincs ár</span>'}</td>
      <td class="num" style="color:${ok?'#059669':'#dc2626'};font-weight:600">${hasPrice ? (ok?'+':'')+r.diff.toFixed(2)+' lej ('+r.diffPct.toFixed(0)+'%)' : '—'}</td>
      <td class="num" style="color:var(--text-soft)">${r.optCost > 0 ? r.optCost.toFixed(2)+' lej' : '—'}</td>
      <td class="num" style="color:#059669">${r.saving > 0.01 ? '+'+r.saving.toFixed(2)+' lej' : '—'}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text-soft);padding:20px">Nincs aktív recept</td></tr>';
}
