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

  let html = '';
  Object.keys(cats).sort().forEach(cat => {
    html += `<div style="margin-bottom:20px">
      <div style="font-weight:700;font-size:0.82rem;text-transform:uppercase;letter-spacing:0.05em;
        color:var(--teal-dark);padding:8px 16px;background:var(--teal-pale);border-radius:8px;margin-bottom:8px">
        ${cat} (${cats[cat].length} tétel)
      </div>`;

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
        ? `<span title="Kézi beállítás" style="color:#7c3aed">🔒 ${minS.toLocaleString()}–${maxS.toLocaleString()}g</span>`
        : ing.minStockAutoG > 0
          ? `<span title="Automatikus számítás">🤖 ${minS.toLocaleString()}–${maxS.toLocaleString()}g</span>`
          : '<span style="color:var(--text-soft)">Nincs adat még</span>';

      // Batches count
      const batches = R.batches.filter(b => b.ingredientId === ing.id && b.qtyRemainingG > 0);

      html += `<div style="background:white;border:1.5px solid ${statusColor}22;border-radius:12px;padding:14px 16px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
          <div>
            <div style="font-weight:700;font-size:0.9rem">${esc(ing.name)}</div>
            <div style="font-size:0.72rem;color:var(--text-soft);margin-top:2px">${priceStr}</div>
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
    html += '</div>';
  });

  el.innerHTML = html || '<p class="text-soft text-sm">Nincsenek alapanyagok. Töltsd be a receptúra beállításokban.</p>';
}

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
  a.download = `keszlet_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}
