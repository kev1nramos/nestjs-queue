import { DynamicModule, Module, Global, Provider } from '@nestjs/common';
import { QueueClient } from './clients/queue.client';
import { SqsQueueClient } from './clients/sqs-queue.client';
import { RabbitMqQueueClient } from './clients/rabbitmq-queue.client';
import { MultiQueueClient } from './clients/multi-queue.client';
import {
  IdempotencyStore,
  InMemoryIdempotencyStore,
} from './stores/idempotency.store';

@Global() // Make it global so we don't have to import it everywhere
@Module({})
export class QueueModule {
  static forRoot(): DynamicModule {
    const queueTypes = (process.env.QUEUE_TYPE || 'SQS')
      .split(',')
      .map((t) => t.trim().toUpperCase());

    const providers: Provider[] = [];
    const clients: any[] = []; // Changed to any[] to allow mixing types

    // Provide IdempotencyStore
    const idempotencyProvider: Provider = {
      provide: IdempotencyStore,
      useClass: InMemoryIdempotencyStore,
    };
    providers.push(idempotencyProvider);

    if (queueTypes.includes('SQS')) {
      if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
        throw new Error(
          'AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for SQS',
        );
      }
      providers.push(SqsQueueClient);
      clients.push(SqsQueueClient);
    }

    if (queueTypes.includes('RABBITMQ')) {
      if (!process.env.RABBITMQ_URL) {
        throw new Error('RABBITMQ_URL is required for RabbitMQ');
      }
      providers.push(RabbitMqQueueClient);
      clients.push(RabbitMqQueueClient);
    }

    // If no valid queue type found, default to SQS
    if (clients.length === 0) {
      // Re-check SQS requirements if defaulting
      if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
        throw new Error(
          'AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for SQS (default)',
        );
      }
      providers.push(SqsQueueClient);
      clients.push(SqsQueueClient);
    }

    const mainProvider = {
      provide: QueueClient,
      useFactory: (
        idempotencyStore: IdempotencyStore,
        ...args: QueueClient[]
      ) => {
        if (args.length === 1) {
          return args[0];
        }
        return new MultiQueueClient(args, idempotencyStore);
      },
      inject: [IdempotencyStore, ...clients],
    };

    return {
      module: QueueModule,
      providers: [...providers, mainProvider],
      exports: [QueueClient],
    };
  }
}
