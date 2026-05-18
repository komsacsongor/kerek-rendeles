// ===== CLIENTS =====
function showRegLink() {
  const base = location.origin + location.pathname.replace('admin.html', 'register.html');
  const modal = document.getElementById('inv-modal') || (() => {
    const m = document.createElement('div');
    m.id = 'inv-modal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    document.body.appendChild(m); return m;
  })();
  modal.innerHTML = `<div style="background:white;border-radius:16px;padding:28px;width:100%;max-width:480px">
    <h3 style="font-family:'Fraunces',serif;color:var(--teal-dark);margin:0 0 8px">🔗 Regisztrációs link</h3>
    <p style="font-size:0.82rem;color:var(--text-soft);margin-bottom:16px">Küldd el ezt a linket a vevőknek. Regisztráció után te hagyod jóvá a hozzáférést.</p>
    <div style="background:var(--bg-soft);border-radius:8px;padding:12px;font-family:monospace;font-size:0.82rem;word-break:break-all;color:var(--teal-dark);margin-bottom:12px">${base}</div>
    <div style="display:flex;gap:8px">
      <button onclick="navigator.clipboard.writeText('${base}').then(()=>toast('✅ Link másolva!'))"
        style="flex:1;padding:10px;background:var(--teal-dark);color:var(--gold);border:none;border-radius:8px;cursor:pointer;font-family:'Kodchasan',sans-serif;font-weight:700">
        📋 Link másolása
      </button>
      <button onclick="document.getElementById('inv-modal').style.display='none'"
        style="padding:10px 16px;border:1px solid var(--border);background:none;border-radius:8px;cursor:pointer;font-family:'Kodchasan',sans-serif">
        Bezár
      </button>
    </div>
    <p style="font-size:0.72rem;color:var(--text-soft);margin-top:12px;margin-bottom:0">
      💡 Küldheted csoportosan is – bárki regisztrálhat, de te hagyod jóvá.
    </p>
  </div>`;
  modal.style.display = 'flex';
}

function renderClients(){
  document.getElementById('clients-grid').innerHTML=D.clients.map(c=>{
    const initials=c.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    let totalQty=0,totalRev=0;
    Object.entries(D.orders).forEach(([key,o])=>{
      if(!key.startsWith(c.id+'-')) return;
      Object.entries(o).forEach(([pid,qty])=>{totalQty+=qty;const p=D.products.find(p=>p.id==pid);if(p)totalRev+=p.price*qty;});
    });
    const pendingBanner = c.active === false
      ? `<div style="background:#fffbeb;color:#92400e;font-size:0.72rem;font-weight:700;padding:4px 12px;display:flex;justify-content:space-between;align-items:center">
          <span>⏳ Jóváhagyásra vár</span>
          <button onclick="event.stopPropagation();approveClient('${c.id}')" style="background:var(--teal-dark);color:var(--gold);border:none;border-radius:4px;padding:2px 8px;cursor:pointer;font-size:0.72rem;font-family:'Kodchasan',sans-serif">✅ Jóváhagyás</button>
         </div>` : '';
    return `<div class="client-card" onclick="openClientDetail('${c.id}')" style="${isPending ? 'border:2px dashed var(--gold)' : ''}">
      ${pendingBanner}
      <div class="client-card-head">
        <div class="client-avatar">${initials}</div>
        <div>
          <div class="client-name">${esc(c.name)}</div>
          <div class="client-meta">Kód: <b>${c.id}</b></div>
          <div class="client-meta" style="margin-top:2px">📅 Kliens: ${c.joinDate ? new Date(c.joinDate).toLocaleDateString('hu-HU',{year:'numeric',month:'short',day:'numeric'}) : 'ismeretlen'}</div>
        </div>
      </div>
      <div class="client-card-body">
        <div class="client-stat"><span>📧 Email</span><span>${c.email||'—'}</span></div>
        <div class="client-stat"><span>📱 Telefon</span><span>${c.phone||'—'}</span></div>
        <div class="client-stat"><span>📦 Összes rendelés</span><span class="bold">${totalQty} db</span></div>
        <div class="client-stat"><span>💰 Összes forgalom</span><span style="color:var(--gold-dark);font-weight:700">${totalRev} lej</span></div>
      </div>
      <div style="padding:10px 16px;display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" style="flex:1;justify-content:center" onclick="event.stopPropagation();openClientDetail('${c.id}')">Adatlap</button>
        <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();deleteClient('${c.id}')">✕</button>
      </div>
    </div>`;
  }).join('');
}

