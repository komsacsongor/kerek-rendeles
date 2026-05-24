// ===== DATA =====
const BAKING_DAYS=[2,5];

// ===== SUPABASE DATA LAYER =====

let D = { _v: 'supabase', seenMsgs: {},
  products:[], // Loaded from Supabase (B14)
  monthlyActiveProducts:{'2026-3':[1,2,3,4,5,6,7,8,9,10],'2026-4':[1,2,3,5,6,7,8,9],'2026-5':[1,2,4,5,7,8,10]},
  clients:[
    {id:'anna',name:'Kovács Anna',email:'anna@example.com',phone:'+40 740 111 222',note:'',joinDate:'2025-09-01'},
    {id:'bela',name:'Nagy Béla',email:'bela@example.com',phone:'+40 750 333 444',note:'',joinDate:'2025-11-15'},
    {id:'cica',name:'Fekete Cica',email:'cica@example.com',phone:'+40 760 555 666',note:'',joinDate:'2026-01-10'},
  ],
  orders:{
    'anna-2026-3-4':{1:2,2:1,7:1},'anna-2026-3-11':{1:2,5:4,7:1},'anna-2026-3-18':{2:1,6:6,8:2},'anna-2026-3-25':{1:1,2:1,7:1},
    'bela-2026-3-4':{2:2,5:2,8:3},'bela-2026-3-11':{2:1,3:1,9:4},'bela-2026-3-18':{2:2,5:2,8:2},
    'cica-2026-3-7':{1:1,7:2,9:3},'cica-2026-3-14':{1:2,5:3,8:2},'cica-2026-3-21':{2:1,7:1,10:5},
    'anna-2026-4-1':{1:2,5:3,7:1},'anna-2026-4-8':{2:1,6:4,8:2},
    'bela-2026-4-4':{2:2,5:2,9:3},'bela-2026-4-11':{1:1,2:1,7:1},
    'cica-2026-4-4':{1:2,7:2},'cica-2026-4-11':{5:3,8:2,9:1},
  },
  messages:{
    'anna-2026-4':[{text:'Kedden inkább délután tudok átvenni, jó?',ts:'2026-04-01T09:12:00'}],
    'bela-2026-4':[{text:'A bagettből 2-t kérek extra ha van.',ts:'2026-04-04T11:30:00'}],
  },
  categories:[],
  settings:{lang:'hu',currency:'lej',adminPw:'admin'},
  bakingDaysDefault:[2,5],
  bakingCalendar:{
    '2026-3': {extra:[], removed:[]},
    '2026-4': {extra:[], removed:[]},
  },
  helpConditions:'',
  helpDelivery:'',
};

let selMonth = new Date().getMonth(); // aktuális hónap (0-indexed)
let selYear = new Date().getFullYear();
let catalogMonth = selMonth;
let currentView = 'dashboard';
let clientDetailId = null;
let clientDetailPeriod = 'monthly';
let editingProductId = null;

async function save() {
  // Save to Supabase - handled by individual save functions
  // Also keep local cache for offline
  localStorage.setItem('kerek_admin_data', JSON.stringify(D));
  localStorage.removeItem('kerek_data'); // régi kulcs törlése
}



