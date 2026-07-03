# KEREK – Történeti referencia és részletes ROADMAP

> Ez egy **opcionális** olvasmány az AI számára. Csak akkor kell, ha:
> - Konkrét döntési indokra van szükség ("miért így csináltuk?")
> - Egy nehéz bug-pattern reprodukálásához kell referencia
> - Részletes feature-tervezés kell (M0-S6 backlog)
>
> Az aktív session-kontextus → `KEREK_SKILL.md`.

---

## 1. Verzió-történet milestones

A részletes commit-történet `git log` segítségével mindig elérhető. Itt csak a **döntésekre érdemes** milestone-okat sorolom.

| Verzió | Dátum | Mit hozott |
|---|---|---|
| **v1.x** | 2025 | Alapok: rendelési tábla, Supabase integráció |
| **v2.0-2.10** | 2025-2026 elejei | Receptúra modul: FIFO készlet, levain, gyártás, önköltség |
| **v2.11-2.20** | | Stabilitás: 14 audit hiba javítása, soft delete, rate limiting |
| **v2.21** | | Vevő önregisztráció: `[PENDING]`/`[DELETED]` prefix, email UNIQUE, 3 belépési mód |
| **v2.22** | | PWA + mobiloptimalizáció: manifest, SW, kategória tab-ok |
| **v2.30-2.34** | | Web Push VAPID, admin_secrets RLS, malom/feldolgozás v2 |
| **v2.35-2.36** | | ingredient_families, központi `kerek-styles.css`, anti-spread helper |
| **v2.38.0** ⭐ | 2026-05 | **KRITIKUS**: Supabase Realtime `postgres_changes` config — eddig SOSEM küldött DB-change eseményeket |
| **v2.39.0-2** | 2026-05-26..31 | Bevásárló lista v2, alapanyag UX (collapsible kategória, suppliers backfill) |
| **v2.40.0** | | Beszállítók CRUD (romániai számlázási mezők + benchmark) |
| **v2.41.0** ⭐ | 2026-06 | **INFRA**: Staging environment subpath-tal, dual-branch deploy, sync workflow, Edge Function deploy |
| **v2.41.x** | | Szerkeszthető vevő fejléc, üres recept ⚠️ warning, Adat-audit view |
| **v2.42.x** | 2026-06-11 | Mobil hamburger drawer + touch targets |
| **v2.43.x** | 2026-06-11 | 2 PWA app (vevő + admin), KEREK saját jelszó-tárolás, mobil UX finomítás |
| **v2.44.x** | 2026-06-11 | Vevő "Maradj bejelentkezve", sidebar pending-badge fix |
| **v2.45.x** | 2026-06-12 | Admin push (új rendelés/reg), adat-audit camelCase fix, tooltip tap-toggle, confirmSingleOrder vevő-push |
| **v2.46.0** ⭐ | 2026-06-12 | **Auto-zárás 18:00**: `auto-confirm-orders` EF + vevő-push, `auto-confirm-cron.yml` (`0 16 * * *` UTC) |
| **v2.47.x** | 2026-06-12 | **P1 sütési log**: per-recept rendelt vs sütött (`production_logs` order/extra/experimental), 📒 napló + per-rendelő checklist; recept-leírás dropdown az Üzemi nézetben |
| **v2.48.x** ⭐ | 2026-06-12 | **Modul-jelszó kezelő**: admin UI + `admin-set-password` EF + `admin-auth` modul-param, receptúra biztonságos login; admin jelszó-bugfix (settings→admin_secrets); edge-deploy auto-felismerés; P1 önellenőrzés fixek (PostgREST AND, helyi dátum) |
| **v2.49.x** | 2026-06-18 | **M0 natív mértékegység**: alapanyagonként `unit` (g/kg/ml/l/db), bázis-tárolás g/db, pontos ×1000 váltás; egység-választó modal, megjelenítés/bevételezés/ár-szerkesztő/CSV egységben; `\${}` backslash-bug fix a stock-ban |
| **v2.50.0** ⭐ | 2026-06-18 | **SEC Fázis 1 (suppliers pilot)**: `admin-data` EF (authentikált PostgREST-proxy, service_role, modul-jelszó + tábla/metódus whitelist) + `kData` kliens-helper; receptúra suppliers EF mögé; `suppliers` anon-lezárva; EF CORS `apikey` fix; CI: push-trigger eltávolítva + deploy-loop fail-fast |
| **v2.51.0** | 2026-06-18 | **Recept↔termék ár/törlés szinkron**: `products.price` az egyetlen igazság-forrás (saveRecipe beolvassa az ár-mezőt, modal a linkelt termék árát tölti, meglévő ár megőrződik, dup-check linkelést ajánl, törlés feloldja a product_id-t névből) — *staging-only, validálatlan* |
| **v2.52.0** | 2026-06-18 | **Másodlagos mértékegység**: alapanyagonként opcionális `alt_unit`/`alt_factor`; `recipeAmountToGrams` egység-tudatos aggregáció (db→g) — *staging-only, validálatlan* |
| **v2.53.x** ⭐ | 2026-06-22..23 | **PUSH RENDSZER TELJES JAVÍTÁS (prodon élesben)**: a push SOHA nem ment — két gyökérok: (1) `dynamic-service` nem-szabványos HKDF → újraírva RFC 8291 `aes128gcm` + RFC 8292 VAPID; (2) EF CORS `Allow-Headers` hiányos (`authorization`) → "Failed to fetch". + env-aware VAPID kulcs (prod=eredeti `BKnbS6hp` ép pár, staging=új `BAuR41Vy`, mert az eredeti privát visszanyerhetetlen) + env-routing (`PUSH_FN_URL`/`PUSH_ANON`/broadcast-lekérés `/staging/` detektálással) + admin „Teszt értesítés" gomb + logó badge/ikon (Asset_93x, a forrásbeli jobb-széli sáv-artefakt levágva) + SW auto-update (`reg.update()`+`controllerchange` reload). **Szelektív merge**: csak a push ment prodra (v2.51/v2.52 stagingen maradt). Mellékes bugfixek: PGRST102 (orders `o.qty`→`o.quantity` + uniform-key payload), visszautasítás-utáni újrarendelés (`cancelled`→`pending`), `checkout@v5` (Node 24) |

