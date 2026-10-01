// Quick ASCII diagnostics: node test/diag.ts [geneIds...]
import { WILDTYPE } from '../src/genome/presets/wildtype.ts';
import { develop } from '../src/embryo/develop.ts';
import { NX, NY } from '../src/grn/solver.ts';

const t0 = performance.now();
const r = develop(WILDTYPE);
console.log(`dev ${(performance.now() - t0).toFixed(0)} ms  L=${r.L.toFixed(1)} tElongEnd=${r.tElongEnd} ${r.failure ?? ''}`);
const shades = ' .:-=+*#%@';
const want = process.argv.slice(2);
for (const id of want.length ? want : r.ids) {
  const f = r.fields[r.ids.indexOf(id)];
  let max = 0;
  for (const v of f) max = Math.max(max, v);
  console.log(`\n${id}  max=${max.toFixed(2)}`);
  for (let y = NY - 1; y >= 0; y -= 2) {
    let line = '';
    for (let x = 0; x < NX; x++) {
      const v = f[x * NY + y] / (max || 1);
      line += shades[Math.min(9, Math.floor(v * 9.99))];
    }
    console.log(line);
  }
}
