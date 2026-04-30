// ============================================================
// KEREK – Supabase kliens
// ============================================================
const SUPABASE_URL = 'https://lfaxeihrmiylggahougl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_prELs2iHaoj9uu-yaARPOQ_PSYe2WAN';

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

  async insert(table, data, upsert = false) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
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

  async upsert(table, data) {
    return this.insert(table, data, true);
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
    return rows[0] ? JSON.parse(rows[0].value) : null;
  },

  async setSetting(key, value) {
    return this.upsert('settings', { key, value: JSON.stringify(value) });
  }
};
