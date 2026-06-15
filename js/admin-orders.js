// ===== ORDERS =====
function renderOrders(){
  const sel=document.getElementById('orders-month-sel');
  sel.innerHTML=MONTHS.map((mo,i)=>`<button class="month-btn ${i===selMonth?'active':''}" onclick="selectMonth(${i})">${mo}</button>`).join('');
  const y=selYear,m=selMonth;
  const mo=getMonthOrders(y,m);
  const bdays=getBakingDays(y,m);
  const activeP=getActiveProds(y,m);

  // Matrix
  let html='<table class="tbl"><thead><tr><th>Termék</th>';
  bdays.forEach(d=>html+=`<th>${MONTHS[m].slice(0,3)} ${d.getDate()}.<br><small>${DAYS_HU[d.getDay()].slice(0,3)}</small></th>`);
  html+='<th>Összesen</th><th>Érték</th></tr></thead><tbody>';
  activeP.forEach(p=>{
    const qties=bdays.map(d=>(mo[d.getDate()]||{})[p.id]||0);
    const tot=qties.reduce((a,b)=>a+b,0); if(!tot) return;
    html+=`<tr><td><b>${esc(p.name)}</b><br><small class="text-soft">${esc(p.weight)}</small></td>`;
    qties.forEach(q=>html+=`<td class="num">${q||'—'}</td>`);
    html+=`<td class="num highlight">${tot}</td><td class="num gold-text">${tot*p.price} lej</td></tr>`;
  });
  html+='</tbody></table>';
  document.getElementById('orders-matrix').innerHTML=html;

  // Client breakdown
  let chtml='<table class="tbl"><thead><tr><th>Vevő</th><th>Rendelési napok</th><th>Összesen (db)</th><th>Becsült érték</th><th></th></tr></thead><tbody>';
  D.clients.forEach(c=>{
    let tot=0,rev=0,days=0;
    getDays(y,m).forEach(d=>{
      const key=ok(c.id,y,m,d.getDate());
      if(D.orders[key]){days++;Object.entries(D.orders[key]).forEach(([pid,qty])=>{tot+=qty;const p=D.products.find(p=>p.id==pid);if(p)rev+=p.price*qty;});}
    });
    chtml+=`<tr><td><b>${esc(c.name)}</b><br><small class="text-soft">${esc(c.email)}</small></td>
      <td><span class="badge badge-teal">${days} nap</span></td>
      <td class="num highlight">${tot} db</td>
      <td class="num gold-text">${rev} lej</td>
      <td><button class="btn btn-ghost btn-sm" onclick="openClientDetail('${c.id}')">Adatlap</button></td></tr>`;
  });
  chtml+='</tbody></table>';
  document.getElementById('orders-clients').innerHTML=chtml;
}

// ===== EXPORT =====
function initExportView(){
  const months = MONTHS.map((mo,i)=>`<button class="month-btn ${i===selMonth?'active':''}" onclick="selectExportMonth(this,${i})">${mo}</button>`).join('');
  ['export-baking-month-sel','export-orders-month-sel','export-report-month-sel'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.innerHTML=months;
  });
}
function selectExportMonth(btn, m){
  btn.closest('.month-row').querySelectorAll('.month-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  btn.closest('.month-row')._selMonth = m;
}
function getExportMonth(selId){
  const el=document.getElementById(selId);
  return el?._selMonth ?? selMonth;
}

function downloadCSV(filename, rows){
  const BOM = '\uFEFF'; // UTF-8 BOM for Excel
  const SEP = ';'; // Semicolon for Romanian/Hungarian Excel locale
  const csv = BOM + rows.map(r=>r.map(cell=>{
    const s = String(cell==null?'':cell);
    return s.includes(SEP) || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g,'""')}"` : s;
  }).join(SEP)).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url);
  toast('✅ Letöltés elindítva: '+filename);
}

function exportClients(){
  const rows = [['Név','Belépési kód','Email','Telefon','Kliens óta','Összes rendelés (db)','Összes forgalom (lej)','Megjegyzés']];
  D.clients.forEach(c=>{
    let totalQty=0, totalRev=0;
    Object.entries(D.orders).forEach(([key,o])=>{
      if(!key.startsWith(c.id+'-')) return;
      Object.entries(o).forEach(([pid,qty])=>{totalQty+=qty;const p=D.products.find(p=>p.id==pid);if(p)totalRev+=p.price*qty;});
    });
    rows.push([c.name, c.id, c.email||'', c.phone||'', c.joinDate||'', totalQty, totalRev, c.note||'']);
  });
  downloadCSV('kerek_vevok_'+localToday()+'.csv', rows);
}

