---
name: kerek-workflow
description: Fejlesztési munkamód KEREK pékség rendeléskezelő rendszerhez. Használd ezt a skillt MINDEN alkalommal amikor a KEREK projekten dolgozol — GitHub: komsacsongor/kerek-rendeles, Supabase: lfaxeihrmiylggahougl.supabase.co, Hosting: komsacsongor.github.io/kerek-rendeles. Tartalmazza a bevált munkamódszert, projekt struktúrát, kerülendő hibákat, bug history-t (25 bug), és a részletes roadmapet.
---

# KEREK – Fejlesztési Skill & Kontextus

---

## 1. Mi a KEREK?

A KEREK egy **gyergyószentmiklósi gluténmentes pékség** (Románia, Hargita megye). Személyes vállalkozás, amely kézzel készített, egészséges, mikrobiom-tudatos pékárukat gyárt és értékesít saját vevőkörnek.

**Üzleti modell:**
- Nem bolti értékesítés – előrendeléses, zárt vevőkör
- Vevők havonta leadják rendeléseiket, a pékség meghatározott sütési napokon süt
- Személyes átvétel: Str. Főutca 1, Gyergyószentmiklós
- Jelenlegi kapacitás: ~30 aktív vevő, hetente 2-3 sütési nap (Kedd, Péntek, Szombat)

**Termékpaletta:** gluténmentes kenyerek, perec, kifli, bagett, sütemények, tészta, fermentált termékek

**Szlogen:** *"My health. My value!"*

**Miért épült ez a rendszer?** WhatsApp-on és telefonon ment a rendeléskezelés – ami 10 vevő felett kaotikussá vált. Szükség volt saját, egyedi megrendelő rendszerre ami: mobilon is jól működik, nem igényel appboltot (PWA), és a pékségre van szabva (nem generikus webshop).

---

## 2. ⚠️ Fejlesztési munkamód – kötelező szabályok

### Gondolkodásmód
- Minden feladatnál először értsd meg a teljes képet, ne csak az adott részt
- Mielőtt kódolsz, járd végig a teljes user flow-t fejben – edge case-ekkel együtt
- Ha egy feladatnak több érintett fájlja/modulja van, olvasd el mindegyiket mielőtt elkezdesz

### Tervezési fázis (kötelező minden új funkciónál)
- Írj egy rövid vázlatot: mit fogsz változtatni, miért, milyen edge case-eket látsz
- Várj jóváhagyásra mielőtt kódolsz
- Példa: "Tervezem: X-et megváltoztatom Y-ra mert Z. Edge case: ha A akkor B. Érinti: fájl1.js, fájl2.js"

### Batch munka
- Minden kapcsolódó változtatást egyetlen commitban pusholj
- Ne küldj diagnosztikai kódot külön, majd javítást külön
- Ha tesztelés közben több hibát találsz, gyűjtsd össze és egyszerre javítsd

### Válasz stílus
- Ne magyarázd el lépésenként mit csinálsz – csak a végeredményt közöld
- Ha valamit nem értesz vagy hiányzik az információ, kérdezz – ne tételezz fel
- Rövid, tömör válaszok – a hosszú magyarázat helyett a megoldás
- Ha valami nem hatékony a munkavégzésben, jelezd

---

## 3. Projekt infrastruktúra

| Szolgáltatás | Adat |
|---|---|
| GitHub | komsacsongor/kerek-rendeles (publikus) |
| Token | **Claude memóriában tárolva** (`KEREK GitHub token` — ghp_l1v3N73...) |
| Supabase | lfaxeihrmiylggahougl.supabase.co |
| Anon key | sb_publishable_prELs2iHaoj9uu-yaARPOQ_PSYe2WAN |
| Hosting | komsacsongor.github.io/kerek-rendeles |
| Deploy | GitHub push → GitHub Actions → automatikus |
| Jelenlegi verzió | **v2.39.0 (2026-05-31)** |
| Verziózás | v2.MINOR.PATCH – MINOR: új funkció, PATCH: hibajavítás |

**Fontos:** Ha push blokkolva (GitHub titkoskulcs-detektor) – a SKILL.md-ben ne legyen token, Claude memóriából vedd.

## 4. Minden session elején (KÖTELEZŐ)

```bash
TOKEN="[Claude memóriából: KEREK GitHub token]"
cd /home/claude && rm -rf kerek-rendeles && git clone "https://${TOKEN}@github.com/komsacsongor/kerek-rendeles.git"
cd kerek-rendeles && git config user.email "kerek@deploy.bot" && git config user.name "KEREK Deploy"
npm install && npx jest --no-coverage
```

---

## 5. A rendszer három fő modulja

**Admin modul** (`admin.html`) – a pékség belső felülete:
Dashboard · Sütési lista (rendelés jóváhagyás) · Vevőkezelés · Termékkatalógus · Kimutatások · Beállítások

**Vevői modul** (`vevo.html`) – a vevők felülete (PWA):
Belépés/Regisztráció egy oldalon · Havi megrendelő (desktop: tábla, mobil: kártyák) · Kategória szűrők · Termék adatlapok · Összesítő & PDF

**Receptúra modul** (`receptura.html`) – technológiai felület:
Receptek + verziókövetés · FIFO készletkezelés · Levain kalkulátor · Gyártás előkészítés · Önköltség elemzés · Malom/feldolgozás

---

## 6. Fájlstruktúra