function openClientModal(){
  ['c-name','c-id','c-email','c-phone','c-note'].forEach(i=>document.getElementById(i).value='');
  document.getElementById('client-modal').classList.add('open');
}
async function saveClient(){
  const name=document.getElementById('c-name').value.trim();
  const rawId = document.getElementById('c-id').value.trim();
  const id = rawId.startsWith('KR-') ? rawId : rawId.toLowerCase().replace(/\s+/g,'');
  if(!name||!id){toast('Név és kód kötelező!');return;}
  // Check duplicate - both in memory and Supabase
  if(D.clients.find(c=>c.id===id || c.id.toLowerCase()===id.toLowerCase())){
    toast('Ez a kód már foglalt!');return;
  }
  const newClient = {
    id, name,
    email: document.getElementById('c-email').value,
    phone: document.getElementById('c-phone').value,
    note: document.getElementById('c-note').value,
    joinDate: new Date().toISOString().slice(0,10)
  };
  try {
    await sb.upsert('clients', {
      id, name,
      email: newClient.email,
      phone: newClient.phone,
      note: newClient.note,
      join_date: newClient.joinDate
    }, 'id');
    D.clients.push(newClient);
    save(); closeModal('client-modal'); renderClients();
    toast('✅ Kliens hozzáadva! Kód: '+id);
    auditLog('client_create', name, 'Kód: '+id);
  } catch(e) {
    toast('⚠️ Mentés sikertelen: '+e.message, true);
    console.error('saveClient error:', e);
  }
}
async function deleteClient(id){
  if(!confirm('Biztosan törlöd? Az összes rendelése is törlődik!')) return;
  D.clients=D.clients.filter(c=>c.id!==id);
  Object.keys(D.orders).forEach(k=>{if(k.startsWith(id+'-'))delete D.orders[k];});
  try {
    await sb.delete('orders',`client_id=eq.${id}`);
    await sb.delete('clients',`id=eq.${id}`);
  } catch(e){ console.warn('deleteClient Supabase error:',e); }
  auditLog('client_delete', id, 'Kliens törölve');
  save(); renderClients(); toast('Kliens törölve.');
}

