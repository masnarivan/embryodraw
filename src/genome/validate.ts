import { EFFECT_KINDS, type Genome } from './gene.ts';

export const SOURCE_KINDS = ['ventral', 'dorsal', 'edges', 'anterior', 'tip'] as const;
/** Explicit Euler with DT = 0.25 on a unit grid is stable for D ≤ 1 (embryo genes). */
export const MAX_EMBRYO_D = 1;

export interface Validation {
  genome: Genome | null;
  errors: string[];
  warnings: string[];
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Parses and checks a genome JSON. Errors block the import; warnings don't. */
export function validateGenome(text: string): Validation {
  const errors: string[] = [], warnings: string[] = [];
  let raw: unknown;
  try { raw = JSON.parse(text); } catch (e) { return { genome: null, errors: [`JSON non valido: ${(e as Error).message}`], warnings }; }
  const g = raw as Partial<Genome>;
  if (!g || typeof g !== 'object' || !Array.isArray(g.genes)) return { genome: null, errors: ['manca l\'array "genes"'], warnings };
  if (!g.genes.length) errors.push('"genes" è vuoto');
  const ids = new Set<string>();
  g.genes.forEach((x, i) => {
    const at = `genes[${i}]${x && typeof x.id === 'string' ? ` (${x.id})` : ''}`;
    if (!x || typeof x !== 'object') { errors.push(`${at}: non è un oggetto`); return; }
    if (typeof x.id !== 'string' || !/^[\w.-]+$/.test(x.id)) errors.push(`${at}: "id" deve essere una stringa di lettere, cifre, _ . -`);
    else if (ids.has(x.id)) errors.push(`${at}: id duplicato`);
    else ids.add(x.id);
    if (x.stage !== 'embryo' && x.stage !== 'skin') errors.push(`${at}: "stage" deve essere "embryo" o "skin"`);
    for (const k of ['rate', 'decay', 'D', 'bias'] as const) {
      if (!isNum(x[k])) errors.push(`${at}: "${k}" deve essere un numero`);
      else if (k !== 'bias' && x[k] < 0) errors.push(`${at}: "${k}" non può essere negativo`);
    }
    if (!x.reg || typeof x.reg !== 'object' || Array.isArray(x.reg)) errors.push(`${at}: "reg" deve essere un oggetto { idRegolatore: peso }`);
    else for (const [k, w] of Object.entries(x.reg)) if (!isNum(w)) errors.push(`${at}: peso reg.${k} non numerico`);
    if (x.source !== undefined) {
      const s = x.source;
      if (!s || !(SOURCE_KINDS as readonly string[]).includes(s.kind)) errors.push(`${at}: source.kind deve essere uno di ${SOURCE_KINDS.join(', ')}`);
      if (!isNum(s?.strength)) errors.push(`${at}: source.strength deve essere un numero`);
      if (!isNum(s?.width) || s.width <= 0) errors.push(`${at}: source.width deve essere > 0`);
    }
    if (x.gate !== undefined && (!x.gate || typeof x.gate.by !== 'string' || !isNum(x.gate.threshold))) errors.push(`${at}: gate = { by: id, threshold: numero }`);
    if (x.delay !== undefined && (!isNum(x.delay) || x.delay <= 0)) errors.push(`${at}: "delay" deve essere > 0`);
    if (x.delay !== undefined && x.reg && x.reg[x.id] === undefined) warnings.push(`${at}: "delay" agisce solo sull'auto-regolazione, ma reg.${x.id} manca`);
    if (x.effect !== undefined && (!x.effect || !EFFECT_KINDS.includes(x.effect.kind) || !isNum(x.effect.strength)))
      errors.push(`${at}: effect = { kind: ${EFFECT_KINDS.join(' | ')}, strength: numero }`);
    if (x.stage === 'embryo' && isNum(x.D) && x.D > MAX_EMBRYO_D) warnings.push(`${at}: D = ${x.D} > ${MAX_EMBRYO_D}: lo schema numerico diventa instabile`);
  });
  if (!errors.length) {
    for (const x of g.genes) {
      for (const k of Object.keys(x.reg)) if (!ids.has(k)) warnings.push(`${x.id}: regolatore "${k}" assente nel genoma (ignorato)`);
      if (x.gate && !ids.has(x.gate.by)) warnings.push(`${x.id}: gate.by "${x.gate.by}" assente (gate ignorato)`);
    }
    const kinds = new Set(g.genes.map((x) => x.effect?.kind));
    if (!kinds.has('elongation')) warnings.push('nessun gene con effetto "elongation": l\'asse non si allungherà (embrione non vitale)');
    if (!kinds.has('clock')) warnings.push('nessun gene con effetto "clock": niente somiti (embrione non vitale)');
  }
  if (g.name !== undefined && typeof g.name !== 'string') errors.push('"name" deve essere una stringa');
  return { genome: errors.length ? null : { name: g.name ?? 'importato', genes: g.genes }, errors, warnings };
}
