export class FpsMonitor {
  private readonly windowSize: number;
  private timestamps: number[] = [];

  constructor(windowSize = 30) {
    this.windowSize = windowSize;
  }

  tick(now = performance.now()): number {
    this.timestamps.push(now);
    if (this.timestamps.length > this.windowSize) {
      this.timestamps.shift();
    }
    return this.averageFps;
  }

  get averageFps(): number {
    if (this.timestamps.length < 2) {
      return 0;
    }
    const elapsedMs = this.timestamps[this.timestamps.length - 1] - this.timestamps[0];
    if (elapsedMs <= 0) {
      return 0;
    }
    return ((this.timestamps.length - 1) * 1000) / elapsedMs;
  }

  reset(): void {
    this.timestamps = [];
  }
}
