// ===== receptura-batch.js — batch-es sütő-tervező (v2.53.108) =====
// Manuális batch-képzés: a nap termékeit (rendelt+extra) sütő-batchekbe osztod.
// Egy batch = egy sütő-töltet. Kapacitás (GN-terület arányos) → "megtelt" jelzés.
// Ugyanaz a sütő többször (batch-on-batch). Valós önköltség batchenként.

let _batchPlan = { batches: [], activeBatchId: null, seq: 1 };

function _batchOvens() { return (R.equipment||[]).filter(e => (e.type||'oven')==='oven' && e.active!==false); }
function _batchRecipe(rid){ return (R.recipes||[]).find(r=>r.id===rid); }

// a nap termékei: _lastProductionRecipes (rendelt) — az extra a Phase 2b kártyákon állítható
function _batchDayProducts(){
  return (window._lastProductionRecipes||[]).map(pr=>({recipeId:pr.recipe_id, name:pr.name, ordered:pr.planned||0}));
}

function addOvenBatch(ovenId){
  const b = { id: _batchPlan.seq++, ovenId: ovenId, items: [] };
  _batchPlan.batches.push(b);
  _batchPlan.activeBatchId = b.id;
  renderBatchPlanner();
}
function setActiveBatch(id){ _batchPlan.activeBatchId = id; renderBatchPlanner(); }
function removeBatch(id){ _batchPlan.batches = _batchPlan.batches.filter(b=>b.id!==id); if(_batchPlan.activeBatchId===id)_batchPlan.activeBatchId=_batchPlan.batches[0]?.id||null; renderBatchPlanner(); }

function _placedQty(recipeId){ let n=0; (_batchPlan.batches||[]).forEach(b=>b.items.forEach(i=>{ if(i.recipeId===recipeId) n+=i.qty; })); return n; }
function addProductToActiveBatch(recipeId){
  const b = _batchPlan.batches.find(x=>x.id===_batchPlan.activeBatchId);
  if(!b){ toast('Előbb hozz létre egy batch-et (válassz sütőt)!', true); return; }
  const it = b.items.find(i=>i.recipeId===recipeId);
  if(it){ it.qty += 1; }
  else {
    // okos alap: a még el nem helyezett rendelt mennyiség (min 1) — így nem kell darabonként kattintani
    const prod = _batchDayProducts().find(p=>p.recipeId===recipeId);
    const remaining = prod ? Math.max(0, Math.round(prod.ordered) - _placedQty(recipeId)) : 0;
    b.items.push({recipeId, qty: remaining>0?remaining:1});
  }
  renderBatchPlanner();
}
function setBatchItemQty(batchId, recipeId, val){
  const b=_batchPlan.batches.find(x=>x.id===batchId); if(!b)return;
  const it=b.items.find(i=>i.recipeId===recipeId); if(!it)return;
  it.qty = Math.max(0, parseInt(val)||0);
  if(it.qty===0) b.items=b.items.filter(i=>i.recipeId!==recipeId);
  renderBatchPlanner();
}
function changeBatchItemQty(batchId, recipeId, delta){
  const b=_batchPlan.batches.find(x=>x.id===batchId); if(!b)return;
  const it=b.items.find(i=>i.recipeId===recipeId); if(!it)return;
  it.qty = Math.max(0, it.qty+delta);
  if(it.qty===0) b.items=b.items.filter(i=>i.recipeId!==recipeId);
  renderBatchPlanner();
}

// batch kihasználtsága: a legszűkebb kapacitás (a benne lévő receptek alapján)
function _batchFill(b){
  const oven=(R.equipment||[]).find(e=>e.id===b.ovenId);
  if(!oven) return {pct:0, over:false, caps:[]};
  // vegyes töltet: az egyes receptek tálca-igénye összeadódik → tálca-arány
  const GN11=530*325; const area=(Number(oven.trayWmm)||530)*(Number(oven.trayHmm)||325);
  let traysNeeded=0;
  b.items.forEach(it=>{ const r=_batchRecipe(it.recipeId); const ppt=Number(r?.piecesPerTray)||0;
    if(ppt>0){ const perOvenTray=ppt*(area/GN11); traysNeeded += it.qty/perOvenTray; } });
  const cap=Number(oven.capacityTrays)||0;
  const pct = cap>0 ? Math.round(traysNeeded/cap*100) : 0;
  return {pct, over: cap>0 && traysNeeded>cap+0.001, traysNeeded, cap};
}

