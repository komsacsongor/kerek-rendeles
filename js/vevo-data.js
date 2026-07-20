
// ===== AUTH TABS =====
function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('auth-login-panel').style.display = isLogin ? 'block' : 'none';
  document.getElementById('auth-reg-panel').style.display = isLogin ? 'none' : 'block';
  document.getElementById('reg-success').style.display = 'none';
  document.getElementById('login-error').style.display = 'none';
  // Tab button styles
  const loginBtn = document.getElementById('tab-login-btn');
  const regBtn = document.getElementById('tab-reg-btn');
  if (loginBtn) {
    loginBtn.style.background = isLogin ? 'white' : 'transparent';
    loginBtn.style.color = isLogin ? 'var(--teal-dark)' : 'var(--text-soft)';
    loginBtn.style.fontWeight = isLogin ? '700' : '400';
    loginBtn.style.boxShadow = isLogin ? '0 1px 3px rgba(0,0,0,0.1)' : 'none';
  }
  if (regBtn) {
    regBtn.style.background = !isLogin ? 'white' : 'transparent';
    regBtn.style.color = !isLogin ? 'var(--teal-dark)' : 'var(--text-soft)';
    regBtn.style.fontWeight = !isLogin ? '700' : '400';
    regBtn.style.boxShadow = !isLogin ? '0 1px 3px rgba(0,0,0,0.1)' : 'none';
  }
}

function _genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from({length:4}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
  return `KER-${seg()}-${seg()}`;
}

const _regAttempts = { count: 0, resetAt: 0 };

async function doRegister() {
  const now = Date.now();
  if (now > _regAttempts.resetAt) { _regAttempts.count = 0; _regAttempts.resetAt = now + 60000; }
  if (++_regAttempts.count > 5) {
    _showLoginError(`⚠️ Túl sok próbálkozás. Várj ${Math.ceil((_regAttempts.resetAt - now)/1000)} másodpercet.`);
    return;
  }
  const name  = (document.getElementById('reg-name')?.value || '').trim();
  const email = (document.getElementById('reg-email')?.value || '').trim();
  const phone = (document.getElementById('reg-phone')?.value || '').trim();
  _showLoginError('');
  if (!name)  { _showLoginError('⚠️ Add meg a nevedet!'); return; }
  if (!email) { _showLoginError('⚠️ Add meg az email címedet!'); return; }
  if (!email.includes('@') || !email.includes('.')) { _showLoginError('⚠️ Érvénytelen email cím!'); return; }

  const btn = document.getElementById('reg-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Feldolgozás...'; }

  try {
    // Check duplicate email
    const existing = await sb.query('clients', { filter: `email=eq.${encodeURIComponent(email)}`, limit: 1 });
    if (existing && existing.length > 0) {
      const ex = existing[0];
      _showLoginError(ex.name.startsWith('[DELETED]')
        ? '⚠️ Ez az email cím egy deaktivált fiókhoz tartozik. Keresd fel a pékséget.'
        : '⚠️ Ez az email cím már regisztrálva van! Lépj be az email címeddel.');
      if (btn) { btn.disabled = false; btn.textContent = 'Regisztráció →'; }
      return;
    }
    const code = _genCode();
    await sb.insert('clients', { id: code, name: '[PENDING] ' + name, email, phone: phone || null });
    // Show success
    document.getElementById('auth-reg-panel').style.display = 'none';
    document.getElementById('reg-code-display').textContent = code;
    document.getElementById('reg-email-display').textContent = email;
    document.getElementById('reg-success').style.display = 'block';
  } catch(e) {
    const msg = e.message || JSON.stringify(e);
    _showLoginError(msg.includes('unique') || msg.includes('23505')
      ? '⚠️ Ez az email cím már regisztrálva van!'
      : '⚠️ Hiba: ' + msg);
    if (btn) { btn.disabled = false; btn.textContent = 'Regisztráció →'; }
  }
}

function _showLoginError(msg) {
  const el = document.getElementById('login-error');
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}


