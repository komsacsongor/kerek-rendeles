// =============================================================
// KEREK Receptúra – Beállítások: pénzügyi, sütési, AI (v2.32.0 M10 bontás)
// Eredetileg: js/receptura-settings.js (684 sor)
// =============================================================



// ===== ALAPANYAG CSOPORTOK (ingredient category) =====

function renderSettings() {
  if(document.getElementById('r-categories-list')) renderRCategories();
  if(document.getElementById('ing-categories-list')) renderIngCategories();
  if(document.getElementById('s-api-key') && R.settings?.apiKey) {
    document.getElementById('s-api-key').value = R.settings.apiKey;
  }
  loadAiSettingsUI();
  const s = R.settings;
  document.getElementById('s-vat').value = s.vat;
  document.getElementById('s-margin').value = s.margin;
  document.getElementById('s-labor').value = s.labor;
  document.getElementById('s-electricity').value = s.electricity;
  const mo=document.getElementById('s-monthly-overhead'); if(mo) mo.value = s.monthlyOverhead ?? '';
  const mh=document.getElementById('s-monthly-hours');    if(mh) mh.value = s.monthlyProdHours ?? '';
  const tt=document.getElementById('s-temp-tolerance');   if(tt) tt.value = s.tempToleranceC ?? 10;
  updateShopRateInfo();
  if (typeof renderEquipment === 'function') renderEquipment();
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
    monthlyOverhead: parseFloat(document.getElementById('s-monthly-overhead')?.value)||0,
    monthlyProdHours: parseFloat(document.getElementById('s-monthly-hours')?.value)||0,
    tempToleranceC: parseFloat(document.getElementById('s-temp-tolerance')?.value)||10,
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
  // Supabase-ből ellenőrizzük, nem cache-ből (cache lehet üres!)
  // Duplikátum check áthelyezve saveRecipe()-be (modal nyitva marad hiba esetén)
  try {
    const recId = existingId || data.id;
    
    // Upsert recipe
    await kData.upsert('recipes', {
      id: recId, name: data.name, category: data.category, version: data.version||1,
      activated_at: data.activatedAt || new Date().toISOString(),
      product_id: data.product_id || null,
      base_portion: data.basePortion, bake_loss: data.bakeLoss,
      unit_weight: data.unitWeight, temp1: data.temp1, time1: data.time1,
      temp2: data.temp2, time2: data.time2, description: data.desc||'',
      levain_amount: data.levainAmount, labor_h: data.laborH||1,
      electricity: data.electricity||5,
      setup_min: data.setupMin ?? null, per_unit_min: data.perUnitMin ?? null,
      bake_min: data.bakeMin ?? null, bake_temp_c: data.bakeTempC ?? null,
      units_per_tray: data.unitsPerTray ?? null, trays_per_cycle: data.traysPerCycle ?? null, mixer_min: data.mixerMin ?? null,
      marketing_desc: data.marketing||'',
      ingredient_label: data.ingredientLabel||'',
      allergens: data.allergens||'',
      nutrition: data.nutrition ? JSON.stringify(data.nutrition) : null,
    });

    // Delete old ingredients and steps, re-insert
    await kData.delete('recipe_ingredients', `recipe_id=eq.${recId}`);
    await kData.delete('recipe_steps', `recipe_id=eq.${recId}`);

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
      await kData.insert('recipe_ingredients', [...dryRows, ...wetRows]);
    }

    // Insert steps
    const stepRows = (data.steps||[]).map((s,i) => ({
      recipe_id: recId, title: s.title, description: s.desc||'',
      timer_minutes: s.timer||0, sort_order: i,
    }));
    if(stepRows.length > 0) await kData.insert('recipe_steps', stepRows);

    // Javasolt ár számítása receptúra alapján
    const laborCost = (data.laborH||1) * (R.settings.labor||55);
    const elecCost = (data.electricity||5) * (R.settings.electricity||1.5);
    const toolCost = (R.settings.toolWear||5) + (R.settings.consumables||0.5);
    const suggestedPrice = Math.ceil((laborCost + elecCost + toolCost) * (1 + (R.settings.margin||50)/100));
    const productPayload = {
      weight: `${data.unitWeight||data.basePortion} g`,
      category: data.category||'Kenyér',
      description: data.desc||'',
      marketing_desc: data.marketing||'',
      ingredient_label: data.ingredientLabel||'',
      allergens: data.allergens||'',
      nutrition: data.nutrition ? JSON.stringify(data.nutrition) : null,
      // v2.53.93: product_family_id NEM innen íródik (a család KIZÁRÓLAG admin-jog).
      // A NÉV csak ÚJ terméknél (create) — meglévőnél az admin a gazda, nem írjuk felül.
    };
    let prodId = data.product_id || null;
    let newlyCreatedProdId = null; // rollback-hez
    // Ár: csak ha a felhasználó adott meg árat → azt írjuk. Ha nem: új terméknél javasolt,
    // MEGLÉVŐ terméknél NEM piszkáljuk (megőrizzük az admin által beállított árat).
    if (data.productPrice != null) {
      productPayload.price = data.productPrice;
    } else if (!prodId) {
      productPayload.price = suggestedPrice;
    }
    if (prodId) {
      // Meglévő termék frissítése — NÉV és CSALÁD marad (admin a gazda), csak a recept-származtatott mezők
      await sb.update('products', productPayload, `id=eq.${prodId}`);
    } else {
      // Új termék: a recept NEVÉVEL jön létre (a te kérésed: azonos névvel az adminban)
      const savedProd = await sb.insert('products', {...productPayload, name: data.name});
      prodId = savedProd[0].id;
      newlyCreatedProdId = prodId; // rollback-hez megjegyezzük
      const autoCode = generateProductCode(data.name, data.category||'Kenyér', prodId);
      await sb.update('products', {code: autoCode}, `id=eq.${prodId}`);
    }
    // Visszalinkeljük a product_id-t a recepthez
    try {
      await kData.update('recipes', {product_id: prodId}, `id=eq.${recId}`);
    } catch(linkErr) {
      // Rollback: ha az új termék már létrejött de a link sikertelen, töröljük
      if (newlyCreatedProdId) {
        try { await sb.delete('products', `id=eq.${newlyCreatedProdId}`); } catch(e) {}
        try { await kData.delete('recipes', `id=eq.${recId}`); } catch(e) {}
      }
      throw linkErr; // továbbadjuk a catch-nek
    }
    // Lokális R.recipes + D adatobjektum frissítése (product_id szinkron bug fix)
    const localRec = R.recipes.find(r => r.id === recId);
    if (localRec) {
      localRec.product_id = prodId;
      // v2.53.93: a család cache-frissítés eltávolítva — a családot csak az admin állítja.
    }

    debugLog(`✅ Recept Supabase-be mentve: ${data.name}`);
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
  const _provDefaults = {anthropic:'claude-sonnet-4-20250514',gemini:'gemini-1.5-flash',groq:'openai/gpt-oss-20b',openai:'gpt-4o-mini'};
  if(document.getElementById('s-ai-model')) document.getElementById('s-ai-model').value = R.settings.aiModel || _provDefaults[R.settings.aiProvider||'anthropic'] || '';
  if(document.getElementById('s-ai-url')) document.getElementById('s-ai-url').value = R.settings.aiUrl||'';
  // Custom URL sor megjelenítése
  const prov = R.settings.aiProvider||'anthropic';
  const urlRow = document.getElementById('s-ai-custom-url-row');
  if(urlRow) urlRow.style.display = prov==='custom' ? 'block' : 'none';
}


// Üzemi óradíj kijelzése (havi rezsi / havi termelő óra)
function updateShopRateInfo(){
  const el = document.getElementById('shop-rate-info'); if (!el) return;
  const rate = (typeof shopRate === 'function') ? shopRate() : 0;
  el.innerHTML = rate > 0
    ? `➜ Üzemi óradíj: <b style="color:var(--teal-dark)">${rate.toFixed(2)} lej/óra</b> (minden termelő órára ráterhelődik)`
    : '⚠️ Add meg a havi rezsit és a havi termelő órát — enélkül a rezsi nem terhelődik az önköltségre.';
}
if (typeof window !== 'undefined') window.updateShopRateInfo = updateShopRateInfo;
