// ===== BAKING STATUS MACHINE =====
function getOrderStatus(clientId, year, month, day) {
  const k = ok(clientId, year, month, day);
  return (D.orderStatus && D.orderStatus[k]) || { status: 'pending' };
}

function statusBadge(status) {
  const map = {
    pending:   '<span style="background:#fef9c3;color:#854d0e;border-radius:6px;padding:2px 8px;font-size:0.7rem;font-weight:600">⏳ Vár</span>',
    confirmed: '<span style="background:#dcfce7;color:#166534;border-radius:6px;padding:2px 8px;font-size:0.7rem;font-weight:600">✅ Jóváhagyva</span>',
    modified:  '<span style="background:#fef3c7;color:#92400e;border-radius:6px;padding:2px 8px;font-size:0.7rem;font-weight:600">✏️ Módosítva</span>',
    cancelled: '<span style="background:#fee2e2;color:#b91c1c;border-radius:6px;padding:2px 8px;font-size:0.7rem;font-weight:600">❌ Visszavonva</span>',
  };
  return map[status] || map.pending;
}

async function confirmDay(year, month, day) {
  const clients = D.clients.filter(c => {
    const k = ok(c.id, year, month, day);
    return D.orders[k] && Object.values(D.orders[k]).some(q => q > 0);
  });
  if (!clients.length) { toast('Nincs rendelés ezen a napon.'); return; }
  const deadline = new Date(year, month, day - 1, 18, 0, 0).toISOString();
  const now = new Date().toISOString();
  try {
    for (const c of clients) {
      const row = { client_id: c.id, year, month, day, status: 'confirmed', deadline, confirmed_at: now, admin_note: null };
      await sb.upsert('order_status', row, 'client_id,year,month,day');
      if (!D.orderStatus) D.orderStatus = {};
      D.orderStatus[ok(c.id, year, month, day)] = { status: 'confirmed', deadline, confirmed_at: now, admin_note: null };
    }
    toast('✅ Összes rendelés jóváhagyva!');
    await auditLog('order_confirm_day', `${year}-${month}-${day}`, `${clients.length} rendelés`);
    renderBaking();
  } catch(e) { toast('⚠️ Hiba: ' + e.message, true); }
}

async function confirmSingleOrder(clientId, year, month, day) {
  const deadline = new Date(year, month, day - 1, 18, 0, 0).toISOString();
  const now = new Date().toISOString();
  const row = { client_id: clientId, year, month, day, status: 'confirmed', deadline, confirmed_at: now };
  try {
    await sb.upsert('order_status', row, 'client_id,year,month,day');
    if (!D.orderStatus) D.orderStatus = {};
    D.orderStatus[ok(clientId, year, month, day)] = { status: 'confirmed', deadline, confirmed_at: now };
    toast('✅ Rendelés jóváhagyva!');
    renderBaking();
  } catch(e) { toast('⚠️ Hiba: ' + e.message, true); }
}

// Aktív modify célpont – elkerüli az inline onclick escapelési problémákat
let _modifyTarget = null;

