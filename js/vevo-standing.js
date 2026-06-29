// ===== KEREK ÁLLANDÓ RENDELÉS (standing orders) MOTOR — Fázis 1 =====
// Egy havi szabályból (client + termék + év/hónap: be/ki + db + napok) kiszámolja,
// mely sütési napokra mennyi kerüljön az orders-be. A szabály a "forrás"; a generált
// napok sima orders sorok, így a pék / sütési lista / export változatlanul működik.
//
// A motor SOHA nem nyúl:
//   - múltbeli / lezárt naphoz (isPastOrLocked)
//   - kézzel zárolt (override) naphoz (rule.override_days)
//   - visszautasított (cancelled) naphoz (isCancelled)  → "A" döntés: a pék erősebb

// --- Pure: a szabály által BIRTOKOLT napokra kiszámolja a cél-darabszámot ---
// rule: { qty:int, dows:int[] (getDay 0=vas..6=szo), active:bool, override_days:int[] }
// ctx:  { bakingDays:int[], dayOfWeek:(day)=>int, isPastOrLocked:(day)=>bool, isCancelled:(day)=>bool }
// vissza: [{ day:int, qty:int }]  (qty 0 = a napot üríteni kell, mert a szabály már nem fedi)
function computeStandingTargets(rule, ctx) {
  const dows = Array.isArray(rule && rule.dows) ? rule.dows : [];
  const overrides = Array.isArray(rule && rule.override_days) ? rule.override_days : [];
  const targets = [];
  const bdays = (ctx && ctx.bakingDays) || [];
  for (let i = 0; i < bdays.length; i++) {
    const day = bdays[i];
    if (ctx.isPastOrLocked(day)) continue;          // múltbeli / lezárt: érintetlen
    if (overrides.indexOf(day) > -1) continue;       // kézzel zárolt: érintetlen
    if (ctx.isCancelled(day)) continue;              // pék visszautasította: nem töltjük újra
    const matches = !!(rule && rule.active) && dows.indexOf(ctx.dayOfWeek(day)) > -1;
    targets.push({ day: day, qty: matches ? ((rule.qty | 0)) : 0 });
  }
  return targets;
}

// --- Alkalmazza a célokat az orders-re. Csak ott ír, ahol tényleges változás van. ---
// io: { currentQty:(day)=>int, upsert:(day, qty)=>void, remove:(day)=>void }
// vissza: { upserts:[{day,qty}], removes:[day] }  (naplózáshoz / teszteléshez)
function materializeStandingOrder(rule, ctx, io) {
  const targets = computeStandingTargets(rule, ctx);
  const ops = { upserts: [], removes: [] };
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const cur = io.currentQty(t.day) | 0;
    if (t.qty > 0) {
      if (cur !== t.qty) { io.upsert(t.day, t.qty); ops.upserts.push({ day: t.day, qty: t.qty }); }
    } else {
      if (cur > 0) { io.remove(t.day); ops.removes.push(t.day); }
    }
  }
  return ops;
}

// ===== APP-BINDING (böngésző) — a fenti pure motort köti az élő app-adathoz =====
// Minden böngésző-globált (sb, appData, currentUser, isBakingDay, getOrderKey) CSAK
// függvénytörzsben használ, hogy a Node/Jest require() ne hibázzon a tiszta motoron.

// standing_orders betöltése egy hónapra → appData.standingOrders[product_id] = szabály
async function loadStandingOrders(year, month) {
  const filter = `client_id=eq.${currentUser.id}&year=eq.${year}&month=eq.${month}`;
  const rows = await sb.query('standing_orders', { filter });
  const map = {};
  (rows || []).forEach(r => { map[r.product_id] = r; });
  appData.standingOrders = map;
  return map;
}

