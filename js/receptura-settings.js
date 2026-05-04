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
  try {
    const recId = existingId || data.id;
    
    // Upsert recipe
    await sb.upsert('recipes', {
      id: recId, name: data.name, category: data.category,
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

    // Sync to products table - use productCode from modal if set
    const productCode = data.productCode || (() => {
      const catCodes = {'Kenyér':'KEN','Bagett / zsömle':'BAG','Sütemény':'SUT','Leveles tészta':'LEV','Egyéb':'EGY'};
      const prefix = catCodes[data.category] || 'EGY';
      const namePart = (data.name||'').toUpperCase()
        .replace(/[ÁÉÍÓÖŐÚÜŰ]/g, c => ({Á:'A',É:'E',Í:'I',Ó:'O',Ö:'O',Ő:'O',Ú:'U',Ü:'U',Ű:'U'}[c]||c))
        .replace(/[^A-Z]/g,'').slice(0,4)||'XXX';
      return `${prefix}-${namePart}-R${String(recId).padStart(2,'0')}`;
    })();
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
      code: productCode,
      marketing_desc: data.marketing||'',
      ingredient_label: data.ingredientLabel||'',
      allergens: data.allergens||'',
      nutrition: data.nutrition ? JSON.stringify(data.nutrition) : null,
    };
    let prodId = data.product_id || null;
    if (prodId) {
      // Meglévő termék frissítése
      await sb.update('products', productPayload, `id=eq.${prodId}`);
    } else {
      // Új termék – Supabase generálja az ID-t
      const savedProd = await sb.insert('products', productPayload);
      prodId = savedProd[0].id;
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
  document.getElementById('recipe-cats-list').innerHTML = R.recipeCategories.map((c,i)=>`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border:1px solid var(--border);border-radius:9px;background:white;margin-bottom:6px">
      <span style="font-weight:600;font-size:0.85rem">${c}</span>
      <button class="btn btn-danger btn-xs" onclick="deleteRecipeCat(${i})">✕</button>
    </div>`).join('');
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
