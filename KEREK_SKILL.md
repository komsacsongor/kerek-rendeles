# KEREK Pékség — Workflow Skill + Bug Log + Roadmap (v2.39.0 — 2026-05-31)

> Ez **az egyetlen** projekt-dokumentum. Tartalmazza: működési konvenciók, anti-regresszió szabályok, feature kompletteségi mátrix, bug history gyökér-ok-elemzésekkel, részletes fejlesztési roadmap, és minden eddigi tanulság a sessionekből.
>
> Új session elején **mindig olvasd el a teljes fájlt** — sok visszatérő hiba és tanulság van benne.

---

## 0. PROJEKT ÁTTEKINTÉS

**Repo**: `github.com/komsacsongor/kerek-rendeles` (main branch, auto-deploy GitHub Pages)
**Live**: https://komsacsongor.github.io/kerek-rendeles/
**Supabase**: `lfaxeihrmiylggahougl.supabase.co`
**3 modul**: `admin.html`, `vevo.html`, `receptura.html`

### Belépés
- **Admin/Receptúra**: jelszó `admin` (alapértelmezett, Edge function ellenőrzi)
- **Vevő demo**: `kovacs-anna` (kód-belépés)
- **VAPID public key**: `BKnbS6hp1HTdh5BcNOvVTtBdmYWNj48F0jSG6NgQ1vVkboNvsATvbn2uoSP0pFpDTIQlMQ6wa4nI9j8v1jo-7SM`

### Aktuális verzió: **v2.39.0** (2026-05-31)

---

## 1. UTOLSÓ SESSIONEK ÖSSZEGZÉSE

### v2.36.0 — Audit batch (13 bug)
sb.updateFields anti-spread helper, központi kerek-styles.css (.modal/.form-group/.sticky), tooltip rendszer, favicon, sticky safe-area-inset, alapanyag kategóriák settings+usage union, M7 nav lookup regresszió fix (pendingBadge), bug log létrehozva.

### v2.37.0 — Realtime sync (5 fix)
reloadVevoData/reloadReceptData helper-ek, sb.subscribe unsub return, updatePendingBadge auto-call.

### v2.38.0 — KRITIKUS: Supabase Realtime postgres_changes ⭐
**A KEREK Realtime SOSEM küldött DB-change eseményeket** mert a `phx_join` payload csak `broadcast` és `presence` config-ot küldött. A Supabase válasza: `postgres_changes: []` (üres tömb). Tehát minden korábbi "Realtime működik" csak a 30s polling 1 perc késleltetéssel kézbesítette. Javítva: explicit `postgres_changes: [{event:'*', schema:'public', table}]` config + új event-formátum kezelés.

### v2.38.1-2.38.6 — Followup fixek
saveProduct marketingDesc undefined, archiválás visszakerül (D.products vs D.productsArchived split), Méret/Súly mező (97px input + 70px select), receptura sidebar link, push UX (requireInteraction:true), reloadVevoData NaN guard (rossz mezőnevek), updateHeroTotal NaN fallback.

### v2.39.0 — Bevásárló lista v2 (Session 1) ✨
Új feature: beszállítónkénti + általános bevásárló lista. 3-szintű sürgősség (🔴/🟡/🟢), manuális override, clipboard másolás, "egy listában" + "beszállítónként" nézet váltás. Új JS modul: `js/receptura-shopping.js` (~270 sor). Új sidebar nav: 🛒 Bevásárló lista. Új view: `#view-shopping`.

**Élesben verifikálva**: admin ár 32→33→41→45 lej → vevő app 4mp alatt friss. Admin új termék "Realtime Teszt v2384" → receptúra 7 recept (volt 6) 4mp alatt. In-app banner zöld csík felül 4mp alatt. Bevásárló lista 22 sürgős tétel listázódik (mind material_type, beleértve consumable), override működik.

---

## 2. KONVENCIÓK — ANTI-REGRESSZIÓ SZABÁLYOK

> Ezek **kötelező** szabályok. Minden új kód ezeket kövesse. A visszatérő bugok 90%-a abból jött, hogy valaki ezeket nem ismerte.

### 2.1 DB műveletek

- ❌ TILTOTT: `sb.upsert(table, {...obj}, key)` és `sb.update(table, {...obj}, where)` — a spread kliens-oldali extra mezőket DB-be küld → `PGRST204 'desc' column not found` típusú hiba
- ✅ HELYES: `sb.updateFields(table, { explicitField1, explicitField2 }, where)` — csak named field-ek
- ✅ Új rekord ID-szekvencia ütközés ellen: `nextId = MAX(id) + 1` explicit kérdezés `sb.query` order desc limit 1-gyel

### 2.2 CSS

- ❌ TILTOTT: inline `style="..."` modal/form/sticky pozícióhoz HTML-ben
- ✅ HELYES: `.modal`, `.form-row`, `.form-group`, `.sticky-bottom-bar` osztályok a `kerek-styles.css`-ben
- `.form-group > input/select/textarea` (DIRECT child only — nested flex containers preserved)
- DO NOT CHANGE kommentek a kényes szabályoknál (modal max-width, form-group min-width, safe-area-inset)
- iOS safe-area: `padding-bottom: max(default, env(safe-area-inset-bottom))` minden fix-bottom elemen

### 2.3 State sync

- Egységes Realtime subscription minden modulban (admin + vevő + receptúra)
- Új tábla bevezetésekor: hozzá kell adni mindhárom modul `*_RT_TABLES` listájához
- **+ Supabase oldalon**: `ALTER PUBLICATION supabase_realtime ADD TABLE new_table;`
- A Realtime callback használjon **`reload*Data()` helper-t**, NEM `loadAllData()`-t (ha az nincs window scope-ban)

### 2.4 Navigáció

- ❌ TILTOTT: `getAttribute('onclick').indexOf(...)` lookup
- ✅ HELYES: `data-action="..."` + `data-arg1="..."` attribútumok keresése
- Nav lookup mindkét formátumot támogassa (legacy onclick + új data-action)

