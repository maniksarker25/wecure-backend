import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { AppointmentStatus } from 'src/common/enum/appointment-status.enum';
import { combineDateAndTime } from 'src/common/utils/business-time.util';
import { NotificationsService } from 'src/modules/notifications/notifications.service';
import { Payment, PaymentDocument } from '../payments/schemas/payment.schema';
import { Appointment, AppointmentDocument } from './schemas/appointment.schema';

@Injectable()
export class AppointmentSchedulerService {
  private readonly logger = new Logger(AppointmentSchedulerService.name);

  private readonly unpaidHoldMs = 4 * 60 * 1000;
  private readonly checkoutHoldMs = 24 * 60 * 60 * 1000;

  constructor(
    @InjectModel(Appointment.name)
    private appointmentModel: Model<AppointmentDocument>,
    @InjectModel(Payment.name)
    private paymentModel: Model<PaymentDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleAppointmentTransitions() {
    this.logger.verbose('Running appointment status transition job...');

    const now = new Date();
    await this.releaseAbandonedPendingAppointments(now);

    // Transition candidates: exact start/end instants are resolved per-document below
    // using the absolute UTC fields if set, otherwise falling back to doctor's timezone.
    const candidates = await this.appointmentModel
      .find({
        status: {
          $in: [AppointmentStatus.UPCOMING, AppointmentStatus.ONGOING],
        },
      })
      .populate({
        path: 'doctorId',
        populate: { path: 'userId', select: 'timezone' },
      })
      .lean();

    const toOngoing: any[] = [];
    const toCompleted: any[] = [];

    for (const appt of candidates) {
      const doctorTz =
        (appt.doctorId as any)?.userId?.timezone || 'Africa/Lagos';

      const start = appt.startTimeUtc
        ? new Date(appt.startTimeUtc)
        : combineDateAndTime(
            appt.appointmentDate,
            appt.appointmentTime,
            doctorTz,
          );

      const end = appt.endTimeUtc
        ? new Date(appt.endTimeUtc)
        : combineDateAndTime(
            appt.appointmentDate,
            appt.appointmentEndTime,
            doctorTz,
          );

      if (now > end) {
        toCompleted.push(appt._id);
      } else if (appt.status === AppointmentStatus.UPCOMING && now >= start) {
        toOngoing.push(appt._id);
      }
    }

    if (toOngoing.length > 0) {
      const upcomingResult = await this.appointmentModel.updateMany(
        { _id: { $in: toOngoing } },
        { $set: { status: AppointmentStatus.ONGOING } },
      );
      this.logger.log(
        `Transitioned ${upcomingResult.modifiedCount} appointments to ONGOING`,
      );
    }

    if (toCompleted.length > 0) {
      const ongoingResult = await this.appointmentModel.updateMany(
        { _id: { $in: toCompleted } },
        { $set: { status: AppointmentStatus.COMPLETED } },
      );
      this.logger.log(
        `Transitioned ${ongoingResult.modifiedCount} appointments to COMPLETED`,
      );
    }
  }

  private async releaseAbandonedPendingAppointments(now: Date) {
    const unpaidCutoff = new Date(now.getTime() - this.unpaidHoldMs);
    const checkoutCutoff = new Date(now.getTime() - this.checkoutHoldMs);
    const stale = await this.appointmentModel
      .find({
        status: AppointmentStatus.PENDING,
        createdAt: { $lt: unpaidCutoff },
      })
      .select('_id createdAt')
      .lean<Array<{ _id: Types.ObjectId; createdAt?: Date }>>();

    if (stale.length === 0) {
      return;
    }

    const payments = await this.paymentModel
      .find({
        appointmentId: { $in: stale.map((appointment) => appointment._id) },
      })
      .select('appointmentId')
      .lean<Array<{ appointmentId: Types.ObjectId }>>();
    const withPayment = new Set(
      payments.map((payment) => payment.appointmentId.toString()),
    );
    const deletableIds = stale
      .filter((appointment) => {
        if (!withPayment.has(appointment._id.toString())) {
          return true;
        }
        const createdAt = appointment.createdAt
          ? new Date(appointment.createdAt)
          : now;
        return createdAt < checkoutCutoff;
      })
      .map((appointment) => appointment._id);

    if (deletableIds.length === 0) {
      return;
    }

    const result = await this.appointmentModel.deleteMany({
      _id: { $in: deletableIds },
      status: AppointmentStatus.PENDING,
    });

    if (result.deletedCount > 0) {
      this.logger.log(
        `Removed ${result.deletedCount} abandoned pending appointments`,
      );
    }
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleReminders() {
    const now = new Date();

    // 6 hours from now
    const sixHoursLater = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    const sixHoursWindow = new Date(sixHoursLater.getTime() + 10 * 60 * 1000); // +10 min window

    // 1 hour from now
    const oneHourLater = new Date(now.getTime() + 1 * 60 * 60 * 1000);
    const oneHourWindow = new Date(oneHourLater.getTime() + 10 * 60 * 1000); // +10 min window

    // Find both windows concurrently
    const [sixHourAppointments, oneHourAppointments] = await Promise.all([
      this.findAppointmentsInWindow(
        sixHoursLater,
        sixHoursWindow,
        'reminder6hSent',
      ),
      this.findAppointmentsInWindow(
        oneHourLater,
        oneHourWindow,
        'reminder1hSent',
      ),
    ]);

    // Process 6h reminders
    if (sixHourAppointments.length > 0) {
      // Emit all events first (fire-and-forget style)
      for (const appointment of sixHourAppointments) {
        this.notificationsService.emit('appointment.reminder', {
          appointment,
          type: '6H',
        });
      }
      // One bulk write instead of N individual writes
      await this.appointmentModel.updateMany(
        { _id: { $in: sixHourAppointments.map((a) => a._id) } },
        { $set: { reminder6hSent: true } },
      );
      this.logger.log(`Sent ${sixHourAppointments.length} 6-hour reminders`);
    }

    // Process 1h reminders
    if (oneHourAppointments.length > 0) {
      for (const appointment of oneHourAppointments) {
        this.notificationsService.emit('appointment.reminder', {
          appointment,
          type: '1H',
        });
      }
      // One bulk write instead of N individual writes
      await this.appointmentModel.updateMany(
        { _id: { $in: oneHourAppointments.map((a) => a._id) } },
        { $set: { reminder1hSent: true } },
      );
      this.logger.log(`Sent ${oneHourAppointments.length} 1-hour reminders`);
    }
  }

  private async findAppointmentsInWindow(
    windowStart: Date,
    windowEnd: Date,
    reminderFlag: 'reminder6hSent' | 'reminder1hSent',
  ) {
    // Loose DB pre-filter only — a day of slack on each side comfortably
    // covers any appointmentDate whose business-timezone instant could fall
    // inside the window; the exact check happens below.
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const startDate = new Date(windowStart.getTime() - ONE_DAY_MS);
    const endDate = new Date(windowEnd.getTime() + ONE_DAY_MS);

    const appointments = await this.appointmentModel
      .find({
        $or: [
          { startTimeUtc: { $gte: windowStart, $lte: windowEnd } },
          { appointmentDate: { $gte: startDate, $lte: endDate } },
        ],
        status: { $in: [AppointmentStatus.UPCOMING] },
        [reminderFlag]: false,
      })
      .populate('userId', 'name email')
      .populate({
        path: 'doctorId',
        populate: { path: 'userId', select: 'name email timezone' },
      })
      .lean();

    // Filter by actual datetime, resolved in the doctor timezone (or UTC fields)
    return appointments.filter((apt) => {
      const doctorTz =
        (apt.doctorId as any)?.userId?.timezone || 'Africa/Lagos';
      const aptDateTime = apt.startTimeUtc
        ? new Date(apt.startTimeUtc)
        : combineDateAndTime(
            apt.appointmentDate,
            apt.appointmentTime,
            doctorTz,
          );

      return aptDateTime >= windowStart && aptDateTime <= windowEnd;
    });
  }
}
