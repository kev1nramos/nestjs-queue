import { Test, TestingModule } from '@nestjs/testing';
import { SqsQueueClient } from './sqs-queue.client';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { mockClient } from 'aws-sdk-client-mock';
import { ConfigService } from '@nestjs/config';
import {
  IdempotencyStore,
  InMemoryIdempotencyStore,
} from '../stores/idempotency.store';

describe('SqsQueueClient', () => {
  let service: SqsQueueClient;
  const sqsMock = mockClient(SQSClient);

  beforeEach(async () => {
    sqsMock.reset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SqsQueueClient,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key) => {
              if (key === 'AWS_REGION') return 'us-east-1';
              if (key === 'SQS_ENDPOINT') return 'http://localhost:4566';
              if (key === 'AWS_ACCESS_KEY_ID') return 'test-key';
              if (key === 'AWS_SECRET_ACCESS_KEY') return 'test-secret';
              return 'test';
            }),
          },
        },
        {
          provide: IdempotencyStore,
          useClass: InMemoryIdempotencyStore,
        },
      ],
    }).compile();

    service = module.get<SqsQueueClient>(SqsQueueClient);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('publish', () => {
    it('should send a message to SQS', async () => {
      sqsMock.on(SendMessageCommand).resolves({});

      const message = { id: '1', payload: { hello: 'world' } };
      await service.publish('test-queue', message);

      expect(sqsMock.calls()).toHaveLength(1);
      const call = sqsMock.call(0);
      const command = call.args[0] as SendMessageCommand;
      const callArgs = command.input;
      expect(callArgs).toEqual(
        expect.objectContaining({
          MessageBody: JSON.stringify(message),
        }),
      );
    });

  });

  // Note: Testing the infinite loop in subscribe is tricky in unit tests.
  // We usually test that it calls the client once or refactor the loop to be testable.
  // For this boilerplate, we will verify the initial subscription setup.
});
