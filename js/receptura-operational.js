// ===== OPERATIONAL VIEW =====
function renderOpSelect() {
  document.getElementById('op-recipe-list').innerHTML = R.recipes.map(r=>`
    <div class="recipe-card" onclick="openOpDetail(${r.id})">
      <div class="recipe-card-img">🍞</div>
      <div class="recipe-card-body">
        <div class="recipe-card-name">${r.name}</div>
        <div class="recipe-card-meta"><span class="badge badge-teal">${r.category}</span></div>
        <div style="margin-top:8px"><button class="btn btn-gold btn-sm">👨‍🍳 Elkezdés</button></div>
      </div>
    </div>`).join('');
}

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
    grouped[key].forEach(ing => {
      const masterIng = ing.ingredientId ? R.ingredients?.find(i=>i.id===ing.ingredientId) : null;
      const displayName = masterIng?.name || ing.name;
      const scaled = Math.round(ing.amount * scale * 10) / 10;
      html += `<div class="op-ing-item"><span>${displayName}</span><span class="op-ing-amount">${scaled} g</span></div>`;
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
