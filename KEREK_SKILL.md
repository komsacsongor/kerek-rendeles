---
name: kerek-workflow
description: KEREK pékség rendeléskezelő — fejlesztési kontextus. GitHub komsacsongor/kerek-rendeles, Supabase lfaxeihrmiylggahougl.supabase.co, Hosting komsacsongor.github.io/kerek-rendeles. Aktuális verzió v2.48.2. Esszencia: szabályok, antipattern-ek, modulok, táblák. Részletes történet → KEREK_HISTORY.md.
---

# KEREK – Fejlesztési Skill (lean)

> **Cél**: minimális induló kontextus AI-szám. Bug-pattern-ek, projekt-konvenciók, infrastruktúra.
> Részletes történet, decision rationale és roadmap: lásd **KEREK_HISTORY.md** (külön fájl).

---

## 1. Mi a KEREK?

Gyergyószentmiklósi (Románia, Hargita megye) gluténmentes pékség. Előrendeléses, zárt vevőkör (~30 aktív vevő, 2-3 sütési nap/hét: Kedd · Péntek · Szombat).

- **Üzleti modell**: vevők havonta leadják rendeléseiket, a pékség sütés-napokon süt → személyes átvétel
- **Cél**: WhatsApp-kaoszt kiváltó saját PWA, pékségre szabva
- **Szlogen**: *My health. My value!*

---

## 2. ⚠️ Fejlesztési munkamód – KÖTELEZŐ szabályok

### 🔴 ELSŐ szabály — STAGING-FIRST workflow

Minden új feature/bugfix/UI csak `staging` branchen kezdődik.

```bash
git status                              # melyik branch?
git branch --show-current
git checkout staging                    # kötelező
git pull
```

**A flow**: `checkout staging` → kódolás → push → `/staging/` URL teszt → felhasználói jóváhagyás → `git checkout main && git merge staging && git push`

❌ TILOS: közvetlen main-push új feature-rel. "Kis változás" sem.
✅ KIVÉTEL: `.github/workflows/` (deploy main-ről fut)

### Gondolkodásmód
- Először a teljes képet, ne az adott részt
- Edge case-ek a tervezési fázisban
- Érintett fájlok mindegyike előbb elolvasandó

### Tervezet-jóváhagyás (>100 sor új kódhoz)
Rövid vázlat: mit, miért, milyen edge case, érintett fájlok. **Várj jóváhagyásra.**

### Batch munka
Egy commit / egy feature. Diagnosztikai kód + javítás külön push = anti-pattern.

### Válaszstílus
Tömör, végeredmény-fókusz. Csak kérdezz, ha info hiányzik. Hatékonysági problémát jelezz.

---

## 3. Projekt infrastruktúra

| Szolgáltatás | Adat |
|---|---|
| GitHub | komsacsongor/kerek-rendeles (publikus) |
| Token | **Claude memóriában: `KEREK GitHub token`** (ghp_l1v3N73...) |
| Supabase prod | lfaxeihrmiylggahougl.supabase.co |
| Supabase staging | xgcwxlwjlohzbzpcapnw.supabase.co |
| Anon key | sb_publishable_prELs2iHaoj9uu-yaARPOQ_PSYe2WAN |
| Hosting prod | komsacsongor.github.io/kerek-rendeles |
| Hosting staging | komsacsongor.github.io/kerek-rendeles/staging |
| **Aktuális verzió** | **v2.48.2 (2026-06-12)** |
| Verziózás | v2.MINOR.PATCH (MINOR új funkció, PATCH fix) |

⚠️ Token NE legyen a SKILL.md-ben (push-blokk a secret-detektor miatt). Claude memóriából vedd.

---

## 4. Minden session elején (KÖTELEZŐ)

```bash
TOKEN="[Claude memóriából: KEREK GitHub token]"
cd /home/claude && rm -rf kerek-rendeles && git clone "https://${TOKEN}@github.com/komsacsongor/kerek-rendeles.git"
cd kerek-rendeles && git config user.email "kerek@deploy.bot" && git config user.name "KEREK Deploy"
git checkout staging                    # ⚠️ staging-first
git log --oneline | head -20            # ⚠️ már megcsinált feature?
npm install && npx jest --no-coverage
```