```
index.html            → Főmenü
admin.html            → Admin felület
vevo.html             → Vevői megrendelő + PWA + Regisztráció (tab)
receptura.html        → Receptúra modul
register.html         → Önálló regisztrációs oldal (funkció integrálva vevo.html-be is)
manifest.json         → PWA manifest
sw.js                 → Service Worker (network-first cache, Supabase kizárva)
supabase.js           → Közös Supabase kliens
kerek-constants.js    → APP_VERSION, MONTHS, MONTHS_SHORT, auditLog()
kerek-styles.css      → CSS változók (:root)

js/admin-data.js      → D objektum, loadAllData(), doLogin(), initApp()
js/admin-ui.js        → nav(), RENDERS, toast(), refreshAll(), renderDashboard(),
                         updatePendingBadge() [sárga badge kliensek+rendelések]
js/admin-messages.js  → renderMessages(), updateMsgBadge(), sendAdminReply()
js/admin-baking.js    → sütési naptár, confirmDay(), statusBadge()
js/admin-orders.js    → renderOrders(), CSV export
js/admin-catalog.js   → saveProduct(), renderCatalog(), renderFamilies()
js/admin-clients.js   → _clientCard(), renderClients() [aktív + deaktivált szekció],
                         approveClient(), deleteClient() (soft delete!), restoreClient()
js/admin-reports.js   → renderReports() [archivált termékek is], renderAuditLog()
js/admin-settings.js  → saveSetting(), changePassword()
js/admin-help.js      → renderAdminHelp()

js/receptura-data.js        → R objektum, initApp(), DB loading
js/receptura-ui.js          → calcScaleFactor(), getFifoPrice(), renderCostAnalysis()
js/receptura-recipes.js     → renderRecipes(), renderRecipeDetail()
js/receptura-settings.js    → refreshR(), openStockIntakeModal(), confirmStockIntake()
js/receptura-modal.js       → openRecipeModal()
js/receptura-ai.js          → saveRecipe(), newRecipeVersion()
js/receptura-stock.js       → renderStock(), renderStockAlerts(), generateShoppingList()
js/receptura-production.js  → calcProductionPrep(), confirmBakingDone(), openExperimentalBake()
js/receptura-processing.js  → initProcessingView(), saveProcessingLog()
js/receptura-levain.js      → calcLevainDaily(), recordLevainBatch()
js/receptura-operational.js → renderOpSelect(), renderOpDetail()
js/receptura-help.js        → renderRecepturaHelp()

js/vevo-data.js    → appData, doLogin() (email/kód/névvel), initApp(),
                     switchAuthTab(), doRegister(), installPWA(), _fillFooterVersion()
js/vevo-ui.js      → buildMonthSelectors() [MONTHS_SHORT mobilon],
                     showProductModal() [history.pushState], closeModal() [popstate],
                     getActiveProds()
js/vevo-orders.js  → renderOrderTable() [desktop, kategória-elválasztóval],
                     renderMobileOrderCards() [B+C+D: tab+sticky+kártyák],
                     renderCategoryTabs(), filterCategory(), mobChangeQty(),
                     saveOrder(), copyLastOrder()
```

---

## 7. Supabase táblák

```
products:           id, name, weight, price, category, description, image, code,
                    marketing_desc, ingredient_label, allergens, nutrition,
                    product_family_id, deleted_at
                    ⚠️ type oszlop NEM LÉTEZIK

clients:            id (belépési kód = KER-XXXX-XXXX), name, email, phone,
                    join_date, notes
                    ⚠️ active oszlop NEM LÉTEZIK
                    Pending:  name = '[PENDING] Valaki'
                    Deleted:  name = '[DELETED] Valaki' (soft delete!)
                    Email: UNIQUE constraint (clients_email_unique)

recipes:            id (manual), name, category, product_id (FK→products),
                    base_portion, bake_loss, unit_weight, temp1,time1,temp2,time2,
                    description, levain_amount, labor_h, electricity,
                    marketing_desc, ingredient_label, allergens, nutrition,
                    version (int), activated_at (timestamptz)

ingredients:        id, name, category, sub_type, min_stock_auto_g, max_stock_auto_g,
                    min_stock_override_g, max_stock_override_g, lead_time_days,
                    order_cycle_days, safety_factor, base_price_per_g

ingredient_batches: id, ingredient_id (FK), received_date, qty_received_g,
                    qty_remaining_g, price_per_g, supplier_name,
                    source_type (purchase|processing), processing_id, notes

ingredient_processing: id, date, labor_minutes, inputs(JSONB), outputs(JSONB),
                       total_input_cost, notes

production_logs:    id, date, log_type (customer|internal|experimental),
                    recipe_id, pieces_planned, pieces_actual,
                    ingredient_usage(JSONB), total_cost, notes

order_status:       client_id, year, month, day, status, admin_note, deadline,
                    confirmed_at
                    Státuszok: pending|confirmed|modified|fulfilled|cancelled

invitations:        token, used, created_at, expires_at
                    (nem aktív – regisztráció token nélkül működik)

audit_log, clients, orders, messages, baking_calendar,
monthly_active_products, settings, recipe_ingredients, recipe_steps,
stock_corrections
```

---

## 8. Kritikus architektúrális szabályok

### Adatfolyam
```
Vevő → vevo.html → Supabase (orders tábla)
Admin → admin.html → Jóváhagyja → order_status: confirmed
Receptúra → production_logs → Készlet levonat → order_status: fulfilled
```

### Készlet (FIFO)
```
Bevételezés → ingredient_batches INSERT
Készlet     = SUM(qty_remaining_g) WHERE ingredient_id=X AND qty_remaining_g>0
FIFO ár     = legrégebbi batch price_per_g
Levonat     = FIFO sorrend, batch-enként qty_remaining_g csökkentése
⚠️ R.stock DEPRECATED – csak ingredient_batches!
```

### Scale factor (KRITIKUS!)
```javascript
// HELYES – bakeLoss NÉLKÜL (recept már tartalmazza)
function calcScaleFactor(recipe, pieces) {
  return (pieces * (recipe.unitWeight || recipe.basePortion)) / recipe.basePortion;
}
// calcRawWeight() csak megjelenítéshez! (tartalmaz bakeLoss-t)
```

### Vevő soft delete
```
Törlés    → name = '[DELETED] Valaki'  (nem valódi DELETE!)
Pending   → name = '[PENDING] Valaki'  (admin jóváhagyás előtt)
Visszaáll → restoreClient() → prefix eltávolítása
Login blokk: startsWith('[PENDING]') || startsWith('[DELETED]')
```

### Vevő bejelentkezés (3 módon)
```javascript
client.id === val ||                         // belépési kód
client.email?.toLowerCase() === valLower ||  // email
client.name.toLowerCase() === valLower       // teljes név
```

