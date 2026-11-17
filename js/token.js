// ─────────────────────────────────────────────────────────────
//  WoW-Token-Preis (EU) für die Startseite
//  Worker: GET /token → { price: Gold, updated: ISO, history: [[ms, Gold], …] (stündlich, 7 Tage) }
//  Demo: Beispielkurve. Ohne Worker-Endpunkt → null (Startseite zeigt dann wieder die Raidzeiten)
// ─────────────────────────────────────────────────────────────
import { CONFIG, DEMO_MODE } from './config.js';

const KEY = 'pn-token-v1', TTL = 10 * 60e3;

export async function getToken() {
  try { const c = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (c && Date.now() - c.at < TTL) return c.d; } catch {}
  let d = null;
  if (DEMO_MODE) d = demo();
  else {
    const base = (CONFIG.authWorkerUrl || '').replace(/\/$/, '');
    if (!base) return null;
    try { const r = await fetch(`${base}/token`); if (r.ok) d = await r.json(); } catch {}
    if (!d?.price) return null;
  }
  try { sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), d })); } catch {}
  return d;
}

/** Wert vor ~24 h aus dem Verlauf */
export function dayAgo(d) {
  const h = d?.history || []; if (h.length < 2) return null;
  const t = Date.now() - 24 * 3600e3;
  let best = null;
  for (const [ms, p] of h) if (ms <= t) best = p;
  return best ?? null;
}

/** Mini-Kurve als SVG */
export function sparkSvg(history, w = 260, h = 54) {
  const pts = (history || []).filter(x => x && x[1]);
  if (pts.length < 2) return '';
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = x => ((x - x0) / Math.max(1, x1 - x0)) * (w - 4) + 2;
  const Y = y => h - 4 - ((y - y0) / Math.max(1, y1 - y0)) * (h - 10);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(' ');
  const last = pts.at(-1);
  return `<svg class="tk-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="tkg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f5c451" stop-opacity=".35"/><stop offset="1" stop-color="#f5c451" stop-opacity="0"/></linearGradient></defs>
    <path d="${line} L${X(last[0]).toFixed(1)} ${h} L${X(pts[0][0]).toFixed(1)} ${h} Z" fill="url(#tkg)"/>
    <path d="${line}" fill="none" stroke="#f5c451" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
  </svg>`;
}

// Beispiel: 7 Tage stündlich, leichter Aufwärtstrend mit Schwankung
function demo() {
  const now = Date.now(), out = [];
  let p = 296000;
  for (let i = 168; i >= 0; i--) {
    p += Math.round((Math.sin(i / 9) * 900) + (Math.random() - 0.42) * 1500);
    out.push([now - i * 3600e3, Math.round(p / 100) * 100]);
  }
  return { price: out.at(-1)[1], updated: new Date(now - 12 * 60e3).toISOString(), history: out, demo: true };
}