**Mielőtt új feature-höz tervezet írok**:
```bash
git log --all --oneline -- js/<érintett_modul>.js | head -5
grep -rn "<remélt új function név>" js/
```
Indok: session-compactation után a régi tanulság elveszhet, de a git megőrzi (lásd HISTORY: v2.39.2 csapda).

---

## 5. Három fő modul

| Modul | URL | Belépés |
|---|---|---|
| **Admin** | `admin.html` | `admin-auth` Edge Function (`admin_secrets.admin_password` hash) |
| **Receptúra** | `receptura.html` | `admin-auth` EF `module='receptura'` (v2.48) → `admin_secrets.receptura_password`, ennek híján admin-fallback |
| **Vevő** | `vevo.html` | `clients.id` (KER-XXXX-XXXX) **NEM jelszó** — 3 mód: kód / email / név |

**Belépési adatok dev/demo**:
- Admin + Receptúra: `admin`
- Demo vevők: `KER-WVGR-ZFPT` (Csongor), `KER-PQ88-PP5F` (Andrea), `KER-X9JY-Y8AP` (Réka)

---

## 6. Fájlstruktúra

```
index.html, admin.html, vevo.html, receptura.html, register.html
manifest.json (Vevő PWA)          manifest-admin.json (Admin PWA)
sw.js (network-first, Supabase kizárva)
supabase.js                       kerek-constants.js  kerek-styles.css

js/admin-data.js          → D, loadAllData(), doLogin(), initApp()
js/admin-ui.js            → nav(), RENDERS, updatePendingBadge()
js/admin-baking.js        → sütési naptár, confirmDay(), statusBadge()
js/admin-orders.js        → renderOrders(), CSV export
js/admin-catalog.js       → saveProduct(), renderFamilies()
js/admin-clients.js       → _clientCard(), approveClient(), deleteClient()
js/admin-messages.js      → renderMessages(), updateMsgBadge()
js/admin-reports.js, admin-settings.js, admin-help.js, admin-data-audit.js

js/receptura-data.js      → R, initApp()
js/receptura-ui.js        → calcScaleFactor(), getFifoPrice()
js/receptura-recipes.js, modal.js, ai.js, stock.js, production.js,
  processing.js, levain.js, operational.js, shopping.js, settings.js, help.js

js/vevo-data.js           → appData, doLogin() (3 mód), initApp()
js/vevo-ui.js             → buildMonthSelectors(), showProductModal()
js/vevo-orders.js         → renderOrderTable(), renderMobileOrderCards()
js/vevo-analytics.js, vevo-orders-render/actions/extras.js
```

---

## 7. Supabase aktív táblák

```
clients:           id, name, email, phone, note, join_date, created_at
                   ⚠️ active oszlop NEM LÉTEZIK — soft delete prefix-szel
                   ⚠️ note (egyes szám!) — NEM 'notes'
                   Pending:  name = '[PENDING] Valaki'
                   Deleted:  name = '[DELETED] Valaki'

products:          id, name, weight, price, category, description, image,
                   code, marketing_desc, ingredient_label, allergens,
                   nutrition, product_family_id, deleted_at, created_at
                   ⚠️ type oszlop NEM LÉTEZIK

recipes:           id, name, category, base_portion, bake_loss, unit_weight,
                   temp1, time1, temp2, time2, levain_amount, labor_h,
                   electricity, product_id (FK), marketing_desc,
                   ingredient_label, allergens, nutrition, archived,
                   version, activated_at, created_at
                   ⚠️ parent_recipe_id, status, tags MÉG NEM LÉTEZIK (S5 backlog)

recipe_ingredients: id, recipe_id, ingredient_id, name, amount (g), sub_type, sort_order
recipe_steps:       id, recipe_id, title, description, timer_minutes, sort_order

ingredients:       id, name, category, sub_type,
                   min_stock_auto_g, max_stock_auto_g,
                   min_stock_override_g, max_stock_override_g,
                   lead_time_days, order_cycle_days, safety_factor,
                   price_per_g, base_price_per_g, material_type, family_id,
                   created_at, auto_updated_at
                   ⚠️ suppliers oszlop NEM LÉTEZIK (kliens-state derived)
                   ⚠️ min_stock_g (rövid név) NEM LÉTEZIK
                   ⚠️ unit, unit_to_g_ratio MÉG NEM LÉTEZIK (M0 backlog)

ingredient_batches: id, ingredient_id, received_date, qty_received_g,
                    qty_remaining_g, price_per_g, price_gross_per_unit,
                    package_size_g, supplier_name, source_type,
                    processing_id, invoice_ref, notes, created_at

orders:            id, client_id, year, month, day, product_id, quantity, updated_at
order_status:      client_id, year, month, day, status, admin_note, deadline,
                   confirmed_at, created_at
                   Státuszok: pending | confirmed | modified | fulfilled | cancelled
messages:          id, client_id, year, month, text, created_at
settings:          key, value, updated_at
audit_log:         id, action, entity_name, details, created_at
push_subscriptions: client_id, endpoint, p256dh, auth, created_at
admin_secrets:     key (PK), value, updated_at — szigorú RLS, csak service_role ír/olvas
                   Kulcsok: admin_password, receptura_password, gyartas_password (jelszó-hashek)
production_logs:   id, date (HELYI dátum!), log_type, recipe_id, pieces_planned,
                   pieces_actual, ingredient_usage (JSONB), total_cost
                   log_type: order (rendelt) | extra (+1) | experimental (teszt) | customer (FIFO aggregát)
monthly_active_products: id, year, month, product_id
baking_calendar:   üres a DB-ben (default Kedd/Péntek/Szombat kliens-side)
```

