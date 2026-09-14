// ===== receptura-gyartas.js — KEREK gyártási FLOW (4 fázis) v2.53.126 =====
let _gf = { month:null, day:null, phase:1, view:'uzemi', products:[], loaded:false, pickerOpen:false, pickerSearch:'' };

const GFC = { teal:'#129990', tealDark:'#064C48', tealMid:'#43AAA0', tealPale:'#E0F2EF',
  gold:'#EFB036', goldDark:'#B78029', cream:'#FAF7F0', bgSoft:'#EFF5F3', border:'#C8DDD9',
  text:'#1A2E31', textSoft:'#5A7A80', danger:'#C0574E' };
const _big = () => _gf.view==='uzemi';
const GF_D=['V','H','K','Sze','Cs','P','Szo'];
const GF_M=['január','február','március','április','május','június','július','augusztus','szeptember','október','november','december'];

function _gfMonthDays(y,m){ // a hónap sütési napjai (nap-számok)
  const out=[]; const dim=new Date(y,m+1,0).getDate();
  for(let d=1;d<=dim;d++){ const dt=new Date(y,m,d);
    if(typeof _isBakingDayR==='function' ? _isBakingDayR(dt) : [2,5].includes(dt.getDay())) out.push(d); }
  return out;
}
async function _gfLoadDayProducts(dayStr){
  const [y,m0,dd]=dayStr.split('-').map(Number); const m=m0-1;
  let orders=[]; try{ orders=await sb.query('orders',{filter:`year=eq.${y}&month=eq.${m}&day=eq.${dd}`,limit:5000})||[]; }catch(e){}
  const byProd={}; orders.forEach(o=>{ byProd[o.product_id]=(byProd[o.product_id]||0)+o.quantity; });
  const cache=(typeof _adminProductsCache!=='undefined'?_adminProductsCache:[]);
  const list=[];
  Object.entries(byProd).forEach(([pid,qty])=>{ pid=+pid; list.push(_gfMakeProd(pid, qty, 0)); });
  list.sort((a,b)=>(a.name||'').localeCompare(b.name||'','hu'));
  _gf.products=list; _gf.loaded=true;
}
function _gfMakeProd(pid, ordered, extra){
  const cache=(typeof _adminProductsCache!=='undefined'?_adminProductsCache:[]);
  const p=cache.find(x=>x.id===pid);
  let recipe=(R.recipes||[]).find(r=>!r.archived && r.product_id===pid);
  if(!recipe && p){ const head=p.product_family_id||p.id; const fam=cache.filter(x=>(x.product_family_id||x.id)===head).map(x=>x.id);
    recipe=(R.recipes||[]).find(r=>!r.archived && fam.includes(r.product_id)); }
  const complete = recipe && (((recipe.dryIngredients||[]).length+(recipe.wetIngredients||[]).length+(recipe.otherDryIngredients||[]).length+(recipe.starterIngredients||[]).length)>0);
  return { productId:pid, name:(p?.name)||('#'+pid), weight:p?.weight, ordered, extra, recipeId:recipe?.id||null, hasRecipe:!!complete };
}
function _gfTotal(p){ return (p.ordered||0)+(p.extra||0); }

function _gfStockCheck(){
  const needs={};
  _gf.products.forEach(pr=>{ const r=(R.recipes||[]).find(x=>x.id===pr.recipeId); const tot=_gfTotal(pr); if(!r||!tot) return;
    const scale=(typeof calcScaleFactor==='function')?calcScaleFactor(r,tot):tot;
    [...(r.dryIngredients||[]),...(r.otherDryIngredients||[]),...(r.wetIngredients||[]),...(r.starterIngredients||[])]
      .forEach(ing=>{ if(!ing.ingredientId)return; needs[ing.ingredientId]=(needs[ing.ingredientId]||0)+(ing.amount||0)*scale; }); });
  const rows=[];
  Object.entries(needs).forEach(([id,need])=>{ const ing=(typeof getIng==='function')?getIng(+id):null; if(!ing)return;
    const stock=ing.totalStockG||0; rows.push({name:ing.name, need, stock, ok:stock>=need-0.01, short:Math.max(0,need-stock), unit:ing.unit||'g'}); });
  rows.sort((a,b)=>(a.ok===b.ok)?a.name.localeCompare(b.name,'hu'):(a.ok?1:-1));
  return rows;
}

// ---------- SHELL ----------
function renderGyartasFlow(){
  const box=document.getElementById('gyartas-flow'); if(!box) return;
  const now=new Date();
  if(!_gf.month) _gf.month={year:now.getFullYear(), month:now.getMonth()};
  if(!_gf.day){ // alap: az aktuális hónap első sütési napja (vagy a legközelebbi)
    const md=_gfMonthDays(_gf.month.year,_gf.month.month);
    if(md.length){ const d=md.find(x=>x>=now.getDate())||md[0]; _gf.day=`${_gf.month.year}-${String(_gf.month.month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
  }
  const phases=[['Mit sütök ma?'],['Előkészítés'],['Sütés'],['Lezárás']];
  const stepper=phases.map((p,i)=>{ const n=i+1, on=n===_gf.phase, done=n<_gf.phase;
    const bg=done?GFC.teal:(on?GFC.tealDark:'#fff'), col=(done||on)?'#fff':GFC.textSoft, bd=(done||on)?'none':`1.5px solid ${GFC.border}`;
    return `<div onclick="gfGoPhase(${n})" style="display:flex;flex-direction:column;align-items:center;flex:1;cursor:pointer;min-width:52px">
      <div style="width:38px;height:38px;border-radius:50%;background:${bg};color:${col};border:${bd};display:flex;align-items:center;justify-content:center;font-weight:700;${on?'box-shadow:0 0 0 4px '+GFC.tealPale:''}">${done?'<i class="ti ti-check" style="font-size:18px"></i>':n}</div>
      <div style="font-size:11px;margin-top:5px;text-align:center;color:${on?GFC.tealDark:GFC.textSoft};font-weight:${on?'700':'400'}">${p[0]}</div></div>`;
  }).join(`<div style="flex:0 0 14px;height:2px;background:${GFC.border};margin-top:18px"></div>`);

  box.innerHTML=`
    <div style="font-family:'Kodchasan',sans-serif;color:${GFC.text}">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:10px"><i class="ti ti-flame" style="font-size:22px;color:${GFC.teal}"></i><span style="font-family:'Fraunces',serif;font-size:19px;font-weight:600;color:${GFC.tealDark}">Gyártás</span></div>
        <div style="display:inline-flex;background:${GFC.bgSoft};border-radius:10px;padding:3px;gap:2px">
          <button onclick="gfSetView('uzemi')" style="border:none;border-radius:8px;padding:7px 14px;font-family:'Kodchasan',sans-serif;font-size:13px;cursor:pointer;background:${_gf.view==='uzemi'?GFC.teal:'transparent'};color:${_gf.view==='uzemi'?'#fff':GFC.textSoft}">Üzemi</button>
          <button onclick="gfSetView('pc')" style="border:none;border-radius:8px;padding:7px 14px;font-family:'Kodchasan',sans-serif;font-size:13px;cursor:pointer;background:${_gf.view==='pc'?GFC.teal:'transparent'};color:${_gf.view==='pc'?'#fff':GFC.textSoft}">PC</button>
        </div>
      </div>
      ${_gf.phase===1?_gfDaySelector():`<div style="font-size:13px;color:${GFC.textSoft};margin-bottom:10px"><i class="ti ti-calendar" style="vertical-align:-2px"></i> ${_gfDayLabelFull(_gf.day)}</div>`}
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin:14px 0 18px">${stepper}</div>
      <div id="gf-phase"></div>
    </div>`;
  renderGFPhase();
}
function _gfDayLabelFull(ds){ if(!ds)return '—'; const [y,m,d]=ds.split('-').map(Number); const dt=new Date(y,m-1,d);
  return `${y}. ${GF_M[m-1]} ${d}. (${['vasárnap','hétfő','kedd','szerda','csütörtök','péntek','szombat'][dt.getDay()]})`; }

// nap-választó: hónap-nav + nap-chipek (app-stílus, nem dropdown)
function _gfDaySelector(){
  const {year,month}=_gf.month;
  const md=_gfMonthDays(year,month);
  const chips = md.length ? md.map(d=>{ const ds=`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const on=ds===_gf.day; const dow=new Date(year,month,d).getDay();
    return `<button onclick="gfSetDay('${ds}')" style="display:inline-flex;flex-direction:column;align-items:center;gap:0;padding:5px 9px;border:1.5px solid ${on?GFC.teal:GFC.border};border-radius:10px;cursor:pointer;background:${on?GFC.teal:'#fff'};color:${on?'#fff':GFC.tealDark};font-family:'Kodchasan',sans-serif;min-width:38px">
      <span style="font-size:10px;opacity:0.8">${GF_D[dow]}</span><span style="font-size:14px;font-weight:700">${d}</span></button>`;
  }).join('') : `<span style="font-size:0.85rem;color:${GFC.textSoft}">Nincs sütési nap ebben a hónapban.</span>`;
  return `<div style="background:${GFC.cream};border:1px solid ${GFC.border};border-radius:14px;padding:12px">
    <div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:6px">
      <button onclick="gfSetMonth(${year-1},${month})" style="padding:5px 12px;border:1.5px solid ${GFC.border};border-radius:8px;background:#fff;cursor:pointer;font-size:0.82rem;font-family:'Kodchasan',sans-serif;color:${GFC.tealDark}">◀ ${year-1}</button>
      <span style="font-weight:700;color:${GFC.tealDark};font-size:1rem;min-width:44px;text-align:center">${year}</span>
      <button onclick="gfSetMonth(${year+1},${month})" style="padding:5px 12px;border:1.5px solid ${GFC.border};border-radius:8px;background:#fff;cursor:pointer;font-size:0.82rem;font-family:'Kodchasan',sans-serif;color:${GFC.tealDark}">${year+1} ▶</button>
    </div>
    <div style="display:flex;gap:3px;margin-bottom:12px;width:100%">
      ${GF_M.map((mn,i)=>`<button onclick="gfSetMonth(${year},${i})" style="flex:1;padding:6px 2px;border-radius:14px;border:1.5px solid ${i===month?GFC.teal:GFC.border};background:${i===month?GFC.tealPale:'#fff'};color:${i===month?GFC.tealDark:GFC.textSoft};font-weight:${i===month?'700':'400'};font-size:0.68rem;cursor:pointer;font-family:'Kodchasan',sans-serif;min-width:0;text-align:center">${mn.slice(0,3)}</button>`).join('')}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">${chips}</div>
  </div>`;
}