function exportBakingList(){
  const m = getExportMonth('export-baking-month-sel');
  const y = selYear;
  const bdays = getBakingDays(y,m);
  const activeP = getActiveProds(y,m);

  // Header: Dátum | Nap | Termék | Méret | Ár | [Kliens1] | [Kliens2] | ... | ÖSSZESEN | Érték
  const header = ['Dátum','Nap','Termék','Méret','Egységár (lej)',
    ...D.clients.map(c=>c.name),
    'ÖSSZESEN (db)','Érték (lej)'];
  const rows = [header];

  bdays.forEach(d=>{
    const day=d.getDate();
    const dayName=DAYS_HU[d.getDay()];
    const dateStr=`${y}.${String(m+1).padStart(2,'0')}.${String(day).padStart(2,'0')}`;

    // Per-client quantities
    const clientQtys = {}; // pid -> {clientId: qty}
    D.clients.forEach(c=>{
      const key=ok(c.id,y,m,day);
      if(!D.orders[key]) return;
      Object.entries(D.orders[key]).forEach(([pid,qty])=>{
        if(!clientQtys[pid]) clientQtys[pid]={};
        clientQtys[pid][c.id]=qty;
      });
    });

    let dayHasData = false;
    activeP.forEach(p=>{
      const perClient = D.clients.map(c=>(clientQtys[p.id]||{})[c.id]||0);
      const total = perClient.reduce((a,b)=>a+b,0);
      if(total===0) return;
      dayHasData = true;
      rows.push([
        dateStr, dayName, p.name, p.weight, p.price,
        ...perClient,
        total, total*p.price
      ]);
    });

    if(!dayHasData){
      rows.push([dateStr, dayName, '(nincs rendelés)', '', '', ...D.clients.map(()=>''), 0, 0]);
    }

    // Day total row
    const totPerClient = D.clients.map(c=>{
      let t=0;
      activeP.forEach(p=>t+=((clientQtys[p.id]||{})[c.id]||0));
      return t;
    });
    const grandTotal = totPerClient.reduce((a,b)=>a+b,0);
    const grandRev = activeP.reduce((acc,p)=>{
      const t=D.clients.reduce((a,c)=>a+((clientQtys[p.id]||{})[c.id]||0),0);
      return acc+t*p.price;
    },0);
    if(grandTotal>0){
      rows.push(['','','--- NAPI ÖSSZESEN ---','','',
        ...totPerClient, grandTotal, grandRev]);
    }
  });
  downloadCSV(`kerek_sutesi_lista_${MONTHS[m]}_${y}.csv`, rows);
}


function exportOrders(){
  const m = getExportMonth('export-orders-month-sel');
  const y = selYear;
  const bdays = getBakingDays(y,m);
  const activeP = getActiveProds(y,m);

  // Header: Termék | Méret | Kategória | Ár | [date1] | [date2] | ... | Összesen | Érték
  const dateHeaders = bdays.map(d=>`${String(m+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${DAYS_HU[d.getDay()].slice(0,3)}`);
  const header = ['Termék','Méret','Kategória','Egységár (lej)', ...dateHeaders, 'Összesen (db)','Érték (lej)'];
  const rows = [header];

  activeP.forEach(p=>{
    const qties = bdays.map(d=>{
      return D.clients.reduce((acc,c)=>{
        const key=ok(c.id,y,m,d.getDate());
        return acc+((D.orders[key]||{})[p.id]||0);
      },0);
    });
    const total = qties.reduce((a,b)=>a+b,0);
    if(total>0) rows.push([p.name, p.weight, p.category, p.price, ...qties, total, total*p.price]);
  });

  // Totals row
  const totals = bdays.map(d=>{
    return activeP.reduce((acc,p)=>{
      return acc+D.clients.reduce((a,c)=>{
        const key=ok(c.id,y,m,d.getDate());
        return a+((D.orders[key]||{})[p.id]||0);
      },0);
    },0);
  });
  const grandQty = totals.reduce((a,b)=>a+b,0);
  const grandRev = activeP.reduce((acc,p)=>{
    const t=bdays.reduce((a,d)=>a+D.clients.reduce((b,c)=>{
      const key=ok(c.id,y,m,d.getDate());
      return b+((D.orders[key]||{})[p.id]||0);
    },0),0);
    return acc+t*p.price;
  },0);
  rows.push(['ÖSSZESEN','','','', ...totals, grandQty, grandRev]);

  downloadCSV(`kerek_rendeles_${MONTHS[m]}_${y}.csv`, rows);
}