// ===== CLIENT DETAIL =====
function openClientDetail(id){
  clientDetailId=id; clientDetailPeriod='monthly';
  const c=D.clients.find(c=>c.id===id);
  document.getElementById('client-detail-name').textContent=c.name;
  renderClientDetail();
  nav('client-detail');
}
function setClientPeriod(p){
  clientDetailPeriod=p;
  document.querySelectorAll('#client-detail-period-btns .btn').forEach(b=>b.className='btn btn-sm btn-ghost');
  event.target.className='btn btn-sm btn-primary';
  renderClientDetail();
}
function renderClientDetail(){
  const c=D.clients.find(c=>c.id===clientDetailId);
  const y=selYear,m=selMonth;
  const label={monthly:'Havi rendelések',weekly:'Heti rendelések',yearly:'Éves rendelések'};
  document.getElementById('client-detail-period-label').textContent=label[clientDetailPeriod];

  // Stats
  let totalQty=0,totalRev=0,monthQty=0,monthRev=0;
  Object.entries(D.orders).forEach(([key,o])=>{
    if(!key.startsWith(c.id+'-')) return;
    Object.entries(o).forEach(([pid,qty])=>{
      totalQty+=qty; const p=D.products.find(p=>p.id==pid); if(p)totalRev+=p.price*qty;
      const [,ky,km]=key.split('-');
      if(parseInt(ky)===y&&parseInt(km)===m){monthQty+=qty;if(p)monthRev+=p.price*qty;}
    });
  });
  // Tenure
  let tenureStr = 'ismeretlen';
  if(c.joinDate){
    const jd = new Date(c.joinDate);
    const now2 = new Date();
    const months = (now2.getFullYear()-jd.getFullYear())*12 + (now2.getMonth()-jd.getMonth());
    tenureStr = months < 1 ? 'Új kliens' : months < 12 ? months+' hónap' : Math.floor(months/12)+' év '+months%12+' hónap';
  }
  const joinStr = c.joinDate ? new Date(c.joinDate).toLocaleDateString('hu-HU',{year:'numeric',month:'long',day:'numeric'}) : '—';

  document.getElementById('client-detail-stats').innerHTML=[
    {val:totalQty+' db',label:'Összes rendelés',icon:'📦'},
    {val:totalRev+' lej',label:'Összes forgalom',icon:'💰',gold:true},
    {val:monthQty+' db · '+monthRev+' lej',label:`${MONTHS[m]} rendelés`,icon:'📅'},
    {val:tenureStr,label:'Kliens óta: '+joinStr,icon:'🗓'},
  ].map(s=>`<div class="stat-box"><div class="stat-val ${s.gold?'gold':''}" style="font-size:${s.val.length>8?'1.2rem':'2rem'}">${s.val}</div><div class="stat-label">${s.icon} ${s.label}</div></div>`).join('');

  // Client info box
  const infoEl = document.getElementById('client-info-box');
  if(infoEl){
    infoEl.innerHTML=`
      <div class="client-stat"><span>👤 Teljes név</span><span style="font-weight:600">${esc(c.name)}</span></div>
      <div class="client-stat"><span>🔑 Belépési kód</span><span style="display:flex;align-items:center;gap:8px"><b>${c.id}</b><button class="btn btn-ghost btn-xs" onclick="copyToClipboard('${c.id}')" title="Kód másolása">📋</button></span></div>
      <div class="client-stat"><span>📧 Email</span><span>${c.email||'—'}</span></div>
      <div class="client-stat"><span>📱 Telefon</span><span>${c.phone||'—'}</span></div>
      <div class="client-stat"><span>📅 Kliens óta</span><span>${joinStr}</span></div>
      <div class="client-stat"><span>⏱ Időtartam</span><span style="font-weight:600;color:var(--teal-dark)">${tenureStr}</span></div>
      ${c.note?`<div class="client-stat"><span>📝 Megjegyzés</span><span>${esc(c.note)}</span></div>`:''}
    `;
  }

  // Table
  let html='<table class="tbl"><thead><tr><th>Dátum</th><th>Nap</th><th>Termék</th><th class="num">Mennyiség</th><th class="num">Érték</th></tr></thead><tbody>';
  const days=getDays(y,m); let found=false;
  days.forEach(d=>{
    const key=ok(c.id,y,m,d.getDate()); const o=D.orders[key]; if(!o) return;
    found=true;
    Object.entries(o).forEach(([pid,qty])=>{
      const p=D.products.find(p=>p.id==pid);
      html+=`<tr><td>${d.getDate()}.</td><td>${DAYS_HU[d.getDay()]}</td><td>${p?p.name:'?'} <small class="text-soft">${p?.weight||''}</small></td><td class="num">${qty} db</td><td class="num gold-text">${p?p.price*qty:0} lej</td></tr>`;
    });
  });
  if(!found) html+=`<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-soft)">Nincs rendelés ebben az időszakban.</td></tr>`;
  html+='</tbody></table>';
  document.getElementById('client-detail-table').innerHTML=html;

  // Category breakdown for this client
  renderClientCategoryBreakdown(c, y, m);
}