### Rendelési státusz gép
```
PENDING → CONFIRMED  (admin jóváhagyja)
CONFIRMED → PENDING  (vevő módosítja)
CONFIRMED → FULFILLED (sütés elvégezve, receptúra modul)
* → CANCELLED        (admin visszavonja)
```

### Mobile vs Desktop renderelés
```javascript
function isMobile() { return window.innerWidth <= 640; }
// Desktop: renderOrderTable()        → HTML tábla, kategória-elválasztóval
// Mobil:   renderMobileOrderCards()  → kártyák, B+C+D kategória tab sticky fejléccel
// MONTHS_SHORT mobilon, MONTHS desktopon (buildMonthSelectors)
```

### mob-locked CSS (KRITIKUS!)
```css
/* CSAK az input gombokat blokkolja – a termékinfó mindig kattintható! */
.mob-locked { opacity: 0.6; }
.mob-locked .mob-qty-btn,
.mob-locked .mob-qty-display,
.mob-locked input { pointer-events: none; opacity: 0.5; }
/* ⚠️ NE tedd pointer-events:none az egész .mob-locked divra! */
```

### PWA
```
manifest.json → start_url: /kerek-rendeles/vevo.html, standalone
sw.js         → network-first, Supabase API kizárva a cache-ből
icons         → img/icon-192.png, icon-512.png, apple-touch-icon.png
               (csak pöttyös logó, KEREK felirat nélkül)
Frissítés     → automatikus háttérben, nem kell reinstall
```

### Kulcs formátumok
```javascript
mk(year, month)     → "2026-4"   // admin (0-indexed hónap!)
getKey(month, year) → "2026-4"   // vevo – FORDÍTOTT paraméter sorrend!
// dateStr: MINDIG local date, soha ne toISOString() → timezone bug!
```

---

## 9. Szintaxis ellenőrzés (minden push előtt)

```bash
# JS fájlok
for f in js/*.js; do
  node -e "const fs=require('fs'),vm=require('vm');try{new vm.Script(fs.readFileSync('$f','utf8'));console.log('$f OK');}catch(e){console.log('HIBA: '+e.message);}";
done

# HTML scriptek
for f in admin.html vevo.html receptura.html index.html register.html; do
  node -e "const fs=require('fs'),vm=require('vm');const h=fs.readFileSync('$f','utf8');const s=h.match(/<script[^>]*>([\S\s]*?)<\/script>/g)||[];let ok=true;s.forEach((sc,i)=>{try{new vm.Script(sc.replace(/<\/?script[^>]*>/g,''));}catch(e){console.log('$f['+i+']: '+e.message);ok=false;}});if(ok)console.log('$f OK');"
done

# Megbízhatóbb syntax check (browser context függvények ReferenceError-t dobnak, ez normális):
node --input-type=module < js/vevo-data.js 2>&1 | grep -v "ReferenceError\|window is not\|document is not"

npx jest --no-coverage
```

## 10. Version bump + push

```python
import re, datetime
NEW_VER = "X.Y.Z"
DATE = datetime.date.today().strftime("%Y-%m-%d")
for f in ['kerek-constants.js']:
    c = open(f).read()
    c = re.sub(r"APP_VERSION = 'v[\d.]+ \([^)]+\)'", f"APP_VERSION = 'v{NEW_VER} ({DATE})'", c)
    open(f, 'w').write(c)
for f in ['admin.html', 'receptura.html', 'vevo.html', 'index.html', 'register.html']:
    c = open(f).read()
    c = re.sub(r'(\?v=)[\d.]+"', rf'\g<1>{NEW_VER}"', c)
    open(f, 'w').write(c)
```

```bash
TOKEN="[Claude memóriából]"
git add -A && git commit -m "feat/fix: leírás (vX.Y.Z)"
git push "https://${TOKEN}@github.com/komsacsongor/kerek-rendeles.git" main
```

---

## 11. ⚠️ Push előtti kötelező verifikáció (UI változásnál)

### 1. String egyezés igazolása (módosítás ELŐTT)
```bash
grep -n "KERESETT_STRING" érintett_fájl.html
sed -n 'START,ENDp' érintett_fájl.html
```
Ha a string nem egyezik 100%-ban → ne feltételezd, olvasd el a tényleges tartalmat.

### 2. Nav item hozzáadásnál
```bash
grep -n "nav-item" admin.html | head -20
grep -n "nav-item" receptura.html | head -20
```

### 3. View div hozzáadásnál
```bash
python3 -c "
with open('admin.html') as f: lines = f.readlines()
print(''.join(lines[-15:]))"
```

### 4. RENDERS bejegyzés ellenőrzése
```bash
grep -n "RENDERS\|nav.*=>\|'view-name'" js/admin-ui.js
grep -n "RENDERS\|nav.*=>\|'view-name'" js/receptura-ui.js
```

### 5. Konstans duplikáció ellenőrzése (KRITIKUS!)
```bash
# Mielőtt új const-ot deklarálsz:
grep -rn "const ÚJ_VÁLTOZÓ" js/ kerek-constants.js
```

### 6. Deploy után: console ellenőrzése
```
read_console_messages toolon – MINDIG ellenőrizd, ne csak a screenshotot
?v=XXXX cache bypass-szal tesztelj
```

### 7. Push előtt nyilatkozat
```
✅ Érintett fájlok elolvasva grep/sed-del
✅ String egyezések igazolva
✅ Nincs duplikált konstans deklaráció
✅ View div / nav item / RENDERS igazolva (ha UI változás)
✅ Syntax check OK (node --input-type=module)
✅ Jest OK
```

---

## 12. Elkerülendő hibák (tanult hibák)

| Hiba | Helyes megoldás |
|---|---|
| `toISOString()` timezone bug | Mindig local dateStr |
| `products.type` használata | NEM LÉTEZIK a DB-ben |
| `clients.active` használata | NEM LÉTEZIK – soft delete prefix alapú |
| `calcRawWeight()` ingredient számításhoz | TILOS – bakeLoss-t tartalmaz! |
| `R.stock` használata | DEPRECATED – csak `ingredient_batches` |
| Supabase filter vesszővel | `&` kell: `year=eq.X&month=eq.Y` |
| `const` scope hiba template string-ben | Definiáld `return`/template előtt |
| Duplikált `const` deklaráció | Mindig grep-pel ellenőrizd előtte |
| `.mob-locked { pointer-events:none }` egész div-re | Csak inputokra alkalmazd |
| `vm.Script(repr(code))` backtick template literállal | File-alapú tesztelést használj |
| `MONTHS_SHORT` deklarálása | Már `kerek-constants.js`-ben van! |
| `getKey(month, year)` paraméter sorrend | Fordított sorrendű mint `mk(year, month)` |

