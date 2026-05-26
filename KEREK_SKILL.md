---
name: kerek-workflow
description: Fejlesztési munkamód KEREK pékség rendeléskezelő rendszerhez. Használd ezt a skillt MINDEN alkalommal amikor a KEREK projekten dolgozol.
---

# KEREK Workflow Skill (v2.36.0 — 2026-05-26)

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

### Böngésző-takarékosság
- Kevesebb screenshot – csak akkor kérj képet ha tényleg szükséges hibakereséshez
- Ne `megnézem mi a helyzet` rutinból
- Browser checks csak explicit user-engedéllyel

### Limit-takarékosság
- Tömörítés, dead code törlés, ne tartsunk fenn nem használt függvényeket
- Verzió-bump és sw.js cache_name minden release-nél kötelező
- Test eredményeket gyorsan ellenőrizd, ne ismételd a check-eket

---

## 🗂️ PROJEKT STRUKTÚRA / FÁJL-TÉRKÉP (v2.33.0)

### Hosting & infra
- **Repo**: `github.com/komsacsongor/kerek-rendeles` (main branch, auto-deploy GitHub Pages)
- **Live URL**: `https://komsacsongor.github.io/kerek-rendeles/`
- **Supabase**: `lfaxeihrmiylggahougl.supabase.co` (anon key: `(public anon key)`)
- **GitHub token** (scope: repo): `(token kihagyva — local memory-ban tárolva)`

### Edge Functions (Supabase, deployolva)
- **`dynamic-service`**: push notification delivery (VAPID kulcsok beállítva)
- **`admin-auth`** (v2.30.0): jelszó-ellenőrzés `admin_secrets` táblából (RLS+REVOKE védelem)
- **`auto-confirm-orders`**: deployolva de nincs cron — H8 kliens-oldali pass helyettesíti

### Adatbázis
- `clients`, `products`, `monthly_active_products`, `orders`, `order_status`, `messages`
- `recipes`, `recipe_ingredients`, `ingredients`, `ingredient_batches` (FIFO)
- `baking_calendar`, `settings`
- `audit_log` (analytics + admin műveletek)
- `admin_secrets` (csak service_role olvashatja) ⭐ v2.30.0
- `push_subscriptions`
- `processing_batches`, `processing_inputs`, `processing_outputs` (malom v2) ⭐ v2.34.0
- `ingredient_milling_profile` (per-alapanyag yield referencia) ⭐ v2.34.0
- `ingredient_families` + `ingredients.material_type` + `ingredients.family_id` ⭐ v2.35.0

### 3 fő modul + HTML

#### 1. `vevo.html` — Vevő PWA
| JS fájl | Sor | Tartalom |
|---|---|---|
| `vevo-data.js` | ~430 | Login, polling, push subscription, doLogin, doRegister, H8 auto-confirm |
| `vevo-ui.js` | ~150 | UI helpers, isBakingDay, message badge, getKey, getActiveProds |
| `vevo-analytics.js` | ~30 | KEREKAnalytics events → audit_log |
| `vevo-orders-render.js` ⭐ | 454 | renderOrderTable, renderProductPivot, renderMobileOrderCards, renderSummary, toggleMobCard, switchView, helpers |
| `vevo-orders-actions.js` ⭐ | 301 | saveOrder, clearOrder, pivotChangeQty, mobChangeQty, updateRowTotal, updateHeroTotal, defaultDeadlinePassed, sendMessageOnly, vevoConfirmOrder |
| `vevo-orders-extras.js` ⭐ | 207 | showPdfModal, openPdfSummary, copyLastOrder, showCopyResultBanner, dismissCopyBanner |

⭐ = M9 bontásból (v2.32.0)

#### 2. `admin.html` — Admin felület
| JS fájl | Sor | Tartalom |
|---|---|---|
| `admin-data.js` | ~310 | initApp, loadAllData (Promise.allSettled H4), doLogin (Edge Function), Realtime WS debounced (C5) |
| `admin-ui.js` | ~265 | renderDashboard, nav, RENDERS map, getBakingDays |
| `admin-baking.js` | ~530 | renderBaking, confirmDay (H1 bulk), saveModify (H2 bulk), toggleCalDay (+broadcast push v2.28.0) |
| `admin-catalog.js` | ~580 | renderCatalog, saveProduct (+broadcast push), archiveProduct, restoreFromArchive |
| `admin-clients.js` | ~315 | renderClients, archiveClient (DELETED prefix), openClientDetail |
| `admin-orders.js` | ~85 | renderOrders (megrendelések táblanézet) |
| `admin-messages.js` | ~200 | renderMessages, sendAdminReply (+push trigger v2.27.0) |
| `admin-push.js` ⭐ | 110 | renderPushBroadcast, sendBroadcastFromForm (manual broadcast UI) |
| `admin-reports.js` | ~450 | renderReports, renderAuditLog, renderAnalyticsDashboard |
| `admin-settings.js` | ~150 | renderSettings, saveSettings (kategóriák, jelszó, deadline) |
| `admin-help.js` | ~120 | renderAdminHelp (admin súgó) |

