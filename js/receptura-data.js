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
  ingredients: [
    // subType: 'flour'=száraz liszt/korpa, 'other_dry'=só/cukor/élesztő/egész mag, 'wet'=nedves, 'starter'=kovász
    {id:1,name:'Víz',cat:'Vegyes',subType:'wet',suppliers:[{source:'',priceGross:6,priceNet:4.86,package:1000,stock:10000,date:'2026-01-01'}],pricePerG:0.00486,minStock:5000,criticalStock:8000},
    {id:2,name:'Olívaolaj',cat:'Vegyes',subType:'wet',suppliers:[{source:'Grizly',priceGross:60,priceNet:48.6,package:1000,stock:2000,date:'2026-01-01'}],pricePerG:0.0486,minStock:500,criticalStock:800},
    {id:3,name:'Só',cat:'Vegyes',subType:'other_dry',suppliers:[{source:'Grizly',priceGross:8,priceNet:6.48,package:1000,stock:1500,date:'2026-01-01'}],pricePerG:0.00648,minStock:500,criticalStock:700},
    {id:4,name:'Kovász',cat:'Vegyes',subType:'starter',suppliers:[{source:'',priceGross:20,priceNet:16.2,package:1000,stock:500,date:'2026-01-01'}],pricePerG:0.0162,minStock:300,criticalStock:400},
    {id:5,name:'Sütőpor',cat:'Vegyes',subType:'other_dry',suppliers:[{source:'Kaufland',priceGross:1.65,priceNet:1.34,package:30,stock:120,date:'2026-01-01'}],pricePerG:0.0446,minStock:100,criticalStock:150},
    {id:6,name:'Guar gumi',cat:'Vegyes',subType:'other_dry',suppliers:[{source:'Top Ingrediente',priceGross:29,priceNet:23.49,package:1000,stock:800,date:'2026-01-01'}],pricePerG:0.0235,minStock:200,criticalStock:300},
    {id:7,name:'Édesrizs liszt',cat:'Lisztek',subType:'flour',suppliers:[{source:'asianfood.ro',priceGross:15,priceNet:12.15,package:1000,stock:3000,date:'2026-01-01'}],pricePerG:0.01215,minStock:1000,criticalStock:1500},
    {id:8,name:'Zabliszt',cat:'Lisztek',subType:'flour',suppliers:[{source:'Grizly',priceGross:15,priceNet:12.15,package:1000,stock:2500,date:'2026-01-01'},{source:'Naturking',priceGross:14,priceNet:11.34,package:500,stock:1000,date:'2026-02-01'}],pricePerG:0.01215,minStock:1000,criticalStock:1500},
    {id:9,name:'Barnarizs liszt',cat:'Lisztek',subType:'flour',suppliers:[{source:'naturking.ro',priceGross:12,priceNet:9.72,package:1000,stock:4000,date:'2026-01-01'}],pricePerG:0.00972,minStock:2000,criticalStock:3000},
    {id:10,name:'Kukorica liszt',cat:'Lisztek',subType:'flour',suppliers:[{source:'Grizly',priceGross:10,priceNet:8.1,package:1000,stock:1500,date:'2026-01-01'}],pricePerG:0.0081,minStock:500,criticalStock:700},
    {id:11,name:'Világos hajdina liszt',cat:'Lisztek',subType:'flour',suppliers:[{source:'Grizly',priceGross:12,priceNet:9.72,package:1000,stock:2000,date:'2026-01-01'}],pricePerG:0.00972,minStock:1000,criticalStock:1500},
    {id:12,name:'Kukorica keményítő',cat:'Keményítők',subType:'flour',suppliers:[{source:'Paprica.ro',priceGross:13,priceNet:10.53,package:1000,stock:1500,date:'2026-01-01'}],pricePerG:0.01053,minStock:500,criticalStock:700},
    {id:13,name:'Tápióka liszt',cat:'Keményítők',subType:'flour',suppliers:[{source:'Bioshi',priceGross:75,priceNet:60.75,package:5000,stock:8000,date:'2026-01-01'}],pricePerG:0.01215,minStock:2000,criticalStock:3000},
    {id:14,name:'Lenmag (darált)',cat:'Magvak',subType:'flour',suppliers:[{source:'Grizly',priceGross:14,priceNet:11.34,package:1000,stock:1000,date:'2026-01-01'}],pricePerG:0.01134,minStock:500,criticalStock:700},
    {id:15,name:'Chia mag',cat:'Magvak',subType:'other_dry',suppliers:[{source:'Grizly',priceGross:22.99,priceNet:18.62,package:1000,stock:800,date:'2026-01-01'}],pricePerG:0.01862,minStock:500,criticalStock:700},
    {id:16,name:'Psyllium / Útifű',cat:'Magvak',subType:'other_dry',suppliers:[{source:'Grizly',priceGross:51.19,priceNet:41.46,package:500,stock:600,date:'2026-01-01'}],pricePerG:0.08293,minStock:300,criticalStock:400},
    {id:17,name:'Növényi vaj',cat:'Élelmiszerek',subType:'wet',suppliers:[{source:'Kaufland',priceGross:17,priceNet:13.77,package:200,stock:400,date:'2026-01-01'}],pricePerG:0.06885,minStock:200,criticalStock:300},
    {id:18,name:'Növényi tej',cat:'Élelmiszerek',subType:'wet',suppliers:[{source:'DM',priceGross:7,priceNet:5.67,package:1000,stock:3000,date:'2026-01-01'}],pricePerG:0.00567,minStock:1000,criticalStock:1500},
    {id:19,name:'Ecet',cat:'Élelmiszerek',subType:'wet',suppliers:[{source:'Kaufland',priceGross:4,priceNet:3.24,package:1000,stock:1500,date:'2026-01-01'}],pricePerG:0.00324,minStock:500,criticalStock:700},
    {id:20,name:'Cukor',cat:'Vegyes',subType:'other_dry',suppliers:[{source:'Kaufland',priceGross:5,priceNet:4.05,package:1000,stock:500,date:'2026-01-01'}],pricePerG:0.00405,minStock:200,criticalStock:300},
    {id:21,name:'Száraz élesztő',cat:'Vegyes',subType:'other_dry',suppliers:[{source:'Kaufland',priceGross:3,priceNet:2.43,package:100,stock:200,date:'2026-01-01'}],pricePerG:0.0243,minStock:100,criticalStock:150},
    {id:22,name:'Szezámmag (egész)',cat:'Magvak',subType:'other_dry',suppliers:[{source:'Grizly',priceGross:18,priceNet:14.58,package:500,stock:400,date:'2026-01-01'}],pricePerG:0.02916,minStock:200,criticalStock:300},
    {id:23,name:'Napraforgó olaj',cat:'Vegyes',subType:'wet',suppliers:[{source:'Kaufland',priceGross:12,priceNet:9.72,package:1000,stock:2000,date:'2026-01-01'}],pricePerG:0.00972,minStock:500,criticalStock:700},
  ],
  recipes: [],
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
    ['recipe_stock', v=>{ if(v&&typeof v==='object') R.stock=v; }],
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
        dryIngredients: (dbIngredients||[]).filter(i=>i.recipe_id===r.id&&i.sub_type==='flour').map(i=>({name:i.name,amount:i.amount,ingredientId:i.ingredient_id})),
        wetIngredients: (dbIngredients||[]).filter(i=>i.recipe_id===r.id&&i.sub_type==='wet').map(i=>({name:i.name,amount:i.amount,ingredientId:i.ingredient_id})),
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

  auditLog('login', 'Receptúra', 'Sikeres belépés');
  nav('recipes');
}
