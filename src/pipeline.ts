import { hashString } from './core/rng.ts';
import type { Genome } from './genome/gene.ts';
import { develop, T_END } from './embryo/develop.ts';
import { analyse, type Phenotype } from './stages/phenotype.ts';
import { developSkin } from './stages/skin.ts';

export interface FrameOut {
  t: number;
  L: number;
  ph: Phenotype;
  fields: Float32Array[];
}

export interface RunResult {
  ids: string[];
  ph: Phenotype;
  pigment: Float32Array;
  fields: Float32Array[];
  frames: FrameOut[];
  tElongEnd: number;
  ms: number;
}

/** Full developmental run: embryo GRN → anatomy → skin. Deterministic per genome. */
export function run(genome: Genome, opts: { frames?: boolean } = {}): RunResult {
  const t0 = performance.now();
  const dev = develop(genome, { frameEvery: opts.frames ? 10 : 0 });
  const ph = analyse(genome, dev);
  const pigment = developSkin(genome, dev.fields, ph, hashString(JSON.stringify(genome.genes)));
  const frames: FrameOut[] = dev.frames.map((f) => {
    const full = f.fields.map((a) => { const b = new Float32Array(dev.fields[0].length); b.set(a); return b; });
    return { t: f.t, L: f.L, fields: full, ph: analyse(genome, { ...dev, fields: full, L: f.L }) };
  });
  return { ids: dev.ids, ph, pigment, fields: dev.fields, frames, tElongEnd: dev.tElongEnd, ms: performance.now() - t0 };
}

export { T_END };
