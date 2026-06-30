async function refreshAll() {
  const btn = document.getElementById('btn-refresh-all');
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
  try {
    await loadAllData();
    const activeView = document.querySelector('.view.active')?.id?.replace('view-','');
    if (activeView && RENDERS[activeView]) RENDERS[activeView]();
    updateMsgBadge();
    updatePendingBadge();
    toast('✅ Minden frissítve!');
  } catch(e) {
    toast('⚠️ Frissítés sikertelen: ' + e.message, true);
  } finally {
    if (btn) { btn.textContent = '🔄 Frissítés'; btn.disabled = false; }
  }
}

// ===== NAVIGATION =====
const VIEW_TITLES = {
  dashboard:'Dashboard', messages:'Üzenetek', baking:'Sütési lista',
  orders:'Rendelések összesítő', catalog:'Termékkatalógus', clients:'Kliensek',
  'client-detail':'Kliens adatlap', reports:'Kimutatások', categories:'Kategória bontás', settings:'Beállítások', 'audit-log':'Napló',
  export:'Adatok exportálása', 'data-audit':'🔍 Adat-állapot audit', push:'📢 Push üzenet', 'admin-help':'Súgó'
};
// Egyetlen globális render térkép – új nézetnél csak itt kell bővíteni
const RENDERS = {
  dashboard:()=>renderDashboard(),'admin-help':()=>renderAdminHelp(), messages:()=>renderMessages(), baking:()=>renderBaking(),
  orders:()=>renderOrders(), catalog:()=>renderCatalog(), clients:()=>renderClients(),
  reports:()=>renderReports(), categories:()=>renderCategories(), settings:()=>renderSettings(), 'audit-log':()=>renderAuditLog(),
  export:()=>initExportView(), 'client-detail':()=>{ if(clientDetailId) renderClientDetail(); },
  push:()=>renderPushBroadcast(),
  'data-audit':()=>{ if(typeof renderDataAudit==='function') renderDataAudit(); }
};
function updatePendingBadge() {
  var pendingClients = 0;
  (D.clients || []).forEach(function(cl) {
    if (cl.name && cl.name.indexOf('[PENDING]') === 0) pendingClients++;
  });
  var pb = document.getElementById('pending-badge');
  if (!pb) {
    var navEls = document.querySelectorAll('.nav-item');
    var clientNav = null;
    // v2.36.0 fix: use data-action (M7 refactor broke onclick lookup)
    navEls.forEach(function(el) {
      var act = el.getAttribute('onclick') || '';
      var dataAct = el.getAttribute('data-action') || '';
      var dataArg = el.getAttribute('data-arg1') || '';
      if (act.indexOf('clients') > -1 || (dataAct === 'nav' && dataArg === 'clients')) clientNav = el;
    });
    if (clientNav) {
      pb = document.createElement('span');
      pb.id = 'pending-badge';
      pb.style.cssText = 'background:var(--gold);color:var(--teal-dark);border-radius:10px;font-size:0.65rem;font-weight:700;padding:1px 6px;margin-left:4px;vertical-align:middle';
      clientNav.appendChild(pb);
    }
  }
  if (pb) { pb.textContent = pendingClients; pb.style.display = pendingClients > 0 ? 'inline' : 'none'; }

  var pendingOrders = 0;
  var curM = new Date().getMonth(); var curY = new Date().getFullYear();
  // v2.44.4: státusz nélküli = pending. v2.53.x FIX: ne csak az aktuális hónapot,
  // hanem MINDEN aktuális+jövőbeli hónapot számoljunk (a múltbeli pending már moot).
  // A kulcs felépítése: clientId-year-month-day → az utolsó 3 tag a dátum (clientId kötőjelei nem zavarnak).
  Object.keys(D.orders || {}).forEach(function(k) {
    var parts = k.split('-');
    var oM = parseInt(parts[parts.length - 2], 10);
    var oY = parseInt(parts[parts.length - 3], 10);
    if (isNaN(oY) || isNaN(oM)) return;
    if (oY < curY || (oY === curY && oM < curM)) return; // múltbeli hónap kihagyása
    var ords = D.orders[k] || {};
    var totalQty = 0;
    Object.values(ords).forEach(function(q){ totalQty += (Number(q) || 0); });
    if (totalQty === 0) return; // 0-mennyiségű rendelés nem számít
    var status = (D.orderStatus && D.orderStatus[k] && D.orderStatus[k].status) || 'pending';
    if (status === 'pending') pendingOrders++;
  });
  var ob = document.getElementById('orders-badge');
  if (!ob) {
    var navEls2 = document.querySelectorAll('.nav-item');
    var bakingNav = null;
    // v2.36.0 fix #6: use data-action (M7 refactor broke the onclick lookup → badge never created!)
    navEls2.forEach(function(el) {
      var act = el.getAttribute('onclick') || '';
      var dataAct = el.getAttribute('data-action') || '';
      var dataArg = el.getAttribute('data-arg1') || '';
      if (act.indexOf('baking') > -1 || (dataAct === 'nav' && dataArg === 'baking')) bakingNav = el;
    });
    if (bakingNav) {
      ob = document.createElement('span');
      ob.id = 'orders-badge';
      ob.style.cssText = 'background:var(--gold);color:var(--teal-dark);border-radius:10px;font-size:0.65rem;font-weight:700;padding:1px 6px;margin-left:4px;vertical-align:middle';
      bakingNav.appendChild(ob);
    }
  }
  if (ob) { ob.textContent = pendingOrders; ob.style.display = pendingOrders > 0 ? 'inline' : 'none'; }
}

