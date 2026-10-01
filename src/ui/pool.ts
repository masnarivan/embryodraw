import type { Genome } from '../genome/gene.ts';
import type { RunResult } from '../pipeline.ts';

/** Small worker pool: every developmental run happens off the main thread. */
export class Pool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private queue: { genome: Genome; frames: boolean; resolve: (r: RunResult) => void; reject: (e: Error) => void }[] = [];
  private pending = new Map<number, { resolve: (r: RunResult) => void; reject: (e: Error) => void; w: Worker }>();
  private nextId = 0;

  constructor(n = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1))) {
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e) => {
        const { id, result, error } = e.data;
        const p = this.pending.get(id);
        if (!p) return;
        this.pending.delete(id);
        if (error) p.reject(new Error(error)); else p.resolve(result);
        this.idle.push(w);
        this.pump();
      };
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  run(genome: Genome, frames = false): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      const job = { genome, frames, resolve, reject };
      if (frames) this.queue.unshift(job); else this.queue.push(job); // main view first
      this.pump();
    });
  }

  private pump() {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.pop()!;
      const job = this.queue.shift()!;
      const id = this.nextId++;
      this.pending.set(id, { resolve: job.resolve, reject: job.reject, w });
      w.postMessage({ id, genome: job.genome, frames: job.frames });
    }
  }
}
