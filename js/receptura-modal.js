// ===== RECIPE MODAL =====
let editingRecipeId = null;
let modalDryIngs = [], modalWetIngs = [], modalSteps = [];

function openRecipeModal(id=null) {
  editingRecipeId = id;
  document.getElementById('r-category').innerHTML = R.recipeCategories.map(c=>`<option>${c}</option>`).join('');

  if (id) {
    const r = R.recipes.find(r=>r.id===id);
    document.getElementById('r-name').value = r.name;
    document.getElementById('r-category').value = r.category;
    document.getElementById('r-base-portion').value = r.basePortion;
    document.getElementById('r-bake-loss').value = r.bakeLoss||R.settings.bakeLoss;
    document.getElementById('r-unit-weight').value = r.unitWeight||r.basePortion;
    document.getElementById('r-temp1').value = r.temp1||230;
    document.getElementById('r-time1').value = r.time1||20;
    document.getElementById('r-temp2').value = r.temp2||180;
    document.getElementById('r-time2').value = r.time2||70;
    document.getElementById('r-desc').value = r.desc||'';
  if(document.getElementById('r-marketing')) document.getElementById('r-marketing').value = r.marketing||'';
  if(document.getElementById('r-ingredient-label')) document.getElementById('r-ingredient-label').value = r.ingredientLabel||'';
  if(document.getElementById('r-allergens')) document.getElementById('r-allergens').value = r.allergens||'';
  if(r.nutrition) {
    const n = r.nutrition;
    ['kcal','kj','fat','satfat','carb','sugar','fiber','protein','salt'].forEach(k => {
      const el = document.getElementById('r-nut-'+k);
      if(el) el.value = n[k==='satfat'?'satFat':k]||'';
    });
  }
    document.getElementById('r-levain-amount').value = r.levainAmount||260;
    document.getElementById('r-labor-h').value = r.laborH||1;
    document.getElementById('r-electricity').value = r.electricity||5;
    if(document.getElementById('r-product-code')) { const el=document.getElementById('r-product-code'); el.value = r.productCode||''; el.placeholder='mentés után generálódik'; }
    if(document.getElementById('r-product-price')) document.getElementById('r-product-price').value = r.productPrice||0;   if(document.getElementById('r-product-price')) document.getElementById('r-product-price').value = r.productPrice||0;
    modalDryIngs = JSON.parse(JSON.stringify(r.dryIngredients||[]));
    modalWetIngs = JSON.parse(JSON.stringify(r.wetIngredients||[]));
    modalSteps = JSON.parse(JSON.stringify(r.steps||[]));
    document.getElementById('recipe-modal-title').textContent = 'Recept szerkesztése';
    document.getElementById('recipe-action-btns').style.display = 'flex';
  } else {
    const defaults = {'r-base-portion':'1000','r-bake-loss':'16','r-unit-weight':'1000',
      'r-temp1':'230','r-time1':'20','r-temp2':'185','r-time2':'30',
      'r-levain-amount':'260','r-labor-h':'1','r-electricity':'5'};
    ['r-name','r-base-portion','r-bake-loss','r-unit-weight','r-temp1','r-time1',
     'r-temp2','r-time2','r-desc','r-levain-amount','r-labor-h','r-electricity','r-text-input'].forEach(x=>{
      document.getElementById(x).value = defaults[x]||'';
    });
    modalDryIngs=[]; modalWetIngs=[]; modalSteps=[];
    document.getElementById('recipe-modal-title').textContent = 'Új recept';
    document.getElementById('recipe-action-btns').style.display = 'none';
  }
  renderModalIngredients(); renderModalSteps(); updateLevainPreview();
  // Termék kapcsolat: automatikus (syncRecipeToSupabase kezeli)
  document.getElementById('recipe-modal').classList.add('open');
}

function renderModalIngredients() {
  const ingOptions = R.ingredients.map(i=>`<option value="${i.id}">${i.name}</option>`).join('');
  ['dry','wet'].forEach(type=>{
    const list = type==='dry' ? modalDryIngs : modalWetIngs;
    document.getElementById(type+'-ingredients-list').innerHTML = list.map((ing,i)=>`
      <div class="ing-row" style="background:white;border:1px solid var(--border);border-radius:9px;margin-bottom:6px;padding:8px 10px">
        <div style="flex:2;display:flex;flex-direction:column;gap:4px">
          <input type="text" value="${ing.name}" placeholder="Összetevő neve" style="padding:5px 9px;border:1.5px solid var(--border);border-radius:7px;font-family:'Kodchasan',sans-serif;font-size:0.82rem;outline:none"
            onchange="updateModalIng('${type}',${i},'name',this.value)">
          <select style="padding:5px 9px;border:1.5px solid var(--border);border-radius:7px;font-family:'Kodchasan',sans-serif;font-size:0.78rem;outline:none;color:var(--text-soft)"
            onchange="updateModalIng('${type}',${i},'ingredientId',parseInt(this.value))">
            <option value="">— Árjegyzékből —</option>
            ${ingOptions}
          </select>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          <input type="number" value="${ing.amount}" placeholder="g" style="width:70px;padding:5px 8px;border:1.5px solid var(--border);border-radius:7px;text-align:right;font-family:'Kodchasan',sans-serif;font-size:0.85rem;font-weight:700;outline:none"
            onchange="updateModalIng('${type}',${i},'amount',parseFloat(this.value))">
          <span style="font-size:0.75rem;color:var(--text-soft)">g</span>
          <button class="btn btn-danger btn-xs" onclick="removeModalIng('${type}',${i})">✕</button>
        </div>
      </div>`).join('');

    // Set ingredient select values
    const rows = document.getElementById(type+'-ingredients-list').querySelectorAll('select');
    list.forEach((ing,i)=>{ if(ing.ingredientId) rows[i].value = ing.ingredientId; });
  });
}

