// ===== STOCK VIEW – batch alapú, auto/kézi min/max =====

function renderStockAlerts() {
  const el = document.getElementById('stock-alerts');
  if (!el) return;
  const alerts = R.ingredients.filter(ing => {
    const stock = getTotalStock(ing);
    const min = ing.minStock;
    return min > 0 && stock < min;
  });
  if (alerts.length === 0) { el.innerHTML = ''; return; }
  const critical = alerts.filter(i => getTotalStock(i) < (i.maxStockAutoG * 0.3 || 50));
  el.innerHTML = `<div style="background:${critical.length?'#fef2f2':'#fef3c7'};border:1px solid ${critical.length?'#fca5a5':'#fde68a'};border-radius:10px;padding:12px 16px;margin-bottom:12px">
    <div style="font-weight:700;font-size:0.85rem;color:${critical.length?'#991b1b':'#92400e'};margin-bottom:6px">
      ${critical.length?'🔴 Kritikus készletszint':'🟡 Alacsony készlet'}
    </div>
    ${alerts.map(i=>`<div style="font-size:0.8rem;color:${critical.includes(i)?'#dc2626':'#b45309'}">
      ${i.name}: <b>${Math.round(getTotalStock(i)).toLocaleString()}g</b> (min: ${i.minStock.toLocaleString()}g)
    </div>`).join('')}
  </div>`;
}

