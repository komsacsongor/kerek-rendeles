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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeStandingTargets, materializeStandingOrder };
}
