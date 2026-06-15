// =============================================================
// KEREK Receptúra – Alapanyag-kategóriák és stock-intake (v2.32.0 M10 bontás)
// Eredetileg: js/receptura-settings.js (684 sor)
// =============================================================


async function renderIngCategories() {
  const el = document.getElementById('ing-categories-list');
  if (!el) return;
  // v2.36.0 fix #10: settings + actual usage union (was only usage → new categories were invisible & undeletable)
  const settingsCats = R.settings?.ingredientCategories || [];
  const usedCats = R.ingredients.map(i => i.cat).filter(Boolean);
  const cats = [...new Set([...settingsCats, ...usedCats])].sort();
  if (cats.length === 0) {
    el.innerHTML = '<p class="text-soft text-sm">Nincsenek alapanyag csoportok.</p>';
    return;
  }
  let html = cats.map(cat => {
    const count = R.ingredients.filter(i => i.cat === cat).length;
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;background:white">
      <span style="font-size:0.85rem;font-weight:600">${esc(cat)} <span style="font-size:0.75rem;color:var(--text-soft);font-weight:400">(${count} tétel)</span></span>
      ${count === 0 ? `<button data-action="deleteIngCategory" data-arg1="${esc(cat)}" data-tip="Kategória törlése" class="btn btn-ghost btn-sm" style="color:var(--red,#dc2626);font-size:0.75rem">✕</button>` : '<span style="font-size:0.72rem;color:var(--text-soft)">használatban</span>'}
    </div>`;
  }).join('');
  // v2.40.0: kategória konszolidáció gomb
  if (cats.length >= 2) {
    html += '<div style="margin-top:10px"><button class="btn btn-ghost btn-sm" data-action="openMergeCategoryModal" data-tip="Két kategória összevonása">🔀 Kategóriák összevonása</button></div>';
  }
  el.innerHTML = html;
}

// =============================================================
// v2.40.0 — KATEGÓRIA KONSZOLIDÁCIÓ
// =============================================================

function openMergeCategoryModal() {
  const settingsCats = R.settings?.ingredientCategories || [];
  const usedCats = R.ingredients.map(i => i.cat).filter(Boolean);
  const cats = [...new Set([...settingsCats, ...usedCats])].sort();
  if (cats.length < 2) { toast('Legalább 2 kategória kell az összevonáshoz', true); return; }

  let modal = document.getElementById('merge-cat-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'merge-cat-modal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }
  const opts = cats.map(c => `<option value="${esc(c)}">${esc(c)} (${R.ingredients.filter(i => i.cat === c).length} tétel)</option>`).join('');
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <h3>🔀 Kategóriák összevonása</h3>
        <button class="modal-close" data-action="closeMergeCategoryModal">✕</button>
      </div>
      <div class="modal-body">
        <div style="background:#fffbf5;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:0.8rem;color:#92400e">
          ⚠️ Az összevonás <b>visszavonhatatlan</b>. A forrás kategória összes alapanyaga átkerül a célba, és a forrás kategória törlődik.
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Forrás kategória <span style="font-weight:400;color:var(--text-soft);font-size:0.72rem">(ez törlődik)</span></label>
            <select id="merge-from"><option value="">— Válassz —</option>${opts}</select>
          </div>
          <div class="form-group">
            <label>Cél kategória <span style="font-weight:400;color:var(--text-soft);font-size:0.72rem">(ez marad)</span></label>
            <select id="merge-to"><option value="">— Válassz —</option>${opts}</select>
          </div>
        </div>
        <div id="merge-preview" style="font-size:0.82rem;color:var(--text-soft);padding:10px 14px;background:var(--cream);border-radius:8px;display:none"></div>
      </div>
      <div class="modal-footer" style="display:flex;justify-content:space-between;padding:14px 18px;border-top:1px solid var(--border);background:var(--cream)">
        <button class="btn btn-ghost" data-action="closeMergeCategoryModal">Mégse</button>
        <button class="btn btn-primary" data-action="confirmMergeCategory">🔀 Összevonás</button>
      </div>
    </div>
  `;
  modal.style.display = 'flex';

  // Preview a választás után
  const updatePreview = () => {
    const from = document.getElementById('merge-from')?.value;
    const to = document.getElementById('merge-to')?.value;
    const prev = document.getElementById('merge-preview');
    if (!from || !to || !prev) { if (prev) prev.style.display = 'none'; return; }
    if (from === to) { prev.innerHTML = '⚠️ A forrás és a cél nem lehet ugyanaz!'; prev.style.display = ''; return; }
    const affectedCount = R.ingredients.filter(i => i.cat === from).length;
    prev.innerHTML = `📋 <b>${affectedCount}</b> alapanyag kerül át a "<b>${esc(from)}</b>" kategóriából a "<b>${esc(to)}</b>" kategóriába.<br>A "<b>${esc(from)}</b>" kategória törlésre kerül.`;
    prev.style.display = '';
  };
  document.getElementById('merge-from')?.addEventListener('change', updatePreview);
  document.getElementById('merge-to')?.addEventListener('change', updatePreview);
}

function closeMergeCategoryModal() {
  const modal = document.getElementById('merge-cat-modal');
  if (modal) modal.style.display = 'none';
}

async function confirmMergeCategory() {
  const from = document.getElementById('merge-from')?.value;
  const to = document.getElementById('merge-to')?.value;
  if (!from || !to) { toast('Válassz forrás ÉS cél kategóriát', true); return; }
  if (from === to) { toast('A forrás és cél nem lehet ugyanaz', true); return; }
  const affectedIngs = R.ingredients.filter(i => i.cat === from);
  const affectedCount = affectedIngs.length;
  if (!(await confirmDialog(`Biztos összevonod?

"${from}" (${affectedCount} tétel) → "${to}"

A "${from}" kategória véglegesen törlődik.`))) return;

  try {
    // 1) Update minden érintett ingredient category-jét
    for (const ing of affectedIngs) {
      await sb.updateFields('ingredients', { category: to }, 'id=eq.' + ing.id);
      ing.cat = to;  // local update
    }
    // 2) Töröljük a forrás kategóriát a settings-ből
    const cats = (R.settings?.ingredientCategories || []).filter(c => c !== from);
    if (R.settings.ingredientCategories?.includes(from)) {
      R.settings.ingredientCategories = cats;
      await sb.setSetting('ingredient_categories', cats);
    }
    // 3) Audit
    await auditLog('category_merge', from + ' → ' + to, affectedCount + ' alapanyag átsorolva');
    toast(`✅ ${affectedCount} alapanyag átkerült. "${from}" törölve.`);
    closeMergeCategoryModal();
    renderIngCategories();
    if (typeof renderStock === 'function') renderStock();
  } catch(e) {
    toast('⚠️ Hiba: ' + e.message, true);
    console.error('confirmMergeCategory:', e);
  }
}

// Export
if (typeof window !== 'undefined') {
  window.openMergeCategoryModal = openMergeCategoryModal;
  window.closeMergeCategoryModal = closeMergeCategoryModal;
  window.confirmMergeCategory = confirmMergeCategory;
}

async function addIngCategory() {
  const val = document.getElementById('ing-new-cat-input')?.value?.trim();
  if (!val) { toast('⚠️ Add meg a csoport nevét!', true); return; }
  const exists = R.ingredients.some(i => i.cat === val);
  if (exists) { toast('Ez a csoport már létezik!', true); return; }
  // Add as a temporary entry (will be used when creating ingredients)
  // Store in settings as ingredient_categories
  const cats = R.settings?.ingredientCategories || [];
  if (!cats.includes(val)) {
    cats.push(val);
    if (!R.settings) R.settings = {};
    R.settings.ingredientCategories = cats;
    try {
      await sb.setSetting('ingredient_categories', cats);
      document.getElementById('ing-new-cat-input').value = '';
      // v2.36.0: just re-render via renderIngCategories (single source of truth)
      renderIngCategories();
      toast('✅ Csoport hozzáadva!');
    } catch(e) { toast('⚠️ Hiba: '+e.message, true); }
  }
}

async function deleteIngCategory(cat) {
  if (!(await confirmDialog('Törlöd a "'+cat+'" csoportot? Csak üres csoportot lehet törölni.'))) return;
  const cats = (R.settings?.ingredientCategories || []).filter(c => c !== cat);
  R.settings.ingredientCategories = cats;
  try {
    await sb.setSetting('ingredient_categories', cats);
    renderIngCategories();
    toast('Csoport törölve.');
  } catch(e) { toast('⚠️ Hiba: '+e.message, true); }
}

function openStockIntakeModal(ingId) {
  const ing = getIng(ingId);
  if (!ing) return;
  const currentStock = getTotalStock(ing);

  // Build supplier options
  const suppliers = ing.suppliers || [];
  const supplierOpts = suppliers.map((s,i) =>
    `<option value="${i}">${esc(s.source||s.name||'?')} – ${s.pricePerKg||0} lej/kg</option>`
  ).join('');

  const modal = document.getElementById('stock-intake-modal') || (() => {
    const m = document.createElement('div');
    m.id = 'stock-intake-modal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    document.body.appendChild(m);
    return m;
  })();

  modal.innerHTML = `<div style="background:white;border-radius:16px;padding:24px;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,0.3)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="font-family:'Fraunces',serif;color:var(--teal-dark);margin:0">📦 Bevételezés</h3>
      <button onclick="document.getElementById('stock-intake-modal').style.display='none'" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:var(--text-soft)">✕</button>
    </div>
    <div style="background:var(--bg-soft);border-radius:10px;padding:12px;margin-bottom:16px">
      <div style="font-weight:700;font-size:0.95rem;color:var(--teal-dark)">${esc(ing.name)}</div>
      <div style="font-size:0.82rem;color:var(--text-soft);margin-top:4px">Jelenlegi készlet: <b>${currentStock.toLocaleString()} g</b></div>
    </div>
    <div style="margin-bottom:12px">
      <label style="font-size:0.82rem;font-weight:600;color:var(--teal-dark);display:block;margin-bottom:6px">Bevételezett mennyiség</label>
      <div style="display:flex;gap:8px">
        <input type="number" id="si-amount" min="0" step="0.001" placeholder="pl. 2" oninput="updateSiPriceLabel()"
          style="flex:1;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:0.95rem;font-family:'Kodchasan',sans-serif">
        <select id="si-unit" onchange="updateSiPriceLabel()"
          style="width:80px;padding:10px 8px;border:1.5px solid var(--border);border-radius:8px;font-size:0.9rem;font-family:'Kodchasan',sans-serif">
          <option value="g">g</option>
          <option value="kg">kg</option>
          <option value="ml">ml</option>
          <option value="L">L</option>
        </select>
      </div>
      <div id="si-amount-preview" style="font-size:0.72rem;color:var(--text-soft);margin-top:3px"></div>
    </div>
    <div style="margin-bottom:12px">
      <label style="font-size:0.82rem;font-weight:600;color:var(--teal-dark);display:block;margin-bottom:6px">Ár megadása</label>
      <select id="si-price-mode" onchange="updateSiPriceLabel()"
        style="width:100%;padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:0.84rem;font-family:'Kodchasan',sans-serif;margin-bottom:6px">
        <option value="per_kg">Egységár (lej/kg)</option>
        <option value="total">Teljes összeg (lej) – rendszer számolja kg-árat</option>
      </select>
      <input type="number" id="si-price" min="0" step="0.01" placeholder="pl. 8.50" oninput="updateSiPriceLabel()"
        style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:0.95rem;font-family:'Kodchasan',sans-serif;box-sizing:border-box">
      <div id="si-price-preview" style="font-size:0.75rem;color:var(--text-soft);margin-top:4px"></div>
    </div>
    <div style="margin-bottom:16px">
      <label style="font-size:0.82rem;font-weight:600;color:var(--teal-dark);display:block;margin-bottom:6px">Beszállító</label>
      ${suppliers.length > 0 ? `<select id="si-supplier-select" style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:0.85rem;font-family:'Kodchasan',sans-serif;margin-bottom:8px">
        ${supplierOpts}
        <option value="new">+ Új beszállító</option>
      </select>` : ''}
      <input type="text" id="si-supplier-name" placeholder="Beszállító neve (pl. BioMart Sf)"
        style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:0.85rem;font-family:'Kodchasan',sans-serif;box-sizing:border-box;${suppliers.length > 0 ? 'display:none' : ''}">
    </div>
    <div style="display:flex;gap:10px">
      <button onclick="confirmStockIntake(${ingId})" class="btn btn-primary" style="flex:1">✅ Bevételezés rögzítése</button>
    </div>
    <div style="margin-top:10px;font-size:0.75rem;color:var(--text-soft);text-align:center">
      A bevételezés hozzáadódik a meglévő készlethez
    </div>
  </div>`;

  // Toggle new supplier input
  const sel = modal.querySelector('#si-supplier-select');
  if (sel) {
    sel.onchange = () => {
      const nameInput = modal.querySelector('#si-supplier-name');
      if (nameInput) nameInput.style.display = sel.value === 'new' ? 'block' : 'none';
    };
  }

  modal.style.display = 'flex';
  setTimeout(() => modal.querySelector('#si-amount')?.focus(), 100);
}


function updateSiPriceLabel() {
  const mode = document.getElementById('si-price-mode')?.value;
  const unit = document.getElementById('si-unit')?.value || 'g';
  const amountRaw = parseFloat(document.getElementById('si-amount')?.value) || 0;
  const priceInput = parseFloat(document.getElementById('si-price')?.value) || 0;
  const preview = document.getElementById('si-price-preview');
  const amountPreview = document.getElementById('si-amount-preview');

  // Convert to grams for preview
  let amountG = amountRaw;
  if (unit === 'kg') amountG = amountRaw * 1000;
  else if (unit === 'L') amountG = amountRaw * 1000;
  else if (unit === 'ml') amountG = amountRaw;

  if (amountPreview && amountRaw > 0 && unit !== 'g') {
    amountPreview.textContent = `→ ${amountG.toLocaleString()} g`;
  } else if (amountPreview) {
    amountPreview.textContent = '';
  }

  if (!preview) return;
  if (mode === 'total') {
    if (amountG > 0 && priceInput > 0) {
      const perKg = priceInput / (amountG / 1000);
      preview.textContent = `→ Egységár: ${perKg.toFixed(2)} lej/kg`;
    } else {
      preview.textContent = 'Add meg a mennyiséget és az összeget';
    }
  } else {
    if (priceInput > 0 && amountG > 0) {
      const total = (amountG / 1000) * priceInput;
      preview.textContent = `→ Teljes: ${total.toFixed(2)} lej`;
    } else {
      preview.textContent = '';
    }
  }
}

async function confirmStockIntake(ingId) {
  const amountEl = document.getElementById('si-amount');
  const unitEl = document.getElementById('si-unit');
  const priceEl = document.getElementById('si-price');
  const priceModeEl = document.getElementById('si-price-mode');
  const supplierSel = document.getElementById('si-supplier-select');
  const supplierNameEl = document.getElementById('si-supplier-name');

  const amountRaw = parseFloat(amountEl?.value) || 0;
  if (amountRaw <= 0) { toast('⚠️ Add meg a mennyiséget!', true); return; }

  // Convert to grams (1ml = 1g approximation)
  const unit = unitEl?.value || 'g';
  let amountG = amountRaw;
  if (unit === 'kg') amountG = amountRaw * 1000;
  else if (unit === 'L') amountG = amountRaw * 1000;
  else if (unit === 'ml') amountG = amountRaw;
  // g stays as is

  // Price calculation
  const priceMode = priceModeEl?.value || 'per_kg';
  const priceInput = parseFloat(priceEl?.value) || 0;
  let pricePerG = 0;
  if (priceInput > 0) {
    if (priceMode === 'total') {
      pricePerG = amountG > 0 ? priceInput / amountG : 0;
    } else {
      // per_kg → per_g
      pricePerG = priceInput / 1000;
    }
  }

  const supplierName = supplierSel?.value === 'new' || !supplierSel
    ? (supplierNameEl?.value?.trim() || '')
    : (supplierSel.options[supplierSel.selectedIndex]?.text?.split(' – ')[0] || '');

  const ing = getIng(ingId);
  if (!ing) return;

  try {
    // FIX: INSERT into ingredient_batches (not just R.stock settings!)
    const batchRow = {
      ingredient_id: ingId,
      received_date: localToday(),
      qty_received_g: amountG,
      qty_remaining_g: amountG,
      price_per_g: pricePerG,
      price_gross_per_unit: priceMode === 'total' ? priceInput : (priceInput / 1000 * amountG),
      package_size_g: amountG,
      supplier_name: supplierName,
      source_type: 'purchase',
      notes: unit !== 'g' ? `Bevételezve: ${amountRaw} ${unit}` : ''
    };

    await sb.insert('ingredient_batches', batchRow);

    // Update local R.batches
    if (!R.batches) R.batches = [];
    R.batches.push({
      ingredientId: ingId,
      receivedDate: batchRow.received_date,
      qtyReceivedG: amountG,
      qtyRemainingG: amountG,
      pricePerG: pricePerG,
      supplierName: supplierName,
      sourceType: 'purchase',
    });

    // Recalculate totalStockG and prices for this ingredient
    const ingBatches = R.batches.filter(b => b.ingredientId === ingId && b.qtyRemainingG > 0);
    ing.totalStockG = ingBatches.reduce((s, b) => s + b.qtyRemainingG, 0);
    const fifoB = [...ingBatches].sort((a,b) => a.receivedDate.localeCompare(b.receivedDate))[0];
    ing.fifoPrice = fifoB ? fifoB.pricePerG : 0;
    const totalQ = ing.totalStockG;
    ing.avgPrice = totalQ > 0
      ? ingBatches.reduce((s, b) => s + b.pricePerG * b.qtyRemainingG, 0) / totalQ
      : 0;

    const unitLabel = unit === 'g' ? 'g' : unit === 'kg' ? 'kg' : unit;
    document.getElementById('stock-intake-modal').style.display = 'none';
    toast(`✅ Bevételezve: ${amountRaw} ${unitLabel} ${ing.name}. Készlet: ${Math.round(ing.totalStockG).toLocaleString()} g`);
    renderStock();
    renderStockAlerts();
  } catch(e) {
    toast('⚠️ Mentés sikertelen: ' + e.message, true);
    console.error('confirmStockIntake error:', e);
  }
}
