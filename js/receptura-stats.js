// ===== receptura-stats.js — közös gyártás-analitika (v2.53.109) =====
// EGY aggregátor (getProductionStats) → napi / heti-havi-éves / admin szint is ezt hívja.
// Konzisztencia: minden nézet UGYANAZT a számot mutatja ugyanarra a metrikára.

async function getProductionStats(fromStr, toStr) {
  // production_logs a tartományban (a date a SÜTÉSI NAP, v2.53.104 óta)
  let logs = [];
  try { logs = await kData.query('production_logs', { filter: `date=gte.${fromStr}&date=lte.${toStr}`, limit: 5000 }) || []; }
  catch(e) { console.warn('stats logs:', e.message); }
  const cache = (typeof _adminProductsCache!=='undefined'?_adminProductsCache:[]);
  const priceOf = pid => { const p=cache.find(x=>x.id===pid); return Number(p?.price)||0; };
  const recipeOf = rid => (R.recipes||[]).find(r=>r.id===rid);
  const priceForRecipe = rid => { const r=recipeOf(rid); const p=r&&r.product_id?cache.find(x=>x.id===r.product_id):null; return Number(p?.price)||0; };

  const s = {
    ordered_planned:0, baked:0, extra_sale:0, extra_internal:0, extra_marketing:0, experimental:0,
    waste:0, ingCost:0, energyKwh:0, bakeMinutesSum:0, batchCount:0, trayFillSum:0, trayFillN:0,
    revenue:0, byRecipe:{}, days:new Set()
  };
  logs.forEach(l => {
    if(l.date) s.days.add(l.date);
    const act = Number(l.pieces_actual)||0, plan = Number(l.pieces_planned)||0;
    const rid = l.recipe_id;
    if(rid){ const br = s.byRecipe[rid] || (s.byRecipe[rid]={name:recipeOf(rid)?.name||('#'+rid), baked:0, extra:0, test:0, revenue:0}); 
      if(l.log_type==='order'){ br.baked+=act; } else if(l.log_type==='extra'){ br.extra+=act; } else if(l.log_type==='experimental'){ br.test+=act; }
    }
    if(l.log_type==='order'){ s.ordered_planned+=plan; s.baked+=act; s.waste+=Math.max(0,plan-act);
      s.revenue += act*priceForRecipe(rid); }
    else if(l.log_type==='extra'){ const a=l.allocation||'sale';
      if(a==='sale'){ s.extra_sale+=act; s.revenue += act*priceForRecipe(rid); }
      else if(a==='internal') s.extra_internal+=act; else if(a==='marketing') s.extra_marketing+=act; }
    else if(l.log_type==='experimental'){ s.experimental+=act; }
    // batch KPI-ok (csak ahol van batch-adat)
    if(l.bake_minutes!=null){ s.bakeMinutesSum += Number(l.bake_minutes)||0; s.batchCount++; }
    if(l.oven_id!=null && l.trays_used!=null){ const oven=(R.equipment||[]).find(e=>e.id===l.oven_id);
      if(oven && oven.capacityTrays>0){ s.trayFillSum += (Number(l.trays_used)/oven.capacityTrays); s.trayFillN++; } }
    if(l.total_cost!=null) s.ingCost += Number(l.total_cost)||0;
  });
  // KPI-ok
  const totalExtra = s.extra_sale+s.extra_internal+s.extra_marketing;
  s.kpi = {
    fulfillment: s.ordered_planned>0 ? Math.round(s.baked/s.ordered_planned*100) : 0,
    wasteRate: (s.ordered_planned)>0 ? Math.round(s.waste/s.ordered_planned*100) : 0,
    extraUtil: totalExtra>0 ? Math.round(s.extra_sale/totalExtra*100) : 0,
    avgOvenFill: s.trayFillN>0 ? Math.round(s.trayFillSum/s.trayFillN*100) : null,
    avgBakeMin: s.batchCount>0 ? Math.round(s.bakeMinutesSum/s.batchCount) : null,
    operatingMin: s.bakeMinutesSum,
    batchCount: s.batchCount,
    margin: s.revenue - s.ingCost,
    marginPct: s.revenue>0 ? Math.round((s.revenue-s.ingCost)/s.revenue*100) : 0
  };
  s.dayCount = s.days.size;
  return s;
}

