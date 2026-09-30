// =============================================================
// KEREK Megrendelő – belépés, regisztráció, PIN-beállítás, helyreállítás (v2.55.0 — C1 biztonság)
// A belépés a SZERVEREN történik (vevo-auth EF). A böngésző csak a saját adatait kapja meg.
// =============================================================

// ---------- PIN-mező (6 doboz egy rejtett input fölött) ----------
function pinBoxHtml(id, autoc = 'off') {
  return `<div class="pinbox" id="${id}"><input type="tel" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="${autoc}" aria-label="PIN-kód" oninput="pinBoxSync('${id}')" onfocus="pinBoxSync('${id}')" onblur="pinBoxSync('${id}',true)">${'<i></i>'.repeat(6)}</div>`;
}
function pinBoxSync(id, blur) {
  const box = document.getElementById(id); if (!box) return;
  const inp = box.querySelector('input');
  inp.value = inp.value.replace(/\D/g, '').slice(0, 6);
  const n = inp.value.length;
  box.querySelectorAll('i').forEach((el, i) => {
    el.textContent = i < n ? '•' : '';
    el.classList.toggle('fill', i < n);
    el.classList.toggle('cur', !blur && i === Math.min(n, 5) && document.activeElement === inp);
  });
}
function pinVal(id) { const b = document.getElementById(id); return b ? b.querySelector('input').value : ''; }
function pinClear(id) { const b = document.getElementById(id); if (b) { b.querySelector('input').value = ''; pinBoxSync(id, true); } }
function pinLocalProblem(pin) {
  if (!/^\d{4,6}$/.test(pin)) return 'A PIN 4–6 számjegy legyen.';
  if (/^(\d)\1+$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) return 'Ez a PIN túl egyszerű (pl. 1111, 1234). Válassz mást.';
  return null;
}
function secQuestionOptions(selected, exclude) {
  return '<option value="">Válassz kérdést…</option>' + Object.entries(SEC_QUESTIONS)
    .filter(([id]) => String(id) !== String(exclude || ''))
    .map(([id, t]) => `<option value="${id}" ${String(id) === String(selected || '') ? 'selected' : ''}>${esc(t)}</option>`).join('');
}

// ---------- hibaüzenetek ----------
const VEVO_AUTH_MSG = {
  unknown_code: '❌ Ismeretlen kód. Ellenőrizd, vagy lépj be az e-mail címeddel és a PIN-eddel.',
  bad_credentials: '❌ Hibás e-mail cím vagy PIN-kód.',
  pin_required: 'Add meg a PIN-kódodat.',
  code_required: 'Ehhez a fiókhoz még nincs PIN beállítva. Lépj be a belépési kódoddal (KER-…).',
  name_login_removed: 'A név szerinti belépés megszűnt. Lépj be a kódoddal vagy az e-mail címeddel.',
  pending: '⏳ A hozzáférésedet még nem hagyta jóvá a pékség. Hamarosan értesítünk!',
  deleted: '❌ Ez a fiók deaktiválva lett. Vedd fel a kapcsolatot a KEREK pékséggel.',
  rate_limit: '⚠️ Túl sok próbálkozás. Várj egy percet, és próbáld újra.',
  email_invalid: 'Érvénytelen e-mail cím.',
  phone_invalid: 'Adj meg egy érvényes telefonszámot.',
  pin_format: 'A PIN 4–6 számjegy legyen.',
  pin_weak: 'Ez a PIN túl egyszerű (pl. 1111, 1234). Válassz mást.',
  questions_invalid: 'Válassz két különböző kérdést.',
  answer_short: 'A válaszok legalább 2 karakteresek legyenek.',
  email_exists: 'Ez az e-mail cím már egy másik fiókhoz tartozik.',
  email_deleted: 'Ez az e-mail cím egy deaktivált fiókhoz tartozik. Keresd a pékséget.',
  name_invalid: 'Add meg a teljes nevedet.',
};
function authMsg(d, fallback) {
  if (d?.error === 'pin_locked') return `⏳ Túl sok hibás PIN. Próbáld újra ${d.wait_minutes || 15} perc múlva, vagy lépj be a kódoddal.`;
  return VEVO_AUTH_MSG[d?.error] || fallback || ('⚠️ Hiba: ' + (d?.detail || d?.error || 'ismeretlen'));
}

