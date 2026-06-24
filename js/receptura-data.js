// ===== DATA =====
const DATA_VERSION = 'kerek_recipe_v1';
let _s = null;
try { _s = JSON.parse(localStorage.getItem('kerek_recipe_data')); } catch(e) {}
if (!_s || _s._v !== DATA_VERSION) _s = null;

let R = _s || {
  _v: DATA_VERSION,
  settings: {
    vat: 19, margin: 50, labor: 55, electricity: 1.5,
    toolWear: 5, consumables: 0.5, bakeLoss: 16, basePortion: 1000,
    levain: { starter: 33, water: 30, flour: 37 },
    refill: { flour: 52, water: 48 }
  },
  recipeCategories: [],
  ingredientCategories: ['Vegyes', 'Lisztek', 'Keményítők', 'Magvak', 'Élelmiszerek', 'Egyéb'],
  ingredients: [],
  recipes: [],
  batches: [],
  stock: {},
};

function save() { R._v = DATA_VERSION; localStorage.setItem('kerek_recipe_data', JSON.stringify(R)); }

// v2.37.0 fix #11/#15: full reload Realtime callback-hez, nem hív loadAllData-t mert az nem létezik fv-ként
// Csak a kritikus táblákat tölti újra (recipes + ingredients + products + batches)
async function reloadReceptData() {
  try {
    // Products cache frissítése (admin termékek)
    try {
      const prods = await sb.query('products', {filter:'deleted_at=is.null', limit:500});
      window._adminProductsCache = prods || [];
    } catch(e) { console.warn('Products reload:', e.message); }

    // Recipes újraolvasása DB-ből (felülírja R.recipes-t a friss adatokkal)
    const [dbRecipes, dbIngredients, dbSteps] = await Promise.all([
      kData.query('recipes', {order:'id', limit:500}),
      kData.query('recipe_ingredients', {order:'recipe_id,sort_order', limit:5000}),
      kData.query('recipe_steps', {order:'recipe_id,sort_order', limit:2000}),
    ]);
    if (dbRecipes && dbRecipes.length > 0) {
      R.recipes = dbRecipes.map(r => ({
        id: r.id, name: r.name, category: r.category||'Egyéb',
        archived: r.archived || false,
        version: r.version || 1,
        activatedAt: r.activated_at || null,
        product_id: r.product_id||null,
        basePortion: r.base_portion||1000, bakeLoss: r.bake_loss||16,
        unitWeight: r.unit_weight||1000,
        temp1: r.temp1||230, time1: r.time1||20,
        temp2: r.temp2||180, time2: r.time2||70,
        desc: r.description||'', levainAmount: r.levain_amount||0,
        laborH: r.labor_h||1, electricity: r.electricity||5,
        marketing: r.marketing_desc||'',
        ingredientLabel: r.ingredient_label||'',
        allergens: r.allergens||'',
        nutrition: r.nutrition||null,
        productCode: r.code || '',
        productPrice: r.product_price||0,
        dryIngredients: (dbIngredients||[]).filter(i=>i.recipe_id===r.id&&i.sub_type==='flour').map(i=>({name:i.name,amount:i.amount,ingredientId:i.ingredient_id,subType:i.sub_type})),
        otherDryIngredients: (dbIngredients||[]).filter(i=>i.recipe_id===r.id&&(i.sub_type==='other_dry'||i.sub_type==='spice'||i.sub_type==='additive')).map(i=>({name:i.name,amount:i.amount,ingredientId:i.ingredient_id,subType:i.sub_type})),
        wetIngredients: (dbIngredients||[]).filter(i=>i.recipe_id===r.id&&i.sub_type==='wet').map(i=>({name:i.name,amount:i.amount,ingredientId:i.ingredient_id,subType:i.sub_type})),
        starterIngredients: (dbIngredients||[]).filter(i=>i.recipe_id===r.id&&i.sub_type==='starter').map(i=>({name:i.name,amount:i.amount,ingredientId:i.ingredient_id,subType:i.sub_type})),
        allIngredients: (dbIngredients||[]).filter(i=>i.recipe_id===r.id).map(i=>({name:i.name,amount:i.amount,ingredientId:i.ingredient_id,subType:i.sub_type||'other_dry'})),
        steps: (dbSteps||[]).filter(s=>s.recipe_id===r.id).map(s=>({title:s.title,desc:s.description,timer:s.timer_minutes})),
      }));
      // Code enrichment from products cache
      if (window._adminProductsCache && window._adminProductsCache.length) {
        R.recipes.forEach(rec => {
          if (rec.product_id && !rec.productCode) {
            const prod = _adminProductsCache.find(p => p.id === rec.product_id);
            if (prod?.code) rec.productCode = prod.code;
          }
        });
      }
      // v2.37.0: ne save()-eljünk a localStorage-ba! Az felülírná a friss adatot egy snapshot-tal.
    }

    // Ingredient batches reload (stock értékek frissülnek)
    try {
      const [dbIngList, dbBatches] = await Promise.all([
        kData.query('ingredients', {order:'category,name', limit:500}),
        kData.query('ingredient_batches', {order:'ingredient_id,received_date', limit:5000}),
      ]);
      if (dbIngList && dbIngList.length > 0) {
        // Csak a stock-frissítés (a többi mező marad)
        R.batches = (dbBatches||[]).map(b => ({
          id: b.id, ingredientId: b.ingredient_id,
          receivedDate: b.received_date, qtyReceivedG: b.qty_received_g,
          qtyRemainingG: b.qty_remaining_g, pricePerG: b.price_per_g || 0,
          supplierName: b.supplier_name || '', sourceType: b.source_type || 'purchase',
        }));
        // Re-compute stock per ingredient
        R.ingredients.forEach(ing => {
          const ingBatches = R.batches.filter(b => b.ingredientId === ing.id && b.qtyRemainingG > 0);
          ing.totalStockG = ingBatches.reduce((s, b) => s + b.qtyRemainingG, 0);
        });
      }
    } catch(e) { console.warn('Ingredients reload:', e.message); }
    // v2.40.0: suppliers reload
    try {
      const dbSuppliers = await kData.query('suppliers', {order: 'name'});
      if (Array.isArray(dbSuppliers) && typeof mapSupplierDb === 'function') {
        R.suppliers = dbSuppliers.map(mapSupplierDb);
      }
    } catch(_) {}
  } catch(e) { console.warn('reloadReceptData:', e.message); }
}

