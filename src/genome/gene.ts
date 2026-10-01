// A gene = cis-regulatory module (weights + bias + optional maternal/positional input)
// + product kinetics (rate, decay, diffusion) + optional morphogenetic effector.
//
//   dg/dt = gate · ( rate·σ(Σ w_j g_j + bias + src·profile) − decay·g ) + D ∇²g
//
// Stages never look genes up by name: they read *effects*. A duplicated or renamed
// gene therefore keeps (or splits) its developmental role, as paralogues do.

export type SourceKind = 'ventral' | 'dorsal' | 'edges' | 'anterior' | 'tip';

export type EffectKind =
  | 'elongation' // tailbud activity → axis extension speed
  | 'clock' // segmentation clock; frozen phase marks somite boundaries
  | 'dorsalFate' // neural / dorsal ectoderm identity
  | 'ventralFate' // lateral plate mesoderm identity
  | 'pectoral' | 'pelvic' | 'dorsalFin' | 'analFin' | 'caudalFin'
  | 'eye' | 'jaw'
  | 'growthAP' | 'growthDV' // post-embryonic allometric growth
  | 'melanophore'; // dark pigment cells (skin stage)

export const EFFECT_KINDS: EffectKind[] = [
  'elongation', 'clock', 'dorsalFate', 'ventralFate', 'pectoral', 'pelvic', 'dorsalFin',
  'analFin', 'caudalFin', 'eye', 'jaw', 'growthAP', 'growthDV', 'melanophore',
];

export interface Gene {
  id: string;
  /** Short note shown in the inspector (biological analogue). */
  note?: string;
  /** 'embryo' genes run during development; 'skin' genes run on the grown body. */
  stage: 'embryo' | 'skin';
  rate: number;
  decay: number;
  D: number;
  bias: number;
  /** regulator id → weight (positive = activation, negative = repression) */
  reg: Record<string, number>;
  source?: { kind: SourceKind; strength: number; width: number };
  /** Dynamics only run where `by` exceeds `threshold` (e.g. clock needs FGF). */
  gate?: { by: string; threshold: number };
  /** Delay (time units) on self-regulation: delayed negative feedback → oscillation. */
  delay?: number;
  effect?: { kind: EffectKind; strength: number };
}

export interface Genome {
  name: string;
  genes: Gene[];
}

export function cloneGenome(g: Genome): Genome {
  return JSON.parse(JSON.stringify(g));
}

export function geneIndex(g: Genome): Map<string, number> {
  return new Map(g.genes.map((x, i) => [x.id, i]));
}

/** Knockout = gene removed from the network (its product is never made). */
export function knockout(g: Genome, id: string): Genome {
  const c = cloneGenome(g);
  c.genes = c.genes.filter((x) => x.id !== id);
  c.name = `${g.name} ${id}−/−`;
  return c;
}

/** Overexpression = ubiquitous strong activation of the cis-regulatory module. */
export function overexpress(g: Genome, id: string): Genome {
  const c = cloneGenome(g);
  const gene = c.genes.find((x) => x.id === id);
  if (gene) gene.bias += 12;
  c.name = `${g.name} ${id} OE`;
  return c;
}

export function serialize(g: Genome): string {
  return JSON.stringify(g, null, 1);
}

export function deserialize(s: string): Genome {
  const g = JSON.parse(s) as Genome;
  if (!g || !Array.isArray(g.genes)) throw new Error('genoma non valido');
  return g;
}
// Full schema checks live in ./validate.ts (used by the import button).
