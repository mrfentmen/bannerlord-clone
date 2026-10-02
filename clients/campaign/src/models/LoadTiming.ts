/**
 * Load-time measurement and logging.
 *
 * Task 623: "the map feels slow" is not debuggable without numbers. Every model
 * load records how long it took and how big it was, aggregated per session so
 * the slow ones are visible rather than averaged away, and slow loads are
 * called out at the moment they happen instead of in a post-mortem.
 *
 * The clock is injected. That is not ceremony: a performance measurement whose
 * clock the test controls is a measurement the test can assert on, and it also
 * means the module works on a platform where `performance.now` is not there.
 *
 * Nothing is written to a console unless the caller asks for it, so importing
 * this into a scene does not add a log line per model.
 */

/** One completed load. */
export interface LoadSample {
  /** Manifest id. */
  id: string;
  /** Milliseconds between the start and the end of the load. */
  durationMs: number;
  /** Size of the file, when the caller knew it. */
  bytes?: number;
}

/** A load that ran from start to finish. */
export interface TimedLoad {
  /** Marks the end of the load and returns the sample. */
  end(): LoadSample;
}

/** Options for {@link LoadTimer}. */
export interface LoadTimerOptions {
  /**
   * Loads slower than this are called out, ms. Defaults to 1000. A slow load is
   * reported once, when it ends -- not on every sample.
   */
  slowThresholdMs?: number;
  /** Where the log lines go. Defaults to `console.warn`. */
  onWarn?: (message: string) => void;
  /** Clock in milliseconds; defaults to `performance.now`, or `Date.now`. */
  now?: () => number;
}

/** Default "this load was slow" line, ms. */
export const DEFAULT_SLOW_LOAD_MS = 1000;

/** Aggregates load samples and reports the slow ones. */
export class LoadTimer {
  private readonly samples: LoadSample[] = [];
  private readonly now: () => number;
  private readonly slowThresholdMs: number;
  private readonly onWarn: ((message: string) => void) | null;

  constructor(options: LoadTimerOptions = {}) {
    this.now =
      options.now ??
      (typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? () => performance.now()
        : () => Date.now());
    const threshold = options.slowThresholdMs;
    this.slowThresholdMs = typeof threshold === 'number' && Number.isFinite(threshold) && threshold >= 0
      ? threshold
      : DEFAULT_SLOW_LOAD_MS;
    this.onWarn = options.onWarn === undefined ? (m) => console.warn(m) : options.onWarn;
  }

  /**
   * Starts timing a load. The returned handle ends it; a load that is never
   * ended is simply never recorded, which is the same as what a dropped load
   * costs.
   */
  begin(id: string, bytes?: number): TimedLoad {
    const startedAt = this.now();
    let ended = false;
    return {
      end: (): LoadSample => {
        // Ending twice would double-count and report a zero-length load.
        if (ended) throw new Error(`LoadTimer: load "${id}" ended twice`);
        ended = true;
        const durationMs = Math.max(0, this.now() - startedAt);
        const sample: LoadSample = bytes === undefined ? { id, durationMs } : { id, durationMs, bytes };
        this.samples.push(sample);
        if (durationMs > this.slowThresholdMs) {
          const size = bytes === undefined ? '' : `, ${formatBytes(bytes)}`;
          this.onWarn?.(
            `ModelLoader: "${id}" took ${Math.round(durationMs)} ms${size} (over the ${Math.round(
              this.slowThresholdMs,
            )} ms budget)`,
          );
        }
        return sample;
      },
    };
  }

  /** Records a load whose timing was measured elsewhere, e.g. by the loader. */
  record(sample: LoadSample): void {
    if (!Number.isFinite(sample.durationMs)) return;
    this.samples.push({ ...sample, durationMs: Math.max(0, sample.durationMs) });
  }

  /** Every sample, in the order they finished. */
  all(): LoadSample[] {
    return [...this.samples];
  }

  /** How many loads were recorded. */
  count(): number {
    return this.samples.length;
  }

  /** Total milliseconds across every recorded load. */
  totalMs(): number {
    return this.samples.reduce((sum, s) => sum + s.durationMs, 0);
  }

  /** Mean load time, or 0 when nothing has loaded. */
  meanMs(): number {
    return this.samples.length === 0 ? 0 : this.totalMs() / this.samples.length;
  }

  /**
   * The slowest loads, slowest first. This is the number that matters: an
   * average over a preload pass hides one 4-second building among thirty
   * instant props.
   */
  slowest(count = 5): LoadSample[] {
    return [...this.samples]
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, Math.max(0, Math.floor(count)));
  }

  /** One line summarising the session, for a debug overlay. */
  summary(): string {
    if (this.samples.length === 0) return 'models: none loaded';
    const slowestLoad = this.slowest(1)[0];
    const slowestId = slowestLoad ? ` "${slowestLoad.id}" ${Math.round(slowestLoad.durationMs)} ms` : '';
    const totalBytes = this.samples.reduce((sum, s) => sum + (s.bytes ?? 0), 0);
    const size = totalBytes > 0 ? `, ${formatBytes(totalBytes)}` : '';
    return `models: ${this.samples.length} loaded in ${Math.round(
      this.totalMs(),
    )} ms (mean ${Math.round(this.meanMs())} ms${size}), slowest${slowestId}`;
  }

  /** Drops every sample; the next summary starts from nothing. */
  clear(): void {
    this.samples.length = 0;
  }
}

/** A byte count as KB/MB, for a log line. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${Math.round(mb * 10) / 10} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}