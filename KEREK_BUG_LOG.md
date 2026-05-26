# KEREK Bug Log

Ez a fájl minden javított bugot rögzít — **gyökér ok + fix commit + prevenciós tanulság**. A cél: amikor egy hasonló bug visszatér, a jövő-én/én **azonnal lássa miért történt és hogyan kerülje el**.

**Kötelező minden új bug fix után**: add hozzá az alábbi formátumot.

---

## #1 — `archiveProduct` PGRST204 "Could not find the 'desc' column"

**Verzió**: v2.36.0 (2026-05-26)
**Kategória**: Schema-mismatch (A)
**Tünet**: Termék archiválása `Hiba: {"code":"PGRST204",...,"message":"Could not find the 'desc' column of 'products' in the schema cache"}` toast-ot ad.

**Gyökér ok**: A kód `await sb.upsert('products', {...p, deleted_at: now}, 'id')` minta `{...p}` spread-eli a kliens-oldali `p` objektum minden mezőjét, beleértve a **`desc`** mezőt is. A kliens-oldal `desc`-et mappel a DB `description` oszlopáról, de a spread visszaküldi `desc`-ként, ami nem létezik DB-ben.

**Fix**: `sb.updateFields('products', { deleted_at: now }, 'id=eq.' + id)` — csak a tényleg módosított mezőt küldjük.

**Prevenciós tanulság**:
- ❌ TILTOTT: `sb.upsert(table, {...obj, newField}, key)` és `sb.update(table, {...obj}, where)` minta
- ✅ HELYES: `sb.updateFields(table, { explicitField1, explicitField2 }, where)`
- A `sb.updateFields()` helper a `supabase.js`-ben (v2.36.0+) ezt a célt szolgálja
- **Lint szabály a jövőre**: minden új DB műveletnél explicit named fields, soha spread

---

## #2 — Új termék létrehozása: `recipes_pkey` duplicate key violation

**Verzió**: v2.36.0 (2026-05-26)
**Kategória**: DB sequence sync (A)
**Tünet**: Új gyártási termék létrehozásakor "Termék mentve, de recept létrehozás sikertelen" + 23505 error: `duplicate key value violates unique constraint "recipes_pkey"`.

**Gyökér ok**: A Supabase `recipes_id_seq` szekvencia kisebb értéken áll mint a tábla `MAX(id)`. Ez akkor történik ha bárki valaha kézzel kiegyenlített ID-val insertelt vagy CSV-importtal töltötte a táblát. A `sb.insert('recipes', newRecipe)` ID nélkül a szekvenciát használja, ami már létező ID-t adna vissza.

**Fix**: `nextId = MAX(id) + 1` explicit lekérdezése és átadása az INSERT-nek.

**Prevenciós tanulság**:
- ❌ KOCKÁZAT: PG sequence default behavior nincs ellenőrizve insert előtt
- ✅ HELYES: új rekord létrehozásakor explicit `nextId = MAX(id) + 1` küldés
- Vagy: SQL `SELECT setval('table_id_seq', (SELECT MAX(id) FROM table));` manuálisan futtatása ha tudjuk
- **DB-rule**: minden tábla `id_seq`-jét re-sync-elni kell ha kézi adatmódosítás történt

---

## #3 — Modal kilógás (visszatérő bug)

**Verzió**: v2.36.0 (2026-05-26), korábban: v2.23.0, v2.27.0 (vissztérő)
**Kategória**: CSS-regresszió (B)
**Tünet**: Új termék modal-ban a "g" mezők kilógnak vízszintes csúszka kell.

**Gyökér ok**: A modal és form-group CSS **3 HTML fájlban szétszórva** volt inline-ban, mindenhol más-más `min-width` értékkel (140px, 120px). A `box-sizing: border-box` is hiányzott egyes input-okról. Egy refaktor (M9, M10 split) elronthatta a régi fixet.

**Fix**: Központosított CSS a `kerek-styles.css`-ben:
- `.modal { max-width: 640px; }`
- `.form-group { min-width: 100px; }` mobilon `min-width: 100%`
- `.form-group input/select/textarea { box-sizing: border-box; width: 100%; min-width: 0; }`
- DO NOT CHANGE komment a kritikus szabályoknál

**Prevenciós tanulság**:
- ❌ TILTOTT: inline `style="..."` modal vagy form layout-ra HTML-ben
- ✅ HELYES: minden modal/form CSS a `kerek-styles.css`-be, `.modal`, `.form-row`, `.form-group` class-okkal
- DO NOT CHANGE kommentek a kényes szabályokon — jelzés a jövő-énnek
- **Lint szabály**: új modal HTML-be NE kerüljön inline `style` attribútum

---

## #5 — Sticky bottom bar mobil nem látszik (visszatérő bug)

**Verzió**: v2.36.0 (2026-05-26), korábban: v2.25.2
**Kategória**: CSS-regresszió (B), iOS-specifikus
**Tünet**: A vevő app alsó sticky havi-totál bar mobilon (különösen iOS Safari) nem látható.

