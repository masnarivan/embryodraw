import type { Drawing } from './body.ts';

export type Palette = Record<string, string>;

export const LIGHT: Palette = {
  '--ink': '#2b2620', '--paper': '#f6f1e6', '--body': '#efe6d2', '--fin': '#e9dcc0',
  '--pigment': '#3b2f25', '--yolk': '#f2d58a',
};

const resolve = (c: string | undefined, pal: Palette) => {
  if (!c) return 'none';
  const m = /^var\((--[\w-]+)\)$/.exec(c);
  return m ? (pal[m[1]] ?? '#000') : c;
};

/** Fit drawing into (w,h) with margin; world Y is up, screen Y is down. */
export function fit(d: Drawing, w: number, h: number, margin = 16) {
  const [x0, y0, x1, y1] = d.bounds;
  const k = Math.min((w - 2 * margin) / Math.max(1e-6, x1 - x0), (h - 2 * margin) / Math.max(1e-6, y1 - y0));
  const ox = (w - (x1 - x0) * k) / 2 - x0 * k;
  const oy = (h - (y1 - y0) * k) / 2 + y1 * k;
  return { k, tx: (x: number) => ox + x * k, ty: (y: number) => oy - y * k };
}

export function drawCanvas(ctx: CanvasRenderingContext2D, d: Drawing, w: number, h: number, pal: Palette, kFixed?: number) {
  const f = fit(d, w, h);
  const k = kFixed ? Math.min(kFixed, f.k) : f.k;
  const [x0, y0, x1, y1] = d.bounds;
  const ox = (w - (x1 - x0) * k) / 2 - x0 * k, oy = (h - (y1 - y0) * k) / 2 + y1 * k;
  const lw = Math.max(0.6, k / 3.2);
  for (const s of d.strokes) {
    if (s.pts.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(ox + s.pts[0][0] * k, oy - s.pts[0][1] * k);
    for (let i = 1; i < s.pts.length; i++) ctx.lineTo(ox + s.pts[i][0] * k, oy - s.pts[i][1] * k);
    if (s.closed) ctx.closePath();
    ctx.globalAlpha = s.alpha ?? 1;
    const fill = resolve(s.fill, pal), stroke = resolve(s.stroke, pal);
    if (fill !== 'none') { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = (s.width ?? 1) * lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
  }
  ctx.globalAlpha = 1;
}

export function toSVG(d: Drawing, pal: Palette, w = 1200, h = 600): string {
  const { k, tx, ty } = fit(d, w, h, 30);
  const lw = Math.max(0.6, k / 3.2);
  const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<rect width="100%" height="100%" fill="${pal['--paper']}"/>`];
  for (const s of d.strokes) {
    if (s.pts.length < 2) continue;
    const dd = s.pts.map(([x, y], i) => `${i ? 'L' : 'M'}${tx(x).toFixed(1)} ${ty(y).toFixed(1)}`).join('') + (s.closed ? 'Z' : '');
    const fill = resolve(s.fill, pal), stroke = resolve(s.stroke, pal);
    out.push(`<path d="${dd}" fill="${s.closed ? fill : 'none'}" stroke="${stroke}" stroke-width="${((s.width ?? 1) * lw).toFixed(2)}" stroke-linejoin="round" stroke-linecap="round"${s.alpha !== undefined ? ` opacity="${s.alpha.toFixed(2)}"` : ''}/>`);
  }
  out.push('</svg>');
  return out.join('\n');
}