function renderGFPhase(){ if(_gf.phase===1) renderGF1(); else if(_gf.phase===2) renderGF2(); else if(_gf.phase===3) renderGF3(); else if(_gf.phase===4) renderGF4(); else document.getElementById('gf-phase').innerHTML=
  `<div style="text-align:center;padding:40px;color:${GFC.textSoft}"><i class="ti ti-tools" style="font-size:32px"></i><p>A ${_gf.phase}. fázis épül — hamarosan.</p></div>`; }

function gfMonthNav(delta){ let m=_gf.month.month+delta, y=_gf.month.year; if(m<0){m=11;y--;} if(m>11){m=0;y++;} _gf.month={year:y,month:m}; renderGyartasFlow(); }
function gfSetMonth(y,m){ _gf.month={year:y,month:m}; renderGyartasFlow(); }
function gfSetDay(v){ _gf.day=v; _gf.loaded=false; _gf.ordersLoaded=false; _gf.batches=[]; _gf.alloc={}; _gf.doneBatches={}; renderGyartasFlow(); }
function gfSetView(v){ _gf.view=v; renderGyartasFlow(); }
function gfGoPhase(n){ if(n>1 && !_gfCanBake()){ if(!confirm('Nincs süthető (receptes) termék a listában — a következő fázisok üresek lesznek. Tovább mégis (pl. teszteléshez)?')) return; } _gf.phase=n; renderGyartasFlow(); }
function gfChangeExtra(pid,delta){ const p=_gf.products.find(x=>x.productId===pid); if(p){ p.extra=Math.max(-(p.ordered),(p.extra||0)+delta); renderGF1(); } }
function gfSetExtra(pid,val){ const p=_gf.products.find(x=>x.productId===pid); if(p){ p.extra=Math.max(-(p.ordered),parseInt(val)||0); renderGF1(); } }
function gfRemoveProduct(pid){ _gf.products=_gf.products.filter(x=>x.productId!==pid); renderGF1(); }
function _gfCanBake(){ return _gf.products.some(p=>p.hasRecipe && _gfTotal(p)>0); }

