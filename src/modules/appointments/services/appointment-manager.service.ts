import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { AppointmentStatus } from 'src/common/enum/appointment-status.enum';
import { EncryptionService } from 'src/common/services/encryption.service';
import {
  combineDateAndTime,
  getBusinessDayOfWeek,
  getBusinessNow,
} from 'src/common/utils/business-time.util';
import { AgoraService } from '../../agora/agora.service';
import { AvailabilityService } from '../../availability/availability.service';
import { Doctor, DoctorDocument } from '../../doctors/schemas/doctor.schema';
import { NotificationsService } from '../../notifications/notifications.service';
import { RefundsService } from '../../refunds/refunds.service';
import { AddAppointmentAttachmentDto } from '../dto/add-appointment-attachment.dto';
import { CreateAppointmentDto } from '../dto/create-appointment.dto';
import { RejectAppointmentDto } from '../dto/reject-appointment.dto';
import {
  Appointment,
  AppointmentDocument,
} from '../schemas/appointment.schema';
import {
  AppointmentAttachment,
  AttachmentDocument,
} from '../schemas/attachment.schema';
import { AppointmentValidatorService } from './appointment-validator.service';

@Injectable()
export class AppointmentManagerService {
  private readonly logger = new Logger(AppointmentManagerService.name);

  constructor(
    @InjectModel(Appointment.name)
    private appointmentModel: Model<AppointmentDocument>,
    @InjectModel(AppointmentAttachment.name)
    private attachmentModel: Model<AttachmentDocument>,
    @InjectModel(Doctor.name)
    private doctorModel: Model<DoctorDocument>,
    private readonly validatorService: AppointmentValidatorService,
    private readonly availabilityService: AvailabilityService,
    private readonly notificationsService: NotificationsService,
    private readonly encryptionService: EncryptionService,
    private readonly agoraService: AgoraService,
    private readonly refundsService: RefundsService,
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  generateAgoraToken(channelName: string, uid: string | number) {
    return this.agoraService.generateToken(channelName, uid);
  }

  generateAgoraChatToken(userUuid: string) {
    return this.agoraService.generateChatToken(userUuid);
  }

  // ---------------- Create Appointment ----------------
  async create(userId: string, dto: CreateAppointmentDto) {
    // 1. Parallelize initial reads outside transaction
    const userModel = this.connection.model('User');
    const [doctor, patientUser, availabilities] = await Promise.all([
      this.doctorModel
        .findById(dto.doctorId)
        .select('_id specialtyId isVerified verificationStatus')
        .populate('userId', 'timezone')
        .lean(),
      userModel.findById(userId).select('timezone').lean(),
      this.availabilityService.getByDoctor(new Types.ObjectId(dto.doctorId)),
    ]);

    if (!doctor) {
      throw new NotFoundException(
        'Doctor not found. Please provide a valid doctor profile ID, not user ID.',
      );
    }
    if (!doctor.isVerified || doctor.verificationStatus !== 'VERIFIED') {
      throw new BadRequestException(
        'This doctor is not approved to accept appointments',
      );
    }

    // Determine slot size for the appointment date from doctor's availability
    const days = [
      'SUNDAY',
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
    ];
    const apptDate = new Date(dto.appointmentDate);
    const dayName = days[getBusinessDayOfWeek(apptDate)];

    const timeToMinutes = (time: string): number => {
      const [h, m] = time.split(':').map(Number);
      return h * 60 + m;
    };
    const apptTimeMinutes = timeToMinutes(dto.appointmentTime);

    const selectedAvailability = availabilities.find(
      (a) =>
        a.dayOfWeek === dayName &&
        a.isActive &&
        apptTimeMinutes >= timeToMinutes(a.startTime) &&
        apptTimeMinutes < timeToMinutes(a.endTime),
    );

    const slotMinutes = selectedAvailability?.slotSizeMinutes ?? 30;

    const endTime = this.calculateEndTime(dto.appointmentTime, slotMinutes);

    const doctorTz = (doctor?.userId as any)?.timezone || 'Africa/Lagos';
    const patientTz = (patientUser as any)?.timezone || 'Africa/Lagos';
    const startTimeUtc = combineDateAndTime(
      dto.appointmentDate,
      dto.appointmentTime,
      doctorTz,
    );
    const endTimeUtc = combineDateAndTime(
      dto.appointmentDate,
      endTime,
      doctorTz,
    );

    // 2. Validate general availability outside transaction
    const dayAvailability =
      await this.validatorService.validateGeneralAvailability(
        dto.doctorId,
        new Date(dto.appointmentDate),
        dto.appointmentTime,
        endTime,
        availabilities,
      );

    // 3. Start transaction only for overlap check and creation
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      // 4. Check for overlapping appointments (inside transaction)
      await this.validatorService.checkOverlap(
        dto.doctorId,
        new Date(dto.appointmentDate),
        dto.appointmentTime,
        endTime,
        session,
      );

      const appointment = await this.appointmentModel.create(
        [
          {
            userId: new Types.ObjectId(userId),
            doctorId: new Types.ObjectId(dto.doctorId),
            specialistId: doctor.specialtyId,
            appointmentDate: new Date(dto.appointmentDate),
            appointmentTime: dto.appointmentTime,
            appointmentEndTime: endTime,
            startTimeUtc,
            endTimeUtc,
            patientTimezone: patientTz,
            doctorTimezone: doctorTz,
            reasonTitle: this.encryptionService.encrypt(dto.reasonTitle),
            reasonDetails: this.encryptionService.encrypt(dto.reasonDetails),
            consultationFee: dayAvailability.fee,
          },
        ],
        { session },
      );

      const newAppointment = appointment[0] as any;

      // If attachments were provided, update them to point to this appointment
      if (dto.attachmentIds?.length) {
        await this.attachmentModel.updateMany(
          {
            _id: { $in: dto.attachmentIds.map((id) => new Types.ObjectId(id)) },
          },
          { appointmentId: newAppointment._id },
          { session },
        );
      }

      await session.commitTransaction();

      return appointment[0];
    } catch (e) {
      await session.abortTransaction();
      if (
        typeof e === 'object' &&
        e !== null &&
        'code' in e &&
        (e as any).code === 11000
      ) {
        throw new BadRequestException('This time slot is already booked');
      }
      throw e;
    } finally {
      session.endSession();
    }
  }

