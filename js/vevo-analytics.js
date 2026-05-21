// ===== KEREK ANALYTICS – vevő esemény loggolás =====
// Az audit_log táblát használja, NEM hoz létre újat.
const KEREKAnalytics = {
  sessionStart() {
    try {
      const name = (typeof currentUser !== 'undefined' && currentUser?.name) || '?';
      auditLog('vevo_session', name, JSON.stringify({
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        mobile: window.innerWidth <= 640,
        ua: (navigator.userAgent || '').slice(0, 60)
      }));
    } catch(e) { console.warn('Analytics sessionStart hiba:', e.message); }
  },
  qtyChange(day, pid, qty) {
    try {
      const name = (typeof currentUser !== 'undefined' && currentUser?.name) || '?';
      auditLog('vevo_qty_change', name, JSON.stringify({
        day, pid, qty,
        ym: `${selectedYear}-${selectedMonth+1}`
      }));
    } catch(e) { console.warn('Analytics qtyChange hiba:', e.message); }
  },
  categoryFilter(day, cat) {
    try {
      const name = (typeof currentUser !== 'undefined' && currentUser?.name) || '?';
      auditLog('vevo_cat_filter', name, JSON.stringify({
        day, cat,
        ym: `${selectedYear}-${selectedMonth+1}`
      }));
    } catch(e) { console.warn('Analytics categoryFilter hiba:', e.message); }
  },
  monthSwitch(y, m) {
    try {
      const name = (typeof currentUser !== 'undefined' && currentUser?.name) || '?';
      auditLog('vevo_month_switch', name, JSON.stringify({ y, m: m+1 }));
    } catch(e) { console.warn('Analytics monthSwitch hiba:', e.message); }
  }
};