// ---------- FÁZIS 1 ----------
async function renderGF1(){
  const host=document.getElementById('gf-phase'); if(!host) return;
  if(!_gf.loaded){ host.innerHTML=`<p style="color:${GFC.textSoft}">Betöltés…</p>`; await _gfLoadDayProducts(_gf.day); }
  const big=_big(); const bSz=big?'48px':'36px', qSz=big?'20px':'16px';

  const rows=_gf.products.length ? _gf.products.map(p=>{
    const tot=_gfTotal(p); const noRec=!p.hasRecipe;
    const extraBadge = p.extra>0 ? `<span style="background:${GFC.gold};color:${GFC.text};padding:2px 9px;border-radius:12px;font-size:12px;font-weight:700">+${p.extra} plusz</span>`
      : (p.extra<0?`<span style="background:${GFC.bgSoft};color:${GFC.textSoft};padding:2px 9px;border-radius:12px;font-size:12px">${p.extra}</span>`:'');
    const plusRow = p.ordered===0 ? `<span style="font-size:12px;color:${GFC.gold};font-weight:600">plusz termék</span>` : '';
    return `<div style="background:#fff;border:1.5px solid ${noRec?GFC.danger:GFC.border};border-radius:14px;padding:${big?'14px 16px':'11px 14px'}">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="flex:1;min-width:120px">
          <div style="font-size:${big?'16px':'15px'};font-weight:600;color:${GFC.tealDark}">${esc(p.name)}${noRec?` <span style="color:${GFC.danger};font-size:12px;font-weight:700">⚠️ nincs recept</span>`:''}</div>
          <div style="font-size:12px;color:${GFC.textSoft};display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:2px">
            <span>rendelt: <b style="color:${GFC.tealDark}">${p.ordered}</b></span>${p.weight?`<span>· ${esc(p.weight)}</span>`:''}${extraBadge}${plusRow}
          </div>
        </div>
        <div style="text-align:center">
          <div style="font-size:11px;color:${GFC.textSoft};margin-bottom:3px">extra</div>
          <div style="display:flex;align-items:center;gap:${big?'8px':'5px'}">
            <button onclick="gfChangeExtra(${p.productId},-1)" style="width:${bSz};height:${bSz};padding:0;font-size:${qSz};border:1px solid ${GFC.border};border-radius:10px;background:#fff;cursor:pointer">−</button>
            <input type="number" value="${p.extra}" onchange="gfSetExtra(${p.productId},this.value)" style="width:${big?'52px':'44px'};height:${bSz};text-align:center;font-size:${qSz};font-weight:600;border:1px solid ${GFC.border};border-radius:8px;font-family:'Kodchasan',sans-serif;color:${GFC.tealDark}">
            <button onclick="gfChangeExtra(${p.productId},1)" style="width:${bSz};height:${bSz};padding:0;font-size:${qSz};border:1px solid ${GFC.border};border-radius:10px;background:#fff;cursor:pointer">+</button>
          </div>
          <div style="font-size:12px;color:${GFC.tealDark};margin-top:4px;font-weight:700">= ${tot} db</div>
        </div>
        ${p.ordered===0?`<button onclick="gfRemoveProduct(${p.productId})" style="border:none;background:none;cursor:pointer;color:${GFC.danger}" title="Plusz termék eltávolítása"><i class="ti ti-x" style="font-size:18px"></i></button>`:''}
      </div></div>`;
  }).join('') : `<p style="color:${GFC.textSoft};padding:8px 0">Erre a napra nincs rendelés. Adj hozzá plusz terméket lent.</p>`;

  // plusz termék: keresős inline választó
  const cache=(typeof _adminProductsCache!=='undefined'?_adminProductsCache:[]).filter(p=>!p.deleted_at);
  const already=new Set(_gf.products.map(p=>p.productId));
  const q=(_gf.pickerSearch||'').toLowerCase();
  const _pickCats=[...new Set(cache.filter(p=>!already.has(p.id)).map(p=>p.category||'Egyéb'))].sort((a,b)=>a.localeCompare(b,'hu'));
  const _catChip=(lbl,val)=>`<button onclick="_gf.pickerCat=${val===null?'null':`'${val}'`};renderGF1()" style="padding:5px 12px;border-radius:14px;border:1.5px solid ${(_gf.pickerCat||null)===val?GFC.teal:GFC.border};background:${(_gf.pickerCat||null)===val?GFC.teal:'#fff'};color:${(_gf.pickerCat||null)===val?'#fff':GFC.textSoft};font-size:12px;cursor:pointer;font-family:'Kodchasan',sans-serif">${lbl}</button>`;
  const pickerList = _gf.pickerOpen ? `<div style="background:#fff;border:1.5px solid ${GFC.teal};border-radius:14px;padding:12px;margin-bottom:18px">
      <input id="gf-picker-input" oninput="_gf.pickerSearch=this.value;renderGF1();setTimeout(()=>{const e=document.getElementById('gf-picker-input');if(e){e.focus();e.setSelectionRange(e.value.length,e.value.length);}},0)" placeholder="Termék keresése…" value="${esc(_gf.pickerSearch||'')}" style="width:100%;padding:10px 12px;border:1px solid ${GFC.border};border-radius:10px;font-family:'Kodchasan',sans-serif;font-size:15px;box-sizing:border-box;margin-bottom:8px">
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px">${_catChip('Mind',null)}${_pickCats.map(c=>_catChip(esc(c),c)).join('')}</div>
      <div style="max-height:220px;overflow-y:auto">${cache.filter(p=>!already.has(p.id) && (!q||p.name.toLowerCase().includes(q)) && (!_gf.pickerCat||(p.category||'Egyéb')===_gf.pickerCat)).slice(0,30).map(p=>`
        <button onclick="gfAddProduct(${p.id})" style="display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:10px 12px;border:none;border-bottom:0.5px solid ${GFC.border};background:#fff;cursor:pointer;font-family:'Kodchasan',sans-serif;font-size:14px">
          <i class="ti ti-plus" style="color:${GFC.teal}"></i><span style="flex:1">${esc(p.name)}</span>${p.category?`<span style="font-size:12px;color:${GFC.textSoft}">${esc(p.category)}</span>`:''}</button>`).join('')||`<div style="padding:10px;color:${GFC.textSoft};font-size:14px">Nincs találat.</div>`}</div>
      <button onclick="_gf.pickerOpen=false;renderGF1()" style="margin-top:8px;border:none;background:none;color:${GFC.textSoft};cursor:pointer;font-family:'Kodchasan',sans-serif;font-size:13px">Mégse</button>
    </div>` : `<button onclick="_gf.pickerOpen=true;_gf.pickerSearch='';renderGF1()" style="width:100%;padding:${big?'14px':'11px'};border:1.5px dashed ${GFC.teal};background:${GFC.tealPale};color:${GFC.tealDark};border-radius:12px;font-family:'Kodchasan',sans-serif;font-size:${big?'15px':'14px'};cursor:pointer;margin-bottom:18px"><i class="ti ti-plus" style="vertical-align:-3px"></i> Plusz termék hozzáadása</button>`;

  const sc=_gfStockCheck(); const short=sc.filter(x=>!x.ok);
  const fmt=(g,u)=>(typeof fmtQtyUnit==='function')?fmtQtyUnit(g,u):(Math.round(g)+' g');
  const stockCard = `<div style="background:#fff;border:1px solid ${GFC.border};border-radius:14px;padding:14px 16px;margin-bottom:18px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><i class="ti ti-${sc.length===0?'help-circle':(short.length?'alert-triangle':'circle-check')}" style="font-size:20px;color:${sc.length===0?GFC.textSoft:(short.length?GFC.gold:GFC.teal)}"></i>
      <span style="font-size:15px;font-weight:600">Nyersanyag-ellenőrzés${sc.length?' — '+(short.length?short.length+' alapanyag kevés':'minden alapanyag elég'):''}</span></div>
    ${sc.length===0 ? `<div style="font-size:13px;color:${GFC.textSoft}">Nem számolható — a listában lévő termékeknek nincs kész receptjük (nincs mihez viszonyítani a készletet).</div>`
      : (short.length ? short.slice(0,10).map(x=>`<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:0.5px solid ${GFC.border};font-size:14px"><span>${esc(x.name)}</span><span style="color:${GFC.danger};font-weight:600">hiányzik ${fmt(x.short,x.unit)}</span></div>`).join('')
        : `<div style="font-size:13px;color:${GFC.textSoft}">A kiválasztott mennyiségekhez van elég készlet mindenből.</div>`)}
  </div>`;

  const blocked = false; const _nothingBakeable = !_gfCanBake();
  const hasNoRec=_gf.products.some(p=>!p.hasRecipe);
  const blockMsg = hasNoRec ? `<div style="background:#fff7ed;border:1px solid ${GFC.gold};border-radius:10px;padding:10px 12px;margin-bottom:12px;font-size:13px;color:${GFC.goldDark}"><i class="ti ti-alert-triangle" style="vertical-align:-2px"></i> Van recept nélküli termék (piros keret) — ezek <b>kimaradnak a sütésből</b>, amíg nincs kész receptjük. A többivel tovább lehet lépni.</div>` : '';

  host.innerHTML=`
    <div style="display:flex;flex-direction:column;gap:${big?'10px':'8px'};margin-bottom:14px">${rows}</div>
    ${pickerList}
    ${stockCard}
    ${blockMsg}
    <button onclick="gfGoPhase(2)" ${blocked?'disabled':''} style="width:100%;padding:${big?'16px':'13px'};background:${blocked?GFC.border:GFC.teal};color:#fff;border:none;border-radius:14px;font-family:'Kodchasan',sans-serif;font-size:${big?'16px':'15px'};font-weight:700;cursor:${blocked?'not-allowed':'pointer'}" title="${blocked?'Legalább egy süthető (receptes) termék kell':''}">${blocked?'Adj legalább egy receptes terméket':'Kész — tovább az előkészítéshez'} <i class="ti ti-arrow-right" style="vertical-align:-3px"></i></button>`;
}

function gfAddProduct(pid){ const p=_gfMakeProd(pid,0,1); _gf.products.push(p); _gf.pickerOpen=false; _gf.pickerSearch=''; renderGF1(); }


// ---------- FÁZIS 2: Előkészítés (levain + batch + kiadagolás) ----------
function _gf2Recipe(pid){ const p=_gf.products.find(x=>x.productId===pid); return p?(R.recipes||[]).find(r=>r.id===p.recipeId):null; }
function _gf2Levain(){ let tot=0; _gf.products.forEach(p=>{ const r=_gf2Recipe(p.productId); const q=_gfTotal(p); if(r&&r.levainAmount>0&&q){ const sc=(typeof calcScaleFactor==='function')?calcScaleFactor(r,q):q; tot+=r.levainAmount*sc; } }); return Math.round(tot); }
// összesített + termékenkénti nyersanyag-igény
function _gf2Needs(){
  const total={}, perProd={};
  _gf.products.forEach(p=>{ const r=_gf2Recipe(p.productId); const q=_gfTotal(p); if(!r||!q) return;
    const sc=(typeof calcScaleFactor==='function')?calcScaleFactor(r,q):q;
    perProd[p.productId]={name:p.name, ings:{}};
    [...(r.dryIngredients||[]),...(r.otherDryIngredients||[]),...(r.wetIngredients||[]),...(r.starterIngredients||[])].forEach(ing=>{
      if(!ing.ingredientId)return; const amt=(ing.amount||0)*sc;
      total[ing.ingredientId]=(total[ing.ingredientId]||0)+amt;
      perProd[p.productId].ings[ing.ingredientId]=(perProd[p.productId].ings[ing.ingredientId]||0)+amt;
    });
    // levain összetevők (őskovász/liszt/víz) — külön tételként a kiadagolásba
    if(r.levainAmount>0 && typeof calcLevain==='function'){ const comp=calcLevain(Math.round(r.levainAmount*sc));
      [['L-starter',comp.starter],['L-flour',comp.flour],['L-water',comp.water]].forEach(([k,v])=>{ if(v>0){ total[k]=(total[k]||0)+v; perProd[p.productId].ings[k]=(perProd[p.productId].ings[k]||0)+v; } }); }
  });
  return {total, perProd};
}
function _gfBatchesOvens(){ return (R.equipment||[]).filter(e=>(e.type||'oven')==='oven' && e.active!==false); }
function gfAddBatch(ovenId){ if(!_gf.batches)_gf.batches=[]; const id=(_gf.batchSeq=(_gf.batchSeq||0)+1); _gf.batches.push({id, ovenId, items:[]}); _gf.activeBatch=id; renderGF2(); }
function gfSetActiveBatch(id){ _gf.activeBatch=id; renderGF2(); }
function gfRemoveBatch(id){ _gf.batches=(_gf.batches||[]).filter(b=>b.id!==id); renderGF2(); }
function gfAssignToBatch(pid){ const b=(_gf.batches||[]).find(x=>x.id===_gf.activeBatch); if(!b){toast('Előbb válassz/hozz létre batch-et (sütő).',true);return;} const it=b.items.find(i=>i.productId===pid); const p=_gf.products.find(x=>x.productId===pid); const placed=(_gf.batches||[]).reduce((n,bb)=>n+bb.items.filter(i=>i.productId===pid).reduce((m,i)=>m+i.qty,0),0); const remain=Math.max(0,_gfTotal(p)-placed); if(it)it.qty+=1; else b.items.push({productId:pid, qty:remain>0?remain:1}); renderGF2(); }
function gfBatchQty(bid,pid,val){ const b=(_gf.batches||[]).find(x=>x.id===bid); if(!b)return; const it=b.items.find(i=>i.productId===pid); if(!it)return; it.qty=Math.max(0,parseInt(val)||0); if(it.qty===0)b.items=b.items.filter(i=>i.productId!==pid); renderGF2(); }
function gfGf2Tab(t){ _gf.gf2tab=t; renderGF2(); }

function renderGF2(){
  const host=document.getElementById('gf-phase'); if(!host) return;
  const big=_big();
  const money=n=>(n||0).toFixed(2)+' lej';
  const fmt=(g)=>(typeof fmtQtyUnit==='function')?fmtQtyUnit(g,'g'):(g>=1000?(g/1000).toFixed(2)+' kg':Math.round(g)+' g');

  // --- LEVAIN (termékenként + összetétel + visszaadagolás) ---
  const fmtL=(g)=>(g>=1000?(g/1000).toFixed(2)+' kg':Math.round(g)+' g');
  const levItems=_gf.products.map(p=>{ const r=_gf2Recipe(p.productId); const q=_gfTotal(p); if(!r||!(r.levainAmount>0)||!q)return null;
    const sc=(typeof calcScaleFactor==='function')?calcScaleFactor(r,q):q; const amt=Math.round(r.levainAmount*sc);
    const comp=(typeof calcLevain==='function')?calcLevain(amt):{starter:0,flour:0,water:0};
    const refill=(typeof calcRefill==='function')?calcRefill(comp.starter):{flour:0,water:0};
    return {name:p.name, amt, comp, refill};
  }).filter(Boolean);
  let levCard='';
  if(levItems.length){
    const tot=levItems.reduce((a,x)=>({amt:a.amt+x.amt, st:a.st+x.comp.starter, fl:a.fl+x.comp.flour, wa:a.wa+x.comp.water, rfl:a.rfl+x.refill.flour, rwa:a.rwa+x.refill.water}),{amt:0,st:0,fl:0,wa:0,rfl:0,rwa:0});
    levCard=`<div style="background:${GFC.tealPale};border-radius:14px;padding:14px 16px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><i class="ti ti-microscope" style="font-size:22px;color:${GFC.teal}"></i><span style="font-family:'Fraunces',serif;font-size:16px;font-weight:600;color:${GFC.tealDark}">Levain előkészítés (előző nap)</span></div>
      ${levItems.map(x=>`<div style="background:#fff;border-radius:10px;padding:10px 12px;margin-bottom:6px">
        <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:600;color:${GFC.tealDark};margin-bottom:4px"><span>${esc(x.name)}</span><span>${fmtL(x.amt)} levain</span></div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:${GFC.textSoft}">
          <span>🫙 őskovász: <b>${fmtL(x.comp.starter)}</b></span><span>🌾 liszt: <b>${fmtL(x.comp.flour)}</b></span><span>💧 víz: <b>${fmtL(x.comp.water)}</b></span>
        </div>
        <div style="font-size:12px;color:${GFC.goldDark};margin-top:4px">↩ visszaadagolás az őskovászba: liszt <b>${fmtL(x.refill.flour)}</b> + víz <b>${fmtL(x.refill.water)}</b></div>
      </div>`).join('')}
      <div style="border-top:1px solid ${GFC.border};margin-top:8px;padding-top:8px;font-size:13px;color:${GFC.tealDark}"><b>Összesen:</b> ${fmtL(tot.amt)} levain (őskovász ${fmtL(tot.st)} · liszt ${fmtL(tot.fl)} · víz ${fmtL(tot.wa)}) · visszaadagolás: liszt ${fmtL(tot.rfl)} + víz ${fmtL(tot.rwa)}</div>
    </div>`;
  }

  // --- BATCHEK ---
  const ovens=_gfBatchesOvens();
  const placedQty=pid=>(_gf.batches||[]).reduce((n,b)=>n+b.items.filter(i=>i.productId===pid).reduce((m,i)=>m+i.qty,0),0);
  const ovenCards = ovens.length ? ovens.map(o=>{
    const myB=(_gf.batches||[]).filter(b=>b.ovenId===o.id);
    const head=`<div style="height:${big?'96px':'70px'};background:linear-gradient(135deg,${GFC.tealMid},${GFC.tealDark});display:flex;align-items:center;justify-content:center;position:relative;border-radius:16px 16px 0 0">
      ${o.photo?`<img src="${o.photo}" style="height:100%;width:100%;object-fit:cover;border-radius:16px 16px 0 0">`:`<i class="ti ti-oven" style="font-size:40px;color:${GFC.goldLight||'#EBCF9E'}"></i>`}
      <span style="position:absolute;bottom:8px;left:12px;color:#fff;font-family:'Fraunces',serif;font-size:16px;font-weight:600">${esc(o.name)}</span>
      <span style="position:absolute;bottom:9px;right:12px;color:${GFC.tealPale};font-size:11px">${o.capacityTrays||0} tálca · ${o.trayType||'GN1/1'}</span></div>`;
    const batches=myB.map(b=>{ const on=b.id===_gf.activeBatch;
      let traysNeeded=0; b.items.forEach(it=>{ const r=_gf2Recipe(it.productId); const cap=(typeof ovenCapacityPieces==='function')?ovenCapacityPieces(o,r||{}):0; if(cap>0) traysNeeded+=it.qty/ (cap/(o.capacityTrays||1)); });
      const pct=(o.capacityTrays>0)?Math.round(traysNeeded/o.capacityTrays*100):0; const over=pct>100;
      let cost=0; b.items.forEach(it=>{ const r=_gf2Recipe(it.productId); if(r&&typeof calcRecipeCost==='function')cost+=(calcRecipeCost(r,it.qty).rawCost||0); });
      const bakeMin=Math.max(0,...b.items.map(it=>Number(_gf2Recipe(it.productId)?.bakeMin)||0));
      const kwh=(Number(o.powerKw)||0)*(Number(o.dutyFactor)||0.7)*(bakeMin/60)+(Number(o.preheatKwh)||0);
      cost += kwh*((R.settings?.electricity)||0);
      const items=b.items.map(it=>{ const p=_gf.products.find(x=>x.productId===it.productId); return `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;font-size:13px"><span style="flex:1">${esc(p?.name||'?')}</span><input type="number" min="0" value="${it.qty}" onchange="gfBatchQty(${b.id},${it.productId},this.value)" style="width:46px;height:30px;text-align:center;border:1px solid ${GFC.border};border-radius:7px;font-family:'Kodchasan',sans-serif"></div>`; }).join('')||`<div style="font-size:12px;color:${GFC.textSoft};padding:4px 0">Válassz terméket lent → ide kerül.</div>`;
      return `<div onclick="gfSetActiveBatch(${b.id})" style="border:2px solid ${on?GFC.teal:'transparent'};background:${on?GFC.tealPale:GFC.cream};border-radius:12px;padding:10px;margin-top:8px;cursor:pointer">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px"><span style="font-size:12px;font-weight:700;color:${GFC.tealDark}">Batch ${myB.indexOf(b)+1}${on?' · aktív':''}</span><button onclick="event.stopPropagation();gfRemoveBatch(${b.id})" style="border:none;background:none;cursor:pointer;color:${GFC.danger}"><i class="ti ti-trash"></i></button></div>
        ${items}
        <div style="height:6px;background:#fff;border-radius:3px;overflow:hidden;margin:8px 0 4px"><div style="height:100%;width:${Math.min(100,pct)}%;background:${over?GFC.danger:(pct>85?GFC.gold:GFC.teal)}"></div></div>
        <div style="display:flex;justify-content:space-between;font-size:11px"><span style="color:${over?GFC.danger:GFC.textSoft};font-weight:${over?'700':'400'}">${over?'MEGTELT ':''}${pct}%</span><span style="color:${GFC.tealDark};font-weight:600">${money(cost)}</span></div></div>`;
    }).join('');
    return `<div style="background:#fff;border:1px solid ${GFC.border};border-radius:16px;overflow:hidden">${head}<div style="padding:12px">${batches}<button onclick="gfAddBatch(${o.id})" style="width:100%;margin-top:8px;padding:9px;border:1.5px dashed ${GFC.teal};border-radius:10px;background:${GFC.cream};color:${GFC.tealDark};cursor:pointer;font-family:'Kodchasan',sans-serif;font-size:13px;font-weight:600">+ ${myB.length?'új batch itt':'batch indítása'}</button></div></div>`;
  }).join('') : `<p style="color:${GFC.textSoft}">Nincs sütő. Vegyél fel a Törzsadatok → Eszközök alatt.</p>`;
  const assignChips = (_gf.activeBatch && _gf.products.length) ? `<div style="margin-top:10px"><div style="font-size:12px;color:${GFC.textSoft};margin-bottom:6px">Koppints egy termékre → az aktív batchbe (a maradék mennyiséggel):</div><div style="display:flex;gap:8px;flex-wrap:wrap">${_gf.products.filter(p=>_gfTotal(p)>0).map(p=>{const rem=Math.max(0,_gfTotal(p)-placedQty(p.productId));return `<button onclick="gfAssignToBatch(${p.productId})" style="padding:8px 14px;border:1.5px solid ${rem>0?GFC.teal:GFC.border};border-radius:20px;background:#fff;color:${rem>0?GFC.tealDark:GFC.textSoft};cursor:pointer;font-family:'Kodchasan',sans-serif;font-size:13px">+ ${esc(p.name)} <span style="opacity:0.7">(${rem})</span></button>`;}).join('')}</div></div>` : '';

  // --- KIADAGOLÁS CHECKLIST (Totál / Termékenként) ---
  const {total, perProd}=_gf2Needs();
  const tab=_gf.gf2tab||'total';
  const tabBtn=(id,lbl)=>`<button onclick="gfGf2Tab('${id}')" style="border:none;border-radius:8px;padding:8px 16px;font-family:'Kodchasan',sans-serif;font-size:13px;cursor:pointer;background:${tab===id?GFC.teal:'transparent'};color:${tab===id?'#fff':GFC.textSoft};font-weight:${tab===id?'700':'400'}">${lbl}</button>`;
  let checklistBody='';
  const ingName=id=>{ if(id==='L-starter')return 'Levain — őskovász'; if(id==='L-flour')return 'Levain — liszt'; if(id==='L-water')return 'Levain — víz'; const ing=(typeof getIng==='function')?getIng(+id):null; return ing?ing.name:'#'+id;};
  if(Object.keys(total).length===0){ checklistBody=`<p style="font-size:13px;color:${GFC.textSoft};padding:8px 0">Nincs mit kiadagolni — a termékeknek nincs kész receptjük.</p>`; }
  else if(tab==='byprod'){
    checklistBody=Object.values(perProd).filter(pp=>Object.keys(pp.ings).length).map(pp=>`<div style="margin-bottom:12px"><div style="font-family:'Fraunces',serif;font-size:14px;font-weight:600;color:${GFC.tealDark};margin-bottom:4px">${esc(pp.name)}</div>${Object.entries(pp.ings).map(([id,g])=>`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:0.5px solid ${GFC.border};font-size:13px"><span>${esc(ingName(id))}</span><span style="font-weight:600">${fmt(g)}</span></div>`).join('')}</div>`).join('');
  } else {
    checklistBody=Object.entries(total).sort((a,b)=>b[1]-a[1]).map(([id,g])=>`<label style="display:flex;align-items:center;gap:12px;padding:${big?'12px':'9px'} 4px;border-bottom:0.5px solid ${GFC.border};cursor:pointer"><input type="checkbox" style="width:${big?'22px':'18px'};height:${big?'22px':'18px'};accent-color:${GFC.teal}" onchange="this.closest('label').style.opacity=this.checked?'0.5':'1'"><span style="flex:1;font-size:${big?'15px':'14px'}">${esc(ingName(id))}</span><span style="font-size:${big?'17px':'15px'};font-weight:700;color:${GFC.tealDark}">${fmt(g)}</span></label>`).join('');
  }

  host.innerHTML=`
    ${levCard}
    <div style="font-family:'Fraunces',serif;font-size:16px;font-weight:600;color:${GFC.tealDark};margin-bottom:8px">Batchek — melyik sütőben, mennyi</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px">${ovenCards}</div>
    ${assignChips}
    <div style="font-family:'Fraunces',serif;font-size:16px;font-weight:600;color:${GFC.tealDark};margin:20px 0 8px">Alapanyag-kiadagolás</div>
    <div style="display:inline-flex;background:${GFC.bgSoft};border-radius:10px;padding:3px;gap:2px;margin-bottom:10px">${tabBtn('total','Raktárból (totál)')}${tabBtn('byprod','Termékenként')}</div>
    <div style="background:#fff;border:1px solid ${GFC.border};border-radius:14px;padding:14px 16px;margin-bottom:18px">${checklistBody}</div>
    <div style="display:flex;gap:10px">
      <button onclick="gfGoPhase(1)" style="flex:0 0 auto;padding:${big?'16px 20px':'13px 18px'};background:#fff;color:${GFC.tealDark};border:1.5px solid ${GFC.border};border-radius:14px;font-family:'Kodchasan',sans-serif;font-size:${big?'15px':'14px'};cursor:pointer"><i class="ti ti-arrow-left"></i> Vissza</button>
      <button onclick="gfGoPhase(3)" style="flex:1;padding:${big?'16px':'13px'};background:${GFC.teal};color:#fff;border:none;border-radius:14px;font-family:'Kodchasan',sans-serif;font-size:${big?'16px':'15px'};font-weight:700;cursor:pointer">Kész — tovább a sütéshez <i class="ti ti-arrow-right" style="vertical-align:-3px"></i></button>
    </div>`;
}