### Kliens-state vs DB-séma mapping (KRITIKUS)

| Kliens-state | Forrás | |
|---|---|---|
| `ing.suppliers` | String-array, `ingredient_batches.supplier_name` distinct | NINCS suppliers oszlop |
| `ing.minStock` / `maxStock` | `_override_g` priority, fallback `_auto_g` | Derived |
| `ing.totalStockG` | `SUM(qty_remaining_g) FROM ingredient_batches` | Számolt |
| `ing.fifoPrice` | Legrégebbi batch `price_per_g` | Számolt |
| `R.batches` | Direct DB | OK |
| `R.stock` | **DEPRECATED** — NE használd | csak ingredient_batches |

### Két párhuzamos rendszer — NE keverjük

- **`production_logs`** = normál sütési log + FIFO levonat
- **`processing_batches/inputs/outputs`** = alapanyag-feldolgozás (őrlés, fermentáció)

Mellérendelt rendszerek, NE pótold egyiket a másikkal.

---

## 8. Kritikus architektúrális szabályok

### Adatfolyam
```
Vevő → vevo.html → orders tábla
Admin → admin.html → jóváhagyás → order_status: confirmed
Receptúra → production_logs → FIFO levonat → order_status: fulfilled
```

### Készlet (FIFO)
```
Bevétel  → ingredient_batches INSERT
Készlet  = SUM(qty_remaining_g) WHERE qty_remaining_g > 0
FIFO ár  = legrégebbi batch price_per_g
Levonat  = FIFO sorrend, batch-enként qty_remaining_g csökk
```

### Scale factor (KRITIKUS)
```javascript
// HELYES — bakeLoss NÉLKÜL (recept már tartalmazza)
function calcScaleFactor(recipe, pieces) {
  return (pieces * (recipe.unitWeight || recipe.basePortion)) / recipe.basePortion;
}
// calcRawWeight() csak megjelenítéshez — tartalmaz bakeLoss-t!
```

### Vevő bejelentkezés (3 mód)
```javascript
client.id === val ||                         // belépési kód
client.email?.toLowerCase() === valLower ||  // email
client.name.toLowerCase() === valLower       // teljes név
```

### Kulcs formátumok
```javascript
ok(cid,y,m,d)        → "KER-XXXX-XXXX-2026-5-26"
mk(year, month)      → "2026-4"     // admin (0-indexed hónap!)
getKey(month, year)  → "2026-4"     // vevo — FORDÍTOTT sorrend!
// dateStr: MINDIG local date, soha toISOString() → timezone bug
```

