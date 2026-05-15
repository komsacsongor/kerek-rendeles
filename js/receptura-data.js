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
    const storedPw = await sb.getSetting('admin_password');
    const adminPw = storedPw || 'admin';
    if (pw === adminPw) {
      loggedIn = true;
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('user-badge').textContent = '👩‍💼 Technológus';
      initApp();
    } else { loginError('❌ Hibás jelszó! Próbáld újra.'); }
  } catch(e) {
    // Fallback
    if (pw === 'admin') {
      loggedIn = true;
      document.getElementById('login-screen').style.display = 'none';
      initApp();
    } else { loginError('❌ Hibás jelszó!'); }
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
    ['recipe_categories', v=>{ /* deprecated, categories-t használjuk */ }],
    // recipe_stock deprecated - stock now from ingredient_batches
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
      sb.query('recipes', {order:'id', limit:500}),
      sb.query('recipe_ingredients', {order:'recipe_id,sort_order', limit:5000}),
      sb.query('recipe_steps', {order:'recipe_id,sort_order', limit:2000}),
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
    let dbIngList = [], dbBatches = [];
    try {
      [dbIngList, dbBatches] = await Promise.all([
        sb.query('ingredients', {order:'category,name', limit:500}),
        sb.query('ingredient_batches', {order:'ingredient_id,received_date', limit:5000}),
      ]);
    } catch(batchErr) {
      // ingredient_batches might not exist yet - try ingredients only
      try { dbIngList = await sb.query('ingredients', {order:'category,name', limit:500}); } catch(e) {}
      console.warn('ingredient_batches nem elérhető - futtasd a DB migrációt!');
    }
    if(dbIngList && dbIngList.length > 0) {
      R.ingredients = dbIngList.map(i => ({
        id: i.id, name: i.name, cat: i.category, subType: i.sub_type,
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
}
