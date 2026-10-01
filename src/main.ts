import { makeRng } from './core/rng.ts';
import { cloneGenome, knockout, overexpress, serialize, type Genome } from './genome/gene.ts';
import { WILDTYPE } from './genome/presets/wildtype.ts';
import { validateGenome } from './genome/validate.ts';
import { T_END, type RunResult } from './pipeline.ts';
import { drawFish, type Drawing } from './render/body.ts';
import { drawCanvas, fit, LIGHT, toSVG } from './render/output.ts';
import { mutate } from './evo/mutate.ts';
import { Lineage } from './evo/lineage.ts';
import { Pool } from './ui/pool.ts';
import { drawGRN } from './ui/grn.ts';
import { EXPERIMENTS } from './ui/experiments.ts';
import { NY } from './grn/solver.ts';
import type { Phenotype } from './stages/phenotype.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const GROWTH_STEPS = 16;

// ───────────────────────── state
const pool = new Pool();
const lineage = new Lineage();
let base: Genome = cloneGenome(WILDTYPE);
let baseNode = lineage.add({ parent: null, generation: 0, genome: base, log: ['genoma di riferimento'], viable: true });
const pert = new Map<string, 'ko' | 'oe'>();
let current: Genome = base;
let result: RunResult | null = null;
let wtResult: RunResult | null = null;
let frame = 0;
let overlay = '';
let playing = false;
let runToken = 0;

function applyPert(g: Genome): Genome {
  let out = g;
  for (const [id, kind] of pert) out = kind === 'ko' ? knockout(out, id) : overexpress(out, id);
  return out;
}

// ───────────────────────── timeline
function nFrames() {
  if (!result) return 0;
  return result.frames.length + (result.ph.viable ? GROWTH_STEPS : 0);
}

interface View { ph: Phenotype; s: number; fields: Float32Array[]; t: number; L: number }
function viewAt(i: number): View {
  const r = result!;
  const ne = r.frames.length;
  if (i < ne) { const f = r.frames[i]; return { ph: f.ph, s: 0, fields: f.fields, t: f.t, L: f.L }; }
  return { ph: r.ph, s: (i - ne + 1) / GROWTH_STEPS, fields: r.fields, t: T_END, L: r.ph.ncol };
}

function stageLabel(i: number): string {
  const r = result!;
  const v = viewAt(i);
  if (v.s > 0) return v.s < 0.4 ? `larva · crescita ${(v.s * 100).toFixed(0)}%` : v.s < 0.85 ? `giovanile · crescita ${(v.s * 100).toFixed(0)}%` : 'adulto';
  const n = v.ph.somites.length;
  if (n === 0) return `t = ${v.t.toFixed(0)} · gastrula: assi dorso-ventrale e antero-posteriore`;
  if (v.t < r.tElongEnd) return `t = ${v.t.toFixed(0)} · somitogenesi: ${n} somiti`;
  return `t = ${v.t.toFixed(0)} · faringula: gemme delle pinne, ${n} somiti`;
}

// ───────────────────────── rendering
const view = $<HTMLCanvasElement>('view');
let kEmb = 0, kAdult = 0;

function drawingAt(i: number): Drawing {
  const v = viewAt(i);
  const gi = overlay ? result!.ids.indexOf(overlay) : -1;
  let heat: { field: Float32Array; color: string } | undefined;
  if (gi >= 0) {
    const f = v.fields[gi];
    let max = 0;
    for (let k = 0; k < v.ph.ncol * NY; k++) max = Math.max(max, f[k]);
    const norm = new Float32Array(f.length);
    if (max > 1e-3) for (let k = 0; k < f.length; k++) norm[k] = f[k] / max;
    heat = { field: norm, color: '#c2410c' };
  }
  const yolk = v.s > 0 ? Math.max(0, 0.35 - v.s) : 1 - 0.65 * (v.t / T_END);
  return drawFish(v.ph, v.s, { heat, pigment: result!.pigment, showYolk: yolk });
}

function computeScales() {
  const r = result!;
  const w = view.clientWidth, h = view.clientHeight;
  const last = r.frames.length - 1;
  kEmb = last >= 0 ? fit(drawingAt(last), w, h, 24).k : 1;
  kAdult = r.ph.viable ? fit(drawingAt(nFrames() - 1), w, h, 24).k : kEmb;
}