### Mobile vs Desktop
```javascript
function isMobile() { return window.innerWidth <= 640; }
// Desktop: renderOrderTable() — HTML tábla
// Mobil:   renderMobileOrderCards() — kártyák, kategória tab sticky
// MONTHS_SHORT mobilon, MONTHS desktopon
```

### `.mob-locked` CSS (KRITIKUS)
```css
/* CSAK az input gombokat — termékinfó kattintható marad! */
.mob-locked { opacity: 0.6; }
.mob-locked .mob-qty-btn,
.mob-locked .mob-qty-display,
.mob-locked input { pointer-events: none; opacity: 0.5; }
/* ⚠️ NE tedd pointer-events:none az egész .mob-locked divre! */
```

### PWA architektúra (v2.43.x végleges)

**2 különálló telepíthető PWA**:

| App | Manifest | start_url | scope | id | Ikon |
|---|---|---|---|---|---|
| **Vevő** | `manifest.json` | `./vevo.html` | `./` | `kerek-vevo` | teal |
| **Admin** | `manifest-admin.json` | `./index.html` | `./` | `kerek-admin` | gold |

- `id` mező a Chrome-ban megkülönbözteti a 2 appot (W3C spec)
- `launch_handler: { client_mode: 'navigate-new' }` — start_url indít, NEM utolsó URL
- A vevő-manifest CSAK `vevo.html`-en hivatkozott, admin-manifest a többi 3 oldalon
- Manifest path-ok mindig **relatívak** (`./`) — staging-compat (lásd HISTORY 22.7)
- SW regisztráció `kerek-constants.js`-ben minden NEM-vevő oldalon

### KEREK saját jelszó-tárolás (localStorage)

A Chrome / Samsung Pass nem ajánl mentést PWA standalone módban. Saját storage:

| Modul | Storage key | Tárolt érték |
|---|---|---|
| Admin | `kerek_admin_remember_pw` | `btoa(jelszó)` |
| Receptúra | `kerek_receptura_remember_pw` | `btoa(jelszó)` |
| Vevő | `kerek_vevo_remember_login` | `btoa(KER-kód/email/név)` |

Helper minta `kerek*Save/Load/Forget*`. Auto-load `DOMContentLoaded`-en. Save a `doLogin` SIKERES ágában.
Checkbox a login képernyőn: "🔐 Maradjak bejelentkezve ezen az eszközön" (default: checked).
NEM titkosított — saját eszközön elfogadható.

### Modul-jelszó kezelés (v2.48 — biztonságos)

A belépési jelszavak az **`admin_secrets`** táblában (key/value, szigorú RLS, csak service_role). A kliens NEM ír/olvas közvetlenül — minden művelet Edge Function-ön át:
- **`admin-auth`** validál: `{password, module}` (module ∈ admin/receptura/gyartas, whitelist + admin-fallback ha a modul-jelszó nincs beállítva).
- **`admin-set-password`** ír: előbb a jelenlegi admin jelszót validálja, majd upsertel `${module}_password` hash-t.
- **Admin UI**: „🔑 Jelszavak" szekció — elkülönített 🔒 biztonsági blokk (jelenlegi admin jelszó) + admin/receptúra/gyártás új-jelszó sorok.
- ⚠️ A receptúra mostantól a valódi admin (vagy külön receptúra) jelszót kéri, NEM a régi `'admin'` fallbackot.

---

## 9. Szintaxis ellenőrzés (push előtt)

```bash
# JS — node --input-type=module (browser globals ReferenceError-t ad, ez normális)
for f in js/*.js; do
  node --input-type=module < $f 2>&1 | grep -v "ReferenceError\|window is not\|document is not" || echo "$f OK"
done

# VAGY: vm.Script (kevésbé szigorú)
for f in js/*.js; do
  node -e "const fs=require('fs'),vm=require('vm');new vm.Script(fs.readFileSync('$f','utf8'));console.log('$f OK')"
done

npx jest --no-coverage
```

⚠️ Python `repr()` korrupcia a backtick template literal-okra → NE használd JS-check-re.

---

## 10. Version bump + push (KÖTELEZŐ minden release)

