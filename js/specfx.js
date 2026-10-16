// ─────────────────────────────────────────────────────────────
//  Spec-Effekte beim Hover über eine Roster-Karte (reine Optik)
//  · einfache Effekte: CSS ([data-fx=…] in style.css)
//  · aufwendige Effekte: kleines Canvas-Partikelsystem (unten), nur solange die Maus auf der Karte ist
// ─────────────────────────────────────────────────────────────
const FX = {
  DK:      { Blood: ['pulse', '#ff2a3d'], Frost: ['snow', '#8fdcff'], Unholy: ['skulls', '#7dff4f'] },
  DH:      { Havoc: ['meta', '#7dff4f'], Vengeance: ['flames', '#5cff3a'], Devourer: ['smoke', '#b06bff'] },
  Druid:   { Balance: ['stars', '#c9a8ff'], Feral: ['slash', '#ff9a2e'], Guardian: ['slam', '#d39a5a'], Restoration: ['leaves', '#7ee36b'] },
  Evoker:  { Augmentation: ['scales', '#d9a55b'], Devastation: ['firestorm', '#ff6a2a'], Preservation: ['rewind', '#4fe3c1'] },
  Hunter:  { 'Beast Mastery': ['paws', '#b8e36b'], Marksmanship: ['reticle', '#ff5a4a'], Survival: ['slash', '#b8e36b'] },
  Mage:    { Arcane: ['sparks', '#c77dff'], Fire: ['pyro', '#ff7a1a'], Frost: ['snow', '#9fe4ff'] },
  Monk:    { Brewmaster: ['brew', '#ffb02e'], Mistweaver: ['chi', '#5cf2c8'], Windwalker: ['fists', '#7dffb0'] },
  Paladin: { Holy: ['rays', '#ffe27a'], Protection: ['avenger', '#ffd45c'], Retribution: ['hammer', '#ffcf4a'] },
  Priest:  { Discipline: ['rays', '#fff2c2'], Holy: ['rays', '#ffffff'], Shadow: ['void', '#a15cff'] },
  Rogue:   { Assassination: ['smoke', '#7dff4f'], Outlaw: ['dice', '#ffd84a'], Subtlety: ['smoke', '#8a8aa8'] },
  Shaman:  { Elemental: ['chain', '#7cc8ff'], Enhancement: ['lightning', '#a7d8ff'], Restoration: ['rain', '#5ab8ff'] },
  Warlock: { Affliction: ['curses', '#b06bff'], Demonology: ['summon', '#6dff3a'], Destruction: ['chaosbolt', '#7dff3a'] },
  Warrior: { Arms: ['colossus', '#ffb45a'], Fury: ['rampage', '#ff3a2a'], Protection: ['shield', '#c9d3e6'] },
};

/** → { type, color, layer } – type kommt als data-fx an die Karte, layer als erstes Kind hinein */
export function specFx(klasse, spec) {
  const [type, color] = FX[klasse]?.[spec] || ['glow', ''];
  return { type, color, layer: `<span class="fx" aria-hidden="true">${'<i></i>'.repeat(8)}</span>` };
}

// ═════════════════════ Canvas-Effekte ═════════════════════
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches || matchMedia('(hover: none)').matches;
const rnd = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

/** Leuchtpunkt-Sprite pro Farbe vorrendern (schnell + weiches Glühen) */
const sprites = new Map();
function glow(color) {
  if (sprites.has(color)) return sprites.get(color);
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.18, color); gr.addColorStop(0.45, color + '66'); gr.addColorStop(1, color + '00');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  sprites.set(color, c); return c;
}
function dot(ctx, color, x, y, size, alpha = 1) {
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.drawImage(glow(color), x - size, y - size, size * 2, size * 2);
}
/** Farbe mischen (hex) */
function mix(a, b, t) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

