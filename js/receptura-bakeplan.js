// ===== receptura-bakeplan.js — Fázis C =====
// A visszaigazolt rendelésekből (napi receptenkénti db) sütés-ütemtervet készít:
// hőfok-csoportosítás (tűréssel) → tálcák bin-packingje sütés-ciklusokba →
// ciklusok elosztása a sütők között (párhuzamos) → idővonal + valós energia/idő/költség.

// --- Egy nap tervének kiszámítása ---
// dayPieces: { recipeId: pieces }
function buildBakePlan(dayPieces){
  const ovens = (typeof activeOvens === 'function') ? activeOvens() : [];
  const tol = Number(R.settings?.tempToleranceC) || 10;
  const duty = (typeof avgDutyFactor === 'function') ? avgDutyFactor() : 0.7;
  const elec = Number(R.settings?.electricity) || 0;
  const wage = Number(R.settings?.labor) || 0;
  const rate = (typeof shopRate === 'function') ? shopRate() : 0;
  const mixerKw = (typeof avgMixerPowerKw === 'function') ? avgMixerPowerKw() : 0;

  // 1) receptenkénti sütési tételek + a paraméter nélküliek külön
  const items = [];       // {recipe, pieces, trays, temp, bakeMin, traysPerCycle, mixerMin}
  const missing = [];     // batch-paraméter nélküli receptek
  let laborMin = 0, mixerKwh = 0;

  Object.keys(dayPieces).forEach(rid => {
    const pieces = dayPieces[rid]; if (!pieces) return;
    const recipe = (R.recipes||[]).find(r => r.id == rid);
    if (!recipe) return;
    const upt = Number(recipe.unitsPerTray) || 0;
    const bakeMin = Number(recipe.bakeMin) || 0;
    const temp = Number(recipe.bakeTempC) || 0;
    // munka minden receptre számít (akkor is, ha nem sül)
    laborMin += (Number(recipe.setupMin)||0) + (Number(recipe.perUnitMin)||0) * pieces;
    mixerKwh += ((Number(recipe.mixerMin)||0)/60) * mixerKw;
    if (!upt || !bakeMin || !temp){ missing.push({recipe, pieces}); return; }
    items.push({
      recipe, pieces,
      trays: Math.ceil(pieces / upt),
      temp, bakeMin,
      traysPerCycle: Number(recipe.traysPerCycle) || (ovens[0]?.capacityTrays || 1),
    });
  });

  // 2) hőfok-csoportosítás (növekvő hőfok, tűréshatáron belül egy csoport)
  items.sort((a,b) => a.temp - b.temp);
  const groups = [];
  items.forEach(it => {
    const g = groups.find(g => Math.abs(g.temp - it.temp) <= tol);
    if (g){ g.items.push(it); g.temp = (g.temp*g.n + it.temp)/(g.n+1); g.n++; }
    else groups.push({ temp: it.temp, n: 1, items: [it] });
  });

  // 3) bin-packing: minden csoport tálcáit ciklusokba (kapacitás + termék tálca/ciklus korlát)
  const capacity = ovens.length ? Math.max(...ovens.map(o => Number(o.capacityTrays)||0)) : 0;
  const cycles = [];   // {temp, slots:[{recipe,trays}], trays, bakeMin}
  groups.forEach(g => {
    // maradék tálcák termékenként
    const rem = g.items.map(it => ({...it, left: it.trays}));
    const maxBake = Math.max(...g.items.map(it => it.bakeMin)); // csoport sütési ideje = leghosszabb
    while (rem.some(r => r.left > 0)){
      const slot = { temp: Math.round(g.temp), slots: [], trays: 0, bakeMin: maxBake };
      for (const r of rem){
        if (r.left <= 0) continue;
        const room = capacity - slot.trays;
        if (room <= 0) break;
        const take = Math.min(r.left, r.traysPerCycle, room);
        if (take <= 0) continue;
        slot.slots.push({ recipe: r.recipe, trays: take });
        slot.trays += take; r.left -= take;
      }
      if (slot.trays === 0) break; // védelem
      cycles.push(slot);
    }
  });

  // 4) ciklusok elosztása a sütők között (round-robin, párhuzamos ágak)
  const ovenTracks = ovens.map(o => ({ oven: o, cycles: [], bakeMinSum: 0 }));
  cycles.forEach((cyc, i) => {
    if (!ovenTracks.length) return;
    // a legkevésbé terhelt sütőbe
    ovenTracks.sort((a,b) => a.bakeMinSum - b.bakeMinSum);
    ovenTracks[0].cycles.push(cyc);
    ovenTracks[0].bakeMinSum += cyc.bakeMin;
  });

  // 5) energia + idő + költség
  let ovenKwh = 0, preheatKwh = 0, usedTrayCap = 0, totalCap = 0;
  ovenTracks.forEach(t => {
    if (!t.cycles.length) return;
    const kw = Number(t.oven.powerKw)||0;
    t.cycles.forEach(c => { ovenKwh += (c.bakeMin/60) * kw * duty; usedTrayCap += c.trays; totalCap += capacity; });
    preheatKwh += Number(t.oven.preheatKwh)||0; // naponta 1× / használt sütő
  });
  const energyCost = (ovenKwh + preheatKwh + mixerKwh) * elec;
  const laborH = laborMin/60;
  const laborCost = laborH * wage;

  // falóra: a leghosszabb sütő-ág (előmelegítés + ciklusai), párhuzamos munkával
  const wallMinPerOven = ovenTracks.map(t => t.cycles.length
    ? (Number(t.oven.preheatMin)||0) + t.cycles.reduce((s,c)=>s+c.bakeMin,0) : 0);
  const bakeWallMin = wallMinPerOven.length ? Math.max(...wallMinPerOven) : 0;
  const wallH = Math.max(laborH, bakeWallMin/60);
  const overheadCost = wallH * rate;

  const utilization = totalCap > 0 ? (usedTrayCap/totalCap) : 0;

  return {
    ovenTracks, cycles, missing, groups,
    laborMin, laborH, laborCost,
    ovenKwh, preheatKwh, mixerKwh, energyCost,
    overheadCost, wallH, bakeWallMin, utilization,
    fixedCost: laborCost + energyCost + overheadCost,
    hasOvens: ovens.length > 0, capacity,
  };
}

