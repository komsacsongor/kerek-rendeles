// ============================================================
// KEREK – Számla-bevételező AI operátor
// v2.54.0
// Számla (PDF/kép, RO/EN/HU) → kiolvasás (text/vision) → párosítás
// → landed cost → deviza→lej (BNR) → áttekintő → cég+alapanyag+FIFO bevételezés
// ============================================================

const _INV = {
  file: null,
  parsed: null,      // nyers LLM-kimenet
  supplier: null,    // { match: 'found'|'new', id, data }
  lines: [],         // feldolgozott sorok (státusszal)
  fx: { currency: 'RON', rate: 1, date: null, source: '' },
  busy: false,
};

// A Groq alapból nem lát képet; ez a modell igen. Beállításból felülírható.
const _INV_VISION_DEFAULT = { groq: 'meta-llama/llama-4-scout-17b-16e-instruct', openai: 'gpt-4o-mini', anthropic: 'claude-sonnet-4-20250514', gemini: 'gemini-2.0-flash' };

function _invNorm(s){ return (s||'').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]/g,''); }
function _invNum(v){ if(v==null) return 0; if(typeof v==='number') return v; const n=parseFloat(String(v).replace(/\s/g,'').replace(',','.').replace(/[^0-9.\-]/g,'')); return isNaN(n)?0:n; }

// ---------- NÉZET ----------
function renderInvoiceIntake(){
  const host = document.getElementById('view-invoice-intake');
  if(!host) return;
  const p = R.settings?.aiProvider || 'anthropic';
  const hasKey = !!R.settings?.apiKey;
  host.innerHTML = `
  <div style="max-width:960px;margin:0 auto">
    <div class="card" style="border-left:4px solid var(--teal)">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <div style="font-size:1.6rem">🧾</div>
        <div>
          <div style="font-family:'Fraunces',serif;font-weight:700;font-size:1.15rem;color:var(--teal-dark)">Számla bevételezés</div>
          <div style="font-size:0.8rem;color:var(--text-soft)">Tölts fel egy beszállítói számlát (PDF vagy fotó). Az operátor kiolvassa, párosítja, és előkészíti a bevételezést — te csak a bizonytalan tételeket erősíted meg.</div>
        </div>
      </div>
    </div>

    <div class="card">
      <input type="file" id="inv-file" accept="application/pdf,image/*" style="display:none" onchange="handleInvoiceFile(this)">
      <div id="inv-drop" data-action="invPick" style="border:2px dashed var(--border);border-radius:14px;padding:30px 20px;text-align:center;cursor:pointer;transition:.15s;background:var(--teal-pale)">
        <div style="font-size:2rem;margin-bottom:6px">📤</div>
        <div style="font-weight:600;color:var(--teal-dark)">Kattints ide a számla feltöltéséhez</div>
        <div style="font-size:0.76rem;color:var(--text-soft);margin-top:4px">PDF (szöveges vagy szkennelt) vagy fotó · RO / EN / HU</div>
      </div>
      ${!hasKey ? `<div style="margin-top:12px;padding:10px 12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:9px;font-size:0.8rem;color:#9a3412">⚠️ Nincs AI API-kulcs. Add meg a <b>Beállítások → AI</b> alatt.</div>` : ''}
      <div style="margin-top:10px;font-size:0.72rem;color:var(--text-soft)">
        AI szolgáltató: <b>${esc(p)}</b>${p==='groq'?' — a szöveges PDF a jelenlegi modelleddel megy; fotó/szkennelt PDF esetén vision-modell kell (lásd lent).':''}
      </div>
      <details style="margin-top:8px">
        <summary style="font-size:0.74rem;color:var(--text-soft);cursor:pointer">Haladó: vision (képes) modell</summary>
        <div style="margin-top:6px;display:flex;gap:8px;align-items:center">
          <input type="text" id="inv-vision-model" value="${esc(R.settings?.invoiceVisionModel || _INV_VISION_DEFAULT[p] || '')}" placeholder="képes modell azonosító" style="flex:1;padding:7px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:0.8rem">
          <button class="btn btn-ghost btn-sm" data-action="invSaveVisionModel">Mentés</button>
        </div>
        <div style="font-size:0.68rem;color:var(--text-soft);margin-top:4px">Csak szkennelt/fotó számlához kell. Szöveges PDF-hez nincs rá szükség.</div>
      </details>
    </div>

    <div id="inv-status" style="display:none" class="card"></div>
    <div id="inv-review"></div>
  </div>`;
}

function invPick(){ document.getElementById('inv-file')?.click(); }
function invSaveVisionModel(){
  const v = document.getElementById('inv-vision-model')?.value?.trim() || '';
  R.settings.invoiceVisionModel = v;
  try { sb.setSetting('invoice_vision_model', v); } catch(e){}
  toast('✅ Vision modell mentve.');
}

