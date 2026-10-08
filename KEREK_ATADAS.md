# KEREK – ÁTADÁS (2026-09-29)

> **Ezt olvasd ELŐSZÖR** egy új session-ben (a `CLAUDE.md` után, a `KEREK_SKILL.md` előtt).
> A jelenlegi állapotot és a következő lépéseket rögzíti.

## 1. Verzió-állapot

| Környezet | Verzió | Megjegyzés |
|---|---|---|
| **Prod (main)** | v2.53.94 | kurált promóciók — main és staging divergál |
| **Staging** | **v2.55.1** | v2.53.95–136 gyártás flow + admin-vevő, v2.54.0 számla-operátor, v2.54.1 audit-javítások |

A korábbi push-blokk (2026-09-25) megoldódott: a v2.54.0 a bundle-ből felkerült (2026-09-26).

## 2. v2.54.1 — audit-javítások (A+B csomag, 2026-09-29)

- **Auto-confirm EF**: lapozva olvas (eddig 1000 sor fölött kimaradtak rendelések); a kisütött (fulfilled) napot nem állítja vissza confirmed-re, és nem küld újra push-t.
- **Gyártás flow „Nap lezárása"**: FIFO-készletlevonás + önköltség ('customer' log), rendelések → fulfilled (lemondottak kivételével) + vevő-push; nem zárható le duplán (sem itt, sem a régi gombbal).
- **Régi „Sütés elvégezve"**: „Mégse" utáni dupla extra-levonás javítva; lemondott rendelés nem lesz fulfilled; ugyanaz a dupla-levonás védelem; a push-ból kikerült a kitöltő „Str. Főutca 1" cím.
- **Közös segédek** (`receptura-production.js`): `addRecipeNeeds`, `findMissingNeeds`, `fifoDeductNeeds` (helyi állapot csak sikeres DB-írás után), `hasStockDeductionForDate`, `markDaysFulfilled`.
- **Vevő**: „Összes törlése" csak a még módosítható napokat törli; tétel 0-ra vételekor a jóváhagyott nap visszakerül pending-be.
- **Készlet-polling**: ugyanaz a leképezés/limit, mint az első betöltésnél (`mapBatchRow`, `recomputeIngredientStock`).
- **Számla-operátor**: hiányzó adatú új alapanyag nem véglegesíthető; egység-felismerés pontos egyezéssel („kilogram" ≠ liter); újrapróbálás nem hoz létre dupla beszállítót / alapanyagot / tételt; a bevételezett tétel DB-ID-val kerül a helyi állapotba; új alapanyag-ID a DB maximumából.
- SQL-ek a `db/`-be; GitHub token eltávolítva a `package.json`-ból; `CLAUDE.md` létrehozva.

## 3. 🔴 Teendők (Csongor)

1. **GitHub token visszavonása** (`ghp_sinR…`, a git-történetben megmarad): GitHub → Settings → Developer settings → Personal access tokens.
2. **SQL a STAGING-en** (Supabase SQL Editor), mindkettő idempotens, a végén ellenőrző lekérdezéssel:
   - `db/2026-09_v2.53_gyartas_oszlopok.sql` (várt eredmény: 9 sor)
   - `db/2026-09_v2.54_szamla_bevetelezes.sql` (várt eredmény: 3 sor)
3. **Teszt a `/staging/`-en** (lásd §4), majd jóváhagyás → PROD.
4. PROD élesítéskor: ugyanez a két SQL **PROD-on is, a kód előtt**; EF-ek PROD-ra (`deploy-edge-functions.yml` → production: `auto-confirm-orders`, `bnr-rates`).

## 4. Staging teszt-forgatókönyv

- **Gyártás flow**: nap kiválasztása → 4 fázis → „Nap lezárása": a megerősítő ablak listázza a levonandó alapanyagokat; utána a Készlet csökken, a napló/statisztikában megjelenik az önköltség, a rendelések „elkészült"-ek. Második lezárási kísérletnél figyelmeztetés.
- **Régi „Sütés elvégezve"** ugyanarra a napra → figyelmeztet, hogy már volt levonás.
- **Vevő**: jövőbeli nap tétele 0-ra → admin oldalon a nap pending; „Összes törlése" a múltbeli/lezárt napokat meghagyja.
- **Számla-operátor**: PDF feltöltés → áttekintő → véglegesítés → a Készletben megjelenik; hiányzó mennyiségű új tételnél nem enged véglegesíteni.

## 5. C csomag (biztonság)

### C1 — vevői oldal: KÉSZ (staging, v2.55.0) — tesztre vár
- **Belépés a szerveren** (`vevo-auth` EF): kód VAGY e-mail + PIN; név szerinti belépés megszűnt; aláírt token („Maradjak bejelentkezve” 90 nap, egyébként 12 óra). A böngésző NEM tölti le a vevőlistát.
- **Saját adatok** (`vevo-data` EF): rendelés, állapot, üzenet, állandó rendelés, push — a tokenre szűkítve; a **határidőt és a lezárt napokat a szerver is ellenőrzi** (lezárt nap sorait kihagyja), a vevő nem írhat admin-üzenetet, nem állíthat fulfilled/cancelled státuszt.
- **Meglévő vevők**: belépés után kötelező pop-up (adatok → PIN → 2 kérdés), „Később” nincs. **Átmenet**: a még PIN nélküli fiók **2026-10-31-ig** e-maillel (PIN nélkül) is beléphet — utána csak kóddal (`LEGACY_EMAIL_UNTIL`, vevo-auth).
- **Új vevők**: regisztráció 2 lépésben (név/e-mail/telefon kötelező → PIN + 2 kérdés), a kódot a szerver generálja. `register.html` → átirányít.
- **Helyreállítás**: e-mail → saját 2 kérdés → új PIN (napi 3 próba; a 3. után admin-push). Ismeretlen e-mailre is „kérdések” jönnek (nem derül ki, kinek van fiókja).
- **Admin**: vevő-kártyán PIN-állapot, „PIN törlése”, hibás-helyreállítás figyelmeztetés, összesítő + szűrő; **előnézet** csak olvasható, 30 perces tokennel (a nyitott `?preview=ID` megszűnt); admin-jog jelzés javítva (`is_admin` a leképezésben).
- Realtime: a vevő a saját üzeneteit/állapotát 30 mp-es lekérdezéssel kapja (a realtime mindenki eseményét küldte volna).
- DB: `client_auth` tábla (RLS, policy nélkül) — `db/2026-10_v2.55_vevo_auth.sql`.

**Teendő a teszthez:** az SQL STAGING-en (és PROD-on is futtatható, üres új tábla). Teszt: kóddal belépés → pop-up → beállítás → kilépés → e-mail+PIN belépés → „Elfelejtettem” → regisztráció → admin: PIN-állapot, PIN törlése, előnézet.

### C1 javítás — v2.55.1 (Csongor tesztje alapján, 2026-10-08)
- **Belépés csak e-mail + 4 jegyű PIN** (a kód már nem belépési adat, csak belső azonosító); a 4. számjegy után automatikus belépés.
- **Ideiglenes PIN** (admin, 🔑 a vevő-kártyán): 4 jegy, 7 napig; a vevő belépéskor köteles újat választani (`must_change`, `temp_pin_until`). A „PIN törlése” megszűnt.
- Átmenet: PIN nélküli fiók 2026-10-31-ig e-maillel PIN nélkül is beléphet (→ kötelező beállítás); utána ideiglenes PIN kell.
- Hibák javítva: hosszú űrlap görgethető; PIN-dobozban a kurzor mindig a végén (visszatörlés); a hibaüzenet eltűnik szerkesztéskor és sikernél; siker-képernyő „Vissza a belépéshez” gombbal; **regisztráció visszavonódik, ha a PIN nem mentődött** (eddig csendben „sikeres” lett — Suba Ernő esete).
- **Ok (DB-ellenőrzés 2026-10-08):** a `client_auth` tábla sem stagingen, sem PROD-on NEM létezett → `db/2026-10_v2.55.1_vevo_auth_temp_pin.sql` (a tábla + új oszlopok, egyben) — **STAGING és PROD**.
- DB-ellenőrzés: `.github/workflows/db-check.yml` (staging-push `db/` változáskor; logban: létezik-e, zárt-e).

### C2 — admin / receptúra (következik)
- `clients`, `orders`, `order_status`, `messages`, `push_subscriptions`, `standing_orders`, `settings`-írás → `kData` (admin-data EF) + összevont (batch) lekérés a rate-limit miatt.
- `dynamic-service` hitelesítés: service kulcs / modul-jelszó / vevő-token (csak ADMIN felé).
- AI-kulcs szerver-oldalra (ai-proxy EF, kulcs az `admin_secrets`-ben) + régi kulcs cseréje.
- Műveleti napló (audit_log) admin/receptúra írás kData-n át (júliusi lezárás óta nem írt).

### C3 — lezárás (SQL, Csongor futtatja)
- RLS + policy nélkül: clients, orders, order_status, messages, standing_orders, push_subscriptions; settings: csak nyilvános kulcsok olvashatók; termékek/kínálat/naptár: anon csak olvas.

Biztonsági kérdések (lista): `kerek-constants.js` → `SEC_QUESTIONS` (9 db).

## 6. Nyitott (következő csomagok)

- **D — Tesztek** a rendelés / készlet / gyártás logikára.
- Nyitott kérdések Csongor felé: az élesben is `admin` az admin jelszó? A pékség valódi címe (ha kell a push-ba)?
