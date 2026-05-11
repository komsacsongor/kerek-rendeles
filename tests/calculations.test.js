/**
 * KEREK Unit Tesztek – Számítási függvények
 * calcRawWeight, calcLevain, calcRefill, scaleIngredient
 */

// Mock R.settings
global.R = {
  settings: {
    bakeLoss: 16,
    levain: { starter: 33, water: 30 },
    refill: { flour: 52, water: 48 },
  }
};

// Csak a számítási függvényeket töltjük be
function calcRawWeight(recipe, pieces) {
  const unitWeight = recipe.unitWeight || recipe.basePortion;
  const totalBaked = pieces * unitWeight;
  return Math.round(totalBaked / (1 - (recipe.bakeLoss ?? R.settings.bakeLoss ?? 16) / 100));
}

function calcLevain(levainAmount) {
  const s = R.settings.levain;
  const starter = Math.round(levainAmount * s.starter / 100);
  const water = Math.round(levainAmount * s.water / 100);
  const flour = levainAmount - starter - water;
  return { starter, water, flour, total: starter + water + flour };
}

function calcRefill(starterTaken) {
  const s = R.settings.refill;
  return {
    flour: Math.round(starterTaken * s.flour / 100),
    water: Math.round(starterTaken * s.water / 100),
  };
}

function scaleIngredient(baseAmount, basePortion, targetRaw) {
  return Math.round(baseAmount * targetRaw / basePortion * 10) / 10;
}

// ===== CALC RAW WEIGHT =====
describe('calcRawWeight()', () => {
  const recipe = { unitWeight: 1000, basePortion: 1000, bakeLoss: 16 };

  test('1 db 1000g, 16% veszteség → 1190g nyers', () => {
    expect(calcRawWeight(recipe, 1)).toBe(1190);
  });
  test('3 db 1000g → 3571g nyers', () => {
    expect(calcRawWeight(recipe, 3)).toBe(3571);
  });
  test('0 db → 0g', () => {
    expect(calcRawWeight(recipe, 0)).toBe(0);
  });
  test('500g egység, 2 db → 1190g', () => {
    expect(calcRawWeight({ unitWeight: 500, basePortion: 500, bakeLoss: 16 }, 2)).toBe(1190);
  });
  test('basePortion fallback ha nincs unitWeight', () => {
    expect(calcRawWeight({ basePortion: 1000, bakeLoss: 16 }, 1)).toBe(1190);
  });
  test('0% veszteség → nyers = sült', () => {
    expect(calcRawWeight({ unitWeight: 1000, bakeLoss: 0 }, 1)).toBe(1000);
  });
});

// ===== CALC LEVAIN =====
describe('calcLevain()', () => {
  test('100g levain → 33g kovász, 30g víz, 37g liszt', () => {
    const r = calcLevain(100);
    expect(r.starter).toBe(33);
    expect(r.water).toBe(30);
    expect(r.flour).toBe(37);
    expect(r.total).toBe(100);
  });
  test('300g levain → helyes arányok', () => {
    const r = calcLevain(300);
    expect(r.starter + r.water + r.flour).toBe(r.total);
  });
  test('total mindig egyenlő a részek összegével', () => {
    [50, 100, 250, 357, 500, 1000].forEach(amount => {
      const r = calcLevain(amount);
      expect(r.starter + r.water + r.flour).toBe(r.total);
    });
  });
  test('minden rész pozitív', () => {
    const r = calcLevain(100);
    expect(r.starter).toBeGreaterThan(0);
    expect(r.water).toBeGreaterThan(0);
    expect(r.flour).toBeGreaterThan(0);
  });
});

// ===== CALC REFILL =====
describe('calcRefill()', () => {
  test('100g elvétel → 52g liszt, 48g víz', () => {
    const r = calcRefill(100);
    expect(r.flour).toBe(52);
    expect(r.water).toBe(48);
  });
  test('visszatöltés összege egyenlő az elvétellel', () => {
    expect(calcRefill(200).flour + calcRefill(200).water).toBe(200);
  });
});

// ===== SCALE INGREDIENT =====
describe('scaleIngredient()', () => {
  test('arányos skálázás', () => {
    expect(scaleIngredient(270, 1000, 3210)).toBe(866.7);
  });
  test('1:1 → változatlan', () => {
    expect(scaleIngredient(100, 1000, 1000)).toBe(100);
  });
  test('dupla adag', () => {
    expect(scaleIngredient(100, 1000, 2000)).toBe(200);
  });
  test('0 alap → 0', () => {
    expect(scaleIngredient(0, 1000, 2000)).toBe(0);
  });
});