⭐ = új modul a v2.28.0-ban

#### 3. `receptura.html` — Receptúra modul
| JS fájl | Sor | Tartalom |
|---|---|---|
| `receptura-data.js` | ~230 | initApp, polling, settings load |
| `receptura-ui.js` | ~290 | UI helpers, getIng, FIFO ár, auto min/max |
| `receptura-recipes.js` | ~330 | renderRecipes, recipe CRUD |
| `receptura-stock.js` | ~190 | renderStock, FIFO megjelenítés |
| `receptura-production.js` | ~530 | renderProduction, confirmBakingDone (H3+H5 bulk OR-query) |
| `receptura-processing.js` | ~720 | Malom v2.5: 6 művelettípus (+cooking), yield kalk, cross-contamination, milling profile editor, **smart filtering operation+material_type+family szerint** (v2.34-35.0) |
| `receptura-levain.js` | ~100 | Levain számítások |
| `receptura-ingredients.js` | ~250 | Alapanyagok CRUD |
| `receptura-modal.js` | ~80 | Modal helpers |
| `receptura-ai.js` | ~270 | AI receptúra generálás (Anthropic/OpenAI/Groq) |
| `receptura-operational.js` | ~75 | Operatív segédfüggvények |
| `receptura-settings.js` ⭐ | 198 | renderSettings, saveFinancialSettings, saveBakingSettings, saveAiSettings |
| `receptura-ing-cats.js` ⭐ | 274 | renderIngCategories, addIngCategory, openStockIntakeModal, confirmStockIntake |
| `receptura-recipe-cats.js` ⭐ | 234 | renderRCategories, addRecipeCat, reassignRecipe, migrateRecipeProductIds |
| `receptura-help.js` | ~100 | renderReceptureHelp |

⭐ = M10 bontásból (v2.32.0)

### Közös fájlok
| Fájl | Tartalom |
|---|---|
| `kerek-constants.js` | APP_VERSION, magic numbers, helpers (esc, getOrderKey, getDays, hashPassword, debugLog), auditLog (sb.insert C1 fix), sendPushToClient, sendPushBroadcast, confirmDialog+alertDialog (M5), data-action delegator (M7) |
| `kerek-styles.css` | Globális stílusok, CSS változók (--teal-dark, --gold, stb.) |
| `supabase.js` | sb wrapper: query, insert, upsert, delete, subscribe (WS exp backoff H6), getSetting, hashPassword |
| `sw.js` | Service Worker (PWA cache, push handler) |

---

## 🔑 KONVENCIÓK A KÓDBÁZISBAN

### Szekciókomment-konvenció
A fájlokban a függvénycsoportok `// ===== SZEKCIO_NEVE =====` markerrel vannak elválasztva. Ezek **navigációs jel** — ne töröld őket.

```js
// ===== BAKING STATUS MACHINE =====
function getOrderStatus(...) {...}
function confirmDay(...) {...}

// ===== RENDER =====
function renderBaking() {...}
```

### Audit cimke-kommentek (S1, S2, A3, U6, C1, H4, M11, stb.)
Ezek tudatos referenciák a KEREK_audit_v*.md dokumentumokra. **Ne töröld őket** — múltbeli javítások nyomát adják.

### Globális névtér
**Nincs module system** (egyszerű script tag-ek). Minden funkció globálisan elérhető. A bontott fájlok együtt kell betöltődjenek a HTML-be a megfelelő sorrendben (lásd HTML-eket).

### Adatkonvenciók
- **Order key**: `${clientId}-${year}-${month}-${day}` — `getOrderKey()` helper használata kötelező
- **Year**: négyjegyű (2026)
- **Month**: 0-alapú (0=január, 11=december)
- **Day**: 1-alapú (1-31)
- **Status enum**: `pending`, `confirmed`, `modified`, `cancelled`, `fulfilled`

### v2.36.0 - ANTI-REGRESSZIÓ KONVENCIÓK (kötelező követni)

**DB műveletek**:
- ❌ TILTOTT: `sb.upsert(table, {...obj}, key)` és `sb.update(table, {...obj}, where)` — kliens-oldali extra mezők DB-be küldéséhez vezet
- ✅ HELYES: `sb.updateFields(table, { explicitField1, explicitField2 }, where)` — csak engedélyezett mezők