### 2.5 Tooltipek

- `data-tip="..."` attribútum + `kerek-styles.css [data-tip]:hover` CSS
- Backward compatible: ha van `title="..."`, az duplikálódik `data-tip`-be is (a Python regex automatikusan)

### 2.6 Adatforrások

- Ha CRUD több forrást érint (settings + usage), a render mindig az **uniót** mutassa
- Pattern: `[...new Set([...src1, ...src2])].sort()`

### 2.7 Bug fix workflow

- Minden javított bug → bekerül **ebbe a fájlba** (4. szekció Bug History)
- Új session elején olvasd el, kerüld el a már-feltárt hibákat

### 2.8 NaN guard (új konvenció v2.38.6-tól)

- Minden numerikus értékre: `Number(x) || 0` fallback
- A `qty`, `price`, `stock`, stb. lehetnek string-ek a localStorage-ből — explicit konverzió

### 2.9 Mértékegység (új konvenció — M0 után kötelező)

- Minden alapanyagnak van **default unit-ja**: `g | kg | L | ml | db | csomag`
- DB-ben minden `qty_*_g` mező továbbra is **g-ban** marad (recept ingredients kompatibilitás)
- Kijelzésnél/bevitelnél a felhasználó az alapanyag **default unit-jában** dolgozik
- Konverzió: `ingredient.unit_to_g_ratio` szorzó (pl. kg → 1000, tojás → 60g)

### 2.10 Munkamódszer (felhasználói preferenciák)

- **Tervezet-jóváhagyás workflow**: nagyobb feature előtt rövid tervezet, várjon jóváhagyásra
- **Batch commits**: minden release egy commit, nem külön diagnosztika + javítás
- **Tömör válaszok**: végeredmény közlés, nem step-by-step magyarázat
- **Limit-takarékos**: kevesebb screenshot, csak ha tényleg kell vizuális verifikáció
- **Verzió-bump kötelező**: `kerek-constants.js` APP_VERSION + minden HTML `?v=` + `sw.js` CACHE_NAME
- **SQL futtatás**: a felhasználó futtatja Supabase Dashboardban, Claude csak kódol és adja az SQL-t (idempotens DO block szerű forma)

### 2.11 Idempotens SQL minden DB migrációra

```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='X' AND column_name='Y') THEN
    ALTER TABLE X ADD COLUMN Y ...;
  END IF;
END $$;
```

Mert a felhasználó újra futtathatja és nem dob hibát ha már létezik.

---

## 3. FEATURE KOMPLETTESÉGI MÁTRIX

✅ = teljes és élesben működik; ⚠️ = részleges; ❌ = nincs / backlog

### Admin modul
| Funkció | Status | Megjegyzés |
|---|---|---|
| Login + Edge function auth | ✅ | admin_secrets tábla |
| Dashboard | ✅ | Heti pénzügyi, havi forgalom, sütési napok, üzenetek |
| Termékkatalógus CRUD | ✅ | v2.36.0 archiveProduct schema-fix |
| Archivált termékek külön cache | ✅ | v2.38.2 D.productsArchived |
| Kliensek CRUD | ✅ | Deactiválás DELETED prefix-szel |
| Sütési lista (baking) | ✅ | Bulk confirmDay/saveModify |
| Üzenetek | ✅ | Realtime, badge per-vevő |
| Push notification — silent | ✅ | Rendelés-status változásra automatikus |
| Push notification — broadcast | ✅ | Új termék, általános broadcast |
| Reports + Analytics | ✅ | Audit log, CSV export |
| Kategóriák CRUD (termék/alapanyag/recept) | ✅ | |
| sb.updateFields helper | ✅ | v2.36.0 anti-spread |
| pendingBadge auto login után | ✅ | v2.37.0 |

### Vevő modul
| Funkció | Status | Megjegyzés |
|---|---|---|
| Login + Register | ✅ | Hash-alapú |
| PWA install (beforeinstallprompt) | ✅ | Custom UI gomb |
| Push notification subscribe | ✅ | VAPID keys |
| Rendelés táblanézet | ✅ | M9 unified mobile + desktop renderer |
| Pivot termék-nézet | ✅ | Toggle Day/Product |
| Sticky havi total bar | ✅ | v2.36.0 iOS safe-area + v2.38.6 NaN guard |
| PDF rendelés-összefoglaló | ✅ | jsPDF |
| Másolás vágólapra (heti minta) | ✅ | |
| Auto-confirm deadline (H8) | ✅ | Kliens-oldali fallback |
| Realtime admin üzenet | ✅ | v2.38.0 postgres_changes fix |
| In-app banner új üzenetre | ✅ | v2.36.0 + v2.38.0 |
| Vevő önkiszolgáló profil | ❌ | Backlog (B6) |

### Receptúra modul
| Funkció | Status | Megjegyzés |
|---|---|---|
| Receptek CRUD | ✅ | |
| Alapanyagok CRUD | ✅ | v2.35.0 material_type + family |
| Készlet (FIFO) | ✅ | ingredient_batches |
| Sütés visszaigazolás | ✅ | H3+H5 bulk OR-query |
| Malom / Feldolgozás v2 | ✅ | v2.34-35.0 — 6 művelet, yield, cross-contamination |
| Milling profile editor | ✅ | Per-alapanyag yield reference |
| Multi-state ingredient | ✅ | v2.35.0 — raw/intermediate/finished/consumable |
| Smart filtering operation szerint | ✅ | v2.35.0 |
| Cross-contamination védelem | ✅ | v2.34.0 |
| Levain számítások | ✅ | |
| AI receptúra generálás | ✅ | Anthropic/OpenAI/Groq |
| Alapanyag-kategóriák CRUD | ✅ | v2.36.0 settings + usage union |
| **🛒 Bevásárló lista** | ✅ | **v2.39.0 — beszállítónkénti + általános, sürgősség 3 szint, manuális override, clipboard másolás** |
| Kísérleti sütés modal | ⚠️ | Alapok megvannak, NINCS verziókezelés (S5-6 backlog) |
| Recept verziókezelés (parent_id, status) | ❌ | S5 backlog |
| Recipe feedback rendszer | ❌ | S6 backlog |
| Side-by-side recept diff | ❌ | S6 backlog |
| **Mértékegység támogatás (unit + ratio)** | ❌ | **M0 — ÚJ SÜRGŐS — Roadmap §5** |
| EOQ + MOQ optimalizáció | ❌ | S2 backlog |
| Multi-supplier priority | ❌ | Jelenleg csak az első |
| Fermentáció state machine | ❌ | S4 backlog |
| Auto-learning yield refinement | ❌ | S4 backlog |
| Persistent shopping overrides | ❌ | M1.1 |