// ===== PWA INSTALL =====
let _pwaInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _pwaInstallPrompt = e;
  ['pwa-install-bar','footer-install-btn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === 'footer-install-btn' ? 'inline-flex' : 'block';
  });
});
window.addEventListener('appinstalled', () => {
  ['pwa-install-bar','footer-install-btn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  _pwaInstallPrompt = null;
});
async function installPWA() {
  if (!_pwaInstallPrompt) {
    await alertDialog('iOS Safari-n: Megosztás (□↑) gomb → "Hozzáadás a kezdőképernyőhöz"');
    return;
  }
  _pwaInstallPrompt.prompt();
  const { outcome } = await _pwaInstallPrompt.userChoice;
  if (outcome === 'accepted') {
    const bar = document.getElementById('pwa-install-bar');
    if (bar) bar.style.display = 'none';
  }
  _pwaInstallPrompt = null;
}
// ===== CONSTANTS =====
// BAKING_DAYS now dynamic - loaded from shared data

// ===== DATA =====
let appData = JSON.parse(localStorage.getItem('kerek_vevo_data') || 'null') || {
  products: [], // Loaded from Supabase – no hardcoded fallback (B14)
  monthlyActiveProducts: {
    '2026-3': [1,2,3,4,5,6,7,8,9,10],
    '2026-4': [1,2,3,5,6,7,8,9],
    '2026-5': [1,2,4,5,7,8,10],
  },
  clients: [
    { id:'anna', name:'Kovács Anna', email:'anna@example.com' },
    { id:'bela', name:'Nagy Béla', email:'bela@example.com' },
    { id:'cica', name:'Fekete Cica', email:'cica@example.com' },
  ],
  orders: {
    'anna-2026-3-4': { 1:2, 2:1, 7:1 },
    'anna-2026-3-11': { 1:2, 5:4, 7:1 },
    'anna-2026-4-1': { 1:2, 5:3, 7:1 },
    'anna-2026-4-8': { 2:1, 6:4, 8:2 },
    'bela-2026-3-4': { 2:2, 5:2, 8:3 },
    'bela-2026-4-4': { 2:2, 5:2, 9:3 },
    'cica-2026-3-7': { 1:1, 7:2, 9:3 },
  },
  messages: {},
  helpConditions: '',
  helpDelivery: '',
  bakingDaysDefault: [2,5],
  bakingCalendar: {},
};

let currentUser = null;
let _lastMsgSent = 0; // Rate limiting: 30 másodperc üzenetek között
let _lastAdminOrderPush = 0; // Admin push throttle: 60 másodperc rendelés-értesítések között
let selectedMonth = new Date().getMonth();
let selectedYear = new Date().getFullYear();
let summaryMonth = selectedMonth;

// ===== AUTH =====
// S2: Rate limiting – max 5 attempts per 60 seconds
const _loginAttempts = { count: 0, resetAt: 0 };

async function doLogin() {
  const now = Date.now();
  if (now > _loginAttempts.resetAt) { _loginAttempts.count = 0; _loginAttempts.resetAt = now + 60000; }
  _loginAttempts.count++;
  if (_loginAttempts.count > 5) {
    const waitSec = Math.ceil((_loginAttempts.resetAt - now) / 1000);
    document.getElementById('login-error').textContent = `⚠️ Túl sok próbálkozás. Várj ${waitSec} másodpercet.`;
    document.getElementById('login-error').style.display = 'block';
    return;
  }
  showVersionBadge();
  const val = document.getElementById('login-input').value.trim().toLowerCase();
  const errEl2 = document.getElementById('login-error');
  if (!val) {
    if(errEl2) { errEl2.textContent = '⚠️ Add meg a belépési kódot!'; errEl2.style.display='block'; }
    return;
  }
  if(errEl2) errEl2.style.display='none';
  if (val === 'admin') { window.location.href = 'admin.html'; return; }

  // Loading jelzés
  const btn = document.querySelector('#login-screen button');
  if(btn) { btn.disabled = true; btn.textContent = 'Betöltés...'; }

  try {
    // Mindig Supabase-ből tölt – friss termékek, kliensek, beállítások
    const [clients, products, maps, exceptions, settings_cond, settings_del, settings_bake, settings_header] = await Promise.all([
      sb.query('clients', {limit: 500}),
      sb.query('products', {order:'id', limit: 500}),
      sb.query('monthly_active_products', {limit: 2000}),
      sb.query('product_day_exceptions', {limit: 5000}).catch(()=>[]),
      sb.getSetting('help_conditions'),
      sb.getSetting('help_delivery'),
      sb.getSetting('baking_days_default'),
      sb.getSetting('vevo_header_text'),  // v2.41.1
    ]);

    if(clients?.length) {
      appData.clients = clients.map(c=>({id:c.id,name:c.name,email:c.email||'',phone:c.phone||''}));
    }
    if(products?.length) {
      appData.products = products.map(p=>({
        id:p.id, name:p.name, weight:p.weight||'', price:p.price||0,
        category:p.category||'', desc:p.description||'', image:p.image||null,
        marketing_desc:p.marketing_desc||'', ingredient_label:p.ingredient_label||'',
        allergens:p.allergens||'', nutrition:p.nutrition||null,
        baking_dows:p.baking_dows||null
      }));
    }
    if(maps?.length) {
      appData.monthlyActiveProducts = {};
      maps.forEach(r=>{
        const k=`${r.year}-${r.month}`;
        if(!appData.monthlyActiveProducts[k]) appData.monthlyActiveProducts[k]=[];
        appData.monthlyActiveProducts[k].push(r.product_id);
      });
    }
    appData.productDayExceptions = {};
    (exceptions||[]).forEach(r=>{
      const k=`${r.year}-${r.month}`;
      if(!appData.productDayExceptions[k]) appData.productDayExceptions[k]={};
      if(!appData.productDayExceptions[k][r.product_id]) appData.productDayExceptions[k][r.product_id]={};
      appData.productDayExceptions[k][r.product_id][r.day]=r.available;
    });
    if(settings_cond) appData.helpConditions = settings_cond;
    if(settings_del) appData.helpDelivery = settings_del;
    if(settings_bake) appData.bakingDaysDefault = settings_bake;
    if(settings_header) appData.vevoHeaderText = settings_header;  // v2.41.1
    if(!appData.orders) appData.orders = {};
    if(!appData.messages) appData.messages = {};
    if(!appData.bakingCalendar) appData.bakingCalendar = {};

  } catch(e) {
    console.warn('Supabase betöltési hiba, cache-t használ:', e.message);
    if(!appData.orders) appData.orders = {};
    if(!appData.messages) appData.messages = {};
    if(!appData.bakingCalendar) appData.bakingCalendar = {};
  }

  if(btn) { btn.disabled = false; btn.textContent = 'Belépés →'; }

  const normalizedVal = val.replace(/-/g,'').toLowerCase().trim();
  const valLower = val.toLowerCase().trim();
  const client = appData.clients.find(c =>
    c.id === val ||
    c.id === val.toUpperCase() ||
    c.id.toLowerCase() === valLower ||
    c.id.replace(/-/g,'').toLowerCase() === normalizedVal ||
    (c.email && c.email.toLowerCase() === valLower) ||
    c.name.toLowerCase() === valLower
  );
  if (client && client.name && client.name.startsWith('[PENDING]')) {
    const _errEl = document.getElementById('login-error');
    if(_errEl) { _errEl.textContent = '⏳ A hozzáférésedet még nem hagyta jóvá a pékség. Hamarosan értesítünk!'; _errEl.style.display='block'; }
    return;
  }
  if (client && client.name && client.name.startsWith('[DELETED]')) {
    _showLoginError('❌ Ez a fiók deaktiválva lett. Vedd fel a kapcsolatot a KEREK pékséggel.');
    return;
  }
  if (client) {
    currentUser = client;
    document.getElementById('login-screen').style.display = 'none';
    auditLog('login', currentUser.name||currentUser.id, 'Vevő belépés');
    if (typeof kerekVevoSaveLogin === 'function') kerekVevoSaveLogin(val);
    if (typeof KEREKAnalytics !== 'undefined') KEREKAnalytics.sessionStart();
    document.getElementById('user-badge').textContent = '👤 ' + esc(client.name);
    setTimeout(() => { if (typeof updateMsgIndicator === 'function') updateMsgIndicator(); }, 800);
    const _displayName = client.name.replace(/^\[(PENDING|DELETED)\]\s*/,'');
    document.getElementById('hero-greeting').textContent = 'Szia, ' + esc(_displayName.split(' ').slice(-1)[0]) + '! 👋';
    // Vevő rendelései + üzenetei Supabase-ből
    try {
      const [userOrders, userMsgs, calData, userStatuses] = await Promise.all([
        sb.query('orders', {filter: `client_id=eq.${client.id}`, limit: 2000}),
        sb.query('messages', {filter: `client_id=eq.${client.id}`, order: 'created_at', limit: 200}),
        sb.query('baking_calendar', {limit: 200}),
        sb.query('order_status', {filter: `client_id=eq.${client.id}`, limit: 500}),
      ]);
      (userOrders||[]).forEach(r => {
        const k = getOrderKey(r.client_id, r.year, r.month, r.day);
        if(!appData.orders[k]) appData.orders[k] = {};
        appData.orders[k][r.product_id] = r.quantity;
      });
      appData.orderStatus = {};
      (userStatuses||[]).forEach(r => {
        const k = getOrderKey(r.client_id, r.year, r.month, r.day);
        appData.orderStatus[k] = {status: r.status, admin_note: r.admin_note};
      });
      (userMsgs||[]).forEach(r => {
        const k = `${r.client_id}-${r.year}-${r.month}`;
        if(!appData.messages[k]) appData.messages[k] = [];
        appData.messages[k].push({text: r.text, ts: r.created_at});
      });
      (calData||[]).forEach(r => {
        const k = `${r.year}-${r.month}`;
        appData.bakingCalendar[k] = {extra: r.extra_dates||[], removed: r.removed_dates||[]};
      });
    } catch(e) { console.warn('User data load:', e.message); }

    // H8 fix: Auto-confirm PENDING/MODIFIED orders past deadline (no cron available)
    try {
      const now = new Date();
      const expiredKeys = [];
      Object.entries(appData.orderStatus || {}).forEach(([k, st]) => {
        if ((st.status === 'pending' || st.status === 'modified') && st.deadline) {
          if (new Date(st.deadline) <= now) expiredKeys.push(k);
        }
      });
      if (expiredKeys.length > 0) {
        const expiredRows = expiredKeys.map(k => {
          const parts = k.split('-'); // clientId-year-month-day
          const cid = parts.slice(0, -3).join('-'); // clientId may contain -
          return {
            client_id: cid,
            year: parseInt(parts[parts.length-3]),
            month: parseInt(parts[parts.length-2]),
            day: parseInt(parts[parts.length-1]),
            status: 'confirmed',
            confirmed_at: now.toISOString()
          };
        });
        await sb.upsert('order_status', expiredRows, 'client_id,year,month,day');
        expiredKeys.forEach(k => {
          appData.orderStatus[k] = { ...appData.orderStatus[k], status: 'confirmed' };
        });
      }
    } catch(e) { console.warn('Auto-confirm:', e.message); }

    buildMonthSelectors();
    if (typeof loadViewPref === 'function') loadViewPref();
    renderOrderTable();
    if (typeof applyVevoHeader === 'function') applyVevoHeader();  // v2.41.1
    updateHeroTotal();
    // Show sticky bottom total bar after successful login
    const sticky = document.getElementById('sticky-month-total');
    if (sticky) sticky.style.display = 'flex';
    document.body.classList.add('has-sticky-total');
    loadMessage();
    // v2.53.61: push deep-link — a belépés + üzenet-betöltés UTÁN ugrunk az üzenetekhez
    // (a szándék sessionStorage-ban él, túléli a login-képernyőt/kattintást)
    if (sessionStorage.getItem('pendingOpenMsg') === '1'){
      sessionStorage.removeItem('pendingOpenMsg');
      setTimeout(() => { if (typeof showMessages === 'function') showMessages(); }, 500);
    }
    renderHelpConditions();
    initPushSubscription().then(() => updatePushBtn()).catch(() => updatePushBtn());

    // v2.36.0 fix #8 + #9: Realtime subscription for instant admin replies + in-app notification
    if (window._kerekVevoUnsub) { try { window._kerekVevoUnsub(); } catch(e){} }
    if (typeof sb.subscribe === 'function') {
      try {
        let _rtDebounce = null;
        const VEVO_RT_TABLES = ['messages', 'order_status', 'products', 'monthly_active_products', 'baking_calendar', 'settings', 'settings', 'product_day_exceptions'];
        window._kerekVevoUnsub = sb.subscribe(VEVO_RT_TABLES, ({table, event}) => {
          if (_rtDebounce) clearTimeout(_rtDebounce);
          _rtDebounce = setTimeout(async () => {
            const beforeMsgCount = countMyMessages();
            // Reload data (full refresh; same as polling does)
            try { await reloadVevoData(); } catch(e) {}
            const afterMsgCount = countMyMessages();
            // #9: In-app toast if new admin message arrived
            if (table === 'messages' && event === 'INSERT' && afterMsgCount > beforeMsgCount) {
              showAdminMsgBanner();
              if (typeof updateMsgIndicator === 'function') updateMsgIndicator();
            }
            // Re-render active view
            if (typeof renderOrderTable === 'function') renderOrderTable();
            if (typeof updateHeroTotal === 'function') updateHeroTotal();
          }, 500);
        });
      } catch(e) { console.warn('Vevo Realtime subscribe failed:', e.message); }
    }

    // v2.26.0: Unified 30s polling (Page Visibility aware) - now backup to Realtime
    if (window._kerekStopPoll) { try { window._kerekStopPoll(); } catch(e){} }
    window._kerekStopPoll = startUnifiedPolling(async () => {
      if (!currentUser) return;
      let changed = false;
      // 1. Messages
      loadMessage();
      // 2. Order status (admin modifications)
      try {
        const st = await sb.query('order_status', {filter: `client_id=eq.${currentUser.id}`, limit: 500});
        if (!appData.orderStatus) appData.orderStatus = {};
        (st||[]).forEach(r => {
          const k = getOrderKey(r.client_id, r.year, r.month, r.day);
          const prev = (appData.orderStatus[k]||{}).status;
          appData.orderStatus[k] = {status: r.status, admin_note: r.admin_note, deadline: r.deadline};
          if (prev !== r.status) changed = true;
        });
      } catch(e) {}
      // 3. Products (prices, new items, archive)
      try {
        const prods = await sb.query('products', { order: 'id', limit: 500 });
        const newJson = JSON.stringify((prods||[]).map(p=>({id:p.id,price:p.price,name:p.name})));
        const oldJson = JSON.stringify(appData.products.map(p=>({id:p.id,price:p.price,name:p.name})));
        if (newJson !== oldJson) {
          appData.products = (prods||[]).map(p => ({
            id: p.id, name: p.name, weight: p.weight || '', price: p.price,
            category: p.category || 'Egyéb', desc: p.description || '',
            image: p.image || null, code: p.code || '',
            marketing_desc: p.marketing_desc || '', ingredient_label: p.ingredient_label || '',
            allergens: p.allergens || '', nutrition: p.nutrition || null,
            familyId: p.product_family_id || null,
            baking_dows: p.baking_dows || null
          }));
          changed = true;
        }
      } catch(e) {}
      // 4. Monthly active products (admin may toggle availability)
      try {
        const maps = await sb.query('monthly_active_products', { limit: 2000 });
        const grouped = {};
        (maps||[]).forEach(r => {
          const k = `${r.year}-${r.month}`;
          if (!grouped[k]) grouped[k] = [];
          grouped[k].push(r.product_id);
        });
        if (JSON.stringify(grouped) !== JSON.stringify(appData.monthlyActiveProducts||{})) {
          appData.monthlyActiveProducts = grouped;
          changed = true;
        }
      } catch(e) {}
      if (changed) { renderOrderTable(); updateHeroTotal(); }
    }, 30000);
  } else {
    const errEl = document.getElementById('login-error');
    if(errEl) { errEl.textContent = '❌ Ismeretlen kód! Kérj segítséget a pékségtől.'; errEl.style.display='block'; }
    const inp = document.getElementById('login-input');
    if(inp) { inp.style.border='1.5px solid #ef4444'; inp.focus(); inp.addEventListener('input', () => { if(errEl) errEl.style.display='none'; inp.style.border=''; }, {once:true}); }
  }
}
function logout() { localStorage.removeItem('kerek_vevo_data');
  localStorage.removeItem('kerek_data'); window.location.href = 'vevo.html'; }

// ===== v2.36.0: REALTIME HELPER-EK (vevő) =====
function countMyMessages() {
  if (!currentUser || !appData?.messages) return 0;
  return Object.values(appData.messages).reduce((sum, arr) => sum + (arr||[]).length, 0);
}

// In-app banner új admin üzenetre (#9)
function showAdminMsgBanner() {
  // Ha nyitva van a messages panel, nem kell külön értesítés
  const msgPanel = document.querySelector('[data-view="messages"]');
  if (msgPanel && getComputedStyle(msgPanel).display !== 'none') return;
  // Egyszerű csúszó toast a fenti sávba
  let b = document.getElementById('vevo-msg-banner');
  if (!b) {
    b = document.createElement('div');
    b.id = 'vevo-msg-banner';
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;background:linear-gradient(135deg,#064C48,#129990);color:white;padding:12px 18px;font-family:Kodchasan,sans-serif;font-size:0.9rem;font-weight:500;z-index:99998;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.2);text-align:center;transform:translateY(-100%);transition:transform 0.3s ease-out';
    b.innerHTML = '💬 Új üzenet érkezett — kattints a megjelenítéshez';
    b.onclick = () => {
      b.style.transform = 'translateY(-100%)';
      // Megnyitjuk az üzenetek view-t ha van
      showMessages();
    };
    document.body.appendChild(b);
  }
  // Megjelenítés
  b.style.transform = 'translateY(0)';
  // Auto-hide 8s után
  clearTimeout(b._autoHide);
  b._autoHide = setTimeout(() => { b.style.transform = 'translateY(-100%)'; }, 8000);
}

// Reload (kisebb mint a teljes login flow, csak az adat)
// v2.37.0 fix: extended to products + monthly_active + baking_calendar so admin changes flow through Realtime
async function reloadVevoData() {
  if (!currentUser) return;
  try {
    const monthFilter = ''; // load all months
    const [userOrders, userStatuses, userMsgs, dbProducts, dbMonthly, dbBaking, dbStanding] = await Promise.all([
      sb.query('orders', {filter: `client_id=eq.${currentUser.id}`, limit: 1000}),
      sb.query('order_status', {filter: `client_id=eq.${currentUser.id}`, limit: 500}),
      sb.query('messages', {filter: `client_id=eq.${currentUser.id}`, order: 'created_at', limit: 200}),
      sb.query('products', {filter: 'deleted_at=is.null', limit: 500}).catch(() => null),
      sb.query('monthly_active_products', {limit: 500}).catch(() => null),
      sb.query('baking_calendar', {limit: 500}).catch(() => null),
      sb.query('standing_orders', {filter: `client_id=eq.${currentUser.id}`, limit: 500}).catch(() => null),
    ]);
    // Orders
    appData.orders = {};
    (userOrders||[]).forEach(o => {
      const k = getOrderKey(o.client_id, o.year, o.month, o.day);
      if (!appData.orders[k]) appData.orders[k] = {};
      appData.orders[k][o.product_id] = o.quantity;
    });
    // Status
    appData.orderStatus = {};
    (userStatuses||[]).forEach(r => {
      const k = getOrderKey(r.client_id, r.year, r.month, r.day);
      appData.orderStatus[k] = {status: r.status, admin_note: r.admin_note, deadline: r.deadline};
    });
    // Állandó rendelések (havi szabályok) — hónap-kulcsos: appData.standingOrders["YYYY-M"][product_id] = szabály
    appData.standingOrders = {};
    (dbStanding||[]).forEach(r => {
      const mk = r.year + '-' + r.month;
      if (!appData.standingOrders[mk]) appData.standingOrders[mk] = {};
      appData.standingOrders[mk][r.product_id] = r;
    });
    // Messages
    appData.messages = {};
    (userMsgs||[]).forEach(r => {
      const k = `${r.client_id}-${r.year}-${r.month}`;
      if(!appData.messages[k]) appData.messages[k] = [];
      appData.messages[k].push({text: r.text, ts: r.created_at});
    });
    // v2.37.0: Products refresh (admin változások mostantól látszanak Realtime-on)
    // v2.38.5 fix: correct field names (monthlyActiveProducts, bakingCalendar) + price default 0
    if (dbProducts) {
      appData.products = dbProducts.map(p => ({
        id: p.id, name: p.name, weight: p.weight || '', price: p.price || 0,
        category: p.category || '', desc: p.description || '', image: p.image || null,
        ptype: p.product_type || 'production', code: p.code || ''
      }));
    }
    // v2.37.0: Monthly active products refresh — HELYES név: monthlyActiveProducts
    if (dbMonthly) {
      appData.monthlyActiveProducts = {};
      dbMonthly.forEach(m => {
        const k = `${m.year}-${m.month}`;
        if (!appData.monthlyActiveProducts[k]) appData.monthlyActiveProducts[k] = [];
        appData.monthlyActiveProducts[k].push(m.product_id);
      });
    }
    // v2.37.0: Baking calendar refresh — HELYES struktura: bakingCalendar[k]={extra, removed}
    if (dbBaking) {
      appData.bakingCalendar = {};
      dbBaking.forEach(r => {
        const k = `${r.year}-${r.month}`;
        appData.bakingCalendar[k] = {extra: r.extra_dates || [], removed: r.removed_dates || []};
      });
    }
    // v2.41.1: vevo_header_text reload
    try {
      const v = await sb.getSetting('vevo_header_text');
      if (v !== null && v !== undefined) appData.vevoHeaderText = v;
      if (typeof applyVevoHeader === 'function') applyVevoHeader();
    } catch(_) {}
  } catch(e) { console.warn('reloadVevoData:', e.message); }
}

// ===== WEB PUSH =====
const VAPID_PUBLIC_KEY = (typeof location !== 'undefined' && location.pathname.includes('/staging/'))
  ? 'BAuR41VyGa6UGQTYIE1IozwYIzq9Eqm5cBoLLsCrR8emUM_qGmNKZAXEbNLGgyzozv-X6DhU1kgtjiFhPIHFgC8'
  : 'BKnbS6hp1HTdh5BcNOvVTtBdmYWNj48F0jSG6NgQ1vVkboNvsATvbn2uoSP0pFpDTIQlMQ6wa4nI9j8v1jo-7SM';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function initPushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (!currentUser) return;
  try {
    const reg = await navigator.serviceWorker.register('/kerek-rendeles/sw.js');
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      // v2.53.0: ha a feliratkozás más VAPID kulccsal készült, újra kell kötni (különben a küldés elutasul)
      const curKey = new Uint8Array(existing.options?.applicationServerKey || []);
      const wantKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      const sameKey = curKey.length === wantKey.length && curKey.every((b,i)=>b===wantKey[i]);
      if (sameKey) { await savePushSubscription(existing); return; }
      try { await existing.unsubscribe(); } catch(_){}
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
    await savePushSubscription(sub);
    toast('🔔 Értesítések bekapcsolva!');
  } catch(e) { console.warn('Push init:', e.message); }
}

async function savePushSubscription(sub) {
  if (!currentUser) return;
  const j = sub.toJSON();
  try {
    await sb.upsert('push_subscriptions', {
      client_id: currentUser.id,
      endpoint: j.endpoint,
      p256dh: j.keys.p256dh,
      auth: j.keys.auth
    }, 'client_id,endpoint');
  } catch(e) { console.warn('Push save:', e.message); }
}

async function togglePushSubscription() {
  if (!currentUser) return;
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    // v2.53.x: ha a feliratkozás MÁS (régi) VAPID kulccsal készült, az nem működő stale
    // állapot → ne kapcsoljuk KI, hanem kössük újra az aktuális kulccsal (initPushSubscription kezeli)
    const curKey = new Uint8Array(existing.options?.applicationServerKey || []);
    const wantKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    const sameKey = curKey.length === wantKey.length && curKey.every((b, i) => b === wantKey[i]);
    if (!sameKey) { await initPushSubscription(); await updatePushBtn(); return; }
    await existing.unsubscribe();
    await sb.delete('push_subscriptions', `client_id=eq.${currentUser.id}`);
    toast('🔕 Értesítések kikapcsolva.');
  } else {
    await initPushSubscription();
  }
  await updatePushBtn();
}

