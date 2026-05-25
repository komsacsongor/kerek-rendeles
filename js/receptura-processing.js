// =============================================================
// MALOM / FELDOLGOZÁS v2 — KEREK v2.34.0 (Session 3)
// 5 művelettípus: őrlés, áztatás, csíráztatás, fermentálás, szárítás
// Új táblák: processing_batches + processing_inputs + processing_outputs
// + ingredient_milling_profile (per-alapanyag yield referencia)
// =============================================================

// ===== STATE =====
let _processingBatches = [];     // processing_batches sorok
let _processingInputs = [];      // processing_inputs sorok
let _processingOutputs = [];     // processing_outputs sorok
let _millingProfiles = {};       // ingredient_id -> profile

const OPERATION_TYPES = {
  milling:    { label: '🌾 Őrlés',         color: '#064C48' },
  soaking:    { label: '💧 Áztatás',       color: '#0891b2' },
  sprouting:  { label: '🌱 Csíráztatás',   color: '#16a34a' },
  fermenting: { label: '🦠 Fermentálás',   color: '#a21caf' },
  drying:     { label: '☀️ Szárítás',      color: '#ea580c' }
};

// ===== INIT + LOAD =====
async function initProcessingView() {
  try {
    const [batches, inputs, outputs, profiles] = await Promise.all([
      sb.query('processing_batches', { order: 'date.desc', limit: 50 }).catch(() => []),
      sb.query('processing_inputs',  { limit: 500 }).catch(() => []),
      sb.query('processing_outputs', { limit: 500 }).catch(() => []),
      sb.query('ingredient_milling_profile', { limit: 200 }).catch(() => [])
    ]);
    _processingBatches = batches || [];
    _processingInputs = inputs || [];
    _processingOutputs = outputs || [];
    _millingProfiles = {};
    (profiles || []).forEach(p => { _millingProfiles[p.ingredient_id] = p; });
    renderProcessingList();
  } catch(e) {
    const el = document.getElementById('processing-list');
    if (el) el.innerHTML = '<p class="text-soft text-sm">⚠️ Betöltés sikertelen: ' + esc(e.message) + '</p>';
  }
}

// ===== RENDER =====
function renderProcessingList() {
  const el = document.getElementById('processing-list');
  if (!el) return;
  if (_processingBatches.length === 0) {
    el.innerHTML = '<p class="text-soft text-sm">Még nincs rögzített feldolgozás. Kattints az "Új feldolgozás" gombra.</p>';
    return;
  }
  el.innerHTML = _processingBatches.map(b => {
    const op = OPERATION_TYPES[b.operation_type] || OPERATION_TYPES.milling;
    const ins = _processingInputs.filter(x => x.batch_id === b.id);
    const outs = _processingOutputs.filter(x => x.batch_id === b.id);
    const inStr = ins.map(x => { const ing = getIng(x.ingredient_id); return (ing?.name || '?') + ': ' + Number(x.amount_g).toLocaleString('hu') + 'g'; }).join(', ');
    const outStr = outs.map(x => { const ing = getIng(x.ingredient_id); return (ing?.name || '?') + ': ' + Number(x.amount_g).toLocaleString('hu') + 'g'; }).join(', ');
    const yieldClass = b.yield_variance_pct == null ? '' :
      (Math.abs(b.yield_variance_pct) > 10 ? 'color:#dc2626' : (Math.abs(b.yield_variance_pct) > 5 ? 'color:#ea580c' : 'color:#16a34a'));
    const yieldText = b.yield_pct != null ? Number(b.yield_pct).toFixed(1) + '%' : '–';
    const expectedText = b.expected_yield_pct != null ? ' (várt: ' + Number(b.expected_yield_pct).toFixed(0) + '%)' : '';
    const glutenBadge = b.has_gluten_warning ? '<span style="background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px;font-size:0.7rem;margin-left:6px">⚠️ kontaminációs figyelmeztetés</span>' : '';

    return '<div style="padding:12px 0;border-bottom:1px solid var(--border)">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:6px">' +
        '<div>' +
          '<span style="font-weight:600;color:' + op.color + '">' + op.label + '</span> ' +
          '<span style="font-weight:600;color:var(--teal-dark);margin-left:4px">' + esc(b.date || '') + '</span>' +
          '<span style="font-size:0.7rem;color:var(--text-soft);margin-left:6px">' + esc(b.batch_code || '') + '</span>' +
          glutenBadge +
        '</div>' +
        '<span style="font-size:0.8rem;color:var(--text-soft)">' +
          (b.labor_minutes || 0) + ' perc · ' +
          Number(b.total_cost || 0).toFixed(2) + ' lej · ' +
          'yield: <b style="' + yieldClass + '">' + yieldText + '</b>' + expectedText +
        '</span>' +
      '</div>' +
      (inStr ? '<div style="font-size:0.82rem;color:var(--text-soft)">📥 <b>Bemenet:</b> ' + esc(inStr) + '</div>' : '') +
      (outStr ? '<div style="font-size:0.82rem;color:var(--teal-dark);margin-top:2px">📤 <b>Kimenet:</b> ' + esc(outStr) + '</div>' : '') +
      (b.notes ? '<div style="font-size:0.78rem;color:var(--text-soft);margin-top:2px;font-style:italic">' + esc(b.notes) + '</div>' : '') +
    '</div>';
  }).join('');
}

