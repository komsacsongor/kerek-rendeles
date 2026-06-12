// ===== SETTINGS =====
function renderSettings(){
  document.getElementById('s-lang').value=D.settings?.lang||'hu';
  initBakingCalendar();
  document.getElementById('s-currency').value=D.settings?.currency||'lej';
  document.getElementById('s-conditions').value=D.helpConditions||'';
  document.getElementById('s-delivery').value=D.helpDelivery||'';
  renderCategoriesList();
  const rs = document.getElementById('s-respect-shortage'); if (rs) rs.checked = D.settings?.auto_confirm_respect_shortage === true;
  if (typeof updateAdminPushBtn === 'function') updateAdminPushBtn();
}

// ===== ADMIN PUSH ÉRTESÍTÉSEK (ezen az eszközön) =====
// Az admin a fenntartott 'ADMIN' client_id alatt iratkozik fel a meglévő push_subscriptions táblába.
// Ugyanaz a publikus VAPID kulcs mint a vevőnél.
const ADMIN_PUSH_VAPID = 'BKnbS6hp1HTdh5BcNOvVTtBdmYWNj48F0jSG6NgQ1vVkboNvsATvbn2uoSP0pFpDTIQlMQ6wa4nI9j8v1jo-7SM';
const ADMIN_PUSH_ID = 'ADMIN';

function _adminUrlB64ToU8(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function initAdminPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    toast('⚠️ Ez a böngésző nem támogatja az értesítéseket.', true); return;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { toast('🔕 Az értesítések nem lettek engedélyezve.', true); await updateAdminPushBtn(); return; }
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: _adminUrlB64ToU8(ADMIN_PUSH_VAPID)
      });
    }
    const j = sub.toJSON();
    await sb.upsert('push_subscriptions', {
      client_id: ADMIN_PUSH_ID,
      endpoint: j.endpoint,
      p256dh: j.keys.p256dh,
      auth: j.keys.auth
    }, 'client_id,endpoint');
    toast('🔔 Értesítések bekapcsolva ezen az eszközön!');
  } catch(e) { console.warn('Admin push init:', e.message); toast('⚠️ Hiba: ' + e.message, true); }
  await updateAdminPushBtn();
}

async function toggleAdminPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    toast('⚠️ Ez a böngésző nem támogatja az értesítéseket.', true); return;
  }
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    try {
      const j = existing.toJSON();
      await existing.unsubscribe();
      await sb.delete('push_subscriptions', `client_id=eq.${ADMIN_PUSH_ID}&endpoint=eq.${encodeURIComponent(j.endpoint)}`);
    } catch(e) { console.warn('Admin push off:', e.message); }
    toast('🔕 Értesítések kikapcsolva ezen az eszközön.');
    await updateAdminPushBtn();
  } else {
    await initAdminPush();
  }
}