function exportOrdersDetailed(){
  const m = getExportMonth('export-orders-month-sel');
  const y = selYear;
  const rows = [['Vevő','Dátum','Nap','Termék','Méret','Kategória','Mennyiség','Egységár','Érték']];
  D.clients.forEach(c=>{
    getDays(y,m).forEach(d=>{
      const key=ok(c.id,y,m,d.getDate());
      if(!D.orders[key]) return;
      const dateStr=`${y}.${String(m+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
      Object.entries(D.orders[key]).forEach(([pid,qty])=>{
        const p=D.products.find(p=>p.id==pid);
        if(p) rows.push([c.name,dateStr,DAYS_HU[d.getDay()],p.name,p.weight,p.category,qty,p.price,qty*p.price]);
      });
    });
  });
  downloadCSV(`kerek_rendeles_reszletes_${MONTHS[m]}_${y}.csv`, rows);
}

function exportReport(){
  const m = getExportMonth('export-report-month-sel');
  const y = selYear;
  const mo = getMonthOrders(y,m);
  const rows = [['KEREK – Havi kimutatás: '+MONTHS[m]+' '+y,'','','']];
  rows.push(['','','','']);
  rows.push(['ÖSSZESÍTŐ','','','']);
  rows.push(['Összes rendelés (db)', getTotalQty(mo), '', '']);
  rows.push(['Becsült forgalom (lej)', getRevenue(mo,y,m), '', '']);
  rows.push(['Sütési napok száma', getBakingDays(y,m).length, '', '']);
  rows.push(['','','','']);
  rows.push(['TERMÉKEK','db','Egységár','Érték (lej)']);
  const prodTotals={};
  Object.values(mo).forEach(day=>Object.entries(day).forEach(([pid,q])=>prodTotals[pid]=(prodTotals[pid]||0)+q));
  Object.entries(prodTotals).sort((a,b)=>b[1]-a[1]).forEach(([pid,q])=>{
    const p=D.products.find(p=>p.id==pid);
    if(p) rows.push([p.name+' '+p.weight, q, p.price, q*p.price]);
  });
  rows.push(['','','','']);
  rows.push(['KATEGÓRIÁK','db','','Érték (lej)']);
  const catData={};
  Object.values(mo).forEach(day=>Object.entries(day).forEach(([pid,q])=>{
    const p=D.products.find(p=>p.id==pid); if(!p) return;
    if(!catData[p.category]) catData[p.category]={qty:0,rev:0};
    catData[p.category].qty+=q; catData[p.category].rev+=q*p.price;
  }));
  Object.entries(catData).sort((a,b)=>b[1].rev-a[1].rev).forEach(([cat,v])=>rows.push([cat,v.qty,'',v.rev]));
  rows.push(['','','','']);
  rows.push(['VEVŐK','db','','Érték (lej)']);
  D.clients.forEach(c=>{
    let tot=0,rev=0;
    getDays(y,m).forEach(d=>{
      const key=ok(c.id,y,m,d.getDate()); if(!D.orders[key]) return;
      Object.entries(D.orders[key]).forEach(([pid,qty])=>{tot+=qty;const p=D.products.find(p=>p.id==pid);if(p)rev+=p.price*qty;});
    });
    if(tot>0) rows.push([c.name,tot,'',rev]);
  });
  downloadCSV(`kerek_kimutatas_${MONTHS[m]}_${y}.csv`, rows);
}

function exportAll(){
  // Érzékeny adatok kizárása az exportból
  const safeD = JSON.parse(JSON.stringify(D));
  if(safeD.settings) delete safeD.settings.adminPw;
  // Kliens személyes adatok részleges elfedése
  if(safeD.clients) safeD.clients = safeD.clients.map(c=>({
    ...c, email: c.email ? '***' : '', phone: c.phone ? '***' : ''
  }));
  const data = JSON.stringify(safeD, null, 2);
  const blob = new Blob([data], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download='kerek_backup_'+localToday()+'.json'; a.click();
  URL.revokeObjectURL(url);
  toast('✅ Biztonsági mentés letöltve! (jelszó és személyes adatok nélkül)');
}