function renderClientCategoryBreakdown(c, y, m){
  const catEl = document.getElementById('client-cat-breakdown');
  if(!catEl) return;

  // Collect all orders for this client this month
  const catData = {};
  D.categories.forEach(cat => catData[cat] = {qty:0, rev:0});

  getDays(y,m).forEach(d=>{
    const key=ok(c.id,y,m,d.getDate());
    if(!D.orders[key]) return;
    Object.entries(D.orders[key]).forEach(([pid,qty])=>{
      const p=D.products.find(p=>p.id==pid); if(!p) return;
      if(!catData[p.category]) catData[p.category]={qty:0,rev:0};
      catData[p.category].qty+=qty;
      catData[p.category].rev+=qty*p.price;
    });
  });

  const cats = Object.entries(catData).filter(([,v])=>v.qty>0).sort((a,b)=>b[1].rev-a[1].rev);
  if(cats.length===0){
    catEl.innerHTML='<p class="text-soft text-sm">Nincs kategória adat erre a hónapra.</p>';
    return;
  }
  const maxRev = Math.max(...cats.map(([,v])=>v.rev),1);
  const colors=['var(--teal)','var(--gold)','var(--teal-mid)','var(--sand)'];
  catEl.innerHTML = cats.map(([cat,v],i)=>`
    <div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;font-size:0.83rem;margin-bottom:4px">
        <span style="font-weight:600">${esc(cat)}</span>
        <span style="color:var(--gold-dark);font-weight:700">${v.qty} db &nbsp;·&nbsp; ${v.rev} lej</span>
      </div>
      <div style="background:var(--teal-pale);border-radius:6px;height:9px;overflow:hidden">
        <div style="background:${colors[i%colors.length]};height:100%;width:${v.rev/maxRev*100}%;border-radius:6px;transition:width 0.5s"></div>
      </div>
    </div>`).join('');
}

// ===== CLIENT TREND =====
function renderClientTrend(clientId) {
  const c = D.clients.find(c=>c.id===clientId);
  if(!c) return '';
  
  const months = [];
  for(let m=0; m<12; m++) {
    let rev = 0, orders = 0;
    D.products.forEach(p => {
      const days = [];
      const d = new Date(selYear, m, 1);
      while(d.getMonth()===m) { days.push(d.getDate()); d.setDate(d.getDate()+1); }
      days.forEach(day => {
        const key = `${c.id}-${selYear}-${m}-${day}`;
        const qty = D.orders[key]?.[p.id]||0;
        if(qty>0) { rev += qty*p.price; orders += qty; }
      });
    });
    months.push({m, rev, orders});
  }
  
  const maxRev = Math.max(...months.map(d=>d.rev), 1);
  return `<div class="card mt-16">
    <div class="card-head"><div class="card-title">📈 ${selYear}. évi trend</div></div>
    <div class="card-body">
      <div style="display:flex;align-items:flex-end;gap:4px;height:80px;margin-bottom:6px">
        ${months.map(({m,rev}) => {
          const h = Math.round((rev/maxRev)*75)+2;
          return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">
            <div style="width:100%;height:${h}px;background:${rev>0?'var(--teal)':'var(--border)'};border-radius:3px 3px 0 0;min-height:2px" title="${MONTHS[m]}: ${rev.toFixed(0)} lej"></div>
            <div style="font-size:0.5rem;color:var(--text-soft)">${MONTHS[m].slice(0,3)}</div>
          </div>`;
        }).join('')}
      </div>
    </div>
  </div>`;
}


async function approveClient(clientId) {
  try {
    const cl = D.clients.find(c => c.id === clientId);
    const realName = cl?.name?.replace(/^\[PENDING\]\s*/, '') || cl?.name || clientId;
    await sb.update('clients', { name: realName }, `id=eq.${clientId}`);
    if (cl) cl.name = realName;
    toast(`✅ ${realName} jóváhagyva!`);
    renderClients();
  } catch(e) { toast('⚠️ Hiba: ' + e.message, true); }
}
