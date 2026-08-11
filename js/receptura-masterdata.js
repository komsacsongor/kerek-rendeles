// ===== receptura-masterdata.js — 📚 Törzsadatok =====
// Konszolidált nomenklatúra-kezelés: alapanyag-kategóriák (átnevezés + átsorolás +
// összevonás + törlés) és alapanyag-családok (helyettesíthetőségi csoportok).
// A cél: egy helyen, tisztán kezelni a törzsadatokat (benchmark: master data hub).

function renderMasterData() {
  const box = document.getElementById('masterdata-content');
  if (!box) return;
  const cats = ((R.settings && R.settings.ingredientCategories) || []).slice().sort((a,b)=>a.localeCompare(b,'hu'));
  const families = (R.ingredientFamilies || []).slice().sort((a,b)=>(a.name||'').localeCompare(b.name||'','hu'));
  const ings = R.ingredients || [];

  // ---- KATEGÓRIÁK ----
  const catCards = cats.map((cat, idx) => {
    const inCat = ings.filter(i => i.cat === cat);
    const otherCats = cats.filter(c => c !== cat);
    const rows = inCat.length ? inCat.map(ing => `
      <div style="display:flex;align-items:center;gap:8px;padding:5px 2px;border-bottom:0.5px solid var(--border)">
        <span style="flex:1;font-size:0.85rem">${esc(ing.name)}</span>
        <select onchange="if(this.value){moveIngredientToCategory(${ing.id}, this.value);}" style="font-size:0.75rem;padding:3px 6px;border:1px solid var(--border);border-radius:6px;font-family:'Kodchasan',sans-serif">
          <option value="">→ áthelyez…</option>
          ${otherCats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')}
        </select>
      </div>`).join('') : '<div style="font-size:0.8rem;color:var(--text-soft);padding:6px 2px">Nincs alapanyag ebben a kategóriában.</div>';
    return `
      <div style="border:1px solid var(--border);border-radius:10px;margin-bottom:10px;overflow:hidden;background:#fff">
        <div style="display:flex;align-items:center;gap:6px;padding:10px 12px;background:var(--cream)">
          <span style="flex:1;font-weight:700;color:var(--teal-dark)">${esc(cat)} <span style="font-weight:400;color:var(--text-soft);font-size:0.78rem">(${inCat.length})</span></span>
          <button class="btn btn-ghost btn-sm" onclick="renameIngCategoryPrompt(${idx})" title="Átnevezés" style="padding:2px 7px">✏️</button>
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('mdcat-${idx}').style.display = document.getElementById('mdcat-${idx}').style.display==='none'?'block':'none'" title="Alapanyagok" style="padding:2px 7px">📂</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteMasterCategory(${idx})" title="Törlés" style="padding:2px 7px">🗑</button>
        </div>
        <div id="mdcat-${idx}" style="display:none;padding:8px 12px">${rows}</div>
      </div>`;
  }).join('') || '<div style="font-size:0.85rem;color:var(--text-soft)">Nincs kategória.</div>';

  // ---- CSALÁDOK ----
  const famCards = families.length ? families.map(f => {
    const count = ings.filter(i => i.familyId === f.id).length;
    return `
      <div style="display:flex;align-items:center;gap:6px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;background:#fff">
        <span style="flex:1;font-size:0.9rem">${esc(f.name)} <span style="color:var(--text-soft);font-size:0.78rem">(${count} alapanyag)</span></span>
        <button class="btn btn-ghost btn-sm" onclick="renameFamilyPrompt(${f.id})" title="Átnevezés" style="padding:2px 7px">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="deleteFamily(${f.id})" title="Törlés" style="padding:2px 7px">🗑</button>
      </div>`;
  }).join('') : '<div style="font-size:0.85rem;color:var(--text-soft)">Nincs család. A családok az alapanyag-szerkesztőben hozhatók létre (helyettesíthetőségi csoportok).</div>';

  box.innerHTML = `
    <div style="max-width:760px">
      <p style="font-size:0.85rem;color:var(--text-soft);margin:0 0 16px">A törzsadatok (nomenklatúrák) központi kezelése. A kategóriák és családok itt egy helyen rendezhetők — a benchmark szerint ez csökkenti a hibákat és a szétszórtságot.</p>

      <div style="display:flex;justify-content:space-between;align-items:center;margin:0 0 10px">
        <h3 style="font-family:'Fraunces',serif;color:var(--teal-dark);margin:0">🗂️ Alapanyag-kategóriák</h3>
        <div style="display:flex;gap:6px">
          <button class="btn btn-primary btn-sm" data-action="addIngCategory">➕ Új kategória</button>
          <button class="btn btn-ghost btn-sm" data-action="openMergeCategoryModal">🔀 Összevonás</button>
        </div>
      </div>
      ${catCards}

      <h3 style="font-family:'Fraunces',serif;color:var(--teal-dark);margin:24px 0 10px">🧬 Alapanyag-családok</h3>
      <p style="font-size:0.78rem;color:var(--text-soft);margin:0 0 10px">Helyettesíthetőségi csoportok (pl. „liszt-félék") — a bevásárlólista ezek alapján tud alternatívát ajánlani.</p>
      ${famCards}
    </div>`;
}

