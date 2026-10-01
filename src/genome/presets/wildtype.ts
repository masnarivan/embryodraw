import type { Gene, Genome } from '../gene.ts';

// A teleost-like reference genome. Names follow the zebrafish orthologue whose role
// each gene caricatures; the network is a toy, but every pattern element below is
// produced by regulation, not drawn.
const genes: Gene[] = [
  // ── Dorso-ventral axis: BMP self-activates and spreads; dorsal Chordin blocks it.
  { id: 'bmp4', note: 'morfogeno ventrale, auto-attivante', stage: 'embryo', rate: 0.5, decay: 0.5, D: 0.6, bias: -2.5,
    reg: { bmp4: 5, chd: -10 }, source: { kind: 'ventral', strength: 4, width: 3 } },
  { id: 'chd', note: 'Chordin, antagonista dorsale di BMP', stage: 'embryo', rate: 0.5, decay: 0.5, D: 1, bias: -3,
    reg: { bmp4: -3 }, source: { kind: 'dorsal', strength: 6, width: 7 } },
  { id: 'gata2', note: 'mesoderma della placca laterale (alto BMP)', stage: 'embryo', rate: 0.3, decay: 0.3, D: 0, bias: -7,
    reg: { bmp4: 10, gata2: 4 }, effect: { kind: 'ventralFate', strength: 1 } },
  { id: 'sox3', note: 'neuroectoderma dorsale (basso BMP)', stage: 'embryo', rate: 0.3, decay: 0.3, D: 0, bias: -6,
    reg: { chd: 8, bmp4: -8, sox3: 4 }, effect: { kind: 'dorsalFate', strength: 1 } },

  // ── Tailbud: Wnt/Ntl self-sustaining posterior organiser, extinguished by the timer.
  { id: 'wnt3a', note: 'segnale della gemma caudale', stage: 'embryo', rate: 0.5, decay: 0.5, D: 0.3, bias: -4,
    reg: { tbxta: 2 }, source: { kind: 'tip', strength: 8, width: 2 } },
  { id: 'tbxta', note: 'no tail/Brachyury: guida l\'allungamento', stage: 'embryo', rate: 0.5, decay: 0.5, D: 0, bias: -5,
    reg: { wnt3a: 6, tbxta: 3, cdx4: -3 }, effect: { kind: 'elongation', strength: 1 } },
  { id: 'cdx4', note: 'timer: si accumula nella gemma, le cellule ne ereditano il valore', stage: 'embryo',
    rate: 0.002, decay: 0, D: 0, bias: -8, reg: {}, source: { kind: 'tip', strength: 12, width: 2 } },
  { id: 'fgf8', note: 'fronte d\'onda: mRNA che decade lasciata la gemma', stage: 'embryo', rate: 0.3, decay: 0.04, D: 0.1,
    bias: -4, reg: { tbxta: 8 } },

  // ── Segmentation clock: delayed auto-repression, running only where FGF is high.
  { id: 'her1', note: 'orologio della segmentazione', stage: 'embryo', rate: 2, decay: 1, D: 0, bias: 6,
    reg: { her1: -12 }, delay: 5, gate: { by: 'fgf8', threshold: 2 }, effect: { kind: 'clock', strength: 1 } },

  // ── Hox: temporal colinearity. Each paralogue switches on at a later timer value
  //    in the tailbud, then locks itself on → nested posterior domains.
  { id: 'hoxb4', note: 'Hox anteriore (inizio tronco)', stage: 'embryo', rate: 0.5, decay: 0.5, D: 0, bias: -4,
    reg: { cdx4: 30, hoxb4: 6 } },
  { id: 'hoxc6', note: 'Hox tronco medio', stage: 'embryo', rate: 0.5, decay: 0.5, D: 0, bias: -8,
    reg: { cdx4: 30, hoxc6: 6 } },
  { id: 'hoxc10', note: 'Hox tronco posteriore', stage: 'embryo', rate: 0.5, decay: 0.5, D: 0, bias: -14,
    reg: { cdx4: 30, hoxc10: 6 } },
  { id: 'hoxd13', note: 'Hox caudale', stage: 'embryo', rate: 0.5, decay: 0.5, D: 0, bias: -20.6,
    reg: { cdx4: 30, hoxd13: 6 } },

  // ── Head: anterior Otx domain, excluded by Hox.
  { id: 'otx2', note: 'identità cefalica', stage: 'embryo', rate: 0.4, decay: 0.4, D: 0.3, bias: -4,
    reg: { otx2: 3, hoxb4: -8 }, source: { kind: 'anterior', strength: 8, width: 10 } },
  { id: 'rx3', note: 'campo oculare', stage: 'embryo', rate: 0.5, decay: 0.5, D: 0.1, bias: -9,
    reg: { otx2: 10, gata2: -6, sox3: -2 }, effect: { kind: 'eye', strength: 1 } },
  { id: 'dlx2a', note: 'cresta neurale degli archi: mascelle', stage: 'embryo', rate: 0.5, decay: 0.5, D: 0.1, bias: -7.5,
    reg: { otx2: 5, gata2: 4 }, effect: { kind: 'jaw', strength: 1 } },

  // ── Paired fins: lateral plate × Hox window.
  { id: 'tbx5a', note: 'gemma pinna pettorale', stage: 'embryo', rate: 0.5, decay: 0.5, D: 0.2, bias: -7.5,
    reg: { gata2: 4, hoxb4: 5, hoxc6: -10 }, effect: { kind: 'pectoral', strength: 1 } },
  { id: 'tbx4', note: 'gemma pinna pelvica', stage: 'embryo', rate: 0.5, decay: 0.5, D: 0.2, bias: -7.5,
    reg: { gata2: 4, hoxc6: 5, hoxc10: -10 }, effect: { kind: 'pelvic', strength: 1 } },

  // ── Median fin fold: survives only where maintenance genes stay on.
  { id: 'msxd', note: 'mantenimento piega mediana dorsale', stage: 'embryo', rate: 0.5, decay: 0.5, D: 0.2, bias: -9,
    reg: { sox3: 3, hoxc6: 4, hoxc10: -8 }, source: { kind: 'dorsal', strength: 4, width: 1.5 },
    effect: { kind: 'dorsalFin', strength: 1 } },
  { id: 'msxv', note: 'mantenimento piega mediana ventrale (anale)', stage: 'embryo', rate: 0.5, decay: 0.5, D: 0.2, bias: -9,
    reg: { gata2: 3, hoxc10: 4, hoxd13: -8 }, source: { kind: 'ventral', strength: 4, width: 1.5 },
    effect: { kind: 'analFin', strength: 1 } },
  { id: 'evx1', note: 'pinna caudale; più forte ai margini → coda forcuta', stage: 'embryo', rate: 0.5, decay: 0.5, D: 0.2,
    bias: -6.5, reg: { hoxd13: 6 }, source: { kind: 'edges', strength: 3, width: 2 },
    effect: { kind: 'caudalFin', strength: 1 } },

  // ── Allometric growth (post-embryonic).
  { id: 'igf2', note: 'crescita in altezza', stage: 'embryo', rate: 0.5, decay: 0.5, D: 0.5, bias: 1,
    reg: { cdx4: -3.5, hoxd13: -3, otx2: 0.5 }, effect: { kind: 'growthDV', strength: 1 } },
  { id: 'gh1', note: 'crescita in lunghezza', stage: 'embryo', rate: 0.5, decay: 0.5, D: 0.5, bias: 0.5,
    reg: { otx2: 1 }, effect: { kind: 'growthAP', strength: 1 } },

  // ── Skin: Turing pair (short-range activation, long-range inhibition).
  // Steady state sits on the steep part of both sigmoids (u*=v*=0.5); the inhibitor is
  // faster and ~60× more diffusive → short-range activation, long-range inhibition.
  { id: 'mitfa', note: 'melanofori (attivatore di Turing)', stage: 'skin', rate: 0.02, decay: 0.02, D: 0.04, bias: 1,
    reg: { mitfa: 10, ltk: -12 }, effect: { kind: 'melanophore', strength: 1 } },
  { id: 'ltk', note: 'iridofori (inibitore a lungo raggio)', stage: 'skin', rate: 0.08, decay: 0.08, D: 2.4, bias: -3,
    reg: { mitfa: 6 } },
];

export const WILDTYPE: Genome = { name: 'wild-type', genes };