// ── Renderer pro Effekt: (ctx, w, h, ix, iy, color) → frame(t, dt) ──
const R = {
  /* Retri: Hammer of Wrath – goldener Hammer fliegt drehend von links nach rechts, Einschlag am Rand */
  hammer(ctx, w, h, ix, iy, col) {
    const trail = [], boom = []; let cycle = -1, hit = false;
    const draw = (x, y, rot, a) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = a; ctx.globalCompositeOperation = 'source-over';
      ctx.shadowColor = col; ctx.shadowBlur = 20;
      ctx.fillStyle = '#b07a2a'; ctx.fillRect(-2.5, -2, 5, 26);
      const g = ctx.createLinearGradient(-15, -14, 15, 0); g.addColorStop(0, '#fff6c8'); g.addColorStop(.5, col); g.addColorStop(1, '#c8891a');
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(-15, -14, 30, 13, 3); ctx.fill();
      ctx.fillStyle = '#fff8dc'; ctx.fillRect(-11, -11, 22, 2);
      ctx.restore();
    };
    return (t, dt) => {
      const T = 1.9, k = t % T, c = Math.floor(t / T), ex = w - 30, y0 = h / 2;
      if (c !== cycle) { cycle = c; hit = false; }
      const f = Math.min(1, k / 0.6), x = -30 + (ex + 30) * (1 - Math.pow(1 - f, 2));
      ctx.globalCompositeOperation = 'lighter';
      if (f < 1) {
        for (let i = 0; i < 3; i++) trail.push({ x: x + rnd(-6, 6), y: y0 + rnd(-8, 8), vx: rnd(-60, -20), vy: rnd(-20, 20), a: 0, l: rnd(.25, .5), s: rnd(2, 4) });
        dot(ctx, col, x, y0, 26, 0.55);
      } else if (!hit) {
        hit = true;
        for (let i = 0; i < 46; i++) { const a = rnd(Math.PI * 0.5, Math.PI * 1.5), sp = rnd(60, 230); boom.push({ x: ex, y: y0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, a: 0, l: rnd(.4, .9), s: rnd(2, 4.5) }); }
      }
      if (k >= 0.6 && k < 1.5) {
        const e = (k - 0.6) / 0.9;
        ctx.globalAlpha = (1 - e) * 0.9; ctx.strokeStyle = col; ctx.lineWidth = 3 * (1 - e) + 1;
        ctx.beginPath(); ctx.arc(ex, y0, 8 + e * 90, 0, TAU); ctx.stroke();
        for (let i = 0; i < 10; i++) { const a = Math.PI * 0.5 + i / 9 * Math.PI, r1 = 14 + e * 14, r2 = 34 + e * 70;
          ctx.globalAlpha = (1 - e) * 0.4; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ex + Math.cos(a) * r1, y0 + Math.sin(a) * r1); ctx.lineTo(ex + Math.cos(a) * r2, y0 + Math.sin(a) * r2); ctx.stroke(); }
        dot(ctx, col, ex, y0, 50 * (1 - e) + 8, (1 - e) * 0.85);
      }
      for (const p of trail) { p.a += dt; p.x += p.vx * dt; p.y += p.vy * dt; dot(ctx, col, p.x, p.y, p.s * 2.2, (1 - p.a / p.l) * 0.8); }
      for (let i = trail.length - 1; i >= 0; i--) if (trail[i].a > trail[i].l) trail.splice(i, 1);
      for (const p of boom) { p.a += dt; p.vy += 220 * dt; p.x += p.vx * dt; p.y += p.vy * dt; dot(ctx, col, p.x, p.y, p.s * 2.3, 1 - p.a / p.l); }
      for (let i = boom.length - 1; i >= 0; i--) if (boom[i].a > boom[i].l) boom.splice(i, 1);
      if (f < 1) draw(x, y0, t * 14, 1);
      else if (k < 1.0) draw(ex - 4, y0, 0.35, 1 - (k - 0.6) / 0.4);
    };
  },

  /* Prot Paladin: Avenger's Shield – Schild fliegt drehend nach rechts, prallt ab und kommt zurück */
  avenger(ctx, w, h, ix, iy, col) {
    const trail = [], sparks = [];
    const shield = (x, y, spin) => {
      ctx.save(); ctx.translate(x, y); ctx.scale(Math.max(0.15, Math.abs(Math.cos(spin))), 1); ctx.globalCompositeOperation = 'source-over';
      ctx.shadowColor = col; ctx.shadowBlur = 18;
      const g = ctx.createLinearGradient(0, -14, 0, 16); g.addColorStop(0, '#fff6c8'); g.addColorStop(.45, col); g.addColorStop(1, '#a8740f');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-12, -13); ctx.lineTo(12, -13); ctx.lineTo(12, 0); ctx.quadraticCurveTo(12, 11, 0, 17); ctx.quadraticCurveTo(-12, 11, -12, 0); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = '#fff8dc'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#fff8dc'; ctx.fillRect(-1.5, -9, 3, 18); ctx.fillRect(-7, -3, 14, 3);
      ctx.restore();
    };
    // Wegpunkte: Icon → rechts Mitte → oben rechts → zurück zum Icon
    const pts = () => [[ix + 20, iy], [w - 28, h * 0.55], [w * 0.62, 14], [ix + 20, iy]];
    return (t, dt) => {
      const P = pts(), T = 2.1, k = (t % T) / T, seg = Math.min(2, Math.floor(k * 3)), f = k * 3 - seg;
      const [ax, ay] = P[seg], [bx, by] = P[seg + 1], e = f * f * (3 - 2 * f);
      const x = ax + (bx - ax) * e, y = ay + (by - ay) * e;
      ctx.globalCompositeOperation = 'lighter';
      trail.push({ x, y, a: 0 });
      for (const p of trail) { p.a += dt; dot(ctx, col, p.x, p.y, 10 * (1 - p.a / .35), (1 - p.a / .35) * 0.45); }
      for (let i = trail.length - 1; i >= 0; i--) if (trail[i].a > .35) trail.splice(i, 1);
      if (f > 0.97 && seg < 2 && !sparks.some(s => s.seg === seg && s.c === Math.floor(t / T))) {
        for (let i = 0; i < 22; i++) { const a = rnd(0, TAU), sp = rnd(50, 170); sparks.push({ x: bx, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, a: 0, l: rnd(.3, .6), seg, c: Math.floor(t / T) }); }
      }
      for (const p of sparks) { p.a += dt; p.x += p.vx * dt; p.y += p.vy * dt; dot(ctx, col, p.x, p.y, 5, 1 - p.a / p.l); }
      for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].a > sparks[i].l) sparks.splice(i, 1);
      shield(x, y, t * 9);
    };
  },

  /* Fire Mage: Pyroblast – Feuerball lädt sich auf, fliegt mit Flammenschweif, Explosion am Rand */
  pyro(ctx, w, h, ix, iy, col) {
    const tail = [], boom = []; let cycle = -1, hit = false;
    return (t, dt) => {
      const T = 1.9, k = t % T, c = Math.floor(t / T), ex = w - 28;
      if (c !== cycle) { cycle = c; hit = false; }
      ctx.globalCompositeOperation = 'lighter';
      if (k < 0.35) {                                                            // Aufladen
        const g = k / 0.35; dot(ctx, col, ix + 22, iy, 8 + 18 * g, 0.9); dot(ctx, '#fff2b0', ix + 22, iy, 5 + 6 * g, 1);
        if (Math.random() < 0.8) { const a = rnd(0, TAU); tail.push({ x: ix + 22 + Math.cos(a) * 30, y: iy + Math.sin(a) * 30, vx: -Math.cos(a) * 80, vy: -Math.sin(a) * 80, a: 0, l: .35, s: 2.5 }); }
      }
      const fly = (k - 0.35) / 0.55;
      if (fly >= 0 && fly <= 1) {
        const x = ix + 22 + (ex - ix - 22) * (fly * fly), y = iy + Math.sin(fly * Math.PI) * -10;
        for (let i = 0; i < 6; i++) tail.push({ x: x + rnd(-4, 4), y: y + rnd(-5, 5), vx: rnd(-90, -30), vy: rnd(-30, 10), a: 0, l: rnd(.3, .65), s: rnd(3, 7) });
        dot(ctx, col, x, y, 30, 0.95); dot(ctx, '#ffd36b', x, y, 15, 1); dot(ctx, '#ffffff', x, y, 6, 1);
      } else if (fly > 1 && !hit) {
        hit = true;
        for (let i = 0; i < 60; i++) { const a = rnd(0, TAU), sp = rnd(40, 220); boom.push({ x: ex, y: iy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, a: 0, l: rnd(.35, .9), s: rnd(3, 6) }); }
      }
      if (k > 0.9 && k < 1.5) { const e = (k - 0.9) / 0.6; dot(ctx, '#ffd36b', ex, iy, 80 * e + 12, (1 - e) * 0.9); }
      const age = (p, cA, cB) => { const f = p.a / p.l; return f < .4 ? mix(cA, col, f / .4) : mix(col, cB, (f - .4) / .6); };
      for (const p of tail) { p.a += dt; p.vy -= 40 * dt; p.x += p.vx * dt; p.y += p.vy * dt; dot(ctx, age(p, '#fff2b0', '#5a1206'), p.x, p.y, p.s * 2 * (1 - p.a / p.l * .5), 1 - p.a / p.l); }
      for (let i = tail.length - 1; i >= 0; i--) if (tail[i].a > tail[i].l) tail.splice(i, 1);
      for (const p of boom) { p.a += dt; p.vx *= 0.95; p.vy = p.vy * 0.95 - 30 * dt; p.x += p.vx * dt; p.y += p.vy * dt; dot(ctx, age(p, '#ffffff', '#4a0f04'), p.x, p.y, p.s * 2, 1 - p.a / p.l); }
      for (let i = boom.length - 1; i >= 0; i--) if (boom[i].a > boom[i].l) boom.splice(i, 1);
    };
  },

  /* Windwalker: Fäuste schlagen in schneller Folge ein (Fists of Fury) */
  fists(ctx, w, h, ix, iy, col) {
    const fists = [], hits = []; let next = 0;
    const BODY = new Path2D('M-13,-5 C-13,-11 -8,-12 -3,-12 L6,-12 C10,-12 12.5,-10.5 12.5,-7.6 C14.6,-6.8 14.6,-3.4 12.6,-2.6 C14.6,-1.8 14.6,1.6 12.6,2.4 C14.6,3.2 14.6,6.6 12.6,7.4 C12.4,10.4 10,12 6,12 L-3,12 C-9,12 -13,9 -13,4 Z');
    const THUMB = new Path2D('M-7,3.5 C-3,1 5,1 9,4 C11,5.8 9.5,9 6,9 L-3.5,9 C-7.5,9 -9,6 -7,3.5 Z');
    const ARM = new Path2D('M-30,-7 L-12,-8 L-12,8 L-30,7 Z');
    const dark = mix(col, '#0b2a1a', .55);
    const fist = (x, y, a, s, rot) => {
      // stilisierte Faust von der Seite, Knöchel in Schlagrichtung, mit Bewegungsschweif
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a;
      const ga = ctx.createLinearGradient(-30, 0, -12, 0); ga.addColorStop(0, col + '00'); ga.addColorStop(1, col + 'cc');
      ctx.fillStyle = ga; ctx.fill(ARM);
      ctx.shadowColor = col; ctx.shadowBlur = 10;
      const g = ctx.createLinearGradient(-13, -12, 13, 12); g.addColorStop(0, mix(col, '#ffffff', .3)); g.addColorStop(1, '#ffffff'); ctx.fillStyle = g; ctx.fill(BODY);
      ctx.shadowBlur = 0; ctx.strokeStyle = dark; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
      for (const yy of [-7.6, -2.6, 2.4]) { ctx.beginPath(); ctx.moveTo(2, yy); ctx.quadraticCurveTo(8, yy - .6, 12.6, yy); ctx.stroke(); }
      ctx.fillStyle = mix(col, '#ffffff', .7); ctx.fill(THUMB); ctx.stroke(THUMB);
      ctx.restore();
    };
    return (t, dt) => {
      if (t > next) { const ty = rnd(14, h - 14), tx = rnd(w * 0.45, w - 18); fists.push({ x0: ix + 26, y0: iy + rnd(-8, 8), tx, ty, a: 0, l: 0.3 }); next = t + rnd(0.42, 0.65); }
      ctx.globalCompositeOperation = 'lighter';
      for (const f of fists) {
        f.a += dt; const p = Math.min(1, f.a / f.l), x = f.x0 + (f.tx - f.x0) * p, y = f.y0 + (f.ty - f.y0) * p;
        const rot = Math.atan2(f.ty - f.y0, f.tx - f.x0);
        fist(x, y, p >= 1 ? Math.max(0, 1 - (f.a - f.l) / 0.18) : 1, 1.35, rot);
        if (p >= 1 && !f.hit) { f.hit = true; hits.push({ x: f.tx + 10, y: f.ty, a: 0 }); }
      }
      for (let i = fists.length - 1; i >= 0; i--) if (fists[i].a > fists[i].l + 0.18) fists.splice(i, 1);
      ctx.globalCompositeOperation = 'lighter';
      for (const hh of hits) {
        hh.a += dt; const e = hh.a / 0.45;
        dot(ctx, col, hh.x, hh.y, 22 * e + 6, (1 - e) * 0.9);
        ctx.globalAlpha = 1 - e; ctx.strokeStyle = '#eafff2'; ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, r1 = 6 + e * 8, r2 = 12 + e * 16; ctx.beginPath(); ctx.moveTo(hh.x + Math.cos(a) * r1, hh.y + Math.sin(a) * r1); ctx.lineTo(hh.x + Math.cos(a) * r2, hh.y + Math.sin(a) * r2); ctx.stroke(); }
      }
      for (let i = hits.length - 1; i >= 0; i--) if (hits[i].a > 0.45) hits.splice(i, 1);
    };
  },

  /* Resto Shaman: Heilender Regen – Tropfen fallen, Wellenringe am Boden, sanftes Wasserleuchten */
  rain(ctx, w, h, ix, iy, col) {
    const drops = [], rings = [];
    return (t, dt) => {
      for (let i = 0; i < 2; i++) drops.push({ x: rnd(0, w + 20), y: rnd(-20, -4), v: rnd(220, 300), floor: rnd(h * 0.62, h - 6) });
      ctx.globalCompositeOperation = 'lighter';
      dot(ctx, col, w * 0.55, h * 0.1, w * 0.5, 0.12);
      ctx.lineCap = 'round';
      for (const d of drops) {
        d.y += d.v * dt; d.x -= d.v * dt * 0.12;
        const g = ctx.createLinearGradient(d.x, d.y - 12, d.x, d.y); g.addColorStop(0, col + '00'); g.addColorStop(1, '#e6f6ff');
        ctx.globalAlpha = 0.85; ctx.strokeStyle = g; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(d.x + 1.4, d.y - 12); ctx.lineTo(d.x, d.y); ctx.stroke();
        if (d.y >= d.floor) { d.done = true; rings.push({ x: d.x, y: d.floor, a: 0 }); }
      }
      for (let i = drops.length - 1; i >= 0; i--) if (drops[i].done) drops.splice(i, 1);
      for (const r of rings) {
        r.a += dt; const e = r.a / 0.6;
        ctx.globalAlpha = (1 - e) * 0.8; ctx.strokeStyle = col; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(r.x, r.y, 3 + e * 16, (3 + e * 16) * 0.32, 0, 0, TAU); ctx.stroke();
      }
      for (let i = rings.length - 1; i >= 0; i--) if (rings[i].a > 0.6) rings.splice(i, 1);
    };
  },

  /* Elemental: verästelter Kettenblitz vom Icon über die Karte */
  chain(ctx, w, h, ix, iy, col) {
    const bolts = []; let next = 0; const sparks = [];
    const path = (x1, y1, x2, y2, rough) => {
      let pts = [[x1, y1], [x2, y2]];
      for (let it = 0; it < 6; it++) {
        const n = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
          const [ax, ay] = pts[i - 1], [bx, by] = pts[i], len = Math.hypot(bx - ax, by - ay);
          n.push([(ax + bx) / 2 + rnd(-1, 1) * len * rough, (ay + by) / 2 + rnd(-1, 1) * len * rough], [bx, by]);
        }
        pts = n; rough *= 0.62;
      }
      return pts;
    };
    const bolt = () => {
      const tx = rnd(w * 0.55, w - 14), ty = rnd(12, h - 12);
      const main = path(ix + 18, iy, tx, ty, 0.32), branches = [];
      for (let b = 0; b < 2; b++) {
        const s = main[Math.floor(rnd(main.length * 0.3, main.length * 0.8))];
        branches.push(path(s[0], s[1], s[0] + rnd(20, 70), s[1] + rnd(-40, 40), 0.35));
      }
      bolts.push({ paths: [main, ...branches], age: 0, life: 0.32 });
      for (let i = 0; i < 10; i++) { const a = rnd(0, TAU); sparks.push({ x: tx, y: ty, vx: Math.cos(a) * rnd(30, 120), vy: Math.sin(a) * rnd(30, 120), a: 0, l: rnd(.2, .5) }); }
    };
    const stroke = (pts, lw, a, c) => { ctx.globalAlpha = a; ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); };
    return (t, dt) => {
      if (t > next) { bolt(); next = t + rnd(0.35, 0.6); }
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      dot(ctx, col, ix, iy, 34, 0.35 + 0.15 * Math.sin(t * 20));
      for (const b of bolts) {
        b.age += dt; const f = 1 - b.age / b.life, flick = Math.random() < 0.25 ? 0.4 : 1;
        b.paths.forEach((p, i) => { const m = i ? 0.55 : 1; stroke(p, 7 * m, 0.18 * f * flick, col); stroke(p, 3 * m, 0.55 * f * flick, col); stroke(p, 1.2 * m, f * flick, '#ffffff'); });
      }
      for (let i = bolts.length - 1; i >= 0; i--) if (bolts[i].age > bolts[i].life) bolts.splice(i, 1);
      for (const s of sparks) { s.a += dt; s.x += s.vx * dt; s.y += s.vy * dt; dot(ctx, col, s.x, s.y, 5, 1 - s.a / s.l); }
      for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].a > sparks[i].l) sparks.splice(i, 1);
    };
  },

  /* Havoc: zwei Kriegsgleven wirbeln mit Leuchtspur ums Icon + Teufelsglut */
  bladedance(ctx, w, h, ix, iy, col) {
    const embers = [];
    const glaive = (a, r) => {
      const x = ix + Math.cos(a) * r, y = iy + Math.sin(a) * r * 0.62;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a * 3);
      ctx.globalAlpha = 1; ctx.shadowColor = col; ctx.shadowBlur = 14; ctx.fillStyle = '#eaffdc';
      ctx.beginPath(); ctx.moveTo(-11, 0); ctx.quadraticCurveTo(0, -11, 11, 0); ctx.quadraticCurveTo(0, -5, -11, 0); ctx.fill();
      ctx.rotate(Math.PI); ctx.beginPath(); ctx.moveTo(-11, 0); ctx.quadraticCurveTo(0, -11, 11, 0); ctx.quadraticCurveTo(0, -5, -11, 0); ctx.fill();
      ctx.restore();
    };
    return (t, dt) => {
      if (Math.random() < 0.7) embers.push({ x: rnd(0, w), y: h + 4, vy: rnd(-70, -30), vx: rnd(-10, 10), a: 0, l: rnd(.6, 1.2), s: rnd(2, 4) });
      ctx.globalCompositeOperation = 'lighter';
      for (const e of embers) { e.a += dt; e.x += e.vx * dt; e.y += e.vy * dt; dot(ctx, col, e.x, e.y, e.s * 2.2, (1 - e.a / e.l) * 0.8); }
      for (let i = embers.length - 1; i >= 0; i--) if (embers[i].a > embers[i].l) embers.splice(i, 1);
      const sp = 7, R1 = 36;
      for (const off of [0, Math.PI]) {
        const a = t * sp + off;
        for (let k = 1; k <= 14; k++) {                                     // Leuchtspur
          const b = a - k * 0.07; dot(ctx, col, ix + Math.cos(b) * R1, iy + Math.sin(b) * R1 * 0.62, 7 - k * 0.35, 0.5 * (1 - k / 15));
        }
        ctx.globalCompositeOperation = 'source-over'; glaive(a, R1); ctx.globalCompositeOperation = 'lighter';
      }
    };
  },

  /* Havoc: Metamorphose – Dämonenflügel entfalten sich hinter dem Icon, Teufelsfeuer lodert, Fel Rush zieht über die Karte */
  meta(ctx, w, h, ix, iy, col) {
    const WING = new Path2D('M0,0 L10,-14 L30,-27 Q27,-19 34,-15 L36,-14 Q31,-7 38,-2 Q29,-1 31,7 Q19,3 8,9 Q4,5 0,6 Z');
    const BONES = [[0, 0, 10, -14], [10, -14, 30, -27], [10, -14, 36, -14], [10, -14, 38, -2], [10, -14, 31, 7]];
    const flames = [], dash = [];
    const wing = (side, open, flap) => {
      ctx.save(); ctx.translate(ix + side * 6, iy - 4); ctx.scale(side * 1.25, 1.25); ctx.rotate(-0.9 + 0.9 * open + flap);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.92 * open;
      const g = ctx.createLinearGradient(0, 0, 36, -20); g.addColorStop(0, '#071204'); g.addColorStop(1, mix(col, '#071204', .75));
      ctx.fillStyle = g; ctx.fill(WING);
      ctx.shadowColor = col; ctx.shadowBlur = 10; ctx.strokeStyle = col; ctx.lineWidth = 1.1; ctx.stroke(WING);
      ctx.lineWidth = 0.9; ctx.globalAlpha = 0.7 * open;
      for (const [a, b, c, d] of BONES) { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); }
      ctx.restore();
    };
    return (t, dt) => {
      const open = Math.min(1, t / 0.45), ease = 1 - Math.pow(1 - open, 3), flap = Math.sin(t * 3.2) * 0.06;
      // Teufelsfeuer um das Icon
      for (let i = 0; i < 4; i++) { const a = rnd(0, TAU), r = rnd(14, 26); flames.push({ x: ix + Math.cos(a) * r, y: iy + Math.sin(a) * r * 0.7 + 8, vx: rnd(-8, 8), vy: rnd(-70, -35), a: 0, l: rnd(.35, .7), s: rnd(3, 6) }); }
      ctx.globalCompositeOperation = 'lighter';
      dot(ctx, col, ix, iy, 44 * ease, 0.32);
      wing(-1, ease, flap); wing(1, ease, flap);
      ctx.globalCompositeOperation = 'lighter';
      for (const f of flames) { f.a += dt; f.x += f.vx * dt; f.y += f.vy * dt; const k = f.a / f.l; dot(ctx, k < .3 ? mix('#eaffd0', col, k / .3) : col, f.x, f.y, f.s * 2 * (1 - k * .6), (1 - k) * 0.85); }
      for (let i = flames.length - 1; i >= 0; i--) if (flames[i].a > flames[i].l) flames.splice(i, 1);
      // Fel Rush: alle 1,6 s ein grüner Schweif quer über die Karte
      const T = 1.6, k = (t % T) / T;
      if (t > 0.5 && k < 0.35) {
        const x = ix + 30 + (w - ix - 30) * (k / 0.35);
        for (let i = 0; i < 5; i++) dash.push({ x: x + rnd(-6, 6), y: iy + rnd(-7, 7), a: 0, l: rnd(.25, .5), s: rnd(2.5, 5) });
        dot(ctx, col, x, iy, 16, 0.8); dot(ctx, '#eaffd0', x, iy, 5, 1);
      }
      for (const d of dash) { d.a += dt; d.y -= 14 * dt; dot(ctx, col, d.x, d.y, d.s * 2, (1 - d.a / d.l) * 0.7); }
      for (let i = dash.length - 1; i >= 0; i--) if (dash[i].a > dash[i].l) dash.splice(i, 1);
    };
  },

  /* Arms: Kolossales Schmettern – Großschwert holt aus, schlägt ein, Boden reißt auf */
  colossus(ctx, w, h, ix, iy, col) {
    const T = 1.7, px = w * 0.4, py = h + 12, L = 88, A0 = -1.95, A1 = -0.2;
    let cycle = -1, cracks = [], chips = [];
    const crackFrom = (x, y) => {
      const out = [];
      for (let k = 0; k < 5; k++) {
        let a = -Math.PI / 2 + rnd(-1.35, 1.35), cx = x, cy = y; const pts = [[cx, cy]];
        for (let n = 0; n < 4; n++) { a += rnd(-0.5, 0.5); const st = rnd(7, 14); cx += Math.cos(a) * st; cy += Math.sin(a) * st * 0.6; pts.push([cx, cy]); }
        out.push(pts);
      }
      return out;
    };
    const sword = (a, al) => {
      ctx.save(); ctx.translate(px, py); ctx.rotate(a); ctx.globalAlpha = al; ctx.globalCompositeOperation = 'source-over';
      ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 10;
      const g = ctx.createLinearGradient(0, -4, 0, 4); g.addColorStop(0, '#f4f7ff'); g.addColorStop(.5, '#aab3c4'); g.addColorStop(1, '#e6ebf7');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(40, -4.5); ctx.lineTo(L, -3.4); ctx.lineTo(L + 10, 0); ctx.lineTo(L, 3.4); ctx.lineTo(40, 4.5); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#c9a45a'; ctx.fillRect(36, -9, 4, 18); ctx.fillStyle = '#6b4a26'; ctx.fillRect(18, -2.2, 18, 4.4);
      ctx.restore();
    };
    return (t, dt) => {
      const c = Math.floor(t / T), k = t % T;
      if (c !== cycle) { cycle = c; cracks = []; }
      let a, al = 1;
      if (k < 0.45) { const e = k / 0.45; a = A0 - 0.25 * Math.sin(e * Math.PI / 2); al = Math.min(1, k / 0.15); }   // ausholen
      else if (k < 0.6) { const e = (k - 0.45) / 0.15; a = A0 - 0.25 + (A1 - A0 + 0.25) * e * e; }                          // schlagen
      else { a = A1; al = Math.max(0, 1 - (k - 0.9) / 0.4); }
      const tipX = px + Math.cos(A1) * (L + 6), tipY = py + Math.sin(A1) * (L + 6);
      if (k >= 0.6 && !cracks.length) {
        cracks = crackFrom(tipX, Math.min(h - 6, tipY + 4));
        for (let i = 0; i < 18; i++) { const g = -Math.PI / 2 + rnd(-1.3, 1.3), sp = rnd(60, 170); chips.push({ x: tipX, y: tipY, vx: Math.cos(g) * sp, vy: Math.sin(g) * sp, a: 0, l: rnd(.3, .6) }); }
      }
      ctx.globalCompositeOperation = 'lighter';
      if (k > 0.45 && k < 0.75) {                                     // Schwungbogen
        const e = Math.min(1, (k - 0.45) / 0.15), f = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.15;
        for (const [lw, al2] of [[14, .12], [6, .3], [2, .8]]) {
          ctx.globalAlpha = al2 * f; ctx.strokeStyle = lw > 3 ? col : '#ffffff'; ctx.lineWidth = lw;
          ctx.beginPath(); ctx.arc(px, py, L, A0 - 0.25, A0 - 0.25 + (A1 - A0 + 0.25) * e * e); ctx.stroke();
        }
      }
      if (cracks.length) {
        const e = k - 0.6, grow = Math.min(1, e / 0.12), f = Math.max(0, 1 - (e - 0.5) / 0.5);
        if (e < 0.25) dot(ctx, '#ffffff', tipX, tipY, 46 * (1 - e / 0.25) + 8, (1 - e / 0.25));
        ctx.lineCap = 'round';
        for (const pts of cracks) {
          const n = Math.max(1, Math.round((pts.length - 1) * grow));
          for (const [lw, al2, cc] of [[4, .3, col], [1.6, .9, '#fff3d6']]) {
            ctx.globalAlpha = al2 * f; ctx.strokeStyle = cc; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
            for (let q = 1; q <= n; q++) ctx.lineTo(pts[q][0], pts[q][1]); ctx.stroke();
          }
        }
      }
      for (const p of chips) { p.a += dt; p.vy += 380 * dt; p.x += p.vx * dt; p.y += p.vy * dt; dot(ctx, col, p.x, p.y, 4, 1 - p.a / p.l); }
      for (let i = chips.length - 1; i >= 0; i--) if (chips[i].a > chips[i].l) chips.splice(i, 1);
      if (al > 0) sword(a, al);
    };
  },

  /* Fury: Raserei – rote Wut-Aura pulsiert, Kreuzhiebe mit zwei Klingen schlagen über die Karte */
  rampage(ctx, w, h, ix, iy, col) {
    const cuts = [], sparks = []; let next = 0.15;
    return (t, dt) => {
      if (t > next) {
        const x = rnd(w * 0.35, w - 30), y = rnd(h * 0.3, h * 0.7);
        cuts.push({ x, y, a: 0, d: 1 }, { x, y, a: -0.09, d: -1 });
        for (let i = 0; i < 16; i++) { const g = rnd(0, TAU), sp = rnd(40, 150); sparks.push({ x, y, vx: Math.cos(g) * sp, vy: Math.sin(g) * sp, a: 0, l: rnd(.25, .5) }); }
        next = t + rnd(0.5, 0.75);
      }
      ctx.globalCompositeOperation = 'lighter';
      const beat = 0.5 + 0.5 * Math.pow(Math.max(0, Math.sin(t * 7)), 6);
      dot(ctx, col, ix, iy, 40 + beat * 14, 0.25 + beat * 0.35);
      ctx.lineCap = 'round';
      for (const c of cuts) {
        c.a += dt; if (c.a < 0) continue;
        const p = Math.min(1, c.a / 0.12), f = Math.max(0, 1 - (c.a - 0.12) / 0.35), L = 26;
        const x1 = c.x - L * c.d, y1 = c.y - L, x2 = c.x + L * c.d, y2 = c.y + L;
        const xe = x1 + (x2 - x1) * p, ye = y1 + (y2 - y1) * p;
        for (const [lw, al, cc] of [[7, .25, col], [3, .7, col], [1.2, 1, '#ffffff']]) {
          ctx.globalAlpha = al * f; ctx.strokeStyle = cc; ctx.lineWidth = lw;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(c.x + 8 * c.d, c.y - 6, xe, ye); ctx.stroke();
        }
      }
      for (let i = cuts.length - 1; i >= 0; i--) if (cuts[i].a > 0.5) cuts.splice(i, 1);
      for (const p of sparks) { p.a += dt; p.vy += 200 * dt; p.x += p.vx * dt; p.y += p.vy * dt; dot(ctx, col, p.x, p.y, 4, 1 - p.a / p.l); }
      for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].a > sparks[i].l) sparks.splice(i, 1);
    };
  },

  /* Affliction: Flüche – drei Fluch-Siegel werden nacheinander aufgedrückt und „ticken“ Schattenschaden */
  curses(ctx, w, h, ix, iy, col) {
    const sig = [0.5, 0.69, 0.87].map((fx, i) => ({ x: w * fx, y: h * (i === 1 ? 0.42 : 0.58), t0: 0.15 + i * 0.35, g: i }));
    const wisps = [], rings = [];
    const GLYPHS = [
      (c) => { c.beginPath(); c.ellipse(0, 0, 6, 3.4, 0, 0, TAU); c.stroke(); c.beginPath(); c.arc(0, 0, 1.8, 0, TAU); c.fill(); },     // Auge (Agonie)
      (c) => { c.beginPath(); c.moveTo(-5, 5); c.lineTo(0, -6); c.lineTo(5, 5); c.moveTo(-6, -1); c.lineTo(6, -1); c.stroke(); },       // Rune (Verderbnis)
      (c) => { c.beginPath(); c.arc(0, 0, 5, 0.3, Math.PI * 1.7); c.stroke(); c.beginPath(); c.moveTo(0, -5); c.lineTo(0, 5); c.stroke(); }, // Instabile Gebrechen
    ];
    return (t, dt) => {
      ctx.globalCompositeOperation = 'lighter';
      for (const s of sig) {
        const e = t - s.t0; if (e < 0) continue;
        const app = Math.min(1, e / 0.25), sc = 1.7 - 0.7 * (1 - Math.pow(1 - app, 3));
        if (e < 0.3) dot(ctx, col, s.x, s.y, 30 * (1 - e / 0.3) + 6, (1 - e / 0.3) * 0.9);     // Aufdrücken-Blitz
        // Tick alle 0,9 s
        const tick = Math.floor((e - 0.3) / 0.9);
        if (e > 0.3 && tick !== s.lastTick) { s.lastTick = tick; rings.push({ x: s.x, y: s.y, a: 0 }); for (let i = 0; i < 6; i++) wisps.push({ x: s.x + rnd(-8, 8), y: s.y, vy: rnd(-40, -20), vx: rnd(-10, 10), a: 0, l: rnd(.6, 1) }); }
        ctx.save(); ctx.translate(s.x, s.y); ctx.scale(sc, sc); ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.85 * app; ctx.strokeStyle = col; ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 8; ctx.lineWidth = 1.1;
        ctx.rotate(t * 0.8 * (s.g % 2 ? -1 : 1));
        ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.stroke();
        ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.arc(0, 0, 16.5, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 13, Math.sin(a) * 13); ctx.lineTo(Math.cos(a) * 16.5, Math.sin(a) * 16.5); ctx.stroke(); }
        ctx.rotate(-t * 0.8 * (s.g % 2 ? -1 : 1)); ctx.lineWidth = 1.4; GLYPHS[s.g](ctx);
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'lighter';
      for (const r of rings) { r.a += dt; const e = r.a / 0.5; ctx.globalAlpha = (1 - e) * 0.7; ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(r.x, r.y, 14 + e * 14, 0, TAU); ctx.stroke(); }
      for (let i = rings.length - 1; i >= 0; i--) if (rings[i].a > 0.5) rings.splice(i, 1);
      for (const p of wisps) { p.a += dt; p.x += p.vx * dt; p.y += p.vy * dt; dot(ctx, '#d8b8ff', p.x, p.y, 5, (1 - p.a / p.l) * 0.7); }
      for (let i = wisps.length - 1; i >= 0; i--) if (wisps[i].a > wisps[i].l) wisps.splice(i, 1);
      // Fluch-Fäden vom Icon zu den Siegeln
      ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.lineDashOffset = -t * 20;
      for (const s of sig) { if (t < s.t0) continue; ctx.globalAlpha = 0.35; ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(ix + 24, iy); ctx.quadraticCurveTo((ix + s.x) / 2, s.y - 22, s.x - 16, s.y); ctx.stroke(); }
      ctx.setLineDash([]);
    };
  },

  /* Outlaw: Roll the Bones – zwei Würfel werden geworfen, springen und bleiben liegen, goldener Glanz */
  dice(ctx, w, h, ix, iy, col) {
    let dice = [], cycle = -1; const shine = [];
    const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
    const throwDice = () => [0, 1].map(i => ({ x: ix + 20, y: iy - 6 + i * 10, vx: rnd(150, 230) + i * 30, vy: rnd(-130, -70), r: rnd(0, TAU), vr: rnd(10, 18) * (i ? -1 : 1), face: 1 + Math.floor(rnd(0, 6)), rest: false }));
    const die = (d) => {
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.r); ctx.globalCompositeOperation = 'source-over';
      ctx.shadowColor = d.rest ? col : 'rgba(0,0,0,.6)'; ctx.shadowBlur = d.rest ? 14 : 6;
      const g = ctx.createLinearGradient(-8, -8, 8, 8); g.addColorStop(0, '#fffdf5'); g.addColorStop(1, '#e5dcc4');
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(-8, -8, 16, 16, 3.5); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = '#b9a77a'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = d.face === 1 ? '#c0182a' : '#1b1b22';
      for (const [px, py] of PIPS[d.face]) { ctx.beginPath(); ctx.arc(px * 4, py * 4, d.face === 1 ? 2.4 : 1.6, 0, TAU); ctx.fill(); }
      ctx.restore();
    };
    return (t, dt) => {
      const T = 2.4, c = Math.floor(t / T), k = t % T, floor = h - 12;
      if (c !== cycle) { cycle = c; dice = throwDice(); }
      for (const d of dice) {
        if (d.rest) continue;
        d.vy += 520 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.r += d.vr * dt;
        if (Math.random() < 0.1) d.face = 1 + Math.floor(rnd(0, 6));
        if (d.y > floor) { d.y = floor; d.vy *= -0.45; d.vx *= 0.7; d.vr *= 0.6; if (Math.abs(d.vy) < 40) d.vy = 0; }
        if (d.x > w - 14) { d.x = w - 14; d.vx *= -0.5; }
        if (d.vy === 0 && Math.abs(d.vx) < 15) { d.rest = true; d.r = Math.round(d.r / (Math.PI / 2)) * (Math.PI / 2) + rnd(-0.15, 0.15);
          for (let i = 0; i < 14; i++) { const a = rnd(0, TAU), sp = rnd(30, 90); shine.push({ x: d.x, y: d.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, a: 0, l: rnd(.3, .6) }); } }
        else if (d.vy === 0) d.vx *= 0.9;
      }
      ctx.globalCompositeOperation = 'lighter';
      const fade = k > T - 0.35 ? (T - k) / 0.35 : 1;
      for (const d of dice) if (d.rest) dot(ctx, col, d.x, d.y, 18, 0.35 * fade);
      for (const p of shine) { p.a += dt; p.x += p.vx * dt; p.y += p.vy * dt; dot(ctx, col, p.x, p.y, 4, 1 - p.a / p.l); }
      for (let i = shine.length - 1; i >= 0; i--) if (shine[i].a > shine[i].l) shine.splice(i, 1);
      ctx.globalAlpha = fade; for (const d of dice) { ctx.globalAlpha = fade; die(d); }
    };
  },

  /* Unholy: Totenschädel steigen aus grünem Seuchennebel auf */
  skulls(ctx, w, h, ix, iy, col) {
    const skulls = [], mist = []; let next = 0;
    const skull = (s) => {
      ctx.shadowColor = col; ctx.shadowBlur = 12; ctx.fillStyle = '#e8ffd8';
      ctx.beginPath(); ctx.arc(0, -2, 7 * s, Math.PI, 0); ctx.lineTo(7 * s, 3 * s); ctx.lineTo(4 * s, 3 * s); ctx.lineTo(4 * s, 7 * s);
      ctx.lineTo(-4 * s, 7 * s); ctx.lineTo(-4 * s, 3 * s); ctx.lineTo(-7 * s, 3 * s); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#0b1a06';
      ctx.beginPath(); ctx.arc(-2.8 * s, 0, 2 * s, 0, TAU); ctx.arc(2.8 * s, 0, 2 * s, 0, TAU); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(-2.8 * s, 0, 0.8 * s, 0, TAU); ctx.arc(2.8 * s, 0, 0.8 * s, 0, TAU); ctx.fill();
      ctx.fillStyle = '#0b1a06'; for (let i = -1; i <= 1; i++) ctx.fillRect(i * 2.2 * s - .5 * s, 4 * s, 1 * s, 3 * s);
    };
    for (let i = 0; i < 8; i++) mist.push({ x: rnd(0, w), y: h - rnd(0, 18), r: rnd(30, 60), v: rnd(-12, 12) });
    return (t, dt) => {
      if (t > next) { skulls.push({ x: rnd(w * 0.2, w - 16), y: h + 10, v: rnd(28, 46), ph: rnd(0, TAU), s: rnd(0.8, 1.25), a: 0, l: rnd(1.8, 2.6) }); next = t + rnd(0.25, 0.45); }
      ctx.globalCompositeOperation = 'lighter';
      for (const m of mist) { m.x += m.v * dt; if (m.x < -60) m.x = w + 60; if (m.x > w + 60) m.x = -60; dot(ctx, col, m.x, m.y, m.r, 0.16); }
      ctx.globalCompositeOperation = 'source-over';
      for (const s of skulls) {
        s.a += dt; s.y -= s.v * dt; const f = s.a / s.l;
        ctx.save(); ctx.translate(s.x + Math.sin(s.ph + s.a * 3) * 6, s.y); ctx.rotate(Math.sin(s.ph + s.a * 2) * 0.25);
        ctx.globalAlpha = Math.min(1, f * 4) * (1 - f); skull(s.s); ctx.restore();
      }
      for (let i = skulls.length - 1; i >= 0; i--) if (skulls[i].a > skulls[i].l) skulls.splice(i, 1);
    };
  },

  /* Preservation: Zeit läuft rückwärts – Uhr dreht zurück, Partikel spulen spiralförmig ins Icon */
  rewind(ctx, w, h, ix, iy, col) {
    const gold = '#ffd56b', parts = [];
    return (t, dt) => {
      for (let i = 0; i < 3; i++) { const a = rnd(0, TAU), r = rnd(60, Math.max(w, 160)); parts.push({ a, r, r0: r, v: rnd(0.9, 1.6), c: Math.random() < 0.5 ? col : gold, life: 0 }); }
      ctx.globalCompositeOperation = 'lighter';
      for (const p of parts) {
        p.life += dt; p.r -= p.r0 * p.v * dt * 0.9; p.a -= dt * 2.4;                 // gegen den Uhrzeigersinn ins Zentrum
        const x = ix + Math.cos(p.a) * p.r, y = iy + Math.sin(p.a) * p.r * 0.7;
        for (let k = 0; k < 4; k++) { const b = p.a + k * 0.06, rr = p.r + k * 4; dot(ctx, p.c, ix + Math.cos(b) * rr, iy + Math.sin(b) * rr * 0.7, 3.2 - k * 0.6, 0.55 - k * 0.12); }
        dot(ctx, p.c, x, y, 4, Math.min(1, p.r / 40));
      }
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].r < 8) parts.splice(i, 1);
      // Uhr
      ctx.globalCompositeOperation = 'source-over'; ctx.save(); ctx.translate(ix, iy);
      ctx.shadowColor = col; ctx.shadowBlur = 10; ctx.strokeStyle = col; ctx.globalAlpha = 0.85; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(0, 0, 33, 0, TAU); ctx.stroke();
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; ctx.lineWidth = i % 3 ? 1.2 : 2.4; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 28, Math.sin(a) * 28); ctx.lineTo(Math.cos(a) * 33, Math.sin(a) * 33); ctx.stroke(); }
      ctx.strokeStyle = gold; ctx.shadowColor = gold; ctx.lineWidth = 2.2;
      const m = -t * 7, hr = -t * 0.9;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(m) * 30, Math.sin(m) * 30); ctx.stroke();
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(hr) * 20, Math.sin(hr) * 20); ctx.stroke();
      // Gegenpfeile (Rückspulen)
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 6); ctx.fillStyle = gold;
      for (const s of [0, 1]) { const a = -t * 1.5 + s * Math.PI; ctx.save(); ctx.rotate(a); ctx.translate(39, 0); ctx.rotate(-Math.PI / 2);
        ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.lineTo(0, -7); ctx.closePath(); ctx.fill(); ctx.restore(); }
      ctx.restore();
    };
  },

  /* Devastation: Feuersturm – Funkenwirbel ums Icon */
  firestorm(ctx, w, h, ix, iy, col) {
    const parts = [];
    return (t, dt) => {
      for (let i = 0; i < 6; i++) parts.push({ a: rnd(0, TAU), r: rnd(6, 16), vr: rnd(26, 60), va: rnd(4, 7), y: 0, vy: rnd(-34, -12), life: 0, l: rnd(.7, 1.3), s: rnd(2.5, 5) });
      ctx.globalCompositeOperation = 'lighter';
      dot(ctx, col, ix, iy, 46, 0.35);
      for (const p of parts) {
        p.life += dt; p.a += p.va * dt; p.r += p.vr * dt; p.y += p.vy * dt;
        const f = p.life / p.l, c = f < 0.3 ? mix('#fff2b0', col, f / 0.3) : mix(col, '#7a1408', (f - 0.3) / 0.7);
        dot(ctx, c, ix + Math.cos(p.a) * p.r, iy + Math.sin(p.a) * p.r * 0.75 + p.y, p.s * (1.6 - f), 1 - f);
      }
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life > parts[i].l) parts.splice(i, 1);
    };
  },

  /* Affliction: Verderbnis-Adern breiten sich aus, Seelen steigen auf */
  veins(ctx, w, h, ix, iy, col) {
    const segs = [], souls = [];
    const grow = (x, y, a, len, depth, t0) => {
      let px = x, py = y;
      for (let i = 0; i < len; i++) {
        a += rnd(-0.35, 0.35); const nx = px + Math.cos(a) * 9, ny = py + Math.sin(a) * 9;
        segs.push({ x1: px, y1: py, x2: nx, y2: ny, t: t0 + i * 0.07, w: Math.max(0.5, 1.8 - depth * 0.5 - i * 0.05) });
        if (depth < 2 && Math.random() < 0.1) grow(nx, ny, a + rnd(-0.9, 0.9), Math.floor(len * 0.45), depth + 1, t0 + i * 0.07);
        px = nx; py = ny;
      }
      souls.push({ x: px, y: py, t: t0 + len * 0.07 });
    };
    [-0.35, 0.3, 0.05].forEach(a => grow(ix, iy, a, Math.floor(rnd(12, 20)), 1, rnd(0, 0.4)));
    const wisps = [];
    return (t, dt) => {
      ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'round';
      for (const s of segs) {
        if (t < s.t) continue;
        const k = Math.min(1, (t - s.t) / 0.07), pulse = 0.55 + 0.15 * Math.sin(t * 2.5 + s.x * 0.05);
        ctx.globalAlpha = 0.55; ctx.strokeStyle = '#12021f'; ctx.lineWidth = s.w + 1.6;
        ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x1 + (s.x2 - s.x1) * k, s.y1 + (s.y2 - s.y1) * k); ctx.stroke();
        ctx.globalAlpha = pulse; ctx.strokeStyle = col; ctx.lineWidth = s.w; ctx.shadowColor = col; ctx.shadowBlur = 5;
        ctx.stroke(); ctx.shadowBlur = 0;
      }
      for (const s of souls) if (t > s.t && Math.random() < 0.02) wisps.push({ x: s.x, y: s.y, a: 0, l: rnd(1, 1.6), ph: rnd(0, TAU) });
      ctx.globalCompositeOperation = 'lighter';
      for (const w2 of wisps) { w2.a += dt; w2.y -= 30 * dt; const f = w2.a / w2.l; dot(ctx, '#d8b8ff', w2.x + Math.sin(w2.ph + w2.a * 4) * 5, w2.y, 7, (1 - f) * 0.8); }
      for (let i = wisps.length - 1; i >= 0; i--) if (wisps[i].a > wisps[i].l) wisps.splice(i, 1);
    };
  },

  /* Demonology: Beschwörungskreis mit Runen unter dem Icon, Teufelsenergie strömt hinein */
  summon(ctx, w, h, ix, iy, col) {
    const parts = [];
    const RUNES = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ', 'ᚺ', 'ᚾ', 'ᛁ', 'ᛃ'];
    return (t, dt) => {
      const open = Math.min(1, t / 0.5);
      if (Math.random() < 0.8) { const a = rnd(0, TAU), r = rnd(70, 140); parts.push({ a, r, life: 0 }); }
      ctx.globalCompositeOperation = 'lighter';
      for (const p of parts) { p.life += dt; p.r -= 120 * dt; p.a += dt * 1.6; dot(ctx, col, ix + Math.cos(p.a) * p.r, iy + Math.sin(p.a) * p.r * 0.55, 3.5, Math.min(1, p.r / 50)); }
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].r < 10) parts.splice(i, 1);
      dot(ctx, col, ix, iy, 50 * open, 0.3);
      ctx.save(); ctx.translate(ix, iy); ctx.scale(1, 0.55); ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 12; ctx.globalAlpha = 0.9;
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 48, -Math.PI / 2, -Math.PI / 2 + TAU * open); ctx.stroke();
      ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, 38, Math.PI / 2, Math.PI / 2 - TAU * open, true); ctx.stroke();
      ctx.rotate(t * 0.6);
      if (open >= 1) {                                                         // Stern
        ctx.lineWidth = 1.4; ctx.beginPath();
        for (let i = 0; i <= 5; i++) { const a = (i * 2 / 5) * TAU - Math.PI / 2; ctx.lineTo(Math.cos(a) * 38, Math.sin(a) * 38); }
        ctx.stroke();
      }
      ctx.fillStyle = col; ctx.font = 'bold 9px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      RUNES.forEach((r, i) => { if (i / RUNES.length > open) return; const a = i / RUNES.length * TAU; ctx.save(); ctx.translate(Math.cos(a) * 43, Math.sin(a) * 43); ctx.rotate(a + Math.PI / 2); ctx.fillText(r, 0, 0); ctx.restore(); });
      ctx.restore();
    };
  },

  /* Destruction: Chaosblitz fliegt über die Karte und explodiert am Rand */
  chaosbolt(ctx, w, h, ix, iy, col) {
    const trail = [], boom = []; let cycle = -1;
    return (t, dt) => {
      const T = 1.6, k = t % T, c = Math.floor(t / T), ex = w - 26;
      if (c !== cycle) { cycle = c; trail.length = 0; }
      ctx.globalCompositeOperation = 'lighter';
      if (k < 0.12) dot(ctx, col, ix, iy, 30 * (k / 0.12), 0.7);                        // Aufladen
      const fly = (k - 0.12) / 0.5;
      if (fly >= 0 && fly <= 1) {
        const x = ix + (ex - ix) * (fly * fly * (3 - 2 * fly)), y = iy + Math.sin(fly * Math.PI) * -8;
        for (let i = 0; i < 4; i++) trail.push({ x: x + rnd(-3, 3), y: y + rnd(-4, 4), vx: rnd(-40, -10), vy: rnd(-25, 25), a: 0, l: rnd(.25, .5), s: rnd(3, 6) });
        dot(ctx, col, x, y, 26, 0.9); dot(ctx, '#ffffff', x, y, 7, 1);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.85; ctx.fillStyle = '#0a1404';
        ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'lighter';
        if (fly > 0.97 && boom.length === 0) for (let i = 0; i < 50; i++) { const a = rnd(0, TAU), s = rnd(40, 200); boom.push({ x: ex, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, a: 0, l: rnd(.3, .8), s: rnd(2, 5) }); }
      }
      if (k > 0.62 && k < 1.1) { const e = (k - 0.62) / 0.48; dot(ctx, col, ex, iy, 70 * e + 10, (1 - e) * 0.9); ctx.globalAlpha = (1 - e) * 0.8; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ex, iy, 8 + e * 60, 0, TAU); ctx.stroke(); }
      for (const p of trail) { p.a += dt; p.x += p.vx * dt; p.y += p.vy * dt; dot(ctx, col, p.x, p.y, p.s * 1.8, (1 - p.a / p.l) * 0.7); }
      for (let i = trail.length - 1; i >= 0; i--) if (trail[i].a > trail[i].l) trail.splice(i, 1);
      for (const p of boom) { p.a += dt; p.vx *= 0.96; p.vy *= 0.96; p.x += p.vx * dt; p.y += p.vy * dt; dot(ctx, p.a < 0.1 ? '#ffffff' : col, p.x, p.y, p.s * 2, 1 - p.a / p.l); }
      for (let i = boom.length - 1; i >= 0; i--) if (boom[i].a > boom[i].l) boom.splice(i, 1);
      if (k > 1.5) boom.length = 0;
    };
  },
};

