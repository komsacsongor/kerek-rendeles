// ============================================================
// KEREK – Számla-bevételező AI operátor
// v2.54.0 · v2.55.2: kép lekicsinyítés/több oldal, külön számlás és utólagos szállítási költség
// v2.55.3: beszállító-választó (hasonló név), szerkeszthető szám/dátum, szám nélküli duplikátum-védelem,
//         hasonló nevű párosítás = ellenőrizendő, összesítő-ellenőrzés, új alapanyag egysége a kiszerelésből
// v2.56.0: a Készlet nézeten belül; párosítás: tanult → szótár → AI a saját listából → hasonló név;
//         szöveg beillesztése; nettó/bruttó felismerés (+ ÁFA-fizető cég → nettó bekerülés); Gemini a számlákhoz
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
// v2.55.4: a Groq 2026 júliusában kivezette a llama-4-scout-ot → ha a beállított modell nem létezik,
// a Groq modell-listájából automatikusan választ képes modellt (és megjegyzi).
const _INV_GROQ_VISION = ['qwen/qwen3.8-27b', 'qwen/qwen3.6-27b', 'meta-llama/llama-4-maverick-17b-128e-instruct', 'meta-llama/llama-4-scout-17b-16e-instruct'];
const _INV_VISION_DEFAULT = { groq: _INV_GROQ_VISION[0], openai: 'gpt-4o-mini', anthropic: 'claude-sonnet-4-20250514', gemini: 'gemini-2.5-flash' };
const _INV_GEMINI_DEFAULT = 'gemini-2.5-flash';

// v2.56.1: a számla-AI a közös Beállítások → AI alól jön (kulcs szolgáltatónként, külön számla-szolgáltató);
// az ÁFA-fizetés a Pénzügyi beállításokból
function _invVatPayer(){ return R.settings?.companyVatPayer !== false; }   // alapértelmezés: ÁFA-fizető
function _invAiInfo(){
  const S = R.settings || {};
  const provider = S.invoiceProvider || S.aiProvider || 'anthropic';
  const apiKey = (S.aiKeys || {})[provider] || (provider === S.aiProvider ? S.apiKey : '');
  const sameAsRecipe = !S.invoiceProvider || S.invoiceProvider === S.aiProvider;
  const label = { gemini:'Gemini', groq:'Groq', anthropic:'Claude', openai:'OpenAI', custom:'egyéni' }[provider] || provider;
  return { provider, apiKey, model: S.invoiceModel || null, sameAsRecipe, label };
}
// a menet közben választott új modellt a közös AI-beállításba menti (meglévő sor frissítése)
function _invRememberModel(m){
  R.settings.invoiceModel = m;
  try { if(typeof persistAiSettings === 'function') Promise.resolve(persistAiSettings()).catch(e => console.warn('AI beállítás mentés:', e.message)); } catch(e){}
}
function invBackToStock(){ nav('stock'); }
function invOpenLaterCost(){ nav('invoice-intake'); invLaterCostOpen(); }
function invSetMode(m){ _INV.mode = m; renderInvoiceIntake(); }

function _invNorm(s){ return (s||'').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]/g,''); }
function _invNum(v){ if(v==null) return 0; if(typeof v==='number') return v; const n=parseFloat(String(v).replace(/\s/g,'').replace(',','.').replace(/[^0-9.\-]/g,'')); return isNaN(n)?0:n; }

// ---------- NÉZET ----------
function renderInvoiceIntake(){
  const host = document.getElementById('view-invoice-intake');
  if(!host) return;
  const ai = _invAiInfo();
  const hasKey = !!ai.apiKey;
  const mode = _INV.mode || 'file';
  const tab = (m, lbl) => `<button class="btn btn-sm ${mode===m?'btn-primary':'btn-ghost'}" onclick="invSetMode('${m}')">${lbl}</button>`;
  host.innerHTML = `
  <div style="max-width:960px;margin:0 auto">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      <div style="font-size:0.8rem;color:var(--text-soft)">Az operátor kiolvassa a számlát, párosítja az alapanyagokkal, te csak a bizonytalan tételeket erősíted meg.</div>
      <button class="btn btn-ghost btn-sm" data-action="invBackToStock">← Vissza a készlethez</button>
    </div>

    <div class="card">
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">${tab('file','📷 Fotó / PDF')}${tab('text','📋 Szöveg beillesztése')}</div>
      ${mode==='text' ? `
        <textarea id="inv-text" placeholder="Webshop-rendelésnél: jelöld ki a rendelés táblázatát (tételek + összesítő) → Másolás → ide Beillesztés." style="width:100%;min-height:150px;box-sizing:border-box;padding:10px;border:1.5px solid var(--border);border-radius:10px;font-family:Kodchasan,sans-serif;font-size:0.8rem">${esc(_INV.lastText||'')}</textarea>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px">
          <span style="font-size:0.72rem;color:var(--text-soft)">A beszállító neve, dátum, tételek és az összesítő (részösszeg, ÁFA, végösszeg) legyen benne.</span>
          <button class="btn btn-primary btn-sm" data-action="handleInvoiceText">Feldolgozás →</button>
        </div>` : `
        <input type="file" id="inv-file" accept="application/pdf,image/*,.heic,.heif" multiple style="display:none" onchange="handleInvoiceFile(this)">
        <div id="inv-drop" data-action="invPick" style="border:2px dashed var(--border);border-radius:14px;padding:30px 20px;text-align:center;cursor:pointer;transition:.15s;background:var(--teal-pale)">
          <div style="font-size:2rem;margin-bottom:6px">📤</div>
          <div style="font-weight:600;color:var(--teal-dark)">Kattints ide a számla feltöltéséhez</div>
          <div style="font-size:0.76rem;color:var(--text-soft);margin-top:4px">PDF (szöveges vagy szkennelt) vagy fotó (JPG/PNG, több oldal = több kép egyszerre) · RO / EN / HU</div>
        </div>`}
      ${!hasKey ? `<div style="margin-top:12px;padding:10px 12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:9px;font-size:0.8rem;color:#9a3412">⚠️ Nincs kulcs a számlákhoz választott AI-szolgáltatóhoz (${esc(ai.label)}). Add meg a <b>Beállítások → AI integráció</b> alatt (ajánlott: Google Gemini, ingyenes).</div>` : ''}
      <div style="margin-top:10px;font-size:0.72rem;color:var(--text-soft);display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span>Kiolvasás: <b>${esc(ai.label)}</b>${ai.model?` (${esc(ai.model)})`:''}${ai.provider==='groq'?' — fotóhoz a Gemini pontosabb':''} · Bekerülési érték: <b>${_invVatPayer()?'nettó (ÁFA-fizető cég)':'bruttó (nem ÁFA-fizető)'}</b></span>
        <button class="btn btn-ghost btn-sm" style="padding:2px 9px;font-size:0.7rem" data-action="nav" data-arg1="settings-r">⚙️ Beállítások</button>
      </div>
    </div>

    <div id="inv-status" style="display:none" class="card"></div>
    <div id="inv-review"></div>
  </div>`;
}

function invPick(){ document.getElementById('inv-file')?.click(); }
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

// Kép → lekicsinyített JPEG data-URL (max. hosszabb oldal: maxSide px)
async function _imgToJpegDataURL(file, maxSide){
  let src;
  try {
    src = (typeof createImageBitmap === 'function') ? await createImageBitmap(file) : null;
  } catch(e) { src = null; }
  if(!src){
    src = await new Promise((res, rej) => { const url = URL.createObjectURL(file); const im = new Image();
      im.onload = () => { res(im); URL.revokeObjectURL(url); }; im.onerror = () => { URL.revokeObjectURL(url); rej(); }; im.src = url; })
      .catch(() => null);
  }
  if(!src) throw new Error('Ezt a képet nem lehet megnyitni' + (/heic|heif/i.test(file.type + file.name) ? ' (HEIC formátum). iPhone-on: Beállítások → Kamera → Formátumok → „Legkompatibilisebb”, vagy küldd el magadnak JPG-ként.' : '.'));
  const w = src.width, h = src.height, k = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}

function _fileToDataURL(file){
  return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); });
}

async function handleInvoiceFile(input){
  const files = [...(input.files || [])];
  if(!files.length) return;
  input.value='';
  _INV.file = files[0];
  document.getElementById('inv-review').innerHTML='';
  try{
    _invStatus('Fájl olvasása…', true);
    let payload;
    const pdf = files.find(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    if(pdf){
      payload = await _pdfGetTextOrImages(pdf);
    } else {
      // v2.55.2: fotó(k) — lekicsinyítés + JPEG (a nagy telefonos fotót / HEIC-et az AI elutasítaná); max 4 oldal
      const imgs = files.filter(f => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name)).slice(0, 4);
      if(!imgs.length) throw new Error('Csak PDF vagy kép tölthető fel.');
      payload = { text:'', images: [] };
      for(const f of imgs) payload.images.push(await _imgToJpegDataURL(f, 1600));
    }
    await _invProcess(payload);
  }catch(e){
    console.error('invoice:', e);
    _invStatus('❌ '+e.message, false);
  }
}

// v2.56.0: beillesztett szöveg (webshop-rendelés, e-mail) — nincs képolvasás, pontosabb
async function handleInvoiceText(){
  const text = (document.getElementById('inv-text')?.value || '').trim();
  if(text.length < 20){ toast('⚠️ Illeszd be a rendelés / számla szövegét.', true); return; }
  _INV.lastText = text; _INV.file = null;
  document.getElementById('inv-review').innerHTML='';
  try { await _invProcess({ text: text.substring(0, 12000), images: [] }); }
  catch(e){ console.error('invoice text:', e); _invStatus('❌ '+e.message, false); }
}

async function _invProcess(payload){
  if(payload.images.length){ _invStatus('Számla kiolvasása képből (AI)…', true); }
  else { _invStatus('Számla kiolvasása szövegből (AI)…', true); }
  const parsed = await aiParseInvoice(payload);
  _INV.parsed = parsed; _INV.partial = false; _INV.srcText = payload.text || '';
  _invStatus('Párosítás és költség-számítás…', true);
  await _invBuildModel(parsed);
  document.getElementById('inv-status').style.display='none';
  // v2.55.2: csak szállítás/egyéb költség van rajta (nincs alapanyag) → egy korábbi bevételezéshez rendeljük
  if(!_INV.lines.length && (_INV.extra||[]).length){
    invLaterCostOpen({ amount: _INV.extraInvoice, currency: _INV.fx.currency, rate: _INV.fx.rate, date: parsed.invoice_date,
      desc: 'Szállítás' + (parsed.invoice_number ? ' · számla ' + parsed.invoice_number : ''), supplier: parsed.supplier?.name || '', fromInvoice: true });
    return;
  }
  renderInvoiceReview();
}