```python
import re, datetime
NEW_VER = "X.Y.Z"
DATE = datetime.date.today().strftime("%Y-%m-%d")
with open('kerek-constants.js') as f: c = f.read()
c = re.sub(r"APP_VERSION = 'v[\d.]+ \([^)]+\)'", f"APP_VERSION = 'v{NEW_VER} ({DATE})'", c)
open('kerek-constants.js','w').write(c)
for f in ['admin.html', 'receptura.html', 'vevo.html', 'index.html', 'register.html']:
    c = open(f).read()
    c = re.sub(r'(\?v=)[\d.]+"', rf'\g<1>{NEW_VER}"', c)
    open(f, 'w').write(c)
with open('sw.js') as f: sw = f.read()
sw = re.sub(r"const CACHE_NAME = 'kerek-v[\d.]+'", f"const CACHE_NAME = 'kerek-v{NEW_VER}'", sw)
open('sw.js','w').write(sw)
```

**3 hely** (mindegyik kötelező):
1. `kerek-constants.js` → `APP_VERSION`
2. 5 HTML → `?v=X.Y.Z"` query
3. `sw.js` → `CACHE_NAME`

```bash
TOKEN="[Claude memóriából]"
git add -A && git commit -m "feat/fix: leírás (vX.Y.Z)"
git push "https://${TOKEN}@github.com/komsacsongor/kerek-rendeles.git" staging
```

Egy session-en belül több release esetén MINDEN release saját version-bumppal.

---

## 11. ⚠️ Push előtti verifikáció (UI változásnál)

```bash
# 1. String egyezés MÓDOSÍTÁS ELŐTT
grep -n "KERESETT_STRING" érintett_fájl.html
# Ha NEM egyezik 100% → olvasd el a tényleges tartalmat (NE feltételezz)

# 2. Nav item hozzáadásnál
grep -n "nav-item" admin.html | head -20

# 3. RENDERS bejegyzés ellenőrzése
grep -n "RENDERS\|'view-name'" js/admin-ui.js

# 4. Konstans duplikáció ellenőrzése (KRITIKUS!)
grep -rn "const ÚJ_VÁLTOZÓ" js/ kerek-constants.js

# 5. Deploy után console ellenőrzés
# read_console_messages tool — NE csak screenshot!
# ?v=XXXX cache bypass-szal tesztelj
```

**Push előtt checklist**:
- ✅ Fájlok elolvasva grep/sed-del
- ✅ String egyezések igazolva
- ✅ Nincs duplikált konstans
- ✅ View div / nav item / RENDERS igazolva
- ✅ Syntax check OK
- ✅ Jest OK

---

## 12. Anti-pattern quick-reference (KRITIKUS!)

| Hiba | Helyes megoldás |
|---|---|
| `toISOString()` timezone bug | Mindig local dateStr |
| `products.type` használata | NEM LÉTEZIK |
| `clients.active` használata | NEM LÉTEZIK — soft delete prefix |
| `clients.notes` (többes szám) | NEM LÉTEZIK — `clients.note` |
| `ingredients.suppliers` SELECT-ben | NEM LÉTEZIK — kliens-state derived |
| `ingredients.min_stock_g` (rövid név) | NEM LÉTEZIK — `min_stock_auto_g` / `_override_g` |
| `recipes.parent_recipe_id, status, tags` | NEM LÉTEZIK (S5 backlog) |
| `calcRawWeight()` ingredient-számításhoz | TILOS — bakeLoss-t tartalmaz! |
| `R.stock` használata | DEPRECATED — csak `ingredient_batches` |
| Supabase filter vesszővel | `&` kell: `year=eq.X&month=eq.Y` |
| Duplikált `const` deklaráció | Mindig grep-pel ellenőrizd előtte |
| `.mob-locked { pointer-events:none }` egész div-re | Csak inputokra |
| `MONTHS_SHORT` deklarálása | Már `kerek-constants.js`-ben! |
| `getKey(month, year)` paraméter sorrend | Fordított mint `mk(year, month)` |
| `sb.upsert/update` `{...obj}` spread | TILTOTT — `sb.updateFields(table, {named}, where)` |
| `loadAllData()` receptúrában | `reloadReceptData()` |
| `Number(x)` konverzió nélkül | NaN-bug — `Number(x) \|\| 0` fallback |
| Anti-spread esetén `desc` mezőt küld | DB `description`-t vár |
| Regex check FUNCTION DEFINÍCIÓ-t és HÍVÁS-t összemos | `re.sub(r'function \w+\([^)]*\)\s*\{[^}]*\}', '', code).count('functionName(')` |
| PWA manifest abszolút path staging-en | Relatív path: `./vevo.html`, `scope: ./`, `icons.src: ./img/...` |
| `navigator.credentials.store()` gyenge jelszóra | Chrome data breach blokk → KEREK saját localStorage |
| Badge számolás csak status-rekord alapján | DEFAULT-status (pending): iterálj az adat-táblát, status mint felülírás |
| Új feature közvetlen main-be push | STAGING-FIRST: `git checkout staging` legyen első parancs |
| Edge Function deploy hardkódolt listával | `deploy-edge-functions.yml` auto-felismeri `supabase/functions/*/`-t — új EF ne maradjon ki (404 → néma fetch-hiba) |
| Jelszó `settings`-be írása / kliens-oldali compare | Jelszavak az `admin_secrets`-ben; írás csak `admin-set-password` EF-en át, validálás `admin-auth`-on (`module` param); alfanumerikus jelszó |

