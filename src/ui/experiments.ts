import { cloneGenome, knockout, overexpress, type Genome } from '../genome/gene.ts';
import { duplicate } from '../evo/mutate.ts';

export interface Experiment {
  title: string;
  what: string;
  expected: string;
  apply: (g: Genome) => Genome;
}

const edit = (name: string, f: (g: Genome) => void) => (g: Genome) => {
  const c = cloneGenome(g);
  f(c);
  c.name = name;
  return c;
};
const gene = (g: Genome, id: string) => g.genes.find((x) => x.id === id)!;

export const EXPERIMENTS: Experiment[] = [
  {
    title: 'chordin −/−', what: 'Elimina l\'antagonista dorsale di BMP.',
    expected: 'In natura (mutante zebrafish chordino): embrione ventralizzato, tessuti ventrali espansi a spese di quelli dorsali.',
    apply: (g) => knockout(g, 'chd'),
  },
  {
    title: 'her1 −/−', what: 'Spegne l\'orologio della segmentazione.',
    expected: 'In natura: somiti irregolari o fusi, vertebre malformate.',
    apply: (g) => knockout(g, 'her1'),
  },
  {
    title: 'Orologio più veloce', what: 'Ritardo dell\'auto-repressione di her1 ×0.65.',
    expected: 'Più somiti, più piccoli: è il meccanismo che ha prodotto le centinaia di vertebre dei serpenti (Gomez et al. 2008).',
    apply: edit('orologio veloce', (g) => { gene(g, 'her1').delay! *= 0.65; }),
  },
  {
    title: 'Confine Hox anteriorizzato', what: 'Soglia di hoxc6 abbassata: si accende prima nella gemma caudale.',
    expected: 'Trasformazione omeotica: pinne pelviche e dorsale si spostano in avanti, come nei pesci con pelviche toraciche.',
    apply: edit('hoxc6 anteriore', (g) => { gene(g, 'hoxc6').bias += 2.5; }),
  },
  {
    title: 'tbx5a −/−', what: 'Elimina il gene della gemma pettorale.',
    expected: 'In natura (mutante heartstrings): niente pinne pettorali, il resto è normale.',
    apply: (g) => knockout(g, 'tbx5a'),
  },
  {
    title: 'Duplicazione di tbx5a', what: 'Copia il gene, come dopo la duplicazione genomica dei teleostei.',
    expected: 'Dosaggio raddoppiato: la gemma pettorale si allarga. Il paralogo può poi divergere (subfunzionalizzazione).',
    apply: edit('tbx5a ×2', (g) => { duplicate(g, 'tbx5a'); }),
  },
  {
    title: 'otx2 −/−', what: 'Elimina l\'identità cefalica.',
    expected: 'Testa ridotta, occhi e mascelle assenti: fenotipo letale.',
    apply: (g) => knockout(g, 'otx2'),
  },
  {
    title: 'hoxd13 sovraespresso', what: 'Identità caudale in tutto l\'asse.',
    expected: 'Il corpo prende identità caudale: crescita ridotta, pinne mediane soppresse.',
    apply: (g) => overexpress(g, 'hoxd13'),
  },
  {
    title: 'Inibitore di Turing più lento', what: 'Diffusione di ltk ×0.5.',
    expected: 'Il pattern di pigmento si infittisce: macchie e bande più piccole, come nei mutanti che alterano gli iridofori.',
    apply: edit('ltk D×0.5', (g) => { gene(g, 'ltk').D *= 0.5; }),
  },
  {
    title: 'Gemma caudale più longeva', what: 'tbxta meno sensibile al timer cdx4.',
    expected: 'L\'asse si allunga di più: più vertebre caudali, coda più lunga.',
    apply: edit('gemma longeva', (g) => { gene(g, 'tbxta').reg.cdx4 *= 0.75; }),
  },
];