A 25+ régi bug javítva (v2.36-v2.39 időszak) — részletek `git log --oneline`-ban.

---

## 2. Kulcsdöntések és indoklásuk

### Vanilla JS keretrendszer nélkül
**Miért**: Nincs build step, nincs bundle, GitHub Pages elegendő. Egy kisüzemi pékség számára optimális egyensúly a komplexitás és karbantarthatóság között.

### `[PENDING]`/`[DELETED]` prefix az `active` boolean helyett
**Miért**: Supabase schema cache lassan frissül, `ALTER TABLE ADD COLUMN` nem mindig tükröződik azonnal a PostgREST-en. A prefix megkerüli ezt, és egyetlen oszlopon (`name`) átláthatóvá teszi a soft delete-et.

### FIFO önköltség átlagár helyett
**Miért**: A legrégebbi alapanyag árazása adja a legpontosabb valós önköltséget — egy pékségben az alapanyag-árak változnak az évszakkal, és az FIFO ezt visszatükrözi.

### 0-indexed hónap admin-ban, fordított paraméter sorrend vevőnél
**Miért**: Örökölt technikai adósság. Dokumentálva van, megváltoztatni nagy kockázattal jár az összes kulcs-generálás miatt (`mk()`, `getKey()`, `ok()`). A két konvenció DOKUMENTÁLVA marad inkább, NEM összevontuk.

### 2 különálló PWA (Vevő + Admin) — NEM 1 közös
**Miért**: A vevők NE lássák az admin felületet. A vevő-modul start_url `vevo.html`-en marad, a tulajdonos (Csongor) külön telepítheti az admin appot az `index.html`-ről. A `manifest.id` mezővel a Chrome megkülönbözteti őket (W3C spec).

**Kompromisszum**: ha csak az admin app van telepítve, a Chrome scope-konfliktus miatt a vevő-URL is az admin appban nyílik. Megoldás: telepítsd mindkét appot — akkor a manifest URL alapján a megfelelő aktiválódik.

### KEREK saját jelszó-tárolás (NEM Chrome credentials.store)
**Miért**: PWA standalone módban a Chrome / Samsung Pass / Google Password Manager nem ajánl mentést megbízhatóan. Plus: a `navigator.credentials.store()` data-breach figyelmeztetést kap gyenge jelszóra (pl. `admin`), és a "Close" gomb NEM ment.

**Megoldás**: `localStorage` + `btoa(jelszó)` saját storage. NEM titkosított, base64 csak álbiztonság. Saját tulajdonosi eszközön elfogadható kompromisszum.

### Staging-first workflow (v2.41.0+)
**Miért**: v2.42.0-ban a mobil-feature `git checkout staging` lépés kihagyásával egy `sidebar-overlay HTML-bug` élesbe került. A staging-first workflow ezt megakadályozta volna. Most KÖTELEZŐ szabály.

