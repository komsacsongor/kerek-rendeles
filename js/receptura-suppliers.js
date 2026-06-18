// =============================================================
// KEREK Receptúra — Beszállítók CRUD (v2.40.0)
// =============================================================
// Romániai Codul fiscal alapján számlázási mezők
// Multi-currency: lej | EUR | HUF | USD
// 3 tab modal: Alapadatok / Számlázás / Pénzügy
// Benchmark a kártyán: 3 metrika azonos súllyal
// =============================================================

let editingSupplierId = null;

// =============================================================
// HELPERS
// =============================================================

function fmtMoney(amount, currency) {
  if (!amount || amount === 0) return '—';
  const c = currency || 'lej';
  return `${Number(amount).toLocaleString('hu', { maximumFractionDigits: 2 })} ${c}`;
}

function getSupplierById(id) {
  return (R.suppliers || []).find(s => s.id === id) || null;
}

// Benchmark számítások (NEM DB-mezők — számolt)

// Hány alapanyag preferált beszállítója
function countPreferredIngredients(supplierId) {
  return R.ingredients.filter(i => i.preferredSupplierId === supplierId).length;
}

// Utolsó 6 hónap beszerzési értéke (lej)
function calcLast6MonthsValue(supplierId) {
  const supplier = getSupplierById(supplierId);
  if (!supplier) return 0;
  const supplierName = supplier.name;
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  let total = 0;
  (R.batches || []).forEach(b => {
    if (b.supplierName !== supplierName) return;
    const d = new Date(b.receivedDate);
    if (d < sixMonthsAgo) return;
    // Bruttó érték: ha van priceGrossPerUnit + packageSize, abból csomag-alapon;
    // egyébként price_per_g * qty_received_g
    if (b.priceGrossPerUnit > 0 && b.packageSizeG > 0) {
      const pkgs = b.qtyReceivedG / b.packageSizeG;
      total += b.priceGrossPerUnit * pkgs;
    } else if (b.pricePerG > 0) {
      total += b.pricePerG * b.qtyReceivedG;
    }
  });
  return total;
}

// Átlagos lej/kg az ő alapanyagaira (a batches alapján)
function calcAvgPricePerKg(supplierId) {
  const supplier = getSupplierById(supplierId);
  if (!supplier) return 0;
  const supplierName = supplier.name;
  const prices = [];
  (R.batches || []).forEach(b => {
    if (b.supplierName !== supplierName) return;
    if (b.pricePerG > 0) prices.push(b.pricePerG * 1000); // lej/kg
  });
  if (prices.length === 0) return 0;
  return prices.reduce((a, b) => a + b, 0) / prices.length;
}

// =============================================================
// RENDER
// =============================================================