// --- Kategória átsorolás (a fő új képesség) ---
async function moveIngredientToCategory(ingId, newCat) {
  const ing = (R.ingredients||[]).find(i => i.id === ingId);
  if (!ing || !newCat || ing.cat === newCat) return;
  const old = ing.cat;
  try {
    await kData.updateFields('ingredients', { category: newCat }, 'id=eq.' + ingId);
    ing.cat = newCat;
    if (typeof auditLog === 'function') auditLog('ingredient_recat', ing.name, old + ' → ' + newCat);
    toast(`✅ „${ing.name}" áthelyezve: ${newCat}`);
    renderMasterData();
    if (typeof renderStock === 'function') renderStock();
  } catch(e) {
    console.error('moveIngredientToCategory:', e);
    toast('⚠️ ' + (typeof friendlyError==='function'?friendlyError(e):e.message), true);
  }
}

// --- Kategória átnevezése (az összes érintett alapanyagon) ---
async function renameIngCategoryPrompt(idx) {
  const cats = ((R.settings && R.settings.ingredientCategories) || []).slice().sort((a,b)=>a.localeCompare(b,'hu'));
  const oldName = cats[idx];
  if (!oldName) return;
  const newName = (typeof prompt === 'function') ? prompt('Kategória új neve:', oldName) : null;
  if (!newName || newName.trim() === '' || newName.trim() === oldName) return;
  const nn = newName.trim();
  try {
    const affected = (R.ingredients||[]).filter(i => i.cat === oldName);
    for (const ing of affected) {
      await kData.updateFields('ingredients', { category: nn }, 'id=eq.' + ing.id);
      ing.cat = nn;
    }
    const list = (R.settings.ingredientCategories || []).map(c => c === oldName ? nn : c);
    R.settings.ingredientCategories = [...new Set(list)];
    await sb.setSetting('ingredient_categories', R.settings.ingredientCategories);
    if (typeof auditLog === 'function') auditLog('category_rename', oldName + ' → ' + nn, affected.length + ' alapanyag');
    toast(`✅ Átnevezve: „${oldName}" → „${nn}" (${affected.length} alapanyag)`);
    renderMasterData();
    if (typeof renderStock === 'function') renderStock();
  } catch(e) {
    console.error('renameIngCategory:', e);
    toast('⚠️ ' + (typeof friendlyError==='function'?friendlyError(e):e.message), true);
  }
}

async function deleteMasterCategory(idx) {
  const cats = ((R.settings && R.settings.ingredientCategories) || []).slice().sort((a,b)=>a.localeCompare(b,'hu'));
  const cat = cats[idx];
  if (!cat) return;
  const inCat = (R.ingredients||[]).filter(i => i.cat === cat);
  if (inCat.length > 0) {
    toast(`⚠️ „${cat}" nem törölhető — ${inCat.length} alapanyag van benne. Előbb sorold át őket (📂 → áthelyez), vagy használd az Összevonást.`, true);
    return;
  }
  if (typeof confirmDialog === 'function' && !(await confirmDialog(`Törlöd a „${cat}" (üres) kategóriát?`))) return;
  try {
    R.settings.ingredientCategories = (R.settings.ingredientCategories||[]).filter(c => c !== cat);
    await sb.setSetting('ingredient_categories', R.settings.ingredientCategories);
    toast(`✅ „${cat}" törölve.`);
    renderMasterData();
  } catch(e) { toast('⚠️ ' + (typeof friendlyError==='function'?friendlyError(e):e.message), true); }
}

// --- Család átnevezés / törlés ---
async function renameFamilyPrompt(famId) {
  const fam = (R.ingredientFamilies||[]).find(f => f.id === famId);
  if (!fam) return;
  const newName = (typeof prompt === 'function') ? prompt('Család új neve:', fam.name) : null;
  if (!newName || newName.trim()==='' || newName.trim()===fam.name) return;
  try {
    await kData.updateFields('ingredient_families', { name: newName.trim() }, 'id=eq.' + famId);
    fam.name = newName.trim();
    toast('✅ Család átnevezve.');
    renderMasterData();
  } catch(e) { toast('⚠️ ' + (typeof friendlyError==='function'?friendlyError(e):e.message), true); }
}

async function deleteFamily(famId) {
  const fam = (R.ingredientFamilies||[]).find(f => f.id === famId);
  if (!fam) return;
  const count = (R.ingredients||[]).filter(i => i.familyId === famId).length;
  if (typeof confirmDialog === 'function' && !(await confirmDialog(`Törlöd a „${fam.name}" családot?${count>0?`\n\n${count} alapanyag elveszti a család-hozzárendelését (maga az alapanyag megmarad).`:''}`))) return;
  try {
    // az érintett alapanyagok family_id-ját nullázzuk
    for (const ing of (R.ingredients||[]).filter(i => i.familyId === famId)) {
      await kData.updateFields('ingredients', { family_id: null }, 'id=eq.' + ing.id);
      ing.familyId = null;
    }
    await kData.delete('ingredient_families', 'id=eq.' + famId);
    R.ingredientFamilies = (R.ingredientFamilies||[]).filter(f => f.id !== famId);
    toast('✅ Család törölve.');
    renderMasterData();
  } catch(e) { console.error('deleteFamily:', e); toast('⚠️ ' + (typeof friendlyError==='function'?friendlyError(e):e.message), true); }
}

if (typeof window !== 'undefined') {
  window.renderMasterData = renderMasterData;
  window.moveIngredientToCategory = moveIngredientToCategory;
  window.renameIngCategoryPrompt = renameIngCategoryPrompt;
  window.deleteMasterCategory = deleteMasterCategory;
  window.renameFamilyPrompt = renameFamilyPrompt;
  window.deleteFamily = deleteFamily;
}
