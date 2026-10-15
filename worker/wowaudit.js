// ─────────────────────────────────────────────────────────────
//  wowaudit → Wochen-Check (M+ Keys pro Spieler und Woche)
//  GET /wowaudit/week?period=<n>     (ohne period = aktuelle Woche)
//  Authorization: Bearer <Firebase-ID-Token>  → nur Offiziere
//
//  Secret: WOWAUDIT_API_KEY   (wowaudit → Team Settings → API)
//  Antwort: { configured, period, current, characters: [{ name, realm, keys: [Level…], extra: {…} }] }
//  Zwischenspeicher: 15 Minuten
// ─────────────────────────────────────────────────────────────
import { verifyFirebaseToken } from './discord.js';

const BASE = 'https://wowaudit.com/v1';
const CACHE_SECONDS = 900;

export async function handleWowauditWeek(req, url, env, ctx, cors) {
  if (!env.WOWAUDIT_API_KEY) return json({ configured: false }, cors);
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const claims = await verifyFirebaseToken(token, env).catch(() => null);
  if (!claims?.officer) return json({ error: 'forbidden' }, cors, 403);

  const api = path => cached(`${BASE}${path}`, env, url, ctx);
  const period = await api('/period');
  const current = Number(period.current_period);
  const want = url.searchParams.has('period') ? Number(url.searchParams.get('period')) : current;
  if (!Number.isInteger(want) || want < 1 || want > current) return json({ error: 'period ungültig' }, cors, 400);

  const [chars, hist] = await Promise.all([api('/characters'), api(`/historical_data?period=${want}`)]);
  const byId = new Map((Array.isArray(chars) ? chars : chars.characters || []).map(c => [c.id, c]));

  const characters = (hist.characters || []).map(c => {
    const info = byId.get(c.id) || {};
    const d = c.data || {};
    // Zusätzliche Zahlenwerte (z. B. Weltinhalte) unverändert durchreichen – die Seite zeigt, was da ist
    const extra = Object.fromEntries(Object.entries(d).filter(([k, v]) => k !== 'dungeons_done' && (typeof v === 'number' || typeof v === 'boolean')));
    return {
      name: info.name || c.name || '',
      realm: info.realm || c.realm || '',
      keys: (d.dungeons_done || []).map(x => Number(x.level || 0)).filter(Boolean).sort((a, b) => b - a),
      extra,
    };
  }).filter(c => c.name);

  return json({ configured: true, period: want, current, characters }, cors);
}

async function cached(target, env, url, ctx) {
  const cache = caches.default;
  const key = new Request(`${url.origin}/wowaudit-cache/${encodeURIComponent(target)}`);
  const hit = await cache.match(key);
  if (hit) return hit.json();
  const res = await fetch(target, { headers: { Authorization: env.WOWAUDIT_API_KEY, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`wowaudit ${res.status}`);
  const data = await res.json();
  ctx.waitUntil(cache.put(key, new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_SECONDS}` } })));
  return data;
}

function json(data, cors = {}, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors } });
}
