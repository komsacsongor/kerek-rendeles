// =============================================================
// KEREK Receptúra — Bevásárló lista v2 (v2.39.0)
// =============================================================
// Beszállítónkénti + általános bevásárló lista
// Minden R.ingredients material_type (raw/intermediate/finished/consumable)
// Ajánlott = (maxStock - currentStock), kerekítve csomagolás méretre
// =============================================================

// Manuális override-ok (session-szintű, nem perzisztens)
let shoppingOverrides = {};
let shoppingFilter = 'urgent'; // 'urgent' (csak sürgős+hamarosan), 'all' (mind ami < max)
let shoppingViewMode = 'supplier'; // 'supplier' (beszállítónként) | 'flat' (egy lista)

// =============================================================
// HELPER-EK
// =============================================================

// Elsődleges beszállító (első nem-üres név)
// v2.39.1 fix: a `suppliers` tényleges formátuma string-array (["Biolife"]), NEM object-array
// Backward compat: ha valami object-format-tal jönne ({source:...}), azt is kezeli
function getPrimarySupplier(ing) {
  const suppliers = ing.suppliers || [];
  for (const s of suppliers) {
    if (typeof s === 'string' && s.trim()) return s.trim();
    if (s && typeof s === 'object' && s.source && s.source.trim()) return s.source.trim();
  }
  return null;
}

// Csomagolás méret (g) — v2.39.1 fix: a string-array supplier formátumban nincs package info,
// ezért default 1000g (1 kg). Ha az ingredient-en van explicit package_size_g mező (ingredient_batches-ből
// származó), azt használjuk. Legutóbbi batch package_size_g jó forrás.
function getPackageSize(ing) {
  // Ha objektum-formátumú supplier van benne (régi/jövőbeli), abból olvassuk
  const s = (ing.suppliers || []).find(s => s && typeof s === 'object' && s.package > 0);
  if (s) return s.package;
  // Ha az ingredient direktben hordoz package size-ot
  if (ing.packageSizeG > 0) return ing.packageSizeG;
  // Default
  return 1000;
}

// Sürgősség szint: 'critical' | 'soon' | 'buffer' | 'ok'
function getUrgencyLevel(ing) {
  const stock = getTotalStock(ing);
  const critical = ing.criticalStock || 0;
  const min = ing.minStock || 0;
  const max = ing.maxStock || 0;
  if (critical > 0 && stock < critical) return 'critical';
  if (min > 0 && stock < min) return 'soon';
  if (max > 0 && stock < max) return 'buffer';
  return 'ok';
}

// Ajánlott rendelési mennyiség (g) — maxStock - currentStock, csomagolásra kerekítve
function getRecommendedQty(ing) {
  if (shoppingOverrides[ing.id] !== undefined) {
    return shoppingOverrides[ing.id];
  }
  const stock = getTotalStock(ing);
  const max = ing.maxStock || 0;
  if (max <= 0) return 0;
  const deficit = max - stock;
  if (deficit <= 0) return 0;
  const pkg = getPackageSize(ing);
  // Felfelé kerekítjük a csomagolás-méretre
  return Math.ceil(deficit / pkg) * pkg;
}

// Olyan alapanyagok, amiknek érdemes rendelni (currentStock < maxStock)
function getShoppingItems(filter) {
  filter = filter || shoppingFilter;
  const items = (R.ingredients || []).filter(ing => {
    const max = ing.maxStock || 0;
    if (max <= 0) return false; // ha nincs max megadva, nem szerepel
    const stock = getTotalStock(ing);
    const urgency = getUrgencyLevel(ing);
    if (filter === 'urgent') return urgency === 'critical' || urgency === 'soon';
    return urgency !== 'ok'; // 'all': minden ami < max
  });
  // Sürgősség szerint, aztán név szerint
  const order = { critical: 0, soon: 1, buffer: 2, ok: 3 };
  items.sort((a, b) => {
    const ua = order[getUrgencyLevel(a)];
    const ub = order[getUrgencyLevel(b)];
    if (ua !== ub) return ua - ub;
    return (a.name || '').localeCompare(b.name || '', 'hu');
  });
  return items;
}