function addIngredientRow(type) {
  const list = type==='dry' ? modalDryIngs : modalWetIngs;
  list.push({name:'', amount:0, ingredientId:null});
  renderModalIngredients();
}
function removeModalIng(type, i) {
  const list = type==='dry' ? modalDryIngs : modalWetIngs;
  list.splice(i,1); renderModalIngredients();
}
function updateModalIng(type, i, field, val) {
  const list = type==='dry' ? modalDryIngs : modalWetIngs;
  list[i][field] = val;
}

function renderModalSteps() {
  document.getElementById('process-steps-list').innerHTML = modalSteps.map((s,i)=>`
    <div style="border:1px solid var(--border);border-radius:9px;padding:12px;margin-bottom:8px;background:white">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
        <div class="step-num" style="flex-shrink:0">${i+1}</div>
        <input type="text" value="${s.title}" placeholder="Lépés neve" style="flex:1;padding:6px 10px;border:1.5px solid var(--border);border-radius:7px;font-family:'Kodchasan',sans-serif;font-size:0.85rem;font-weight:600;outline:none"
          onchange="updateModalStep(${i},'title',this.value)">
        <input type="number" value="${s.timer||''}" placeholder="perc" style="width:65px;padding:6px 8px;border:1.5px solid var(--border);border-radius:7px;font-family:'Kodchasan',sans-serif;font-size:0.82rem;text-align:center;outline:none"
          onchange="updateModalStep(${i},'timer',parseInt(this.value)||0)">
        <button class="btn btn-danger btn-xs" onclick="removeModalStep(${i})">✕</button>
      </div>
      <textarea placeholder="Lépés leírása..." style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:7px;font-family:'Kodchasan',sans-serif;font-size:0.82rem;outline:none;resize:vertical;min-height:50px" onchange="updateModalStep(${i},'desc',this.value)">${s.desc||''}</textarea>
    </div>`).join('');
}

function addProcessStep() {
  modalSteps.push({title:'', desc:'', timer:0}); renderModalSteps();
}
function removeModalStep(i) { modalSteps.splice(i,1); renderModalSteps(); }
function updateModalStep(i, field, val) { modalSteps[i][field] = val; }

const RECIPE_CAT_CODES = {
  'Kenyér':'KEN','Bagett / zsömle':'BAG','Sütemény':'SUT',
  'Leveles tészta':'LEV','Egyéb':'EGY'
};

// Élő kód preview – új receptnél (nincs még product_id)
function updateRecipeCodePreview() {
  const rec = editingRecipeId ? R.recipes.find(r=>r.id===editingRecipeId) : null;
  if(rec?.product_id) return; // meglévő termékkel rendelkező receptnél ne írja felül
  const codeEl = document.getElementById('r-product-code');
  if(!codeEl) return;
  const name = document.getElementById('r-name')?.value?.trim() || '';
  const catEl = document.getElementById('r-category');
  const cat = catEl?.value || 'Egyéb';
  if(!name) { codeEl.placeholder = 'mentés után generálódik'; codeEl.value = ''; return; }
  // Preview – ID nélkül, tmp-vel jelezzük hogy ez csak előnézet
  const preview = generateProductCode(name, cat, '????');
  codeEl.value = preview + ' (előnézet)';
}

function updateLevainPreview() {
  const amount = parseFloat(document.getElementById('r-levain-amount').value)||0;
  if (!amount) return;
  const lev = calcLevain(amount);
  const refill = calcRefill(lev.starter);
  document.getElementById('levain-preview-box').innerHTML = `
    <div style="font-weight:700;color:var(--teal-dark);margin-bottom:10px">Levain kalkulátor – ${amount}g alapadaghoz</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:0.82rem">
      <div>
        <div style="font-weight:600;color:var(--teal);margin-bottom:5px">Levain elkészítése:</div>
        <div>Kovász: <b>${lev.starter}g</b> (33%)</div>
        <div>Víz: <b>${lev.water}g</b> (30%)</div>
        <div>Barnarizs liszt: <b>${lev.flour}g</b> (37%)</div>
      </div>
      <div>
        <div style="font-weight:600;color:var(--teal);margin-bottom:5px">Visszatöltés üvegbe:</div>
        <div>Barnarizs liszt: <b>${refill.flour}g</b> (52%)</div>
        <div>Víz: <b>${refill.water}g</b> (48%)</div>
      </div>
    </div>`;
}
