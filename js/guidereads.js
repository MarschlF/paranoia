// ─────────────────────────────────────────────────────────────
//  Guide-Lesebestätigung
//  guideReads/<uid> { name, playerId?, reads: { <bossId>: { at, v } } }
//  · jeder Raider schreibt nur sein eigenes Dokument (Firestore-Regeln)
//  · guides/<bossId>.version  → "Wichtige Änderung" erhöht sie, alte Bestätigungen zählen dann nicht mehr
//  · guides/<bossId>.quiz     → optional [{ q, a: [..], c: <richtiger Index> }]
// ─────────────────────────────────────────────────────────────
import { store, auth } from './store.js';
import { esc, h, openModal, toast, clsColor, specImg, sortPlayers } from './ui.js';

export const MIN_SECONDS = 30;
export const RUF = `<span class="ruf" title="Noch nicht bestätigt" aria-label="ungelesen">!</span>`;

export const hasGuide = g => !!g && Object.values(g.sections || {}).some(t => t && t.trim());
export const guideVersion = g => Number(g?.version || 1);

/** Hat der aktuelle Nutzer diesen Guide (in der aktuellen Version) bestätigt? */
export function isRead(myDoc, bossId, guide) {
  const r = myDoc?.reads?.[bossId];
  return !!r && Number(r.v || 1) >= guideVersion(guide);
}

/** Eigenes Lese-Dokument beobachten (Raider dürfen nur das eigene lesen) */
export function watchMine(cb) {
  const uid = auth.user?.uid;
  if (!uid) { cb(null); return () => {}; }
  return store.watchDoc('guideReads', uid, cb, () => cb(null));
}

/** Bestätigung speichern */
export async function confirmRead(myDoc, bossId, guide) {
  const u = auth.user;
  const reads = { ...(myDoc?.reads || {}), [bossId]: { at: new Date().toISOString(), v: guideVersion(guide) } };
  await store.set('guideReads', u.uid, { name: u.name || 'Discord', reads });
}

/** Lese-Dokument → Roster-Spieler (Offi-Zuordnung > Name = Charaktername/Name) */
export function playerFor(doc, players) {
  if (doc.playerId) return players.find(p => p.id === doc.playerId) || null;
  const n = String(doc.name || '').trim().toLowerCase();
  return players.find(p => String(p.charName || '').toLowerCase() === n || String(p.name).toLowerCase() === n) || null;
}

/** Status eines Guides für Offis → { read: [{p, doc, at, old}], missing: [p], unmatched: [doc] } */
export function readStatus(bossId, guide, allReads, players) {
  const active = players.filter(p => p.active !== false);
  const v = guideVersion(guide);
  const read = [], unmatched = [], seen = new Set();
  for (const d of allReads) {
    const r = d.reads?.[bossId];
    const p = playerFor(d, active);
    if (!p) { if (r) unmatched.push(d); continue; }
    if (!r || seen.has(p.id)) continue;
    seen.add(p.id);
    read.push({ p, doc: d, at: r.at, old: Number(r.v || 1) < v });
  }
  const ok = new Set(read.filter(x => !x.old).map(x => x.p.id));
  const missing = sortPlayers(active.filter(p => !ok.has(p.id)));
  return { read, missing, unmatched, total: active.length, done: ok.size };
}

/** Offi-Modal: wer hat gelesen, wer fehlt, Discord-Namen zuordnen */
export function openReadStatus(boss, guide, allReads, players) {
  const body = h('<div></div>');
  const { close } = openModal({ title: `Gelesen · ${boss?.name || ''}`, body, wide: true });
  let reads = allReads;
  const fmt = iso => iso ? new Date(iso).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const chip = p => `<span class="abs-pill" style="--cls:${clsColor(p.klasse)}">${specImg(p, 16)}${esc(p.name)}</span>`;

  function draw() {
    const s = readStatus(boss.id, guide, reads, players);
    const okList = s.read.filter(x => !x.old).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const oldIds = new Set(s.read.filter(x => x.old).map(x => x.p.id));
    body.innerHTML = `
      <div class="gr-head"><b>${s.done}</b> von ${s.total} aktiven Spielern haben bestätigt${guideVersion(guide) > 1 ? ` <span class="muted">· Version ${guideVersion(guide)}</span>` : ''}${guide?.quiz?.length ? ` <span class="muted">· mit Quiz (${guide.quiz.length} Fragen)</span>` : ''}</div>
      <div class="progress-track" style="margin:10px 0 18px"><div class="progress-fill" style="width:${s.total ? s.done / s.total * 100 : 0}%"></div></div>
      <div class="gr-cols">
        <div><div class="comp-section-title">Fehlt (${s.missing.length})</div>
          <div class="abs-claims">${s.missing.map(p => chip(p) + (oldIds.has(p.id) ? '<small class="muted gr-old">alte Version</small>' : '')).join('') || '<span class="abs-all">Alle haben gelesen ✓</span>'}</div></div>
        <div><div class="comp-section-title">Bestätigt (${okList.length})</div>
          ${okList.map(x => `<div class="side-row"><span>${chip(x.p)}</span><span class="muted">${fmt(x.at)}</span></div>`).join('') || '<span class="muted">Noch niemand.</span>'}</div>
      </div>
      ${s.unmatched.length ? `<div class="rc-unknown" style="margin-top:18px"><div class="comp-section-title" style="margin-bottom:8px">Discord-Namen ohne Roster-Spieler – einmal zuordnen (gilt für alle Guides)</div>
        ${s.unmatched.map(d => `<div class="rc-map"><span>${esc(d.name || d.id)}</span><select class="select" data-map="${esc(d.id)}"><option value="">– wählen –</option>${sortPlayers(players.filter(p => p.active !== false)).map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></div>`).join('')}</div>` : ''}`;
    body.querySelectorAll('[data-map]').forEach(sel => sel.onchange = async () => {
      if (!sel.value) return;
      await store.set('guideReads', sel.dataset.map, { playerId: sel.value });
      reads = reads.map(d => d.id === sel.dataset.map ? { ...d, playerId: sel.value } : d);
      toast('Zugeordnet'); draw();
    });
  }
  draw();
  return close;
}

/** Quiz-Editor-Text ⇄ Daten.  Format pro Frage:
 *  ? Frage
 *  * richtige Antwort
 *  - falsche Antwort
 */
export function quizToText(quiz = []) {
  return quiz.map(q => [`? ${q.q}`, ...q.a.map((a, i) => `${i === q.c ? '*' : '-'} ${a}`)].join('\n')).join('\n\n');
}
export function textToQuiz(text) {
  const out = []; let cur = null;
  for (const raw of String(text || '').split('\n')) {
    const l = raw.trim(); if (!l) continue;
    if (l.startsWith('?')) { cur = { q: l.slice(1).trim(), a: [], c: -1 }; out.push(cur); }
    else if (cur && (l.startsWith('*') || l.startsWith('-'))) { if (l.startsWith('*')) cur.c = cur.a.length; cur.a.push(l.slice(1).trim()); }
  }
  const bad = out.find(q => !q.q || q.a.length < 2 || q.c < 0);
  if (bad) throw new Error(`Frage „${bad.q || '?'}“: mindestens 2 Antworten und genau eine mit * markieren`);
  return out.slice(0, 10);
}
