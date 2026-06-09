// =============================================================
// KEREK Admin — Adat-állapot Audit (v2.41.4)
// =============================================================
// Egy helyen listázza az adat-anomáliákat:
//   1. Üres receptek (recipe létezik, recipe_ingredients üres)
//   2. Hiányzó beszállítójú alapanyagok
//   3. Abszurd min/max alapanyagok (gyanúsan kicsi értékek g-ben)
//   4. [PENDING] vevők (regisztráció jóváhagyásra vár)
//   5. [DELETED] vevők (soft-deleted, de még DB-ben)
// =============================================================

async function renderDataAudit() {
  const el = document.getElementById('view-data-audit-content');
  if (!el) return;
  el.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-soft)">🔍 Audit fut...</div>';

  try {
    // Adatok lekérése
    const [recipes, recIng, ingredients, batches, clients] = await Promise.all([
      sb.query('recipes', {select: 'id,product_id,name', limit: 500}),
      sb.query('recipe_ingredients', {select: 'recipe_id', limit: 5000}),
      sb.query('ingredients', {select: 'id,name,min_stock_g,critical_stock_g,material_type,preferred_supplier_id', limit: 500}),
      sb.query('ingredient_batches', {select: 'ingredient_id,supplier_name', limit: 2000}),
      sb.query('clients', {select: 'id,name,email', limit: 500})
    ]);

    // 1. Üres receptek
    const ingCountByRecipe = {};
    (recIng || []).forEach(ri => { ingCountByRecipe[ri.recipe_id] = (ingCountByRecipe[ri.recipe_id] || 0) + 1; });
    const emptyRecipes = (recipes || []).filter(r => !(ingCountByRecipe[r.id] || 0));

    // 2. Hiányzó beszállító
    const ingsWithBatch = new Set((batches || []).filter(b => b.supplier_name?.trim()).map(b => b.ingredient_id));
    const noSupplierIngs = (ingredients || []).filter(i =>
      !i.preferred_supplier_id && !ingsWithBatch.has(i.id) && i.material_type !== 'tool'
    );

    // 3. Abszurd min/max — gyanúsan kicsi g-érték (a heurisztika: ha <50 g és csak száraz alapanyag)
    const absurdMinMax = (ingredients || []).filter(i => {
      const min = Number(i.min_stock_g) || 0;
      const crit = Number(i.critical_stock_g) || 0;
      // Heurisztika: min > 0 ÉS min < 50 g → valószínű kg-ban gondolt értéket
      return (min > 0 && min < 50) || (crit > 0 && crit < 50);
    });

    // 4. PENDING vevők
    const pendingClients = (clients || []).filter(c => c.name?.startsWith('[PENDING]'));

    // 5. DELETED vevők
    const deletedClients = (clients || []).filter(c => c.name?.startsWith('[DELETED]'));

    // Render
    const sections = [
      {
        icon: '❌', title: 'Üres receptek', count: emptyRecipes.length,
        desc: 'Van recept rekord, DE nincs alapanyag rögzítve — a rendszer nem tud alapanyag-igényt számolni',
        items: emptyRecipes.map(r => esc(r.name)),
        color: '#dc2626', action: 'Receptúra modul → szerkesztés → alapanyagok hozzáadása'
      },
      {
        icon: '🚚', title: 'Hiányzó beszállító', count: noSupplierIngs.length,
        desc: 'Sem preferált beszállító, sem korábbi bevételezés — a bevásárló lista nem tudja kihez sorolni',
        items: noSupplierIngs.map(i => esc(i.name)),
        color: '#d97706', action: 'Alapanyagok modul → szerkesztés → Preferált beszállító megadása'
      },
      {
        icon: '⚖️', title: 'Gyanús min/max értékek', count: absurdMinMax.length,
        desc: 'Min/critical érték <50 g — valószínűleg kg-ban gondolt amikor felvette (pl. Burgonya 1g)',
        items: absurdMinMax.map(i => `${esc(i.name)} — min: ${i.min_stock_g||'?'}g, kritikus: ${i.critical_stock_g||'?'}g`),
        color: '#d97706', action: 'Alapanyagok & Készlet → szerkesztés → helyes érték megadása (g-ben)'
      },
      {
        icon: '⏳', title: 'PENDING vevők (jóváhagyásra várnak)', count: pendingClients.length,
        desc: 'Önregisztrált, de admin által nem jóváhagyott vevők',
        items: pendingClients.map(c => `${esc(c.name.replace('[PENDING]', '').trim())} (${esc(c.email||'-')})`),
        color: '#0891b2', action: 'Kliensek view → ✓ Jóváhagyás'
      },
      {
        icon: '🗑️', title: 'Soft-deleted vevők (még DB-ben)', count: deletedClients.length,
        desc: 'Törölt rekordok megőrzött formában — élesítés előtt érdemes véglegesen törölni',
        items: deletedClients.slice(0, 5).map(c => esc(c.name.replace('[DELETED]', '').trim())),
        color: '#6b7280', action: 'SQL-lel törölhető (staging-en először tesztelni!): DELETE FROM clients WHERE name LIKE [DELETED]%'
      }
    ];

    const total = sections.reduce((sum, s) => sum + s.count, 0);
    const headerHtml = `
      <div style="background:white;border:1px solid var(--border);border-radius:12px;padding:14px 18px;margin-bottom:18px;display:flex;align-items:center;gap:14px">
        <div style="font-size:2rem">${total === 0 ? '✅' : '🔍'}</div>
        <div>
          <div style="font-family:'Fraunces',serif;font-size:1.15rem;font-weight:700;color:var(--teal-dark)">${total === 0 ? 'Minden rendben!' : `${total} anomália találva`}</div>
          <div style="font-size:0.8rem;color:var(--text-soft)">Az adat-állapot ellenőrzés ${new Date().toLocaleTimeString('hu')} időpontban frissült</div>
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
    el.innerHTML = `<div style="padding:20px;color:#dc2626">⚠️ Hiba: ${esc(e.message)}</div>`;
  }
}

if (typeof window !== 'undefined') window.renderDataAudit = renderDataAudit;