// ---------- FÁZIS 3: Sütés (vezetett, batchenként) ----------
let _gfTimer=null;
function _gf3Steps(b){ const out=[]; const seen=new Set();
  (b.items||[]).forEach(it=>{ const p=_gf.products.find(x=>x.productId===it.productId); const r=p?(R.recipes||[]).find(x=>x.id===p.recipeId):null; if(!r||seen.has(r.id))return; seen.add(r.id);
    (r.steps||[]).forEach(st=>out.push({recipe:r.name, title:st.title, desc:st.desc, timer:st.timer}));
    if(r.bakeMin||r.bakeTempC) out.push({recipe:r.name, title:'Sütés', desc:`${r.bakeTempC?r.bakeTempC+' °C':''}${r.bakeMin?(r.bakeTempC?', ':'')+r.bakeMin+' perc':''}`, timer:r.bakeMin});
  }); return out;
}
function _gf3RecipeCard(pid, qty){
  const p=_gf.products.find(x=>x.productId===pid); const r=p?(R.recipes||[]).find(x=>x.id===p.recipeId):null;
  if(!r) return `<div style="font-size:12px;color:${GFC.textSoft};padding:6px 8px">${esc(p?.name||'?')} — nincs recept</div>`;
  const sc=(typeof calcScaleFactor==='function')?calcScaleFactor(r,qty):qty;
  const ings=[...(r.dryIngredients||[]),...(r.otherDryIngredients||[]),...(r.wetIngredients||[]),...(r.starterIngredients||[])];
  const ingHtml=ings.map(i=>`<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0"><span>${esc(i.name)}</span><span style="color:${GFC.tealDark};font-weight:600">${Math.round((i.amount||0)*sc)} g</span></div>`).join('')||`<span style="font-size:12px;color:${GFC.textSoft}">nincs összetevő</span>`;
  const steps=(r.steps||[]).map((st,k)=>`<div style="font-size:12px;padding:4px 0;border-top:0.5px solid ${GFC.border}"><b>${k+1}.</b> ${esc(st.title||'')} ${st.timer?`<span style="color:${GFC.teal}">⏱ ${st.timer}p</span>`:''}<br><span style="color:${GFC.textSoft}">${esc(st.desc||'')}</span></div>`).join('');
  return `<details style="margin-top:6px"><summary style="cursor:pointer;font-size:13px;color:${GFC.tealDark};font-weight:600;padding:6px 4px;list-style:none">▸ ${esc(r.name)} ×${qty} — recept + folyamat</summary>
    <div style="padding:10px 12px;background:${GFC.cream};border-radius:10px;margin-top:4px">
      <div style="font-size:11px;color:${GFC.textSoft};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Összetevők (${qty} db-ra)</div>${ingHtml}
      ${steps?`<div style="font-size:11px;color:${GFC.textSoft};text-transform:uppercase;letter-spacing:0.5px;margin:10px 0 3px">Folyamat</div>${steps}`:''}
    </div></details>`;
}
function gfStartBake(bid){ _gf.bakingBatch=bid; _gf.stepIdx=0; renderGF3(); }
function gfStepPrev(){ if(_gf.stepIdx>0)_gf.stepIdx--; _gfStopTimer(); renderGF3(); }
function gfStepNext(){ _gf.stepIdx=(_gf.stepIdx||0)+1; _gfStopTimer(); renderGF3(); }
function gfBatchDone(bid){ if(!_gf.doneBatches)_gf.doneBatches={}; _gf.doneBatches[bid]=true; _gf.bakingBatch=null; _gfStopTimer(); renderGF3(); }
function _gfStopTimer(){ if(_gfTimer){clearInterval(_gfTimer);_gfTimer=null;} }
function gfStartTimer(min){ _gfStopTimer(); let sec=Math.round(min*60); const el=document.getElementById('gf-timer'); if(!el)return;
  const upd=()=>{ const m=Math.floor(sec/60), s=sec%60; el.textContent=`${m}:${String(s).padStart(2,'0')}`; if(sec<=0){_gfStopTimer(); el.textContent='Kész!'; try{el.style.color=GFC.gold;}catch(e){} return;} sec--; };
  upd(); _gfTimer=setInterval(upd,1000);
}

