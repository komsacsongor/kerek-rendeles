// ===== AI RECEPT IMPORT =====
// mammoth.js betöltése Word feldolgozáshoz
function loadMammoth() {
  return new Promise((resolve) => {
    if(window.mammoth) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
    s.onload = resolve; document.head.appendChild(s);
  });
}

// SheetJS betöltése Excel feldolgozáshoz
function loadXLSX() {
  return new Promise((resolve) => {
    if(window.XLSX) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = resolve; document.head.appendChild(s);
  });
}

async function handleFileImport(input, type) {
  const file = input.files[0];
  if(!file) return;
  const status = document.getElementById('import-status');
  status.style.display='block'; status.textContent='⏳ Fájl olvasása...';
  try {
    let text = '';
    if(type === 'docx') {
      await loadMammoth();
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({arrayBuffer});
      text = result.value;
    } else if(type === 'xlsx') {
      await loadXLSX();
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, {type:'array'});
      // Kérjük meg a felhasználót melyik lapot importálja
      const sheetNames = wb.SheetNames.filter(n => !['lisztkeverék','kovász és levain','kovász számolás'].includes(n));
      const sheetName = await selectSheet(sheetNames, wb);
      if(!sheetName) { status.textContent='Importálás megszakítva.'; return; }
      const ws = wb.Sheets[sheetName];
      text = XLSX.utils.sheet_to_csv(ws, {FS:'\t'});
      // Lapnév = recept neve
      if(!document.getElementById('r-name').value) {
        document.getElementById('r-name').value = sheetName;
      }
    }
    document.getElementById('r-text-input').value = text.substring(0, 8000);
    status.textContent = '✅ Fájl betöltve! Kattints az AI feldolgozásra.';
    if(R.settings?.apiKey) {
      status.textContent = '⏳ AI feldolgozás...';
      await aiParseRecipe(text);
    } else {
      status.textContent = '✅ Szöveg betöltve. AI feldolgozáshoz add meg az API kulcsot a Beállításokban.';
    }
  } catch(e) {
    status.textContent = '❌ Hiba: ' + e.message;
    console.error(e);
  }
  input.value = '';
}

async function selectSheet(sheets, wb) {
  if(sheets.length === 1) return sheets[0];
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center';
    const box = document.createElement('div');
    box.style.cssText = 'background:white;border-radius:14px;padding:24px;max-width:320px;width:100%';
    const title = document.createElement('div');
    title.style.cssText = 'font-weight:700;font-size:1rem;margin-bottom:14px;color:var(--teal-dark)';
    title.textContent = 'Melyik receptet importálod?';
    box.appendChild(title);
    sheets.forEach(s => {
      const btn = document.createElement('button');
      btn.textContent = '📋 ' + s;
      btn.style.cssText = 'display:block;width:100%;text-align:left;padding:9px 14px;margin-bottom:6px;border:1.5px solid var(--border);border-radius:9px;background:white;cursor:pointer;font-family:Kodchasan,sans-serif;font-size:0.85rem';
      btn.onclick = () => { document.body.removeChild(overlay); resolve(s); };
      box.appendChild(btn);
    });
    const cancel = document.createElement('button');
    cancel.textContent = 'Mégsem';
    cancel.style.cssText = 'width:100%;padding:8px;border:none;background:none;color:var(--text-soft);cursor:pointer;font-size:0.82rem';
    cancel.onclick = () => { document.body.removeChild(overlay); resolve(null); };
    box.appendChild(cancel);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  });
}

