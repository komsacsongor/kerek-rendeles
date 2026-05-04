// ===== BAKING =====
function renderBaking(){
  const sel=document.getElementById('baking-month-sel');
  sel.innerHTML=MONTHS.map((mo,i)=>`<button class="month-btn ${i===selMonth?'active':''}" onclick="selectMonth(${i})">${mo}</button>`).join('');
  const y=selYear,m=selMonth;
  const bdays=getBakingDays(y,m);
  const activeP=getActiveProds(y,m);
  let html='';

  bdays.forEach(d=>{
    const day=d.getDate(); const dayName=DAYS_HU[d.getDay()];
    let totalQty=0, totalRev=0;
    // Aggregated across all clients
    const aggr={};
    D.clients.forEach(c=>{
      const key=ok(c.id,y,m,day); const o=D.orders[key];
      if(!o) return;
      Object.entries(o).forEach(([pid,qty])=>{ aggr[pid]=(aggr[pid]||0)+qty; totalQty+=qty; const p=D.products.find(p=>p.id==pid); if(p)totalRev+=p.price*qty; });
    });

    html+=`<div class="baking-day-card">
      <div class="baking-day-head" onclick="toggleBakingDay(this)">
        <h4>🔥 ${dayName}, ${MONTHS[m]} ${day}.</h4>
        <div style="display:flex;align-items:center;gap:12px">
          <span class="badge badge-teal">${totalQty} db</span>
          <span class="badge badge-gold">${totalRev} lej</span>
          <span style="color:white;font-size:0.8rem">▾</span>
        </div>
      </div>
      <div class="baking-day-body">`;

    // Product lines with client breakdown
    activeP.forEach(p=>{
      const totalForP=aggr[p.id]||0;
      if(!totalForP) return;
      html+=`<div class="baking-line"><span style="font-weight:600">${esc(p.name)} <span class="text-xs text-soft">${esc(p.weight)}</span></span><span class="baking-qty">${totalForP} db</span></div>`;
      // Per client
      D.clients.forEach(c=>{
        const key=ok(c.id,y,m,day); const qty=(D.orders[key]||{})[p.id]||0;
        if(!qty) return;
        html+=`<div class="baking-line client-sub"><span>↳ ${esc(c.name)}</span><span>${qty} db</span></div>`;
      });
    });

    if(totalQty===0) html+=`<div class="baking-line text-soft">Nincs rendelés erre a napra.</div>`;
    else html+=`<div class="baking-line" style="background:var(--teal-pale);font-weight:700"><span>ÖSSZESEN</span><span style="color:var(--teal-dark)">${totalQty} db · ${totalRev} lej</span></div>`;

    html+=`</div></div>`;
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

