export class Semaphore {
  private permits: number;
  private readonly queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits -= 1;
      return;
    }

    await new Promise<void>(resolve => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.permits += 1;
    const waiter = this.queue.shift();
    if (this.permits > 0 && waiter) {
      this.permits -= 1;
      waiter();
    }
  }
}
