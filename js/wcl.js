// ─────────────────────────────────────────────────────────────
//  Warcraft Logs – Daten vom Worker holen und mit den Bossen verbinden
// ─────────────────────────────────────────────────────────────
import { CONFIG, DEMO_MODE } from './config.js';
import { raidDates, todayIso } from './ui.js';

let cache = { key: '', at: 0, promise: null };

/** Liefert { configured, updated, encounters[], reports[] } oder null */
export function getWcl(settings) {
  const since = settings?.startDate;
  if (!since) return Promise.resolve(null);
  const key = since;
  if (cache.key === key && Date.now() - cache.at < 120000) return cache.promise;

  const p = DEMO_MODE ? Promise.resolve(demoData(settings))
    : !CONFIG.authWorkerUrl ? Promise.resolve(null)
    : fetch(`${CONFIG.authWorkerUrl.replace(/\/$/, '')}/wcl?since=${since}`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null);
  cache = { key, at: Date.now(), promise: p };
  return p;
}

const norm = s => String(s || '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');

/** Boss aus der Datenbank mit WCL-Daten anreichern (manuelle Werte gewinnen, wenn "manual" gesetzt) */
export function mergeBoss(b, wcl) {
  if (b.manual || !wcl?.encounters?.length) return { ...b, source: 'manual' };
  const key = norm(b.wclName || b.name);
  const e = wcl.encounters.find(x => norm(x.name) === key)
    || wcl.encounters.find(x => key.length > 4 && (norm(x.name).includes(key) || key.includes(norm(x.name))));
  if (!e) return { ...b, source: 'manual' };
  return {
    ...b,
    source: 'wcl',
    status: e.kill ? 'kill' : 'prog',
    killDate: e.firstKill || '',
    pulls: e.kill ? e.pullsToKill : e.pulls,
    totalPulls: e.pulls,
    bestPct: e.kill ? '' : (e.bestPct ?? ''),
    nights: e.nights || [],
  };
}

// ── Beispieldaten für den Demo-Modus ────────────────────────
function demoData(settings) {
  const past = raidDates(settings).filter(d => d < todayIso());
  const at = i => past[Math.min(i, past.length - 1)] || settings.startDate;
  const code = (d, n) => `Demo${d.replace(/-/g, '')}${n}`;
  const reports = past.slice().reverse().map((d, i) => ({
    code: code(d, 'a'),
    title: i % 2 ? 'Paranøia Mythic Prog' : 'Paranøia Raid',
    date: d,
    url: 'https://www.warcraftlogs.com',
    difficulty: past.indexOf(d) < 4 ? 'Heroic' : 'Mythic',
    pulls: past.indexOf(d) < 4 ? { Heroic: { pulls: 11, kills: 8 } } : { Mythic: { pulls: 14 + (i % 5) * 3, kills: i % 3 === 0 ? 1 : 0 } },
    demo: true,
  }));
  const curve = (startIdx, n, from, kill) => past.slice(startIdx, startIdx + n).map((date, i, arr) => {
    const last = i === arr.length - 1;
    const best = kill && last ? 0 : Math.max(1, Math.round((from * Math.pow(0.78, i) + (i % 3 === 1 ? 6 : 0)) * 10) / 10);
    return { date, pulls: 8 + ((i * 7 + startIdx) % 11), best, kill: kill && last };
  });
  const encs = [
    { id: 1, name: 'Entombed Sentinels', kill: true, firstKill: at(5), pullsToKill: 23, pulls: 27, bestPct: 3.1, nights: curve(4, 2, 22, true) },
    { id: 2, name: 'Vashnik the Malignant', kill: true, firstKill: at(8), pullsToKill: 41, pulls: 44, bestPct: 1.8, nights: curve(5, 4, 48, true) },
    { id: 3, name: 'The Lost Explorers', kill: true, firstKill: at(11), pullsToKill: 37, pulls: 39, bestPct: 6.2, nights: curve(8, 4, 55, true) },
    { id: 4, name: 'Sszorak', kill: false, firstKill: '', pullsToKill: 0, pulls: 58, bestPct: 18.4, nights: curve(11, 5, 71, false) },
  ];
  const lastS = encs[3].nights.at(-1); if (lastS) lastS.best = 18.4;
  encs.forEach(e => { if (e.kill && e.nights.length) e.firstKill = e.nights.at(-1).date; });
  return {
    configured: true,
    demo: true,
    updated: new Date().toISOString(),
    encounters: encs,
    reports,
  };
}
