// ===== MALOM / FELDOLGOZÁS MODUL =====

let _processingLogs = [];

async function initProcessingView() {
  try {
    _processingLogs = await sb.query('ingredient_processing', {
      order: 'date.desc', limit: 100
    }) || [];
    renderProcessingList();
  } catch(e) {
    document.getElementById('processing-list').innerHTML =
      '<p class="text-soft text-sm">⚠️ Betöltés sikertelen: ' + e.message + '</p>';
  }
}

function renderProcessingList() {
  const el = document.getElementById('processing-list');
  if (!el) return;
  if (_processingLogs.length === 0) {
    el.innerHTML = '<p class="text-soft text-sm">Még nincs rögzített feldolgozás.</p>';
    return;
  }
  el.innerHTML = _processingLogs.map(log => {
    const inputs = (typeof log.inputs === 'string' ? JSON.parse(log.inputs) : log.inputs) || [];
    const outputs = (typeof log.outputs === 'string' ? JSON.parse(log.outputs) : log.outputs) || [];
    const inputStr = inputs.map(i => {
      const ing = getIng(i.ingredient_id);
      return `${ing?.name || '?'}: ${i.qty_g?.toLocaleString()}g`;
    }).join(', ');
    const outputStr = outputs.map(o => {
      const ing = getIng(o.ingredient_id);
      return `${ing?.name || '?'}: ${o.qty_g?.toLocaleString()}g`;
    }).join(', ');
    const totalCost = (log.total_input_cost || 0).toFixed(2);
    return `<div style="padding:12px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-weight:600;color:var(--teal-dark)">${log.date}</span>
        <span style="font-size:0.8rem;color:var(--text-soft)">${log.labor_minutes || 0} perc · ${totalCost} lej önköltség</span>
      </div>
      <div style="font-size:0.82rem;color:var(--text-soft)">📥 <b>Bemenet:</b> ${esc(inputStr)}</div>
      <div style="font-size:0.82rem;color:var(--teal-dark);margin-top:2px">📤 <b>Kimenet:</b> ${esc(outputStr)}</div>
      ${log.notes ? `<div style="font-size:0.78rem;color:var(--text-soft);margin-top:2px;font-style:italic">${esc(log.notes)}</div>` : ''}
    </div>`;
  }).join('');
}

