// ============================================================
// KEREK – Közös konstansok
// Betöltési sorrend: kerek-constants.js → supabase.js → oldal JS
// ============================================================
const APP_VERSION = 'v2.34.0 (2026-05-25)';

const MONTHS = ['Január','Február','Március','Április','Május','Június',
                'Július','Augusztus','Szeptember','Október','November','December'];

const MONTHS_SHORT = ['Jan','Feb','Már','Ápr','Máj','Jún',
                      'Júl','Aug','Sze','Okt','Nov','Dec'];

const DAYS_HU = ['Vasárnap','Hétfő','Kedd','Szerda','Csütörtök','Péntek','Szombat'];

const DAYS_SHORT = ['V','H','K','Sze','Cs','P','Szo'];

const DEFAULT_BAKING_DAYS = [2, 5]; // Kedd, Péntek (0=Vasárnap)

// ===== M4: KÖZÖS MAGIC NUMBER KONSTANSOK =====
const POLLING_INTERVAL_MS = 30000;      // Unified polling all 3 modules
const MSG_RATE_LIMIT_MS = 30000;        // 30s between messages per client
const LOGIN_LOCKOUT_MS = 60000;         // 1 min lockout window
const LOGIN_MAX_ATTEMPTS = 5;
const QUERY_LIMIT_ORDERS = 5000;
const QUERY_LIMIT_STATUSES = 2000;
const QUERY_LIMIT_CLIENTS = 500;
const QUERY_LIMIT_PRODUCTS = 500;
const URL_REVOKE_TIMEOUT_MS = 5000;
const REALTIME_DEBOUNCE_MS = 500;       // C5: WS callback debounce
const WS_RECONNECT_MIN_MS = 5000;       // H6: Exponential backoff bounds
const WS_RECONNECT_MAX_MS = 300000;     // 5 min max
const DEBUG = false;                    // M3: production-ban false legyen
function debugLog(...args) { if (DEBUG) console.log('[KEREK]', ...args); }

// ===== M5: CUSTOM MODAL DIALÓGUSOK (confirm + alert helyett) =====
// confirmDialog(msg, opts?) → Promise<boolean>: true ha OK, false ha Cancel
// alertDialog(msg, opts?) → Promise<void>: feloldódik amikor a user OK-zza
// opts: { title?, okText?, cancelText?, danger?: bool, multiline?: bool }
function _createKerekDialog(type, message, opts) {
  opts = opts || {};
  return new Promise(resolve => {
    // Backdrop
    const backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;animation:kerekDialogFade 0.15s ease-out';

    // Modal box
    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:14px;max-width:420px;width:100%;box-shadow:0 20px 50px rgba(0,0,0,0.3);overflow:hidden;font-family:Kodchasan,system-ui,sans-serif;animation:kerekDialogSlide 0.2s ease-out';

    // Header
    const title = opts.title || (type === 'alert' ? 'Figyelem' : 'Megerősítés');
    const headerBg = opts.danger ? '#dc2626' : '#064C48';
    const header = document.createElement('div');
    header.style.cssText = `background:${headerBg};color:#fff;padding:14px 18px;font-weight:600;font-size:0.95rem;font-family:Fraunces,serif`;
    header.textContent = title;

    // Body
    const body = document.createElement('div');
    body.style.cssText = 'padding:18px;color:#1A2E31;font-size:0.92rem;line-height:1.5;white-space:pre-line;max-height:50vh;overflow-y:auto';
    body.textContent = message;

    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = 'padding:12px 18px;background:#f9fafb;display:flex;gap:8px;justify-content:flex-end;border-top:1px solid #e5e7eb';

    let cancelBtn = null;
    if (type === 'confirm') {
      cancelBtn = document.createElement('button');
      cancelBtn.textContent = opts.cancelText || 'Mégse';
      cancelBtn.style.cssText = 'padding:9px 16px;border:1px solid #d1d5db;background:#fff;color:#374151;border-radius:8px;font-family:Kodchasan,sans-serif;font-size:0.9rem;cursor:pointer;font-weight:500';
      cancelBtn.onmouseover = () => cancelBtn.style.background = '#f3f4f6';
      cancelBtn.onmouseout = () => cancelBtn.style.background = '#fff';
      footer.appendChild(cancelBtn);
    }

    const okBtn = document.createElement('button');
    okBtn.textContent = opts.okText || (type === 'alert' ? 'Rendben' : 'Igen');
    const okBg = opts.danger ? '#dc2626' : '#064C48';
    okBtn.style.cssText = `padding:9px 16px;border:none;background:${okBg};color:#fff;border-radius:8px;font-family:Kodchasan,sans-serif;font-size:0.9rem;cursor:pointer;font-weight:600`;
    footer.appendChild(okBtn);

    box.appendChild(header);
    box.appendChild(body);
    box.appendChild(footer);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);

    // Ensure animation CSS exists once
    if (!document.getElementById('kerek-dialog-css')) {
      const st = document.createElement('style');
      st.id = 'kerek-dialog-css';
      st.textContent = '@keyframes kerekDialogFade{from{opacity:0}to{opacity:1}}@keyframes kerekDialogSlide{from{opacity:0;transform:translateY(-10px) scale(0.97)}to{opacity:1;transform:translateY(0) scale(1)}}';
      document.head.appendChild(st);
    }

    setTimeout(() => okBtn.focus(), 50);

    function cleanup(result) {
      document.removeEventListener('keydown', onKey);
      backdrop.style.opacity = '0';
      backdrop.style.transition = 'opacity 0.1s';
      setTimeout(() => {
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        resolve(result);
      }, 100);
    }

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); cleanup(type === 'alert' ? undefined : false); }
      else if (e.key === 'Enter' && document.activeElement === okBtn) { e.preventDefault(); cleanup(type === 'alert' ? undefined : true); }
    }

    okBtn.onclick = () => cleanup(type === 'alert' ? undefined : true);
    if (cancelBtn) cancelBtn.onclick = () => cleanup(false);
    backdrop.onclick = (e) => { if (e.target === backdrop) cleanup(type === 'alert' ? undefined : false); };
    document.addEventListener('keydown', onKey);
  });
}