// Mértékegység formátum (g vagy kg)
function fmtQty(grams) {
  if (grams >= 1000) {
    const kg = grams / 1000;
    return `${kg.toLocaleString('hu', { maximumFractionDigits: 2 })} kg`;
  }
  return `${Math.round(grams)} g`;
}

// =============================================================
// CLIPBOARD MÁSOLÁS
// =============================================================

// Vágólapra: egy beszállító tételei (egyszerű plain-text)
async function copySupplierList(supplierName) {
  const all = getShoppingItems();
  const items = all.filter(ing => getPrimarySupplier(ing) === supplierName);
  if (items.length === 0) { toast('Nincs tétel ennél a beszállítónál.', true); return; }
  const lines = [`Bevásárlás — ${supplierName}`, ''];
  items.forEach(ing => {
    const qty = getRecommendedQty(ing);
    if (qty > 0) lines.push(`• ${ing.name}: ${fmtQty(qty)}`);
  });
  lines.push('', `Összesen ${items.length} tétel — KEREK ${new Date().toLocaleDateString('hu')}`);
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    toast(`✅ ${supplierName} listája vágólapra másolva (${items.length} tétel).`);
  } catch(e) { toast('⚠️ Vágólap-másolás sikertelen: ' + e.message, true); }
}

// Vágólapra: minden tétel egyben
async function copyAllShoppingList() {
  const all = getShoppingItems();
  if (all.length === 0) { toast('A lista üres.', true); return; }
  const lines = [`KEREK — Bevásárló lista (${new Date().toLocaleDateString('hu')})`, ''];
  // Csoportosítva beszállítónként
  const groups = groupBySupplier(all);
  groups.forEach((items, supplier) => {
    lines.push(`▸ ${supplier}`);
    items.forEach(ing => {
      const qty = getRecommendedQty(ing);
      if (qty > 0) lines.push(`  • ${ing.name}: ${fmtQty(qty)}`);
    });
    lines.push('');
  });
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    toast(`✅ Teljes lista vágólapra másolva (${all.length} tétel).`);
  } catch(e) { toast('⚠️ Vágólap-másolás sikertelen: ' + e.message, true); }
}

// Csoportosítás Map-ben: supplier → items[]
function groupBySupplier(items) {
  const groups = new Map();
  items.forEach(ing => {
    const sup = getPrimarySupplier(ing) || '⚠️ Beszállító megadva nincs';
    if (!groups.has(sup)) groups.set(sup, []);
    groups.get(sup).push(ing);
  });
  return groups;
}

// =============================================================
// RENDER
// =============================================================

