import { Test, TestingModule } from '@nestjs/testing';
import { MultiQueueClient } from './multi-queue.client';
import { QueueClient } from './queue.client';
import { Logger } from '@nestjs/common';
import { InMemoryIdempotencyStore } from '../stores/idempotency.store';

describe('MultiQueueClient', () => {
  let service: MultiQueueClient;
  let client1: QueueClient;
  let client2: QueueClient;

  beforeAll(() => {
    // Suppress error logs during these tests
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(async () => {
    client1 = {
      publish: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn(),
    } as any;

    client2 = {
      publish: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: MultiQueueClient,
          useFactory: () =>
            new MultiQueueClient(
              [client1, client2],
              new InMemoryIdempotencyStore(),
            ),
        },
      ],
    }).compile();

    service = module.get<MultiQueueClient>(MultiQueueClient);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('publish', () => {
    it('should publish to all clients', async () => {
      const message = { id: '1', payload: { foo: 'bar' } };
      await service.publish('test-queue', message);
      expect(client1.publish).toHaveBeenCalledWith(
        'test-queue',
        expect.objectContaining(message),
      );
      expect(client2.publish).toHaveBeenCalledWith(
        'test-queue',
        expect.objectContaining(message),
      );
    });

    it('should handle partial failure gracefully (do not throw)', async () => {
      (client1.publish as jest.Mock).mockRejectedValue(new Error('Fail'));

      // Should not throw because client2 succeeds
      await expect(
        service.publish('test-queue', { id: '1', payload: { foo: 'bar' } }),
      ).resolves.not.toThrow();

      expect(client1.publish).toHaveBeenCalled();
      expect(client2.publish).toHaveBeenCalled();
    });

    it('should throw if ALL queues fail', async () => {
      (client1.publish as jest.Mock).mockRejectedValue(new Error('Fail 1'));
      (client2.publish as jest.Mock).mockRejectedValue(new Error('Fail 2'));

      await expect(
        service.publish('test-queue', { id: '1', payload: { foo: 'bar' } }),
      ).rejects.toThrow('Failed to publish to ANY queue provider');
    });
  });

  describe('subscribe', () => {
    it('should subscribe to all clients', () => {
      const handler = () => {};
      service.subscribe('test-queue', handler);

      expect(client1.subscribe).toHaveBeenCalledWith('test-queue', handler);
      expect(client2.subscribe).toHaveBeenCalledWith('test-queue', handler);
    });
  });
});
