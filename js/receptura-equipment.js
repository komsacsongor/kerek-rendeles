// ===== receptura-equipment.js =====
// Eszköz-nyilvántartás (sütők, dagasztó, egyéb) + üzemi óradíj (shop rate).
// Új sütő vétele = új sor, NEM kell kód. A batch-alapú önköltség (calcCost) erre épül.

let editingEquipmentId = null;

// --- Segédfüggvények (calcCost is ezeket hívja) ---
function activeOvens(){ return (R.equipment||[]).filter(e => e.active !== false && e.type === 'oven'); }

// A sütők összesített tálcakapacitása egy sütésre
function totalOvenCapacity(){
  return activeOvens().reduce((s,e) => s + (Number(e.capacityTrays) || 0), 0);
}
// Átlagos sütő-teljesítmény (kW), a kapacitással súlyozva
function avgOvenPowerKw(){
  const ov = activeOvens();
  if (!ov.length) return 0;
  const totCap = totalOvenCapacity();
  if (!totCap) return ov.reduce((s,e)=>s+(Number(e.powerKw)||0),0) / ov.length;
  return ov.reduce((s,e)=> s + (Number(e.powerKw)||0) * (Number(e.capacityTrays)||0), 0) / totCap;
}
function avgDutyFactor(){
  const ov = activeOvens();
  if (!ov.length) return 0.7;
  return ov.reduce((s,e)=> s + (Number(e.dutyFactor) || 0.7), 0) / ov.length;
}
// Mixer/dagasztó átlagos teljesítménye (kW)
function avgMixerPowerKw(){
  const mx = (R.equipment||[]).filter(e => e.active !== false && e.type === 'mixer');
  if (!mx.length) return 0;
  return mx.reduce((s,e)=> s + (Number(e.powerKw)||0), 0) / mx.length;
}
// Üzemi óradíj: havi rezsi / havi termelő óra (mixer, világítás, elszívás, víz, amortizáció együtt)
function shopRate(){
  const oh = Number(R.settings?.monthlyOverhead) || 0;
  const h  = Number(R.settings?.monthlyProdHours) || 0;
  return h > 0 ? oh / h : 0;
}

// --- Nézet ---
function renderEquipment(){
  const box = document.getElementById('equipment-list');
  if (!box) return;
  const list = (R.equipment || []).slice().sort((a,b)=>(a.name||'').localeCompare(b.name||'','hu'));
  const rate = shopRate();

  const info = `<div style="background:var(--teal-pale);border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:0.78rem;color:var(--teal-dark)">
    ℹ️ A sütő a domináns, mérhető energiafogyasztó — ezt eszközönként vesszük fel.
    A mixer, világítás, elszívás, hűtés, víz és amortizáció az <b>üzemi óradíjba</b> megy (nem egyenként modellezzük).
    ${rate>0 ? `Jelenlegi üzemi óradíj: <b>${rate.toFixed(2)} lej/óra</b>` : '⚠️ Add meg a havi rezsit és a havi termelő órát az üzemi óradíjhoz.'}
  </div>`;

  if (!list.length){
    box.innerHTML = info + `<div style="padding:18px;text-align:center;color:var(--text-soft);font-size:0.85rem">
      Nincs eszköz felvéve. Sütő nélkül a régi (lapos) önköltség-képlet fut.
      <div style="margin-top:10px"><button class="btn btn-primary btn-sm" onclick="openEquipmentModal()">➕ Eszköz hozzáadása</button></div></div>`;
    return;
  }

  const rows = list.map(e => `
    <tr>
      <td style="padding:8px 10px;font-weight:600">${esc(e.name)}
        ${e.active===false?'<span style="font-size:0.7rem;color:var(--text-soft)"> (inaktív)</span>':''}</td>
      <td style="padding:8px 10px">${e.type==='oven'?'🔥 Sütő':e.type==='mixer'?'🌀 Dagasztó':'⚙️ Egyéb'}</td>
      <td style="padding:8px 10px;text-align:right">${Number(e.powerKw)||0} kW</td>
      <td style="padding:8px 10px;text-align:right">${e.type==='oven'?(Number(e.capacityTrays)||0)+' tálca':'—'}</td>
      <td style="padding:8px 10px;text-align:right">${e.type==='oven'?(Number(e.preheatMin)||0)+' p / '+(Number(e.preheatKwh)||0)+' kWh':'—'}</td>
      <td style="padding:8px 10px;text-align:right">
        <button class="btn btn-ghost btn-sm" onclick="openEquipmentModal(${e.id})">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="deleteEquipment(${e.id})">🗑</button>
      </td>
    </tr>`).join('');

  box.innerHTML = info + `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div style="font-size:0.82rem;color:var(--text-soft)">Összes sütő-kapacitás: <b>${totalOvenCapacity()} tálca</b> / sütés</div>
      <button class="btn btn-primary btn-sm" onclick="openEquipmentModal()">➕ Eszköz</button>
    </div>
    <div class="tbl-wrap"><table class="tbl" style="width:100%">
      <thead><tr>
        <th style="text-align:left">Név</th><th style="text-align:left">Típus</th>
        <th style="text-align:right">Telj.</th><th style="text-align:right">Kapacitás</th>
        <th style="text-align:right">Előmelegítés</th><th></th>
      </tr></thead><tbody>${rows}</tbody></table></div>`;
}

