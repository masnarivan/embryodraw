import type { EffectKind, Genome } from '../genome/gene.ts';
import { effectField, type DevResult } from '../embryo/develop.ts';
import { NX, NY } from '../grn/solver.ts';
import { smooth1d } from '../core/math.ts';

// Reads the developmental fields and extracts anatomy: somites, head, fins, eye, jaw,
// growth tensors and viability. Nothing here invents shape: it only measures where
// the effector genes ended up being expressed.

export type FinKind = 'pectoral' | 'pelvic' | 'dorsalFin' | 'analFin' | 'caudalFin';
export const FIN_KINDS: FinKind[] = ['pectoral', 'pelvic', 'dorsalFin', 'analFin', 'caudalFin'];

export interface Organ {
  amount: number; // integrated expression (cells)
  cx: number; // centroid column
  cy: number; // centroid row
}

export interface Fin extends Organ {
  present: boolean;
  /** median fins: outgrowth per column; caudal: per row; paired: empty */
  profile: number[];
}

export interface Phenotype {
  ncol: number;
  somites: number[]; // boundary columns
  headEnd: number; // first trunk column
  dorsal: Float32Array; // dorsal fate field
  ventral: Float32Array; // ventral fate field
  fins: Record<FinKind, Fin>;
  eye: Organ;
  jaw: Organ;
  /** log growth factor per column (AP) */
  gAP: number[];
  /** log growth factor per cell (DV) */
  gDV: Float32Array;
  viable: boolean;
  failure?: string;
}

function organ(f: Float32Array, ncol: number, thr = 0.15): Organ {
  let a = 0, sx = 0, sy = 0;
  for (let x = 0; x < ncol; x++)
    for (let y = 0; y < NY; y++) {
      const v = f[x * NY + y];
      if (v < thr) continue;
      a += v; sx += v * x; sy += v * y;
    }
  return { amount: a, cx: a ? sx / a : 0, cy: a ? sy / a : 0 };
}

export function somiteBoundaries(clock: Float32Array, ncol: number, from: number): number[] {
  const m = Math.floor(NY / 2);
  const row: number[] = [];
  for (let x = 0; x < ncol; x++) row.push(clock[x * NY + m]);
  let lo = Infinity, hi = -Infinity;
  for (let x = from; x < ncol; x++) { lo = Math.min(lo, row[x]); hi = Math.max(hi, row[x]); }
  if (!(hi - lo > 0.3)) return [];
  const mid = (lo + hi) / 2;
  const out: number[] = [];
  for (let x = from + 1; x < ncol; x++)
    if (row[x - 1] < mid && row[x] >= mid) out.push(x - 1 + (mid - row[x - 1]) / (row[x] - row[x - 1]));
  return out;
}

export function analyse(genome: Genome, dev: DevResult): Phenotype {
  const ncol = Math.min(NX, Math.floor(dev.L) + 1);
  const F = (k: EffectKind) => effectField(genome, dev.fields, k);
  const dorsal = F('dorsalFate'), ventral = F('ventralFate');

  // Head = anterior block that never acquired Hox/trunk identity: measured as the
  // region whose jaw/eye/neural-crest effectors dominate, falling back to growth cue.
  const eyeF = F('eye'), jawF = F('jaw');
  let headEnd = 0;
  for (let x = 0; x < ncol; x++) {
    let h = 0;
    for (let y = 0; y < NY; y++) h = Math.max(h, eyeF[x * NY + y], jawF[x * NY + y]);
    if (h > 0.25) headEnd = x + 1;
  }
  headEnd = Math.max(headEnd, 4);
  // only count somites in tissue where the clock has stopped (anterior to the wavefront)
  let frozenEnd = ncol;
  const gate = genome.genes.find((g) => g.effect?.kind === 'clock' && g.gate);
  const gi = gate?.gate ? dev.ids.indexOf(gate.gate.by) : -1;
  if (gate?.gate && gi >= 0) {
    const gf = dev.fields[gi];
    for (let x = headEnd; x < ncol; x++) if (gf[x * NY + (NY >> 1)] > gate.gate.threshold * 0.8) { frozenEnd = x; break; }
  }
  const somites = somiteBoundaries(F('clock'), frozenEnd, headEnd);
  // the trunk begins with the first somite (the region in between is hindbrain/otic)
  if (somites.length) headEnd = Math.max(headEnd, Math.floor(somites[0]));

  const fins = {} as Record<FinKind, Fin>;
  for (const k of FIN_KINDS) {
    const f = F(k);
    const o = organ(f, ncol);
    let profile: number[] = [];
    if (k === 'dorsalFin' || k === 'analFin') {
      for (let x = 0; x < ncol; x++) {
        const e = k === 'dorsalFin' ? [NY - 1, NY - 2] : [0, 1];
        profile.push(Math.max(f[x * NY + e[0]], f[x * NY + e[1]]));
      }
      profile = smooth1d(profile, 1.5);
    } else if (k === 'caudalFin') {
      for (let y = 0; y < NY; y++) {
        let v = 0;
        for (let x = Math.max(0, ncol - 3); x < ncol; x++) v = Math.max(v, f[x * NY + y]);
        profile.push(v);
      }
    }
    const peak = profile.length ? Math.max(...profile) : 0;
    const present = profile.length ? peak > 0.2 : o.amount > 3;
    fins[k] = { ...o, present, profile };
  }

  const gAPf = F('growthAP'), gDVf = F('growthDV');
  const gAP: number[] = [];
  for (let x = 0; x < ncol; x++) {
    let m = 0;
    for (let y = 0; y < NY; y++) m += gAPf[x * NY + y];
    gAP.push(Math.log(0.4 + 1.6 * Math.max(0, m / NY)));
  }
  const gDV = new Float32Array(NX * NY);
  for (let i = 0; i < gDV.length; i++) gDV[i] = Math.log(0.3 + 2.7 * Math.max(0, gDVf[i]));

  // Viability: developmental failures are data, not errors.
  let failure = dev.failure;
  const trunk = Math.floor((headEnd + ncol) / 2);
  let paraxial = 0;
  for (let y = 0; y < NY; y++) if (dorsal[trunk * NY + y] < 0.5 && ventral[trunk * NY + y] < 0.5) paraxial++;
  if (!failure && paraxial < NY * 0.2)
    failure = paraxial === 0 ? 'nessun mesoderma parassiale: embrione ventralizzato/dorsalizzato' : 'mesoderma parassiale insufficiente';
  if (!failure && ncol - headEnd < 30) failure = 'asse troppo corto: la gemma caudale si è esaurita';
  if (!failure && somites.length < 5) failure = `segmentazione fallita (${somites.length} somiti)`;
  // the fewest vertebrae known in teleosts are ~16 (Molidae, Tetraodontiformes)
  if (!failure && somites.length < 15) failure = `colonna troppo corta per nuotare (${somites.length} vertebre)`;
  const jaw = organ(jawF, ncol, 0.3);
  if (!failure && jaw.amount < 3) failure = 'mascelle assenti: la larva non può alimentarsi';

  return {
    ncol, somites, headEnd, dorsal, ventral, fins,
    eye: organ(eyeF, ncol, 0.3), jaw,
    gAP, gDV, viable: !failure, failure,
  };
}