async function updateAdminPushBtn() {
  const btn = document.getElementById('admin-push-btn');
  const status = document.getElementById('admin-push-status');
  if (!btn) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    btn.style.display = 'none';
    if (status) status.textContent = 'Ez a böngésző nem támogatja az értesítéseket.';
    return;
  }
  if (Notification.permission === 'denied') {
    btn.disabled = true; btn.textContent = '🔕 Értesítések tiltva';
    if (status) status.textContent = 'A böngésző beállításaiban engedélyezned kell az értesítéseket ehhez az oldalhoz.';
    return;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    btn.disabled = false;
    if (sub) {
      btn.textContent = '🔕 Értesítések kikapcsolása';
      if (status) status.textContent = '✅ Bekapcsolva ezen az eszközön.';
    } else {
      btn.textContent = '🔔 Értesítések bekapcsolása';
      if (status) status.textContent = 'Jelenleg kikapcsolva ezen az eszközön.';
    }
  } catch(e) { console.warn('updateAdminPushBtn:', e.message); }
}
function renderCategoriesList(){
  document.getElementById('categories-list').innerHTML = D.categories.map((cat,i) => {
    const linked = D.products.filter(p => p.category === cat);
    const count = linked.length;
    return `<div style="margin-bottom:8px;border:1.5px solid var(--border);border-radius:10px;overflow:hidden;background:white">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;cursor:pointer" onclick="toggleCatDetail('cat-admin-${i}')">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-weight:600;font-size:0.88rem">${esc(cat)}</span>
          <span class="badge" style="background:${count>0?'var(--teal-light)':'var(--bg-soft)'};color:${count>0?'var(--teal-dark)':'var(--text-soft)'};font-size:0.7rem">${count} termék</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <span style="color:var(--text-soft);font-size:0.75rem">▼</span>
          <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();deleteCategory(${i})" ${count>0?'disabled title="Előbb rendeld át a termékeket"':''} style="${count>0?'opacity:0.4;cursor:not-allowed':''}">✕</button>
        </div>
      </div>
      <div id="cat-admin-${i}" style="display:none;border-top:1px solid var(--border);padding:10px 12px;background:var(--bg-soft)">
        ${count===0 ? '<p class="text-soft text-sm">Nincs termék ebben a kategóriában.</p>' :
          linked.map(p=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
            <span style="font-size:0.82rem">${esc(p.name)} <span style="color:var(--text-soft);font-size:0.72rem">${p.code||''}</span></span>
            <select onchange="reassignProduct('${p.id}',this.value,${i})" style="font-size:0.78rem;padding:3px 8px;border:1px solid var(--border);border-radius:6px">
              ${D.categories.map(c=>`<option value="${esc(c)}" ${c===cat?'selected':''}>${esc(c)}</option>`).join('')}
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

async function reassignProduct(productId, newCat, refreshIdx){
  const p = D.products.find(p=>p.id==productId);
  if(!p) return;
  const oldCat = p.category;
  p.category = newCat;
  try {
    await sb.update('products', {category: newCat}, `id=eq.${productId}`);
    toast(`✅ "${p.name}" átrendelve: ${oldCat} → ${newCat}`);
  } catch(e) { p.category = oldCat; toast('Átrendelés sikertelen: '+e.message, true); return; }
  save();
  renderCategoriesList();
  // Reopen the detail panel
  setTimeout(()=>{
    const el = document.getElementById(`cat-admin-${refreshIdx}`);
    if(el) el.style.display='block';
  }, 50);
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
async function deleteCategory(i){
  const cat = D.categories[i];
  // Ellenőrzés: van-e termék ebben a kategóriában?
  const linkedProducts = D.products.filter(p => p.category === cat);
  if(linkedProducts.length > 0) {
    const names = linkedProducts.slice(0,3).map(p=>p.name).join(', ');
    const more = linkedProducts.length > 3 ? ` és még ${linkedProducts.length-3} db` : '';
    toast(`⚠️ Nem törölhető! ${linkedProducts.length} termék tartozik ide: ${names}${more}. Előbb rendeld át őket más kategóriába.`, true);
    return;
  }
  if (!(await confirmDialog(`Törlöd a(z) "${cat}" kategóriát? Nincs hozzá termék, biztonságos.`))) return;
  D.categories.splice(i,1);
  sb.setSetting('categories', D.categories).catch(e=>console.warn(e));
  save(); renderCategoriesList(); toast('Kategória törölve.');
}
async function saveSetting(key,val){
  if(!D.settings) D.settings={};
  D.settings[key]=val;
  try { await sb.setSetting(key, val); } catch(e){ toast('⚠️ Mentés sikertelen: '+e.message, true); }
  save(); toast('Beállítás mentve!');
  if(['lang','currency'].includes(key)) auditLog('setting_change', key, String(val));
}
function saveHelpTexts(){
  D.helpConditions=document.getElementById('s-conditions').value;
  D.helpDelivery=document.getElementById('s-delivery').value;
  sb.setSetting('help_conditions', D.helpConditions).catch(e=>console.warn(e));
  sb.setSetting('help_delivery', D.helpDelivery).catch(e=>console.warn(e));
  save(); toast('Szövegek mentve! A vevői súgóban megjelennek.');
}
// v2.48.0: modul jelszó beállítás az admin-set-password Edge Function-ön át (service_role írás admin_secrets-be)
async function kerekSetPassword(module, currentPw, newPw) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-set-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPABASE_KEY },
    body: JSON.stringify({ current_password: currentPw, module, new_password: newPw })
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.success, status: res.status, data };
}

async function changePassword(){
  const old=document.getElementById('s-old-pw').value;
  const n1=document.getElementById('s-new-pw').value;
  const n2=document.getElementById('s-new-pw2').value;
  if(!old){ toast('Add meg a jelenlegi jelszót!', true); return; }
  if(!n1||n1!==n2){ toast('Az új jelszavak nem egyeznek!', true); return; }
  if(n1.length<3){ toast('Az új jelszó túl rövid (min. 3 karakter).', true); return; }
  const r = await kerekSetPassword('admin', old, n1);
  if(r.status===429){ toast('⚠️ Túl sok próbálkozás, várj egy percet.', true); return; }
  if(!r.ok){ toast(r.data?.error==='invalid_admin_password' ? '❌ Hibás jelenlegi jelszó!' : '⚠️ Hiba a jelszó mentésekor.', true); return; }
  ['s-old-pw','s-new-pw','s-new-pw2'].forEach(i=>document.getElementById(i).value='');
  toast('✅ Admin jelszó módosítva!');
  auditLog('password_change', 'Admin', 'Jelszó módosítva');
}

async function setModulePassword(module){
  const adminPw = document.getElementById('mp-admin-pw')?.value;
  const newPw = document.getElementById('mp-'+module+'-pw')?.value;
  if(!adminPw){ toast('Add meg a jelenlegi admin jelszót!', true); return; }
  if(!newPw || newPw.length<3){ toast('Az új jelszó túl rövid (min. 3 karakter).', true); return; }
  const r = await kerekSetPassword(module, adminPw, newPw);
  if(r.status===429){ toast('⚠️ Túl sok próbálkozás, várj egy percet.', true); return; }
  if(!r.ok){ toast(r.data?.error==='invalid_admin_password' ? '❌ Hibás admin jelszó!' : '⚠️ Hiba a mentéskor.', true); return; }
  document.getElementById('mp-'+module+'-pw').value='';
  toast(`✅ ${module==='receptura'?'Receptúra':'Gyártás'} jelszó beállítva!`);
  auditLog('password_set', module, 'Modul jelszó beállítva');
}
function toggleSettings(el){ el.nextElementSibling.classList.toggle('open'); }
function loadSettings(){
  if(D.settings?.lang) document.getElementById('s-lang').value=D.settings.lang;
  // v2.41.1: vevő fejléc szöveg betöltése (ha üres, az alapérték marad mint placeholder)
  const headerEl = document.getElementById('s-vevo-header');
  if (headerEl && D.settings?.vevoHeaderText !== undefined) {
    headerEl.value = D.settings.vevoHeaderText || '';
  }
}

// v2.41.1: szerkeszthető vevő fejléc szöveg mentése
async function saveVevoHeaderText() {
  const val = document.getElementById('s-vevo-header')?.value || '';
  if(!D.settings) D.settings = {};
  D.settings.vevoHeaderText = val;
  try {
    await sb.setSetting('vevo_header_text', val);
    save();
    toast('✅ Fejléc szöveg mentve! A vevőknél azonnal frissül.');
    if (typeof auditLog === 'function') auditLog('setting_change', 'vevo_header_text', val ? val.substring(0, 60) + '...' : '(alapértelmezett)');
  } catch(e) {
    toast('⚠️ Mentés sikertelen: ' + e.message, true);
  }
}

if (typeof window !== 'undefined') window.saveVevoHeaderText = saveVevoHeaderText;

