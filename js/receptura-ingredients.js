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
    const fifoPrice = (getFifoPrice(i)*1000).toFixed(3);
    const suppCount = i.suppliers?.length||1;
    return `<tr>
      <td><b>${i.name}</b><br><span style="font-size:0.7rem;color:var(--text-soft)">${subTypeLabel(i.subType)}</span></td>
      <td><span class="badge badge-teal">${i.cat}</span></td>
      <td class="text-soft text-xs">${i.suppliers?.map(s=>s.source).filter(Boolean).join(', ')||'—'} ${suppCount>1?`<span class="badge badge-blue" style="font-size:0.65rem">${suppCount} partner</span>`:''}</td>
      <td class="num">${stock.toLocaleString()} g</td>
      <td class="num gold">${fifoPrice} lej/kg</td>
      <td><span class="badge ${statusClass}">${stock===0?'Elfogyott':stock<critical?'Kritikus':'OK'}</span></td>
      <td><button class="btn btn-ghost btn-xs" onclick="openIngredientModal(${i.id})">✏️</button></td>
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
  if (id) {
    const i = R.ingredients.find(ing=>ing.id===id);
    document.getElementById('i-name').value = i.name;
    document.getElementById('i-category').value = i.cat;
    document.getElementById('i-subtype').value = i.subType || 'flour';
    document.getElementById('i-min-stock').value = i.minStock||0;
    document.getElementById('i-critical-stock').value = i.criticalStock||0;
    modalSuppliers = JSON.parse(JSON.stringify(i.suppliers||[]));
    document.getElementById('ing-modal-title').textContent = 'Alapanyag szerkesztése';
  } else {
    ['i-name','i-min-stock','i-critical-stock'].forEach(x=>document.getElementById(x).value='');
    document.getElementById('i-subtype').value = 'flour';
    modalSuppliers = [{source:'',priceGross:0,priceNet:0,package:1000,stock:0,date:new Date().toISOString().slice(0,10)}];
    document.getElementById('ing-modal-title').textContent = 'Új alapanyag';
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
          <input type="date" value="${s.date||new Date().toISOString().slice(0,10)}" onchange="updateSupplier(${i},'date',this.value)"></div>
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
  modalSuppliers.push({source:'',priceGross:0,priceNet:0,package:1000,stock:0,date:new Date().toISOString().slice(0,10)});
  renderSupplierRows();
}
function removeSupplier(i) { modalSuppliers.splice(i,1); renderSupplierRows(); }

// kept for compatibility

function saveIngredient() {
  const name = document.getElementById('i-name').value.trim();
  if (!name) { toast('Megnevezés kötelező!'); return; }
  if (modalSuppliers.length === 0) { toast('Legalább egy beszállító szükséges!'); return; }
  // Sort suppliers by date for FIFO
  const sortedSuppliers = [...modalSuppliers].sort((a,b)=>new Date(a.date)-new Date(b.date));
  const firstSupplier = sortedSuppliers[0];
  const data = {
    name,
    cat: document.getElementById('i-category').value,
    subType: document.getElementById('i-subtype').value,
    suppliers: sortedSuppliers,
    pricePerG: firstSupplier.priceNet / firstSupplier.package,
    minStock: parseFloat(document.getElementById('i-min-stock').value)||0,
    criticalStock: parseFloat(document.getElementById('i-critical-stock').value)||0,
  };
  if (editingIngId) {
    Object.assign(R.ingredients.find(i=>i.id===editingIngId), data);
    toast('Alapanyag frissítve!');
  } else {
    data.id = Math.max(...R.ingredients.map(i=>i.id),0)+1;
    R.ingredients.push(data);
    toast('Alapanyag hozzáadva!');
  }
  save(); closeModal('ingredient-modal'); renderIngredients();
}