async function updatePushBtn() {
  const btn = document.getElementById('push-btn');
  if (!btn) return;
  btn.style.display = 'inline-block';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  const perm = Notification.permission;
  if (perm === 'denied') { btn.style.opacity = '0.3'; btn.title = 'Értesítések tiltva (böngésző beállítás)'; btn.textContent = '🔕'; }
  else if (sub) { btn.style.opacity = '1'; btn.title = 'Értesítések bekapcsolva – kattints a kikapcsoláshoz'; btn.textContent = '🔔'; }
  else { btn.style.opacity = '0.5'; btn.title = 'Kattints az értesítések bekapcsolásához'; btn.textContent = '🔔'; }
}

// Footer version + install btn - run after all scripts loaded
function _fillFooterVersion() {
  const fv = document.getElementById('footer-version');
  if (fv && typeof APP_VERSION !== 'undefined' && APP_VERSION) fv.textContent = APP_VERSION;
}
window.addEventListener('load', _fillFooterVersion);


// =============================================================
// v2.41.1: Szerkeszthető vevő fejléc szöveg
// =============================================================

function getBakingDayNamesText() {
  // Az appData.bakingDaysDefault-ból (vagy [2,5] default) felépíti a szöveget
  // pl. [2,5] → "🔥 Kedd & Péntek"
  // pl. [2,5,6] → "🔥 Kedd, Péntek & Szombat"
  const dayNames = ['Vasárnap','Hétfő','Kedd','Szerda','Csütörtök','Péntek','Szombat'];
  const days = appData.bakingDaysDefault || [2,5];
  const names = days.map(d => dayNames[d] || '?');
  if (names.length === 0) return '';
  if (names.length === 1) return '🔥 ' + names[0];
  if (names.length === 2) return '🔥 ' + names[0] + ' & ' + names[1];
  return '🔥 ' + names.slice(0,-1).join(', ') + ' & ' + names[names.length-1];
}