---

## 13. Hátralévő fejlesztések

| # | Feladat | Prioritás |
|---|---|---|
| 1 | U4 Fizetési állapot tracking | Közepes |
| 2 | U3 Napi kapacitás limit | Közepes |
| 3 | Push értesítések (Web Push+VAPID) | Alacsony |
| 4 | DB reset + termékárak javítása | Élesítés előtt |
| 5 | +/- gomb tesztelés jövőbeli napon | Folyamatban |
| 6 | Technológus nézet fejlesztése | Középtáv |
| 7 | Valódi e-mail értesítés (reg. kód) | Középtáv |

---

## 14. Fejlesztési történet (röviden)

- **v1.x** – Alapok: rendelési tábla, Supabase integráció
- **v2.0–2.10** – Receptúra modul: FIFO készlet, levain, gyártás, önköltség
- **v2.11–2.20** – Stabilitás: 14 audit hiba javítása, soft delete, rate limiting
- **v2.21** – Vevő önregisztráció: `[PENDING]`/`[DELETED]` prefix, email UNIQUE, 3 belépési mód
- **v2.22** – PWA + mobiloptimalizáció: manifest, service worker, kategória tab-ok, hónap rövidítés, badge auto-update, deaktivált vevők szekció

---

## 15. Belépési adatok & arculat

**Belépés:**
- Admin + Receptúra: `admin`
- Demo vevők: `kovacs-anna`, `nagy-peter`, `szabo-maria`, `KER-RTZK-2CVX`

**Brand:**
```
Font elsődleges:   Fraunces (fejlécek, serif, italic)
Font másodlagos:   Kodchasan (UI elemek)
Teal dark:         #064C48  (--teal-dark)
Gold:              #EFB036  (--gold)
Teal:              #129990  (--teal)
Logo:              pöttyös mintázat + KEREK felirat – ne írd ki külön szövegként
PWA ikon:          csak a pöttyös logó, KEREK felirat nélkül, teal háttéren
```

---

## 16. Kulcsdöntések és indoklásuk

**Vanilla JS keretrendszer nélkül** → Nincs build step, nincs bundle, GitHub Pages elegendő. Egy kisüzemi pékség számára optimális egyensúly.

**`[PENDING]`/`[DELETED]` prefix** az `active` boolean helyett → Supabase schema cache lassan frissül, `ALTER TABLE ADD COLUMN` nem mindig tükröződik azonnal. A prefix megkerüli ezt.

**FIFO önköltség** átlagár helyett → A legrégebbi alapanyag árazása adja a legpontosabb valós önköltséget.

**0-indexed hónap admin-ban, fordított paraméter sorrend vevőnél** → Örökölt technikai adósság. Dokumentálva van, megváltoztatni nagy kockázattal jár az összes kulcsgenerálás miatt.

**Konverzációs fejlesztés Claude AI-val** → Iteráció gyorsabb mint klasszikus fejlesztéssel, de nagyobb fegyelmet igényel a push előtti verifikációban.


---

## 17. ⭐ Session tanulságok (v2.36.0 → v2.39.0) — KIEGÉSZÍTÉS

Az alábbi szekciók a 2026-05-26 → 2026-05-31 közötti session-ek tanulságait összegzik. A korábbi (1–16) szekciók szabályai TOVÁBBRA IS ÉRVÉNYESEK — ezek kiegészítik őket.

### 17.1 Új verziók történet

| Verzió | Tartalom |
|---|---|
| **v2.36.0** | 13-bug audit batch — `sb.updateFields` helper, központi `kerek-styles.css` (modal/form/sticky), tooltip rendszer, favicon, sticky safe-area-inset, alapanyag kategóriák settings+usage union, M7 nav lookup regresszió fix |
| **v2.37.0** | 5 rendszer szintű fix — `reloadVevoData`/`reloadReceptData` helper, `sb.subscribe` unsub return, `updatePendingBadge` auto-call login után |
| **v2.38.0** ⭐ | **KRITIKUS**: Supabase Realtime postgres_changes config — eddig sosem küldött DB-change eseményeket, üzenet badge / vevő-admin / receptúra sync mind ezért nem ment Realtime-on |
| v2.38.1 | saveProduct marketingDesc undefined |
| v2.38.2 | Archiválás visszakerül fix (`D.products` vs `D.productsArchived` split), modal layout, sidebar link |
| v2.38.3 | Méret/Súly mező használhatatlan fix (97px input + 70px select) |
| v2.38.4 | Push notification desktop UX (`requireInteraction: true`), `sendPushToClient` response logging |
| v2.38.5 | reloadVevoData NaN bug (rossz mezőnevek: monthlyActive → monthlyActiveProducts) |
| v2.38.6 | updateHeroTotal NaN guard (`Number(x) \|\| 0` minden numerikus értékre) |
| **v2.39.0** | ✨ Bevásárló lista v2 — beszállítónkénti + általános, 3-szintű sürgősség, manuális override, clipboard másolás (`js/receptura-shopping.js` ~270 sor, új view + nav) |

### 17.2 Új konvenciók (kötelezőek a 12. szekció Elkerülendő hibák kiegészítése)

