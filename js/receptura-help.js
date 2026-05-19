// ===== RECEPTÚRA SÚGÓ =====
function renderRecepturaHelp() {
  const el = document.getElementById('view-receptura-help');
  if (!el) return;

  el.innerHTML = `
  <div style="max-width:820px;margin:0 auto">

    <div class="card mb-16" style="background:linear-gradient(135deg,var(--teal-dark) 0%,#0a6460 100%)">
      <div class="card-body">
        <div style="font-family:'Fraunces',serif;font-size:1.4rem;font-weight:700;color:var(--gold);margin-bottom:8px">📖 Receptúra kézikönyv</div>
        <div style="font-size:0.88rem;color:rgba(255,255,255,0.9);line-height:1.6">
          A receptúra modul a pékség operatív magja. Kezeli a recepteket, alapanyagokat, készletet, levain előkészítést és a napi gyártást.
        </div>
      </div>
    </div>

    <!-- RECEPTEK -->
    <div class="card mb-16">
      <div class="card-head"><div class="card-title">📋 Receptek</div></div>
      <div class="card-body">
        <p style="font-size:0.88rem;color:var(--text-soft);margin-bottom:12px">Az összes aktív recept listája kártyánézетben. Minden recepthez tartozik egy termék a katalógusból.</p>
        <div style="display:grid;gap:10px">
          ${rHelpItem('Recept kártya', 'Mutatja: termék neve · alap adag · egységsúly · sütési veszteség % · összetevők száma. Kattints a Részletek gombra a teljes recepthez.')}
          ${rHelpItem('Recept detail nézet', 'Az összes hozzávaló sub_type szerinti csoportosításban (Száraz liszt · Egyéb száraz · Nedves · Kovász). Minden sor mutatja: %-os arányt · grammot · alapanyag árát ha be van vezetve.')}
          ${rHelpItem('Darabszám skálázás', 'A recept detail nézetben a csúszkával vagy mezőbe írva beállíthatod a darabszámot. Az összes mennyiség arányosan skálázódik. A sütési veszteség NEM szerepel az összetevők számításában – a recept már tartalmazza.')}
          ${rHelpItem('🧪 Kísérleti sütés', 'A recept detail nézetből indítható. Rögzít egy próba sütést: FIFO alapján levonja az alapanyagokat a készletből, de nem kerül a rendelési statisztikákba (log_type=experimental).')}
          ${rHelpItem('Verziókezelés', 'Minden receptnek lehet több verziója. Az "Új verzió" gomb archiválja a régit és klónozza az újat. A korábbi verziók visszaállíthatók.')}
          ${rHelpItem('Adatlap nyomtatás', 'A recept teljes adatlapja nyomtatható/PDF-be menthető (összetevők, allergének, tápérték, sütési paraméterek).')}
        </div>
      </div>
    </div>

    <!-- ÜZEMI NÉZET -->
    <div class="card mb-16">
      <div class="card-head"><div class="card-title">👨‍🍳 Üzemi nézet</div></div>
      <div class="card-body">
        <p style="font-size:0.88rem;color:var(--text-soft);margin-bottom:12px">Sütés közbeni egyszerűsített nézet – technológus vagy cukrász számára.</p>
        <div style="display:grid;gap:10px">
          ${rHelpItem('Recept választás', 'Válaszd ki a receptet és add meg a sütendő darabszámot. A rendszer kiszámolja az összes szükséges mennyiséget.')}
          ${rHelpItem('Csoportosított összetevők', 'Száraz · Nedves · Kovász csoportokban. Dedup-olva: ha ugyanaz az alapanyag többször szerepelne (pl. kétféle névvel), összevonódik.')}
          ${rHelpItem('Gramm pontosság', 'A mennyiségek a megadott darabszámra számolva gramban jelennek meg, sütési veszteség nélkül.')}
        </div>
      </div>
    </div>

    <!-- ALAPANYAGOK & KÉSZLET -->
    <div class="card mb-16">
      <div class="card-head"><div class="card-title">🌿 Alapanyagok & Készlet</div></div>
      <div class="card-body">
        <p style="font-size:0.88rem;color:var(--text-soft);margin-bottom:12px">FIFO alapú készletkezelés. Az alapanyagok tételenként (batch) vannak nyilvántartva.</p>
        <div style="display:grid;gap:10px">
          ${rHelpItem('Készlet kártyák', 'Minden alapanyag saját kártyán: készlet gramban · progress bar (min–max arány) · FIFO ár · átlagár · minimum/maximum szint.')}
          ${rHelpItem('📦 Bevételezés', 'Kattints a bevételezés gombra. Add meg: mennyiség (g/kg/ml/L) · ár (lej/kg VAGY teljes összeg) · szállító (opcionális). A rendszer FIFO sorba helyezi.')}
          ${rHelpItem('FIFO logika', 'A legrégebbi tételt vonja le először. Az ár is a legrégebbi tétel árán számolódik – ez adja az önköltség pontosságát.')}
          ${rHelpItem('Min/Max szintek', 'Automatikusan kalkulálódnak az elmúlt 90 nap rendelési adataiból. Felülírható manuálisan (🔒 lakat ikon = kézi · 🤖 = automatikus). A progress bar zöld/sárga/piros jelzi az állapotot.')}
          ${rHelpItem('💰 Ár beállítása', 'Ha nincs bevételezési ár, manuálisan is beállítható az egységár. Ez kerül az önköltség kalkulációba.')}
          ${rHelpItem('🛒 Bevásárló lista', 'Az összes kritikus és hiányzó alapanyag egyszerre listázva, exportálható CSV-be.')}
          ${rHelpItem('Kész levain (ID=105)', 'Félkész termék – a levain előkészítéskor kerül ide, és gyártáskor vonódik le. Külön kezelt a nyersanyagoktól.')}
        </div>
      </div>
    </div>

    <!-- NAPI LEVAIN -->
    <div class="card mb-16">
      <div class="card-head"><div class="card-title">🧫 Napi levain igény</div></div>
      <div class="card-body">
        <p style="font-size:0.88rem;color:var(--text-soft);margin-bottom:12px">A reggeli levain előkészítés kalkulátora – a rendelési adatokból számítja.</p>
        <div style="display:grid;gap:10px">
          ${rHelpItem('Hónap + nap választás', 'Válaszd ki a hónapot, majd pipáld be a sütési napokat amelyekre kalkulálni szeretnél. Csak azok a napok jelennek meg amelyekre van rendelés.')}
          ${rHelpItem('Kiszámítás', 'A "Levain igény kiszámítása" gomb megmutatja naponként: a levainhoz szükséges kovász alapot · vizet · lisztet. Alatta termékenkénti bontás (melyik termékhez mennyi levain szükséges).')}
          ${rHelpItem('🧫 Levain rögzítése készletbe', 'Ha elkészítetted a levaint, kattints erre a gombra. A kész levain bekerül a Kész levain (ID=105) készletbe. Ezt fogja a gyártás levonni sütéskor.')}
        </div>
      </div>
    </div>

    <!-- GYÁRTÁS ELŐKÉSZÍTÉS -->
    <div class="card mb-16">
      <div class="card-head"><div class="card-title">🏭 Gyártás előkészítés</div></div>
      <div class="card-body">
        <p style="font-size:0.88rem;color:var(--text-soft);margin-bottom:12px">A sütési nap teljes nyersanyag-szükségletének kiszámítása a rendelések alapján.</p>
        <div style="display:grid;gap:10px">
          ${rHelpItem('Hónap + nap választás', 'Válaszd ki a hónapot, majd pipáld be a sütési napokat. Csak rendeléses napok jelennek meg.')}
          ${rHelpItem('🏭 Előkészítés kiszámítása', 'Gombra kattintva megjelenik: termékenként összecsukható kártyák (darabszám · kg nyers · összetevők kategóriánként) + összesített nyersanyagigény.')}
          ${rHelpItem('Termékenkénti kártyák', 'Sötétzöld fejléc mutatja: termék neve · napok · darabszám · kg nyers tészta. Kinyitva: összetevők sub_type szerint csoportosítva (%, gramm, ár). Dedup-olva.')}
          ${rHelpItem('Összes nyersanyagigény', 'Összesítve az összes termék szükséglete kategóriánként. Minden sor: ✓ Elegendő / ⚠ Kritikus / ✗ Hiány státusszal.')}
          ${rHelpItem('✅ Sütés elvégezve', 'A kiszámítás után megjelenik ez a gomb. Ha megnyomod: FIFO alapján levonja az összes alapanyagot a készletből · production_logs bejegyzést ír · az aznapi rendeléseket FULFILLED státuszra állítja. Ha valami hiányzik, figyelmeztet de folytatható.')}
          ${rHelpItem('🛒 Bevásárló lista', 'CSV export a hiányzó alapanyagokról.')}
        </div>
      </div>
    </div>

    <!-- MALOM -->
    <div class="card mb-16">
      <div class="card-head"><div class="card-title">🏭 Malom / Feldolgozás</div></div>
      <div class="card-body">
        <p style="font-size:0.88rem;color:var(--text-soft);margin-bottom:12px">Nyers alapanyag feldolgozásának rögzítése (pl. mag → liszt). Az önköltség arányosan kerül a kimeneti alapanyagokra.</p>
        <div style="display:grid;gap:10px">
          ${rHelpItem('+ Új feldolgozás', 'Add meg: dátum · munkaidő percben · bemenetek (nyers mag, gramm) · kimenetek (liszt/dara, gramm, opcionális ár%).')}
          ${rHelpItem('Önköltség elosztás', 'A bemeneti alapanyagok FIFO ára + munkaidő ára automatikusan elosztódik a kimenetekre. Ha megadsz ár%-ot, az alapján – ha nem, grammarányosan.')}
          ${rHelpItem('Automatikus bevételezés', 'A kimeneti alapanyagok automatikusan bekerülnek a készletbe a kiszámított önköltséggel (source_type=processing).')}
        </div>
      </div>
    </div>

    <!-- ÖNKÖLTSÉG -->
    <div class="card mb-16">
      <div class="card-head"><div class="card-title">💰 Önköltség elemzés</div></div>
      <div class="card-body">
        <p style="font-size:0.88rem;color:var(--text-soft);margin-bottom:12px">Termékenként mutatja az önköltséget és a fedezeti számítást.</p>
        <div style="display:grid;gap:10px">
          ${rHelpItem('Stat kártyák', 'Aktív receptek · Átlagos fedezet % · Nincs ár (figyelmeztető) · Önköltség alatt értékesített termékek.')}
          ${rHelpItem('Táblázat', 'Termékenként: önköltség/db · javasolt ár (30% fedezet) · jelenlegi ár · különbség · optimális ár 15 db-os sorozatnál · megtakarítás sorozatnál.')}
          ${rHelpItem('Pontosság', 'Az önköltség csak akkor pontos ha az alapanyagoknál be vannak vezetve az árak (bevételezésnél). Ha 0 az ár → önköltség alulbecsült.')}
        </div>
      </div>
    </div>

    <!-- KÍSÉRLETI SÜTÉS -->
    <div class="card mb-16">
      <div class="card-head"><div class="card-title">🧪 Kísérleti sütés</div></div>
      <div class="card-body">
        <p style="font-size:0.88rem;color:var(--text-soft);margin-bottom:12px">Tesztsütés rögzítése – statisztikákba nem számít bele, de a készletet levonja.</p>
        <div style="display:grid;gap:10px">
          ${rHelpItem('Indítás', 'A bal menüből (🧪) vagy a recept detail nézetből indítható. Válaszd ki a receptet és a darabszámot.')}
          ${rHelpItem('Önköltség preview', 'Még rögzítés előtt mutatja a becsült anyagköltséget.')}
          ${rHelpItem('Rögzítés', 'FIFO levonat az alapanyagokból · production_logs bejegyzés log_type=experimental-lal · nem befolyásolja a forgalmi statisztikákat.')}
        </div>
      </div>
    </div>

    <!-- TIPPEK -->
    <div class="card mb-16" style="background:var(--teal-pale);border:1.5px solid var(--teal)">
      <div class="card-head"><div class="card-title" style="color:var(--teal-dark)">💡 Tipikus reggeli workflow</div></div>
      <div class="card-body">
        <div style="font-size:0.85rem;line-height:1.9;color:var(--teal-dark)">
          <b>1. Napi levain igény</b> → napok kiválasztása → Kiszámítás → Levain elkészítése → "🧫 Levain rögzítése készletbe"<br>
          <b>2. Gyártás előkészítés</b> → ugyanazok a napok → "🏭 Előkészítés kiszámítása" → ellenőrzöd az alapanyagokat → ha hiány van, bevételezés<br>
          <b>3. Sütés</b> – a recept kártyák alapján<br>
          <b>4. "✅ Sütés elvégezve"</b> → automatikus készlet-levonat + FULFILLED státusz a rendelésekre
        </div>
      </div>
    </div>

  </div>`;
}

function rHelpItem(title, desc) {
  return `<div style="display:grid;grid-template-columns:220px 1fr;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);font-size:0.85rem">
    <div style="font-weight:600;color:var(--teal-dark)">${title}</div>
    <div style="color:var(--text-soft);line-height:1.5">${desc}</div>
  </div>`;
}
