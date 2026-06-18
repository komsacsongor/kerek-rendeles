// ===== INGREDIENTS VIEW =====
let ingCatFilter = 'Mind';
function renderIngredients() {
  document.getElementById('vat-display').textContent = R.settings.vat;
  document.getElementById('margin-display').textContent = R.settings.margin;

  const cats = ['Mind', ...R.ingredientCategories];
  document.getElementById('ing-category-filter').innerHTML = cats.map(c=>
    `<button class="btn ${c===ingCatFilter?'btn-primary':'btn-ghost'} btn-sm" onclick="filterIngredients('${c}',this)">${c}</button>`
  ).join('');

  const filtered = ingCatFilter==='Mind' ? R.ingredients : R.ingredients.filter(i=>i.cat===ingCatFilter);
  document.getElementById('ingredients-tbody').innerHTML = filtered.map(i=>{
    const stock = getTotalStock(i);
    const min = i.minStock||0;
    const critical = i.criticalStock||min*1.3;
    const statusClass = stock===0?'badge-red':stock<critical?'badge-gold':'badge-green';
    const fifoPriceStr = fmtPriceUnit(getFifoPrice(i), i.unit);
    const suppCount = i.suppliers?.length||1;
    // v2.35.0: state badge
    const stateBadge = {
      'raw':          '<span title="Nyersanyag" data-tip="Nyersanyag" style="font-size:0.85rem">🌱</span>',
      'intermediate': '<span title="Köztermék" data-tip="Köztermék" style="font-size:0.85rem">🔄</span>',
      'finished':     '<span title="Késztermék" data-tip="Késztermék" style="font-size:0.85rem">📦</span>',
      'consumable':   ''
    }[i.materialType || 'consumable'] || '';
    const familyName = i.familyId && R.ingredientFamilies
      ? R.ingredientFamilies.find(f => f.id === i.familyId)?.name
      : null;
    const familyTag = familyName ? ` <span class="badge" style="background:#e0f2fe;color:#075985;font-size:0.62rem">👪 ${esc(familyName)}</span>` : '';
    return `<tr>
      <td>${stateBadge} <b>${i.name}</b>${familyTag}<br><span style="font-size:0.7rem;color:var(--text-soft)">${subTypeLabel(i.subType)}</span></td>
      <td><span class="badge badge-teal">${i.cat}</span></td>
      <td class="text-soft text-xs">${i.suppliers?.map(s=>s.source).filter(Boolean).join(', ')||'—'} ${suppCount>1?`<span class="badge badge-blue" style="font-size:0.65rem">${suppCount} partner</span>`:''}</td>
      <td class="num">${fmtQtyUnit(stock, i.unit)}</td>
      <td class="num gold">${fifoPriceStr}</td>
      <td><span class="badge ${statusClass}">${stock===0?'Elfogyott':stock<critical?'Kritikus':'OK'}</span></td>
      <td>
        <button class="btn btn-ghost btn-xs" onclick="openIngredientModal(${i.id})" title="Szerkesztés" data-tip="Szerkesztés">✏️</button>
        <button class="btn btn-ghost btn-xs" data-action="openMillingProfileEditor" data-arg1="${i.id}" title="Malmolási profil" data-tip="Malmolási profil">🧬</button>
      </td>
    </tr>`;}).join('');
}

function filterIngredients(cat, btn) {
  ingCatFilter = cat;
  document.querySelectorAll('#ing-category-filter .btn').forEach(b=>{
    b.className = b===btn ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
  });
  renderIngredients();
}

let editingIngId = null;
let modalSuppliers = [];