**17.2.1 DB műveletek anti-spread (v2.36.0-tól kötelező)**
- ❌ TILTOTT: `sb.upsert(table, {...obj}, key)` és `sb.update(table, {...obj}, where)` — a spread kliens-oldali extra mezőket DB-be küld → `PGRST204 'desc' column not found` típusú hiba (#1 bug)
- ✅ HELYES: `sb.updateFields(table, { explicitField1, explicitField2 }, where)` — csak named field-ek
- ✅ Új rekord ID-szekvencia ütközés ellen: `nextId = MAX(id) + 1` explicit kérdezés (#2 bug)

**17.2.2 CSS központosítás (v2.36.0-tól kötelező)**
- ❌ TILTOTT: inline `style="..."` modal/form/sticky pozícióhoz HTML-ben
- ✅ HELYES: `.modal`, `.form-row`, `.form-group`, `.sticky-bottom-bar` osztályok a `kerek-styles.css`-ben
- ⚠️ KRITIKUS: `.form-group > input/select/textarea` (DIRECT child only — nested flex containers preserved, lásd #20 bug)
- `DO NOT CHANGE` kommentek a kényes szabályoknál (modal max-width, form-group min-width, safe-area-inset)
- iOS safe-area: `padding-bottom: max(default, env(safe-area-inset-bottom))` minden fix-bottom elemen

**17.2.3 State sync egységesítés (v2.37-38.0-tól)**
- Egységes Realtime subscription minden modulban (admin + vevő + receptúra)
- Új tábla bevezetésekor: hozzá kell adni mindhárom modul `*_RT_TABLES` listájához
- **+ Supabase oldalon kötelező**: `ALTER PUBLICATION supabase_realtime ADD TABLE <table>;` — különben WS open van, de NEM jönnek események (#17 bug gyökér oka)
- A Realtime callback használjon **`reload*Data()` helper-t**, NEM `loadAllData()`-t (ha az nincs window scope-ban, mint a receptúrában)

**17.2.4 Navigáció event delegation (v2.33.0 M7-től)**
- ❌ TILTOTT: `getAttribute('onclick').indexOf(...)` lookup minta — törékeny, M7 csendben elronthatja (#6 bug)
- ✅ HELYES: keresés mind `onclick`, mind `data-action="..." data-arg1="..."` alapján
- Új gombok: `data-action="..."` + `data-arg1="..."` (a `kerek-constants.js` delegátor kezeli)

**17.2.5 NaN guard (v2.38.6-tól kötelező)**
- Minden numerikus értékre: `Number(x) || 0` fallback
- A `qty`, `price`, `stock` lehetnek string-ek a localStorage-ből — explicit konverzió
- Példa: `total += (Number(p.price) || 0) * (Number(qty) || 0); total = Number(total) || 0;`

**17.2.6 Adatforrás-union (v2.36.0-tól)**
- Ha CRUD több forrást érint (settings + usage), a render mindig az **uniót** mutassa
- Pattern: `[...new Set([...src1, ...src2])].sort()` (#10 bug)

**17.2.7 Tooltip rendszer (v2.36.0-tól)**
- `data-tip="..."` attribútum + `kerek-styles.css [data-tip]:hover` CSS
- Backward compatible: ha van `title="..."`, az duplikálódik `data-tip`-be is (Python regex)
- Mobil: `@media (hover: none)` long-press szabály

**17.2.8 Idempotens SQL migration (új konvenció)**
A felhasználó futtatja az SQL-t a Supabase Dashboardban. Mindig **idempotens DO block** formában:

```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='X' AND column_name='Y') THEN
    ALTER TABLE X ADD COLUMN Y ...;
  END IF;
END $$;
```

Mert a felhasználó újra futtathatja és nem dob hibát ha már létezik. Az `ALTER PUBLICATION` esetén is hasonló (lásd a session-ben futtatott DO block).

### 17.3 Új modulok (v2.36.0+)

**kerek-styles.css** (211+ sor, központi CSS)
- Modal/form/sticky/tooltip/anchor-nav szabályok
- DO NOT CHANGE kommentek a kényes szabályoknál
- iOS safe-area-inset támogatás

**supabase.js bővítések**
- `sb.updateFields(table, fields, filter)` — anti-spread helper (v2.36.0)
- `sb.subscribe(tables, callback)` — most már unsub function-t ad vissza (v2.37.0)
- `phx_join` payload `postgres_changes` config (v2.38.0)
- `onmessage` kezeli mind a régi (közvetlen INSERT/UPDATE event) ÉS az új (postgres_changes wrapper) formátumot

**kerek-constants.js bővítések**
- `confirmDialog()`, `alertDialog()` — custom modal dialógusok (M5)
- `data-action` event delegátor (M7)
- `sendPushToClient(clientId, type, title, body)` — response logging (v2.38.4)
- `sendPushBroadcast(type, title, body)` — minden subscribe-er

**Új JS modulok**
- `js/admin-help.js`, `js/receptura-help.js` — Súgó tartalom
- `js/receptura-shopping.js` (v2.39.0 — 270 sor) — Bevásárló lista v2

**Új edge functions**
- `dynamic-service` — Push notification küldés (Web Push), stale 410/404 cleanup
- `admin-auth` — Admin jelszó-check (admin_secrets, v2.30.0+)
- `auto-confirm-orders` — Pending → confirmed deadline után

### 17.4 Új DB táblák (v2.30+)

```
push_subscriptions:    id, client_id, endpoint, p256dh, auth, created_at
admin_secrets:         key, value (encrypted)
processing_batches:    id, operation_type, recipe_id, processing_date, status
processing_inputs:     id, batch_id, ingredient_id, qty_g, source_batch_id
processing_outputs:    id, batch_id, ingredient_id, qty_g, target_batch_id
ingredient_families:   id, name, common_unit, description
ingredient_milling_profile: id, ingredient_id, yield_ratio_typical, processing_loss_pct
```

**Realtime publikációban**: messages, orders, order_status, products, monthly_active_products, baking_calendar, recipes, recipe_ingredients, ingredients, ingredient_batches, processing_batches.

### 17.5 ⚠️ Mértékegység-probléma (ÚJ — még nem javítva)

**Probléma**: jelenleg minden alapanyag g-ban van tárolva (`qty_remaining_g`, `min_stock_g`, `max_stock_g`). De a valóságban:
- Liszt: kg-ban veszik (25 kg, 50 kg zsák)
- Tej, olaj, ecet: liter-ben
- Tojás: db-ban
- Élesztő, sütőpor: csomag-ban
- Csomagolás: db / csomag

**Felhasználói panasz**: "A bevételezéskor megadott mennyiséget kell hoznia a végén."

**Megoldás** (M0 a roadmap-en): új `ingredients.unit` mező + `unit_to_g_ratio`. Bevétel az adott unit-ban, DB-ben g-ban tárol, kijelzésnél visszakonvertál. Részletes terv a 19. szekcióban.

---


### 17.6 ⚠️ Claude-specifikus fejlesztési tanulságok (új session-eknek)

Ez a szekció az AI-fejlesztés során feltárt módszertani csapdákat és azok megoldásait gyűjti. Új session induláskor olvassa el akármelyik Claude-instance.

**17.6.1 Dead code és deprecated hivatkozások eltakarítása**

Refaktor során sokszor új helper-t vezetünk be a régi mellé (pl. `loadAllData` → `reloadReceptData`, `R.stock` → `ingredient_batches`). Probléma: a régi név hivatkozásai itt-ott megmaradnak, és csendben `ReferenceError`-t dobnak Realtime callback-ekben.

**Szabály**: minden refaktor commit-jában `grep -rn` ellenőrzés a régi névre az ÖSSZES JS-ben:
```bash
grep -rn "loadAllData\|R\.stock\|monthlyActive[^P]\|bakingExtra\|bakingRemoved" js/
```
Ha találat van: vagy átírni az új névre, vagy `// DEPRECATED v2.X.Y` komment + tényleges törlés a következő release-ben.

**Konkrét csapdák ami már megtörtént**:
- `loadAllData()` a Realtime callback-ben létezett a kódban, de `window` scope-ban nem volt → `ReferenceError` némán (lásd #11)
- `R.stock` deprecated, de még 8 helyen volt hivatkozva → eredmény: néha stale adat
- `appData.monthlyActive` (rossz név) használata a `reloadVevoData`-ban, miközben a render `monthlyActiveProducts`-ot vár (#24)

**17.6.2 Field-name konzisztencia loadAllData ↔ reload*Data között**

Amikor új `reload*Data()` helper-t írunk Realtime-hoz, **NE fejből írjuk a mező-mappingot**. A `loadAllData()` 100%-ban autoritatív — copy-paste a mapping logikát, NE rekonstruáljuk.

**Kötelező pre-write check**:
```bash
# A loadAllData products mappingja:
grep -B 1 -A 15 "sb.query('products'" js/admin-data.js
# Az új reloadVevoData EZT KELL leképezze, NEM kitalálni a mezőket
```

A v2.38.5 NaN bug pontosan ezért történt: kitaláltam `image_url` mezőt, miközben a `loadAllData` `image`-et használ. **Ennyi**.

**17.6.3 Vissszatérő bug-pattern: ne ismételd a hibákat**

5 hibakategória, ahonnan a session bug-ok 90%-a jött:

| Pattern | Mit jelent | Megelőzés |
|---|---|---|
| **A) Schema-mismatch** | `{...obj}` spread DB-be, ami kliens-oldali extra mezőket küld | KONVENCIÓ 17.2.1: `sb.updateFields` kötelező |
| **B) CSS-regresszió** | Központi szabály felülír nested layout-ot | KONVENCIÓ 17.2.2: `> direct child` scope + DO NOT CHANGE komment |
| **C) State-sync** | Realtime/polling/cache verseny stale adat-tal | KONVENCIÓ 17.2.3: egységes `reload*Data` helper, `postgres_changes` config kötelező |
| **D) Init flow gap** | Login után egy badge/banner/state nem inicializálódik | post-login `initIndicators()` helper minden indikátorra |
| **E) Field-name inkonzisztencia** | UI és DB mező-nevek eltérése (`image` vs `image_url`) | 17.6.2 — loadAllData az autoritatív forrás |

Új bug-jelentésnél először kategorizáld (A-E), aztán nézd meg a 12. és 18. szekciókat — gyakran már ismerjük a pattern-t.

**17.6.4 Browser MCP-takarékosság**

A Claude Browser MCP **4 perces timeout-tal lefagy** ha sok WS-event vagy notification van a sessionben. A v2.38.0 deploy után és a v2.38.4 push deploy után ez kétszer is megtörtént.

**Szabály**:
- Ne csinálj rutin screenshot-okat (`computer screenshot`) — csak ha vizuális verifikáció **kötelező** (CSS regresszió, ténylegesen látható elem)
- State-ellenőrzéshez használj `javascript_exec`-et: `document.getElementById('X')?.textContent`, `appData.products.length`, `getTotalStock(ing)`
- Több művelet egyetlen `browser_batch`-ben — ez 1 round-trip ↔ MCP-stabilitás
- Ha az MCP lefagy: NE retry-old 4 perces timeout-tal. Helyette ellenőrizd a `tabs_context_mcp`-vel, várj, próbáld egyetlen kis hívással

**17.6.5 Image limit (100/session) takarékosság**

A Claude.ai 100 kép / PDF oldal limit session-szintű. Egy session-ben **45-55 screenshot** simán összejön ha minden teszt-után `screenshot`. Plusz a project knowledge PDF oldalai, asset PNG-k.

**Szabály**:
- Egy verifikáció = egy screenshot, NEM kettő
- `javascript_exec` ad meg pontosabb state-info-t mint screenshot — ha lehet, azt használd
- Új session indítása előtt mentsd ki a fontos artefaktokat outputs-ba

**17.6.6 Verzió-bump minden release-nél kötelező**

A PWA cache-ben régi JS marad ha nem bump-olunk. Tünet: a felhasználó hard refresh-szel sem látja az új kódot. A `sw.js` `CACHE_NAME` változás **deaktiválja** az előző cache-t, ez kritikus.

**Kötelező 3 hely**:
1. `kerek-constants.js` → `APP_VERSION = 'vX.Y.Z (YYYY-MM-DD)'`
2. Minden HTML (5 db) `?v=X.Y.Z` query (admin, vevo, receptura, index, register)
3. `sw.js` → `const CACHE_NAME = 'kerek-vX.Y.Z'`

A 10. szekcióban van a Python script. Egy session-en belül HA több release megy, MINDEN release a saját verzió-bumpját kell adja. Soha ne küldj két fix-et ugyanazon verzió alatt.

**17.6.7 Git push verifikáció**

A felhasználói preferencia: batch commit (1 commit = 1 release). De néha elgépelés-bug van (`keke-rendeles` helyett `kerek-rendeles`). Mindig ellenőrizzem a push outputot — a "fatal: repository not found" vagy "Repository not found" jelzi a problémát.

**Pattern**:
```bash
git push "https://${TOKEN}@github.com/komsacsongor/kerek-rendeles.git" main 2>&1 | tail -3
# A "main -> main" sor a sikeres push jele
```

Ha bizonytalan: `curl github.com/repos/.../commits/main` API-val verifikálni a legutóbbi commit SHA-t.

**17.6.8 Tervezet-jóváhagyás munkamód (felhasználói preferencia)**

Nagyobb feature (>100 sor új kód) előtt **kötelező** rövid tervezet, várjon jóváhagyásra. Pl.:
> "Tervezem: új view `view-shopping` + `js/receptura-shopping.js` (~270 sor). Funkciók: beszállítónkénti+általános, 3-szintű sürgősség, manuális override, clipboard. Érinti: `receptura.html` (nav + view), `js/receptura-ui.js` (VIEW_TITLES + nav handler). Edge case: 22 orphan alapanyag → külön '⚠️ Beszállító megadva nincs' csoportba."

Ne kezdj kódolni mielőtt a felhasználó bólint vagy módosít.

---
## 18. Nyitott bugok és anti-pattern könyvtár

> A korábbi 25 bug-ot ELVÉGEZTÜK (v2.36.0–v2.39.0 javítva). A részleteket lásd git history-ban. Ez a szekció CSAK a **nyitott** bugokat és a tematikus **anti-pattern** csoportokat sorolja — a tanulság fontosabb mint a konkrét bug.

### 18.1 Nyitott bugok (még javítandók)

| # | Tünet | Kategória | Prio | Megjegyzés |
|---|---|---|---|---|
| **#7** | Üzenet badge race — néha eltűnik mielőtt a felhasználó látta | C) State-sync timing | Közepes | v2.36.0 részleges fix (500ms debounce). TODO: timestamp-validáció `D.messagesLoadedAt > D.seenMsgsLoadedAt` |
| **#14** | Tooltip nem mindig működik egyes gombokon | B) CSS | Alacsony | Felhasználói jelentés, képernyőmentés kell hogy melyik gomb. Gyanú: `position:relative` parent, `overflow:hidden`, z-index conflict |

### 18.2 Anti-pattern könyvtár (5 visszatérő kategória)

Új bug-jelentésnél kategorizáld először. A megoldás-pattern legtöbbször már ismert.

**A) Schema-mismatch / DB-spread**
- *Tünet típus*: `PGRST204 Could not find the 'X' column`, vagy "undefined" error mentésnél
- *Gyökér ok*: `sb.upsert/update`-be `{...obj}` spread, kliens-extra-mezőkkel; vagy a kódban felhasznált változó nincs is deklarálva
- *Fix-pattern*: KONVENCIÓ 17.2.1 — `sb.updateFields(table, {explicitField1, explicitField2}, where)` named field-ekkel

**B) CSS-regresszió**
- *Tünet típus*: visszatérő layout-bug ugyanott (modal kilóg, sticky bar lefedve, mező mérete nem stimmel)
- *Gyökér ok*: új CSS-szabály felülír egy korábbi nested layout-ot, vagy inline `style="..."` küzd a központi szabállyal
- *Fix-pattern*: KONVENCIÓ 17.2.2 — minden modal/form/sticky CSS-szabály a `kerek-styles.css`-ben, `> direct child` scope, DO NOT CHANGE komment a kényes szabályoknál, iOS safe-area-inset

**C) State-sync verseny**
- *Tünet típus*: stale adat (régi ár, törölt rekord visszajön, üzenet badge eltűnik); admin változás nem látszik vevőben
- *Gyökér okok*: Realtime sosem küld eseményt (postgres_changes config!), `reload*Data` rossz mezőneveken tárol, localStorage-snapshot felülírja a friss adatot, debounce túl rövid
- *Fix-pattern*: KONVENCIÓ 17.2.3 — egységes Realtime, postgres_changes config a phx_join payload-ba, `ALTER PUBLICATION supabase_realtime ADD TABLE` minden táblára, `reload*Data` helper a callback-ekben (NEM `loadAllData`), 500ms debounce, NE save() a Realtime reload után

