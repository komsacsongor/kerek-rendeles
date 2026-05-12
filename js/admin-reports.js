// ===== REPORTS =====
function toggleAnnualSummary() {
  const el = document.getElementById('annual-summary');
  const btn = document.getElementById('annual-toggle-btn');
  if(el.style.display === 'none') {
    renderAnnualSummary();
    el.style.display = 'block';
    btn.classList.add('btn-primary');
    btn.classList.remove('btn-ghost');
  } else {
    el.style.display = 'none';
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-ghost');
  }
}

function renderAnnualSummary() {
  const year = selYear;
  let totalRevenue = 0, totalOrders = 0;
  const monthlyData = [];
  const clientTotals = {};

  MONTHS.forEach((mo, m) => {
    let monthRev = 0, monthOrders = 0;
    D.clients.forEach(c => {
      D.products.forEach(p => {
        getDaysForMonth(year, m).forEach(d => {
          const key = `${c.id}-${year}-${m}-${d}`;
          const qty = D.orders[key]?.[p.id] || 0;
          if(qty > 0) {
            const rev = qty * p.price;
            monthRev += rev;
            monthOrders += qty;
            totalRevenue += rev;
            totalOrders += qty;
            if(!clientTotals[c.id]) clientTotals[c.id] = {name:c.name, revenue:0, orders:0};
            clientTotals[c.id].revenue += rev;
            clientTotals[c.id].orders += qty;
          }
        });
      });
    });
    monthlyData.push({mo, m, monthRev, monthOrders});
  });

  // Helper to get days array
  function getDaysForMonth(y, m) {
    const days = [];
    const d = new Date(y, m, 1);
    while(d.getMonth() === m) { days.push(d.getDate()); d.setDate(d.getDate()+1); }
    return days;
  }

  // Max for chart scaling
  const maxRev = Math.max(...monthlyData.map(d => d.monthRev), 1);

  let html = `<div class="card">
    <div class="card-head"><div class="card-title">📊 ${year}. évi összesítő</div>
    <span class="badge badge-gold">${totalOrders} db · ${totalRevenue.toFixed(0)} lej</span></div>
    <div class="card-body">
      <!-- Monthly chart bars -->
      <div style="display:flex;align-items:flex-end;gap:6px;height:100px;margin-bottom:8px;padding:0 4px">
        ${monthlyData.map(({mo,monthRev}) => {
          const h = Math.round((monthRev/maxRev)*90)+2;
          return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">
            <div style="width:100%;height:${h}px;background:var(--teal);border-radius:4px 4px 0 0;min-height:2px" title="${mo}: ${monthRev.toFixed(0)} lej"></div>
            <div style="font-size:0.55rem;color:var(--text-soft)">${mo.slice(0,3)}</div>
          </div>`;
        }).join('')}
      </div>
      <div class="sep"></div>
      <div class="grid-4" style="margin-top:12px">
        <div class="stat-box"><div class="stat-val">${totalOrders}</div><div class="stat-label">Összes rendelés</div></div>
        <div class="stat-box"><div class="stat-val sm gold">${totalRevenue.toFixed(0)} lej</div><div class="stat-label">Éves forgalom</div></div>
        <div class="stat-box"><div class="stat-val sm">${(totalRevenue/12).toFixed(0)} lej</div><div class="stat-label">Havi átlag</div></div>
        <div class="stat-box"><div class="stat-val sm">${D.clients.length}</div><div class="stat-label">Aktív vevő</div></div>
      </div>
      <div class="sep"></div>
      <div style="font-weight:600;font-size:0.85rem;color:var(--teal-dark);margin-bottom:10px">Vevőnkénti bontás</div>
      <table class="tbl">
        <thead><tr><th>Vevő</th><th class="num">Rendelés (db)</th><th class="num">Forgalom (lej)</th><th class="num">Arány</th></tr></thead>
        <tbody>
          ${Object.values(clientTotals).sort((a,b)=>b.revenue-a.revenue).map(c => `
            <tr>
              <td><b>${esc(c.name)}</b></td>
              <td class="num">${c.orders}</td>
              <td class="num gold">${c.revenue.toFixed(0)}</td>
              <td class="num">${totalRevenue>0?((c.revenue/totalRevenue)*100).toFixed(1):0}%</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;

  document.getElementById('annual-summary').innerHTML = html;
}

function renderReports(){
  const sel=document.getElementById('reports-month-sel');
  sel.innerHTML=MONTHS.map((mo,i)=>`<button class="month-btn ${i===selMonth?'active':''}" onclick="selectMonth(${i})">${mo}</button>`).join('');
  const y=selYear,m=selMonth;
  const mo=getMonthOrders(y,m);
  const rev=getRevenue(mo,y,m);
  const qty=getTotalQty(mo);
  const bdays=getBakingDays(y,m);

  document.getElementById('report-stats').innerHTML=[
    {val:qty+' db',label:'Összes rendelés',icon:'📦'},
    {val:rev+' lej',label:'Becsült forgalom',icon:'💰',gold:true},
    {val:bdays.length+' nap',label:'Sütési napok',icon:'🔥'},
  ].map(s=>`<div class="stat-box"><div class="stat-val ${s.gold?'gold':''}">${s.val}</div><div class="stat-label">${s.icon} ${s.label}</div></div>`).join('');

  // Top products
  const prodTotals={}; Object.values(mo).forEach(day=>Object.entries(day).forEach(([pid,q])=>prodTotals[pid]=(prodTotals[pid]||0)+q));
  const sorted=Object.entries(prodTotals).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const maxP=sorted[0]?.[1]||1;
  document.getElementById('top-products').innerHTML=sorted.map(([pid,q])=>{
    const p=D.products.find(p=>p.id==pid); if(!p) return '';
    return `<div class="prog-row"><div class="prog-label"><span>${esc(p.name)} <small class="text-soft">${esc(p.weight)}</small></span><span>${q} db · ${q*p.price} lej</span></div><div class="prog-bar-bg"><div class="prog-bar" style="width:${q/maxP*100}%;background:var(--teal)"></div></div></div>`;
  }).join('')||'<p class="text-soft text-sm">Nincs adat.</p>';

  // Top clients
  const clientTotals=D.clients.map(c=>{
    let tot=0,rev=0;
    getDays(y,m).forEach(d=>{
      const key=ok(c.id,y,m,d.getDate()); if(!D.orders[key]) return;
      Object.entries(D.orders[key]).forEach(([pid,qty])=>{tot+=qty;const p=D.products.find(p=>p.id==pid);if(p)rev+=p.price*qty;});
    });
    return{...c,tot,rev};
  }).sort((a,b)=>b.tot-a.tot);
  const maxC=clientTotals[0]?.tot||1;
  document.getElementById('top-clients').innerHTML=clientTotals.map(c=>`
    <div class="prog-row"><div class="prog-label"><span>${esc(c.name)}</span><span>${c.tot} db · ${c.rev} lej</span></div>
    <div class="prog-bar-bg"><div class="prog-bar" style="width:${c.tot/maxC*100}%;background:var(--gold)"></div></div></div>`).join('');

  // Baking day revenue
  let bdhtml='<table class="tbl"><thead><tr><th>Dátum</th><th>Nap</th><th>Rendelés (db)</th><th class="num">Forgalom</th></tr></thead><tbody>';
  bdays.forEach(d=>{
    const day=d.getDate(); const dayO=mo[day]||{};
    const q=Object.values(dayO).reduce((a,b)=>a+b,0);
    const r=Object.entries(dayO).reduce((acc,[pid,qty])=>{const p=D.products.find(p=>p.id==pid);return acc+(p?p.price*qty:0);},0);
    bdhtml+=`<tr><td>${MONTHS[m]} ${day}.</td><td><span class="badge ${d.getDay()===2?'badge-gold':'badge-teal'}">${DAYS_HU[d.getDay()]}</span></td><td class="num">${q||'—'}</td><td class="num gold-text">${r>0?r+' lej':'—'}</td></tr>`;
  });
  bdhtml+='</tbody></table>';
  document.getElementById('baking-day-revenue').innerHTML=bdhtml;
  renderFamilyReport();
}

// ===== CATEGORIES =====
function renderCategories(){
  const sel=document.getElementById('cat-month-sel');
  sel.innerHTML=MONTHS.map((mo,i)=>`<button class="month-btn ${i===selMonth?'active':''}" onclick="selectMonth(${i})">${mo}</button>`).join('');
  const y=selYear,m=selMonth;
  const mo=getMonthOrders(y,m);

  const cats={}; D.categories.forEach(c=>cats[c]={qty:0,rev:0});
  Object.values(mo).forEach(day=>{
    Object.entries(day).forEach(([pid,qty])=>{
      const p=D.products.find(p=>p.id==pid); if(!p) return;
      if(!cats[p.category]) cats[p.category]={qty:0,rev:0};
      cats[p.category].qty+=qty; cats[p.category].rev+=qty*p.price;
    });
  });
  const catArr=Object.entries(cats).filter(([,v])=>v.qty>0).sort((a,b)=>b[1].rev-a[1].rev);
  const totalRev=catArr.reduce((a,[,v])=>a+v.rev,0)||1;
  const totalQty=catArr.reduce((a,[,v])=>a+v.qty,0)||1;

  document.getElementById('cat-stats').innerHTML=catArr.slice(0,8).map(([cat,v])=>`
    <div class="stat-box"><div class="stat-val">${v.qty} db</div><div class="stat-label">🏷 ${esc(cat)}</div><div style="font-size:0.75rem;color:var(--gold-dark);margin-top:4px">${v.rev} lej</div></div>`).join('');

  // Bar chart
  const maxRev=Math.max(...catArr.map(([,v])=>v.rev),1);
  const colors=['var(--teal)','var(--gold)','var(--teal-mid)','var(--sand)','var(--slate)'];
  document.getElementById('cat-chart').innerHTML=`
    <div class="bar-chart-wrap" style="height:120px">${catArr.map(([cat,v],i)=>`
      <div class="bar-col"><div class="bar-v">${v.rev} lej</div>
      <div class="bar" style="height:${v.rev/maxRev*110}px;background:${colors[i%colors.length]}"></div>
      <div class="bar-lbl">${cat.split('/')[0].trim()}</div></div>`).join('')}
    </div>`;

  // Table
  let html='<table class="tbl"><thead><tr><th>Kategória</th><th class="num">db</th><th class="num">Forgalom</th><th class="num">% (db)</th><th class="num">% (érték)</th></tr></thead><tbody>';
  catArr.forEach(([cat,v])=>{
    html+=`<tr><td><b>${esc(cat)}</b></td><td class="num highlight">${v.qty}</td><td class="num gold-text">${v.rev} lej</td>
      <td class="num">${(v.qty/totalQty*100).toFixed(1)}%</td><td class="num">${(v.rev/totalRev*100).toFixed(1)}%</td></tr>`;
  });
  html+='</tbody></table>';
  document.getElementById('cat-table').innerHTML=html;

  // Client × Category
  let chtml='<table class="tbl"><thead><tr><th>Vevő</th>'+catArr.map(([cat])=>`<th>${cat.split('/')[0]}</th>`).join('')+'<th class="num">Összesen</th></tr></thead><tbody>';
  D.clients.forEach(c=>{
    let rowTotal=0;
    const catVals=catArr.map(([cat])=>{
      let q=0;
      getDays(y,m).forEach(d=>{
        const key=ok(c.id,y,m,d.getDate()); if(!D.orders[key]) return;
        Object.entries(D.orders[key]).forEach(([pid,qty])=>{ const p=D.products.find(p=>p.id==pid); if(p&&p.category===cat){q+=qty;rowTotal+=qty;} });
      });
      return q;
    });
    chtml+=`<tr><td><b>${esc(c.name)}</b></td>${catVals.map(q=>`<td class="num">${q||'—'}</td>`).join('')}<td class="num highlight">${rowTotal||'—'}</td></tr>`;
  });
  chtml+='</tbody></table>';
  document.getElementById('cat-client-table').innerHTML=chtml;
}


// ===== AUDIT LOG NÉZET =====
async function renderAuditLog() {
  const el = document.getElementById('view-audit-log');
  if(!el) return;
  el.innerHTML = '<div style="padding:20px;color:var(--teal)">⏳ Napló betöltése...</div>';
  try {
    const logs = await sb.query('audit_log', {order:'created_at.desc', limit:200});
    const actionLabels = {
      login:'🔑 Belépés', login_failed:'⚠️ Hibás belépés',
      product_create:'📦 Termék létrehozva', product_update:'✏️ Termék módosítva', product_delete:'🗑 Termék törölve',
      recipe_create:'🍞 Recept létrehozva', recipe_update:'✏️ Recept módosítva',
      recipe_delete:'🗑 Recept törölve', recipe_archive:'🗃 Recept archiválva', recipe_restore:'↩ Recept visszaállítva',
      order_save:'📋 Rendelés mentve',
    };
    el.innerHTML = `
      <div class="view-header"><h2 class="view-title">📋 Napló</h2></div>
      <div class="card">
        <table style="width:100%;border-collapse:collapse;font-size:0.82rem">
          <thead><tr style="border-bottom:2px solid var(--border)">
            <th style="padding:10px;text-align:left;color:var(--text-soft);font-weight:600">Időpont</th>
            <th style="padding:10px;text-align:left;color:var(--text-soft);font-weight:600">Művelet</th>
            <th style="padding:10px;text-align:left;color:var(--text-soft);font-weight:600">Elem</th>
            <th style="padding:10px;text-align:left;color:var(--text-soft);font-weight:600">Részletek</th>
          </tr></thead>
          <tbody>
            ${logs.map(l=>{
              const dt = new Date(l.created_at);
              const dateStr = dt.toLocaleDateString('hu-HU') + ' ' + dt.toLocaleTimeString('hu-HU',{hour:'2-digit',minute:'2-digit'});
              const label = actionLabels[l.action] || l.action;
              const isDelete = l.action.includes('delete') || l.action.includes('failed');
              return `<tr style="border-bottom:1px solid var(--border);${isDelete?'background:#fff5f5':''}">
                <td style="padding:8px 10px;color:var(--text-soft);white-space:nowrap">${dateStr}</td>
                <td style="padding:8px 10px;font-weight:500">${label}</td>
                <td style="padding:8px 10px">${esc(l.entity_name||'')}</td>
                <td style="padding:8px 10px;color:var(--text-soft)">${esc(l.details||'')}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        ${logs.length===0?'<p class="text-soft text-sm" style="padding:20px">Még nincs naplóbejegyzés.</p>':''}
      </div>`;
  } catch(e) {
    el.innerHTML = `<div class="card"><p class="text-soft">Napló betöltési hiba: ${e.message}</p></div>`;
  }
}

// ===== TERMÉKCSALÁDOK KIMUTATÁS =====
function renderFamilyReport() {
  const card = document.getElementById('family-report-card');
  const body = document.getElementById('family-report-body');
  const periodEl = document.getElementById('family-report-period');
  if (!card || !body) return;

  // Van-e egyáltalán termékcsalád?
  const hasFamily = D.products.some(p => p.familyId);
  if (!hasFamily) { card.style.display = 'none'; return; }
  card.style.display = 'block';

  const y = selYear, m = selMonth;
  const mo = getMonthOrders(y, m);
  if (periodEl) periodEl.textContent = `${MONTHS[m]} ${y}`;

  // Előző hónap adatai összehasonlításhoz
  const prevM = m === 0 ? 11 : m - 1;
  const prevY = m === 0 ? y - 1 : y;
  const prevMo = getMonthOrders(prevY, prevM);

  // Termékek rendelési összesítése az aktuális hónapra
  const prodTotals = {}; // pid → {qty, rev}
  const prevTotals = {};
  const aggregate = (orders, target) => {
    Object.values(orders).forEach(day => Object.entries(day).forEach(([pid, q]) => {
      const p = D.products.find(p => p.id == pid);
      if (!p) return;
      target[pid] = target[pid] || {qty:0, rev:0};
      target[pid].qty += q;
      target[pid].rev += q * (p.price||0);
    }));
  };
  aggregate(mo, prodTotals);
  aggregate(prevMo, prevTotals);

  // Familia-k összegyűjtése
  const familyMap = {}; // parentId → {parent, members:[]}
  D.products.forEach(p => {
    if (!p.familyId) return;
    if (!familyMap[p.familyId]) {
      const parent = D.products.find(x => x.id === p.familyId);
      if (!parent) return;
      familyMap[p.familyId] = {parent, members:[]};
    }
    familyMap[p.familyId].members.push(p);
  });

  if (Object.keys(familyMap).length === 0) { card.style.display = 'none'; return; }

  let html = '';
  Object.values(familyMap).forEach(({parent, members}) => {
    const allMembers = [parent, ...members];

    // Havi összesítők
    let totalQty = 0, totalRev = 0, prevQty = 0;
    allMembers.forEach(p => {
      const t = prodTotals[p.id] || {qty:0,rev:0};
      const pt = prevTotals[p.id] || {qty:0,rev:0};
      totalQty += t.qty; totalRev += t.rev; prevQty += pt.qty;
    });
    const trend = prevQty === 0 ? null : Math.round((totalQty - prevQty) / prevQty * 100);
    const trendHtml = trend === null ? '' :
      `<span style="font-size:.75rem;padding:2px 7px;border-radius:10px;background:${trend>=0?'#dcfce7':'#fee2e2'};color:${trend>=0?'#16a34a':'#dc2626'};font-weight:700">${trend>=0?'▲':'▼'} ${Math.abs(trend)}%</span>`;

    html += `<div style="margin-bottom:20px;border:1px solid var(--border);border-radius:12px;overflow:hidden">
      <div style="background:var(--teal-dark);padding:12px 16px;display:flex;align-items:center;gap:12px">
        <span style="font-family:'Fraunces',serif;color:white;font-size:1rem">📦 ${parent.name}</span>
        <span style="flex:1"></span>
        ${trendHtml}
        <span style="color:rgba(255,255,255,.8);font-size:.85rem;font-weight:700">${totalQty} db</span>
        <span style="color:var(--gold);font-size:.85rem;font-weight:700">${totalRev} lej</span>
      </div>
      <div style="padding:0 16px 4px">
        <table style="width:100%;font-size:.83rem;border-collapse:collapse">
          <tr style="color:var(--text-soft);font-size:.75rem;border-bottom:1px solid var(--border)">
            <th style="text-align:left;padding:8px 0;font-weight:600">Termék</th>
            <th style="text-align:right;padding:8px 0;font-weight:600">Kód</th>
            <th style="text-align:right;padding:8px 0;font-weight:600">Db</th>
            <th style="text-align:right;padding:8px 0;font-weight:600">Forgalom</th>
            <th style="text-align:right;padding:8px 0;font-weight:600">Részarány</th>
          </tr>
          ${allMembers.map(p => {
            const t = prodTotals[p.id] || {qty:0,rev:0};
            const share = totalQty > 0 ? Math.round(t.qty / totalQty * 100) : 0;
            const isParent = p.id === parent.id;
            return `<tr style="border-bottom:1px solid var(--border)${isParent?';font-weight:700':''}">
              <td style="padding:7px 0">${isParent?'👑 ':''}<span style="color:var(--teal-dark)">${p.name}</span> <small style="color:var(--text-soft)">${p.weight||''}</small></td>
              <td style="text-align:right;font-family:monospace;font-size:.72rem;color:var(--text-soft)">${p.code||'–'}</td>
              <td style="text-align:right;font-weight:700">${t.qty || '–'}</td>
              <td style="text-align:right;color:var(--teal-dark);font-weight:${isParent?'700':'400'}">${t.rev > 0 ? t.rev+' lej' : '–'}</td>
              <td style="text-align:right">
                ${t.qty > 0 ? `<div style="display:flex;align-items:center;gap:6px;justify-content:flex-end">
                  <div style="width:50px;height:6px;background:var(--bg-soft);border-radius:3px">
                    <div style="width:${share}%;height:100%;background:var(--gold);border-radius:3px"></div>
                  </div>
                  <span style="font-size:.75rem">${share}%</span>
                </div>` : '–'}
              </td>
            </tr>`;
          }).join('')}
          <tr style="background:var(--bg-soft)">
            <td colspan="2" style="padding:8px 0;font-weight:700;color:var(--teal-dark)">Összesen</td>
            <td style="text-align:right;font-weight:700;padding:8px 0">${totalQty} db</td>
            <td style="text-align:right;font-weight:700;color:var(--gold);padding:8px 0">${totalRev} lej</td>
            <td style="text-align:right;padding:8px 0">100%</td>
          </tr>
        </table>
      </div>
    </div>`;
  });

  body.innerHTML = html || '<p class="text-soft text-sm" style="padding:16px">Nincs rendelési adat ebben a hónapban.</p>';
}