function openProcessingModal() {
  const modal = document.getElementById('processing-modal') || (() => {
    const m = document.createElement('div');
    m.id = 'processing-modal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow-y:auto';
    document.body.appendChild(m); return m;
  })();

  const ingOptions = R.ingredients
    .filter(i => i.subType !== 'starter')
    .sort((a,b) => a.name.localeCompare(b.name))
    .map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join('');

  modal.innerHTML = `<div style="background:white;border-radius:16px;padding:24px;width:100%;max-width:560px;margin:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="font-family:'Fraunces',serif;color:var(--teal-dark);margin:0">🏭 Feldolgozás rögzítése</h3>
      <button onclick="document.getElementById('processing-modal').style.display='none'"
        style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:var(--text-soft)">✕</button>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div>
        <label style="font-size:0.82rem;font-weight:600;color:var(--teal-dark);display:block;margin-bottom:4px">Dátum</label>
        <input type="date" id="proc-date" value="${new Date().toISOString().slice(0,10)}"
          style="width:100%;padding:8px;border:1.5px solid var(--border);border-radius:8px;font-family:'Kodchasan',sans-serif;box-sizing:border-box">
      </div>
      <div>
        <label style="font-size:0.82rem;font-weight:600;color:var(--teal-dark);display:block;margin-bottom:4px">Munkaidő (perc)</label>
        <input type="number" id="proc-labor" min="0" value="30"
          style="width:100%;padding:8px;border:1.5px solid var(--border);border-radius:8px;font-family:'Kodchasan',sans-serif;box-sizing:border-box">
      </div>
    </div>

    <!-- BEMENETEK -->
    <div style="margin-bottom:16px">
      <div style="font-size:0.82rem;font-weight:700;color:var(--teal-dark);margin-bottom:8px">📥 Bemenetek (nyers magvak)</div>
      <div id="proc-inputs">
        <div class="proc-input-row" style="display:flex;gap:8px;margin-bottom:6px">
          <select style="flex:2;padding:7px;border:1.5px solid var(--border);border-radius:8px;font-family:'Kodchasan',sans-serif;font-size:0.82rem">${ingOptions}</select>
          <input type="number" placeholder="g" min="0" style="flex:1;padding:7px;border:1.5px solid var(--border);border-radius:8px;font-family:'Kodchasan',sans-serif">
          <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:1.1rem">✕</button>
        </div>
      </div>
      <button onclick="addProcRow('proc-inputs', '${ingOptions.replace(/'/g,"\\'")}',true)"
        class="btn btn-ghost btn-sm" style="margin-top:4px">+ Bemenet hozzáadása</button>
    </div>

    <!-- KIMENETEK -->
    <div style="margin-bottom:16px">
      <div style="font-size:0.82rem;font-weight:700;color:var(--teal-dark);margin-bottom:8px">📤 Kimenetek (lisztek, darák)</div>
      <div id="proc-outputs">
        <div class="proc-output-row" style="display:flex;gap:8px;margin-bottom:6px">
          <select style="flex:2;padding:7px;border:1.5px solid var(--border);border-radius:8px;font-family:'Kodchasan',sans-serif;font-size:0.82rem">${ingOptions}</select>
          <input type="number" placeholder="g" min="0" style="flex:1;padding:7px;border:1.5px solid var(--border);border-radius:8px;font-family:'Kodchasan',sans-serif">
          <input type="number" placeholder="ár%" min="0" max="100" title="Önköltség arány (%)" style="flex:1;padding:7px;border:1.5px solid var(--border);border-radius:8px;font-family:'Kodchasan',sans-serif" value="">
          <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:1.1rem">✕</button>
        </div>
      </div>
      <button onclick="addProcRow('proc-outputs', '${ingOptions.replace(/'/g,"\\'")}',false)"
        class="btn btn-ghost btn-sm" style="margin-top:4px">+ Kimenet hozzáadása</button>
      <div style="font-size:0.72rem;color:var(--text-soft);margin-top:4px">Az ár% opcionális – ha üresen hagyod, arányos elosztás történik (gramm alapján).</div>
    </div>

    <div style="margin-bottom:16px">
      <label style="font-size:0.82rem;font-weight:600;color:var(--teal-dark);display:block;margin-bottom:4px">Megjegyzés (opcionális)</label>
      <input type="text" id="proc-notes" placeholder="pl. sushi rizs 1. tétel"
        style="width:100%;padding:8px;border:1.5px solid var(--border);border-radius:8px;font-family:'Kodchasan',sans-serif;box-sizing:border-box">
    </div>

    <button onclick="saveProcessingLog()" class="btn btn-primary" style="width:100%">
      ✅ Feldolgozás rögzítése → Kimenet bevételezése
    </button>
  </div>`;

  modal.style.display = 'flex';
}

function addProcRow(containerId, ingOptions, isInput) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const div = document.createElement('div');
  div.className = isInput ? 'proc-input-row' : 'proc-output-row';
  div.style.cssText = 'display:flex;gap:8px;margin-bottom:6px';
  div.innerHTML = `<select style="flex:2;padding:7px;border:1.5px solid var(--border);border-radius:8px;font-family:'Kodchasan',sans-serif;font-size:0.82rem">${ingOptions}</select>
    <input type="number" placeholder="g" min="0" style="flex:1;padding:7px;border:1.5px solid var(--border);border-radius:8px;font-family:'Kodchasan',sans-serif">
    ${!isInput ? '<input type="number" placeholder="ár%" min="0" max="100" style="flex:1;padding:7px;border:1.5px solid var(--border);border-radius:8px;font-family:\'Kodchasan\',sans-serif">' : ''}
    <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:1.1rem">✕</button>`;
  container.appendChild(div);
}

