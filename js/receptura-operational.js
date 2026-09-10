// ===== OPERATIONAL VIEW =====
function renderOpSelect() {
  const box = document.getElementById('op-recipe-list');
  let html = '';
  // v2.53.121: az Előkészítésben képzett BATCHEK a tetején — innen indul a vezetett végrehajtás
  const batches = (typeof _batchPlan!=='undefined' && _batchPlan.batches) ? _batchPlan.batches.filter(b=>b.items.length) : [];
  if (batches.length) {
    html += `<div style="grid-column:1/-1"><h3 style="font-family:'Fraunces',serif;color:var(--teal-dark);margin:0 0 4px">🔥 Mai batchek (az előkészítésből)</h3><p style="font-size:0.78rem;color:var(--text-soft);margin:0 0 12px">Koppints egy receptre a batchen belül → vezetett sütés (kiadagolás + lépések + időzítő).</p></div>`;
    batches.forEach(b=>{
      const oven=(R.equipment||[]).find(e=>e.id===b.ovenId);
      const recipesHtml = b.items.map(it=>{ const r=(R.recipes||[]).find(x=>x.id===it.recipeId);
        return `<button onclick="openOpDetailForBatch(${it.recipeId},${it.qty})" style="display:block;width:100%;text-align:left;padding:8px 12px;margin:4px 0;border:1px solid var(--border);border-radius:8px;background:#fff;cursor:pointer;font-family:'Kodchasan',sans-serif"><b>${esc(r?.name||'?')}</b> <span style="color:var(--text-soft)">×${it.qty} db</span> <span style="float:right;color:var(--teal-dark)">▶ sütés</span></button>`;
      }).join('');
      html += `<div class="recipe-card" style="grid-column:1/-1;cursor:default;border:1.5px solid var(--teal)">
        <div class="recipe-card-body">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><i class="ti"></i><b style="color:var(--teal-dark)">🔥 ${esc(oven?.name||'?')} · batch #${b.id}</b></div>
          ${recipesHtml}
        </div></div>`;
    });
    html += `<div style="grid-column:1/-1;border-top:1px dashed var(--border);margin:16px 0 8px;padding-top:12px"><h3 style="font-family:'Fraunces',serif;color:var(--text-soft);margin:0;font-size:1rem">Vagy bármely recept (ad-hoc)</h3></div>`;
  }
  html += R.recipes.map(r=>`
    <div class="recipe-card" onclick="openOpDetail(${r.id})">
      <div class="recipe-card-img">🍞</div>
      <div class="recipe-card-body">
        <div class="recipe-card-name">${r.name}</div>
        <div class="recipe-card-meta"><span class="badge badge-teal">${r.category}</span></div>
        <div style="margin-top:8px"><button class="btn btn-gold btn-sm">👨‍🍳 Elkezdés</button></div>
      </div>
    </div>`).join('');
  box.innerHTML = html;
}
function openOpDetailForBatch(recipeId, qty){
  openOpDetail(recipeId);
  // a batch mennyiségét állítsuk be a vezetett nézet skálázásához
  setTimeout(()=>{ const el=document.getElementById('op-scale-pieces'); if(el){ el.value=qty; if(typeof renderOpDetail==='function') renderOpDetail(); } }, 60);
}
if(typeof window!=='undefined') window.openOpDetailForBatch=openOpDetailForBatch;

let currentOpRecipeId = null;
function openOpDetail(id) {
  currentOpRecipeId = id;
  document.getElementById('op-scale-pieces').value = 10;
  nav('op-detail');
  renderOpDetail();
}
function openOpView() { openOpDetail(currentRecipeId); }

