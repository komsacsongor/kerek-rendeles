// ===== NAVIGATION =====
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('view-' + id).classList.add('active');
  event.target.classList.add('active');
  if (id === 'summary') renderSummary();
}

// ===== HELPERS =====
// NOTE: getKey signature swap is intentional (matches admin mk(year,month))
function getKey(month, year) { return `${year}-${month}`; }
// M1+M2: getOrderKey + getDays removed (deduped to kerek-constants.js)
function getActiveProds(year, month) {
  const ids = appData.monthlyActiveProducts[getKey(month, year)] || [];
  return appData.products.filter(p => ids.includes(p.id) && !p.deleted_at);
}
function isBakingDay(d) {
  const y=d.getFullYear(), m=d.getMonth();
  const key=`${y}-${m}`;
  const defaults=appData.bakingDaysDefault||[2,5];
  const cal=appData.bakingCalendar?.[key]||{extra:[],removed:[]};
  const dateStr=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const isDefault=defaults.includes(d.getDay());
  const isExtra=cal.extra&&cal.extra.includes(dateStr);
  const isRemoved=cal.removed&&cal.removed.includes(dateStr);
  return (isDefault||isExtra)&&!isRemoved;
}
function hoursUntil(date) { return (date - new Date()) / 36e5; }

// ===== MONTH SELECTORS =====
function buildMonthSelectors() {
  ['month-selector','summary-month-sel'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const isSummary = id.includes('summary');
    const useMobile = window.innerWidth <= 640;
    const labels = useMobile ? MONTHS_SHORT : MONTHS;
    el.innerHTML = labels.map((m,i) =>
      `<button class="month-btn ${i===(isSummary?summaryMonth:selectedMonth)?'active':''}" onclick="${isSummary?'selectSummaryMonth':'selectMonth'}(${i})">${m}</button>`
    ).join('');
  });
}
function selectMonth(m) {
  selectedMonth = m;
  // Clear manual open state (different month = different days)
  if (typeof openDaysManual !== 'undefined') openDaysManual.clear();
  if (typeof selectedCategoryByDay !== 'undefined') selectedCategoryByDay = {};
  buildMonthSelectors();
  renderOrderTable();
  updateHeroTotal();
  if (typeof KEREKAnalytics !== 'undefined') KEREKAnalytics.monthSwitch(selectedYear, m);
}
function selectSummaryMonth(m) {
  summaryMonth = m;
  buildMonthSelectors();
  renderSummary();
}

// ===== DEADLINE CHECK =====
function checkDeadline(day) {
  const bakingDate = new Date(selectedYear, selectedMonth, day - 1, 18, 0); // assume 8am baking
  const hours = hoursUntil(bakingDate);
  const noticeEl = document.getElementById('deadline-notice');
  const textEl = document.getElementById('deadline-text');

  // Find next valid baking day after this one
  const allBakingDays = getDays(selectedYear, selectedMonth).filter(d => isBakingDay(d));
  const nextBaking = allBakingDays.find(d => d.getDate() > day);

  if (hours >= 0 && hours < 24) {
    noticeEl.classList.add('show');
    const nextStr = nextBaking
      ? `A következő sütési nap: ${MONTHS[selectedMonth]} ${nextBaking.getDate()}. (${DAYS_HU[nextBaking.getDay()]})`
      : 'Nincs több sütési nap ebben a hónapban.';
    textEl.textContent = `⚠️ A ${MONTHS[selectedMonth]} ${day}. (${DAYS_HU[new Date(selectedYear,selectedMonth,day).getDay()]}) sütési nap már kevesebb mint 24 óra múlva kezdődik. A módosításaid csak a következő sütésnél érvényesek. ${nextStr}`;
  } else {
    noticeEl.classList.remove('show');
  }
}

