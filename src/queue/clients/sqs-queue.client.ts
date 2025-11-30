import { Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';
import { QueueClient, QueueMessage } from './queue.client';

import { ConfigService } from '@nestjs/config';

import { IdempotencyStore } from '../stores/idempotency.store';

@Injectable()
export class SqsQueueClient extends QueueClient implements OnModuleDestroy {
  private readonly client: SQSClient;
  private isDestroyed = false;

  constructor(
    private readonly configService: ConfigService,
    protected readonly idempotencyStore: IdempotencyStore,
  ) {
    super(idempotencyStore);
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'AWS_SECRET_ACCESS_KEY',
    );

    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        'AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be defined',
      );
    }

    this.client = new SQSClient({
      region: this.configService.get<string>('AWS_REGION'),
      endpoint: this.configService.get<string>('SQS_ENDPOINT'),
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  protected async publishToQueue(
    queue: string,
    message: QueueMessage,
  ): Promise<void> {
    const queueUrl = this.getQueueUrl(queue);
    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(message),
    });

    await this.client.send(command);
    this.logger.log(`Message published to SQS queue ${queue}`);
  }

  protected subscribeToQueue(
    queue: string,
    handler: (message: QueueMessage) => Promise<void> | void,
  ): void {
    this.logger.log(`Subscribing to SQS queue ${queue}`);

    // Simple polling mechanism
    const poll = async () => {
      if (this.isDestroyed) return;
      try {
        const queueUrl = this.getQueueUrl(queue);
        const command = new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 10, // Long polling
        });

        const response = await this.client.send(command);

        if (response.Messages && response.Messages.length > 0) {
          for (const msg of response.Messages) {
            if (msg.Body) {
              try {
                const content = JSON.parse(msg.Body) as QueueMessage;
                content.provider = 'SQS';
                await handler(content);

                // Delete message after successful handling
                await this.client.send(
                  new DeleteMessageCommand({
                    QueueUrl: queueUrl,
                    ReceiptHandle: msg.ReceiptHandle,
                  }),
                );
              } catch (error) {
                this.logger.error('Error processing SQS message', error);
              }
            }
          }
        }
      } catch (error) {
        if (!this.isDestroyed) {
          this.logger.error(`Error polling SQS queue ${queue}`, error);
        }
      }
    };

    const startPolling = async () => {
      while (!this.isDestroyed) {
        await poll();
        if (!this.isDestroyed) {
          await new Promise((resolve) => setTimeout(resolve, 100)); // Small throttle
        }
      }
    };

    void startPolling();
  }

  private getQueueUrl(queueName: string): string {
    try {
      if (queueName.startsWith('http')) return queueName;

      const endpoint = this.configService.get<string>('SQS_ENDPOINT');
      if (endpoint) {
        return `${endpoint}/000000000000/${queueName}`;
      }

      throw new Error(
        'SQS_ENDPOINT must be set for this boilerplate to resolve queue URLs simply.',
      );
    } catch (e) {
      this.logger.error('Failed to resolve Queue URL', e);
      throw e;
    }
  }

  onModuleDestroy() {
    this.isDestroyed = true;
    this.client.destroy();
  }
}
