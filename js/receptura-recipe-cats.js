// =============================================================
// KEREK Receptúra – Recept-kategóriák kezelés (v2.32.0 M10 bontás)
// Eredetileg: js/receptura-settings.js (684 sor)
// =============================================================


async function refreshR() {
  const btn = document.getElementById('r-btn-refresh');
  if(btn) { btn.textContent = '⏳'; btn.disabled = true; }
  try {
    // receptura modulban initApp() a data loader
    await initApp();
    const views = ['recipes','stock','production','settings-r','ingredients'];
    const active = views.find(v => document.getElementById('view-'+v)?.classList.contains('active'));
    if(active) nav(active);
    toast('✅ Minden frissítve!');
  } catch(e) { toast('⚠️ Hiba: '+e.message, true); }
  finally {
    if(btn) { btn.textContent = '🔄 Frissítés'; btn.disabled = false; }
  }
}

// ===== SETTINGS =====
// ===== SHARED CATEGORIES (from admin) =====

function renderRCategories() {
  const el = document.getElementById('r-categories-list');
  if (!el) return;
  const cats = R.settings?.categories || [];
  if (cats.length === 0) {
    el.innerHTML = '<p class="text-soft text-sm">Nincs termék kategória. Add hozzá lent.</p>';
    return;
  }
  el.innerHTML = cats.map((cat, i) => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;background:white">
      <span style="font-size:0.85rem;font-weight:600">${esc(cat)}</span>
      <button onclick="deleteRCategory(${i})" class="btn btn-ghost btn-sm" style="color:var(--red,#dc2626);font-size:0.75rem">✕</button>
    </div>`).join('');
}


async function deleteRCategory(i) {
  const cats = R.settings?.categories || [];
  const cat = cats[i];
  if (!cat) return;
  const linked = R.recipes.filter(r => r.category === cat);
  if (linked.length > 0) {
    toast(`⚠️ Nem törölhető: ${linked.length} recept használja. Előbb rendeld át!`, true);
    return;
  }
  if (!(await confirmDialog(`Törlöd a(z) "${cat}" kategóriát?`))) return;
  cats.splice(i, 1);
  R.settings.categories = cats;
  try {
    await sb.setSetting('categories', cats);
    save(); renderRCategories();
    toast('Kategória törölve.');
  } catch(e) { toast('⚠️ Mentés sikertelen: '+e.message, true); }
}

// ===== STOCK INTAKE (Bevételezés) =====

function renderRecipeCatsList() {
  if(!document.getElementById('recipe-cats-list')) return;
  document.getElementById('recipe-cats-list').innerHTML = R.recipeCategories.map((cat,i) => {
    const active = R.recipes.filter(r => r.category===cat && !r.archived);
    const archived = R.recipes.filter(r => r.category===cat && r.archived);
    const count = active.length;
    return `<div style="margin-bottom:8px;border:1.5px solid var(--border);border-radius:10px;overflow:hidden;background:white">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;cursor:pointer" onclick="toggleCatDetail('cat-rec-${i}')">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-weight:600;font-size:0.85rem">${cat}</span>
          <span class="badge" style="background:${count>0?'var(--teal-light)':'var(--bg-soft)'};color:${count>0?'var(--teal-dark)':'var(--text-soft)'};font-size:0.7rem">${count} recept</span>
          ${archived.length>0?`<span class="badge" style="background:#fef3c7;color:#92400e;font-size:0.7rem">${archived.length} archív</span>`:''}
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <span style="color:var(--text-soft);font-size:0.75rem">▼</span>
          <button class="btn btn-danger btn-xs" onclick="event.stopPropagation();deleteRecipeCat(${i})" ${count>0?'disabled title="Előbb rendeld át a recepteket" data-tip="Előbb rendeld át a recepteket"':''} style="${count>0?'opacity:0.4;cursor:not-allowed':''}">✕</button>
        </div>
      </div>
      <div id="cat-rec-${i}" style="display:none;border-top:1px solid var(--border);padding:10px 12px;background:var(--bg-soft)">
        ${count===0 && archived.length===0 ? '<p class="text-soft text-sm">Nincs recept ebben a kategóriában.</p>' :
          [...active,...archived].map(r=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
            <span style="font-size:0.82rem;${r.archived?'color:var(--text-soft)':''}">
              ${r.archived?'🗃 ':''}${r.name}
            </span>
            <select onchange="reassignRecipe(${r.id},this.value,${i})" style="font-size:0.78rem;padding:3px 8px;border:1px solid var(--border);border-radius:6px">
              ${R.recipeCategories.map(c=>`<option value="${c}" ${c===cat?'selected':''}>${c}</option>`).join('')}
            </select>
          </div>`).join('')}
      </div>
    </div>`;
  }).join('');
}

function toggleCatDetail(id){
  const el = document.getElementById(id);
  if(el) el.style.display = el.style.display==='none'?'block':'none';
}

async function reassignRecipe(recipeId, newCat, refreshIdx){
  const r = R.recipes.find(r=>r.id===recipeId);
  if(!r) return;
  const oldCat = r.category;
  r.category = newCat;
  try {
    await kData.update('recipes', {category: newCat}, `id=eq.${recipeId}`);
    toast(`✅ "${r.name}" átrendelve: ${oldCat} → ${newCat}`);
  } catch(e) { r.category = oldCat; toast('Átrendelés sikertelen: '+e.message, true); return; }
  save();
  renderRecipeCatsList();
  setTimeout(()=>{
    const el = document.getElementById(`cat-rec-${refreshIdx}`);
    if(el) el.style.display='block';
  }, 50);
}

async function addRecipeCat() {
  const val = document.getElementById('new-recipe-cat').value.trim();
  if (!val) return;
  R.recipeCategories.push(val); save();
  try {
    await sb.setSetting('categories', R.recipeCategories);
    await sb.setSetting('recipe_categories', R.recipeCategories); // backward compat
  } catch(e) { console.warn(e); }
  renderRecipeCatsList();
  document.getElementById('new-recipe-cat').value='';
  toast('Kategória hozzáadva!');
}

async function deleteRecipeCat(i) {
  const cat = R.recipeCategories[i];
  // Ellenőrzés: van-e recept vagy termék ebben a kategóriában?
  const linkedRecipes = R.recipes.filter(r => r.category === cat && !r.archived);
  if(linkedRecipes.length > 0) {
    const names = linkedRecipes.slice(0,3).map(r=>r.name).join(', ');
    const more = linkedRecipes.length > 3 ? ` és még ${linkedRecipes.length-3} db` : '';
    toast(`⚠️ Nem törölhető! ${linkedRecipes.length} recept tartozik ide: ${names}${more}. Előbb rendeld át őket más kategóriába.`, true);
    return;
  }
  if (!(await confirmDialog(`Törlöd a(z) "${cat}" kategóriát? Nincs hozzá recept, biztonságos.`))) return;
  R.recipeCategories.splice(i,1); save();
  try {
    await sb.setSetting('categories', R.recipeCategories);
    await sb.setSetting('recipe_categories', R.recipeCategories);
  } catch(e) { console.warn(e); }
  renderRecipeCatsList(); toast('Kategória törölve.');
}

// ===== PRODUCT_ID MIGRATION =====

async function migrateRecipeProductIds() {
  // Egyszeri javítás: product_id=null receptekhez beállítja az 1000+id értéket
  // és létrehozza a hiányzó products sort
  let fixed = 0;
  for (const rec of R.recipes) {
    if (rec.product_id) continue; // már van product_id
    const prodId = 1000 + rec.id;
    try {
      // Termék létrehozása ha nem létezik
      await sb.upsert('products', {
        id: prodId, name: rec.name,
        weight: `${rec.unitWeight||rec.basePortion||1000} g`,
        price: 0, category: rec.category||'Egyéb',
        description: rec.desc||'',
        code: `REC-${String(rec.id).padStart(3,'0')}`,
      });
      // Recept frissítése
      await kData.update('recipes', {product_id: prodId}, `id=eq.${rec.id}`);
      rec.product_id = prodId; // lokális frissítés
      fixed++;
    } catch(e) { console.warn(`migrate recipe ${rec.id}:`, e.message); }
  }
  save();
  toast(`✅ ${fixed} recept product_id javítva`);
}

// ===== KATEGÓRIA HOZZÁADÁS MODAL-BÓL =====

function showAddCategoryInline() {
  const el = document.getElementById('new-cat-inline');
  if(!el) return;
  el.style.display = el.style.display === 'none' ? 'flex' : 'none';
  if(el.style.display !== 'none') {
    el.style.display = 'block';
    document.getElementById('new-cat-inline-input')?.focus();
  }
}

async function addCategoryFromModal() {
  const input = document.getElementById('new-cat-inline-input');
  const val = input?.value?.trim();
  if(!val) return;
  if(R.recipeCategories.includes(val)) { toast('Ez a kategória már létezik.', true); return; }
  R.recipeCategories.push(val);
  save();
  try {
    await sb.setSetting('categories', R.recipeCategories);
    await sb.setSetting('recipe_categories', R.recipeCategories);
  } catch(e) { console.warn(e); }
  // Frissíti a select-et és kiválasztja az újat
  updateRecipeCatSelect(val);
  document.getElementById('new-cat-inline').style.display = 'none';
  input.value = '';
  toast('✅ Kategória hozzáadva és szinkronizálva.');
}

function updateRecipeCatSelect(selectVal) {
  const sel = document.getElementById('r-category');
  if(!sel) return;
  // Újra feltölti az opciókat
  const cats = R.recipeCategories || [];
  sel.innerHTML = cats.map(c=>`<option value="${c}"${c===selectVal?' selected':''}>${c}</option>`).join('');
  // Szűrőt is frissíti
  updateRecipeCatFilter?.();
}
