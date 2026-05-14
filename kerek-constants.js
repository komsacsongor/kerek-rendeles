// ============================================================
// KEREK – Közös konstansok
// Betöltési sorrend: kerek-constants.js → supabase.js → oldal JS
// ============================================================
const APP_VERSION = 'v2.16.2 (2026-05-14)';

const MONTHS = ['Január','Február','Március','Április','Május','Június',
                'Július','Augusztus','Szeptember','Október','November','December'];

const MONTHS_SHORT = ['Jan','Feb','Már','Ápr','Máj','Jún',
                      'Júl','Aug','Sze','Okt','Nov','Dec'];

const DAYS_HU = ['Vasárnap','Hétfő','Kedd','Szerda','Csütörtök','Péntek','Szombat'];

const DAYS_SHORT = ['V','H','K','Sze','Cs','P','Szo'];

const DEFAULT_BAKING_DAYS = [2, 5]; // Kedd, Péntek (0=Vasárnap)

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

// ===== SC11: AUDIT LOG =====
async function auditLog(action, entityName='', details='') {
  try {
    await fetch(`https://lfaxeihrmiylggahougl.supabase.co/rest/v1/audit_log`, {
      method: 'POST',
      headers: {
        'apikey': 'SUPABASE_ANON_KEY_PLACEHOLDER',
        'Authorization': 'Bearer SUPABASE_ANON_KEY_PLACEHOLDER',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({action, entity_name: entityName, details})
    });
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