function applyVevoHeader() {
  const el = document.getElementById('hero-subtitle');
  if (!el) return;
  const defaultText = 'Töltsd ki a havi megrendelődet a sütési napokra ({BAKING_DAYS}).{BR}Mentés előtt hagyhatsz üzenetet is.';
  const template = (appData.vevoHeaderText && appData.vevoHeaderText.trim()) || defaultText;
  // Placeholder helyettesítés
  const html = template
    .replace(/\{BAKING_DAYS\}/g, getBakingDayNamesText())
    .replace(/\{BR\}/g, '<br>');
  el.innerHTML = html;
}

if (typeof window !== 'undefined') {
  window.applyVevoHeader = applyVevoHeader;
  window.getBakingDayNamesText = getBakingDayNamesText;
}


// ============================================================
// v2.44.0: "Maradjak bejelentkezve" — KEREK saját login-tárolás
// localStorage-ban (KER-kód, email vagy név — amit a vevő megadott)
// ============================================================
const KEREK_VEVO_REMEMBER_KEY = 'kerek_vevo_remember_login';

function kerekVevoSaveLogin(loginValue) {
  try {
    const cb = document.getElementById('remember-vevo-login');
    if (cb && cb.checked && loginValue) {
      localStorage.setItem(KEREK_VEVO_REMEMBER_KEY, btoa(unescape(encodeURIComponent(loginValue))));
    } else {
      localStorage.removeItem(KEREK_VEVO_REMEMBER_KEY);
    }
  } catch(e) { console.warn('Vevő remember save failed:', e); }
}