### Konverzációs fejlesztés Claude AI-val
**Miért**: Iteráció gyorsabb mint klasszikus fejlesztéssel. **De**: nagyobb fegyelmet igényel push előtti verifikációban (lásd Claude-specifikus tanulságok az aktív SKILL.md-ben).

### Gyártás-modul architektúra (v2.47+, tervezés)
**Receptúra = tervezés** (recept-mesterek, alapanyag/beszállító/készlet, teszt-sütés előkészítés). **Gyártás = végrehajtás** (napi munka, tabletre, csak végrehajt+rögzít).

A gyártás-nap egységes **„production run" 3 forrásból** — minden ami sül, ide fut be:
- **rendelés** — auto a jóváhagyott rendelésekből,
- **teszt** — a receptúrában előkészítve, betolva a megfelelő nap gyártásába,
- **extra** — a gyártásvezető ad-hoc +1-e (pl. kollégáknak), **indoklással naplózva** (így nem kontrollálatlan, hanem követett).

A **mise-en-place + levain-előkészítés a gyártás modulba** tartozik (végrehajtási artefaktum, nem recept-tervezés). A recept-leírás **dropdown** az Üzemi nézetben — új kolléga lássa a folyamatot, ha kell.

- **P1 (kész, staging):** sütési log — per-recept rendelt vs sütött (`production_logs`: order/extra/experimental), per-rendelő checklist (a **jövőbeli kiszállítás alapja**). NINCS DB-séma változás (meglévő mezők + a checklist a rendelésekből származik).
- **P2 (tervezett):** `gyartas.html` különálló tablet-app a mai sütőnap rendeléseivel, lépésenkénti végrehajtással, rögzítés-munka-közben; a meglévő `receptura-production.js`/`operational.js` logikát újrahasznosítja.

**Benchmark (Cybake ISB)** igazolta a víziót: kollégáknak „mit kell ma sütni" + lépés-checklist gyártási tételenként; zárt mesteradatok; a bizonyíték a munka melléktermékeként rögzül (minimal-click capture).

---

## 3. Anti-pattern megtörtént esetek (referencia)

### A) Schema-mismatch — `desc` vs `description` (Bug #1)
- Tünet: `PGRST204 column 'desc' not found`
- Ok: kliens-oldalon a `desc` rövidített név volt, DB-ben `description`
- Spread `{...obj}` az `sb.upsert`-ben az extra mezőt is elküldte
- Fix: `sb.updateFields(table, {description, ...}, where)` named field-ekkel

### B) CSS-regresszió — modal width / form-group
- Tünet: visszatérő layout-bug ugyanott (modal kilóg)
- Ok: új CSS-szabály felülír egy korábbi nested layout-ot, vagy inline style küzd a központi szabállyal
- Fix: `kerek-styles.css`-be központosítva, `> direct child` scope, `DO NOT CHANGE` komment a kényes szabályoknál, iOS safe-area-inset

### C) State-sync — Realtime sosem küldött eseményt (v2.38.0 felfedezés!)
- Tünet: admin változás nem látszik vevőben (stale adat)
- Ok: `phx_join` payload-ban hiányzott a `postgres_changes` config
- Fix: WS open event-ben explicit config küldés, `ALTER PUBLICATION supabase_realtime ADD TABLE` minden táblára
- **Ez volt a 2026-05 session legfontosabb felfedezése** — sok jövőbeli feature alapja

### C2) State-sync — `loadAllData` ReferenceError (Bug #11)
- Tünet: néma `ReferenceError` Realtime callback-ekben
- Ok: a callback `loadAllData()`-t hívott, de receptúra modulban nincs window scope-ban
- Fix: `reloadReceptData()` helper a callback-ekben

### C3) State-sync — `monthlyActive` vs `monthlyActiveProducts` (Bug #24)
- Tünet: hiányos termék-lista a vevő modulban
- Ok: `reloadVevoData` `appData.monthlyActive` névvel tárolta, a render `monthlyActiveProducts`-ot vár
- Fix: field-name konzisztencia loadAllData ↔ reload*Data között

### D) Init flow gap — pending-badge nem inicializál login után
- Tünet: a sárga badge csak akkor jelenik meg, ha a felhasználó rákattint a nav-itemekre
- Fix: post-login `initIndicators()` helper minden frissítendő UI elemmel