// --- Idővonal-render (sütőnként vízszintes sáv) ---
function renderBakePlanTimeline(plan){
  if (!plan.hasOvens){
    return `<div style="padding:12px;background:var(--cream);border-radius:8px;font-size:0.82rem;color:var(--gold-dark)">
      ⚠️ Nincs sütő felvéve a Beállítások → 🔥 Eszközök alatt — a sütés-terv nem számítható.</div>`;
  }
  const colors = ['#0d9488','#c9a94e','#7c9885','#b08968','#6d8ea0','#a87c9f'];
  const recipeColor = {};
  let ci = 0;
  plan.cycles.forEach(c => c.slots.forEach(s => { if (recipeColor[s.recipe.id]==null) recipeColor[s.recipe.id]=colors[ci++ % colors.length]; }));

  const tracks = plan.ovenTracks.filter(t => t.cycles.length).map(t => {
    const totalMin = (Number(t.oven.preheatMin)||0) + t.cycles.reduce((s,c)=>s+c.bakeMin,0);
    const scale = totalMin > 0 ? 100/totalMin : 0;
    const preheatW = (Number(t.oven.preheatMin)||0) * scale;
    let blocks = preheatW>0 ? `<div title="Előmelegítés ${t.oven.preheatMin} p" style="width:${preheatW}%;background:repeating-linear-gradient(45deg,#ddd,#ddd 4px,#eee 4px,#eee 8px);display:flex;align-items:center;justify-content:center;font-size:0.6rem;color:#888">🔥</div>` : '';
    blocks += t.cycles.map(c => {
      const w = c.bakeMin * scale;
      const label = c.slots.map(s => `${s.recipe.name.slice(0,10)} (${s.trays}t)`).join(' + ');
      const col = recipeColor[c.slots[0].recipe.id] || '#0d9488';
      return `<div title="${label} · ${c.temp}°C · ${c.bakeMin}p" style="width:${w}%;background:${col};color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.62rem;padding:0 2px;overflow:hidden;white-space:nowrap;border-left:1px solid rgba(255,255,255,0.4)">${c.temp}° · ${c.trays}t</div>`;
    }).join('');
    return `
      <div style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;font-size:0.75rem;margin-bottom:2px">
          <b>${esc(t.oven.name)}</b><span style="color:var(--text-soft)">${t.cycles.length} sütés · ${Math.round(totalMin)} p</span></div>
        <div style="display:flex;height:26px;border-radius:5px;overflow:hidden;border:1px solid var(--border)">${blocks}</div>
      </div>`;
  }).join('');

  return tracks || '<div style="font-size:0.82rem;color:var(--text-soft)">Nincs sütnivaló ezen a napon.</div>';
}

