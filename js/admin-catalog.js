// ===== CATALOG =====
function setCatalogFilter(cat) {
  window._catalogFilter = cat;
  renderCatalog();
}

async function refreshCatalog() {
  const btn = document.querySelector('[onclick="refreshCatalog()"]');
  if(btn) { btn.textContent = '⏳'; btn.disabled = true; }
  try {
    await loadAllData();
    renderCatalog();
    toast('✅ Katalógus frissítve!');
  } catch(e) { toast('⚠️ Frissítés sikertelen: '+e.message, true); }
  if(btn) { btn.textContent = '🔄 Frissítés'; btn.disabled = false; }
}

function renderCatalog(){
  const y=selYear, m=catalogMonth;
  // Hónap selector feltöltése
  const catMonSel = document.getElementById('catalog-month-sel');
  if(catMonSel) catMonSel.innerHTML = MONTHS.map((mo,i)=>
    `<button class="month-btn ${i===catalogMonth?'active':''}" onclick="selectCatalogMonth(${i})">${mo}</button>`
  ).join('');
  // Category filter
  const allCats = [...new Set(D.products.map(p=>p.category||'Egyéb'))].sort();
  const activeCat = window._catalogFilter || 'all';
  
  // Filter bar
  const filterHtml = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;align-items:center">
    <span style="font-size:0.78rem;color:var(--text-soft);font-weight:600">Szűrés:</span>
    <button class="btn ${activeCat==='all'?'btn-primary':'btn-ghost'} btn-sm" onclick="setCatalogFilter('all')">Összes</button>
    ${allCats.map(cat=>`<button class="btn ${activeCat===cat?'btn-primary':'btn-ghost'} btn-sm" onclick="setCatalogFilter('${esc(cat)}')">${esc(cat)}</button>`).join('')}
  </div>`;
  
  const nonDeleted = D.products.filter(p => !p.deleted_at);
  const filtered = activeCat==='all' ? nonDeleted : nonDeleted.filter(p=>(p.category||'Egyéb')===activeCat);
  const active = D.monthlyActiveProducts[`${y}-${m}`] || [];

  const productCard = (p, isActive) => {
    const img = p.image
      ? `<img src="${p.image}" style="width:38px;height:38px;object-fit:cover;border-radius:6px;flex-shrink:0">`
      : `<div style="width:38px;height:38px;border-radius:6px;background:var(--teal-pale);flex-shrink:0;display:flex;align-items:center;justify-content:center">🍞</div>`;
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      ${img}
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:0.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</div>
        <div style="font-size:0.72rem;color:var(--text-soft)">${p.weight||''} · ${p.price||0} lej</div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="openProductModal(${p.id})" style="flex-shrink:0">✏️</button>
      <button class="btn btn-ghost btn-sm" onclick="archiveProduct(${p.id})" style="flex-shrink:0;color:#b45309" title="Archiválás" data-tip="Archiválás">🗂️</button>

      <button class="btn ${isActive?'btn-danger':'btn-primary'} btn-sm" onclick="toggleProduct(${p.id})" style="flex-shrink:0">${isActive?'–':'+'}</button>
    </div>`;
  };

  // Bal: összes termék szűrve
  const allHtml = filterHtml + filtered.map(p => productCard(p, active.includes(p.id))).join('') || '<p class="text-soft text-sm">Nincsenek termékek.</p>';
  document.getElementById('all-products').innerHTML = allHtml;

  // Jobb: aktív termékek ezen a hónapon
  const activeProds = D.products.filter(p => active.includes(p.id));
  document.getElementById('active-products').innerHTML = activeProds.length
    ? activeProds.map(p => productCard(p, true)).join('')
    : '<p class="text-soft text-sm">Még nincs aktív termék ebben a hónapban.</p>';
}
function selectCatalogMonth(m){ catalogMonth=m; renderCatalog(); const pv=document.getElementById('catalog-plan-view'); if(pv && pv.style.display!=='none') renderMonthPlan(); }
function toggleProduct(id){
  const p = D.products.find(p=>p.id===id);
  if(p && p.deleted_at) { toast('⚠️ Archivált termék nem aktiválható. Először állítsd vissza az archivúmból.', true); return; }
  const key=mk(selYear,catalogMonth);
  if(!D.monthlyActiveProducts[key]) D.monthlyActiveProducts[key]=[];
  const idx=D.monthlyActiveProducts[key].indexOf(id);
  if(idx>-1) D.monthlyActiveProducts[key].splice(idx,1);
  else D.monthlyActiveProducts[key].push(id);
  // Sync to Supabase
  const [ky, km] = key.split('-').map(Number);
  if(idx>-1) {
    sb.delete('monthly_active_products', `year=eq.${ky}&month=eq.${km}&product_id=eq.${id}`).catch(e=>console.warn(e));
  } else {
    sb.upsert('monthly_active_products', {year:ky, month:km, product_id:id}, 'year,month,product_id').catch(e=>console.warn(e));
  }
  save(); renderCatalog();
  toast(idx>-1?'Termék eltávolítva a hónapból':'Termék aktiválva');
}

