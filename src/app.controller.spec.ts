import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { QueueClient } from './queue/clients/queue.client';

describe('AppController', () => {
  let appController: AppController;
  let queueClientMock: Partial<QueueClient>;

  beforeEach(async () => {
    queueClientMock = {
      publish: jest.fn(),
      subscribe: jest.fn(),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: QueueClient, useValue: queueClientMock },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should be defined', () => {
      expect(appController).toBeDefined();
    });
  });

  describe('publishMessage', () => {
    it('should call queueClient.publish', async () => {
      const body = { test: 'data' };
      const result = await appController.publishMessage(body);

      expect(queueClientMock.publish).toHaveBeenCalledWith(
        'my-queue',
        expect.objectContaining({
          payload: body,
          id: expect.any(String),
          timestamp: expect.any(Number),
        }),
      );
      expect(result).toEqual({
        status: 'success',
        message: 'Message published',
        data: expect.objectContaining({
          payload: body,
          id: expect.any(String),
          timestamp: expect.any(Number),
        }),
      });
    });
  });
});
