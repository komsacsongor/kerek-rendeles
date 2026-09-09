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

function addProductToActiveBatch(recipeId){
  const b = _batchPlan.batches.find(x=>x.id===_batchPlan.activeBatchId);
  if(!b){ toast('Előbb hozz létre egy batch-et (válassz sütőt)!', true); return; }
  const it = b.items.find(i=>i.recipeId===recipeId);
  if(it) it.qty += 1; else b.items.push({recipeId, qty:1});
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
  const elec = (R.settings?.electricityPrice)||0;
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
  // sütő-kártyák (fotóval) — új batch indítása
  const ovenCards = ovens.length ? ovens.map(o=>{
    const img = o.photo ? `<img src="${o.photo}" style="width:100%;height:60px;object-fit:contain;background:#fff;border-radius:8px">` : `<div style="height:60px;display:flex;align-items:center;justify-content:center;font-size:1.8rem;background:${o.color||'#f0f0f0'};border-radius:8px">🔥</div>`;
    const cap = ovenCapacityPieces ? '' : '';
    return `<div onclick="addOvenBatch(${o.id})" style="flex:0 0 120px;border:1.5px solid var(--border);border-radius:10px;padding:8px;cursor:pointer;background:#fff" title="Új batch ebben a sütőben">
      ${img}<div style="font-size:0.8rem;font-weight:700;margin-top:4px;text-align:center">${esc(o.name)}</div>
      <div style="font-size:0.68rem;color:var(--text-soft);text-align:center">${o.capacityTrays||0} tálca · ${o.trayType||'GN1/1'}</div>
      <div style="font-size:0.7rem;color:var(--teal-dark);text-align:center;font-weight:700;margin-top:2px">➕ Batch</div></div>`;
  }).join('') : '<p class="text-soft text-sm">Nincs sütő. Vegyél fel a Törzsadatok → Eszközök alatt.</p>';

  // termék-chipek (koppintva az aktív batchbe)
  const chips = products.length ? products.map(p=>{
    const r=_batchRecipe(p.recipeId); const noTray = !(Number(r?.piecesPerTray)>0);
    return `<button onclick="addProductToActiveBatch(${p.recipeId})" style="padding:6px 12px;border:1.5px solid ${noTray?'#f59e0b':'var(--teal)'};border-radius:20px;background:#fff;cursor:pointer;font-family:'Kodchasan',sans-serif;font-size:0.82rem" title="${noTray?'⚠️ Nincs db/tálca beállítva a receptnél':'Aktív batchbe'}">${esc(p.name)} <span style="color:var(--text-soft)">(${p.ordered})</span>${noTray?' ⚠️':''}</button>`;
  }).join('') : '<p class="text-soft text-sm">Előbb számítsd ki az előkészítést (rendelt termékek).</p>';

  // batch-ek
  const batchCards = _batchPlan.batches.map(b=>{
    const oven=(R.equipment||[]).find(e=>e.id===b.ovenId);
    const fill=_batchFill(b); const cost=_batchCost(b);
    const active = b.id===_batchPlan.activeBatchId;
    const items = b.items.length ? b.items.map(it=>{const r=_batchRecipe(it.recipeId); return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:0.82rem"><span style="flex:1">${esc(r?.name||'?')}</span><button onclick="event.stopPropagation();changeBatchItemQty(${b.id},${it.recipeId},-1)" style="width:22px;border:1px solid var(--border);border-radius:5px;background:#fff;cursor:pointer">−</button><b style="min-width:24px;text-align:center">${it.qty}</b><button onclick="event.stopPropagation();changeBatchItemQty(${b.id},${it.recipeId},1)" style="width:22px;border:1px solid var(--border);border-radius:5px;background:#fff;cursor:pointer">+</button></div>`;}).join('') : '<div style="font-size:0.78rem;color:var(--text-soft);padding:4px 0">Üres — koppints egy termékre fent.</div>';
    return `<div onclick="setActiveBatch(${b.id})" style="border:2px solid ${active?'var(--teal)':'var(--border)'};border-radius:10px;padding:10px;margin-bottom:8px;background:${active?'var(--teal-pale,#f0fdfa)':'#fff'};cursor:pointer">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <b style="flex:1;color:var(--teal-dark)">🔥 ${esc(oven?.name||'?')} · batch #${b.id}${active?' <span style="font-size:0.7rem;color:var(--teal)">(aktív)</span>':''}</b>
        <button onclick="event.stopPropagation();removeBatch(${b.id})" style="border:none;background:none;cursor:pointer;color:#dc2626">🗑</button>
      </div>
      ${items}
      <div style="height:6px;background:#e5e7eb;border-radius:3px;margin:8px 0;overflow:hidden"><div style="height:100%;width:${Math.min(100,fill.pct)}%;background:${fill.over?'#dc2626':(fill.pct>85?'#f59e0b':'var(--teal)')}"></div></div>
      <div style="display:flex;justify-content:space-between;font-size:0.74rem;color:var(--text-soft)">
        <span>${fill.over?'<b style="color:#dc2626">⚠️ MEGTELT ('+fill.pct+'%)</b>':'Kihasználtság: '+fill.pct+'%'}</span>
        <span>~${cost.energyKwh.toFixed(1)} kWh · önkölts: <b>${cost.total.toFixed(2)} lej</b></span>
      </div></div>`;
  }).join('');

  const totalCost=_batchPlan.batches.reduce((s,b)=>s+_batchCost(b).total,0);
  box.innerHTML = `
    <div style="margin-bottom:10px"><b style="color:var(--teal-dark)">1) Válassz sütőt → új batch:</b>
      <div style="display:flex;gap:8px;overflow-x:auto;padding:8px 0">${ovenCards}</div></div>
    <div style="margin-bottom:10px"><b style="color:var(--teal-dark)">2) Koppints a termékekre → az aktív batchbe:</b>
      <div style="display:flex;gap:6px;flex-wrap:wrap;padding:8px 0">${chips}</div></div>
    <div><b style="color:var(--teal-dark)">3) Batch-ek (sütő-töltetek):</b>
      <div style="padding-top:8px">${batchCards||'<p class="text-soft text-sm">Még nincs batch. Válassz sütőt fent.</p>'}</div></div>
    ${_batchPlan.batches.length?`<div style="text-align:right;font-weight:700;color:var(--teal-dark);margin-top:6px">Batch-ek összes önköltsége: ${totalCost.toFixed(2)} lej</div>`:''}`;
}

if(typeof window!=='undefined'){
  Object.assign(window, {renderBatchPlanner, addOvenBatch, setActiveBatch, removeBatch, addProductToActiveBatch, changeBatchItemQty});
}