function render() {
  const dpr = window.devicePixelRatio || 1;
  const w = view.clientWidth, h = view.clientHeight;
  if (view.width !== Math.round(w * dpr) || view.height !== Math.round(h * dpr)) {
    view.width = Math.round(w * dpr); view.height = Math.round(h * dpr);
  }
  const ctx = view.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = LIGHT['--paper'];
  ctx.fillRect(0, 0, w, h);
  if (!result) return;
  const v = viewAt(frame);
  const k = v.s > 0 ? scaleForGrowth(v.s) : kEmb;
  drawCanvas(ctx, drawingAt(frame), w, h, LIGHT, k);
  $('stage-label').textContent = stageLabel(frame);
}

/** The fish should visibly grow: scale shrinks smoothly from the embryo scale to the adult fit. */
function scaleForGrowth(s: number) {
  return kEmb * Math.pow(kAdult / kEmb, Math.min(1, s * 1.15));
}

function drawThumb(canvas: HTMLCanvasElement, r: RunResult) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = LIGHT['--paper'];
  ctx.fillRect(0, 0, w, h);
  drawCanvas(ctx, drawFish(r.ph, r.ph.viable ? 1 : 0, { pigment: r.pigment, showYolk: r.ph.viable ? 0 : 0.4 }), w, h, LIGHT);
}

// ───────────────────────── stats
function renderStats() {
  const r = result!;
  const ph = r.ph;
  const chips: string[] = [];
  chips.push(ph.viable ? `<span class="chip ok">vitale</span>` : `<span class="chip bad">non vitale</span>`);
  chips.push(`<span class="chip">somiti/vertebre <b>${ph.somites.length}</b></span>`);
  chips.push(`<span class="chip">asse <b>${ph.ncol}</b> colonne</span>`);
  const fins = Object.entries(ph.fins).filter(([, f]) => f.present).map(([k]) => ({ pectoral: 'pettorali', pelvic: 'pelviche', dorsalFin: 'dorsale', analFin: 'anale', caudalFin: 'caudale' } as Record<string, string>)[k]);
  chips.push(`<span class="chip">pinne: <b>${fins.join(', ') || 'nessuna'}</b></span>`);
  if (ph.fins.pelvic.present) chips.push(`<span class="chip">pelviche al somite <b>${somiteAt(ph, ph.fins.pelvic.cx)}</b></span>`);
  chips.push(`<span class="chip">geni <b>${current.genes.length}</b></span>`);
  chips.push(`<span class="chip muted">${r.ms.toFixed(0)} ms</span>`);
  $('stats').innerHTML = chips.join('');
  const banner = $('banner');
  banner.hidden = ph.viable;
  banner.textContent = ph.viable ? '' : `Non vitale: ${ph.failure}`;
}
function somiteAt(ph: Phenotype, x: number) {
  return ph.somites.filter((b) => b < x).length;
}

// ───────────────────────── main run
async function rerun() {
  current = applyPert(base);
  const token = ++runToken;
  $('busy').hidden = false;
  const r = await pool.run(current, true);
  if (token !== runToken) return;
  $('busy').hidden = true;
  result = r;
  const scrub = $<HTMLInputElement>('scrub');
  scrub.max = String(nFrames() - 1);
  frame = nFrames() - 1;
  scrub.value = String(frame);
  computeScales();
  render();
  renderStats();
  renderGenes();
  const isWT = current.genes.length === WILDTYPE.genes.length && JSON.stringify(current.genes) === JSON.stringify(WILDTYPE.genes);
  $('wt').hidden = isWT || !wtResult;
  if (!isWT && wtResult) drawThumb($<HTMLCanvasElement>('wt-canvas'), wtResult);
}

