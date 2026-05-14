// ===== CATALOG =====
function setCatalogFilter(cat) {
  window._catalogFilter = cat;
  renderCatalog();
}

async function refreshCatalog() {
  const btn = document.querySelector('[onclick="refreshCatalog()"]');
  if(btn) { btn.textContent = '⏳'; btn.disabled = true; }
  try {
    await loadAllData();
    renderCatalog();
    toast('✅ Katalógus frissítve!');
  } catch(e) { toast('⚠️ Frissítés sikertelen: '+e.message, true); }
  if(btn) { btn.textContent = '🔄 Frissítés'; btn.disabled = false; }
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
  
  const nonDeleted = D.products.filter(p => !p.deleted_at);
  const filtered = activeCat==='all' ? nonDeleted : nonDeleted.filter(p=>(p.category||'Egyéb')===activeCat);
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
      <button class="btn btn-ghost btn-sm" onclick="archiveProduct(${p.id})" style="flex-shrink:0;color:#b45309" title="Archiválás">🗂️</button>

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
  const p = D.products.find(p=>p.id===id);
  if(p && p.deleted_at) { toast('⚠️ Archivált termék nem aktiválható. Először állítsd vissza az archivúmból.', true); return; }
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

async function archiveProduct(id) {
  const p = D.products.find(p=>p.id===id);
  if(!p) return;
  if(!confirm('Archiválod: "' + p.name + '"?\n\nA termék eltűnik a katalógusból, nem rendelhető.\nA múltbeli statisztikákban megmarad.\nVisszaallítí tható az archívumból.')) return;
  const now = new Date().toISOString();
  try {
    await sb.upsert('products', {...p, deleted_at: now}, 'id');
    const relRecipes = await sb.query('recipes', {filter: 'product_id=eq.'+id, limit: 10});
    for (const r of (relRecipes||[])) {
      if (!r.archived) await sb.upsert('recipes', {...r, archived: true}, 'id');
    }
    await sb.delete('monthly_active_products', 'product_id=eq.'+id);
    const idx = D.products.findIndex(x=>x.id===id);
    if(idx>=0) D.products[idx].deleted_at = now;
    Object.keys(D.monthlyActiveProducts).forEach(k=>{
      D.monthlyActiveProducts[k] = (D.monthlyActiveProducts[k]||[]).filter(x=>x!==id);
    });
    await auditLog('product_archive', p.name, 'ID: '+id);
    toast('🗂️ Termék archiválva.');
    save(); renderCatalog(); renderArchive();
  } catch(e) { toast('⚠️ Hiba: '+e.message, true); }
}

async function restoreProduct(id) {
  const p = D.products.find(p=>p.id===id);
  if(!p) return;
  try {
    const updated = Object.assign({}, p, {deleted_at: null});
    await sb.upsert('products', updated, 'id');
    const idx = D.products.findIndex(x=>x.id===id);
    if(idx>=0) D.products[idx].deleted_at = null;
    await auditLog('product_restore', p.name, 'ID: '+id);
    toast('✅ Termék visszaallítva.');
    save(); renderCatalog(); renderArchive();
  } catch(e) { toast('⚠️ Hiba: '+e.message, true); }
}

async function permanentDeleteProduct(id) {
  const p = D.products.find(p=>p.id===id);
  if(!p) return;
  if(!confirm('VÉGLEGES törlés: "' + p.name + '"?\n\nEz nem visszavonható!')) return;
  try {
    await sb.delete('products', 'id=eq.'+id);
    D.products = D.products.filter(x=>x.id!==id);
    await auditLog('product_delete_permanent', p.name, 'ID: '+id);
    toast('❌ Termék véglegesen törölve.');
    save(); renderCatalog(); renderArchive();
  } catch(e) { toast('⚠️ Hiba: '+e.message, true); }
}

function renderArchive() {
  const archived = D.products.filter(p => p.deleted_at);
  const el = document.getElementById('archived-products');
  if (!el) return;
  if (!archived.length) { el.innerHTML = '<p class="text-soft text-sm">Nincsenek archivált termékek.</p>'; return; }
  el.innerHTML = archived.map(function(p) {
    const dt = new Date(p.deleted_at).toLocaleDateString('hu-HU');
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">' +
      '<div style="flex:1;min-width:0"><div style="font-weight:600;font-size:0.85rem">' + esc(p.name) +
      ' <span style="color:var(--text-soft);font-size:0.72rem;font-weight:400">– archiválva: ' + dt + '</span></div>' +
      '<div style="font-size:0.72rem;color:var(--text-soft)">' + (p.weight||'') + ' · ' + (p.price||0) + ' lej · ' + (p.category||'Egyéb') + '</div></div>' +
      '<button class="btn btn-ghost btn-sm" onclick="restoreProduct(' + p.id + ')" style="color:#059669" title="Visszaallítás">↩️ Vissza</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="permanentDeleteProduct(' + p.id + ')" style="color:#b91c1c" title="Végleges törlés">🗑️</button>' +
      '</div>';
  }).join('');
}

function deleteProduct(id) { archiveProduct(id); }


function openProductModal(id=null){
  editingProductId=id;
  const catSel=document.getElementById('p-category');
  catSel.innerHTML=D.categories.map(c=>`<option>${c}</option>`).join('');
  // Termékcsalád dropdown feltöltése (az aktuálisan szerkesztett terméket kizárjuk)
  const famSel = document.getElementById('p-family-id');
  if (famSel) {
    famSel.innerHTML = '<option value="">– Önálló termék (nincs termékcsalád) –</option>' +
      D.products
        .filter(p => p.id !== id) // ne lehessen önmagát kiválasztani
        .map(p => `<option value="${p.id}">${p.name} (${p.code||p.id})</option>`)
        .join('');
  }
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
    codeField.dataset.manual = 'true';
    const famInput = document.getElementById('p-family-id');
    if (famInput) { famInput.value = p.familyId || ''; updateFamilyPreview(); } // szerkesztésnél ne írja felül a meglévő kódot
  } else {
    ['p-name','p-weight','p-price','p-desc','p-image'].forEach(i=>document.getElementById(i).value='');
    document.getElementById('p-type').value='production';
    clearProductImage();
    document.getElementById('pm-title').textContent='Új termék';
    // Új terméknél kód mező üres, manual flag reset
    const codeField = document.getElementById('p-code');
    codeField.value = '';
    codeField.dataset.manual = 'false';
    const famInput2 = document.getElementById('p-family-id');
    if (famInput2) { famInput2.value = ''; updateFamilyPreview(); }
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
  const code=document.getElementById('p-code').value.trim();
  const familyIdRaw = document.getElementById('p-family-id')?.value;
  const familyId = familyIdRaw ? parseInt(familyIdRaw) : null;
  // Névütközés ellenőrzés
  const duplicate = D.products.find(p =>
    p.name.trim().toLowerCase() === name.toLowerCase() &&
    p.id !== editingProductId
  );
  // Termékcsaládon belül megengedett az azonos név (pl. 500g és 1000g verzió)
  const sameFamily = duplicate && familyId && (duplicate.id === familyId || duplicate.familyId === familyId);
  if(duplicate && !sameFamily) {
    toast(`⚠️ Már létezik "${duplicate.name}" nevű termék (kód: ${duplicate.code||duplicate.id}). Válassz más nevet!`, true);
    return;
  }
  let prodId;
  if(editingProductId){
    prodId=editingProductId;
    const p=D.products.find(p=>p.id===editingProductId);
    Object.assign(p,{name,weight,price,category,desc,image,ptype,code,familyId});
  }
  try {
    let realProdId;
    if(editingProductId) {
      // UPDATE – meglévő termék, kód nem változik
      await sb.update('products', {name,weight,price,category,description:desc,product_family_id:familyId}, 'id=eq.'+editingProductId);
      realProdId = editingProductId;
    } else {
      // INSERT – Supabase generálja az ID-t, kód az ID alapján generálódik
      const savedProds = await sb.insert('products', {name,weight,price,category,description:desc,product_family_id:familyId});
      realProdId = savedProds[0].id;
      const autoCode = generateProductCode(name, category, realProdId);
      await sb.update('products', {code: autoCode}, 'id=eq.'+realProdId);
      D.products.push({id:realProdId,name,weight,price,category,desc,image,ptype,code:autoCode});
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
      if(editingProductId) {
        auditLog('product_update', name, `Ár: ${price} lej, Kategória: ${category}`);
        toast('Termék frissítve!');
      } else {
        auditLog('product_create', name, `Ár: ${price} lej, Kategória: ${category}`);
        toast('Új termék hozzáadva!');
      }
    }
  } catch(e){ toast('⚠️ Supabase mentés sikertelen: '+e.message, true); }
  save(); closeModal('product-modal'); renderCatalog();
}


// ===== TERMÉKCSALÁD PREVIEW =====
function updateFamilyPreview() {
  const el = document.getElementById('p-family-preview');
  const val = document.getElementById('p-family-id')?.value;
  if (!el) return;
  if (!val) { el.textContent = ''; return; }
  const famId = parseInt(val);
  const parent = D.products.find(p => p.id === famId);
  if (parent) {
    const members = D.products.filter(p => p.familyId === famId || p.id === famId);
    el.innerHTML = `📦 Termékcsalád: <strong>${parent.name}</strong> (${members.length} tag)`;
    el.style.color = 'var(--teal-dark)';
  } else {
    el.textContent = '';
  }
}

// ===== TERMÉKCSALÁDOK TAB =====
function switchCatalogTab(tab) {
  const prodView = document.getElementById('catalog-products-view');
  const famView = document.getElementById('catalog-families-view');
  const arcView = document.getElementById('catalog-archive-view');
  const tabProd = document.getElementById('catalog-tab-products');
  const tabFam = document.getElementById('catalog-tab-families');
  const tabArc = document.getElementById('catalog-tab-archive');

  [prodView, famView, arcView].forEach(v => { if(v) v.style.display = 'none'; });
  [tabProd, tabFam, tabArc].forEach(t => { if(t) t.style.borderBottom = ''; });

  if (tab === 'families') {
    if(famView) famView.style.display = 'block';
    if(tabFam) tabFam.style.borderBottom = '2px solid var(--teal-dark)';
    renderFamilies();
  } else if (tab === 'archive') {
    if(arcView) arcView.style.display = 'block';
    if(tabArc) tabArc.style.borderBottom = '2px solid var(--teal-dark)';
    renderArchive();
  } else {
    if(prodView) prodView.style.display = 'block';
    if(tabProd) tabProd.style.borderBottom = '2px solid var(--teal-dark)';
  }
}

function renderFamilies() {
  const el = document.getElementById('families-grid');
  if (!el) return;

  // Önálló termékek (nincs familyId)
  const standalone = D.products.filter(p => !p.familyId);

  // Termékcsaládok csoportosítása: familyId → szülő termék
  const familyMap = {};
  D.products.filter(p => p.familyId).forEach(p => {
    if (!familyMap[p.familyId]) familyMap[p.familyId] = [];
    familyMap[p.familyId].push(p);
  });

  // Szülő termékek (akik legalább egy gyereket vannak)
  const parentIds = Object.keys(familyMap).map(Number);
  const families = parentIds.map(pid => ({
    parent: D.products.find(p => p.id === pid),
    members: familyMap[pid]
  })).filter(f => f.parent);

  let html = '';

  if (families.length === 0 && standalone.length === 0) {
    el.innerHTML = '<p class="text-soft text-sm" style="padding:32px">Nincs termék a katalógusban.</p>';
    return;
  }

  // Termékcsaládok
  if (families.length > 0) {
    html += `<h3 style="font-family:'Fraunces',serif;color:var(--teal-dark);margin-bottom:16px">🔗 Termékcsaládok (${families.length})</h3>`;
    html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;margin-bottom:32px">`;
    families.forEach(({ parent, members }) => {
      const allMembers = [parent, ...members];
      const avgPrice = Math.round(allMembers.reduce((s, p) => s + (p.price || 0), 0) / allMembers.length);
      const cats = [...new Set(allMembers.map(p => p.category))].join(', ');
      html += `
        <div class="card" style="border-left:4px solid var(--gold)">
          <div class="card-head">
            <div class="card-title">📦 ${parent.name}</div>
            <span style="font-size:.75rem;color:var(--text-soft)">${allMembers.length} tag · ${cats}</span>
          </div>
          <div class="card-body">
            <table style="width:100%;font-size:.83rem;border-collapse:collapse">
              <tr style="color:var(--text-soft);font-size:.75rem">
                <th style="text-align:left;padding:4px 0;font-weight:600">Termék</th>
                <th style="text-align:right;padding:4px 0;font-weight:600">Kód</th>
                <th style="text-align:right;padding:4px 0;font-weight:600">Ár</th>
                <th style="text-align:right;padding:4px 0;font-weight:600"></th>
              </tr>
              ${allMembers.map(p => {
                const isParent = p.id === parent.id;
                return `<tr style="border-top:1px solid var(--border)${isParent ? ';font-weight:700' : ''}">
                  <td style="padding:6px 0">${isParent ? '👑 ' : '└ '}${p.name}</td>
                  <td style="text-align:right;font-family:monospace;font-size:.75rem;color:var(--text-soft)">${p.code || '–'}</td>
                  <td style="text-align:right;color:var(--teal-dark);font-weight:700">${p.price} lej</td>
                  <td style="text-align:right"><button onclick="openProductModal(${p.id})" style="background:none;border:none;cursor:pointer;font-size:.85rem;color:var(--text-soft)" title="Szerkesztés">✏️</button></td>
                </tr>`;
              }).join('')}
            </table>
            <div style="display:flex;gap:16px;margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">
              <div style="text-align:center;flex:1">
                <div style="font-size:1.1rem;font-weight:700;color:var(--teal-dark)">${allMembers.length}</div>
                <div style="font-size:.7rem;color:var(--text-soft)">termék</div>
              </div>
              <div style="text-align:center;flex:1">
                <div style="font-size:1.1rem;font-weight:700;color:var(--gold-dark)">${avgPrice} lej</div>
                <div style="font-size:.7rem;color:var(--text-soft)">átlag ár</div>
              </div>
              <div style="text-align:center;flex:1">
                <div style="font-size:1.1rem;font-weight:700;color:var(--teal)">${allMembers.filter(p=>p.ptype==='production').length}</div>
                <div style="font-size:.7rem;color:var(--text-soft)">gyártási</div>
              </div>
            </div>
          </div>
        </div>`;
    });
    html += `</div>`;
  }

  // Önálló termékek
  if (standalone.length > 0) {
    html += `<h3 style="font-family:'Fraunces',serif;color:var(--teal-dark);margin-bottom:16px">📌 Önálló termékek (${standalone.length})</h3>`;
    html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">`;
    standalone.forEach(p => {
      html += `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg-soft);border-radius:10px;border:1px solid var(--border)">
        <div style="flex:1;min-width:0">
          <div style="font-size:.85rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
          <div style="font-size:.72rem;color:var(--text-soft)">${p.code || '–'} · ${p.price} lej</div>
        </div>
        <button onclick="openProductModal(${p.id})" style="background:none;border:none;cursor:pointer;font-size:.85rem;color:var(--text-soft)">✏️</button>
      </div>`;
    });
    html += `</div>`;
  }

  el.innerHTML = html;
}
