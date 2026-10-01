import { WILDTYPE } from '../src/genome/presets/wildtype.ts';
import { run } from '../src/pipeline.ts';
import { EXPERIMENTS } from '../src/ui/experiments.ts';
import type { Phenotype } from '../src/stages/phenotype.ts';
import { NY } from '../src/grn/solver.ts';

function summary(ph: Phenotype) {
  const trunk = Math.floor((ph.headEnd + ph.ncol) / 2);
  let v = 0, d = 0;
  for (let y = 0; y < NY; y++) { if (ph.ventral[trunk * NY + y] > 0.5) v++; if (ph.dorsal[trunk * NY + y] > 0.5) d++; }
  const f = ph.fins;
  return `viable=${ph.viable} ${ph.failure ?? ''} | somites=${ph.somites.length} ncol=${ph.ncol} head=${ph.headEnd} ventralRows=${v} dorsalRows=${d} | pect=${f.pectoral.present ? f.pectoral.amount.toFixed(0) + '@' + f.pectoral.cx.toFixed(0) : '-'} pelv=${f.pelvic.present ? f.pelvic.amount.toFixed(0) + '@' + f.pelvic.cx.toFixed(0) : '-'} dors=${f.dorsalFin.present ? f.dorsalFin.cx.toFixed(0) : '-'} anal=${f.analFin.present ? f.analFin.cx.toFixed(0) : '-'} caud=${f.caudalFin.present} eye=${ph.eye.amount.toFixed(0)} jaw=${ph.jaw.amount.toFixed(0)}`;
}
console.log('WT       ', summary(run(WILDTYPE).ph));
for (const ex of EXPERIMENTS) console.log(ex.title.padEnd(32), summary(run(ex.apply(WILDTYPE)).ph));
