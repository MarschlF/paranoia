// ─────────────────────────────────────────────────────────────
//  Warcraft Logs → Progress & Raid-Logs
//  GET /wcl?since=YYYY-MM-DD
//  Antwort: { configured, updated, encounters[], reports[] }
//  Ergebnis wird 10 Minuten zwischengespeichert.
//
//  Variablen:  WCL_GUILD_NAME, WCL_SERVER_SLUG, WCL_REGION
//  Secrets:    WCL_CLIENT_ID, WCL_CLIENT_SECRET
// ─────────────────────────────────────────────────────────────

const WCL = 'https://www.warcraftlogs.com';
const DIFF = { 3: 'Normal', 4: 'Heroic', 5: 'Mythic' };
const CACHE_SECONDS = 600;
let tokenCache = { token: null, exp: 0 };

const QUERY = `
query ($guild: String!, $server: String!, $region: String!, $start: Float!, $page: Int!) {
  reportData {
    reports(guildName: $guild, guildServerSlug: $server, guildServerRegion: $region,
            startTime: $start, limit: 25, page: $page) {
      has_more_pages
      data {
        code title startTime endTime
        fights(killType: Encounters) {
          encounterID name kill bossPercentage difficulty
        }
      }
    }
  }
}`;

export async function handleWcl(req, url, env, ctx, cors) {
  if (!env.WCL_CLIENT_ID || !env.WCL_CLIENT_SECRET || !env.WCL_GUILD_NAME) {
    return json({ configured: false }, cors);
  }
  const since = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('since') || '') ? url.searchParams.get('since') : null;
  if (!since) return json({ error: 'since fehlt (YYYY-MM-DD)' }, cors, 400);

  // Cache
  const cache = caches.default;
  const key = new Request(`${url.origin}/wcl-cache?since=${since}`);
  const hit = await cache.match(key);
  if (hit) return withCors(hit, cors);

  const reports = await fetchReports(env, Date.parse(`${since}T00:00:00Z`));
  const data = { configured: true, updated: new Date().toISOString(), ...summarize(reports) };

  const res = json(data, {}, 200, { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` });
  ctx.waitUntil(cache.put(key, res.clone()));
  return withCors(res, cors);
}

async function token(env) {
  if (tokenCache.token && Date.now() < tokenCache.exp) return tokenCache.token;
  const res = await fetch(`${WCL}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${env.WCL_CLIENT_ID}:${env.WCL_CLIENT_SECRET}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`WCL Token: ${res.status}`);
  const j = await res.json();
  tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in - 300) * 1000 };
  return tokenCache.token;
}

async function fetchReports(env, start) {
  const t = await token(env);
  const all = [];
  for (let page = 1; page <= 12; page++) {
    const res = await fetch(`${WCL}/api/v2/client`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: QUERY,
        variables: {
          guild: env.WCL_GUILD_NAME,
          server: env.WCL_SERVER_SLUG || 'todeswache',
          region: env.WCL_REGION || 'EU',
          start, page,
        },
      }),
    });
    const j = await res.json();
    if (j.errors) throw new Error('WCL: ' + j.errors.map(e => e.message).join('; '));
    const r = j.data.reportData.reports;
    all.push(...r.data);
    if (!r.has_more_pages) break;
  }
  return all;
}

/** Raidabende beginnen am Abend – Datum in Europe/Berlin aus dem Report-Start */
const berlinDate = ms => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date(ms));