function _invStatus(html, spin){
  const el = document.getElementById('inv-status');
  if(!el) return;
  el.style.display = 'block';
  el.innerHTML = `<div style="display:flex;align-items:center;gap:10px;font-size:0.86rem;color:var(--teal-dark)">${spin?'<span class="spin">⏳</span>':''}<div>${html}</div></div>`;
}

// ---------- FÁJL → SZÖVEG / KÉP ----------
function loadPDFJS(){
  return new Promise((resolve,reject)=>{
    if(window.pdfjsLib){ resolve(); return; }
    const s=document.createElement('script');
    s.src='js/lib/pdf.min.js';
    s.onload=()=>{ try{ window.pdfjsLib.GlobalWorkerOptions.workerSrc='js/lib/pdf.worker.min.js'; }catch(e){} resolve(); };
    s.onerror=()=>reject(new Error('A PDF-feldolgozó betöltése sikertelen.'));
    document.head.appendChild(s);
    setTimeout(()=>{ if(!window.pdfjsLib) reject(new Error('PDF-feldolgozó időtúllépés.')); }, 15000);
  });
}

async function _pdfGetTextOrImages(file){
  await loadPDFJS();
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({data:buf}).promise;
  let text = '';
  const nPages = Math.min(pdf.numPages, 8);
  for(let i=1;i<=nPages;i++){
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    text += tc.items.map(it=>it.str).join(' ') + '\n';
  }
  // Ha van értékelhető szövegréteg → text út
  if(text.replace(/\s/g,'').length >= 40){ return { text: text.substring(0,12000), images: [] }; }
  // Különben: oldalak → kép (vision út), max 3 kép
  const images = [];
  const maxImg = Math.min(pdf.numPages, 3);
  for(let i=1;i<=maxImg;i++){
    const page = await pdf.getPage(i);
    const vp = page.getViewport({scale:2});
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    await page.render({canvasContext:canvas.getContext('2d'), viewport:vp}).promise;
    images.push(canvas.toDataURL('image/jpeg', 0.85));
  }
  return { text:'', images };
}

function _fileToDataURL(file){
  return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); });
}

async function handleInvoiceFile(input){
  const file = input.files?.[0];
  if(!file) return;
  input.value='';
  _INV.file = file;
  document.getElementById('inv-review').innerHTML='';
  try{
    _invStatus('Fájl olvasása…', true);
    let payload;
    if(file.type === 'application/pdf' || /\.pdf$/i.test(file.name)){
      payload = await _pdfGetTextOrImages(file);
    } else if(file.type.startsWith('image/')){
      payload = { text:'', images:[ await _fileToDataURL(file) ] };
    } else {
      throw new Error('Csak PDF vagy kép tölthető fel.');
    }
    if(payload.images.length){ _invStatus('Számla kiolvasása képből (vision AI)…', true); }
    else { _invStatus('Számla kiolvasása szövegből (AI)…', true); }
    const parsed = await aiParseInvoice(payload);
    _INV.parsed = parsed;
    _invStatus('Párosítás és költség-számítás…', true);
    await _invBuildModel(parsed);
    document.getElementById('inv-status').style.display='none';
    renderInvoiceReview();
  }catch(e){
    console.error('invoice:', e);
    _invStatus('❌ '+e.message, false);
  }
}