function renderShoppingList() {
  const el = document.getElementById('view-shopping-content');
  if (!el) return;

  const items = getShoppingItems();
  const total = items.length;

  // Header (filter toggle + view mode toggle + actions)
  let html = `
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-bottom:16px;padding:14px 16px;background:white;border-radius:12px;border:1px solid var(--border)">
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <span style="font-size:0.82rem;color:var(--text-soft);margin-right:6px">Megjelenítés:</span>
        <button class="btn ${shoppingFilter==='urgent'?'btn-primary':'btn-ghost'} btn-sm" data-action="setShoppingFilter" data-arg1="urgent">🔴 Csak sürgős</button>
        <button class="btn ${shoppingFilter==='all'?'btn-primary':'btn-ghost'} btn-sm" data-action="setShoppingFilter" data-arg1="all">📋 Mind (max-ig)</button>
        <span style="width:1px;background:var(--border);height:24px;margin:0 8px"></span>
        <button class="btn ${shoppingViewMode==='supplier'?'btn-primary':'btn-ghost'} btn-sm" data-action="setShoppingView" data-arg1="supplier">📦 Beszállítónként</button>
        <button class="btn ${shoppingViewMode==='flat'?'btn-primary':'btn-ghost'} btn-sm" data-action="setShoppingView" data-arg1="flat">📋 Egy listában</button>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-primary btn-sm" data-action="copyAllShoppingList" data-tip="Teljes lista vágólapra">📋 Mindent másol</button>
        <button class="btn btn-ghost btn-sm" data-action="resetShoppingOverrides" data-tip="Manuális módosítások visszaállítása">↺ Reset</button>
      </div>
    </div>
  `;

  if (total === 0) {
    html += `<div style="text-align:center;padding:48px 20px;background:white;border-radius:12px;border:1px solid var(--border);color:var(--text-soft)">
      <div style="font-size:3rem;margin-bottom:10px">✅</div>
      <div style="font-size:1.1rem;font-weight:600;color:var(--teal-dark);margin-bottom:6px">Nincs sürgős rendelnivaló</div>
      <div style="font-size:0.85rem">${shoppingFilter==='urgent' ? 'Próbáld a "Mind (max-ig)" nézetet hogy lásd a pufferben lévő tételeket.' : 'Minden alapanyag a maxStock felett van.'}</div>
    </div>`;
    el.innerHTML = html;
    return;
  }

  // Stat summary
  const critical = items.filter(i => getUrgencyLevel(i) === 'critical').length;
  const soon = items.filter(i => getUrgencyLevel(i) === 'soon').length;
  const buffer = items.filter(i => getUrgencyLevel(i) === 'buffer').length;

  html += `
    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      ${critical>0?`<div style="background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;padding:8px 14px;border-radius:8px;font-size:0.85rem"><b>🔴 ${critical}</b> sürgős</div>`:''}
      ${soon>0?`<div style="background:#fef3c7;border:1px solid #fde68a;color:#b45309;padding:8px 14px;border-radius:8px;font-size:0.85rem"><b>🟡 ${soon}</b> hamarosan</div>`:''}
      ${buffer>0?`<div style="background:#ecfdf5;border:1px solid #a7f3d0;color:#047857;padding:8px 14px;border-radius:8px;font-size:0.85rem"><b>🟢 ${buffer}</b> pufferben</div>`:''}
    </div>
  `;

  if (shoppingViewMode === 'supplier') {
    html += renderSupplierView(items);
  } else {
    html += renderFlatView(items);
  }

  el.innerHTML = html;
}

function renderSupplierView(items) {
  const groups = groupBySupplier(items);
  let html = '';
  groups.forEach((groupItems, supplierName) => {
    const isOrphan = supplierName.startsWith('⚠️');
    const totalQty = groupItems.reduce((sum, ing) => sum + getRecommendedQty(ing), 0);
    html += `
      <div style="background:white;border:1px solid ${isOrphan?'#fde68a':'var(--border)'};border-radius:12px;margin-bottom:14px;overflow:hidden">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:${isOrphan?'#fffbeb':'var(--cream)'};border-bottom:1px solid ${isOrphan?'#fde68a':'var(--border)'}">
          <div>
            <div style="font-family:'Fraunces',serif;font-weight:700;color:var(--teal-dark);font-size:1rem">${esc(supplierName)}</div>
            <div style="font-size:0.75rem;color:var(--text-soft);margin-top:2px">${groupItems.length} tétel · összesen ${fmtQty(totalQty)}</div>
          </div>
          ${!isOrphan ? `<button class="btn btn-primary btn-sm" data-action="copySupplierList" data-arg1="${esc(supplierName)}" data-tip="Lista vágólapra ehhez a beszállítóhoz">📋 Másol</button>` : `<span style="font-size:0.7rem;color:#b45309">Adj meg beszállítót az alapanyag szerkesztőjében!</span>`}
        </div>
        <div style="padding:4px 0">
          ${groupItems.map(ing => renderShoppingItemRow(ing)).join('')}
        </div>
      </div>
    `;
  });
  return html;
}

function renderFlatView(items) {
  return `
    <div style="background:white;border:1px solid var(--border);border-radius:12px;overflow:hidden">
      <div style="padding:4px 0">
        ${items.map(ing => renderShoppingItemRow(ing, true)).join('')}
      </div>
    </div>
  `;
}

