import { describe, expect, it } from 'vitest';
import { WILDTYPE } from '../src/genome/presets/wildtype.ts';
import { cloneGenome, deserialize, knockout, serialize, type Gene } from '../src/genome/gene.ts';
import { compile, emptyFields, NX, NY, step } from '../src/grn/solver.ts';
import { run } from '../src/pipeline.ts';
import { EXPERIMENTS } from '../src/ui/experiments.ts';
import { duplicate, mutate } from '../src/evo/mutate.ts';
import { makeRng } from '../src/core/rng.ts';

const wt = run(WILDTYPE);
const exp = (title: string) => run(EXPERIMENTS.find((e) => e.title === title)!.apply(WILDTYPE)).ph;

describe('solver', () => {
  it('diffusion conserves mass with no-flux borders', () => {
    const g: Gene = { id: 'm', stage: 'embryo', rate: 0, decay: 0, D: 0.8, bias: 0, reg: {} };
    const cg = compile([g], ['m']);
    let [a] = emptyFields(1), [b] = emptyFields(1);
    a[50 * NY + 9] = 100;
    for (let s = 0; s < 400; s++) { step(cg, [a], [b], NX, NX, s); [a, b] = [b, a]; }
    const sum = a.reduce((x, y) => x + y, 0);
    expect(sum).toBeCloseTo(100, 2);
    expect(Math.max(...a)).toBeLessThan(5);
  });

  it('is deterministic', () => {
    const again = run(WILDTYPE);
    expect(again.ph.somites).toEqual(wt.ph.somites);
    expect(again.pigment).toEqual(wt.pigment);
  });
});

describe('genome', () => {
  it('round-trips through JSON', () => {
    expect(deserialize(serialize(WILDTYPE))).toEqual(WILDTYPE);
  });
  it('duplication copies regulatory inputs and outputs', () => {
    const g = cloneGenome(WILDTYPE);
    duplicate(g, 'tbx5a');
    const dup = g.genes.find((x) => x.id === 'tbx5ab')!;
    expect(dup.reg).toEqual(WILDTYPE.genes.find((x) => x.id === 'tbx5a')!.reg);
  });
  it('mutants always develop without numerical failure', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 4; i++) {
      const r = run(mutate(WILDTYPE, rng, 3).genome);
      expect(r.ph.failure ?? '').not.toMatch(/numerica/);
    }
  }, 60_000);
});

describe('wild-type development', () => {
  it('is a viable teleost-like larva', () => {
    const ph = wt.ph;
    expect(ph.viable).toBe(true);
    expect(ph.somites.length).toBeGreaterThanOrEqual(26);
    expect(ph.somites.length).toBeLessThanOrEqual(36);
    for (const f of Object.values(ph.fins)) expect(f.present).toBe(true);
    // anatomical order along the axis emerges from the Hox code
    expect(ph.fins.pectoral.cx).toBeLessThan(ph.fins.pelvic.cx);
    expect(ph.fins.pelvic.cx).toBeLessThan(ph.fins.analFin.cx);
    expect(ph.fins.analFin.cx).toBeLessThan(ph.fins.caudalFin.cx);
  });
});

describe('classic experiments reproduce known phenotypes', () => {
  it('chordin−/− ventralizes the embryo (lethal)', () => {
    const ph = exp('chordin −/−');
    expect(ph.viable).toBe(false);
    expect(ph.failure).toMatch(/ventralizzato/);
  });
  it('her1−/− abolishes segmentation', () => {
    expect(exp('her1 −/−').somites.length).toBeLessThan(5);
  });
  it('a faster clock makes more, smaller somites (snake mechanism)', () => {
    expect(exp('Orologio più veloce').somites.length).toBeGreaterThan(wt.ph.somites.length + 5);
  });
  it('anteriorizing the hoxc6 boundary moves pelvic and dorsal fins forward (homeosis)', () => {
    const ph = exp('Confine Hox anteriorizzato');
    expect(ph.fins.pelvic.cx).toBeLessThan(wt.ph.fins.pelvic.cx - 4);
    expect(ph.fins.dorsalFin.cx).toBeLessThan(wt.ph.fins.dorsalFin.cx - 4);
  });
  it('tbx5a−/− removes only the pectoral fins', () => {
    const ph = exp('tbx5a −/−');
    expect(ph.fins.pectoral.present).toBe(false);
    expect(ph.fins.pelvic.present).toBe(true);
    expect(ph.viable).toBe(true);
  });
  it('tbx5a duplication increases pectoral dosage', () => {
    expect(exp('Duplicazione di tbx5a').fins.pectoral.amount).toBeGreaterThan(wt.ph.fins.pectoral.amount * 1.5);
  });
  it('otx2−/− loses eyes and jaws', () => {
    const ph = run(knockout(WILDTYPE, 'otx2')).ph;
    expect(ph.eye.amount).toBeLessThan(1);
    expect(ph.viable).toBe(false);
  });
  it('a longer-lived tailbud adds vertebrae', () => {
    expect(exp('Gemma caudale più longeva').somites.length).toBeGreaterThan(wt.ph.somites.length);
  });
  it('the skin forms a Turing pattern', () => {
    const p = wt.pigment.slice(0, wt.ph.ncol * NY);
    let lo = Infinity, hi = -Infinity;
    for (const v of p) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    expect(hi - lo).toBeGreaterThan(0.4);
  });
});
