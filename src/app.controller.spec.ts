import { getConnectionToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  let connection: { readyState: number };

  beforeEach(async () => {
    connection = { readyState: 1 };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: getConnectionToken(), useValue: connection },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return the API welcome response', () => {
      expect(appController.getHello()).toEqual({
        success: true,
        statusCode: 200,
        message: 'Welcome to WeCure API',
        data: 'Hello World!',
      });
    });
  });

  describe('health', () => {
    it('reports healthy when the database is connected', () => {
      connection.readyState = 1;
      expect(appController.getHealth()).toEqual(
        expect.objectContaining({
          success: true,
          statusCode: 200,
          data: expect.objectContaining({
            status: 'ok',
            database: 'connected',
          }),
        }),
      );
    });

    it('reports degraded when the database is disconnected', () => {
      connection.readyState = 0;
      expect(appController.getHealth()).toEqual(
        expect.objectContaining({
          success: false,
          statusCode: 503,
          data: expect.objectContaining({
            status: 'degraded',
            database: 'disconnected',
          }),
        }),
      );
    });
  });
});
