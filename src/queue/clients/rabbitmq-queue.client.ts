import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Channel, Connection, connect } from 'amqplib';
import { QueueClient, QueueMessage } from './queue.client';

interface RabbitMQConnection extends Connection {
  createChannel(): Promise<Channel>;
  close(): Promise<void>;
}

import { ConfigService } from '@nestjs/config';

import { IdempotencyStore } from '../stores/idempotency.store';

@Injectable()
export class RabbitMqQueueClient
  extends QueueClient
  implements OnModuleInit, OnModuleDestroy
{
  private connection: RabbitMQConnection;
  private channel: Channel;

  constructor(
    private readonly configService: ConfigService,
    protected readonly idempotencyStore: IdempotencyStore,
  ) {
    super(idempotencyStore);
  }

  async onModuleInit() {
    await this.connect();
  }

  private async connect() {
    let attempts = 0;
    while (attempts < 5) {
      try {
        const url = this.configService.get<string>('RABBITMQ_URL');
        if (!url) throw new Error('RABBITMQ_URL is not defined');
        this.connection = (await connect(url)) as unknown as RabbitMQConnection;
        this.channel = await this.connection.createChannel();
        this.logger.log('Connected to RabbitMQ');
        return;
      } catch (error) {
        attempts++;
        this.logger.error(
          `Failed to connect to RabbitMQ (attempt ${attempts}/5)`,
          error,
        );
        if (attempts >= 5) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempts));
      }
    }
  }

  protected async publishToQueue(
    queue: string,
    message: QueueMessage,
  ): Promise<void> {
    if (!this.channel) await this.connect();

    await this.channel.assertQueue(queue, { durable: true });
    this.channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)));
    this.logger.log(`Message published to RabbitMQ queue ${queue}`);
  }

  protected async subscribeToQueue(
    queue: string,
    handler: (message: QueueMessage) => Promise<void> | void,
  ): Promise<void> {
    if (!this.channel) await this.connect();

    await this.channel.assertQueue(queue, { durable: true });

    this.logger.log(`Subscribing to RabbitMQ queue ${queue}`);

    await this.channel.consume(queue, (msg) => {
      void (async () => {
        if (msg !== null) {
          try {
            const content = JSON.parse(msg.content.toString()) as QueueMessage;
            content.provider = 'RabbitMQ';
            await handler(content);
            this.channel.ack(msg);
          } catch (error) {
            this.logger.error(`Error processing RabbitMQ message`, error);
          }
        }
      })();
    });
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
  }
}
