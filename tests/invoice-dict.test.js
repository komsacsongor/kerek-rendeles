// v2.56.0: számla-operátor román/angol → magyar alapanyag-szótár
const { invDictLookup } = require('../js/receptura-invoice-dict.js');

describe('invDictLookup — vrac-magazin rendelés', () => {
  const cases = [
    ['Hrișcă decorticată – 10kg × 1', 'Hajdina'],
    ['Mei decorticat – 5kg × 1', 'Köles'],
    ['Orez pentru Sushi – 5kg × 1', 'Sushi rizs'],
    ['Orez brun, natur – 10kg × 1', 'Barna rizs'],
    ['Făină de năut – 5kg × 1', 'Csicseriborsóliszt'],
    ['Eritritol – 5kg × 1', 'Eritrit'],
    ['Fulgi de ovăz – 5kg × 1', 'Zabpehely'],
    ['Semințe de chia – 3kg × 1', 'Chia mag'],
    ['Stafide – 2.5kg × 1', 'Mazsola'],
    ['Fulgi de orz – 3kg × 1', 'Árpapehely'],
  ];
  test.each(cases)('%s → %s', (raw, hu) => expect(invDictLookup(raw)).toBe(hu));
});

describe('invDictLookup — a pontosabb kifejezés nyer', () => {
  test('rizsliszt ≠ rizs', () => expect(invDictLookup('Făină de orez 1kg')).toBe('Rizsliszt'));
  test('barna rizsliszt', () => expect(invDictLookup('Faina de orez brun bio')).toBe('Barna rizsliszt'));
  test('angol név', () => expect(invDictLookup('Tapioca starch 25 kg')).toBe('Tápióka keményítő'));
  test('szóhatár: a „mei” nem találat a „semințe”-ben', () => expect(invDictLookup('Semințe de dovleac')).toBe('Tökmag'));
  test('ismeretlen → null', () => expect(invDictLookup('Cutie carton 30x40')).toBeNull());
});