**CSS**:
- ❌ TILTOTT: inline `style="..."` modal, form, sticky pozícióhoz HTML-ben
- ✅ HELYES: `.modal`, `.form-row`, `.form-group`, `.sticky-bottom-bar` class-ok a `kerek-styles.css`-ben
- DO NOT CHANGE kommentek a kényes szabályoknál (modal max-width, form-group min-width, safe-area-inset)

**State sync**:
- Egységes Realtime subscription minden modulban (admin + vevő + receptúra)
- Új tábla bevezetésekor: hozzá kell adni mindhárom modul `*_RT_TABLES` listájához

**Navigáció**:
- ❌ TILTOTT: `getAttribute('onclick').indexOf(...)` lookup minta
- ✅ HELYES: `data-action="..."` + `data-arg1="..."` attribútumok keresése

**Adatforrások**:
- Ha CRUD több forrást érint (settings + usage), a render mindig az **uniót** mutassa
- `[...new Set([...src1, ...src2])].sort()` minta

**iOS safe-area**:
- Minden `position:fixed; bottom:0` elem: `padding-bottom: max(default, env(safe-area-inset-bottom));`

**Bug fix workflow**:
- Minden javított bug → bekerül a `KEREK_BUG_LOG.md`-be (gyökér ok + fix + prevenciós tanulság)
- Új session elején: olvasd el a BUG_LOG-ot, hogy lásd milyen pattern-eket kerülj el

### Új UI esemény — data-action pattern (M7 v2.33.0)
```html
<!-- Inkább ezt -->
<button data-action="doLogin">Belépés</button>
<button data-action="nav" data-arg1="dashboard">Dashboard</button>
<button data-action="saveProduct" data-arg1="42">Mentés</button>

<!-- Helyett ezt (ami régi, kerülendő új kódban) -->
<button onclick="doLogin()">Belépés</button>
```

A `kerek-constants.js`-ben lévő globális click delegator automatikusan kezeli:
- `data-arg1`, `data-arg2`, ..., `data-arg9` (max 9 paraméter)
- Auto-cast: `'true'/'false'` → boolean, numeric string → number, egyébként string
- Csak akkor működik, ha a `window[action]` függvény elérhető globálisan

**Komplex onclick esetén** (this paraméter, JS expression, kifejezés) **inline marad** — vagy emeld ki egy named helper-be.

### Modal dialógusok — M5 v2.31.0
**NE használj** natív `confirm()` és `alert()`-et. Helyette:
```js
if (await confirmDialog('Biztos?', {title: 'Megerősítés', danger: true})) { ... }
await alertDialog('Sikeres mentés!');
```

### Push notification — sendPushToClient (silent) + sendPushBroadcast (admin-confirmed)
- **Rendelés státusz változások** (confirm/modify/cancel/fulfilled) → CSENDBEN `sendPushToClient()`
- **Broadcast események** (új sütési nap, új termék, archiválás, manuális) → MEGERŐSÍTŐ popup-pal `sendPushBroadcast()`

---

## 📋 PROCESSES

### Új release workflow
1. **Tervezet** → jóváhagyás → kódolás (több file egyszerre)
2. **Verzió-bump**: `kerek-constants.js` APP_VERSION + minden HTML `?v=X.Y.Z` query string + `sw.js` CACHE_NAME
3. **Syntax check**: `node -e "..."` minden módosított JS-re
4. **Jest**: `npx jest --no-coverage`
5. **Single commit** + push
6. **Deploy ellenőrzés**: GitHub Actions API
7. **Eredmény ellenőrzés** (csak ha tényleg szükséges browser-rel)

### Verzió történet (audit-vezérelt fejlesztés)
- **v2.22.6** → v2.23.0: Mobile UX overhaul
- **v2.24.0–v2.25.2**: Toggle view + unified renderer + sticky bar
- **v2.26.0**: Unified 30s polling + stock badges
- **v2.27.0**: Push trigger admin message + receptúra fulfilled
- **v2.28.0**: Admin push broadcast (automatic + manual UI)
- **v2.29.0**: COMPREHENSIVE AUDIT FIXES (5 kritikus, 8 magas, 12 közepes)
- **v2.30.0**: C4 Admin auth Edge Function + admin_secrets RLS
- **v2.31.0**: M5 Custom modal (27 confirm/alert → dialog)
- **v2.32.0**: M9+M10 nagy fájlok bontása (vevo-orders 921→3 fájl, receptura-settings 684→3 fájl)
- **v2.33.0**: M7 + cleanup (10 unused fn törölve, 122 onclick→data-action, debugLog)
- **v2.34.0** (Session 3): Malom v2 — 5 művelettípus (milling/soaking/sprouting/fermenting/drying), yield kalkulátor, ingredient_milling_profile, cross-contamination védelem
- **v2.35.0** (Session 3.5): Multi-state ingredient — material_type (raw/intermediate/finished/consumable), ingredient_families, smart filtering operation szerint, 🍳 cooking művelet, state-badge
- **v2.36.0** (Audit batch): 13-bugfix batch — sb.updateFields helper (anti-schema-mismatch), központi modal/form CSS, vevő+receptúra Realtime subscription, KEREK_BUG_LOG.md, tooltip rendszer, favicon, sticky safe-area-inset, M7 regresszió fix (pendingBadge bakingNav lookup data-action támogatás)

