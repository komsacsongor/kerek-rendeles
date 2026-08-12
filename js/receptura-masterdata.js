// ===== receptura-masterdata.js — 📚 Törzsadatok (füles hub) =====
// Központi nomenklatúra-kezelés. Fülek: Kategóriák · Családok · Mértékegységek ·
// Eszközök · Termék-kategóriák · Beszállítók. Az utóbbi 3 a MEGLÉVŐ render-eket hívja.

let _mdTab = 'kategoriak';

function renderMasterData(tab) {
  if (tab) _mdTab = tab;
  const box = document.getElementById('masterdata-content');
  if (!box) return;
  const tabs = [
    ['alapanyagok','🌿 Alapanyagok'], ['kategoriak','🗂️ Alapanyag-kat.'], ['csaladok','🧬 Családok'],
    ['egysegek','📏 Mértékegységek'], ['eszkozok','🔥 Eszközök'], ['termekkat','🏷 Termék-kat.'],
    ['beszallitok','👥 Beszállítók'],
  ];
  const tabBar = tabs.map(([id,label]) =>
    `<button onclick="renderMasterData('${id}')" style="padding:8px 14px;border:none;border-radius:8px 8px 0 0;cursor:pointer;font-family:'Kodchasan',sans-serif;font-size:0.82rem;font-weight:${_mdTab===id?'700':'400'};background:${_mdTab===id?'#fff':'transparent'};color:${_mdTab===id?'var(--teal-dark)':'var(--text-soft)'};border-bottom:${_mdTab===id?'2px solid var(--teal-dark)':'2px solid transparent'}">${label}</button>`
  ).join('');
  box.innerHTML = `<div style="display:flex;gap:2px;flex-wrap:wrap;border-bottom:1px solid var(--border);margin-bottom:14px">${tabBar}</div><div id="md-tab-content"></div>`;
  const c = document.getElementById('md-tab-content');
  if (_mdTab==='alapanyagok') c.innerHTML = _mdIngredientsHtml();
  else if (_mdTab==='kategoriak') c.innerHTML = _mdCategoriesHtml();
  else if (_mdTab==='csaladok') c.innerHTML = _mdFamiliesHtml();
  else if (_mdTab==='egysegek') c.innerHTML = _mdUnitsHtml();
  else if (_mdTab==='eszkozok') { c.innerHTML = '<div style="font-size:0.82rem;color:var(--text-soft);margin-bottom:10px">Sütők és dagasztó — az önköltség-modell ezekből számol.</div><div id="equipment-list"></div>'; if(typeof renderEquipment==='function') renderEquipment(); }
  else if (_mdTab==='termekkat') { c.innerHTML = '<div id="recipe-cats-list" style="margin-bottom:14px"></div><div style="display:flex;gap:8px;max-width:400px"><input type="text" id="new-recipe-cat" placeholder="Új termék-kategória…" style="flex:1;padding:8px 12px;border:1.5px solid var(--border);border-radius:9px;font-family:\'Kodchasan\',sans-serif;font-size:0.85rem"><button class="btn btn-primary btn-sm" onclick="addRecipeCat()">＋ Hozzáad</button></div>'; if(typeof renderRecipeCatsList==='function') renderRecipeCatsList(); }
  else if (_mdTab==='beszallitok') { c.innerHTML = '<div id="view-suppliers-content"></div>'; if(typeof renderSuppliers==='function') renderSuppliers(); }
}