**D) Init flow gap**
- *Tünet típus*: login után egy badge/banner/indikátor nem inicializálódik amíg a felhasználó nem klikkel valahova
- *Gyökér ok*: a login-flow függvény csak részleges `update*()` hívást tartalmaz
- *Fix-pattern*: post-login egyetlen `initIndicators()` helper minden frissítendő UI elemmel — egy hívás, biztos minden frissül

**E) Field-name és NaN inkonzisztencia**
- *Tünet típus*: `NaN lej`, `NaN db`, ÷0 hiba, `undefined` érték a UI-on
- *Gyökér okok*: két függvény különböző mezőnevet használ ugyanarra (`image` vs `image_url`, `monthlyActive` vs `monthlyActiveProducts`), vagy nincs Number() konverzió
- *Fix-pattern*: KONVENCIÓ 17.2.5 — `Number(x) || 0` minden numerikus értékre + 17.6.2 — `loadAllData` az autoritatív forrás field-mapping-ra

## 19. Részletes fejlesztési ROADMAP

> Prioritás: **M0/M1** (must-have most) → **S2-S6** (session-szerű) → **B1-B6** (backlog) → **L1-L8** (long-term).

### 🔴 M0 — Mértékegység támogatás (ÚJ, sürgős)

**Probléma**: minden alapanyag g-ban tárolva. Felhasználói panasz: "A bevételezéskor megadott mennyiséget kell hoznia a végén." Nem csak g/kg van, hanem L, ml, db, csomag is.