### Audit-jelentések
- `KEREK_audit_v2.28.0.md` (v2.29.0-ban élesben javítva a kritikus + magas pontok)

---

---

## 🎯 FEATURE KOMPLETTESÉGI MÁTRIX (v2.36.0 állapot)

A mátrix segít elkerülni hogy egy hiányos feature-t "regressziónak" tekintsünk. ✅ = teljes; ⚠️ = részleges; ❌ = nincs.

### Admin modul
| Funkció | Status | Megjegyzés |
|---|---|---|
| Login + Auth | ✅ | Edge Function admin-auth, admin_secrets RLS |
| Dashboard | ✅ | Heti pénzügyi, havi forgalom, sütési napok, üzenetek |
| Termékkatalógus CRUD | ✅ | v2.36.0 archiveProduct schema-fix |
| Kliensek CRUD | ✅ | Deactiválás DELETED prefix-szel |
| Sütési lista | ✅ | Bulk confirmDay/saveModify (H1, H2) |
| Üzenetek | ✅ | Realtime, badge per-vevő |
| Push notification — silent (rendelés-status) | ✅ | Automatikus |
| Push notification — broadcast | ✅ | Admin-confirmed UI |
| Reports + Analytics | ✅ | Audit log, csv export |
| Kategóriák CRUD | ✅ | Termék + alapanyag + recept |
| Sütési lista új-rendelés badge | ✅ | v2.36.0 fix #6 |
| Üzenet olvasott tracking | ⚠️ | Race condition részben fix, teljes timestamp-alapú validáció TODO |

### Vevő modul
| Funkció | Status | Megjegyzés |
|---|---|---|
| Login + Register | ✅ | Hash-alapú |
| PWA install | ✅ | beforeinstallprompt custom UI |
| Push notification (subscribe) | ✅ | VAPID keys |
| Rendelés táblanézet | ✅ | Mobil + desktop unified renderer (M9) |
| Pivot termék-nézet | ✅ | Toggle Day/Product (v2.24.0) |
| Sticky havi total bar | ✅ | v2.36.0 safe-area-inset fix |
| PDF rendelés-összefoglaló | ✅ | jsPDF |
| Másolás vágólapra | ✅ | Heti minta copyLastOrder |
| Auto-confirm deadline (H8) | ✅ | Kliens-oldali fallback |
| Realtime admin üzenet | ✅ | v2.36.0 fix #8 |
| In-app banner új üzenetre | ✅ | v2.36.0 fix #9 |
| Vevő önkiszolgáló profil | ❌ | B5 backlog |

### Receptúra modul
| Funkció | Status | Megjegyzés |
|---|---|---|
| Receptek CRUD | ✅ | |
| Alapanyagok CRUD | ✅ | v2.35.0 material_type + family |
| Készlet (FIFO) | ✅ | ingredient_batches |
| Sütés visszaigazolás | ✅ | H3+H5 bulk OR-query |
| Malom / Feldolgozás v2 | ✅ | v2.34-35.0 — 6 művelet, yield, cross-contamination |
| Milling profile editor | ✅ | Per-alapanyag yield reference |
| Multi-state ingredient (family) | ✅ | v2.35.0 — raw/intermediate/finished családokba |
| Smart filtering operation szerint | ✅ | v2.35.0 |
| Cross-contamination védelem | ✅ | v2.34.0 |
| Levain számítások | ✅ | |
| AI receptúra generálás | ✅ | Anthropic/OpenAI/Groq |
| Alapanyag-kategóriák CRUD | ✅ | v2.36.0 settings + usage union fix |
| Kísérleti sütés modal | ⚠️ | Alapok, de NINCS verziókezelés (S5-6 backlog) |
| Recept verziókezelés (parent_id, status) | ❌ | S5 backlog |
| Recipe feedback rendszer | ❌ | S6 backlog |
| Side-by-side recept diff | ❌ | S6 backlog |
| Bevásárló lista | ❌ | S1-2 backlog (csak placeholder div) |
| Beszállítók management | ❌ | S1-2 backlog |
| Auto-suggestion (EOQ) | ❌ | S1-2 backlog |
| Fermentáció state machine | ❌ | S4 backlog (Pending→In_progress→Completed) |
| Folyamatban lévő batches widget | ❌ | S4 backlog |
| Auto-learning yield refinement | ❌ | S4 backlog |
| Termék picker outputhoz | ❌ | Session jövőbeli |