function openModifyDialog(clientId, year, month, day, clientName) {
  _modifyTarget = { clientId, year, month, day };
  const k = ok(clientId, year, month, day);
  const cur = (D.orderStatus && D.orderStatus[k]) || {};
  const curNote = (cur.admin_note || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const orders = D.orders[k] || {};

  let productRows = '';
  Object.entries(orders).forEach(function(e) {
    const pid = e[0], qty = e[1];
    const p = D.products.find(function(p){ return p.id == pid; });
    if (!p) return;
    productRows +=
      '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border)">' +
      '<span style="flex:1;font-size:0.88rem">' + esc(p.name) + ' <span style="color:var(--text-soft);font-size:0.78rem">' + esc(p.weight||'') + '</span></span>' +
      '<input type="number" min="0" max="999" value="' + qty + '" data-pid="' + pid + '" style="width:64px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;font-size:0.9rem;text-align:center">' +
      '<span style="font-size:0.78rem;color:var(--text-soft)">db</span>' +
      '</div>';
  });

  const el = document.createElement('div');
  el.id = 'modify-overlay';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:9999;display:flex;align-items:center;justify-content:center';
  el.addEventListener('click', function(e){ if(e.target===el) closeModifyDialog(); });
  el.innerHTML =
    '<div style="background:#fff;border-radius:16px;padding:28px;width:90%;max-width:440px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.2)">' +
    '<h3 style="margin:0 0 4px;color:var(--teal-dark)">✏️ Rendelés módosítása</h3>' +
    '<p style="margin:0 0 14px;color:var(--text-soft);font-size:0.88rem">' + esc(clientName) + ' &middot; ' + MONTHS[month] + ' ' + day + '.</p>' +
    '<div id="modify-products" style="margin-bottom:14px">' + productRows + '</div>' +
    '<label style="font-size:0.85rem;font-weight:600;color:var(--text)">Megjegyzés a vevőnek:</label>' +
    '<textarea id="modify-note" rows="2" placeholder="pl. Csak 7 db fehér kenyér áll rendelkezésre" style="width:100%;box-sizing:border-box;margin:6px 0 16px;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:0.88rem;font-family:inherit;resize:vertical">' + curNote + '</textarea>' +
    '<div style="display:flex;gap:10px;justify-content:flex-end">' +
    '<button id="modify-cancel-btn" style="padding:8px 18px;border:1px solid var(--border);border-radius:8px;background:#fff;cursor:pointer">Mégse</button>' +
    '<button id="modify-save-btn" style="padding:8px 18px;background:var(--gold);color:var(--teal-dark);border:none;border-radius:8px;font-weight:600;cursor:pointer">Mentés</button>' +
    '</div></div>';
  document.body.appendChild(el);
  el.querySelector('#modify-cancel-btn').addEventListener('click', closeModifyDialog);
  el.querySelector('#modify-save-btn').addEventListener('click', saveModify);
  el.querySelector('#modify-note').focus();
}

function closeModifyDialog() {
  const el = document.getElementById('modify-overlay');
  if (el) el.remove();
  _modifyTarget = null;
}

async function saveModify() {
  if (!_modifyTarget) return;
  const { clientId, year, month, day } = _modifyTarget;
  const note = (document.getElementById('modify-note') || {}).value || '';
  const trimmed = note.trim();
  const deadline = new Date(year, month, day - 1, 18, 0, 0).toISOString();

  // Mennyiség inputok kiolvasása
  const inputs = document.querySelectorAll('#modify-products input[data-pid]');
  const changes = [];
  inputs.forEach(function(inp) {
    const pid = inp.getAttribute('data-pid');
    const newQty = parseInt(inp.value) || 0;
    const k = ok(clientId, year, month, day);
    const oldQty = (D.orders[k] || {})[pid] || 0;
    if (newQty !== oldQty) changes.push({ pid, newQty, oldQty });
  });

  try {
    // Orders frissítése ahol változott a mennyiség
    for (const ch of changes) {
      await sb.upsert('orders', { client_id: clientId, year, month, day, product_id: parseInt(ch.pid), quantity: ch.newQty }, 'client_id,year,month,day,product_id');
      const k = ok(clientId, year, month, day);
      if (!D.orders[k]) D.orders[k] = {};
      D.orders[k][ch.pid] = ch.newQty;
    }

    // Státusz mentése
    const row = { client_id: clientId, year, month, day, status: 'modified', admin_note: trimmed, deadline };
    await sb.upsert('order_status', row, 'client_id,year,month,day');
    if (!D.orderStatus) D.orderStatus = {};
    D.orderStatus[ok(clientId, year, month, day)] = { status: 'modified', admin_note: trimmed, deadline };

    closeModifyDialog();
    const changeDesc = changes.length > 0
      ? changes.map(function(c){ return 'pid' + c.pid + ': ' + c.oldQty + '→' + c.newQty; }).join(', ')
      : 'csak megjegyzés';
    toast('✏️ Rendelés módosítva!');
    await auditLog('order_modify', year + '-' + month + '-' + day, clientId + ' [' + changeDesc + '] ' + trimmed);
    renderBaking();
  } catch(e) { toast('⚠️ Hiba: ' + e.message, true); console.error('saveModify:', e); }
}

async function cancelOrder(clientId, year, month, day, clientName) {
  if (!confirm('Visszavonod ' + clientName + ' rendelését (' + MONTHS[month] + ' ' + day + '.)?')) return;
  const row = { client_id: clientId, year, month, day, status: 'cancelled', deadline: new Date(year, month, day - 1, 18, 0, 0).toISOString() };
  try {
    await sb.upsert('order_status', row, 'client_id,year,month,day');
    if (!D.orderStatus) D.orderStatus = {};
    D.orderStatus[ok(clientId, year, month, day)] = { status: 'cancelled' };
    toast('❌ Rendelés visszavonva.');
    await auditLog('order_cancel', year + '-' + month + '-' + day, clientId);
    renderBaking();
  } catch(e) { toast('⚠️ Hiba: ' + e.message, true); }
}

// ===== BAKING =====
function renderBaking(){
  const sel=document.getElementById('baking-month-sel');
  sel.innerHTML=MONTHS.map(function(mo,i){ return '<button class="month-btn ' + (i===selMonth?'active':'') + '" onclick="selectMonth(' + i + ')">' + mo + '</button>'; }).join('');
  const y=selYear,m=selMonth;
  const bdays=getBakingDays(y,m);
  const activeP=getActiveProds(y,m);
  let html='';

  bdays.forEach(function(d){
    const day=d.getDate(); const dayName=DAYS_HU[d.getDay()];
    let totalQty=0, totalRev=0;
    const aggr={};
    const dayClients=[];

    D.clients.forEach(function(c){
      const key=ok(c.id,y,m,day); const o=D.orders[key];
      if(!o) return;
      const qty=Object.values(o).reduce(function(a,b){return a+b;},0);
      if(!qty) return;
      Object.entries(o).forEach(function(e){ const pid=e[0],q=e[1]; aggr[pid]=(aggr[pid]||0)+q; totalQty+=q; const p=D.products.find(function(p){return p.id==pid;}); if(p)totalRev+=p.price*q; });
      const st=getOrderStatus(c.id,y,m,day);
      dayClients.push({ c:c, key:key, o:o, st:st });
    });

    const allConfirmed = dayClients.length > 0 && dayClients.every(function(x){return x.st.status==='confirmed';});
    const confirmBtnHtml = totalQty > 0
      ? '<button onclick="event.stopPropagation();confirmDay(' + y + ',' + m + ',' + day + ')" style="background:' + (allConfirmed?'#dcfce7':'var(--gold)') + ';color:' + (allConfirmed?'#166534':'var(--teal-dark)') + ';border:none;border-radius:8px;padding:5px 12px;font-size:0.76rem;font-weight:600;cursor:pointer">' + (allConfirmed?'✅ Mind jóváhagyva':'✅ Mindent jóváhagy') + '</button>'
      : '';

    html+='<div class="baking-day-card">';
    html+='<div class="baking-day-head" onclick="toggleBakingDay(this)" style="cursor:pointer">';
    html+='<h4>🔥 ' + dayName + ', ' + MONTHS[m] + ' ' + day + '.</h4>';
    html+='<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">';
    html+='<span class="badge badge-teal">' + totalQty + ' db</span>';
    html+='<span class="badge badge-gold">' + totalRev + ' lej</span>';
    html+=confirmBtnHtml;
    html+='<span style="color:white;font-size:0.8rem">▾</span>';
    html+='</div></div>';
    html+='<div class="baking-day-body">';

    activeP.forEach(function(p){
      const totalForP=aggr[p.id]||0;
      if(!totalForP) return;
      html+='<div class="baking-line"><span style="font-weight:600">' + esc(p.name) + ' <span class="text-xs text-soft">' + esc(p.weight) + '</span></span><span class="baking-qty">' + totalForP + ' db</span></div>';
    });

    if(totalQty===0){
      html+='<div class="baking-line text-soft">Nincs rendelés erre a napra.</div>';
    } else {
      html+='<div class="baking-line" style="background:var(--teal-pale);font-weight:700"><span>ÖSSZESEN</span><span style="color:var(--teal-dark)">' + totalQty + ' db &middot; ' + totalRev + ' lej</span></div>';
      html+='<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px">';
      dayClients.forEach(function(x){
        const c=x.c, o=x.o, st=x.st;
        const cQty=Object.values(o).reduce(function(a,b){return a+b;},0);
        const cRev=Object.entries(o).reduce(function(a,e){ const pid=e[0],q=e[1]; const p=D.products.find(function(p){return p.id==pid;}); return a+(p?p.price*q:0); },0);
        const safeId=c.id.replace(/'/g,"\\'");
        const safeName=c.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        html+='<div style="display:flex;align-items:center;gap:8px;padding:8px 4px;border-bottom:1px solid var(--border);flex-wrap:wrap">';
        html+='<span style="min-width:120px;font-size:0.88rem;font-weight:600">👤 ' + esc(c.name) + '</span>';
        html+='<span style="font-size:0.82rem;color:var(--text-soft)">' + cQty + ' db &middot; ' + cRev + ' lej</span>';
        html+=statusBadge(st.status);
        if(st.admin_note) html+='<span style="font-size:0.75rem;color:var(--text-soft);font-style:italic;width:100%;padding-left:4px">📝 ' + esc(st.admin_note) + '</span>';
        if(st.status !== 'cancelled') {
          html+='<div style="display:flex;gap:6px;margin-left:auto">';
          if(st.status !== 'confirmed') html+='<button onclick="confirmSingleOrder(\'' + safeId + '\',' + y + ',' + m + ',' + day + ')" style="background:#dcfce7;color:#166534;border:none;border-radius:6px;padding:4px 10px;font-size:0.75rem;cursor:pointer" title="Jóváhagyás">✅</button>';
          html+='<button onclick="openModifyDialog(\'' + safeId + '\',' + y + ',' + m + ',' + day + ',\'' + safeName + '\')" style="background:#fef3c7;color:#92400e;border:none;border-radius:6px;padding:4px 10px;font-size:0.75rem;cursor:pointer" title="Módosítás">✏️</button>';
          html+='<button onclick="cancelOrder(\'' + safeId + '\',' + y + ',' + m + ',' + day + ',\'' + safeName + '\')" style="background:#fee2e2;color:#b91c1c;border:none;border-radius:6px;padding:4px 10px;font-size:0.75rem;cursor:pointer" title="Visszavonás">❌</button>';
          html+='</div>';
        }
        html+='</div>';
      });
      html+='</div>';
    }
    html+='</div></div>';
  });

  document.getElementById('baking-content').innerHTML=html||'<p class="text-soft">Nincsenek sütési napok.</p>';
}
function toggleBakingDay(el){ el.nextElementSibling.classList.toggle('open'); }

// ===== BAKING CALENDAR =====
function initBakingCalendar(){
  const sel=document.getElementById('cal-month-sel');
  if(!sel) return;
  const now=new Date();
  sel.innerHTML='';
  // Show current month ±3 months
  for(let i=-1;i<=4;i++){
    const d=new Date(now.getFullYear(), now.getMonth()+i, 1);
    const val=`${d.getFullYear()}-${d.getMonth()}`;
    const opt=document.createElement('option');
    opt.value=val;
    opt.textContent=MONTHS[d.getMonth()]+' '+d.getFullYear();
    if(i===0) opt.selected=true;
    sel.appendChild(opt);
  }
  renderDefaultDayToggles();
  renderBakingCalendar();
}

function renderDefaultDayToggles(){
  const days=['V','H','K','Sze','Cs','P','Szo'];
  const defaults=D.bakingDaysDefault||[2,5];
  document.getElementById('default-baking-days').innerHTML=days.map((d,i)=>`
    <div onclick="toggleDefaultDay(${i})" style="width:42px;height:42px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:0.82rem;cursor:pointer;border:2px solid ${defaults.includes(i)?'var(--teal)':'var(--border)'};background:${defaults.includes(i)?'var(--teal)':'white'};color:${defaults.includes(i)?'white':'var(--text-soft)'};transition:all 0.2s">${d}</div>
  `).join('');
}

async function toggleDefaultDay(dow){
  if(!D.bakingDaysDefault) D.bakingDaysDefault=[2,5];
  const idx=D.bakingDaysDefault.indexOf(dow);
  if(idx>-1) D.bakingDaysDefault.splice(idx,1);
  else D.bakingDaysDefault.push(dow);
  try { await sb.setSetting('baking_days_default', D.bakingDaysDefault); } catch(e){ toast('⚠️ Mentés sikertelen: '+e.message, true); }
  save(); renderDefaultDayToggles(); renderBakingCalendar();
  toast('Alapértelmezett sütési napok frissítve!');
}

function renderBakingCalendar(){
  const sel=document.getElementById('cal-month-sel');
  if(!sel) return;
  const [y,m]=sel.value.split('-').map(Number);
  const key=`${y}-${m}`;
  if(!D.bakingCalendar) D.bakingCalendar={};
  if(!D.bakingCalendar[key]) D.bakingCalendar[key]={extra:[],removed:[]};
  const cal=D.bakingCalendar[key];
  const defaults=D.bakingDaysDefault||[2,5];
  const days=getDays(y,m);
  const grid=document.getElementById('baking-calendar-grid');
  if(!grid) return;

  // Day headers
  const dayHeaders=['H','K','Sze','Cs','P','Szo','V'];
  let html=dayHeaders.map(d=>`<div style="text-align:center;font-size:0.72rem;font-weight:600;color:var(--text-soft);padding:4px 0">${d}</div>`).join('');

  // Empty cells before first day (Monday=0 based)
  const firstDay=days[0].getDay(); // 0=Sun
  const offset=firstDay===0?6:firstDay-1; // Monday-based offset
  for(let i=0;i<offset;i++) html+=`<div></div>`;

  days.forEach(d=>{
    const dateStr=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const dow=d.getDay();
    const isDefault=defaults.includes(dow);
    const isExtra=cal.extra.includes(dateStr);
    const isRemoved=cal.removed.includes(dateStr);
    const isToday=d.toDateString()===new Date().toDateString();

    let bg='#f9fafb', border='#e5e7eb', color='var(--text)', icon='';
    if(isRemoved){ bg='#fee2e2'; border='#fca5a5'; color='#b91c1c'; icon='✕'; }
    else if(isExtra){ bg='var(--gold)'; border='var(--gold-dark)'; color='var(--teal-dark)'; icon='★'; }
    else if(isDefault){ bg='var(--teal)'; border='var(--teal-dark)'; color='white'; icon='🔥'; }

    const todayRing=isToday?'box-shadow:0 0 0 2px var(--gold-dark);':'' ;

    html+=`<div onclick="toggleCalDay('${dateStr}',${isDefault},${isExtra},${isRemoved},'${key}')"
      style="border-radius:8px;border:1.5px solid ${border};background:${bg};color:${color};
      padding:6px 4px;text-align:center;cursor:pointer;transition:all 0.15s;${todayRing}
      min-height:44px;display:flex;flex-direction:column;align-items:center;justify-content:center">
      <div style="font-size:0.78rem;font-weight:600">${d.getDate()}</div>
      <div style="font-size:0.65rem">${icon}</div>
    </div>`;
  });

  grid.innerHTML=html;

  // Summary
  const activeDays=getBakingDays(y,m);
  const extraCount=cal.extra.length;
  const removedCount=cal.removed.length;
  document.getElementById('baking-cal-summary').innerHTML=
    `<b>${activeDays.length} sütési nap</b> ebben a hónapban` +
    (extraCount>0?` · <span style="color:var(--gold-dark)">+${extraCount} extra</span>`:'') +
    (removedCount>0?` · <span style="color:#b91c1c">${removedCount} kihagyva</span>`:'');
}

function toggleCalDay(dateStr, isDefault, isExtra, isRemoved, key){
  if(!D.bakingCalendar[key]) D.bakingCalendar[key]={extra:[],removed:[]};
  const cal=D.bakingCalendar[key];

  if(isDefault && !isRemoved){
    // Default baking day → remove it
    cal.removed.push(dateStr);
    toast('Nap kihagyva – nem lesz sütés ezen a napon.');
  } else if(isDefault && isRemoved){
    // Removed default → restore
    cal.removed=cal.removed.filter(d=>d!==dateStr);
    toast('Nap visszaállítva – ismét sütési nap.');
  } else if(isExtra){
    // Extra → remove extra
    cal.extra=cal.extra.filter(d=>d!==dateStr);
    toast('Extra sütési nap eltávolítva.');
  } else {
    // Normal day → add as extra
    cal.extra.push(dateStr);
    toast('Extra sütési nap hozzáadva! 🎉');
  }
  save();
  // Supabase sync
  const [calY, calM] = key.split('-').map(Number);
  sb.upsert('baking_calendar',{year:calY,month:calM,extra_dates:cal.extra,removed_dates:cal.removed}, 'year,month')
    .then(()=>console.log('Cal saved OK:', {extra:cal.extra,removed:cal.removed}))
    .catch(e=>{ console.error('cal save err:', e.message); toast('⚠️ Naptár mentés sikertelen: '+e.message, true); });
  renderBakingCalendar();
}

