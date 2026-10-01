import { chaikin, clamp, smooth1d, type Pt } from '../core/math.ts';
import { NY } from '../grn/solver.ts';
import type { Phenotype } from '../stages/phenotype.ts';

// Growth map: material (column, row) → world (X, Y). Column widths and row heights are
// exp(s · log-growth) read from the growth effector fields, so s = 0 is the embryo and
// s = 1 the adult. Shape is the integral of local growth, not a drawn curve.

export interface BodyMap {
  /** world X at the left edge of each column (length ncol + 1) */
  X: number[];
  /** world Y of row edges: Y[x][k], k = 0..NY (bottom edge of row k; Y[x][NY] = top) */
  Y: number[][];
  ncol: number;
  s: number;
  scale: number; // mean adult cell size (for sizing organs)
}

const MID = NY / 2;

export function bodyMap(ph: Phenotype, s: number): BodyMap {
  const n = ph.ncol;
  const X = [0];
  let mean = 0;
  for (let x = 0; x < n; x++) {
    const w = Math.exp(s * ph.gAP[x]);
    X.push(X[x] + w);
    mean += w;
  }
  mean /= n;
  // row heights, smoothed along AP so the outline integrates growth smoothly
  const rows: number[][] = [];
  for (let y = 0; y < NY; y++) {
    const r: number[] = [];
    for (let x = 0; x < n; x++) r.push(Math.exp(s * ph.gDV[x * NY + y]));
    rows.push(smooth1d(r, 2));
  }
  const Y: number[][] = [];
  for (let x = 0; x < n; x++) {
    // snout closure: anterior columns round off (cells there are fewer, not drawn)
    const snout = Math.pow(clamp((x + 0.6) / Math.max(3, ph.headEnd * 0.8), 0, 1), 0.55);
    const col = new Array<number>(NY + 1).fill(0);
    for (let k = MID + 1; k <= NY; k++) col[k] = col[k - 1] + rows[k - 1][x] * snout;
    for (let k = MID - 1; k >= 0; k--) col[k] = col[k + 1] - rows[k][x] * snout;
    Y.push(col);
  }
  return { X, Y, ncol: n, s, scale: mean };
}

/** Map fractional material coords to world. */
export function toWorld(m: BodyMap, x: number, y: number): Pt {
  const xi = clamp(Math.floor(x), 0, m.ncol - 1);
  const fx = clamp(x - xi, 0, 1);
  const X = m.X[xi] + fx * (m.X[xi + 1] - m.X[xi]);
  const yy = clamp(y, 0, NY);
  const k = Math.min(NY - 1, Math.floor(yy));
  const fy = yy - k;
  const col = m.Y[xi];
  const nxt = m.Y[Math.min(m.ncol - 1, xi + 1)];
  const y0 = col[k] + fy * (col[k + 1] - col[k]);
  const y1 = nxt[k] + fy * (nxt[k + 1] - nxt[k]);
  return [X, y0 + fx * (y1 - y0)];
}

export interface Stroke {
  pts: Pt[];
  closed?: boolean;
  fill?: string;
  stroke?: string;
  width?: number;
  alpha?: number;
}

export interface Drawing {
  strokes: Stroke[];
  bounds: [number, number, number, number];
}

const INK = 'var(--ink)';

export interface DrawOptions {
  /** cells to colour (heatmap), values 0..1 */
  heat?: { field: Float32Array; color: string };
  pigment?: Float32Array; // melanophore field
  frameClock?: Float32Array; // for live somite chevrons
  showYolk?: number; // 0..1 yolk remaining
}