### Közös infrastruktúra
| Funkció | Status | Megjegyzés |
|---|---|---|
| Realtime subscription | ✅ | Admin (régóta), vevő + receptúra v2.36.0 |
| 30s polling backup | ✅ | Page Visibility aware |
| Audit log | ✅ | sb.insert C1 fix |
| Custom dialogs (confirm/alert) | ✅ | v2.31.0 M5 |
| data-action event delegation | ✅ | v2.33.0 M7 (HTML kész, JS részben) |
| Tooltip rendszer | ✅ | v2.36.0 data-tip + CSS |
| Favicon + meta tagek | ✅ | v2.36.0 |
| Central CSS (modal/form/sticky) | ✅ | v2.36.0 kerek-styles.css |
| sb.updateFields helper | ✅ | v2.36.0 anti-schema-mismatch |
| KEREK_BUG_LOG.md | ✅ | v2.36.0 |
| End-to-end tesztek (Playwright) | ❌ | L6 backlog |
| Accessibility (aria-label) | ⚠️ | Részleges (data-tip ad screen reader-nek értelmet) |


## 📋 BACKLOG — FELMERÜLT DE MEG NEM VALÓSÍTOTT FELADATOK / ÖTLETEK

Ezeket a session-ek során **felvetettük, megbeszéltük, vagy az auditban dokumentáltuk**, de valamilyen okból (kockázat, idő, prioritás, kifejezett kihagyás) nem valósultak meg. Jövőbeli munkák alapja.

### 🏢 ÜZLETI FEATURE-ÖK (B1-B7) — szándékosan kihagyva az auditbol

A felhasználó kérése alapján csak akkor csináljuk meg ha a vevői visszajelzések ezt indokolják.

#### B1 — Dashboard rendelés-trend grafikon
**Mit hiányol**: Admin dashboardon nincs 12-hónapos sávdiagram a havi rendelés-számokról + top-3 vevő + top-3 termék + kategória-megoszlás.
**Mit nyer**: Üzleti döntésekhez (mit készítsen több/kevesebb terméket, melyik vevő mennyit hoz).
**Benchmark**: Shopify, WooCommerce admin dashboard standardja.
**Becslés**: 1 nap (Chart.js + agregáció)
**Érintett fájlok**: `js/admin-ui.js` (renderDashboard), új `js/admin-trends.js`

#### B2 — Vevő-szegmentáció
**Mit hiányol**: A vevők nincsenek csoportosítva (új / aktív / inaktív / VIP).
**Mit nyer**: Targetelt push üzenetek, kedvezmény-akciók ("Hűségbónusz a top 5 vevőnek").
**Implementáció**: SQL view ami rendelés-gyakoriság alapján csoportosít. Kategória chip a `js/admin-clients.js`-ben.
**Becslés**: 4-6 óra
**Érintett fájlok**: `js/admin-clients.js`, új DB view

#### B3 — Alapanyag-megrendelés tervező
**Mit hiányol**: A receptúra modul tudja a stock-ot és igényt, de nem javasol mit kell rendelni mikorra (lead time alapján).
**Mit nyer**: Az adminnak nem kell fejben tartania mikor fogy ki valami; csökkenti a sürgős beszerzéseket.
**Implementáció**: `js/receptura-stock.js`-ben már van `getDaysToStockOut(ing)` típusú számolás. Új nézet: "Megrendelendő alapanyagok" táblával (lead_time × szükséglet = mikor kell rendelni).
**Becslés**: 4-6 óra
**Érintett fájlok**: `js/receptura-stock.js`, új nézet
**Adatbázis változás**: `ingredients` táblára új oszlop `lead_time_days`

#### B4 — Digitális számla / nyugta (PDF / e-Factura)
**Mit hiányol**: A vevő nem kap számlát/nyugtát a rendeléséről.
**Mit nyer**: Hargita megyei adózási megfelelés (Románia 2026: e-Factura kötelező), könyveléshez exportálható nyugták.
**Implementáció**: `pdfmake` vagy `jsPDF` lib. Email küldés is opció.
**Becslés**: 1 nap
**Érintett fájlok**: új `js/vevo-invoice.js`, vagy `js/vevo-orders-extras.js`-be belerakni
**Kockázat**: Romániai e-Factura rendszer integrációja külön munka (XML formátum, SPV küldés)

