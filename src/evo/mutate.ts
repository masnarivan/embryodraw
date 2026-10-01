import type { Rng } from '../core/rng.ts';
import { cloneGenome, type Gene, type Genome } from '../genome/gene.ts';

// Mutation operators act on the *developmental program*, never on the drawing:
// cis-regulatory weights, thresholds, kinetics, new/lost links, duplication, loss.

export interface Mutant {
  genome: Genome;
  log: string[];
}

const fmt = (v: number) => (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2));

function poisson(rng: Rng, lambda: number): number {
  let k = 0, p = Math.exp(-lambda), s = p;
  const u = rng.next();
  while (u > s && k < 20) { k++; p *= lambda / k; s += p; }
  return k;
}

function newId(g: Genome, id: string): string {
  for (const suf of 'bcdefghij') {
    const cand = `${id}${suf}`;
    if (!g.genes.some((x) => x.id === cand)) return cand;
  }
  return `${id}_${g.genes.length}`;
}

type Op = (g: Genome, rng: Rng) => string | null;

const tweakWeight: Op = (g, rng) => {
  const gene = rng.pick(g.genes);
  const keys = Object.keys(gene.reg);
  if (!keys.length) return null;
  const k = rng.pick(keys);
  const old = gene.reg[k];
  gene.reg[k] = old + rng.gauss() * Math.max(1, Math.abs(old) * 0.15);
  return `${gene.id}: peso ${k} ${fmt(old)}→${fmt(gene.reg[k])} (enhancer)`;
};

const tweakBias: Op = (g, rng) => {
  const gene = rng.pick(g.genes);
  const old = gene.bias;
  gene.bias += rng.gauss() * 1;
  return `${gene.id}: soglia ${fmt(old)}→${fmt(gene.bias)} (promotore)`;
};

const tweakKinetics: Op = (g, rng) => {
  const gene = rng.pick(g.genes);
  const opts: (() => string | null)[] = [
    () => { if (gene.D <= 0) return null; const o = gene.D; gene.D = Math.min(gene.stage === 'skin' ? 3 : 1, o * Math.exp(rng.gauss() * 0.25)); return `${gene.id}: diffusione ${fmt(o)}→${fmt(gene.D)}`; },
    () => { const o = gene.decay; if (o <= 0) return null; const f = Math.exp(rng.gauss() * 0.2); gene.decay *= f; gene.rate *= f; return `${gene.id}: emivita ×${fmt(1 / f)}`; },
    () => { if (!gene.source) return null; const o = gene.source.strength; gene.source.strength = o * Math.exp(rng.gauss() * 0.2); return `${gene.id}: deposito materno ${fmt(o)}→${fmt(gene.source.strength)}`; },
    () => { if (!gene.delay) return null; const o = gene.delay; gene.delay = Math.max(0.5, o * Math.exp(rng.gauss() * 0.15)); return `${gene.id}: ritardo ${fmt(o)}→${fmt(gene.delay)}`; },
    () => { if (!gene.gate) return null; const o = gene.gate.threshold; gene.gate.threshold = o * Math.exp(rng.gauss() * 0.2); return `${gene.id}: soglia di ${gene.gate.by} ${fmt(o)}→${fmt(gene.gate.threshold)}`; },
  ];
  return rng.pick(opts)();
};

const addLink: Op = (g, rng) => {
  const target = rng.pick(g.genes);
  const reg = rng.pick(g.genes);
  if (target.reg[reg.id] !== undefined || (target.delay && reg.id === target.id)) return null;
  target.reg[reg.id] = rng.gauss() * 3;
  return `${target.id}: nuovo sito di legame per ${reg.id} (${fmt(target.reg[reg.id])})`;
};

const removeLink: Op = (g, rng) => {
  const gene = rng.pick(g.genes);
  const keys = Object.keys(gene.reg).filter((k) => k !== gene.id);
  if (!keys.length) return null;
  const k = rng.pick(keys);
  delete gene.reg[k];
  return `${gene.id}: perso il sito di legame per ${k}`;
};

const tweakEffect: Op = (g, rng) => {
  const withEff = g.genes.filter((x) => x.effect);
  if (!withEff.length) return null;
  const gene = rng.pick(withEff);
  const o = gene.effect!.strength;
  gene.effect!.strength = o * Math.exp(rng.gauss() * 0.25);
  return `${gene.id}: forza effettore ${gene.effect!.kind} ${fmt(o)}→${fmt(gene.effect!.strength)}`;
};

/** Gene duplication: the paralogue is an exact copy; its product is the same protein,
 *  so every target of the original also receives it (dosage doubles until divergence). */
export function duplicate(g: Genome, id: string): string | null {
  const orig = g.genes.find((x) => x.id === id);
  if (!orig) return null;
  const nid = newId(g, id);
  const dup: Gene = JSON.parse(JSON.stringify(orig));
  dup.id = nid;
  dup.note = `paralogo di ${id}${orig.note ? ` — ${orig.note}` : ''}`;
  if (orig.delay && dup.reg[id] !== undefined) { dup.reg[nid] = dup.reg[id]; delete dup.reg[id]; }
  for (const x of [...g.genes, dup]) {
    if (x.reg[id] !== undefined && !(x.delay && x === orig)) x.reg[nid] = x.reg[id];
  }
  if (dup.gate?.by === id) dup.gate.by = nid;
  g.genes.splice(g.genes.indexOf(orig) + 1, 0, dup);
  return `duplicazione: ${id} → ${id} + ${nid}`;
}

const dupOp: Op = (g, rng) => duplicate(g, rng.pick(g.genes).id);

const deleteOp: Op = (g, rng) => {
  if (g.genes.length < 4) return null;
  const gene = rng.pick(g.genes);
  g.genes = g.genes.filter((x) => x !== gene);
  for (const x of g.genes) delete x.reg[gene.id];
  return `perdita del gene ${gene.id}`;
};

const OPS: [Op, number][] = [
  [tweakWeight, 38], [tweakBias, 20], [tweakKinetics, 12], [addLink, 7], [removeLink, 5],
  [tweakEffect, 9], [dupOp, 6], [deleteOp, 3],
];

export function mutate(parent: Genome, rng: Rng, rate = 1.2): Mutant {
  const g = cloneGenome(parent);
  const n = 1 + poisson(rng, rate);
  const log: string[] = [];
  const total = OPS.reduce((a, [, w]) => a + w, 0);
  let guard = 0;
  while (log.length < n && guard++ < 50) {
    let r = rng.next() * total;
    let op = OPS[0][0];
    for (const [o, w] of OPS) { if ((r -= w) < 0) { op = o; break; } }
    const msg = op(g, rng);
    if (msg) log.push(msg);
  }
  return { genome: g, log };
}

/** Uniform crossover at gene level (genes matched by id; unmatched genes inherited from either). */
export function cross(a: Genome, b: Genome, rng: Rng): Genome {
  const byId = new Map(b.genes.map((x) => [x.id, x]));
  const genes = a.genes.map((x) => JSON.parse(JSON.stringify(byId.has(x.id) && rng.chance(0.5) ? byId.get(x.id)! : x)) as Gene);
  for (const x of b.genes) if (!a.genes.some((y) => y.id === x.id) && rng.chance(0.5)) genes.push(JSON.parse(JSON.stringify(x)));
  return { name: `${a.name}×${b.name}`, genes };
}