**M0.1 — DB séma kibővítés** (felhasználó futtatja Supabase SQL Editorban):
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

**M0.2 — UI változások**:
- **Alapanyag modal**: mértékegység választó dropdown
- Ha `db`/`csomag`: extra "1 egység = X g" mező
- **Bevételezés modal**: mennyiség mező + unit-lock az alapanyag default unit-jához
- **Bevásárló lista**: ajánlott mennyiség az adott alapanyag unit-jában (5 kg, NEM 5000 g)
- **Stock kijelzés**: szintén unit-ban

**M0.3 — Belső számolás**: `qty_remaining_g` MARAD g-ban (recept-kompatibilitás). Bevétel: `qty_g = input_qty * unit_to_g_ratio`. Kijelzés: `display_qty = qty_g / unit_to_g_ratio`. Recipe ingredients továbbra is g-ban.

**M0.4 — Bevásárló lista frissítés**: `fmtQty(grams, unit, ratio)` új signaturája. Clipboard: "Liszt: 25 kg", "Tojás: 30 db", "Tej: 10 L".

**M0.5 — Backward compat**: meglévő 37 alapanyag default `unit='g'` marad, felhasználó egyenként átállíthatja.

**Becsült méret**: ~400 sor új JS + DB migration + UI módosítás — egy nagy session vagy két kisebb.