// --- Egy nap teljes kártyája ---
function renderBakePlanDay(dateStr, dayPieces){
  const plan = buildBakePlan(dayPieces);
  const lej = n => (n||0).toFixed(2);
  const missingHtml = plan.missing.length
    ? `<div style="margin-top:8px;font-size:0.75rem;color:var(--gold-dark)">⚠️ Hiányzó batch-paraméter (nem ütemezve): ${plan.missing.map(m=>esc(m.recipe.name)).join(', ')}</div>` : '';

  return `
    <div style="border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px;background:#fff">
      <div style="font-family:'Fraunces',serif;font-weight:700;color:var(--teal-dark);margin-bottom:10px">🔥 ${dateStr} — sütés-terv</div>
      ${renderBakePlanTimeline(plan)}
      ${missingHtml}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-top:12px">
        <div style="background:var(--cream);border-radius:8px;padding:8px 10px"><div style="font-size:0.68rem;color:var(--text-soft)">Sütések</div><div style="font-weight:700">${plan.cycles.length}</div></div>
        <div style="background:var(--cream);border-radius:8px;padding:8px 10px"><div style="font-size:0.68rem;color:var(--text-soft)">Kihasználtság</div><div style="font-weight:700;color:${plan.utilization>=0.8?'var(--teal)':plan.utilization>=0.5?'var(--gold-dark)':'#b45309'}">${(plan.utilization*100).toFixed(0)}%</div></div>
        <div style="background:var(--cream);border-radius:8px;padding:8px 10px"><div style="font-size:0.68rem;color:var(--text-soft)">Sütő-idő (falóra)</div><div style="font-weight:700">${(plan.bakeWallMin/60).toFixed(1)} h</div></div>
        <div style="background:var(--cream);border-radius:8px;padding:8px 10px"><div style="font-size:0.68rem;color:var(--text-soft)">Energia</div><div style="font-weight:700">${(plan.ovenKwh+plan.preheatKwh+plan.mixerKwh).toFixed(1)} kWh</div></div>
      </div>
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);font-size:0.82rem">
        <div style="display:flex;justify-content:space-between"><span>Munka (${Math.round(plan.laborMin)} p)</span><span>${lej(plan.laborCost)} lej</span></div>
        <div style="display:flex;justify-content:space-between"><span>Energia (sütő+előmel.+mixer)</span><span>${lej(plan.energyCost)} lej</span></div>
        <div style="display:flex;justify-content:space-between"><span>Üzemi rezsi (${plan.wallH.toFixed(1)} h)</span><span>${lej(plan.overheadCost)} lej</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:700;color:var(--teal-dark);margin-top:4px;padding-top:4px;border-top:1px solid var(--border)"><span>Napi fix költség (alapanyag nélkül)</span><span>${lej(plan.fixedCost)} lej</span></div>
      </div>
    </div>`;
}

// --- Belépési pont: a production-prep dayBreakdown-jából ---
function renderBakePlans(dayBreakdown){
  const box = document.getElementById('bake-plan-result');
  if (!box) return;
  const days = Object.keys(dayBreakdown).filter(d => Object.keys(dayBreakdown[d]).length > 0).sort();
  if (!days.length){ box.innerHTML = ''; return; }
  box.innerHTML = `<h3 style="font-family:'Fraunces',serif;color:var(--teal-dark);margin:18px 0 10px">🗓️ Napi sütés-tervek</h3>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <div style="font-size:0.78rem;color:var(--text-soft)">Hőfok-tűrés: ${Number(R.settings?.tempToleranceC)||10} °C · a tűrésen belüli termékek együtt sülnek</div>
      <button class="btn btn-ghost btn-sm" onclick="openCostHelp()">ℹ️ Számítás</button>
    </div>
    ${days.map(d => renderBakePlanDay(d, dayBreakdown[d])).join('')}`;
}

if (typeof window !== 'undefined'){
  window.buildBakePlan = buildBakePlan;
  window.renderBakePlans = renderBakePlans;
  window.renderBakePlanDay = renderBakePlanDay;
}
