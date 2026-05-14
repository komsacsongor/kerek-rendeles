// ===== STOCK ALERTS =====
function renderStockAlerts() {
  const now = new Date();
  const mainData = JSON.parse(localStorage.getItem('kerek_admin_data') || '{}');

  // Calculate daily consumption from recent orders
  const criticalIngs = [];
  const emptyIngs = [];

  R.ingredients.forEach(ing => {
    const stock = getTotalStock(ing);
    const min = ing.minStock || 0;
    const critical = ing.criticalStock || min * 1.3;

    if(stock === 0) {
      emptyIngs.push(ing);
    } else if(stock < critical) {
      criticalIngs.push({ing, stock, deficit: Math.round(critical - stock)});
    }
  });

  if(criticalIngs.length === 0 && emptyIngs.length === 0) {
    document.getElementById('stock-alerts').innerHTML = `
      <div style="background:var(--green-pale);border:1px solid #86efac;border-radius:12px;padding:14px 18px;color:var(--green);font-weight:600;margin-bottom:16px">
        ✅ Minden alapanyag készlete megfelelő szinten van.
      </div>`;
    return;
  }

  let html = '';
  if(emptyIngs.length > 0) {
    html += `<div style="background:var(--red-pale);border:1.5px solid #fca5a5;border-radius:12px;padding:14px 18px;margin-bottom:12px">
      <div style="font-weight:700;color:var(--red);margin-bottom:8px">🔴 Elfogyott alapanyagok (${emptyIngs.length})</div>`;
    emptyIngs.forEach(ing => {
      html += `<div style="display:flex;justify-content:space-between;font-size:0.82rem;padding:3px 0">
        <span>${ing.name}</span><span style="color:var(--red);font-weight:700">0 g – ELFOGYOTT</span></div>`;
    });
    html += `</div>`;
  }

  if(criticalIngs.length > 0) {
    html += `<div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:12px;padding:14px 18px;margin-bottom:12px">
      <div style="font-weight:700;color:var(--gold-dark);margin-bottom:8px">⚠️ Kritikus szint alatt (${criticalIngs.length}) – 5 napon belül rendelj!</div>`;
    criticalIngs.forEach(({ing, stock, deficit}) => {
      html += `<div style="display:flex;justify-content:space-between;font-size:0.82rem;padding:3px 0">
        <span>${ing.name}</span>
        <span><b style="color:var(--gold-dark)">${stock.toLocaleString()}g</b> <span style="color:var(--text-soft)">(min: ${(ing.minStock||0).toLocaleString()}g, hiány: ${deficit.toLocaleString()}g)</span></span>
      </div>`;
    });
    html += `</div>`;
  }

  document.getElementById('stock-alerts').innerHTML = html;
}