// ===== PRODUCT MODAL =====
function showProductModal(pid) {
  const p = appData.products.find(p=>p.id===pid);
  if (!p) return;
  // Push state so Android back button closes modal
  history.pushState({ modal: 'product' }, '');
  document.getElementById('pm-name').textContent = p.name;
  document.getElementById('pm-price').textContent = p.price + ' lej / db';
  document.getElementById('pm-weight').textContent = p.weight + ' · ' + p.category;
  // Marketing leírás
  const pmMkt = document.getElementById('pm-marketing');
  if(pmMkt && p.marketing_desc) { pmMkt.textContent = p.marketing_desc; pmMkt.style.display='block'; }
  else if(pmMkt) pmMkt.style.display='none';
  // Összetevők
  const pmIngWrap = document.getElementById('pm-ingredients-wrap');
  const pmIngLabel = document.getElementById('pm-ingredient-label');
  const pmAllergens = document.getElementById('pm-allergens');
  if(pmIngWrap && p.ingredient_label) {
    pmIngLabel.textContent = p.ingredient_label;
    pmAllergens.textContent = p.allergens ? 'Allergének: ' + p.allergens : '';
    pmIngWrap.style.display='block';
  } else if(pmIngWrap) pmIngWrap.style.display='none';
  // Tápérték
  const pmNutWrap = document.getElementById('pm-nutrition-wrap');
  const pmNutTable = document.getElementById('pm-nutrition-table');
  if(pmNutWrap && p.nutrition) {
    try {
      const n = typeof p.nutrition === 'string' ? JSON.parse(p.nutrition) : p.nutrition;
      const rows = [
        ['Energia', (n.kj||0)+' kJ / '+(n.kcal||0)+' kcal'],
        ['Zsír', (n.fat||0)+' g'], ['ebből telített zsírsavak', (n.satFat||0)+' g'],
        ['Szénhidrát', (n.carb||0)+' g'], ['ebből cukrok', (n.sugar||0)+' g'],
        ['Rost', (n.fiber||0)+' g'], ['Fehérje', (n.protein||0)+' g'],
        ['Só', (n.salt||0)+' g'],
      ];
      pmNutTable.innerHTML = '<tr style="border-bottom:2px solid var(--teal-dark)"><td style="padding:3px 0;font-weight:700">Tápérték</td><td style="text-align:right;font-weight:700">100 g</td></tr>' +
        rows.map((r,i) => '<tr style="border-bottom:1px solid var(--border);'+(r[0].startsWith('ebből')?'color:var(--text-soft)':'')+'">' +
          '<td style="padding:4px 0;'+(r[0].startsWith('ebből')?'padding-left:12px':'')+'">' + r[0] + '</td>' +
          '<td style="text-align:right;padding:4px 0">' + r[1] + '</td></tr>').join('');
      pmNutWrap.style.display='block';
    } catch(e) { pmNutWrap.style.display='none'; }
  } else if(pmNutWrap) pmNutWrap.style.display='none';
  // Belső leírás
  document.getElementById('pm-desc').textContent = p.desc || '';

  const imgWrap = document.getElementById('pm-img-wrap');
  if (p.image) {
    imgWrap.innerHTML = `<img class="prod-thumb" src="${p.image}" alt="${esc(p.name)}" onclick="openLightbox('${p.image}')">`;
  } else {
    imgWrap.innerHTML = `<div class="prod-thumb-placeholder">🍞</div>`;
  }

  document.getElementById('product-modal').classList.add('open');
}
function closeModal() {
  document.getElementById('product-modal').classList.remove('open');
}
// Android back button closes modal
window.addEventListener('popstate', e => {
  if (document.getElementById('product-modal').classList.contains('open')) {
    closeModal();
  }
});
document.getElementById('product-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('product-modal')) closeModal();
});

function openLightbox(src) {
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox').classList.add('open');
}

// ===== HELP =====
function renderHelpConditions() {
  if (appData.helpConditions) document.getElementById('help-conditions').innerHTML = appData.helpConditions.replace(/\n/g,'<br>');
  if (appData.helpDelivery) document.getElementById('help-delivery').innerHTML = appData.helpDelivery.replace(/\n/g,'<br>');
}

// ===== AUTO-LOGIN FROM PREVIEW =====
function checkAutoLogin() {
  const params = new URLSearchParams(window.location.search);
  const previewId = params.get('preview');
  if (previewId) {
    const client = appData.clients.find(c => c.id === previewId);
    if (client) {
      currentUser = client;
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('user-badge').textContent = '👤 ' + client.name;
      document.getElementById('hero-greeting').textContent = 'Szia, ' + client.name.split(' ').slice(-1)[0] + '! 👋';
      // Show preview banner
      const banner = document.createElement('div');
      banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:var(--gold);color:var(--teal-dark);text-align:center;padding:6px;font-size:0.78rem;font-weight:700;z-index:999;font-family:Kodchasan,sans-serif';
      banner.textContent = '👁 ADMIN ELŐNÉZET – ' + client.name + ' nézetében';
      document.body.prepend(banner);
      buildMonthSelectors();
      renderOrderTable();
      updateHeroTotal();
      renderHelpConditions();
    }
  }
}

// ===== TOAST =====
function toast(msg, isError=false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  el.style.opacity = '1';
  el.style.background = isError ? '#b91c1c' : '';
  if(isError) console.error('KEREK:', msg);
  clearTimeout(el._t);
  const duration = isError ? 8000 : 3200;
  el._t = setTimeout(() => { el.style.opacity='0'; setTimeout(()=>el.style.display='none',300); el.style.background=''; }, duration);
}