function renderStock() {
  const el = document.getElementById('stock-list');
  if (!el) return;

  // Group by category
  const cats = {};
  R.ingredients.forEach(ing => {
    const cat = ing.cat || 'Egyéb';
    if (!cats[cat]) cats[cat] = [];
    cats[cat].push(ing);
  });

  // v2.39.2: collapsible kategóriák — localStorage perzisztens állapot
  // Default: minden csukva ha > 5 kategória, egyébként minden nyitva
  const catKeys = Object.keys(cats).sort();
  const collapsedKey = 'kerek_stock_cat_collapsed';
  let collapsed = {};
  try { collapsed = JSON.parse(localStorage.getItem(collapsedKey) || '{}'); } catch(e) {}
  // Ha még sosem nyitott/csukott a felhasználó: default
  const noPref = Object.keys(collapsed).length === 0;
  if (noPref && catKeys.length > 5) {
    catKeys.forEach(c => collapsed[c] = true);
    // v2.39.3 fix: a default csukott állapotot perzisztáljuk, különben az első kattintás
    // után minden kinyílik (toggleStockCat összes többi cat undefined→falsy→nyitva)
    localStorage.setItem(collapsedKey, JSON.stringify(collapsed));
  }

  let html = '';
  catKeys.forEach(cat => {
    const isCollapsed = !!collapsed[cat];
    const ingCount = cats[cat].length;
    // Aggregálás: hány alacsony/kritikus van a kategóriában
    const lows = cats[cat].filter(i => {
      const stock = getTotalStock(i);
      return i.minStock > 0 && stock < i.minStock;
    }).length;
    const lowBadge = lows > 0
      ? `<span style="background:#fef3c7;color:#92400e;font-size:0.7rem;padding:2px 7px;border-radius:8px;margin-left:8px">⚠️ ${lows}</span>`
      : '';

    html += `<div style="margin-bottom:16px;border:1px solid var(--border);border-radius:12px;overflow:hidden;background:white">
      <div data-action="toggleStockCat" data-arg1="${esc(cat)}" style="cursor:pointer;font-weight:700;font-size:0.85rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--teal-dark);padding:12px 16px;background:var(--teal-pale);display:flex;justify-content:space-between;align-items:center;user-select:none">
        <div>
          <span style="display:inline-block;width:14px;color:var(--gold-dark);transform:${isCollapsed?'rotate(-90deg)':'none'};transition:transform 0.2s">▼</span>
          ${esc(cat)} <span style="font-weight:400;color:var(--text-soft);font-size:0.75rem;text-transform:none;margin-left:4px">(${ingCount})</span>
          ${lowBadge}
        </div>
      </div>`;

    if (!isCollapsed) {
      html += `<div style="padding:8px 12px">`;
      cats[cat].forEach(ing => {
      const stock = Math.round(getTotalStock(ing));
      const minS = ing.minStock;
      const maxS = ing.maxStock;
      const isOk = maxS > 0 ? stock >= minS : stock > 0;
      const isCrit = minS > 0 && stock < minS * 0.5;
      const isLow = minS > 0 && stock < minS && !isCrit;
      const statusColor = isCrit ? '#dc2626' : isLow ? '#d97706' : '#059669';
      const statusBg = isCrit ? '#fef2f2' : isLow ? '#fffbeb' : '#f0fdf4';
      const statusLabel = isCrit ? '🔴 Kritikus' : isLow ? '⚠️ Alacsony' : stock === 0 ? '⬜ Üres' : '✅ Rendben';

      // Progress bar
      const pct = maxS > 0 ? Math.min(100, Math.round(stock / maxS * 100)) : (stock > 0 ? 100 : 0);
      const barColor = isCrit ? '#ef4444' : isLow ? '#f59e0b' : '#10b981';

      // FIFO + avg price
      const fifoP = ing.fifoPrice || 0;
      const avgP = ing.avgPrice || 0;
      const priceStr = fifoP > 0
        ? `FIFO: <b>${(fifoP*1000).toFixed(2)} lej/kg</b>${avgP !== fifoP ? ` · Átlag: ${(avgP*1000).toFixed(2)} lej/kg` : ''}`
        : '<span style="color:var(--text-soft)">Nincs árinfo</span>';

      // Min/max display
      const mmLabel = ing.isOverride
        ? `<span title="Kézi beállítás" data-tip="Kézi beállítás" style="color:#7c3aed">🔒 ${minS.toLocaleString()}–${maxS.toLocaleString()}g</span>`
        : ing.minStockAutoG > 0
          ? `<span title="Automatikus számítás" data-tip="Automatikus számítás">🤖 ${minS.toLocaleString()}–${maxS.toLocaleString()}g</span>`
          : '<span style="color:var(--text-soft)">Nincs adat még</span>';

      // Batches count
      const batches = R.batches.filter(b => b.ingredientId === ing.id && b.qtyRemainingG > 0);

      html += `<div style="background:white;border:1.5px solid ${statusColor}22;border-radius:12px;padding:14px 16px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
          <div>
            <div style="font-weight:700;font-size:0.9rem">${esc(ing.name)}</div>
            <div style="font-size:0.72rem;color:var(--text-soft);margin-top:2px">${priceStr}${ing.basePriceG>0&&fifoP===0?' · <span style="color:#b45309">📌 Alap: '+(ing.basePriceG*1000).toFixed(2)+' lej/kg</span>':''}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:1.1rem;font-weight:800;color:${statusColor};font-family:'Fraunces',serif">${stock.toLocaleString()}g</div>
            <div style="font-size:0.7rem;background:${statusBg};color:${statusColor};padding:1px 8px;border-radius:10px;font-weight:600">${statusLabel}</div>
          </div>
        </div>

        ${maxS > 0 ? `
        <div style="background:#f3f4f6;border-radius:6px;height:6px;margin-bottom:8px;overflow:hidden">
          <div style="background:${barColor};height:100%;width:${pct}%;border-radius:6px;transition:width 0.3s"></div>
        </div>
        ` : ''}

        <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.75rem;color:var(--text-soft)">
          <div>Min–Max: ${mmLabel}</div>
          <div style="display:flex;gap:6px">
            ${batches.length > 0 ? `<span style="background:var(--teal-pale);color:var(--teal-dark);padding:2px 8px;border-radius:10px;font-size:0.7rem">${batches.length} batch</span>` : ''}
            <button onclick="openStockIntakeModal(${ing.id})" style="background:var(--teal-dark);color:var(--gold);border:none;border-radius:6px;padding:3px 10px;cursor:pointer;font-size:0.75rem;font-weight:600">📦 Bevételezés</button>
            <button onclick="openMinMaxEditor(${ing.id})" style="background:${ing.isOverride?'#7c3aed':'var(--bg-soft)'};color:${ing.isOverride?'white':'var(--text-soft)'};border:none;border-radius:6px;padding:3px 10px;cursor:pointer;font-size:0.75rem">✏️ Min/Max</button>
            <button onclick="openPriceEditor(${ing.id})" style="background:${ing.basePriceG>0?'#b45309':'var(--bg-soft)'};color:${ing.basePriceG>0?'white':'var(--text-soft)'};border:none;border-radius:6px;padding:3px 10px;cursor:pointer;font-size:0.75rem">💰 Ár</button>
            <button onclick="deleteIngredient(${ing.id})" style="background:none;border:none;color:#9ca3af;cursor:pointer;font-size:0.75rem;padding:3px 6px" title="Törlés" data-tip="Törlés">🗑️</button>
          </div>
        </div>

        ${batches.length > 0 ? `
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);font-size:0.72rem;color:var(--text-soft)">
          <b>Batch-ek (FIFO):</b>
          ${batches.sort((a,b)=>a.receivedDate.localeCompare(b.receivedDate)).map((b,i) => `
            <span style="display:inline-block;background:${i===0?'var(--teal-pale)':'#f9fafb'};border:1px solid var(--border);border-radius:6px;padding:2px 8px;margin:2px">
              ${b.receivedDate} · ${Math.round(b.qtyRemainingG).toLocaleString()}g
              ${b.pricePerG>0 ? `· ${(b.pricePerG*1000).toFixed(2)} lej/kg` : ''}
              ${b.supplierName ? `· ${esc(b.supplierName)}` : ''}
            </span>`).join('')}
        </div>` : ''}
      </div>`;
    });
      html += '</div>';  // close padding wrapper
    }  // end if (!isCollapsed)
    html += '</div>';  // close kategória card
  });

  el.innerHTML = html || '<p class="text-soft text-sm">Nincsenek alapanyagok. Töltsd be a receptúra beállításokban.</p>';
}

