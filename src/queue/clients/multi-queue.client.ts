import { Injectable } from '@nestjs/common';
import { QueueClient, QueueMessage } from './queue.client';
import { IdempotencyStore } from '../stores/idempotency.store';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class MultiQueueClient extends QueueClient {
  constructor(
    private readonly clients: QueueClient[],
    protected readonly idempotencyStore: IdempotencyStore,
  ) {
    super(idempotencyStore);
  }

  async publish<T>(queue: string, message: QueueMessage<T>): Promise<void> {
    return this.publishToQueue(queue, message);
  }

  protected async publishToQueue(
    queue: string,
    message: QueueMessage,
  ): Promise<void> {
    // Ensure message has an ID for idempotency across multiple queues
    if (!message.id) {
      message.id = uuidv4();
    }

    // Fan-out: Publish to all active queues
    // We call client.publish() so each client handles its own retries
    const results = await Promise.allSettled(
      this.clients.map((client) => client.publish(queue, message)),
    );

    const successful = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    if (failed.length > 0) {
      failed.forEach((f) => {
        this.logger.error(`Failed to publish to one of the queues`, f.reason);
      });
    }

    if (successful.length === 0 && this.clients.length > 0) {
      throw new Error('Failed to publish to ANY queue provider');
    }
  }

  async subscribe<T>(
    queue: string,
    handler: (message: QueueMessage<T>) => Promise<void> | void,
  ): Promise<void> {
    // Delegate directly to clients, avoiding double idempotency check
    await Promise.all(
      this.clients.map((client) => client.subscribe(queue, handler)),
    );
  }

  protected subscribeToQueue(
    queue: string,
    handler: (message: QueueMessage) => Promise<void> | void,
  ): void {
    // This method is not used because we override subscribe
  }
}
