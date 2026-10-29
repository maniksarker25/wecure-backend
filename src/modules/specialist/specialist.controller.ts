import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Query,
} from '@nestjs/common';
import { SpecialistService } from './specialist.service';
import { CreateSpecialistDto } from './dto/create-specialist.dto';
import { UpdateSpecialistDto } from './dto/update-specialist.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/role.enum';
import { GlobalPublicUploadInterceptor } from '../public-upload/public-upload.interceptor';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('specialist')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SpecialistController {
  constructor(private readonly specialistService: SpecialistService) {}

  @Roles(Role.ADMIN)
  @Post()
  @UseInterceptors(
    GlobalPublicUploadInterceptor({
      fieldName: 'image',
      maxCount: 1,
      allowedMimes: /\/(jpg|jpeg|png|gif|webp)$/i,
      maxFileSizeBytes: 10 * 1024 * 1024, // 10MB
    }),
  )
  async create(
    @Body() createSpecialistDto: CreateSpecialistDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const result = await this.specialistService.create(
      createSpecialistDto,
      file,
    );
    return {
      success: true,
      statusCode: 201,
      message: 'Specialist created successfully',
      data: result,
    };
  }

  @Public()
  @Get()
  async findAll(@Query() query) {
    const { data, ...meta } = await this.specialistService.findAll(query);
    return {
      success: true,
      statusCode: 200,
      message: 'Specialists fetched successfully',
      data,
      meta,
    };
  }

  @Public()
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const result = await this.specialistService.findOne(id);
    return {
      success: true,
      statusCode: 200,
      message: 'Specialist fetched successfully',
      data: result,
    };
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  @UseInterceptors(
    GlobalPublicUploadInterceptor({
      fieldName: 'image',
      maxCount: 1,
      allowedMimes: /\/(jpg|jpeg|png|gif|webp)$/i,
      maxFileSizeBytes: 10 * 1024 * 1024, // 10MB
    }),
  )
  async update(
    @Param('id') id: string,
    @Body() updateSpecialistDto: UpdateSpecialistDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const result = await this.specialistService.update(
      id,
      updateSpecialistDto,
      file,
    );
    return {
      success: true,
      statusCode: 200,
      message: 'Specialist updated successfully',
      data: result,
    };
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const result = await this.specialistService.remove(id);
    return {
      success: true,
      statusCode: 200,
      message: 'Specialist deleted successfully',
      data: result,
    };
  }
}
