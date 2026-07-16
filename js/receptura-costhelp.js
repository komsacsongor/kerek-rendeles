// ===== receptura-costhelp.js =====
// Számítási módszertan súgó — minden modulból elérhető (ℹ️ gomb).
// Egy helyen dokumentálja, MI ALAPJÁN számol a rendszer (te + könyvelő visszakövetheti).

function openCostHelp(){
  const s = (typeof R !== 'undefined' && R.settings) ? R.settings : {};
  const rate = (typeof shopRate === 'function') ? shopRate() : 0;
  const cap  = (typeof totalOvenCapacity === 'function') ? totalOvenCapacity() : 0;
  const ovenKw = (typeof avgOvenPowerKw === 'function') ? avgOvenPowerKw() : 0;

  const ov = document.createElement('div'); ov.id='costhelp-overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(6,76,72,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px';
  ov.innerHTML = `<div style="background:#fff;border-radius:14px;max-width:640px;width:100%;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,0.3)">
    <div style="background:var(--teal-dark);color:var(--cream);padding:16px 20px;border-radius:14px 14px 0 0;display:flex;justify-content:space-between;align-items:center">
      <div style="font-family:'Fraunces',serif;font-weight:700;font-size:1.05rem">ℹ️ Hogyan számol a rendszer?</div>
      <button onclick="closeCostHelp()" style="background:none;border:none;color:var(--cream);font-size:1.4rem;cursor:pointer;line-height:1">×</button>
    </div>
    <div style="padding:18px 20px;overflow:auto;font-size:0.86rem;line-height:1.55;color:var(--slate)">

      <p style="margin:0 0 14px"><b>Az önköltség 5 tételből áll.</b> A cél: minden költség <b>egyszer</b> szerepeljen, sehol ne duplázódjon.</p>

      <div style="background:var(--cream);border-radius:10px;padding:12px 14px;margin-bottom:16px;font-family:monospace;font-size:0.8rem">
        egységár = ( alapanyag + munka + sütő + mixer + rezsi ) / darabszám
      </div>

      <h4 style="color:var(--teal-dark);margin:16px 0 6px">1. Alapanyag</h4>
      <p style="margin:0 0 10px">A recept összetevői az árjegyzék (FIFO beszerzési ár) alapján. Pontos, mérhető.</p>

      <h4 style="color:var(--teal-dark);margin:16px 0 6px">2. Munka — fix + változó</h4>
      <p style="margin:0 0 6px"><code>munka = (fix_perc + perc/db × N) / 60 × órabér</code></p>
      <ul style="margin:0 0 10px;padding-left:18px">
        <li><b>Fix idő:</b> előkészítés, bemérés, takarítás — nem függ a darabszámtól.</li>
        <li><b>Változó idő:</b> formázás, csomagolás — darabbal nő.</li>
        <li>A kelesztés/pihentetés <b>nem számít bele</b> (közben mást csinálsz).</li>
        <li>Ezért olcsóbb 10 db egységára, mint 1 db-é: a fix idő eloszlik.</li>
      </ul>

      <h4 style="color:var(--teal-dark);margin:16px 0 6px">3. Sütő — tálca-ciklus</h4>
      <p style="margin:0 0 6px"><code>sütések = felkerekít( tálcák / tálca-per-sütés )</code><br>
      <code>sütő_kWh = sütések × sütési_óra × kW × kihasználtság(0,7)</code></p>
      <ul style="margin:0 0 10px;padding-left:18px">
        <li>A <b>kW ≠ fogyasztás</b>: a kW a max teljesítmény; a tényleges fogyasztás = kW × óra × <b>0,7</b> (a fűtőszál nem megy végig — a termosztát ki-be kapcsol).</li>
        <li>A termék annyi sütést visz, amennyi a tálcáiból <b>ténylegesen</b> kijön — a vegyes sütésnél nem terheljük rá a teljes sütést mindenre.</li>
        <li>A 0,7 mérhető okos-konnektorral pontosítható, de az energia a teljes költség csak ~2-3%-a — nem kritikus.</li>
      </ul>

      <h4 style="color:var(--teal-dark);margin:16px 0 6px">4. Mixer</h4>
      <p style="margin:0 0 10px"><code>mixer_kWh = mixer_perc/60 × mixer_kW</code> — direkt, mérhető energia.</p>

      <h4 style="color:var(--teal-dark);margin:16px 0 6px">5. Rezsi — a „maradék", órára osztva</h4>
      <p style="margin:0 0 6px"><code>üzemi óradíj = ( havi fix kiadás − direkt energia ) / havi termelő óra</code><br>
      <code>rezsi = falóra × üzemi óradíj</code></p>
      <ul style="margin:0 0 10px;padding-left:18px">
        <li>A havi fix kiadás (bérlet, <b>teljes</b> villanyszámla, víz, biztosítás, takarítás, <b>amortizáció</b>). A már direkten felszámolt sütő+mixer energia a <b>napi termelési nézetben</b> pontosan levonódik ebből; recept-szinten a teljes rezsi oszlik (a ~2-3% eltérés elhanyagolható).</li>
        <li><b>Falóra, nem munkaóra+sütőóra:</b> a munka és a sütés párhuzamos (sütés közben formázol), ezért a hosszabbikat vesszük — nem adjuk össze.</li>
        <li>Ami sokáig süt / sok kézimunkát igényel → több rezsit visz (jogosan foglalja az üzemet).</li>
      </ul>

      <div style="background:var(--teal-pale);border-radius:10px;padding:12px 14px;margin:14px 0;font-size:0.82rem;color:var(--teal-dark)">
        <b>Aktuális paramétereid:</b><br>
        Munkabér: ${s.labor ?? '—'} lej/h · Áram: ${s.electricity ?? '—'} lej/kWh · Sütő kihasználtság: 0,7<br>
        Sütő-kapacitás: ${cap || '—'} tálca · Átlag sütő: ${ovenKw ? ovenKw.toFixed(1) : '—'} kW<br>
        Üzemi óradíj: ${rate > 0 ? '<b>'+rate.toFixed(2)+' lej/h</b>' : '⚠️ nincs beállítva (havi rezsi + termelő óra kell)'}
      </div>

      <h4 style="color:var(--gold-dark);margin:16px 0 6px">Amit a modell NEM tartalmaz</h4>
      <p style="margin:0 0 8px">Csomagolás, kiszállítás, marketing, adó/ÁFA (külön kezelve), banki költség. Ezeket az árrésnek kell fedeznie, vagy külön ráterhelni.</p>

      <p style="margin:12px 0 0;font-size:0.78rem;color:var(--text-soft)">
        <b>Iparági viszonyítás:</b> kézműves pékségben a bér tipikusan a költség 40–60%-a, az energia+rezsi 8–12%, az alapanyag 25–40%. A modell ezt a szerkezetet követi.</p>

    </div>
    <div style="padding:12px 20px;border-top:1px solid var(--border);text-align:right">
      <button class="btn btn-primary" onclick="closeCostHelp()">Értem</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
}
function closeCostHelp(){ const o=document.getElementById('costhelp-overlay'); if(o) o.remove(); }

if (typeof window !== 'undefined'){
  window.openCostHelp = openCostHelp;
  window.closeCostHelp = closeCostHelp;
}
