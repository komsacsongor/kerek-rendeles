// ===== CATALOG =====
function setCatalogFilter(cat) {
  window._catalogFilter = cat;
  renderCatalog();
}

function renderCatalog(){
  const y=selYear, m=catalogMonth;
  // Hónap selector feltöltése
  const catMonSel = document.getElementById('catalog-month-sel');
  if(catMonSel) catMonSel.innerHTML = MONTHS.map((mo,i)=>
    `<button class="month-btn ${i===catalogMonth?'active':''}" onclick="selectCatalogMonth(${i})">${mo}</button>`
  ).join('');
  // Category filter
  const allCats = [...new Set(D.products.map(p=>p.category||'Egyéb'))].sort();
  const activeCat = window._catalogFilter || 'all';
  
  // Filter bar
  const filterHtml = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;align-items:center">
    <span style="font-size:0.78rem;color:var(--text-soft);font-weight:600">Szűrés:</span>
    <button class="btn ${activeCat==='all'?'btn-primary':'btn-ghost'} btn-sm" onclick="setCatalogFilter('all')">Összes</button>
    ${allCats.map(cat=>`<button class="btn ${activeCat===cat?'btn-primary':'btn-ghost'} btn-sm" onclick="setCatalogFilter('${esc(cat)}')">${esc(cat)}</button>`).join('')}
  </div>`;
  
  const filtered = activeCat==='all' ? D.products : D.products.filter(p=>(p.category||'Egyéb')===activeCat);
  const active = D.monthlyActiveProducts[`${y}-${m}`] || [];

  const productCard = (p, isActive) => {
    const img = p.image
      ? `<img src="${p.image}" style="width:38px;height:38px;object-fit:cover;border-radius:6px;flex-shrink:0">`
      : `<div style="width:38px;height:38px;border-radius:6px;background:var(--teal-pale);flex-shrink:0;display:flex;align-items:center;justify-content:center">🍞</div>`;
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      ${img}
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:0.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</div>
        <div style="font-size:0.72rem;color:var(--text-soft)">${p.weight||''} · ${p.price||0} lej</div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="openProductModal(${p.id})" style="flex-shrink:0">✏️</button>
      <button class="btn btn-ghost btn-sm" onclick="deleteProduct(${p.id})" style="flex-shrink:0;color:#b91c1c" title="Törlés">🗑</button>
      <button class="btn ${isActive?'btn-danger':'btn-primary'} btn-sm" onclick="toggleProduct(${p.id})" style="flex-shrink:0">${isActive?'–':'+'}</button>
    </div>`;
  };

  // Bal: összes termék szűrve
  const allHtml = filterHtml + filtered.map(p => productCard(p, active.includes(p.id))).join('') || '<p class="text-soft text-sm">Nincsenek termékek.</p>';
  document.getElementById('all-products').innerHTML = allHtml;

  // Jobb: aktív termékek ezen a hónapon
  const activeProds = D.products.filter(p => active.includes(p.id));
  document.getElementById('active-products').innerHTML = activeProds.length
    ? activeProds.map(p => productCard(p, true)).join('')
    : '<p class="text-soft text-sm">Még nincs aktív termék ebben a hónapban.</p>';
}
function selectCatalogMonth(m){ catalogMonth=m; renderCatalog(); }
function toggleProduct(id){
  const key=mk(selYear,catalogMonth);
  if(!D.monthlyActiveProducts[key]) D.monthlyActiveProducts[key]=[];
  const idx=D.monthlyActiveProducts[key].indexOf(id);
  if(idx>-1) D.monthlyActiveProducts[key].splice(idx,1);
  else D.monthlyActiveProducts[key].push(id);
  // Sync to Supabase
  const [ky, km] = key.split('-').map(Number);
  if(idx>-1) {
    sb.delete('monthly_active_products', `year=eq.${ky}&month=eq.${km}&product_id=eq.${id}`).catch(e=>console.warn(e));
  } else {
    sb.upsert('monthly_active_products', {year:ky, month:km, product_id:id}, 'year,month,product_id').catch(e=>console.warn(e));
  }
  save(); renderCatalog();
  toast(idx>-1?'Termék eltávolítva a hónapból':'Termék aktiválva');
}

async function deleteProduct(id) {
  const p = D.products.find(p=>p.id===id);
  if(!p) return;
  if(!confirm('Biztosan törlöd: "' + esc(p.name) + '"?\nA havi aktiválások is törlődnek.')) return;
  D.products = D.products.filter(x=>x.id!==id);
  Object.keys(D.monthlyActiveProducts).forEach(k=>{
    D.monthlyActiveProducts[k] = (D.monthlyActiveProducts[k]||[]).filter(x=>x!==id);
  });
  try {
    await sb.delete('monthly_active_products', 'product_id=eq.'+id);
    await sb.delete('products', 'id=eq.'+id);
    toast('Termék törölve.');
  } catch(e) { toast('⚠️ Törlés sikertelen: '+e.message, true); }
  save(); renderCatalog();
}

