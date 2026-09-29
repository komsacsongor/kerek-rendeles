# KEREK — Claude Code munkautasítás

> Ezt minden session automatikusan betölti. Részletes projekt-tudás: `KEREK_SKILL.md`.
> Aktuális állapot / félbeszakadt munka / élesítési teendők: `KEREK_ATADAS.md` (ELŐBB ezt).
> Történet, döntések, megtörtént hibák: `KEREK_HISTORY.md` (csak szükség esetén).

## Együttműködés (Csongor)
- Magyarul, tömören, végeredmény-fókusszal. Csongor nem programozó: a döntéseket üzleti nyelven kérdezd.
- Új funkció / érdemi változtatás előtt rövid terv (mit, miért, edge case-ek, érintett fájlok) → jóváhagyás → kód.
- Egy feature / javítás-csomag = egy commit. Hiányzó információnál kérdezz, ne találgass.
- Ha valami nem hatékony a közös munkában, jelezd.

## Git és környezetek
- **Staging-first**: minden munka a `staging` ágra épül; a session-ágon fejlesztünk, és **a `staging` ágra pusholhatsz** (Csongor engedélye, 2026-09-26).
- **`main` (PROD) csak Csongor kifejezett jóváhagyása után**, a bevett „PROD PROMÓCIÓ" mintával (kurált, nem sima merge — lásd KEREK_SKILL §19 / KEREK_ATADAS).
- A felhő-session eldobható: minden lezárt munkaegység azonnal push (session-ág + staging).
- Staging web-frissítés: `deploy.yml` workflow_dispatch a `main`-en (GitHub MCP). EF-ek: `supabase/functions/**` push-ra automatikusan.
- **Titok (token, API-kulcs, jelszó) soha nem kerül a repóba** — a repó publikus.

## Adatbázis
- A Supabase ebből a környezetből NEM érhető el. Séma-változás = idempotens SQL a `db/ÉÉÉÉ-HH_vX.Y_leírás.sql` fájlba, ellenőrző SELECT-tel; Csongor futtatja a Supabase SQL Editorban (PROD **és** STAGING — a staging DB vasárnaponként felülíródik a PROD-ból).
- Séma-referencia és tiltott oszlopnevek: `KEREK_SKILL.md` §7 és §12.

## Push előtt (kötelező)
```bash
for f in js/*.js *.js; do node --check "$f" || echo "FAIL $f"; done
npx jest --no-coverage
```
- Verzió-bump 3 helyen (`kerek-constants.js` APP_VERSION, HTML `?v=`, `sw.js` CACHE_NAME) — KEREK_SKILL §10.
- Érintett fájlok elolvasva, a teljes user flow végiggondolva (vevő / admin / receptúra / gyártás).
- A két gyártási belépési pont (régi „Sütés elvégezve" és a Gyártás flow „Nap lezárása") a KÖZÖS segédeket használja (`receptura-production.js`) — ne írj külön FIFO-ciklust.
