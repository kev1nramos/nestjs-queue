import { Test, TestingModule } from '@nestjs/testing';
import { QueueClient, QueueMessage } from './queue.client';
import { IdempotencyStore } from '../stores/idempotency.store';
import { Logger } from '@nestjs/common';

// Concrete implementation for testing abstract class
class TestQueueClient extends QueueClient {
  async publishToQueue(queue: string, message: QueueMessage): Promise<void> {
    // Implementation not needed for base class tests, but can be mocked
  }
  async subscribeToQueue(
    queue: string,
    handler: (message: QueueMessage) => Promise<void> | void,
  ): Promise<void> {
    // Simulate receiving a message immediately for testing
  }
}

describe('QueueClient (Base Class)', () => {
  let service: TestQueueClient;
  let idempotencyStore: IdempotencyStore;

  beforeEach(async () => {
    // Mock Logger to avoid noise
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: QueueClient,
          useClass: TestQueueClient,
        },
        {
          provide: IdempotencyStore,
          useValue: {
            has: jest.fn(),
            add: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<QueueClient>(QueueClient) as TestQueueClient;
    idempotencyStore = module.get<IdempotencyStore>(IdempotencyStore);
  });

  describe('publish', () => {
    it('should retry 3 times on failure', async () => {
      const publishSpy = jest
        .spyOn(service, 'publishToQueue')
        .mockRejectedValue(new Error('Fail'));

      await expect(
        service.publish('test-queue', { id: '1', payload: {} }),
      ).rejects.toThrow('Fail');

      expect(publishSpy).toHaveBeenCalledTimes(3);
    });

    it('should succeed if retry works', async () => {
      const publishSpy = jest
        .spyOn(service, 'publishToQueue')
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValue(undefined);

      await expect(
        service.publish('test-queue', { id: '1', payload: {} }),
      ).resolves.not.toThrow();

      expect(publishSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('subscribe', () => {
    it('should check idempotency store before processing', async () => {
      const handler = jest.fn();
      const subscribeSpy = jest
        .spyOn(service, 'subscribeToQueue')
        .mockImplementation(async (q, h) => {
          // Simulate receiving a message
          await h({ id: '1', payload: 'test' });
        });

      (idempotencyStore.has as jest.Mock).mockResolvedValue(false);

      await service.subscribe('test-queue', handler);

      expect(idempotencyStore.has).toHaveBeenCalledWith('1');
      expect(idempotencyStore.add).toHaveBeenCalledWith('1');
      expect(handler).toHaveBeenCalled();
    });

    it('should skip processing if message is duplicate', async () => {
      const handler = jest.fn();
      const subscribeSpy = jest
        .spyOn(service, 'subscribeToQueue')
        .mockImplementation(async (q, h) => {
          await h({ id: '1', payload: 'test' });
        });

      (idempotencyStore.has as jest.Mock).mockResolvedValue(true); // Duplicate!

      await service.subscribe('test-queue', handler);

      expect(idempotencyStore.has).toHaveBeenCalledWith('1');
      expect(idempotencyStore.add).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