// v2.37.0: export window-ra hogy a Realtime callback elérje
if (typeof window !== 'undefined') { window.reloadReceptData = reloadReceptData; }


// ===== AUTH =====
let loggedIn = false;
function loginError(msg) {
  const el = document.getElementById('login-error');
  if(el) { el.textContent = msg; }
  const pw = document.getElementById('login-pw');
  if(pw) { pw.style.border='1.5px solid #f87171'; pw.focus(); pw.addEventListener('input', ()=>{ if(el) el.textContent=''; pw.style.border=''; }, {once:true}); }
}
async function doLogin() {
  const pw = document.getElementById('login-pw').value;
  if(!pw) { loginError('⚠️ Add meg a jelszót!'); return; }
  try {
    // v2.48.0: biztonságos szerver-oldali validálás (admin-auth, module=receptura).
    // Ha nincs külön receptúra jelszó, visszaesik az admin jelszóra.
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPABASE_KEY },
      body: JSON.stringify({ password: pw, module: 'receptura' })
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 429) { loginError(`⚠️ Túl sok próbálkozás. Várj ${data.wait_seconds || 60} mp-et.`); return; }
    if (res.ok && data.success) {
      loggedIn = true;
      if (typeof window !== 'undefined') window._kerekPw = pw;
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('user-badge').textContent = '👩‍💼 Technológus';
      initApp();
      if (typeof kerekSaveRememberedPassword === 'function') kerekSaveRememberedPassword(pw);
    } else { loginError('❌ Hibás jelszó! Próbáld újra.'); }
  } catch(e) {
    loginError('⚠️ Hálózati hiba a belépéskor. Próbáld újra.');
  }
}
function logout() {
  localStorage.removeItem('kerek_admin_data');
  localStorage.removeItem('kerek_data');
  localStorage.removeItem('kerek_recipe_data');
  window.location.href = 'index.html';
}