// ---------- AI KIOLVASÁS ----------
function _invPrompt(){
  return `Te egy pékség beszállítói SZÁMLÁIT dolgozod fel. Olvasd ki az adatokat és adj vissza KIZÁRÓLAG JSON-t, semmi más szöveget.
A számla lehet román, angol vagy magyar nyelvű. A terméknevet fordítsd/normalizáld MAGYAR alapanyagnévre a "hu_name" mezőbe (pl. "făină de orez"/"rice flour" → "rizsliszt", "drojdie" → "élesztő", "zahăr" → "cukor", "sare" → "só").

JSON struktúra:
{
  "supplier": {"name":"cég neve","cui":"adószám/CUI ha van (pl RO12345678)","reg_com":"cégjegyzékszám ha van","address":"cím ha van","iban":"IBAN ha van"},
  "invoice_number":"számla sorszáma",
  "invoice_date":"ÉÉÉÉ-HH-NN",
  "currency":"RON|EUR|HUF|USD (a számla pénzneme)",
  "lines":[
    {
      "raw_name":"a tétel eredeti neve a számlán",
      "hu_name":"magyar alapanyagnév",
      "type":"material|shipping|other",   // material=nyersanyag/áru, shipping=szállítás/fuvar, other=betétdíj/csomagolás/egyéb
      "qty":2,                            // számlázott mennyiség (darabszám vagy tömeg)
      "unit":"az egység a számlán (buc/db/kg/l/zsák/sac...)",
      "pack_size":25,                     // 1 csomag/zsák nettó tartalma, ha értelmezhető
      "pack_unit":"kg|l|g|ml|db",
      "base_qty_g":50000,                 // A TELJES mennyiség GRAMBAN vagy ML-ben (db esetén darabszám). Számold ki: qty*pack_size átváltva g/ml-re. Ha nem tudod, null.
      "weight_kg":50,                     // a tétel becsült össztömege kg-ban (landed cost súlyozáshoz); ha nem tudod, null
      "unit_price_net":12.5,             // NETTÓ egységár (ÁFA nélkül)
      "line_total_net":625,              // NETTÓ sorérték (ÁFA nélkül)
      "vat_pct":9
    }
  ],
  "totals":{"net":0,"vat":0,"gross":0}
}

FONTOS:
- Minden árat NETTÓ (ÁFA nélküli) értékként adj meg. Ha csak bruttót látsz, számold vissza a vat_pct alapján.
- A "type" legyen "shipping" a szállítási/fuvar/transport tételeknél, "other" a betétdíj/csomagolás/kaució tételeknél, "material" minden valós árunál.
- base_qty_g: kg→*1000, l→*1000, g/ml→*1, db→darabszám. Ha "2 zsák × 25 kg", akkor 2*25*1000 = 50000.
- Ha egy mező nem olvasható ki, tedd null-ra. NE találj ki adatot.`;
}

