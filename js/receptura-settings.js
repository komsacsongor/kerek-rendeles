// ===== SETTINGS =====
function renderSettings() {
  if(document.getElementById('s-api-key') && R.settings?.apiKey) {
    document.getElementById('s-api-key').value = R.settings.apiKey;
  }
  loadAiSettingsUI();
  const s = R.settings;
  document.getElementById('s-vat').value = s.vat;
  document.getElementById('s-margin').value = s.margin;
  document.getElementById('s-labor').value = s.labor;
  document.getElementById('s-electricity').value = s.electricity;
  document.getElementById('s-tool-wear').value = s.toolWear;
  document.getElementById('s-consumables').value = s.consumables;
  document.getElementById('s-bake-loss').value = s.bakeLoss;
  document.getElementById('s-base-portion').value = s.basePortion;
  document.getElementById('s-levain-starter').value = s.levain.starter;
  document.getElementById('s-levain-water').value = s.levain.water;
  document.getElementById('s-levain-flour').value = s.levain.flour;
  document.getElementById('s-refill-flour').value = s.refill.flour;
  document.getElementById('s-refill-water').value = s.refill.water;
  renderRecipeCatsList();
}

async function saveFinancialSettings() {
  Object.assign(R.settings, {
    vat: parseFloat(document.getElementById('s-vat').value)||19,
    margin: parseFloat(document.getElementById('s-margin').value)||50,
    labor: parseFloat(document.getElementById('s-labor').value)||55,
    electricity: parseFloat(document.getElementById('s-electricity').value)||1.5,
    toolWear: parseFloat(document.getElementById('s-tool-wear').value)||5,
    consumables: parseFloat(document.getElementById('s-consumables').value)||0.5,
  });
  save();
  try { await sb.setSetting('recipe_financial_settings', R.settings); } catch(e) { console.warn('Supabase settings save:', e); }
  toast('Pénzügyi beállítások mentve!');
}

async function saveBakingSettings() {
  R.settings.bakeLoss = parseFloat(document.getElementById('s-bake-loss').value)||16;
  R.settings.basePortion = parseFloat(document.getElementById('s-base-portion').value)||1000;
  R.settings.levain = {
    starter: parseFloat(document.getElementById('s-levain-starter').value)||33,
    water: parseFloat(document.getElementById('s-levain-water').value)||30,
    flour: parseFloat(document.getElementById('s-levain-flour').value)||37,
  };
  R.settings.refill = {
    flour: parseFloat(document.getElementById('s-refill-flour').value)||52,
    water: parseFloat(document.getElementById('s-refill-water').value)||48,
  };
  save();
  try { await sb.setSetting('recipe_baking_settings', R.settings); } catch(e) { console.warn('Supabase settings save:', e); }
  toast('Sütési beállítások mentve!');
}