### 🟡 M1 — Bevásárló lista folytatás (Session 1 hiányzó tételek)

- **M1.1** Persistent shopping overrides — `shopping_overrides` tábla, page reload után megmaradnak, "💾 Mentés" gomb
- **M1.2** Beszállító-kiosztás wizard — gyors beállítás a 22 orphan alapanyaghoz egy modal-on keresztül
- **M1.3** History-alapú min/max gomb shopping view-ban — a meglévő `calcAutoMinMax()` bevonása
- **M1.4** Akció/promóció támogatás — `ingredient_promotions` tábla, "+20% boost" jelölés
- **M1.5** Multi-format export — CSV, PDF, WhatsApp deep-link, mailto

### 🟢 S2 — Bevásárló lista v3 (EOQ + MOQ pénzügyi optimalizáció)

- **EOQ** (Economic Order Quantity): `EOQ = sqrt(2 * D * S / H)` képlet alapján
- **MOQ** beszállítónként minimum rendelési mennyiség
- **Multi-supplier priority**: új tábla `ingredient_supplier (priority, moq, lead_days, price_per_unit, last_purchase_date)`
- Beszerzési költség-kalkulátor (lej/kg rangsorolás)

### 🟢 S4 — Malom fermentáció state machine

- Folyamat: `pending` → `in_progress` → `completed` → `dried`
- Dashboard widget: "Folyamatban lévő fermentációk"
- Auto-learning yield refinement (milling_profile finomítása átlag-alapon)
- Recipe-specific yield: +66% nyersanyag bevásárló listán ha az alapanyag yield 60%

### 🟢 S5-S6 — Kísérleti sütés v2 (verziókezelés)

- `recipes.parent_recipe_id`, `recipes.status` (draft|experimental|active|archived)
- `recipe_feedback` tábla (sütésenkénti értékelés 1-5)
- Side-by-side recept diff
- Lineage map (fa-szerkezet)
- Promote workflow: experimental → active csak ≥3 sütés + ≥4 csillag átlag

### 🟢 B1-B6 — Backlog (felhasználói ötletek)

- **B1** Recept szezonalitás (`active_months INTEGER[]`)
- **B2** Recept trendelés dashboard (fel/lefelé trendelés, line graph)
- **B3** Recept önköltség-trend figyelmeztetés (>10% növekedés → admin push)
- **B4** Reverse lookup "Mire kell ez az alapanyag?"
- **B5** Beszállító teljesítmény tracking (NEM pénzügyi — átfutási idő, késési arány, minőség)
- **B6** Vevő önkiszolgáló profil — profil-szerkesztés, jelszó-cserénél email-megerősítés

### 🟢 Long-term (L)

- **L6** Playwright e2e tesztek — 1-2 napos infra, CI integráció
- **L7** i18n (Magyar + Román fordítás)
- **L8** Accessibility (WCAG 2.1 AA) — aria-label, screen reader teszt

### Hátralévő a régi listából (13. szekció kiegészítése)

| # | Feladat | Prioritás | Státusz |
|---|---|---|---|
| 1 | U4 Fizetési állapot tracking | Közepes | ❌ Még nincs |
| 2 | U3 Napi kapacitás limit | Közepes | ❌ Még nincs |
| 3 | Push értesítések (Web Push+VAPID) | ✅ KÉSZ | v2.30-2.38.4 |
| 4 | DB reset + termékárak javítása | Élesítés előtt | ⏳ Felhasználói feladat |
| 5 | +/- gomb tesztelés jövőbeli napon | Folyamatban | ⏳ |
| 6 | Technológus nézet fejlesztése | Középtáv | ⚠️ Részlegesen — receptúra modul |
| 7 | Valódi e-mail értesítés (reg. kód) | Középtáv | ❌ Még nincs |

---

## 20. Azonnal tesztelendő (v2.39.0 — felhasználói feladat)

1. **🛒 Bevásárló lista** (Receptúra → új nav) — beszállítónkénti + általános, +/- gombok, copy
2. **Realtime sync** — ár-változás, üzenet (1-3 mp)
3. **Push notification** — admin üzenet → vevő desktop tartós notification
4. **#14 Tooltip** — melyik gombnál nem működik? Képernyőmentés
5. **Más modalok** — új vevő, jelszó, alapanyag, recept (méret-ellenőrzés)
6. **Malom feldolgozás v2** (v2.34.0) smoke teszt
7. **Multi-state ingredient** (v2.35.0) smoke teszt

---

## 21. Utolsó megjegyzések

- **v2.38.0 Realtime fix** volt a 2026-05 session legfontosabb felfedezése. Mostantól a vevő/receptúra app 1-3 másodperc alatt szinkronizálódik az adminnal. Ez sok jövőbeli feature alapja.
- **A 12. szekció (Elkerülendő hibák) érvényes** — ez a fájl kiegészíti, nem helyettesíti.
- **Az M0 mértékegység-támogatás** a logikus következő lépés — enélkül a bevásárló lista UX-e zavaros marad.
- **Új session induláskor**: olvasd el a teljes fájlt, különösen a 12. (elkerülendő hibák) és a 18. (bug history) szekciókat.
