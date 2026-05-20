
// ===== PWA INSTALL =====
let _pwaInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _pwaInstallPrompt = e;
  const bar = document.getElementById('pwa-install-bar');
  if (bar) bar.style.display = 'block';
});
window.addEventListener('appinstalled', () => {
  const bar = document.getElementById('pwa-install-bar');
  if (bar) bar.style.display = 'none';
  _pwaInstallPrompt = null;
});
async function installPWA() {
  if (!_pwaInstallPrompt) {
    alert('iOS Safari-n: Megosztás (□↑) gomb → "Hozzáadás a kezdőképernyőhöz"');
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
    const [clients, products, maps, settings_cond, settings_del, settings_bake] = await Promise.all([
      sb.query('clients', {limit: 500}),
      sb.query('products', {order:'id', limit: 500}),
      sb.query('monthly_active_products', {limit: 2000}),
      sb.getSetting('help_conditions'),
      sb.getSetting('help_delivery'),
      sb.getSetting('baking_days_default'),
    ]);

    if(clients?.length) {
      appData.clients = clients.map(c=>({id:c.id,name:c.name,email:c.email||'',phone:c.phone||''}));
    }
    if(products?.length) {
      appData.products = products.map(p=>({
        id:p.id, name:p.name, weight:p.weight||'', price:p.price||0,
        category:p.category||'', desc:p.description||'', image:p.image||null,
        marketing_desc:p.marketing_desc||'', ingredient_label:p.ingredient_label||'',
        allergens:p.allergens||'', nutrition:p.nutrition||null
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
    if(settings_cond) appData.helpConditions = settings_cond;
    if(settings_del) appData.helpDelivery = settings_del;
    if(settings_bake) appData.bakingDaysDefault = settings_bake;
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
    const _errEl = document.getElementById('login-error');
    if(_errEl) { _errEl.textContent = '❌ Ez a fiók deaktiválva lett. Vedd fel a kapcsolatot a KEREK pékséggel.'; _errEl.style.display='block'; }
    return;
  }
  if (client) {
    currentUser = client;
    document.getElementById('login-screen').style.display = 'none';
    auditLog('login', currentUser.name||currentUser.id, 'Vevő belépés');
    document.getElementById('user-badge').textContent = '👤 ' + esc(client.name);
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
    buildMonthSelectors();
    renderOrderTable();
    updateHeroTotal();
    loadMessage();
    renderHelpConditions();
    initPushSubscription().then(() => updatePushBtn()).catch(() => updatePushBtn());
    // Üzenetek auto-frissítése 30 másodpercenként
    if(window._msgPollTimer) clearInterval(window._msgPollTimer);
    window._msgPollTimer = setInterval(async ()=>{
      if(!currentUser) return;
      loadMessage();
      try {
        const st = await sb.query('order_status', {filter: `client_id=eq.${currentUser.id}`, limit: 500});
        if(!appData.orderStatus) appData.orderStatus = {};
        let changed = false;
        (st||[]).forEach(r => {
          const k = getOrderKey(r.client_id, r.year, r.month, r.day);
          const prev = (appData.orderStatus[k]||{}).status;
          appData.orderStatus[k] = {status: r.status, admin_note: r.admin_note};
          if (prev !== r.status) changed = true;
        });
        if (changed) renderOrderTable();
      } catch(e) {}
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

// ===== WEB PUSH =====
const VAPID_PUBLIC_KEY = 'BKnbS6hp1HTdh5BcNOvVTtBdmYWNj48F0jSG6NgQ1vVkboNvsATvbn2uoSP0pFpDTIQlMQ6wa4nI9j8v1jo-7SM';

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
      await savePushSubscription(existing);
      return;
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