function _mdIngredientsHtml() {
  const ings = (R.ingredients||[]).slice().sort((a,b)=>(a.name||'').localeCompare(b.name||'','hu'));
  const fam = id => { const f=(R.ingredientFamilies||[]).find(x=>x.id===id); return f?f.name:''; };
  const row = i => '<div style="display:flex;align-items:center;gap:8px;padding:7px 2px;border-bottom:0.5px solid var(--border)">'
    + '<span style="flex:2;font-size:0.88rem;font-weight:500">' + esc(i.name) + '</span>'
    + '<span style="flex:1;font-size:0.78rem;color:var(--text-soft)">' + esc(i.cat||'—') + '</span>'
    + '<span style="width:44px;font-size:0.78rem;color:var(--text-soft);text-align:center">' + esc(i.unit||'') + '</span>'
    + '<span style="flex:1;font-size:0.78rem;color:var(--text-soft)">' + (fam(i.familyId)?('🧬 '+esc(fam(i.familyId))):'') + '</span>'
    + '<button class="btn btn-ghost btn-sm" onclick="openIngredientModal(' + i.id + ')" title="Adatlap" style="padding:2px 8px">✏️</button></div>';
  const rows = ings.length ? ings.map(row).join('') : '<div style="font-size:0.85rem;color:var(--text-soft);padding:8px 0">Nincs alapanyag.</div>';
  return '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
    + '<div style="font-size:0.82rem;color:var(--text-soft)">Az alapanyagok törzsadata (név, mértékegység, kategória, család, beszállító). A készletszint és bevételezés a <b>Készlet</b> menüben.</div>'
    + '<button class="btn btn-primary btn-sm" onclick="openIngredientModal(null)">➕ Új alapanyag</button></div>'
    + '<div style="border:1px solid var(--border);border-radius:10px;background:#fff;padding:4px 12px">'
    + '<div style="display:flex;gap:8px;padding:6px 2px;border-bottom:1.5px solid var(--border);font-size:0.72rem;color:var(--text-soft);text-transform:uppercase;letter-spacing:0.5px"><span style="flex:2">Név</span><span style="flex:1">Kategória</span><span style="width:44px;text-align:center">Egys.</span><span style="flex:1">Család</span><span style="width:30px"></span></div>'
    + rows + '</div>';
}

function _mdCatList() {
  const settingsCats = (R.settings && R.settings.ingredientCategories) || [];
  const usedCats = (R.ingredients||[]).map(i=>i.cat).filter(Boolean);
  return [...new Set([...settingsCats, ...usedCats])].sort((a,b)=>a.localeCompare(b,'hu'));
}