async function loadAllData() {
  // H4 fix: parallel queries via Promise.allSettled (was sequential, ~2-3s -> ~400ms)
  const tasks = [
    sb.query('products', { order: 'id', limit: QUERY_LIMIT_PRODUCTS }).then(products => {
      if (products?.length) {
        D.products = products.map(p => ({
          id: p.id, name: p.name, weight: p.weight || '',
          price: p.price, category: p.category || 'Egyéb',
          desc: p.description || '', image: p.image || null, code: p.code || '',
          marketing_desc: p.marketing_desc || '', ingredient_label: p.ingredient_label || '',
          allergens: p.allergens || '', nutrition: p.nutrition || null,
          familyId: p.product_family_id || null
        }));
      } else { D.products = []; }
    }),
    sb.query('clients', { order: 'name', limit: QUERY_LIMIT_CLIENTS }).then(clients => {
      D.clients = (clients||[]).map(c => ({
        id: c.id, name: c.name, email: c.email || '',
        phone: c.phone || '', note: c.note || '', joinDate: c.join_date || ''
      }));
    }),
    sb.query('monthly_active_products', { limit: 2000 }).then(maps => {
      D.monthlyActiveProducts = {};
      (maps||[]).forEach(r => {
        const k = `${r.year}-${r.month}`;
        if (!D.monthlyActiveProducts[k]) D.monthlyActiveProducts[k] = [];
        D.monthlyActiveProducts[k].push(r.product_id);
      });
    }),
    sb.query('orders', { limit: QUERY_LIMIT_ORDERS }).then(orders => {
      D.orders = {};
      (orders||[]).forEach(r => {
        const k = `${r.client_id}-${r.year}-${r.month}-${r.day}`;
        if (!D.orders[k]) D.orders[k] = {};
        D.orders[k][r.product_id] = r.quantity;
      });
    }),
    sb.query('order_status', { limit: QUERY_LIMIT_STATUSES }).then(statuses => {
      D.orderStatus = {};
      (statuses||[]).forEach(r => {
        const k = `${r.client_id}-${r.year}-${r.month}-${r.day}`;
        D.orderStatus[k] = { status: r.status, admin_note: r.admin_note, deadline: r.deadline, confirmed_at: r.confirmed_at };
      });
    }),
    sb.query('messages', { order: 'created_at', limit: 500 }).then(messages => {
      D.messages = {};
      (messages||[]).forEach(r => {
        const k = `${r.client_id}-${r.year}-${r.month}`;
        if (!D.messages[k]) D.messages[k] = [];
        D.messages[k].push({ text: r.text, ts: r.created_at });
      });
    }),
    sb.query('recipes', { limit: 500 }).then(recipes => {
      D.recipes = (recipes||[]).filter(r => r.activated_at);
    }),
    sb.query('recipe_ingredients', { limit: 5000 }).then(recIngs => {
      D.recipeIngredients = {};
      (recIngs||[]).forEach(ri => {
        if (!D.recipeIngredients[ri.recipe_id]) D.recipeIngredients[ri.recipe_id] = [];
        D.recipeIngredients[ri.recipe_id].push({
          name: ri.name, amount: ri.amount, ingredientId: ri.ingredient_id, subType: ri.sub_type || 'other_dry'
        });
      });
    }),
    sb.query('ingredients', { limit: QUERY_LIMIT_PRODUCTS }).then(ings => {
      D.ingredients = (ings||[]).map(i => ({
        id: i.id, name: i.name, category: i.category, subType: i.sub_type,
        minStockOverrideG: i.min_stock_override_g, minStockAutoG: i.min_stock_auto_g,
        maxStockOverrideG: i.max_stock_override_g, maxStockAutoG: i.max_stock_auto_g
      }));
    }),
    sb.query('ingredient_batches', { limit: 2000 }).then(batches => {
      D.ingredientBatches = batches || [];
    }),
    sb.query('baking_calendar', { limit: 200 }).then(cal => {
      D.bakingCalendar = {};
      (cal||[]).forEach(r => {
        const k = `${r.year}-${r.month}`;
        D.bakingCalendar[k] = { extra: r.extra_dates || [], removed: r.removed_dates || [] };
      });
    }),
  ];
  const results = await Promise.allSettled(tasks);
  results.forEach((r, idx) => {
    if (r.status === 'rejected') console.error(`loadAllData task ${idx}:`, r.reason?.message || r.reason);
  });

  // Settings still sequential (small and depend on each other potentially)
  try {
    const settingKeys = ['baking_days_default', 'categories', 'lang', 'currency', 'help_conditions', 'help_delivery', 'admin_seen_msgs'];
    const settingTasks = settingKeys.map(key => sb.getSetting(key).then(val => ({ key, val })));
    const settingResults = await Promise.allSettled(settingTasks);
    settingResults.forEach(r => {
      if (r.status !== 'fulfilled' || r.value.val === null) return;
      const { key, val } = r.value;
      if (key === 'baking_days_default') D.bakingDaysDefault = val;
      else if (key === 'categories') D.categories = val;
      else if (key === 'lang') D.settings.lang = val;
      else if (key === 'currency') D.settings.currency = val;
      else if (key === 'help_conditions') D.helpConditions = val;
      else if (key === 'help_delivery') D.helpDelivery = val;
      else if (key === 'admin_seen_msgs') D.seenMsgs = (typeof val === 'object' && val !== null) ? val : {};
    });
  } catch(e) { console.error('loadAllData [settings]:', e.message); }

  localStorage.setItem('kerek_admin_data', JSON.stringify(D));
}

// ===== AUTH =====
function loginError(msg) {
  const el = document.getElementById('login-error');
  if(el) { el.textContent = msg; el.style.display='block'; }
  const pw = document.getElementById('login-pw');
  if(pw) { pw.style.border='1.5px solid #f87171'; pw.focus(); }
}
function loginClearError() {
  const el = document.getElementById('login-error');
  if(el) { el.textContent=''; }
  const pw = document.getElementById('login-pw');
  if(pw) pw.style.border='';
}
// S2: Rate limiting – max 5 attempts per 60 seconds
const _adminLoginAttempts = { count: 0, resetAt: 0 };

