import type { Genome } from '../genome/gene.ts';

const NS = 'http://www.w3.org/2000/svg';

/** Circular GRN diagram: green = activation, red = repression, thickness ∝ |weight|. */
export function drawGRN(svg: SVGSVGElement, g: Genome, selected: string | null, onPick: (id: string) => void) {
  svg.replaceChildren();
  const n = g.genes.length;
  const R = 128;
  const pos = new Map<string, [number, number]>();
  g.genes.forEach((x, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    pos.set(x.id, [R * Math.cos(a), R * Math.sin(a)]);
  });
  const edges = document.createElementNS(NS, 'g');
  for (const t of g.genes) {
    for (const [src, w] of Object.entries(t.reg)) {
      const p0 = pos.get(src), p1 = pos.get(t.id);
      if (!p0 || !p1) continue;
      const path = document.createElementNS(NS, 'path');
      const hl = selected && (selected === src || selected === t.id);
      if (src === t.id) {
        const [x, y] = p0, k = 1.12;
        path.setAttribute('d', `M${x} ${y} C${x * k + y * 0.12} ${y * k - x * 0.12} ${x * k - y * 0.12} ${y * k + x * 0.12} ${x} ${y}`);
      } else {
        path.setAttribute('d', `M${p0[0]} ${p0[1]} Q0 0 ${p1[0]} ${p1[1]}`);
      }
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', w > 0 ? 'var(--pos)' : 'var(--neg)');
      path.setAttribute('stroke-width', String(Math.min(3, 0.3 + Math.abs(w) / 8)));
      path.setAttribute('opacity', selected ? (hl ? '0.9' : '0.07') : '0.4');
      edges.appendChild(path);
    }
  }
  svg.appendChild(edges);
  for (const x of g.genes) {
    const [cx, cy] = pos.get(x.id)!;
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', String(cx)); c.setAttribute('cy', String(cy)); c.setAttribute('r', '6');
    c.setAttribute('fill', x.id === selected ? 'var(--accent)' : x.stage === 'skin' ? 'var(--muted)' : x.effect ? 'var(--accent-soft)' : 'var(--surface)');
    c.addEventListener('click', () => onPick(x.id));
    const title = document.createElementNS(NS, 'title');
    title.textContent = `${x.id}${x.note ? ' — ' + x.note : ''}`;
    c.appendChild(title);
    svg.appendChild(c);
    const t = document.createElementNS(NS, 'text');
    const k = 1.13;
    t.setAttribute('x', String(cx * k)); t.setAttribute('y', String(cy * k + 2.5));
    t.setAttribute('text-anchor', cx > 5 ? 'start' : cx < -5 ? 'end' : 'middle');
    t.textContent = x.id;
    svg.appendChild(t);
  }
}
