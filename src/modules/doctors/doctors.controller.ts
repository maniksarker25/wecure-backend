import {
  Controller,
  Get,
  Post,
  Body,
  BadRequestException,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Query,
} from '@nestjs/common';
import { DoctorsService } from './doctors.service';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import { AddBankDetailsDto } from './dto/add-bank-details.dto';
import { UpdateVerificationStatusDto } from './dto/update-verification-status.dto';
import { AddExperienceDto } from './dto/add-experience.dto';
import { UpdateExperienceDto } from './dto/update-experience.dto';
import { SearchDoctorDto } from './dto/search-doctor.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { Role } from 'src/common/enum/role.enum';
import { GlobalPublicUploadInterceptor } from '../public-upload/public-upload.interceptor';

@Controller('doctors')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Roles(Role.DOCTOR)
  @Post('me/profile')
  createProfile(@Req() req, @Body() dto: CreateDoctorDto) {
    return this.doctorsService.createProfile(req.user.userId, dto);
  }

  @Roles(Role.DOCTOR)
  @Patch('me/profile')
  @UseInterceptors(
    GlobalPublicUploadInterceptor({
      fieldName: 'image',
      maxCount: 1,
      allowedMimes: /\/(jpg|jpeg|png|webp)$/i,
      maxFileSizeBytes: 5 * 1024 * 1024, // 5MB
    }),
  )
  updateProfile(
    @Req() req,
    @Body() dto: UpdateDoctorDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.doctorsService.updateProfile(req.user.userId, dto, file);
  }

  @Get('me/profile')
  getMyProfile(@Req() req) {
    return this.doctorsService.getMyProfile(req.user.userId);
  }

  // Services
  @Post('me/services')
  addService(@Req() req, @Body() dto) {
    return this.doctorsService.addService(req.user.userId, dto.name);
  }

  @Delete('me/services/:id')
  removeService(@Req() req, @Param('id') id: string) {
    return this.doctorsService.deleteService(req.user.userId, id);
  }

  // Documents
  @Roles(Role.DOCTOR)
  @Post('me/documents')
  @UseInterceptors(
    GlobalPublicUploadInterceptor({
      fieldName: [
        'mdcnPracticingLicenseDocument',
        'governmentIdDocument',
        'medicalDegreeDocument',
        'specialtyCertificateDocument',
      ],
      maxCount: 1,
      allowedMimes: /\/(pdf|jpg|jpeg|png)$/i,
      maxFileSizeBytes: 20 * 1024 * 1024, // 20MB
    }),
  )
  async uploadDocument(
    @Req() req,
    @UploadedFiles()
    files: Record<string, Express.Multer.File[]>,
  ) {
    if (!files || Object.values(files).every((fieldFiles) => !fieldFiles?.length)) {
      throw new BadRequestException('Upload at least one verification document');
    }
    return this.doctorsService.uploadVerificationDocuments(
      req.user.userId,
      files,
    );
  }

  @Get('me/experiences')
  async listExperiences(@Req() req) {
    try {
      const doctor = await this.doctorsService.getMyProfile(req.user.userId);
      if (!doctor) throw new Error('Doctor profile not found');
      const data = await this.doctorsService.listExperiences(
        doctor._id.toString(),
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Experience history fetched successfully',
        data,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch experience history',
        data: null,
      };
    }
  }

  @Post('me/experiences')
  async addExperience(@Req() req, @Body() dto: AddExperienceDto) {
    try {
      const result = await this.doctorsService.addExperience(
        req.user.userId,
        dto,
      );
      return {
        success: true,
        statusCode: 201,
        message: 'Work experience added successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to add work experience',
        data: null,
      };
    }
  }

  @Patch('me/experiences/:id')
  async updateExperience(
    @Req() req,
    @Param('id') id: string,
    @Body() dto: UpdateExperienceDto,
  ) {
    try {
      const result = await this.doctorsService.updateExperience(
        req.user.userId,
        id,
        dto,
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Work experience updated successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to update work experience',
        data: null,
      };
    }
  }

  @Delete('me/experiences/:id')
  async deleteExperience(@Req() req, @Param('id') id: string) {
    try {
      await this.doctorsService.deleteExperience(req.user.userId, id);
      return {
        success: true,
        statusCode: 200,
        message: 'Work experience deleted successfully',
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to delete work experience',
      };
    }
  }

  @Roles(Role.DOCTOR)
  @Post('me/bank-details')
  async addBankDetails(@Req() req, @Body() dto: AddBankDetailsDto) {
    try {
      const result = await this.doctorsService.addBankDetails(
        req.user.userId,
        dto,
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Bank details added successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to add bank details',
        data: null,
      };
    }
  }

  @Roles(Role.DOCTOR)
  @Get('me/bank-details')
  async getBankDetails(@Req() req) {
    try {
      const result = await this.doctorsService.getBankDetails(req.user.userId);
      return {
        success: true,
        statusCode: 200,
        message: 'Bank details fetched successfully',
        data: result,
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

  // Admin endpoints
  @Roles(Role.ADMIN)
  @Get('admin/new-doctors')
  async getNewDoctors(@Req() req, @Query() query) {
    try {
      const { data, ...meta } = await this.doctorsService.getAllDoctorsForAdmin(
        req.user.userId,
        {
          ...query,
          status: 'PENDING',
        },
      );
      return {
        success: true,
        statusCode: 200,
        message: 'New doctors fetched successfully',
        data,
        meta,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch new doctors',
        data: null,
      };
    }
  }

  @Roles(Role.ADMIN)
  @Get('admin/all')
  async getAllDoctors(@Req() req, @Query() query) {
    try {
      const { data, ...meta } = await this.doctorsService.getAllDoctorsForAdmin(
        req.user.userId,
        query,
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Doctors fetched successfully',
        data,
        meta,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch doctors',
        data: null,
      };
    }
  }

  @Roles(Role.ADMIN)
  @Get('admin/:id')
  async getDoctorForAdmin(@Req() req, @Param('id') id: string) {
    try {
      const doctor = await this.doctorsService.getDoctorByIdForAdmin(
        id,
        req.user.userId,
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Doctor details fetched successfully',
        data: doctor,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch doctor details',
        data: null,
      };
    }
  }

  @Roles(Role.ADMIN)
  @Patch(':id/status')
  updateVerificationStatus(
    @Param('id') id: string,
    @Body() dto: UpdateVerificationStatusDto,
  ) {
    return this.doctorsService.updateVerificationStatus(
      id,
      dto.status,
      dto.note,
    );
  }

  @Public()
  @Get('popular')
  async getPopularDoctors(@Query() query: SearchDoctorDto) {
    try {
      const { data, ...meta } =
        await this.doctorsService.getPopularDoctors(query);
      return {
        success: true,
        statusCode: 200,
        message: 'Popular doctors fetched successfully',
        data,
        meta,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch popular doctors',
        data: null,
      };
    }
  }

  @Public()
  @Get('specialty/:specialtyId')
  async getDoctorsBySpecialty(
    @Param('specialtyId') specialtyId: string,
    @Query() query: SearchDoctorDto,
  ) {
    try {
      const { data, ...meta } = await this.doctorsService.getDoctorsBySpecialty(
        specialtyId,
        query,
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Doctors fetched successfully',
        data,
        meta,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch doctors',
        data: null,
      };
    }
  }

  @Public()
  @Get(':id/public')
  getPublicDoctorProfile(@Param('id') id: string) {
    return this.doctorsService.getPublicProfile(id);
  }

  @Public()
  @Get('search')
  async searchDoctors(@Query() query: SearchDoctorDto) {
    try {
      const result = await this.doctorsService.searchDoctors(query);
      return {
        success: true,
        statusCode: 200,
        message: 'Search results fetched successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to search doctors',
        data: null,
      };
    }
  }
}
