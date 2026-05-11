// ===== CONSTANTS =====
// BAKING_DAYS now dynamic - loaded from shared data

// ===== DATA =====
let appData = JSON.parse(localStorage.getItem('kerek_vevo_data') || 'null') || {
  products: [
    { id:1, name:'Kovászos prémium kenyér', weight:'500 g', price:23, category:'Kenyér', desc:'Összetevők: rizsliszt, hajdinaliszt, kukoricakeményítő, víz, kovász, só, psyllium.\n\nAllergenek: GLUTÉNMENTES, tojásmentes, tejtermékmentes.\n\nTárolás: szobahőmérsékleten 3-4 nap, fagyasztva 3 hónap.', image:null },
    { id:2, name:'Kovászos prémium kenyér', weight:'1000 g', price:35, category:'Kenyér', desc:'Összetevők: rizsiszt, hajdinaliszt, kukoricakeményítő, víz, kovász, só, psyllium.\n\nAllergenek: GLUTÉNMENTES, tojásmentes, tejtermékmentes.\n\nTárolás: szobahőmérsékleten 3-4 nap, fagyasztva 3 hónap.', image:null },
    { id:3, name:'„Diabétesz" kenyér', weight:'1000 g', price:38, category:'Kenyér', desc:'Alacsony glikémiás indexű kenyér. Összetevők: mandulaliszt, hajdinaliszt, len, psyllium, kovász, só.\n\nAllergenek: GLUTÉNMENTES, tojásmentes.\n\nDiabéteszeseknek ajánlott.', image:null },
    { id:4, name:'Fehér kenyér', weight:'1000 g', price:32, category:'Kenyér', desc:'Ízletes gluténmentes fehér kenyér. Összetevők: rizsiszt, tapioka, víz, kovász, só, psyllium.\n\nAllergenek: GLUTÉNMENTES, tojásmentes, tejtermékmentes.', image:null },
    { id:5, name:'Kovászos bagett', weight:'360 g', price:16, category:'Bagett / zsömle', desc:'Ropogós héjú kovászos bagett. Összetevők: rizsiszt, hajdina, víz, kovász, só.\n\nAllergenek: GLUTÉNMENTES.\n\nTárolás: 2 nap szobahőn, fagyasztható.', image:null },
    { id:6, name:'Kovászos zsömle', weight:'100 g', price:6, category:'Bagett / zsömle', desc:'Kis méretű kovászos zsömle szendvicsekhez ideális.\n\nAllergenek: GLUTÉNMENTES, tojásmentes.', image:null },
    { id:7, name:'Guilt free kuglóf', weight:'260 g', price:29, category:'Sütemény', desc:'Cukor- és gluténmentes kuglóf. Összetevők: mandulaliszt, kókuszliszt, tojás, kókuszolaj, eritrit, vanília.\n\nAllergenek: tojást tartalmaz, GLUTÉNMENTES.', image:null },
    { id:8, name:'Sós sütemény', weight:'100 g', price:12, category:'Sütemény', desc:'Ropogós gluténmentes sós sütemény köménymaggal vagy szezámmaggal.\n\nAllergenek: GLUTÉNMENTES.', image:null },
    { id:9, name:'Mákos/diós kifli', weight:'100 g', price:12, category:'Sütemény', desc:'Hagyományos ízek gluténmentes változatban. Mákos vagy diós töltelékkel.\n\nAllergenek: diót tartalmaz, GLUTÉNMENTES.', image:null },
    { id:10, name:'Szilvás gombóc', weight:'60 g', price:6, category:'Sütemény', desc:'Szilvás töltelékű gombóc, gluténmentes tésztával.\n\nAllergenek: GLUTÉNMENTES, tejtermékmentes.\n\nFrissen a legjobb, fagyasztható.', image:null },
  ],
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
async function doLogin() {
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
      sb.query('clients'),
      sb.query('products', {order:'id'}),
      sb.query('monthly_active_products'),
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

  const normalizedVal = val.replace(/-/g,'').toLowerCase();
  const client = appData.clients.find(c =>
    c.id === val ||
    c.id.toLowerCase() === val ||
    c.id.replace(/-/g,'').toLowerCase() === normalizedVal ||
    c.name.toLowerCase() === val
  );
  if (client) {
    currentUser = client;
    document.getElementById('login-screen').style.display = 'none';
    auditLog('login', currentUser.name||currentUser.id, 'Vevő belépés');
    document.getElementById('user-badge').textContent = '👤 ' + esc(client.name);
    document.getElementById('hero-greeting').textContent = 'Szia, ' + esc(client.name.split(' ')[1]) + '! 👋';
    // Vevő rendelései + üzenetei Supabase-ből
    try {
      const [userOrders, userMsgs, calData] = await Promise.all([
        sb.query('orders', {filter: `client_id=eq.${client.id}`, limit: 2000}),
        sb.query('messages', {filter: `client_id=eq.${client.id}`, order: 'created_at'}),
        sb.query('baking_calendar'),
      ]);
      (userOrders||[]).forEach(r => {
        const k = getOrderKey(r.client_id, r.year, r.month, r.day);
        if(!appData.orders[k]) appData.orders[k] = {};
        appData.orders[k][r.product_id] = r.quantity;
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
    // Üzenetek auto-frissítése 30 másodpercenként
    if(window._msgPollTimer) clearInterval(window._msgPollTimer);
    window._msgPollTimer = setInterval(()=>{ if(currentUser) loadMessage(); }, 30000);
  } else {
    const errEl = document.getElementById('login-error');
    if(errEl) { errEl.textContent = '❌ Ismeretlen kód! Kérj segítséget a pékségtől.'; errEl.style.display='block'; }
    const inp = document.getElementById('login-input');
    if(inp) { inp.style.border='1.5px solid #ef4444'; inp.focus(); inp.addEventListener('input', () => { if(errEl) errEl.style.display='none'; inp.style.border=''; }, {once:true}); }
  }
}
function logout() { localStorage.removeItem('kerek_vevo_data');
  localStorage.removeItem('kerek_data'); window.location.href = 'index.html'; }
