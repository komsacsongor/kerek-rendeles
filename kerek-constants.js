// ============================================================
// KEREK – Közös konstansok
// Betöltési sorrend: kerek-constants.js → supabase.js → oldal JS
// ============================================================
const APP_VERSION = 'v2.9.0 (2026-05-11)';

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