function renderSuppliers() {
  const el = document.getElementById('view-suppliers-content');
  if (!el) return;

  const list = R.suppliers || [];
  if (list.length === 0) {
    el.innerHTML = `
      <div style="text-align:center;padding:48px 20px;background:white;border-radius:12px;border:1px solid var(--border);color:var(--text-soft)">
        <div style="font-size:3rem;margin-bottom:10px">👥</div>
        <div style="font-size:1.1rem;font-weight:600;color:var(--teal-dark);margin-bottom:6px">Még nincs beszállító</div>
        <div style="font-size:0.85rem;margin-bottom:16px">Adj hozzá egy új beszállítót — minden adat (cég, IBAN, fizetési feltételek) számláláshoz használható.</div>
        <button class="btn btn-primary" data-action="openSupplierModal">➕ Új beszállító</button>
      </div>
    `;
    return;
  }

  // Header gombsor
  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div style="font-size:0.8rem;color:var(--text-soft)">${list.length} beszállító · ${list.filter(s => s.active).length} aktív</div>
      <button class="btn btn-primary" data-action="openSupplierModal">➕ Új beszállító</button>
    </div>
  `;

  // Kártyák
  list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'hu')).forEach(s => {
    const prefCount = countPreferredIngredients(s.id);
    const last6 = calcLast6MonthsValue(s.id);
    const avgKg = calcAvgPricePerKg(s.id);
    const inactiveStyle = s.active ? '' : 'opacity:0.5';
    const currency = s.currency || 'lej';

    html += `
      <div style="background:white;border:1px solid var(--border);border-radius:12px;margin-bottom:14px;overflow:hidden;${inactiveStyle}">
        <!-- Header -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;padding:14px 18px;background:var(--cream);border-bottom:1px solid var(--border)">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <div style="font-family:'Fraunces',serif;font-weight:700;color:var(--teal-dark);font-size:1.05rem">${esc(s.name)}</div>
              ${!s.active ? '<span style="font-size:0.7rem;background:#e5e7eb;color:#6b7280;padding:2px 8px;border-radius:10px">Inaktív</span>' : ''}
              ${s.isVatPayer ? '<span style="font-size:0.7rem;background:var(--teal-pale);color:var(--teal-dark);padding:2px 8px;border-radius:10px">TVA-fizető</span>' : ''}
            </div>
            <div style="font-size:0.75rem;color:var(--text-soft);margin-top:3px">
              ${s.contactPerson ? esc(s.contactPerson) + ' · ' : ''}
              ${s.email ? `<a href="mailto:${esc(s.email)}" style="color:var(--teal);text-decoration:none">${esc(s.email)}</a>` : ''}
              ${s.email && s.phone ? ' · ' : ''}
              ${s.phone ? `<a href="tel:${esc(s.phone)}" style="color:var(--teal);text-decoration:none">${esc(s.phone)}</a>` : ''}
            </div>
            ${s.cui || s.regCom ? `<div style="font-size:0.7rem;color:var(--text-soft);margin-top:2px">${s.cui ? 'CUI: <b>'+esc(s.cui)+'</b>' : ''}${s.cui && s.regCom ? ' · ' : ''}${s.regCom ? 'Reg. Com.: <b>'+esc(s.regCom)+'</b>' : ''}</div>` : ''}
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0">
            <button class="btn btn-ghost btn-sm" data-action="openSupplierModal" data-arg1="${s.id}" data-tip="Szerkesztés">✏️</button>
            <button class="btn btn-ghost btn-sm" data-action="deleteSupplier" data-arg1="${s.id}" data-tip="Törlés">🗑️</button>
          </div>
        </div>

        <!-- Pénzügyi összegzés -->
        <div style="padding:10px 18px;font-size:0.78rem;color:var(--text);background:#fafaf7;border-bottom:1px solid var(--border)">
          <div style="display:flex;flex-wrap:wrap;gap:14px">
            ${s.paymentTermsDays >= 0 ? `<div>💳 Fizetés: <b>${s.paymentTermsDays === 0 ? 'azonnal' : s.paymentTermsDays + ' nap'}</b></div>` : ''}
            ${s.minOrderValue > 0 ? `<div>📦 Min: <b>${fmtMoney(s.minOrderValue, currency)}</b></div>` : ''}
            ${s.freeShippingAbove > 0 ? `<div>🚚 Ingyenes szállítás: <b>${fmtMoney(s.freeShippingAbove, currency)}</b> felett</div>` : (s.shippingCost > 0 ? `<div>🚚 Szállítás: <b>${fmtMoney(s.shippingCost, currency)}</b></div>` : '')}
            ${s.defaultDiscountPct > 0 ? `<div>🏷️ Kedvezmény: <b>${s.defaultDiscountPct}%</b></div>` : ''}
            <div>💱 <b>${currency}</b>${s.vatIncluded ? ' (TVA-val)' : ' (TVA nélkül)'}</div>
          </div>
        </div>

        <!-- Benchmark (3 metrika azonos súllyal) -->
        <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:0;border-top:1px solid var(--border)">
          <div style="padding:12px 16px;text-align:center;border-right:1px solid var(--border)">
            <div style="font-size:1.4rem;font-weight:700;color:var(--gold-dark);font-family:'Fraunces',serif">${prefCount}</div>
            <div style="font-size:0.7rem;color:var(--text-soft);margin-top:2px">preferált alapanyag</div>
          </div>
          <div style="padding:12px 16px;text-align:center;border-right:1px solid var(--border)">
            <div style="font-size:1.4rem;font-weight:700;color:var(--gold-dark);font-family:'Fraunces',serif">${fmtMoney(Math.round(last6), currency)}</div>
            <div style="font-size:0.7rem;color:var(--text-soft);margin-top:2px">6 hó beszerzés</div>
          </div>
          <div style="padding:12px 16px;text-align:center">
            <div style="font-size:1.4rem;font-weight:700;color:var(--gold-dark);font-family:'Fraunces',serif">${avgKg > 0 ? avgKg.toFixed(2) : '—'}</div>
            <div style="font-size:0.7rem;color:var(--text-soft);margin-top:2px">átlag ${currency}/kg</div>
          </div>
        </div>

        ${s.notes ? `<div style="padding:10px 18px;background:#fffbf5;border-top:1px solid var(--border);font-size:0.78rem;color:var(--text-soft)"><b>📝</b> ${esc(s.notes)}</div>` : ''}
      </div>
    `;
  });

  el.innerHTML = html;
}

// =============================================================
// MODAL — Új / Szerkesztés
// =============================================================

function openSupplierModal(id) {
  editingSupplierId = id ? Number(id) : null;
  const s = editingSupplierId ? getSupplierById(editingSupplierId) : null;

  // Modal HTML létrehozás vagy reuse
  let modal = document.getElementById('supplier-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'supplier-modal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal modal-lg">
      <div class="modal-head">
        <h3>${s ? '✏️ Beszállító szerkesztése' : '➕ Új beszállító'}</h3>
        <button class="modal-close" data-action="closeSupplierModal">✕</button>
      </div>
      <div class="modal-body">
        <div class="modal-tabs" style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:16px">
          <button type="button" class="modal-tab active" data-stab="basic" onclick="switchSupplierTab(this,'basic')">Alapadatok</button>
          <button type="button" class="modal-tab" data-stab="billing" onclick="switchSupplierTab(this,'billing')">Számlázás</button>
          <button type="button" class="modal-tab" data-stab="finance" onclick="switchSupplierTab(this,'finance')">Pénzügy</button>
        </div>

        <!-- ALAPADATOK TAB -->
        <div id="stab-basic" class="stab-content">
          <div class="form-row">
            <div class="form-group" style="flex:1.5">
              <label>Név <span style="color:#dc2626">*</span></label>
              <input type="text" id="sup-name" placeholder="pl. Biolife Kft" value="${s ? esc(s.name) : ''}">
            </div>
            <div class="form-group">
              <label>Aktív</label>
              <select id="sup-active">
                <option value="true" ${!s || s.active ? 'selected' : ''}>Igen</option>
                <option value="false" ${s && !s.active ? 'selected' : ''}>Nem (inaktív)</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Kapcsolattartó</label>
              <input type="text" id="sup-contact" placeholder="Kovács Anna" value="${s ? esc(s.contactPerson || '') : ''}">
            </div>
            <div class="form-group">
              <label>E-mail</label>
              <input type="email" id="sup-email" placeholder="info@beszallito.ro" value="${s ? esc(s.email || '') : ''}">
            </div>
            <div class="form-group">
              <label>Telefon</label>
              <input type="text" id="sup-phone" placeholder="+40 723 456 789" value="${s ? esc(s.phone || '') : ''}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="flex:1">
              <label>Megjegyzés</label>
              <textarea id="sup-notes" rows="2" placeholder="Pl. szezonális elérhetőség, megbízhatóság, kontakt-megjegyzés...">${s ? esc(s.notes || '') : ''}</textarea>
            </div>
          </div>
        </div>

        <!-- SZÁMLÁZÁS TAB -->
        <div id="stab-billing" class="stab-content" style="display:none">
          <div style="background:var(--teal-pale);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:0.78rem;color:var(--teal-dark)">
            ℹ️ Romániai Codul fiscal szerinti számlázási adatok. A CUI és Reg. Com. számla-emisszióhoz szükséges.
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>CUI (Cod fiscal)</label>
              <input type="text" id="sup-cui" placeholder="RO12345678" value="${s ? esc(s.cui || '') : ''}">
            </div>
            <div class="form-group">
              <label>Reg. Com.</label>
              <input type="text" id="sup-regcom" placeholder="J40/123/2020" value="${s ? esc(s.regCom || '') : ''}">
            </div>
            <div class="form-group" style="flex:0.6">
              <label>TVA-fizető</label>
              <select id="sup-vat-payer">
                <option value="false" ${!s || !s.isVatPayer ? 'selected' : ''}>Nem</option>
                <option value="true" ${s && s.isVatPayer ? 'selected' : ''}>Igen</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="flex:1">
              <label>Bejegyzett székhely (cím)</label>
              <input type="text" id="sup-address" placeholder="Str. Cluj 12, 535500 Gheorgheni, Harghita" value="${s ? esc(s.address || '') : ''}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Bank neve</label>
              <input type="text" id="sup-bank" placeholder="BCR / BT / Raiffeisen..." value="${s ? esc(s.bankName || '') : ''}">
            </div>
            <div class="form-group" style="flex:2">
              <label>IBAN</label>
              <input type="text" id="sup-iban" placeholder="RO12 BTRL 1234 5678 9012 3456" value="${s ? esc(s.bankIban || '') : ''}">
            </div>
          </div>
        </div>

        <!-- PÉNZÜGY TAB -->
        <div id="stab-finance" class="stab-content" style="display:none">
          <div class="form-row">
            <div class="form-group">
              <label>Pénznem</label>
              <select id="sup-currency">
                <option value="lej" ${!s || s.currency === 'lej' ? 'selected' : ''}>lej (RON)</option>
                <option value="EUR" ${s && s.currency === 'EUR' ? 'selected' : ''}>EUR</option>
                <option value="HUF" ${s && s.currency === 'HUF' ? 'selected' : ''}>HUF</option>
                <option value="USD" ${s && s.currency === 'USD' ? 'selected' : ''}>USD</option>
              </select>
            </div>
            <div class="form-group">
              <label>Ár TVA-t tartalmaz</label>
              <select id="sup-vat-included">
                <option value="true" ${!s || s.vatIncluded ? 'selected' : ''}>Igen (bruttó ár)</option>
                <option value="false" ${s && !s.vatIncluded ? 'selected' : ''}>Nem (nettó ár)</option>
              </select>
            </div>
            <div class="form-group">
              <label>Fizetési határidő (nap)</label>
              <input type="number" id="sup-payment-days" min="0" max="180" placeholder="0=azonnal" value="${s ? (s.paymentTermsDays || 0) : 0}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Min. rendelési érték</label>
              <input type="number" id="sup-min-order" min="0" step="10" placeholder="0=nincs min" value="${s ? (s.minOrderValue || 0) : 0}">
            </div>
            <div class="form-group">
              <label>Szállítási költség</label>
              <input type="number" id="sup-shipping" min="0" step="1" placeholder="0=ingyenes" value="${s ? (s.shippingCost || 0) : 0}">
            </div>
            <div class="form-group">
              <label>Ingyenes szállítás felett</label>
              <input type="number" id="sup-free-shipping" min="0" step="50" placeholder="(opcionális)" value="${s && s.freeShippingAbove ? s.freeShippingAbove : ''}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="flex:0.5">
              <label>Alap kedvezmény (%)</label>
              <input type="number" id="sup-discount" min="0" max="100" step="0.5" placeholder="0" value="${s ? (s.defaultDiscountPct || 0) : 0}">
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer" style="display:flex;justify-content:space-between;padding:14px 18px;border-top:1px solid var(--border);background:var(--cream)">
        <button class="btn btn-ghost" data-action="closeSupplierModal">Mégse</button>
        <button class="btn btn-primary" data-action="saveSupplier">${s ? '💾 Mentés' : '➕ Hozzáadás'}</button>
      </div>
    </div>
  `;
  modal.style.display = 'flex';
}