// v2.39.2: kategória összecsuk/kinyit
function toggleStockCat(cat) {
  const key = 'kerek_stock_cat_collapsed';
  let state = {};
  try { state = JSON.parse(localStorage.getItem(key) || '{}'); } catch(e) {}
  state[cat] = !state[cat];
  localStorage.setItem(key, JSON.stringify(state));
  renderStock();
}
if (typeof window !== 'undefined') window.toggleStockCat = toggleStockCat;

function openMinMaxEditor(ingId) {
  const ing = getIng(ingId);
  if (!ing) return;
  const modal = document.getElementById('min-max-modal') || (() => {
    const m = document.createElement('div');
    m.id = 'min-max-modal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    document.body.appendChild(m); return m;
  })();

  modal.innerHTML = `<div style="background:white;border-radius:16px;padding:24px;width:100%;max-width:400px">
    <h3 style="font-family:'Fraunces',serif;color:var(--teal-dark);margin:0 0 8px">✏️ Min/Max szint</h3>
    <div style="font-weight:600;margin-bottom:16px">${esc(ing.name)}</div>
    <div style="background:var(--bg-soft);border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:0.82rem">
      🤖 Auto számított: min <b>${ing.minStockAutoG.toLocaleString()}g</b> · max <b>${ing.maxStockAutoG.toLocaleString()}g</b>
      ${ing.autoUpdatedAt ? `<br><span style="color:var(--text-soft)">${new Date(ing.autoUpdatedAt).toLocaleDateString('hu-HU')}</span>` : ''}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div>
        <label style="font-size:0.8rem;font-weight:600;color:var(--teal-dark);display:block;margin-bottom:4px">Min készlet (g)</label>
        <input type="number" id="mm-min" value="${ing.minStockOverrideG ?? ing.minStockAutoG}"
          style="width:100%;padding:8px;border:1.5px solid var(--border);border-radius:8px;font-family:'Kodchasan',sans-serif;box-sizing:border-box">
      </div>
      <div>
        <label style="font-size:0.8rem;font-weight:600;color:var(--teal-dark);display:block;margin-bottom:4px">Max készlet (g)</label>
        <input type="number" id="mm-max" value="${ing.maxStockOverrideG ?? ing.maxStockAutoG}"
          style="width:100%;padding:8px;border:1.5px solid var(--border);border-radius:8px;font-family:'Kodchasan',sans-serif;box-sizing:border-box">
      </div>
    </div>
    <div style="display:flex;gap:8px">
      <button onclick="setStockOverride(${ingId},document.getElementById('mm-min').value,document.getElementById('mm-max').value);document.getElementById('min-max-modal').style.display='none'"
        class="btn btn-primary" style="flex:1">🔒 Kézi beállítás mentése</button>
    </div>
    ${ing.isOverride ? `<button onclick="clearStockOverride(${ingId});document.getElementById('min-max-modal').style.display='none'"
      style="width:100%;margin-top:8px;padding:7px;background:none;border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:0.8rem;color:var(--text-soft)">
      🤖 Visszaváltás automatikus számításra</button>` : ''}
    <button onclick="document.getElementById('min-max-modal').style.display='none'"
      style="width:100%;margin-top:6px;padding:7px;background:none;border:none;cursor:pointer;font-size:0.8rem;color:var(--text-soft)">Mégse</button>
  </div>`;

  modal.style.display = 'flex';
}


