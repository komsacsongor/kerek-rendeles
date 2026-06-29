/**
 * KEREK Unit Tesztek – kerek-constants.js
 */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../kerek-constants.js', 'utf8');
global.document = { getElementById: () => null };
const globalSrc = src.replace(/const /g, 'var ').replace(/let /g, 'var ');
eval(globalSrc);

describe('mk() – hónap kulcs', () => {
  test('alapeset', () => expect(mk(2026, 4)).toBe('2026-4'));
  test('januári hónap', () => expect(mk(2026, 0)).toBe('2026-0'));
  test('decemberi hónap', () => expect(mk(2025, 11)).toBe('2025-11'));
});

describe('ok() – rendelés kulcs', () => {
  test('alapeset', () => expect(ok('anna', 2026, 4, 15)).toBe('anna-2026-4-15'));
  test('más kliens', () => expect(ok('bela', 2026, 0, 1)).toBe('bela-2026-0-1'));
});

describe('getKey() – vevő hónap kulcs (fordított paraméter!)', () => {
  test('azonos kimenet mint mk()', () => expect(getKey(4, 2026)).toBe(mk(2026, 4)));
});

describe('getOrderKey() – vevő rendelés kulcs', () => {
  test('azonos ok()-val', () => expect(getOrderKey('anna', 2026, 4, 15)).toBe(ok('anna', 2026, 4, 15)));
});

describe('generateProductCode()', () => {
  test('Kenyér prefix', () => expect(generateProductCode('Kovász', 'Kenyér', 1)).toMatch(/^KEN-/));
  test('Bagett prefix', () => expect(generateProductCode('Kifli', 'Bagett / zsömle', 42)).toMatch(/^BAG-KIFL-/));
  test('Sütemény prefix', () => expect(generateProductCode('Croissant', 'Sütemény', 7)).toMatch(/^SUT-CROI-/));
  test('Leveles tészta prefix', () => expect(generateProductCode('Rétes', 'Leveles tészta', 3)).toMatch(/^LEV-/));
  test('Ismeretlen → EGY', () => expect(generateProductCode('Valami', 'Ismeretlen', 1)).toMatch(/^EGY-/));
  test('Ékezetek eltávolítva', () => {
    const code = generateProductCode('Árvíztűrő', 'Kenyér', 1);
    expect(code).toMatch(/^KEN-[A-Z]+-/);
    expect(code).not.toMatch(/[áéíóöőúüű]/i);
  });
  test('ID padolva 4 számjegyre', () => expect(generateProductCode('Teszt', 'Kenyér', 5)).toBe('KEN-TESZ-0005'));
  test('Nagy ID nem vágódik', () => expect(generateProductCode('Teszt', 'Kenyér', 12345)).toBe('KEN-TESZ-12345'));
  test('Két termék különböző kód', () => expect(generateProductCode('A', 'Kenyér', 1)).not.toBe(generateProductCode('B', 'Kenyér', 2)));
});

describe('APP_VERSION', () => {
  test('v2.x.x formátum', () => expect(APP_VERSION).toMatch(/^v2\.\d+\.\d+(-[a-z]+)? \(\d{4}-\d{2}-\d{2}\)$/));
});

describe('DEFAULT_BAKING_DAYS', () => {
  test('kedd és péntek', () => expect(DEFAULT_BAKING_DAYS).toEqual([2, 5]));
});

describe('PRODUCT_CAT_CODES', () => {
  test('Kenyér → KEN', () => expect(PRODUCT_CAT_CODES['Kenyér']).toBe('KEN'));
  test('Bagett / zsömle → BAG', () => expect(PRODUCT_CAT_CODES['Bagett / zsömle']).toBe('BAG'));
  test('Sütemény → SUT', () => expect(PRODUCT_CAT_CODES['Sütemény']).toBe('SUT'));
  test('Egyéb → EGY', () => expect(PRODUCT_CAT_CODES['Egyéb']).toBe('EGY'));
});
