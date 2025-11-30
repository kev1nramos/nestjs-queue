
export abstract class IdempotencyStore {
  abstract has(key: string): Promise<boolean>;
  abstract add(key: string): Promise<void>;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly processedIds = new Set<string>();
  private readonly maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  async has(key: string): Promise<boolean> {
    return this.processedIds.has(key);
  }

  async add(key: string): Promise<void> {
    this.processedIds.add(key);
    if (this.processedIds.size > this.maxSize) {
      const it = this.processedIds.values();
      this.processedIds.delete(it.next().value as string);
    }
  }
}