function renderGF3(){
  const host=document.getElementById('gf-phase'); if(!host) return;
  const big=_big();
  const batches=(_gf.batches||[]).filter(b=>b.items&&b.items.length);
  if(!batches.length){ host.innerHTML=`<div style="text-align:center;padding:30px;color:${GFC.textSoft}"><i class="ti ti-alert-circle" style="font-size:30px"></i><p>Még nincs batch. Menj vissza az <b>Előkészítés</b>hez, és oszd a termékeket sütőbe.</p><button onclick="gfGoPhase(2)" style="padding:10px 18px;background:${GFC.teal};color:#fff;border:none;border-radius:12px;cursor:pointer;font-family:'Kodchasan',sans-serif"><i class="ti ti-arrow-left"></i> Vissza az előkészítéshez</button></div>`; return; }

  // vezetett sütés egy batchre
  if(_gf.bakingBatch){
    const b=batches.find(x=>x.id===_gf.bakingBatch); const oven=(R.equipment||[]).find(e=>e.id===b.ovenId);
    const steps=_gf3Steps(b); const i=Math.min(_gf.stepIdx||0, steps.length);
    const prods=b.items.map(it=>{const p=_gf.products.find(x=>x.productId===it.productId); return esc(p?.name||'?')+' ×'+it.qty;}).join(' · ');
    if(i>=steps.length || steps.length===0){
      host.innerHTML=`<div style="background:#fff;border:2px solid ${GFC.teal};border-radius:16px;padding:20px;text-align:center">
        <i class="ti ti-circle-check" style="font-size:40px;color:${GFC.teal}"></i>
        <div style="font-family:'Fraunces',serif;font-size:18px;font-weight:600;color:${GFC.tealDark};margin:8px 0">${esc(oven?.name||'')} · batch kész?</div>
        <div style="font-size:13px;color:${GFC.textSoft};margin-bottom:16px">${prods}${steps.length===0?'<br><span style="color:'+GFC.gold+'">Nincsenek rögzített lépések a receptnél — jelöld késznek, ha kisült.</span>':''}</div>
        <button onclick="gfBatchDone(${b.id})" style="width:100%;padding:14px;background:${GFC.teal};color:#fff;border:none;border-radius:14px;font-family:'Kodchasan',sans-serif;font-size:16px;font-weight:700;cursor:pointer"><i class="ti ti-check" style="vertical-align:-3px"></i> Batch kész</button>
        <button onclick="_gf.bakingBatch=null;renderGF3()" style="margin-top:8px;border:none;background:none;color:${GFC.textSoft};cursor:pointer;font-family:'Kodchasan',sans-serif;font-size:13px">Mégse</button></div>`; return;
    }
    const st=steps[i];
    host.innerHTML=`<div style="background:#fff;border:2px solid ${GFC.teal};border-radius:16px;padding:${big?'18px':'14px'}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div><div style="font-family:'Fraunces',serif;font-size:16px;font-weight:600;color:${GFC.tealDark}">${esc(oven?.name||'')} · sütés</div><div style="font-size:12px;color:${GFC.textSoft}">${prods}</div></div>
        <div style="font-size:13px;color:${GFC.textSoft}">lépés ${i+1} / ${steps.length}</div></div>
      <div style="background:${GFC.tealPale};border-radius:14px;padding:${big?'18px':'14px'};text-align:center;margin-bottom:12px">
        ${steps.length>1&&st.recipe?`<div style="font-size:11px;color:${GFC.textSoft};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px">${esc(st.recipe)}</div>`:''}
        <div style="font-family:'Fraunces',serif;font-size:${big?'20px':'17px'};font-weight:600;color:${GFC.tealDark};margin-bottom:4px">${esc(st.title||'Lépés')}</div>
        <div style="font-size:${big?'16px':'14px'};color:${GFC.tealDark}">${esc(st.desc||'')}</div>
        ${st.timer?`<div id="gf-timer" style="font-family:'Fraunces',serif;font-size:${big?'44px':'34px'};font-weight:600;color:${GFC.teal};margin:12px 0">${st.timer}:00</div>
          <button onclick="gfStartTimer(${st.timer})" style="background:#fff;color:${GFC.tealDark};border:1.5px solid ${GFC.teal};border-radius:12px;padding:10px 18px;font-family:'Kodchasan',sans-serif;font-size:15px;font-weight:600;cursor:pointer"><i class="ti ti-clock" style="vertical-align:-2px"></i> Időzítő indítása (${st.timer} perc)</button>`:''}
      </div>
      <div style="display:flex;gap:4px;margin-bottom:14px">${steps.map((_,k)=>`<div style="flex:1;height:6px;border-radius:3px;background:${k<i?GFC.teal:(k===i?GFC.tealMid:GFC.border)}"></div>`).join('')}</div>
      <div style="display:flex;gap:10px">
        ${i>0?`<button onclick="gfStepPrev()" style="flex:0 0 auto;padding:${big?'14px 18px':'12px 16px'};background:#fff;color:${GFC.tealDark};border:1.5px solid ${GFC.border};border-radius:12px;cursor:pointer;font-family:'Kodchasan',sans-serif"><i class="ti ti-arrow-left"></i></button>`:''}
        <button onclick="gfStepNext()" style="flex:1;padding:${big?'14px':'12px'};background:${GFC.gold};color:${GFC.text};border:none;border-radius:12px;font-family:'Kodchasan',sans-serif;font-size:${big?'16px':'15px'};font-weight:700;cursor:pointer">${i+1===steps.length?'Utolsó lépés kész':'Kész, tovább'} <i class="ti ti-arrow-right" style="vertical-align:-3px"></i></button>
      </div></div>`; return;
  }

  // batch-lista (összegzés + sütés indítása)
  const cards=batches.map(b=>{ const oven=(R.equipment||[]).find(e=>e.id===b.ovenId); const done=_gf.doneBatches&&_gf.doneBatches[b.id];
    const prods=b.items.map(it=>{const p=_gf.products.find(x=>x.productId===it.productId); return `${esc(p?.name||'?')} <b>×${it.qty}</b>`;}).join(' · ');
    const bakeMin=Math.max(0,...b.items.map(it=>{const p=_gf.products.find(x=>x.productId===it.productId);const r=p?(R.recipes||[]).find(x=>x.id===p.recipeId):null;return Number(r?.bakeMin)||0;}));
    return `<div style="background:${done?GFC.bgSoft:'#fff'};border:1px solid ${done?GFC.border:GFC.teal};border-radius:16px;padding:14px;margin-bottom:10px;${done?'opacity:0.7':''}">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:46px;height:46px;border-radius:12px;background:${done?GFC.bgSoft:GFC.tealPale};display:flex;align-items:center;justify-content:center">${oven?.photo?`<img src="${oven.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:12px">`:`<i class="ti ti-${done?'check':'flame'}" style="font-size:24px;color:${done?GFC.tealMid:GFC.teal}"></i>`}</div>
        <div style="flex:1"><div style="font-family:'Fraunces',serif;font-size:15px;font-weight:600;color:${GFC.tealDark}">${esc(oven?.name||'?')}</div><div style="font-size:13px;color:${GFC.textSoft}">${prods}${bakeMin?` · ${bakeMin} perc`:''}</div></div>
        ${done?`<span style="background:${GFC.tealPale};color:${GFC.tealDark};padding:8px 14px;border-radius:10px;font-size:13px;font-weight:700">Kész</span>`
          :`<button onclick="gfStartBake(${b.id})" style="background:${GFC.teal};color:#fff;border:none;border-radius:12px;padding:${big?'13px 20px':'11px 16px'};font-family:'Kodchasan',sans-serif;font-size:${big?'15px':'14px'};font-weight:700;cursor:pointer"><i class="ti ti-player-play" style="vertical-align:-3px"></i> Sütés indítása</button>`}
      </div>
      <div style="margin-top:8px">${b.items.map(it=>_gf3RecipeCard(it.productId,it.qty)).join('')}</div></div>`;
  }).join('');
  const allDone=batches.every(b=>_gf.doneBatches&&_gf.doneBatches[b.id]);
  host.innerHTML=`<div style="font-size:13px;color:${GFC.textSoft};margin-bottom:10px">${batches.length} batch · ${_gfDayLabelFull(_gf.day)}</div>${cards}
    <div style="display:flex;gap:10px;margin-top:8px">
      <button onclick="gfGoPhase(2)" style="flex:0 0 auto;padding:${big?'16px 20px':'13px 18px'};background:#fff;color:${GFC.tealDark};border:1.5px solid ${GFC.border};border-radius:14px;cursor:pointer;font-family:'Kodchasan',sans-serif"><i class="ti ti-arrow-left"></i> Vissza</button>
      <button onclick="gfGoPhase(4)" ${allDone?'':'disabled'} style="flex:1;padding:${big?'16px':'13px'};background:${allDone?GFC.teal:GFC.border};color:#fff;border:none;border-radius:14px;font-family:'Kodchasan',sans-serif;font-size:${big?'16px':'15px'};font-weight:700;cursor:${allDone?'pointer':'not-allowed'}">${allDone?'Minden batch kész — tovább a lezáráshoz':'Süsd meg az összes batch-et'} <i class="ti ti-arrow-right" style="vertical-align:-3px"></i></button>
    </div>`;
}