// ---------- belépés ----------
function loginInputChanged() {
  const v = (document.getElementById('login-input')?.value || '').trim();
  const wrap = document.getElementById('login-pin-wrap');
  if (wrap) wrap.style.display = v.includes('@') ? 'block' : 'none';
  _showLoginError('');
}

async function doLogin() {
  const login = (document.getElementById('login-input')?.value || '').trim();
  if (!login) { _showLoginError('⚠️ Add meg a belépési kódot vagy az e-mail címed!'); return; }
  const remember = !!document.getElementById('remember-vevo-login')?.checked;
  const pin = login.includes('@') ? pinVal('login-pin') : '';
  const btn = document.getElementById('login-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Belépés…'; }
  try {
    const r = await vAuth('login', { login, pin, remember });
    if (!r.ok) {
      if (r.data?.error === 'pin_required') { const w = document.getElementById('login-pin-wrap'); if (w) w.style.display = 'block'; }
      if (['bad_credentials', 'pin_locked'].includes(r.data?.error)) pinClear('login-pin');
      _showLoginError(authMsg(r.data));
      return;
    }
    vSession.set(r.data.token, remember);
    if (typeof kerekVevoSaveLogin === 'function') kerekVevoSaveLogin(login);
    await vevoStart(r.data.client, r.data.needs_setup);
  } catch (e) {
    _showLoginError('⚠️ Nincs kapcsolat a szerverrel. Próbáld újra.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Belépés →'; }
  }
}

// Belépés utáni közös indítás (belépés, mentett munkamenet, helyreállítás)
async function vevoStart(client, needsSetup) {
  await loadPublicData();
  await vevoEnterApp(client);
  if (needsSetup) openSetupSheet(client);
}

// Mentett munkamenet ("Maradjak bejelentkezve") → automatikus belépés
async function vevoResumeSession() {
  if (vSession._mem || new URLSearchParams(location.hash.slice(1)).get('preview')) return;   // admin-előnézet külön
  if (!vSession.token) return;
  try {
    const r = await vAuth('me', { token: vSession.token });
    if (!r.ok) { vSession.clear(); return; }
    await vevoStart(r.data.client, r.data.needs_setup);
  } catch (e) { /* offline: marad a belépő képernyő */ }
}

function vevoSessionExpired() {
  if (window._vevoExpiredShown) return;
  window._vevoExpiredShown = true;
  vSession.clear();
  try { localStorage.removeItem('kerek_vevo_data'); } catch (e) {}
  alert('A munkameneted lejárt, vagy a fiókod beállításai megváltoztak. Kérjük, lépj be újra.');
  location.href = 'vevo.html';
}

function logout() {
  vSession.clear();
  try { localStorage.removeItem('kerek_vevo_data'); localStorage.removeItem('kerek_data'); } catch (e) {}
  window.location.href = 'vevo.html';
}

// ---------- admin-előnézet (vevo.html#preview=<csak olvasható token>) ----------
async function vevoPreviewFromHash() {
  const t = new URLSearchParams(location.hash.slice(1)).get('preview');
  if (!t) return;
  vSession._mem = t;
  history.replaceState(null, '', location.pathname);
  const r = await vAuth('me', { token: t }).catch(() => null);
  if (!r || !r.ok) { vSession._mem = null; _showLoginError('Az előnézet lejárt — nyisd meg újra az adminból.'); return; }
  await loadPublicData();
  await vevoEnterApp(r.data.client);
  const banner = document.createElement('div');
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:var(--gold);color:var(--teal-dark);text-align:center;padding:6px;font-size:0.78rem;font-weight:700;z-index:999;font-family:Kodchasan,sans-serif';
  banner.textContent = '👁 ADMIN ELŐNÉZET – ' + r.data.client.name + ' nézetében (csak olvasható)';
  document.body.prepend(banner);
}

