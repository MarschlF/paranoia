// ─────────────────────────────────────────────────────────────
//  Prog-Kurve: bester Pull (Boss-HP %) und Pulls pro Raidabend
//  Daten: boss.nights = [{ date, pulls, best, kill }] aus Warcraft Logs
// ─────────────────────────────────────────────────────────────
import { fmtDate, fmtShort, parseIso, WD, openModal } from './ui.js';

const pctTxt = v => `${Number(v).toLocaleString('de-AT', { maximumFractionDigits: 1 })} %`;

/** SVG-Diagramm. mini = kleine Sparkline ohne Achsen */
export function progChartSvg(nights, { mini = false } = {}) {
  if (!nights.length) return '';
  const W = mini ? 300 : 720, H = mini ? 56 : 280;
  const pad = mini ? { l: 4, r: 4, t: 6, b: 6 } : { l: 46, r: 46, t: 18, b: 44 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const n = nights.length;
  const maxPulls = Math.max(1, ...nights.map(d => d.pulls || 0));
  const barW = mini ? Math.max(4, Math.min(14, iw / n * 0.35)) : Math.max(6, Math.min(34, iw / n * 0.5));
  const inset = mini ? barW / 2 + 4 : Math.max(barW / 2 + 6, 28);   // Abstand zu den Achsen
  const x = i => pad.l + inset + (n === 1 ? (iw - 2 * inset) / 2 : (i / (n - 1)) * (iw - 2 * inset));
  const y = v => pad.t + (1 - v / 100) * ih;          // 100 % oben, 0 % (Kill) unten

  let out = `<svg class="prog-svg ${mini ? 'mini' : ''}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Prog-Kurve">`;
  if (!mini) {
    // Gitter + Achsen
    for (const g of [0, 25, 50, 75, 100]) {
      out += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(g)}" y2="${y(g)}" class="pg-grid"/>`;
      out += `<text x="${pad.l - 8}" y="${y(g) + 4}" class="pg-axis" text-anchor="end">${g}%</text>`;
    }
    out += `<text x="${W - pad.r + 8}" y="${pad.t + 4}" class="pg-axis">${maxPulls}</text>`;
    out += `<text x="${W - pad.r + 8}" y="${pad.t + 18}" class="pg-axis pg-axis-pulls">Pulls</text>`;
  }
  // Pull-Balken (rechte Skala)
  nights.forEach((d, i) => {
    const bh = (d.pulls || 0) / maxPulls * ih * (mini ? 0.4 : 0.45);
    out += `<rect x="${x(i) - barW / 2}" y="${pad.t + ih - bh}" width="${barW}" height="${bh}" rx="3" class="pg-bar"><title>${fmtDate(d.date)}: ${d.pulls} Pulls</title></rect>`;
  });
  // Linie bester Pull
  const line = nights.map((d, i) => ({ i, v: d.kill ? 0 : d.best })).filter(p => p.v != null);
  if (line.length) {
    const path = line.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
    const area = `${path} L${x(line.at(-1).i).toFixed(1)},${y(0)} L${x(line[0].i).toFixed(1)},${y(0)} Z`;
    out += `<path d="${area}" class="pg-area"/><path d="${path}" class="pg-line"/>`;
    line.forEach(p => {
      const d = nights[p.i];
      out += `<circle cx="${x(p.i)}" cy="${y(p.v)}" r="${mini ? 3 : d.kill ? 7 : 4.5}" class="${d.kill ? 'pg-kill' : 'pg-dot'}"><title>${fmtDate(d.date)}: ${d.kill ? 'Kill' : 'bester Pull ' + pctTxt(d.best)} · ${d.pulls} Pulls</title></circle>`;
      if (!mini) {
        out += d.kill
          ? `<text x="${x(p.i)}" y="${y(0) + 4}" class="pg-kill-txt" text-anchor="middle">✓</text>`
          : `<text x="${x(p.i)}" y="${y(p.v) - 10}" class="pg-val" text-anchor="middle">${pctTxt(d.best)}</text>`;
      }
    });
  }
  if (!mini) {
    const step = Math.ceil(n / 12);
    nights.forEach((d, i) => {
      if (i % step && i !== n - 1) return;
      out += `<text x="${x(i)}" y="${H - pad.b + 18}" class="pg-axis" text-anchor="middle">${WD[parseIso(d.date).getDay()]} ${fmtShort(d.date)}</text>`;
    });
  }
  return out + '</svg>';
}

/** Modal mit großer Kurve + Kennzahlen */
export function openProgCurve(boss) {
  const ns = boss.nights || [];
  const pulls = ns.reduce((a, d) => a + (d.pulls || 0), 0);
  const bests = ns.filter(d => d.best != null && !d.kill).map(d => d.best);
  const best = bests.length ? Math.min(...bests) : null;
  const kill = ns.find(d => d.kill);
  const last2 = ns.filter(d => d.best != null && !d.kill).slice(-2);
  const delta = last2.length === 2 ? last2[1].best - last2[0].best : null;
  const body = `
    <div class="pg-stats">
      <div><span>Abende</span><b>${ns.length}</b></div>
      <div><span>Pulls</span><b>${pulls}</b></div>
      <div><span>${kill ? 'Kill' : 'Bester Pull'}</span><b class="${kill ? 'ok' : 'gold'}">${kill ? fmtDate(kill.date) : best != null ? pctTxt(best) : '–'}</b></div>
      ${!kill && delta != null ? `<div><span>Letzter Abend</span><b class="${delta < 0 ? 'ok' : 'bad'}">${delta < 0 ? '▼ ' : '▲ '}${pctTxt(Math.abs(delta))}</b></div>` : ''}
    </div>
    <div class="pg-wrap">${progChartSvg(ns)}</div>
    <p class="hint" style="margin-top:8px">Linie = bester Pull des Abends (Boss-HP, weiter unten = besser) · Balken = Anzahl Pulls · ✓ = Kill. Nur Mythic, automatisch aus Warcraft Logs.</p>`;
  openModal({ title: `Prog-Kurve · ${boss.name}`, body, wide: true });
}