// ---------- FÁZIS 4: Lezárás (teljesítés + allokálás + selejt + zárás) ----------
async function _gf4LoadOrders(){
  const [y,m0,dd]=_gf.day.split('-').map(Number); const m=m0-1;
  let orders=[], clients=[];
  try{ orders=await sb.query('orders',{filter:`year=eq.${y}&month=eq.${m}&day=eq.${dd}`,limit:5000})||[]; }catch(e){}
  try{ clients=await sb.query('clients',{select:'id,name',limit:2000})||[]; }catch(e){}
  const cname=id=>{const c=clients.find(x=>x.id===id);return c?c.name:'—';};
  const byProd={}; orders.forEach(o=>{ (byProd[o.product_id]=byProd[o.product_id]||[]).push({client:cname(o.client_id), qty:o.quantity}); });
  _gf.orderDetail=byProd; _gf.ordersLoaded=true;
}
function _gf4Baked(p){ // amit lesütöttünk: a batchekbe osztott mennyiség, vagy ha nincs batch, a total
  const placed=(_gf.batches||[]).reduce((n,b)=>n+b.items.filter(i=>i.productId===p.productId).reduce((m,i)=>m+i.qty,0),0);
  return placed>0?placed:_gfTotal(p);
}
function _gf4Alloc(pid){ if(!_gf.alloc)_gf.alloc={}; if(!_gf.alloc[pid])_gf.alloc[pid]={sale:0,internal:0,marketing:0,waste:0}; return _gf.alloc[pid]; }
function gfAllocChange(pid,key,delta){ const a=_gf4Alloc(pid); a[key]=Math.max(0,(a[key]||0)+delta); renderGF4(); }

