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
    return `<button onclick="gfSetDay('${ds}')" style="display:inline-flex;flex-direction:column;align-items:center;gap:1px;padding:8px 14px;border:1.5px solid ${on?GFC.teal:GFC.border};border-radius:14px;cursor:pointer;background:${on?GFC.teal:'#fff'};color:${on?'#fff':GFC.tealDark};font-family:'Kodchasan',sans-serif;min-width:52px">
      <span style="font-size:11px;opacity:0.8">${GF_D[dow]}</span><span style="font-size:17px;font-weight:700">${d}</span></button>`;
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

function renderGFPhase(){ if(_gf.phase===1) renderGF1(); else document.getElementById('gf-phase').innerHTML=
  `<div style="text-align:center;padding:40px;color:${GFC.textSoft}"><i class="ti ti-tools" style="font-size:32px"></i><p>A ${_gf.phase}. fázis épül — hamarosan.</p></div>`; }

function gfMonthNav(delta){ let m=_gf.month.month+delta, y=_gf.month.year; if(m<0){m=11;y--;} if(m>11){m=0;y++;} _gf.month={year:y,month:m}; renderGyartasFlow(); }
function gfSetMonth(y,m){ _gf.month={year:y,month:m}; renderGyartasFlow(); }
function gfSetDay(v){ _gf.day=v; _gf.loaded=false; renderGyartasFlow(); }
function gfSetView(v){ _gf.view=v; renderGyartasFlow(); }
function gfGoPhase(n){ if(n>1 && !_gfCanBake()){ toast('Van recept nélküli termék a listában — előbb rendezd, mielőtt sütnél.',true); return; } _gf.phase=n; renderGyartasFlow(); }
function gfChangeExtra(pid,delta){ const p=_gf.products.find(x=>x.productId===pid); if(p){ p.extra=Math.max(-(p.ordered),(p.extra||0)+delta); renderGF1(); } }
function gfSetExtra(pid,val){ const p=_gf.products.find(x=>x.productId===pid); if(p){ p.extra=Math.max(-(p.ordered),parseInt(val)||0); renderGF1(); } }
function gfRemoveProduct(pid){ _gf.products=_gf.products.filter(x=>x.productId!==pid); renderGF1(); }
function _gfCanBake(){ return _gf.products.length>0 && _gf.products.every(p=>p.hasRecipe) && _gf.products.some(p=>_gfTotal(p)>0); }

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

  const blocked = !_gfCanBake();
  const blockMsg = (_gf.products.some(p=>!p.hasRecipe)) ? `<div style="background:#fdecea;border:1px solid ${GFC.danger};border-radius:10px;padding:10px 12px;margin-bottom:12px;font-size:13px;color:${GFC.danger}"><i class="ti ti-alert-circle" style="vertical-align:-2px"></i> Van recept nélküli termék (piros keret). Amíg nincs kész receptje, nem lehet továbblépni a sütéshez.</div>` : '';

  host.innerHTML=`
    <div style="display:flex;flex-direction:column;gap:${big?'10px':'8px'};margin-bottom:14px">${rows}</div>
    ${pickerList}
    ${stockCard}
    ${blockMsg}
    <button onclick="gfGoPhase(2)" ${blocked?'disabled':''} style="width:100%;padding:${big?'16px':'13px'};background:${blocked?GFC.border:GFC.teal};color:#fff;border:none;border-radius:14px;font-family:'Kodchasan',sans-serif;font-size:${big?'16px':'15px'};font-weight:700;cursor:${blocked?'not-allowed':'pointer'}">Kész — tovább az előkészítéshez <i class="ti ti-arrow-right" style="vertical-align:-3px"></i></button>`;
}

function gfAddProduct(pid){ const p=_gfMakeProd(pid,0,1); _gf.products.push(p); _gf.pickerOpen=false; _gf.pickerSearch=''; renderGF1(); }

if(typeof window!=='undefined') Object.assign(window,{renderGyartasFlow,gfSetDay,gfSetView,gfGoPhase,gfMonthNav,gfSetMonth,gfChangeExtra,gfSetExtra,gfAddProduct,gfRemoveProduct,_gf});
