# KEREK – Arculat (brand) összefoglaló

> Forrás: `KEREK_BRAND.pdf` (ebben a mappában). UI-munka előtt ezt olvasd; kétség esetén a PDF dönt.

## Színek

Teal család (elsődleges UI):

| Token (`kerek-styles.css`) | Hex | Használat |
|---|---|---|
| `--teal-dark` | `#064C48` | fejléc, belépő háttér, címek |
| — | `#096B68` | sötét teal (hover, árnyalat) |
| `--teal` | `#129990` | elsődleges gomb, aktív elem |
| `--teal-mid` | `#43AAA0` | másodlagos kiemelés |
| — | `#6EB7AC` | világos teal |
| `--teal-light` | `#A3D1C6` | háttér-minta, halvány elemek |

Arany család (kiemelés, akció):

| Token | Hex | Használat |
|---|---|---|
| `--gold-light` | `#EBCF9E` | halvány háttér |
| `--sand` | `#EABD6C` | |
| `--gold` | `#EFB036` | arany gomb, figyelemfelkeltés |
| — | `#C69042` | |
| `--gold-dark` | `#B78029` | arany szöveg, keret |
| — | `#A55213` | legsötétebb (ritkán) |

Kiegészítő: `--slate` `#395A63`. Fő párosok a brand bookban: **teal `#129990` + arany `#EFB036`**, illetve **sötétarany `#B78029` + slate `#395A63`**.

## Betűtípusok

- **Fraunces** (elsődleges, serif): címek, kiemelt számok. Google Fonts-ról töltve.
- **Kodchasan** (másodlagos): minden UI-szöveg, gomb, mező. Helyben: `fonts/`.

## Logó

- A logó **kép** (pöttyös virág + KEREK felirat) — soha ne írd ki szövegként.
- Változatok (`logos/`): `teal_vert`, `gold_vert`, `slate_vert`, `golddark_vert`, `duo_teal_gold_vert`, `duo_gold_slate_vert`, `black_vert`, `black_horiz`, `white_vert`, `white_horiz` (+ `pattern_terulo_black/white` = terülő minta).
- Az appban használt, kisebb méretű példányok: `img/logo_teal_vert.png`, `img/logo_white_horiz.png` stb.
- Színes háttéren a logó a brand-párosítás szerint: sötét teal / teal háttéren arany vagy világos teal logó; arany háttéren teal logó.

## Háttér-minták (arculati elemek)

1. **Védjegy minta** — háttérelem szöveg/fotó mögé; logó mögé NEM.
2. **A logó vonalaiból vett minta** — háttérelem; logó mögé is használható.
3. **A logó pontjai** — háttérelem (pl. belépő képernyő); logó mögé NEM.
4. **Terülő minta** — csak az eredeti színösszetételben (világosítani/sötétíteni szabad).

Közös szabály: a minta színét a mögötte lévő háttér határozza meg — a háttérnél **kicsit sötétebb vagy világosabb árnyalat**, hogy a szöveg olvasható maradjon. A minták termék-kategóriánként is feloszthatók.

## UI-konvenciók (a meglévő appból)

- Belépő: `--teal-dark` háttér + halvány pont-minta, fehér kártya 24px lekerekítés, Belépés/Regisztráció fül.
- Gombok: `.btn-primary` teal, `.btn-gold` arany + sötét teal szöveg, `.btn-ghost` keretes.
- Mezők: 12px lekerekítés, 1.5px `--border`, fókuszban `--teal`.
- Kártyák: fehér, `--border` keret, 14px lekerekítés, fejléc `--teal-pale`.