async function renderGF4(){
  const host=document.getElementById('gf-phase'); if(!host) return;
  const big=_big();
  if(!_gf.ordersLoaded){ host.innerHTML=`<p style="color:${GFC.textSoft}">Betöltés…</p>`; await _gf4LoadOrders(); }

  const cards=_gf.products.map(p=>{
    const baked=_gf4Baked(p), ordered=p.ordered||0;
    const surplus=Math.max(0,baked-ordered);
    const a=_gf4Alloc(p.productId); const allocSum=(a.sale||0)+(a.internal||0)+(a.marketing||0)+(a.waste||0);
    const det=(_gf.orderDetail&&_gf.orderDetail[p.productId])||[];
    const custRows=det.length?det.map(d=>`<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0;color:${GFC.textSoft}"><span>${esc(d.client)}</span><span>${d.qty} db</span></div>`).join(''):`<div style="font-size:12px;color:${GFC.textSoft}">nincs vevői rendelés</div>`;
    const step=(key,lbl,icon,col)=>`<div style="display:flex;align-items:center;gap:10px;background:#fff;border-radius:10px;padding:${big?'9px 12px':'7px 10px'}">
      <i class="ti ${icon}" style="font-size:${big?'20px':'18px'};color:${col}"></i><span style="flex:1;font-size:${big?'14px':'13px'}">${lbl}</span>
      <button onclick="gfAllocChange(${p.productId},'${key}',-1)" style="width:${big?'34px':'28px'};height:${big?'34px':'28px'};border:1px solid ${GFC.border};border-radius:8px;background:#fff;cursor:pointer;font-size:16px">−</button>
      <span style="min-width:26px;text-align:center;font-weight:700;color:${key==='waste'?GFC.danger:GFC.tealDark}">${a[key]||0}</span>
      <button onclick="gfAllocChange(${p.productId},'${key}',1)" style="width:${big?'34px':'28px'};height:${big?'34px':'28px'};border:1px solid ${GFC.border};border-radius:8px;background:#fff;cursor:pointer;font-size:16px">+</button></div>`;
    const allocBox=surplus>0?`<div style="background:${GFC.bgSoft};border-radius:12px;padding:10px;margin-top:10px">
      <div style="font-size:12px;color:${GFC.textSoft};margin-bottom:8px">Felesleg: <b style="color:${GFC.tealDark}">${surplus} db</b> — oszd szét:</div>
      <div style="display:flex;flex-direction:column;gap:6px">${step('sale','Extra eladás','ti-shopping-cart',GFC.teal)}${step('internal','Belső fogyasztás','ti-home',GFC.tealMid)}${step('marketing','Marketing (kóstoló)','ti-gift',GFC.gold)}${step('waste','Selejt','ti-trash',GFC.danger)}</div>
      <div style="margin-top:8px;padding:7px 10px;border-radius:8px;background:${allocSum===surplus?GFC.tealPale:'#fdecea'};font-size:12px;color:${allocSum===surplus?GFC.tealDark:GFC.danger};display:flex;justify-content:space-between"><span>Szétosztva: <b>${allocSum} / ${surplus}</b></span><span>${allocSum===surplus?'<i class="ti ti-check" style="vertical-align:-2px"></i> kész':(allocSum<surplus?(surplus-allocSum)+' db még':'túl sok!')}</span></div>
    </div>`:'';
    return `<div style="background:${GFC.cream};border:1px solid ${GFC.border};border-radius:16px;padding:${big?'16px':'13px'};margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:baseline"><div style="font-family:'Fraunces',serif;font-size:${big?'17px':'15px'};font-weight:600;color:${GFC.tealDark}">${esc(p.name)}</div><div style="font-size:13px;color:${GFC.textSoft}">sütve: <b style="color:${GFC.tealDark}">${baked}</b> · rendelt: ${ordered}</div></div>
      <div style="margin:8px 0 4px"><div style="font-size:12px;color:${GFC.textSoft};margin-bottom:2px">Rendelésekhez (${Math.min(baked,ordered)} db):</div>${custRows}</div>
      ${allocBox}</div>`;
  }).join('') || `<p style="color:${GFC.textSoft}">Nincs termék.</p>`;

  // ellenőrzés: minden felesleg szét van-e osztva
  const allAllocated=_gf.products.every(p=>{ const s=Math.max(0,_gf4Baked(p)-(p.ordered||0)); const a=_gf4Alloc(p.productId); return ((a.sale||0)+(a.internal||0)+(a.marketing||0)+(a.waste||0))===s; });

  host.innerHTML=`
    <div style="font-size:13px;color:${GFC.textSoft};margin-bottom:10px">${_gfDayLabelFull(_gf.day)} · zárd le a napot</div>
    ${cards}
    <div id="gf4-closed"></div>
    <div style="display:flex;gap:10px;margin-top:8px">
      <button onclick="gfGoPhase(3)" style="flex:0 0 auto;padding:${big?'16px 20px':'13px 18px'};background:#fff;color:${GFC.tealDark};border:1.5px solid ${GFC.border};border-radius:14px;cursor:pointer;font-family:'Kodchasan',sans-serif"><i class="ti ti-arrow-left"></i> Vissza</button>
      <button onclick="gfCloseDay()" ${allAllocated?'':'disabled'} style="flex:1;padding:${big?'16px':'13px'};background:${allAllocated?GFC.gold:GFC.border};color:${GFC.text};border:none;border-radius:14px;font-family:'Kodchasan',sans-serif;font-size:${big?'16px':'15px'};font-weight:700;cursor:${allAllocated?'pointer':'not-allowed'}"><i class="ti ti-lock-check" style="vertical-align:-3px"></i> ${allAllocated?'Nap lezárása → napló + statisztika':'Oszd szét a felesleget mindenhol'}</button>
    </div>`;
}