### E) Field-name / NaN inkonzisztencia — `ing.suppliers` object-array (v2.39.0-1)
- Tünet: undefined érték a UI-on
- Ok: a kód object-array-nek kezelte, de a tényleges formátum string-array volt
- Fix: KONVENCIÓ 13.2 — `Number(x) || 0`, `loadAllData` autoritatív field-mapping

### F) Workflow-megsértés — sidebar-overlay HTML-bug élesben (v2.42.0)
- Tünet: a mobil hamburger menü nem nyílott rendesen
- Ok: a `git checkout staging` lépés kihagyásával közvetlen main-be került
- Fix: STAGING-FIRST szabály bevezetése

### Regex check definíció ↔ hívás összemosás (v2.43.12-13)
- Tünet: 4-körös regex-bug — a `kerekSaveRememberedPassword(pw)` HÍVÁST eltávolította a kód, de a check szerint "már létezik"
- Ok: a check a `'kerekSaveRememberedPassword(pw)' in code` lookup-t használta, ami a függvény-definícióra is illeszkedik (`function kerekSaveRememberedPassword(pw) {`)
- Fix: ellenőrzéskor előbb távolítsd el a függvény-definíciókat regex-szel, csak akkor számold a hívásokat

### PWA scope `./vevo` Chrome strict path-szegmens INVALID (v2.44.2-3)
- Tünet: a vevő manifest "Telepítés" gomb eltűnt
- Ok: `scope: ./vevo` → `/kerek-rendeles/vevo` partial filename, NEM directory-szegmens. Chrome strict spec szerint a `start_url: ./vevo.html` NEM esik a scope alá path-szegmens szerint
- Fix: `scope: ./` visszaállítás, a scope-konfliktust NEM scope-szűkítéssel kezeljük, hanem mindkét app telepítésével

### Badge default-status pattern (v2.44.4)
- Tünet: a sidebar `orders-badge` 0-t mutatott, hiába volt új rendelés
- Ok: `updatePendingBadge` csak az `D.orderStatus`-ban LÉTEZŐ rekordokat iterálta. Az új rendelés default-pending (nincs explicit rekord)
- Fix: iteráld a `D.orders`-t, és az `orderStatus`-t mint felülírást használd

### Edge Function deploy hardkódolt lista (v2.48.0-1)
- Tünet: az új `admin-set-password` hívása némán elhalt (nincs toast), a jelszó-módosítás nem hatott
- Ok: a `deploy-edge-functions.yml` HARDKÓDOLT listával deployolt (`admin-auth auto-confirm-orders dynamic-service`) → az új függvény ki sem került → 404 → a fetch CORS-hibaként dőlt el
- Fix: auto-felismerés `for dir in supabase/functions/*/`. Új EF-nél MINDIG ellenőrizd, hogy deployol-e.

### Jelszó write/read forrás-eltérés (v2.48.0-1)
- Tünet: az admin jelszó-módosítás SOSEM hatott
- Ok: a `changePassword` a `settings` táblába írt (`setSetting('admin_password')`), de az `admin-auth` az `admin_secrets`-ből olvas
- Fix: minden jelszó-művelet az `admin_secrets`-en át (write: `admin-set-password` EF, read/validate: `admin-auth`). Tanulság: írás és olvasás ugyanabból a forrásból.

### PostgREST compound szűrő + UTC dátum (v2.48.2, P1 önellenőrzés)
- Tünet: a per-rendelő checklist hibázott / minden rendelést hozott; a sütési log éjfél környékén téves napra esett
- Ok: `and(year.eq.X,...)` rossz szintaxis (helyes: implicit AND `year=eq.X&month=eq.Y`); `toISOString().slice(0,10)` UTC dátumot ad
- Fix: implicit AND szűrő; `_prodLocalDate()` helyi dátum a `production_logs.date`-hez (a napló-szűrő és a beszúrás formátuma egyezzen)

### Chrome data breach blokk a `credentials.store()`-on (v2.43.10-12)
- Tünet: Chrome figyelmeztetés "The password you just used was found in a data breach", Close gomb NEM ment
- Ok: a `admin` jelszó Have I Been Pwned-ban szerepel, Chrome ezért megtagadja a mentést
- Fix: `navigator.credentials.store()` hívás eltávolítása, KEREK saját localStorage marad