export function summarize(reports) {
  const sorted = [...reports].sort((a, b) => a.startTime - b.startTime);
  const enc = new Map();
  const out = [];

  for (const r of sorted) {
    const date = berlinDate(r.startTime);
    const fights = r.fights || [];
    const perDiff = {};
    for (const f of fights) {
      const d = perDiff[f.difficulty] ||= { pulls: 0, kills: 0 };
      d.pulls++; if (f.kill) d.kills++;

      if (f.difficulty !== 5) continue;              // Progress = nur Mythic
      const e = enc.get(f.encounterID) || { id: f.encounterID, name: f.name, pulls: 0, kill: false, firstKill: '', pullsToKill: 0, bestPct: null, nights: [] };
      e.pulls++;
      // Prog-Kurve: pro Raidabend Pulls + bester Pull (0 = Kill)
      let n = e.nights.at(-1);
      if (!n || n.date !== date) { n = { date, pulls: 0, best: null, kill: false }; e.nights.push(n); }
      n.pulls++;
      const pct = f.kill ? 0 : (typeof f.bossPercentage === 'number' ? f.bossPercentage : null);
      if (pct != null) n.best = n.best == null ? pct : Math.min(n.best, pct);
      if (f.kill) n.kill = true;
      if (!e.kill) {
        if (f.kill) { e.kill = true; e.firstKill = date; e.pullsToKill = e.pulls; }
        else if (typeof f.bossPercentage === 'number') e.bestPct = e.bestPct == null ? f.bossPercentage : Math.min(e.bestPct, f.bossPercentage);
      }
      enc.set(f.encounterID, e);
    }
    const diffs = Object.keys(perDiff).map(Number).sort();
    out.push({
      code: r.code,
      title: r.title,
      date,
      url: `${WCL}/reports/${r.code}`,
      difficulty: diffs.length ? DIFF[Math.max(...diffs)] || '' : '',
      pulls: Object.fromEntries(Object.entries(perDiff).map(([k, v]) => [DIFF[k] || k, v])),
    });
  }

  return {
    encounters: [...enc.values()].map(e => ({
      ...e,
      bestPct: e.bestPct == null ? null : Math.round(e.bestPct * 10) / 10,
      nights: e.nights.map(n => ({ ...n, best: n.best == null ? null : Math.round(n.best * 10) / 10 })),
    })),
    reports: out.reverse(), // neueste zuerst
  };
}

function json(data, cors = {}, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors, ...extra } });
}
function withCors(res, cors) {
  const r = new Response(res.body, res);
  Object.entries(cors).forEach(([k, v]) => r.headers.set(k, v));
  return r;
}

// ─────────────────────────────────────────────────────────────
//  Defensive- & Consumable-Check für einen Report
//  GET /wcl/check?code=<report>&diff=5&a=<Fähigkeiten, kommagetrennt: Namen oder Spell-IDs>
//  Antwort: { code, pulls, abilities: {id: name}, players: [{ name, cls, pulls, deaths, firstDeaths, casts: {id: n} }] }
//  Abgeschlossene Reports werden 7 Tage, laufende 10 Minuten zwischengespeichert.
// ─────────────────────────────────────────────────────────────

const Q_REPORT = `
query ($code: String!) {
  reportData { report(code: $code) {
    startTime endTime
    masterData { actors(type: "Player") { id name subType } abilities { gameID name } }
    fights(killType: Encounters) { id difficulty kill startTime endTime friendlyPlayers }
  } }
}`;
const Q_EVENTS = `
query ($code: String!, $fights: [Int], $start: Float, $end: Float, $filter: String, $type: EventDataType) {
  reportData { report(code: $code) {
    events(fightIDs: $fights, startTime: $start, endTime: $end, dataType: $type,
           hostilityType: Friendlies, filterExpression: $filter, limit: 10000) { data nextPageTimestamp }
  } }
}`;