### Közös infrastruktúra
| Funkció | Status | Megjegyzés |
|---|---|---|
| Supabase Realtime postgres_changes | ✅ | v2.38.0 KRITIKUS gyökér-ok fix |
| 30s polling backup | ✅ | Page Visibility aware |
| Audit log | ✅ | sb.insert C1 fix |
| Custom dialogs (confirm/alert) | ✅ | v2.31.0 M5 |
| data-action event delegation | ✅ | v2.33.0 M7 |
| Tooltip rendszer | ✅ | v2.36.0 data-tip + CSS |
| Favicon + meta tagek | ✅ | v2.36.0 |
| Central CSS (modal/form/sticky) | ✅ | v2.36.0 kerek-styles.css 211 sor |
| sb.updateFields helper | ✅ | v2.36.0 anti-schema-mismatch |
| Verzió-bump automatika | ✅ | Python script kerek-constants.js+HTML-ek+sw.js |
| End-to-end tesztek (Playwright) | ❌ | L6 backlog (1-2 napos infra) |
| Accessibility (aria-label) | ⚠️ | Részleges (data-tip ad screen reader-nek értelmet) |

---

## 4. BUG HISTORY — GYÖKÉR-OKOK ÉS TANULSÁGOK

> Minden javított bug részletes elemzéssel. Jövő-Claude (vagy más fejlesztő) ezt olvassa hogy ne ismételje a hibákat.

### #1 — `archiveProduct` PGRST204 'desc' column

**Verzió**: v2.36.0
**Kategória**: A) Schema-mismatch
**Tünet**: Archiváláskor `PGRST204: Could not find the 'desc' column of 'products'` toast.
**Gyökér ok**: `sb.upsert('products', {...p, deleted_at: now}, 'id')` minta — a `{...p}` spread-elte a kliens `p.desc` mezőt is, de a DB `description`-t vár.
**Fix**: `sb.updateFields('products', { deleted_at: now }, 'id=eq.' + id)` — csak named field.
**Prevenció**: KONVENCIÓ 2.1 — sb.updateFields kötelező anti-spread.

### #2 — `recipes_pkey` duplicate key violation

**Verzió**: v2.36.0
**Kategória**: A) DB sequence sync
**Tünet**: Új gyártási termék létrehozásakor 23505 error: `duplicate key value violates unique constraint "recipes_pkey"`.
**Gyökér ok**: PG `recipes_id_seq` érték kisebb mint `MAX(id)`. Manuális CSV-import után előfordul.
**Fix**: `nextId = MAX(id) + 1` explicit kérdezés, és átadás az INSERT-nek.
**Prevenció**: minden új rekord INSERT-jénél kézi ID kiszámítás MAX+1-gyel.

### #3 — Modal kilógás (visszatérő bug v2.23-tól)

**Verzió**: v2.36.0 (korábban: v2.23.0, v2.27.0)
**Kategória**: B) CSS-regresszió
**Tünet**: Új termék modal-ban "g" mező kilóg, vízszintes csúszka.
**Gyökér ok**: 3 HTML-ben szétszórt inline modal-CSS, mind más-más `min-width` értékkel.
**Fix**: Központi `kerek-styles.css`: `.modal { max-width: 640px }`, `.form-group { min-width: 100px }`, `box-sizing: border-box`. DO NOT CHANGE kommentek.
**Prevenció**: KONVENCIÓ 2.2 — inline style tilos modal/form-ra, kerek-styles.css használata.

### #4 — Tooltip rendszer (új feature)

**Verzió**: v2.36.0
**Kategória**: E) UX
**Mit nyer**: Ikon-gombokhoz "Szerkesztés", "Archiválás" stb. hover felirat. Pure CSS (no JS), mobil long-press is működik.
**Pattern**: `data-tip="..."` + `[data-tip]:hover::after` + `@media (hover: none)` long-press szabály.

### #5 — Sticky bar mobil iOS-en (visszatérő v2.25-től)

**Verzió**: v2.36.0
**Kategória**: B) CSS-regresszió, iOS-specifikus
**Tünet**: Alsó sticky havi-totál mobilon nem látható (iOS Safari home indicator levágja).
**Gyökér ok**: `env(safe-area-inset-bottom)` CSS env variable hiányzott.
**Fix**: `padding-bottom: max(12px, env(safe-area-inset-bottom));`
**Prevenció**: KONVENCIÓ 2.2 — minden fix-bottom elemnél kötelező a safe-area-inset.

### #6 — Sütési pendingBadge regresszió

**Verzió**: v2.36.0
**Kategória**: C) Refaktor-regresszió (M7)
**Tünet**: Új rendelésekre nem jelenik meg a sárga számláló a "Sütési lista" nav mellett.
**Gyökér ok**: `updatePendingBadge()` az `onclick` attribútum alapján kereste a `bakingNav`-ot. M7 refaktor v2.33.0-ban átírt 122 onclick-et `data-action`-re → `bakingNav = null`.
**Fix**: lookup mind `onclick`-ot, mind `data-action="nav" data-arg1="baking"`-et nézi.
**Prevenció**: KONVENCIÓ 2.4 — navigációs lookup-ok mind `onclick` mind `data-action` alapján.

### #7 — Üzenet badge race (részben javítva)

