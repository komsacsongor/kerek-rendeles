---
name: kerek-workflow
description: KEREK pékség rendeléskezelő — fejlesztési kontextus. GitHub komsacsongor/kerek-rendeles, Supabase lfaxeihrmiylggahougl.supabase.co, Hosting komsacsongor.github.io/kerek-rendeles. Állapot 2026-09-29: prod v2.53.94, staging v2.54.1. ELŐBB: CLAUDE.md + KEREK_ATADAS.md. Esszencia: szabályok, antipattern-ek, modulok, táblák. Részletes történet → KEREK_HISTORY.md.
---

# KEREK – Fejlesztési Skill (lean)

> **Cél**: minimális induló kontextus AI-szám. Bug-pattern-ek, projekt-konvenciók, infrastruktúra.
> Részletes történet, decision rationale és roadmap: lásd **KEREK_HISTORY.md** (külön fájl).

> **2026-09-29:** a munka Claude Code on the web-ben folyik (felhő-session, a repó automatikusan klónozva). Session-indítás és push-szabályok: `CLAUDE.md`. Aktuális állapot / folytatás: `KEREK_ATADAS.md`. A korábbi push-blokk (2026-09-25) megoldódott.

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
| Push | Claude Code on the web: a session git-proxyja hitelesít — **token NEM kell, és NE is legyen a repóban** (publikus!) |
| Supabase prod | lfaxeihrmiylggahougl.supabase.co |
| Supabase staging | xgcwxlwjlohzbzpcapnw.supabase.co |
| Anon key | sb_publishable_prELs2iHaoj9uu-yaARPOQ_PSYe2WAN |
| Hosting prod | komsacsongor.github.io/kerek-rendeles |
| Hosting staging | komsacsongor.github.io/kerek-rendeles/staging |
| **Verzió (prod / staging)** | **v2.53.94 / v2.55.1** |
| Verziózás | v2.MINOR.PATCH (MINOR új funkció, PATCH fix) |

