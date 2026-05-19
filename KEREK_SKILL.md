---
name: kerek-workflow
description: Fejlesztési munkamód KEREK pékség rendeléskezelő rendszerhez. Használd ezt a skillt MINDEN alkalommal amikor a KEREK projekten dolgozol.
---

# KEREK Workflow Skill

## ⚠️ FEJLESZTÉSI MUNKAMÓD – KÖTELEZŐ SZABÁLYOK

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
- Ha valami nem hatékony a munkavégzésben, jelezd – a cél a lehető legkevesebb körrel a legjobb eredmény

---

## Projekt infrastruktúra

| Szolgáltatás | Adat |
|---|---|
| GitHub | komsacsongor/kerek-rendeles (publikus) |
| Token | GITHUB_TOKEN_PLACEHOLDER (lejár: 2026-08-09) |
| Supabase | lfaxeihrmiylggahougl.supabase.co |
| Anon key | SUPABASE_ANON_KEY_PLACEHOLDER |
| Hosting | komsacsongor.github.io/kerek-rendeles |
| Deploy | GitHub push → GitHub Actions → automatikus |
| Jelenlegi verzió | v2.21.8 (2026-05-19) |
| Verziózás | v2.MINOR.PATCH – MINOR: új funkció, PATCH: hibajavítás |

## KRITIKUS: Supabase anon key
Ha push blokkolva: bypass URL-t használj, ne rewrite-old a history-t.

## Minden session elején (KÖTELEZŐ)

```bash
cd /home/claude && rm -rf kerek-rendeles && git clone https://GITHUB_TOKEN_PLACEHOLDER@github.com/komsacsongor/kerek-rendeles.git
cd kerek-rendeles && git config user.email "kerek@deploy.bot" && git config user.name "KEREK Deploy"
npm install && npx jest --no-coverage
```

## Fájlstruktúra

```
index.html            → Főmenü
admin.html            → Admin felület
vevo.html             → Vevői megrendelő
receptura.html        → Receptúra modul
register.html         → Vevő önregisztráció
supabase.js           → Közös Supabase kliens
kerek-constants.js    → Közös konstansok + APP_VERSION + auditLog()
kerek-styles.css      → CSS változók (:root)

js/admin-data.js      → D objektum, loadAllData(), doLogin(), initApp()
js/admin-ui.js        → nav(), RENDERS, toast(), refreshAll(), renderDashboard()
js/admin-messages.js  → renderMessages(), updateMsgBadge(), sendAdminReply()
js/admin-baking.js    → sütési naptár, confirmDay(), statusBadge()
js/admin-orders.js    → renderOrders(), CSV export
js/admin-catalog.js   → saveProduct(), renderCatalog(), renderFamilies()
js/admin-clients.js   → saveClient(), renderClients(), approveClient(),
                         deleteClient() (soft delete!), generateInvitation(),
                         showRegLink()
js/admin-reports.js   → renderReports(), renderAuditLog(), renderFamilyReport()
js/admin-settings.js  → saveSetting(), changePassword()
js/admin-help.js      → renderAdminHelp()

js/receptura-data.js        → R objektum, initApp(), DB loading
js/receptura-ui.js          → calcLevain(), calcRawWeight(), calcScaleFactor(),
                               getFifoPrice(), calcAutoMinMax(), renderCostAnalysis()
js/receptura-recipes.js     → renderRecipes(), renderRecipeDetail(), printRecipeDatasheet()
js/receptura-settings.js    → refreshR(), openStockIntakeModal(), confirmStockIntake()
js/receptura-modal.js       → openRecipeModal()
js/receptura-ai.js          → saveRecipe(), newRecipeVersion(), AI import
js/receptura-stock.js       → renderStock(), renderStockAlerts(), openMinMaxEditor(),
                               deleteIngredient(), generateShoppingList()
js/receptura-production.js  → initProductionPrep(), renderProdMonthSelector(),
                               calcProductionPrep(), confirmBakingDone(),
                               openExperimentalBake(), confirmExperimentalBake()
js/receptura-processing.js  → initProcessingView(), openProcessingModal(), saveProcessingLog()
js/receptura-levain.js      → initLevainDaily(), renderLevainMonthSelector(),
                               calcLevainDaily(), recordLevainBatch()
js/receptura-operational.js → renderOpSelect(), renderOpDetail()
js/receptura-help.js        → renderRecepturaHelp()

js/vevo-data.js    → appData, doLogin() (email/kód/névvel), initApp()
js/vevo-ui.js      → nav(), toast(), product modal
js/vevo-orders.js  → saveOrder(), renderOrderTable(), copyLastOrder(),
                     handleOrderChange(), clearOrder()
```

## Supabase táblák

```
products:           id, name, weight, price, category, description, image, code,
                    marketing_desc, ingredient_label, allergens, nutrition,
                    product_family_id, deleted_at
                    ⚠️ type oszlop NEM LÉTEZIK

clients:            id (belépési kód = KER-XXXX-XXXX), name, email, phone,
                    join_date, notes
                    ⚠️ active oszlop NEM LÉTEZIK
                    Pending: name = '[PENDING] Valaki'
                    Deleted: name = '[DELETED] Valaki' (soft delete!)
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

## Kritikus architektúrális szabályok

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
Törlés → name = '[DELETED] Valaki' (nem valódi DELETE!)
Pending → name = '[PENDING] Valaki' (jóváhagyás előtt)
Login blokk: name.startsWith('[PENDING]') || name.startsWith('[DELETED]')
Jóváhagyás: prefix eltávolítása az UPDATE-ben
```

