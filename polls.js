// ─────────────────────────────────────────────────────────────
//  Umfragen – Datenmodell & Helfer
//  polls/<id>        { title, desc, questions:[{ id, type, label, options[], required, max }], open, created, by }
//  pollAnswers/<pollId>__<uid> { pollId, uid, name, answers:{ qid: value }, at }
//  · Umfrage lesen: alle Raider · anlegen/ändern: Offis
//  · Antworten: jeder nur seine eigene · Offis alle
// ─────────────────────────────────────────────────────────────
import { store, auth } from './store.js';

export const QTYPES = {
  single:   { label: 'Einfachauswahl',   icon: '◉', options: true },
  multi:    { label: 'Mehrfachauswahl',  icon: '☑', options: true },
  text:     { label: 'Kurze Antwort',    icon: '—' },
  longtext: { label: 'Absatz',           icon: '¶' },
  scale:    { label: 'Skala',            icon: '1–5' },
};

export const answerId = (pollId, uid = auth.user?.uid) => `${pollId}__${uid}`;

/** Eigene Antwort zu einer Umfrage beobachten (Raider dürfen nur die eigene lesen) */
export function watchMyAnswer(pollId, cb) {
  if (!auth.user?.uid) { cb(null); return () => {}; }
  return store.watchDoc('pollAnswers', answerId(pollId), cb, () => cb(null));
}

export async function saveAnswer(poll, answers) {
  const u = auth.user;
  await store.set('pollAnswers', answerId(poll.id, u.uid), { pollId: poll.id, uid: u.uid, name: u.name || 'Discord', answers, at: new Date().toISOString() });
}

/** Ist eine Antwort vollständig? → Liste fehlender Pflichtfragen */
export function missingRequired(poll, answers) {
  return (poll.questions || []).filter(q => q.required && isEmpty(answers?.[q.id]));
}
export const isEmpty = v => v == null || v === '' || (Array.isArray(v) && !v.length);

/** Antwort als lesbarer Text */
export function answerText(q, v) {
  if (isEmpty(v)) return '–';
  if (Array.isArray(v)) return v.join(', ');
  if (q.type === 'scale') return `${v} / ${q.max || 5}`;
  return String(v);
}

export const newId = () => Math.random().toString(36).slice(2, 9);