// ---- Elemzés nézet: hét / hónap / év ----
let _statsRange = 'month';
function _statsBounds(range){
  const now=new Date(); let from, to=new Date(now);
  if(range==='week'){ from=new Date(now); from.setDate(now.getDate()-7); }
  else if(range==='year'){ from=new Date(now.getFullYear(),0,1); }
  else { from=new Date(now.getFullYear(), now.getMonth(), 1); }
  const f=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return {from:f(from), to:f(to)};
}
async function renderProductionStats(range){
  if(range) _statsRange=range;
  const box=document.getElementById('prodstats-content'); if(!box) return;
  box.innerHTML='<p class="text-soft text-sm">Számítás…</p>';
  const {from,to}=_statsBounds(_statsRange);
  const s=await getProductionStats(from,to);
  const k=s.kpi;
  const tab=(id,lbl)=>`<button onclick="renderProductionStats('${id}')" style="padding:7px 16px;border:none;border-radius:8px;cursor:pointer;font-family:'Kodchasan',sans-serif;font-weight:${_statsRange===id?'700':'400'};background:${_statsRange===id?'var(--teal)':'#fff'};color:${_statsRange===id?'#fff':'var(--text)'};border:1px solid var(--border)">${lbl}</button>`;
  const kpiCard=(lbl,val,sub)=>`<div style="border:1px solid var(--border);border-radius:10px;padding:12px;background:#fff;min-width:130px;flex:1"><div style="font-size:0.72rem;color:var(--text-soft)">${lbl}</div><div style="font-size:1.4rem;font-weight:800;color:var(--teal-dark)">${val}</div>${sub?`<div style="font-size:0.68rem;color:var(--text-soft)">${sub}</div>`:''}</div>`;
  const topRecipes=Object.values(s.byRecipe).sort((a,b)=>(b.baked+b.extra)-(a.baked+a.extra)).slice(0,8);
  box.innerHTML=`
    <div style="display:flex;gap:6px;margin-bottom:14px">${tab('week','Hét')}${tab('month','Hónap')}${tab('year','Év')}<span style="align-self:center;font-size:0.75rem;color:var(--text-soft);margin-left:8px">${from} → ${to} · ${s.dayCount} sütési nap</span></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      ${kpiCard('Sütött', s.baked+' db', 'rendelt: '+s.ordered_planned)}
      ${kpiCard('Teljesítés', k.fulfillment+'%')}
      ${kpiCard('Selejt', s.waste+' db', k.wasteRate+'%')}
      ${kpiCard('Extra', (s.extra_sale+s.extra_internal+s.extra_marketing)+' db', '🛒'+s.extra_sale+' 🏠'+s.extra_internal+' 🎁'+s.extra_marketing)}
      ${kpiCard('Kísérleti', s.experimental+' db')}
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      ${kpiCard('Extra hasznosulás', k.extraUtil+'%', 'ebből eladva')}
      ${kpiCard('Átlag sütő-kihasználtság', k.avgOvenFill!=null?k.avgOvenFill+'%':'—', 'batch-adatból')}
      ${kpiCard('Átlag sütési idő', k.avgBakeMin!=null?k.avgBakeMin+' perc':'—')}
      ${kpiCard('Üzemi idő', Math.round(k.operatingMin/60*10)/10+' óra', k.batchCount+' batch')}
      ${kpiCard('Árrés', k.margin.toFixed(0)+' lej', k.marginPct+'%')}
    </div>
    <h4 style="color:var(--teal-dark);margin:0 0 8px">Top termékek</h4>
    ${topRecipes.length?topRecipes.map(r=>`<div style="display:flex;gap:8px;padding:5px 2px;border-bottom:0.5px solid var(--border);font-size:0.83rem"><span style="flex:1">${esc(r.name)}</span><span style="color:var(--text-soft)">sütött ${r.baked}${r.extra?' +extra '+r.extra:''}${r.test?' +teszt '+r.test:''}</span></div>`).join(''):'<p class="text-soft text-sm">Nincs adat a tartományban.</p>'}
    <p style="font-size:0.7rem;color:var(--text-soft);margin-top:10px">A sütő-KPI-ok (kihasználtság, sütési idő) csak a batch-tervezővel véglegesített sütésekből számítanak.</p>`;
}
if(typeof window!=='undefined'){ Object.assign(window,{getProductionStats, renderProductionStats}); }