function openProductModal(id=null){
  editingProductId=id;
  const catSel=document.getElementById('p-category');
  catSel.innerHTML=D.categories.map(c=>`<option>${c}</option>`).join('');
  if(id){
    const p=D.products.find(p=>p.id===id);
    document.getElementById('p-name').value=p.name;
    document.getElementById('p-weight').value=p.weight;
    document.getElementById('p-price').value=p.price;
    document.getElementById('p-category').value=p.category;
    document.getElementById('p-desc').value=p.desc||'';
    const imgVal = p.image||'';
    document.getElementById('p-image').value = imgVal.startsWith('data:') ? '' : imgVal;
    document.getElementById('p-image-file')._base64 = imgVal.startsWith('data:') ? imgVal : null;
    if(imgVal){ showProductImagePreview(imgVal); }
    else { document.getElementById('p-image-preview').style.display='none'; }
    document.getElementById('p-type').value=p.ptype||'production';
    document.getElementById('pm-title').textContent='Termék szerkesztése';
    // Kód mező: manual flag alaphelyzetbe – szerkesztéskor is frissülhet névvel/kategóriával
    const codeField = document.getElementById('p-code');
    codeField.value = p.code||'';
    codeField.dataset.manual = 'false'; // engedjük az auto-frissítést
  } else {
    ['p-name','p-weight','p-price','p-desc','p-image'].forEach(i=>document.getElementById(i).value='');
    document.getElementById('p-type').value='production';
    clearProductImage();
    document.getElementById('pm-title').textContent='Új termék';
    // Új terméknél kód mező üres, manual flag reset
    const codeField = document.getElementById('p-code');
    codeField.value = '';
    codeField.dataset.manual = 'false';
  }
  // Kapcsolt recept megjelenítése
  const recipeInfo = document.getElementById('p-recipe-info');
  const recipeNameEl = document.getElementById('p-recipe-name');
  if(id && recipeInfo) {
    // Lekérdezzük a kapcsolt receptet Supabase-ből
    sb.query('recipes', {filter:'product_id=eq.'+id, select:'id,name'}).then(rows=>{
      if(rows&&rows.length>0) {
        recipeNameEl.textContent = rows[0].name;
        recipeInfo.style.display = 'block';
      } else {
        recipeInfo.style.display = 'none';
      }
    }).catch(()=>{ recipeInfo.style.display='none'; });
  } else if(recipeInfo) {
    recipeInfo.style.display = 'none';
  }
  document.getElementById('product-modal').classList.add('open');
}
function handleProductImageUpload(input){
  const file = input.files[0];
  if(!file) return;
  if(file.size > 2*1024*1024){
    toast('A kép mérete max 2 MB lehet!');
    input.value='';
    return;
  }
  const reader = new FileReader();
  reader.onload = function(e){
    const base64 = e.target.result;
    document.getElementById('p-image').value = '';
    showProductImagePreview(base64);
    // Store temporarily
    document.getElementById('p-image-file')._base64 = base64;
  };
  reader.readAsDataURL(file);
}

function handleProductImageUrl(url){
  if(!url) { clearProductImage(); return; }
  showProductImagePreview(url);
  document.getElementById('p-image-file')._base64 = null;
}

function showProductImagePreview(src){
  const preview = document.getElementById('p-image-preview');
  const img = document.getElementById('p-image-preview-img');
  img.src = src;
  preview.style.display = 'block';
}

function clearProductImage(){
  document.getElementById('p-image-preview').style.display = 'none';
  document.getElementById('p-image-preview-img').src = '';
  document.getElementById('p-image').value = '';
  document.getElementById('p-image-file').value = '';
  document.getElementById('p-image-file')._base64 = null;
}

function getProductImageValue(){
  const fileInput = document.getElementById('p-image-file');
  if(fileInput._base64) return fileInput._base64;
  const url = document.getElementById('p-image').value.trim();
  return url || null;
}

// ===== CODE GENERATION =====
const CAT_CODES = {
  'Kenyér':'KEN', 'Bagett / zsömle':'BAG', 'Sütemény':'SUT',
  'Leveles tészta':'LEV', 'Egyéb':'EGY'
};

function updateWeightField() {
  const num = document.getElementById('p-weight-num')?.value;
  const unit = document.getElementById('p-weight-unit')?.value || 'g';
  const hidden = document.getElementById('p-weight');
  if(hidden && num) hidden.value = `${num} ${unit}`;
}

