// Browser-side performance logger that sends to server
const LOG_ENDPOINT = '/api/log';

interface PerfEntry {
  name: string;
  startTime: number;
  duration?: number;
}

const activeTimers: Map<string, PerfEntry> = new Map();

export const perf = {
  start(name: string): void {
    activeTimers.set(name, { name, startTime: performance.now() });
  },

  end(name: string): number {
    const entry = activeTimers.get(name);
    if (!entry) {
      console.warn(`No timer found for: ${name}`);
      return 0;
    }

    const duration = performance.now() - entry.startTime;
    activeTimers.delete(name);

    // Send to server for file logging
    fetch(LOG_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'perf',
        name,
        duration: Math.round(duration * 100) / 100,
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {
      // Ignore logging errors
    });

    return duration;
  },

  async measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
    this.start(name);
    try {
      return await fn();
    } finally {
      this.end(name);
    }
  },

  measureSync<T>(name: string, fn: () => T): T {
    this.start(name);
    try {
      return fn();
    } finally {
      this.end(name);
    }
  },
};
