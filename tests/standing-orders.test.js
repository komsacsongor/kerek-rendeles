/**
 * KEREK Unit Tesztek – Állandó rendelés (standing orders) motor
 * computeStandingTargets, materializeStandingOrder
 */

const { computeStandingTargets, materializeStandingOrder } = require('../js/vevo-standing.js');

// --- Segéd: ctx építő ---
// June 2026 (0-alapú hónap = 5). Sütési napok: 12,19,26 (péntek, getDay=5) + 15 (hétfő, getDay=1).
function makeCtx(opts = {}) {
  const dow = { 12: 5, 15: 1, 19: 5, 22: 1, 26: 5 }; // day -> getDay
  return {
    bakingDays: opts.bakingDays || [12, 15, 19, 26],
    dayOfWeek: (d) => dow[d],
    isPastOrLocked: (d) => (opts.past || []).indexOf(d) > -1,
    isCancelled: (d) => (opts.cancelled || []).indexOf(d) > -1,
  };
}
function rule(over = {}) {
  return Object.assign({ qty: 2, dows: [5], active: true, override_days: [] }, over);
}

describe('computeStandingTargets – alap szabály-kitöltés', () => {
  test('péntek-szabály kitölti a pénteki napokat a db-vel, a nem-pénteket 0-ra', () => {
    const t = computeStandingTargets(rule(), makeCtx());
    expect(t).toEqual([
      { day: 12, qty: 2 },
      { day: 15, qty: 0 }, // hétfő – nem fedi a szabály
      { day: 19, qty: 2 },
      { day: 26, qty: 2 },
    ]);
  });

  test('több nap a szabályban (péntek + hétfő) mindkettőt kitölti', () => {
    const t = computeStandingTargets(rule({ dows: [5, 1] }), makeCtx());
    expect(t).toEqual([
      { day: 12, qty: 2 },
      { day: 15, qty: 2 },
      { day: 19, qty: 2 },
      { day: 26, qty: 2 },
    ]);
  });

  test('a darabszám a szabályból jön', () => {
    const t = computeStandingTargets(rule({ qty: 5 }), makeCtx());
    expect(t.filter((x) => x.day === 19)[0].qty).toBe(5);
  });
});

describe('computeStandingTargets – kikapcsolt / üres szabály', () => {
  test('inaktív szabály minden birtokolt napot 0-ra állít (ürítés)', () => {
    const t = computeStandingTargets(rule({ active: false }), makeCtx());
    expect(t.every((x) => x.qty === 0)).toBe(true);
    expect(t.map((x) => x.day)).toEqual([12, 15, 19, 26]);
  });

  test('üres nap-lista (dows=[]) minden napot 0-ra', () => {
    const t = computeStandingTargets(rule({ dows: [] }), makeCtx());
    expect(t.every((x) => x.qty === 0)).toBe(true);
  });
});

describe('computeStandingTargets – érintetlen napok (kihagyás a célokból)', () => {
  test('múltbeli/lezárt nap NEM kerül a célok közé', () => {
    const t = computeStandingTargets(rule(), makeCtx({ past: [12] }));
    expect(t.map((x) => x.day)).not.toContain(12);
    expect(t.map((x) => x.day)).toEqual([15, 19, 26]);
  });

  test('kézzel zárolt (override) nap NEM kerül a célok közé', () => {
    const t = computeStandingTargets(rule({ override_days: [19] }), makeCtx());
    expect(t.map((x) => x.day)).not.toContain(19);
  });

  test('visszautasított (cancelled) nap NEM kerül a célok közé – "A" döntés', () => {
    const t = computeStandingTargets(rule(), makeCtx({ cancelled: [26] }));
    expect(t.map((x) => x.day)).not.toContain(26);
  });

  test('halmozott: past + override + cancelled mind kimarad', () => {
    const t = computeStandingTargets(
      rule({ override_days: [15] }),
      makeCtx({ past: [12], cancelled: [26] })
    );
    expect(t.map((x) => x.day)).toEqual([19]);
    expect(t[0]).toEqual({ day: 19, qty: 2 });
  });
});

describe('materializeStandingOrder – csak valós változásnál ír', () => {
  function makeIo(state) {
    const ops = { up: [], rm: [] };
    return {
      io: {
        currentQty: (d) => state[d] || 0,
        upsert: (d, q) => { ops.up.push([d, q]); state[d] = q; },
        remove: (d) => { ops.rm.push(d); delete state[d]; },
      },
      ops,
    };
  }

  test('üres állapotból feltölti a pénteki napokat (a múltbelit nem)', () => {
    const { io, ops } = makeIo({});
    const r = materializeStandingOrder(rule(), makeCtx({ past: [12] }), io);
    expect(ops.up).toEqual([[19, 2], [26, 2]]);
    expect(ops.rm).toEqual([]);
    expect(r.upserts).toEqual([{ day: 19, qty: 2 }, { day: 26, qty: 2 }]);
  });

  test('ha a meglévő érték már egyezik, nem ír újra (no-op)', () => {
    const { io, ops } = makeIo({ 19: 2, 26: 2 });
    materializeStandingOrder(rule(), makeCtx({ past: [12] }), io);
    expect(ops.up).toEqual([]);
    expect(ops.rm).toEqual([]);
  });

  test('kikapcsolt szabály törli a korábban feltöltött (nem-zárolt) napokat', () => {
    const { io, ops } = makeIo({ 19: 2, 26: 2 });
    materializeStandingOrder(rule({ active: false }), makeCtx({ past: [12] }), io);
    expect(ops.rm.sort()).toEqual([19, 26]);
    expect(ops.up).toEqual([]);
  });

  test('darabszám-emelés csak az érintett napokat frissíti', () => {
    const { io, ops } = makeIo({ 19: 2, 26: 2 });
    materializeStandingOrder(rule({ qty: 3 }), makeCtx({ past: [12] }), io);
    expect(ops.up).toEqual([[19, 3], [26, 3]]);
  });

  test('zárolt (override) napot sosem írja felül', () => {
    const { io, ops } = makeIo({ 19: 9 }); // a vevő kézzel 9-et állított, override
    materializeStandingOrder(rule({ qty: 3, override_days: [19] }), makeCtx({ past: [12] }), io);
    expect(ops.up).toEqual([[26, 3]]); // 19 érintetlen
    expect(ops.rm).toEqual([]);
  });
});