function openPriceEditor(ingId) {
  const ing = getIng(ingId);
  if (!ing) return;
  const modal = document.getElementById('price-edit-modal') || (() => {
    const m = document.createElement('div');
    m.id = 'price-edit-modal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    document.body.appendChild(m); return m;
  })();

  const fifoP = (ing.fifoPrice || 0) * 1000;
  const baseP = (ing.basePriceG || 0) * 1000;

  modal.innerHTML = `<div style="background:white;border-radius:16px;padding:24px;width:100%;max-width:400px">
    <h3 style="font-family:'Fraunces',serif;color:var(--teal-dark);margin:0 0 8px">💰 Alap ár beállítás</h3>
    <div style="font-weight:600;margin-bottom:12px">${esc(ing.name)}</div>
    <div style="background:var(--bg-soft);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:0.82rem">
      ${fifoP > 0 ? `🔄 FIFO ár (legutóbbi batch): <b>${fifoP.toFixed(2)} lej/kg</b>` : '⚠️ Nincs batch bevételezés, ezért nincs FIFO ár.'}
      <div style="font-size:0.75rem;color:var(--text-soft);margin-top:4px">Az alap ár a kalkuláció fallback-je ha nincs batch.</div>
    </div>
    <div style="margin-bottom:14px">
      <label style="font-size:0.82rem;font-weight:600;color:var(--teal-dark);display:block;margin-bottom:6px">Alap ár (lej/kg)</label>
      <input type="number" id="pe-price" min="0" step="0.1" value="${baseP > 0 ? baseP.toFixed(2) : ''}" placeholder="pl. 12.50"
        style="width:100%;padding:10px;border:1.5px solid var(--border);border-radius:8px;font-size:0.95rem;font-family:'Kodchasan',sans-serif;box-sizing:border-box">
    </div>
    <div style="display:flex;gap:8px">
      <button onclick="saveBasePrice(${ingId})" class="btn btn-primary" style="flex:1">✅ Mentés</button>
      <button onclick="document.getElementById('price-edit-modal').style.display='none'" style="padding:8px 16px;background:none;border:1px solid var(--border);border-radius:8px;cursor:pointer">Mégse</button>
    </div>
  </div>`;
  modal.style.display = 'flex';
  setTimeout(() => modal.querySelector('#pe-price')?.focus(), 100);
}

async function saveBasePrice(ingId) {
  const ing = getIng(ingId);
  if (!ing) return;
  const pricePerKg = parseFloat(document.getElementById('pe-price')?.value) || 0;
  ing.basePriceG = pricePerKg / 1000;
  try {
    await sb.update('ingredients', { base_price_per_g: ing.basePriceG }, `id=eq.\${ingId}`);
    document.getElementById('price-edit-modal').style.display = 'none';
    toast(`✅ Alap ár mentve: \${pricePerKg.toFixed(2)} lej/kg`);
    renderStock();
  } catch(e) { toast('⚠️ Mentés sikertelen: ' + e.message, true); }
}

async function deleteIngredient(ingId) {
  const ing = getIng(ingId);
  if (!ing) return;
  const hasRecipes = R.recipes.some(r =>
    [...(r.allIngredients||[]), ...(r.dryIngredients||[]), ...(r.wetIngredients||[])].some(i => i.ingredientId === ingId)
  );
  if (hasRecipes) {
    toast('⚠️ Ez az alapanyag receptekben van használatban. Előbb vedd ki a receptekből!', true);
    return;
  }
  if (!(await confirmDialog(`Törlöd: "\${ing.name}"? Ez nem visszavonható!`))) return;
  try {
    await sb.delete('ingredients', `id=eq.\${ingId}`);
    R.ingredients = R.ingredients.filter(i => i.id !== ingId);
    toast('✅ Alapanyag törölve.');
    renderStock();
  } catch(e) { toast('⚠️ Törlés sikertelen: ' + e.message, true); }
}

function exportShoppingListCSV() {
  const productionNeeds = window._lastProductionNeeds || {};
  const rows = [['Alapanyag', 'Készlet (g)', 'Szükséges (g)', 'Hiány (g)', 'FIFO ár (lej/kg)', 'Átlagár (lej/kg)', 'Forrás']];
  R.ingredients.forEach(ing => {
    const stock = Math.round(getTotalStock(ing));
    const needed = Math.round(productionNeeds[ing.id]?.total || 0);
    const deficit = Math.max(0, needed - stock);
    if (stock === 0 && needed === 0) return;
    rows.push([ing.name, stock, needed, deficit,
      (ing.fifoPrice*1000).toFixed(2), (ing.avgPrice*1000).toFixed(2),
      ing.suppliers?.join('; ') || '']);
  });
  const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `keszlet_${localToday()}.csv`;
  a.click();
}