async function initApp() {
  showVersionBadge();
  document.getElementById('topbar-sub').textContent = new Date().toLocaleDateString('hu-HU',{year:'numeric',month:'long',day:'numeric'});

  // Supabase-ből tölt minden beállítást
  const settingLoads = [
    ['recipe_ai_settings', v=>{ if(v&&typeof v==='object'){ R.settings.apiKey=v.apiKey||R.settings.apiKey; R.settings.aiProvider=v.aiProvider||'anthropic'; R.settings.aiModel=v.aiModel||'claude-sonnet-4-20250514'; R.settings.aiUrl=v.aiUrl||''; } }],
    ['recipe_financial_settings', v=>{ if(v&&typeof v==='object') Object.assign(R.settings,v); }],
    ['recipe_baking_settings', v=>{ if(v&&typeof v==='object') Object.assign(R.settings,v); }],
    ['categories', v=>{ if(Array.isArray(v) && v.length>0) R.recipeCategories=v; }], // Közös admin kategóriák
    ['baking_days_default', v=>{ if(Array.isArray(v) && v.length>0) R.settings.bakingDaysDefault=v; }],
  ];
  await Promise.all(settingLoads.map(async ([key, apply]) => {
    try { const val = await sb.getSetting(key); if(val!==null) apply(val); }
    catch(e) { console.warn('initApp getSetting ['+key+']:', e.message); }
  }));

  // Admin termékek betöltése cache-be
  try {
    const prods = await sb.query('products', {order:'name', limit:500});
    window._adminProductsCache = prods || [];
  } catch(e) { window._adminProductsCache = []; }

  // Receptek betöltése Supabase-ből (felülírja a localStorage adatait)
  try {
    const [dbRecipes, dbIngredients, dbSteps] = await Promise.all([
      kData.query('recipes', {order:'id', limit:500}),
      kData.query('recipe_ingredients', {order:'recipe_id,sort_order', limit:5000}),
      kData.query('recipe_steps', {order:'recipe_id,sort_order', limit:2000}),
    ]);
    if(dbRecipes && dbRecipes.length > 0) {
      R.recipes = dbRecipes.map(r => ({
        id: r.id, name: r.name, category: r.category||'Egyéb',
        archived: r.archived || false,
        version: r.version || 1,
        activatedAt: r.activated_at || null,
        product_id: r.product_id||null,
        basePortion: r.base_portion||1000, bakeLoss: r.bake_loss||16,
        unitWeight: r.unit_weight||1000,
        temp1: r.temp1||230, time1: r.time1||20,
        temp2: r.temp2||180, time2: r.time2||70,
        desc: r.description||'', levainAmount: r.levain_amount||0,
        laborH: r.labor_h||1, electricity: r.electricity||5,
        marketing: r.marketing_desc||'',
        ingredientLabel: r.ingredient_label||'',
        allergens: r.allergens||'',
        nutrition: r.nutrition||null,
        productCode: r.code || '', // enriched below from products cache
        productPrice: r.product_price||0,
        // Összetevők
        dryIngredients: (dbIngredients||[]).filter(i=>i.recipe_id===r.id&&i.sub_type==='flour').map(i=>({name:i.name,amount:i.amount,ingredientId:i.ingredient_id,subType:i.sub_type})),
        otherDryIngredients: (dbIngredients||[]).filter(i=>i.recipe_id===r.id&&(i.sub_type==='other_dry'||i.sub_type==='spice'||i.sub_type==='additive')).map(i=>({name:i.name,amount:i.amount,ingredientId:i.ingredient_id,subType:i.sub_type})),
        wetIngredients: (dbIngredients||[]).filter(i=>i.recipe_id===r.id&&i.sub_type==='wet').map(i=>({name:i.name,amount:i.amount,ingredientId:i.ingredient_id,subType:i.sub_type})),
        starterIngredients: (dbIngredients||[]).filter(i=>i.recipe_id===r.id&&i.sub_type==='starter').map(i=>({name:i.name,amount:i.amount,ingredientId:i.ingredient_id,subType:i.sub_type})),
        allIngredients: (dbIngredients||[]).filter(i=>i.recipe_id===r.id).map(i=>({name:i.name,amount:i.amount,ingredientId:i.ingredient_id,subType:i.sub_type||'other_dry'})),
        steps: (dbSteps||[]).filter(s=>s.recipe_id===r.id).map(s=>({title:s.title,desc:s.description,timer:s.timer_minutes})),
      }));
      // Kód enrichment: products táblából (product_id alapján)
      if(window._adminProductsCache && window._adminProductsCache.length) {
        R.recipes.forEach(rec => {
          if(rec.product_id && !rec.productCode) {
            const prod = _adminProductsCache.find(p=>p.id===rec.product_id);
            if(prod?.code) rec.productCode = prod.code;
          }
        });
      }
      save(); // localStorage-ba is menti
    }
  } catch(e) { console.warn('Receptek Supabase betöltés sikertelen:', e.message); }

  // Alapanyagok betöltése Supabase-ből (felváltja a hardkódolt listát)
  try {
    let dbIngList = [], dbBatches = [], dbFamilies = [];
    try {
      [dbIngList, dbBatches, dbFamilies] = await Promise.all([
        kData.query('ingredients', {order:'category,name', limit:500}),
        kData.query('ingredient_batches', {order:'ingredient_id,received_date', limit:5000}),
        kData.query('ingredient_families', {order:'name', limit:200}).catch(()=>[]),
      ]);
    } catch(batchErr) {
      // ingredient_batches might not exist yet - try ingredients only
      try { dbIngList = await kData.query('ingredients', {order:'category,name', limit:500}); } catch(e) {}
      console.warn('ingredient_batches nem elérhető - futtasd a DB migrációt!');
    }
    R.ingredientFamilies = dbFamilies || [];  // v2.35.0
    if(dbIngList && dbIngList.length > 0) {
      // v2.39.2: suppliers a DB ingredient_batches.supplier_name-ből származtatva (eddig localStorage-ben)
      // Eredmény: minden alapanyag amelyiknek volt bevétele, automatikusan megkapja a beszállító(it)
      // Eszközfüggetlen, megbízható
      const suppliersByIngId = {};
      (dbBatches || []).forEach(b => {
        if (!b.supplier_name) return;
        if (!suppliersByIngId[b.ingredient_id]) suppliersByIngId[b.ingredient_id] = new Set();
        suppliersByIngId[b.ingredient_id].add(b.supplier_name);
      });
      R.ingredients = dbIngList.map(i => ({
        id: i.id, name: i.name, cat: i.category, subType: i.sub_type,
        unit: i.unit || 'g',  // M0: natív mértékegység (g/kg/ml/l/db)
        altUnit: i.alt_unit || null,    // M0 2a: másodlagos egység (ml/g)
        altFactor: i.alt_factor || 0,   // M0 2a: 1 elsődleges = altFactor másodlagos
        materialType: i.material_type || 'consumable',  // v2.35.0
        preferredSupplierId: i.preferred_supplier_id || null,  // v2.40.0
        familyId: i.family_id || null,                  // v2.35.0
        leadTimeDays: i.lead_time_days || 5,
        orderCycleDays: i.order_cycle_days || 7,
        safetyFactor: i.safety_factor || 1.5,
        minStockAutoG: i.min_stock_auto_g || 0,
        maxStockAutoG: i.max_stock_auto_g || 0,
        minStockOverrideG: i.min_stock_override_g ?? null,
        maxStockOverrideG: i.max_stock_override_g ?? null,
        autoUpdatedAt: i.auto_updated_at || null,
        basePriceG: i.base_price_per_g || 0,
        notes: i.notes || '',
        suppliers: [...(suppliersByIngId[i.id] || [])],  // v2.39.2 DB-derivált
        // Effective min/max (override ?? auto)
        get minStock() { return this.minStockOverrideG ?? this.minStockAutoG; },
        get maxStock() { return this.maxStockOverrideG ?? this.maxStockAutoG; },
        get isOverride() { return this.minStockOverrideG !== null || this.maxStockOverrideG !== null; },
      }));
    }
    if(dbBatches) {
      R.batches = dbBatches.map(b => ({
        id: b.id, ingredientId: b.ingredient_id,
        receivedDate: b.received_date,
        qtyReceivedG: b.qty_received_g,
        qtyRemainingG: b.qty_remaining_g,
        pricePerG: b.price_per_g || 0,
        priceGrossPerUnit: b.price_gross_per_unit || 0,
        packageSizeG: b.package_size_g || 1000,
        supplierName: b.supplier_name || '',
        sourceType: b.source_type || 'purchase',
        notes: b.notes || '',
      }));
      // Compute totalStockG per ingredient from batches
      R.ingredients.forEach(ing => {
        const ingBatches = R.batches.filter(b => b.ingredientId === ing.id && b.qtyRemainingG > 0);
        ing.totalStockG = ingBatches.reduce((s, b) => s + b.qtyRemainingG, 0);
        // FIFO price = oldest batch with stock
        const fifoB = ingBatches.sort((a,b) => a.receivedDate.localeCompare(b.receivedDate))[0];
        ing.fifoPrice = fifoB ? fifoB.pricePerG : 0;
        // Weighted average price
        const totalStock = ing.totalStockG;
        ing.avgPrice = totalStock > 0
          ? ingBatches.reduce((s, b) => s + b.pricePerG * b.qtyRemainingG, 0) / totalStock
          : 0;
        ing.suppliers = [...new Set(ingBatches.map(b => b.supplierName).filter(Boolean))];
      });
    }
    // Calc auto min/max from orders (async, non-blocking)
    calcAutoMinMax().catch(e => console.warn('autoMinMax:', e.message));
  } catch(e) { console.warn('Ingredients DB load:', e.message); }

  auditLog('login', 'Receptúra', 'Sikeres belépés');
  nav('recipes');

  // v2.36.0 fix #11: Realtime subscription instead of partial polling
  // (was polling only ingredient_batches, missing new recipes/products from admin)
  if (window._kerekReceptUnsub) { try { window._kerekReceptUnsub(); } catch(e){} }
  if (typeof sb.subscribe === 'function') {
    try {
      let _rDebounce = null;
      const RECEPT_RT_TABLES = ['products']; // csak products marad anon (vevő-facing, Fázis 2); recipes/recipe_ingredients/ingredients/ingredient_batches + suppliers + processing_batches anon-lezárt
      window._kerekReceptUnsub = sb.subscribe(RECEPT_RT_TABLES, ({table}) => {
        if (_rDebounce) clearTimeout(_rDebounce);
        _rDebounce = setTimeout(async () => {
          try {
            await reloadReceptData();
            const activeView = document.querySelector('.view.active')?.id?.replace('view-','');
            // Re-render the current view
            const renderFn = {
              'recipes': () => typeof renderRecipes === 'function' && renderRecipes(),
              'stock': () => { if (typeof renderStock === 'function') renderStock(); if (typeof renderStockAlerts === 'function') renderStockAlerts(); },
              'ingredients': () => typeof renderIngredients === 'function' && renderIngredients(),
              'processing': () => typeof initProcessingView === 'function' && initProcessingView(),
            }[activeView];
            if (renderFn) renderFn();
          } catch(e) { console.warn('Receptura Realtime reload:', e.message); }
        }, 500);
      });
    } catch(e) { console.warn('Receptura Realtime subscribe failed:', e.message); }
  }

  // v2.26.0: Unified 30s polling — backup to Realtime (ingredient_batches stock updates)
  // Tables that affect receptura views: orders, order_status, ingredient_batches, recipes
  startUnifiedPolling(async () => {
    try {
      // Re-fetch ingredient batches (FIFO stock changes from purchases/baking)
      const batches = await kData.query('ingredient_batches', { limit: 2000 });
      const newBatchesJson = JSON.stringify((batches||[]).map(b=>({i:b.ingredient_id,r:b.qty_remaining_g})));
      const oldBatchesJson = JSON.stringify((R.batches||[]).map(b=>({i:b.ingredientId,r:b.qtyRemainingG})));
      if (newBatchesJson !== oldBatchesJson) {
        R.batches = (batches||[]).map(b => ({
          id: b.id, ingredientId: b.ingredient_id, receivedDate: b.received_date,
          qtyReceivedG: b.qty_received_g, qtyRemainingG: b.qty_remaining_g,
          pricePerG: b.price_per_g, supplierName: b.supplier_name,
          sourceType: b.source_type, processingId: b.processing_id, notes: b.notes
        }));
        // Recompute per-ingredient stock
        if (R.ingredients) {
          R.ingredients.forEach(ing => {
            const ingBatches = R.batches.filter(b => b.ingredientId === ing.id && b.qtyRemainingG > 0);
            ing.totalStockG = ingBatches.reduce((s, b) => s + b.qtyRemainingG, 0);
            const fifoB = ingBatches.sort((a,b) => a.receivedDate.localeCompare(b.receivedDate))[0];
            ing.fifoPrice = fifoB ? fifoB.pricePerG : 0;
          });
        }
        // Re-render active view
        const activeView = document.querySelector('.view.active')?.id?.replace('view-','');
        if (activeView === 'stock') { if (typeof renderStock === 'function') renderStock(); if (typeof renderStockAlerts === 'function') renderStockAlerts(); }
        else if (activeView === 'production-prep') { /* user must click recalc, but stock display updates */ }
      }
    } catch(e) { console.warn('Receptura polling:', e.message); }
  }, 30000);
}