**Verzió**: v2.36.0 (részben)
**Kategória**: C) State-sync timing
**Tünet**: Olvasatlan üzenet badge néha eltűnik mielőtt a felhasználó látta volna.
**Gyökér ok valószínűleg**: `markClientSeen` és Realtime/polling timing race.
**Fix v2.36.0**: Realtime debounce 500ms (volt 100ms).
**TODO**: timestamp-alapú validáció — `D.messagesLoadedAt > D.seenMsgsLoadedAt`.

### #8 — Vevő app Realtime hiánya

**Verzió**: v2.36.0 (alapfix), v2.38.0 (gyökér ok)
**Kategória**: C) State-sync
**Tünet**: Admin válaszüzenet csak ~1 perc múlva jelent meg.
**Gyökér ok**: Vevő app csak 30s polling, nem Realtime.
**Fix v2.36.0**: `sb.subscribe()` hozzáadva. **De a tényleges Realtime csak v2.38.0-ban kezdte küldeni az eseményeket** (lásd #17).

### #9 — In-app banner új üzenetre (új feature)

**Verzió**: v2.36.0
**Kategória**: E) UX
**Mit nyer**: Új admin üzenet → vevőben felül csúszó zöld banner "💬 Új üzenet érkezett". 8s auto-hide.

### #10 — Alapanyag kategóriák settings+usage union

**Verzió**: v2.36.0
**Kategória**: D) Forrásinkonzisztencia
**Tünet**: Új kategória eltűnik, törlés nem lehetséges (csak count=0 esetén jelenik a delete).
**Gyökér ok**: `renderIngCategories()` csak `R.ingredients.map(i => i.cat)`-ot renderelt. Az `addIngCategory()` settings-be mentett.
**Fix**: `[...new Set([...settings, ...usage])].sort()` union.
**Prevenció**: KONVENCIÓ 2.6 — multi-source CRUD esetén union pattern.

### #11 + #15 — Receptúra Realtime + cache override

**Verzió**: v2.36.0 (kísérlet), v2.37.0 (helper), v2.38.0 (TÉNYLEGES fix)
**Kategória**: C) State-sync + D) Function scope
**Tünet**: Adminban létrehozott termék nem jelenik meg a Receptúrában.
**Gyökér okok (több együtt)**:
1. `loadAllData()` nem volt definiálva a `receptura-data.js`-ben → callback `ReferenceError`
2. Receptúra Realtime sosem küldött eseményt (lásd #17)
3. localStorage `kerek_recipe_data` snapshot felülírta a friss adatot
**Fix**: új `reloadReceptData()` helper, `loadAllData() → reloadReceptData()` callback-ben, `save()` kihagyva a Realtime reload után.

### #12 — Favicon 404 + mobile-web-app-capable

**Verzió**: v2.36.0
**Kategória**: E) UX kozmetika
**Fix**: `favicon.svg` (KEREK teal kör arany "K"), `<link rel="icon" type="image/svg+xml">` mind a 3 HTML-be, `<meta name="mobile-web-app-capable" content="yes">` vevo.html-be.

### #14 — Tooltip nem mindig működik (NYITOTT)

**Verzió**: nyitott
**Kategória**: B) CSS valószínűleg
**Tünet**: Egyes gombokon a hover tooltip nem trigger-elődik (felhasználói jelentés).
**Gyanú**: `position: relative` hiánya parent-en, `overflow: hidden` zavarja, vagy z-index conflict.
**TODO**: konkrét képernyőmentés melyik gombnál — élesben vizsgálat.

### #16 — pendingBadge nem fut automatikusan login után

**Verzió**: v2.37.0
**Kategória**: D) Init flow gap
**Tünet**: Login után dashboard view-on nincs badge, csak miután ráklikkel a Sütési listára.
**Gyökér ok**: `doLogin()` Edge function success ágában csak `updateMsgBadge()` futott, `updatePendingBadge()` nem.
**Fix**: `updatePendingBadge()` hozzáadva a login flow-ba.
**Prevenció**: post-login `initIndicators()` helper javasolt — egyetlen hívás minden badge-et frissít.

### #17 ⭐ — Supabase Realtime postgres_changes (KRITIKUS GYÖKÉR-OK)

**Verzió**: v2.38.0
**Kategória**: C) Protocol mismatch
**Tünet**: A KEREK Realtime SOSEM küldött DB-change eseményeket. Az admin "úgy érezte hogy működik" — valójában csak a 30s polling kézbesítette 1 perc késleltetéssel.
**Gyökér ok**: `phx_join` payload csak `broadcast` és `presence` config-ot küldött. Supabase válasza: `postgres_changes: []` (üres tömb!). A DB-change subscription **sosem kérelmezett**.
**Diagnosztikai módszer**: WS-szintű forward proxying — `WebSocket.send`/`onmessage` override captura. Az üres `postgres_changes: []` array a phx_reply payload-jában volt a kritikus tipp.
**Fix**: explicit `postgres_changes: [{event:'*', schema:'public', table}]` config a `phx_join`-ban. `onmessage` kezeli mind a régi (közvetlen INSERT/UPDATE event) ÉS az új (postgres_changes wrapper) formátumot.
**SQL is kell**: `ALTER PUBLICATION supabase_realtime ADD TABLE <tabla>;` minden Realtime-igényes táblára.
**Hatás**: az ÖSSZES korábbi Realtime-függő bug (#7, #8, #11, #15) **egyetlen gyökér oka** volt.
**Prevenció**: új session induláskor WS-szintű forward proxy-vel ellenőrizni `postgres_changes` válasz nem üres-e.

### #18 — saveProduct marketingDesc undefined

**Verzió**: v2.38.1
**Kategória**: A) Schema-mismatch (rosszul mappelt mezők)
**Tünet**: Termék mentésekor "marketingDesc is not defined" hiba.
**Gyökér ok**: UPDATE products kódban hivatkozás `marketingDesc, ingredientLabel, allergens, nutrition` változókra — ezek a recipes táblához tartoznak, NEM products-hoz, és nincsenek is deklarálva.
**Fix**: `sb.updateFields('products', { name, weight, price, category, description, product_family_id, image, code })` — csak products-ban létező mezők.