function nav(id){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('view-'+id).classList.add('active');
  // v2.36.0 fix: use data-action (M7 refactor) — works with both old onclick and new data-action
  document.querySelectorAll('.nav-item').forEach(n=>{
    var act = n.getAttribute('onclick') || '';
    var dataAct = n.getAttribute('data-action') || '';
    var dataArg = n.getAttribute('data-arg1') || '';
    if (act.includes(`'${id}'`) || (dataAct === 'nav' && dataArg === id)) n.classList.add('active');
  });
  document.getElementById('topbar-title').textContent = VIEW_TITLES[id]||id;
  // Hide month bar for views with own selector or no months needed
  const HAS_OWN_MONTHS = ['catalog','baking','orders','reports','cat-breakdown','export'];
  const HIDE_MONTHS = ['clients','client-detail','settings','admin-help','push','data-audit'];
  const monthBar = document.getElementById('month-bar');
  if(monthBar) monthBar.style.display = (HAS_OWN_MONTHS.includes(id)||HIDE_MONTHS.includes(id)) ? 'none' : 'flex';
  document.getElementById('topbar-sub').textContent = new Date().toLocaleDateString('hu-HU',{year:'numeric',month:'long',day:'numeric'});
  currentView = id;
  // Olvasott jelölés csak kártya kinyitásakor (toggleMsgCard)
  RENDERS[id]?.();
}

// ===== HELPERS =====
function mk(y,m){return `${y}-${m}`;}
function ok(cid,y,m,d){return `${cid}-${y}-${m}-${d}`;}
function getActiveProds(y,m){ const ids=D.monthlyActiveProducts[mk(y,m)]||[]; return D.products.filter(p=>ids.includes(p.id) && !p.deleted_at); }
// M2: getDays removed (deduped to kerek-constants.js)
function getBakingDays(y,m){
  const key=`${y}-${m}`;
  const cal=D.bakingCalendar?.[key]||{extra:[],removed:[]};
  const defaultDays=D.bakingDaysDefault||[2,5];
  const days=getDays(y,m);
  const result=[];
  days.forEach(d=>{
    const dateStr=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const isDefault=defaultDays.includes(d.getDay());
    const isExtra=cal.extra.includes(dateStr);
    const isRemoved=cal.removed.includes(dateStr);
    if((isDefault||isExtra)&&!isRemoved) result.push(d);
  });
  return result;
}
function getMonthOrders(y,m){
  const res={};
  D.clients.forEach(c=>{
    getDays(y,m).forEach(d=>{
      const day=d.getDate(), key=ok(c.id,y,m,day);
      if(D.orders[key]){
        const _st=getOrderStatus(c.id,y,m,day);
        if(_st && _st.status==='cancelled') return; // visszautasított rendelés NEM számít az összesítésekbe (sütés/levain/forgalom)
        if(!res[day])res[day]={}; Object.entries(D.orders[key]).forEach(([pid,qty])=>{ res[day][pid]=(res[day][pid]||0)+qty; });
      }
    });
  });
  return res;
}
function getRevenue(orders,y,m){
  let r=0;
  Object.entries(orders).forEach(([day,prods])=>{ Object.entries(prods).forEach(([pid,qty])=>{ const p=D.products.find(p=>p.id==pid); if(p)r+=p.price*qty; }); });
  return r;
}
function getTotalQty(orders){ let q=0; Object.values(orders).forEach(day=>Object.values(day).forEach(v=>q+=v)); return q; }