// ---------- AI KIOLVASÁS ----------
function _invPrompt(){
  // v2.56.0: az AI NEM fordít szabadon — a KEREK alapanyag-listájából választ (ingredient_id), az összegeket
  // úgy adja vissza, ahogy a számlán állnak (nettó/bruttó felismerés a programban, az összesítőből is)
  const ings = (R.ingredients||[]).map(i => `${i.id}: ${i.name}`).join('\n');
  return `Te egy gluténmentes pékség beszállítói SZÁMLÁIT / RENDELÉSEIT dolgozod fel. Adj vissza KIZÁRÓLAG JSON-t, semmi más szöveget.
A számla lehet román, angol vagy magyar nyelvű.

JSON struktúra:
{
  "supplier": {"name":"cég / webshop neve","cui":"adószám/CUI ha van","reg_com":"cégjegyzékszám ha van","address":"cím ha van","iban":"IBAN ha van"},
  "invoice_number":"számla / rendelés sorszáma vagy null",
  "invoice_date":"ÉÉÉÉ-HH-NN vagy null",
  "currency":"RON|EUR|HUF|USD",
  "amount_basis":"net|gross|unknown",   // a TÉTELSOROK összegei ÁFA nélküliek (net) vagy ÁFÁ-val (gross)? pl. "fără TVA" = net
  "lines":[
    {
      "raw_name":"a tétel neve PONTOSAN úgy, ahogy a számlán áll (ne fordítsd!)",
      "ingredient_id": 12,              // az alábbi ALAPANYAG-LISTÁBÓL annak az id-ja, amelyik UGYANAZ az anyag; ha egyik sem, null
      "hu_name":"magyar alapanyagnév (csak ha ingredient_id null)",
      "type":"material|shipping|other", // material=áru, shipping=szállítás/fuvar/transport/livrare, other=betétdíj/csomagolás
      "qty":1,                          // számlázott mennyiség (darab / csomag / tömeg)
      "unit":"az egység a számlán (buc/db/kg/l/zsák...)",
      "pack_size":10,                   // 1 csomag nettó tartalma, ha a névben/sorban szerepel (pl. "– 10kg" → 10)
      "pack_unit":"kg|l|g|ml|db",
      "base_qty_g":10000,               // TELJES mennyiség grammban / ml-ben (db esetén darab): qty*pack_size átváltva. Ha nem tudod: null
      "weight_kg":10,                   // össztömeg kg-ban, ha tudható; különben null
      "unit_price":88.0,                // egységár, AHOGY A SZÁMLÁN ÁLL
      "line_total":88.0,                // sorérték, AHOGY A SZÁMLÁN ÁLL (ne számold át!)
      "vat_pct":11                      // a sor ÁFA-kulcsa, ha látszik; különben null
    }
  ],
  "totals":{"net":587.65,"vat":64.62,"gross":652.27}   // részösszeg ÁFA nélkül, ÁFA, végösszeg — ami látszik, különben null
}

FONTOS:
- A raw_name-et NE fordítsd és NE javítsd — szó szerint másold.
- ingredient_id: csak akkor adj meg id-t, ha biztosan ugyanaz az anyag (pl. "Hrișcă decorticată" = hajdina, "Mei decorticat" = köles, "Făină de năut" = csicseriborsóliszt). Kétes esetben null.
- A szállítás ("Livrare", "Transport") csak akkor legyen sor, ha VAN összege; "később közöljük" típusú szövegnél hagyd ki.
- Ha egy mező nem olvasható ki, tedd null-ra. NE találj ki adatot.

ALAPANYAG-LISTA (id: név):
${ings || '(üres)'}`;
}

