import { clamp } from '../core/math.ts';
import type { EffectKind, Genome } from '../genome/gene.ts';
import { compile, copyColumn, DT, emptyFields, genesOfStage, L0, NX, NY, step } from '../grn/solver.ts';

export const T_END = 480; // developmental time units (≈ end of segmentation + fin bud stage)
export const V_MAX = 0.3; // max axis elongation, columns per time unit

export interface Frame {
  t: number;
  L: number;
  fields: Float32Array[];
}

export interface DevResult {
  ids: string[];
  fields: Float32Array[];
  L: number;
  frames: Frame[];
  /** time at which the tailbud stopped elongating the axis (or T_END) */
  tElongEnd: number;
  failure?: string;
}

export interface DevOptions {
  tEnd?: number;
  /** snapshot every N time units (0 = no frames) */
  frameEvery?: number;
}

/** Sum of the fields carrying a given effect, weighted by effect strength. */
export function effectField(genome: Genome, fields: Float32Array[], kind: EffectKind): Float32Array {
  const out = new Float32Array(NX * NY);
  genome.genes.forEach((g, i) => {
    if (g.effect?.kind !== kind) return;
    const f = fields[i], s = g.effect.strength;
    for (let k = 0; k < out.length; k++) out[k] += s * f[k];
  });
  return out;
}

export function develop(genome: Genome, opts: DevOptions = {}): DevResult {
  const tEnd = opts.tEnd ?? T_END;
  const frameEvery = opts.frameEvery ?? 0;
  const ids = genome.genes.map((g) => g.id);
  const cg = compile(genesOfStage(genome, 'embryo'), ids);
  let cur = emptyFields(ids.length), nxt = emptyFields(ids.length);
  const elong = genome.genes
    .map((g, i) => (g.effect?.kind === 'elongation' ? { i, s: g.effect.strength } : null))
    .filter((x): x is { i: number; s: number } => x !== null);

  let L = L0 - 1;
  let tElongEnd = tEnd;
  let stalled = 0;
  const frames: Frame[] = [];
  const steps = Math.round(tEnd / DT);
  const frameSteps = frameEvery > 0 ? Math.round(frameEvery / DT) : 0;
  const snap = (t: number) => frames.push({ t, L, fields: cur.map((f) => f.slice(0, (Math.floor(L) + 1) * NY)) });
  if (frameSteps) snap(0);

  for (let s = 0; s < steps; s++) {
    const ncol = Math.min(NX, Math.floor(L) + 1);
    step(cg, cur, nxt, ncol, L, s);
    [cur, nxt] = [nxt, cur];

    // Tailbud: elongation speed read from the elongation effectors at the tip column.
    const tip = Math.floor(L);
    let e = 0;
    for (const { i, s: str } of elong) {
      let m = 0;
      for (let y = 0; y < NY; y++) m += cur[i][tip * NY + y];
      e += (str * m) / NY;
    }
    const v = V_MAX * clamp(e, 0, 1.5);
    if (v < 0.02 * V_MAX && s * DT > 20) {
      if (++stalled === 1) tElongEnd = s * DT;
    } else stalled = 0;
    const newL = Math.min(NX - 1, L + v * DT);
    for (let c = Math.floor(L) + 1; c <= Math.floor(newL); c++) {
      copyColumn(cg, cur, c - 1, c);
      copyColumn(cg, nxt, c - 1, c);
    }
    if (newL >= NX - 1 && L < NX - 1) tElongEnd = s * DT;
    L = newL;

    if (frameSteps && (s + 1) % frameSteps === 0) snap((s + 1) * DT);
  }

  let failure: string | undefined;
  for (const f of cur) if (!Number.isFinite(f[0]) || f.some((v) => !Number.isFinite(v))) failure = 'instabilità numerica';
  return { ids, fields: cur, L, frames, tElongEnd, failure };
}