export function drawFish(ph: Phenotype, s: number, o: DrawOptions = {}): Drawing {
  const m = bodyMap(ph, s);
  const n = m.ncol;
  const S: Stroke[] = [];
  const top: Pt[] = [], bot: Pt[] = [];
  for (let x = 0; x <= n; x++) {
    const xi = Math.min(n - 1, x);
    top.push([m.X[x], m.Y[xi][NY]]);
    bot.push([m.X[x], m.Y[xi][0]]);
  }
  const outline = chaikin([...top, ...bot.slice().reverse()], 2);
  const finScale = 0.25 + 0.75 * s;

  // yolk (embryo only)
  if (o.showYolk && o.showYolk > 0.02) {
    const [cx] = toWorld(m, Math.min(n - 1, ph.headEnd + 14), 0);
    const r = 9 * o.showYolk;
    const pts: Pt[] = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      pts.push([cx + r * 2.2 * Math.cos(a), m.Y[Math.min(n - 1, ph.headEnd + 14)][0] - r * 0.8 + r * Math.sin(a)]);
    }
    S.push({ pts, closed: true, fill: 'var(--yolk)', stroke: INK, width: 0.6 });
  }

  // ── median fins (behind the body)
  const median = (prof: number[], dorsal: boolean, strength: number) => {
    const base: Pt[] = [], tips: Pt[] = [];
    let any = false;
    for (let x = 0; x < n; x++) {
      const v = prof[x] ?? 0;
      const [bx, by] = dorsal ? [m.X[x], m.Y[x][NY]] : [m.X[x], m.Y[x][0]];
      const h = clamp((v - 0.15) / 0.6, 0, 1.4) * strength * 14 * finScale * Math.sqrt(m.scale);
      if (h > 0.05) any = true;
      base.push([bx, by]);
      tips.push([bx + h * 0.55, by + (dorsal ? h : -h)]);
    }
    if (!any) return;
    // trim to the expressed span
    const on = prof.map((v) => v > 0.15);
    const a = on.indexOf(true), b = on.lastIndexOf(true);
    if (a < 0) return;
    const bs = base.slice(a, b + 1), ts = chaikin(tips.slice(a, b + 1), 2);
    S.push({ pts: [...bs, ...ts.slice().reverse()], closed: true, fill: 'var(--fin)', stroke: INK, width: 0.7 });
    for (let x = a; x <= b; x += 2) S.push({ pts: [base[x], tips[x]], stroke: INK, width: 0.35 });
  };
  const fin = ph.fins;
  if (fin.dorsalFin.present) median(fin.dorsalFin.profile, true, 1);
  if (fin.analFin.present) median(fin.analFin.profile, false, 1);

  // ── caudal fin: one ray per row, length from expression at the tail tip
  if (fin.caudalFin.present) {
    const tipX = m.X[n];
    const rays: [Pt, Pt][] = [];
    for (let y = 0; y < NY; y++) {
      const [bx, by] = [tipX - 0.5, (m.Y[n - 1][y] + m.Y[n - 1][y + 1]) / 2];
      const v = clamp((fin.caudalFin.profile[y] - 0.1) / 0.7, 0, 1.5);
      const ang = ((y + 0.5 - MID) / MID) * 0.95;
      const len = (4 + 30 * v ** 1.6) * finScale * Math.sqrt(m.scale);
      rays.push([[bx, by], [bx + len * Math.cos(ang), by + len * Math.sin(ang) + (by - m.Y[n - 1][MID]) * 0.6]]);
    }
    const tips = chaikin(rays.map((r) => r[1]), 2);
    S.push({ pts: [rays[0][0], ...tips, rays[NY - 1][0]], closed: true, fill: 'var(--fin)', stroke: INK, width: 0.7 });
    rays.forEach((r) => S.push({ pts: r, stroke: INK, width: 0.35 }));
  }

  // ── body
  S.push({ pts: outline, closed: true, fill: 'var(--body)', stroke: 'none' });

  // ventral shading (engraving-style hatching), denser near the belly
  for (let x = 2; x < n - 1; x += 1) {
    const yTop = MID - 2;
    for (let y = 0; y < yTop; y += 2) {
      const dens = 1 - y / yTop;
      if ((x * 7 + y * 3) % 4 >= Math.round(1 + dens * 3)) continue;
      const a = toWorld(m, x, y + 0.3), b = toWorld(m, x + 0.7, y + 1.4);
      S.push({ pts: [a, b], stroke: INK, width: 0.25, alpha: 0.55 });
    }
  }

  // heatmap of a selected gene
  if (o.heat) {
    for (let x = 0; x < n; x++)
      for (let y = 0; y < NY; y++) {
        const v = o.heat.field[x * NY + y];
        if (!(v > 0.04)) continue;
        S.push({ pts: [toWorld(m, x, y), toWorld(m, x + 1, y), toWorld(m, x + 1, y + 1), toWorld(m, x, y + 1)],
          closed: true, fill: o.heat.color, stroke: 'none', alpha: clamp(v, 0, 1) * 0.85 });
      }
  }

  // pigment (Turing pattern), fades in during late growth: iso-contour fill
  if (o.pigment && s > 0.5) {
    const k = (s - 0.5) / 0.5;
    const thr = 0.55;
    const val = (x: number, y: number) => o.pigment![clamp(x, 0, n - 1) * NY + clamp(y, 0, NY - 1)];
    for (let x = -1; x < n; x++)
      for (let y = -1; y < NY; y++) {
        // lattice of cell centres; corners in CCW order
        const c: [number, number][] = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]];
        const v = c.map(([a, b]) => val(a, b));
        if (v.every((q) => q < thr)) continue;
        const poly: Pt[] = [];
        for (let i = 0; i < 4; i++) {
          const j = (i + 1) % 4;
          const [ax, ay] = c[i], [bx, by] = c[j];
          if (v[i] >= thr) poly.push(toWorld(m, clamp(ax + 0.5, 0, n), clamp(ay + 0.5, 0, NY)));
          if ((v[i] >= thr) !== (v[j] >= thr)) {
            const t = (thr - v[i]) / (v[j] - v[i]);
            poly.push(toWorld(m, clamp(ax + 0.5 + t * (bx - ax), 0, n), clamp(ay + 0.5 + t * (by - ay), 0, NY)));
          }
        }
        if (poly.length >= 3) S.push({ pts: poly, closed: true, fill: 'var(--pigment)', stroke: 'var(--pigment)', width: 0.2, alpha: k * 0.55 });
      }
  }

  // myomeres (chevrons) — embryo/larva; scales — juvenile/adult
  const bounds = ph.somites;
  if (s < 0.7) {
    const alpha = 1 - s / 0.7;
    for (const b of bounds) {
      const pts: Pt[] = [];
      for (let y = 2; y <= NY - 2; y += 1) {
        const off = -Math.abs(y - MID) * 0.18 + 0.9; // > shape pointing anteriorly
        pts.push(toWorld(m, clamp(b - off, 0, n - 1), y));
      }
      S.push({ pts, stroke: INK, width: 0.45, alpha: alpha * 0.8 });
    }
  }
  if (s > 0.45 && bounds.length > 2) {
    const alpha = clamp((s - 0.45) / 0.4, 0, 1);
    for (let i = 0; i < bounds.length - 1; i++) {
      const x0 = bounds[i], x1 = bounds[i + 1];
      for (let y = 1.5, row = 0; y < NY - 1; y += 1.6, row++) {
        const xa = row % 2 ? (x0 + x1) / 2 : x0;
        const c = toWorld(m, xa, y);
        const r = Math.max(0.6, (toWorld(m, xa, y + 1.6)[1] - c[1]) * 0.55);
        const pts: Pt[] = [];
        for (let k = -6; k <= 6; k++) {
          const a = (k / 6) * (Math.PI / 2);
          pts.push([c[0] + r * Math.cos(a) * 0.9, c[1] + r * Math.sin(a)]);
        }
        S.push({ pts, stroke: INK, width: 0.3, alpha: alpha * 0.6 });
      }
    }
  }

  // lateral line
  if (s > 0.3) {
    const pts: Pt[] = [];
    for (let x = ph.headEnd; x < n; x++) pts.push(toWorld(m, x + 0.5, MID + 0.6));
    S.push({ pts: chaikin(pts, 2), stroke: INK, width: 0.5, alpha: clamp((s - 0.3) * 2, 0, 1) * 0.7 });
  }

  // outline on top
  S.push({ pts: outline, closed: true, fill: 'none', stroke: INK, width: 1.1 });

  // operculum
  if (s > 0.15 && ph.headEnd > 6) {
    const xo = ph.headEnd * 0.92;
    const pts: Pt[] = [];
    for (let y = 2; y <= NY - 3; y++) pts.push(toWorld(m, xo - 0.12 * (y - MID) ** 2 * 0.15 + 0.6 * Math.sin((y / NY) * Math.PI), y));
    S.push({ pts: chaikin(pts, 2), stroke: INK, width: 0.8 });
  }

  // ── paired fins (in front of the body)
  const paired = (f: typeof fin.pectoral, angle: number, minRow: number) => {
    if (!f.present) return;
    const [bx, by] = toWorld(m, f.cx - 2, Math.max(minRow, f.cy));
    const len = Math.sqrt(f.amount) * 1.6 * finScale * Math.sqrt(m.scale);
    const rays: Pt[] = [];
    for (let i = 0; i < 7; i++) {
      const a = angle - 0.35 + (i / 6) * 0.7;
      const l = len * (0.75 + 0.25 * Math.sin((i / 6) * Math.PI));
      rays.push([bx + l * Math.cos(a), by + l * Math.sin(a)]);
    }
    const tips = chaikin(rays, 2);
    S.push({ pts: [[bx, by], ...tips], closed: true, fill: 'var(--fin)', stroke: INK, width: 0.7, alpha: 0.92 });
    rays.forEach((r) => S.push({ pts: [[bx, by], r], stroke: INK, width: 0.35 }));
  };
  paired(fin.pelvic, -0.75, 1.2);
  paired(fin.pectoral, -0.35, MID * 0.55);

  // eye
  if (ph.eye.amount > 2) {
    const [ex, ey] = toWorld(m, ph.eye.cx, ph.eye.cy);
    const r = clamp(Math.sqrt(ph.eye.amount) * 0.6, 0.8, 16) * (0.45 + 0.55 * Math.sqrt(m.scale)) * (0.6 + 0.4 * s);
    const circ = (rr: number): Pt[] => Array.from({ length: 32 }, (_, i) => [ex + rr * Math.cos((i / 32) * 6.283), ey + rr * Math.sin((i / 32) * 6.283)] as Pt);
    S.push({ pts: circ(r), closed: true, fill: 'var(--paper)', stroke: INK, width: 0.8 });
    S.push({ pts: circ(r * 0.55), closed: true, fill: 'var(--ink)', stroke: 'none' });
    S.push({ pts: circ(r * 0.15).map(([a, b]) => [a - r * 0.2, b + r * 0.2] as Pt), closed: true, fill: 'var(--paper)', stroke: 'none' });
  }

  // mouth: gape length from the jaw (dlx) territory
  if (ph.jaw.amount > 2) {
    const [mx, my] = toWorld(m, 0.3, clamp(ph.jaw.cy + 2.5, 1, MID));
    const len = clamp(Math.sqrt(ph.jaw.amount) * 1.3, 1, 20) * (0.5 + 0.5 * Math.sqrt(m.scale));
    S.push({ pts: [[mx - 0.5, my], [mx + len, my - len * 0.18]], stroke: INK, width: 0.9 });
  }

  // bounds
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const st of S) for (const [x, y] of st.pts) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { strokes: S, bounds: [x0, y0, x1, y1] };
}
