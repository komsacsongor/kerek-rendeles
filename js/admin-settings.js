// ===== SETTINGS =====
function renderSettings(){
  document.getElementById('s-lang').value=D.settings?.lang||'hu';
  initBakingCalendar();
  document.getElementById('s-currency').value=D.settings?.currency||'lej';
  document.getElementById('s-conditions').value=D.helpConditions||'';
  document.getElementById('s-delivery').value=D.helpDelivery||'';
  renderCategoriesList();
}
function renderCategoriesList(){
  document.getElementById('categories-list').innerHTML=D.categories.map((cat,i)=>`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border:1px solid var(--border);border-radius:9px;background:white;margin-bottom:6px">
      <span style="font-weight:600;font-size:0.88rem">${esc(cat)}</span>
      <button class="btn btn-danger btn-sm" onclick="deleteCategory(${i})">✕</button>
    </div>`).join('');
}
async function addCategory(){
  const val=document.getElementById('new-cat-input').value.trim();
  if(!val){toast('Add meg a kategória nevét!');return;}
  if(D.categories.includes(val)){toast('Ez a kategória már létezik!');return;}
  D.categories.push(val);
  try { await sb.setSetting('categories', D.categories); } catch(e){ toast('⚠️ Kategória mentés sikertelen: '+e.message, true); }
  save(); renderCategoriesList();
  document.getElementById('new-cat-input').value='';
  toast('Kategória hozzáadva!');
}
function deleteCategory(i){
  const cat = D.categories[i];
  // Ellenőrzés: van-e termék ebben a kategóriában?
  const linkedProducts = D.products.filter(p => p.category === cat);
  if(linkedProducts.length > 0) {
    const names = linkedProducts.slice(0,3).map(p=>p.name).join(', ');
    const more = linkedProducts.length > 3 ? ` és még ${linkedProducts.length-3} db` : '';
    toast(`⚠️ Nem törölhető! ${linkedProducts.length} termék tartozik ide: ${names}${more}. Előbb rendeld át őket más kategóriába.`, true);
    return;
  }
  if(!confirm(`Törlöd a(z) "${cat}" kategóriát? Nincs hozzá termék, biztonságos.`)) return;
  D.categories.splice(i,1);
  sb.setSetting('categories', D.categories).catch(e=>console.warn(e));
  save(); renderCategoriesList(); toast('Kategória törölve.');
}
async function saveSetting(key,val){
  if(!D.settings) D.settings={};
  D.settings[key]=val;
  try { await sb.setSetting(key, val); } catch(e){ toast('⚠️ Mentés sikertelen: '+e.message, true); }
  save(); toast('Beállítás mentve!');
}
function saveHelpTexts(){
  D.helpConditions=document.getElementById('s-conditions').value;
  D.helpDelivery=document.getElementById('s-delivery').value;
  sb.setSetting('help_conditions', D.helpConditions).catch(e=>console.warn(e));
  sb.setSetting('help_delivery', D.helpDelivery).catch(e=>console.warn(e));
  save(); toast('Szövegek mentve! A vevői súgóban megjelennek.');
}
function changePassword(){
  const old=document.getElementById('s-old-pw').value;
  const n1=document.getElementById('s-new-pw').value;
  const n2=document.getElementById('s-new-pw2').value;
  if(old!==(D.settings?.adminPw||'admin')){toast('Hibás jelenlegi jelszó!');return;}
  if(!n1||n1!==n2){toast('Az új jelszavak nem egyeznek!');return;}
  if(!D.settings) D.settings={};
  D.settings.adminPw=n1;
  hashPassword(n1).then(hash => sb.setSetting('admin_password', hash).catch(e=>console.warn(e)));
  save();
  ['s-old-pw','s-new-pw','s-new-pw2'].forEach(i=>document.getElementById(i).value='');
  toast('Jelszó sikeresen módosítva!');
}
function toggleSettings(el){ el.nextElementSibling.classList.toggle('open'); }
function loadSettings(){ if(D.settings?.lang) document.getElementById('s-lang').value=D.settings.lang; }