function _mdCategoriesHtml() {
  const cats = _mdCatList();
  const ings = R.ingredients||[];
  const cards = cats.map((cat,idx)=>{
    const inCat = ings.filter(i=>i.cat===cat);
    const other = cats.filter(c=>c!==cat);
    const rows = inCat.length ? inCat.map(ing=>`<div style="display:flex;align-items:center;gap:8px;padding:5px 2px;border-bottom:0.5px solid var(--border)"><span style="flex:1;font-size:0.85rem">${esc(ing.name)}</span><select onchange="if(this.value){moveIngredientToCategory(${ing.id},this.value);}" style="font-size:0.75rem;padding:3px 6px;border:1px solid var(--border);border-radius:6px;font-family:'Kodchasan',sans-serif"><option value="">→ áthelyez…</option>${other.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></div>`).join('') : '<div style="font-size:0.8rem;color:var(--text-soft);padding:6px 2px">Nincs alapanyag ebben a kategóriában.</div>';
    return `<div style="border:1px solid var(--border);border-radius:10px;margin-bottom:10px;overflow:hidden;background:#fff"><div style="display:flex;align-items:center;gap:6px;padding:10px 12px;background:var(--cream)"><span style="flex:1;font-weight:700;color:var(--teal-dark)">${esc(cat)} <span style="font-weight:400;color:var(--text-soft);font-size:0.78rem">(${inCat.length})</span></span><button class="btn btn-ghost btn-sm" onclick="renameIngCategoryPrompt(${idx})" title="Átnevezés" style="padding:2px 7px">✏️</button><button class="btn btn-ghost btn-sm" onclick="var e=document.getElementById('mdcat-${idx}');e.style.display=e.style.display==='none'?'block':'none'" title="Alapanyagok" style="padding:2px 7px">📂</button><button class="btn btn-ghost btn-sm" onclick="deleteMasterCategory(${idx})" title="Törlés" style="padding:2px 7px">🗑</button></div><div id="mdcat-${idx}" style="display:none;padding:8px 12px">${rows}</div></div>`;
  }).join('') || '<div style="font-size:0.85rem;color:var(--text-soft)">Nincs kategória.</div>';
  return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><div style="font-size:0.82rem;color:var(--text-soft)">Alapanyagok osztályozása. 📂 → tétel áthelyezése.</div><div style="display:flex;gap:6px"><button class="btn btn-primary btn-sm" onclick="mdAddCategory()">➕ Új</button><button class="btn btn-ghost btn-sm" data-action="openMergeCategoryModal">🔀 Összevonás</button></div></div>${cards}`;
}

function _mdFamiliesHtml() {
  const fams = (R.ingredientFamilies||[]).slice().sort((a,b)=>(a.name||'').localeCompare(b.name||'','hu'));
  const ings = R.ingredients||[];
  const card = f => '<div style="display:flex;align-items:center;gap:6px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;background:#fff">'
    + '<span style="flex:1;font-size:0.9rem">' + esc(f.name) + ' <span style="color:var(--text-soft);font-size:0.78rem">(' + ings.filter(i=>i.familyId===f.id).length + ' alapanyag)</span></span>'
    + '<button class="btn btn-ghost btn-sm" onclick="renameFamilyPrompt('+f.id+')" title="Átnevezés" style="padding:2px 7px">✏️</button>'
    + '<button class="btn btn-ghost btn-sm" onclick="deleteFamily('+f.id+')" title="Törlés" style="padding:2px 7px">🗑</button></div>';
  const cards = fams.length ? fams.map(card).join('') : '<div style="font-size:0.85rem;color:var(--text-soft)">Nincs család.</div>';
  return '<p style="font-size:0.82rem;color:var(--text-soft);margin:0 0 12px">Helyettesíthetőségi csoportok (pl. liszt-félék) — a bevásárlólista ezek alapján ajánl alternatívát. Új család az alapanyag-szerkesztőben hozható létre.</p>' + cards;
}

function _mdUnitsHtml() {
  const ings = R.ingredients||[];
  const alt = ings.filter(i=>i.altUnit&&i.altFactor);
  const dim = a=>a.map(i=>esc(i.name)).join(', ')||'—';
  const mass=dim(ings.filter(i=>['g','kg'].includes(i.unit))), vol=dim(ings.filter(i=>['ml','l'].includes(i.unit))), cnt=dim(ings.filter(i=>i.unit==='db'));
  const altRows = alt.length ? alt.map(i=>`<div style="padding:5px 2px;border-bottom:0.5px solid var(--border);font-size:0.85rem">${esc(i.name)}: <b>1 ${esc(i.altUnit)}</b> = ${i.altFactor} ${esc(i.unit)}</div>`).join('') : '<div style="font-size:0.82rem;color:var(--text-soft)">Nincs másodlagos egység beállítva.</div>';
  return `<p style="font-size:0.82rem;color:var(--text-soft);margin:0 0 14px">3 dimenzió. Egy alapanyag mértékegysége a <b>Készlet → ✏️ Adatlap</b>-on állítható.</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:18px"><div style="border:1px solid var(--border);border-radius:10px;padding:12px;background:#fff"><div style="font-weight:700;color:var(--teal-dark)">⚖️ Tömeg (g / kg)</div><div style="font-size:0.78rem;color:var(--text-soft);margin-top:4px">${mass}</div></div><div style="border:1px solid var(--border);border-radius:10px;padding:12px;background:#fff"><div style="font-weight:700;color:var(--teal-dark)">💧 Térfogat (ml / l)</div><div style="font-size:0.78rem;color:var(--text-soft);margin-top:4px">${vol}</div></div><div style="border:1px solid var(--border);border-radius:10px;padding:12px;background:#fff"><div style="font-weight:700;color:var(--teal-dark)">🔢 Darab (db)</div><div style="font-size:0.78rem;color:var(--text-soft);margin-top:4px">${cnt}</div></div></div><h4 style="color:var(--teal-dark);margin:0 0 8px">Másodlagos egységek (csomagolás)</h4><p style="font-size:0.78rem;color:var(--text-soft);margin:0 0 8px">Pl. „1 zsák = 25 kg" — az alapanyag-szerkesztőben állítható.</p>${altRows}`;
}

async function mdAddCategory(){const name=(typeof prompt==='function')?prompt('Új kategória neve:'):null;if(!name||!name.trim())return;const nn=name.trim();if(!R.settings.ingredientCategories)R.settings.ingredientCategories=[];if(R.settings.ingredientCategories.includes(nn)){toast('Már létezik ilyen kategória',true);return;}R.settings.ingredientCategories.push(nn);try{await sb.setSetting('ingredient_categories',R.settings.ingredientCategories);toast('✅ Kategória hozzáadva.');renderMasterData();}catch(e){toast('⚠️ '+(typeof friendlyError==='function'?friendlyError(e):e.message),true);}}

