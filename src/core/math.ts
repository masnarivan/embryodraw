export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export type Pt = [number, number];

/** 1D gaussian smoothing with reflecting borders. */
export function smooth1d(xs: ArrayLike<number>, sigma: number): number[] {
  const n = xs.length;
  if (sigma <= 0) return Array.from(xs);
  const r = Math.ceil(sigma * 3);
  const k: number[] = [];
  for (let i = -r; i <= r; i++) k.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = 0, w = 0;
    for (let j = -r; j <= r; j++) {
      let q = i + j;
      if (q < 0) q = -q;
      if (q >= n) q = 2 * n - q - 2;
      if (q < 0 || q >= n) continue;
      s += xs[q] * k[j + r];
      w += k[j + r];
    }
    out[i] = s / w;
  }
  return out;
}

/** Chaikin smoothing for polylines (open). */
export function chaikin(pts: Pt[], iters = 2): Pt[] {
  let p = pts;
  for (let it = 0; it < iters; it++) {
    if (p.length < 3) return p;
    const q: Pt[] = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, ay] = p[i], [bx, by] = p[i + 1];
      q.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25]);
      q.push([ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}