// ===== MODAL OPEN =====
function openProcessingModal() {
  let modal = document.getElementById('processing-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'processing-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow-y:auto';
    document.body.appendChild(modal);
  }

  // Operation selector
  const opOptions = Object.entries(OPERATION_TYPES).map(([key, val]) =>
    '<option value="' + key + '">' + val.label + '</option>'
  ).join('');

  modal.innerHTML =
    '<div style="background:white;border-radius:16px;padding:20px;width:100%;max-width:620px;margin:auto">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
        '<h3 style="font-family:\'Fraunces\',serif;color:var(--teal-dark);margin:0">🏭 Új feldolgozás</h3>' +
        '<button data-action="closeProcessingModal" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:var(--text-soft)">✕</button>' +
      '</div>' +

      '<div style="margin-bottom:14px">' +
        '<label style="font-size:0.82rem;font-weight:600;color:var(--teal-dark);display:block;margin-bottom:4px">Művelet típusa</label>' +
        '<select id="proc-operation" style="width:100%;padding:9px;border:1.5px solid var(--border);border-radius:8px;font-family:\'Kodchasan\',sans-serif">' + opOptions + '</select>' +
      '</div>' +

      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">' +
        '<div>' +
          '<label style="font-size:0.82rem;font-weight:600;color:var(--teal-dark);display:block;margin-bottom:4px">Dátum</label>' +
          '<input type="date" id="proc-date" value="' + new Date().toISOString().slice(0,10) + '" style="width:100%;padding:8px;border:1.5px solid var(--border);border-radius:8px;font-family:\'Kodchasan\',sans-serif;box-sizing:border-box">' +
        '</div>' +
        '<div>' +
          '<label style="font-size:0.82rem;font-weight:600;color:var(--teal-dark);display:block;margin-bottom:4px">Munkaidő (perc)</label>' +
          '<input type="number" id="proc-labor" min="0" value="30" style="width:100%;padding:8px;border:1.5px solid var(--border);border-radius:8px;font-family:\'Kodchasan\',sans-serif;box-sizing:border-box">' +
        '</div>' +
      '</div>' +

      // CROSS-CONTAMINATION WARNING
      '<div id="contamination-warning" style="display:none;background:#fee2e2;border-left:4px solid #dc2626;padding:10px 14px;margin-bottom:14px;border-radius:6px;font-size:0.85rem">' +
        '<b style="color:#991b1b">⚠️ Kontaminációs figyelmeztetés</b><br>' +
        '<span id="contamination-text" style="color:#7f1d1d"></span>' +
        '<label style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:0.82rem;color:#7f1d1d">' +
          '<input type="checkbox" id="proc-clean-confirm"> Megerősítem, hogy a malom és minden szerszám alaposan tisztítva lett.' +
        '</label>' +
      '</div>' +

      // INPUTS
      '<div style="margin-bottom:14px">' +
        '<div style="font-size:0.82rem;font-weight:700;color:var(--teal-dark);margin-bottom:8px">📥 Bemenetek</div>' +
        '<div id="proc-inputs"></div>' +
        '<button data-action="addProcRow" data-arg1="proc-inputs" data-arg2="true" class="btn btn-ghost btn-sm" style="margin-top:4px">+ Bemenet hozzáadása</button>' +
      '</div>' +

      // OUTPUTS
      '<div style="margin-bottom:14px">' +
        '<div style="font-size:0.82rem;font-weight:700;color:var(--teal-dark);margin-bottom:8px">📤 Kimenetek</div>' +
        '<div id="proc-outputs"></div>' +
        '<button data-action="addProcRow" data-arg1="proc-outputs" data-arg2="false" class="btn btn-ghost btn-sm" style="margin-top:4px">+ Kimenet hozzáadása</button>' +
        '<div style="font-size:0.72rem;color:var(--text-soft);margin-top:4px">Az ár% opcionális — üresen hagyva arányos elosztás (gramm szerint).</div>' +
      '</div>' +

      // YIELD PREVIEW
      '<div id="proc-yield-preview" style="background:var(--bg-soft);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:0.82rem;color:var(--text-soft)">' +
        '<i>Add meg a bemeneteket és kimeneteket a yield kalkulátorhoz.</i>' +
      '</div>' +

      '<div style="margin-bottom:14px">' +
        '<label style="font-size:0.82rem;font-weight:600;color:var(--teal-dark);display:block;margin-bottom:4px">Megjegyzés / minőség (opcionális)</label>' +
        '<input type="text" id="proc-notes" placeholder="pl. finom őrlés 0.5mm szita, nedvesség 12%" style="width:100%;padding:8px;border:1.5px solid var(--border);border-radius:8px;font-family:\'Kodchasan\',sans-serif;box-sizing:border-box">' +
      '</div>' +

      '<button data-action="saveProcessingBatch" class="btn btn-primary" style="width:100%">' +
        '✅ Feldolgozás rögzítése + készletre vétel' +
      '</button>' +
    '</div>';

  // Initial render: 1 input + 1 output
  addProcRow('proc-inputs', 'true');
  addProcRow('proc-outputs', 'false');

  // Wire up listeners for live yield calc + contamination warning
  modal.querySelector('#proc-operation').addEventListener('change', updateContaminationWarning);
  checkContaminationOnIngredientChange();
  updateYieldPreview();

  modal.style.display = 'flex';
}