function renderShoppingItemRow(ing, showSupplier) {
  const stock = getTotalStock(ing);
  const min = ing.minStock || 0;
  const max = ing.maxStock || 0;
  const recommended = getRecommendedQty(ing);
  const urgency = getUrgencyLevel(ing);
  const supplier = getPrimarySupplier(ing) || '—';
  const pkg = getPackageSize(ing);

  const urgencyIcon = { critical: '🔴', soon: '🟡', buffer: '🟢' }[urgency] || '⚪';
  const urgencyColor = { critical: '#dc2626', soon: '#b45309', buffer: '#047857' }[urgency] || 'var(--text-soft)';

  const isOverridden = shoppingOverrides[ing.id] !== undefined;

  return `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--border)" class="shopping-row">
      <div style="font-size:1.1rem;flex-shrink:0">${urgencyIcon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;color:var(--text);font-size:0.92rem">${esc(ing.name)}${showSupplier && supplier !== '—' ? ` <span style="font-weight:400;color:var(--text-soft);font-size:0.75rem">— ${esc(supplier)}</span>` : ''}</div>
        <div style="font-size:0.72rem;color:var(--text-soft);margin-top:2px">
          Jelenleg: <b style="color:${urgencyColor}">${fmtQty(stock)}</b>
          ${min>0?` · Min: ${fmtQty(min)}`:''}
          ${max>0?` · <span style="color:var(--gold-dark);font-weight:600">Max: ${fmtQty(max)}</span>`:''}
          · Csomag: ${fmtQty(pkg)}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <button class="btn btn-ghost btn-sm" data-action="adjustShoppingQty" data-arg1="${ing.id}" data-arg2="-${pkg}" data-tip="−1 csomag" style="padding:2px 8px;font-size:0.9rem">−</button>
        <input type="number" value="${recommended}" min="0" step="${pkg}" data-shopping-ing="${ing.id}" style="width:80px;padding:6px 8px;border:1.5px solid ${isOverridden?'var(--gold)':'var(--border)'};border-radius:6px;font-family:'Kodchasan',sans-serif;font-size:0.85rem;text-align:center" onchange="setShoppingQty(${ing.id}, this.value)">
        <button class="btn btn-ghost btn-sm" data-action="adjustShoppingQty" data-arg1="${ing.id}" data-arg2="${pkg}" data-tip="+1 csomag" style="padding:2px 8px;font-size:0.9rem">+</button>
        <span style="font-size:0.72rem;color:var(--text-soft);min-width:24px">g</span>
      </div>
    </div>
  `;
}

// =============================================================
// AKCIÓK
// =============================================================

function setShoppingFilter(f) {
  shoppingFilter = f;
  renderShoppingList();
}

function setShoppingView(v) {
  shoppingViewMode = v;
  renderShoppingList();
}

function setShoppingQty(ingId, qty) {
  const n = Number(qty);
  if (isNaN(n) || n < 0) return;
  shoppingOverrides[ingId] = n;
  // Csak az input szín frissül, nem teljes re-render (UX)
  const input = document.querySelector(`input[data-shopping-ing="${ingId}"]`);
  if (input) input.style.borderColor = 'var(--gold)';
}

function adjustShoppingQty(ingId, delta) {
  const ing = R.ingredients.find(i => i.id == ingId);
  if (!ing) return;
  const current = getRecommendedQty(ing);
  const newVal = Math.max(0, current + Number(delta));
  shoppingOverrides[ingId] = newVal;
  const input = document.querySelector(`input[data-shopping-ing="${ingId}"]`);
  if (input) {
    input.value = newVal;
    input.style.borderColor = 'var(--gold)';
  }
  // Frissítsük a beszállító csoport összeget
  renderShoppingList();
}

function resetShoppingOverrides() {
  shoppingOverrides = {};
  renderShoppingList();
  toast('↺ Manuális módosítások visszaállítva.');
}

// Export window-ra (data-action delegator szükséges hogy elérje)
if (typeof window !== 'undefined') {
  window.renderShoppingList = renderShoppingList;
  window.setShoppingFilter = setShoppingFilter;
  window.setShoppingView = setShoppingView;
  window.setShoppingQty = setShoppingQty;
  window.adjustShoppingQty = adjustShoppingQty;
  window.resetShoppingOverrides = resetShoppingOverrides;
  window.copySupplierList = copySupplierList;
  window.copyAllShoppingList = copyAllShoppingList;
}