function buildTopbarMonths(){
  const el=document.getElementById('topbar-month');
  el.innerHTML = MONTHS.map((mo,i)=>`<button class="month-btn ${i===selMonth?'active':''}" data-month="${i}" onclick="selectMonth(${i})">${mo}</button>`).join(''); updateMonthBadges();
}
function selectMonth(m){ selMonth=m; buildTopbarMonths(); RENDERS[currentView]?.(); }

// ===== DASHBOARD =====
function renderDashboard(){
  const y=selYear,m=selMonth;
  const mo=getMonthOrders(y,m);
  const rev=getRevenue(mo,y,m);
  const qty=getTotalQty(mo);
  const bdays=getBakingDays(y,m);
  const msgCount = typeof getUnreadCount === "function" ? getUnreadCount() : (() => { let n=0; Object.values(D.messages).forEach(a=>n+=a.length); return n; })();

  document.getElementById('dash-stats').innerHTML=[
    {val:D.clients.length,label:'Aktív vevő',icon:'👥',sub:''},
    {val:qty+' db',label:`Rendelés (${MONTHS[m]})`,icon:'📦',gold:false},
    {val:rev+' lej',label:'Becsült forgalom',icon:'💰',gold:true},
    {val:msgCount,label:'Olvasatlan üzenet',icon:'💬',gold:false},
  ].map(s=>`<div class="stat-box"><div class="stat-val ${s.gold?'gold':''}">${s.val}</div><div class="stat-label">${s.icon} ${s.label}</div></div>`).join('');

  // Weekly finance
  const now=new Date(); const weekStart=new Date(now); weekStart.setDate(now.getDate()-now.getDay()+1);
  let weekRev=0, weekQty=0;
  for(let i=0;i<7;i++){
    const d=new Date(weekStart); d.setDate(weekStart.getDate()+i);
    if(d.getMonth()!==m) continue;
    const dayOrders=mo[d.getDate()]||{};
    weekQty+=Object.values(dayOrders).reduce((a,b)=>a+b,0);
    Object.entries(dayOrders).forEach(([pid,qty])=>{ const p=D.products.find(p=>p.id==pid); if(p)weekRev+=p.price*qty; });
  }
  document.getElementById('weekly-finance').innerHTML=`
    <div class="flex justify-between" style="margin-bottom:14px">
      <div class="stat-box" style="flex:1;margin-right:12px"><div class="stat-val">${weekQty} db</div><div class="stat-label">🛒 Heti rendelés</div></div>
      <div class="stat-box" style="flex:1"><div class="stat-val gold">${weekRev} lej</div><div class="stat-label">💰 Heti forgalom</div></div>
    </div>
    <div style="font-size:0.8rem;color:var(--text-soft)">Hét: ${weekStart.toLocaleDateString('hu-HU',{month:'short',day:'numeric'})} – ${new Date(weekStart.getTime()+6*864e5).toLocaleDateString('hu-HU',{month:'short',day:'numeric'})}</div>`;

  // Monthly chart
  const months=[]; for(let i=5;i>=0;i--){ const d=new Date(y,m-i,1); months.push({m:d.getMonth(),y:d.getFullYear()}); }
  const vals=months.map(x=>getRevenue(getMonthOrders(x.y,x.m),x.y,x.m));
  const maxV=Math.max(...vals,1);
  document.getElementById('monthly-chart').innerHTML=vals.map((v,i)=>`<div class="bar-col"><div class="bar-v">${v>0?v:''}</div><div class="bar" style="height:${Math.max(v/maxV*90,3)}px;background:${i===5?'var(--gold)':'var(--teal-light)'}"></div></div>`).join('');
  document.getElementById('monthly-chart-labels').innerHTML=months.map((x,i)=>`<div style="flex:1;text-align:center;font-size:0.68rem;color:var(--text-soft);font-weight:${i===5?700:400}">${MONTHS_SHORT[x.m]}</div>`).join('');

  // Next baking + U6: levain calculation per day
  const upcoming=bdays.filter(d=>d>=now).slice(0,8);
  document.getElementById('next-baking').innerHTML=upcoming.map(d=>{
    const day=d.getDate(); const dayO=mo[day]||{}; const q=Object.values(dayO).reduce((a,b)=>a+b,0);

    // U6: Calculate levain needed for this day
    let levainG = 0;
    if (q > 0 && typeof D.recipes !== 'undefined' && D.recipes) {
      Object.entries(dayO).forEach(([pid, qty]) => {
        const recipe = D.recipes.find(r => r.product_id == pid);
        if (!recipe || !recipe.levain_amount) return;
        const basePortion = recipe.base_portion || 1000;
        const unitWeight = recipe.unit_weight || basePortion;
        const scale = (qty * unitWeight) / basePortion;
        levainG += Math.round(recipe.levain_amount * scale);
      });
    }

    const levainBadge = levainG > 0
      ? `<span style="font-size:0.72rem;color:var(--teal-dark);background:var(--teal-pale);border-radius:6px;padding:1px 7px;margin-top:3px;display:inline-block">🧫 ${levainG.toLocaleString()}g levain</span>`
      : '';

    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-weight:600;font-size:0.88rem">${DAYS_HU[d.getDay()]}, ${MONTHS[m]} ${day}.</div>
        <div class="text-xs text-soft">${q>0?q+' db rendelés':'Még nincs rendelés'}</div>
        ${levainBadge}
      </div>
      <span class="badge ${q>0?'badge-green':'badge-gray'}">${q>0?q+' db':'üres'}</span></div>`;
  }).join('')||'<p class="text-sm text-soft">Nincs több sütési nap ebben a hónapban.</p>';

  // Recent messages
  const recentMsgs=[];
  Object.entries(D.messages).forEach(([key,msgs])=>{
    const [cid,...rest]=key.split('-'); const client=D.clients.find(c=>c.id===cid);
    msgs.forEach(msg=>recentMsgs.push({client:client?.name||cid,text:msg.text,ts:msg.ts}));
  });
  recentMsgs.sort((a,b)=>new Date(b.ts)-new Date(a.ts));
  document.getElementById('recent-messages').innerHTML=recentMsgs.slice(0,6).map(m=>`
    <div style="padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="font-size:0.72rem;color:var(--teal-mid);font-weight:600">${m.client}</div>
      <div style="font-size:0.82rem;color:var(--text);margin-top:2px">${esc(m.text).slice(0,80)}${m.text.length>80?'…':''}</div>
    </div>`).join('')||'<p class="text-sm text-soft">Nincsenek üzenetek.</p>';
}

// ===== MODAL =====
function closeModal(id){ document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open');}));
// Verziószám megjelenítése
document.getElementById('login-version').textContent = APP_VERSION;
document.getElementById('app-version').textContent = APP_VERSION;

// ===== VEVO PREVIEW =====
function openVevoPreview() {
  // Populate client selector
  const sel = document.getElementById('preview-client-sel');
  sel.innerHTML = D.clients.map(c =>
    `<option value="${c.id}">${esc(c.name)}</option>`
  ).join('');

  // Set first client
  if (D.clients.length > 0) {
    switchPreviewClient(D.clients[0].id);
  }

  document.getElementById('vevo-preview-modal').classList.add('open');
}

function switchPreviewClient(clientId) {
  const client = D.clients.find(c => c.id === clientId);
  if (!client) return;

  // Show client code
  document.getElementById('preview-client-code').textContent = 'Kód: ' + clientId;

  // Load vevo.html in iframe with auto-login via URL param
  const frame = document.getElementById('vevo-preview-frame');
  frame.src = 'vevo.html?preview=' + clientId;
}

function openVevoFullscreen() {
  const sel = document.getElementById('preview-client-sel');
  const clientId = sel.value;
  window.open('vevo.html?preview=' + clientId, '_blank', 'width=420,height=800');
}

// ===== TOAST =====
function toast(msg, isError=false){
  const el=document.getElementById('toast');
  el.textContent=msg; el.style.display='block'; el.style.opacity='1';
  el.style.background = isError ? '#b91c1c' : '';
  if(isError) console.error('KEREK ERROR:', msg);
  clearTimeout(el._t);
  const duration = isError ? 8000 : 3000;
  el._t=setTimeout(()=>{el.style.opacity='0';setTimeout(()=>el.style.display='none',300);},duration);
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
}