⚠️ **Titok (token, API-kulcs, jelszó) SOHA ne kerüljön a repóba** — a repó publikus. 2026-09-29: egy PAT a `package.json`-ban volt → eltávolítva; a tulajdonosnak vissza kell vonnia.
⚠️ Push 403 („not in this session's authorized repository set") = a session nincs a repóra engedélyezve → új, a repóra engedélyezett session kell; token nem oldja meg.

---

## 4. Minden session elején (KÖTELEZŐ)

```bash
git fetch origin && git checkout -B <session-ág> origin/staging   # ⚠️ staging-first
git log --oneline -20                                             # ⚠️ már megcsinált feature?
npm install && npx jest --no-coverage
```

A felhő-session ELDOBHATÓ: ami nincs pusholva, a session végén elvész (így veszett el majdnem a v2.54.0). Minden lezárt munkaegység → push.

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
| **Vevő** | `vevo.html` | v2.55.1: **e-mail + 4 jegyű PIN** a `vevo-auth` EF-en át → aláírt token; saját adatok a `vevo-data` EF-en át (kód/név NEM belépési adat) |

**Belépési adatok dev/demo**:
- Admin + Receptúra: `admin`
- Demo vevők: `KER-WVGR-ZFPT` (Csongor, **admin-jogú vevő** — v2.53.134, bármikor rendelhet a 18:00 zárás után is), `KER-PQ88-PP5F` (Andrea), `KER-X9JY-Y8AP` (Réka)

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
js/admin-clients.js       → _clientCard(), approveClient(), deleteClient(), toggleClientAdmin() (👑 admin-jog)
js/admin-messages.js      → renderMessages(), updateMsgBadge()
js/admin-reports.js, admin-settings.js, admin-help.js, admin-data-audit.js

js/receptura-data.js      → R, initApp()
js/receptura-ui.js        → nav(), calcScaleFactor(), getFifoPrice()
js/receptura-recipes.js, modal.js, ai.js, stock.js, production.js,
  processing.js, levain.js, operational.js, shopping.js, settings.js, help.js,
  ing-cats.js, masterdata.js, suppliers.js, equipment.js, costhelp.js
js/receptura-gyartas.js   → napi 4-fázisú gyártás flow (v2.53.125+): renderGyartasFlow(), GF1-4
js/receptura-batch.js     → batch-tervező, ovenCapacityPieces
js/receptura-stats.js     → getProductionStats(), 3-szintű analitika
js/receptura-invoice.js   → 🧾 Számla-bevételező operátor (v2.54.0, staging): renderInvoiceIntake(), aiParseInvoice(), invCommit()
js/lib/pdf.min.js + pdf.worker.min.js → pdfjs v3 UMD (számla PDF)

js/vevo-auth.js           → v2.55.0: belépés/regisztráció/PIN-pop-up/helyreállítás (vevo-auth EF), pinBoxHtml()
js/vevo-data.js           → appData, loadPublicData(), vevoEnterApp(client), reloadVevoData()
js/vevo-ui.js             → buildMonthSelectors(), showProductModal()
js/vevo-orders.js         → renderOrderTable(), renderMobileOrderCards()
js/vevo-analytics.js, vevo-orders-render/actions/extras.js
```

---

## 7. Supabase aktív táblák

```
clients:           id, name, email, phone, note, is_admin, join_date, created_at
                   ⚠️ active oszlop NEM LÉTEZIK — soft delete prefix-szel
                   ⚠️ note (egyes szám!) — NEM 'notes'
                   is_admin (v2.53.134): admin-jogú vevő, a 18:00 zárás alól kivétel; több is lehet
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
                   unit, alt_unit, alt_factor, preferred_supplier_id,
                   created_at, auto_updated_at
                   ⚠️ suppliers oszlop NEM LÉTEZIK (kliens-state derived)
                   ⚠️ min_stock_g (rövid név) NEM LÉTEZIK

ingredient_batches: id, ingredient_id, received_date, qty_received_g,
                    qty_remaining_g, price_per_g, price_gross_per_unit,
                    package_size_g, supplier_name, source_type,
                    processing_id, invoice_ref, notes, created_at
                    v2.54.0: invoice_number, currency, fx_rate — db/2026-09_v2.54_szamla_bevetelezes.sql (PROD+STAGING)
                       — kerek_szamla_bevetelezes.sql PROD+STAGING

suppliers:         id, name, brand, contact_person, email, phone, notes, cui, reg_com,
                   is_vat_payer, address, judet, localitate, bank_name, bank_iban,
                   currency, vat_included, payment_terms_days, min_order_value,
                   shipping_cost, free_shipping_above, default_discount_pct, active
                   ANAF CUI-lekérdezés: anaf-lookup EF

orders:            id, client_id, year, month, day, product_id, quantity, updated_at
order_status:      client_id, year, month, day, status, admin_note, deadline,
                   confirmed_at, created_at
                   Státuszok: pending | confirmed | modified | fulfilled | cancelled
messages:          id, client_id, year, month, text, created_at
settings:          key, value, updated_at
audit_log:         id, action, entity_name, details, created_at
push_subscriptions: client_id, endpoint, p256dh, auth, created_at
admin_secrets:     key (PK), value, updated_at — szigorú RLS, csak service_role ír/olvas
                   Kulcsok: admin_password, receptura_password, gyartas_password (jelszó-hashek), vevo_token_secret
client_auth:       client_id (PK), pin_hash, q1, a1_hash, q2, a2_hash, pin_set_at, token_version,
                   pin_fail_count, pin_locked_until, rec_fail_day, rec_fail_count, must_change, temp_pin_until — v2.55.x, RLS policy nélkül
                   (csak vevo-auth/vevo-data EF, service_role). NINCS FK (beágyazás elleni védelem).
production_logs:   id, date (HELYI dátum = SÜTÉSI NAP), log_type, recipe_id, pieces_planned,
                   pieces_actual, ingredient_usage (JSONB), total_cost, allocation, notes,
                   oven_id, bake_minutes, trays_used, batch_no  (v2.53 — db/2026-09_v2.53_gyartas_oszlopok.sql)
                   log_type: order | extra | experimental | customer (FIFO aggregát = KÉSZLETLEVONÁS)
                   ⚠️ extra_waste NEM oszlop (csak a statisztika számolt értéke)
                   ⚠️ 1 'customer' sor / sütési nap — ez a dupla-levonás elleni védelem alapja
monthly_active_products: id, year, month, product_id
baking_calendar:   sütési nap kivételek (extra/removed) — default Kedd/Péntek/Szombat kliens-side
```

### Kliens-state vs DB-séma mapping (KRITIKUS)

| Kliens-state | Forrás | |
|---|---|---|
| `ing.suppliers` | String-array, `ingredient_batches.supplier_name` distinct | NINCS suppliers oszlop |
| `ing.minStock` / `maxStock` | `_override_g` priority, fallback `_auto_g` | Derived |
| `ing.totalStockG` | `SUM(qty_remaining_g) FROM ingredient_batches` | Számolt |
| `ing.fifoPrice` | Legrégebbi batch `price_per_g` | Számolt |
| `ing.avgPrice` | Súlyozott átlag a batch-ekből | Számolt |
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
Receptúra/Gyártás → production_logs → FIFO levonat → order_status: fulfilled
```

### Készlet (FIFO)
```
Bevétel  → ingredient_batches INSERT (kézi, malom-output, VAGY v2.54.0 számla-operátor)
Készlet  = SUM(qty_remaining_g) WHERE qty_remaining_g > 0
FIFO ár  = legrégebbi batch price_per_g
Levonat  = FIFO sorrend, batch-enként qty_remaining_g csökk (production.js/processing.js:
           a fogyasztás batch_id-vel rögzít → tétel-visszakövethetőség)
```

### Számla-bevételező operátor (v2.54.0 — staging)
```
Számla (PDF/fotó) → aiParseInvoice (text pdf.js / vision) → párosítás (_matchIngredientByName)
→ landed cost (súly, érték-fallback) → deviza→lej (bnr-rates EF) → áttekintő (✅/🆕/❓)
→ invCommit: suppliers insert (ha új) + ingredients insert (ha új) + ingredient_batches insert
   (source_type='invoice', invoice_number, currency, fx_rate, nettó árak)
Groq: gpt-oss-20b csak szöveg; szkennelt/fotó → vision modell (R.settings.invoiceVisionModel)
```

### Scale factor (KRITIKUS)
```javascript
// HELYES — bakeLoss NÉLKÜL (recept már tartalmazza)
function calcScaleFactor(recipe, pieces) {
  return (pieces * (recipe.unitWeight || recipe.basePortion)) / recipe.basePortion;
}
// calcRawWeight() csak megjelenítéshez — tartalmaz bakeLoss-t!
```

### Vevő bejelentkezés (v2.55.0 — C1)
```
vevo.html → vAuth('login', {login, pin, remember})  [supabase.js]
  → vevo-auth EF: e-mail + 4 jegyű PIN (PBKDF2, 3 hiba → 15 perc); PIN nélküli fiók 10-31-ig e-maillel → kötelező beállítás
  → token = base64url({cid, v, exp, ro}) . HMAC-SHA256 (titok: admin_secrets.vevo_token_secret, auto-generált)
  → vSession (localStorage 90 nap / sessionStorage 12 óra)
Saját adatok: vData.query/insert/upsert/delete  → vevo-data EF (client_id kényszerítve, határidő szerver-oldalon)
Nincs PIN / hiányzó e-mail-telefon → needs_setup → kötelező pop-up (openSetupSheet)
Token érvénytelen: törölt/függő vevő, PIN-reset/helyreállítás (client_auth.token_version++)
Admin: vAuth('admin_pin_status' | 'admin_temp_pin' | 'admin_preview', {password: window._kerekPw})  — ideiglenes PIN: 7 nap, must_change
```

### Kulcs formátumok
```javascript
ok(cid,y,m,d)        → "KER-XXXX-XXXX-2026-5-26"
mk(year, month)      → "2026-4"     // admin (0-indexed hónap!)
getKey(month, year)  → "2026-4"     // vevo — FORDÍTOTT sorrend!
// dateStr: MINDIG local date, soha toISOString() → timezone bug
```

### Egység-helperek (kerek-constants.js)
```javascript
unitFactor(u)   // kg/l/L → 1000, egyébként 1 (megjelenítés↔bázis)
unitBigLabel(u) // ár-egység: db | l | kg
localToday()    // helyi dátum YYYY-MM-DD (soha toISOString)
```

### `.mob-locked` CSS (KRITIKUS)
```css
.mob-locked { opacity: 0.6; }
.mob-locked .mob-qty-btn,
.mob-locked .mob-qty-display,
.mob-locked input { pointer-events: none; opacity: 0.5; }
/* ⚠️ NE tedd pointer-events:none az egész .mob-locked divre! */
/* ⚠️ admin-jogú vevő (is_admin): az isLocked-ot MINDKÉT nézetben (pivot + mobil) megkerüli */
```

### PWA architektúra (v2.43.x végleges)
2 különálló telepíthető PWA (Vevő `manifest.json` id=`kerek-vevo`, Admin `manifest-admin.json` id=`kerek-admin`), relatív path-ok (`./`), `launch_handler: navigate-new`.

### Modul-jelszó kezelés (v2.48)
Jelszavak az `admin_secrets`-ben (RLS, service_role). Írás: `admin-set-password` EF; validálás: `admin-auth` EF (`module` param). A receptúra a valódi admin/receptúra jelszót kéri.

---

## 9. Szintaxis ellenőrzés (push előtt)

```bash
for f in js/*.js; do node --check "$f" && echo "$f OK" || echo "FAIL $f"; done
npx jest --no-coverage
```
⚠️ Python `repr()` korrupcia a backtick template literal-okra → NE használd JS-check-re.

---

## 10. Version bump + push (KÖTELEZŐ minden release)

**3 hely** (mindegyik kötelező):
1. `kerek-constants.js` → `APP_VERSION`
2. HTML → `?v=X.Y.Z"` query (a MÓDOSÍTOTT fájlokra + a `kerek-constants.js`)
3. `sw.js` → `CACHE_NAME`

```bash
git add -A && git commit -m "feat/fix: leírás (vX.Y.Z)"
git push origin HEAD:staging          # a session-ágra is: git push -u origin <session-ág>
```
A `/staging/` oldal frissítése: `deploy.yml` workflow_dispatch a **main**-en (GitHub MCP `actions_run_trigger`) — a main-en futó workflow a staging ágat is kiteszi `/staging/` alá. `supabase/functions/**` változásnál a `deploy-edge-functions.yml` staging push-ra automatikusan a STAGING projektbe deployol.

Egy session-en belül több release esetén MINDEN release saját version-bumppal.

## 11. ⚠️ Push előtti verifikáció (UI változásnál)

```bash
grep -n "KERESETT_STRING" érintett_fájl.html   # string egyezés MÓDOSÍTÁS ELŐTT
grep -n "nav-item" receptura.html | head -20    # nav item
grep -n "renders\|'view-name'" js/receptura-ui.js  # RENDERS/router bejegyzés
grep -rn "const ÚJ_VÁLTOZÓ" js/ kerek-constants.js # konstans duplikáció
# Deploy után: read_console_messages (NE csak screenshot), ?v=XXXX cache bypass
```

**Push előtt checklist**: fájlok elolvasva · string egyezések igazolva · nincs duplikált konstans · view div / nav item / router igazolva · `node --check` OK · Jest OK.

---

## 12. Anti-pattern quick-reference (KRITIKUS!)

| Hiba | Helyes megoldás |
|---|---|
| `toISOString()` timezone bug | Mindig local dateStr / `localToday()` |
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
| admin-jogú vevő isLocked bypass CSAK egy nézetben | MINDKÉT nézet (pivot + mobil) — a vevő mobilt használ |
| `getKey(month, year)` paraméter sorrend | Fordított mint `mk(year, month)` |
| `sb.upsert/update` `{...obj}` spread | TILTOTT — `kData.updateFields(table, {named}, where)` |
| `loadAllData()` receptúrában | `reloadReceptData()` |
| `Number(x)` konverzió nélkül | NaN-bug — `Number(x) \|\| 0` fallback |
| data-action select/input change-re | a delegátor CSAK click — select/input → inline `onchange="fn(this.value)"` |
| Új EF deploy hardkódolt listával | `deploy-edge-functions.yml` auto-felismeri `supabase/functions/*/`-t |
| Push 403 → token cserélgetése | NEM token-hiba — a session nincs a repóra engedélyezve |
| Lekérés `limit:5000`-rel „mindent” | A PostgREST kérésenként max ~1000 sort ad → EF-ben/nagy táblán lapozz (`.range`) és szűkíts (év/hónap) |
| Készletlevonás saját FIFO-ciklussal | KÖZÖS segéd: `addRecipeNeeds` / `fifoDeductNeeds` / `hasStockDeductionForDate` / `markDaysFulfilled` (receptura-production.js) |
| Batch-sor saját leképezéssel | `mapBatchRow` + `recomputeIngredientStock` (receptura-data.js) — első betöltés, polling, bevételezés ugyanazt használja |
| Új DB-sor ID nélkül az R.* state-be | a `kData.insert` visszaadott sorát vedd fel (ID!) — ID nélkül a későbbi update a DB-ben elhal |
| Vevő saját adata `sb`-vel (anon) | `vData` (vevo-data EF) — a vevő csak a tokenje szerinti adatot éri el |
| Titok-hash (PIN/válasz) anon-olvasható táblában | külön, RLS-zárt tábla (`client_auth`) + lassú hash (PBKDF2) |
| Egyszeri, verziózatlan SQL | `db/ÉÉÉÉ-HH_vX.Y_leírás.sql`, idempotens + ellenőrző SELECT; PROD-ra is (a staging DB hetente felülíródik) |

---

## 13-16. Konvenciók, Claude-tanulságok, Staging, Brand

> Változatlanok — részletek a korábbi verzióban / `KEREK_HISTORY.md`-ben.
Kiemelt: anti-spread DB (`kData.updateFields`), CSS központosítás (`kerek-styles.css`), Realtime `reload*Data()` + `ALTER PUBLICATION`, NaN guard, tooltip `data-tip` tap-toggle, idempotens SQL (`DO $$ ... IF NOT EXISTS`), badge default-status pattern. Staging: `deploy.yml` dual-branch, `sync-staging.yml` heti prod→staging (vasárnap 4:00 UTC, **staging DB felülíródik prod-ból** → séma/adat PROD-ra is!), `deploy-edge-functions.yml` auto-discovery. Brand: Fraunces + Kodchasan, teal `#129990`/dark `#064C48`/gold `#EFB036`.

---

## 17. Nyitott bugok / kockázatok (audit 2026-09-29)

| # | Tünet | Kategória | Prio |
|---|---|---|---|
| S1 | ~~Vevő-login előtt minden vevő adata letöltődik~~ — **C1 (v2.55.0) javítja**; a `clients` anon-olvasása a C3 lezárásig még nyitott | biztonság/GDPR | 🟡 (C3) |
| S2 | AI API-kulcs a `settings` táblában, anon kulccsal olvasható | biztonság | 🔴 (C csomag) |
| S3 | `dynamic-service` (push) hitelesítés nélkül hívható → tetszőleges push bármely vevőnek | biztonság | 🔴 (C2) |
| S4 | ~~18:00 határidő csak kliens-oldalon~~ — C1: a vevo-data EF ellenőrzi; a közvetlen anon-írás a C3-ig még lehetséges | biztonság | 🟡 (C3) |
| P1 | Sütés-rögzítés nem atomi (félbeszakadásnál részleges levonás) | adat | 🟡 |
| P2 | Kísérleti sütés (openExperimentalBake) saját FIFO-ciklus, még nem a közös segéddel | adat | 🟢 |
| P3 | Supabase max-rows (~1000/kérés) — a kliens `limit:5000` lekérései csonkulhatnak nagy táblán | adat | 🟡 |
| **#7** | Üzenet badge race — néha eltűnik mielőtt látszott | C state-sync | Közepes |
| **#27** | Burgonya/Cirokliszt min/max abszurdul kicsi (1-15 g) | E adat | Közepes |

## 18. Hátralévő fejlesztések

| # | Feladat | Prioritás |
|---|---|---|
| — | **Élesítés** v2.53.95→v2.54.1 (gyártás flow + admin-vevő + számla-operátor + audit-javítások) + SQL-ek + EF-ek — lásd KEREK_ATADAS.md | 🔴 Most |
| — | **PROD promóció** v2.53.95→136 (gyártás flow + admin-vevő) + SQL-ek | 🔴 Most |
| **M1** | Bevásárló lista folytatás (overrides, wizard, history) | 🟡 |
| **S2** | EOQ + MOQ pénzügyi optimalizáció | 🟢 |
| **S4** | Malom fermentáció state machine | 🟢 |
| **S5-S6** | Kísérleti sütés verziózás | 🟢 |
| **P2** | Különálló gyártás app (tablet) — a napi flow már receptura.html-ben | 🟢 |
| — | Kiszállítás a sütési logból (per-rendelő checklist a jövőbeli alap) | 🟢 |

**✅ Kész (staging):** M0 mértékegység (unit/alt_unit) · gyártás 4-fázisú napi flow (v2.53.125-133) · admin-jogú vevő + 18:00 bypass (v2.53.134-136) · számla-operátor (v2.54.0) · audit-javítások A+B (v2.54.1).

---

## 19. Aktuális állapot (2026-09-29)

- **Prod (main)**: v2.53.94
- **Staging**: **v2.55.0** — számla-operátor, audit-javítások (A+B), **C1 biztonság: szerver-oldali vevő-belépés (PIN)**. Részletek, teendők: `KEREK_ATADAS.md`.

---

## 📎 Részletes történet és roadmap

Külön fájlban: **KEREK_HISTORY.md** (opcionális, csak konkrét minta/tanulság kell).
**Átadás / félbeszakadt állapot: KEREK_ATADAS.md** (ELŐBB ezt).
`git log --oneline`: a teljes, autoritatív történet.