  // ---------------- Approval Actions ----------------
  async rejectAppointment(
    appointmentId: string,
    userId: string,
    dto?: RejectAppointmentDto,
  ) {
    const appointment = await this.appointmentModel.findById(appointmentId);
    if (!appointment) throw new NotFoundException('Appointment not found');

    // Look up doctor profile from userId
    const doctor = await this.doctorModel.findOne({ userId }).lean();
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    // Verify doctor owns this appointment
    if (appointment.doctorId.toString() !== doctor._id.toString()) {
      throw new ForbiddenException(
        'You can only reject appointments assigned to you',
      );
    }

    // Check if already in terminal state
    if (
      [
        AppointmentStatus.COMPLETED,
        AppointmentStatus.CANCELLED,
        AppointmentStatus.EXPIRED,
      ].includes(appointment.status)
    ) {
      throw new BadRequestException(
        `Cannot reject appointment that is already ${appointment.status}`,
      );
    }

    appointment.status = AppointmentStatus.CANCELLED;
    const updatedAppointment = await appointment.save();

    const { refundStarted, refundFailed } = await this.refundCancellation(
      appointment,
      userId,
      'full',
    );

    this.notificationsService.emit('appointment.rejected', {
      appointmentId: appointment._id,
      userId: appointment.userId,
      doctorId: appointment.doctorId,
      appointmentDate: appointment.appointmentDate,
      appointmentTime: appointment.appointmentTime,
      reason: dto?.reason,
      hadPayment: !!appointment.paymentId,
      refundStarted,
      refundFailed,
    });

    return updatedAppointment;
  }

  // ---------------- Status Updates ----------------
  async updateStatus(
    appointmentId: string,
    requesterId: string,
    role: string,
    status: AppointmentStatus,
    doctorId?: string,
  ) {
    const appointment = await this.appointmentModel.findById(appointmentId);
    if (!appointment) throw new NotFoundException();

    if (role === 'USER') {
      if (appointment.userId.toString() !== requesterId) {
        throw new ForbiddenException();
      }
    } else if (role === 'DOCTOR') {
      if (doctorId) {
        if (appointment.doctorId.toString() !== doctorId) {
          throw new ForbiddenException();
        }
      } else {
        // For doctors, requesterId is userId, need to lookup doctor profile
        const doctor = await this.doctorModel
          .findOne({ userId: requesterId })
          .lean();
        if (
          !doctor ||
          appointment.doctorId.toString() !== doctor._id.toString()
        ) {
          throw new ForbiddenException();
        }
      }
    } else {
      throw new ForbiddenException();
    }

    // Prevent updating if already in a terminal state
    if (
      [
        AppointmentStatus.COMPLETED,
        AppointmentStatus.CANCELLED,
        AppointmentStatus.EXPIRED,
      ].includes(appointment.status)
    ) {
      throw new BadRequestException(
        `Appointment is already ${appointment.status} and cannot be updated.`,
      );
    }

    const oldStatus = appointment.status;
    appointment.status = status;
    const updatedAppointment = await appointment.save();

    let refundStarted = false;
    let refundFailed = false;
    let refundAmount: number | undefined;
    if (status === AppointmentStatus.CANCELLED) {
      const refund = await this.refundCancellation(
        appointment,
        requesterId,
        role === 'USER' ? 'partial' : 'full',
      );
      refundStarted = refund.refundStarted;
      refundFailed = refund.refundFailed;
      refundAmount = refund.refundAmount;
    }

    if (
      oldStatus === AppointmentStatus.PENDING &&
      status === AppointmentStatus.UPCOMING
    ) {
      this.notificationsService.emit('appointment.accepted', {
        appointmentId: appointment._id,
        userId: appointment.userId,
        doctorId: appointment.doctorId,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
      });
    } else {
      this.notificationsService.emit('appointment.status_change', {
        appointmentId: appointment._id,
        status,
        oldStatus,
        userId: appointment.userId,
        doctorId: appointment.doctorId,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        cancelledBy: role === 'USER' ? 'PATIENT' : 'DOCTOR',
        hadPayment: !!appointment.paymentId,
        refundStarted,
        refundFailed,
        refundAmount,
      });
    }

    return updatedAppointment;
  }