async function archiveProduct(id) {
  const p = D.products.find(p=>p.id===id);
  if(!p) return;
  if (!(await confirmDialog('Archiválod: "' + p.name + '"?\n\nA termék eltűnik a katalógusból, nem rendelhető.\nA múltbeli statisztikákban megmarad.\nVisszaallítí tható az archívumból.'))) return;
  const now = new Date().toISOString();
  try {
    // v2.36.0 fix #1: only deleted_at — NO spread of client object (which has 'desc' not 'description')
    await sb.updateFields('products', { deleted_at: now }, 'id=eq.' + id);
    const relRecipes = await kData.query('recipes', {filter: 'product_id=eq.'+id, limit: 10});
    for (const r of (relRecipes||[])) {
      if (!r.archived) await kData.updateFields('recipes', { archived: true }, 'id=eq.' + r.id);
    }
    await sb.delete('monthly_active_products', 'product_id=eq.'+id);
    // v2.38.2: archív cache külön — áthelyezzük a terméket D.products-ból D.productsArchived-be
    const idx = D.products.findIndex(x=>x.id===id);
    if(idx>=0) {
      const archived = Object.assign({}, D.products[idx], {deleted_at: now});
      if (!D.productsArchived) D.productsArchived = [];
      D.productsArchived.push(archived);
      D.products.splice(idx, 1);
    }
    Object.keys(D.monthlyActiveProducts).forEach(k=>{
      D.monthlyActiveProducts[k] = (D.monthlyActiveProducts[k]||[]).filter(x=>x!==id);
    });
    await auditLog('product_archive', p.name, 'ID: '+id);
    toast('🗂️ Termék archiválva.');
    save(); renderCatalog(); renderArchive();
    // v2.28.0: Ask admin if they want to broadcast push about discontinued product
    setTimeout(async () => {
      if (typeof sendPushBroadcast === 'function' && (await confirmDialog(`Küldjek push értesítést a vevőknek a termék kifutásáról?\n\n"⚠️ Termék kifutott: ${p.name}"`))) {
        sendPushBroadcast('product_archived', '⚠️ Termék már nem elérhető', `${p.name} - többé nem rendelhető.`, 'all').then(r => {
          toast(`✅ Push elküldve ${r.sent}/${r.total} vevőnek.`);
        });
      }
    }, 200);
  } catch(e) { toast('⚠️ Hiba: '+e.message, true); }
}

async function restoreProduct(id) {
  // v2.38.2: archivált termékek a D.productsArchived cache-ben vannak
  const p = (D.productsArchived || []).find(p=>p.id===id) || D.products.find(p=>p.id===id);
  if(!p) return;
  try {
    // v2.36.0 helper, NO spread (would push 'desc' field that doesn't exist in DB)
    await sb.updateFields('products', { deleted_at: null }, 'id=eq.' + id);
    // Áthelyezés D.productsArchived → D.products
    const archIdx = (D.productsArchived || []).findIndex(x=>x.id===id);
    if (archIdx >= 0) {
      const restored = Object.assign({}, D.productsArchived[archIdx], {deleted_at: null});
      D.products.push(restored);
      D.productsArchived.splice(archIdx, 1);
    }
    await auditLog('product_restore', p.name, 'ID: '+id);
    toast('✅ Termék visszaallítva.');
    save(); renderCatalog(); renderArchive();
  } catch(e) { toast('⚠️ Hiba: '+e.message, true); }
}

async function permanentDeleteProduct(id) {
  // v2.38.2: nézünk mindkét cache-ben (lehet aktív is, archivált is)
  const p = (D.productsArchived || []).find(p=>p.id===id) || D.products.find(p=>p.id===id);
  if(!p) return;
  if (!(await confirmDialog('VÉGLEGES törlés: "' + p.name + '"?\n\nEz nem visszavonható!'))) return;
  try {
    await sb.delete('products', 'id=eq.'+id);
    D.products = D.products.filter(x=>x.id!==id);
    D.productsArchived = (D.productsArchived || []).filter(x=>x.id!==id);
    await auditLog('product_delete_permanent', p.name, 'ID: '+id);
    toast('❌ Termék véglegesen törölve.');
    save(); renderCatalog(); renderArchive();
  } catch(e) { toast('⚠️ Hiba: '+e.message, true); }
}

function renderArchive() {
  // v2.38.2: archív termékek külön cache-ben mert a D.products már csak aktívakat tartalmaz
  const archived = D.productsArchived || [];
  const el = document.getElementById('archived-products');
  if (!el) return;
  if (!archived.length) { el.innerHTML = '<p class="text-soft text-sm">Nincsenek archivált termékek.</p>'; return; }
  el.innerHTML = archived.map(function(p) {
    const dt = new Date(p.deleted_at).toLocaleDateString('hu-HU');
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">' +
      '<div style="flex:1;min-width:0"><div style="font-weight:600;font-size:0.85rem">' + esc(p.name) +
      ' <span style="color:var(--text-soft);font-size:0.72rem;font-weight:400">– archiválva: ' + dt + '</span></div>' +
      '<div style="font-size:0.72rem;color:var(--text-soft)">' + (p.weight||'') + ' · ' + (p.price||0) + ' lej · ' + (p.category||'Egyéb') + '</div></div>' +
      '<button class="btn btn-ghost btn-sm" onclick="restoreProduct(' + p.id + ')" style="color:#059669" title="Visszaallítás" data-tip="Visszaallítás">↩️ Vissza</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="permanentDeleteProduct(' + p.id + ')" style="color:#b91c1c" title="Végleges törlés" data-tip="Végleges törlés">🗑️</button>' +
      '</div>';
  }).join('');
}



