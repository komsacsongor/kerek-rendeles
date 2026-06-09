// =============================================================
// KEREK Admin — Adat-állapot Audit (v2.41.5)
// =============================================================
// Egy helyen listázza az adat-anomáliákat:
//   1. Üres receptek (recipe létezik, recipe_ingredients üres)
//   2. Hiányzó beszállítójú alapanyagok
//   3. Abszurd min/max alapanyagok (gyanúsan kicsi értékek g-ben)
//   4. [PENDING] vevők (regisztráció jóváhagyásra vár)
//   5. [DELETED] vevők (soft-deleted, de még DB-ben)
// =============================================================

// Helyi HTML escape (admin oldalon nincs globális esc() — csak a receptúrában)
function _audit_escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

async function renderDataAudit() {
  const el = document.getElementById('view-data-audit-content');
  if (!el) return;
  el.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-soft)">🔍 Audit fut...</div>';

  try {
    const eh = _audit_escapeHtml;

    // ÚJ: a már betöltött D állapot használata (NEM sb.query)
    const recipes = D.recipes || [];
    // D.recipeIngredients { [recipeId]: [items] }
    const recipeIngredients = D.recipeIngredients || {};
    const ingredients = D.ingredients || [];
    const batches = D.ingredientBatches || [];
    const clients = D.clients || [];

    // Ha hiányzik valamelyik (login előtt vagy adatok még nincsenek betöltve), figyelmeztetünk
    if (recipes.length === 0 && ingredients.length === 0 && clients.length === 0) {
      el.innerHTML = '<div style="padding:30px;color:var(--text-soft);text-align:center">Az adatok még nincsenek betöltve. Frissítsd az oldalt és próbáld újra.</div>';
      return;
    }

    // 1. Üres receptek (recipe rekord létezik, recipe_ingredients tömb üres VAGY nincs)
    const emptyRecipes = recipes.filter(r => {
      const items = recipeIngredients[r.id];
      return !items || items.length === 0;
    });

    // 2. Hiányzó beszállító alapanyagok
    const ingsWithBatch = new Set(
      batches.filter(b => (b.supplier_name || '').trim()).map(b => b.ingredient_id)
    );
    const noSupplierIngs = ingredients.filter(i =>
      !i.preferred_supplier_id && !ingsWithBatch.has(i.id) && i.material_type !== 'tool'
    );

    // 3. Gyanús min/max (< 50 g) — heurisztika: valószínűleg kg-ban gondolt
    const absurdMinMax = ingredients.filter(i => {
      const min = Number(i.min_stock_g) || 0;
      const crit = Number(i.critical_stock_g) || 0;
      return (min > 0 && min < 50) || (crit > 0 && crit < 50);
    });

    // 4. PENDING vevők
    const pendingClients = clients.filter(c => (c.name || '').startsWith('[PENDING]'));

    // 5. DELETED vevők
    const deletedClients = clients.filter(c => (c.name || '').startsWith('[DELETED]'));

    const sections = [
      {
        icon: '❌', title: 'Üres receptek', count: emptyRecipes.length,
        desc: 'Van recept rekord, DE nincs alapanyag rögzítve — a rendszer nem tud alapanyag-igényt számolni',
        items: emptyRecipes.map(r => eh(r.name || `#${r.id}`)),
        color: '#dc2626', action: 'Receptúra modul → Receptek → kattints a kártyára → alapanyagok hozzáadása'
      },
      {
        icon: '🚚', title: 'Hiányzó beszállító', count: noSupplierIngs.length,
        desc: 'Sem preferált beszállító, sem korábbi bevételezés — a bevásárló lista nem tudja kihez sorolni',
        items: noSupplierIngs.map(i => eh(i.name)),
        color: '#d97706', action: 'Receptúra → Alapanyagok & Készlet → szerkesztés → Preferált beszállító megadása'
      },
      {
        icon: '⚖️', title: 'Gyanús min/max értékek', count: absurdMinMax.length,
        desc: 'Min vagy kritikus szint < 50 g — valószínűleg kg-ban gondolt amikor felvette (pl. Burgonya 1g)',
        items: absurdMinMax.map(i => `${eh(i.name)} — min: ${eh(i.min_stock_g||'?')}g, kritikus: ${eh(i.critical_stock_g||'?')}g`),
        color: '#d97706', action: 'Receptúra → Alapanyagok & Készlet → szerkesztés → helyes érték (g-ben!)'
      },
      {
        icon: '⏳', title: 'PENDING vevők (jóváhagyásra várnak)', count: pendingClients.length,
        desc: 'Önregisztrált, de admin által nem jóváhagyott vevők',
        items: pendingClients.map(c => `${eh((c.name||'').replace('[PENDING]', '').trim())} (${eh(c.email||'-')})`),
        color: '#0891b2', action: 'Kliensek view → ✓ Jóváhagyás'
      },
      {
        icon: '🗑️', title: 'Soft-deleted vevők (még DB-ben)', count: deletedClients.length,
        desc: 'Törölt rekordok megőrzött formában — élesítés előtt érdemes véglegesen törölni',
        items: deletedClients.slice(0, 10).map(c => eh((c.name||'').replace('[DELETED]', '').trim())),
        color: '#6b7280', action: 'Élesítés előtt: SQL törlés a Supabase SQL Editorban (staging-en először!)'
      }
    ];

    const total = sections.reduce((sum, s) => sum + s.count, 0);
    const headerHtml = `
      <div style="background:white;border:1px solid var(--border);border-radius:12px;padding:14px 18px;margin-bottom:18px;display:flex;align-items:center;gap:14px">
        <div style="font-size:2rem">${total === 0 ? '✅' : '🔍'}</div>
        <div>
          <div style="font-family:'Fraunces',serif;font-size:1.15rem;font-weight:700;color:var(--teal-dark)">${total === 0 ? 'Minden rendben!' : `${total} anomália találva`}</div>
          <div style="font-size:0.8rem;color:var(--text-soft)">Az ellenőrzés a már betöltött adatokon fut. Frissítéshez: ↻ gomb.</div>
        </div>
        <button class="btn btn-ghost btn-sm" data-action="renderDataAudit" style="margin-left:auto">↻ Frissítés</button>
      </div>
    `;

    const sectionsHtml = sections.map(s => `
      <div style="background:white;border:1px solid var(--border);border-radius:12px;margin-bottom:14px;overflow:hidden">
        <div style="padding:12px 18px;background:${s.count > 0 ? s.color : '#f3f4f6'};color:${s.count > 0 ? 'white' : '#6b7280'};display:flex;align-items:center;gap:10px">
          <span style="font-size:1.3rem">${s.icon}</span>
          <div style="flex:1">
            <div style="font-weight:700;font-size:0.95rem">${s.title}</div>
            <div style="font-size:0.75rem;opacity:0.9">${s.desc}</div>
          </div>
          <div style="background:rgba(255,255,255,0.25);padding:4px 12px;border-radius:14px;font-weight:700">${s.count} db</div>
        </div>
        ${s.count > 0 ? `
          <div style="padding:12px 18px;background:#fafaf7">
            <ul style="margin:0;padding-left:20px;font-size:0.85rem;color:var(--text);max-height:200px;overflow-y:auto">
              ${s.items.slice(0, 20).map(i => `<li style="margin-bottom:3px">${i}</li>`).join('')}
              ${s.items.length > 20 ? `<li style="color:var(--text-soft);font-style:italic">+ ${s.items.length - 20} további...</li>` : ''}
            </ul>
            <div style="margin-top:10px;padding:8px 12px;background:white;border-left:3px solid ${s.color};border-radius:4px;font-size:0.78rem;color:var(--text-soft)">
              💡 <b>Megoldás:</b> ${s.action}
            </div>
          </div>
        ` : `<div style="padding:14px 18px;color:var(--text-soft);font-size:0.85rem;font-style:italic">Nincs probléma ebben a kategóriában ✅</div>`}
      </div>
    `).join('');

    el.innerHTML = headerHtml + sectionsHtml;
  } catch(e) {
    el.innerHTML = `<div style="padding:20px;color:#dc2626">⚠️ Hiba: ${String(e.message).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'})[c])}</div>`;
    console.error('renderDataAudit:', e);
  }
}

if (typeof window !== 'undefined') window.renderDataAudit = renderDataAudit;