### EF CORS Allow-Headers ≠ kliens-fejlécek → "Failed to fetch" (v2.50.0)
- Tünet: a `kData`→`admin-data` hívás "Failed to fetch", a lista csendben üres (try/catch elnyeli)
- Ok: a `kData` `apikey` fejlécet is küld (a `sb`-t tükrözve), de az EF CORS `Allow-Headers`-e csak `content-type, authorization` volt → a böngésző **preflight (OPTIONS)** elbukott
- Fix: minden kliens-fejléc legyen az `Allow-Headers`-ben (`+ apikey`). Tanulság: új EF-nél a CORS-fejlécek fedjék a tényleges kliens-fejléceket

### Deploy-loop maszkolja a hibát (v2.50.0)
- Tünet: EF-deploy job "success", pedig egy függvény deploy elbukott (e-mail "exit code 1")
- Ok: `for ... do supabase functions deploy ...; done` — a step exit-kódja az UTOLSÓ parancsé, így a loop közepi hiba elveszett
- Fix: fail-fast — hibás függvényeket gyűjteni és a végén `exit 1`. (Node 20→24 forcing csak warning, NEM hibaok — a sikeres futásokon is ott van.)

### Mező betöltve, de mentéskor nem visszaolvasva (v2.51.0, recept ár)
- Tünet: a recept ár-mező módosítása nem hatott, mentés `suggestedPrice`-szal írta felül a `products.price`-t
- Ok: `saveRecipe` a `data`-ba NEM olvasta be az `r-product-price`-t → `data.productPrice` undefined → `|| suggestedPrice` mindig a javasoltat vette
- Fix: mező visszaolvasása; ár csak megadáskor íródik, üresnél meglévő ár megőrződik. Tanulság: ha egy mezőt betöltünk, ellenőrizni kell, hogy mentéskor vissza is olvasódik-e

---

## 4. DB takarítási történet

- **2026-06-01**: `ingredient_processing` DROP (deprecated v2.34.0 előtti rendszer, 0 kódhivatkozás)
- **2026-06-01**: `invitations` DROP (deprecated feature — "regisztráció token nélkül működik")
- `[DELETED]` prefix-szel megjelölt clients: tartjuk audit-céllal

### Realtime publikációban
`messages, orders, order_status, products, monthly_active_products, baking_calendar, recipes, recipe_ingredients, ingredients, ingredient_batches, processing_batches`

Új tábla hozzáadásánál mindig: `ALTER PUBLICATION supabase_realtime ADD TABLE <table>;`

### Üres, de létező táblák (kód várja)
```
ingredient_families:        (v2.35.0) id, name, common_unit, description
ingredient_milling_profile: (v2.34.0) id, ingredient_id, yield_ratio_typical, processing_loss_pct
processing_batches:         (v2.34.0) operation_type, recipe_id, processing_date, status
processing_inputs:          (v2.34.0) batch_id, ingredient_id, qty_g, source_batch_id
processing_outputs:         (v2.34.0) batch_id, ingredient_id, qty_g, target_batch_id
stock_corrections:          (ritka use case)
```
Ezek **léteznek de üresek** — a kód képes velük dolgozni, NE töröld őket.

---

## 5. Részletes ROADMAP

Prioritás: **M0/M1** (must-have) → **S2-S6** (új session) → **B1-B6** (backlog) → **L1-L8** (long-term)

### 🔴 M0 — Mértékegység támogatás (SÜRGŐS)

**Probléma**: minden alapanyag g-ban tárolva (`qty_remaining_g`, `min_stock_g`). Valóságban: liszt kg, tej L, tojás db, élesztő csomag. **Felhasználói panasz**: "A bevételezéskor megadott mennyiséget kell hoznia a végén."

**M0.1 — DB séma** (felhasználó futtatja SQL Editorban):
```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='ingredients' AND column_name='unit') THEN
    ALTER TABLE ingredients ADD COLUMN unit TEXT DEFAULT 'g';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='ingredients' AND column_name='unit_to_g_ratio') THEN
    ALTER TABLE ingredients ADD COLUMN unit_to_g_ratio NUMERIC DEFAULT 1;
  END IF;
END $$;
```
Megengedett unit: `g`, `kg`, `L`, `ml`, `db`, `csomag`. `unit_to_g_ratio`: hány gramm 1 unit (kg → 1000, tojás → 60g, stb.).

**M0.2 — UI**:
- Alapanyag modal: unit dropdown + ha `db`/`csomag`, "1 egység = X g" mező
- Bevételezés modal: mennyiség + unit-lock
- Bevásárló lista: ajánlott mennyiség az adott unit-ban (5 kg, NEM 5000 g)
- Stock kijelzés: szintén unit-ban

