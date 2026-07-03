// ===== admin-catalog-plan.js =====
// Havi terv mátrix (per-sütinap termékkatalógus) + termék-visszavonás (override rendeléssel).
// Kivágva az admin-catalog.js-ből (2026-07). Globális scope; a Sütési tervezés nézet (admin-baking.js: bpTab/renderBakingPlan) hívja renderMonthPlan-t.

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