// ===== HAVI TERV MÁTRIX (per-sütinap termékkatalógus) =====
let _planCat = 'all';
const _PLAN_DOW = ['V','H','K','Sze','Cs','P','Szo'];
function _planKey(){ return `${selYear}-${catalogMonth}`; }
function _planEx(){ return (D.productDayExceptions && D.productDayExceptions[_planKey()]) || null; }
function _planAvail(pid, day){
  const ex=_planEx(); const pe=ex&&ex[pid];
  if(pe && Object.prototype.hasOwnProperty.call(pe,day)) return !!pe[day];
  return true;
}
function _planPast(d){ const t=new Date(); t.setHours(0,0,0,0); const x=new Date(d); x.setHours(0,0,0,0); return x<t; }
function _planToday(d){ const t=new Date(); return d.getFullYear()===t.getFullYear()&&d.getMonth()===t.getMonth()&&d.getDate()===t.getDate(); }
function _planDateStr(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function _planDayHasOrders(day){
  const y=selYear,m=catalogMonth;
  return Object.keys(D.orders||{}).some(k=>{ const p=k.split('-'); const d=+p[p.length-1],mo=+p[p.length-2],yr=+p[p.length-3]; return yr===y&&mo===m&&d===day&&Object.keys(D.orders[k]||{}).length>0; });
}
function _planActiveIds(){ return D.monthlyActiveProducts[_planKey()]||[]; }
function _planCellOn(pid, day){ return _planAvail(pid, day); }
function _planProds(){
  const ids=_planActiveIds();
  let list=D.products.filter(p=>ids.includes(p.id)&&!p.deleted_at);
  if(_planCat!=='all') list=list.filter(p=>(p.category||'Egyéb')===_planCat);
  return list;
}
function planSetCat(c){ _planCat=c; renderMonthPlan(); }
function planWarn(msg){ const w=document.getElementById('plan-warn'); if(!w) return; if(!msg){w.style.display='none';return;} w.textContent=msg; w.style.display='block'; }
function _planLocalSet(pid,day,val){ const k=_planKey(); if(!D.productDayExceptions[k])D.productDayExceptions[k]={}; if(!D.productDayExceptions[k][pid])D.productDayExceptions[k][pid]={}; if(val===undefined) delete D.productDayExceptions[k][pid][day]; else D.productDayExceptions[k][pid][day]=val; }
function _planClearEx(pid){ const k=_planKey(); if(D.productDayExceptions[k]) delete D.productDayExceptions[k][pid]; }
async function _planWriteFalse(rows){ if(!rows.length) return; try{ await sb.upsert('product_day_exceptions', rows, 'year,month,product_id,day'); }catch(e){ console.warn('plan upsert:', e.message); toast('⚠️ Mentés sikertelen: '+e.message, true); } }
async function _planDelete(filter){ try{ await sb.delete('product_day_exceptions', filter); }catch(e){ console.warn('plan delete:', e.message); } }

// KÉTLÉPÉSES: aktiválás a katalógusban (+/– lista); a mátrix CSAK a napi elérhetőséget állítja (kivételek).
// A termék AKTÍV MARAD akkor is, ha egy nap sincs betéve — innen NEM aktiválunk/deaktiválunk.
async function planCellToggle(pid, day){
  planWarn(''); const y=selYear,m=catalogMonth;
  if(_planAvail(pid,day)){
    if(_affectedOrders([pid],[day]).length){ openWithdrawDialog([pid], day, 'day'); return; }
    _planLocalSet(pid,day,false);
    await _planWriteFalse([{year:y,month:m,product_id:pid,day:day,available:false,updated_at:new Date().toISOString()}]);
  } else {
    _planLocalSet(pid,day,undefined); await _planDelete(`year=eq.${y}&month=eq.${m}&product_id=eq.${pid}&day=eq.${day}`);
  }
  renderMonthPlan();
}
async function planRowToggle(pid){
  planWarn(''); const y=selYear,m=catalogMonth;
  const days=getBakingDays(y,m).filter(d=>!_planPast(d));
  const allOn=days.length && days.every(d=>_planAvail(pid,d.getDate()));
  if(allOn){
    if(_affectedOrders([pid], _planNonPastDayNums()).length){ openWithdrawDialog([pid], null, 'month'); return; }
    const rows=days.map(d=>({year:y,month:m,product_id:pid,day:d.getDate(),available:false,updated_at:new Date().toISOString()}));
    days.forEach(d=>_planLocalSet(pid,d.getDate(),false)); await _planWriteFalse(rows);
  } else {
    _planClearEx(pid); await _planDelete(`year=eq.${y}&month=eq.${m}&product_id=eq.${pid}`);
  }
  renderMonthPlan();
}
async function planColToggle(day){
  planWarn(''); const prods=_planProds(); if(!prods.length) return; const y=selYear,m=catalogMonth;
  const allOn=prods.every(p=>_planAvail(p.id,day));
  if(allOn){
    const colPids=prods.map(p=>p.id);
    if(_affectedOrders(colPids,[day]).length){ openWithdrawDialog(colPids, day, 'day'); return; }
    const rows=[]; prods.forEach(p=>{ _planLocalSet(p.id,day,false); rows.push({year:y,month:m,product_id:p.id,day:day,available:false,updated_at:new Date().toISOString()}); });
    await _planWriteFalse(rows);
  } else {
    prods.forEach(p=>_planLocalSet(p.id,day,undefined));
    await _planDelete(`year=eq.${y}&month=eq.${m}&day=eq.${day}&product_id=in.(${prods.map(p=>p.id).join(',')})`);
  }
  renderMonthPlan();
}
async function planRemoveDay(dateStr, day){
  if(_planDayHasOrders(day)){ planWarn(`A(z) ${day}. napon már van rendelés — előbb kezeld a rendeléseket, mielőtt kiveszed a napot.`); return; }
  planWarn(''); const key=_planKey(); const cal=(D.bakingCalendar&&D.bakingCalendar[key])||{extra:[],removed:[]};
  const defaults=D.bakingDaysDefault||[2,5]; const [yy,mm,dd]=dateStr.split('-').map(Number); const dow=new Date(yy,mm-1,dd).getDay();
  await toggleCalDay(dateStr, defaults.includes(dow), cal.extra.includes(dateStr), cal.removed.includes(dateStr), key);
  renderMonthPlan();
}
function planAddDaySel(){
  const sel=document.getElementById('plan-add-day'); if(!sel||!sel.value) return; const dateStr=sel.value; const key=_planKey();
  const cal=(D.bakingCalendar&&D.bakingCalendar[key])||{extra:[],removed:[]}; const defaults=D.bakingDaysDefault||[2,5];
  const [yy,mm,dd]=dateStr.split('-').map(Number); const dow=new Date(yy,mm-1,dd).getDay(); planWarn('');
  toggleCalDay(dateStr, defaults.includes(dow), cal.extra.includes(dateStr), cal.removed.includes(dateStr), key);
  renderMonthPlan();
}

function renderMonthPlan(){
  const scroller=document.getElementById('plan-scroller'); if(!scroller) return;
  const catBar=document.getElementById('plan-cats');
  const cats=[...new Set(D.products.filter(p=>_planActiveIds().includes(p.id)&&!p.deleted_at).map(p=>p.category||'Egyéb'))].sort();
  if(catBar){ catBar.innerHTML=['all',...cats].map(c=>{ const on=_planCat===c; const label=c==='all'?'🧺 Összes':c; return `<button class="btn btn-sm ${on?'btn-primary':'btn-ghost'}" onclick="planSetCat('${String(c).replace(/'/g,"\\'")}')">${label}</button>`; }).join(''); }
  const addSel=document.getElementById('plan-add-day');
  if(addSel){ const bset=new Set(getBakingDays(selYear,catalogMonth).map(d=>d.getDate())); const cand=getDays(selYear,catalogMonth).filter(d=>!bset.has(d.getDate())&&!_planPast(d)); addSel.innerHTML=cand.length? cand.map(d=>`<option value="${_planDateStr(d)}">${d.getDate()}. (${_PLAN_DOW[d.getDay()]})</option>`).join('') : '<option value="">nincs több nap</option>'; }
  const days=getBakingDays(selYear,catalogMonth);
  if(!days.length){ scroller.innerHTML='<div style="padding:24px;text-align:center;color:var(--text-soft)">Ebben a hónapban nincs sütési nap.</div>'; return; }
  const prods=_planProds();
  if(!prods.length){ scroller.innerHTML='<div style="padding:24px;text-align:center;color:var(--text-soft)">Nincs aktív termék ebben a hónapban — aktiválj a Termékek fülön.</div>'; return; }
  const PW=176, DW=58, SB='#fff', HB='var(--teal-dark)';
  const CZ=`position:sticky;top:0;left:0;z-index:4;background:${HB};border-bottom:2px solid var(--teal);border-right:1px solid var(--border);`;
  const HZ=`position:sticky;top:0;z-index:3;background:${HB};border-bottom:2px solid var(--teal);`;
  const LZ=`position:sticky;left:0;z-index:2;background:${SB};border-right:1px solid var(--border);`;
  let h=`<table style="border-collapse:separate;border-spacing:0;table-layout:fixed;width:${PW+days.length*DW}px;font-size:12px">`;
  h+=`<thead><tr><th style="width:${PW}px;${CZ}text-align:left;padding:6px 8px;font-weight:700;color:var(--cream);vertical-align:bottom">termék \\ nap</th>`;
  days.forEach(d=>{
    const day=d.getDate(), dow=d.getDay(), past=_planPast(d), today=_planToday(d), ds=_planDateStr(d), wknd=(dow===0||dow===6);
    const dcol=today?'color:var(--teal-dark);background:var(--gold);border-radius:4px;padding:0 5px':'color:var(--cream)';
    const hd=`<div ${past?'':`onclick="planColToggle(${day})" style="cursor:pointer"`}><div style="font-size:10px;color:${wknd?'var(--gold-light)':'var(--cream)'};opacity:.8">${_PLAN_DOW[dow]}</div><div style="font-size:14px;font-weight:700;${dcol}">${day}</div></div>`;
    const ctrl=past?'<span style="font-size:11px;opacity:.7">🔒</span>':`<button onclick="planRemoveDay('${ds}',${day})" title="nap elvétele" style="border:none;background:none;cursor:pointer;color:var(--cream);opacity:.85;font-size:12px">✕</button>`;
    h+=`<th style="width:${DW}px;padding:3px;text-align:center;vertical-align:top;${HZ}">${hd}<div style="margin-top:2px">${ctrl}</div></th>`;
  });
  h+='</tr></thead><tbody>';
  prods.forEach(p=>{
    h+=`<tr><td onclick="planRowToggle(${p.id})" title="${esc(p.name)}" style="width:${PW}px;${LZ}cursor:pointer;padding:5px 8px;border-top:1px solid var(--border)"><div style="font-weight:600;font-size:12px;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(p.name)}</div>${p.code?`<div style="font-size:9px;color:var(--text-soft);margin-top:1px">${esc(p.code)}</div>`:''}</td>`;
    days.forEach(d=>{
      const day=d.getDate(), past=_planPast(d), on=_planCellOn(p.id,day);
      const cell=past
        ? `<div style="height:30px;display:flex;align-items:center;justify-content:center;background:var(--bg-soft);border-radius:5px;color:var(--text-soft)">${on?'✓':''}</div>`
        : `<div onclick="planCellToggle(${p.id},${day})" style="height:30px;cursor:pointer;display:flex;align-items:center;justify-content:center;background:${on?'var(--teal-pale)':'#fff'};border:1px solid ${on?'var(--teal)':'var(--border)'};border-radius:5px;color:var(--teal-dark);font-weight:700">${on?'✓':''}</div>`;
      h+=`<td style="padding:2px;border-top:1px solid var(--border)">${cell}</td>`;
    });
    h+='</tr>';
  });
  scroller.innerHTML=h+'</tbody></table>';
}

// ===== TERMÉK-VISSZAVONÁS (override rendeléssel) =====
let _wdCtx=null; // {productIds, anchorDay, defaultScope}
function _planNonPastDayNums(){ return getBakingDays(selYear,catalogMonth).filter(d=>!_planPast(d)).map(d=>d.getDate()); }
function _wdScopeDays(scope){ const all=_planNonPastDayNums(); if(scope==='day' && _wdCtx.anchorDay!=null) return all.filter(d=>d===_wdCtx.anchorDay); return all; }
function _affectedOrders(productIds, dayNums){
  const y=selYear,m=catalogMonth,res=[];
  (D.clients||[]).forEach(cl=>{ dayNums.forEach(day=>{
    const k=getOrderKey(cl.id,y,m,day);
    if(((D.orderStatus&&D.orderStatus[k])||{}).status==='cancelled') return;
    const ord=D.orders&&D.orders[k]; if(!ord) return;
    productIds.forEach(pid=>{ const q=ord[pid]; if(q>0) res.push({clientId:cl.id, day, pid, qty:q}); });
  }); });
  return res;
}
function _wdNames(){ return _wdCtx.productIds.map(pid=>{ const p=D.products.find(x=>x.id===pid); return p?p.name:('#'+pid); }); }
function openWithdrawDialog(productIds, anchorDay, defaultScope){
  _wdCtx={productIds, anchorDay, defaultScope:(anchorDay==null?'month':(defaultScope||'day'))};
  const names=_wdNames();
  const tmpl=`Alapanyag-probléma miatt a(z) ${names.join(', ')} a jelzett napokon kimarad a sütésből, ezért a rendelésedből ezt kivettük. Elnézést kérünk a kellemetlenségért!`;
  const dayRadio = anchorDay!=null ? `<label style="display:flex;gap:8px;align-items:center;margin-bottom:6px;cursor:pointer"><input type="radio" name="wd-scope" value="day" ${_wdCtx.defaultScope==='day'?'checked':''} onchange="wdRefresh()"> Csak a ${anchorDay}. nap</label>` : '';
  const ov=document.createElement('div'); ov.id='wd-overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(6,76,72,0.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  ov.innerHTML=`<div style="background:#fff;border-radius:14px;max-width:460px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 10px 40px var(--shadow)">
    <div style="background:var(--teal-pale);padding:14px 18px;border-radius:14px 14px 0 0;border-bottom:1px solid var(--teal-light)">
      <div style="font-weight:700;color:var(--teal-dark)">Termék visszavonása</div>
      <div style="font-size:0.82rem;color:var(--text-soft);margin-top:2px">${esc(names.join(', '))}</div>
    </div>
    <div style="padding:16px 18px">
      <div style="font-size:0.85rem;font-weight:600;margin-bottom:6px">Hatókör</div>
      ${dayRadio}
      <label style="display:flex;gap:8px;align-items:center;margin-bottom:12px;cursor:pointer"><input type="radio" name="wd-scope" value="month" ${_wdCtx.defaultScope==='month'?'checked':''} onchange="wdRefresh()"> Egész hónap (mai naptól)</label>
      <div id="wd-affected" style="background:var(--bg-soft);border-radius:8px;padding:10px 12px;font-size:0.82rem;margin-bottom:12px"></div>
      <div style="font-size:0.85rem;font-weight:600;margin-bottom:6px">Indoklás (a vevőknek megy)</div>
      <textarea id="wd-reason" rows="3" style="width:100%;border:1.5px solid var(--border);border-radius:8px;padding:9px 12px;font-family:'Kodchasan',sans-serif;font-size:0.85rem;resize:vertical">${esc(tmpl)}</textarea>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
        <button class="btn btn-ghost" onclick="closeWithdrawDialog()">Mégse</button>
        <button class="btn btn-danger" id="wd-confirm" onclick="wdExecute()">Visszavonás + értesítés</button>
      </div>
    </div></div>`;
  document.body.appendChild(ov); wdRefresh();
}
function closeWithdrawDialog(){ const o=document.getElementById('wd-overlay'); if(o) o.remove(); _wdCtx=null; }
function _wdSelectedScope(){ const r=document.querySelector('input[name="wd-scope"]:checked'); return r?r.value:'month'; }
function wdRefresh(){
  const aff=_affectedOrders(_wdCtx.productIds, _wdScopeDays(_wdSelectedScope()));
  const clients=new Set(aff.map(a=>a.clientId)); const totQty=aff.reduce((s,a)=>s+a.qty,0);
  const el=document.getElementById('wd-affected'); if(!el) return;
  el.innerHTML = aff.length
    ? `⚠️ <b>${clients.size}</b> vevő, <b>${totQty}</b> db érintett — csak ez a termék kerül ki a rendelésükből, és értesítést kapnak.`
    : 'Nincs érintett rendelés ebben a hatókörben — csak az elérhetőséget veszem le.';
}
async function wdExecute(){
  const btn=document.getElementById('wd-confirm'); if(btn){ btn.disabled=true; btn.textContent='Feldolgozás…'; }
  const scope=_wdSelectedScope(); const reason=((document.getElementById('wd-reason')||{}).value||'').trim();
  const productIds=_wdCtx.productIds.slice(); const dayNums=_wdScopeDays(scope); const y=selYear,m=catalogMonth;
  const aff=_affectedOrders(productIds, dayNums);
  for(const a of aff){
    try{ await sb.delete('orders', `client_id=eq.${a.clientId}&year=eq.${y}&month=eq.${m}&day=eq.${a.day}&product_id=eq.${a.pid}`); }catch(e){ console.warn('order del:', e.message); }
    const k=getOrderKey(a.clientId,y,m,a.day); if(D.orders[k]) delete D.orders[k][a.pid];
  }
  const falseRows=[];
  productIds.forEach(pid=>dayNums.forEach(day=>{ _planLocalSet(pid,day,false); falseRows.push({year:y,month:m,product_id:pid,day:day,available:false,updated_at:new Date().toISOString()}); }));
  await _planWriteFalse(falseRows);
  // (kétlépéses modell: a termék aktív marad akkor is, ha egy nap sincs — NEM deaktiválunk)
  const byClient={}; aff.forEach(a=>{ (byClient[a.clientId]=byClient[a.clientId]||[]).push(a.day); });
  for(const cid of Object.keys(byClient)){
    try{ await sb.insert('messages', {client_id:cid, year:y, month:m, text:'📨 Admin: '+reason}); }catch(e){ console.warn('msg:', e.message); }
    if(typeof sendPushToClient==='function') sendPushToClient(cid, 'cancelled', '❌ Rendelés-módosítás', reason.substring(0,90)).catch(()=>{});
  }
  closeWithdrawDialog();
  if(typeof toast==='function') toast(`Visszavonva · ${Object.keys(byClient).length} vevő értesítve`);
  renderMonthPlan();
}

function openProductModal(id=null){
  editingProductId=id;
  const catSel=document.getElementById('p-category');
  catSel.innerHTML=D.categories.map(c=>`<option>${c}</option>`).join('');
  // Termékcsalád dropdown feltöltése (az aktuálisan szerkesztett terméket kizárjuk)
  const famSel = document.getElementById('p-family-id');
  if (famSel) {
    famSel.innerHTML = '<option value="">– Önálló termék (nincs termékcsalád) –</option>' +
      D.products
        .filter(p => p.id !== id) // ne lehessen önmagát kiválasztani
        .map(p => `<option value="${p.id}">${p.name} (${p.code||p.id})</option>`)
        .join('');
  }
  if(id){
    const p=D.products.find(p=>p.id===id);
    document.getElementById('p-name').value=p.name;
    document.getElementById('p-weight').value=p.weight;
    document.getElementById('p-price').value=p.price;
    document.getElementById('p-category').value=p.category;
    document.getElementById('p-desc').value=p.desc||'';
    const imgVal = p.image||'';
    document.getElementById('p-image').value = imgVal.startsWith('data:') ? '' : imgVal;
    document.getElementById('p-image-file')._base64 = imgVal.startsWith('data:') ? imgVal : null;
    if(imgVal){ showProductImagePreview(imgVal); }
    else { document.getElementById('p-image-preview').style.display='none'; }
    document.getElementById('p-type').value=p.ptype||'production';
    document.getElementById('pm-title').textContent='Termék szerkesztése';
    // Kód mező: manual flag alaphelyzetbe – szerkesztéskor is frissülhet névvel/kategóriával
    const codeField = document.getElementById('p-code');
    codeField.value = p.code||'';
    codeField.dataset.manual = 'true';
    const famInput = document.getElementById('p-family-id');
    if (famInput) { famInput.value = p.familyId || ''; updateFamilyPreview(); } // szerkesztésnél ne írja felül a meglévő kódot
  } else {
    ['p-name','p-weight','p-price','p-desc','p-image'].forEach(i=>document.getElementById(i).value='');
    document.getElementById('p-type').value='production';
    clearProductImage();
    document.getElementById('pm-title').textContent='Új termék';
    // Új terméknél kód mező üres, manual flag reset
    const codeField = document.getElementById('p-code');
    codeField.value = '';
    codeField.dataset.manual = 'false';
    const famInput2 = document.getElementById('p-family-id');
    if (famInput2) { famInput2.value = ''; updateFamilyPreview(); }
  }
  // Kapcsolt recept megjelenítése
  const recipeInfo = document.getElementById('p-recipe-info');
  const recipeNameEl = document.getElementById('p-recipe-name');
  if(id && recipeInfo) {
    // Lekérdezzük a kapcsolt receptet Supabase-ből
    kData.query('recipes', {filter:'product_id=eq.'+id, select:'id,name'}).then(rows=>{
      if(rows&&rows.length>0) {
        recipeNameEl.textContent = rows[0].name;
        recipeInfo.style.display = 'block';
      } else {
        recipeInfo.style.display = 'none';
      }
    }).catch(()=>{ recipeInfo.style.display='none'; });
  } else if(recipeInfo) {
    recipeInfo.style.display = 'none';
  }
  document.getElementById('product-modal').classList.add('open');
}
function handleProductImageUpload(input){
  const file = input.files[0];
  if(!file) return;
  if(file.size > 2*1024*1024){
    toast('A kép mérete max 2 MB lehet!');
    input.value='';
    return;
  }
  const reader = new FileReader();
  reader.onload = function(e){
    const base64 = e.target.result;
    document.getElementById('p-image').value = '';
    showProductImagePreview(base64);
    // Store temporarily
    document.getElementById('p-image-file')._base64 = base64;
  };
  reader.readAsDataURL(file);
}

function handleProductImageUrl(url){
  if(!url) { clearProductImage(); return; }
  showProductImagePreview(url);
  document.getElementById('p-image-file')._base64 = null;
}

function showProductImagePreview(src){
  const preview = document.getElementById('p-image-preview');
  const img = document.getElementById('p-image-preview-img');
  img.src = src;
  preview.style.display = 'block';
}

function clearProductImage(){
  document.getElementById('p-image-preview').style.display = 'none';
  document.getElementById('p-image-preview-img').src = '';
  document.getElementById('p-image').value = '';
  document.getElementById('p-image-file').value = '';
  document.getElementById('p-image-file')._base64 = null;
}

function getProductImageValue(){
  const fileInput = document.getElementById('p-image-file');
  if(fileInput._base64) return fileInput._base64;
  const url = document.getElementById('p-image').value.trim();
  return url || null;
}

// ===== CODE GENERATION =====
const CAT_CODES = {
  'Kenyér':'KEN', 'Bagett / zsömle':'BAG', 'Sütemény':'SUT',
  'Leveles tészta':'LEV', 'Egyéb':'EGY'
};

function updateWeightField() {
  const num = document.getElementById('p-weight-num')?.value;
  const unit = document.getElementById('p-weight-unit')?.value || 'g';
  const hidden = document.getElementById('p-weight');
  if(hidden && num) hidden.value = `${num} ${unit}`;
}

function updateProductCode(force=false) {
  const codeEl = document.getElementById('p-code');
  if(!codeEl) return;
  // Skip if manually edited by user
  if(codeEl.dataset.manual === 'true' && !force) return;
  // Skip if empty name (nothing to generate from)
  if(!document.getElementById('p-name')?.value?.trim()) return;
  const name = document.getElementById('p-name')?.value || '';
  const catEl = document.getElementById('p-category');
  const cat = catEl?.options[catEl.selectedIndex]?.text || 'Egyéb';
  const prefix = CAT_CODES[cat] || 'EGY';
  // Take first 4 chars of name, uppercase, remove special chars
  const namePart = name.toUpperCase()
    .replace(/[ÁÀÂÄ]/g,'A').replace(/[ÉÈÊË]/g,'E')
    .replace(/[ÍÌÎÏ]/g,'I').replace(/[ÓÒÔÖ]/g,'O')
    .replace(/[ÚÙÛÜ]/g,'U').replace(/[^A-Z]/g,'')
    .slice(0,4) || 'XXX';
  // Count existing products in this category for sequence
  const existing = D.products.filter(p=>p.category===cat).length;
  const seq = String(existing+1).padStart(2,'0');
  codeEl.value = `${prefix}-${namePart}-${seq}`;
}

function generateClientCode() {
  const nameEl = document.getElementById('c-name');
  const name = nameEl?.value || '';
  const firstLetter = name.trim().charAt(0).toUpperCase() || 'X';
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = `KR-${firstLetter}`;
  for(let i=0;i<3;i++) code += chars[Math.floor(Math.random()*chars.length)];
  code += '-';
  for(let i=0;i<4;i++) code += chars[Math.floor(Math.random()*chars.length)];
  document.getElementById('c-id').value = code;
}

function copyClientCode() {
  copyToClipboard(document.getElementById('c-id')?.value);
}

function copyToClipboard(text) {
  if(!text) { toast('Nincs mit másolni!'); return; }
  // Modern API with fallback
  if(navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text)
      .then(()=>toast('📋 Kód másolva: '+text))
      .catch(()=>copyFallback(text));
  } else {
    copyFallback(text);
  }
}

function copyFallback(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  try {
    document.execCommand('copy');
    toast('📋 Kód másolva: '+text);
  } catch(e) {
    toast('Másolás sikertelen – jelöld ki manuálisan: '+text);
  }
  document.body.removeChild(ta);
}

// Auto-generate code when name is typed
document.addEventListener('DOMContentLoaded', () => {
  const nameEl = document.getElementById('c-name');
  if(nameEl) nameEl.addEventListener('input', () => {
    const codeEl = document.getElementById('c-id');
    if(codeEl && !codeEl.value) generateClientCode();
  });
});

async function saveProduct(){
  const name=document.getElementById('p-name').value.trim();
  const price=parseFloat(document.getElementById('p-price').value);
  if(!name||!price){toast('Név és ár kötelező!');return;}
  const weight=document.getElementById('p-weight').value;
  const category=document.getElementById('p-category').value;
  const desc=document.getElementById('p-desc').value;
  const image=getProductImageValue();
  const ptype=document.getElementById('p-type').value;
  const code=document.getElementById('p-code').value.trim();
  const familyIdRaw = document.getElementById('p-family-id')?.value;
  const familyId = familyIdRaw ? parseInt(familyIdRaw) : null;
  // Névütközés ellenőrzés
  const duplicate = D.products.find(p =>
    p.name.trim().toLowerCase() === name.toLowerCase() &&
    p.id !== editingProductId
  );
  // Termékcsaládon belül megengedett az azonos név (pl. 500g és 1000g verzió)
  const sameFamily = duplicate && familyId && (duplicate.id === familyId || duplicate.familyId === familyId);
  if(duplicate && !sameFamily) {
    toast(`⚠️ Már létezik "${duplicate.name}" nevű termék (kód: ${duplicate.code||duplicate.id}). Válassz más nevet!`, true);
    return;
  }
  let prodId;
  if(editingProductId){
    prodId=editingProductId;
    const p=D.products.find(p=>p.id===editingProductId);
    Object.assign(p,{name,weight,price,category,desc,image,ptype,code,familyId});
  }
  try {
    let realProdId;
    if(editingProductId) {
      // UPDATE – v2.38.1 fix: only fields that ACTUALLY exist in products table (no recipe-level fields like marketing_desc/allergens which belong to recipes table)
      await sb.updateFields('products', {name,weight,price,category,description:desc,product_family_id:familyId,image,code}, 'id=eq.'+editingProductId);
      realProdId = editingProductId;
    } else {
      // INSERT – Supabase generálja az ID-t, kód az ID alapján generálódik
      const savedProds = await sb.insert('products', {name,weight,price,category,description:desc,product_family_id:familyId});
      realProdId = savedProds[0].id;
      const autoCode = generateProductCode(name, category, realProdId);
      await sb.update('products', {code: autoCode}, 'id=eq.'+realProdId);
      D.products.push({id:realProdId,name,weight,price,category,desc,image,ptype,code:autoCode});
    }
    prodId = realProdId;
    // Ha gyártási termék és új termék → automatikus recept létrehozás
    if(ptype==='production' && !editingProductId) {
      try {
        // v2.36.0 fix #2: explicit ID (max+1) to avoid recipes_pkey collision when DB sequence is out of sync
        let nextId = 1;
        try {
          const maxRow = await kData.query('recipes', { order: 'id.desc', limit: 1 });
          if (maxRow && maxRow.length > 0) nextId = (maxRow[0].id || 0) + 1;
        } catch(_) {}
        const newRecipe = {
          id: nextId,
          name, category,
          product_id: realProdId,
          base_portion: 1000, bake_loss: 16, unit_weight: 1000,
          temp1: 230, time1: 20, temp2: 180, time2: 70,
          description: desc||'', levain_amount: 0,
          labor_h: 1, electricity: 5,
          marketing_desc: '', ingredient_label: '', allergens: '', nutrition: null
        };
        await kData.insert('recipes', newRecipe);
        toast('✅ Termék és recept létrehozva! Töltsd ki a receptet a Receptúra modulban.');
      } catch(e2) {
        toast('Termék mentve, de recept létrehozás sikertelen: '+e2.message, true);
      }
    } else {
      if(editingProductId) {
        auditLog('product_update', name, `Ár: ${price} lej, Kategória: ${category}`);
        toast('Termék frissítve!');
      } else {
        auditLog('product_create', name, `Ár: ${price} lej, Kategória: ${category}`);
        toast('Új termék hozzáadva!');
        // v2.28.0: Ask admin if they want to broadcast push about the new product
        setTimeout(async () => {
          if (typeof sendPushBroadcast === 'function' && (await confirmDialog(`Küldjek push értesítést a vevőknek az új termékről?\n\n"🆕 Új termék: ${name}"\n${price} lej / ${weight}`))) {
            sendPushBroadcast('product_new', '🆕 Új termék elérhető!', `${name} - ${price} lej${weight ? ` (${weight})` : ''}`, 'all').then(r => {
              toast(`✅ Push elküldve ${r.sent}/${r.total} vevőnek.`);
            });
          }
        }, 200);
      }
    }
  } catch(e){ toast('⚠️ Supabase mentés sikertelen: '+e.message, true); }
  save(); closeModal('product-modal'); renderCatalog();
}


// ===== TERMÉKCSALÁD PREVIEW =====
function updateFamilyPreview() {
  const el = document.getElementById('p-family-preview');
  const val = document.getElementById('p-family-id')?.value;
  if (!el) return;
  if (!val) { el.textContent = ''; return; }
  const famId = parseInt(val);
  const parent = D.products.find(p => p.id === famId);
  if (parent) {
    const members = D.products.filter(p => p.familyId === famId || p.id === famId);
    el.innerHTML = `📦 Termékcsalád: <strong>${parent.name}</strong> (${members.length} tag)`;
    el.style.color = 'var(--teal-dark)';
  } else {
    el.textContent = '';
  }
}

// ===== TERMÉKCSALÁDOK TAB =====
function switchCatalogTab(tab) {
  const prodView = document.getElementById('catalog-products-view');
  const famView = document.getElementById('catalog-families-view');
  const arcView = document.getElementById('catalog-archive-view');
  const planView = document.getElementById('catalog-plan-view');
  const tabProd = document.getElementById('catalog-tab-products');
  const tabFam = document.getElementById('catalog-tab-families');
  const tabArc = document.getElementById('catalog-tab-archive');
  const tabPlan = document.getElementById('catalog-tab-plan');

  [prodView, famView, arcView, planView].forEach(v => { if(v) v.style.display = 'none'; });
  [tabProd, tabFam, tabArc, tabPlan].forEach(t => { if(t) t.style.borderBottom = ''; });

  if (tab === 'families') {
    if(famView) famView.style.display = 'block';
    if(tabFam) tabFam.style.borderBottom = '2px solid var(--teal-dark)';
    renderFamilies();
  } else if (tab === 'archive') {
    if(arcView) arcView.style.display = 'block';
    if(tabArc) tabArc.style.borderBottom = '2px solid var(--teal-dark)';
    renderArchive();
  } else {
    if(prodView) prodView.style.display = 'block';
    if(tabProd) tabProd.style.borderBottom = '2px solid var(--teal-dark)';
  }
}

function renderFamilies() {
  const el = document.getElementById('families-grid');
  if (!el) return;

  // Önálló termékek (nincs familyId)
  const standalone = D.products.filter(p => !p.familyId);

  // Termékcsaládok csoportosítása: familyId → szülő termék
  const familyMap = {};
  D.products.filter(p => p.familyId).forEach(p => {
    if (!familyMap[p.familyId]) familyMap[p.familyId] = [];
    familyMap[p.familyId].push(p);
  });

  // Szülő termékek (akik legalább egy gyereket vannak)
  const parentIds = Object.keys(familyMap).map(Number);
  const families = parentIds.map(pid => ({
    parent: D.products.find(p => p.id === pid),
    members: familyMap[pid]
  })).filter(f => f.parent);

  let html = '';

  if (families.length === 0 && standalone.length === 0) {
    el.innerHTML = '<p class="text-soft text-sm" style="padding:32px">Nincs termék a katalógusban.</p>';
    return;
  }

  // Termékcsaládok
  if (families.length > 0) {
    html += `<h3 style="font-family:'Fraunces',serif;color:var(--teal-dark);margin-bottom:16px">🔗 Termékcsaládok (${families.length})</h3>`;
    html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;margin-bottom:32px">`;
    families.forEach(({ parent, members }) => {
      const allMembers = [parent, ...members];
      const avgPrice = Math.round(allMembers.reduce((s, p) => s + (p.price || 0), 0) / allMembers.length);
      const cats = [...new Set(allMembers.map(p => p.category))].join(', ');
      html += `
        <div class="card" style="border-left:4px solid var(--gold)">
          <div class="card-head">
            <div class="card-title">📦 ${parent.name}</div>
            <span style="font-size:.75rem;color:var(--text-soft)">${allMembers.length} tag · ${cats}</span>
          </div>
          <div class="card-body">
            <table style="width:100%;font-size:.83rem;border-collapse:collapse">
              <tr style="color:var(--text-soft);font-size:.75rem">
                <th style="text-align:left;padding:4px 0;font-weight:600">Termék</th>
                <th style="text-align:right;padding:4px 0;font-weight:600">Kód</th>
                <th style="text-align:right;padding:4px 0;font-weight:600">Ár</th>
                <th style="text-align:right;padding:4px 0;font-weight:600"></th>
              </tr>
              ${allMembers.map(p => {
                const isParent = p.id === parent.id;
                return `<tr style="border-top:1px solid var(--border)${isParent ? ';font-weight:700' : ''}">
                  <td style="padding:6px 0">${isParent ? '👑 ' : '└ '}${p.name}</td>
                  <td style="text-align:right;font-family:monospace;font-size:.75rem;color:var(--text-soft)">${p.code || '–'}</td>
                  <td style="text-align:right;color:var(--teal-dark);font-weight:700">${p.price} lej</td>
                  <td style="text-align:right"><button onclick="openProductModal(${p.id})" style="background:none;border:none;cursor:pointer;font-size:.85rem;color:var(--text-soft)" title="Szerkesztés" data-tip="Szerkesztés">✏️</button></td>
                </tr>`;
              }).join('')}
            </table>
            <div style="display:flex;gap:16px;margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">
              <div style="text-align:center;flex:1">
                <div style="font-size:1.1rem;font-weight:700;color:var(--teal-dark)">${allMembers.length}</div>
                <div style="font-size:.7rem;color:var(--text-soft)">termék</div>
              </div>
              <div style="text-align:center;flex:1">
                <div style="font-size:1.1rem;font-weight:700;color:var(--gold-dark)">${avgPrice} lej</div>
                <div style="font-size:.7rem;color:var(--text-soft)">átlag ár</div>
              </div>
              <div style="text-align:center;flex:1">
                <div style="font-size:1.1rem;font-weight:700;color:var(--teal)">${allMembers.filter(p=>p.ptype==='production').length}</div>
                <div style="font-size:.7rem;color:var(--text-soft)">gyártási</div>
              </div>
            </div>
          </div>
        </div>`;
    });
    html += `</div>`;
  }

  // Önálló termékek
  if (standalone.length > 0) {
    html += `<h3 style="font-family:'Fraunces',serif;color:var(--teal-dark);margin-bottom:16px">📌 Önálló termékek (${standalone.length})</h3>`;
    html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">`;
    standalone.forEach(p => {
      html += `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg-soft);border-radius:10px;border:1px solid var(--border)">
        <div style="flex:1;min-width:0">
          <div style="font-size:.85rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
          <div style="font-size:.72rem;color:var(--text-soft)">${p.code || '–'} · ${p.price} lej</div>
        </div>
        <button onclick="openProductModal(${p.id})" style="background:none;border:none;cursor:pointer;font-size:.85rem;color:var(--text-soft)">✏️</button>
      </div>`;
    });
    html += `</div>`;
  }

  el.innerHTML = html;
}