---

## 13. Új konvenciók (kötelezőek)

### 13.1 DB műveletek anti-spread
- ❌ `sb.upsert/update(table, {...obj}, ...)` — kliens-extra-mezők DB-be → PGRST204
- ✅ `sb.updateFields(table, {field1, field2}, where)` — named field-ek
- ✅ Új rekord ID: `nextId = MAX(id) + 1` explicit kérdezés

### 13.2 CSS központosítás
- ❌ inline `style="..."` modal/form/sticky pozícióhoz HTML-ben
- ✅ `.modal`, `.form-row`, `.form-group`, `.sticky-bottom-bar` osztályok `kerek-styles.css`-ben
- `.form-group > input/select/textarea` (DIRECT child only — nested flex containers preserved)
- iOS safe-area: `padding-bottom: max(default, env(safe-area-inset-bottom))` minden fix-bottom elemen

### 13.3 State sync
- Egységes Realtime subscription minden modulban
- Új tábla: hozzá kell adni mindhárom modul `*_RT_TABLES` listájához
- Supabase oldalon **kötelező**: `ALTER PUBLICATION supabase_realtime ADD TABLE <table>;`
- Realtime callback használjon `reload*Data()` helper-t, NEM `loadAllData()`-t
- 500ms debounce minimum
- NE save() a Realtime reload után

### 13.4 Navigáció event delegation
- ❌ `getAttribute('onclick').indexOf(...)` lookup minta (törékeny M7 után)
- ✅ Keresés mind `onclick`, mind `data-action="..." data-arg1="..."` alapján
- Új gombok: `data-action="..."` + `data-arg1="..."` (delegátor: `kerek-constants.js`)

### 13.5 NaN guard
- Minden numerikus értékre: `Number(x) || 0` fallback
- `qty`, `price`, `stock` lehetnek string-ek (localStorage)
- Példa: `total += (Number(p.price) || 0) * (Number(qty) || 0);`

### 13.6 Tooltip rendszer
- `data-tip="..."` attribútum + CSS `[data-tip]:hover`
- Backward compat: ha van `title="..."`, duplikálódik `data-tip`-be is
- Mobil: **tap-toggle** (`.tip-open` osztály) v2.45.2 óta — a régi long-press HELYETT; tördelés `white-space:normal`

### 13.7 Idempotens SQL migration
A felhasználó futtatja Supabase Dashboardban. Mindig `DO $$ BEGIN IF NOT EXISTS (...) THEN ALTER... END IF; END $$` formában.

### 13.8 Badge default-status pattern
Ha státusz default-érték (pl. `pending` nincs explicit rekord):

```js
Object.keys(D.orders || {}).forEach(function(k) {
  if (k.indexOf('-' + y + '-' + m + '-') === -1) return;
  var totalQty = 0;
  Object.values(D.orders[k]).forEach(function(q){ totalQty += (Number(q) || 0); });
  if (totalQty === 0) return;
  var status = (D.orderStatus && D.orderStatus[k] && D.orderStatus[k].status) || 'pending';
  if (status === 'pending') pendingOrders++;
});
```