function closeProcessingModal() {
  const m = document.getElementById('processing-modal');
  if (m) m.style.display = 'none';
}

// ===== ADD INPUT/OUTPUT ROW =====
function addProcRow(containerId, isInputStr) {
  const isInput = isInputStr === 'true' || isInputStr === true;
  const container = document.getElementById(containerId);
  if (!container) return;
  const ingOptions = R.ingredients
    .filter(i => i.subType !== 'starter')
    .sort((a,b) => a.name.localeCompare(b.name))
    .map(i => '<option value="' + i.id + '">' + esc(i.name) + '</option>').join('');
  const row = document.createElement('div');
  row.className = isInput ? 'proc-input-row' : 'proc-output-row';
  row.style.cssText = 'display:flex;gap:6px;margin-bottom:6px';
  row.innerHTML =
    '<select class="proc-ing-select" style="flex:2;padding:7px;border:1.5px solid var(--border);border-radius:8px;font-family:\'Kodchasan\',sans-serif;font-size:0.82rem">' + ingOptions + '</select>' +
    '<input type="number" class="proc-qty" placeholder="g" min="0" style="flex:1;padding:7px;border:1.5px solid var(--border);border-radius:8px;font-family:\'Kodchasan\',sans-serif">' +
    (!isInput ?
      '<input type="number" class="proc-cost-ratio" placeholder="ár%" min="0" max="100" style="flex:1;padding:7px;border:1.5px solid var(--border);border-radius:8px;font-family:\'Kodchasan\',sans-serif">' +
      '<select class="proc-destination" style="flex:1.2;padding:7px;border:1.5px solid var(--border);border-radius:8px;font-family:\'Kodchasan\',sans-serif;font-size:0.78rem">' +
        '<option value="stock">📦 Készletre</option>' +
        '<option value="product">🛍️ Termék</option>' +
      '</select>'
      : '') +
    '<button data-action="removeProcRow" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:1.1rem;padding:0 6px">✕</button>';
  container.appendChild(row);
  // Wire live updates
  row.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('input', updateYieldPreview);
    el.addEventListener('change', updateYieldPreview);
  });
  if (isInput) {
    row.querySelector('.proc-ing-select').addEventListener('change', checkContaminationOnIngredientChange);
  }
}