async function gfCloseDay(){
  const btn=event&&event.target; if(btn)btn.disabled=true;
  const now=_gf.day; // a SÜTÉSI napra rögzítünk
  let ok=0, err=0;
  for(const p of _gf.products){
    const r=(R.recipes||[]).find(x=>x.id===p.recipeId); if(!r){continue;}
    const baked=_gf4Baked(p), ordered=p.ordered||0; const a=_gf4Alloc(p.productId);
    // batch-adat az elsődleges batchből (KPI-hoz)
    const b=(_gf.batches||[]).find(bb=>bb.items.some(i=>i.productId===p.productId));
    const oven_id=b?b.ovenId:null; const bake_minutes=Number(r.bakeMin)||null;
    // 'order' log — teljesítés
    if(ordered>0){ try{ await kData.insert('production_logs',{date:now,log_type:'order',recipe_id:r.id,pieces_planned:ordered,pieces_actual:Math.min(baked,ordered),oven_id,bake_minutes,total_cost:0,notes:'Gyártás flow'}); ok++; }catch(e){err++;} }
    // extra/allokálás logok
    for(const [key,val] of Object.entries({sale:a.sale,internal:a.internal,marketing:a.marketing,waste:a.waste})){
      if(val>0){ try{ await kData.insert('production_logs',{date:now,log_type:'extra',recipe_id:r.id,pieces_planned:val,pieces_actual:val,allocation:key,oven_id,bake_minutes,total_cost:0,notes:'Gyártás flow · '+key}); ok++; }catch(e){err++;} }
    }
  }
  _gf.doneBatches=_gf.doneBatches||{}; (_gf.batches||[]).forEach(b=>_gf.doneBatches[b.id]=true);
  const el=document.getElementById('gf4-closed');
  if(el) el.innerHTML=`<div style="background:${GFC.tealPale};border-radius:14px;padding:16px;margin:12px 0;text-align:center">
    <i class="ti ti-circle-check" style="font-size:34px;color:${GFC.teal}"></i>
    <div style="font-family:'Fraunces',serif;font-size:17px;font-weight:600;color:${GFC.tealDark};margin:6px 0">Nap lezárva ✓</div>
    <div style="font-size:13px;color:${GFC.textSoft}">${ok} tétel rögzítve a naplóba${err?` · ${err} hiba`:''}. A statisztikában (Elemzés → Sütési statisztika) megjelenik.</div></div>`;
  toast('Nap lezárva — '+ok+' tétel a naplóba.');
}

if(typeof window!=='undefined') Object.assign(window,{renderGyartasFlow,gfSetDay,gfSetView,gfGoPhase,gfMonthNav,gfSetMonth,gfChangeExtra,gfSetExtra,gfAddProduct,gfRemoveProduct,gfAddBatch,gfSetActiveBatch,gfRemoveBatch,gfAssignToBatch,gfBatchQty,gfGf2Tab,gfStartBake,gfStepPrev,gfStepNext,gfBatchDone,gfStartTimer,gfAllocChange,gfCloseDay,_gf});
