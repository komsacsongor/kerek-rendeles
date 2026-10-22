// =============================================================
// KEREK Receptúra – Beállítások: pénzügyi, sütési, AI (v2.32.0 M10 bontás)
// Eredetileg: js/receptura-settings.js (684 sor)
// =============================================================



// ===== ALAPANYAG CSOPORTOK (ingredient category) =====

function renderSettings() {
  if(document.getElementById('r-categories-list')) renderRCategories();
  if(document.getElementById('ing-categories-list')) renderIngCategories();
  loadAiSettingsUI();
  const s = R.settings;
  document.getElementById('s-vat').value = s.vat;
  const vp = document.getElementById('s-vat-payer'); if(vp) vp.checked = s.companyVatPayer !== false;   // v2.56.1
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
    companyVatPayer: document.getElementById('s-vat-payer') ? document.getElementById('s-vat-payer').checked : (R.settings.companyVatPayer !== false),
  });
  save();
  // v2.56.1: az AI-kulcsok NEM kerülnek a pénzügyi beállítások közé (eddig az egész R.settings mentődött ide)
  try { await sb.setSetting('recipe_financial_settings', settingsWithoutAi(R.settings)); } catch(e) { console.warn('Supabase settings save:', e); }
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
      pieces_per_tray: data.piecesPerTray ?? null,
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

// ===== AI (v2.56.1: kulcs szolgáltatónként; receptek és számlák külön szolgáltatóval) =====
const AI_PROVIDERS = ['anthropic', 'gemini', 'groq', 'openai', 'custom'];
const AI_MODEL_DEFAULTS = { anthropic:'claude-sonnet-4-20250514', gemini:'gemini-2.5-flash', groq:'openai/gpt-oss-20b', openai:'gpt-4o-mini' };
const AI_SETTING_FIELDS = ['apiKey', 'aiProvider', 'aiModel', 'aiUrl', 'aiKeys', 'invoiceProvider', 'invoiceModel', 'invoiceVisionModel', 'invoice'];
function settingsWithoutAi(obj){ const o = { ...(obj||{}) }; AI_SETTING_FIELDS.forEach(k => delete o[k]); return o; }
// a recipe_ai_settings sorba mentendő adat (meglévő sor → frissítés; új settings-sort az RLS nem enged)
function aiSettingsPayload(){
  const S = R.settings;
  return { apiKey: S.apiKey || '', aiProvider: S.aiProvider || 'anthropic', aiModel: S.aiModel || '', aiUrl: S.aiUrl || '',
    keys: S.aiKeys || {}, invoiceProvider: S.invoiceProvider || '', invoiceModel: S.invoiceModel || '' };
}
async function persistAiSettings(){ return sb.setSetting('recipe_ai_settings', aiSettingsPayload()); }

async function saveAiSettings() {
  const keys = { ...(R.settings.aiKeys || {}) };
  AI_PROVIDERS.forEach(p => { const el = document.getElementById('s-key-' + p); if(el) keys[p] = el.value.trim(); });
  R.settings.aiKeys = keys;
  R.settings.aiProvider = document.getElementById('s-ai-provider').value;
  R.settings.apiKey = keys[R.settings.aiProvider] || '';          // a recept-AI ezt használja (változatlan)
  R.settings.aiModel = document.getElementById('s-ai-model').value.trim() || AI_MODEL_DEFAULTS[R.settings.aiProvider] || '';
  R.settings.aiUrl = document.getElementById('s-ai-url')?.value.trim() || '';
  const ip = document.getElementById('s-inv-provider')?.value || '';
  const im = document.getElementById('s-inv-model')?.value.trim() || '';
  if(ip !== (R.settings.invoiceProvider || '') && im === (R.settings.invoiceModel || '')) R.settings.invoiceModel = '';   // szolgáltató-csere → automatikus modell
  else R.settings.invoiceModel = im;
  R.settings.invoiceProvider = ip;
  const invProv = ip || R.settings.aiProvider;
  try {
    await persistAiSettings();
    loadAiSettingsUI();
    toast(!keys[invProv] ? `✅ Mentve. ⚠️ A számlákhoz választott szolgáltatóhoz (${invProv}) nincs kulcs.` : (!R.settings.apiKey ? `✅ Mentve. ⚠️ A receptekhez választott szolgáltatóhoz (${R.settings.aiProvider}) nincs kulcs.` : '✅ AI beállítások mentve!'));
  } catch(e) { toast('⚠️ Mentés sikertelen: ' + e.message, true); }
}

function aiProviderChanged(){
  const p = document.getElementById('s-ai-provider')?.value;
  const m = document.getElementById('s-ai-model');
  if(m && (!m.value || Object.values(AI_MODEL_DEFAULTS).includes(m.value))) m.value = AI_MODEL_DEFAULTS[p] || '';
  const urlRow = document.getElementById('s-ai-custom-url-row'); if(urlRow) urlRow.style.display = p === 'custom' ? 'block' : 'none';
}

function loadAiSettingsUI() {
  const S = R.settings, keys = S.aiKeys || {};
  AI_PROVIDERS.forEach(p => { const el = document.getElementById('s-key-' + p); if(el) el.value = keys[p] || ''; });
  if(document.getElementById('s-ai-provider')) document.getElementById('s-ai-provider').value = S.aiProvider||'anthropic';
  if(document.getElementById('s-ai-model')) document.getElementById('s-ai-model').value = S.aiModel || AI_MODEL_DEFAULTS[S.aiProvider||'anthropic'] || '';
  if(document.getElementById('s-ai-url')) document.getElementById('s-ai-url').value = S.aiUrl||'';
  if(document.getElementById('s-inv-provider')) document.getElementById('s-inv-provider').value = S.invoiceProvider || '';
  if(document.getElementById('s-inv-model')) document.getElementById('s-inv-model').value = S.invoiceModel || '';
  const urlRow = document.getElementById('s-ai-custom-url-row');
  if(urlRow) urlRow.style.display = (S.aiProvider||'anthropic')==='custom' ? 'block' : 'none';
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