async function doLogin(){
  const _now = Date.now();
  if (_now > _adminLoginAttempts.resetAt) { _adminLoginAttempts.count = 0; _adminLoginAttempts.resetAt = _now + 60000; }
  _adminLoginAttempts.count++;
  if (_adminLoginAttempts.count > 5) {
    const _waitSec = Math.ceil((_adminLoginAttempts.resetAt - _now) / 1000);
    toast(`⚠️ Túl sok próbálkozás. Várj ${_waitSec} másodpercet.`, true);
    return;
  }
  loginClearError();
  const pw = document.getElementById('login-pw').value;
  if(!pw){ loginError('⚠️ Add meg a jelszót!'); return; }
  const btn = document.querySelector('#login-screen .btn-primary');
  if(btn) { btn.disabled=true; btn.textContent='Betöltés...'; }

  try {
    // C4 fix (v2.30.0): auth via Edge Function (admin-auth)
    // The stored password hash is no longer readable by anon role (RLS policy).
    // Edge Function uses service_role to read settings, hash-compares server-side.
    const authUrl = `https://lfaxeihrmiylggahougl.supabase.co/functions/v1/admin-auth`;
    const res = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + SUPABASE_KEY,
      },
      body: JSON.stringify({ password: pw })
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 429) {
      if(btn) { btn.disabled=false; btn.textContent='Belépés →'; }
      loginError(`⚠️ Túl sok próbálkozás. Várj ${data.wait_seconds || 60} másodpercet.`);
      return;
    }
    if (res.status === 500 && data.error === 'not_configured') {
      if(btn) { btn.disabled=false; btn.textContent='Belépés →'; }
      toast('⚠️ Nincs beállított jelszó! Állítsd be a Supabase settings táblában.', true);
      return;
    }

    if (data?.success === true) {
      document.getElementById('login-screen').style.display='none';
      await loadAllData();
      initApp();
      auditLog('login', 'Admin', 'Sikeres belépés');
      updateMsgBadge();
    } else {
      if(btn) { btn.disabled=false; btn.textContent='Belépés →'; }
      loginError('❌ Hibás jelszó! Próbáld újra.');
      // No need to auditLog here - Edge Function does it server-side
    }
  } catch(e) {
    console.error('doLogin Edge Function hiba:', e.message);
    if(btn) { btn.disabled=false; btn.textContent='Belépés →'; }
    loginError('❌ Kapcsolódási hiba. Kérjük próbáld újra.');
  }
}
function logout() {
  localStorage.removeItem('kerek_admin_data');
  localStorage.removeItem('kerek_data');
  window.location.href = 'index.html';
}

function initApp(){
  showVersionBadge();
  buildTopbarMonths();

  // ===== SUPABASE REALTIME (instant push when available) =====
  const LIVE_TABLES = ['orders','messages','clients','products','monthly_active_products','order_status','ingredient_batches'];
  // C5 fix: Debounce realtime callback to coalesce bulk inserts (was N× loadAllData per N events)
  let _wsDebounceTimer = null;
  let _wsLastEvent = null;
  sb.subscribe(LIVE_TABLES, ({ table, event }) => {
    _wsLastEvent = { table, event };
    if (_wsDebounceTimer) clearTimeout(_wsDebounceTimer);
    _wsDebounceTimer = setTimeout(async () => {
      try {
        await loadAllData();
        updateMsgBadge();
        if (typeof updatePendingBadge === 'function') updatePendingBadge();
        const activeView = document.querySelector('.view.active')?.id?.replace('view-','');
        RENDERS[activeView]?.();
        if (_wsLastEvent?.table === 'messages' && _wsLastEvent?.event === 'INSERT' && activeView !== 'messages') {
          const badge = document.getElementById('msg-badge');
          if (badge) { badge.style.animation = 'none'; badge.offsetHeight; badge.style.animation = 'pulse 0.6s 3'; }
        }
      } catch(e) {}
    }, REALTIME_DEBOUNCE_MS);
  });

  // v2.26.0: Unified 30s polling (always runs, Page Visibility aware)
  // Realtime WS is bonus - if it works, you get instant updates; if not, polling covers
  startUnifiedPolling(async () => {
    await loadAllData();
    updateMsgBadge();
    if (typeof updatePendingBadge === 'function') updatePendingBadge();
    const activeView = document.querySelector('.view.active')?.id?.replace('view-','');
    RENDERS[activeView]?.();
  }, 30000);

  renderDashboard();
  updateMsgBadge();
  loadSettings();
}

