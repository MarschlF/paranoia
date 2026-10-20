// ─────────────────────────────────────────────────────────────
//  Rotation automatisch füllen
//  raidDays/<datum>.auto = { pid: 'X' | 'B' | 'A' | '' }   (von der Automatik)
//  raidDays/<datum>.att  = { pid: 'X' | 'B' | 'A' | '-' }  (von Hand – gewinnt immer, '-' = bewusst leer)
//  raidDays/<datum>.autoUnmatched = [Namen aus dem Log, die keinem Spieler zugeordnet sind]
//
//  Regeln:  im Log bei einem Bosspull       → X (dabei)
//           Log vorhanden, nicht drin, in wowaudit zugesagt/Standby/Später/Vielleicht → B (Bench)
//           in wowaudit abgesagt             → A (abgemeldet)
//           sonst                             → leer (Offi entscheidet)
// ─────────────────────────────────────────────────────────────
import { store, auth } from './store.js';
import { CONFIG, DEMO_MODE } from './config.js';
import { fold, raidDates, todayIso, isoDate, parseIso } from './ui.js';

/** Gültiger Wert für die Anzeige & Statistik */
export function effAtt(day, pid) {
  const m = day?.att?.[pid];
  if (m === '-') return '';
  return m || day?.auto?.[pid] || '';
}
/** Kommt der angezeigte Wert von der Automatik? */
export const isAuto = (day, pid) => !day?.att?.[pid] && !!day?.auto?.[pid];

/** Spieler zu einem Charakternamen finden (Name, Charaktername, zugeordnete Twinks) */
export function playerFor(players, name) {
  const f = fold(name);
  return players.find(p => [p.charName, p.name, ...(p.alts || [])].some(n => n && fold(n) === f)) || null;
}

const STAMP = 'pn-autorota-at';
const addDays = (iso, n) => { const d = parseIso(iso); d.setDate(d.getDate() + n); return isoDate(d); };

/**
 * Automatik laufen lassen. full = ganze Season (sonst letzte 3 Wochen + nächste 2 Wochen).
 * → { ok, wcl, wowaudit, changed, unmatched, at } oder { ok: false, reason }
 */
export async function syncAutoRotation({ settings, players, days, full = false, force = false }) {
  if (!auth.isOfficer || !settings?.startDate) return { ok: false, reason: 'season' };
  if (!force && !full) {
    try { const t = Number(sessionStorage.getItem(STAMP) || 0); if (Date.now() - t < 10 * 60e3) return { ok: true, skipped: true }; } catch {}
  }
  const today = todayIso();
  const all = raidDates(settings);
  const from = full ? settings.startDate : [addDays(today, -21), settings.startDate].sort().at(-1);
  const to = [addDays(today, 14), settings.endDate || addDays(today, 14)].sort()[0];
  const dates = all.filter(d => d >= from && d <= to);
  if (!dates.length) return { ok: true, changed: 0, unmatched: 0 };

  let data;
  if (DEMO_MODE) data = demoData(dates, players);
  else {
    const base = (CONFIG.authWorkerUrl || '').replace(/\/$/, '');
    if (!base) return { ok: false, reason: 'worker' };
    const t = await auth.idToken();
    const r = await fetch(`${base}/rotation/auto?from=${dates[0]}&to=${dates.at(-1)}${force ? '&fresh=1' : ''}`, { headers: { Authorization: `Bearer ${t}` } });
    if (r.status === 404) return { ok: false, reason: 'old-worker' };
    if (!r.ok) return { ok: false, reason: `http ${r.status}` };
    data = await r.json();
  }
  if (!data.wcl && !data.wowaudit) return { ok: false, reason: 'none' };

  const active = players.filter(p => p.active !== false);
  let changed = 0, unmatched = 0;
  for (const d of dates) {
    const src = data.days?.[d] || {};
    const log = src.log, signups = src.signups;
    const inLog = new Set(), status = {};
    const um = [];
    (log || []).forEach(x => { const p = playerFor(active, x.name); if (p) inLog.add(p.id); else um.push(x.name); });
    (signups || []).forEach(x => { const p = playerFor(active, x.name); if (p) status[p.id] = x.status; });

    const auto = {};
    for (const p of active) {
      const s = status[p.id];
      let v = '';
      if (inLog.has(p.id)) v = 'X';
      else if (s === 'Absent') v = 'A';
      else if (log && s && s !== 'Unknown') v = 'B';
      auto[p.id] = v;   // alle Spieler eintragen, damit alte Werte sicher überschrieben werden
    }
    const day = days[d] || {};
    const same = active.every(p => (day.auto?.[p.id] || '') === auto[p.id]) && JSON.stringify(day.autoUnmatched || []) === JSON.stringify(um);
    unmatched += um.length;
    if (same) continue;
    // Tage ohne irgendeinen Wert nicht unnötig anlegen
    if (!day.id && !um.length && Object.values(auto).every(v => !v)) continue;
    await store.set('raidDays', d, { auto, autoUnmatched: um, autoAt: new Date().toISOString() });
    changed++;
  }
  const at = new Date().toISOString();
  try { sessionStorage.setItem(STAMP, String(Date.now())); localStorage.setItem(STAMP + '-last', at); } catch {}
  return { ok: true, wcl: !!data.wcl, wowaudit: !!data.wowaudit, changed, unmatched, at, errors: data.errors || [] };
}

export function lastSync() { try { return localStorage.getItem(STAMP + '-last') || ''; } catch { return ''; } }

// ── Vorschau ohne Worker: ein paar Abmeldungen und ein Log mit einem unbekannten Twink ──
function demoData(dates, players) {
  const today = todayIso();
  const act = players.filter(p => p.active !== false && (p.status === 'Core' || p.status === 'Rotation'));
  const past = dates.filter(d => d < today), future = dates.filter(d => d >= today);
  const days = {};
  future.slice(0, 2).forEach((d, i) => {
    days[d] = { log: null, signups: act.map((p, j) => ({ name: p.charName || p.name, realm: '', status: (j + i) % 9 === 3 ? 'Absent' : (j + i) % 11 === 5 ? 'Late' : 'Present' })) };
  });
  past.slice(-2).forEach((d, i) => {
    const sitting = new Set(act.filter((_, j) => (j + i) % 7 === 2).map(p => p.id));
    days[d] = {
      log: [...act.filter(p => !sitting.has(p.id)).slice(0, 20).map(p => ({ name: p.charName || p.name, server: '' })), ...(i ? [{ name: 'Zarthos', server: '' }] : [])],
      signups: act.map((p, j) => ({ name: p.charName || p.name, realm: '', status: (j + i) % 13 === 4 ? 'Absent' : 'Present' })),
    };
  });
  return { wcl: true, wowaudit: true, days, demo: true };
}
