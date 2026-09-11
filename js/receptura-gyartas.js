// ===== receptura-gyartas.js — KEREK gyártási FLOW (4 fázis) v2.53.125 =====
// 1) Mit sütök ma?  2) Előkészítés (levain+batch+kiadagolás)  3) Sütés  4) Lezárás
// Üzemi (nagy elemek) / PC nézet váltóval. KEREK-arculat.

let _gf = { day:null, phase:1, view:'uzemi', products:[], loaded:false };

// --- KEREK tokenek (a modul saját, hogy egységes legyen) ---
const GFC = { teal:'#129990', tealDark:'#064C48', tealMid:'#43AAA0', tealPale:'#E0F2EF',
  gold:'#EFB036', goldDark:'#B78029', cream:'#FAF7F0', bgSoft:'#EFF5F3', border:'#C8DDD9',
  text:'#1A2E31', textSoft:'#5A7A80', danger:'#C0574E' };
const _big = () => _gf.view==='uzemi';

function _gfBakingDays(count=12){
  const out=[]; const base=new Date();
  for(let i=0;i<80 && out.length<count;i++){ const dt=new Date(base); dt.setDate(base.getDate()-i);
    if(typeof _isBakingDayR==='function' ? _isBakingDayR(dt) : [2,5].includes(dt.getDay()))
      out.push(`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`);
  } return out;
}
function _gfDayLabel(ds){ const [y,m,d]=ds.split('-').map(Number); const dt=new Date(y,m-1,d);
  const D=['vasárnap','hétfő','kedd','szerda','csütörtök','péntek','szombat'], M=['jan','feb','márc','ápr','máj','jún','júl','aug','szept','okt','nov','dec'];
  return `${D[dt.getDay()]}, ${M[m-1]} ${d}.`; }

// a nap rendelt termékei (család-variánssal együtt), szerkeszthető mennyiséggel
async function _gfLoadDayProducts(dayStr){
  const [y,m0,dd]=dayStr.split('-').map(Number); const m=m0-1;
  let orders=[]; try{ orders=await sb.query('orders',{filter:`year=eq.${y}&month=eq.${m}&day=eq.${dd}`,limit:5000})||[]; }catch(e){}
  const byProd={}; orders.forEach(o=>{ byProd[o.product_id]=(byProd[o.product_id]||0)+o.quantity; });
  const cache=(typeof _adminProductsCache!=='undefined'?_adminProductsCache:[]);
  const list=[];
  Object.entries(byProd).forEach(([pid,qty])=>{ pid=+pid; const p=cache.find(x=>x.id===pid);
    // recept: közvetlen vagy család
    let recipe=(R.recipes||[]).find(r=>!r.archived && r.product_id===pid);
    if(!recipe && p){ const head=p.product_family_id||p.id; const fam=cache.filter(x=>(x.product_family_id||x.id)===head).map(x=>x.id);
      recipe=(R.recipes||[]).find(r=>!r.archived && fam.includes(r.product_id)); }
    list.push({ productId:pid, name:(p?.name)||('#'+pid), weight:p?.weight, ordered:qty, qty:qty, recipeId:recipe?.id||null });
  });
  list.sort((a,b)=>(a.name||'').localeCompare(b.name||'','hu'));
  _gf.products=list; _gf.loaded=true;
}

// alapanyag-ellenőrzés a nap termékeire (recept × qty → needs vs készlet)
function _gfStockCheck(){
  const needs={};
  _gf.products.forEach(pr=>{ const r=(R.recipes||[]).find(x=>x.id===pr.recipeId); if(!r||!pr.qty) return;
    const scale=(typeof calcScaleFactor==='function')?calcScaleFactor(r,pr.qty):pr.qty;
    const all=[...(r.dryIngredients||[]),...(r.otherDryIngredients||[]),...(r.wetIngredients||[]),...(r.starterIngredients||[])];
    all.forEach(ing=>{ if(!ing.ingredientId)return; needs[ing.ingredientId]=(needs[ing.ingredientId]||0)+(ing.amount||0)*scale; });
  });
  const rows=[];
  Object.entries(needs).forEach(([id,need])=>{ const ing=(typeof getIng==='function')?getIng(+id):null; if(!ing)return;
    const stock=ing.totalStockG||0; rows.push({name:ing.name, need, stock, ok:stock>=need-0.01, short:Math.max(0,need-stock), unit:ing.unit||'g'}); });
  rows.sort((a,b)=>(a.ok===b.ok)?a.name.localeCompare(b.name,'hu'):(a.ok?1:-1));
  return rows;
}