**M0.3 — Belső**: `qty_remaining_g` MARAD g-ban (recept-kompatibilitás). Bevétel: `qty_g = input_qty * unit_to_g_ratio`. Recipe ingredients: g-ban.

**M0.4 — fmtQty(grams, unit, ratio)** új signature. Clipboard: "Liszt: 25 kg", "Tojás: 30 db".

**M0.5 — Backward compat**: meglévő 37 alapanyag default `unit='g'` marad.

**Becsült méret**: ~400 sor új JS + DB migration + UI módosítás — egy nagy session vagy két kisebb.

### 🟡 M1 — Bevásárló lista folytatás

- **M1.1** Persistent shopping overrides — `shopping_overrides` tábla, page reload után megmaradnak, "💾 Mentés" gomb
- **M1.2** Beszállító-kiosztás wizard — gyors beállítás a 22 orphan alapanyaghoz egy modal-on
- **M1.3** History-alapú min/max gomb shopping view-ban (meglévő `calcAutoMinMax()`)
- **M1.4** Akció/promóció — `ingredient_promotions` tábla, "+20% boost" jelölés
- **M1.5** Multi-format export — CSV, PDF, WhatsApp deep-link, mailto

### 🟢 S2 — Bevásárló lista v3 (EOQ + MOQ)

- **EOQ**: `EOQ = sqrt(2 * D * S / H)` képlet
- **MOQ** beszállítónként
- **Multi-supplier**: új tábla `ingredient_supplier (priority, moq, lead_days, price_per_unit, last_purchase_date)`
- Beszerzési költség-kalkulátor (lej/kg rangsorolás)

### 🟢 S4 — Malom fermentáció state machine

- Folyamat: `pending` → `in_progress` → `completed` → `dried`
- Dashboard widget: "Folyamatban lévő fermentációk"
- Auto-learning yield refinement
- Recipe-specific yield: +66% nyersanyag bevásárló listán ha yield 60%

### 🟢 S5-S6 — Kísérleti sütés v2 (verziókezelés)

- `recipes.parent_recipe_id`, `recipes.status` (draft|experimental|active|archived)
- `recipe_feedback` tábla (sütésenkénti értékelés 1-5)
- Side-by-side recept diff
- Lineage map (fa-szerkezet)
- Promote workflow: experimental → active csak ≥3 sütés + ≥4 csillag átlag

### 🟢 B1-B6 — Backlog

- **B1** Recept szezonalitás (`active_months INTEGER[]`)
- **B2** Recept trendelés dashboard
- **B3** Recept önköltség-trend figyelmeztetés (>10% növekedés → admin push)
- **B4** Reverse lookup "Mire kell ez az alapanyag?"
- **B5** Beszállító teljesítmény tracking
- **B6** Vevő önkiszolgáló profil — profil-szerkesztés, jelszó-cserénél email-megerősítés

### 🟢 Long-term (L)

- **L6** Playwright e2e tesztek
- **L7** i18n (Magyar + Román fordítás)
- **L8** Accessibility (WCAG 2.1 AA)

### Egyéb tervezett

| Feladat | Prioritás |
|---|---|
| U4 Fizetési állapot tracking | Közepes |
| U3 Napi kapacitás limit | Közepes |
| DB reset demo-vevők (élesítés előtt) | ⏳ Felhasználói |
| P2 különálló gyártás app (`gyartas.html`, tablet) — P1 után | 🟡 |
| Kiszállítás a sütési logból | 🟢 Jövő |
| Valódi e-mail értesítés (reg. kód) | Középtáv |

**✅ Kész (korábban roadmapen):** Hibrid auto-confirm cron 18:00 (v2.46) · Admin+vevő Web Push (v2.45-46) · SC3 admin.html→12 modul (M7) · Termék soft-delete (v2.36/38) · P1 sütési log (v2.47) · Modul-jelszó kezelő (v2.48)

### ✅ Recept↔termék szinkron — JAVÍTVA v2.51.0 (ellenőrzés alatt)
Gyökérok volt: a modal a `recipes.product_price`-t kezelte, az admin a `products.price`-t; ráadásul `saveRecipe` nem is olvasta be az ár-mezőt → minden mentés `suggestedPrice`-szal írta felül. Megoldás: **`products.price` az egyetlen igazság-forrás** — (1) saveRecipe beolvassa az ár-mezőt; (2) modal a linkelt termék árát tölti (névfeloldás fallback); (3) ár csak megadáskor íródik, meglévő termék ára megőrződik; (4) dup-check linkelést ajánl blokkolás helyett; (5) törlés feloldja a `product_id`-t névből, ha hiányzik. + egyszeri migrációs SQL: legacy receptek `product_id` linkelése névegyezésből.

