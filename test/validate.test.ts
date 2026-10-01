import { describe, expect, it } from 'vitest';
import { serialize } from '../src/genome/gene.ts';
import { WILDTYPE } from '../src/genome/presets/wildtype.ts';
import { validateGenome } from '../src/genome/validate.ts';

describe('genome validation', () => {
  it('accepts the wild-type with no warnings', () => {
    const v = validateGenome(serialize(WILDTYPE));
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
    expect(v.genome?.genes.length).toBe(WILDTYPE.genes.length);
  });
  it('rejects malformed genes', () => {
    const v = validateGenome(JSON.stringify({ genes: [{ id: 'a', stage: 'x', rate: -1, decay: 0, D: 0, bias: 0, reg: { b: 'z' } }, { id: 'a' }] }));
    expect(v.genome).toBeNull();
    expect(v.errors.join('\n')).toMatch(/stage/);
    expect(v.errors.join('\n')).toMatch(/negativo/);
    expect(v.errors.join('\n')).toMatch(/duplicato/);
  });
  it('warns about dangling regulators and missing core effects', () => {
    const v = validateGenome(JSON.stringify({ genes: [{ id: 'a', stage: 'embryo', rate: 1, decay: 1, D: 2, bias: 0, reg: { ghost: 1 } }] }));
    expect(v.genome).not.toBeNull();
    expect(v.warnings.join('\n')).toMatch(/ghost/);
    expect(v.warnings.join('\n')).toMatch(/elongation/);
    expect(v.warnings.join('\n')).toMatch(/instabile/);
  });
  it('reports invalid JSON', () => {
    expect(validateGenome('{').errors[0]).toMatch(/JSON/);
  });
});