function removeProcRow(e) {
  // Triggered from delegation: e is the data-action handler param... but our delegator passes args from data-*
  // So this function gets called with no args. Use event.target.
  const btn = window.event?.target || document.activeElement;
  if (btn?.parentElement) btn.parentElement.remove();
  updateYieldPreview();
}

// ===== LIVE YIELD PREVIEW =====
function updateYieldPreview() {
  const previewEl = document.getElementById('proc-yield-preview');
  if (!previewEl) return;
  let totalIn = 0, totalOut = 0;
  let inputCost = 0;
  let firstInputIng = null;

  document.querySelectorAll('#proc-inputs .proc-input-row').forEach(row => {
    const ingId = parseInt(row.querySelector('.proc-ing-select')?.value || 0);
    const qty = parseFloat(row.querySelector('.proc-qty')?.value) || 0;
    if (qty <= 0) return;
    totalIn += qty;
    const ing = getIng(ingId);
    if (ing) {
      if (!firstInputIng) firstInputIng = ing;
      inputCost += getFifoPrice(ing) * qty;
    }
  });
  document.querySelectorAll('#proc-outputs .proc-output-row').forEach(row => {
    const qty = parseFloat(row.querySelector('.proc-qty')?.value) || 0;
    totalOut += qty;
  });

  const laborMin = parseInt(document.getElementById('proc-labor')?.value) || 0;
  const laborCostPerH = (R.settings?.financialSettings?.laborCostPerHour || 55);
  const laborCost = (laborMin / 60) * laborCostPerH;
  const totalCost = inputCost + laborCost;

  if (totalIn <= 0) {
    previewEl.innerHTML = '<i>Add meg a bemeneteket és kimeneteket a yield kalkulátorhoz.</i>';
    return;
  }

  const yieldPct = totalOut > 0 ? (totalOut / totalIn) * 100 : 0;
  const lossG = totalIn - totalOut;
  const lossPct = (lossG / totalIn) * 100;
  const costPerG = totalOut > 0 ? totalCost / totalOut : 0;

  // Compare to expected yield from milling profile (first input ingredient)
  let expectedYield = null;
  let expectedRange = '';
  if (firstInputIng && _millingProfiles[firstInputIng.id]) {
    const profile = _millingProfiles[firstInputIng.id];
    expectedYield = (profile.expected_yield_pct_min + profile.expected_yield_pct_max) / 2;
    expectedRange = ' (várt: ' + profile.expected_yield_pct_min + '–' + profile.expected_yield_pct_max + '%)';
  }
  const variance = expectedYield != null ? yieldPct - expectedYield : null;
  let yieldStyle = '';
  let warningMsg = '';
  if (variance != null) {
    if (Math.abs(variance) > 10) {
      yieldStyle = 'color:#dc2626;font-weight:700';
      warningMsg = '<div style="color:#dc2626;font-size:0.78rem;margin-top:4px">⚠️ Jelentősen eltér a várt yield-től (' + (variance > 0 ? '+' : '') + variance.toFixed(1) + '%) — ellenőrizd a beállításokat</div>';
    } else if (Math.abs(variance) > 5) {
      yieldStyle = 'color:#ea580c;font-weight:600';
    } else {
      yieldStyle = 'color:#16a34a;font-weight:600';
    }
  }

  previewEl.innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;color:var(--text-strong)">' +
      '<div>📥 Bemenet: <b>' + totalIn.toLocaleString('hu') + 'g</b></div>' +
      '<div>📤 Kimenet: <b>' + totalOut.toLocaleString('hu') + 'g</b></div>' +
      '<div>💧 Veszteség: <b>' + lossG.toLocaleString('hu') + 'g (' + lossPct.toFixed(1) + '%)</b></div>' +
      '<div>📊 Yield: <span style="' + yieldStyle + '">' + yieldPct.toFixed(1) + '%</span>' + expectedRange + '</div>' +
      '<div>⏱ Munka: ' + laborCost.toFixed(2) + ' lej</div>' +
      '<div>💰 Önköltség: <b>' + totalCost.toFixed(2) + ' lej</b> (' + costPerG.toFixed(3) + ' lej/g)</div>' +
    '</div>' + warningMsg;
}

