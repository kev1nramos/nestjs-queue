import { Body, Controller, OnModuleInit, Post, Logger } from '@nestjs/common';
import { AppService } from './app.service';
import { QueueClient, QueueMessage } from './queue/clients/queue.client';
import { v4 as uuidv4 } from 'uuid';

class PublishMessageDto {
  [key: string]: unknown;
}

@Controller()
export class AppController implements OnModuleInit {
  private readonly logger = new Logger(AppController.name);

  constructor(
    private readonly appService: AppService,
    private readonly queueClient: QueueClient,
  ) {}

  onModuleInit() {
    // Subscribe to 'my-queue' when the app starts
    this.queueClient.subscribe('my-queue', (message) => {
      this.logger.log(`📢 RECEIVED MESSAGE: ${JSON.stringify(message)}`);
    });
  }

  @Post('publish')
  async publishMessage(@Body() body: PublishMessageDto) {
    const queueName = 'my-queue';
    this.logger.log(`Publishing to ${queueName}...`);

    const message: QueueMessage<PublishMessageDto> = {
      id: (body.id as string) || uuidv4(),
      payload: body,
      timestamp: Date.now(),
    };

    await this.queueClient.publish(queueName, message);

    return {
      status: 'success',
      message: 'Message published',
      data: message,
    };
  }
}