// valós batch-önköltség: alapanyag (a receptekből) + sütő-villany (kW×idő) + előmelegítés
function _batchCost(b){
  const oven=(R.equipment||[]).find(e=>e.id===b.ovenId);
  let ingCost=0, bakeMin=0;
  b.items.forEach(it=>{ const r=_batchRecipe(it.recipeId);
    if(r && typeof calcRecipeCost==='function'){ const c=calcRecipeCost(r, it.qty); ingCost += (c.rawCost||0); }
    bakeMin = Math.max(bakeMin, Number(r?.bakeMin)||0); // a batch a leghosszabb sütési idővel megy
  });
  const elec = (R.settings?.electricity)||0;
  const kw = Number(oven?.powerKw)||0, duty=Number(oven?.dutyFactor)||0.7;
  const preheatKwh=Number(oven?.preheatKwh)||0;
  const energyKwh = kw*duty*(bakeMin/60) + preheatKwh;
  const elecCost = energyKwh*elec;
  return {ingCost, elecCost, energyKwh, bakeMin, total: ingCost+elecCost};
}

function renderBatchPlanner(){
  const box=document.getElementById('batch-planner'); if(!box) return;
  const ovens=_batchOvens();
  const products=_batchDayProducts();
  const money = n => (n||0).toFixed(2)+' lej';

  // ---- 1) TERMÉKEK a napra: mennyiség + hova osztva ----
  const placed = rid => { let n=0; (_batchPlan.batches||[]).forEach(b=>b.items.forEach(i=>{ if(i.recipeId===rid)n+=i.qty; })); return n; };
  const prodRows = products.length ? products.map(p=>{
    const r=_batchRecipe(p.recipeId); const noTray=!(Number(r?.piecesPerTray)>0);
    const pl=placed(p.recipeId);
    const chips=(_batchPlan.batches||[]).filter(b=>b.items.some(i=>i.recipeId===p.recipeId)).map(b=>{
      const ov=ovens.find(o=>o.id===b.ovenId); const it=b.items.find(i=>i.recipeId===p.recipeId);
      return `<span style="background:var(--teal-pale);color:var(--teal-dark);padding:3px 9px;border-radius:14px;font-size:0.72rem;white-space:nowrap">${esc(ov?.name||'?')} · ${it.qty}</span>`;
    }).join(' ');
    return `<div style="display:flex;align-items:center;gap:12px;padding:11px 4px;border-bottom:1px solid var(--border)">
      <div style="flex:1;min-width:120px"><div style="font-weight:600;color:var(--teal-dark)">${esc(p.name)}${noTray?' <span style="color:#d97706" title="Nincs db/tálca a receptnél">⚠️</span>':''}</div>
        <div style="font-size:0.72rem;color:var(--text-soft)">rendelt: ${p.ordered}${pl?` · elhelyezve: ${pl}`:''}</div></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${chips||'<span style="font-size:0.72rem;color:var(--text-soft)">nincs sütőben</span>'}</div>
    </div>`;
  }).join('') : '<p style="font-size:0.85rem;color:var(--text-soft);padding:8px 0">Számítsd ki az előkészítést (rendelt termékek jelennek meg).</p>';

  // ---- 2) SÜTŐK: nagy kártyák, kapacitás-sáv, koppintva a termék bekerül ----
  const activeId=_batchPlan.activeBatchId;
  const ovenCards = ovens.length ? ovens.map(o=>{
    const myBatches=(_batchPlan.batches||[]).filter(b=>b.ovenId===o.id);
    const batchesHtml = myBatches.map(b=>{
      const fill=_batchFill(b), cost=_batchCost(b); const on=b.id===activeId;
      const items=b.items.map(it=>{const r=_batchRecipe(it.recipeId);
        return `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;font-size:0.82rem">
          <span style="flex:1">${esc(r?.name||'?')}</span>
          <button onclick="event.stopPropagation();changeBatchItemQty(${b.id},${it.recipeId},-1)" style="width:26px;height:26px;border:1px solid var(--border);border-radius:6px;background:#fff;cursor:pointer">−</button>
          <input type="number" min="0" value="${it.qty}" onclick="event.stopPropagation()" onchange="event.stopPropagation();setBatchItemQty(${b.id},${it.recipeId},this.value)" style="width:46px;height:26px;text-align:center;border:1px solid var(--border);border-radius:6px;font-family:'Kodchasan',sans-serif">
          <button onclick="event.stopPropagation();changeBatchItemQty(${b.id},${it.recipeId},1)" style="width:26px;height:26px;border:1px solid var(--border);border-radius:6px;background:#fff;cursor:pointer">+</button></div>`;
      }).join('') || '<div style="font-size:0.78rem;color:var(--text-soft);padding:6px 0">Válaszd ki lent a terméket → ebbe a batchbe kerül.</div>';
      const barColor = fill.over?'#dc2626':(fill.pct>85?'#f59e0b':'var(--teal)');
      return `<div onclick="setActiveBatch(${b.id})" style="border:2px solid ${on?'var(--teal)':'transparent'};border-radius:12px;padding:10px;margin-top:8px;background:${on?'var(--teal-pale)':'#fafafa'};cursor:pointer">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="font-size:0.78rem;font-weight:700;color:var(--teal-dark)">Batch #${b.id}${on?' · aktív':''}</span>
          <button onclick="event.stopPropagation();removeBatch(${b.id})" style="border:none;background:none;cursor:pointer;color:#dc2626;font-size:0.9rem">🗑</button></div>
        ${items}
        <div style="height:7px;background:#e5e7eb;border-radius:4px;overflow:hidden;margin:8px 0 5px"><div style="height:100%;width:${Math.min(100,fill.pct)}%;background:${barColor}"></div></div>
        <div style="display:flex;justify-content:space-between;font-size:0.72rem">
          <span style="color:${fill.over?'#dc2626':'var(--text-soft)'};font-weight:${fill.over?'700':'400'}">${fill.over?'MEGTELT':'Kihasználtság'} ${fill.pct}%</span>
          <span style="color:var(--teal-dark);font-weight:600">${money(cost.total)}</span></div></div>`;
    }).join('');
    const img = o.photo ? `<img src="${o.photo}" style="width:44px;height:44px;object-fit:contain;border-radius:8px;background:#fff">`
      : `<div style="width:44px;height:44px;border-radius:8px;background:var(--teal-pale);display:flex;align-items:center;justify-content:center;font-size:1.4rem">🔥</div>`;
    return `<div style="background:#fff;border:1px solid var(--border);border-radius:16px;padding:14px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        ${img}<div style="flex:1"><div style="font-weight:700;color:var(--teal-dark)">${esc(o.name)}</div>
        <div style="font-size:0.72rem;color:var(--text-soft)">${o.capacityTrays||0} tálca · ${o.trayType||'GN1/1'}</div></div></div>
      ${batchesHtml}
      <button onclick="addOvenBatch(${o.id})" style="width:100%;margin-top:8px;padding:8px;border:1.5px dashed var(--teal);border-radius:10px;background:#fff;color:var(--teal-dark);cursor:pointer;font-family:'Kodchasan',sans-serif;font-size:0.8rem;font-weight:600">+ ${myBatches.length?'új batch ugyanitt':'batch indítása'}</button>
    </div>`;
  }).join('') : '<p style="font-size:0.85rem;color:var(--text-soft)">Nincs sütő. Vegyél fel a Törzsadatok → Eszközök alatt.</p>';

  // ---- termék-választó az aktív batchhez (nagy, koppintható) ----
  const picker = (activeId && products.length) ? `<div style="margin-top:10px"><div style="font-size:0.78rem;color:var(--text-soft);margin-bottom:6px">Koppints egy termékre → az aktív batchbe kerül (a maradék rendelt mennyiséggel):</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${products.map(p=>{const r=_batchRecipe(p.recipeId);const noTray=!(Number(r?.piecesPerTray)>0);
      return `<button onclick="addProductToActiveBatch(${p.recipeId})" style="padding:8px 14px;border:1.5px solid ${noTray?'#f59e0b':'var(--teal)'};border-radius:20px;background:#fff;cursor:pointer;font-family:'Kodchasan',sans-serif;font-size:0.83rem;color:var(--teal-dark)">+ ${esc(p.name)}${noTray?' ⚠️':''}</button>`;}).join('')}</div></div>` : '';

  const totalCost=(_batchPlan.batches||[]).reduce((s,b)=>s+_batchCost(b).total,0);
  box.innerHTML = `
    <div style="margin-bottom:16px">
      <div style="font-size:0.9rem;font-weight:700;color:var(--teal-dark);margin-bottom:2px">Termékek a napra</div>
      <div>${prodRows}</div>
    </div>
    <div style="font-size:0.9rem;font-weight:700;color:var(--teal-dark);margin-bottom:8px">Sütők — oszd batchekbe</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">${ovenCards}</div>
    ${picker}
    ${(_batchPlan.batches||[]).length?`<div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding-top:12px;border-top:1px solid var(--border)"><span style="color:var(--text-soft);font-size:0.85rem">Nap önköltsége (batchek)</span><span style="font-weight:800;color:var(--teal-dark);font-size:1.05rem">${money(totalCost)}</span></div>`:''}`;
}

if(typeof window!=='undefined'){
  Object.assign(window, {renderBatchPlanner, addOvenBatch, setActiveBatch, removeBatch, addProductToActiveBatch, changeBatchItemQty, setBatchItemQty});
}
