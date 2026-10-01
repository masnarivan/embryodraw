import type { Genome } from './genome/gene.ts';
import { run } from './pipeline.ts';

export interface Job { id: number; genome: Genome; frames: boolean }

self.onmessage = (e: MessageEvent<Job>) => {
  const { id, genome, frames } = e.data;
  try {
    const r = run(genome, { frames });
    (self as unknown as Worker).postMessage({ id, result: r });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