// ===== CROSS-CONTAMINATION CHECK =====
function checkContaminationOnIngredientChange() {
  updateContaminationWarning();
  updateYieldPreview();
}

function updateContaminationWarning() {
  const warningEl = document.getElementById('contamination-warning');
  const textEl = document.getElementById('contamination-text');
  if (!warningEl || !textEl) return;

  // Get current first input ingredient
  const firstSelect = document.querySelector('#proc-inputs .proc-ing-select');
  const currentIngId = firstSelect ? parseInt(firstSelect.value) : null;
  if (!currentIngId) { warningEl.style.display = 'none'; return; }

  const currentIng = getIng(currentIngId);
  if (!currentIng) { warningEl.style.display = 'none'; return; }
  const currentProfile = _millingProfiles[currentIngId];
  const currentIsGF = currentProfile?.is_gluten_free !== false; // default true

  // Find latest batch and check its gluten status
  const lastBatch = _processingBatches[0]; // already sorted desc by date
  if (!lastBatch) { warningEl.style.display = 'none'; return; }

  const lastInputs = _processingInputs.filter(x => x.batch_id === lastBatch.id);
  if (lastInputs.length === 0) { warningEl.style.display = 'none'; return; }
  const lastIngId = lastInputs[0].ingredient_id;
  const lastProfile = _millingProfiles[lastIngId];
  const lastIsGF = lastProfile?.is_gluten_free !== false;

  if (currentIsGF !== lastIsGF) {
    const lastIng = getIng(lastIngId);
    textEl.innerHTML = 'Előző batch: <b>' + esc(lastIng?.name || '?') + '</b> (' +
      (lastIsGF ? 'GM' : 'gluténos') + '), most: <b>' + esc(currentIng.name) + '</b> (' +
      (currentIsGF ? 'GM' : 'gluténos') + '). Tisztítsd a malmot és minden eszközt mielőtt folytatod!';
    warningEl.style.display = 'block';
  } else {
    warningEl.style.display = 'none';
  }
}