// ───────────────────────── genome tab
function renderGenes() {
  const ul = $('genes');
  ul.replaceChildren();
  $('genome-name').textContent = current.name;
  for (const g of base.genes) {
    const li = document.createElement('li');
    if (g.id === overlay) li.className = 'sel';
    const p = pert.get(g.id);
    li.innerHTML = `<div><span class="name">${g.id}</span>${g.effect ? `<span class="eff">→ ${g.effect.kind}</span>` : ''}</div>
      <div class="note">${g.note ?? ''}</div>
      <div class="acts"><button data-k="ko" class="${p === 'ko' ? 'on' : ''}" title="Knockout">KO</button><button data-k="oe" class="${p === 'oe' ? 'on' : ''}" title="Sovraespressione">OE</button></div>`;
    li.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b) {
        const k = b.dataset.k as 'ko' | 'oe';
        if (pert.get(g.id) === k) pert.delete(g.id); else pert.set(g.id, k);
        rerun();
        return;
      }
      setOverlay(overlay === g.id ? '' : g.id);
    });
    ul.appendChild(li);
  }
  drawGRN($('grn') as unknown as SVGSVGElement, current, overlay || null, (id) => setOverlay(overlay === id ? '' : id));
  const sel = $<HTMLSelectElement>('overlay');
  sel.innerHTML = `<option value="">nessuna</option>` + current.genes.map((g) => `<option value="${g.id}">${g.id}</option>`).join('');
  sel.value = current.genes.some((g) => g.id === overlay) ? overlay : '';
}

function setOverlay(id: string) {
  overlay = id;
  renderGenes();
  if (result) { computeScales(); render(); }
}

$<HTMLSelectElement>('overlay').addEventListener('change', (e) => setOverlay((e.target as HTMLSelectElement).value));
$('reset-pert').addEventListener('click', () => { pert.clear(); rerun(); });

// ───────────────────────── experiments tab
const expUl = $('experiments');
for (const ex of EXPERIMENTS) {
  const li = document.createElement('li');
  li.innerHTML = `<h4>${ex.title}</h4><p>${ex.what}</p><p class="expect">${ex.expected}</p><div class="row"><button>Esegui sul wild-type</button></div>`;
  li.querySelector('button')!.addEventListener('click', () => {
    pert.clear();
    base = ex.apply(cloneGenome(WILDTYPE));
    baseNode = lineage.add({ parent: null, generation: 0, genome: base, log: [`esperimento: ${ex.title}`], viable: true });
    renderLineage();
    rerun();
  });
  expUl.appendChild(li);
}

// ───────────────────────── evolution tab
const rng = makeRng(Date.now() >>> 0);
interface Kid { genome: Genome; log: string[]; r?: RunResult }
let brood: Kid[] = [];

const FITNESS: Record<string, (ph: Phenotype) => number> = {
  slender: (ph) => ph.ncol / meanDepth(ph),
  deep: (ph) => meanDepth(ph) / ph.ncol,
  somites: (ph) => ph.somites.length,
  dorsal: (ph) => ph.fins.dorsalFin.profile.reduce((a, b) => a + b, 0),
  eye: (ph) => ph.eye.amount,
};
function meanDepth(ph: Phenotype) {
  let s = 0;
  for (let i = 0; i < ph.ncol * NY; i++) s += Math.exp(ph.gDV[i]);
  return s / ph.ncol;
}

async function breed(): Promise<Kid[]> {
  const rate = +$<HTMLInputElement>('mut-rate').value;
  const parent = applyPert(base);
  brood = Array.from({ length: 9 }, () => mutate(parent, rng, rate));
  renderBrood();
  await Promise.all(brood.map(async (k, i) => { k.r = await pool.run(k.genome); renderKid(i); }));
  return brood;
}

function renderBrood() {
  const div = $('brood');
  div.replaceChildren();
  brood.forEach((k, i) => {
    const b = document.createElement('button');
    b.className = 'kid';
    b.title = k.log.join('\n');
    b.innerHTML = `<canvas></canvas><span class="tag">…</span>`;
    b.addEventListener('click', () => k.r && choose(k));
    div.appendChild(b);
    void i;
  });
}

function renderKid(i: number) {
  const k = brood[i];
  const el = $('brood').children[i] as HTMLElement;
  if (!el || !k.r) return;
  drawThumb(el.querySelector('canvas')!, k.r);
  el.classList.toggle('dead', !k.r.ph.viable);
  el.querySelector('.tag')!.textContent = k.r.ph.viable ? `${k.r.ph.somites.length} somiti` : '✕ non vitale';
  el.title = (k.r.ph.viable ? '' : `${k.r.ph.failure}\n\n`) + k.log.join('\n');
}

