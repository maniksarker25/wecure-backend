import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello() {
    try {
      const result = this.appService.getHello();
      return {
        success: true,
        statusCode: 200,
        message: 'Welcome to WeCure API',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: 500,
        message: error.message || 'Internal Server Error',
        data: null,
      };
    }
  }
}