  async cancelUpcomingForDoctor(doctorId: string) {
    try {
      const doctor = await this.doctorModel
        .findById(doctorId)
        .select('userId')
        .lean();
      const initiatedBy = doctor?.userId?.toString() || doctorId;
      const { dateOnly: today } = getBusinessNow();
      const appointments = await this.appointmentModel.find({
        doctorId: new Types.ObjectId(doctorId),
        appointmentDate: { $gte: today },
        status: {
          $nin: [
            AppointmentStatus.COMPLETED,
            AppointmentStatus.CANCELLED,
            AppointmentStatus.EXPIRED,
          ],
        },
      });

      for (const appointment of appointments) {
        const oldStatus = appointment.status;
        appointment.status = AppointmentStatus.CANCELLED;
        await appointment.save();
        const { refundStarted } = await this.refundCancellation(
          appointment,
          initiatedBy,
          'full',
        );
        this.notificationsService.emit('appointment.status_change', {
          appointmentId: appointment._id,
          status: AppointmentStatus.CANCELLED,
          oldStatus,
          userId: appointment.userId,
          doctorId: appointment.doctorId,
          appointmentDate: appointment.appointmentDate,
          appointmentTime: appointment.appointmentTime,
          cancelledBy: 'DOCTOR_UNAVAILABLE',
          hadPayment: !!appointment.paymentId,
          refundStarted,
          notifyDoctor: false,
        });
      }

      if (appointments.length > 0 && doctor?.userId) {
        this.notificationsService.emit('appointment.schedule_cleared', {
          doctorUserId: doctor.userId,
          count: appointments.length,
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to cancel upcoming appointments for doctor ${doctorId}`,
        error,
      );
    }
  }

  private async refundCancellation(
    appointment: AppointmentDocument,
    initiatedBy: string,
    kind: 'full' | 'partial',
  ) {
    if (!appointment.paymentId) {
      return { refundStarted: false, refundFailed: false };
    }

    try {
      const refund =
        kind === 'partial'
          ? await this.refundsService.processPartialRefund(
              appointment._id.toString(),
              appointment,
              initiatedBy,
            )
          : await this.refundsService.processFullRefund(
              appointment._id.toString(),
              appointment,
              initiatedBy,
            );
      return {
        refundStarted: !!refund,
        refundFailed: false,
        refundAmount: refund?.amount,
      };
    } catch (error) {
      this.logger.error(
        `Refund failed for cancelled appointment ${appointment._id}`,
        error,
      );
      return { refundStarted: false, refundFailed: true };
    }
  }

  // ---------------- Attachments ----------------
  async createAttachmentInfo(userId: string, dto: AddAppointmentAttachmentDto) {
    return this.attachmentModel.create({
      fileKey: dto.fileKey,
      fileType: dto.fileType,
      uploadedBy: new Types.ObjectId(userId),
    });
  }

  async addAttachment(
    appointmentId: string,
    requesterId: string,
    role: string,
    dto: AddAppointmentAttachmentDto,
    doctorId?: string,
  ) {
    const appointment = await this.appointmentModel.findById(appointmentId);
    if (!appointment) throw new NotFoundException();

    const isPatient = appointment.userId.toString() === requesterId;

    let isDoctor = false;
    if (doctorId) {
      isDoctor = appointment.doctorId.toString() === doctorId;
    } else {
      // For doctors, requesterId is userId, need to lookup doctor profile
      const doctor = await this.doctorModel
        .findOne({ userId: requesterId })
        .lean();
      isDoctor = !!(
        doctor && appointment.doctorId.toString() === doctor._id.toString()
      );
    }

    if (!isPatient && !isDoctor) {
      throw new ForbiddenException();
    }

    return this.attachmentModel.create({
      appointmentId: new Types.ObjectId(appointmentId),
      fileKey: dto.fileKey,
      fileType: dto.fileType,
      uploadedBy: new Types.ObjectId(requesterId),
    });
  }

  async markAsPaid(appointmentId: string, paymentId: string) {
    const appointment = await this.appointmentModel.findByIdAndUpdate(
      appointmentId,
      {
        paymentId: new Types.ObjectId(paymentId),
        status: AppointmentStatus.UPCOMING,
      },
      { new: true },
    );

    if (appointment) {
      this.notificationsService.emit('appointment.created', appointment);
    }

    return appointment;
  }

  /**
   * Apply a verified Paystack charge to an existing appointment.
   * A pending booking becomes upcoming. An expired booking is restored when
   * its slot is still free and the visit has not started; otherwise the
   * charge is refunded and the appointment stays expired.
   */
  async settleSuccessfulPayment(
    appointmentId: string,
    paymentId: string,
    payerUserId?: string,
    doctorId?: string,
  ) {
    const appointment = await this.appointmentModel.findById(appointmentId);
    if (!appointment) {
      await this.refundsService.refundOrphanedAppointmentPayment({
        paymentId,
        appointmentId,
        userId: payerUserId,
        doctorId,
      });
      return { outcome: 'refunded' as const };
    }

    if (!appointment.paymentId) {
      appointment.paymentId = new Types.ObjectId(paymentId);
      await appointment.save();
    }

    if (
      [
        AppointmentStatus.UPCOMING,
        AppointmentStatus.ONGOING,
        AppointmentStatus.COMPLETED,
      ].includes(appointment.status)
    ) {
      return { outcome: 'already_active' as const, appointment };
    }

    if (appointment.status === AppointmentStatus.PENDING) {
      const updated = await this.markAsPaid(appointmentId, paymentId);
      return { outcome: 'confirmed' as const, appointment: updated };
    }

    if (appointment.status !== AppointmentStatus.EXPIRED) {
      await this.refundExpiredBooking(appointment, payerUserId);
      return { outcome: 'refunded' as const, appointment };
    }

    const timezone = appointment.doctorTimezone || 'Africa/Lagos';
    const start = appointment.startTimeUtc
      ? new Date(appointment.startTimeUtc)
      : combineDateAndTime(
          appointment.appointmentDate,
          appointment.appointmentTime,
          timezone,
        );

    if (start.getTime() <= Date.now()) {
      await this.refundExpiredBooking(appointment, payerUserId);
      return { outcome: 'refunded' as const, appointment };
    }

    const session = await this.connection.startSession();
    let transactionOpen = false;
    try {
      session.startTransaction();
      transactionOpen = true;

      const conflict = await this.validatorService.findSlotConflict(
        appointment.doctorId.toString(),
        appointment.appointmentDate,
        appointment.appointmentTime,
        appointment.appointmentEndTime,
        session,
        appointment._id.toString(),
      );

      if (conflict) {
        await session.abortTransaction();
        transactionOpen = false;
        await this.refundExpiredBooking(appointment, payerUserId);
        return { outcome: 'refunded' as const, appointment };
      }

      const restored = await this.appointmentModel.findOneAndUpdate(
        { _id: appointment._id, status: AppointmentStatus.EXPIRED },
        {
          $set: {
            status: AppointmentStatus.UPCOMING,
            paymentId: new Types.ObjectId(paymentId),
          },
        },
        { new: true, session },
      );

      if (!restored) {
        await session.abortTransaction();
        transactionOpen = false;
        await this.refundExpiredBooking(appointment, payerUserId);
        return { outcome: 'refunded' as const, appointment };
      }

      await session.commitTransaction();
      transactionOpen = false;
      this.notificationsService.emit('appointment.payment_confirmed', restored);
      return { outcome: 'restored' as const, appointment: restored };
    } catch (error) {
      if (transactionOpen) {
        await session.abortTransaction();
      }
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: number }).code === 11000
      ) {
        await this.refundExpiredBooking(appointment, payerUserId);
        return { outcome: 'refunded' as const, appointment };
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  private async refundExpiredBooking(
    appointment: AppointmentDocument,
    payerUserId?: string,
  ) {
    const initiatedBy = payerUserId || appointment.userId.toString();
    try {
      await this.refundsService.processExpiredBookingRefund(
        appointment._id.toString(),
        appointment,
        initiatedBy,
      );
    } catch (error) {
      this.logger.error(
        `Refund failed for expired appointment ${appointment._id}`,
        error,
      );
    }
  }

  // ---------------- Helpers ----------------
  private calculateEndTime(startTime: string, slotMinutes: number): string {
    const [h, m] = startTime.split(':').map(Number);
    const total = h * 60 + m + slotMinutes;
    const endH = Math.floor(total / 60)
      .toString()
      .padStart(2, '0');
    const endM = (total % 60).toString().padStart(2, '0');
    return `${endH}:${endM}`;
  }
}
