import { Injectable, Logger } from '@nestjs/common';
import { IdempotencyStore } from '../stores/idempotency.store';

export interface QueueMessage<T = unknown> {
  id: string;
  payload: T;
  topic?: string;
  provider?: string;
  timestamp?: number;
}

@Injectable()
export abstract class QueueClient {
  protected readonly logger = new Logger(QueueClient.name);

  constructor(protected readonly idempotencyStore: IdempotencyStore) {}

  /**
   * Publish a message to a specific queue with retry logic.
   */
  async publish<T>(queue: string, message: QueueMessage<T>): Promise<void> {
    let attempts = 0;
    while (attempts < 3) {
      try {
        await this.publishToQueue(queue, message);
        return;
      } catch (error) {
        attempts++;
        this.logger.warn(
          `Failed to publish to ${queue} (attempt ${attempts}/3)`,
          error,
        );
        if (attempts >= 3) throw error;
        await new Promise((resolve) =>
          setTimeout(resolve, 100 * Math.pow(2, attempts)),
        ); // Exponential backoff
      }
    }
  }

  /**
   * Actual implementation of publishing to the queue provider.
   */
  protected abstract publishToQueue(
    queue: string,
    message: QueueMessage,
  ): Promise<void>;

  /**
   * Subscribe to a queue and handle incoming messages with idempotency logic.
   */
  async subscribe<T>(
    queue: string,
    handler: (message: QueueMessage<T>) => Promise<void> | void,
  ): Promise<void> {
    const wrappedHandler = async (message: QueueMessage<T>) => {
      if (await this.idempotencyStore.has(message.id)) {
        this.logger.warn(
          `Duplicate message detected: ${message.id}. Ignoring.`,
        );
        return;
      }

      await this.idempotencyStore.add(message.id);
      await handler(message);
    };

    await this.subscribeToQueue(queue, wrappedHandler as any);
  }

  /**
   * Actual implementation of subscribing to the queue provider.
   */
  protected abstract subscribeToQueue(
    queue: string,
    handler: (message: QueueMessage) => Promise<void> | void,
  ): Promise<void> | void;
}
