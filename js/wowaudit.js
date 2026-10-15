// ─────────────────────────────────────────────────────────────
//  wowaudit – Wochen-Daten (M+ Keys) über den Worker holen
// ─────────────────────────────────────────────────────────────
import { CONFIG, DEMO_MODE } from './config.js';
import { auth } from './store.js';
import { isoDate } from './ui.js';

const mem = new Map();

/** period = null → aktuelle Woche. Ergebnis: { configured, period, current, characters[] } | { error } | null */
export async function getWeek(period = null, players = []) {
  const k = String(period ?? 'cur');
  if (mem.has(k)) return mem.get(k);
  let p;
  if (DEMO_MODE) p = new Promise(r => setTimeout(() => r(demo(period, players)), 250));
  else if (!CONFIG.authWorkerUrl) p = Promise.resolve(null);
  else p = (async () => {
    const res = await fetch(`${CONFIG.authWorkerUrl.replace(/\/$/, '')}/wowaudit/week${period != null ? `?period=${period}` : ''}`,
      { headers: { Authorization: `Bearer ${await auth.idToken()}` } });
    return res.ok ? res.json() : { error: (await res.json().catch(() => ({}))).error || String(res.status) };
  })().catch(() => ({ error: 'network' }));
  p.then(v => { if (!v || v.error) mem.delete(k); });
  mem.set(k, p);
  return p;
}

/** Zeitraum einer WoW-Woche (EU-Reset Mittwoch) – offset 0 = diese Woche */
export function weekRange(offset = 0) {
  const d = new Date();
  const back = (d.getDay() - 3 + 7) % 7;                   // Tage seit Mittwoch
  d.setDate(d.getDate() - back - offset * 7);
  const end = new Date(d); end.setDate(end.getDate() + 6);
  return { from: isoDate(d), to: isoDate(end) };
}

/** Vault-Slots aus den Keys (1 / 4 / 8 Keys) → Keylevel je Slot oder null */
export const VAULT_STEPS = [1, 4, 8];
export const vaultSlots = keys => VAULT_STEPS.map(n => keys.length >= n ? keys[n - 1] : null);

// ── Demo ─────────────────────────────────────────────────────
function rnd(seed) { let x = 0; for (const c of seed) x = (x * 31 + c.charCodeAt(0)) >>> 0; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
function demo(period, players) {
  const current = 112, per = period ?? current;
  const characters = players.filter(p => p.active !== false && p.id !== 'momo').map(p => {
    const r = rnd(p.id + per);
    const lazy = r() < .2;
    const n = lazy ? Math.floor(r() * 3) : 3 + Math.floor(r() * 8);
    const keys = Array.from({ length: n }, () => (lazy ? 6 : 9) + Math.floor(r() * 7)).sort((a, b) => b - a);
    return { name: p.charName || p.name, realm: 'Todeswache', keys, extra: {} };
  });
  characters.push({ name: 'Drearoll', realm: 'Todeswache', keys: [12, 11, 10, 10], extra: {} });   // Twink, nicht im Roster
  return { configured: true, demo: true, period: per, current, characters };
}