// ============================================================
// v2.43.11: "Maradjak bejelentkezve" — localStorage-ban tárolt jelszó
// ============================================================
const KEREK_REMEMBER_KEY = 'kerek_receptura_remember_pw';

function kerekSaveRememberedPassword(pw) {
  try {
    const cb = document.getElementById('remember-pw');
    if (cb && cb.checked && pw) {
      localStorage.setItem(KEREK_REMEMBER_KEY, btoa(unescape(encodeURIComponent(pw))));
    } else {
      localStorage.removeItem(KEREK_REMEMBER_KEY);
    }
  } catch(e) { console.warn('Remember pw save failed:', e); }
}

function kerekLoadRememberedPassword() {
  try {
    const saved = localStorage.getItem(KEREK_REMEMBER_KEY);
    if (!saved) return;
    const pw = decodeURIComponent(escape(atob(saved)));
    const input = document.getElementById('login-pw');
    const cb = document.getElementById('remember-pw');
    if (input && !input.value) input.value = pw;
    if (cb) cb.checked = true;
  } catch(e) { console.warn('Remember pw load failed:', e); }
}

function kerekForgetRememberedPassword() {
  try { localStorage.removeItem(KEREK_REMEMBER_KEY); } catch(e) {}
  const input = document.getElementById('login-pw');
  const cb = document.getElementById('remember-pw');
  if (input) input.value = '';
  if (cb) cb.checked = false;
}

if (typeof window !== 'undefined') {
  window.kerekSaveRememberedPassword = kerekSaveRememberedPassword;
  window.kerekForgetRememberedPassword = kerekForgetRememberedPassword;
  // Auto-load on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', kerekLoadRememberedPassword);
  } else {
    kerekLoadRememberedPassword();
  }
}