// ===== SHOPPING LIST CSV EXPORT =====
function exportShoppingListCSV() {
  const needs = window._lastProductionNeeds;
  if(!needs) { alert('Először számold ki a gyártás előkészítést!'); return; }

  const BOM = '﻿';
  const SEP = ';';
  const rows = [
    ['KEREK – Bevásárló lista', '', '', '', ''],
    ['Generálva:', new Date().toLocaleDateString('hu-HU'), '', '', ''],
    ['', '', '', '', ''],
    ['Alapanyag','Kategória','Szükséges (g)','Készlet (g)','Hiány (g)','Egységár (lej/kg)','Becsült költség (lej)','Forrás / Beszállító'],
  ];

  Object.values(needs).sort((a,b)=>a.subType?.localeCompare(b.subType)||0).forEach(n => {
    const ing = getIng(n.ingId);
    const stock = getTotalStock(ing);
    const deficit = Math.max(0, Math.round(n.total) - stock);
    const ppkg = ing ? (getFifoPrice(ing)*1000).toFixed(2) : '';
    const supplier = ing?.suppliers?.[0]?.source || '';
    rows.push([
      n.name,
      subTypeLabel(n.subType || 'other_dry'),
      Math.round(n.total),
      stock,
      deficit > 0 ? deficit : '',
      ppkg,
      n.cost.toFixed(2),
      supplier,
    ]);
  });

  const csv = BOM + rows.map(r => r.map(c => {
    const s = String(c==null?'':c);
    return s.includes(SEP)||s.includes('"') ? `"${s.replace(/"/g,'""')}"` : s;
  }).join(SEP)).join('\n');

  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=`kerek_bevasarlo_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ===== COST ANALYSIS =====
function renderCostAnalysis() {
  const costs = R.recipes.map(r=>({r, c10:calcRecipeCost(r,10), c15:calcRecipeCost(r,15)}));
  document.getElementById('cost-stats').innerHTML = [
    {val:R.recipes.length+' recept',label:'Összesen',icon:'📋'},
    {val:costs.reduce((a,x)=>a+x.c10.costPerUnit,0).toFixed(2)+' lej',label:'Átl. önköltség/db (10db)',icon:'💰',gold:true},
    {val:costs.reduce((a,x)=>a+x.c10.priceGross,0).toFixed(2)+' lej',label:'Átl. bruttó ár (10db)',icon:'🏷'},
    {val:costs.reduce((a,x)=>a+(x.c10.costPerUnit-x.c15.costPerUnit),0).toFixed(2)+' lej',label:'Potenciális megtakarítás (15db)',icon:'📈',green:true},
  ].map(s=>`<div class="stat-box"><div class="stat-val sm ${s.gold?'gold':''}" style="${s.green?'color:var(--green)':''}">${s.val}</div><div class="stat-label">${s.icon} ${s.label}</div></div>`).join('');

  document.getElementById('cost-analysis-tbody').innerHTML = costs.map(({r,c10,c15})=>`
    <tr>
      <td><b>${r.name}</b><br><small class="text-soft">${r.category} · ${r.unitWeight||r.basePortion}g</small></td>
      <td class="num">${c10.costPerUnit.toFixed(2)} lej</td>
      <td class="num">${c10.priceNet.toFixed(2)} lej</td>
      <td class="num gold">${c10.priceGross.toFixed(2)} lej</td>
      <td class="num" style="color:${c10.priceGross>c10.priceNet?'var(--green)':'var(--red)'}">
        ${(c10.priceGross-c10.priceNet).toFixed(2)} lej
      </td>
      <td class="num">${c15.priceGross.toFixed(2)} lej</td>
      <td class="num" style="color:var(--green)">${(c10.costPerUnit-c15.costPerUnit).toFixed(2)} lej</td>
    </tr>`).join('');
}

// ===== STOCK =====
function renderStock() {
  document.getElementById('stock-tbody').innerHTML = R.ingredients.map(ing=>{
    const stock = R.stock[ing.id]||0;
    const min = ing.minStock||0;
    const ok = stock >= min;
    return `<tr>
      <td><b>${ing.name}</b></td>
      <td class="num">
        <input type="number" value="${stock}" min="0" style="width:90px;padding:5px 8px;border:1.5px solid var(--border);border-radius:8px;text-align:right;font-family:'Kodchasan',sans-serif;font-size:0.85rem;outline:none"
          onchange="updateStock(${ing.id},this.value)">
      </td>
      <td class="num text-soft">${min.toLocaleString()} g</td>
      <td><span class="badge ${ok?'badge-green':'badge-red'}">${ok?'✓ Rendben':'⚠ Alacsony'}</span></td>
    </tr>`;
  }).join('');
}

function updateStock(id, val) {
  R.stock[id] = parseFloat(val)||0;
  save();
  // Supabase stock sync (debounced - nem minden billentyűleütésnél)
  clearTimeout(updateStock._t);
  updateStock._t = setTimeout(async () => {
    try { await sb.setSetting('recipe_stock', R.stock); } catch(e) { console.warn('Stock save:', e); }
  }, 1500);
}

function generateShoppingList() {
  // Combine stock deficit + production needs if available
  const productionNeeds = window._lastProductionNeeds || {};
  const items = [];

  R.ingredients.forEach(ing => {
    const stock = getTotalStock(ing);
    const minStock = ing.minStock || 0;
    const needed = productionNeeds[ing.id]?.total || 0;
    const required = Math.max(minStock, needed);
    const deficit = Math.max(0, Math.round(required) - stock);
    if (deficit <= 0 && needed <= 0) return;

    items.push({
      id: ing.id,
      name: ing.name,
      stock,
      needed: Math.round(needed),
      deficit,
      minStock,
      subType: ing.subType || 'other_dry',
      supplier: ing.suppliers?.[0]?.source || '—',
      checked: false
    });
  });

  if (items.length === 0) {
    toast('✅ Minden alapanyag elegendő!');
    return;
  }

  // Render shopping list panel
  const el = document.getElementById('shopping-list-panel');
  if (!el) { toast('⚠️ Shopping list panel nem található!', true); return; }

  const grouped = {};
  items.forEach(it => {
    if (!grouped[it.subType]) grouped[it.subType] = [];
    grouped[it.subType].push(it);
  });

  const labels = {flour:'Lisztek',other_dry:'Száraz összetevők',wet:'Folyadékok',starter:'Kovász'};
  const dayInfo = window._lastProductionDays?.length
    ? `<span style="font-size:0.78rem;color:var(--text-soft)">(${window._lastProductionDays.length} sütési napra számolva)</span>`
    : '<span style="font-size:0.78rem;color:var(--text-soft)">(csak készlet alapján)</span>';

  let html = `<div class="card"><div class="card-head" style="display:flex;justify-content:space-between;align-items:center">
    <div class="card-title">🛒 Bevásárló lista ${dayInfo}</div>
    <div style="display:flex;gap:8px">
      <button onclick="exportShoppingListCSV()" class="btn btn-ghost btn-sm">📥 CSV</button>
      <button onclick="document.getElementById('shopping-list-panel').innerHTML=''" class="btn btn-ghost btn-sm" style="color:var(--text-soft)">✕</button>
    </div>
  </div><div class="card-body-np">`;

  Object.entries(grouped).forEach(([st, grpItems]) => {
    html += `<div style="padding:10px 16px;border-bottom:1px solid var(--border)">
      <div style="font-weight:700;font-size:0.8rem;color:var(--teal-dark);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.04em">${labels[st]||st}</div>`;
    grpItems.sort((a,b) => b.deficit - a.deficit).forEach(it => {
      const urgency = it.deficit > 0 ? (it.stock === 0 ? '#fef2f2' : '#fffbeb') : '#f0fdf4';
      const urgencyBorder = it.deficit > 0 ? (it.stock === 0 ? '#fca5a5' : '#fde68a') : '#86efac';
      html += `<div style="display:flex;align-items:center;gap:10px;padding:8px;margin-bottom:6px;background:${urgency};border:1px solid ${urgencyBorder};border-radius:8px">
        <input type="checkbox" id="shop-${it.id}" style="width:16px;height:16px;accent-color:var(--teal);flex-shrink:0">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:0.84rem">${it.name}</div>
          <div style="font-size:0.72rem;color:var(--text-soft)">
            Készlet: <b>${it.stock.toLocaleString()}g</b>
            ${it.needed > 0 ? ` · Szükséges: <b>${it.needed.toLocaleString()}g</b>` : ''}
            ${it.supplier !== '—' ? ` · 🏪 ${it.supplier}` : ''}
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-weight:700;color:${it.deficit>0?'var(--red-dark)':'var(--green)'};font-size:0.9rem">
            ${it.deficit > 0 ? `+${it.deficit.toLocaleString()}g` : '✓'}
          </div>
          ${it.deficit > 0 ? `<div style="font-size:0.7rem;color:var(--text-soft)">rendelni</div>` : ''}
        </div>
      </div>`;
    });
    html += '</div>';
  });

  const totalDeficit = items.filter(i=>i.deficit>0).length;
  html += `<div style="padding:12px 16px;background:var(--teal-pale);font-size:0.82rem;color:var(--teal-dark);font-weight:600">
    ${totalDeficit > 0 ? `⚠️ ${totalDeficit} alapanyagot kell rendelni` : '✅ Minden alapanyag elegendő a szükséges mennyiséghez'}
  </div></div></div>`;

  el.innerHTML = html;
  el.scrollIntoView({behavior:'smooth', block:'start'});
}
