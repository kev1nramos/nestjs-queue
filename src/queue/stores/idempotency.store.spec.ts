import { InMemoryIdempotencyStore } from './idempotency.store';

describe('InMemoryIdempotencyStore', () => {
  let store: InMemoryIdempotencyStore;

  beforeEach(() => {
    store = new InMemoryIdempotencyStore(3); // Small max size for testing
  });

  it('should return false for unknown keys', async () => {
    expect(await store.has('unknown')).toBe(false);
  });

  it('should return true for known keys', async () => {
    await store.add('key1');
    expect(await store.has('key1')).toBe(true);
  });

  it('should evict oldest key when max size is exceeded', async () => {
    await store.add('key1');
    await store.add('key2');
    await store.add('key3');

    expect(await store.has('key1')).toBe(true);
    expect(await store.has('key2')).toBe(true);
    expect(await store.has('key3')).toBe(true);

    // Add 4th key, should evict key1
    await store.add('key4');

    expect(await store.has('key1')).toBe(false);
    expect(await store.has('key2')).toBe(true);
    expect(await store.has('key3')).toBe(true);
    expect(await store.has('key4')).toBe(true);
  });
});