### #19 — Archiválás visszakerül

**Verzió**: v2.38.2
**Kategória**: D) Forrásinkonzisztencia
**Tünet**: Babos kifli, fagyi 2 mind visszakerült a fő termékkatalógusba pedig DB-ben `deleted_at` be volt állítva.
**Gyökér ok**: `loadAllData` nem töltötte a `deleted_at` mezőt → `D.products`-ban mind aktívnak látszott. `restoreProduct` `Object.assign({}, p, {deleted_at:null})` spread bug.
**Fix**: `D.products` csak aktív + új `D.productsArchived` cache. `archiveProduct` átmozgatás cache-ek között. `sb.updateFields` minden helyen.

### #20 — Méret/Súly mező használhatatlan

**Verzió**: v2.38.3
**Kategória**: B) CSS-regresszió
**Tünet**: Új termék modal-ban a számbeviteli mező 29px széles, "g" select 138px — nem lehet beírni.
**Gyökér ok**: A `.form-group input { width: 100% }` szabály a v2.36.0-s központi CSS-ben felülírta a nested flex layout-ot.
**Fix**: `.form-group > input/select/textarea` (DIRECT child only). Nested flex containers (Méret/súly composite) megőrzik a flex sizing-ot. Select `flex: 0 0 70px`, input `flex: 1`.
**Prevenció**: KONVENCIÓ 2.2 — direct child CSS scope.

### #21 — Receptúra sidebar link aláhúzott

**Verzió**: v2.38.2
**Kategória**: E) UX kozmetika
**Tünet**: A "Receptúra modul" link `<a href>` aláhúzott a sidebar-ban.
**Fix**: `a.nav-item { text-decoration: none !important }` a kerek-styles.css-be.

### #22 — Push notification desktop UX

**Verzió**: v2.38.4
**Kategória**: E) UX
**Tünet**: Chrome desktop 3 mp után magától eltüntette a push notification-t. Ha nem nézett oda → lemaradt.
**Fix**: `requireInteraction: true` minden push-ra a sw.js push handler-ben.

### #23 — sendPushToClient response logging

**Verzió**: v2.38.4
**Kategória**: D) Diagnosztika hiányosság
**Tünet**: Silent fail — ha a push backend hibázott, senki nem tudta meg.
**Fix**: response parsing, `{ok, status, sent, failed}` return, console.warn ha nem OK.

### #24 — reloadVevoData NaN bug

**Verzió**: v2.38.5
**Kategória**: A) Field name mismatch
**Tünet**: In-app banner teszt után "HAVI ÖSSZÉRTÉK NaN lej".
**Gyökér ok**: v2.37.0-ban írt `reloadVevoData` rossz mezőneveken tárolt:
- `appData.monthlyActive` (HELYES: `monthlyActiveProducts`)
- `appData.bakingExtra/bakingRemoved` (HELYES: `bakingCalendar[k]={extra,removed}`)
- `image: p.image_url` (HELYES: `p.image`)
**Fix**: helyes mezőnevek + price default 0.

### #25 — updateHeroTotal NaN guard

**Verzió**: v2.38.6
**Kategória**: D) Numerikus érték konverzió hiányzott
**Tünet**: Ha `monthlyActiveProducts[k]` üres → NaN lej a sticky bar-on.
**Fix**: `Number(qty) || 0`, `Number(price) || 0`, végén `total = Number(total) || 0`.
**Prevenció**: KONVENCIÓ 2.8 — minden numerikus értékre Number() konverzió.

---

## 5. FEJLESZTÉSI ROADMAP — RÉSZLETES PRIORITÁSI SORREND

> Ez a teljes lista. Minden tétel a saját session-szerű fejlesztési egység.
> Prioritás: **M0/M1** (must-have most) → **S1-S6** (session ütemterv) → **B1-B6** (backlog) → **L1-L8** (long-term).

---

### 🔴 M0 — Mértékegység támogatás (ÚJ, sürgős)

**Probléma**: jelenleg minden alapanyag g-ban van tárolva. De a valóságban:
- Liszt: kg-ban veszik (25 kg, 50 kg zsák)
- Tej, olaj, ecet: liter-ben
- Tojás: db-ban (10 db, 30 db)
- Élesztő, sütőpor: csomag-ban
- Csomagolás (dobozok, papír, címke): db / csomag
- Burgonya: kg / db

A felhasználó panasza: "A bevételezéskor megadott mennyiséget kell hoznia a végén."

**Megoldási terv**:

**M0.1 — DB séma kibővítés**

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
-- Megengedett unit-ok: 'g', 'kg', 'L', 'ml', 'db', 'csomag'
-- unit_to_g_ratio: hány gramm 1 unit
--   g: 1, kg: 1000, L: 1000 (víz), ml: 1, db: változó, csomag: változó
```

**M0.2 — UI változások**
- **Alapanyag modal**: mértékegység választó dropdown (`g/kg/L/ml/db/csomag`)
- Ha `db` vagy `csomag` választva: extra "1 db = X g" mező a sűrűségnek
- **Bevételezés modal**: mennyiség mező + unit lock az alapanyag default unit-jához (megjelenítés "kg" felirattal, mentésnél *1000-szer)
- **Bevásárló lista**: ajánlott mennyiség az **adott alapanyag unit-jában** (5 kg, NEM 5000 g)
- **Stock kijelzés**: szintén unit-ban (minStock 15 kg, maxStock 30 kg)

**M0.3 — Belső számolás**
- A `qty_remaining_g` MARAD g-ban (recept ingredients kompatibilitás)
- Bevétel mentésnél: `qty_g = input_qty * unit_to_g_ratio`
- Kijelzésnél: `display_qty = qty_g / unit_to_g_ratio`
- Recipe ingredients továbbra is g-ban (pontosan így van most is)

**M0.4 — Bevásárló lista frissítés**
- `fmtQty(grams, unit, ratio)` új signaturája: ha `unit` + ratio adott, konvertál
- `getPackageSize(ing)` → csomag mérete az alapanyag unit-jában
- `getRecommendedQty(ing)` → unit-ban tér vissza (NEM g)
- Clipboard formátum: "Liszt: 25 kg", "Tojás: 30 db", "Tej: 10 L"

**M0.5 — Backward compat**
- A meglévő 37 alapanyag default `unit='g'` marad
- A felhasználó egyenként átállíthatja: pl. Burgonya → unit='kg', vagy ha 1 db = 200 g akkor unit='db', unit_to_g_ratio=200

**Becsült méret**: ~400 sor új JS + DB migration + UI módosítás (alapanyag modal + bevétel modal + bevásárló lista + stock view) — **egy nagy session, vagy két kisebb**

---

### 🟡 M1 — Bevásárló lista folytatás (Session 1 hiányzó tételek)

**M1.1 — Persistent shopping overrides**
- DB: `shopping_overrides (ingredient_id INT, qty NUMERIC, unit TEXT, created_at TIMESTAMP, user_id TEXT)` tábla
- Page reload után megmaradnak
- "💾 Mentés" gomb az override-ok perzisztálására
- "🗑️ Elavult törlése": 7 napnál régebbi override-ok auto-cleanup

**M1.2 — Beszállító-kiosztás wizard**
- A 22 orphan alapanyaghoz (jelenleg "⚠️ Beszállító megadva nincs")
- Egy-gombos wizard a Bevásárló lista tetején: "📦 22 alapanyaghoz nincs beszállító - gyors beállítás"
- Modal: alapanyag-listából csoportos választás + beszállítónév beírás (autocomplete a meglévő beszállítókból)
- Egy klikkel mind a 22-höz hozzárendel egy beszállítót

**M1.3 — History-alapú min/max gomb a shopping view-ban**
- A meglévő `calcAutoMinMax()` (settings view-ban már létezik) bevonása a bevásárló lista-ba
- Gomb: "🤖 Min/Max ajánlás rendelési history alapján" — minden alapanyagra futtatja és visszamutatja "Régi → Új" diff-ben
- Egy klikkel mind elfogadás vagy egyenkénti hagyás

**M1.4 — Akció/promóció támogatás**
- "💡 Akciós tipp" jelölő gombja minden tételhez (most → "+20% ajánlott mennyiség")
- DB: `ingredient_promotions (ingredient_id, until_date, qty_boost_pct)` tábla
- Bevásárló lista listán: 🎯 ikon jelzi az akciós tételeket
- Automatikus lejáratidő-figyelmeztetés (admin-nak push)

**M1.5 — Multi-format export**
- Jelenleg csak plain-text clipboard
- Új: CSV export beszállítónként
- Új: PDF export ("Bevásárló feladat - 2026-05-31" címmel)
- Új: WhatsApp deep-link generálás (`https://wa.me/?text=...`)
- Új: Email mailto deep-link (subject + body előre kitöltve)

---

### 🟢 S2 — Bevásárló lista v3 (EOQ + MOQ — pénzügyi optimalizáció)

**EOQ** (Economic Order Quantity): minimális összes költség (rendelési + tárolási) optimalizáció.

Képlet: `EOQ = sqrt(2 * D * S / H)`, ahol:
- D = éves keresletmennyiség (rendelési history alapján auto-számolva)
- S = rendelési költség (rögzített, beszállítónként)
- H = tárolási költség / év / unit (alapértelmezett: 10% az alapanyag árából)

**MOQ** (Minimum Order Quantity): beszállítónként minimum rendelési mennyiség, amit a beszállító elfogad.
- Új mező: `ingredient_supplier.moq_units` és `ingredient_supplier.lead_days`

**Multi-supplier priority**:
- Új tábla: `ingredient_supplier (ingredient_id, supplier_name, priority, moq, lead_days, price_per_unit, last_purchase_date)`
- Alapértelmezett priority sorrend: ár → lead_days → minőség
- A bevásárló lista automatikusan választ a legjobbat, de a felhasználó override-olhatja

**Beszerzési költség-kalkulátor**:
- Lej/kg rangsorolás minden beszállító között
- "💰 Olcsóbb alternatíva: MalomKft 8 lej/kg helyett LisztExport 6.5 lej/kg" javaslat

---

### 🟢 S4 — Malom fermentáció state machine

**Új feltöltési folyamat**:
```
pending (összekevert) → in_progress (fermentálódik X napon át) → completed (kész, mérhető) → dried (szárított, használható)
```

**DB**: `processing_batches.status` enum, `processing_batches.fermentation_days_target`, `processing_batches.dried_at`.

**Dashboard widget**: "Folyamatban lévő fermentációk"
- Lista: melyik batch, mikortól, várható készülés
- "⏰ 2 nap múlva esedékes" jelölés
- Push notification adminnak ha kész

**Auto-learning yield refinement**:
- Tényleges yield (hozam) figyelése minden completed batch-nél
- Milling_profile (`ingredients.milling_profile.yield_ratio_typical`) auto-frissítés átlag-alapon
- Recipe-specific yield: ha pl. tönkölyliszt 60% yield, akkor a recept ajánlott mennyiségéhez automatikusan +66% nyersanyag a bevásárló listán

---

### 🟢 S5-S6 — Kísérleti sütés v2 (verziókezelés)