**Gyökér ok**: iOS Safari **home indicator** + **dynamic toolbar** elfedi/leváglja a `position:fixed; bottom:0` elemeket. A `env(safe-area-inset-bottom)` CSS environment variable nem volt használva.

**Fix**: `padding-bottom: max(12px, env(safe-area-inset-bottom));` a sticky bar-on + body padding-bottom is safe-area-aware.

**Prevenciós tanulság**:
- ❌ KOCKÁZAT: minden `position:fixed; bottom:0` elemet iOS Safari elvághat
- ✅ HELYES: `padding-bottom: max(default, env(safe-area-inset-bottom));`
- Plusz: `<meta name="viewport" content="...,viewport-fit=cover">` kell (már megvan)
- **CSS-rule**: minden új fix-bottom elemnél kötelező a safe-area-inset-bottom

---

## #6 — "Sütési lista" badge regresszió (M7 refaktor mellékhatása)

**Verzió**: v2.36.0 (2026-05-26)
**Kategória**: Refaktor-regresszió (C)
**Tünet**: Új rendelés (pending státusz) érkezésekor a "🔥 Sütési lista" menüpont mellett nem jelenik meg a sárga számláló badge.

**Gyökér ok**: A `updatePendingBadge()` függvény a `bakingNav`-ot kereste `getAttribute('onclick').indexOf('baking') > -1` alapján. De v2.33.0 (M7) refaktor során 122 onclick lett átírva `data-action` attribútumra → a lookup `null`-t adott vissza → a badge **soha nem lett létrehozva**.

**Fix**: a lookup ellenőrzi mind az `onclick`-et, mind a `data-action="nav" data-arg1="baking"`-et. Hasonló javítás a `nav()` activate funkcióban és a `clientNav` lookup-ban.

**Prevenciós tanulság**:
- ❌ KOCKÁZAT: az `onclick` attribútum keresése törékeny — az M7 refaktor csendben elrontotta
- ✅ HELYES: navigációs lookup-ok mind `onclick` mind `data-action` alapján kell történjenek
- **Jövőbeli refaktorhoz**: keressük végig a kódbázist `getAttribute('onclick')` mintára és frissítsük data-action támogatással is

---

## #10 — Alapanyag kategóriák: új kategória eltűnik, törlés nem lehetséges

**Verzió**: v2.36.0 (2026-05-26)
**Kategória**: Forrásinkonzisztencia (D)
**Tünet**: Új alapanyag-kategóriát hozzáadva mentődik a settings-be (Supabase), de **nem jelenik meg** a listán. A törlés gomb csak count=0 esetén jelenik meg, így soha.

**Gyökér ok**: A `renderIngCategories()` függvény csak `R.ingredients.map(i => i.cat)`-ból generálta a listát. Az `addIngCategory()` viszont a `R.settings.ingredientCategories`-be mentett. Két különböző adatforrás, a render csak az egyiket figyelte.

**Fix**: `renderIngCategories()` mostantól a settings + actual usage **unióját** mutatja.

**Prevenciós tanulság**:
- ❌ KOCKÁZAT: különböző adatforrások (settings + usage), ahol csak az egyiket olvassa a UI
- ✅ HELYES: ha CRUD operation több forrást érint, a render az **uniót** mutassa
- **Pattern**: `const all = [...new Set([...settings, ...usage])].sort();`

---

## #11 — Admin → Receptúra szinkron hiány (visszatérő bug)

**Verzió**: v2.36.0 (2026-05-26)
**Kategória**: State-sync inkonzisztencia (C)
**Tünet**: Adminban létrehozott termék/recept nem jelenik meg a Receptúra modulban page reload nélkül.

**Gyökér ok**: A 3 modul **3 különböző sync mechanizmust** használt:
- Admin: Supabase Realtime subscription (mindenre)
- Receptúra: 30s polling, csak `ingredient_batches`-re
- Vevő: 30s polling

A `recipes` és `products` táblákat semmi nem figyelte a receptúra modulban.

**Fix**: Receptúra (és vevő) is megkapja a Realtime subscription-t, debounce-olt loadAllData-val. A polling backup-ként megmarad (Page Visibility aware).

**Prevenciós tanulság**:
- ❌ KOCKÁZAT: különböző sync mechanizmusok különböző modulokban
- ✅ HELYES: egységes Realtime stratégia minden modulban, debounce-elt full-reload
- **Jövőbeli új tábla bevezetésekor**: hozzá kell adni a `*_RT_TABLES` listához mind a 3 modulban

---

## #7 — Üzenet badge eltűnik (race condition)

