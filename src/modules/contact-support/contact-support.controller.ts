import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Req,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Delete,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ContactSupportService } from './contact-support.service';
import { CreateContactSupportDto } from './dto/create-contact-support.dto';
import { UpdateContactSupportDto } from './dto/update-contact-support.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/role.enum';
import { isValidObjectId } from 'mongoose';
import { PrivateUploadService } from '../uploads/private-upload.service';

@Controller('contact')
export class ContactSupportController {
  constructor(
    private readonly contactSupportService: ContactSupportService,
    private readonly privateUploadService: PrivateUploadService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.DOCTOR, Role.USER, Role.ADMIN)
  @Post()
  @UseInterceptors(FileInterceptor('attachment'))
  async create(
    @Body() createContactSupportDto: CreateContactSupportDto,
    @Req() req,
    @UploadedFile() attachment?: Express.Multer.File,
  ) {
    try {
      if (attachment) {
        const fileKey = await this.privateUploadService.handleUpload(
          attachment,
          'support',
          req.user.userId,
        );
        createContactSupportDto.attachment = fileKey;
      }

      const result = await this.contactSupportService.create(
        createContactSupportDto,
        req.user.userId,
      );
      return {
        success: true,
        statusCode: 201,
        message: 'Support message submitted successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to submit support message',
        data: null,
      };
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get()
  async findAll(@Query() query) {
    try {
      const { data, ...meta } = await this.contactSupportService.findAll(query);
      return {
        success: true,
        statusCode: 200,
        message: 'Support messages fetched successfully',
        data,
        meta,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch support messages',
        data: null,
      };
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.DOCTOR)
  @Get('my-messages')
  async findMyMessages(@Req() req) {
    try {
      const result = await this.contactSupportService.findByUser(
        req.user.userId,
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Your support messages fetched successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch your support messages',
        data: null,
      };
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.DOCTOR)
  @Get('my-message')
  async findMyMessage(@Req() req) {
    return this.findMyMessages(req);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findOne(@Param('id') id: string) {
    try {
      if (!isValidObjectId(id)) {
        return {
          success: false,
          statusCode: 400,
          message: `Invalid ID format: ${id}`,
          data: null,
        };
      }
      const result = await this.contactSupportService.findOne(id);
      return {
        success: true,
        statusCode: 200,
        message: 'Support message fetched successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch support message',
        data: null,
      };
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateContactSupportDto: UpdateContactSupportDto,
  ) {
    try {
      if (!isValidObjectId(id)) {
        return {
          success: false,
          statusCode: 400,
          message: `Invalid ID format: ${id}`,
          data: null,
        };
      }
      const result = await this.contactSupportService.update(
        id,
        updateContactSupportDto,
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Support message updated successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to update support message',
        data: null,
      };
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    try {
      if (!isValidObjectId(id)) {
        return {
          success: false,
          statusCode: 400,
          message: `Invalid ID format: ${id}`,
          data: null,
        };
      }
      const result = await this.contactSupportService.remove(id);
      return {
        success: true,
        statusCode: 200,
        message: 'Support message deleted successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to delete support message',
        data: null,
      };
    }
  }
}