// ===== SAVE =====
async function saveProcessingBatch() {
  const date = document.getElementById('proc-date')?.value;
  const operation = document.getElementById('proc-operation')?.value || 'milling';
  const laborMin = parseInt(document.getElementById('proc-labor')?.value) || 0;
  const notes = document.getElementById('proc-notes')?.value?.trim() || '';
  const cleanConfirm = document.getElementById('proc-clean-confirm')?.checked || false;
  const contaminationVisible = document.getElementById('contamination-warning')?.style.display !== 'none';

  if (!date) { toast('⚠️ Adj meg dátumot!', true); return; }

  // Collect inputs
  const inputs = [];
  let totalInputCost = 0;
  let totalInputG = 0;
  let firstInputIngId = null;
  document.querySelectorAll('#proc-inputs .proc-input-row').forEach(row => {
    const ingId = parseInt(row.querySelector('.proc-ing-select')?.value || 0);
    const qty = parseFloat(row.querySelector('.proc-qty')?.value) || 0;
    if (!ingId || qty <= 0) return;
    if (!firstInputIngId) firstInputIngId = ingId;
    const ing = getIng(ingId);
    const pricePerG = getFifoPrice(ing);
    const cost = pricePerG * qty;
    totalInputCost += cost;
    totalInputG += qty;
    inputs.push({ ingredient_id: ingId, amount_g: qty, unit_cost: pricePerG });
  });
  if (inputs.length === 0) { toast('⚠️ Adj meg legalább egy bemenetet!', true); return; }

  // Collect outputs
  const outputs = [];
  let totalOutputG = 0;
  let usedCostRatioSum = 0;
  document.querySelectorAll('#proc-outputs .proc-output-row').forEach(row => {
    const ingId = parseInt(row.querySelector('.proc-ing-select')?.value || 0);
    const qty = parseFloat(row.querySelector('.proc-qty')?.value) || 0;
    const costRatio = parseFloat(row.querySelector('.proc-cost-ratio')?.value) || 0;
    const destination = row.querySelector('.proc-destination')?.value || 'stock';
    if (!ingId || qty <= 0) return;
    outputs.push({ ingredient_id: ingId, amount_g: qty, cost_ratio: costRatio || null, destination });
    totalOutputG += qty;
    if (costRatio > 0) usedCostRatioSum += costRatio;
  });
  if (outputs.length === 0) { toast('⚠️ Adj meg legalább egy kimenetet!', true); return; }

  // Block save if contamination warning shown but not confirmed
  if (contaminationVisible && !cleanConfirm) {
    toast('⚠️ Erősítsd meg a malom tisztítását mielőtt mentesz!', true);
    return;
  }

  // Calculate yield + variance
  const laborCostPerH = (R.settings?.financialSettings?.laborCostPerHour || 55);
  const laborCost = (laborMin / 60) * laborCostPerH;
  const totalCost = totalInputCost + laborCost;
  const yieldPct = (totalOutputG / totalInputG) * 100;
  const lossG = totalInputG - totalOutputG;
  const lossPct = (lossG / totalInputG) * 100;
  const costPerG = totalCost / totalOutputG;

  // Expected yield from profile
  let expectedYield = null;
  if (firstInputIngId && _millingProfiles[firstInputIngId]) {
    const p = _millingProfiles[firstInputIngId];
    expectedYield = (p.expected_yield_pct_min + p.expected_yield_pct_max) / 2;
  }
  const yieldVariance = expectedYield != null ? yieldPct - expectedYield : null;

  // Distribute cost across outputs: explicit ratio first, rest proportional by weight
  const explicitCost = totalCost * (usedCostRatioSum / 100);
  const remainingCost = totalCost - explicitCost;
  const unassignedG = outputs.filter(o => !o.cost_ratio).reduce((s, o) => s + o.amount_g, 0);
  outputs.forEach(o => {
    if (o.cost_ratio) {
      o.assigned_cost = totalCost * (o.cost_ratio / 100);
    } else if (unassignedG > 0) {
      o.assigned_cost = remainingCost * (o.amount_g / unassignedG);
    } else {
      o.assigned_cost = 0;
    }
    o.price_per_g = o.amount_g > 0 ? o.assigned_cost / o.amount_g : 0;
  });

  // Generate batch code
  const opPrefix = { milling: 'MILL', soaking: 'SOAK', sprouting: 'SPROUT', fermenting: 'FERM', drying: 'DRY' }[operation];
  const datePart = date.replace(/-/g, '').slice(0, 8);
  const seqCount = _processingBatches.filter(b => b.date === date).length + 1;
  const batchCode = opPrefix + '-' + datePart + '-' + String(seqCount).padStart(3, '0');

  // Detect contamination warning at save-time (for has_gluten_warning flag)
  let hasGlutenWarning = false;
  if (firstInputIngId && _processingBatches.length > 0) {
    const lastInputs = _processingInputs.filter(x => x.batch_id === _processingBatches[0].id);
    if (lastInputs.length > 0) {
      const lastProfile = _millingProfiles[lastInputs[0].ingredient_id];
      const currProfile = _millingProfiles[firstInputIngId];
      const lastGF = lastProfile?.is_gluten_free !== false;
      const currGF = currProfile?.is_gluten_free !== false;
      if (lastGF !== currGF) hasGlutenWarning = true;
    }
  }

  try {
    // 1. Insert processing_batches
    const batchRow = await sb.insert('processing_batches', {
      batch_code: batchCode,
      operation_type: operation,
      date: date,
      labor_minutes: laborMin,
      notes: notes || null,
      total_input_g: totalInputG,
      total_output_g: totalOutputG,
      loss_g: lossG,
      loss_pct: lossPct,
      yield_pct: yieldPct,
      expected_yield_pct: expectedYield,
      yield_variance_pct: yieldVariance,
      total_cost: totalCost,
      cost_per_g_output: costPerG,
      previous_batch_id: _processingBatches[0]?.id || null,
      is_clean_session: cleanConfirm || !contaminationVisible,
      has_gluten_warning: hasGlutenWarning,
      status: 'completed',
      completed_at: new Date().toISOString()
    });
    const batchId = batchRow?.[0]?.id;
    if (!batchId) throw new Error('Batch ID nem jött vissza');

    // 2. Insert processing_inputs
    const inputRows = inputs.map(i => ({
      batch_id: batchId,
      ingredient_id: i.ingredient_id,
      amount_g: i.amount_g,
      unit_cost: i.unit_cost
    }));
    await sb.insert('processing_inputs', inputRows);

    // 3. Deduct inputs from ingredient_batches (FIFO) — like the old code
    for (const inp of inputs) {
      let rem = inp.amount_g;
      const batches = R.batches.filter(b => b.ingredientId === inp.ingredient_id && b.qtyRemainingG > 0)
        .sort((a,b) => (a.receivedDate || '').localeCompare(b.receivedDate || ''));
      for (const batch of batches) {
        if (rem <= 0) break;
        const take = Math.min(rem, batch.qtyRemainingG);
        batch.qtyRemainingG -= take;
        rem -= take;
        if (batch.id) {
          try { await sb.update('ingredient_batches', { qty_remaining_g: Math.max(0, batch.qtyRemainingG) }, 'id=eq.' + batch.id); }
          catch(e) { console.warn('FIFO update fail:', e.message); }
        }
      }
      const ing = getIng(inp.ingredient_id);
      if (ing) ing.totalStockG = Math.max(0, (ing.totalStockG || 0) - inp.amount_g);
    }

    // 4. Insert processing_outputs + ingredient_batches (FIFO) for destination=stock
    for (const o of outputs) {
      let resultingBatchId = null;
      if (o.destination === 'stock') {
        const newBatch = await sb.insert('ingredient_batches', {
          ingredient_id: o.ingredient_id,
          received_date: date,
          qty_received_g: o.amount_g,
          qty_remaining_g: o.amount_g,
          price_per_g: o.price_per_g,
          price_gross_per_unit: o.assigned_cost,
          package_size_g: o.amount_g,
          supplier_name: 'Saját feldolgozás',
          source_type: 'processing',
          notes: 'Batch: ' + batchCode + (notes ? ' · ' + notes : '')
        });
        resultingBatchId = newBatch?.[0]?.id;
        // Update local R.batches
        if (!R.batches) R.batches = [];
        R.batches.push({
          id: resultingBatchId,
          ingredientId: o.ingredient_id,
          receivedDate: date,
          qtyReceivedG: o.amount_g,
          qtyRemainingG: o.amount_g,
          pricePerG: o.price_per_g,
          supplierName: 'Saját feldolgozás',
          sourceType: 'processing'
        });
        const ing = getIng(o.ingredient_id);
        if (ing) ing.totalStockG = (ing.totalStockG || 0) + o.amount_g;
      }
      await sb.insert('processing_outputs', {
        batch_id: batchId,
        ingredient_id: o.ingredient_id,
        amount_g: o.amount_g,
        destination: o.destination,
        product_id: o.destination === 'product' ? null : null,  // TODO: product picker later
        resulting_batch_id: resultingBatchId,
        notes: null
      });
    }

    // Reload + close
    closeProcessingModal();
    toast('✅ Feldolgozás rögzítve! ' + batchCode + ' (' + yieldPct.toFixed(1) + '% yield, ' + totalCost.toFixed(2) + ' lej)');
    await initProcessingView();
    if (typeof renderStock === 'function') renderStock();
  } catch(e) {
    console.error('saveProcessingBatch error:', e);
    toast('⚠️ Hiba a mentés során: ' + e.message, true);
  }
}

