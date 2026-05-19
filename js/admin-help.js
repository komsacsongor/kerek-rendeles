// ===== ADMIN SÚGÓ =====
function renderAdminHelp() {
  const el = document.getElementById('view-admin-help');
  if (!el) return;

  el.innerHTML = `
  <div style="max-width:820px;margin:0 auto">

    <!-- BEVEZETŐ -->
    <div class="card mb-16" style="background:linear-gradient(135deg,var(--teal-dark) 0%,#0a6460 100%);color:white">
      <div class="card-body">
        <div style="font-family:'Fraunces',serif;font-size:1.4rem;font-weight:700;color:var(--gold);margin-bottom:8px">📖 Admin kézikönyv</div>
        <div style="font-size:0.88rem;opacity:0.9;line-height:1.6">
          Ez a súgó végigvezet a KEREK admin felület összes funkcióján. A bal oldali menüben navigálhatsz a különböző modulok között.
        </div>
      </div>
    </div>

    <!-- DASHBOARD -->
    <div class="card mb-16">
      <div class="card-head"><div class="card-title">📊 Dashboard</div></div>
      <div class="card-body">
        <p style="font-size:0.88rem;color:var(--text-soft);margin-bottom:12px">A főoldal áttekintést ad az aktuális hónap állapotáról.</p>
        <div style="display:grid;gap:10px">
          ${helpItem('Hónapválasztó (Jan–Dec tab-ok)', 'Kattints bármelyik hónapra az adott hónap adatainak megtekintéséhez. A jelenlegi hónap automatikusan ki van jelölve.')}
          ${helpItem('Stat kártyák', 'Aktív vevők száma · Havi rendelések száma · Havi forgalom (lej) · Olvasatlan üzenetek száma.')}
          ${helpItem('Következő sütési napok', 'A közelgő sütési napokat listázza rendelésszámmal és a szükséges levain mennyiséggel (🧫 XXXg levain). Ha nincs rendelés, "üres" jelzéssel.')}
          ${helpItem('Legutóbbi üzenetek', 'A vevők által küldött legutóbbi üzenetek előnézete. Kattints rá az Üzenetek menüponthoz ugráshoz.')}
          ${helpItem('Havi forgalom grafikon', 'Az elmúlt 6 hónap forgalmának vizuális összehasonlítása.')}
        </div>
      </div>
    </div>

    <!-- ÜZENETEK -->
    <div class="card mb-16">
      <div class="card-head"><div class="card-title">💬 Üzenetek</div></div>
      <div class="card-body">
        <p style="font-size:0.88rem;color:var(--text-soft);margin-bottom:12px">Kétirányú kommunikáció a vevőkkel. A vevők üzenetet küldhetnek megrendeléshez, te válaszolhatsz.</p>
        <div style="display:grid;gap:10px">
          ${helpItem('Üzenetszálak', 'Vevőnként vannak csoportosítva a szálak. Az olvasatlan üzeneteket félkövér betűvel jelzi.')}
          ${helpItem('Válasz küldése', 'Nyisd meg a vevő üzenetét → gépeld be a választ → Küldés. A vevő a saját felületén látja az admin válaszát.')}
          ${helpItem('Olvasatlan számláló', 'A bal menüben a 💬 Üzenetek melletti szám mutatja az olvasatlan üzeneteket.')}
        </div>
      </div>
    </div>

    <!-- SÜTÉSI LISTA -->
    <div class="card mb-16">
      <div class="card-head"><div class="card-title">🔥 Sütési lista</div></div>
      <div class="card-body">
        <p style="font-size:0.88rem;color:var(--text-soft);margin-bottom:12px">A nap legfontosabb nézete – itt kezeled a sütési napokat és a rendelések jóváhagyását.</p>
        <div style="display:grid;gap:10px">
          ${helpItem('Hónap + nap navigáció', 'A hónapválasztó tab-okon navgálj. A sütési napok automatikusan jelennek meg a rendelési számmal.')}
          ${helpItem('Rendelések megtekintése', 'Kattints egy sütési napra a kártya lenyitásához. Látod: vevőnként, termékenkénti bontásban a megrendelt mennyiségeket.')}
          ${helpItem('✅ Jóváhagyás', 'Az egyes rendeléseknél a ✅ gomb jóváhagyja azt. A vevő kap értesítést (CONFIRMED státusz). A "Mindent jóváhagy" gomb egyszerre jóváhagyja az összes PENDING rendelést arra a napra.')}
          ${helpItem('📋 Módosítás', 'Az admin felülírhatja a vevő által megrendelt mennyiséget. A vevő MODIFIED értesítést kap.')}
          ${helpItem('Státuszok', '<b>⏳ Vár</b> – beérkezett, jóváhagyásra vár · <b>✅ Jóváhagyva</b> – visszaigazolt · <b>✏️ Módosítva</b> – admin módosított · <b>🎉 Elkészült</b> – sütés megtörtént · <b>❌ Visszavonva</b> – törölt')}
          ${helpItem('Határidő', 'A rendelési határidő minden sütési naphoz automatikusan az előző nap 18:00. Ezután a vevő nem módosíthat.')}
        </div>
      </div>
    </div>

    <!-- ÖSSZESÍTŐ -->
    <div class="card mb-16">
      <div class="card-head"><div class="card-title">📋 Összesítő</div></div>
      <div class="card-body">
        <p style="font-size:0.88rem;color:var(--text-soft);margin-bottom:12px">Havi rendelési összesítő táblázat – ki mit rendelt az adott hónapban.</p>
        <div style="display:grid;gap:10px">
          ${helpItem('Táblázat', 'Soronként a vevők, oszloponként a termékek. A cellákban az adott napra rendelt mennyiség.')}
          ${helpItem('CSV export', 'Az adatok letölthetők CSV formátumban, Excel-ben megnyitható.')}
          ${helpItem('Havi forgalom', 'Az oldal alján a havi bevétel összesítve vevőnként.')}
        </div>
      </div>
    </div>

    <!-- TERMÉKKATALÓGUS -->
    <div class="card mb-16">
      <div class="card-head"><div class="card-title">🧁 Termékkatalógus</div></div>
      <div class="card-body">
        <p style="font-size:0.88rem;color:var(--text-soft);margin-bottom:12px">A pékség termékeit kezeled itt. Amit itt beállítasz, a vevők azt látják a megrendelő felületen.</p>
        <div style="display:grid;gap:10px">
          ${helpItem('Termékek tab', 'Összes aktív termék listája kártya nézetben. Szerkesztés, törlés (archíválás), új termék létrehozása.')}
          ${helpItem('Aktív ezen a hónapon', 'Csak azok a termékek rendelhetők a vevők által, amelyeket az adott hónapra aktiváltál. Kattints egy termékre → Aktiválás gombot találsz.')}
          ${helpItem('+ Új termék', 'Kitöltendő mezők: Név · Tömeg · Ár · Kategória · Leírás · Kép · Marketing szöveg · Összetevők · Allergének · Tápérték táblázat.')}
          ${helpItem('Termékcsaládok tab', 'Azonos termék különböző méretváltozatait kötheted össze (pl. fehér kenyér 500g és 1000g). Ezek a vevői oldalon összetartozóként jelennek meg.')}
          ${helpItem('Archívum tab', 'A törölt/inaktivált termékek megmaradnak itt. Visszaállíthatók.')}
        </div>
      </div>
    </div>

    <!-- KLIENSEK -->
    <div class="card mb-16">
      <div class="card-head"><div class="card-title">👥 Kliensek</div></div>
      <div class="card-body">
        <p style="font-size:0.88rem;color:var(--text-soft);margin-bottom:12px">A vevők kezelése – belépési adatok, elérhetőségek, forgalmi előzmények.</p>
        <div style="display:grid;gap:10px">
          ${helpItem('🔗 Regisztrációs link', 'Generál egy linket (register.html) amelyet elküldhetsz vevőknek. Ők kitöltik a nevüket és email címüket, kapnak egy belépési kódot, de csak te hagyod jóvá a hozzáférést.')}
          ${helpItem('Jóváhagyás', 'Az újonnan regisztráló vevők sárga keretes kártyával jelennek meg "⏳ Jóváhagyásra vár" felirattal. Kattints a ✅ Jóváhagyás gombra az aktiváláshoz.')}
          ${helpItem('+ Új kliens', 'Manuálisan is felvehetsz vevőt. Megadod a nevet, emailt, telefont. A rendszer generál belépési kódot.')}
          ${helpItem('Kliens kártya', 'Mutatja: összes rendelés száma · összes forgalom · email · telefon · belépési kód. Kattints az Adatlap gombra a részletes előzményekhez.')}
          ${helpItem('Deaktiválás (törlés)', 'A × gomb nem törli a vevőt, hanem deaktiválja (soft delete). A rendelési előzmények megmaradnak, a vevő nem tud belépni. Visszaállítható.')}
          ${helpItem('Belépési módok', 'A vevők beléphetnek: belépési kóddal (KER-XXXX-XXXX) · email címmel · nevükkel.')}
        </div>
      </div>
    </div>

    <!-- KIMUTATÁSOK -->
    <div class="card mb-16">
      <div class="card-head"><div class="card-title">📈 Kimutatások</div></div>
      <div class="card-body">
        <p style="font-size:0.88rem;color:var(--text-soft);margin-bottom:12px">Forgalmi és rendelési statisztikák időszakra vetítve.</p>
        <div style="display:grid;gap:10px">
          ${helpItem('Forgalmi kimutatás', 'Havi bevétel összesítve, vevőnkénti bontásban. Archivált termékek is megjelennek "(archivált)" jelzéssel – a múltbeli bevétel nem veszik el.')}
          ${helpItem('Kategória bontás', 'Termékkategóriánkénti forgalom és rendelésszám.')}
          ${helpItem('Termékcsalád riport', 'Termékcsaládonkénti havi trend – ▲ növekvő, ▼ csökkenő.')}
          ${helpItem('Audit napló', 'Minden adminisztrációs tevékenység naplózva: belépések, termékmentések, rendelés jóváhagyások, jelszócsere. Szűrhető és CSV-be exportálható.')}
          ${helpItem('Export', 'Rendelési adatok, forgalmi adatok letöltése CSV formátumban.')}
        </div>
      </div>
    </div>

    <!-- BEÁLLÍTÁSOK -->
    <div class="card mb-16">
      <div class="card-head"><div class="card-title">⚙️ Beállítások</div></div>
      <div class="card-body">
        <div style="display:grid;gap:10px">
          ${helpItem('Sütési napok', 'Melyik napnapokon sütsz? (Hétfő–Vasárnap jelölhető, több is.) Ezt a vevők is látják – csak ezeken a napokon rendelhetnek.')}
          ${helpItem('Rendelési feltételek', 'Szabad szöveges mező – megjelenik a vevői súgóban. Ide írhatod: fizetési feltételek, visszavonási határidő, egyéb szabályok.')}
          ${helpItem('Szállítás & Átvétel', 'Szabad szöveges mező – megjelenik a vevői súgóban. Ide írhatod: átvételi helyszín, nyitvatartás, szállítás feltételei.')}
          ${helpItem('Jelszócsere', 'Az admin belépési jelszó megváltoztatása. A jelszó SHA-256 hashként tárolódik.')}
          ${helpItem('Kategóriák', 'Termék kategóriák kezelése – ezek jelennek meg a termékkatalógusban és a rendelési táblában.')}
        </div>
      </div>
    </div>

    <!-- TIPPEK -->
    <div class="card mb-16" style="background:var(--teal-pale);border:1.5px solid var(--teal)">
      <div class="card-head"><div class="card-title" style="color:var(--teal-dark)">💡 Tipikus napi munkafolyamat</div></div>
      <div class="card-body">
        <div style="font-size:0.85rem;line-height:1.9;color:var(--teal-dark)">
          <b>Reggel (sütési nap előtt):</b><br>
          1. Dashboard → megtekinted a szükséges levain mennyiséget<br>
          2. Sütési lista → Megnyitod az aznapi napot<br>
          3. Ellenőrzöd a rendeléseket → "Mindent jóváhagy" gomb<br>
          4. Receptúra → Gyártás előkészítés → kiszámolod az alapanyagokat<br><br>
          <b>Sütés után:</b><br>
          5. Receptúra → Gyártás előkészítés → "✅ Sütés elvégezve" → automatikusan levonja a készletet és FULFILLED státuszra állítja a rendeléseket<br><br>
          <b>Alkalmanként:</b><br>
          6. Kliensek → Jóváhagyod az új vevőket<br>
          7. Üzenetek → Válaszolsz a vevőknek<br>
          8. Termékkatalógus → Aktualizálod az aktív termékeket
        </div>
      </div>
    </div>

  </div>`;
}

function helpItem(title, desc) {
  return `<div style="display:grid;grid-template-columns:200px 1fr;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);font-size:0.85rem">
    <div style="font-weight:600;color:var(--teal-dark)">${title}</div>
    <div style="color:var(--text-soft);line-height:1.5">${desc}</div>
  </div>`;
}
