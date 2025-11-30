import { Test, TestingModule } from '@nestjs/testing';
import { RabbitMqQueueClient } from './rabbitmq-queue.client';
import * as amqp from 'amqplib';
import { ConfigService } from '@nestjs/config';
import {
  IdempotencyStore,
  InMemoryIdempotencyStore,
} from '../stores/idempotency.store';

// Mock amqplib
jest.mock('amqplib');

describe('RabbitMqQueueClient', () => {
  let service: RabbitMqQueueClient;
  let mockChannel: {
    assertQueue: jest.Mock;
    sendToQueue: jest.Mock;
    consume: jest.Mock;
    ack: jest.Mock;
    close: jest.Mock;
  };
  let mockConnection: {
    createChannel: jest.Mock;
    close: jest.Mock;
  };

  beforeEach(async () => {
    mockChannel = {
      assertQueue: jest.fn().mockResolvedValue({}),
      sendToQueue: jest.fn(),
      consume: jest.fn(),
      ack: jest.fn(),
      close: jest.fn(),
    };

    mockConnection = {
      createChannel: jest.fn().mockResolvedValue(mockChannel),
      close: jest.fn(),
    };

    (amqp.connect as jest.Mock).mockResolvedValue(mockConnection);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RabbitMqQueueClient,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('amqp://localhost'),
          },
        },
        {
          provide: IdempotencyStore,
          useClass: InMemoryIdempotencyStore,
        },
      ],
    }).compile();

    service = module.get<RabbitMqQueueClient>(RabbitMqQueueClient);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('publish', () => {
    it('should connect and publish to channel', async () => {
      await service.publish('test-queue', { id: '1', payload: { foo: 'bar' } });

      expect(amqp.connect).toHaveBeenCalled();
      expect(mockConnection.createChannel).toHaveBeenCalled();
      expect(mockChannel.assertQueue).toHaveBeenCalledWith('test-queue', {
        durable: true,
      });
      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        'test-queue',
        expect.any(Buffer),
      );
    });
  });

  describe('subscribe', () => {
    it('should connect and consume from channel', async () => {
      const handler = jest.fn();
      await service.subscribe('test-queue', handler);

      expect(mockChannel.consume).toHaveBeenCalledWith(
        'test-queue',
        expect.any(Function),
      );
    });
  });
});
