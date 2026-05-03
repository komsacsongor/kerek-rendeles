// ============================================================
// KEREK – Supabase kliens
// ============================================================
const SUPABASE_URL = 'https://lfaxeihrmiylggahougl.supabase.co';
const SUPABASE_KEY = 'SUPABASE_ANON_KEY_PLACEHOLDER';

// ===== XSS PROTECTION =====
// Minden user-generated tartalmat ezzel kell kiszúrni mielőtt innerHTML-be kerül
function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

const sb = {
  async query(table, opts = {}) {
    let url = `${SUPABASE_URL}/rest/v1/${table}?`;
    if (opts.select) url += `select=${opts.select}&`;
    if (opts.filter) url += `${opts.filter}&`;
    if (opts.order) url += `order=${opts.order}&`;
    if (opts.limit) url += `limit=${opts.limit}&`;
    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      }
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async insert(table, data, upsert = false, onConflict = null) {
    let url = `${SUPABASE_URL}/rest/v1/${table}`;
    if(upsert && onConflict) url += `?on_conflict=${onConflict}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': upsert ? 'resolution=merge-duplicates,return=representation' : 'return=representation',
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async upsert(table, data, onConflict = null) {
    return this.insert(table, data, true, onConflict);
  },

  async update(table, data, filter) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async delete(table, filter) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      }
    });
    if (!res.ok) throw new Error(await res.text());
    return true;
  },

  async getSetting(key) {
    const rows = await this.query('settings', { filter: `key=eq.${key}` });
    if (!rows[0]) return null;
    const val = rows[0].value;
    if (typeof val === 'string') { try { return JSON.parse(val); } catch(e) { return val; } }
    return val;
  },

  async setSetting(key, value) {
    const strVal = JSON.stringify(value);
    try {
      const existing = await this.query('settings', { filter: `key=eq.${key}` });
      if (existing.length > 0) {
        return this.update('settings', { value: strVal }, `key=eq.${key}`);
      } else {
        return this.insert('settings', { key, value: strVal });
      }
    } catch(e) {
      return this.upsert('settings', { key, value: strVal });
    }
  },

  // ===== REALTIME WebSocket =====
  _ws: null,
  _channels: {},
  _reconnectTimer: null,
  _heartbeatTimer: null,
  _ref: 1,

  subscribe(tables, callback) {
    const tableList = Array.isArray(tables) ? tables : [tables];
    const key = tableList.join(',');
    if (this._channels[key]) return;
    this._channels[key] = { tables: tableList, callback };
    this._connectWS();
  },

  unsubscribeAll() {
    this._channels = {};
    if (this._ws) { try { this._ws.close(); } catch(e){} this._ws = null; }
    clearTimeout(this._reconnectTimer);
    clearInterval(this._heartbeatTimer);
  },

  _connectWS() {
    if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) return;
    const wsUrl = `${SUPABASE_URL.replace('https','wss')}/realtime/v1/websocket?apikey=${SUPABASE_KEY}&vsn=1.0.0`;
    try { this._ws = new WebSocket(wsUrl); } catch(e) { this._scheduleReconnect(); return; }

    this._ws.onopen = () => {
      clearTimeout(this._reconnectTimer);
      Object.values(this._channels).forEach(ch => {
        ch.tables.forEach(table => {
          this._ws.send(JSON.stringify({
            topic: `realtime:public:${table}`,
            event: 'phx_join',
            payload: { config: { broadcast: { self: false }, presence: { key: '' } } },
            ref: String(this._ref++)
          }));
        });
      });
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = setInterval(() => {
        if (this._ws?.readyState === WebSocket.OPEN)
          this._ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(this._ref++) }));
      }, 25000);
    };

    this._ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (!['INSERT','UPDATE','DELETE'].includes(msg.event)) return;
        const changedTable = (msg.topic || '').replace('realtime:public:','');
        Object.values(this._channels).forEach(ch => {
          if (ch.tables.includes(changedTable))
            ch.callback({ table: changedTable, event: msg.event, record: msg.payload?.record });
        });
      } catch(e) {}
    };

    this._ws.onclose = () => { clearInterval(this._heartbeatTimer); this._scheduleReconnect(); };
    this._ws.onerror = () => { try { this._ws.close(); } catch(e) {} };
  },

  _scheduleReconnect() {
    if (Object.keys(this._channels).length === 0) return;
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(() => this._connectWS(), 5000);
  }
};