async function aiParseRecipe(text) {
  const apiKey = R.settings?.apiKey;
  const provider = R.settings?.aiProvider || 'anthropic';
  const _pd = {anthropic:'claude-sonnet-4-20250514',gemini:'gemini-2.0-flash',groq:'llama-3.3-70b-versatile',openai:'gpt-4o-mini'};
  const model = R.settings?.aiModel || _pd[R.settings?.aiProvider||'anthropic'] || 'gemini-1.5-flash';
  const status = document.getElementById('import-status');

  if(!apiKey) { toast('⚠️ Adj meg AI API kulcsot a Beállításokban!'); return; }

  status.style.display='block'; status.textContent='🤖 AI feldolgozás folyamatban...';

  const prompt = `Te egy gluténmentes pékség receptjeinek feldolgozója vagy. Az alábbi szövegből olvasd ki a recept adatait és add vissza CSAK JSON formátumban, semmi más szöveg ne legyen a válaszban.

A JSON struktúra:
{
  "name": "recept neve",
  "category": "Kenyér|Bagett / zsömle|Péksütemény|Sütemény",
  "basePortion": 1000,
  "desc": "belső megjegyzés a technológiáról",
  "marketing": "2-3 mondatos marketing szöveg a vevőknek (ha nincs a szövegben, generálj a receptből)",
  "ingredientLabel": "összetevők vesszővel, EU sorrendben (csökkenő mennyiség szerint)",
  "allergens": "allergének listája",
  "nutrition": {
    "kcal": 230, "kj": 963, "fat": 5.0, "satFat": 0.8,
    "carb": 40.0, "sugar": 1.5, "fiber": 4.0, "protein": 6.0, "salt": 1.0
  },
  "dryIngredients": [{"name": "rizsliszt", "amount": 270}],
  "wetIngredients": [{"name": "víz", "amount": 440}],
  "levainAmount": 100,
  "steps": [{"title": "Keverés", "desc": "4-5 perc keverés", "timer": 5}],
  "temp1": 200, "time1": 15, "temp2": 185, "time2": 30
}

FONTOS:
- A tápértékeket MINDIG 100g sült termékre számold ki az összetevőkből (ha nincs megadva, becsüld az összetevőkből)
- A kJ értéke kcal × 4.184
- Az összetevő cimkénél EU szabvány: csökkenő mennyiség, zárójelben az összetett összetevők
- Ha marketing szöveg nincs, írj egyet a termék jellemzői alapján (max 2-3 mondat, pozitív, természetes)
- A basePortion a SÜLT kenyér tömege gramban
- A levainAmount a teljes tészta levain tartalma gramban
- A dryIngredients: lisztek, keményítők, magvak, só, sütőpor – száraz összetevők
- A wetIngredients: víz, olaj, tojás, folyadékok + levain is ide kerül

Recept szöveg:
${text.substring(0, 6000)}`;

  try {
    let apiUrl, headers, body;
    if(provider === 'anthropic' || provider === 'custom') {
      apiUrl = provider === 'custom' ? (R.settings.aiUrl || 'https://api.anthropic.com/v1/messages') : 'https://api.anthropic.com/v1/messages';
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      };
      body = JSON.stringify({ model, max_tokens: 2000, messages: [{role:'user', content: prompt}] });
    } else if(provider === 'gemini') {
      const mdl = (model && model.toLowerCase().includes('gemini') && !['Gemini','gemini'].includes(model)) ? model : 'gemini-2.0-flash';
      const cleanMdl = mdl.replace('models/','');
      apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${cleanMdl}:generateContent?key=${apiKey}`;
      headers = { 'Content-Type': 'application/json' };
      body = JSON.stringify({ contents: [{parts: [{text: prompt}]}], generationConfig: {maxOutputTokens: 2000} });
    } else if(provider === 'groq') {
      apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
      headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey };
      body = JSON.stringify({ model: model||'llama3-8b-8192', max_tokens: 2000, messages: [{role:'user', content: prompt}] });
    } else {
      // OpenAI kompatibilis
      apiUrl = 'https://api.openai.com/v1/chat/completions';
      headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey };
      body = JSON.stringify({ model, max_tokens: 2000, messages: [{role:'user', content: prompt}] });
    }

    const res = await fetch(apiUrl, {method:'POST', headers, body});
    if(!res.ok) { throw new Error('API hiba: ' + res.status + ' ' + await res.text()); }
    const data = await res.json();

    let jsonText;
    if(provider === 'gemini') {
      jsonText = data.candidates[0].content.parts[0].text;
    } else if(provider === 'openai' || provider === 'groq') {
      jsonText = data.choices[0].message.content;
    } else {
      jsonText = data.content[0].text;
    }

    // JSON tisztítása
    jsonText = jsonText.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
    const recipe = JSON.parse(jsonText);

    // Form kitöltése
    fillRecipeForm(recipe);
    status.textContent = '✅ AI feldolgozás kész! Ellenőrizd az adatokat és mentsd el.';
    // Ugrás az első tabra
    document.querySelector('.modal-tab').click();
    toast('✅ Recept kész! Ellenőrizd és mentsd.');

  } catch(e) {
    status.textContent = '❌ AI hiba: ' + e.message;
    console.error('AI parse error:', e);
  }
}

function fillRecipeForm(r) {
  if(r.name) document.getElementById('r-name').value = r.name;
  if(r.category) document.getElementById('r-category').value = r.category;
  if(r.basePortion) document.getElementById('r-base-portion').value = r.basePortion;
  if(r.desc) document.getElementById('r-desc').value = r.desc;
  if(r.temp1) document.getElementById('r-temp1').value = r.temp1;
  if(r.time1) document.getElementById('r-time1').value = r.time1;
  if(r.temp2) document.getElementById('r-temp2').value = r.temp2;
  if(r.time2) document.getElementById('r-time2').value = r.time2;
  if(r.levainAmount) document.getElementById('r-levain-amount').value = r.levainAmount;
  // Vevői info tab
  if(r.marketing) document.getElementById('r-marketing').value = r.marketing;
  if(r.ingredientLabel) document.getElementById('r-ingredient-label').value = r.ingredientLabel;
  if(r.allergens) document.getElementById('r-allergens').value = r.allergens;
  if(r.nutrition) {
    const n = r.nutrition;
    if(n.kcal) document.getElementById('r-nut-kcal').value = n.kcal;
    if(n.kj) document.getElementById('r-nut-kj').value = n.kj;
    if(n.fat !== undefined) document.getElementById('r-nut-fat').value = n.fat;
    if(n.satFat !== undefined) document.getElementById('r-nut-satfat').value = n.satFat;
    if(n.carb !== undefined) document.getElementById('r-nut-carb').value = n.carb;
    if(n.sugar !== undefined) document.getElementById('r-nut-sugar').value = n.sugar;
    if(n.fiber !== undefined) document.getElementById('r-nut-fiber').value = n.fiber;
    if(n.protein !== undefined) document.getElementById('r-nut-protein').value = n.protein;
    if(n.salt !== undefined) document.getElementById('r-nut-salt').value = n.salt;
  }
  if(r.dryIngredients) { modalDryIngs = r.dryIngredients; }
  if(r.wetIngredients) { modalWetIngs = r.wetIngredients; }
  if(r.steps) { modalSteps = r.steps; }
  renderModalIngredients();
  renderModalSteps();
}

function parseTextRecipe() {
  const text = document.getElementById('r-text-input').value.trim();
  if (!text) { toast('Add meg a szöveges receptet!'); return; }

  // Smart local parser for common Hungarian/Romanian recipe formats
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  let dryIngs = [], wetIngs = [], steps = [];
  let currentSection = null;
  let foundAnything = false;

  // Keyword detection
  const DRY_KEYWORDS = ['liszt','keményítő','por','só','cukor','sütőpor','élesztő','mag','psyllium','gumi','korpa','zabpehely'];
  const WET_KEYWORDS = ['víz','olaj','tej','tojás','ecet','joghurt','szósz','folyadék','ml','dl'];
  const STEP_KEYWORDS = ['dagaszt','kever','süt','kelesi','kelesztés','pihentet','sütési','hőfokon','perc','óra','tegyük','vegyük','adjuk'];

  lines.forEach(line => {
    const low = line.toLowerCase();

    // Section headers
    if(low.includes('száraz') || low.includes('liszt') && low.length < 20) { currentSection='dry'; return; }
    if(low.includes('nedves') || low.includes('folyékony')) { currentSection='wet'; return; }
    if(low.includes('folyamat') || low.includes('elkészítés') || low.includes('lépés')) { currentSection='steps'; return; }

    // Try to parse ingredient line: "Name: Amount g" or "Amount g Name"
    const ingMatch = line.match(/^(.+?)[\s:–-]+(\d+[\.,]?\d*)\s*(g|kg|ml|dl|db|ek|tk|csipet)?(.*)$/i) ||
                     line.match(/^(\d+[\.,]?\d*)\s*(g|kg|ml|dl|db|ek|tk|csipet)?\s+(.+)$/i);

    if (ingMatch) {
      let name, amount, unit;
      if(ingMatch[0].match(/^\d/)) {
        amount = parseFloat(ingMatch[1].replace(',','.'));
        unit = ingMatch[2]||'g';
        name = ingMatch[3];
      } else {
        name = ingMatch[1].trim();
        amount = parseFloat(ingMatch[2].replace(',','.'));
        unit = ingMatch[3]||'g';
      }

      // Convert units to grams
      if(unit==='kg') amount *= 1000;
      if(unit==='dl') amount *= 100;
      if(unit==='ml') amount *= 1;

      // Match to existing ingredient
      const matchedIng = R.ingredients.find(i =>
        i.name.toLowerCase().includes(name.toLowerCase().slice(0,6)) ||
        name.toLowerCase().includes(i.name.toLowerCase().slice(0,6))
      );

      const ingObj = {name: name.trim(), amount: Math.round(amount), ingredientId: matchedIng?.id || null};

      // Determine dry/wet from name or current section
      const isDry = currentSection==='dry' || (!currentSection && DRY_KEYWORDS.some(k=>low.includes(k)));
      const isWet = currentSection==='wet' || (!currentSection && WET_KEYWORDS.some(k=>low.includes(k)));

      if(isDry) { dryIngs.push(ingObj); foundAnything=true; }
      else if(isWet) { wetIngs.push(ingObj); foundAnything=true; }
      else { dryIngs.push(ingObj); foundAnything=true; } // default to dry
      return;
    }

    // Try to parse as step
    if(currentSection==='steps' || STEP_KEYWORDS.some(k=>low.includes(k))) {
      if(line.length > 15) {
        const timerMatch = line.match(/(\d+)\s*(perc|óra|h)/i);
        const timer = timerMatch ? (timerMatch[2].startsWith('ó')||timerMatch[2]==='h' ? parseInt(timerMatch[1])*60 : parseInt(timerMatch[1])) : 0;
        const stepNum = steps.length+1;
        steps.push({
          title: line.slice(0,40) + (line.length>40?'…':''),
          desc: line,
          timer
        });
        foundAnything = true;
      }
    }
  });

  if (!foundAnything) {
    toast('⚠️ Nem sikerült összetevőket felismerni. Ellenőrizd a formátumot: "Liszt: 200 g" vagy "200 g liszt"');
    return;
  }

  // Fill in the form
  if(dryIngs.length > 0) {
    modalDryIngs = dryIngs;
    toast(`✨ Felismert ${dryIngs.length} száraz + ${wetIngs.length} nedves összetevő, ${steps.length} lépés. Ellenőrizd a Száraz/Nedves/Folyamat füleken!`);
  }
  if(wetIngs.length > 0) modalWetIngs = wetIngs;
  if(steps.length > 0) modalSteps = steps;

  renderModalIngredients();
  renderModalSteps();

  // Note about API
  if(!R.settings?.apiKey) {
    const note = document.getElementById('parse-api-note');
    if(note) note.style.display='block';
  }
}

async function saveRecipe() {
  const name = document.getElementById('r-name').value.trim();
  if (!name) { toast('Recept neve kötelező!'); return; }
  const data = {
    product_id: parseInt(document.getElementById('r-product-link')?.value)||null,
    familyId: document.getElementById('r-family-id')?.value ? parseInt(document.getElementById('r-family-id').value) : null,
    name, category: document.getElementById('r-category').value,
    basePortion: parseFloat(document.getElementById('r-base-portion').value)||1000,
    bakeLoss: parseFloat(document.getElementById('r-bake-loss').value)||R.settings.bakeLoss,
    unitWeight: parseFloat(document.getElementById('r-unit-weight').value)||1000,
    temp1: parseFloat(document.getElementById('r-temp1').value)||230,
    time1: parseFloat(document.getElementById('r-time1').value)||20,
    temp2: parseFloat(document.getElementById('r-temp2').value)||180,
    time2: parseFloat(document.getElementById('r-time2').value)||70,
    desc: document.getElementById('r-desc').value,
    levainAmount: parseFloat(document.getElementById('r-levain-amount').value)||260,
    marketing: document.getElementById('r-marketing')?.value || '',
    ingredientLabel: document.getElementById('r-ingredient-label')?.value || '',
    allergens: document.getElementById('r-allergens')?.value || '',
    nutrition: {
      kcal: parseFloat(document.getElementById('r-nut-kcal')?.value)||0,
      kj: parseFloat(document.getElementById('r-nut-kj')?.value)||0,
      fat: parseFloat(document.getElementById('r-nut-fat')?.value)||0,
      satFat: parseFloat(document.getElementById('r-nut-satfat')?.value)||0,
      carb: parseFloat(document.getElementById('r-nut-carb')?.value)||0,
      sugar: parseFloat(document.getElementById('r-nut-sugar')?.value)||0,
      fiber: parseFloat(document.getElementById('r-nut-fiber')?.value)||0,
      protein: parseFloat(document.getElementById('r-nut-protein')?.value)||0,
      salt: parseFloat(document.getElementById('r-nut-salt')?.value)||0,
    },
    dryIngredients: modalDryIngs,
    wetIngredients: modalWetIngs,
    steps: modalSteps,
    laborH: parseFloat(document.getElementById('r-labor-h').value)||1,
    electricity: parseFloat(document.getElementById('r-electricity').value)||5,
    setupMin: (v=>v===''||v==null?null:parseFloat(v))(document.getElementById('r-setup-min')?.value),
    perUnitMin: (v=>v===''||v==null?null:parseFloat(v))(document.getElementById('r-per-unit-min')?.value),
    bakeMin: (v=>v===''||v==null?null:parseFloat(v))(document.getElementById('r-bake-min')?.value),
    bakeTempC: (v=>v===''||v==null?null:parseFloat(v))(document.getElementById('r-bake-temp')?.value),
    unitsPerTray: (v=>v===''||v==null?null:parseFloat(v))(document.getElementById('r-units-per-tray')?.value),
    traysPerCycle: (v=>v===''||v==null?null:parseFloat(v))(document.getElementById('r-trays-per-cycle')?.value),
    mixerMin: (v=>v===''||v==null?null:parseFloat(v))(document.getElementById('r-mixer-min')?.value),
    productPrice: (() => { const v = parseFloat(document.getElementById('r-product-price')?.value); return (!isNaN(v) && v > 0) ? v : null; })(),
  };
  if (editingRecipeId) {
    Object.assign(R.recipes.find(r=>r.id===editingRecipeId), data);
    await syncRecipeToSupabase(data, editingRecipeId);
    auditLog('recipe_update', data.name, `Frissítve (id:${editingRecipeId})`);
    toast('✅ Recept frissítve!');
    save(); closeModal('recipe-modal'); renderRecipes();
  } else {
    // Duplikátum check – modal nyitva marad ha hiba van
    if (!data.product_id) {
      try {
        const allProds = await sb.query('products', { limit: 500 });
        const nameToCheck = (data.name||'').trim().toLowerCase();
        const existing = (allProds||[]).find(p =>
          (p.name||'').trim().toLowerCase() === nameToCheck && !p.deleted_at
        );
        if (existing) {
          if (await confirmDialog(`Van már "${existing.name}" nevű termék (kód: ${existing.code||existing.id}). Hozzákapcsolod ehhez a recepthez? (Az ár és a termékadatok ehhez a meglévő termékhez fognak tartozni.)`)) {
            data.product_id = existing.id; // linkelés a meglévő (admin) termékhez
            data.productPrice = null;      // a meglévő termék árát NE írjuk felül linkeléskor
          } else {
            return; // Modal nyitva marad — válasszon más nevet
          }
        }
      } catch(e) { console.warn('Dup check:', e.message); }
    }
    // Sequence: DB-ből kérdezzük a max id-t
    try {
      const dbMax = await kData.query('recipes', {select:'id', order:'id.desc', limit:1});
      data.id = dbMax.length ? dbMax[0].id + 1 : Math.max(...R.recipes.map(r=>r.id),0)+1;
    } catch(e) {
      data.id = Math.max(...R.recipes.map(r=>r.id),0)+1;
    }
    R.recipes.push(data);
    await syncRecipeToSupabase(data, null);
    auditLog('recipe_create', data.name, 'Új recept létrehozva');
    toast('✅ Recept mentve!');
    save(); closeModal('recipe-modal'); renderRecipes();
  }
}

function editCurrentRecipe() { openRecipeModal(currentRecipeId); }
async function deleteCurrentRecipe() {
  if (!(await confirmDialog('⚠️ Végleges törlés! A recept, a kapcsolódó termék és minden adata törlődik. Biztosan folytatod?'))) return;
  const rec = R.recipes.find(r=>r.id===currentRecipeId);
  let prodId = rec?.product_id;
  if (!prodId && rec?.name) { const _m = (typeof _adminProductsCache !== 'undefined' ? _adminProductsCache : []).filter(p => (p.name||'').trim().toLowerCase() === (rec.name||'').trim().toLowerCase() && !p.deleted_at); if (_m.length === 1) prodId = _m[0].id; }
  R.recipes = R.recipes.filter(r=>r.id!==currentRecipeId);
  try {
    await kData.delete('recipe_ingredients', `recipe_id=eq.${currentRecipeId}`);
    await kData.delete('recipe_steps', `recipe_id=eq.${currentRecipeId}`);
    await kData.delete('recipes', `id=eq.${currentRecipeId}`);
    if(prodId) {
      await sb.delete('monthly_active_products', `product_id=eq.${prodId}`);
      await sb.delete('products', `id=eq.${prodId}`);
    }
  } catch(e) { console.warn('Recipe delete error:', e.message); }
  auditLog('recipe_delete', rec?.name||'?', `ID: ${currentRecipeId}`);
  save(); closeModal('recipe-modal'); nav('recipes'); renderRecipes(); toast('Recept és termék véglegesen törölve.');
}

async function archiveCurrentRecipe() {
  if (!(await confirmDialog('Archiválod ezt a receptet? A termék eltűnik a rendelési rendszerből, de visszahívható.'))) return;
  const rec = R.recipes.find(r=>r.id===currentRecipeId);
  if(!rec) return;
  rec.archived = true;
  const prodId = rec.product_id;
  try {
    await kData.update('recipes', {archived: true}, `id=eq.${currentRecipeId}`);
    if(prodId) {
      // Kivesszük az összes havi aktív termékből (jelen és jövőbeli hónapok)
      const now = new Date();
      await sb.delete('monthly_active_products', `product_id=eq.${prodId}&year=gte.${now.getFullYear()}`);
    }
  } catch(e) { console.warn('Archive error:', e.message); }
  auditLog('recipe_archive', rec?.name||'?', `ID: ${currentRecipeId}`);
  save(); closeModal('recipe-modal'); nav('recipes'); renderRecipes(); toast('Recept archiválva.');
}

async function restoreRecipe(recipeId) {
  const rec = R.recipes.find(r=>r.id===recipeId);
  if(!rec) return;
  rec.archived = false;
  const prodId = rec.product_id;
  try {
    await kData.update('recipes', {archived: false}, `id=eq.${recipeId}`);
    // Hozzáadjuk a jelenlegi hónaphoz mint potenciális termék
    if(prodId) {
      const now = new Date();
      await sb.upsert('monthly_active_products', {
        year: now.getFullYear(),
        month: now.getMonth(), // 0-indexed
        product_id: prodId
      }, 'year,month,product_id');
    }
  } catch(e) { console.warn('Restore error:', e.message); }
  auditLog('recipe_restore', rec?.name||'?', `ID: ${recipeId}`);
  save(); nav('archiv'); toast('✅ Recept visszaállítva és hozzáadva az aktív termékekhez.');
}

async function deleteArchivedRecipe(recipeId) {
  if (!(await confirmDialog('Végleges törlés az archívból! Visszahozhatatlan. Biztosan folytatod?'))) return;
  const rec = R.recipes.find(r=>r.id===recipeId);
  let prodId = rec?.product_id;
  if (!prodId && rec?.name) { const _m = (typeof _adminProductsCache !== 'undefined' ? _adminProductsCache : []).filter(p => (p.name||'').trim().toLowerCase() === (rec.name||'').trim().toLowerCase() && !p.deleted_at); if (_m.length === 1) prodId = _m[0].id; }
  R.recipes = R.recipes.filter(r=>r.id!==recipeId);
  try {
    await kData.delete('recipe_ingredients', `recipe_id=eq.${recipeId}`);
    await kData.delete('recipe_steps', `recipe_id=eq.${recipeId}`);
    await kData.delete('recipes', `id=eq.${recipeId}`);
    if(prodId) {
      await sb.delete('monthly_active_products', `product_id=eq.${prodId}`);
      await sb.delete('products', `id=eq.${prodId}`);
    }
  } catch(e) { console.warn('Delete archived error:', e.message); }
  save(); nav('archiv'); toast('Recept véglegesen törölve az archívból.');
}

// ===== ÚJ VERZIÓ =====
async function newRecipeVersion() {
  const r = R.recipes.find(r => r.id === currentRecipeId);
  if (!r) return;
  if (!(await confirmDialog(`"${r.name}" v${r.version||1} → v${(r.version||1)+1}\n\nAz aktuális verzió archiválódik, és megnyílik az új verzió szerkesztésre. Folytatod?`))) return;

  // Archive current
  r.archived = true;
  await kData.update('recipes', {archived: true}, `id=eq.${r.id}`);
  auditLog('recipe_archive', r.name, `v${r.version||1} archiválva, új verzió indul`);

  // Clone with new id and version+1
  const newVer = (r.version || 1) + 1;
  let newId;
  try {
    const dbMax = await kData.query('recipes', {select:'id', order:'id.desc', limit:1});
    newId = dbMax.length ? dbMax[0].id + 1 : Math.max(...R.recipes.map(x=>x.id),0)+1;
  } catch(e) {
    newId = Math.max(...R.recipes.map(x=>x.id),0)+1;
  }

  const clone = JSON.parse(JSON.stringify(r));
  clone.id = newId;
  clone.version = newVer;
  clone.archived = false;
  clone.activatedAt = new Date().toISOString();
  R.recipes.push(clone);

  // Sync to Supabase
  await syncRecipeToSupabase(clone, null);

  // Copy ingredients and steps
  try {
    const ings = await kData.query('recipe_ingredients', {filter:`recipe_id=eq.${r.id}`});
    const steps = await kData.query('recipe_steps', {filter:`recipe_id=eq.${r.id}`});
    if (ings.length) {
      await kData.insert('recipe_ingredients', ings.map(i => ({...i, id:undefined, recipe_id:newId})));
    }
    if (steps.length) {
      await kData.insert('recipe_steps', steps.map(s => ({...s, id:undefined, recipe_id:newId})));
    }
  } catch(e) { console.warn('version clone ings/steps:', e); }

  save();
  toast(`✅ v${newVer} létrehozva! Az előző verzió archiválva.`);
  auditLog('recipe_create', clone.name, `v${newVer} – klónozva v${r.version||1}-ből`);

  // Open new version for editing
  currentRecipeId = newId;
  renderRecipes();
  openRecipeModal(newId);
}