async function saveProcessingLog() {
  const date = document.getElementById('proc-date')?.value;
  const laborMin = parseInt(document.getElementById('proc-labor')?.value) || 0;
  const notes = document.getElementById('proc-notes')?.value?.trim() || '';
  const laborCostPerH = (R.settings?.financialSettings?.laborCostPerHour || 55);
  const laborCost = (laborMin / 60) * laborCostPerH;

  // Collect inputs
  const inputs = [];
  let totalInputCost = 0;
  document.querySelectorAll('#proc-inputs .proc-input-row').forEach(row => {
    const sel = row.querySelector('select');
    const qty = parseFloat(row.querySelectorAll('input')[0]?.value) || 0;
    if (!sel || qty <= 0) return;
    const ingId = parseInt(sel.value);
    const ing = getIng(ingId);
    const price = getFifoPrice(ing) * qty;
    totalInputCost += price;
    inputs.push({ ingredient_id: ingId, qty_g: qty, cost: price });
  });

  if (inputs.length === 0) { toast('⚠️ Adj meg legalább egy bemenetet!', true); return; }

  // Collect outputs
  const outputs = [];
  const outputRows = document.querySelectorAll('#proc-outputs .proc-output-row');
  const totalOutputG = Array.from(outputRows).reduce((s, row) => s + (parseFloat(row.querySelectorAll('input')[0]?.value) || 0), 0);
  const totalCostWithLabor = totalInputCost + laborCost;
  let usedCostRatio = 0;

  outputRows.forEach((row, idx) => {
    const sel = row.querySelector('select');
    const inputs_arr = row.querySelectorAll('input');
    const qty = parseFloat(inputs_arr[0]?.value) || 0;
    const costRatio = parseFloat(inputs_arr[1]?.value) || 0;
    if (!sel || qty <= 0) return;
    outputs.push({ ingredient_id: parseInt(sel.value), qty_g: qty, cost_ratio: costRatio || null });
    if (costRatio > 0) usedCostRatio += costRatio;
  });

  if (outputs.length === 0) { toast('⚠️ Adj meg legalább egy kimenetet!', true); return; }

  // Distribute cost: explicit % first, rest proportional by weight
  const remainingCost = totalCostWithLabor * (1 - usedCostRatio / 100);
  const unassignedG = outputs.filter(o => !o.cost_ratio).reduce((s, o) => s + o.qty_g, 0);

  outputs.forEach(o => {
    const ratio = o.cost_ratio ? o.cost_ratio / 100 : (unassignedG > 0 ? o.qty_g / unassignedG * (remainingCost / totalCostWithLabor || 1) : 0);
    o.price_per_g = totalCostWithLabor > 0 ? (totalCostWithLabor * ratio) / o.qty_g : 0;
  });

  try {
    // Save processing log
    const logRow = await sb.insert('ingredient_processing', {
      date, labor_minutes: laborMin,
      inputs: JSON.stringify(inputs),
      outputs: JSON.stringify(outputs),
      total_input_cost: totalCostWithLabor,
      notes
    });
    const logId = logRow?.[0]?.id || null;

    // Bevételezés a kimenetekre (batch INSERT)
    for (const o of outputs) {
      const today = date;
      await sb.insert('ingredient_batches', {
        ingredient_id: o.ingredient_id,
        received_date: today,
        qty_received_g: o.qty_g,
        qty_remaining_g: o.qty_g,
        price_per_g: o.price_per_g,
        price_gross_per_unit: totalCostWithLabor * (o.qty_g / (totalOutputG || 1)),
        package_size_g: o.qty_g,
        supplier_name: 'Saját feldolgozás',
        source_type: 'processing',
        processing_id: logId,
        notes: notes || 'Malom kimenet'
      });
      // Update local R
      if (!R.batches) R.batches = [];
      R.batches.push({
        ingredientId: o.ingredient_id, receivedDate: today,
        qtyReceivedG: o.qty_g, qtyRemainingG: o.qty_g,
        pricePerG: o.price_per_g, supplierName: 'Saját feldolgozás', sourceType: 'processing'
      });
      const ing = getIng(o.ingredient_id);
      if (ing) ing.totalStockG = (ing.totalStockG || 0) + o.qty_g;
    }

    // Deduct inputs from batches (FIFO)
    for (const inp of inputs) {
      let rem = inp.qty_g;
      const batches = R.batches.filter(b => b.ingredientId === inp.ingredient_id && b.qtyRemainingG > 0)
        .sort((a,b) => a.receivedDate.localeCompare(b.receivedDate));
      for (const batch of batches) {
        if (rem <= 0) break;
        const take = Math.min(rem, batch.qtyRemainingG);
        batch.qtyRemainingG -= take; rem -= take;
        try { await sb.update('ingredient_batches', { qty_remaining_g: Math.max(0, batch.qtyRemainingG) }, `id=eq.${batch.id}`); } catch(e) {}
      }
      const ing = getIng(inp.ingredient_id);
      if (ing) ing.totalStockG = Math.max(0, (ing.totalStockG || 0) - inp.qty_g);
    }

    document.getElementById('processing-modal').style.display = 'none';
    toast(`✅ Feldolgozás rögzítve! ${outputs.length} kimenet bevételezve. Önköltség: ${totalCostWithLabor.toFixed(2)} lej`);
    await initProcessingView();
    renderStock();
  } catch(e) {
    toast('⚠️ Hiba: ' + e.message, true);
    console.error(e);
  }
}