**Kulcs**: iterálj az adat-táblát, és a status mint opcionális felülírás.

---

## 14. Claude-specifikus fejlesztési tanulságok

### 14.1 Dead code eltakarítás minden refaktornál
```bash
grep -rn "loadAllData\|R\.stock\|monthlyActive[^P]" js/
```
Találat → átírni vagy `// DEPRECATED vX.Y` komment + következő release-ben törölni.

### 14.2 Field-name konzisztencia loadAllData ↔ reload*Data között
Mindig ugyanazt a mezőnevet használja a 2 hely. NE találd ki a mezőneveket fejből — `loadAllData` az autoritatív forrás.

### 14.3 Bug kategorizálás (6 anti-pattern típus)

| Kód | Tünet | Gyökér |
|---|---|---|
| **A** Schema-mismatch / DB-spread | `PGRST204 column not found` | Spread DB-műveletben |
| **B** CSS-regresszió | Visszatérő layout-bug | Inline style ↔ központi CSS ütközés |
| **C** State-sync verseny | Stale adat, badge eltűnik | Realtime config / reload helper hibás |
| **D** Init flow gap | Login után badge nem inicializál | Részleges `update*()` hívás |
| **E** Field-name / NaN inkonzisztencia | NaN lej, undefined érték | Eltérő mezőnevek vagy Number() hiánya |
| **F** Workflow-megsértés | Tesztelés nélkül élesbe | NEM staging-first |

Új bug-jelentésnél előbb kategorizáld, aztán nézd HISTORY-t — gyakran ismert pattern.

### 14.4 Browser MCP-takarékosság
- 4 perces timeout-tal lefagy ha sok WS-event van
- Rutinszerű screenshot helyett `javascript_exec`: `document.getElementById('X')?.textContent`
- Több művelet 1 `browser_batch`-ben
- Ha lefagy: NE retry — `tabs_context_mcp` ellenőrzés + várj

### 14.5 Image limit (100/session)
Egy verifikáció = egy screenshot. `javascript_exec` pontosabb state-info-t ad mint kép.

### 14.6 Tervezet-jóváhagyás (>100 sor új kódhoz)
```
"Tervezem: új view view-shopping + js/receptura-shopping.js (~270 sor).
 Funkciók: ..., Edge case: ..., Érinti: ..."
```
NE kezdj kódolni mielőtt a felhasználó bólint.

---

## 15. Staging munkamenet

### 15.1 Architektúra
```
komsacsongor.github.io/kerek-rendeles/         → prod Supabase (lfaxeihrmiylggahougl)
                                                  │
                                                  │ heti sync vasárnap 4:00 UTC
                                                  ▼
komsacsongor.github.io/kerek-rendeles/staging/ → staging Supabase (xgcwxlwjlohzbzpcapnw)
                                                  Email + phone anonimizálva
                                                  KIVÉTEL: Csongor (komsa.csongor@gmail.com)
```

### 15.2 GitHub Workflows
- `deploy.yml` — dual-branch deploy
- `sync-staging.yml` — heti prod→staging sync (pg_dump → restore → GRANT → cache reload → anonimizáció)
- `deploy-edge-functions.yml` — **auto-felismeri** a `supabase/functions/*/`-t (v2.48; NE hardkódolj listát!). Jelenleg: admin-auth, admin-set-password, auto-confirm-orders, dynamic-service

### 15.3 GitHub Secrets
| Secret | Mire |
|---|---|
| `SUPABASE_PROD_DB_URL` | sync dump (Session pooler) |
| `SUPABASE_STAGING_DB_URL` | sync restore |
| `SUPABASE_ACCESS_TOKEN` | Edge Functions deploy (sbp_...) |

### 15.4 Staging branch deploy
A `deploy.yml` v2.45 óta `branches:[main]` + `if: github.ref=='refs/heads/main' || workflow_dispatch` → a staging push **már NEM fail-el**. A `/staging/` tartalom frissítéséhez viszont továbbra is dispatch kell minden staging push UTÁN:
```bash
curl -X POST -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/komsacsongor/kerek-rendeles/actions/workflows/deploy.yml/dispatches" \
  -d '{"ref":"main"}'
```
A workflow_dispatch a main-en fut, DE a staging branch HEAD-jét felteszi `/staging/` alá.

