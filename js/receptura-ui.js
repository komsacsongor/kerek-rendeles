// ===== NAVIGATION =====
const VIEW_TITLES = {
  'gyartas-flow': '🔥 Gyártás',
  'prodstats': '📊 Sütési statisztika',
  'masterdata': '📚 Törzsadatok',
  recipes:'Receptek', 'recipe-detail':'Recept részletei', 'op-select':'Üzemi nézet – termékkiválasztás',
  'op-detail':'Üzemi nézet', ingredients:'Nyersanyag árjegyzék', 'settings-r':'Beállítások',
  'cost-analysis':'Önköltség elemzés', stock:'Készletkezelés', 'levain-daily':'Napi levain igény', 'production-prep':'Gyártás előkészítés',
  'shopping':'🛒 Bevásárló lista', 'invoice-intake':'🌿 Készlet › 🧾 Számla bevételezése', 'suppliers':'👥 Beszállítók', 'archiv':'Archív receptek', 'processing':'Malom / Feldolgozás', 'baking-log':'📒 Sütési napló', 'receptura-help':'Súgó'
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
  // v2.56.0: a számla-bevételezés az Alapanyagok & Készlet része → a menüben az marad kijelölve
  if (id === 'invoice-intake') document.querySelector('.nav-item[data-action="nav"][data-arg1="stock"]')?.classList.add('active');
  document.getElementById('topbar-title').textContent = VIEW_TITLES[id]||id;
  const renders = {
    recipes: renderRecipes,
    'gyartas-flow': () => { if(typeof renderGyartasFlow==='function') renderGyartasFlow(); }, 'op-select': () => { if(typeof renderGyartasTabbar==='function')renderGyartasTabbar('op-select'); renderOpSelect(); },
    'prodstats': () => { if(typeof renderProductionStats==='function') renderProductionStats(); },
    ingredients: renderIngredients, 'settings-r': renderSettings,
    'cost-analysis': () => { if(typeof renderCostAnalysis === 'function') renderCostAnalysis(); }, stock: () => { renderStock(); renderStockAlerts(); },
    'levain-daily': () => { if(typeof renderGyartasTabbar==='function')renderGyartasTabbar('levain-daily'); initLevainDaily(); },
    'processing': () => { initProcessingView(); },
    'masterdata': () => { if(typeof renderMasterData==='function') renderMasterData(); },
    'receptura-help': () => { renderRecepturaHelp(); },
    'production-prep': () => { if(typeof renderGyartasTabbar==='function')renderGyartasTabbar('production-prep'); initProductionPrep(); },
    'baking-log': () => { if(typeof renderGyartasTabbar==='function')renderGyartasTabbar('baking-log'); initBakingLog(); },
    archiv: renderArchivView,
    'shopping': async () => {
      if (typeof loadShoppingOverrides === 'function' && !_shopLoaded){ _shopLoaded = true; await loadShoppingOverrides(); }
      if(typeof renderShoppingList === 'function') renderShoppingList();
    },
    'suppliers': () => { if(typeof renderSuppliers === 'function') renderSuppliers(); },
    'invoice-intake': () => { if(typeof renderInvoiceIntake === 'function') renderInvoiceIntake(); },
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

// v2.53.107: hány db fér egy recept-termékből EGY sütő-töltetbe (GN-terület arányos).
// oven.capacityTrays × ( recept.piecesPerTray × sütő-tálca-terület / GN1/1-terület )
function ovenCapacityPieces(oven, recipe){
  if(!oven || !recipe) return 0;
  const ppt = Number(recipe.piecesPerTray)||0;
  const trays = Number(oven.capacityTrays)||0;
  if(ppt<=0 || trays<=0) return 0;
  const GN11 = 530*325;
  const area = (Number(oven.trayWmm)||530) * (Number(oven.trayHmm)||325);
  const perTray = ppt * (area / GN11);
  return Math.floor(trays * perTray);
}
if(typeof window!=='undefined') window.ovenCapacityPieces=ovenCapacityPieces;

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
// ===== v2.56.3: KÖZÖS nyersanyag-számolás =====
// Ugyanaz a szorzó (calcScaleFactor — a recept-mennyiségek már tartalmazzák a sütési veszteséget) és
// ugyanaz az összetevő-lista, mint a gyártás készletlevonásánál (addRecipeNeeds). Eddig a költség-oldal
// a sütési veszteséggel még egyszer felszorzott (~+19%), és kihagyta az „egyéb száraz” / levain-típusú sorokat.
function recipeIngredientList(recipe){
  return (recipe.allIngredients && recipe.allIngredients.length) ? recipe.allIngredients
    : [...(recipe.dryIngredients||[]), ...(recipe.otherDryIngredients||[]), ...(recipe.wetIngredients||[]), ...(recipe.starterIngredients||[])];
}
// a levain-képlet alapanyagai név szerint (a régi rögzített ID csak tartalék)
function _levainIng(kind){
  const n = x => (x||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z]/g,'');
  const L = R.ingredients || [];
  if(kind === 'water') return L.find(i => n(i.name) === 'viz') || getIng(1);
  return L.find(i => n(i.name) === 'barnarizsliszt') || L.find(i => n(i.name).includes('barnarizs') && n(i.name).includes('liszt')) || getIng(9);
}
// 1 g kész levain ára: a „Kész levain” készlet ára, ha van; különben a képletből (liszt + víz arány —
// a kovász-rész maga is levain, így hosszú távon a liszt és a víz ára határozza meg)
function levainCostPerG(formulaOnly){
  if(!formulaOnly){
    const lv = getIng(typeof LEVAIN_ING_ID !== 'undefined' ? LEVAIN_ING_ID : 105);
    const p = lv ? getFifoPrice(lv) : 0;
    if(p > 0) return { ppg: p, src: 'készlet' };
  }
  const sl = R.settings.levain || { starter:33, water:30, flour:37 };
  const fl = _levainIng('flour'), wa = _levainIng('water');
  const fp = fl ? getFifoPrice(fl) : 0, wp = wa ? getFifoPrice(wa) : 0;
  const den = (Number(sl.flour)||0) + (Number(sl.water)||0);
  return { ppg: den > 0 ? ((Number(sl.flour)||0) * fp + (Number(sl.water)||0) * wp) / den : 0, src: 'képlet', flourName: fl?.name || '', flourPriced: fp > 0 };
}
// nyersanyagköltség + hiányzó adatok (pieces db-ra)
function calcRecipeMaterial(recipe, pieces){
  const scale = calcScaleFactor(recipe, pieces);
  const list = recipeIngredientList(recipe);
  let cost = 0; const missing = [];
  list.forEach(i => {
    const amt = (Number(i.amount)||0) * scale; if(!(amt > 0)) return;
    const ing = getIng(i.ingredientId); const p = ing ? getFifoPrice(ing) : 0;
    if(!(p > 0)) missing.push(ing?.name || i.name || '?');
    cost += p * amt;
  });
  let levainCost = 0;
  if(recipe.levainAmount > 0){
    const lv = levainCostPerG();
    levainCost = lv.ppg * recipe.levainAmount * scale;
    if(!(lv.ppg > 0)) missing.push('Levain (' + (lv.flourName || 'barnarizs liszt') + ' ára)');
  }
  return { cost: cost + levainCost, levainCost, missing, noIngredients: list.length === 0 };
}

function calcRecipeCost(recipe, pieces) {
  const s = R.settings;
  const mat = calcRecipeMaterial(recipe, pieces);
  const rawCost = mat.cost;

  const hasBatchModel = (recipe.setupMin != null && recipe.setupMin !== '') ||
                        (recipe.perUnitMin != null && recipe.perUnitMin !== '');
  let laborCost, electricityCost, overheadCost = 0, bakeInfo = null;

  if (hasBatchModel){
    // 1) MUNKA: fix setup + darabbal skálázódó rész
    const laborMin = (Number(recipe.setupMin)||0) + (Number(recipe.perUnitMin)||0) * pieces;
    const laborH = laborMin / 60;
    laborCost = laborH * s.labor;

    // 2) SÜTŐ: tálca-ciklus. A batch annyi sütést igényel, amennyi a tálcáiból kijön.
    //    trays = felkerekít(db / db-per-tálca); sütések = felkerekít(trays / tálca-per-sütés)
    const unitsPerTray = Number(recipe.unitsPerTray) || 0;
    const traysPerCycle = Number(recipe.traysPerCycle) || 0;
    const trays = unitsPerTray > 0 ? Math.ceil(pieces / unitsPerTray) : 0;
    const bakeMin = Number(recipe.bakeMin)||0;
    const cycles = (trays > 0 && traysPerCycle > 0) ? Math.ceil(trays / traysPerCycle)
                 : (bakeMin > 0 ? 1 : 0);
    const ovenKw = (typeof avgOvenPowerKw==='function') ? avgOvenPowerKw() : 0;
    const duty = (typeof avgDutyFactor==='function') ? avgDutyFactor() : 0.7;
    const ovenH = cycles * (bakeMin / 60);
    const ovenKwh = ovenH * ovenKw * duty;

    // Mixer: perc/batch × mixer kW
    const mixerMin = Number(recipe.mixerMin)||0;
    const mixerKw = (typeof avgMixerPowerKw==='function') ? avgMixerPowerKw() : 0;
    const mixerKwh = (mixerMin/60) * mixerKw;

    electricityCost = (ovenKwh + mixerKwh) * s.electricity;
    bakeInfo = { laborMin, trays, cycles, bakeMin, ovenH, ovenKwh, mixerKwh, mixerMin };

    // 3) REZSI: a batch által lefoglalt FALÓRA-idő × üzemi óradíj.
    //    A munka és a sütés PÁRHUZAMOS (sütés közben a következő adagot készíted),
    //    ezért a hosszabbikat vesszük — NEM adjuk össze (az duplázás lenne).
    const rate = (typeof shopRate==='function') ? shopRate() : 0;
    const wallH = Math.max(laborH, ovenH);
    overheadCost = wallH * rate;
    bakeInfo.wallH = wallH;
  } else {
    laborCost = (recipe.laborH||1) * s.labor;
    electricityCost = (recipe.electricity||5) * s.electricity;
  }

  const toolCost = s.toolWear;
  const consumablesCost = s.consumables;
  const totalCost = rawCost + laborCost + electricityCost + overheadCost + toolCost + consumablesCost;
  const costPerUnit = totalCost / pieces;
  const priceNet = costPerUnit / (1 - s.margin/100);
  const priceGross = priceNet * (1 + s.vat/100);

  return { rawCost, laborCost, electricityCost, overheadCost, toolCost, consumablesCost,
    totalCost, costPerUnit, priceNet, priceGross, hasBatchModel, bakeInfo,
    levainCost: mat.levainCost, missing: mat.missing, noIngredients: mat.noIngredients };
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
  const num = id => { const v = document.getElementById(id)?.value; return (v===''||v==null) ? null : parseFloat(v); };
  const setupMin = num('r-setup-min'), perUnitMin = num('r-per-unit-min');
  const bakeMin = num('r-bake-min'), bakeTempC = num('r-bake-temp');
  const unitsPerTray = num('r-units-per-tray'), traysPerCycle = num('r-trays-per-cycle'), mixerMin = num('r-mixer-min');
  const elec = parseFloat(document.getElementById('r-electricity').value)||5;
  const s = R.settings;
  const box = document.getElementById('cost-preview');
  if (!box) return;

  const batch = (setupMin != null || perUnitMin != null);
  if (batch){
    // Batch-alapú előnézet — 3 referencia darabszámra mutatjuk az egységköltséget
    const rate = (typeof shopRate==='function') ? shopRate() : 0;
    const cap  = (typeof totalOvenCapacity==='function') ? totalOvenCapacity() : 0;
    const kw   = (typeof avgOvenPowerKw==='function') ? avgOvenPowerKw() : 0;
    const duty = (typeof avgDutyFactor==='function') ? avgDutyFactor() : 0.7;
    const calc = N => {
      const lMin = (setupMin||0) + (perUnitMin||0)*N;
      const lH = lMin/60, lCost = lH*s.labor;
      const trays = (unitsPerTray>0) ? Math.ceil(N/unitsPerTray) : 0;
      const cycles = (trays>0 && traysPerCycle>0) ? Math.ceil(trays/traysPerCycle) : (bakeMin>0?1:0);
      const oH = cycles*((bakeMin||0)/60);
      const mixKwh = ((mixerMin||0)/60) * ((typeof avgMixerPowerKw==='function')?avgMixerPowerKw():0);
      const eCost = (oH*kw*duty + mixKwh)*s.electricity;
      const oCost = Math.max(lH, oH)*rate;
      const fix = lCost+eCost+oCost+s.toolWear+s.consumables;
      return {N, lMin, cycles, fix, perUnit: fix/N};
    };
    const rows = [1,5,10,20].map(calc).map(r=>`
      <div class="cost-row"><span>${r.N} db — ${Math.round(r.lMin)} p munka · ${r.cycles} sütés</span>
        <span><b>${r.perUnit.toFixed(2)}</b> lej/db <span style="color:var(--text-soft);font-size:0.75rem">(${r.fix.toFixed(2)} össz)</span></span></div>`).join('');
    box.innerHTML = `
      <div class="cost-box">
        <div style="font-size:0.75rem;color:var(--teal-dark);margin-bottom:6px">🎯 Batch-alapú fix költség (alapanyag nélkül):</div>
        ${rows}
        ${cap>0 ? `<div class="text-xs text-soft mt-8">Sütő-kapacitás: ${cap} tálca/sütés · üzemi óradíj: ${rate.toFixed(2)} lej/h</div>`
                : `<div class="text-xs mt-8" style="color:var(--gold-dark)">⚠️ Nincs sütő felvéve a Beállításokban — a sütő-energia 0.</div>`}
      </div>
      <p class="text-xs text-soft mt-16">Látszik a lényeg: nagyobb tételnél a fix idő eloszlik → olcsóbb az egységár.</p>`;
    return;
  }

  const laborCost = laborH * s.labor;
  const elecCost = elec * s.electricity;
  const fixedCost = laborCost + elecCost + s.toolWear + s.consumables;
  box.innerHTML = `
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
      await kData.update('ingredients', upd, `id=eq.${upd.id}`);
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
    await kData.update('ingredients', {
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
// v2.56.3: ugyanazzal a számolással, mint a recept költség-füle és a gyártás (calcRecipeCost) — a Beállítások
// értékeivel (eddig nem létező beállításnevekből alapértékekkel számolt) — + hiányzó adatok listája
const COST_REF_PIECES = 10;   // referencia-sütés (a receptlista is 10 db-bal számol)
function renderCostAnalysis() {
  const tbody = document.getElementById('cost-analysis-tbody');
  const stats = document.getElementById('cost-stats');
  if (!tbody) return;
  const s = R.settings;
  const oven = (typeof activeOvens === 'function') ? activeOvens()[0] : null;
  const fmt = n => n.toFixed(2) + ' lej';

  const rows = [];
  const missingIng = new Map(), noIng = [];
  R.recipes.filter(r => !r.archived).forEach(recipe => {
    const product = window._adminProductsCache?.find(p => p.id === recipe.product_id);
    const currentPrice = Number(product?.price) || 0;
    const c = calcRecipeCost(recipe, COST_REF_PIECES);
    const fullN = Math.max(COST_REF_PIECES, (typeof ovenCapacityPieces === 'function' && oven) ? ovenCapacityPieces(oven, recipe) : 0, 15);
    const cFull = calcRecipeCost(recipe, fullN);
    const netPrice = currentPrice / (1 + (Number(s.vat) || 0) / 100);
    const diff = netPrice - c.costPerUnit;
    if (c.noIngredients) noIng.push(recipe.name);
    c.missing.forEach(n => { if (!missingIng.has(n)) missingIng.set(n, []); missingIng.get(n).push(recipe.name); });
    rows.push({ recipe, currentPrice, netPrice, c, cFull, fullN, diff, matPerUnit: c.rawCost / COST_REF_PIECES });
  });

  const priced = rows.filter(r => r.currentPrice > 0 && !r.c.noIngredients);
  const avgMargin = priced.length ? priced.reduce((t, r) => t + (r.netPrice > 0 ? r.diff / r.netPrice : 0), 0) / priced.length * 100 : 0;
  const belowCost = priced.filter(r => r.diff < 0).length;
  if (stats) stats.innerHTML = [
    {label:'Aktív receptek', val: rows.length, color:'var(--teal-dark)'},
    {label:'Átlagos fedezet (nettó árból)', val: priced.length ? avgMargin.toFixed(1)+'%' : '—', color: avgMargin > 20 ? '#059669' : '#dc2626'},
    {label:'Hiányos recept (nincs összetevő / ár)', val: rows.filter(r => r.c.noIngredients || r.c.missing.length).length, color: '#d97706'},
    {label:'Önköltség alatt', val: belowCost, color: belowCost > 0 ? '#dc2626' : '#059669'},
  ].map(x => `<div class="card" style="border-left:4px solid ${x.color};padding:14px 18px">
    <div style="font-size:1.6rem;font-weight:800;color:${x.color};font-family:'Fraunces',serif">${x.val}</div>
    <div style="font-size:0.78rem;color:var(--text-soft);margin-top:2px">${x.label}</div>
  </div>`).join('');

  tbody.innerHTML = rows.map(r => {
    const hasPrice = r.currentPrice > 0, incomplete = r.c.noIngredients || r.c.missing.length > 0, ok = r.diff >= 0;
    const flag = r.c.noIngredients ? '<span style="color:#d97706" title="Nincs összetevő">⚠️ nincs összetevő</span>'
      : (r.c.missing.length ? `<span style="color:#d97706" title="${esc(r.c.missing.join(', '))}">⚠️ ${r.c.missing.length} ár hiányzik</span>` : '');
    return `<tr style="${hasPrice && !ok && !incomplete ? 'background:#fff1f2' : ''}">
      <td style="font-weight:600">${esc(r.recipe.name)}<div style="font-size:0.7rem;font-weight:400">${flag}</div></td>
      <td class="num">${r.c.noIngredients ? '—' : fmt(r.matPerUnit)}</td>
      <td class="num">${r.c.noIngredients ? '—' : fmt(r.c.costPerUnit)}</td>
      <td class="num">${r.c.noIngredients ? '—' : fmt(r.c.priceGross)}</td>
      <td class="num">${hasPrice ? fmt(r.currentPrice) : '<span style="color:#dc2626">Nincs ár</span>'}</td>
      <td class="num" style="color:${ok?'#059669':'#dc2626'};font-weight:600">${hasPrice && !r.c.noIngredients ? (ok?'+':'')+r.diff.toFixed(2)+' lej' + (r.netPrice > 0 ? ' ('+(r.diff/r.netPrice*100).toFixed(0)+'%)' : '') : '—'}</td>
      <td class="num" style="color:var(--text-soft)">${r.c.noIngredients ? '—' : fmt(r.cFull.costPerUnit) + `<div style="font-size:0.66rem">${r.fullN} db</div>`}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text-soft);padding:20px">Nincs aktív recept</td></tr>';

  // hiányzó adatok — mit kell pótolni a pontos önköltséghez
  const box = document.getElementById('cost-missing');
  if (box) {
    const lv = levainCostPerG();
    const setNotes = [];
    if (!(Number(s.monthlyOverhead) > 0) || !(Number(s.monthlyProdHours) > 0)) setNotes.push('havi rezsi / havi termelő óra (üzemi óradíj) — Beállítások → Pénzügyi');
    if (!oven) setNotes.push('nincs sütő felvéve — Törzsadatok → Eszközök (sütő-energia 0)');
    const items = [
      noIng.length ? `<div style="margin-bottom:8px"><b>Receptek összetevő nélkül (${noIng.length}):</b> ${noIng.map(esc).join(', ')}</div>` : '',
      missingIng.size ? `<div style="margin-bottom:8px"><b>Alapanyagok ár nélkül (${missingIng.size}):</b> ${[...missingIng.entries()].map(([n, rs]) => `${esc(n)} <span style="color:var(--text-soft)">(${rs.length} recept)</span>`).join(', ')}<div style="font-size:0.72rem;color:var(--text-soft)">Ár = a készleten lévő legrégebbi tétel beszerzési ára (bevételezés), ennek híján az alapanyag alapára.</div></div>` : '',
      `<div style="margin-bottom:8px"><b>Levain:</b> ${lv.ppg > 0 ? `${(lv.ppg*1000).toFixed(2)} lej/kg (${lv.src === 'készlet' ? 'Kész levain készletár' : 'képletből: ' + esc(lv.flourName) + ' + víz'})` : `<span style="color:#d97706">nincs ár — add meg a(z) ${esc(lv.flourName || 'barnarizs liszt')} árát</span>`}</div>`,
      setNotes.length ? `<div><b>Beállítások:</b> ${setNotes.map(esc).join(' · ')}</div>` : '',
    ].join('');
    box.innerHTML = `<div class="card-head"><div class="card-title">🔎 Hiányzó adatok a pontos önköltséghez</div></div><div class="card-body" style="font-size:0.82rem">${items}
      <div style="font-size:0.72rem;color:var(--text-soft);margin-top:8px">Számolás: ${COST_REF_PIECES} db-os sütés; munka ${Number(s.labor)||0} lej/h, áram ${Number(s.electricity)||0} lej/kWh, haszon ${Number(s.margin)||0}%, ÁFA ${Number(s.vat)||0}% (Beállítások → Pénzügyi). A fedezet a jelenlegi ár nettó részéből számol.</div></div>`;
  }
}


// ============================================================
// v2.42.0 MOBIL: Sidebar drawer toggle
// ============================================================
function toggleSidebar() {
  const sb = document.querySelector('.sidebar');
  const ov = document.querySelector('.sidebar-overlay');
  if (!sb) return;
  const open = sb.classList.toggle('open');
  if (ov) ov.classList.toggle('visible', open);
  document.body.style.overflow = open ? 'hidden' : '';
}
function closeSidebar() {
  const sb = document.querySelector('.sidebar');
  const ov = document.querySelector('.sidebar-overlay');
  if (sb) sb.classList.remove('open');
  if (ov) ov.classList.remove('visible');
  document.body.style.overflow = '';
}
// Bezárás minden nav-item click után (mobilon)
document.addEventListener('click', function(e){
  const ni = e.target.closest('.nav-item');
  if (ni && window.innerWidth <= 900) {
    setTimeout(closeSidebar, 100); // kis delay hogy a navigáció lefusson
  }
});
if (typeof window !== 'undefined') {
  window.toggleSidebar = toggleSidebar;
  window.closeSidebar = closeSidebar;
  if (typeof calcCost === "function") window.calcCost = calcCost;
}
