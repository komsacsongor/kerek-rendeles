// ============================================================
// KEREK – Számla-operátor: román/angol → magyar alapanyag-szótár (v2.56.0)
// A párosítás NEM az AI szabad fordítására épül (abból lett „drazsir”, „miel”), hanem:
// tanult párosítás → EZ a szótár → AI-választás a saját alapanyag-listából → hasonló név.
// Formátum: [ [kifejezések ékezet nélkül, kisbetűvel], 'magyar alapanyagnév' ]
// A hosszabb (pontosabb) kifejezés nyer: „faina de orez” előbb, mint „orez”.
// Bővíthető: új sor a megfelelő csoportba.
// ============================================================
const INV_DICT = [
  // --- lisztek ---
  [['faina de orez brun', 'brown rice flour'], 'Barna rizsliszt'],
  [['faina de orez', 'faina orez', 'rice flour'], 'Rizsliszt'],
  [['faina de hrisca', 'buckwheat flour'], 'Hajdinaliszt'],
  [['faina de mei', 'millet flour'], 'Kölesliszt'],
  [['faina de naut', 'chickpea flour', 'gram flour'], 'Csicseriborsóliszt'],
  [['faina de ovaz', 'oat flour'], 'Zabliszt'],
  [['faina de migdale', 'almond flour'], 'Mandulaliszt'],
  [['faina de cocos', 'coconut flour'], 'Kókuszliszt'],
  [['faina de quinoa', 'quinoa flour'], 'Quinoaliszt'],
  [['faina de amarant', 'amaranth flour'], 'Amarántliszt'],
  [['faina de sorg', 'sorghum flour'], 'Cirokliszt'],
  [['faina de teff', 'teff flour'], 'Teffliszt'],
  [['faina de castane', 'chestnut flour'], 'Gesztenyeliszt'],
  [['faina de linte', 'lentil flour'], 'Lencseliszt'],
  [['faina de mazare', 'pea flour'], 'Borsóliszt'],
  [['faina de porumb', 'corn flour', 'maize flour'], 'Kukoricaliszt'],
  [['faina de in', 'flaxseed flour', 'flax flour'], 'Lenmagliszt'],
  [['faina de dovleac', 'pumpkin seed flour'], 'Tökmagliszt'],
  [['faina de floarea soarelui', 'sunflower flour'], 'Napraforgóliszt'],
  [['faina de cartofi', 'potato flour'], 'Burgonyaliszt'],
  [['faina de secara', 'rye flour'], 'Rozsliszt'],
  [['faina de spelta', 'spelt flour'], 'Tönkölyliszt'],
  [['faina de grau', 'faina alba', 'wheat flour'], 'Búzaliszt'],
  // --- keményítők, kötőanyagok ---
  [['amidon de tapioca', 'tapioca starch', 'tapioca'], 'Tápióka keményítő'],
  [['amidon de porumb', 'corn starch', 'cornstarch', 'maizena'], 'Kukoricakeményítő'],
  [['amidon de cartofi', 'fecula de cartofi', 'potato starch'], 'Burgonyakeményítő'],
  [['amidon de orez', 'rice starch'], 'Rizskeményítő'],
  [['tarate de psyllium', 'coji de psyllium', 'psyllium husk', 'psyllium'], 'Útifűmaghéj'],
  [['guma xantan', 'xantan', 'xanthan gum', 'xanthan'], 'Xantángumi'],
  [['guma guar', 'guar gum', 'guar'], 'Guargumi'],
  // --- gabonák, pelyhek, dara ---
  [['fulgi de ovaz', 'oat flakes', 'rolled oats', 'oats flakes'], 'Zabpehely'],
  [['fulgi de hrisca', 'buckwheat flakes'], 'Hajdinapehely'],
  [['fulgi de mei', 'millet flakes'], 'Kölespehely'],
  [['fulgi de orez', 'rice flakes'], 'Rizspehely'],
  [['fulgi de quinoa', 'quinoa flakes'], 'Quinoapehely'],
  [['fulgi de orz', 'barley flakes'], 'Árpapehely'],
  [['fulgi de porumb', 'corn flakes', 'cornflakes'], 'Kukoricapehely'],
  [['orez pentru sushi', 'orez sushi', 'sushi rice'], 'Sushi rizs'],
  [['orez brun', 'orez integral', 'brown rice'], 'Barna rizs'],
  [['orez', 'rice'], 'Rizs'],
  [['hrisca', 'buckwheat'], 'Hajdina'],
  [['mei', 'millet'], 'Köles'],
  [['quinoa'], 'Quinoa'],
  [['amarant', 'amaranth'], 'Amaránt'],
  [['sorg', 'sorghum'], 'Cirok'],
  [['malai', 'mamaliga', 'polenta', 'corn grits'], 'Kukoricadara'],
  [['arpacas', 'pearl barley'], 'Gyöngyárpa'],
  [['ovaz', 'oats'], 'Zab'],
  [['orz', 'barley'], 'Árpa'],
  [['gris', 'semolina'], 'Búzadara'],
  // --- hüvelyesek ---
  [['naut', 'chickpeas', 'chickpea'], 'Csicseriborsó'],
  [['linte rosie', 'red lentils'], 'Vörös lencse'],
  [['linte', 'lentils', 'lentil'], 'Lencse'],
  // --- magvak, olajos magvak ---
  [['seminte de chia', 'chia seeds', 'chia'], 'Chia mag'],
  [['seminte de in auriu', 'in auriu', 'golden flaxseed'], 'Arany lenmag'],
  [['seminte de in', 'flaxseed', 'flax seeds', 'linseed'], 'Lenmag'],
  [['seminte de floarea soarelui', 'sunflower seeds'], 'Napraforgómag'],
  [['seminte de dovleac', 'pumpkin seeds'], 'Tökmag'],
  [['seminte de canepa', 'hemp seeds'], 'Kendermag'],
  [['susan negru', 'black sesame'], 'Fekete szezámmag'],
  [['susan', 'sesame'], 'Szezámmag'],
  [['mac', 'poppy seeds'], 'Mák'],
  [['chimen', 'caraway'], 'Kömény'],
  [['migdale', 'almonds'], 'Mandula'],
  [['alune de padure', 'hazelnuts'], 'Mogyoró'],
  [['nuci', 'miez de nuca', 'walnuts'], 'Dió'],
  [['caju', 'cashew'], 'Kesudió'],
  [['fulgi de cocos', 'nuca de cocos', 'cocos razuit', 'desiccated coconut'], 'Kókuszreszelék'],
  // --- aszalt gyümölcs ---
  [['stafide', 'raisins'], 'Mazsola'],
  [['curmale', 'dates'], 'Datolya'],
  [['merisoare', 'cranberries'], 'Vörösáfonya'],
  [['caise uscate', 'dried apricots'], 'Aszalt sárgabarack'],
  [['prune uscate', 'prunes'], 'Aszalt szilva'],
  [['smochine', 'figs'], 'Füge'],
  // --- édesítők ---
  [['eritritol', 'erythritol'], 'Eritrit'],
  [['xilitol', 'xylitol'], 'Xilit'],
  [['zahar de cocos', 'coconut sugar'], 'Kókuszvirágcukor'],
  [['zahar brun', 'brown sugar'], 'Barna cukor'],
  [['zahar pudra', 'powdered sugar', 'icing sugar'], 'Porcukor'],
  [['zahar', 'sugar'], 'Cukor'],
  [['miere', 'honey'], 'Méz'],
  [['sirop de artar', 'maple syrup'], 'Juharszirup'],
  [['stevia'], 'Stevia'],
  // --- sütés, egyéb ---
  [['drojdie uscata', 'dry yeast'], 'Szárított élesztő'],
  [['drojdie', 'yeast'], 'Élesztő'],
  [['sare de mare', 'sea salt'], 'Tengeri só'],
  [['sare', 'salt'], 'Só'],
  [['bicarbonat de sodiu', 'bicarbonat', 'baking soda'], 'Szódabikarbóna'],
  [['praf de copt', 'baking powder'], 'Sütőpor'],
  [['otet de mere', 'apple cider vinegar'], 'Almaecet'],
  [['pudra de cacao', 'cacao pudra', 'cocoa powder', 'cacao'], 'Kakaópor'],
  [['scortisoara', 'cinnamon'], 'Fahéj'],
  [['vanilie', 'vanilla'], 'Vanília'],
  [['ulei de masline', 'olive oil'], 'Olívaolaj'],
  [['ulei de floarea soarelui', 'sunflower oil'], 'Napraforgóolaj'],
  [['ulei de cocos', 'coconut oil'], 'Kókuszolaj'],
  [['ulei', 'oil'], 'Olaj'],
  [['unt', 'butter'], 'Vaj'],
  [['oua', 'eggs'], 'Tojás'],
  [['lapte praf', 'milk powder'], 'Tejpor'],
  [['lapte', 'milk'], 'Tej'],
  [['apa minerala'], 'Ásványvíz'],
];

// Kifejezés → { hu, len } (leghosszabb előre); szóhatáron keres
const _INV_DICT_IDX = (() => {
  const out = [];
  INV_DICT.forEach(([keys, hu]) => keys.forEach(k => out.push({ k: ' ' + k + ' ', hu, len: k.length })));
  return out.sort((a, b) => b.len - a.len);
})();
function _invDictText(s) {
  return ' ' + (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
}
// a számla-tétel nevéből a magyar alapanyagnév (vagy null)
function invDictLookup(raw) {
  const t = _invDictText(raw);
  if (t.trim() === '') return null;
  const hit = _INV_DICT_IDX.find(e => t.includes(e.k));
  return hit ? hit.hu : null;
}
if (typeof window !== 'undefined') Object.assign(window, { INV_DICT, invDictLookup });
if (typeof module !== 'undefined') module.exports = { INV_DICT, invDictLookup };
