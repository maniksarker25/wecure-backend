import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { AppointmentStatus } from 'src/common/enum/appointment-status.enum';
import { Role } from 'src/common/enum/role.enum';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppointmentAccessGuard } from '../../common/guards/appointment-access.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PaymentsService } from '../payments/payments.service';
import { PaystackService } from '../payments/paystack.service';
import { PrivateUploadService } from '../uploads/private-upload.service';
import { AddAppointmentAttachmentDto } from './dto/add-appointment-attachment.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { RejectAppointmentDto } from './dto/reject-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';
import { AppointmentFinderService } from './services/appointment-finder.service';
import { AppointmentManagerService } from './services/appointment-manager.service';
import { AppointmentValidatorService } from './services/appointment-validator.service';

@Controller('appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppointmentsController {
  private readonly logger = new Logger(AppointmentsController.name);
  constructor(
    private readonly managerService: AppointmentManagerService,
    private readonly finderService: AppointmentFinderService,
    private readonly validatorService: AppointmentValidatorService,
    private readonly privateUploadService: PrivateUploadService,
    private readonly paystackService: PaystackService,
    private readonly paymentsService: PaymentsService,
  ) {}

  // Patient
  @Roles(Role.USER)
  @Post()
  @UseInterceptors(FilesInterceptor('attachment'))
  async create(
    @Req() req,
    @Body() dto: CreateAppointmentDto,
    @UploadedFiles() attachments?: Express.Multer.File[],
    @Query('payNow') payNow?: string,
  ) {
    if (attachments?.length) {
      if (!dto.attachmentIds) {
        dto.attachmentIds = [];
      }
      // Ensure attachmentIds is treated as an array even if single value sent by form-data
      if (typeof dto.attachmentIds === 'string') {
        dto.attachmentIds = [dto.attachmentIds];
      }

      for (const attachment of attachments) {
        const fileKey = await this.privateUploadService.handleUpload(
          attachment,
          'appointments',
          req.user.userId,
        );

        // Create attachment record
        const attachmentInfo = await this.managerService.createAttachmentInfo(
          req.user.userId,
          {
            fileKey,
            fileType: attachment.mimetype,
          },
        );

        dto.attachmentIds.push(attachmentInfo._id.toString());
      }
    }

    const data = await this.managerService.create(req.user.userId, dto);

    // If payNow is set (e.g., ?payNow=true), initialize payment and return authorization URL
    if (payNow && payNow.toString().toLowerCase() === 'true') {
      // Build metadata for paystack
      const metadata = {
        type: 'APPOINTMENT',
        appointmentId: (data as any)._id.toString(),
        userId: req.user.userId,
        doctorId: dto.doctorId || (data as any).doctorId?.toString(),
      };

      console.log('Initializing payment with metadata:', metadata, data);
      try {
        const paymentData = await this.paystackService.initializeTransaction(
          req.user.email,
          (data as any).consultationFee,
          metadata,
        );

        // Create pending payment record
        await this.paymentsService.create({
          appointmentId: (data as any)._id.toString(),
          userId: req.user.userId,
          paystackReference: paymentData.reference,
          amount: (data as any).consultationFee,
          currency: 'NGN',
          status: 'PENDING',
        } as any);

        return {
          success: true,
          statusCode: 201,
          message: 'Appointment created and payment initialized',
          data,
          payment: {
            authorization_url: paymentData.authorization_url,
            reference: paymentData.reference,
          },
        };
      } catch (err: any) {
        // Payment initialization failed — return error and let client decide next step.
        this.logger.error(
          `Payment initialization failed for appointment ${(data as any)?._id}: ${err?.message || err}`,
        );
        throw new BadRequestException('Payment initialization failed');
      }
    }

    return {
      success: true,
      statusCode: 201,
      message: 'Appointment created successfully',
      data,
    };
  }

  @Roles(Role.USER)
  @Get('me')
  async getMine(@Req() req, @Query() query) {
    const { data, ...meta } = await this.finderService.getForUser(
      req.user.userId,
      query,
    );
    return {
      success: true,
      statusCode: 200,
      message: 'Patient appointments fetched successfully',
      data,
      meta,
    };
  }

  @Roles(Role.USER)
  @Get('me/:id')
  async getAppointmentDetails(@Req() req, @Param('id') id: string) {
    const data = await this.finderService.getAppointmentDetails(
      id,
      req.user.userId,
    );
    return {
      success: true,
      statusCode: 200,
      message: 'Appointment details fetched successfully',
      data,
    };
  }

  @Roles(Role.USER)
  @Patch('me/:id/cancel')
  async cancelAppointment(@Req() req, @Param('id') id: string) {
    await this.managerService.updateStatus(
      id,
      req.user.userId,
      Role.USER,
      AppointmentStatus.CANCELLED,
    );
    return {
      success: true,
      statusCode: 200,
      message: 'Appointment cancelled successfully',
    };
  }

  @Roles(Role.USER)
  @Get('available-dates')
  async getAvailableDates(
    @Query('doctorId') doctorId: string,
    @Query('days') days?: number,
  ) {
    const data = await this.validatorService.getAvailableDates(doctorId, days);
    return {
      success: true,
      statusCode: 200,
      message: 'Available dates fetched successfully',
      data,
    };
  }

  @Roles(Role.USER)
  @Get('available-slots')
  async getAvailableSlots(
    @Query('doctorId') doctorId: string,
    @Query('date') date: string,
  ) {
    const data = await this.validatorService.getAvailableSlots(
      doctorId,
      new Date(date),
    );
    return {
      success: true,
      statusCode: 200,
      message: 'Available slots fetched successfully',
      data,
    };
  }

  // Admin
  @Roles(Role.ADMIN)
  @Get('admin/all')
  async getAllForAdmin(@Query() query) {
    const { data, ...meta } = await this.finderService.getAll(query);
    return {
      success: true,
      statusCode: 200,
      message: 'All appointments fetched successfully',
      data,
      meta,
    };
  }

  @Roles(Role.ADMIN)
  @Get('admin/details/:id')
  async getDetailsForAdmin(@Param('id') id: string) {
    const data = await this.finderService.getDetailsForAdmin(id);
    return {
      success: true,
      statusCode: 200,
      message: 'Appointment details fetched successfully',
      data,
    };
  }

  @Roles(Role.ADMIN)
  @Get('admin/doctor/:doctorId')
  async getDoctorAppointmentsForAdmin(
    @Req() req,
    @Param('doctorId') doctorId: string,
    @Query() query,
  ) {
    const { data, ...meta } = await this.finderService.getForDoctor(
      req.user.userId,
      doctorId,
      query,
    );
    return {
      success: true,
      statusCode: 200,
      message: 'Doctor appointments fetched successfully',
      data,
      meta,
    };
  }

  // Doctor
  @Roles(Role.DOCTOR)
  @Get('doctor/dashboard')
  async getDashboardStats(@Req() req) {
    const data = await this.finderService.getDashboardStats(req.user.userId);
    return {
      success: true,
      statusCode: 200,
      message: 'Dashboard stats fetched successfully',
      data,
    };
  }

  @Roles(Role.DOCTOR)
  @Get('doctor/me')
  async getDoctorAppointmentsSimple(@Req() req, @Query() query) {
    const { data, ...meta } = await this.finderService.getForDoctorSimple(
      req.user.userId,
      query,
    );
    return {
      success: true,
      statusCode: 200,
      message: 'Doctor appointments fetched successfully',
      data,
      meta,
    };
  }

  @Roles(Role.DOCTOR)
  @Get('doctor')
  async getDoctorAppointments(@Req() req, @Query() query) {
    const { data, ...meta } = await this.finderService.getForDoctor(
      req.user.userId,
      req.user.doctorId,
      query,
    );
    return {
      success: true,
      statusCode: 200,
      message: 'Appointments fetched successfully',
      data,
      meta,
    };
  }

  @Roles(Role.DOCTOR)
  @Get('doctor/:id')
  async getAppointmentDetailsForDoctor(@Req() req, @Param('id') id: string) {
    const data = await this.finderService.getAppointmentDetailsForDoctor(
      id,
      req.user.userId,
      req.user.doctorId,
    );
    return {
      success: true,
      statusCode: 200,
      message: 'Appointment details fetched successfully',
      data,
    };
  }

  @Roles(Role.DOCTOR)
  @Post('doctor/:id/reject')
  async rejectAppointment(
    @Req() req,
    @Param('id') id: string,
    @Body() dto: RejectAppointmentDto,
  ) {
    const data = await this.managerService.rejectAppointment(
      id,
      req.user.userId,
      dto,
    );
    return {
      success: true,
      statusCode: 200,
      message: 'Appointment rejected successfully',
      data,
    };
  }

  // Status update (doctor or patient)
  @Patch(':id/status')
  async updateStatus(
    @Req() req,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentStatusDto,
  ) {
    // For doctors, we use doctorId for permission check in service
    const requesterId =
      req.user.role === Role.DOCTOR ? req.user.userId : req.user.userId;

    const data = await this.managerService.updateStatus(
      id,
      requesterId,
      req.user.role,
      dto.status,
      req.user.doctorId,
    );

    return {
      success: true,
      statusCode: 200,
      message: 'Appointment status updated successfully',
      data,
    };
  }

  // Attachments
  @Post('attachments')
  @Roles(Role.USER, Role.DOCTOR)
  @UseInterceptors(FileInterceptor('attachment'))
  async createAttachmentInfo(
    @Req() req,
    @Body() dto: AddAppointmentAttachmentDto,
    @UploadedFile() attachment?: Express.Multer.File,
  ) {
    if (attachment) {
      const fileKey = await this.privateUploadService.handleUpload(
        attachment,
        'appointments',
      );
      dto.fileKey = fileKey;
      dto.fileType = attachment.mimetype;
    }
    const data = await this.managerService.createAttachmentInfo(
      req.user.userId,
      dto,
    );
    return {
      success: true,
      statusCode: 201,
      message: 'Attachment info created successfully',
      data,
    };
  }

  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('attachment'))
  async addAttachment(
    @Req() req,
    @Param('id') id: string,
    @Body() dto: AddAppointmentAttachmentDto,
    @UploadedFile() attachment?: Express.Multer.File,
  ) {
    const requesterId =
      req.user.role === Role.DOCTOR ? req.user.userId : req.user.userId;

    if (attachment) {
      const fileKey = await this.privateUploadService.handleUpload(
        attachment,
        'appointments',
        req.user.userId,
      );
      dto.fileKey = fileKey;
      dto.fileType = attachment.mimetype;
    }

    const data = await this.managerService.addAttachment(
      id,
      requesterId,
      req.user.role,
      dto,
      req.user.doctorId,
    );

    return {
      success: true,
      statusCode: 201,
      message: 'Attachment added successfully',
      data,
    };
  }

  // Agora Video Token
  @UseGuards(AppointmentAccessGuard)
  @Get(':id/video/token')
  async getVideoToken(@Param('id') id: string) {
    const uid = 0;
    const channelName = `appointment_${id}`;
    const data = await this.managerService.generateAgoraToken(channelName, uid);
    return {
      success: true,
      statusCode: 200,
      message: 'Video token generated successfully',
      data,
    };
  }

  // Agora Chat Token
  @UseGuards(AppointmentAccessGuard)
  @Get(':id/chat/token')
  async getChatToken(@Req() req) {
    const user = req.user;
    const data = await this.managerService.generateAgoraChatToken(user.userId);
    return {
      success: true,
      statusCode: 200,
      message: 'Chat token generated successfully',
      data,
    };
  }
}
