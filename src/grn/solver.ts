import type { Gene, Genome, SourceKind } from '../genome/gene.ts';

// Grid embryo in material (lagrangian) coordinates: x = antero-posterior column,
// y = dorso-ventral row (0 = ventral edge, NY-1 = dorsal edge). Cells are added at the
// posterior tip as the tailbud elongates the axis.
export const NX = 170;
export const NY = 18;
export const L0 = 24; // initial anterior block (future head)
export const DT = 0.25;

export interface Field {
  /** gene ids in field order */
  ids: string[];
  /** one array per gene, index x*NY + y */
  data: Float32Array[];
  /** current axis length (columns, fractional) */
  L: number;
}

export interface CompiledGene {
  g: Gene;
  selfIdx: number; // field index of this gene's product
  regIdx: Int32Array;
  regW: Float32Array;
  selfW: number; // self weight (applied to the delayed value if gene has delay)
  gateIdx: number;
  delaySteps: number;
  history: Float32Array | null; // ring buffer [step][cell]
  /** precomputed static source profile (null for tip sources, recomputed per step) */
  staticSrc: Float32Array | null;
  colSrc: Float32Array; // per-column scratch for tip sources
}

export function compile(genes: Gene[], ids: string[]): CompiledGene[] {
  const index = new Map(ids.map((id, i) => [id, i]));
  return genes.map((g) => {
    const regs = Object.entries(g.reg).filter(([id]) => index.has(id));
    const delaySteps = g.delay ? Math.max(1, Math.round(g.delay / DT)) : 0;
    const selfW = delaySteps ? (g.reg[g.id] ?? 0) : 0;
    const kept = delaySteps ? regs.filter(([id]) => id !== g.id) : regs;
    return {
      g,
      selfIdx: index.get(g.id)!,
      regIdx: Int32Array.from(kept.map(([id]) => index.get(id)!)),
      regW: Float32Array.from(kept.map(([, w]) => w)),
      selfW,
      gateIdx: g.gate ? (index.get(g.gate.by) ?? -1) : -1,
      delaySteps,
      history: delaySteps ? new Float32Array(delaySteps * NX * NY) : null,
      staticSrc: g.source && g.source.kind !== 'tip' ? staticProfile(g.source.kind, g.source.width, g.source.strength) : null,
      colSrc: new Float32Array(NX),
    };
  });
}

function staticProfile(kind: SourceKind, width: number, strength: number): Float32Array {
  const out = new Float32Array(NX * NY);
  for (let x = 0; x < NX; x++)
    for (let y = 0; y < NY; y++) out[x * NY + y] = strength * profile(kind, width, x, y, 0);
  return out;
}

export function profile(kind: SourceKind, width: number, x: number, y: number, L: number): number {
  switch (kind) {
    case 'ventral': return Math.exp(-y / width);
    case 'dorsal': return Math.exp(-(NY - 1 - y) / width);
    case 'edges': return Math.max(Math.exp(-y / width), Math.exp(-(NY - 1 - y) / width));
    case 'anterior': return Math.exp(-x / width);
    case 'tip': return x > L ? 0 : Math.exp(-(L - x) / width);
  }
}

/**
 * One explicit Euler step of the reaction–diffusion GRN on columns [x0, ncol).
 * `cur` and `nxt` are parallel arrays of per-gene fields.
 */
export function step(
  cg: CompiledGene[], cur: Float32Array[], nxt: Float32Array[], ncol: number, L: number,
  stepNo: number, x0 = 0, dx2 = [1, 1] as [number, number],
): void {
  for (const c of cg) {
    const g = c.g;
    const a = cur[c.selfIdx], out = nxt[c.selfIdx];
    const D = g.D, rate = g.rate, decay = g.decay, bias = g.bias;
    const nr = c.regIdx.length;
    const r0 = nr > 0 ? cur[c.regIdx[0]] : a, w0 = nr > 0 ? c.regW[0] : 0;
    const r1 = nr > 1 ? cur[c.regIdx[1]] : a, w1 = nr > 1 ? c.regW[1] : 0;
    const r2 = nr > 2 ? cur[c.regIdx[2]] : a, w2 = nr > 2 ? c.regW[2] : 0;
    const rest: Float32Array[] = [];
    for (let r = 3; r < nr; r++) rest.push(cur[c.regIdx[r]]);
    const src = g.source;
    const stat = c.staticSrc;
    const tipSrc = src && !stat ? c.colSrc : null;
    if (tipSrc && src) for (let x = x0; x < ncol; x++) tipSrc[x] = src.strength * profile('tip', src.width, x, 0, L);
    const gateArr = c.gateIdx >= 0 ? cur[c.gateIdx] : null;
    const gateThr = g.gate ? g.gate.threshold : 0;
    const hist = c.history;
    const ds = c.delaySteps;
    const slot = ds ? (stepNo % ds) * NX * NY : 0;
    const Dx = D / dx2[0], Dy = D / dx2[1];
    for (let x = x0; x < ncol; x++) {
      for (let y = 0; y < NY; y++) {
        const i = x * NY + y;
        let input = bias + w0 * r0[i] + w1 * r1[i] + w2 * r2[i];
        for (let r = 3; r < nr; r++) input += c.regW[r] * rest[r - 3][i];
        if (hist) input += c.selfW * hist[slot + i]; // value from `delay` ago
        if (stat) input += stat[i];
        else if (tipSrc) input += tipSrc[x];
        const v = a[i];
        let react = rate / (1 + Math.exp(-input)) - decay * v;
        if (gateArr) react /= 1 + Math.exp(-25 * (gateArr[i] - gateThr));
        let lap = 0;
        if (D > 0) {
          const l = x > x0 ? a[i - NY] : v, rr = x < ncol - 1 ? a[i + NY] : v;
          const d = y > 0 ? a[i - 1] : v, u = y < NY - 1 ? a[i + 1] : v;
          lap = Dx * (l + rr - 2 * v) + Dy * (d + u - 2 * v);
        }
        const nv = v + DT * (react + lap);
        out[i] = nv > 0 ? nv : 0;
      }
    }
    if (hist) {
      // store current value: it will be read back `ds` steps later
      for (let x = x0; x < ncol; x++)
        for (let y = 0; y < NY; y++) { const i = x * NY + y; hist[slot + i] = a[i]; }
    }
  }
}

/** Copy column `from` into column `to` for all fields and delay histories (tailbud growth). */
export function copyColumn(cg: CompiledGene[], fields: Float32Array[], from: number, to: number): void {
  for (const f of fields) f.copyWithin(to * NY, from * NY, from * NY + NY);
  for (const c of cg) {
    const h = c.history;
    if (h) {
      for (let s = 0; s < c.delaySteps; s++) {
        const o = s * NX * NY;
        h.copyWithin(o + to * NY, o + from * NY, o + from * NY + NY);
      }
    }
  }
}

export function emptyFields(n: number): Float32Array[] {
  return Array.from({ length: n }, () => new Float32Array(NX * NY));
}

export function genesOfStage(genome: Genome, stage: 'embryo' | 'skin'): Gene[] {
  return genome.genes.filter((g) => g.stage === stage);
}
