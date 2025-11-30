import { FactoryProvider, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueueModule } from './queue.module';
import { SqsQueueClient } from './clients/sqs-queue.client';
import { RabbitMqQueueClient } from './clients/rabbitmq-queue.client';
import { MultiQueueClient } from './clients/multi-queue.client';
import { QueueClient } from './clients/queue.client';
import { InMemoryIdempotencyStore } from './stores/idempotency.store';

describe('QueueModule', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should provide MultiQueueClient when multiple types are specified', () => {
    process.env.QUEUE_TYPE = 'SQS,RABBITMQ';
    process.env.AWS_ACCESS_KEY_ID = 'test';
    process.env.AWS_SECRET_ACCESS_KEY = 'test';
    process.env.RABBITMQ_URL = 'amqp://test';

    const dynamicModule = QueueModule.forRoot();

    const provider = dynamicModule.providers!.find(
      (p: Provider) => (p as { provide: any }).provide === QueueClient,
    ) as FactoryProvider;

    // Mock dependencies
    const mockConfigService = {
      get: jest.fn<string | undefined, [string]>((key) => {
        if (key === 'AWS_ACCESS_KEY_ID') return 'test';
        if (key === 'AWS_SECRET_ACCESS_KEY') return 'test';
        if (key === 'RABBITMQ_URL') return 'amqp://test';
        return undefined;
      }),
    } as unknown as ConfigService;

    const idempotencyStore = new InMemoryIdempotencyStore();

    const instance = provider.useFactory(
      idempotencyStore,
      new SqsQueueClient(mockConfigService, idempotencyStore),
      new RabbitMqQueueClient(mockConfigService, idempotencyStore),
    ) as MultiQueueClient;
    expect(instance).toBeInstanceOf(MultiQueueClient);
  });

  it('should handle whitespace in QUEUE_TYPE', () => {
    process.env.QUEUE_TYPE = ' SQS , RABBITMQ ';
    process.env.AWS_ACCESS_KEY_ID = 'test';
    process.env.AWS_SECRET_ACCESS_KEY = 'test';
    process.env.RABBITMQ_URL = 'amqp://test';

    const dynamicModule = QueueModule.forRoot();

    const provider = dynamicModule.providers!.find(
      (p: Provider) => (p as { provide: any }).provide === QueueClient,
    ) as FactoryProvider;
    expect(provider).toBeDefined();

    // Check injected tokens
    expect(provider.inject).toContain(SqsQueueClient);
    expect(provider.inject).toContain(RabbitMqQueueClient);
  });
});
