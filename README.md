# EmbryoDraw

Ispirato a [fishdraw](https://github.com/LingDong-/fishdraw), ma qui la forma del pesce **non è disegnata con curve**: viene **sviluppata**. Un genoma codifica una rete regolatoria (GRN). La rete legge i gradienti di morfogeni su un embrione che si allunga, e la forma adulta è l'integrale della crescita locale. Una mutazione cambia il *programma di sviluppo*, mai il disegno.

```bash
npm install
npm run dev      # app su http://localhost:5173
npm test         # 19 test: esperimenti classici + validazione del genoma
```

La spiegazione completa del modello e del formato del genoma è in `spiegazione.html` (link "Come funziona il modello" nell'app).

```bash
```

## Il modello

Ogni gene ha un modulo cis-regolatorio (pesi verso altri geni, soglia, input materno/posizionale), una cinetica (sintesi, degradazione, diffusione) e, se serve, un effettore. La dinamica segue il formalismo dei gap-gene (Reinitz/Jaeger):

```
dg/dt = gate · ( rate·σ(Σ w·g + bias + sorgente) − decay·g ) + D ∇²g
```

L'embrione è una griglia in coordinate materiali: assi antero-posteriore e dorso-ventrale, vista laterale. Le stesse regole producono tutti gli stadi:

| Stadio | Meccanismo | File |
|---|---|---|
| Assi | BMP auto-attivante bloccato da Chordin dorsale → destini ventrale/parassiale/dorsale | `genome/presets/wildtype.ts` |
| Allungamento | Gemma caudale Wnt/Ntl auto-sostenuta, spenta da un timer (cdx4) che le cellule ereditano | `embryo/develop.ts` |
| Somitogenesi | Orologio her1 (auto-repressione con ritardo) attivo solo dove FGF8 è alto; la fase congelata segna i confini | `stages/phenotype.ts` |
| Codice Hox | Colinearità temporale: ogni Hox si accende a un valore diverso del timer e si auto-mantiene → domini annidati | preset |
| Pinne | Placca laterale × finestre Hox (pettorali, pelviche); piega mediana mantenuta in finestre Hox (dorsale, anale); caudale più forte ai margini (forcuta) | preset |
| Testa | Otx2 anteriore → occhio (rx3), mascelle (dlx2a) | preset |
| Crescita | Effettori growthAP/growthDV → mappa di crescita; contorno = integrale | `render/body.ts` |
| Pelle | Coppia di Turing (attivatore/inibitore) sul corpo cresciuto, con diffusione riscalata dalla crescita | `stages/skin.ts` |

Gli stadi non cercano mai i geni per nome: leggono gli **effetti**. Un paralogo duplicato o un gene rinominato conserva quindi il suo ruolo, o lo divide con l'altra copia.

**Vitalità.** Un embrione può fallire per tanti motivi: niente mesoderma parassiale, asse troppo corto, meno di 15 vertebre, mascelle assenti, instabilità numerica. Il fallimento è un dato, non un errore: mostra quali morfologie lo sviluppo permette di raggiungere.

## Esperimenti di verifica (`test/model.test.ts`)

| Perturbazione | Fenotipo che emerge | In natura |
|---|---|---|
| `chd` −/− | embrione ventralizzato, letale | mutante *chordino* |
| `her1` −/− | nessun somite | somiti fusi o irregolari |
| orologio più veloce | 31 → 43 somiti | meccanismo dei serpenti (Gomez 2008) |
| soglia `hoxc6` anteriorizzata | pelviche e dorsale si spostano in avanti | trasformazione omeotica |
| `tbx5a` −/− | niente pettorali, il resto normale | mutante *heartstrings* |
| duplicazione di `tbx5a` | gemma pettorale ~2× | effetto dosaggio dopo la duplicazione genomica |
| `otx2` −/− | niente occhi né mascelle, letale | perdita di prosencefalo e mesencefalo |
| gemma caudale più longeva | più vertebre caudali | — |

## Evoluzione

Gli operatori di mutazione (`evo/mutate.ts`) agiscono su pesi degli enhancer, soglie dei promotori, emivite, diffusione, depositi materni, ritardo dell'orologio, siti di legame nuovi o persi, duplicazione genica (con effetto dosaggio) e perdita genica. Puoi scegliere tu i genitori oppure lanciare 10 generazioni con selezione automatica. Selezionando per "corpo alto", per esempio, emergono forme a disco, ottenute accorciando l'asse e aumentando la crescita dorso-ventrale.

## Limiti onesti

È un modello giocattolo. Le previsioni sono **qualitative**: dicono quali morfologie sono raggiungibili, quali mutazioni sono omeotiche o letali, dove lo sviluppo è canalizzato. Non sono previsioni quantitative su specie reali. Altri limiti:
- l'embrione è 2D, in vista laterale;
- la meccanica è un mapping di crescita, non un solido elastico;
- le pinne pari sono stimate dal centroide della loro gemma.

Strumenti di sviluppo: `node scripts/diag.ts <geni>` stampa le mappe di espressione in ASCII, `node scripts/experiments.ts` riassume tutti gli esperimenti.
