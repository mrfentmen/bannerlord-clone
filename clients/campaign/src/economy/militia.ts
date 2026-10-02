/**
 * Task 118: militia training queue. Queue militia training; each entry
 * trains over a number of days and completes into ready militia. The queue
 * processes in FIFO order, one entry's remaining days ticking per day.
 */

export interface MilitiaBatch {
  id: string;
  count: number;
  /** Days of training remaining. */
  daysLeft: number;
}

export interface MilitiaQueue {
  batches: MilitiaBatch[];
  ready: number;
}

let nextBatch = 1;

export function createMilitiaQueue(): MilitiaQueue {
  return { batches: [], ready: 0 };
}

/** Queue `count` militia for `days` of training. */
export function queueMilitia(queue: MilitiaQueue, count: number, days: number): MilitiaBatch {
  const batch: MilitiaBatch = {
    id: `militia-${nextBatch++}`,
    count: Math.max(1, Math.round(count)),
    daysLeft: Math.max(1, Math.round(days)),
  };
  queue.batches.push(batch);
  return batch;
}

/** Advance one day. Returns the batches that completed. */
export function tickMilitia(queue: MilitiaQueue): MilitiaBatch[] {
  const done: MilitiaBatch[] = [];
  for (const batch of queue.batches) {
    batch.daysLeft -= 1;
    if (batch.daysLeft <= 0) {
      done.push(batch);
      queue.ready += batch.count;
    }
  }
  queue.batches = queue.batches.filter((b) => b.daysLeft > 0);
  return done;
}