function updateProductCode(force=false) {
  const codeEl = document.getElementById('p-code');
  if(!codeEl) return;
  // Skip if manually edited by user
  if(codeEl.dataset.manual === 'true' && !force) return;
  // Skip if empty name (nothing to generate from)
  if(!document.getElementById('p-name')?.value?.trim()) return;
  const name = document.getElementById('p-name')?.value || '';
  const catEl = document.getElementById('p-category');
  const cat = catEl?.options[catEl.selectedIndex]?.text || 'Egyéb';
  const prefix = CAT_CODES[cat] || 'EGY';
  // Take first 4 chars of name, uppercase, remove special chars
  const namePart = name.toUpperCase()
    .replace(/[ÁÀÂÄ]/g,'A').replace(/[ÉÈÊË]/g,'E')
    .replace(/[ÍÌÎÏ]/g,'I').replace(/[ÓÒÔÖ]/g,'O')
    .replace(/[ÚÙÛÜ]/g,'U').replace(/[^A-Z]/g,'')
    .slice(0,4) || 'XXX';
  // Count existing products in this category for sequence
  const existing = D.products.filter(p=>p.category===cat).length;
  const seq = String(existing+1).padStart(2,'0');
  codeEl.value = `${prefix}-${namePart}-${seq}`;
}

function generateClientCode() {
  const nameEl = document.getElementById('c-name');
  const name = nameEl?.value || '';
  const firstLetter = name.trim().charAt(0).toUpperCase() || 'X';
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = `KR-${firstLetter}`;
  for(let i=0;i<3;i++) code += chars[Math.floor(Math.random()*chars.length)];
  code += '-';
  for(let i=0;i<4;i++) code += chars[Math.floor(Math.random()*chars.length)];
  document.getElementById('c-id').value = code;
}

function copyClientCode() {
  copyToClipboard(document.getElementById('c-id')?.value);
}

function copyToClipboard(text) {
  if(!text) { toast('Nincs mit másolni!'); return; }
  // Modern API with fallback
  if(navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text)
      .then(()=>toast('📋 Kód másolva: '+text))
      .catch(()=>copyFallback(text));
  } else {
    copyFallback(text);
  }
}

function copyFallback(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  try {
    document.execCommand('copy');
    toast('📋 Kód másolva: '+text);
  } catch(e) {
    toast('Másolás sikertelen – jelöld ki manuálisan: '+text);
  }
  document.body.removeChild(ta);
}

// Auto-generate code when name is typed
document.addEventListener('DOMContentLoaded', () => {
  const nameEl = document.getElementById('c-name');
  if(nameEl) nameEl.addEventListener('input', () => {
    const codeEl = document.getElementById('c-id');
    if(codeEl && !codeEl.value) generateClientCode();
  });
});

async function saveProduct(){
  const name=document.getElementById('p-name').value.trim();
  const price=parseFloat(document.getElementById('p-price').value);
  if(!name||!price){toast('Név és ár kötelező!');return;}
  const weight=document.getElementById('p-weight').value;
  const category=document.getElementById('p-category').value;
  const desc=document.getElementById('p-desc').value;
  const image=getProductImageValue();
  const ptype=document.getElementById('p-type').value;
  let prodId;
  if(editingProductId){
    prodId=editingProductId;
    const p=D.products.find(p=>p.id===editingProductId);
    Object.assign(p,{name,weight,price,category,desc,image,ptype});
  }
  try {
    let realProdId;
    if(editingProductId) {
      // UPDATE – meglévő termék
      await sb.update('products', {name,weight,price,category,description:desc}, 'id=eq.'+editingProductId);
      realProdId = editingProductId;
    } else {
      // INSERT – Supabase generálja az ID-t
      const savedProds = await sb.insert('products', {name,weight,price,category,description:desc});
      realProdId = savedProds[0].id;
      D.products.push({id:realProdId,name,weight,price,category,desc,image,ptype});
    }
    prodId = realProdId;
    // Ha gyártási termék és új termék → automatikus recept létrehozás (ID nélkül)
    if(ptype==='production' && !editingProductId) {
      try {
        const newRecipe = {
          name, category,
          product_id: realProdId,
          base_portion: 1000, bake_loss: 16, unit_weight: 1000,
          temp1: 230, time1: 20, temp2: 180, time2: 70,
          description: desc||'', levain_amount: 0,
          labor_h: 1, electricity: 5,
          marketing_desc: '', ingredient_label: '', allergens: '', nutrition: null
        };
        await sb.insert('recipes', newRecipe);
        toast('✅ Termék és recept létrehozva! Töltsd ki a receptet a Receptúra modulban.');
      } catch(e2) {
        toast('Termék mentve, de recept létrehozás sikertelen: '+e2.message, true);
      }
    } else {
      toast(editingProductId?'Termék frissítve!':'Új termék hozzáadva!');
    }
  } catch(e){ toast('⚠️ Supabase mentés sikertelen: '+e.message, true); }
  save(); closeModal('product-modal'); renderCatalog();
}