async function aiParseInvoice({text, images}){
  const apiKey = R.settings?.apiKey;
  if(!apiKey) throw new Error('Nincs AI API-kulcs (Beállítások → AI).');
  const provider = R.settings?.aiProvider || 'anthropic';
  const _pd = {anthropic:'claude-sonnet-4-20250514',gemini:'gemini-2.0-flash',groq:'openai/gpt-oss-20b',openai:'gpt-4o-mini'};
  let model = R.settings?.aiModel || _pd[provider] || 'gpt-4o-mini';
  const useVision = images && images.length>0;
  if(useVision){
    model = (R.settings?.invoiceVisionModel || _INV_VISION_DEFAULT[provider] || model);
  }
  const promptText = _invPrompt() + (text ? `\n\nSZÁMLA SZÖVEGE:\n${text}` : '');

  let apiUrl, headers, body;
  if(provider === 'anthropic' || provider === 'custom'){
    apiUrl = provider === 'custom' ? (R.settings.aiUrl || 'https://api.anthropic.com/v1/messages') : 'https://api.anthropic.com/v1/messages';
    headers = { 'Content-Type':'application/json', 'x-api-key':apiKey, 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true' };
    const content = [{type:'text', text:promptText}];
    (images||[]).forEach(d=>{ const m=/^data:(image\/[a-z]+);base64,(.*)$/i.exec(d); if(m) content.push({type:'image', source:{type:'base64', media_type:m[1], data:m[2]}}); });
    body = JSON.stringify({ model, max_tokens:8000, messages:[{role:'user', content}] });
  } else if(provider === 'gemini'){
    const cleanMdl = model.replace('models/','');
    apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${cleanMdl}:generateContent?key=${apiKey}`;
    headers = { 'Content-Type':'application/json' };
    const parts = [{text:promptText}];
    (images||[]).forEach(d=>{ const m=/^data:(image\/[a-z]+);base64,(.*)$/i.exec(d); if(m) parts.push({inline_data:{mime_type:m[1], data:m[2]}}); });
    body = JSON.stringify({ contents:[{parts}], generationConfig:{maxOutputTokens:8000, responseMimeType:'application/json'} });
  } else if(provider === 'groq'){
    apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
    headers = { 'Content-Type':'application/json', 'Authorization':'Bearer '+apiKey };
    const content = useVision ? [{type:'text', text:promptText}, ...images.map(d=>({type:'image_url', image_url:{url:d}}))] : promptText;
    const req = { model, max_tokens:8000, messages:[{role:'user', content}] };
    if(!useVision){ req.response_format={type:'json_object'}; req.reasoning_effort='low'; }
    body = JSON.stringify(req);
  } else {
    apiUrl = 'https://api.openai.com/v1/chat/completions';
    headers = { 'Content-Type':'application/json', 'Authorization':'Bearer '+apiKey };
    const content = useVision ? [{type:'text', text:promptText}, ...images.map(d=>({type:'image_url', image_url:{url:d}}))] : promptText;
    body = JSON.stringify({ model, max_tokens:8000, messages:[{role:'user', content}], response_format:{type:'json_object'} });
  }

  const res = await fetch(apiUrl, {method:'POST', headers, body});
  if(!res.ok){
    const t = await res.text();
    if(res.status===400 && useVision) throw new Error('A képes kiolvasás nem sikerült — lehet, hogy a beállított vision-modell nem jó. Nyisd le a „Haladó: vision modell" részt és adj meg egy képes modellt. Részlet: '+t.slice(0,300));
    throw new Error('AI hiba: '+res.status+' '+t.slice(0,300));
  }
  const data = await res.json();
  let jsonText;
  if(provider==='gemini') jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  else if(provider==='anthropic'||provider==='custom') jsonText = data.content?.[0]?.text;
  else jsonText = data.choices?.[0]?.message?.content;
  jsonText = (jsonText||'').replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
  if(!jsonText) throw new Error('Az AI üres választ adott.');
  let obj;
  try { obj = JSON.parse(jsonText); }
  catch(e){ const a=jsonText.indexOf('{'), b=jsonText.lastIndexOf('}'); if(a>=0&&b>a) obj=JSON.parse(jsonText.slice(a,b+1)); else throw new Error('Az AI válasza nem érvényes JSON.'); }
  return obj;
}

// ---------- DEVIZA (BNR) ----------
async function _invFxRate(currency, dateStr){
  const cur = (currency||'RON').toUpperCase();
  if(cur==='RON'||cur==='LEJ'||cur==='LEI') return { currency:'RON', rate:1, date:dateStr, source:'-' };
  try{
    const url = (typeof SUPABASE_URL!=='undefined'?SUPABASE_URL:'') + '/functions/v1/bnr-rates';
    const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+SUPABASE_KEY,'apikey':SUPABASE_KEY}, body:JSON.stringify({currency:cur, date:dateStr}) });
    const d = await res.json();
    if(res.ok && d.ok && d.rate>0) return { currency:cur, rate:d.rate, date:d.date||dateStr, source:'BNR '+(d.date||'') };
  }catch(e){ console.warn('BNR fx:', e.message); }
  return { currency:cur, rate:0, date:dateStr, source:'nem elérhető' };
}

// ---------- MODELL ÉPÍTÉS (párosítás + landed cost + fx) ----------
async function _invBuildModel(parsed){
  // Beszállító párosítás
  const sup = parsed.supplier || {};
  const cuiN = _invNorm(sup.cui);
  const nameN = _invNorm(sup.name);
  let found = null;
  (R.suppliers||[]).forEach(s=>{
    if(found) return;
    if(cuiN && _invNorm(s.cui)===cuiN) found=s;
    else if(nameN && _invNorm(s.name)===nameN) found=s;
  });
  _INV.supplier = found ? {match:'found', id:found.id, data:found, parsed:sup} : {match:'new', id:null, data:null, parsed:sup};

  // Deviza
  _INV.fx = await _invFxRate(parsed.currency, parsed.invoice_date);

  // Sorok feldolgozása
  const rawLines = Array.isArray(parsed.lines) ? parsed.lines : [];
  const matLines = [], extraLines = [];
  rawLines.forEach((ln, idx)=>{
    const type = (ln.type||'material').toLowerCase();
    const obj = {
      idx,
      raw: ln.raw_name||'',
      hu: ln.hu_name||ln.raw_name||'',
      type,
      qty: _invNum(ln.qty),
      unit: ln.unit||'',
      baseQtyG: _invNum(ln.base_qty_g),
      weightKg: _invNum(ln.weight_kg),
      unitPriceNet: _invNum(ln.unit_price_net),
      lineTotalNet: _invNum(ln.line_total_net) || (_invNum(ln.unit_price_net)*_invNum(ln.qty)),
      vatPct: _invNum(ln.vat_pct),
      match: null, status: '', chosenIngId: null, newIng: null, landed: 0,
    };
    if(type==='material') matLines.push(obj); else extraLines.push(obj);
  });

  // Alapanyag-párosítás + státusz
  matLines.forEach(ln=>{
    const m = (typeof _matchIngredientByName==='function') ? _matchIngredientByName(ln.hu) || _matchIngredientByName(ln.raw) : null;
    if(m){ ln.match = m; ln.chosenIngId = m.id; ln.status='ok'; }
    else { ln.status='new'; ln.chosenIngId='__new__'; ln.newIng = _invSuggestNewIng(ln); }
    // hiányos adat felülírja
    if(!(ln.baseQtyG>0) || !(ln.unitPriceNet>0 || ln.lineTotalNet>0)) ln.status='missing';
  });

  // Landed cost: extra (szállítás+egyéb) összeg szétosztása súly szerint, érték-fallback
  const extraSum = extraLines.reduce((s,l)=>s+(l.lineTotalNet||0),0);
  if(extraSum>0 && matLines.length){
    const totalW = matLines.reduce((s,l)=>s+(l.weightKg>0?l.weightKg:0),0);
    const totalV = matLines.reduce((s,l)=>s+(l.lineTotalNet||0),0);
    matLines.forEach(l=>{
      let share = 0;
      if(totalW>0 && l.weightKg>0) share = l.weightKg/totalW;
      else if(totalV>0) share = (l.lineTotalNet||0)/totalV;
      l.landed = extraSum*share;
    });
  }

  _INV.lines = matLines;
  _INV.extra = extraLines;
  _INV.extraSum = extraSum;
}

function _invSuggestNewIng(ln){
  // egység tipp: db-jellegű? tömeg? térfogat?
  const u = _invNorm(ln.unit);
  let unit = 'g';
  if(/(db|buc|bucata|piece|pcs)/.test(u)) unit='db';
  else if(/(l|liter|litru|ml)/.test(u)) unit='l';
  else unit='g'; // kg/g/zsák → g bázis, kg megjelenítés
  const cats = R.ingredientCategories||[];
  return { name: ln.hu||ln.raw, category: cats[0]||'Egyéb', subType:'other_dry', unit, materialType:'raw' };
}

// ---------- ÁTTEKINTŐ UI ----------
function _invLej(v){ return (v*(_INV.fx.rate||1)); }
function _invFmt(n){ return (Math.round(n*100)/100).toLocaleString('hu-HU',{minimumFractionDigits:2,maximumFractionDigits:2}); }

function renderInvoiceReview(){
  const host = document.getElementById('inv-review');
  if(!host) return;
  const s = _INV.supplier, fx = _INV.fx, p = _INV.parsed||{};
  const supBadge = s.match==='found'
    ? `<span style="color:var(--teal-dark);font-weight:600">✅ Ismert beszállító</span>`
    : `<span style="color:#9a3412;font-weight:600">🆕 Új beszállító — létrehozom</span>`;
  const fxNote = fx.currency==='RON' ? 'lej (nincs átváltás)'
    : (fx.rate>0 ? `${fx.currency} → lej árfolyam: <b>${fx.rate}</b> <span style="color:var(--text-soft)">(${esc(fx.source)})</span>`
                 : `<span style="color:#c0574e">⚠️ ${fx.currency} árfolyam nem elérhető — add meg kézzel</span>`);

  const okC = _INV.lines.filter(l=>l.status==='ok').length;
  const needC = _INV.lines.filter(l=>l.status!=='ok').length;

  host.innerHTML = `
  <div class="card">
    <div style="display:flex;flex-wrap:wrap;gap:14px;justify-content:space-between;align-items:flex-start">
      <div>
        <div style="font-family:'Fraunces',serif;font-weight:700;color:var(--teal-dark);font-size:1.05rem">${esc(s.parsed?.name||'Ismeretlen beszállító')}</div>
        <div style="font-size:0.78rem;color:var(--text-soft)">${s.parsed?.cui?('CUI: '+esc(s.parsed.cui)+' · '):''}Számla: <b>${esc(p.invoice_number||'—')}</b> · ${esc(p.invoice_date||'—')}</div>
        <div style="font-size:0.8rem;margin-top:4px">${supBadge}</div>
      </div>
      <div style="text-align:right;font-size:0.8rem">
        <div>${fxNote}</div>
        ${fx.currency!=='RON' && fx.rate<=0 ? `<input type="number" step="0.0001" id="inv-fx-manual" placeholder="pl. 4.97" style="margin-top:4px;width:110px;padding:5px 8px;border:1.5px solid var(--border);border-radius:7px" onchange="invSetFx(this.value)">`:''}
      </div>
    </div>
  </div>

  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="font-weight:700;color:var(--teal-dark)">Tételek</div>
      <div style="font-size:0.78rem;color:var(--text-soft)">✅ ${okC} kész · ⚠️ ${needC} megerősítendő</div>
    </div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:0.8rem">
        <thead><tr style="text-align:left;color:var(--text-soft);border-bottom:2px solid var(--border)">
          <th style="padding:6px 8px">Számla tétel</th>
          <th style="padding:6px 8px">Alapanyag (párosítás)</th>
          <th style="padding:6px 8px" class="num">Menny.</th>
          <th style="padding:6px 8px" class="num">Nettó ár</th>
          <th style="padding:6px 8px" class="num">+Szállítás</th>
          <th style="padding:6px 8px" class="num">lej/bázis</th>
        </tr></thead>
        <tbody>${_INV.lines.map(_invRowHtml).join('')}</tbody>
      </table>
    </div>
    ${_INV.extra?.length ? `<div style="margin-top:10px;font-size:0.76rem;color:var(--text-soft)">Szétosztott költségek (${_INV.extra.map(e=>esc(e.raw)).join(', ')}): <b>${_invFmt(_invLej(_INV.extraSum))} lej</b> — súly szerint a nyersanyagokra osztva.</div>`:''}
  </div>

  <div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
    <div style="font-size:0.8rem;color:var(--text-soft)">A véglegesítés: ${s.match==='new'?'létrehozza a beszállítót, ':''}a hiányzó alapanyagokat létrehozza, és FIFO-tételként bevételez (visszakövethető, számlaszámmal).</div>
    <button class="btn btn-primary" data-action="invCommit" id="inv-commit-btn">✅ Bevételezés véglegesítése</button>
  </div>`;
}

function _invRowHtml(ln){
  const badge = {ok:'✅', new:'🆕', missing:'❓', uncertain:'⚠️'}[ln.status]||'⚠️';
  const opts = (R.ingredients||[]).slice().sort((a,b)=>a.name.localeCompare(b.name,'hu'))
    .map(i=>`<option value="${i.id}" ${String(ln.chosenIngId)===String(i.id)?'selected':''}>${esc(i.name)}</option>`).join('');
  const ing = ln.chosenIngId && ln.chosenIngId!=='__new__' ? getIng(parseInt(ln.chosenIngId)) : null;
  const unitLbl = ing ? (ing.unit==='g'?'kg':ing.unit==='ml'?'l':ing.unit) : (ln.newIng?.unit==='g'?'kg':ln.newIng?.unit||'');
  const lejPerBase = _invRowLejPerBase(ln);
  const missingCls = ln.status==='missing' ? 'background:#fef2f2' : (ln.status==='new'?'background:#fff7ed':'');
  return `<tr style="border-bottom:1px solid var(--border);${missingCls}">
    <td style="padding:7px 8px"><div style="font-weight:600">${badge} ${esc(ln.raw)}</div><div style="font-size:0.68rem;color:var(--text-soft)">${esc(ln.hu)}${ln.type!=='material'?' · '+esc(ln.type):''}</div></td>
    <td style="padding:7px 8px">
      <select onchange="invSetIng(${ln.idx}, this.value)" style="width:100%;max-width:200px;padding:4px 6px;border:1.5px solid var(--border);border-radius:7px;font-size:0.76rem">
        <option value="__new__" ${ln.chosenIngId==='__new__'?'selected':''}>🆕 Új: ${esc(ln.newIng?.name||ln.hu)}</option>
        ${opts}
      </select>
      ${ln.chosenIngId==='__new__' ? `<div style="font-size:0.66rem;color:#9a3412;margin-top:3px">Új alapanyag lesz (${esc(ln.newIng?.category||'')}, ${esc(ln.newIng?.unit||'')})</div>`:''}
    </td>
    <td style="padding:7px 8px" class="num">
      <input type="number" step="any" value="${ln.baseQtyG||''}" onchange="invSetQty(${ln.idx}, this.value)" style="width:82px;padding:4px 6px;border:1.5px solid var(--border);border-radius:7px;text-align:right;font-size:0.76rem">
      <div style="font-size:0.62rem;color:var(--text-soft)">bázis (g/ml/db)</div>
    </td>
    <td style="padding:7px 8px" class="num">
      <input type="number" step="any" value="${ln.lineTotalNet||''}" onchange="invSetTotal(${ln.idx}, this.value)" style="width:82px;padding:4px 6px;border:1.5px solid var(--border);border-radius:7px;text-align:right;font-size:0.76rem">
      <div style="font-size:0.62rem;color:var(--text-soft)">nettó sor (${esc(_INV.fx.currency)})</div>
    </td>
    <td class="num" style="padding:7px 8px;font-size:0.76rem;color:var(--text-soft)">${ln.landed>0?_invFmt(_invLej(ln.landed)):'—'}</td>
    <td class="num" style="padding:7px 8px;font-weight:600">${lejPerBase>0?_invFmt(lejPerBase):'—'}<div style="font-size:0.62rem;color:var(--text-soft);font-weight:400">lej/${esc(unitLbl||'bázis')}</div></td>
  </tr>`;
}

// lej/megjelenítési-egység (kg/l/db) az ellenőrzéshez
function _invRowLejPerBase(ln){
  if(!(ln.baseQtyG>0)) return 0;
  const totalLej = _invLej((ln.lineTotalNet||0) + (ln.landed||0));
  const perBaseG = totalLej / ln.baseQtyG; // lej / g|ml|db
  const ing = ln.chosenIngId && ln.chosenIngId!=='__new__' ? getIng(parseInt(ln.chosenIngId)) : null;
  const unit = ing ? ing.unit : (ln.newIng?.unit||'g');
  return perBaseG * unitFactor(unit==='g'?'kg':unit==='ml'?'l':unit); // lej/kg|l|db
}

// ---------- INTERAKCIÓK ----------
function _invLineStatus(ln){ return ln.chosenIngId==='__new__' ? 'new' : ((ln.baseQtyG>0 && ln.lineTotalNet>0) ? 'ok' : 'missing'); }
function invSetIng(idx, v){ const ln=_INV.lines.find(l=>l.idx==idx); if(!ln) return; ln.chosenIngId=v; ln.status=_invLineStatus(ln); renderInvoiceReview(); }
function invSetQty(idx, v){ const ln=_INV.lines.find(l=>l.idx==idx); if(!ln) return; ln.baseQtyG=_invNum(v); ln.status=_invLineStatus(ln); renderInvoiceReview(); }
function invSetTotal(idx, v){ const ln=_INV.lines.find(l=>l.idx==idx); if(!ln) return; ln.lineTotalNet=_invNum(v); _invRecalcLanded(); ln.status=_invLineStatus(ln); renderInvoiceReview(); }
function invSetFx(v){ const n=_invNum(v); if(n>0){ _INV.fx.rate=n; _INV.fx.source='kézi'; renderInvoiceReview(); } }

// landed cost újraszámítás, ha a felhasználó módosít egy sorértéket
function _invRecalcLanded(){
  const extraSum=_INV.extraSum||0; const mat=_INV.lines||[];
  if(!(extraSum>0)||!mat.length) return;
  const totalW=mat.reduce((s,l)=>s+(l.weightKg>0?l.weightKg:0),0);
  const totalV=mat.reduce((s,l)=>s+(l.lineTotalNet||0),0);
  mat.forEach(l=>{ let sh=0; if(totalW>0&&l.weightKg>0) sh=l.weightKg/totalW; else if(totalV>0) sh=(l.lineTotalNet||0)/totalV; l.landed=extraSum*sh; });
}

// ---------- VÉGLEGESÍTÉS ----------
async function invCommit(){
  if(_INV.busy) return;
  const btn = document.getElementById('inv-commit-btn');
  const p = _INV.parsed||{};
  const invNo = (p.invoice_number||'').toString().trim();

  if(_INV.fx.currency!=='RON' && !(_INV.fx.rate>0)){ toast('⚠️ Add meg az árfolyamot.', true); return; }
  const missing = _INV.lines.filter(l=>l.status==='missing');
  if(missing.length){ toast(`⚠️ ${missing.length} tételnél hiányzik a mennyiség vagy az ár.`, true); return; }

  // Duplikátum-védelem
  if(invNo){
    try{
      const dup = await kData.query('ingredient_batches', { filter:`invoice_number=eq.${encodeURIComponent(invNo)}`, limit:1 });
      if(dup && dup.length){ if(!(await confirmDialog(`A(z) „${invNo}" számla már be lett vételezve. Biztos újra rögzíted?`))) return; }
    }catch(e){ /* ha az oszlop még nincs, tovább */ }
  }

  _INV.busy = true; if(btn){ btn.disabled=true; btn.textContent='⏳ Bevételezés…'; }
  try{
    // 1) Beszállító
    let supplierName = _INV.supplier.parsed?.name || '';
    if(_INV.supplier.match==='new' && supplierName){
      const sp = _INV.supplier.parsed;
      const allSup = await kData.query('suppliers', { order:'id.desc', limit:1 });
      const nextId = (allSup?.[0]?.id||0)+1;
      const sdata = { id:nextId, name:sp.name, cui:sp.cui||null, reg_com:sp.reg_com||null, address:sp.address||null, bank_iban:sp.iban||null, currency:(_INV.fx.currency||'lej').toLowerCase()==='ron'?'lej':(_INV.fx.currency||'lej').toLowerCase(), active:true, updated_at:new Date().toISOString() };
      await kData.insert('suppliers', sdata);
      R.suppliers = R.suppliers||[]; if(typeof mapSupplierDb==='function') R.suppliers.push(mapSupplierDb({...sdata, created_at:new Date().toISOString()})); else R.suppliers.push({...sdata});
    }

    // 2) Alapanyagok + 3) FIFO bevételezés
    let created=0, received=0;
    for(const ln of _INV.lines){
      let ingId = ln.chosenIngId;
      // Új alapanyag
      if(ingId==='__new__'){
        const ni = ln.newIng || _invSuggestNewIng(ln);
        const nextIngId = Math.max(0, ...R.ingredients.map(i=>i.id))+1;
        const irow = { id:nextIngId, name:ni.name, category:ni.category, sub_type:ni.subType, unit:ni.unit, material_type:ni.materialType||'raw' };
        await kData.insert('ingredients', irow);
        const newIngObj = { id:nextIngId, name:ni.name, cat:ni.category, subType:ni.subType, unit:ni.unit, materialType:ni.materialType||'raw', suppliers:[], totalStockG:0, fifoPrice:0, avgPrice:0, basePriceG:0, notes:'',
          get minStock(){return this.minStockAutoG||0;}, get maxStock(){return this.maxStockAutoG||0;} };
        R.ingredients.push(newIngObj);
        ingId = nextIngId; created++;
      } else {
        ingId = parseInt(ingId);
      }

      // FIFO batch (lejben, landed cost beépítve, nettó)
      const totalLej = _invLej((ln.lineTotalNet||0) + (ln.landed||0));
      const pricePerG = ln.baseQtyG>0 ? totalLej/ln.baseQtyG : 0;
      const noteBits = [];
      if(_INV.fx.currency!=='RON') noteBits.push(`${_invFmt(ln.lineTotalNet)} ${_INV.fx.currency} @ ${_INV.fx.rate}`);
      if(ln.landed>0) noteBits.push(`+szállítás ${_invFmt(_invLej(ln.landed))} lej`);
      const batchRow = {
        ingredient_id: ingId,
        received_date: (p.invoice_date && /^\d{4}-\d{2}-\d{2}$/.test(p.invoice_date)) ? p.invoice_date : localToday(),
        qty_received_g: ln.baseQtyG,
        qty_remaining_g: ln.baseQtyG,
        price_per_g: pricePerG,
        price_gross_per_unit: totalLej,
        package_size_g: ln.baseQtyG,
        supplier_name: supplierName,
        source_type: 'invoice',
        invoice_number: invNo||null,
        currency: _INV.fx.currency,
        fx_rate: _INV.fx.rate||1,
        notes: [`Számla: ${invNo||'—'}`, ...noteBits].join(' · ')
      };
      await kData.insert('ingredient_batches', batchRow);
      R.batches = R.batches||[];
      R.batches.push({ ingredientId:ingId, receivedDate:batchRow.received_date, qtyReceivedG:ln.baseQtyG, qtyRemainingG:ln.baseQtyG, pricePerG, supplierName, sourceType:'invoice' });
      received++;
    }

    // Készlet/árak újraszámítása
    R.ingredients.forEach(ing=>{
      const bs = R.batches.filter(b=>b.ingredientId===ing.id && b.qtyRemainingG>0);
      ing.totalStockG = bs.reduce((s,b)=>s+b.qtyRemainingG,0);
      const f=[...bs].sort((a,b)=>a.receivedDate.localeCompare(b.receivedDate))[0];
      ing.fifoPrice = f?f.pricePerG:0;
      ing.avgPrice = ing.totalStockG>0 ? bs.reduce((s,b)=>s+b.pricePerG*b.qtyRemainingG,0)/ing.totalStockG : 0;
    });
    if(typeof auditLog==='function') auditLog('invoice_intake', supplierName, `Számla ${invNo||'—'}: ${received} tétel, ${created} új alapanyag`);

    _INV.busy=false;
    toast(`✅ Bevételezve: ${received} tétel${created?`, ${created} új alapanyag`:''}.`);
    document.getElementById('inv-review').innerHTML = `<div class="card" style="text-align:center;padding:26px"><div style="font-size:2rem">✅</div><div style="font-weight:700;color:var(--teal-dark);margin-top:6px">Kész! ${received} tétel bevételezve.</div><div style="font-size:0.8rem;color:var(--text-soft);margin-top:4px">Ellenőrizd az <b>Alapanyagok & Készlet</b> nézetben.</div><button class="btn btn-ghost mt-16" data-action="invPick">Újabb számla</button></div>`;
    _INV.parsed=null; _INV.lines=[];
  }catch(e){
    _INV.busy=false; if(btn){ btn.disabled=false; btn.textContent='✅ Bevételezés véglegesítése'; }
    console.error('invCommit:', e);
    toast('⚠️ Hiba a bevételezésnél: '+e.message, true);
  }
}

// globálisok (data-action rendszerhez)
if(typeof window!=='undefined'){
  Object.assign(window, { renderInvoiceIntake, invPick, invSaveVisionModel, handleInvoiceFile, aiParseInvoice, invSetIng, invSetQty, invSetTotal, invSetFx, invCommit });
}