function kerekVevoLoadLogin() {
  try {
    const saved = localStorage.getItem(KEREK_VEVO_REMEMBER_KEY);
    if (!saved) return;
    const val = decodeURIComponent(escape(atob(saved)));
    const input = document.getElementById('login-input');
    const cb = document.getElementById('remember-vevo-login');
    if (input && !input.value) input.value = val;
    if (cb) cb.checked = true;
  } catch(e) { console.warn('Vevő remember load failed:', e); }
}

function kerekVevoForgetLogin() {
  try { localStorage.removeItem(KEREK_VEVO_REMEMBER_KEY); } catch(e) {}
  const input = document.getElementById('login-input');
  const cb = document.getElementById('remember-vevo-login');
  if (input) input.value = '';
  if (cb) cb.checked = false;
}

if (typeof window !== 'undefined') {
  window.kerekVevoSaveLogin = kerekVevoSaveLogin;
  window.kerekVevoForgetLogin = kerekVevoForgetLogin;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', kerekVevoLoadLogin);
  } else {
    kerekVevoLoadLogin();
  }
}

// ===== v2.53.59: üzenet-jelző a fejlécben + deep-link az üzenetekhez =====
function _msgSeenKey(){ return `vevo_lastSeenMsg_${currentUser?.id||'x'}_${selectedYear}_${selectedMonth}`; }
// v2.53.64: csak az AKTUÁLIS hónap ADMIN-üzeneteit (📨/📢) számoljuk — a saját üzenetek
// és a többi hónap NEM számít (különben a badge a display-jel eltért, pl. "21").
function _curMonthAdminMsgs(){
  if (!appData?.messages || !currentUser) return [];
  const key = `${currentUser.id}-${selectedYear}-${selectedMonth}`;
  return (appData.messages[key] || []).filter(m => {
    const t = m.text || '';
    return t.startsWith('📨 Admin:') || t.startsWith('📢');
  });
}
function getUnreadMsgCount(){
  const seen = Number(localStorage.getItem(_msgSeenKey()) || 0);
  return _curMonthAdminMsgs().filter(m => new Date(m.ts).getTime() > seen).length;
}
function updateMsgIndicator(){
  const btn = document.getElementById('msg-btn');
  const badge = document.getElementById('msg-unread-badge');
  if (!btn || !badge) return;
  btn.style.display = _curMonthAdminMsgs().length > 0 ? 'inline-block' : 'none';
  const unread = getUnreadMsgCount();
  if (unread > 0){ badge.style.display='block'; badge.textContent = unread > 9 ? '9+' : String(unread); }
  else badge.style.display='none';
}
function markMessagesSeen(){
  const ts = _curMonthAdminMsgs().map(m => new Date(m.ts).getTime()).filter(n=>!isNaN(n));
  const max = ts.length ? Math.max(...ts) : Date.now();
  localStorage.setItem(_msgSeenKey(), String(max));
  updateMsgIndicator();
}
function showMessages(){
  const el = document.getElementById('order-messages-display');
  if (el){
    el.scrollIntoView({ behavior:'smooth', block:'center' });
    el.style.transition='box-shadow 0.3s'; el.style.boxShadow='0 0 0 3px var(--gold)';
    setTimeout(()=>{ el.style.boxShadow='none'; }, 1600);
  }
  markMessagesSeen();
  sessionStorage.removeItem("pendingOpenMsg");
}
if (typeof window !== 'undefined'){
  window.showMessages = showMessages;
  window.updateMsgIndicator = updateMsgIndicator;
  window.markMessagesSeen = markMessagesSeen;
}
// SW → app: push megnyitáskor az üzenetekhez ugrunk
if ('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('message', ev => {
    if (ev.data?.action === 'open-messages'){ sessionStorage.setItem('pendingOpenMsg','1'); tryOpenMessages(); }
  });
}
// Robusztus deep-link: megvárja, míg a user + az üzenetek betöltenek (mobilon lassabb)
function tryOpenMessages(attempt = 0){
  const ready = currentUser && document.getElementById('order-messages-display');
  if (ready){ showMessages(); return; }
  if (attempt < 40) setTimeout(() => tryOpenMessages(attempt + 1), 300); // max ~12 mp
}
window.tryOpenMessages = tryOpenMessages;
// Deep-link URL-paraméter (ha új ablak nyílt push-ból): a szándékot eltároljuk,
// mert a login-képernyő megjelenhet, és a doLogin végén sülünk el.
window.addEventListener('load', () => {
  if (new URLSearchParams(location.search).get('openmsg') === '1'){
    sessionStorage.setItem('pendingOpenMsg', '1');
    tryOpenMessages();  // ha már be van lépve (mentett session), azonnal
  }
});