**Verzió**: v2.36.0 részben javítva (a #11 javítása következtében)
**Kategória**: State-sync timing (C)
**Tünet**: Olvasatlan üzenet badge néha eltűnik mielőtt a felhasználó látta volna.

**Gyökér ok valószínűleg**: a `markClientSeen` és a Realtime/polling közötti timing race condition. Amikor Realtime esemény jön, `loadAllData()` újrarakja `D.messages`-t, közben `D.seenMsgs` is settings-ből → egy pillanatra inkonzisztens.

**Fix v2.36.0**: A receptúra (#11) és vevő (#8) Realtime stratégia egységesítése csökkenti a race condition esélyét. A debounce 500ms (volt 100ms) elegendő hogy az állapotok konzisztens módon jöjjenek be.

**TODO további javítás**: timestamp-alapú validáció (`D.messagesLoadedAt > D.seenMsgsLoadedAt`) — későbbi commit-ban.

---

## #8 — Vevő app Realtime hiánya — admin válasz ~1 perc késleltetéssel

**Verzió**: v2.36.0 (2026-05-26)
**Kategória**: State-sync (C)
**Tünet**: Admin válaszüzenete csak ~1 perc múlva jelenik meg a vevő appban.

**Gyökér ok**: Vevő app csak 30s polling-ot használt, nem Realtime subscription-t (mint az admin).

**Fix**: `sb.subscribe(['messages', 'order_status', 'products', ...])` hozzáadva a vevő app login flow-jához. Debounce-olt reloadVevoData.

**Prevenciós tanulság**: lásd #11.

---

## #9 — In-app üzenet jelzés vevőnél (új feature, nem bug)

**Verzió**: v2.36.0 (2026-05-26)
**Kategória**: UX (E)
**Mit nyer**: Új admin üzenet érkezésekor (Realtime trigger-rel) felül megjelenik egy KEREK-zöld csúszó banner, 8s auto-hide-dal. Kattintásra megnyitja az üzenetek panelt.

**Pattern**: `showAdminMsgBanner()` függvény a vevo-data.js-ben. A Realtime callback megszámolja az üzeneteket előtte/utána, és csak ha nőtt a szám INSERT eseménynél, akkor jelenít meg banner-t.

---

## #12 — Favicon 404 + mobile-web-app-capable deprecated

**Verzió**: v2.36.0 (2026-05-26)
**Kategória**: UX kozmetika (E)
**Fix**:
- `favicon.svg` létrehozva (KEREK teal kör, arany "K" betűvel)
- `<link rel="icon" type="image/svg+xml" href="favicon.svg">` mindhárom HTML head-jébe
- `<meta name="mobile-web-app-capable" content="yes">` hozzáadva a vevo.html-be (kiegészíti az `apple-` prefixet)

---

## #4 — Tooltip rendszer (új feature)

**Verzió**: v2.36.0 (2026-05-26)
**Kategória**: UX (E)
**Mit nyer**: Minden ikon-gomb hover-on egy szép kis tooltip-et mutat ("Szerkesztés", "Archiválás", stb.) — pure CSS, no JS, mobil long-press-szel is működik.

**Pattern**: `data-tip="..."` attribútum az elemen → `kerek-styles.css` `[data-tip]:hover::after` szabály mutatja a tooltip-et 0.4s késleltetéssel.

A meglévő `title="..."` attribútumok automatikusan duplikálva `data-tip`-ben → backward compatible.

---

# 🚦 KONVENCIÓK (v2.36.0+)

### DB műveletek
- ❌ TILTOTT: `sb.upsert(table, {...obj, ...}, key)` és `sb.update(table, {...obj}, where)`
- ✅ HELYES: `sb.updateFields(table, { explicitField1: val1, ... }, where)`
- Új rekord létrehozásánál ID-szekvencia ütközés ellen: `nextId = MAX(id) + 1` explicit

### CSS
- ❌ TILTOTT: inline `style="..."` modal, form, sticky pozícióhoz HTML-ben
- ✅ HELYES: `.modal`, `.form-row`, `.form-group`, `.sticky-bottom-bar` class-ok a `kerek-styles.css`-ből
- DO NOT CHANGE kommentek a kényes szabályoknál — előzze meg a refaktor-regressziót

### State sync
- ❌ TILTOTT: különböző modulok különböző sync mechanizmussal (Realtime + polling vegyesen)
- ✅ HELYES: Realtime subscription minden modulban, debounce-olt full-reload, polling csak backup
- Új tábla bevezetésekor: hozzá kell adni mindhárom modul `*_RT_TABLES` listájához

### Navigáció / eseménykezelés
- ❌ TILTOTT: `getAttribute('onclick').indexOf(...)` mintázat
- ✅ HELYES: `data-action="..."` és `data-arg1="..."` attribútumok keresése
- Tooltipek: `data-tip="..."` attribútum + `[data-tip]:hover` CSS

### Adatforrások
- Ha CRUD operation több forrást érint (pl. settings + actual usage), a render az **uniót** mutassa
- Pattern: `const all = [...new Set([...src1, ...src2])].sort();`

### iOS safe-area
- Minden `position:fixed; bottom:0` elem: `padding-bottom: max(default, env(safe-area-inset-bottom));`
- Body padding-bottom: `calc(default + env(safe-area-inset-bottom))`