// --- Modal ---
function openEquipmentModal(id=null){
  editingEquipmentId = id;
  const e = id ? (R.equipment||[]).find(x=>x.id===id) : null;
  const ov = document.createElement('div'); ov.id='eq-overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(6,76,72,0.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  ov.innerHTML = `<div style="background:#fff;border-radius:14px;max-width:520px;width:100%;max-height:90vh;overflow:auto">
    <div style="background:var(--cream);padding:14px 18px;border-radius:14px 14px 0 0;border-bottom:1px solid var(--border);font-family:'Fraunces',serif;font-weight:700;color:var(--teal-dark)">
      ${e?'✏️ Eszköz szerkesztése':'➕ Új eszköz'}</div>
    <div style="padding:16px 18px">
      <div class="form-row">
        <div class="form-group" style="flex:2"><label>Név</label>
          <input type="text" id="eq-name" placeholder="Sütő 1" value="${e?esc(e.name||''):''}"></div>
        <div class="form-group"><label>Típus</label>
          <select id="eq-type" onchange="eqTypeChange()">
            <option value="oven" ${!e||e.type==='oven'?'selected':''}>🔥 Sütő</option>
            <option value="mixer" ${e&&e.type==='mixer'?'selected':''}>🌀 Dagasztó</option>
            <option value="other" ${e&&e.type==='other'?'selected':''}>⚙️ Egyéb</option>
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Teljesítmény (kW)</label>
          <input type="number" id="eq-power" step="0.1" min="0" placeholder="6" value="${e?(e.powerKw??''):''}"></div>
        <div class="form-group" id="eq-duty-wrap"><label>Kihasználtság (0–1)</label>
          <input type="number" id="eq-duty" step="0.05" min="0" max="1" placeholder="0.7" value="${e?(e.dutyFactor??0.7):0.7}"></div>
      </div>
      <div id="eq-oven-fields">
        <div class="form-row">
          <div class="form-group"><label>Kapacitás (tálca/sütés)</label>
            <input type="number" id="eq-capacity" step="1" min="0" placeholder="12" value="${e?(e.capacityTrays??''):''}"></div>
          <div class="form-group"><label>Előmelegítés (perc)</label>
            <input type="number" id="eq-preheat-min" step="1" min="0" placeholder="20" value="${e?(e.preheatMin??''):''}"></div>
          <div class="form-group"><label>Előmelegítés (kWh)</label>
            <input type="number" id="eq-preheat-kwh" step="0.1" min="0" placeholder="2" value="${e?(e.preheatKwh??''):''}"></div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Állapot</label>
          <select id="eq-active">
            <option value="true" ${!e||e.active!==false?'selected':''}>Aktív</option>
            <option value="false" ${e&&e.active===false?'selected':''}>Inaktív</option>
          </select></div>
        <div class="form-group" style="flex:2"><label>Megjegyzés</label>
          <input type="text" id="eq-notes" value="${e?esc(e.notes||''):''}"></div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button class="btn btn-ghost" onclick="closeEquipmentModal()">Mégse</button>
        <button class="btn btn-primary" id="eq-save" onclick="saveEquipment()">${e?'💾 Mentés':'➕ Hozzáadás'}</button>
      </div>
    </div></div>`;
  document.body.appendChild(ov);
  eqTypeChange();
}
function closeEquipmentModal(){ const o=document.getElementById('eq-overlay'); if(o) o.remove(); editingEquipmentId=null; }
function eqTypeChange(){
  const t = document.getElementById('eq-type')?.value;
  const box = document.getElementById('eq-oven-fields');
  if (box) box.style.display = (t === 'oven') ? 'block' : 'none';
}
async function saveEquipment(){
  const name = document.getElementById('eq-name')?.value?.trim();
  if (!name){ toast('A név kötelező', true); return; }
  const btn=document.getElementById('eq-save'); if(btn){ btn.disabled=true; btn.textContent='Mentés…'; }
  const data = {
    name,
    type: document.getElementById('eq-type')?.value || 'oven',
    power_kw: Number(document.getElementById('eq-power')?.value) || 0,
    capacity_trays: Number(document.getElementById('eq-capacity')?.value) || 0,
    preheat_min: Number(document.getElementById('eq-preheat-min')?.value) || 0,
    preheat_kwh: Number(document.getElementById('eq-preheat-kwh')?.value) || 0,
    duty_factor: Number(document.getElementById('eq-duty')?.value) || 0.7,
    active: document.getElementById('eq-active')?.value === 'true',
    notes: document.getElementById('eq-notes')?.value?.trim() || null,
  };
  try{
    if (editingEquipmentId){
      await kData.update('equipment', data, `id=eq.${editingEquipmentId}`);
      const i = R.equipment.findIndex(x=>x.id===editingEquipmentId);
      if (i>=0) R.equipment[i] = mapEquipmentDb({...data, id: editingEquipmentId});
    } else {
      const res = await kData.insert('equipment', data);
      const row = Array.isArray(res) ? res[0] : res;
      R.equipment = R.equipment || [];
      R.equipment.push(mapEquipmentDb(row || {...data, id: Date.now()}));
    }
    closeEquipmentModal();
    renderEquipment();
    toast('✅ Eszköz mentve.');
  }catch(err){
    toast('⚠️ Mentés sikertelen: '+err.message, true);
    if(btn){ btn.disabled=false; btn.textContent='Mentés'; }
  }
}
async function deleteEquipment(id){
  const e = (R.equipment||[]).find(x=>x.id===id);
  if (!confirm(`Biztosan törlöd: ${e?e.name:'eszköz'}?`)) return;
  try{
    await kData.delete('equipment', `id=eq.${id}`);
    R.equipment = (R.equipment||[]).filter(x=>x.id!==id);
    renderEquipment();
    toast('🗑 Eszköz törölve.');
  }catch(err){ toast('⚠️ Törlés sikertelen: '+err.message, true); }
}

function mapEquipmentDb(row){
  return {
    id: row.id,
    name: row.name,
    type: row.type || 'oven',
    powerKw: Number(row.power_kw) || 0,
    capacityTrays: Number(row.capacity_trays) || 0,
    preheatMin: Number(row.preheat_min) || 0,
    preheatKwh: Number(row.preheat_kwh) || 0,
    dutyFactor: row.duty_factor != null ? Number(row.duty_factor) : 0.7,
    active: row.active !== false,
    notes: row.notes || '',
  };
}

if (typeof window !== 'undefined'){
  window.renderEquipment = renderEquipment;
  window.openEquipmentModal = openEquipmentModal;
  window.closeEquipmentModal = closeEquipmentModal;
  window.saveEquipment = saveEquipment;
  window.deleteEquipment = deleteEquipment;
  window.eqTypeChange = eqTypeChange;
  window.mapEquipmentDb = mapEquipmentDb;
  window.shopRate = shopRate;
  window.totalOvenCapacity = totalOvenCapacity;
  window.avgOvenPowerKw = avgOvenPowerKw;
  window.avgDutyFactor = avgDutyFactor;
  window.avgMixerPowerKw = avgMixerPowerKw;
  window.activeOvens = activeOvens;
}