#### B5 — Vevői önkiszolgáló profil
**Mit hiányol**: A vevő nem tudja módosítani saját adatait (név, email, telefon), csak az admin tud beavatkozni.
**Mit nyer**: Adminisztrációs teher csökkenése, GDPR-megfelelés (jog az adatmódosításhoz).
**Implementáció**: Új vevő nézet `Profilom`. RLS policy a clients táblára hogy csak saját rekordot módosíthat.
**Becslés**: 4-6 óra
**Érintett fájlok**: `js/vevo-data.js`, `vevo.html` (új tab), DB RLS

#### B6 — Rendelés-előzmények letöltése (CSV / PDF)
**Mit hiányol**: A vevő nem tud lekérni saját éves összesítőt vagy excel exportot.
**Mit nyer**: Mint B4 — adózás, költségvetés-tervezés.
**Implementáció**: `js/vevo-orders-extras.js`-be új export gomb.
**Becslés**: 2-3 óra

#### B7 — Subscribe (auto-rendelés)
**Forrás**: Benchmark a session-ben: Olo és EZCater B2B platformokon van.
**Mit hiányol**: A vevő nem tud "minden héten ugyanaz a rendelés" típusú szabályt beállítani.
**Mit nyer**: Sok időt spórol vevőnek (rendszeres KEREK vásárlóknak), és az adminnak előre kalkulálható forgalmat ad.
**Implementáció**: Új `subscriptions` tábla (client_id, products JSON, frequency: weekly/biweekly/monthly, active_until). Cron Edge Function ami minden sütési nap előtt 1 nappal generálja a rendeléseket az aktív subscription-ök alapján.
**Becslés**: 2-3 nap (nagy feature)
**Adatbázis változás**: új tábla
**Kockázat**: Komplex business logic — vevő mikor szüneteltetheti, hogyan módosíthatja, mit lát a rendelés-listában

---

### 🐢 ALACSONY PRIORITÁSÚ AUDIT TÉTELEK (L)

#### L1 — Magyar és angol komment vegyesen
**Probléma**: A legtöbb komment magyar, néhány angol. Nem szabványos.
**Megoldás**: Egységes nyelv (javasolt: magyar, mivel a felhasználói nyelv az).
**Becslés**: 1-2 óra (kommentek átfutása)

#### L2 — Inkonzisztens function naming
**Probléma**: pl. `getTotalStock` vs `getIngredientTotalStock`, `mk` vs `getKey`, `ok` vs `getOrderKey`.
**Megoldás**: Egységes naming convention.
**Becslés**: 2-3 óra (rename + minden hivatkozás frissítése)
**Kockázat**: Magas, sok hely érintve

#### L4 — Hardcoded font URL-ek HTML-ben
**Probléma**: A `Fraunces` és `Kodchasan` font Google Fonts URL be van égetve 3 HTML fájlba.
**Megoldás**: `kerek-styles.css` `@import`-tal vagy `<link>` egy közös helyen.
**Becslés**: 30 perc
**Megjegyzés**: Az audit szerint már bekerült részben a `kerek-styles.css`-be — ellenőrzendő

#### L6 — End-to-end tesztek (Playwright)
**Probléma**: A `tests/calculations.test.js` (38 db) csak számolásokat fed le. A kritikus business flow-k (rendelés mentés, módosítás, sütés visszaigazolás, push notification) **nincsenek tesztelve**. Ezért is keletkezett a 3 kritikus bug az utolsó 2 hétben (C1 auditLog, C2 DELETED return, C3 qty0).
**Megoldás**: Playwright vagy Cypress + CI integráció (GitHub Actions).
**Becslés**: 1-2 nap setup + folyamatos 0.5 nap/feature
**Hatás**: Megelőzi a regressziókat új release-eknél

#### L7 — PWA manifest
**Eredmény**: Az auditban kiderült hogy a `manifest.json` **rendben van** (icons, theme_color, background_color, display: standalone). Nincs teendő.

#### L8 — Accessibility (a11y)
**Probléma**: A `<button onclick="✏️">` jellegű gomboknak nincs `aria-label`-jük screen reader-nek. A modal dialógusok `role="dialog"` nélkül vannak.
**Megoldás**: Minden ikonos gombhoz `aria-label`, dialógusoknak ARIA attribútumok.
**Becslés**: 4-6 óra (sok hely végigjárása)
**Hatás**: Vakok / gyengén látók számára használhatóbb