### Vevő bejelentkezés
```
client.id === val ||
client.email?.toLowerCase() === valLower ||
client.name.toLowerCase() === valLower
```

### Rendelési státusz gép
```
PENDING → CONFIRMED (admin jóváhagyja)
CONFIRMED → PENDING (vevő módosítja)
CONFIRMED → FULFILLED (sütés elvégezve, receptúra modul)
→ CANCELLED (admin visszavonja)
```

## Szintaxis ellenőrzés (minden push előtt)

```bash
for f in js/*.js; do node -e "const fs=require('fs'),vm=require('vm');try{new vm.Script(fs.readFileSync('$f','utf8'));console.log('$f OK');}catch(e){console.log('HIBA: '+e.message);}"; done
for f in admin.html vevo.html receptura.html index.html register.html; do
  node -e "const fs=require('fs'),vm=require('vm');const h=fs.readFileSync('$f','utf8');const s=h.match(/<script[^>]*>([\S\s]*?)<\/script>/g)||[];let ok=true;s.forEach((sc,i)=>{try{new vm.Script(sc.replace(/<\/?script[^>]*>/g,''));}catch(e){console.log('$f['+i+']: '+e.message);ok=false;}});if(ok)console.log('$f OK');"
done
npx jest --no-coverage
```

## Version bump + push

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
git add -A && git commit -m "feat/fix: leírás (vX.Y.Z)" && git push https://GITHUB_TOKEN_PLACEHOLDER@github.com/komsacsongor/kerek-rendeles.git main
```

## Kulcs formátumok

```javascript
mk(year, month)     → "2026-4"    // admin (0-indexed hónap!)
getKey(month, year) → "2026-4"    // vevo – FORDÍTOTT paraméter
ok(cid,y,m,day)    → "anna-2026-4-15"
// dateStr: MINDIG local date, soha ne toISOString() (timezone bug)
```

## Elkerülendő hibák

- toISOString() timezone bug → mindig local dateStr
- products.type → NEM LÉTEZIK
- clients.active → NEM LÉTEZIK (soft delete prefix alapú!)
- calcRawWeight() ingredient számításhoz → TILOS (bakeLoss-t tartalmaz!)
- R.stock → DEPRECATED
- Supabase filter: & kell vesszők helyett (year=eq.X&month=eq.Y)
- const scope hiba template string-ben → definiáld return/template előtt

## Hátralévő fejlesztések

| # | Feladat | Prioritás |
|---|---|---|
| 1 | U4 Fizetési állapot tracking | Közepes |
| 2 | U3 Napi kapacitás limit | Közepes |
| 3 | Push értesítések (Web Push+VAPID) | Alacsony |
| 4 | DB reset élesítés előtt | Élesítés előtt |
| 5 | PWA (manifest.json + sw.js) | Utolsó |
| 6 | Technológus nézet fejlesztése | Középtáv |

## Belépési adatok

Admin + Receptúra: admin | Demo: kovacs-anna, nagy-peter, szabo-maria

## Arculat

Font: Kodchasan (UI), Fraunces (fejlécek) | #064C48 teal-dark | #EFB036 gold
CSS: --teal-dark, --gold, --teal, --border, --bg-soft, --text-soft
Logo tartalmazza a felirat – ne írd ki külön

## ⚠️ PUSH ELŐTTI KÖTELEZŐ VERIFIKÁCIÓ (UI változásnál)

Ez a szakasz betartása NEM opcionális. Minden UI változásnál:

### 1. String egyezés igazolása (módosítás előtt)
```bash
# MINDIG futtasd le, mielőtt replace()-t írsz:
grep -n "KERESETT_STRING" érintett_fájl.html
sed -n 'START,ENDp' érintett_fájl.html
```
Ha a string nem egyezik 100%-ban → ne feltételezd, olvasd el a tényleges tartalmat.

### 2. Nav item hozzáadásnál
```bash
# Előbb olvasd el az aktuális nav struktúrát:
grep -n "nav-item" admin.html | head -20
grep -n "nav-item" receptura.html | head -20
```

### 3. View div hozzáadásnál
```bash
# Előbb olvasd el a HTML végét:
python3 -c "
with open('admin.html') as f: lines = f.readlines()
print(''.join(lines[-15:]))
"
```

### 4. RENDERS bejegyzés ellenőrzése
```bash
grep -n "RENDERS\|nav.*=>\|'view-name'" js/admin-ui.js
grep -n "RENDERS\|nav.*=>\|'view-name'" js/receptura-ui.js
```

### 5. Deploy után cache ellenőrzés
- Mindig ?v=XXXX-szel tesztelj (az aktuális verzióval)
- Ha régi verzió tölt → ne tesztelj, cache probléma van

### 6. Push előtt nyilatkozat (kötelező)
Minden push előtt kimondva (vagy írva):
```
✅ Érintett fájlok: [fájlok listája] – elolvasva grep/sed-del
✅ String egyezések igazolva: [konkrét string-ek]
✅ View div létezik: [grep igazolja]
✅ Nav item létezik: [grep igazolja]
✅ RENDERS bejegyzés: [grep igazolja]
✅ Syntax check: OK
```
Ha ezek bármelyike hiányzik → NE PUSHOLJ.