// ===== MILLING PROFILE ADMIN (egyszerű UI - per-alapanyag) =====
async function openMillingProfileEditor(ingredientId) {
  const ing = getIng(ingredientId);
  if (!ing) return;
  const profile = _millingProfiles[ingredientId] || {
    ingredient_id: ingredientId,
    is_hulled: false,
    is_gluten_free: true,
    expected_yield_pct_min: 95,
    expected_yield_pct_max: 100,
    notes: ''
  };

  let modal = document.getElementById('milling-profile-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'milling-profile-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    document.body.appendChild(modal);
  }
  modal.innerHTML =
    '<div style="background:white;border-radius:16px;padding:20px;width:100%;max-width:440px">' +
      '<h3 style="font-family:\'Fraunces\',serif;color:var(--teal-dark);margin:0 0 12px">🧬 Malmolási profil — ' + esc(ing.name) + '</h3>' +

      '<div style="margin-bottom:12px;display:flex;gap:16px">' +
        '<label style="display:flex;align-items:center;gap:6px;font-size:0.85rem;cursor:pointer">' +
          '<input type="checkbox" id="mp-hulled" ' + (profile.is_hulled ? 'checked' : '') + '> Hántolt mag' +
        '</label>' +
        '<label style="display:flex;align-items:center;gap:6px;font-size:0.85rem;cursor:pointer">' +
          '<input type="checkbox" id="mp-gf" ' + (profile.is_gluten_free !== false ? 'checked' : '') + '> Gluténmentes' +
        '</label>' +
      '</div>' +

      '<div style="margin-bottom:12px">' +
        '<label style="font-size:0.82rem;font-weight:600;color:var(--teal-dark);display:block;margin-bottom:4px">Várható yield tartomány (%)</label>' +
        '<div style="display:flex;gap:8px;align-items:center">' +
          '<input type="number" id="mp-yield-min" min="0" max="100" step="0.1" value="' + profile.expected_yield_pct_min + '" style="flex:1;padding:8px;border:1.5px solid var(--border);border-radius:8px;font-family:\'Kodchasan\',sans-serif">' +
          '<span style="color:var(--text-soft)">–</span>' +
          '<input type="number" id="mp-yield-max" min="0" max="100" step="0.1" value="' + profile.expected_yield_pct_max + '" style="flex:1;padding:8px;border:1.5px solid var(--border);border-radius:8px;font-family:\'Kodchasan\',sans-serif">' +
          '<span style="color:var(--text-soft)">%</span>' +
        '</div>' +
        '<div style="font-size:0.72rem;color:var(--text-soft);margin-top:4px">Hántolt GM mag: kb. 95–100% · búza fehér liszt: 70–75% · teljes kiőrlésű: 95–100%</div>' +
      '</div>' +

      '<div style="margin-bottom:14px">' +
        '<label style="font-size:0.82rem;font-weight:600;color:var(--teal-dark);display:block;margin-bottom:4px">Megjegyzés</label>' +
        '<textarea id="mp-notes" rows="2" placeholder="pl. olajos mag, fajsúly nő őrlésnél" style="width:100%;padding:8px;border:1.5px solid var(--border);border-radius:8px;font-family:\'Kodchasan\',sans-serif;box-sizing:border-box;resize:vertical">' + esc(profile.notes || '') + '</textarea>' +
      '</div>' +

      '<div style="display:flex;gap:8px">' +
        '<button data-action="closeMillingProfile" style="flex:1;padding:9px;border:1.5px solid var(--border);background:white;border-radius:8px;cursor:pointer;font-family:\'Kodchasan\',sans-serif">Mégse</button>' +
        '<button data-action="saveMillingProfile" data-arg1="' + ingredientId + '" style="flex:2;padding:9px;border:none;background:var(--teal-dark);color:white;border-radius:8px;cursor:pointer;font-family:\'Kodchasan\',sans-serif;font-weight:600">💾 Mentés</button>' +
      '</div>' +
    '</div>';
  modal.style.display = 'flex';
}

