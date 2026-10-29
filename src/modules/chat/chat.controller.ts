import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UPLOAD_FOLDERS } from 'src/common/constants/constants';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PublicUploadService } from '../public-upload/public-upload.service';
import { ChatService } from './chat.service';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly publicUploadService: PublicUploadService,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('image'))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    try {
      const imageUrl = await this.publicUploadService.handleUpload(
        file,
        UPLOAD_FOLDERS.CHAT,
      );
      return {
        success: true,
        statusCode: 201,
        message: 'Image uploaded successfully',
        data: { url: imageUrl },
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to upload image',
        data: null,
      };
    }
  }

  // @Get('messages-by-appointment')
  // async getMessagesByAppointment(
  //   @Query('appointmentId') appointmentId: string,
  //   @Query('page') page: number = 1,
  //   @Query('limit') limit: number = 50,
  //   @Req() req,
  // ) {
  //   try {
  //     const result = await this.chatService.getMessagesByAppointment(
  //       appointmentId,
  //       req.user.userId,
  //       req.user.role,
  //       Number(page),
  //       Number(limit),
  //     );
  //     return {
  //       success: true,
  //       statusCode: 200,
  //       message: 'Messages fetched successfully',
  //       conversationId: result.conversationId || null,
  //       recipient: result.recipient || null,
  //       data: result.data,
  //       meta: result.meta,
  //     };
  //   } catch (error) {
  //     return {
  //       success: false,
  //       statusCode: error.status || 400,
  //       message: error.message || 'Failed to fetch messages',
  //       data: null,
  //     };
  //   }
  // }

  @Get('conversations')
  async getConversations(
    @Query('appointmentId') appointmentId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Req() req,
  ) {
    try {
      const result = await this.chatService.getConversations(
        req.user.userId,
        req.user.role,
        appointmentId,
        Number(page),
        Number(limit),
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Conversations fetched successfully',
        data: result.data,
        meta: result.meta,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch conversations',
        data: null,
      };
    }
  }

  @Get('messages/:conversationId')
  async getMessages(
    @Param('conversationId') conversationId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @Req() req,
  ) {
    try {
      const result = await this.chatService.getMessages(
        conversationId,
        req.user.userId,
        req.user.role,
        Number(page),
        Number(limit),
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Messages fetched successfully',
        recipient: result.recipient || null,
        data: result.data,
        meta: result.meta,
      };
    } catch (error: any) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch messages',
        data: null,
      };
    }
  }

  @Get('messages-by-user/:userId')
  async getMessagesByUser(
    @Param('userId') userId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @Req() req,
  ) {
    try {
      const result = await this.chatService.getMessagesByUser(
        userId,
        req.user.userId,
        req.user.role,
        Number(page),
        Number(limit),
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Messages fetched successfully',
        conversationId: result.conversationId || null,
        recipient: result.recipient || null,
        data: result.data,
        meta: result.meta,
      };
    } catch (error: any) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch messages',
        data: null,
      };
    }
  }

  @Post('read/:conversationId')
  async markAsRead(
    @Param('conversationId') conversationId: string,
    @Req() req,
  ) {
    try {
      await this.chatService.markAsRead(
        conversationId,
        req.user.userId,
        req.user.role,
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Messages marked as read',
        data: null,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to mark messages as read',
        data: null,
      };
    }
  }
}
