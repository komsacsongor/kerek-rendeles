// v2.28.0 — Admin manual push broadcast module

async function renderPushBroadcast() {
  const view = document.getElementById('view-push');
  if (!view) return;

  // Fetch last 10 broadcasts from audit log
  let history = [];
  try {
    const logs = await kData.query('audit_log', {
      filter: `action=eq.push_broadcast`,
      order: 'created_at.desc',
      limit: 10
    });
    history = logs || [];
  } catch(e) { console.warn('Push history load failed:', e.message); }

  view.innerHTML = `
    <h2 style="margin:0 0 6px;font-family:Fraunces,serif">📢 Push üzenet</h2>
    <p style="color:var(--text-soft);font-size:0.85rem;margin-bottom:18px">
      Küldj értesítést a vevőknek a telefonjukra. Csak azok kapják meg, akik engedélyezték a push értesítéseket.
    </p>

    <div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:24px">
      <div style="display:flex;flex-direction:column;gap:12px">
        <div>
          <label style="font-size:0.78rem;font-weight:600;color:var(--teal-dark);display:block;margin-bottom:4px">Cím (max 60 karakter)</label>
          <input id="push-title" type="text" maxlength="60" placeholder="pl. 🎉 Húsvéti különlegességek" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:0.92rem;font-family:Kodchasan,sans-serif">
        </div>
        <div>
          <label style="font-size:0.78rem;font-weight:600;color:var(--teal-dark);display:block;margin-bottom:4px">Szöveg (max 200 karakter)</label>
          <textarea id="push-body" maxlength="200" rows="3" placeholder="pl. Március 28-ig fonott kalácsot is rendelhetsz!" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:0.92rem;font-family:Kodchasan,sans-serif;resize:vertical"></textarea>
        </div>
        <div>
          <label style="font-size:0.78rem;font-weight:600;color:var(--teal-dark);display:block;margin-bottom:4px">Cél</label>
          <select id="push-target" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:0.92rem;font-family:Kodchasan,sans-serif">
            <option value="all">Minden vevő (aktív kliensek)</option>
            <option value="active">Csak aktív vevők (rendelt az utóbbi 90 napban)</option>
          </select>
        </div>
        <button onclick="sendBroadcastFromForm()" style="background:var(--teal-dark);color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:0.95rem;cursor:pointer;font-family:Kodchasan,sans-serif;font-weight:600;align-self:flex-start">📤 Küldés</button>
      </div>
    </div>

    <h3 style="margin:0 0 10px;font-family:Fraunces,serif;font-size:1.1rem">Előzmények (utolsó 10)</h3>
    <div id="push-history">
      ${history.length === 0
        ? '<div style="color:var(--text-soft);font-size:0.85rem;padding:14px;background:#f8fafc;border-radius:8px;text-align:center">Még nem küldtél push üzenetet.</div>'
        : history.map(function(h) {
            const dt = new Date(h.created_at || h.timestamp || Date.now()).toLocaleString('hu-HU', {year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
            return `<div style="background:#fff;border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:8px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <strong style="font-size:0.92rem">${esc(h.entity_name||'(név nélkül)')}</strong>
                <span style="font-size:0.72rem;color:var(--text-soft)">${dt}</span>
              </div>
              <div style="font-size:0.78rem;color:var(--text-soft);line-height:1.4">${esc(h.details||'')}</div>
            </div>`;
          }).join('')
      }
    </div>
  `;
}

async function sendBroadcastFromForm() {
  const title = document.getElementById('push-title').value.trim();
  const body = document.getElementById('push-body').value.trim();
  const target = document.getElementById('push-target').value;
  if (!title) { toast('⚠️ A címet ki kell tölteni!', true); return; }
  if (!body) { toast('⚠️ A szöveget ki kell tölteni!', true); return; }
  const targetLabel = target === 'active' ? 'aktív vevőknek' : 'minden vevőnek';
  if (!(await confirmDialog(`Biztos, hogy küldöd a push üzenetet ${targetLabel}?\n\n"${title}"\n${body}`))) return;

  if (typeof sendPushBroadcast !== 'function') {
    toast('⚠️ Push funkció nem elérhető.', true);
    return;
  }
  toast('📤 Küldés folyamatban...');
  try {
    const result = await sendPushBroadcast('admin_broadcast', title, body, target);
    // v2.53.58: a broadcast TÁROLÁSA rendes üzenetként is → a vevő üzenet-paneljában
    // megjelenik a teljes szöveg (a push csak a rövid figyelemfelkeltő). Így hosszú
    // üzenet is olvasható, nem vész el a levágott értesítésben.
    try {
      const now = new Date();
      const msgText = '📢 ' + title + (body ? '\n' + body : '');
      const recipients = (D.clients || []);
      if (recipients.length) {
        const rows = recipients.map(c => ({
          client_id: c.id, year: now.getFullYear(), month: now.getMonth(), text: msgText
        }));
        await sb.insert('messages', rows);
      }
    } catch(msgErr) { console.warn('broadcast→messages:', msgErr.message); }
    toast(`✅ Elküldve ${result.sent}/${result.total} vevőnek${result.failed > 0 ? ` (${result.failed} sikertelen)` : ''}.`);
    // Clear form
    document.getElementById('push-title').value = '';
    document.getElementById('push-body').value = '';
    // Reload history after 2s (give audit log time to write)
    setTimeout(() => renderPushBroadcast(), 2000);
  } catch(e) {
    toast('⚠️ Hiba a küldés során: ' + e.message, true);
  }
}