function closeMillingProfile() {
  const m = document.getElementById('milling-profile-modal');
  if (m) m.style.display = 'none';
}

async function saveMillingProfile(ingredientId) {
  const id = parseInt(ingredientId);
  const profile = {
    ingredient_id: id,
    is_hulled: document.getElementById('mp-hulled')?.checked || false,
    is_gluten_free: document.getElementById('mp-gf')?.checked !== false,
    expected_yield_pct_min: parseFloat(document.getElementById('mp-yield-min')?.value) || 95,
    expected_yield_pct_max: parseFloat(document.getElementById('mp-yield-max')?.value) || 100,
    notes: document.getElementById('mp-notes')?.value?.trim() || null,
    updated_at: new Date().toISOString()
  };
  if (profile.expected_yield_pct_min > profile.expected_yield_pct_max) {
    toast('⚠️ Min nem lehet nagyobb mint max!', true);
    return;
  }
  try {
    await sb.upsert('ingredient_milling_profile', profile, 'ingredient_id');
    _millingProfiles[id] = profile;
    closeMillingProfile();
    toast('✅ Profil mentve!');
    // Re-render ingredient list if open
    if (typeof renderIngredients === 'function') renderIngredients();
  } catch(e) {
    toast('⚠️ Hiba: ' + e.message, true);
  }
}

// Helper: getter for ingredient profile (used by other modules)
function getMillingProfile(ingredientId) {
  return _millingProfiles[ingredientId] || null;
}