### 🔒 Biztonsági lockdown (SEC) — folyamatban
- **Fázis 1 (suppliers pilot) — kész (prod ellenőrzés alatt):** `admin-data` EF (authentikált PostgREST-proxy, service_role, modul-jelszó + tábla/metódus whitelist), a receptúra suppliers-hívásai EF-re terelve, `suppliers` anon-lezárva (RLS). Minta a többi admin/receptúra-only táblához.
- **Hátra:** Fázis 1 kiterjesztése (recipes/IP, ingredients, gyártás stb. EF mögé) → Fázis 2 vevő-PII (`clients`/`orders`/`messages`) `client-data` EF-fel → Fázis 3 katalógus. Részletek: `SECURITY_AUDIT.md`.

### ⏳ Ellenőrzésre vár (felhasználói teszt + SQL)
- **SEC Fázis 1 PROD:** beszállító felvétele (EF-úton), majd lezáró SQL a prod Supabase-en (`ALTER TABLE suppliers ENABLE RLS` + `REVOKE anon`), Advisor ERROR eltűnés.
- **v2.51.0 recept-szinkron STAGING:** migrációs SQL futtatása + a 6 pontos teszt-lista; utána prodra (merge + Pages + migráció prodon).
- **v2.52.0 egység 2a STAGING:** `ALTER TABLE ingredients ADD alt_unit/alt_factor` + teszt (Tojás L db+ml/70, recept tömeg/nedvesség/költség). v2.51-gyel együtt mehet prodra.
- **Node 20→24 deprecation:** `actions/checkout@v4`, `supabase/setup-cli@v1` action-verziók bumpja (warning, nem sürgős; csak deploy-teszttel együtt).

---

## 6. PWA + Mobil session részletes tanulságai (v2.42-2.44)

### Logo render fix
A `logo_teal_vert.png` (2017x2791) és `logo_white_horiz.png` (4864x1886) CSS-rendereléskor az alsó pixel-ek aliasing miatt levágódhatnak.

```css
display:block; margin:0 auto; padding-bottom:4px
```
Plus height-emelés: 80→84px (admin/receptura), 72→76px (vevő), 100→104px (index).

### Deploy concurrency (v2.45 óta JAVÍTVA)
Korábban a staging branch push **failure**-t adott a védett Pages environment-ben. A `deploy.yml` javítva: `branches:[main]` + `if: github.ref=='refs/heads/main' || workflow_dispatch` → a staging push már nem fail-el. A `/staging/` tartalom frissítéséhez viszont továbbra is dispatch kell staging push UTÁN:
```bash
curl -X POST -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/komsacsongor/kerek-rendeles/actions/workflows/deploy.yml/dispatches" \
  -d '{"ref":"main"}'
```

A workflow_dispatch a main-en fut, DE az `actions/checkout@v4 ref:staging` a staging tartalmat is felteszi `/staging/` alá. **Tehát a staging URL frissül, csak közvetett módon.**

### Baking-list 🔴 Hiány vs ⚠️ — különálló helyzetek

A felhasználói tapasztalat alapján zavarkeltő:

| Jelzés | Forrás | Helyzet |
|---|---|---|
| 🔴 **Hiány** piros | `stockBadge` (admin-baking.js:68) | Van recept, de a raktárban kevesebb alapanyag van mint kell |
| ⚠️ narancs háromszög | `!hasIngredientRecipe(p.id)` (admin-baking.js:157, 326, 345) | NINCS recept feltöltve → nem lehet kiszámolni az igényt |

A kettő **EGYÜTT is megjelenhet** ha a recept létezik de üres.

**Jövőbeli feladat**: tooltip-magyarázat az ⚠️-ra, hogy a felhasználó tudja a különbséget.

### Vevő login UX: 3-mód recovery beépítve

A vevő login mező **3 értéket** fogad el (Supabase lookup a doLogin-ban):
1. Belépési kód (`KER-XXXX-XXXX`)
2. Email cím
3. Teljes név

A v2.44.1-ben hozzáadtunk egy `<details>` toggle-t: "🔑 Elfelejtetted a kódot?" — kinyitva részletes magyarázat. **NEM kell külön email-küldő recovery flow** (Edge Function + Resend), mert a 3 alternatíva már önmagában recovery.

A v2.44.2 hint-lookup feature (email + telefon → kitakart adatok) **felesleges volt** — visszavontuk v2.44.3-ban. Indok: ha a vevő tudja az email-jét, akkor azzal közvetlenül beléphet.