function choose(k: Kid) {
  pert.clear();
  base = k.genome;
  base.name = `gen ${baseNode.generation + 1}`;
  baseNode = lineage.add({ parent: baseNode.id, generation: baseNode.generation + 1, genome: base, log: k.log, viable: !!k.r?.ph.viable, somites: k.r?.ph.somites.length });
  renderLineage();
  rerun();
}

function renderLineage() {
  const ol = $('lineage');
  ol.replaceChildren();
  for (const n of lineage.ancestry(baseNode.id)) {
    const li = document.createElement('li');
    if (n.id === baseNode.id) li.className = 'cur';
    li.innerHTML = `gen ${n.generation}${n.somites !== undefined ? ` · ${n.somites} somiti` : ''}${n.viable ? '' : ' · non vitale'}<span class="log">${n.log.join('<br>')}</span>`;
    li.addEventListener('click', () => { pert.clear(); base = n.genome; baseNode = n; renderLineage(); rerun(); });
    ol.appendChild(li);
  }
}

const breedBtn = $<HTMLButtonElement>('breed');
breedBtn.addEventListener('click', async () => { breedBtn.disabled = true; await breed(); breedBtn.disabled = false; });

$('auto').addEventListener('click', async (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  btn.disabled = breedBtn.disabled = true;
  const f = FITNESS[$<HTMLSelectElement>('fitness').value];
  for (let gen = 0; gen < 10; gen++) {
    btn.textContent = `generazione ${gen + 1}/10…`;
    const kids = await breed();
    const viable = kids.filter((k) => k.r?.ph.viable);
    if (!viable.length) continue;
    const best = viable.reduce((a, b) => (f(b.r!.ph) > f(a.r!.ph) ? b : a));
    ($('brood').children[kids.indexOf(best)] as HTMLElement).classList.add('best');
    choose(best);
  }
  btn.textContent = 'Auto ×10 generazioni';
  btn.disabled = breedBtn.disabled = false;
});

// ───────────────────────── tabs, timeline, export
document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    for (const t of ['genome', 'exp', 'evo']) $(`tab-${t}`).hidden = t !== b.dataset.tab;
  }),
);

const scrub = $<HTMLInputElement>('scrub');
scrub.addEventListener('input', () => { frame = +scrub.value; render(); });
const play = $<HTMLButtonElement>('play');
play.addEventListener('click', () => {
  if (!result) return;
  playing = !playing;
  play.textContent = playing ? '❚❚' : '▶';
  if (playing && frame >= nFrames() - 1) frame = 0;
  let last = 0;
  const tick = (ts: number) => {
    if (!playing) return;
    if (ts - last > 90) {
      last = ts;
      frame = Math.min(nFrames() - 1, frame + 1);
      scrub.value = String(frame);
      render();
      if (frame >= nFrames() - 1) { playing = false; play.textContent = '▶'; return; }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

function download(name: string, text: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('export-svg').addEventListener('click', () => result && download(`embryodraw-${current.name.replace(/\W+/g, '_')}.svg`, toSVG(drawingAt(frame), LIGHT), 'image/svg+xml'));
$('export-json').addEventListener('click', () => download(`genoma-${current.name.replace(/\W+/g, '_')}.json`, serialize(current), 'application/json'));
$<HTMLInputElement>('import-json').addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const v = validateGenome(await file.text());
    if (!v.genome) throw new Error('\n• ' + v.errors.join('\n• '));
    if (v.warnings.length) alert(`Genoma importato con avvisi:\n• ${v.warnings.join('\n• ')}`);
    pert.clear();
    base = v.genome;
    baseNode = lineage.add({ parent: null, generation: 0, genome: base, log: [`importato: ${file.name}`], viable: true });
    renderLineage();
    rerun();
  } catch (err) { alert(`Genoma non valido: ${err}`); }
  (e.target as HTMLInputElement).value = '';
});

new ResizeObserver(() => { if (result) { computeScales(); render(); } }).observe(view);

// ───────────────────────── boot
renderLineage();
render();
rerun().then(() => { wtResult = result; });

// dev-only inspection hook
if (import.meta.env.DEV) (window as unknown as { __ed: unknown }).__ed = () => ({ current, result, frame, kEmb, kAdult, drawing: result ? drawingAt(frame) : null });
