// ===== ÜZENET OLVASOTT/OLVASATLAN TRACKING (Supabase alapú) =====
// D.seenMsgs = { "2026-4": 2, "2026-5": 1, ... } - Supabase settings-ből töltve
async function markClientSeen(clientId, year, month) {
  // Per-vevő olvasott tracking: key = "year-month-clientId"
  const key = `${clientId}-${year}-${month}`;
  const arr = D.messages[key] || [];
  const clientMsgCount = arr.filter(m=>!(m.text||'').startsWith('📨 Admin:')).length;
  const seenKey = `${year}-${month}-${clientId}`;
  if(!D.seenMsgs) D.seenMsgs = {};
  if(D.seenMsgs[seenKey] === clientMsgCount) return; // nincs változás
  D.seenMsgs[seenKey] = clientMsgCount;
  try { await sb.setSetting('admin_seen_msgs', D.seenMsgs); } catch(e) { console.warn('seen save err', e); }
  updateMsgBadge();
}
function getUnreadCount() {
  const seen = D.seenMsgs || {};
  let unread = 0;
  Object.entries(D.messages).forEach(([key, arr]) => {
    // key: clientId-year-month
    const parts = key.split('-');
    const month = parts[parts.length-1];
    const year = parts[parts.length-2];
    const clientId = parts.slice(0, parts.length-2).join('-');
    const seenKey = `${year}-${month}-${clientId}`;
    const clientMsgs = arr.filter(m=>!(m.text||'').startsWith('📨 Admin:')).length;
    unread += Math.max(0, clientMsgs - (seen[seenKey]||0));
  });
  return unread;
}
function updateMsgBadge(){
  const unread = getUnreadCount();
  const b = document.getElementById('msg-badge');
  if(b){ if(unread>0){ b.style.display='inline'; b.textContent=unread; } else { b.style.display='none'; } }
  updateMonthBadges();
}
function updateMonthBadges() {
  const seen = D.seenMsgs || {};
  MONTHS.forEach((_, m) => {
    let clientCount = 0;
    Object.entries(D.messages).forEach(([key, arr]) => {
      if(key.endsWith(`-${selYear}-${m}`))
        clientCount += (arr||[]).filter(msg=>!(msg.text||'').startsWith('📨 Admin:')).length;
    });
    // Per-vevő seen összeszámolás
    let seenInMonth = 0;
    Object.entries(D.messages).forEach(([k]) => {
      if(k.endsWith(`-${selYear}-${m}`)) {
        const parts = k.split('-');
        const cid = parts.slice(0, parts.length-2).join('-');
        seenInMonth += seen[`${selYear}-${m}-${cid}`] || 0;
      }
    });
    const unread = Math.max(0, clientCount - seenInMonth);
    const btn = document.querySelector(`#topbar-month button[data-month="${m}"]`);
    if(btn) {
      let badge = btn.querySelector('.month-unread-badge');
      if(unread > 0) {
        if(!badge) { badge = document.createElement('span'); badge.className='month-unread-badge'; badge.style.cssText='background:var(--gold);color:var(--teal-dark);border-radius:8px;padding:0 5px;font-size:0.65rem;font-weight:700;margin-left:4px'; btn.appendChild(badge); }
        badge.textContent = unread;
      } else if(badge) { badge.remove(); }
    }
  });
}