// Auto-login check runs after everything is loaded
window.addEventListener('load', checkAutoLogin);
async function loadMessage() {
  const key = `${currentUser.id}-${selectedYear}-${selectedMonth}`;
  try {
    const msgs = await sb.query('messages', {
      filter: `client_id=eq.${currentUser.id}&year=eq.${selectedYear}&month=eq.${selectedMonth}`,
      order: 'created_at'
    });
    if(!appData.messages) appData.messages = {};
    appData.messages[key] = msgs.map(m => ({text: m.text, ts: m.created_at}));
  } catch(e) { console.warn('Message load error:', e); }
  
  const msgs = appData.messages?.[key] || [];
  const el = document.getElementById('order-messages-display');
  if(!el) return;
  const adminMsgs = msgs.filter(m => (m.text||'').startsWith('📨 Admin:'));
  const clientMsgs = msgs.filter(m => !(m.text||'').startsWith('📨 Admin:'));
  if(adminMsgs.length===0 && clientMsgs.length===0){ el.innerHTML=''; return; }

  const monthLabel = MONTHS[selectedMonth] + ' ' + selectedYear;
  let html = '<div style="border-top:1px solid var(--border);padding-top:16px;margin-top:4px">';
  html += '<div style="font-size:0.8rem;font-weight:700;color:var(--teal-dark);margin-bottom:12px;display:flex;align-items:center;gap:6px">💬 Üzenetek – ' + monthLabel + '</div>';

  // All messages in chronological order, styled by sender
  const allMsgs = msgs.map((m,origIdx) => ({...m, origIdx})).sort((a,b) => new Date(a.ts||0)-new Date(b.ts||0));
  const clientMsgsIdx = clientMsgs.map((m,i) => ({m, i}));

  allMsgs.forEach(m => {
    const isAdmin = (m.text||'').startsWith('📨 Admin:');
    const dt = new Date(m.ts||Date.now()).toLocaleString('hu-HU', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
    if(isAdmin) {
      const txt = m.text.replace('📨 Admin:','').trim();
      html += '<div style="display:flex;gap:10px;margin-bottom:10px;align-items:flex-start">';
      html += '<div style="width:28px;height:28px;border-radius:50%;background:var(--teal-dark);display:flex;align-items:center;justify-content:center;font-size:0.8rem;flex-shrink:0">🏪</div>';
      html += '<div style="flex:1"><div style="background:#f0fdf9;border:1px solid #a7f3d0;border-radius:0 10px 10px 10px;padding:8px 12px;font-size:0.84rem">' + esc(txt) + '</div>';
      html += '<div style="font-size:0.68rem;color:var(--text-soft);margin-top:3px;padding-left:4px">KEREK Pékség · ' + dt + '</div></div></div>';
    } else {
      const clientIdx = clientMsgsIdx.findIndex(x => x.m.text===m.text && x.m.ts===m.ts);
      const ci = clientIdx >= 0 ? clientMsgsIdx[clientIdx].i : -1;
      html += '<div style="display:flex;gap:10px;margin-bottom:10px;align-items:flex-start;flex-direction:row-reverse">';
      html += '<div style="width:28px;height:28px;border-radius:50%;background:var(--gold);display:flex;align-items:center;justify-content:center;font-size:0.8rem;flex-shrink:0">👤</div>';
      html += '<div style="flex:1;text-align:right"><div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px 0 10px 10px;padding:8px 12px;font-size:0.84rem;display:inline-block;text-align:left">' + esc(m.text||'') + '</div>';
      html += '<div style="font-size:0.68rem;color:var(--text-soft);margin-top:3px;padding-right:4px">Te · ' + dt;
      if(ci >= 0) html += ' <button onclick="deleteMyMessage(' + ci + ')" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:0.75rem;padding:0 2px;vertical-align:middle" title="Törlés">✕</button>';
      html += '</div></div></div>';
    }
  });

  html += '</div>';
  el.innerHTML = html;
}

async function deleteMyMessage(idx) {
  if (!(await confirmDialog('Törlöd ezt az üzenetet?'))) return;
  const key = `${currentUser.id}-${selectedYear}-${selectedMonth}`;
  const msgs = appData.messages?.[key] || [];
  const clientMsgs = msgs.filter(m => !(m.text||'').startsWith('📨 Admin:'));
  const target = clientMsgs[idx];
  if(!target) return;
  try {
    // Delete from Supabase by matching text+timestamp
    const all = await sb.query('messages', {filter: `client_id=eq.${currentUser.id}&year=eq.${selectedYear}&month=eq.${selectedMonth}`});
    const found = all.find(m => m.text===target.text && m.created_at===target.ts);
    if(found?.id) await sb.delete('messages', `id=eq.${found.id}`);
    // Update local cache
    appData.messages[key] = msgs.filter(m => !(m.text===target.text && m.ts===target.ts));
    loadMessage();
    toast('Üzenet törölve.');
  } catch(e) { toast('Törlés sikertelen: '+e.message, true); }
}
