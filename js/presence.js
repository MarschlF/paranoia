// ─────────────────────────────────────────────────────────────
//  Online-Status: eingeloggte Nutzer melden sich jede Minute
//  presence/<uid> { name, avatar, at }
//  · jeder schreibt nur sein eigenes Dokument · lesen nur Offis
//  · im Hintergrund-Tab pausiert die Meldung
// ─────────────────────────────────────────────────────────────
import { store, auth } from './store.js';
import { matchPlayer } from './ui.js';

export const ONLINE_MS = 2.5 * 60 * 1000;
export const isOnline = d => d?.at && Date.now() - Date.parse(d.at) < ONLINE_MS;

let timer = null, current = null;
async function ping() {
  const u = auth.user;
  if (!u?.member || document.visibilityState !== 'visible') return;
  try { await store.set('presence', u.uid, { name: u.name || 'Discord', avatar: u.avatar || '', at: new Date().toISOString() }); }
  catch { /* egal – nächster Versuch in einer Minute */ }
}
/** Nach Login starten, bei Logout stoppen */
export function startPresence(u) {
  if (current === (u?.uid || null)) return;
  current = u?.uid || null;
  clearInterval(timer); timer = null;
  if (!u?.member) return;
  ping();
  timer = setInterval(ping, 60000);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') ping(); });

/** Presence-Dokument → Roster-Spieler (Offi-Zuordnung aus guideReads, sonst Name) */
export function presencePlayer(d, players, reads = []) {
  const mapped = reads.find(r => r.id === d.id && r.playerId);
  return (mapped && players.find(p => p.id === mapped.playerId)) || matchPlayer(players.filter(p => p.active !== false), d.name);
}

export function ago(iso) {
  if (!iso) return 'nie';
  const m = (Date.now() - Date.parse(iso)) / 60000;
  if (m < 2.5) return 'online';
  if (m < 60) return `vor ${Math.round(m)} Min.`;
  if (m < 60 * 24) return `vor ${Math.round(m / 60)} Std.`;
  const d = Math.round(m / 60 / 24);
  return d === 1 ? 'gestern' : `vor ${d} Tagen`;
}