async function moveIngredientToCategory(ingId,newCat){const ing=(R.ingredients||[]).find(i=>i.id===ingId);if(!ing||!newCat||ing.cat===newCat)return;const old=ing.cat;try{await kData.updateFields('ingredients',{category:newCat},'id=eq.'+ingId);ing.cat=newCat;if(typeof auditLog==='function')auditLog('ingredient_recat',ing.name,old+' → '+newCat);toast(`✅ „${ing.name}" áthelyezve: ${newCat}`);renderMasterData();if(typeof renderStock==='function')renderStock();}catch(e){console.error('moveIngredientToCategory:',e);toast('⚠️ '+(typeof friendlyError==='function'?friendlyError(e):e.message),true);}}

async function renameIngCategoryPrompt(idx){const cats=_mdCatList();const oldName=cats[idx];if(!oldName)return;const newName=(typeof prompt==='function')?prompt('Kategória új neve:',oldName):null;if(!newName||!newName.trim()||newName.trim()===oldName)return;const nn=newName.trim();try{const affected=(R.ingredients||[]).filter(i=>i.cat===oldName);for(const ing of affected){await kData.updateFields('ingredients',{category:nn},'id=eq.'+ing.id);ing.cat=nn;}R.settings.ingredientCategories=[...new Set([...((R.settings.ingredientCategories||[]).map(c=>c===oldName?nn:c)), nn])];await sb.setSetting('ingredient_categories',R.settings.ingredientCategories);if(typeof auditLog==='function')auditLog('category_rename',oldName+' → '+nn,affected.length+' alapanyag');toast(`✅ Átnevezve: „${oldName}" → „${nn}" (${affected.length} alapanyag)`);renderMasterData();if(typeof renderStock==='function')renderStock();}catch(e){console.error('renameIngCategory:',e);toast('⚠️ '+(typeof friendlyError==='function'?friendlyError(e):e.message),true);}}

async function deleteMasterCategory(idx){const cats=_mdCatList();const cat=cats[idx];if(!cat)return;const inCat=(R.ingredients||[]).filter(i=>i.cat===cat);if(inCat.length>0){toast(`⚠️ „${cat}" nem törölhető — ${inCat.length} alapanyag van benne. Előbb sorold át (📂), vagy Összevonás.`,true);return;}if(typeof confirmDialog==='function'&&!(await confirmDialog(`Törlöd a „${cat}" (üres) kategóriát?`)))return;try{R.settings.ingredientCategories=(R.settings.ingredientCategories||[]).filter(c=>c!==cat);await sb.setSetting('ingredient_categories',R.settings.ingredientCategories);toast(`✅ „${cat}" törölve.`);renderMasterData();}catch(e){toast('⚠️ '+(typeof friendlyError==='function'?friendlyError(e):e.message),true);}}

async function renameFamilyPrompt(famId){const fam=(R.ingredientFamilies||[]).find(f=>f.id===famId);if(!fam)return;const newName=(typeof prompt==='function')?prompt('Család új neve:',fam.name):null;if(!newName||!newName.trim()||newName.trim()===fam.name)return;try{await kData.updateFields('ingredient_families',{name:newName.trim()},'id=eq.'+famId);fam.name=newName.trim();toast('✅ Család átnevezve.');renderMasterData();}catch(e){toast('⚠️ '+(typeof friendlyError==='function'?friendlyError(e):e.message),true);}}

async function deleteFamily(famId){const fam=(R.ingredientFamilies||[]).find(f=>f.id===famId);if(!fam)return;const count=(R.ingredients||[]).filter(i=>i.familyId===famId).length;if(typeof confirmDialog==='function'&&!(await confirmDialog(`Törlöd a „${fam.name}" családot?${count>0?`\n\n${count} alapanyag elveszti a család-hozzárendelését.`:''}`)))return;try{for(const ing of (R.ingredients||[]).filter(i=>i.familyId===famId)){await kData.updateFields('ingredients',{family_id:null},'id=eq.'+ing.id);ing.familyId=null;}await kData.delete('ingredient_families','id=eq.'+famId);R.ingredientFamilies=(R.ingredientFamilies||[]).filter(f=>f.id!==famId);toast('✅ Család törölve.');renderMasterData();}catch(e){console.error('deleteFamily:',e);toast('⚠️ '+(typeof friendlyError==='function'?friendlyError(e):e.message),true);}}

if(typeof window!=='undefined'){window.renderMasterData=renderMasterData;window.mdAddCategory=mdAddCategory;window.moveIngredientToCategory=moveIngredientToCategory;window.renameIngCategoryPrompt=renameIngCategoryPrompt;window.deleteMasterCategory=deleteMasterCategory;window.renameFamilyPrompt=renameFamilyPrompt;window.deleteFamily=deleteFamily;}
