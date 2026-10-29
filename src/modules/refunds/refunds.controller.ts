import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Req,
  Query,
  ForbiddenException,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { RefundsService } from './refunds.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RefundFiltersDto } from './dto/refund-filters.dto';
import { Role } from 'src/common/enum/role.enum';
import { AppointmentFinderService } from '../appointments/services/appointment-finder.service';

@Controller('refunds')
@UseGuards(JwtAuthGuard)
export class RefundsController {
  constructor(
    private readonly refundsService: RefundsService,
    @Inject(forwardRef(() => AppointmentFinderService))
    private readonly appointmentFinderService: AppointmentFinderService,
  ) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async getAllRefunds(@Query() filters: RefundFiltersDto) {
    const { data, total, page, limit } =
      await this.refundsService.getRefunds(filters);
    return {
      success: true,
      statusCode: 200,
      message: 'Refunds fetched successfully',
      data,
      meta: {
        total,
        page,
        limit,
      },
    };
  }

  @Get('me')
  async getMyRefunds(@Req() req, @Query() filters: RefundFiltersDto) {
    const userId = req.user.userId;
    const { data, total, page, limit } = await this.refundsService.getRefunds({
      ...filters,
      userId,
    });
    return {
      success: true,
      statusCode: 200,
      message: 'My refunds fetched successfully',
      data,
      meta: {
        total,
        page,
        limit,
      },
    };
  }

  @Post('appointment/:appointmentId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async initiateManualRefund(
    @Param('appointmentId') appointmentId: string,
    @Req() req,
  ) {
    const appointment =
      await this.appointmentFinderService.findById(appointmentId);
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    const adminId = req.user.userId;
    const result = await this.refundsService.processFullRefund(
      appointmentId,
      appointment,
      adminId,
    );

    if (!result) {
      return {
        success: false,
        statusCode: 400,
        message: 'Refund could not be processed (e.g. no payment found)',
      };
    }

    return {
      success: true,
      statusCode: 200,
      message: 'Refund initiated successfully',
      data: result,
    };
  }

  @Get(':id')
  async getRefundById(@Param('id') id: string, @Req() req) {
    const refund = await this.refundsService.getRefundById(id);
    const user = req.user;

    // Authorization check
    if (
      user.role !== 'ADMIN' &&
      refund.userId.toString() !== user.userId &&
      refund.doctorId.toString() !== user.userId
    ) {
      throw new ForbiddenException(
        'You do not have permission to view this refund',
      );
    }

    return refund;
  }
}
