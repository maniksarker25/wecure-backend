import { Test, TestingModule } from '@nestjs/testing';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { PublicUploadService } from '../public-upload/public-upload.service';

describe('ChatController', () => {
  let controller: ChatController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        {
          provide: ChatService,
          useValue: {
            getConversations: jest.fn(),
            getMessages: jest.fn(),
            getMessagesByUser: jest.fn(),
            markAsRead: jest.fn(),
          },
        },
        {
          provide: PublicUploadService,
          useValue: {
            handleUpload: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ChatController>(ChatController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
