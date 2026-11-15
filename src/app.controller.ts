import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

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

  @Get('health')
  getHealth() {
    // Mongoose connection.readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
    const isDatabaseConnected = this.connection.readyState === 1;

    return {
      success: isDatabaseConnected,
      statusCode: isDatabaseConnected ? 200 : 503,
      message: isDatabaseConnected ? 'OK' : 'Service Unavailable',
      data: {
        status: isDatabaseConnected ? 'ok' : 'degraded',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        database: isDatabaseConnected ? 'connected' : 'disconnected',
      },
    };
  }
}