#### L9 — Telefon formátum validáció
**Eredmény**: Az auditban kiderült hogy a telefon mező **opcionális** és `type="tel"`, így bármi elfogadható. **Nincs teendő**, de jövőbeli kérés esetén regex validáció hozzáadható (pl. romániai +40 mintára).

---

### 🔧 KÖZEPES TÉTELEK AMIK NEM LETTEK MEGCSINÁLVA

#### M12 — Hosszú template literal-ek külön mappába
**Probléma**: Pl. `admin-clients.js`-ben a HTML template-ek embedded backtick string-ek (több 100 sor).
**Megoldás**: `templates/` mappa, vagy `<template>` HTML tag használat dinamikus klónozással.
**Becslés**: 1-2 nap (nagy refaktor)
**Kockázat**: Magas, mert a template-ek dinamikus értékkel vannak (sok `${variable}` interpoláció)

#### M7 részleges — JS-fájlokban maradt inline onclick
**Aktuális helyzet**: A 122 HTML onclick átírtuk data-action-re (v2.33.0). DE a JS-fájlokban (kb. 150 inline onclick a dinamikusan generált HTML-ben — pl. `vevo-orders-render.js`-ben `<button onclick="pivotChangeQty(${day}, ${pid}, ${delta})">`) **megmaradt**.
**Megoldás**: Event delegation pattern — a parent container-en egy listener, `data-*` attribútumokon keresztül paraméterek.
**Becslés**: 3-4 óra
**Kockázat**: Magas, mert 150 hely, könnyen elromolhat valami
**Megjegyzés**: A `kerek-constants.js`-beli globális `[data-action]` delegator már működne ezekkel is — csak a HTML generálást kellene átírni. **Konvencióként rögzítve: új kódba inkább data-action pattern**.

---

### 💡 FELHASZNÁLÓI VISSZAJELZÉSEK / KÉRÉSEK A SESSION-ÖKBÖL

#### Megvalósultak ✅
- **Push notification rendszer** — szét bonyolódott (silent rendelés-status + admin-confirmed broadcast)
- **Mobil UX overhaul** (v2.22.6 → v2.23.0)
- **Heti minta másolás** (`copyLastOrder` v2.25.1)
- **Sticky havi totál bottom bar** (v2.25.2)
- **Toggle view nap/termék** (v2.24.0)
- **Unified renderer mobil+desktop** (v2.25.0)
- **30s unified polling** (v2.26.0)
- **Admin Napló dashboard** (analytics aggregator)
- **Audit-vezérelt fejlesztés** (v2.29.0 - 17 fájl javítva)
- **Admin auth biztonsági refactor** (v2.30.0 - Edge Function)

#### Megvalósult de finomítható
- **C4 admin auth — UX**: a `verify_jwt: OFF` toggle a Supabase Dashboard-on kézzel kell legyen — automatizálható lenne Supabase CLI-vel
- **Push permission UX**: jelenleg nincs külön onboarding "engedélyezd a push-t" prompt, csak egy 🔔 gomb. Egy első-belépés-után popup ("Szeretnél értesítéseket kapni a rendeléseidről?") jobb lenne.
- **C5 Realtime debounce** működik (500ms), de **konkrét frissítés-eseményt** nem nézünk — minden update-re teljes `loadAllData` fut. Surgical update (csak a payload alapján a D objektum egy részét frissíteni) jobb lenne, de az audit nem írta elő.

#### Visszatérő témák amik kérésekben felmerültek
- **Limit-takarékosság**: kevesebb screenshot, batch push, rövid válaszok, kódbázis ne nőjön feleslegesen — folyamatos önkontroll
- **Tervezet-jóváhagyás**: minden új funkciónál először vázlat, aztán implementáció
- **End-to-end tesztelés** browserrel **csak explicit engedéllyel** — limit-érzékeny

---

### 🎯 NEM PRIORITIZÁLT, DE FELMERÜLT ÖTLETEK

#### Vevő-oldali push preferenciák
**Mit hiányol**: A vevő nem tudja típusonként ki/be kapcsolni a push-okat (pl. csak saját rendelés visszaigazolása, de nem kell az új termék hír).
**Megoldás**: `clients` táblába `push_preferences JSONB` oszlop. Vevő-settings UI.
**Becslés**: 4-6 óra
**Audit**: az M5-tel együtt felmerült de szándékosan kihagytuk

#### Rate limit a Realtime + REST hívásokra
**Mit hiányol**: A Supabase Free tier 50 000 req/hó. Az aktuális forgalom messzi (kb. 10%), de scale-up esetén túlléphető.
**Megoldás**: Monitoring + alert a Supabase Dashboard-ról; vagy a kliens-oldali polling intervallumot dinamikusan változtatni terhelés szerint.