function openIngredientModal(id=null) {
  editingIngId = id;
  document.getElementById('i-category').innerHTML = R.ingredientCategories.map(c=>`<option>${c}</option>`).join('');
  // v2.35.0: populate family select
  const familySelect = document.getElementById('i-family');
  if (familySelect) {
    const families = R.ingredientFamilies || [];
    familySelect.innerHTML = '<option value="">— Nincs család —</option>' +
      families.map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join('');
  }
  if (id) {
    const i = R.ingredients.find(ing=>ing.id===id);
    document.getElementById('i-name').value = i.name;
    document.getElementById('i-category').value = i.cat;
    document.getElementById('i-subtype').value = i.subType || 'flour';
    document.getElementById('i-unit').value = i.unit || 'g';
    document.getElementById('i-material-type').value = i.materialType || 'consumable';
    document.getElementById('i-family').value = i.familyId || '';
    document.getElementById('i-min-stock').value = i.minStock||0;
    document.getElementById('i-critical-stock').value = i.criticalStock||0;
    modalSuppliers = JSON.parse(JSON.stringify(i.suppliers||[]));
    document.getElementById('ing-modal-title').textContent = 'Alapanyag szerkesztése';
  } else {
    ['i-name','i-min-stock','i-critical-stock'].forEach(x=>document.getElementById(x).value='');
    document.getElementById('i-subtype').value = 'flour';
    document.getElementById('i-unit').value = 'g';
    document.getElementById('i-material-type').value = 'consumable';
    document.getElementById('i-family').value = '';
    modalSuppliers = [{source:'',priceGross:0,priceNet:0,package:1000,stock:0,date:localToday()}];
    document.getElementById('ing-modal-title').textContent = 'Új alapanyag';
  }
  // v2.40.0: preferred supplier dropdown feltöltése
  const prefSelect = document.getElementById('i-preferred-supplier');
  if (prefSelect) {
    const activeSups = (R.suppliers || []).filter(s => s.active !== false).sort((a,b) => (a.name||'').localeCompare(b.name||'', 'hu'));
    prefSelect.innerHTML = '<option value="">— Nincs (legutóbbi bevétel beszállítója használandó) —</option>' +
      activeSups.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    if (id) {
      const i = R.ingredients.find(ing=>ing.id===id);
      prefSelect.value = i?.preferredSupplierId || '';
    } else {
      prefSelect.value = '';
    }
  }
  renderSupplierRows();
  document.getElementById('ingredient-modal').classList.add('open');
}

function renderSupplierRows() {
  document.getElementById('suppliers-list').innerHTML = modalSuppliers.map((s,i) => `
    <div style="border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px;background:${i===0?'var(--teal-pale)':'white'}">
      <div style="font-size:0.72rem;font-weight:600;color:var(--teal-mid);margin-bottom:8px">${i===0?'🔵 Aktív (FIFO 1.)':'🔘 Következő (FIFO '+(i+1)+')'}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <div class="form-group" style="flex:2;min-width:120px"><label>Forrás / Bolt</label>
          <input type="text" value="${s.source||''}" placeholder="pl. Grizly" onchange="updateSupplier(${i},'source',this.value)"></div>
        <div class="form-group" style="min-width:80px"><label>Bruttó ár (lej)</label>
          <input type="number" value="${s.priceGross||''}" placeholder="12" onchange="updateSupplier(${i},'priceGross',parseFloat(this.value)||0);updateSupplierNet(${i})"></div>
        <div class="form-group" style="min-width:80px"><label>Nettó ár</label>
          <input type="number" value="${s.priceNet||''}" id="sup-net-${i}" placeholder="9.72" onchange="updateSupplier(${i},'priceNet',parseFloat(this.value)||0)"></div>
        <div class="form-group" style="min-width:80px"><label>Kiszerelés (g)</label>
          <input type="number" value="${s.package||1000}" onchange="updateSupplier(${i},'package',parseFloat(this.value)||1000)"></div>
        <div class="form-group" style="min-width:80px"><label>Készlet (g)</label>
          <input type="number" value="${s.stock||0}" onchange="updateSupplier(${i},'stock',parseFloat(this.value)||0)"></div>
        <div class="form-group" style="min-width:100px"><label>Dátum (FIFO)</label>
          <input type="date" value="${s.date||localToday()}" onchange="updateSupplier(${i},'date',this.value)"></div>
        ${i>0?`<button class="btn btn-danger btn-xs" style="align-self:flex-end;margin-bottom:4px" onclick="removeSupplier(${i})">✕</button>`:''}
      </div>
    </div>`).join('');
}