// ---------- SHELL ----------
function renderGyartasFlow(){
  const box=document.getElementById('gyartas-flow'); if(!box) return;
  if(!_gf.day){ _gf.day=_gfBakingDays(1)[0]||null; }
  const days=_gfBakingDays(12);
  const phases=[['Mit sütök ma?','ti-clipboard-list'],['Előkészítés','ti-layout-grid-add'],['Sütés','ti-tools-kitchen-2'],['Lezárás','ti-checkbox']];
  const stepper=phases.map((p,i)=>{ const n=i+1, on=n===_gf.phase, done=n<_gf.phase;
    const bg=done?GFC.teal:(on?GFC.tealDark:'#fff'), col=(done||on)?'#fff':GFC.textSoft, bd=(done||on)?'none':`1.5px solid ${GFC.border}`;
    const inner=done?'<i class="ti ti-check" style="font-size:18px"></i>':n;
    return `<div onclick="gfGoPhase(${n})" style="display:flex;flex-direction:column;align-items:center;flex:1;cursor:pointer;min-width:52px">
      <div style="width:38px;height:38px;border-radius:50%;background:${bg};color:${col};border:${bd};display:flex;align-items:center;justify-content:center;font-weight:700;${on?'box-shadow:0 0 0 4px '+GFC.tealPale:''}">${inner}</div>
      <div style="font-size:11px;margin-top:5px;text-align:center;color:${on?GFC.tealDark:GFC.textSoft};font-weight:${on?'700':'400'}">${p[0]}</div></div>`;
  }).join(`<div style="flex:0 0 14px;height:2px;background:${GFC.border};margin-top:18px"></div>`);

  box.innerHTML=`
    <div style="font-family:'Kodchasan',sans-serif;color:${GFC.text}">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:10px">
          <i class="ti ti-flame" style="font-size:22px;color:${GFC.teal}"></i>
          <select onchange="gfSetDay(this.value)" style="padding:8px 12px;border:1.5px solid ${GFC.border};border-radius:10px;font-family:'Kodchasan',sans-serif;font-size:15px;color:${GFC.tealDark};background:#fff">
            ${days.map(d=>`<option value="${d}"${d===_gf.day?' selected':''}>${_gfDayLabel(d)}</option>`).join('')}
          </select>
        </div>
        <div style="display:inline-flex;background:${GFC.bgSoft};border-radius:10px;padding:3px;gap:2px">
          <button onclick="gfSetView('uzemi')" style="border:none;border-radius:8px;padding:7px 14px;font-family:'Kodchasan',sans-serif;font-size:13px;cursor:pointer;background:${_gf.view==='uzemi'?GFC.teal:'transparent'};color:${_gf.view==='uzemi'?'#fff':GFC.textSoft}">Üzemi</button>
          <button onclick="gfSetView('pc')" style="border:none;border-radius:8px;padding:7px 14px;font-family:'Kodchasan',sans-serif;font-size:13px;cursor:pointer;background:${_gf.view==='pc'?GFC.teal:'transparent'};color:${_gf.view==='pc'?'#fff':GFC.textSoft}">PC</button>
        </div>
      </div>
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:18px">${stepper}</div>
      <div id="gf-phase"></div>
    </div>`;
  renderGFPhase();
}
function renderGFPhase(){ if(_gf.phase===1) renderGF1(); else document.getElementById('gf-phase').innerHTML=
  `<div style="text-align:center;padding:40px;color:${GFC.textSoft}"><i class="ti ti-tools" style="font-size:32px"></i><p>A ${_gf.phase}. fázis épül — hamarosan.</p></div>`; }

function gfSetDay(v){ _gf.day=v; _gf.loaded=false; renderGFPhase(); }
function gfSetView(v){ _gf.view=v; renderGyartasFlow(); }
function gfGoPhase(n){ _gf.phase=n; renderGyartasFlow(); }
function gfChangeQty(pid,delta){ const p=_gf.products.find(x=>x.productId===pid); if(p){ p.qty=Math.max(0,p.qty+delta); renderGF1(); } }
function gfSetQty(pid,val){ const p=_gf.products.find(x=>x.productId===pid); if(p){ p.qty=Math.max(0,parseInt(val)||0); renderGF1(); } }