#### Receptúra modul függőségi gráf
**Mit hiányol**: Egy recept módosításakor nem látszik melyik termék gyártásába van bele kötve.
**Megoldás**: `getRecipeDependencies(recipeId)` helper + UI a recept modal-ban.
**Becslés**: 2-3 óra

#### Admin auto-backup
**Mit hiányol**: Nincs napi/heti automatikus DB-backup.
**Megoldás**: Supabase automatikus backup-okat ad a Pro tier-ben. Free tier-en pg_dump cron Edge Function-nel.
**Becslés**: 3-4 óra

#### Vevő-rendelés statisztika modal
**Mit hiányol**: Egy admin által megnyitott vevő-detail nézetben jó lenne egy mini-statisztika (havi rendelés-szám trend, kedvenc termék, átlag rendelés-érték).
**Megoldás**: `js/admin-clients.js` `openClientDetail()`-ben új szekció.
**Becslés**: 3-4 óra
**Megjegyzés**: A v2.29.0 cleanup-ban töröltük a `renderClientTrend` function-t — de a jövőben hasonló funkciót újra létrehozhatunk

#### Push-csekkold sticky banner a vevőnek
**Mit hiányol**: Ha a vevő egyszer letiltotta a push-t, nincs reminder hogy újra engedélyezze.
**Megoldás**: Vevő bejelentkezés után, ha `Notification.permission === 'denied'`, mutass egy diszkrét bannert ("Engedélyezz értesítést a rendeléseidről").
**Becslés**: 1-2 óra

---

### 🔮 STRATÉGIAI TÖPRENGÉSEK / NAGY KÉPI ÖTLETEK

#### Multi-pékség támogatás
**Vízió**: A KEREK kód lehetne több pékség által használt SaaS platform.
**Becslés**: Hatalmas refaktor (multi-tenant DB schema, tenant-aware Edge Functions, branding per tenant)
**Realitás**: Csak akkor érdemes ha tényleges igény van rá

#### Mobil app (React Native / Capacitor)
**Vízió**: Natívabb mobil élmény. Jelenleg a PWA jó, de a push iOS-en korlátozott (csak 16.4+ és csak add-to-home-screen-ből).
**Becslés**: 2-3 hónap
**Realitás**: PWA most elég, csak akkor kell ha sok iPhone vevő van akik nem PWA-ként installálják

#### AI-asszisztens vevőknek
**Vízió**: A receptúra modulban már van AI integráció (Anthropic, OpenAI, Groq). Egy hasonló asszisztens a vevő oldalon válaszolhat kérdésekre ("Mikor van a következő sütés?", "Adj javaslatot 4 fős reggelire").
**Becslés**: 2-3 nap
**Költség**: Per-vevő AI token költség kalkulálandó

---

## 🚦 KONVENCIÓK ÚJ MUNKÁHOZ

Ha bármelyik fenti backlog tétel felmerül, a **fejlesztési munkamód kötelező szabályai** alapján:

1. **Tervezet írása** előbb (mit, miért, edge case, érintett fájlok, becsült méret/sor)
2. **Várj jóváhagyásra** mielőtt kódolsz
3. **Batch munka** — minden kapcsolódó változtatás egy commitban
4. **Konvenciók követése**:
   - `// ===== SZEKCIÓ_NEVE =====` szekciókomment új függvénycsoporthoz
   - Audit cimke-komment (pl. `// B1 fix:`) ha valamely backlog tételt javítod
   - Új UI: `data-action` pattern, nem inline onclick
   - Új dialógus: `confirmDialog` / `alertDialog`, nem natív `confirm()` / `alert()`
   - Új API hívás: `sb` wrapper használata, nem közvetlen `fetch`
   - Új konstans: `kerek-constants.js`-be, nem inline magic number
5. **Verzió-bump kötelező** (kerek-constants.js + minden HTML `?v=` + sw.js CACHE_NAME)
6. **Syntax check** + Jest
7. **Push** + GitHub Actions deploy verify

---

## ✅ TÉNYEK A JELENLEGI KÓDBÁZIS ÁLLAPOTÁRÓL

- ~30 fájl, ~10000 sor JS
- Nincs dead unused function (v2.33.0 cleanup után)
- Nincs deprecated handler vagy duplikált cleanup
- Nincs console.log (csak debugLog ami DEBUG=false esetén nem log-ol)
- Push notification rendszer teljes körű
- Admin auth biztonsági szinten
- N+1 queries kikerülve (bulk operations)
- Realtime debounced (C5)
- WS exponential backoff (H6)
- Promise.allSettled parallel loadAllData (H4)
- Edge Functions: dynamic-service + admin-auth élesben