function closeSupplierModal() {
  const modal = document.getElementById('supplier-modal');
  if (modal) modal.style.display = 'none';
  editingSupplierId = null;
}

function switchSupplierTab(btn, tabKey) {
  const modal = document.getElementById('supplier-modal');
  if (!modal) return;
  modal.querySelectorAll('.modal-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  modal.querySelectorAll('.stab-content').forEach(c => c.style.display = 'none');
  const target = modal.querySelector(`#stab-${tabKey}`);
  if (target) target.style.display = '';
}

// =============================================================
// SAVE / DELETE
// =============================================================

async function saveSupplier() {
  const name = document.getElementById('sup-name')?.value?.trim();
  if (!name) { toast('A név kötelező', true); return; }

  const data = {
    name,
    contact_person: document.getElementById('sup-contact')?.value?.trim() || null,
    email: document.getElementById('sup-email')?.value?.trim() || null,
    phone: document.getElementById('sup-phone')?.value?.trim() || null,
    notes: document.getElementById('sup-notes')?.value?.trim() || null,
    cui: document.getElementById('sup-cui')?.value?.trim() || null,
    reg_com: document.getElementById('sup-regcom')?.value?.trim() || null,
    is_vat_payer: document.getElementById('sup-vat-payer')?.value === 'true',
    address: document.getElementById('sup-address')?.value?.trim() || null,
    bank_name: document.getElementById('sup-bank')?.value?.trim() || null,
    bank_iban: document.getElementById('sup-iban')?.value?.trim() || null,
    currency: document.getElementById('sup-currency')?.value || 'lej',
    vat_included: document.getElementById('sup-vat-included')?.value === 'true',
    payment_terms_days: Number(document.getElementById('sup-payment-days')?.value) || 0,
    min_order_value: Number(document.getElementById('sup-min-order')?.value) || 0,
    shipping_cost: Number(document.getElementById('sup-shipping')?.value) || 0,
    free_shipping_above: Number(document.getElementById('sup-free-shipping')?.value) || null,
    default_discount_pct: Number(document.getElementById('sup-discount')?.value) || 0,
    active: document.getElementById('sup-active')?.value === 'true',
    updated_at: new Date().toISOString()
  };

  try {
    if (editingSupplierId) {
      // UPDATE (anti-spread: csak named fields)
      await kData.updateFields('suppliers', data, 'id=eq.' + editingSupplierId);
      const idx = R.suppliers.findIndex(s => s.id === editingSupplierId);
      if (idx >= 0) {
        R.suppliers[idx] = mapSupplierDb({ ...data, id: editingSupplierId });
      }
      await auditLog('supplier_update', name, 'ID: ' + editingSupplierId);
      toast('✅ Beszállító frissítve');
    } else {
      // INSERT — explicit MAX+1 (anti-sequence-collision)
      const allSup = await kData.query('suppliers', { order: 'id.desc', limit: 1 });
      const nextId = (allSup?.[0]?.id || 0) + 1;
      const inserted = await kData.insert('suppliers', { id: nextId, ...data });
      const newSup = mapSupplierDb({ id: nextId, ...data, created_at: new Date().toISOString() });
      R.suppliers = R.suppliers || [];
      R.suppliers.push(newSup);
      await auditLog('supplier_create', name, 'ID: ' + nextId);
      toast('✅ Új beszállító hozzáadva');
    }
    closeSupplierModal();
    renderSuppliers();
    // Refresh ingredient modal-jában dropdown ha nyitva van
    if (typeof renderSupplierDropdownInIngModal === 'function') renderSupplierDropdownInIngModal();
  } catch(e) {
    toast('⚠️ Mentés hiba: ' + e.message, true);
    console.error('saveSupplier:', e);
  }
}

async function deleteSupplier(id) {
  const s = getSupplierById(Number(id));
  if (!s) return;
  const prefCount = countPreferredIngredients(s.id);
  let msg = `Biztos törlöd: "${s.name}"?`;
  if (prefCount > 0) {
    msg += `\n\n⚠️ ${prefCount} alapanyag preferált beszállítója. Törléskor ezek a preferenciák ÜRESEN maradnak (a `+
      `kapcsolódó bevételezések és batches megmaradnak).`;
  }
  if (!(await confirmDialog(msg))) return;
  try {
    await kData.delete('suppliers', 'id=eq.' + s.id);
    R.suppliers = R.suppliers.filter(x => x.id !== s.id);
    // Ingredients preferredSupplierId nullázása lokálisan
    R.ingredients.forEach(i => { if (i.preferredSupplierId === s.id) i.preferredSupplierId = null; });
    await auditLog('supplier_delete', s.name, 'ID: ' + s.id + ', preferált: ' + prefCount);
    toast('✅ Beszállító törölve');
    renderSuppliers();
  } catch(e) {
    toast('⚠️ Törlés hiba: ' + e.message, true);
  }
}

// =============================================================
// HELPER: DB-row → kliens object
// =============================================================

function mapSupplierDb(row) {
  return {
    id: row.id,
    name: row.name,
    contactPerson: row.contact_person || '',
    email: row.email || '',
    phone: row.phone || '',
    notes: row.notes || '',
    cui: row.cui || '',
    regCom: row.reg_com || '',
    isVatPayer: !!row.is_vat_payer,
    address: row.address || '',
    bankName: row.bank_name || '',
    bankIban: row.bank_iban || '',
    paymentTermsDays: Number(row.payment_terms_days) || 0,
    minOrderValue: Number(row.min_order_value) || 0,
    shippingCost: Number(row.shipping_cost) || 0,
    freeShippingAbove: row.free_shipping_above ? Number(row.free_shipping_above) : null,
    defaultDiscountPct: Number(row.default_discount_pct) || 0,
    currency: row.currency || 'lej',
    vatIncluded: row.vat_included !== false,
    active: row.active !== false,
    createdAt: row.created_at || null
  };
}

// =============================================================
// EXPORT (window scope a data-action delegator-nak)
// =============================================================

if (typeof window !== 'undefined') {
  window.renderSuppliers = renderSuppliers;
  window.openSupplierModal = openSupplierModal;
  window.closeSupplierModal = closeSupplierModal;
  window.switchSupplierTab = switchSupplierTab;
  window.saveSupplier = saveSupplier;
  window.deleteSupplier = deleteSupplier;
  window.mapSupplierDb = mapSupplierDb;
  window.getSupplierById = getSupplierById;
  window.countPreferredIngredients = countPreferredIngredients;
}