async function gql(env, query, variables) {
  const t = await token(env);
  const res = await fetch(`${WCL}/api/v2/client`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const j = await res.json();
  if (j.errors) throw new Error('WCL: ' + j.errors.map(e => e.message).join('; '));
  return j.data;
}

async function allEvents(env, vars) {
  const out = [];
  let start = vars.start;
  for (let i = 0; i < 30 && start != null; i++) {
    const d = await gql(env, Q_EVENTS, { ...vars, start });
    const ev = d.reportData.report.events;
    out.push(...(ev.data || []));
    start = ev.nextPageTimestamp ?? null;
  }
  return out;
}

export async function handleCheck(req, url, env, ctx, cors) {
  if (!env.WCL_CLIENT_ID || !env.WCL_CLIENT_SECRET) return json({ configured: false }, cors);
  const code = url.searchParams.get('code') || '';
  if (!/^[a-zA-Z0-9]{8,24}$/.test(code)) return json({ error: 'code ungültig' }, cors, 400);
  const diff = Number(url.searchParams.get('diff') || 5);
  if (![3, 4, 5].includes(diff)) return json({ error: 'diff ungültig' }, cors, 400);
  const list = [...new Set(String(url.searchParams.get('a') || '').split(',').map(s => s.trim()).filter(Boolean))];
  if (!list.length || list.length > 200 || list.some(s => s.length > 60 || /["\\]/.test(s))) return json({ error: 'Fähigkeitenliste ungültig' }, cors, 400);

  const cache = caches.default;
  const key = new Request(`${url.origin}/check-cache/${code}/${diff}/${await sha(list.sort().join('|'))}`);
  const hit = await cache.match(key);
  if (hit) return withCors(hit, cors);

  const rep = (await gql(env, Q_REPORT, { code })).reportData.report;
  if (!rep) return json({ error: 'Report nicht gefunden' }, cors, 404);
  const fights = (rep.fights || []).filter(f => f.difficulty === diff);
  const actors = new Map((rep.masterData?.actors || []).map(a => [a.id, a]));
  const names = new Map((rep.masterData?.abilities || []).map(a => [a.gameID, a.name]));

  const result = { configured: true, code, diff, pulls: fights.length, abilities: {}, players: [] };
  if (fights.length) {
    const ids = list.filter(s => /^\d+$/.test(s));
    const nms = list.filter(s => !/^\d+$/.test(s));
    const parts = [];
    if (ids.length) parts.push(`ability.id in (${ids.join(',')})`);
    if (nms.length) parts.push(`ability.name in (${nms.map(n => `"${n}"`).join(',')})`);
    const base = { code, fights: fights.map(f => f.id), start: rep.startTime, end: rep.endTime };

    const [casts, deaths] = await Promise.all([
      allEvents(env, { ...base, type: 'Casts', filter: `type = "cast" and (${parts.join(' or ')})` }),
      allEvents(env, { ...base, type: 'Deaths', filter: 'type = "death"' }),
    ]);

    const stats = new Map();
    const P = id => {
      const a = actors.get(id); if (!a) return null;
      if (!stats.has(id)) stats.set(id, { name: a.name, cls: a.subType, pulls: 0, deaths: 0, firstDeaths: 0, casts: {} });
      return stats.get(id);
    };
    for (const f of fights) for (const id of f.friendlyPlayers || []) { const p = P(id); if (p) p.pulls++; }
    for (const e of casts) {
      const p = P(e.sourceID); if (!p) continue;
      p.casts[e.abilityGameID] = (p.casts[e.abilityGameID] || 0) + 1;
      result.abilities[e.abilityGameID] ||= names.get(e.abilityGameID) || String(e.abilityGameID);
    }
    const firstByFight = new Map();
    for (const e of deaths) {
      const p = P(e.targetID); if (!p) continue;
      p.deaths++;
      const cur = firstByFight.get(e.fight);
      if (!cur || e.timestamp < cur.timestamp) firstByFight.set(e.fight, e);
    }
    for (const e of firstByFight.values()) { const p = P(e.targetID); if (p) p.firstDeaths++; }
    result.players = [...stats.values()].filter(p => p.pulls).sort((a, b) => a.name.localeCompare(b.name));
  }

  const finished = rep.endTime && Date.now() - rep.endTime > 3600000;
  const res = json(result, {}, 200, { 'Cache-Control': `public, max-age=${finished ? 604800 : 600}` });
  ctx.waitUntil(cache.put(key, res.clone()));
  return withCors(res, cors);
}

async function sha(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].slice(0, 12).map(x => x.toString(16).padStart(2, '0')).join('');
}
