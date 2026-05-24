// ============================================================
// KEREK – Közös konstansok
// Betöltési sorrend: kerek-constants.js → supabase.js → oldal JS
// ============================================================
const APP_VERSION = 'v2.30.0 (2026-05-24)';

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
