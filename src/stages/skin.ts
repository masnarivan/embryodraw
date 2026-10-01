import { makeRng } from '../core/rng.ts';
import type { Genome } from '../genome/gene.ts';
import { compile, DT, genesOfStage, NX, NY, step } from '../grn/solver.ts';
import type { Phenotype } from './phenotype.ts';

export const SKIN_TIME = 900;

/**
 * Pigment pattern: skin genes (a Turing activator/inhibitor pair in the wild-type) run
 * on the *grown* body. Diffusion is rescaled by the growth factors, so anisotropic
 * growth stretches the pattern exactly as it would stretch real skin.
 */
export function developSkin(genome: Genome, embryoFields: Float32Array[], ph: Phenotype, seed: number): Float32Array {
  const ids = genome.genes.map((g) => g.id);
  const skin = genesOfStage(genome, 'skin');
  const out = new Float32Array(NX * NY);
  if (!skin.length || !ph.viable) return out;
  const cg = compile(skin, ids);
  let cur = embryoFields.map((f) => f.slice());
  let nxt = embryoFields.map((f) => f.slice());
  const rng = makeRng(seed);
  for (const c of cg) {
    const f = cur[c.selfIdx];
    for (let i = 0; i < f.length; i++) f[i] = 0.45 + 0.1 * rng.next();
  }
  // mean adult cell size along each axis
  let ax = 0;
  for (const g of ph.gAP) ax += Math.exp(g);
  ax /= ph.gAP.length;
  let ay = 0, n = 0;
  for (let x = 0; x < ph.ncol; x++) for (let y = 0; y < NY; y++, n++) ay += Math.exp(ph.gDV[x * NY + y]);
  ay /= n;
  // explicit-scheme stability: Σ D_eff · DT ≤ 0.4 (coarser skin grid if needed)
  const Dmax = Math.max(...skin.map((g) => g.D));
  const k = Math.max(1, Math.sqrt((Dmax * (1 / ax ** 2 + 1 / ay ** 2) * DT) / 0.4));
  const dx2: [number, number] = [(ax * k) ** 2, (ay * k) ** 2];
  const steps = Math.round(SKIN_TIME / DT);
  for (let s = 0; s < steps; s++) {
    step(cg, cur, nxt, ph.ncol, ph.ncol, s, 0, dx2);
    [cur, nxt] = [nxt, cur];
  }
  genome.genes.forEach((g, i) => {
    if (g.effect?.kind !== 'melanophore') return;
    for (let j = 0; j < out.length; j++) out[j] += g.effect.strength * cur[i][j];
  });
  return out;
}
