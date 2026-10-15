// ─────────────────────────────────────────────────────────────
//  Raider.IO → Gear-Übersicht
//  GET /rio?c=todeswache/birki,todeswache/joul,…   (max. 40 Charaktere)
//  Jeder Charakter wird 30 Minuten zwischengespeichert.
//  Kein API-Key nötig (öffentliche Raider.IO-API).
// ─────────────────────────────────────────────────────────────

const RIO = 'https://raider.io/api/v1/characters/profile';
const FIELDS = 'gear,mythic_plus_scores_by_season:current,raid_progression';
const CACHE_SECONDS = 1800;
const MAX = 40;

export async function handleRio(req, url, env, ctx, cors) {
  const region = (env.RIO_REGION || 'eu').toLowerCase();
  const keys = [...new Set(String(url.searchParams.get('c') || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean))];
  if (!keys.length) return json({ error: 'c fehlt' }, cors, 400);
  if (keys.length > MAX) return json({ error: `max. ${MAX} Charaktere` }, cors, 400);
  // realm-slug/name – nur Buchstaben (inkl. Umlaute), Ziffern, Bindestrich
  if (!keys.every(k => /^[a-z0-9-]{2,40}\/[\p{L}]{2,12}$/u.test(k))) return json({ error: 'ungültiger Charakter' }, cors, 400);

  const out = {};
  // max. 8 gleichzeitig, damit Raider.IO nicht drosselt
  for (let i = 0; i < keys.length; i += 8) {
    await Promise.all(keys.slice(i, i + 8).map(async k => { out[k] = await one(region, k, url, ctx); }));
  }
  return json({ configured: true, updated: new Date().toISOString(), chars: out }, cors);
}

async function one(region, key, url, ctx) {
  const cache = caches.default;
  const ck = new Request(`${url.origin}/rio-cache/${region}/${encodeURIComponent(key)}`);
  const hit = await cache.match(ck);
  if (hit) return hit.json();

  const [realm, name] = key.split('/');
  const api = `${RIO}?region=${region}&realm=${encodeURIComponent(realm)}&name=${encodeURIComponent(name)}&fields=${FIELDS}`;
  let data;
  try {
    const res = await fetch(api, { headers: { 'User-Agent': 'Paranoia-Guild-Site' } });
    if (res.status === 400 || res.status === 404) data = { error: 'not_found' };
    else if (!res.ok) return { error: `rio_${res.status}` };       // nicht cachen, nächstes Mal neu versuchen
    else data = trim(await res.json());
  } catch { return { error: 'network' }; }

  ctx.waitUntil(cache.put(ck, new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${data.error ? 600 : CACHE_SECONDS}` },
  })));
  return data;
}

function trim(c) {
  const items = Object.entries(c.gear?.items || {}).map(([slot, it]) => ({
    slot,
    ilvl: it.item_level,
    name: it.name || '',
    id: it.item_id,
    enchant: !!it.enchant,
    gems: (it.gems || []).length,
  }));
  return {
    name: c.name,
    cls: c.class,
    spec: c.active_spec_name,
    ilvl: c.gear?.item_level_equipped ?? null,
    score: c.mythic_plus_scores_by_season?.[0]?.scores?.all ?? null,
    raid: Object.fromEntries(Object.entries(c.raid_progression || {}).map(([k, v]) => [k, v.summary])),
    items,
    url: c.profile_url,
    crawled: c.last_crawled_at,
  };
}

function json(data, cors = {}, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors } });
}
