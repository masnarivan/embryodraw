import { EFFECT_KINDS, serialize, type EffectKind } from './genome/gene.ts';
import { WILDTYPE } from './genome/presets/wildtype.ts';
import { validateGenome } from './genome/validate.ts';
import { L0, NX, NY } from './grn/solver.ts';
import { T_END, V_MAX } from './embryo/develop.ts';
import { SKIN_TIME } from './stages/skin.ts';

// Constants are read from the code so the page never drifts from the model.
const CONSTS: Record<string, number> = { NX, NY, L0, T_END, V_MAX, SKIN_TIME };
document.querySelectorAll<HTMLElement>('[data-const]').forEach((el) => {
  el.textContent = String(CONSTS[el.dataset.const!]);
  el.classList.add('const');
});

const EFFECT_DOC: Record<EffectKind, string> = {
  elongation: 'Media nella colonna apicale → velocità con cui la gemma caudale allunga l\'asse.',
  clock: 'Valore congelato sulla riga centrale: ogni attraversamento in salita della soglia media è un confine di somite. Si contano solo i tessuti in cui il gene del gate è sotto 0.8 × soglia.',
  dorsalFate: 'Identità dorsale (neuroectoderma); serve per controllare il mesoderma parassiale.',
  ventralFate: 'Identità ventrale (placca laterale); stesso uso.',
  pectoral: 'Pinna pettorale: presente se l\'espressione integrata (celle ≥ 0.15) supera 3; posizione nel baricentro, dimensione ∝ √quantità.',
  pelvic: 'Pinna pelvica: come la pettorale.',
  dorsalFin: 'Profilo lungo le due righe dorsali estreme → altezza della pinna dorsale colonna per colonna (presente se il picco supera 0.2).',
  analFin: 'Profilo lungo le due righe ventrali → pinna anale.',
  caudalFin: 'Profilo per riga nelle ultime 3 colonne → lunghezza di ciascun raggio caudale (forcuta se più alto ai margini).',
  eye: 'Baricentro e quantità (celle ≥ 0.3) → posizione e raggio dell\'occhio.',
  jaw: 'Quantità → lunghezza della bocca; sotto 3 l\'embrione non è vitale. Insieme a eye definisce l\'estensione della testa.',
  growthAP: 'Media per colonna → crescita in lunghezza γ_AP.',
  growthDV: 'Per cella → crescita in altezza γ_DV.',
  melanophore: 'Campo della pelle → macchie di pigmento (isolinea 0.55), visibili da metà crescita.',
};
const tb = document.querySelector('#effects-table tbody')!;
for (const k of EFFECT_KINDS) {
  const users = WILDTYPE.genes.filter((g) => g.effect?.kind === k).map((g) => g.id);
  tb.insertAdjacentHTML('beforeend', `<tr><td><code>${k}</code>${users.length ? `<br><small>wild-type: ${users.join(', ')}</small>` : ''}</td><td>${EFFECT_DOC[k]}</td></tr>`);
}

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(3)));
const wtBody = document.querySelector('#wt-table tbody')!;
for (const g of WILDTYPE.genes) {
  const regs = Object.entries(g.reg)
    .map(([id, w]) => `<span class="${w > 0 ? 'pos' : 'neg'}">${id} ${w > 0 ? '+' : ''}${fmt(w)}</span>`)
    .join(' ');
  const extra = [
    g.source && `source ${g.source.kind} ${fmt(g.source.strength)} (w ${fmt(g.source.width)})`,
    g.gate && `gate ${g.gate.by} > ${fmt(g.gate.threshold)}`,
    g.delay && `delay ${fmt(g.delay)}`,
    g.effect && `<b>${g.effect.kind}</b> ×${fmt(g.effect.strength)}`,
  ].filter(Boolean).join('<br>');
  wtBody.insertAdjacentHTML('beforeend', `<tr>
    <td><code>${g.id}</code>${g.stage === 'skin' ? '<br><small>skin</small>' : ''}</td>
    <td>${g.note ?? ''}</td>
    <td class="regs">${regs || '—'}</td>
    <td class="kin">rate ${fmt(g.rate)}<br>decay ${fmt(g.decay)}<br>D ${fmt(g.D)}<br>bias ${fmt(g.bias)}</td>
    <td class="kin">${extra || '—'}</td></tr>`);
}

const wtJson = serialize(WILDTYPE);
document.getElementById('download-wt')!.addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([wtJson], { type: 'application/json' }));
  a.download = 'genoma-wild-type.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

const input = document.getElementById('validator-input') as HTMLTextAreaElement;
const out = document.getElementById('validator-out')!;
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
document.getElementById('load-wt')!.addEventListener('click', () => { input.value = wtJson; out.replaceChildren(); });
document.getElementById('validate')!.addEventListener('click', () => {
  const v = validateGenome(input.value);
  const list = (cls: string, title: string, xs: string[]) =>
    xs.length ? `<div class="${cls}"><b>${title} (${xs.length})</b><ul>${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
  out.innerHTML = (v.genome ? `<div class="ok">✓ Genoma valido: ${v.genome.genes.length} geni. Si può importare nell'app.</div>` : '')
    + list('err', 'Errori', v.errors) + list('warn', 'Avvisi', v.warnings);
});