async function syncRecipeToSupabase(data, existingId) {
  // Névütközés ellenőrzés – csak új terméknél (nincs product_id)
  if (!data.product_id) {
    const existing = _adminProductsCache.find(p =>
      p.name.trim().toLowerCase() === (data.name||'').trim().toLowerCase()
    );
    if (existing) {
      toast(`⚠️ Már létezik "${existing.name}" nevű termék (kód: ${existing.code||existing.id}). Válassz más nevet!`, true);
      return;
    }
  }
  try {
    const recId = existingId || data.id;
    
    // Upsert recipe
    await sb.upsert('recipes', {
      id: recId, name: data.name, category: data.category, version: data.version||1,
      product_id: data.product_id || null,
      base_portion: data.basePortion, bake_loss: data.bakeLoss,
      unit_weight: data.unitWeight, temp1: data.temp1, time1: data.time1,
      temp2: data.temp2, time2: data.time2, description: data.desc||'',
      levain_amount: data.levainAmount, labor_h: data.laborH||1,
      electricity: data.electricity||5,
      marketing_desc: data.marketing||'',
      ingredient_label: data.ingredientLabel||'',
      allergens: data.allergens||'',
      nutrition: data.nutrition ? JSON.stringify(data.nutrition) : null,
    });

    // Delete old ingredients and steps, re-insert
    await sb.delete('recipe_ingredients', `recipe_id=eq.${recId}`);
    await sb.delete('recipe_steps', `recipe_id=eq.${recId}`);

    // Insert dry ingredients
    const dryRows = (data.dryIngredients||[]).map((ing,i) => ({
      recipe_id: recId, name: ing.name, amount: ing.amount,
      ingredient_id: ing.ingredientId||null, sub_type: 'flour', sort_order: i,
    }));
    const wetRows = (data.wetIngredients||[]).map((ing,i) => ({
      recipe_id: recId, name: ing.name, amount: ing.amount,
      ingredient_id: ing.ingredientId||null, sub_type: 'wet', sort_order: i,
    }));
    if(dryRows.length + wetRows.length > 0) {
      await sb.insert('recipe_ingredients', [...dryRows, ...wetRows]);
    }

    // Insert steps
    const stepRows = (data.steps||[]).map((s,i) => ({
      recipe_id: recId, title: s.title, description: s.desc||'',
      timer_minutes: s.timer||0, sort_order: i,
    }));
    if(stepRows.length > 0) await sb.insert('recipe_steps', stepRows);

    // Javasolt ár számítása receptúra alapján
    const laborCost = (data.laborH||1) * (R.settings.labor||55);
    const elecCost = (data.electricity||5) * (R.settings.electricity||1.5);
    const toolCost = (R.settings.toolWear||5) + (R.settings.consumables||0.5);
    const suggestedPrice = Math.ceil((laborCost + elecCost + toolCost) * (1 + (R.settings.margin||50)/100));
    const productPayload = {
      name: data.name,
      weight: `${data.unitWeight||data.basePortion} g`,
      price: data.productPrice || suggestedPrice,
      category: data.category||'Kenyér',
      description: data.desc||'',
      marketing_desc: data.marketing||'',
      ingredient_label: data.ingredientLabel||'',
      allergens: data.allergens||'',
      nutrition: data.nutrition ? JSON.stringify(data.nutrition) : null,
    };
    let prodId = data.product_id || null;
    if (prodId) {
      // Meglévő termék frissítése (kód nem változik)
      await sb.update('products', productPayload, `id=eq.${prodId}`);
    } else {
      // Új termék – Supabase generálja az ID-t, kód az ID alapján
      const savedProd = await sb.insert('products', productPayload);
      prodId = savedProd[0].id;
      const autoCode = generateProductCode(data.name, data.category||'Kenyér', prodId);
      await sb.update('products', {code: autoCode}, `id=eq.${prodId}`);
    }
    // Visszalinkeljük a product_id-t a recepthez
    await sb.update('recipes', {product_id: prodId}, `id=eq.${recId}`);
    // Lokális R.recipes tömb frissítése
    const localRec = R.recipes.find(r => r.id === recId);
    if (localRec) localRec.product_id = prodId;

    console.log(`✅ Recept Supabase-be mentve: ${data.name}`);
  } catch(e) {
    console.error('syncRecipeToSupabase error:', e);
    toast('⚠️ Supabase mentés sikertelen: '+e.message);
  }
}

async function saveAiSettings() {
  R.settings.apiKey = document.getElementById('s-api-key').value.trim();
  R.settings.aiProvider = document.getElementById('s-ai-provider').value;
  R.settings.aiModel = document.getElementById('s-ai-model').value.trim() || 'claude-sonnet-4-20250514';
  R.settings.aiUrl = document.getElementById('s-ai-url')?.value.trim() || '';
  // Supabase-be mentés
  try {
    await sb.setSetting('recipe_ai_settings', {
      apiKey: R.settings.apiKey,
      aiProvider: R.settings.aiProvider,
      aiModel: R.settings.aiModel,
      aiUrl: R.settings.aiUrl
    });
    toast('✅ AI beállítások mentve (Supabase)!');
  } catch(e) { toast('⚠️ Mentés sikertelen: ' + e.message); }
}

function loadAiSettingsUI() {
  if(document.getElementById('s-api-key')) document.getElementById('s-api-key').value = R.settings.apiKey||'';
  if(document.getElementById('s-ai-provider')) document.getElementById('s-ai-provider').value = R.settings.aiProvider||'anthropic';
  const _provDefaults = {anthropic:'claude-sonnet-4-20250514',gemini:'gemini-1.5-flash',groq:'llama3-8b-8192',openai:'gpt-4o-mini'};
  if(document.getElementById('s-ai-model')) document.getElementById('s-ai-model').value = R.settings.aiModel || _provDefaults[R.settings.aiProvider||'anthropic'] || '';
  if(document.getElementById('s-ai-url')) document.getElementById('s-ai-url').value = R.settings.aiUrl||'';
  // Custom URL sor megjelenítése
  const prov = R.settings.aiProvider||'anthropic';
  const urlRow = document.getElementById('s-ai-custom-url-row');
  if(urlRow) urlRow.style.display = prov==='custom' ? 'block' : 'none';
}

function renderRecipeCatsList() {
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
          <button class="btn btn-danger btn-xs" onclick="event.stopPropagation();deleteRecipeCat(${i})" ${count>0?'disabled title="Előbb rendeld át a recepteket"':''} style="${count>0?'opacity:0.4;cursor:not-allowed':''}">✕</button>
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
    await sb.update('recipes', {category: newCat}, `id=eq.${recipeId}`);
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
  if(!confirm(`Törlöd a(z) "${cat}" kategóriát? Nincs hozzá recept, biztonságos.`)) return;
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
      await sb.update('recipes', {product_id: prodId}, `id=eq.${rec.id}`);
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