// ===== MESSAGES =====
async function sendAdminReply(clientId, month, inputId) {
  const input = document.getElementById(inputId);
  if(!input?.value.trim()) return;
  const text = input.value.trim();
  const key = `${clientId}-${selYear}-${month}`;
  const fullText = '📨 Admin: ' + text;
  const ts = new Date().toISOString();

  try {
    await sb.insert('messages', {
      client_id: clientId,
      year: selYear,
      month: month,
      text: fullText,
    });
    // v2.27.0: Push notification to client
    if (typeof sendPushToClient === 'function') {
      sendPushToClient(clientId, 'message', '💬 Új üzenet a pékségtől', text.substring(0, 80)).catch(()=>{});
    }
    // Lokális cache frissítése hogy azonnal látsszon
    if(!D.messages[key]) D.messages[key] = [];
    D.messages[key].push({ text: fullText, ts });
    input.value = '';
    // Csak az üzenet hozzáadása a már nyitott kártyához - ne csukja be
    const body = document.getElementById('msg-body-' + key);
    if(body && body.style.display !== 'none') {
      const msgArea = body.querySelector('.card-body');
      if(msgArea) {
        const dt = new Date(ts).toLocaleString('hu-HU',{year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'});
        const div = document.createElement('div');
        div.className = 'message-item';
        div.style.cssText = 'background:#f0fff4;border-left:3px solid #059669;border-radius:8px;';
        div.innerHTML = '<div class="message-meta"><span>👩‍💼 Admin válasz</span><span>📅 ' + dt + '</span></div><div class="message-text">' + fullText + '</div>';
        const replyBox = msgArea.querySelector('div[style*="display:flex"]');
        if(replyBox) msgArea.insertBefore(div, replyBox);
        else msgArea.appendChild(div);
      }
    }
    updateMsgBadge();
    toast('✅ Üzenet elküldve!');
  } catch(e) {
    toast('⚠️ Küldés sikertelen: '+e.message);
    console.error(e);
  }
}

function renderMessages(){
  // Csak azokat a vevőket mutatjuk akiknek van üzenete
  const seen = D.seenMsgs || {};
  let html = '';
  let count = 0;
  D.clients.forEach(c => {
    const key = c.id + '-' + selYear + '-' + selMonth;
    const msgs = D.messages[key] || [];
    if(msgs.length === 0) return; // nincs üzenet - kihagyjuk
    count++;
    const clientMsgs = msgs.filter(m => !(m.text||'').startsWith('📨 Admin:'));
    const seenCount = seen[selYear + '-' + selMonth + '-' + c.id] || 0;
    const unread = Math.max(0, clientMsgs.length - seenCount);
    // Olvasatlan kártyák nyitva, olvasottak csukva
    const isOpen = false; // mindig csukva - kézzel kell kinyitni
    const arrow = '▶';
    const unreadBadge = unread > 0
      ? '<span style="background:var(--gold);color:var(--teal-dark);border-radius:10px;padding:1px 8px;font-size:0.72rem;font-weight:700;margin-left:8px">' + unread + ' új</span>'
      : '';
    html += '<div class="card mb-16">';
    html += '<div class="card-head" style="cursor:pointer;user-select:none" onclick="toggleMsgCard(\'' + key + '\',\'' + c.id + '\')">'; 
    html += '<div class="card-title">💬 ' + c.name + unreadBadge + '</div>';
    html += '<div style="display:flex;align-items:center;gap:8px">';
    html += '<span class="badge badge-gold">' + MONTHS[selMonth] + ' ' + selYear + '</span>';
    html += '<span id="msg-arrow-' + key + '" style="font-size:1rem">' + arrow + '</span>';
    html += '</div></div>'; // card-head vége
    html += '<div id="msg-body-' + key + '" style="display:' + (isOpen ? 'block' : 'none') + '">';
    html += '<div class="card-body">';
    msgs.forEach(msg => {
      const dt = new Date(msg.ts||Date.now()).toLocaleString('hu-HU',{year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'});
      const isAdmin = (msg.text||'').startsWith('📨 Admin:');
      const bg = isAdmin ? 'background:#f0fff4;border-left:3px solid #059669;border-radius:8px;' : '';
      const who = isAdmin ? '👩‍💼 Admin válasz' : '👤 ' + esc(c.name) + ' · ' + esc(c.email||'');
      const msgIdx = msgs.indexOf(msg);
      html += '<div class="message-item" style="' + bg + 'display:flex;justify-content:space-between;align-items:flex-start;gap:8px">';
      html += '<div style="flex:1"><div class="message-meta"><span>' + esc(who) + '</span><span>📅 ' + dt + '</span></div>';
      html += '<div class="message-text">' + esc(msg.text||'') + '</div></div>';
      html += '<button onclick="deleteMessage(\'' + key + '\',' + msgIdx + ')" style="background:none;border:none;cursor:pointer;color:#b91c1c;font-size:0.85rem;padding:2px 6px;opacity:0.6" title="Üzenet törlése" data-tip="Üzenet törlése">✕</button>';
      html += '</div>';
    });

    // Admin válasz input
    const replyId = 'admin-reply-' + key;
    html += '<div style="display:flex;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">';
    html += '<input id="' + replyId + '" type="text" placeholder="Admin válasz..." style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:0.9rem" onkeydown="if(event.key===\'Enter\')sendAdminReply(\'' + c.id + '\',' + selMonth + ',\'' + replyId + '\')">';
    html += '<button onclick="sendAdminReply(\'' + c.id + '\',' + selMonth + ',\'' + replyId + '\')" style="background:var(--teal-dark);color:#fff;border:none;border-radius:8px;padding:8px 16px;cursor:pointer;font-size:0.9rem">Küld</button>';
    html += '</div>';
    html += '</div></div></div>'; // card-body, msg-body, card vége
  });
  document.getElementById('messages-list').innerHTML = count > 0 ? html : '<p class="text-soft text-sm">Ebben a hónapban még senki nem küldött üzenetet.</p>';
}

async function deleteMessage(key, idx) {
  if (!(await confirmDialog('Törlöd ezt az üzenetet?'))) return;
  const msgs = D.messages[key];
  if(!msgs || !msgs[idx]) return;
  const msg = msgs[idx];
  msgs.splice(idx, 1);
  // Delete from Supabase by created_at timestamp
  try {
    const [cid, y, m] = key.split('-').slice(0,3);
    await sb.delete('messages', `client_id=eq.${cid}&year=eq.${y}&month=eq.${m}&text=eq.${encodeURIComponent(msg.text)}`);
  } catch(e) { console.warn('delete message:', e.message); }
  renderMessages();
  toast('Üzenet törölve.');
}

async function toggleMsgCard(key, clientId) {
  const body = document.getElementById('msg-body-'+key);
  const arrow = document.getElementById('msg-arrow-'+key);
  if(!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if(arrow) arrow.textContent = isOpen ? '▶' : '▼';
  // Ha kinyitjuk → olvasottnak jelöljük + badge eltávolítása
  if(!isOpen) {
    // "X új" badge eltávolítása a kártya fejlécéből
    const cardHead = body.previousElementSibling;
    const badge = cardHead?.querySelector('span[style*="gold"]');
    if(badge) badge.remove();
    // Supabase-be mentés
    const parts = key.split('-');
    const month = parseInt(parts[parts.length-1]);
    const year = parseInt(parts[parts.length-2]);
    await markClientSeen(clientId, year, month);
  }
}

