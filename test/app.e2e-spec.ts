import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

import { QueueClient } from './../src/queue/queue.client';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let queueClientMock: Partial<QueueClient>;

  beforeEach(async () => {
    queueClientMock = {
      publish: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(QueueClient)
      .useValue(queueClientMock)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/publish (POST)', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return request(app.getHttpServer())
      .post('/publish')
      .send({ test: 'e2e' })
      .expect(201)
      .expect((res) => {
        const body = res.body as { status: string; data: { test: string } };
        expect(body.status).toBe('success');
        expect(body.data.test).toBe('e2e');
      });
  });
});