**DB kibővítés**:
```sql
ALTER TABLE recipes ADD COLUMN parent_recipe_id INTEGER;
ALTER TABLE recipes ADD COLUMN status TEXT DEFAULT 'active'; -- 'draft'|'experimental'|'active'|'archived'

CREATE TABLE IF NOT EXISTS recipe_feedback (
  id SERIAL PRIMARY KEY,
  recipe_id INTEGER REFERENCES recipes(id),
  baked_date DATE,
  rating INTEGER, -- 1-5
  notes TEXT,
  photo_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Workflow**:
- Új recept létrehozásnál: "🧪 Forrás recept" választó (üres = új, vagy meglévő → kísérleti változat)
- Status flow: `draft` (csak admin látja) → `experimental` (sütésnap-listán külön szekcióban) → `active` (mindenki rendeli) → `archived`
- "Promote" gomb: experimental → active csak ha legalább 3 sütés volt és átlag rating >= 4
- "Demote" gomb: active → archived (régi termékek)

**Side-by-side diff**: két recept változat összehasonlítása oszlopokban (alapanyag, mennyiség, idő, hőfok).

**Lineage map**: vizuális fa-szerkezet, hogy melyik recept melyiknek a leszármazottja (D3.js vagy egyszerű HTML-tree).

---

### 🟢 B1-B6 — Backlog (felhasználói kérés)

**B1 — Recept szezonalitás**
- DB: `ALTER TABLE recipes ADD COLUMN active_months INTEGER[];` (1-12)
- Vevő app: a havi nézet csak az adott hónap aktív termékeit mutatja (alapanyag-szezonalitás miatt)
- Admin dashboard: szezonalitás-naptár áttekintés ("Ki van melyik hónapban?")

**B2 — Recept trendelés dashboard**
- "Felfelé trendel": utolsó 30 nap rendelési db / előző 30 napi rendelési db > 1.2
- "Lefelé trendel": < 0.8
- Vizuális chart: idősoros line graph terméknyenkénti
- Admin dashboardon: "📈 3 termék trendel — érdemes több reklámot tervezni"

**B3 — Recept önköltség-trend figyelmeztetés**
- Ha egy alapanyag ára 10%+-kal nőtt → push notification admin-nak: "X recept önköltsége 12%-kal nőtt — érdemes átnézni az árazást"
- Heti összesítő dashboard widget: "5 recept önköltsége nőtt e héten, 2 csökkent"
- Ár-történet tárolás: `ingredient_price_history (ingredient_id, price_per_g, recorded_at)` tábla

**B4 — Reverse lookup: "Mire kell ez az alapanyag?"**
- Alapanyag-detail panelen lista: melyik receptekben szerepel, milyen mennyiségben, milyen hónapban várhatóan
- Stock-deficit esetén: "⚠️ Búzaliszt hiánya 3 receptet érint: Kovászos cipó, GM kenyér, Babos kifli"
- Bevásárló lista: "Ezt rendelve fedezel X termék-rendelést a jövő héten"

**B5 — Beszállító teljesítmény tracking (NEM pénzügyi)**
- DB: `supplier_deliveries (supplier_name, delivery_date, on_time BOOL, quality_rating 1-5, notes)`
- Beszállító-profil oldal: átlagos átfutási idő, késési arány, minőségértékelés
- A bevásárló lista jelzi: "⚠️ Ez a beszállító az utolsó 5-ből 4-szer késett 3+ napot" — alternatíva-ajánlás

**B6 — Vevő önkiszolgáló profil**
- A vevő appban: profil-szerkesztés (email, telefon, jelszó-módosítás)
- Jelszó-cserénél email-megerősítés (Edge function)
- Vevő láthatja a saját rendeléstörténetét hónaponkénti bontásban + PDF export

---

### 🟢 Long-term (L)

**L6 — Playwright e2e tesztek**
- Infra: ~1-2 napos beüzemelés
- Smoke teszt minden release előtt automatikusan
- Lefedettség: login, termékkatalógus CRUD, rendelés folyamat, Realtime sync, push
- CI integráció: GitHub Actions runner
- Failed teszt → automatikus rollback javaslat

**L7 — i18n (későbbi terjeszkedés)**
- Magyar (jelenlegi) + Román fordítás (Erdély piaca)
- Translation file-ok (`hu.json`, `ro.json`)
- Vevő app: nyelv-választó a login képernyőn

**L8 — Accessibility (WCAG 2.1 AA)**
- Minden ikon-gombhoz `aria-label`
- Form mezők `<label for=...>` összekötve
- Tab-navigation tesztelve (összes view-on)
- Color contrast ratios ellenőrzése (a teal-pale-en jelenleg gyenge)
- Screen reader teszt (NVDA/JAWS)

---

## 6. AZONNAL TESZTELENDŐ (felhasználói feladat)

Ezeket te kell teszteld élesben — a kód kész és v2.39.0-ban van:

1. **🛒 Bevásárló lista** (Receptúra → új nav)
   - Beszállítónkénti + általános listanézet
   - +/- gombok és manuális override
   - Copy beszállítónként és teljes
2. **Realtime sync** (vevő-admin: ár-változás, üzenet)
3. **Push notification** (admin üzenet → vevő desktop tartós notification)
4. **#14 Tooltip**: melyik gombnál nem működik? (kép kell)
5. **Más modalok**: új vevő, jelszó, alapanyag, recept — méret-ellenőrzés
6. **Malom feldolgozás v2** (v2.34.0) — smoke teszt
7. **Multi-state ingredient** (v2.35.0) — smoke teszt

---

## 7. DB SÉMA — MINDEN TÁBLA (jelenlegi állapot)

| Tábla | Mezők (kritikus) |
|---|---|
| clients | id, name, email, phone, password_hash |
| products | id, name, weight, price, category, description, product_family_id, image, code, deleted_at, marketing_desc, ingredient_label, allergens, nutrition |
| monthly_active_products | id, year, month, product_id |
| orders | id, client_id, year, month, day, product_id, quantity |
| order_status | id, client_id, year, month, day, status ('pending'\|'confirmed'\|'modified'\|'cancelled'), admin_note, deadline |
| messages | id, client_id, year, month, text, created_at |
| recipes | id, name, category, product_id, base_portion, bake_loss, unit_weight, temp1, time1, temp2, time2, description, levain_amount, labor_h, electricity, marketing_desc, ingredient_label, allergens, nutrition, version, parent_recipe_id, status, tags, archived, activated_at |
| recipe_ingredients | id, recipe_id, ingredient_id, name, amount (g), sub_type, sort_order |
| recipe_steps | id, recipe_id, title, description, timer_minutes, sort_order |
| ingredients | id, name, category, sub_type, suppliers (JSON), min_stock_g, max_stock_g, critical_stock_g, fifo_price, avg_price, material_type, family_id, milling_profile, ... **MAJD: unit, unit_to_g_ratio (M0)** |
| ingredient_batches (FIFO) | id, ingredient_id, qty_received_g, qty_remaining_g, received_date, price_per_g, supplier_name, source_type |
| ingredient_families | id, name, common_unit, description |
| ingredient_milling_profile | id, ingredient_id, yield_ratio_typical, processing_loss_pct |
| baking_calendar | id, year, month, extra_dates (DATE[]), removed_dates (DATE[]) |
| settings | key, value (JSONB) |
| audit_log | id, action, entity, details, user, created_at |
| push_subscriptions | id, client_id, endpoint, p256dh, auth, created_at |
| admin_secrets | key, value (encrypted) |
| processing_batches | id, operation_type, recipe_id, processing_date, status |
| processing_inputs | id, batch_id, ingredient_id, qty_g, source_batch_id |
| processing_outputs | id, batch_id, ingredient_id, qty_g, target_batch_id |

### Realtime publikációban (v2.38.0+)
Eddig hozzáadva:
- messages, orders, order_status, products, monthly_active_products, baking_calendar
- recipes, recipe_ingredients, ingredients, ingredient_batches, processing_batches

---

## 8. EDGE FUNCTIONS

| Function | Cél | Verzió |
|---|---|---|
| dynamic-service | Push notification küldés (Web Push), stale 410/404 cleanup | aktív |
| admin-auth | Admin jelszó-check (admin_secrets) | v2.30.0+ |
| auto-confirm-orders | Pending → confirmed deadline után (no cron, manual trigger) | aktív |

---

## 9. FÁJL TÉRKÉP (v2.39.0)

### HTML (5)
- `admin.html`, `vevo.html`, `receptura.html`, `index.html`, `register.html`

### Globális JS
- `kerek-constants.js` — APP_VERSION, helpers, sb.updateFields, debugLog, confirmDialog+alertDialog, data-action delegator, sendPushToClient (v2.38.4 response logging), sendPushBroadcast
- `kerek-styles.css` — 211+ sor központi modal/form/sticky/tooltip/anchor-nav CSS (DO NOT CHANGE kommentek)
- `supabase.js` — REST + sb.subscribe (postgres_changes config v2.38.0, returns unsub v2.37.0) + sb.updateFields helper
- `sw.js` — PWA cache + push handler (requireInteraction:true v2.38.4)
- `favicon.svg` — KEREK teal kör arany "K"

### Admin JS (12 file)
admin-data.js, admin-ui.js, admin-baking.js, admin-catalog.js (D.productsArchived split v2.38.2), admin-clients.js, admin-orders.js, admin-messages.js, admin-push.js, admin-reports.js, admin-settings.js, admin-help.js

### Vevő JS (6 file)
vevo-data.js (showAdminMsgBanner, reloadVevoData, countMyMessages, Realtime subscription, push subscription), vevo-ui.js, vevo-analytics.js, vevo-orders-render.js, vevo-orders-actions.js (updateHeroTotal NaN guard v2.38.6), vevo-orders-extras.js

### Receptúra JS (16 file)
receptura-data.js (reloadReceptData helper v2.37.0 + Realtime subscription), receptura-ui.js (VIEW_TITLES + nav data-action support v2.39.0), receptura-recipes.js, receptura-stock.js, receptura-production.js, receptura-processing.js (Malom v2.5 + 6 operation types + family smart filter), receptura-levain.js, receptura-ingredients.js (state badge + family + milling profile), receptura-modal.js, receptura-ai.js, receptura-operational.js, receptura-settings.js, receptura-ing-cats.js (settings+usage union v2.36.0), receptura-recipe-cats.js, receptura-help.js, **receptura-shopping.js (v2.39.0 — 270 sor)**

---

## 10. VERZIÓ-BUMP CHECKLIST

Új release előtt minden helyen frissíteni:

1. `kerek-constants.js` → `APP_VERSION = 'v{VER} ({DATE})'`
2. `admin.html`, `vevo.html`, `receptura.html`, `index.html`, `register.html` → minden `?v={VER}` JS/CSS query
3. `sw.js` → `const CACHE_NAME = 'kerek-v{VER}'`
4. Syntax check: `node -e "new vm.Script(fs.readFileSync('js/X.js','utf8'))"` minden módosított JS-re
5. Jest: `npx jest --no-coverage`
6. Git: `git add -A && git commit -m "..." && git push`
7. Várj ~35s a GitHub Pages deploy-ra
8. Verify: `curl actions API` — `completed/success`
9. Hard refresh + élesben teszt
10. Frissítsd a Bug History szekciót

**Python script** (mostani):
```python
import re, datetime
NEW_VER = "X.Y.Z"
DATE = datetime.date.today().strftime("%Y-%m-%d")
# kerek-constants.js
# 5 HTML file ?v=
# sw.js CACHE_NAME
```

---

## 11. UTOLSÓ MEGJEGYZÉSEK

- **A v2.38.0 Realtime fix volt a session legfontosabb felfedezése.** Mostantól a vevő/receptúra app 1-3 másodperc alatt szinkronizálódik az adminnal. Ez **az alapja** sok jövőbeli feature-nek (in-app banner, élő riport, kollaboratív szerkesztés).
- **A KEREK_BUG_LOG.md és KEREK_SKILL.md mostantól egy fájl** (ez). A felhasználói kérésre.
- **Az M0 mértékegység-támogatás a következő logikus lépés** — enélkül a bevásárló lista UX-e zavaros marad.
- **A session 1-2 (Bevásárló lista) első része kész** — a v3 EOQ/MOQ és a perzisztens override-ok még backlog-ban.