async function aiParseInvoice({text, images}){
  // v2.56.0: ha van Gemini kulcs a számla-beállításokban, a számlát a Gemini olvassa (szöveget és képet is)
  const ai = _invAiInfo();
  const apiKey = ai.apiKey, provider = ai.provider;
  if(!apiKey) throw new Error(`Nincs kulcs a számlákhoz választott AI-szolgáltatóhoz (${ai.label}) — Beállítások → AI integráció.`);
  const _pd = {anthropic:'claude-sonnet-4-20250514',gemini:_INV_GEMINI_DEFAULT,groq:'openai/gpt-oss-20b',openai:'gpt-4o-mini'};
  const useVision = images && images.length>0;
  // modell: a számlákhoz mentett → (ha ugyanaz a szolgáltató, mint a recepteknél) a recept-modell szöveghez → alapértelmezés
  let model = ai.model || (useVision ? _INV_VISION_DEFAULT[provider] : ((ai.sameAsRecipe && R.settings?.aiModel) || _pd[provider])) || 'gpt-4o-mini';
  const promptText = _invPrompt() + (text ? `\n\nSZÁMLA SZÖVEGE:\n${text}` : '');

  const build = model => {
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
    body = JSON.stringify({ contents:[{parts}], generationConfig:{maxOutputTokens:16384, responseMimeType:'application/json'} });
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
  return { apiUrl, headers, body };
  };
  const send = m => { const r = build(m); return fetch(r.apiUrl, {method:'POST', headers:r.headers, body:r.body}); };

  let res = await send(model);
  let t = res.ok ? '' : await res.text();
  // v2.55.4: kivezetett / nem elérhető Groq vision-modell → képes modell keresése a fiók modell-listájában
  if(!res.ok && useVision && provider === 'groq' && (res.status === 404 || /model_not_found|decommissioned|does not exist|not supported/i.test(t))){
    let ids = [];
    try {
      const lr = await fetch('https://api.groq.com/openai/v1/models', { headers:{ 'Authorization':'Bearer '+apiKey } });
      ids = ((await lr.json())?.data || []).filter(x => x.active !== false).map(x => x.id);
    } catch(e) { console.warn('groq models:', e.message); }
    const cands = [..._INV_GROQ_VISION.filter(id => ids.includes(id)), ...ids.filter(id => /vision|vl\b|-vl-|llama-4|qwen3\.\d+-\d+b/i.test(id) && !_INV_GROQ_VISION.includes(id))]
      .filter(id => id !== model);
    for(const m of cands){
      _invStatus(`A(z) „${esc(model)}” modell nem elérhető — próba: ${esc(m)}…`, true);
      res = await send(m);
      if(res.ok){
        _invRememberModel(m);
        toast('ℹ️ Új képes AI-modell beállítva: ' + m);
        break;
      }
      t = await res.text();
    }
  }
  // v2.56.0: kivezetett / ismeretlen Gemini-modell → a fiók modell-listájából a legújabb „flash” (és megjegyzi)
  if(!res.ok && provider === 'gemini' && (res.status === 404 || /not found|not supported|deprecat/i.test(t))){
    let models = [];
    try {
      const lr = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=200`);
      models = ((await lr.json())?.models || []).filter(m => (m.supportedGenerationMethods||[]).includes('generateContent')).map(m => m.name.replace('models/',''));
    } catch(e) { console.warn('gemini models:', e.message); }
    const ver = id => parseFloat((/gemini-(\d+(?:\.\d+)?)/.exec(id)||[])[1] || 0);
    const cands = models.filter(id => /flash/.test(id) && !/image|tts|audio|live|embed|thinking|exp/.test(id) && id !== model)
      .sort((a, b) => (/preview|lite/.test(a) - /preview|lite/.test(b)) || ver(b) - ver(a));
    for(const m of cands.slice(0, 4)){
      _invStatus(`A(z) „${esc(model)}” modell nem elérhető — próba: ${esc(m)}…`, true);
      res = await send(m);
      if(res.ok){ _invRememberModel(m); toast('ℹ️ Gemini modell beállítva: ' + m); break; }
      t = await res.text();
    }
  }
  if(!res.ok){
    if(provider==='gemini' && (res.status===400 || res.status===403) && /API key|API_KEY|permission/i.test(t)) throw new Error('A Gemini kulcs nem érvényes vagy nincs engedélyezve. Ellenőrizd: Beállítások → AI integráció. Részlet: '+t.slice(0,200));
    if(res.status===429) throw new Error('Az AI napi / percenkénti kerete elfogyott. Próbáld újra kicsit később. Részlet: '+t.slice(0,200));
    if((res.status===400 || res.status===404) && useVision) throw new Error('A képes kiolvasás nem sikerült — nem találtam elérhető képes (vision) modellt, vagy a beállított nem jó. Ajánlott: Google Gemini a számlákhoz (Beállítások → AI integráció). Részlet: '+t.slice(0,300));
    throw new Error('AI hiba: '+res.status+' '+t.slice(0,300));
  }
  const data = await res.json();
  let jsonText;
  if(provider==='gemini') jsonText = (data.candidates?.[0]?.content?.parts||[]).filter(p => !p.thought).map(p => p.text||'').join('');
  else if(provider==='anthropic'||provider==='custom') jsonText = data.content?.[0]?.text;
  else jsonText = data.choices?.[0]?.message?.content;
  // v2.55.4: gondolkodó modellek (pl. Qwen) <think>…</think> blokkja nem a válasz része
  jsonText = (jsonText||'').replace(/<think>[\s\S]*?<\/think>/gi,'').replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
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
  const m = _invFindSupplier(sup);
  _INV.supplier = m ? {match:m.exact?'found':'fuzzy', id:m.s.id, data:m.s, parsed:sup} : {match:'new', id:null, data:null, parsed:sup};
  _INV.newSupName = sup.name || '';
  // v2.55.3: szám és dátum az áttekintőn szerkeszthető (webshop-rendelésnél gyakran nem olvasható)
  const d = (parsed.invoice_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.invoice_date)) ? parsed.invoice_date : '';
  _INV.meta = { invNo: (parsed.invoice_number||'').toString().trim(), date: d || localToday(), dateRead: !!d };

  // Deviza
  _INV.fx = await _invFxRate(parsed.currency, parsed.invoice_date);
  const aliases = await _invLoadAliases();

  // Sorok feldolgozása
  const rawLines = Array.isArray(parsed.lines) ? parsed.lines : [];
  const matLines = [], extraLines = [];
  rawLines.forEach((ln, idx)=>{
    const type = (ln.type||'material').toLowerCase();
    const qty = _invNum(ln.qty);
    // a számlán álló sorérték (v2.56.0: nettó/bruttó a programban dől el); régi formátum: line_total_net
    const printed = _invNum(ln.line_total) || _invNum(ln.line_total_net) || (_invNum(ln.unit_price ?? ln.unit_price_net) * (qty || 1));
    const obj = {
      idx,
      raw: ln.raw_name||'',
      hu: ln.hu_name||'',
      aiIngId: ln.ingredient_id != null ? String(ln.ingredient_id) : null,
      type, qty,
      unit: ln.unit||'',
      packUnit: ln.pack_unit||'',
      baseQtyG: _invNum(ln.base_qty_g),
      weightKg: _invNum(ln.weight_kg),
      printed, lineTotalNet: printed,
      vatPct: _invNum(ln.vat_pct),
      match: null, status: '', chosenIngId: null, newIng: null, landed: 0, src: '', srcNote: '',
    };
    // v2.56.0: mennyiség a tételnévből („– 10kg × 1”) — megbízhatóbb, mint az AI számolása
    const q = _invQtyFromName(obj.raw);
    if(q){ obj.baseQtyG = q.base; if(q.kg) obj.weightKg = q.kg; if(!obj.packUnit) obj.packUnit = q.unit; obj.qtySrc = 'név'; }
    if(type==='material') matLines.push(obj); else extraLines.push(obj);
  });

  // v2.56.0: párosítás — tanult → szótár → AI (a saját listából) → hasonló név → új
  const supKey = _invSupKey(_invSupplierName() || sup.name);
  matLines.forEach(ln=>{
    const rk = _invRawKey(ln.raw);
    const dictHu = (typeof invDictLookup === 'function') ? invDictLookup(ln.raw) : null;
    const al = aliases.get(supKey + '|' + rk) || aliases.get('*|' + rk);
    const alIng = al ? getIng(Number(al.ingredient_id)) : null;
    let hit = null;
    if(alIng) hit = { ing: alIng, src: 'learned', fuzzy: false, note: 'korábban jóváhagyva' };
    if(!hit && dictHu){ const r = _invIngByName(dictHu); if(r) hit = { ing: r.ing, src: 'dict', fuzzy: !r.exact, note: `szótár: ${dictHu}` }; }
    if(!hit && ln.aiIngId){ const ai = getIng(Number(ln.aiIngId)); if(ai) hit = { ing: ai, src: 'ai', fuzzy: true, note: 'AI-javaslat' }; }
    if(!hit){
      const nm = (typeof _matchIngredientByName==='function') ? (_matchIngredientByName(ln.hu) || null) : null;
      if(nm) hit = { ing: nm, src: 'name', fuzzy: true, note: 'hasonló név' };
    }
    if(dictHu) ln.hu = dictHu;            // az új alapanyag neve is a szótárból (nem az AI fordítása)
    if(!ln.hu) ln.hu = ln.raw;
    ln.newIng = _invSuggestNewIng(ln);
    if(hit){ ln.match = hit.ing; ln.chosenIngId = String(hit.ing.id); ln.fuzzy = hit.fuzzy; ln.src = hit.src; ln.srcNote = hit.note; }
    else { ln.chosenIngId = '__new__'; ln.src = 'new'; ln.srcNote = dictHu ? `szótár: ${dictHu} (nincs ilyen alapanyag)` : ''; }
    ln.rawKey = rk;
    ln.status = _invLineStatus(ln);   // hiányos adat felülírja
  });

  _INV.lines = matLines;
  _INV.extra = extraLines;
  _INV.basis = _invDetectBasis(parsed, [...matLines, ...extraLines], _INV.srcText || '');
  _invApplyBasis();
  _INV.manualExtra = { amount: 0, currency: _INV.fx.currency };   // v2.55.2: külön számlán érkezett (kézzel)
  _invRecalcLanded();
}

// ---------- v2.56.0: PÁROSÍTÁS-SEGÉDEK ----------
// tételnév kulcs a tanult párosításhoz: mennyiség / kiszerelés nélkül („Hrișcă decorticată – 10kg × 1” → „hriscadecorticata”)
function _invRawKey(raw){
  return _invNorm(String(raw||'').toLowerCase()
    .replace(/(\d+(?:[.,]\d+)?)\s*(kg|g|gr|grame?|l|ml|buc|db|pcs)\b/gi,' ')
    .replace(/(?:×|\bx)\s*\d+(?:[.,]\d+)?/gi,' ').replace(/\d+/g,' '));
}
// mennyiség a névből: „10kg × 2” → 20000 g; „500 g” → 500 g; „1 l” → 1000 ml
function _invQtyFromName(raw){
  const t = String(raw||'');
  const all = [...t.matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|g|gr|l|ml)\b/gi)];
  if(!all.length) return null;
  const m = all[all.length-1];
  const n = parseFloat(m[1].replace(',','.')); const u = m[2].toLowerCase();
  if(!(n > 0)) return null;
  const mul = (() => { const x = /(?:×|\bx)\s*(\d+(?:[.,]\d+)?)/i.exec(t.slice(m.index + m[0].length)); return x ? parseFloat(x[1].replace(',','.')) : 1; })();
  const f = { kg:1000, g:1, gr:1, l:1000, ml:1 }[u];
  const base = Math.round(n * f * mul * 1000) / 1000;
  return { base, kg: (u==='kg'||u==='g'||u==='gr') ? base/1000 : 0, unit: (u==='l'||u==='ml') ? 'l' : 'kg' };
}
// alapanyag a (szótárbeli) magyar név alapján: pontos (zárójel nélkül) → ezt tartalmazó legrövidebb
// v2.56.4: a tartalmazó találat NEM lehet más FORMÁJÚ termék — „Hajdina” ≠ „Világos hajdina liszt” (liszt / pehely /
// keményítő / olaj / dara / őrölt …, ha a keresett névben nincs benne)
const _INV_FORM_WORDS = ['liszt','pehely','pelyhek','kemenyito','olaj','dara','orolt','por','krem','szirup','ecet','puffasztott','csira','tej','vaj','lecitin','feherje','izolatum','rost','korpa','kasa','teszta','granola','muzli'];
function _invNameKey(x){ return (x||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\(.*?\)/g,'').replace(/[^a-z0-9]/g,''); }
function _invIngByName(hu){
  const n = _invNameKey;
  const k = n(hu); if(!k) return null;
  const list = R.ingredients || [];
  const ex = list.find(i => n(i.name) === k); if(ex) return { ing: ex, exact: true };
  const formOk = name => { const a = n(name); return !_INV_FORM_WORDS.some(w => a.includes(w) && !k.includes(w)); };
  const part = list.filter(i => { const a = n(i.name); return a.length >= 3 && a.includes(k) && formOk(i.name); })
    .sort((a, b) => n(a.name).length - n(b.name).length);
  return part.length ? { ing: part[0], exact: false } : null;
}
// pontos névegyezés (zárójeles kiegészítés nélkül) — helyben, majd a DB-ben is (más eszközön létrehozott)
async function _invFindIngByExactName(name){
  const k = _invNameKey(name); if(!k) return null;
  const local = (R.ingredients||[]).find(i => _invNameKey(i.name) === k);
  if(local) return local;
  try {
    const rows = await kData.query('ingredients', { select:'id,name,category,sub_type,unit,material_type', filter:`name=ilike.${encodeURIComponent(String(name).trim())}*`, limit:10 }) || [];
    const r = rows.find(x => _invNameKey(x.name) === k);
    if(r){ const o = { id:r.id, name:r.name, cat:r.category, subType:r.sub_type, unit:r.unit||'g', materialType:r.material_type||'raw', suppliers:[], totalStockG:0, fifoPrice:0, avgPrice:0, basePriceG:0, notes:'' }; R.ingredients.push(o); return o; }
  } catch(e) { console.warn('alapanyag név-ellenőrzés:', e.message); }
  return null;
}
// tanult párosítások (ingredient_aliases tábla); ha a tábla még nincs, üres
async function _invLoadAliases(force){
  if(_INV.aliases && !force) return _INV.aliases;
  const map = new Map();
  try {
    const rows = await kData.query('ingredient_aliases', { select:'supplier_key,raw_key,ingredient_id,updated_at', order:'updated_at.asc', limit:5000 }) || [];
    rows.forEach(r => { map.set(r.supplier_key + '|' + r.raw_key, r); map.set('*|' + r.raw_key, r); });   // a legutóbbi nyer
  } catch(e) { console.warn('ingredient_aliases:', e.message); }
  _INV.aliases = map;
  return map;
}
async function _invSaveAliases(lines, supplierName){
  const sk = _invSupKey(supplierName);
  const now = new Date().toISOString();
  const rows = lines.filter(l => l.rawKey && l.savedIngId && !(l.src === 'learned' && String(l.match?.id) === String(l.savedIngId)))
    .map(l => ({ supplier_key: sk, raw_key: l.rawKey, raw_name: String(l.raw).slice(0, 200), ingredient_id: Number(l.savedIngId), updated_at: now }));
  if(!rows.length) return;
  try { await kData.insert('ingredient_aliases', rows, true, 'supplier_key,raw_key'); await _invLoadAliases(true); }
  catch(e) { console.warn('alias mentés:', e.message); }
}

// ---------- v2.56.0: NETTÓ / BRUTTÓ ----------
// Sorrend: összesítő-egyezés (a sorok összege = részösszeg → nettó, = végösszeg → bruttó) → kulcsszó → AI → nettó (bizonytalan)
function _invDetectBasis(parsed, all, text){
  const T = parsed.totals || {};
  const tn = _invNum(T.net), tg = _invNum(T.gross), tv = _invNum(T.vat);
  const sum = all.reduce((t, l) => t + (l.printed || 0), 0);
  const lineVat = (all.find(l => l.vatPct > 0) || {}).vatPct || 0;
  const vat = (tn > 0 && tv > 0) ? Math.round(tv / tn * 1000) / 10 : (tn > 0 && tg > tn ? Math.round((tg / tn - 1) * 1000) / 10 : lineVat);
  const near = (a, b) => b > 0 && Math.abs(a - b) <= Math.max(0.05, b * 0.0005);
  const f = n => _invFmt(n);
  if(near(sum, tn) && !(near(sum, tg) && tg !== tn)) return { basis:'net', vat, why:`a tételek összege egyezik a ${f(tn)} részösszeggel (ÁFA nélkül)` };
  if(near(sum, tg) && tg !== tn) return { basis:'gross', vat, why:`a tételek összege egyezik a ${f(tg)} végösszeggel (ÁFA-val)` };
  const txt = (text + ' ' + all.map(l => l.raw).join(' ')).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if(/fara\s*tva|excl(?:\.|uding|usiv)?\s*(?:tva|vat)|without\s*vat|afa\s*nelkul|\bnetto?\b/.test(txt)) return { basis:'net', vat, why:'a számlán: „fără TVA” / ÁFA nélkül' };
  if(/cu\s*tva|incl(?:\.|uding|usiv)?\s*(?:tva|vat)|tva\s*inclus|afa-?val|\bbrutto?\b/.test(txt)) return { basis:'gross', vat, why:'a számlán: „cu TVA” / ÁFA-val' };
  if(parsed.amount_basis === 'net' || parsed.amount_basis === 'gross') return { basis: parsed.amount_basis, vat, why:'az AI szerint — ellenőrizd', unsure:true };
  return { basis:'net', vat, why:'nem egyértelmű — ellenőrizd', unsure:true };
}
function _invApplyBasis(){
  const B = _INV.basis || { basis:'net', vat:0 };
  [...(_INV.lines||[]), ...(_INV.extra||[])].forEach(l => {
    const v = l.vatPct || B.vat || 0;
    l.lineTotalNet = B.basis === 'gross' ? (l.printed || 0) / (1 + v / 100) : (l.printed || 0);
  });
  // a számlán szereplő szállítás/egyéb — bekerülési értéken (ÁFA-fizetőnél nettó)
  _INV.extraInvoice = (_INV.extra||[]).reduce((s, l) => s + _invLineCost(l), 0);
}
// bekerülési érték (a számla pénznemében): ÁFA-fizető cégnél nettó, egyébként bruttó (az ÁFA a költség része)
function _invLineCost(l){
  if(_invVatPayer()) return l.lineTotalNet || 0;
  const v = l.vatPct || _INV.basis?.vat || 0;
  return (l.lineTotalNet || 0) * (1 + v / 100);
}
function invSetBasis(b){ if(b !== 'net' && b !== 'gross') return; _INV.basis = { ...(_INV.basis||{}), basis:b, why:'kézzel beállítva', unsure:false }; _invApplyBasis(); _invRecalcLanded(); renderInvoiceReview(); }
function invSetVat(v){ const n = _invNum(v); if(n >= 0 && n < 100){ _INV.basis = { ...(_INV.basis||{}), vat:n }; _invApplyBasis(); _invRecalcLanded(); renderInvoiceReview(); } }

// v2.55.3: beszállító keresése — CUI, majd név (jogi forma / domain nélkül: „vrac-magazin.ro" ≈ „Vrac Magazin SRL")
function _invSupKey(name){
  return (name||'').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/^(https?:\/\/)?(www\.)?/,'').replace(/\.(ro|hu|com|eu|net|org|shop|store)\b/g,' ')
    .replace(/\b(s\.?r\.?l|s\.?a|kft|bt|zrt|nyrt|ltd|gmbh|pfa|ii|srl-d|co)\b\.?/g,' ').replace(/[^a-z0-9]/g,'');
}
function _invFindSupplier(sup){
  const list = R.suppliers||[];
  const cuiN = _invNorm(sup.cui).replace(/^ro/,'');
  if(cuiN){ const s = list.find(x=>_invNorm(x.cui).replace(/^ro/,'')===cuiN); if(s) return {s, exact:true}; }
  const nameN = _invNorm(sup.name);
  if(!nameN) return null;
  let s = list.find(x=>_invNorm(x.name)===nameN); if(s) return {s, exact:true};
  const k = _invSupKey(sup.name);
  if(k.length<4) return null;
  s = list.find(x=>{ const a=_invSupKey(x.name); return a.length>=4 && (a===k || a.includes(k) || k.includes(a)); });
  return s ? {s, exact:false} : null;
}
function _invSupplierName(){ return _INV.supplier.match==='new' ? (_INV.newSupName||'').trim() : (_INV.supplier.data?.name||''); }

function _invSuggestNewIng(ln){
  // egység tipp: db-jellegű? tömeg? térfogat?
  // v2.55.3: a kiszerelés egysége (pack_unit) az elsődleges — „1 buc × 3 kg" eddig darabos (db) alapanyag lett
  const u = _invNorm(ln.packUnit || ln.unit);
  // v2.54.1: pontos egyezés — eddig részszöveg-keresés volt, így pl. a „kilogram" (benne „l") folyadék lett
  let unit = 'g'; // kg/g/zsák → g bázis, kg megjelenítés
  if(['db','buc','bucata','bucati','piece','pieces','pcs','pc','darab','ea'].includes(u)) unit='db';
  else if(['l','ml','cl','dl','liter','litru','litri','litre','litres','liters'].includes(u)) unit='l';
  const cats = R.ingredientCategories||[];
  const nm = (ln.hu||ln.raw||'').trim();
  return { name: nm.charAt(0).toLocaleUpperCase('hu') + nm.slice(1), category: cats[0]||'Egyéb', subType:'other_dry', unit, materialType:'raw' };
}

// ---------- ÁTTEKINTŐ UI ----------
function _invLej(v){ return (v*(_INV.fx.rate||1)); }
function _invFmt(n){ return (Math.round(n*100)/100).toLocaleString('hu-HU',{minimumFractionDigits:2,maximumFractionDigits:2}); }

function renderInvoiceReview(){
  const host = document.getElementById('inv-review');
  if(!host) return;
  const s = _INV.supplier, fx = _INV.fx, p = _INV.parsed||{}, meta = _INV.meta||{};
  const inp = 'padding:6px 9px;border:1.5px solid var(--border);border-radius:8px;font-size:0.82rem;font-family:Kodchasan,sans-serif;box-sizing:border-box';
  const supBadge = s.match==='found'
    ? `<span style="color:var(--teal-dark);font-weight:600">✅ Ismert beszállító</span>`
    : s.match==='fuzzy'
    ? `<span style="color:#9a3412;font-weight:600">⚠️ Hasonló nevű meglévő beszállító („${esc(s.parsed?.name||'')}”) — ellenőrizd, vagy válassz mást</span>`
    : `<span style="color:#9a3412;font-weight:600">🆕 Új beszállító — létrehozom</span>`;
  const supOpts = (R.suppliers||[]).slice().sort((a,b)=>(a.name||'').localeCompare(b.name||'','hu'))
    .map(x=>`<option value="${x.id}" ${s.match!=='new' && String(s.id)===String(x.id)?'selected':''}>${esc(x.name)}</option>`).join('');
  // összesítő-ellenőrzés: a tételek nettó összege vs. a számla nettó összesítője (AI-olvasási hiba jelzése)
  // v2.56.0: a számlán álló összegeket (nettó VAGY bruttó) vetjük össze a megfelelő összesítővel
  const B = _INV.basis || { basis:'net', vat:0 };
  const curLbl = fx.currency==='RON' ? 'lej' : fx.currency;
  const printedSum = [..._INV.lines, ...(_INV.extra||[])].reduce((t,l)=>t+(l.printed||0),0);
  const invTot = _invNum(B.basis==='gross' ? p.totals?.gross : p.totals?.net);
  const sumOk = !(invTot>0) || Math.abs(invTot-printedSum) < 0.05;
  const linesCost = _INV.lines.reduce((t,l)=>t+_invLineCost(l),0);
  const grandLej = _invLej(linesCost + (_INV.extraSum||0));
  const costLbl = _invVatPayer() ? 'nettó' : 'bruttó';
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
        <div style="font-size:0.78rem;color:var(--text-soft)">${s.parsed?.cui?('CUI: '+esc(s.parsed.cui)):'CUI nem olvasható'}</div>
        <div style="font-size:0.8rem;margin-top:4px">${supBadge}</div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:10px;align-items:flex-end">
          <div style="min-width:200px;flex:1"><div style="font-size:0.7rem;color:var(--text-soft);margin-bottom:3px">Beszállító</div>
            <select id="inv-sup" onchange="invSetSupplier(this.value)" style="${inp};width:100%">
              <option value="__new__" ${s.match==='new'?'selected':''}>🆕 Új beszállító létrehozása</option>${supOpts}
            </select>
            ${s.match==='new' ? `<input type="text" id="inv-sup-name" value="${esc(_INV.newSupName||'')}" placeholder="beszállító neve" onchange="invSetNewSupName(this.value)" style="${inp};width:100%;margin-top:6px">`:''}
          </div>
          <div><div style="font-size:0.7rem;color:var(--text-soft);margin-bottom:3px">Számla / rendelés száma</div>
            <input type="text" id="inv-no" value="${esc(meta.invNo||'')}" placeholder="ha nincs, üresen" onchange="invSetMeta('invNo', this.value)" style="${inp};width:150px"></div>
          <div><div style="font-size:0.7rem;color:${meta.dateRead?'var(--text-soft)':'#9a3412'};margin-bottom:3px">${meta.dateRead?'Dátum':'⚠️ Dátum (nem olvasható — ellenőrizd)'}</div>
            <input type="date" id="inv-date" value="${esc(meta.date||'')}" onchange="invSetMeta('date', this.value)" style="${inp};${meta.dateRead?'':'border-color:#fdba74;background:#fff7ed'}"></div>
        </div>
      </div>
      <div style="text-align:right;font-size:0.8rem">
        <div>${fxNote}</div>
        ${fx.currency!=='RON' && fx.rate<=0 ? `<input type="number" step="0.0001" id="inv-fx-manual" placeholder="pl. 4.97" style="margin-top:4px;width:110px;padding:5px 8px;border:1.5px solid var(--border);border-radius:7px" onchange="invSetFx(this.value)">`:''}
      </div>
    </div>
  </div>

  <div class="card" style="${B.unsure?'border-left:4px solid #f59e0b':''}">
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;font-size:0.82rem">
      <span style="font-weight:600;color:var(--teal-dark)">💶 A számlán az árak:</span>
      <select id="inv-basis" onchange="invSetBasis(this.value)" style="${inp}">
        <option value="net" ${B.basis==='net'?'selected':''}>ÁFA nélkül (nettó)</option>
        <option value="gross" ${B.basis==='gross'?'selected':''}>ÁFA-val (bruttó)</option>
      </select>
      <span>ÁFA</span><input type="number" step="0.1" min="0" id="inv-vat" value="${B.vat||''}" placeholder="pl. 11" onchange="invSetVat(this.value)" style="${inp};width:70px;text-align:right"><span>%</span>
      <span style="color:${B.unsure?'#9a3412':'var(--text-soft)'};font-size:0.74rem">${B.unsure?'⚠️ ':'✅ '}${esc(B.why||'')}</span>
    </div>
    <div style="font-size:0.72rem;color:var(--text-soft);margin-top:6px">Bekerülési érték: <b>${costLbl}</b> (${_invVatPayer()?'a cég ÁFA-fizető, az ÁFA visszaigényelhető':'nem ÁFA-fizető cég: az ÁFA a költség része'}) — Beállítások → Pénzügyi beállítások.${B.basis==='gross' && !(B.vat>0) ? ' <b style="color:#c0574e">Add meg az ÁFA-kulcsot!</b>':''}</div>
  </div>

  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="font-weight:700;color:var(--teal-dark)">Tételek</div>
      <div style="font-size:0.78rem;color:var(--text-soft)">✅ ${okC} kész${needC?` · ⚠️ ${needC} ellenőrizendő`:''}</div>
    </div>
    <div style="overflow-x:auto">
      <style>@media (max-width:640px){
        .inv-tbl thead{display:none}
        .inv-tbl tr{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;padding:12px 4px}
        .inv-tbl td{padding:0!important}
        .inv-tbl td:nth-child(1),.inv-tbl td:nth-child(2){grid-column:1/-1}
        .inv-tbl td.num{text-align:left}
        .inv-tbl td[data-l]::before{content:attr(data-l);display:block;font-size:0.62rem;color:var(--text-soft);font-weight:400}
        .inv-tbl select{max-width:none!important}
        .inv-tbl input{width:100%!important;box-sizing:border-box}
      }</style>
      <table class="inv-tbl" style="width:100%;border-collapse:collapse;font-size:0.8rem">
        <thead><tr style="text-align:left;color:var(--text-soft);border-bottom:2px solid var(--border)">
          <th style="padding:6px 8px">Számla tétel</th>
          <th style="padding:6px 8px">Alapanyag (párosítás)</th>
          <th style="padding:6px 8px" class="num">Menny.</th>
          <th style="padding:6px 8px" class="num">Sorérték</th>
          <th style="padding:6px 8px" class="num">+Szállítás</th>
          <th style="padding:6px 8px" class="num">lej/bázis</th>
        </tr></thead>
        <tbody>${_INV.lines.map(_invRowHtml).join('')}</tbody>
      </table>
    </div>
    ${_INV.extraSum > 0 ? `<div style="margin-top:10px;font-size:0.76rem;color:var(--text-soft)">Szétosztott költségek (${[...(_INV.extra||[]).map(e=>esc(e.raw)), ...((_INV.manualExtra?.amount>0)?['külön számla (kézi)']:[])].join(', ')}): <b>${_invFmt(_invLej(_INV.extraSum))} lej</b> — a nyersanyagokra osztva (súly, ennek híján érték szerint).</div>`:''}
    <div style="margin-top:12px;padding-top:10px;border-top:1px dashed var(--border);display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:0.8rem">
      <span style="font-weight:600;color:var(--teal-dark)">➕ Külön számlán érkezett szállítás / egyéb költség (nettó):</span>
      <input type="number" step="any" min="0" id="inv-manual-extra" value="${_INV.manualExtra?.amount || ''}" placeholder="0" onchange="invSetManualExtra(this.value, document.getElementById('inv-manual-cur').value)" style="width:96px;padding:5px 8px;border:1.5px solid var(--border);border-radius:7px;text-align:right">
      <select id="inv-manual-cur" onchange="invSetManualExtra(document.getElementById('inv-manual-extra').value, this.value)" style="padding:5px 8px;border:1.5px solid var(--border);border-radius:7px">
        ${[...new Set([_INV.fx.currency, 'RON'])].map(c=>`<option value="${c}" ${(_INV.manualExtra?.currency||_INV.fx.currency)===c?'selected':''}>${c==='RON'?'lej':c}</option>`).join('')}
      </select>
      <span style="color:var(--text-soft);font-size:0.72rem">Ha a szállítás külön számlán jött (vagy nincs róla papír), írd be itt — a tételekre osztjuk (súly, ennek híján érték szerint). Számla nélkül a kifizetett teljes összeget add meg. Ha később derül ki: „Utólagos költség”.</span>
    </div>
  </div>

  <div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
    <div style="font-size:0.8rem;color:var(--text-soft);flex:1;min-width:220px">
      <div style="font-size:0.86rem;color:var(--text)">Tételek ${costLbl}: <b>${_invFmt(_invLej(linesCost))} lej</b>${(_INV.extraSum||0)>0?` + költség <b>${_invFmt(_invLej(_INV.extraSum))} lej</b>`:''} = bevételezett érték <b style="color:var(--teal-dark)">${_invFmt(grandLej)} lej</b></div>
      ${invTot>0 ? (sumOk ? `<div style="color:var(--teal-dark);margin-top:2px">✅ A sorok összege egyezik a számla ${B.basis==='gross'?'végösszegével':'részösszegével'} (${_invFmt(invTot)} ${esc(curLbl)}).</div>`
        : `<div style="color:#c0574e;font-weight:600;margin-top:2px">⚠️ A sorok összege (${_invFmt(printedSum)}) eltér a számla ${B.basis==='gross'?'végösszegétől':'részösszegétől'} (${_invFmt(invTot)}) — ellenőrizd a sorokat!</div>`) : ''}
      <div style="margin-top:4px">A véglegesítés: ${s.match==='new'?'létrehozza a beszállítót, ':''}a hiányzó alapanyagokat létrehozza, és FIFO-tételként bevételez (visszakövethető${meta.invNo?', számlaszámmal':''}).</div>
    </div>
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
  const missingCls = ln.status==='missing' ? 'background:#fef2f2' : ((ln.status==='new'||ln.status==='uncertain')?'background:#fff7ed':'');
  return `<tr style="border-bottom:1px solid var(--border);${missingCls}">
    <td style="padding:7px 8px"><div style="font-weight:600">${badge} ${esc(ln.raw)}</div>${ln.qtySrc?`<div style="font-size:0.64rem;color:var(--text-soft)">mennyiség a névből</div>`:''}</td>
    <td style="padding:7px 8px">
      <select onchange="invSetIng(${ln.idx}, this.value)" style="width:100%;max-width:200px;padding:4px 6px;border:1.5px solid var(--border);border-radius:7px;font-size:0.76rem">
        <option value="__new__" ${ln.chosenIngId==='__new__'?'selected':''}>🆕 Új: ${esc(ln.newIng?.name||ln.hu)}</option>
        ${opts}
      </select>
      ${ln.chosenIngId==='__new__' ? `<div style="font-size:0.66rem;color:#9a3412;margin-top:3px">Új alapanyag lesz (${esc(ln.newIng?.category||'')}, ${esc(ln.newIng?.unit==='g'?'kg':ln.newIng?.unit||'')})</div>`:''}
      ${_invSrcBadge(ln)}
      ${ln.status==='uncertain' ? `<div style="font-size:0.66rem;color:#9a3412;margin-top:3px">Jó így? <button class="btn btn-ghost btn-sm" style="padding:1px 8px;font-size:0.66rem" onclick="invConfirmIng(${ln.idx})">✓ Igen</button></div>`:''}
    </td>
    <td style="padding:7px 8px" class="num">
      <input type="number" step="any" value="${ln.baseQtyG||''}" onchange="invSetQty(${ln.idx}, this.value)" style="width:82px;padding:4px 6px;border:1.5px solid var(--border);border-radius:7px;text-align:right;font-size:0.76rem">
      <div style="font-size:0.62rem;color:var(--text-soft)">bázis (g/ml/db)</div>
    </td>
    <td style="padding:7px 8px" class="num">
      <input type="number" step="any" value="${ln.printed||''}" onchange="invSetTotal(${ln.idx}, this.value)" style="width:82px;padding:4px 6px;border:1.5px solid var(--border);border-radius:7px;text-align:right;font-size:0.76rem">
      <div style="font-size:0.62rem;color:var(--text-soft)">sor ${_INV.basis?.basis==='gross'?'bruttó':'nettó'} (${esc(_INV.fx.currency)})</div>
    </td>
    <td class="num" data-l="+Szállítás (lej)" style="padding:7px 8px;font-size:0.76rem;color:var(--text-soft)">${ln.landed>0?_invFmt(_invLej(ln.landed)):'—'}</td>
    <td class="num" data-l="Bekerülési ár" style="padding:7px 8px;font-weight:600">${lejPerBase>0?_invFmt(lejPerBase):'—'}<div style="font-size:0.62rem;color:var(--text-soft);font-weight:400">lej/${esc(unitLbl||'bázis')}</div></td>
  </tr>`;
}

// v2.56.0: honnan jött a párosítás
function _invSrcBadge(ln){
  const cur = String(ln.chosenIngId);
  if(ln.chosenIngId === '__new__') return ln.srcNote ? `<div style="font-size:0.64rem;color:var(--text-soft);margin-top:3px">📖 ${esc(ln.srcNote)}</div>` : '';
  if(!ln.match || cur !== String(ln.match.id)) return `<div style="font-size:0.64rem;color:var(--teal-dark);margin-top:3px">✍️ kézzel választva — megjegyzem</div>`;
  const st = { learned:['✅ tanult','var(--teal-pale)','var(--teal-dark)'], dict:['📖 szótár','#eef2ff','#3730a3'], ai:['🤖 AI-javaslat','#fff7ed','#9a3412'], name:['🔤 hasonló név','#fff7ed','#9a3412'] }[ln.src];
  if(!st) return '';
  return `<div style="margin-top:3px"><span style="display:inline-block;border-radius:10px;padding:1px 8px;font-size:0.64rem;font-weight:600;background:${st[1]};color:${st[2]}">${st[0]}</span>${ln.src==='dict'&&ln.srcNote&&_invNorm(ln.srcNote.replace('szótár: ',''))!==_invNorm(ln.match.name)?` <span style="font-size:0.62rem;color:var(--text-soft)">${esc(ln.srcNote.replace('szótár: ',''))}</span>`:''}</div>`;
}

// lej/megjelenítési-egység (kg/l/db) az ellenőrzéshez
function _invRowLejPerBase(ln){
  if(!(ln.baseQtyG>0)) return 0;
  const totalLej = _invLej(_invLineCost(ln) + (ln.landed||0));
  const perBaseG = totalLej / ln.baseQtyG; // lej / g|ml|db
  const ing = ln.chosenIngId && ln.chosenIngId!=='__new__' ? getIng(parseInt(ln.chosenIngId)) : null;
  const unit = ing ? ing.unit : (ln.newIng?.unit||'g');
  return perBaseG * unitFactor(unit==='g'?'kg':unit==='ml'?'l':unit); // lej/kg|l|db
}

// ---------- INTERAKCIÓK ----------
// v2.54.1: a hiányzó mennyiség/ár az ÚJ alapanyagnál is blokkol (eddig javítás után átcsúszott)
function _invLineStatus(ln){
  if(!(ln.baseQtyG>0 && ln.lineTotalNet>0)) return 'missing';
  if(ln.chosenIngId==='__new__') return 'new';
  return (ln.fuzzy && ln.match && String(ln.chosenIngId)===String(ln.match.id)) ? 'uncertain' : 'ok';
}
function invSetIng(idx, v){ const ln=_INV.lines.find(l=>l.idx==idx); if(!ln) return; ln.chosenIngId=v; ln.status=_invLineStatus(ln); renderInvoiceReview(); }
function invConfirmIng(idx){ const ln=_INV.lines.find(l=>l.idx==idx); if(!ln) return; ln.fuzzy=false; ln.status=_invLineStatus(ln); renderInvoiceReview(); }
function invSetSupplier(v){
  if(v==='__new__') _INV.supplier = {match:'new', id:null, data:null, parsed:_INV.supplier.parsed};
  else { const s=(R.suppliers||[]).find(x=>String(x.id)===String(v)); if(s) _INV.supplier = {match:'found', id:s.id, data:s, parsed:_INV.supplier.parsed}; }
  renderInvoiceReview();
}
function invSetNewSupName(v){ _INV.newSupName = String(v||'').slice(0,120); }
function invSetMeta(field, v){
  if(field==='invNo') _INV.meta.invNo = String(v||'').trim().slice(0,60);
  else if(field==='date' && /^\d{4}-\d{2}-\d{2}$/.test(v||'')){ _INV.meta.date = v; _INV.meta.dateRead = true; }
  renderInvoiceReview();
}
function invSetQty(idx, v){ const ln=_INV.lines.find(l=>l.idx==idx); if(!ln) return; ln.baseQtyG=_invNum(v); ln.status=_invLineStatus(ln); renderInvoiceReview(); }
function invSetTotal(idx, v){ const ln=_INV.lines.find(l=>l.idx==idx); if(!ln) return; ln.printed=_invNum(v); _invApplyBasis(); _invRecalcLanded(); ln.status=_invLineStatus(ln); renderInvoiceReview(); }
function invSetFx(v){ const n=_invNum(v); if(n>0){ _INV.fx.rate=n; _INV.fx.source='kézi'; renderInvoiceReview(); } }

// landed cost (újra)számítás: a számlán lévő + a kézzel megadott (külön számlás) szállítás/egyéb költség
// szétosztása a nyersanyag-sorokra — súly szerint, ahol nincs súly, érték szerint
function _invManualExtraInInvoiceCur(){
  const m = _INV.manualExtra || { amount: 0 };
  const amt = Number(m.amount) || 0;
  if(!(amt > 0)) return 0;
  if(m.currency === _INV.fx.currency) return amt;
  if(m.currency === 'RON') return (_INV.fx.rate > 0) ? amt / _INV.fx.rate : 0;   // lej → számla pénzneme
  return amt;
}
function _invRecalcLanded(){
  const extraSum = (_INV.extraInvoice || 0) + _invManualExtraInInvoiceCur();
  _INV.extraSum = extraSum;
  const mat = _INV.lines || [];
  mat.forEach(l => { l.landed = 0; });
  if(!(extraSum > 0) || !mat.length) return;
  // v2.55.2 javítás: súly szerint CSAK ha minden sornak van súlya — vegyesen eddig többet osztott szét, mint a költség
  const useW = mat.every(l => l.weightKg > 0);
  const total = mat.reduce((s,l)=>s+(useW ? l.weightKg : (l.lineTotalNet||0)),0);
  mat.forEach(l=>{ l.landed = total > 0 ? extraSum * (useW ? l.weightKg : (l.lineTotalNet||0)) / total : 0; });
}
function invSetManualExtra(v, cur){
  _INV.manualExtra = { amount: _invNum(v), currency: cur || _INV.fx.currency };
  _invRecalcLanded();
  renderInvoiceReview();
}

// ---------- VÉGLEGESÍTÉS ----------
// v2.56.4: a zár AZONNAL bekapcsol — eddig csak az ellenőrző lekérdezések után, így a dupla kattintás
// két párhuzamos bevételezést indított (staging 2026-10-21: 10 sorból 15 tétel, 2 dupla alapanyag)
async function invCommit(){
  if(_INV.busy) return;
  _INV.busy = true;
  const btn = document.getElementById('inv-commit-btn');
  if(btn){ btn.disabled = true; btn.textContent = '⏳ Ellenőrzés…'; }
  let started = false;
  try { started = await _invCommitRun(btn); }
  finally {
    if(!started){ _INV.busy = false; if(btn && document.body.contains(btn)){ btn.disabled = false; btn.textContent = '✅ Bevételezés véglegesítése'; } }
  }
}
async function _invCommitRun(btn){
  const meta = _INV.meta || {};
  const invNo = (meta.invNo||'').toString().trim();
  const recDate = /^\d{4}-\d{2}-\d{2}$/.test(meta.date||'') ? meta.date : localToday();
  const supName = _invSupplierName();
  if(!supName){ toast('⚠️ Add meg a beszállító nevét (vagy válassz meglévőt).', true); document.getElementById('inv-sup-name')?.focus(); return; }

  if(_INV.fx.currency!=='RON' && !(_INV.fx.rate>0)){ toast('⚠️ Add meg az árfolyamot.', true); return; }
  const missing = _INV.lines.filter(l=>l.status==='missing');
  if(missing.length){ toast(`⚠️ ${missing.length} tételnél hiányzik a mennyiség vagy az ár.`, true); return; }

  // Duplikátum-védelem (egy félbeszakadt bevételezés folytatásánál nem kérdez újra)
  if(invNo && !_INV.partial){
    try{
      const dup = await kData.query('ingredient_batches', { filter:`invoice_number=eq.${encodeURIComponent(invNo)}`, limit:1 });
      if(dup && dup.length){ if(!(await confirmDialog(`A(z) „${invNo}" számla már be lett vételezve. Biztos újra rögzíted?`))) return; }
    }catch(e){ /* ha az oszlop még nincs, tovább */ }
  } else if(!_INV.partial){
    // v2.55.3: szám nélkül (pl. webshop-rendelés) — ugyanattól a beszállítótól ugyanarra a napra már volt számla-bevételezés?
    try{
      const dup = await kData.query('ingredient_batches', { select:'id', filter:`supplier_name=eq.${encodeURIComponent(supName)}&received_date=eq.${recDate}&source_type=eq.invoice`, limit:1 });
      if(dup && dup.length){ if(!(await confirmDialog(`${supName} — ${recDate} napra már van számla-bevételezés. Nem ugyanazt rögzíted újra?\n\nHa ez egy másik számla, mehet.`))) return; }
    }catch(e){ /* tovább */ }
  }

  if(btn){ btn.textContent='⏳ Bevételezés…'; }
  try{
    // 1) Beszállító
    // v2.55.3: meglévő beszállítónál a TÖRZSADATBELI név kerül a tételre (eddig a számláról olvasott név)
    const supplierName = supName;
    if(_INV.supplier.match==='new'){
      const sp = { ..._INV.supplier.parsed, name: supName };
      const allSup = await kData.query('suppliers', { order:'id.desc', limit:1 });
      const nextId = (allSup?.[0]?.id||0)+1;
      const sdata = { id:nextId, name:sp.name, cui:sp.cui||null, reg_com:sp.reg_com||null, address:sp.address||null, bank_iban:sp.iban||null, currency:(_INV.fx.currency||'lej').toLowerCase()==='ron'?'lej':(_INV.fx.currency||'lej').toLowerCase(), active:true, updated_at:new Date().toISOString() };
      await kData.insert('suppliers', sdata);
      R.suppliers = R.suppliers||[]; if(typeof mapSupplierDb==='function') R.suppliers.push(mapSupplierDb({...sdata, created_at:new Date().toISOString()})); else R.suppliers.push({...sdata});
      // v2.54.1: újrapróbálásnál ne jöjjön létre még egyszer
      _INV.supplier = { match:'found', id:nextId, data:sdata, parsed:sp };
    }

    // 2) Alapanyagok + 3) FIFO bevételezés
    let created=0, received=0;
    for(const ln of _INV.lines){
      if(ln.committed) continue; // v2.54.1: félbeszakadt bevételezés folytatása — a már rögzített sort kihagyjuk
      let ingId = ln.chosenIngId;
      // Új alapanyag
      // v2.56.4: ha már van ilyen nevű alapanyag (pl. ugyanebben a számlában egy előző sor hozta létre, vagy
      // közben más rögzítette), azt használjuk — nem jön létre dupla
      if(ingId==='__new__'){
        const ni0 = ln.newIng || _invSuggestNewIng(ln);
        const ex = await _invFindIngByExactName(ni0.name);
        if(ex){ ingId = String(ex.id); ln.chosenIngId = ingId; }
      }
      if(ingId==='__new__'){
        const ni = ln.newIng || _invSuggestNewIng(ln);
        // v2.54.1: az ID a DB-ben lévő legnagyobb + 1 (a helyi lista hiányos lehet → ütközés)
        let dbMax = 0;
        try { const top = await kData.query('ingredients', { select:'id', order:'id.desc', limit:1 }); dbMax = top?.[0]?.id || 0; } catch(e) {}
        const nextIngId = Math.max(dbMax, ...R.ingredients.map(i=>i.id))+1;
        const irow = { id:nextIngId, name:ni.name, category:ni.category, sub_type:ni.subType, unit:ni.unit, material_type:ni.materialType||'raw' };
        await kData.insert('ingredients', irow);
        const newIngObj = { id:nextIngId, name:ni.name, cat:ni.category, subType:ni.subType, unit:ni.unit, materialType:ni.materialType||'raw', suppliers:[], totalStockG:0, fifoPrice:0, avgPrice:0, basePriceG:0, notes:'',
          get minStock(){return this.minStockAutoG||0;}, get maxStock(){return this.maxStockAutoG||0;} };
        R.ingredients.push(newIngObj);
        ingId = nextIngId; created++;
        ln.chosenIngId = String(nextIngId); // újrapróbálásnál már meglévőként kezeljük
      } else {
        ingId = parseInt(ingId);
      }

      // FIFO batch (lejben, landed cost beépítve, nettó)
      const totalLej = _invLej(_invLineCost(ln) + (ln.landed||0));   // v2.56.0: ÁFA-fizetőnél nettó
      const pricePerG = ln.baseQtyG>0 ? totalLej/ln.baseQtyG : 0;
      const noteBits = [];
      if(_INV.fx.currency!=='RON') noteBits.push(`${_invFmt(_invLineCost(ln))} ${_INV.fx.currency} @ ${_INV.fx.rate}`);
      if(!_invVatPayer()) noteBits.push('ÁFA-val (nem ÁFA-fizető)');
      if(ln.landed>0) noteBits.push(`+szállítás ${_invFmt(_invLej(ln.landed))} lej`);
      const batchRow = {
        ingredient_id: ingId,
        received_date: recDate,
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
      const ins = await kData.insert('ingredient_batches', batchRow);
      // v2.54.1: a DB által visszaadott sort (ID-val!) vesszük fel — ID nélkül a későbbi FIFO-levonás
      // a DB-ben nem történt meg, csak helyben
      const saved = Array.isArray(ins) ? ins[0] : ins;
      R.batches = R.batches||[];
      R.batches.push(mapBatchRow(saved && saved.id != null ? saved : batchRow));
      ln.committed = true; _INV.partial = true; ln.savedIngId = ingId;
      received++;
    }

    recomputeIngredientStock();
    await _invSaveAliases(_INV.lines, supplierName);   // v2.56.0: legközelebb „tanult” párosítás
    if(typeof auditLog==='function') auditLog('invoice_intake', supplierName, `Számla ${invNo||'—'}: ${received} tétel, ${created} új alapanyag`);

    _INV.busy=false;
    toast(`✅ Bevételezve: ${received} tétel${created?`, ${created} új alapanyag`:''}.`);
    document.getElementById('inv-review').innerHTML = `<div class="card" style="text-align:center;padding:26px"><div style="font-size:2rem">✅</div><div style="font-weight:700;color:var(--teal-dark);margin-top:6px">Kész! ${received} tétel bevételezve.</div><div style="font-size:0.8rem;color:var(--text-soft);margin-top:4px">Ellenőrizd az <b>Alapanyagok & Készlet</b> nézetben.</div><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:16px"><button class="btn btn-ghost" data-action="invPick">Újabb számla</button><button class="btn btn-ghost" data-action="invLaterCostOpen">➕ Később érkezett szállítás / költség</button></div></div>`;
    _INV.parsed=null; _INV.lines=[]; _INV.partial=false;
  }catch(e){
    _INV.busy=false; if(btn){ btn.disabled=false; btn.textContent='✅ Bevételezés véglegesítése'; }
    console.error('invCommit:', e);
    toast('⚠️ Hiba a bevételezésnél: '+e.message, true);
  }
  return true;   // a zárat innentől a fenti ág kezeli
}

// ---------- UTÓLAGOS KÖLTSÉG (v2.55.2) ----------
// Külön számlán / később érkezett szállítás vagy egyéb költség hozzárendelése egy KORÁBBI bevételezéshez.
// A költség a kiválasztott tételek MÉG RAKTÁRON LÉVŐ mennyiségére oszlik (a már felhasznált rész önköltsége lezárt):
// súly szerint (ha minden tétel tömeg-egységű), különben érték szerint. Az ár (price_per_g) emelkedik, a FIFO ezt használja.
const _LC = { groups: [], sel: null, amount: 0, currency: 'RON', rate: 1, date: '', desc: 'Szállítás', supplier: '', fromInvoice: false, checked: new Set() };
const _LC_CURS = ['RON', 'EUR', 'HUF', 'USD'];

async function invLaterCostOpen(pre){
  pre = (pre && typeof pre === 'object') ? pre : {};
  let cur = String(pre.currency || 'RON').toUpperCase(); if(cur === 'LEJ' || cur === 'LEI') cur = 'RON';
  Object.assign(_LC, { amount: Number(pre.amount) || 0, currency: cur, rate: cur === 'RON' ? 1 : (Number(pre.rate) || 0),
    date: (pre.date && /^\d{4}-\d{2}-\d{2}$/.test(pre.date)) ? pre.date : localToday(), desc: pre.desc || 'Szállítás',
    supplier: pre.supplier || '', fromInvoice: !!pre.fromInvoice, sel: null, checked: new Set() });
  const host = document.getElementById('inv-review'); if(!host) return;
  host.innerHTML = '<div class="card" style="font-size:0.86rem;color:var(--teal-dark)">⏳ Korábbi bevételezések betöltése…</div>';
  let rows = [];
  try {
    rows = await kData.query('ingredient_batches', { select: 'id,ingredient_id,invoice_number,supplier_name,received_date,qty_received_g,qty_remaining_g,price_per_g,notes,source_type',
      filter: 'source_type=in.(invoice,purchase)', order: 'received_date.desc,id.desc', limit: 400 }) || [];
  } catch(e) { host.innerHTML = `<div class="card">⚠️ ${esc(e.message)}</div>`; return; }
  const map = new Map();
  rows.forEach(b => {
    const key = b.invoice_number ? 'inv:' + b.invoice_number : 'man:' + (b.supplier_name || '') + '|' + b.received_date;
    if(!map.has(key)) map.set(key, { key, invoice: b.invoice_number || '', supplier: b.supplier_name || '', date: b.received_date, batches: [] });
    map.get(key).batches.push(b);
  });
  let groups = [...map.values()];
  // azonos beszállító előre (v2.55.3: jogi forma / domain nélkül: „vrac-magazin.ro" ≈ „Vrac Magazin SRL")
  const sK = _invSupKey(_LC.supplier);
  const same = g => { const k = _invSupKey(g.supplier); return sK.length >= 4 && k.length >= 4 && (k === sK || k.includes(sK) || sK.includes(k)); };
  if(sK) groups.sort((a, b) => (same(b) ? 1 : 0) - (same(a) ? 1 : 0));
  _LC.groups = groups.slice(0, 30);
  if(_LC.currency !== 'RON' && !(_LC.rate > 0)) { const fx = await _invFxRate(_LC.currency, _LC.date); _LC.rate = fx.rate || 0; }
  renderLaterCost();
}

function _lcUnitLbl(ing){ const u = ing?.unit || 'g'; return u === 'g' ? 'kg' : u === 'ml' ? 'l' : u; }
function _lcPerUnit(ppg, ing){ const u = ing?.unit || 'g'; return (Number(ppg) || 0) * unitFactor(u === 'g' ? 'kg' : u === 'ml' ? 'l' : u); }
function _lcLejTotal(){ return _LC.currency === 'RON' ? _LC.amount : _LC.amount * (_LC.rate || 0); }
function _lcPlan(){
  const g = _LC.groups.find(x => x.key === _LC.sel); if(!g) return null;
  const sel = g.batches.filter(b => _LC.checked.has(b.id) && Number(b.qty_remaining_g) > 0);
  const allMass = sel.length && sel.every(b => ['g', 'kg'].includes(getIng(b.ingredient_id)?.unit || 'g'));
  const w = b => allMass ? Number(b.qty_remaining_g) : Number(b.qty_remaining_g) * (Number(b.price_per_g) || 0);
  const W = sel.reduce((s, b) => s + w(b), 0);
  const total = _lcLejTotal();
  const plan = sel.map(b => { const share = W > 0 ? total * w(b) / W : 0; return { b, share, newPpg: (Number(b.price_per_g) || 0) + share / Number(b.qty_remaining_g) }; });
  return { g, total, plan, allMass };
}

function lcSet(field, v){
  if(field === 'amount') _LC.amount = Math.max(0, _invNum(v));
  else if(field === 'rate') _LC.rate = Math.max(0, _invNum(v));
  else if(field === 'desc') _LC.desc = String(v || '').slice(0, 80);
  else if(field === 'currency') {
    _LC.currency = v; _LC.rate = v === 'RON' ? 1 : 0;
    if(v !== 'RON') { _invFxRate(v, _LC.date).then(fx => { _LC.rate = fx.rate || 0; renderLaterCost(); }); }
  }
  renderLaterCost();
}
function lcSelect(key){
  _LC.sel = key; _LC.checked = new Set();
  const g = _LC.groups.find(x => x.key === key);
  (g?.batches || []).forEach(b => { if(Number(b.qty_remaining_g) > 0) _LC.checked.add(b.id); });
  renderLaterCost();
}
function lcToggle(id, on){ id = Number(id); if(on) _LC.checked.add(id); else _LC.checked.delete(id); renderLaterCost(); }

function renderLaterCost(){
  const host = document.getElementById('inv-review'); if(!host) return;
  const P = _lcPlan();
  const inp = 'padding:6px 9px;border:1.5px solid var(--border);border-radius:8px;font-size:0.84rem;font-family:Kodchasan,sans-serif';
  const groupsHtml = _LC.groups.length ? _LC.groups.map(g => {
    const on = g.key === _LC.sel;
    const left = g.batches.filter(b => Number(b.qty_remaining_g) > 0).length;
    const title = g.invoice ? `🧾 Számla ${esc(g.invoice)}` : (g.batches.every(b => b.source_type === 'invoice') ? '🧾 Számla (szám nélkül)' : '✍️ Kézi bevételezés');
    return `<label style="display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1.5px solid ${on ? 'var(--teal)' : 'var(--border)'};border-radius:12px;margin-bottom:8px;cursor:pointer;background:${on ? 'var(--teal-pale)' : '#fff'}">
      <input type="radio" name="lc-group" ${on ? 'checked' : ''} onchange="lcSelect('${g.key.replace(/'/g, "\\'")}')" style="margin-top:3px;accent-color:var(--teal)">
      <div style="flex:1;font-size:0.82rem"><div style="font-weight:600;color:var(--teal-dark)">${title} · ${esc(g.supplier || 'beszállító nélkül')}</div>
      <div style="color:var(--text-soft);font-size:0.74rem">${esc(g.date || '')} · ${g.batches.length} tétel${left < g.batches.length ? ` · ${g.batches.length - left} már elfogyott` : ''}</div></div></label>`;
  }).join('') : '<div style="font-size:0.82rem;color:var(--text-soft)">Nincs korábbi bevételezés.</div>';

  let tableHtml = '';
  if(P){
    const rows = P.g.batches.map(b => {
      const ing = getIng(b.ingredient_id); const lbl = _lcUnitLbl(ing);
      const rem = Number(b.qty_remaining_g) || 0; const pl = P.plan.find(x => x.b.id === b.id);
      const remDisp = (rem / unitFactor(lbl === 'db' ? 'db' : (lbl === 'l' ? 'l' : 'kg'))).toLocaleString('hu-HU', { maximumFractionDigits: 2 });
      return `<tr style="border-bottom:1px solid var(--border);${rem > 0 ? '' : 'opacity:0.5'}">
        <td style="padding:6px 8px"><input type="checkbox" ${_LC.checked.has(b.id) ? 'checked' : ''} ${rem > 0 ? '' : 'disabled'} onchange="lcToggle(${b.id}, this.checked)" style="accent-color:var(--teal)"></td>
        <td style="padding:6px 8px">${esc(ing?.name || ('#' + b.ingredient_id))}${rem > 0 ? '' : ' <span style="font-size:0.7rem;color:var(--text-soft)">(elfogyott)</span>'}</td>
        <td class="num" style="padding:6px 8px">${remDisp} ${lbl}</td>
        <td class="num" style="padding:6px 8px">${_invFmt(_lcPerUnit(b.price_per_g, ing))}</td>
        <td class="num" style="padding:6px 8px;color:var(--gold-dark)">${pl ? '+' + _invFmt(pl.share) : '—'}</td>
        <td class="num" style="padding:6px 8px;font-weight:700;color:var(--teal-dark)">${pl ? _invFmt(_lcPerUnit(pl.newPpg, ing)) : '—'}</td></tr>`;
    }).join('');
    tableHtml = `<div class="card"><div style="font-weight:700;color:var(--teal-dark);margin-bottom:8px">Szétosztás előnézet</div>
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:0.8rem">
        <thead><tr style="text-align:left;color:var(--text-soft);border-bottom:2px solid var(--border)"><th></th><th style="padding:6px 8px">Alapanyag</th><th class="num" style="padding:6px 8px">Raktáron</th><th class="num" style="padding:6px 8px">Mostani lej/egys.</th><th class="num" style="padding:6px 8px">+költség (lej)</th><th class="num" style="padding:6px 8px">Új lej/egys.</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <div style="font-size:0.74rem;color:var(--text-soft);margin-top:8px">A költség a <b>még raktáron lévő</b> mennyiségre oszlik (${P.allMass ? 'súly' : 'érték'} szerint) — a már felhasznált rész önköltsége lezárt.</div>
      <button class="btn btn-primary" style="margin-top:12px" data-action="invLaterCostCommit" ${P.plan.length && P.total > 0 ? '' : 'disabled'}>✅ Hozzárendelés — ${_invFmt(P.total)} lej</button></div>`;
  }

  host.innerHTML = `
  <div class="card" style="border-left:4px solid var(--gold)">
    <div style="font-family:'Fraunces',serif;font-weight:700;color:var(--teal-dark);font-size:1.05rem;margin-bottom:4px">➕ Utólagos szállítási / egyéb költség</div>
    <div style="font-size:0.8rem;color:var(--text-soft);margin-bottom:12px">${_LC.fromInvoice ? 'Ezen a számlán nincs alapanyag, csak költség. Válaszd ki, melyik bevételezéshez tartozik.' : 'Add meg az összeget (nettó), és válaszd ki, melyik bevételezéshez tartozik.'}</div>
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end">
      <div><div style="font-size:0.7rem;color:var(--text-soft);margin-bottom:3px">Összeg (nettó)</div><input type="number" step="any" min="0" value="${_LC.amount || ''}" onchange="lcSet('amount', this.value)" style="${inp};width:110px;text-align:right"></div>
      <div><div style="font-size:0.7rem;color:var(--text-soft);margin-bottom:3px">Pénznem</div><select onchange="lcSet('currency', this.value)" style="${inp}">${[...new Set([..._LC_CURS, _LC.currency])].map(c => `<option value="${c}" ${c === _LC.currency ? 'selected' : ''}>${c === 'RON' ? 'lej' : c}</option>`).join('')}</select></div>
      ${_LC.currency !== 'RON' ? `<div><div style="font-size:0.7rem;color:var(--text-soft);margin-bottom:3px">Árfolyam (BNR)</div><input type="number" step="0.0001" value="${_LC.rate || ''}" placeholder="pl. 4.97" onchange="lcSet('rate', this.value)" style="${inp};width:96px"></div>` : ''}
      <div style="flex:1;min-width:160px"><div style="font-size:0.7rem;color:var(--text-soft);margin-bottom:3px">Megnevezés</div><input type="text" value="${esc(_LC.desc)}" onchange="lcSet('desc', this.value)" style="${inp};width:100%;box-sizing:border-box"></div>
    </div>
    ${_LC.currency !== 'RON' ? `<div style="font-size:0.74rem;color:var(--text-soft);margin-top:6px">= ${_invFmt(_lcLejTotal())} lej</div>` : ''}
  </div>
  <div class="card"><div style="font-weight:700;color:var(--teal-dark);margin-bottom:8px">Melyik bevételezéshez tartozik?</div>${groupsHtml}</div>
  ${tableHtml}`;
}

async function invLaterCostCommit(){
  const P = _lcPlan();
  if(!P || !P.plan.length) { toast('⚠️ Válassz ki legalább egy raktáron lévő tételt.', true); return; }
  if(!(P.total > 0)) { toast('⚠️ Add meg az összeget' + (_LC.currency !== 'RON' ? ' és az árfolyamot' : '') + '.', true); return; }
  const desc = (_LC.desc || 'Szállítás').trim();
  const dup = P.plan.some(x => String(x.b.notes || '').includes('+' + desc + ' '));
  if(dup && !(await confirmDialog(`Ennél a bevételezésnél már szerepel „${desc}” utólagos költség. Biztosan még egyszer hozzáadod?`))) return;
  if(!(await confirmDialog(`${_invFmt(P.total)} lej „${desc}” költséget osztasz szét ${P.plan.length} tételre (a raktáron lévő mennyiségre).\n\nAz alapanyagok ára ennyivel nő; a már kisütött rész önköltsége nem változik.`))) return;
  const stamp = localToday();
  let ok = 0, fail = 0;
  for(const x of P.plan) {
    const notes = (x.b.notes ? x.b.notes + ' · ' : '') + `+${desc} ${x.share.toFixed(2)} lej (utólag, ${stamp})`;
    try {
      await kData.update('ingredient_batches', { price_per_g: x.newPpg, notes }, `id=eq.${x.b.id}`);
      x.b.price_per_g = x.newPpg; x.b.notes = notes;
      const lb = (R.batches || []).find(b => b.id === x.b.id); if(lb) { lb.pricePerG = x.newPpg; lb.notes = notes; }
      ok++;
    } catch(e) { console.warn('later cost:', e.message); fail++; }
  }
  if(typeof recomputeIngredientStock === 'function') recomputeIngredientStock();
  if(typeof auditLog === 'function') auditLog('invoice_extra_cost', P.g.supplier || '', `${desc}: ${P.total.toFixed(2)} lej → ${ok} tétel (${P.g.invoice ? 'számla ' + P.g.invoice : 'kézi ' + P.g.date})`);
  document.getElementById('inv-review').innerHTML = `<div class="card" style="text-align:center;padding:26px"><div style="font-size:2rem">${fail ? '⚠️' : '✅'}</div>
    <div style="font-weight:700;color:var(--teal-dark);margin-top:6px">${ok} tétel ára frissítve (+${_invFmt(P.total)} lej).${fail ? ` ${fail} tétel mentése nem sikerült.` : ''}</div>
    <div style="font-size:0.8rem;color:var(--text-soft);margin-top:4px">Ellenőrizd az <b>Alapanyagok & Készlet</b> nézetben.</div></div>`;
  toast(fail ? `⚠️ ${fail} tétel mentése sikertelen` : '✅ Utólagos költség hozzárendelve.', !!fail);
}

// globálisok (data-action rendszerhez)
if(typeof window!=='undefined'){
  Object.assign(window, { renderInvoiceIntake, invPick, handleInvoiceFile, aiParseInvoice, invSetIng, invSetQty, invSetTotal, invSetFx, invCommit,
    invSetManualExtra, invLaterCostOpen, lcSet, lcSelect, lcToggle, invLaterCostCommit, invConfirmIng, invSetSupplier, invSetNewSupName, invSetMeta,
    handleInvoiceText, invBackToStock, invOpenLaterCost, invSetMode, invSetBasis, invSetVat });
}
