# KEREK – ÁTADÁS (2026-09-29)

> **Ezt olvasd ELŐSZÖR** egy új session-ben (a `CLAUDE.md` után, a `KEREK_SKILL.md` előtt).
> A jelenlegi állapotot és a következő lépéseket rögzíti.

## 1. Verzió-állapot

| Környezet | Verzió | Megjegyzés |
|---|---|---|
| **Prod (main)** | v2.53.94 | kurált promóciók — main és staging divergál |
| **Staging** | **v2.54.1** | v2.53.95–136 gyártás flow + admin-vevő, v2.54.0 számla-operátor, v2.54.1 audit-javítások |

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

## 5. C csomag (biztonság) — folyamatban

Döntések (Csongor, 2026-09-30):
- Belépés: **kód** VAGY **e-mail + PIN** (4–6 számjegy); név szerinti belépés megszűnik; „Maradj bejelentkezve” 90 nap.
- Elfelejtett PIN: **2 előre definiált biztonsági kérdés** (9-es listából), napi 3 próba → önkiszolgáló új PIN. Később: e-mailes helyreállítás (ingyenes Brevo).
- Admin: vevő-kártyán WhatsApp-gomb (wa.me, kézi küldés), PIN törlése, helyreállítási jelzés.
- 3 lépés: C1 vevői oldal → C2 admin/receptúra → C3 lezárás (SQL); termék-írásvédelem is C3.
- Képernyőterv: `prototypes/c1_belepes.html` (jóváhagyásra vár).

Biztonsági kérdések (lista): első mobiltelefon márkája+típusa; első munkahely neve; első koncert/fesztivál; első külföldi város; első autó márkája+színe; kedvenc általános iskolai tanár vezetékneve; kedvenc könyv/film címe; legjobb gyerekkori barát utcája; nagyszülő kedvenc étele.

## 6. Nyitott (következő csomagok)

- **C — Biztonság** (külön terv kell): vevő-login szerveren át + `clients` RLS-lezárás (GDPR); AI-kulcs szerver-oldalra; `dynamic-service` hitelesítés. Részletek: `KEREK_SKILL.md` §17.
- **D — Tesztek** a rendelés / készlet / gyártás logikára.
- Nyitott kérdések Csongor felé: az élesben is `admin` az admin jelszó? A pékség valódi címe (ha kell a push-ba)?