function confirmDialog(message, opts) { return _createKerekDialog('confirm', message, opts); }
function alertDialog(message, opts) { return _createKerekDialog('alert', message, opts); }

// ===== M7: GLOBAL CLICK EVENT DELEGATION (data-action pattern) =====
// HTML: <button data-action="doLogin">Login</button>
// HTML: <button data-action="showView" data-arg1="summary" data-arg2="summary-tab">View</button>
// JS: window.doLogin = function() {...}; window.showView = function(v, t) {...}
// Args: data-arg1, data-arg2, ... data-arg9 (numeric strings stay strings)
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (typeof window[action] !== 'function') return;
    const args = [];
    for (let i = 1; i <= 9; i++) {
      const v = btn.dataset['arg' + i];
      if (v === undefined) break;
      // Auto-cast: 'true'/'false' → boolean, numeric → number
      if (v === 'true') args.push(true);
      else if (v === 'false') args.push(false);
      else if (/^-?\d+(\.\d+)?$/.test(v)) args.push(Number(v));
      else args.push(v);
    }
    window[action](...args);
  });
}

// ===== EGYSÉGES TERMÉKKÓD GENERÁLÁS =====
const PRODUCT_CAT_CODES = {
  'Kenyér':'KEN','Bagett / zsömle':'BAG','Sütemény':'SUT',
  'Leveles tészta':'LEV','Egyéb':'EGY'
};
function generateProductCode(name, category, id) {
  const prefix = PRODUCT_CAT_CODES[category] || 'EGY';
  const namePart = (name||'').toUpperCase()
    .replace(/[ÁÀÂÄ]/g,'A').replace(/[ÉÈÊË]/g,'E')
    .replace(/[ÍÌÎÏ]/g,'I').replace(/[ÓÒÔÖŐ]/g,'O')
    .replace(/[ÚÙÛÜŰ]/g,'U').replace(/[^A-Z]/g,'')
    .slice(0,4) || 'XXX';
  const seq = String(id).padStart(4,'0');
  return `${prefix}-${namePart}-${seq}`;
}


// ===== VERZIÓ BADGE =====
function showVersionBadge() {
  const el = document.getElementById('version-badge');
  if(el) el.textContent = APP_VERSION;
}

// ===== SC5: EGYSÉGES KULCS FÜGGVÉNYEK =====
// Hónap kulcs: "2026-4" (0-indexed hónap!)
function mk(y,m){ return `${y}-${m}`; }
// Rendelés kulcs: "anna-2026-4-15"
function ok(cid,y,m,d){ return `${cid}-${y}-${m}-${d}`; }
// Vevő modul: getKey(month, year) - fordított sorrend, de azonos output mint mk()
function getKey(month, year){ return `${year}-${month}`; }
// Vevő rendelés kulcs
function getOrderKey(cid,y,m,d){ return `${cid}-${y}-${m}-${d}`; }
// M1+M2: Shared helper (deduped from admin-ui.js + vevo-ui.js)
function getDays(year, month) {
  const days = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) { days.push(new Date(d)); d.setDate(d.getDate()+1); }
  return days;
}

