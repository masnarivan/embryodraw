import type { Genome } from '../genome/gene.ts';

export interface LineageNode {
  id: number;
  parent: number | null;
  generation: number;
  genome: Genome;
  log: string[];
  viable: boolean;
  somites?: number;
  thumb?: string; // SVG data for the history list
}

/** Records every selected individual: a chain (or tree, after branching back) of ancestry. */
export class Lineage {
  nodes: LineageNode[] = [];
  private next = 0;
  add(n: Omit<LineageNode, 'id'>): LineageNode {
    const node = { ...n, id: this.next++ };
    this.nodes.push(node);
    return node;
  }
  get(id: number) { return this.nodes.find((n) => n.id === id); }
  ancestry(id: number): LineageNode[] {
    const out: LineageNode[] = [];
    for (let n = this.get(id); n; n = n.parent === null ? undefined : this.get(n.parent)) out.unshift(n);
    return out;
  }
  children(id: number) { return this.nodes.filter((n) => n.parent === id); }
}