// ---------- belépő kártya panelek ----------
function switchAuthTab(tab) {
  const panels = { login: 'auth-login-panel', register: 'auth-reg-panel', recover: 'auth-recover-panel' };
  Object.entries(panels).forEach(([k, id]) => { const el = document.getElementById(id); if (el) el.style.display = k === tab ? 'block' : 'none'; });
  const tabs = document.getElementById('auth-tabs'); if (tabs) tabs.style.display = tab === 'recover' ? 'none' : 'flex';
  const rs = document.getElementById('reg-success'); if (rs) rs.style.display = 'none';
  _showLoginError('');
  [['tab-login-btn', tab === 'login'], ['tab-reg-btn', tab === 'register']].forEach(([id, on]) => {
    const b = document.getElementById(id); if (!b) return;
    b.style.background = on ? 'white' : 'transparent';
    b.style.color = on ? 'var(--teal-dark)' : 'var(--text-soft)';
    b.style.fontWeight = on ? '700' : '400';
    b.style.boxShadow = on ? '0 1px 3px rgba(0,0,0,0.1)' : 'none';
  });
  if (tab === 'register') regShowStep(1);
  if (tab === 'recover') recShowStep(1);
}

// ---------- regisztráció (2 lépés) ----------
function regShowStep(n) {
  document.getElementById('reg-step1').style.display = n === 1 ? 'block' : 'none';
  document.getElementById('reg-step2').style.display = n === 2 ? 'block' : 'none';
  document.querySelectorAll('#auth-reg-panel .steps span').forEach((s, i) => s.classList.toggle('on', i < n));
}
function regNext() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  if (name.length < 3) return _showLoginError('⚠️ Add meg a teljes nevedet!');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return _showLoginError('⚠️ Érvénytelen e-mail cím!');
  if (phone.replace(/\D/g, '').length < 8) return _showLoginError('⚠️ Add meg a telefonszámodat!');
  _showLoginError('');
  const q1 = document.getElementById('reg-q1'), q2 = document.getElementById('reg-q2');
  if (!q1.options.length) { q1.innerHTML = secQuestionOptions(); q2.innerHTML = secQuestionOptions(); }
  regShowStep(2);
}
function secQChanged(p) {
  const a = document.getElementById(p + '-q1'), b = document.getElementById(p + '-q2');
  const va = a.value, vb = b.value;
  a.innerHTML = secQuestionOptions(va, vb); b.innerHTML = secQuestionOptions(vb, va);
}
function readSecretsForm(p) {
  const pin = pinVal(p + '-pin'), pin2 = pinVal(p + '-pin2');
  const q1 = document.getElementById(p + '-q1').value, q2 = document.getElementById(p + '-q2').value;
  const a1 = document.getElementById(p + '-a1').value.trim(), a2 = document.getElementById(p + '-a2').value.trim();
  const lp = pinLocalProblem(pin); if (lp) return { err: lp };
  if (pin !== pin2) return { err: 'A két PIN nem egyezik.' };
  if (!q1 || !q2 || q1 === q2) return { err: 'Válassz két különböző biztonsági kérdést.' };
  if (a1.length < 2 || a2.length < 2) return { err: 'Válaszolj mindkét kérdésre.' };
  return { pin, q1: Number(q1), q2: Number(q2), a1, a2 };
}
async function doRegister() {
  const f = readSecretsForm('reg');
  if (f.err) return _showLoginError('⚠️ ' + f.err);
  const btn = document.getElementById('reg-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Feldolgozás…'; }
  try {
    const r = await vAuth('register', {
      name: document.getElementById('reg-name').value.trim(),
      email: document.getElementById('reg-email').value.trim(),
      phone: document.getElementById('reg-phone').value.trim(),
      pin: f.pin, q1: f.q1, a1: f.a1, q2: f.q2, a2: f.a2,
    });
    if (!r.ok) { if (['email_exists', 'email_deleted', 'email_invalid', 'name_invalid', 'phone_invalid'].includes(r.data?.error)) regShowStep(1); return _showLoginError(authMsg(r.data)); }
    document.getElementById('auth-reg-panel').style.display = 'none';
    document.getElementById('auth-tabs').style.display = 'none';
    document.getElementById('reg-code-display').textContent = r.data.code;
    document.getElementById('reg-success').style.display = 'block';
  } catch (e) { _showLoginError('⚠️ Nincs kapcsolat a szerverrel. Próbáld újra.'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Regisztráció →'; } }
}

// ---------- elfelejtett PIN / kód: helyreállítás ----------
const _rec = { email: '', q1: null, q2: null };
function recShowStep(n) {
  ['rec-step1', 'rec-step2', 'rec-step3', 'rec-locked', 'rec-nosetup'].forEach((id, i) => {
    const el = document.getElementById(id); if (el) el.style.display = (typeof n === 'number' ? i === n - 1 : id === n) ? 'block' : 'none';
  });
  _showLoginError('');
}
async function recStart() {
  const email = document.getElementById('rec-email').value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return _showLoginError('⚠️ Add meg az e-mail címed!');
  const r = await vAuth('recover_start', { email }).catch(() => null);
  if (!r) return _showLoginError('⚠️ Nincs kapcsolat a szerverrel.');
  if (!r.ok) return _showLoginError(authMsg(r.data));
  if (r.data.locked) return recShowStep('rec-locked');
  if (r.data.no_setup) return recShowStep('rec-nosetup');
  Object.assign(_rec, { email, q1: r.data.q1, q2: r.data.q2 });
  document.getElementById('rec-email-label').textContent = email;
  document.getElementById('rec-q1-text').textContent = SEC_QUESTIONS[r.data.q1] || '';
  document.getElementById('rec-q2-text').textContent = SEC_QUESTIONS[r.data.q2] || '';
  document.getElementById('rec-a1').value = ''; document.getElementById('rec-a2').value = '';
  recShowStep(2);
}
function recAnswersNext() {
  if (document.getElementById('rec-a1').value.trim().length < 2 || document.getElementById('rec-a2').value.trim().length < 2)
    return _showLoginError('⚠️ Válaszolj mindkét kérdésre.');
  pinClear('rec-pin'); pinClear('rec-pin2');
  recShowStep(3);
}
async function recFinish() {
  const pin = pinVal('rec-pin'), pin2 = pinVal('rec-pin2');
  const lp = pinLocalProblem(pin); if (lp) return _showLoginError('⚠️ ' + lp);
  if (pin !== pin2) return _showLoginError('⚠️ A két PIN nem egyezik.');
  const remember = !!document.getElementById('remember-vevo-login')?.checked;
  const r = await vAuth('recover_verify', { email: _rec.email, a1: document.getElementById('rec-a1').value, a2: document.getElementById('rec-a2').value, new_pin: pin, remember }).catch(() => null);
  if (!r) return _showLoginError('⚠️ Nincs kapcsolat a szerverrel.');
  if (!r.ok) {
    if (r.data?.error === 'locked') return recShowStep('rec-locked');
    if (r.data?.error === 'wrong_answers') { recShowStep(2); return _showLoginError(`❌ A válaszok nem helyesek.${r.data.left != null ? ' Ma még ' + r.data.left + ' próbálkozásod van.' : ''}`); }
    return _showLoginError(authMsg(r.data));
  }
  vSession.set(r.data.token, remember);
  await alertDialog(`✅ Kész! Az új PIN-kódod beállítva.\n\nA belépési kódod (ezzel is beléphetsz):\n${r.data.code}`);
  await vevoStart(r.data.client, r.data.needs_setup);
}

// ---------- beállító pop-up (meglévő vevők: adatok → PIN → 2 kérdés; nem zárható be) ----------
function openSetupSheet(client) {
  const el = document.getElementById('setup-sheet'); if (!el) return;
  document.getElementById('setup-email').value = client.email || '';
  document.getElementById('setup-phone').value = client.phone || '';
  document.getElementById('setup-q1').innerHTML = secQuestionOptions();
  document.getElementById('setup-q2').innerHTML = secQuestionOptions();
  document.getElementById('setup-hello').textContent = 'Szia ' + (client.name || '').split(' ').slice(-1)[0] + '! 👋';
  setupShowStep(0);
  el.style.display = 'flex';
}
function setupShowStep(n) {
  ['setup-s0', 'setup-s1', 'setup-s2', 'setup-s3'].forEach((id, i) => { document.getElementById(id).style.display = i === n ? 'block' : 'none'; });
  document.querySelectorAll('#setup-sheet .steps span').forEach((s, i) => s.classList.toggle('on', i < n));
  document.querySelector('#setup-sheet .steps').style.visibility = n === 0 ? 'hidden' : 'visible';
  setupErr('');
}
function setupErr(m) { const e = document.getElementById('setup-err'); if (e) { e.textContent = m; e.style.display = m ? 'block' : 'none'; } }
function setupNext(n) {
  if (n === 2) {
    const email = document.getElementById('setup-email').value.trim(), phone = document.getElementById('setup-phone').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setupErr('⚠️ Érvénytelen e-mail cím.');
    if (phone.replace(/\D/g, '').length < 8) return setupErr('⚠️ Add meg a telefonszámodat.');
  }
  if (n === 3) {
    const pin = pinVal('setup-pin'), lp = pinLocalProblem(pin);
    if (lp) return setupErr('⚠️ ' + lp);
    if (pin !== pinVal('setup-pin2')) return setupErr('⚠️ A két PIN nem egyezik.');
  }
  setupShowStep(n);
}
async function setupSave() {
  const f = readSecretsForm('setup');
  if (f.err) return setupErr('⚠️ ' + f.err);
  const btn = document.getElementById('setup-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Mentés…'; }
  try {
    const r = await vAuth('setup', { token: vSession.token, email: document.getElementById('setup-email').value.trim(), phone: document.getElementById('setup-phone').value.trim(), pin: f.pin, q1: f.q1, a1: f.a1, q2: f.q2, a2: f.a2 });
    if (!r.ok) {
      if (['email_exists', 'email_invalid', 'phone_invalid'].includes(r.data?.error)) setupShowStep(1);
      return setupErr(authMsg(r.data));
    }
    if (currentUser && r.data.client) Object.assign(currentUser, { email: r.data.client.email, phone: r.data.client.phone });
    document.getElementById('setup-sheet').style.display = 'none';
    toast('✅ Kész! Mostantól az e-mail címeddel és a PIN-eddel is be tudsz lépni.');
  } catch (e) { setupErr('⚠️ Nincs kapcsolat a szerverrel. Próbáld újra.'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Mentés ✓'; } }
}

// ---------- indítás ----------
function vevoAuthInit() {
  document.querySelectorAll('[data-pinbox]').forEach(el => { el.outerHTML = pinBoxHtml(el.id, el.dataset.autoc || 'off'); });
  if (new URLSearchParams(location.search).get('tab') === 'register') switchAuthTab('register');
  vevoPreviewFromHash();
  vevoResumeSession();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', vevoAuthInit);
else vevoAuthInit();

if (typeof window !== 'undefined') Object.assign(window, {
  doLogin, doRegister, switchAuthTab, loginInputChanged, regNext, secQChanged, recStart, recAnswersNext, recFinish,
  setupNext, setupSave, logout, pinBoxSync, vevoSessionExpired,
});
