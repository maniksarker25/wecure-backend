import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { WellnessTipsService } from './wellness-tips.service';
import { CreateWellnessTipDto } from './dto/create-wellness-tip.dto';
import { UpdateWellnessTipDto } from './dto/update-wellness-tip.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/role.enum';
import { OptionalJwtAuthGuard } from 'src/common/guards/optional-jwt-auth.guard';

@Controller('wellness-tips')
export class WellnessTipsController {
  constructor(private readonly wellnessTipsService: WellnessTipsService) {}

  @UseGuards(JwtAuthGuard)
  @Patch(':id/like')
  async toggleLike(@Param('id') id: string, @Req() req) {
    try {
      const result = await this.wellnessTipsService.toggleLike(
        id,
        req.user.userId,
      );
      return {
        success: true,
        statusCode: 200,
        message: result.liked ? 'Tip liked' : 'Tip unliked',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to toggle like',
        data: null,
      };
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  async create(@Body() createWellnessTipDto: CreateWellnessTipDto) {
    try {
      const result =
        await this.wellnessTipsService.create(createWellnessTipDto);
      return {
        success: true,
        statusCode: 201,
        message: 'Wellness tip created successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to create wellness tip',
        data: null,
      };
    }
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  async findAll(@Query() query, @Req() req) {
    try {
      const userId = req.user?.userId;
      const { data, ...meta } = await this.wellnessTipsService.findAll(
        query,
        userId,
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Wellness tips fetched successfully',
        data,
        meta,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch wellness tips',
        data: null,
      };
    }
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req) {
    try {
      const userId = req.user?.userId;
      const result = await this.wellnessTipsService.findOne(id, userId);
      return {
        success: true,
        statusCode: 200,
        message: 'Wellness tip fetched successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch wellness tip',
        data: null,
      };
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateWellnessTipDto: UpdateWellnessTipDto,
  ) {
    try {
      const result = await this.wellnessTipsService.update(
        id,
        updateWellnessTipDto,
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Wellness tip updated successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to update wellness tip',
        data: null,
      };
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    try {
      const result = await this.wellnessTipsService.remove(id);
      return {
        success: true,
        statusCode: 200,
        message: 'Wellness tip deleted successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to delete wellness tip',
        data: null,
      };
    }
  }
}