---

## 7. Session-specifikus csapdák (tanulságok más AI-knak)

### v2.39.2 session-compactation csapda
Új session-induláskor nem ellenőriztem a git history-t, és tervezetet írtam egy már megcsinált feature-re (alapanyag UX javítások). A kód már létezett, csak a deploy hiányzott. **Megelőzés**: első parancs `git log --oneline | head -20`, plus `grep -rn` a remélt új function-névre.

### v2.43.x 4-körös regex-bug
A `navigator.credentials.store` blokk eltávolításakor a regex pattern túl szigorú volt: véletlenül törölte a `kerekSaveRememberedPassword(pw)` hívást is. A check szerint "már létezik" — mert a függvény-definíció szövege azonos. **Megelőzés**: a check előtt távolítsd el a definíciókat regex-szel.

### v2.42.0 STAGING-FIRST megsértés
A mobil-feature kódolásánál a `git checkout staging` lépést kihagytam, ami `sidebar-overlay HTML-bug`-ot élesbe juttatott. **Megelőzés**: ELSŐ KÖTELEZŐ szabály mostantól `git checkout staging` minden new feature előtt.

### v2.45.0 Admin push — fenntartott client_id
A `push_subscriptions.client_id` NEM FK a `clients`-re → fenntartott ID (`'ADMIN'`) használható az admin-feliratkozáshoz, séma-változás nélkül. Trigger **vevő-oldalról** (sikeres `saveOrder` / regisztráció) a meglévő push-pipeline-on (60s throttle, hogy ne spammeljen). A broadcast-'all' nem éri el (az a `clients` táblából származtat). Az `sw.js` a `notification.data.type` alapján routol (`new_order`/`new_client` → admin.html).

### v2.46.0 Cron UTC/DST csapda
A GitHub Actions cron CSAK UTC-ben jár. Románia UTC+2/+3 → a helyi 18:00 határidő = 16:00 (téli) / 15:00 (nyári) UTC. A **`0 16 * * *`** (16:00 UTC) MINDIG a helyi 18:00 UTÁN fut, év közben végig. A függvény **idempotens** (csak a `deadline <= now` rendeléseket zárja), ezért a pontos óra kevésbé kritikus.

### deploy.yml — github-pages environment protection (v2.45)
A staging branch push **failure**-t adott (hibás e-mail), mert a `github-pages` environment védelmi szabálya csak `main`-ről enged deploy-t — a staging push mégis elindította a workflow-t → elutasítás. **Fix**: staging eltávolítása a push-triggerből (`branches:[ main ]`) + `if: github.ref=='refs/heads/main' || workflow_dispatch` guard. A `/staging/` tartalom továbbra is a main-en futó `workflow_dispatch`-csel frissül.

### v2.44.2 scope-szűkítés tévedés
Próbáltam `scope: ./vevo`-ra szűkíteni a vevő manifest-et — a Chrome strict spec-validáció miatt INVALID lett. **Tanulság**: scope-szűkítés CSAK directory-szegmensre (slash-szel végződő) működik, részfájl-prefix NEM elég.

---

## 8. Brand assets referencia

```
Font elsődleges:   Fraunces (fejlécek, serif, italic)
Font másodlagos:   Kodchasan (UI elemek)
Teal dark:         #064C48  (--teal-dark)
Gold:              #EFB036  (--gold)
Teal:              #129990  (--teal)
Logo:              pöttyös mintázat + KEREK felirat (egyben PNG, NE írd ki külön szövegként!)
PWA Vevő ikon:     icon-192.png / icon-512.png (teal pöttyök)
PWA Admin ikon:    icon-admin-192.png / icon-admin-512.png (gold pöttyök)
```

---

## 📎 Frissítés

Ez a fájl akkor frissítendő, ha:
- Új **általánosítható minta** (pattern) merül fel — pl. új badge-számolási logika, új PWA-architektúra
- Új **decision rationale** ami nem trivializálható egy mondatba
- Új **anti-pattern megtörtént esete** ami megismétlődhet más session-ben

**NEM** frissítendő, ha:
- Csak egy konkrét feature implementáció
- Csak egy egyszeri bug-fix narratíva
- A git commit message már elég részletes

A versenytárs-források:
- **`KEREK_SKILL.md`**: kötelező olvasmány minden session-induláskor
- **`KEREK_HISTORY.md`** (ez a fájl): opcionális, csak szükség esetén
- `git log --oneline`: a teljes, autoritatív történet
