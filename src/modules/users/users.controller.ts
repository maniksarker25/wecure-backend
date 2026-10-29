import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  UseGuards,
  Req,
  Query,
  Param,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AddUserBankDetailsDto } from './dto/add-user-bank-details.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { CreateAdminDto } from './dto/create-admin.dto';
import { FcmTokenDto } from './dto/fcm-token.dto';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/role.enum';
import { PublicUploadService } from '../public-upload/public-upload.service';
import { UPLOAD_FOLDERS } from 'src/common/constants/constants';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly publicUploadService: PublicUploadService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@Req() req) {
    try {
      const user = await this.usersService.findById(req.user.userId);
      return {
        success: true,
        statusCode: 200,
        message: 'User profile fetched successfully',
        data: user,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch profile',
        data: null,
      };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  @UseInterceptors(FileInterceptor('image'))
  async updateProfile(
    @Req() req,
    @Body() dto: UpdateProfileDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    try {
      if (image) {
        const imageUrl = await this.publicUploadService.handleUpload(
          image,
          UPLOAD_FOLDERS.USER_PROFILES,
        );
        dto.profileImage = imageUrl;
      }

      const user = await this.usersService.updateProfile(req.user.userId, dto);
      return {
        success: true,
        statusCode: 200,
        message: 'Profile updated successfully',
        data: user,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to update profile',
        data: null,
      };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  async changePassword(@Req() req, @Body() dto: ChangePasswordDto) {
    try {
      await this.usersService.changePassword(req.user.userId, dto);
      return {
        success: true,
        statusCode: 200,
        message: 'Password changed successfully',
        data: null,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to change password',
        data: null,
      };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/bank-details')
  async addBankDetails(@Req() req, @Body() dto: AddUserBankDetailsDto) {
    try {
      const user = await this.usersService.addBankDetails(req.user.userId, dto);
      return {
        success: true,
        statusCode: 200,
        message: 'Bank details updated successfully',
        data: user,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to update bank details',
        data: null,
      };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/bank-details')
  async getBankDetails(@Req() req) {
    try {
      const bankDetails = await this.usersService.getBankDetails(
        req.user.userId,
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Bank details fetched successfully',
        data: bankDetails,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch bank details',
        data: null,
      };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Delete('profile')
  async deleteAccount(@Req() req) {
    try {
      await this.usersService.deleteAccount(req.user.userId);
      return {
        success: true,
        statusCode: 200,
        message: 'Account deleted successfully',
        data: null,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to delete account',
        data: null,
      };
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @Post('admin')
  async createAdmin(@Body() dto: CreateAdminDto) {
    try {
      const admin = await this.usersService.createAdmin(dto);
      return {
        success: true,
        statusCode: 201,
        message: 'Admin created successfully',
        data: admin,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to create admin',
        data: null,
      };
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get()
  async findAll(@Query() query) {
    try {
      const { data, ...meta } = await this.usersService.findAll(query);
      return {
        success: true,
        statusCode: 200,
        message: 'Users fetched successfully',
        data,
        meta,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch users',
        data: null,
      };
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get(':id')
  async findOne(@Param('id') id: string) {
    try {
      const user = await this.usersService.findById(id);
      if (!user) {
        return {
          success: false,
          statusCode: 404,
          message: 'User not found',
          data: null,
        };
      }
      return {
        success: true,
        statusCode: 200,
        message: 'User fetched successfully',
        data: user,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch user',
        data: null,
      };
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id/toggle-status')
  async toggleUserStatus(@Req() req, @Param('id') id: string) {
    try {
      const user = await this.usersService.toggleUserStatus(
        id,
        req.user.userId,
      );
      if (!user) {
        throw new Error('User not found after update');
      }
      return {
        success: true,
        statusCode: 200,
        message: `User ${user.status === 'BLOCKED' ? 'blocked' : 'unblocked'} successfully`,
        data: user,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to toggle user status',
        data: null,
      };
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id/role')
  async changeRole(@Param('id') id: string, @Body() dto: ChangeRoleDto) {
    try {
      const user = await this.usersService.changeRole(id, dto.role);
      return {
        success: true,
        statusCode: 200,
        message: 'User role updated successfully',
        data: user,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to update user role',
        data: null,
      };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Patch('fcm-token')
  async registerFcmToken(@Req() req, @Body() body: FcmTokenDto) {
    await this.usersService.registerFcmToken(req.user.userId, body.token);
    return {
      success: true,
      statusCode: 200,
      message: 'FCM token registered successfully',
      data: null,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Delete('fcm-token')
  async removeFcmToken(@Req() req, @Body() body: FcmTokenDto) {
    await this.usersService.removeFcmToken(req.user.userId, body.token);
    return {
      success: true,
      statusCode: 200,
      message: 'FCM token removed successfully',
      data: null,
    };
  }
}