/** Canvas-Effekt an eine Karte hängen (läuft nur, solange die Maus darauf ist) */
export function attachFx(card) {
  const type = card.dataset.fx;
  if (!R[type] || card.dataset.fxBound) return;
  card.dataset.fxBound = '1';
  let raf = 0, cv = null, stop = null;
  card.addEventListener('mouseenter', () => {
    if (reduce()) return;
    stop?.(true);
    const layer = card.querySelector('.fx'); if (!layer) return;
    const r = card.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    cv = document.createElement('canvas'); cv.className = 'fx-canvas';
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    layer.appendChild(cv);
    const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
    const icon = card.querySelector('.class-icon')?.getBoundingClientRect();
    const ix = icon ? icon.left - r.left + icon.width / 2 : 41, iy = icon ? icon.top - r.top + icon.height / 2 : r.height / 2;
    const color = getComputedStyle(card).getPropertyValue('--fx').trim() || '#b07cff';
    const frame = R[type](ctx, r.width, r.height, ix, iy, color);
    let t0 = performance.now(), last = t0, fading = 0;
    const loop = now => {
      const dt = Math.min(0.05, (now - last) / 1000); last = Math.max(last, now);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0;
      ctx.clearRect(0, 0, r.width, r.height);
      frame(Math.max(0, (now - t0) / 1000), Math.max(0, dt));
      if (fading) { cv.style.opacity = String(Math.max(0, 1 - (now - fading) / 300)); if (now - fading > 300) return stop(true); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const mine = cv;
    stop = (now) => { if (now || !mine.isConnected) { cancelAnimationFrame(raf); mine.remove(); stop = null; } else fading = performance.now(); };
  });
  card.addEventListener('mouseleave', () => stop?.(false));
}
