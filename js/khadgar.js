// ─────────────────────────────────────────────────────────────
//  Khadgar – Gilden-Maskottchen für die Hinweise unten links (gleicher Name wie der Discord-Webhook)
//  Sprüche pro Anlass; pro Hinweis immer derselbe Spruch (aus dem Schlüssel berechnet), damit nichts springt
// ─────────────────────────────────────────────────────────────
export const KHADGAR_IMG = 'assets/khadgar.webp';

const Q = {
  poll: [
    'Die Offiziere verlangen nach deiner Meinung, Abenteurer.',
    'Selbst die Kirin Tor stimmen ab. Du kannst es auch.',
    'Eine Umfrage. Kürzer als jeder Trashpull, versprochen.',
    'Ich sah in die Zukunft. Du hast diese Umfrage ausgefüllt. Enttäusch mich nicht.',
  ],
  guide: [
    'Wissen ist die mächtigste Waffe. Gleich nach einem Flask.',
    '{boss} wartet nicht auf jene, die unvorbereitet kommen.',
    'Ich habe tausend Bücher in Karazhan gelesen. Du schaffst diesen einen Guide.',
    'Lies den Guide, bevor {boss} dich die Mechanik lehrt.',
  ],
  guideChanged: [
    'Die Taktik für {boss} hat sich gewandelt. Lies erneut, Lehrling.',
    'Neue Erkenntnisse zu {boss}. Selbst ich lerne nie aus.',
  ],
};
const TIPS = [
  'Ein Healthstone in Not rettet mehr Leben als jeder Heiler.',
  'Wer im Feuer steht, hat sich für das Feuer entschieden.',
  'Augment-Rune, Flask, Food. Die drei heiligen Pflichten.',
  'Ich war schon in Draenor, in der Zukunft und im Nether. Nirgends hat jemand den Raidbeginn verpasst. Außer bei uns.',
  'Lies die Debuffs. Die Debuffs lesen dich auch.',
  'Bevor du im Discord „was war das?“ fragst: Warcraft Logs weiß es.',
  'Ein guter Raider kennt die Mechanik. Ein großer Raider kennt sie, bevor der Pull startet.',
  'Die Vault füllt sich nicht von allein. Drei Keys die Woche, Abenteurer.',
];

const hash = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7) >>> 0;
const fill = (t, v = {}) => t.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m);

/** Spruch für einen Hinweis (stabil pro Schlüssel) */
export function quote(type, key, vars) {
  const list = Q[type] || Q.poll;
  return fill(list[hash(key) % list.length], vars);
}
/** Zufälliger Tipp beim Klick auf Khadgar */
let last = -1;
export function tip() {
  let i; do { i = Math.floor(Math.random() * TIPS.length); } while (i === last && TIPS.length > 1);
  last = i; return TIPS[i];
}