function renderOpDetail() {
  const r = R.recipes.find(r=>r.id===currentOpRecipeId);
  if (!r) return;
  const pieces = parseInt(document.getElementById('op-scale-pieces').value)||10;
  document.getElementById('op-title').textContent = r.name;

  const rawWeight = calcRawWeight(r, pieces);
  const levainNeeded = Math.round(r.levainAmount * rawWeight / r.basePortion);
  document.getElementById('op-raw-weight').textContent = rawWeight.toLocaleString();
  document.getElementById('op-levain-needed').textContent = levainNeeded;

  // Recept leírás dropdown (új kollégának) – csak ha van leírás
  const descWrap = document.getElementById('op-recipe-desc-wrap');
  const descEl = document.getElementById('op-recipe-desc');
  if (descWrap && descEl) {
    if (r.desc && r.desc.trim()) { descEl.textContent = r.desc; descWrap.style.display = 'block'; }
    else { descWrap.style.display = 'none'; }
  }

  renderLevainBox('op-levain-box', levainNeeded, r.levainAmount);

  // Ingredients list
  const scale = calcScaleFactor(r, pieces); // no bake_loss
  const SUB_CFG = [
    {key:'flour',   label:'🌾 Száraz (liszt/korpa)', cls:'dry'},
    {key:'other_dry',label:'🧂 Egyéb száraz',        cls:'dry'},
    {key:'wet',     label:'💧 Nedves',               cls:'wet'},
    {key:'starter', label:'🧫 Kovász',               cls:'levain'},
  ];
  // Group by sub_type - use allIngredients if available
  const allIng = r.allIngredients && r.allIngredients.length > 0
    ? r.allIngredients
    : [...(r.dryIngredients||[]), ...(r.otherDryIngredients||[]),
       ...(r.wetIngredients||[]), ...(r.starterIngredients||[])];
  const grouped = {};
  allIng.forEach(ing => {
    const st = ing.subType || 'other_dry';
    if (!grouped[st]) grouped[st] = [];
    grouped[st].push(ing);
  });
  let html = '';
  SUB_CFG.forEach(({key, label, cls}) => {
    if (!grouped[key] || grouped[key].length === 0) return;
    html += `<div class="ing-section" style="margin-top:12px">
      <div class="ing-section-head ${cls}">${label}</div>`;
    // Dedup by ingredient_id
    const dedupOp = {};
    grouped[key].forEach(ing => {
      const k = ing.ingredientId ? 'id:'+ing.ingredientId : 'name:'+ing.name;
      const masterIng = ing.ingredientId ? R.ingredients?.find(i=>i.id===ing.ingredientId) : null;
      const displayName = masterIng?.name || ing.name;
      const scaled = Math.round(ing.amount * scale * 10) / 10;
      if (dedupOp[k]) dedupOp[k].scaled += scaled;
      else dedupOp[k] = { displayName, scaled };
    });
    Object.values(dedupOp).forEach(item => {
      html += `<label class="op-ing-item" style="cursor:pointer;display:flex;align-items:center;gap:8px"><input type="checkbox" style="width:20px;height:20px;accent-color:var(--teal);flex:0 0 auto" onchange="this.closest('.op-ing-item').style.opacity=this.checked?'0.45':'1';this.closest('.op-ing-item').style.textDecoration=this.checked?'line-through':'none'"><span style="flex:1">${item.displayName}</span><span class="op-ing-amount">${item.scaled} g</span></label>`;
    });
    html += '</div>';
  });
  document.getElementById('op-ingredients').innerHTML = html;

  // Steps
  document.getElementById('op-steps').innerHTML = (r.steps||[]).map((s,i)=>`
    <div class="op-step">
      <div class="op-step-head" onclick="toggleOpStep(this)">
        <div class="op-step-num" id="opstep-num-${i}">${i+1}</div>
        <div class="op-step-title">${s.title}</div>
        ${s.timer?`<div class="op-step-timer">⏱ ${s.timer} perc</div>`:''}
        <span style="color:var(--text-soft);margin-left:8px">▾</span>
      </div>
      <div class="op-step-body ${i===0?'open':''}">
        <div class="op-step-desc">${s.desc}</div>
        ${s.timer?`<button class="btn btn-gold btn-sm" onclick="startTimer(${s.timer},'${s.title}',${i})">▶ Időzítő indítása</button>`:''}
        <br><br>
        <button class="btn btn-primary btn-sm" onclick="markStepDone(${i},${(r.steps||[]).length})">✓ Kész</button>
      </div>
    </div>`).join('');
}

function changeOpScale(delta) {
  const input = document.getElementById('op-scale-pieces');
  input.value = Math.max(1, (parseInt(input.value)||10) + delta);
  renderOpDetail();
}

function toggleOpStep(el) { el.nextElementSibling.classList.toggle('open'); }

function markStepDone(idx, total) {
  const num = document.getElementById('opstep-num-'+idx);
  if (num) { num.textContent = '✓'; num.classList.add('done'); }
  if (idx < total-1) {
    const nextStep = document.querySelectorAll('.op-step')[idx+1];
    if (nextStep) nextStep.querySelector('.op-step-body').classList.add('open');
  } else { toast('🎉 Minden lépés kész!'); }
}

let timerInterval = null;
function startTimer(minutes, title, stepIdx) {
  if (timerInterval) { clearInterval(timerInterval); }
  let secs = minutes * 60;
  const btn = event.target;
  timerInterval = setInterval(()=>{
    secs--;
    const m = Math.floor(secs/60), s = secs%60;
    btn.textContent = `⏱ ${title}: ${m}:${String(s).padStart(2,'0')}`;
    if (secs <= 0) {
      clearInterval(timerInterval);
      btn.textContent = '✅ Időzítő lejárt!';
      toast('⏰ '+title+' kész!');
    }
  }, 1000);
  btn.textContent = `⏱ ${minutes}:00`;
}
