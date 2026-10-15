// ─────────────────────────────────────────────────────────────
//  Paranøia Auth-Worker (Cloudflare)
//  Discord-Login → prüft Mitgliedschaft auf dem Gilden-Discord
//  → erstellt ein Firebase Custom Token (member / officer)
//
//  Variablen (wrangler.toml [vars]):
//    DISCORD_CLIENT_ID, DISCORD_GUILD_ID, OFFICER_ROLE_IDS, ADMIN_DISCORD_IDS,
//    ALLOWED_REDIRECTS, FIREBASE_CLIENT_EMAIL
//  Secrets (wrangler secret put …):
//    DISCORD_CLIENT_SECRET, FIREBASE_PRIVATE_KEY
//
//  Zusätzlich: GET /wcl        → Progress & Logs aus Warcraft Logs (wcl.js)
//              GET /wcl/check  → Defensive-/Consumable-Check pro Report (wcl.js)
//              GET /rio        → Gear & Scores von Raider.IO (rio.js)
//              POST /discord/comp → Comp-Bild in Discord posten (discord.js, nur Offis)
//              GET /wowaudit/week → M+ Keys der Woche aus wowaudit (wowaudit.js, nur Offis)
// ─────────────────────────────────────────────────────────────

import { handleWcl, handleCheck } from './wcl.js';
import { handleRio } from './rio.js';
import { handleDiscordComp } from './discord.js';
import { handleWowauditWeek } from './wowaudit.js';

const DISCORD = 'https://discord.com/api/v10';
const list = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const cors = corsHeaders(req, env);
    try {
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      if (url.pathname === '/login') return login(url, env);
      if (url.pathname === '/callback') return await callback(req, url, env);
      if (url.pathname === '/wcl') return await handleWcl(req, url, env, ctx, cors);
      if (url.pathname === '/wcl/check') return await handleCheck(req, url, env, ctx, cors);
      if (url.pathname === '/rio') return await handleRio(req, url, env, ctx, cors);
      if (url.pathname === '/discord/comp') return await handleDiscordComp(req, env, cors);
      if (url.pathname === '/wowaudit/week') return await handleWowauditWeek(req, url, env, ctx, cors);
      return new Response('Paranøia Auth läuft ✓', { status: 200 });
    } catch (err) {
      console.error(err);
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
    }
  },
};

// ── /login ──────────────────────────────────────────────────
function login(url, env) {
  const redirect = url.searchParams.get('redirect') || '';
  if (!isAllowed(redirect, env)) return new Response('Redirect nicht erlaubt: ' + redirect, { status: 400 });

  const nonce = crypto.randomUUID();
  const state = `${nonce}.${b64url(new TextEncoder().encode(redirect))}`;
  const auth = new URL('https://discord.com/oauth2/authorize');
  auth.search = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    response_type: 'code',
    redirect_uri: `${url.origin}/callback`,
    scope: 'identify guilds.members.read',
    state,
    prompt: 'none',
  });
  return new Response(null, {
    status: 302,
    headers: {
      Location: auth.toString(),
      'Set-Cookie': `pn_state=${nonce}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
}

// ── /callback ───────────────────────────────────────────────
async function callback(req, url, env) {
  const state = url.searchParams.get('state') || '';
  const [nonce, encRedirect] = state.split('.');
  const redirect = encRedirect ? new TextDecoder().decode(fromB64url(encRedirect)) : '';
  if (!isAllowed(redirect, env)) return new Response('Ungültiger Redirect', { status: 400 });

  const back = (hash) => new Response(null, {
    status: 302,
    headers: { Location: `${redirect}#${hash}`, 'Set-Cookie': 'pn_state=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax' },
  });

  const cookie = (req.headers.get('Cookie') || '').match(/pn_state=([^;]+)/)?.[1];
  if (!nonce || cookie !== nonce) return back('auth_error=state');

  const code = url.searchParams.get('code');
  if (!code) return back('auth_error=denied');

  // Code gegen Access Token tauschen
  const tokenRes = await fetch(`${DISCORD}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${url.origin}/callback`,
    }),
  });
  if (!tokenRes.ok) return back('auth_error=token');
  const { access_token } = await tokenRes.json();
  const headers = { Authorization: `Bearer ${access_token}` };

  // Benutzer + Mitgliedschaft auf dem Gilden-Discord
  const user = await (await fetch(`${DISCORD}/users/@me`, { headers })).json();
  const memberRes = await fetch(`${DISCORD}/users/@me/guilds/${env.DISCORD_GUILD_ID}/member`, { headers });
  if (memberRes.status === 404) return back('auth_error=not_member');
  if (!memberRes.ok) return back('auth_error=member_check');
  const member = await memberRes.json();

  const officer =
    list(env.ADMIN_DISCORD_IDS).includes(user.id) ||
    (member.roles || []).some(r => list(env.OFFICER_ROLE_IDS).includes(r));

  const avatar = member.avatar
    ? `https://cdn.discordapp.com/guilds/${env.DISCORD_GUILD_ID}/users/${user.id}/avatars/${member.avatar}.png?size=64`
    : user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` : '';

  const token = await firebaseCustomToken(env, `discord:${user.id}`, {
    member: true,
    officer,
    name: member.nick || user.global_name || user.username,
    avatar,
  });
  return back(`auth=${encodeURIComponent(token)}`);
}

// ── Firebase Custom Token (RS256, Service Account) ──────────
async function firebaseCustomToken(env, uid, claims) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    sub: env.FIREBASE_CLIENT_EMAIL,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat: now,
    exp: now + 3600,
    uid,
    claims,
  };
  const enc = obj => b64url(new TextEncoder().encode(JSON.stringify(obj)));
  const unsigned = `${enc(header)}.${enc(payload)}`;

  const pem = String(env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, '\n');
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${b64url(new Uint8Array(sig))}`;
}

// ── Helfer ──────────────────────────────────────────────────
function corsHeaders(req, env) {
  const origin = req.headers.get('Origin') || '';
  const ok = list(env.ALLOWED_REDIRECTS).some(a => { try { return new URL(a).origin === origin; } catch { return false; } });
  return ok ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', Vary: 'Origin' } : {};
}
function isAllowed(redirect, env) {
  try {
    const u = new URL(redirect);
    return list(env.ALLOWED_REDIRECTS).some(a => {
      const allowed = new URL(a);
      return u.origin === allowed.origin && u.pathname.startsWith(allowed.pathname);
    });
  } catch { return false; }
}
function b64url(bytes) {
  let s = ''; bytes.forEach(b => s += String.fromCharCode(b));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}