// ===== SC11: AUDIT LOG =====
async function auditLog(action, entityName='', details='') {
  if (typeof sb === 'undefined') return;
  try {
    await sb.insert('audit_log', { action, entity_name: entityName, details });
  } catch(e) { console.warn('Audit log hiba:', e.message); }
}

// ===== PUSH NOTIFICATION SENDER =====
const PUSH_FN_URL = 'https://lfaxeihrmiylggahougl.supabase.co/functions/v1/dynamic-service';
const PUSH_ANON = 'sb_publishable_prELs2iHaoj9uu-yaARPOQ_PSYe2WAN';

async function sendPushToClient(clientId, type, title, body) {
  try {
    await fetch(PUSH_FN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + PUSH_ANON },
      body: JSON.stringify({ client_id: clientId, type, title, body, url: '/kerek-rendeles/vevo.html' })
    });
  } catch(e) { console.warn('Push send failed:', e.message); }
}

// v2.28.0: Broadcast push to multiple clients
// filter: 'all' (default - all non-deleted clients), 'active' (clients with orders in last 90d), or array of clientIds
// Returns { sent, failed } counts
async function sendPushBroadcast(type, title, body, filter) {
  filter = filter || 'all';
  let clientIds = [];
  try {
    if (Array.isArray(filter)) {
      clientIds = filter;
    } else if (filter === 'active') {
      // Active = had at least one order in last 90 days
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
      const cutoffStr = cutoff.toISOString();
      const recentOrders = await fetch(`https://lfaxeihrmiylggahougl.supabase.co/rest/v1/orders?created_at=gte.${cutoffStr}&select=client_id`, {
        headers: { 'apikey': PUSH_ANON, 'Authorization': 'Bearer ' + PUSH_ANON }
      }).then(r => r.json());
      clientIds = [...new Set((recentOrders||[]).map(o => o.client_id))];
    } else {
      // All non-deleted/non-pending clients
      const allClients = await fetch(`https://lfaxeihrmiylggahougl.supabase.co/rest/v1/clients?select=id,name`, {
        headers: { 'apikey': PUSH_ANON, 'Authorization': 'Bearer ' + PUSH_ANON }
      }).then(r => r.json());
      clientIds = (allClients||[])
        .filter(c => !(c.name||'').startsWith('[DELETED]') && !(c.name||'').startsWith('[PENDING]'))
        .map(c => c.id);
    }
  } catch(e) {
    console.warn('Broadcast client lookup failed:', e.message);
    return { sent: 0, failed: 0 };
  }

  // Parallel push to all clients
  const results = await Promise.allSettled(
    clientIds.map(cid => sendPushToClient(cid, type, title, body))
  );
  const sent = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.length - sent;

  // Audit log
  try {
    await auditLog('push_broadcast', title, `Type: ${type}, Cél: ${filter}, Küldve: ${sent}/${clientIds.length}, Szöveg: ${body.substring(0, 100)}`);
  } catch(e) {}

  return { sent, failed, total: clientIds.length };
}

// ===== UNIFIED POLLING (Page Visibility-aware) =====
// Used by all 3 modules (admin, vevo, receptura) for consistent 30s data refresh.
// - Pauses when tab is hidden (saves bandwidth)
// - Runs immediately on tab becoming visible again
// - Returns a stop function (clears interval and visibility listener)
function startUnifiedPolling(callback, intervalMs) {
  intervalMs = intervalMs || 30000;
  let timer = null;
  let visListener = null;
  const tick = async () => {
    if (document.hidden) return;
    try { await callback(); } catch(e) { console.warn('Polling tick failed:', e.message); }
  };
  const start = () => {
    if (timer) clearInterval(timer);
    timer = setInterval(tick, intervalMs);
  };
  start();
  visListener = () => {
    if (!document.hidden) {
      // Immediate poll when tab becomes visible
      tick();
    }
  };
  document.addEventListener('visibilitychange', visListener);
  return function stop() {
    if (timer) clearInterval(timer);
    if (visListener) document.removeEventListener('visibilitychange', visListener);
    timer = null;
  };
}