// ctx építése az app-adatból (sütési napok, past/lezárt, cancelled)
function buildStandingCtx(year, month) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const bdays = [];
  for (let d = 1; d <= 31; d++) {
    const dt = new Date(year, month, d);
    if (dt.getMonth() !== month) break;
    if (isBakingDay(dt)) bdays.push(d);
  }
  return {
    bakingDays: bdays,
    dayOfWeek: (d) => new Date(year, month, d).getDay(),
    isPastOrLocked: (d) => { const dt = new Date(year, month, d); dt.setHours(0, 0, 0, 0); return dt < today; },
    isCancelled: (d) => {
      const k = getOrderKey(currentUser.id, year, month, d);
      const s = appData.orderStatus && appData.orderStatus[k];
      return !!(s && s.status === 'cancelled');
    }
  };
}

function _curQty(year, month, day, productId) {
  const k = getOrderKey(currentUser.id, year, month, day);
  const o = appData.orders && appData.orders[k];
  return (o && (o[productId] || o[String(productId)])) || 0;
}

// Egy termék havi szabályának mentése + materializálás az orders-be.
// ruleFields: { qty, dows, active, override_days }. Vissza: { upserts:[{day,qty}], removes:[day] }.
async function applyStanding(year, month, productId, ruleFields) {
  const rule = Object.assign(
    { client_id: currentUser.id, product_id: productId, year: year, month: month, qty: 0, dows: [], active: true, override_days: [] },
    ruleFields, { updated_at: new Date().toISOString() }
  );
  await sb.upsert('standing_orders', [rule], 'client_id,product_id,year,month');
  appData.standingOrders = appData.standingOrders || {};
  appData.standingOrders[productId] = rule;

  const ctx = buildStandingCtx(year, month);
  const targets = computeStandingTargets(rule, ctx);
  const upsertRows = [], removeDays = [], ops = { upserts: [], removes: [] };
  targets.forEach(t => {
    const cur = _curQty(year, month, t.day, productId) | 0;
    if (t.qty > 0) {
      if (cur !== t.qty) {
        upsertRows.push({ client_id: currentUser.id, year: year, month: month, day: t.day, product_id: productId, quantity: t.qty });
        ops.upserts.push({ day: t.day, qty: t.qty });
      }
    } else if (cur > 0) {
      removeDays.push(t.day);
      ops.removes.push(t.day);
    }
  });

  if (upsertRows.length) {
    await sb.upsert('orders', upsertRows, 'client_id,year,month,day,product_id');
    upsertRows.forEach(r => {
      const k = getOrderKey(currentUser.id, year, month, r.day);
      if (!appData.orders[k]) appData.orders[k] = {};
      appData.orders[k][productId] = r.quantity;
    });
  }
  if (removeDays.length) {
    await sb.delete('orders', `client_id=eq.${currentUser.id}&year=eq.${year}&month=eq.${month}&product_id=eq.${productId}&day=in.(${removeDays.join(',')})`);
    removeDays.forEach(day => {
      const k = getOrderKey(currentUser.id, year, month, day);
      if (appData.orders[k]) { delete appData.orders[k][productId]; if (!Object.keys(appData.orders[k]).length) delete appData.orders[k]; }
    });
  }

  // saveOrder-rel azonos pending-kezelés: a ténylegesen MEGVÁLTOZTATOTT napokon,
  // ha confirmed/modified volt, vissza pending-re (a cancelled napokat a motor eleve kihagyta).
  const changedDays = [...new Set([...ops.upserts.map(u => u.day), ...ops.removes])];
  for (const day of changedDays) {
    const k = getOrderKey(currentUser.id, year, month, day);
    const st = (appData.orderStatus && appData.orderStatus[k]) || {};
    if (st.status === 'confirmed' || st.status === 'modified') {
      await sb.upsert('order_status', { client_id: currentUser.id, year: year, month: month, day: day, status: 'pending', admin_note: st.admin_note || null }, 'client_id,year,month,day');
      if (!appData.orderStatus) appData.orderStatus = {};
      appData.orderStatus[k] = { ...st, status: 'pending' };
    }
  }
  return ops;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeStandingTargets, materializeStandingOrder };
}