### 15.5 SQL anti-pattern
- pg_dump verzió-mismatch: `/usr/lib/postgresql/17/bin/pg_dump` explicit
- DB jelszó: alfanumerikus (URL-ben `?`, `/`, `+`, `&`, `=`, `@` problémás)
- Schema drop után: `GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role` + tables/sequences/functions
- PostgREST cache: `NOTIFY pgrst, 'reload schema'`

---

## 16. Brand & arculat

```
Font elsődleges:   Fraunces (fejlécek, serif, italic)
Font másodlagos:   Kodchasan (UI elemek)
Teal dark:         #064C48  (--teal-dark)
Gold:              #EFB036  (--gold)
Teal:              #129990  (--teal)
Logo:              pöttyös mintázat + KEREK felirat (egyben PNG)
```

Logo render fix (alja levágva CSS-aliasing miatt):
```css
display:block; margin:0 auto; padding-bottom:4px
```
Plus a height-et kicsivel emeld: 80→84px (admin/receptura), 72→76px (vevő), 100→104px (index).

---

## 17. Nyitott bugok

| # | Tünet | Kategória | Prio |
|---|---|---|---|
| **#7** | Üzenet badge race — néha eltűnik mielőtt látszott | C state-sync | Közepes |
| **#14** | Tooltip — v2.45.2 újraírás valószínűleg megoldotta (ellenőrizendő) | B CSS | Alacsony |
| **#27** | Burgonya/Cirokliszt min/max abszurdul kicsi (1-15 g) | E adat | Közepes |

---

## 18. Hátralévő fejlesztések (lista)

Részletes ROADMAP → **KEREK_HISTORY.md** 5. szekció.

| # | Feladat | Prioritás |
|---|---|---|
| **M0** | Mértékegység támogatás (`unit`, `unit_to_g_ratio`) | 🔴 Sürgős |
| **M1** | Bevásárló lista folytatás (overrides, wizard, history) | 🟡 Folytatás |
| **S2** | EOQ + MOQ pénzügyi optimalizáció | 🟢 Új session |
| **S4** | Malom fermentáció state machine | 🟢 Új session |
| **S5-S6** | Kísérleti sütés verziókezelés | 🟢 Új session |
| **B1-B6** | Backlog (szezonalitás, trend, reverse lookup, stb.) | 🟢 |
| — | DB reset demo-vevők (élesítés előtt) | ⏳ Felhasználói feladat |
| **P2** | Különálló gyártás app (`gyartas.html`, tablet) — P1 után | 🟡 |
| — | Kiszállítás a sütési logból (per-rendelő checklist a jövőbeli alap) | 🟢 Jövő |

**✅ Kész (korábban roadmapen):** Hibrid auto-confirm cron 18:00 (v2.46) · Admin+vevő Web Push (v2.45-46) · SC3 admin.html→12 modul (M7 refactor) · Termék soft-delete (v2.36/38) · P1 sütési log (v2.47) · Modul-jelszó kezelő (v2.48)

---

## 19. Aktuális állapot (2026-06-12)

- **Production**: v2.46.0 (admin/vevő push + auto-zárás 18:00 élesben)
- **Staging**: v2.48.2 — P1 sütési log, recept-leírás dropdown, modul-jelszó kezelő (verifikálva), receptúra biztonságos login. Adat-teszteléshez receptek/alapanyagok kellenek.
- **Legutóbbi session**: gyártás-modul (P1 sütési log) + modul-jelszó kezelő (admin_secrets + Edge Function-ök)
- **Vár**: P1 adattal tesztelése → merge prod; P2 különálló gyártás app (`gyartas.html`)

---

## 📎 Részletes történet és roadmap

Külön fájlban: **KEREK_HISTORY.md**

- Verzió-történet milestones
- Decision rationale (miért 2 PWA, miért staging-first, stb.)
- 25+ megoldott bug katalógusa (csak kategória-szinten)
- Részletes ROADMAP (M0-L8)
- Session-specifikus tanulságok (PWA scope hibalecke, deploy concurrency, stb.)

Az AI csak akkor olvassa, ha **konkrét tanulság / minta** kell.
