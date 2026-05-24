---
name: kerek-workflow
description: Fejlesztési munkamód KEREK pékség rendeléskezelő rendszerhez. Használd ezt a skillt MINDEN alkalommal amikor a KEREK projekten dolgozol.
---

# KEREK Workflow Skill (v2.33.0 — 2026-05-24)

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
| `receptura-processing.js` | ~210 | Feldolgozás (intermediate ingredients) |
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

### Audit-jelentések
- `KEREK_audit_v2.28.0.md` (v2.29.0-ban élesben javítva a kritikus + magas pontok)

---

## ⚠️ FIGYELMEZTETÉS — DEFERRED feladatok

Ezeket még NEM csináltuk meg, jövőbeli javításokra:
- **B1-B6 üzleti**: dashboard sávdiagram, vevő-szegmentáció, alapanyag-rendelő tervező, PDF nyugta, vevő profil, rendelés-előzmény export, subscribe (auto-rendelés)
- **L6**: end-to-end tesztek (Playwright)
- **L8**: accessibility (aria-label-ek)
- **L9**: telefon formátum validáció regisztrációban

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
