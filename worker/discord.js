// ─────────────────────────────────────────────────────────────
//  Comp-Bild direkt in einen Discord-Channel posten (Webhook)
//  POST /discord/comp   (multipart: file, content, replace)
//  Authorization: Bearer <Firebase-ID-Token>  → nur Offiziere
//
//  Secret: DISCORD_WEBHOOK_URL  (Channel → Integrationen → Webhooks)
//  Var:    FIREBASE_PROJECT_ID  (optional, sonst aus FIREBASE_CLIENT_EMAIL)
// ─────────────────────────────────────────────────────────────

const JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let jwksCache = { keys: null, exp: 0 };

export async function handleDiscordComp(req, env, cors) {
  if (req.method !== 'POST') return json({ error: 'POST erwartet' }, cors, 405);
  if (!env.DISCORD_WEBHOOK_URL) return json({ error: 'webhook_missing' }, cors, 501);

  // 1) Nur Offiziere
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const claims = await verifyFirebaseToken(token, env).catch(() => null);
  if (!claims?.officer) return json({ error: 'forbidden' }, cors, 403);

  // 2) Daten prüfen
  const form = await req.formData();
  const file = form.get('file');
  const content = String(form.get('content') || '').slice(0, 500);
  const replace = String(form.get('replace') || '');
  if (!file || typeof file === 'string' || file.size > 8 * 1024 * 1024 || !/^image\/(png|webp|jpeg)$/.test(file.type)) {
    return json({ error: 'Bild fehlt oder zu groß' }, cors, 400);
  }

  const hook = env.DISCORD_WEBHOOK_URL.replace(/\/$/, '');
  // 3) Optional: vorherigen Post des Webhooks löschen (Comp wurde korrigiert)
  if (/^\d{15,22}$/.test(replace)) await fetch(`${hook}/messages/${replace}`, { method: 'DELETE' }).catch(() => {});

  // 4) Posten
  const out = new FormData();
  out.append('payload_json', JSON.stringify({
    content,
    username: env.DISCORD_WEBHOOK_NAME || 'Paranøia',
    allowed_mentions: { parse: [] },            // kein versehentliches @everyone
    attachments: [{ id: 0, filename: 'comp.png' }],
  }));
  out.append('files[0]', file, 'comp.png');
  const res = await fetch(`${hook}?wait=true`, { method: 'POST', body: out });
  if (!res.ok) return json({ error: `discord_${res.status}` }, cors, 502);
  const msg = await res.json();
  return json({ ok: true, id: msg.id, by: claims.name || '' }, cors);
}

// ── Firebase-ID-Token prüfen (RS256, Google-Schlüssel) ───────
export async function verifyFirebaseToken(token, env) {
  const [h, p, s] = token.split('.');
  if (!s) throw new Error('kein Token');
  const header = JSON.parse(dec(h)), payload = JSON.parse(dec(p));
  const project = env.FIREBASE_PROJECT_ID || String(env.FIREBASE_CLIENT_EMAIL || '').split('@')[1]?.split('.')[0];
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== 'RS256') throw new Error('alg');
  if (payload.aud !== project || payload.iss !== `https://securetoken.google.com/${project}`) throw new Error('aud/iss');
  if (payload.exp < now || payload.iat > now + 300) throw new Error('abgelaufen');

  if (!jwksCache.keys || Date.now() > jwksCache.exp) {
    const r = await fetch(JWKS);
    jwksCache = { keys: (await r.json()).keys, exp: Date.now() + 3600000 };
  }
  const jwk = jwksCache.keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('kid');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bytes(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new Error('Signatur');
  return payload;
}

const b64 = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return s; };
const dec = s => new TextDecoder().decode(bytes(s));
const bytes = s => Uint8Array.from(atob(b64(s)), c => c.charCodeAt(0));
function json(data, cors = {}, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors } });
}