// ---------- FÁZIS 1: Mit sütök ma? ----------
async function renderGF1(){
  const host=document.getElementById('gf-phase'); if(!host) return;
  if(!_gf.loaded){ host.innerHTML=`<p style="color:${GFC.textSoft}">Betöltés…</p>`; await _gfLoadDayProducts(_gf.day); }
  const big=_big();
  const btnSz = big?'52px':'38px', qSz=big?'22px':'17px';
  const rows=_gf.products.length ? _gf.products.map(p=>{
    const noRecipe=!p.recipeId;
    return `<div style="background:#fff;border:1px solid ${GFC.border};border-radius:14px;padding:${big?'14px 16px':'10px 14px'};display:flex;align-items:center;gap:14px">
      <div style="flex:1;min-width:120px"><div style="font-size:${big?'16px':'15px'};font-weight:600;color:${GFC.tealDark}">${esc(p.name)}${noRecipe?` <span title="Nincs recept" style="color:${GFC.danger}">⚠️</span>`:''}</div>
        <div style="font-size:12px;color:${GFC.textSoft}">rendelt: ${p.ordered}${p.weight?' · '+esc(p.weight):''}</div></div>
      <div style="display:flex;align-items:center;gap:${big?'10px':'6px'}">
        <button onclick="gfChangeQty(${p.productId},-1)" style="width:${btnSz};height:${btnSz};padding:0;font-size:${qSz};border:1px solid ${GFC.border};border-radius:12px;background:#fff;cursor:pointer">−</button>
        <input type="number" min="0" value="${p.qty}" onchange="gfSetQty(${p.productId},this.value)" style="width:${big?'56px':'46px'};height:${btnSz};text-align:center;font-size:${qSz};font-weight:600;border:1px solid ${GFC.border};border-radius:10px;font-family:'Kodchasan',sans-serif;color:${GFC.tealDark}">
        <button onclick="gfChangeQty(${p.productId},1)" style="width:${btnSz};height:${btnSz};padding:0;font-size:${qSz};border:1px solid ${GFC.border};border-radius:12px;background:#fff;cursor:pointer">+</button>
      </div></div>`;
  }).join('') : `<p style="color:${GFC.textSoft};padding:8px 0">Erre a napra nincs rendelés. Adj hozzá plusz terméket, vagy válassz másik napot.</p>`;

  // készlet-ellenőrzés
  const sc=_gfStockCheck(); const short=sc.filter(x=>!x.ok);
  const fmt=(g,u)=>(typeof fmtQtyUnit==='function')?fmtQtyUnit(g,u):(Math.round(g)+' g');
  const stockCard = sc.length ? `<div style="background:#fff;border:1px solid ${GFC.border};border-radius:14px;padding:14px 16px;margin-bottom:18px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><i class="ti ti-${short.length?'alert-triangle':'circle-check'}" style="font-size:20px;color:${short.length?GFC.gold:GFC.teal}"></i>
      <span style="font-size:15px;font-weight:600">Készlet-ellenőrzés — ${short.length?short.length+' alapanyag kevés':'minden alapanyag elég'}</span></div>
    ${short.slice(0,8).map(x=>`<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:0.5px solid ${GFC.border};font-size:14px"><span>${esc(x.name)}</span><span style="color:${GFC.danger};font-weight:600">hiányzik ${fmt(x.short,x.unit)}</span></div>`).join('')}
    ${short.length===0?`<div style="font-size:13px;color:${GFC.textSoft}">A kiválasztott mennyiségekhez van elég készlet.</div>`:''}</div>` : '';

  host.innerHTML=`
    <div style="display:flex;flex-direction:column;gap:${big?'10px':'8px'};margin-bottom:14px">${rows}</div>
    <button onclick="gfAddProduct()" style="width:100%;padding:${big?'14px':'11px'};border:1.5px dashed ${GFC.teal};background:${GFC.tealPale};color:${GFC.tealDark};border-radius:12px;font-family:'Kodchasan',sans-serif;font-size:${big?'15px':'14px'};cursor:pointer;margin-bottom:18px"><i class="ti ti-plus" style="vertical-align:-3px"></i> Plusz termék hozzáadása</button>
    ${stockCard}
    <button onclick="gfGoPhase(2)" style="width:100%;padding:${big?'16px':'13px'};background:${GFC.teal};color:#fff;border:none;border-radius:14px;font-family:'Kodchasan',sans-serif;font-size:${big?'16px':'15px'};font-weight:700;cursor:pointer">Kész — tovább az előkészítéshez <i class="ti ti-arrow-right" style="vertical-align:-3px"></i></button>`;
}

// plusz termék: keresős választó (nem 100 kártya)
function gfAddProduct(){
  const cache=(typeof _adminProductsCache!=='undefined'?_adminProductsCache:[]).filter(p=>!p.deleted_at);
  const already=new Set(_gf.products.map(p=>p.productId));
  const opts=cache.filter(p=>!already.has(p.id));
  const name=prompt('Plusz termék neve (kezdd el gépelni):\n'+opts.slice(0,40).map(p=>'• '+p.name).join('\n'));
  if(!name) return;
  const p=opts.find(x=>x.name.toLowerCase().includes(name.toLowerCase()));
  if(!p){ toast('Nincs ilyen termék.',true); return; }
  let recipe=(R.recipes||[]).find(r=>!r.archived && r.product_id===p.id);
  if(!recipe){ const head=p.product_family_id||p.id; const fam=cache.filter(x=>(x.product_family_id||x.id)===head).map(x=>x.id); recipe=(R.recipes||[]).find(r=>!r.archived && fam.includes(r.product_id)); }
  _gf.products.push({productId:p.id, name:p.name, weight:p.weight, ordered:0, qty:1, recipeId:recipe?.id||null});
  renderGF1();
}

if(typeof window!=='undefined') Object.assign(window,{renderGyartasFlow,gfSetDay,gfSetView,gfGoPhase,gfChangeQty,gfSetQty,gfAddProduct});