function updateSupplier(i, field, val) { modalSuppliers[i][field] = val; }
function updateSupplierNet(i) {
  const s = modalSuppliers[i];
  s.priceNet = s.priceGross / (1 + R.settings.vat/100);
  const el = document.getElementById(`sup-net-${i}`);
  if(el) el.value = s.priceNet.toFixed(2);
}
function addSupplierRow() {
  modalSuppliers.push({source:'',priceGross:0,priceNet:0,package:1000,stock:0,date:localToday()});
  renderSupplierRows();
}
function removeSupplier(i) { modalSuppliers.splice(i,1); renderSupplierRows(); }

// kept for compatibility

async function saveIngredient() {
  const name = document.getElementById('i-name').value.trim();
  if (!name) { toast('Megnevezés kötelező!'); return; }
  if (modalSuppliers.length === 0) { toast('Legalább egy beszállító szükséges!'); return; }
  // Sort suppliers by date for FIFO
  const sortedSuppliers = [...modalSuppliers].sort((a,b)=>new Date(a.date)-new Date(b.date));
  const firstSupplier = sortedSuppliers[0];
  const materialType = document.getElementById('i-material-type')?.value || 'consumable';
  const unit = document.getElementById('i-unit')?.value || 'g';
  const familyIdRaw = document.getElementById('i-family')?.value || '';
  const familyId = familyIdRaw ? parseInt(familyIdRaw) : null;
  const data = {
    name,
    cat: document.getElementById('i-category').value,
    subType: document.getElementById('i-subtype').value,
    unit,
    materialType,
    familyId,
    suppliers: sortedSuppliers,
    pricePerG: firstSupplier.priceNet / firstSupplier.package,
    minStock: parseFloat(document.getElementById('i-min-stock').value)||0,
    criticalStock: parseFloat(document.getElementById('i-critical-stock').value)||0,
  };
  if (editingIngId) {
    Object.assign(R.ingredients.find(i=>i.id===editingIngId), data);
    // v2.35.0: persist material_type + family_id + unit to DB
    try {
      await sb.update('ingredients', { material_type: materialType, family_id: familyId, unit }, 'id=eq.' + editingIngId);
    } catch(e) { console.warn('DB ingredient update failed:', e.message); }
    toast('Alapanyag frissítve!');
  } else {
    data.id = Math.max(...R.ingredients.map(i=>i.id),0)+1;
    R.ingredients.push(data);
    toast('Alapanyag hozzáadva!');
  }
  save(); closeModal('ingredient-modal'); renderIngredients();
}

// ===== v2.35.0: INGREDIENT FAMILY DIALOG =====
async function openNewFamilyDialog() {
  const name = prompt('Új család neve (pl. "Barna rizs", "Hajdina", "Köles"):');
  if (!name || !name.trim()) return;
  const trimmed = name.trim();
  // Duplicate check
  if ((R.ingredientFamilies || []).some(f => f.name.toLowerCase() === trimmed.toLowerCase())) {
    toast('⚠️ Ilyen nevű család már létezik!', true);
    return;
  }
  try {
    const result = await sb.insert('ingredient_families', { name: trimmed });
    const newFam = result?.[0];
    if (!newFam) throw new Error('Nem jött vissza új család');
    if (!R.ingredientFamilies) R.ingredientFamilies = [];
    R.ingredientFamilies.push(newFam);
    R.ingredientFamilies.sort((a,b) => a.name.localeCompare(b.name));
    // Refresh select in modal
    const sel = document.getElementById('i-family');
    if (sel) {
      sel.innerHTML = '<option value="">— Nincs család —</option>' +
        R.ingredientFamilies.map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join('');
      sel.value = newFam.id;
    }
    toast('✅ Új család hozzáadva: ' + trimmed);
  } catch(e) {
    toast('⚠️ Hiba: ' + e.message, true);
  }
}
