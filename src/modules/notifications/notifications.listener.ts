import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from './notifications.service';
import { MailService } from '../mail/mail.service';
import { NotificationType } from 'src/common/enum/notification-type.enum';
import { UsersService } from '../users/users.service';
import { PushService } from './push.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Doctor, DoctorDocument } from '../doctors/schemas/doctor.schema';

@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
    private readonly usersService: UsersService,
    private readonly pushService: PushService,
    @InjectModel(Doctor.name) private doctorModel: Model<DoctorDocument>,
  ) {}

  @OnEvent('appointment.created')
  async handleAppointmentCreated(payload: any) {
    this.logger.log(
      `Handling appointment.created event for appointment ${payload._id}`,
    );

    const { userId, doctorId, appointmentDate, appointmentTime } = payload;
    const dateStr = new Date(appointmentDate).toLocaleDateString();

    // Fetch doctor profile and notify patient concurrently (in-app + push)
    const patientMessage = `Your payment was received and your appointment for ${dateStr} at ${appointmentTime} is confirmed.`;
    const doctorMessage = `A patient booked an appointment for ${dateStr} at ${appointmentTime}.`;
    const [, , doctorProfile] = await Promise.all([
      this.notificationsService.createInAppNotification(
        userId,
        NotificationType.APPOINTMENT_CREATED,
        'Appointment Confirmed',
        patientMessage,
        { appointmentId: payload._id, role: 'PATIENT' },
      ),
      this.pushService.sendToUser(
        userId.toString(),
        'Appointment Confirmed',
        patientMessage,
        {
          type: 'APPOINTMENT_CREATED',
          appointmentId: payload._id.toString(),
        },
      ),
      this.doctorModel.findById(doctorId).lean(),
    ]);
    await this.emailUser(userId, 'Appointment Confirmed', patientMessage);

    if (doctorProfile) {
      // Notify doctor via in-app + push concurrently
      await Promise.all([
        this.notificationsService.createInAppNotification(
          doctorProfile.userId,
          NotificationType.APPOINTMENT_CREATED,
          'New Appointment',
          doctorMessage,
          { appointmentId: payload._id, role: 'DOCTOR' },
        ),
        this.pushService.sendToUser(
          doctorProfile.userId.toString(),
          'New Appointment',
          doctorMessage,
          {
            type: 'APPOINTMENT_CREATED',
            appointmentId: payload._id.toString(),
          },
        ),
      ]);
    } else {
      this.logger.warn(`Doctor profile NOT FOUND for doctorId: ${doctorId}`);
    }
  }

  @OnEvent('appointment.updated')
  async handleAppointmentUpdated(payload: any) {
    this.logger.log(
      `Handling appointment.updated event for appointment ${payload._id}`,
    );
    const { userId, doctorId } = payload;
    const doctorUserId = await this.resolveDoctorUserId(doctorId);

    // Notify patient and doctor concurrently
    await Promise.all([
      this.notificationsService.createInAppNotification(
        userId,
        NotificationType.APPOINTMENT_UPDATED,
        'Appointment Updated',
        `Your appointment details have been updated.`,
        { appointmentId: payload._id },
      ),
      doctorUserId
        ? this.notificationsService.createInAppNotification(
            doctorUserId,
            NotificationType.APPOINTMENT_UPDATED,
            'Appointment Updated',
            `Appointment details have been updated.`,
            { appointmentId: payload._id },
          )
        : Promise.resolve(),
    ]);
  }

  @OnEvent('appointment.status_change')
  async handleAppointmentStatusChange(payload: any) {
    const { appointmentId, status, userId, doctorId, oldStatus } = payload;
    this.logger.log(
      `Handling appointment.status_change: ${oldStatus} -> ${status}`,
    );

    let type: NotificationType | undefined;
    let title: string | undefined;
    let messagePatient: string | undefined;
    let messageDoctor: string | undefined;
    const doctorUserId = await this.resolveDoctorUserId(doctorId);

    const when = this.visitWhen(
      payload.appointmentDate,
      payload.appointmentTime,
    );

    switch (status) {
      case 'CANCELLED':
        type = NotificationType.APPOINTMENT_CANCELLED;
        title = 'Appointment Cancelled';
        ({ messagePatient, messageDoctor } = this.cancellationMessages(
          payload,
          when,
        ));
        break;
      case 'COMPLETED':
        type = NotificationType.APPOINTMENT_COMPLETED;
        title = 'Appointment Completed';
        messagePatient = `Your appointment${when} is complete.`;
        messageDoctor = `An appointment${when} is complete.`;
        break;
      case 'ONGOING': // Started
        type = NotificationType.APPOINTMENT_STARTED;
        title = 'Appointment Started';
        messagePatient = `Your appointment${when} has started.`;
        messageDoctor = `Your appointment${when} has started.`;
        break;
      case 'UPCOMING': // Could be re-scheduled or just confirmed
        if (oldStatus === 'PENDING') {
          // Example transition
          // handled by created usually, but if status changes explicitly
        }
        break;
      default:
        // Generic update
        type = NotificationType.APPOINTMENT_UPDATED;
        title = 'Appointment Status Updated';
        messagePatient = `Your appointment status is now ${status}.`;
        messageDoctor = `Appointment status is now ${status}.`;
    }

    if (type && title && messagePatient && messageDoctor) {
      const tasks: Promise<any>[] = [];

      if (userId) {
        tasks.push(
          this.notificationsService.createInAppNotification(
            userId,
            type,
            title,
            messagePatient,
            { appointmentId },
          ),
          this.pushService.sendToUser(
            userId.toString(),
            title,
            messagePatient,
            {
              appointmentId: appointmentId.toString(),
              type: type.toString(),
            },
          ),
        );
      }

      if (doctorUserId && payload.notifyDoctor !== false && messageDoctor) {
        tasks.push(
          this.notificationsService.createInAppNotification(
            doctorUserId,
            type,
            title,
            messageDoctor,
            { appointmentId },
          ),
          this.pushService.sendToUser(
            doctorUserId.toString(),
            title,
            messageDoctor,
            {
              appointmentId: appointmentId.toString(),
              type: type.toString(),
            },
          ),
        );
      }

      if (userId && status === 'CANCELLED') {
        tasks.push(this.emailUser(userId, title, messagePatient));
      }

      await Promise.all(tasks);
    }
  }

  @OnEvent('payment.success')
  async handlePaymentSuccess(payload: any) {
    this.logger.log(`Handling payment.success event`);
    const { userId, amount, reference, metadata } = payload;

    if (!userId) {
      this.logger.warn(
        `Skipping payment.success notification without userId for reference ${reference}`,
      );
      return;
    }

    await Promise.all([
      this.notificationsService.createInAppNotification(
        userId,
        NotificationType.PAYMENT_SUCCESS,
        'Payment Successful',
        `Your payment of ${amount} was successful.`,
        { reference, ...metadata },
      ),
      this.pushService.sendToUser(
        userId.toString(),
        'Payment Successful',
        `Your payment of ${amount} was successful.`,
        {
          type: 'PAYMENT_SUCCESS',
          reference: reference.toString(),
        },
      ),
    ]);
  }

  @OnEvent('appointment.reminder')
  async handleAppointmentReminder(payload: any) {
    const { appointment, type } = payload;
    this.logger.log(
      `Handling appointment.reminder (${type}) for appointment ${appointment._id}`,
    );

    const notificationType =
      type === '6H'
        ? NotificationType.APPOINTMENT_REMINDER_6H
        : NotificationType.APPOINTMENT_REMINDER_1H;

    const timeLabel = type === '6H' ? '6 hours' : '1 hour';
    const dateStr = new Date(appointment.appointmentDate).toLocaleDateString();
    const userId = appointment.userId._id || appointment.userId;
    const doctorUser = appointment.doctorId?.userId;
    const patientEmail = appointment.userId?.email;

    // Fire all patient notifications concurrently
    const patientTasks: Promise<any>[] = [
      this.notificationsService.createInAppNotification(
        userId,
        notificationType,
        'Appointment Reminder',
        `Your appointment is in ${timeLabel} (${dateStr} at ${appointment.appointmentTime}).`,
        { appointmentId: appointment._id },
      ),
      this.pushService.sendToUser(
        userId.toString(),
        'Appointment Reminder',
        `Your appointment is in ${timeLabel}.`,
        {
          appointmentId: appointment._id.toString(),
          type: 'APPOINTMENT_REMINDER',
        },
      ),
    ];

    if (patientEmail) {
      patientTasks.push(
        this.mailService.sendEmail(
          patientEmail,
          'Appointment Reminder',
          `This is a reminder that your appointment is in ${timeLabel} (${dateStr} at ${appointment.appointmentTime}).`,
        ),
      );
    }

    // Fire all doctor notifications concurrently (if doctor info available)
    const doctorTasks: Promise<any>[] = [];
    if (doctorUser) {
      const doctorUserId = doctorUser._id || doctorUser;
      doctorTasks.push(
        this.notificationsService.createInAppNotification(
          doctorUserId,
          notificationType,
          'Appointment Reminder',
          `You have an appointment in ${timeLabel}.`,
          { appointmentId: appointment._id },
        ),
        this.pushService.sendToUser(
          doctorUserId.toString(),
          'Appointment Reminder',
          `You have an appointment in ${timeLabel}.`,
          {
            appointmentId: appointment._id.toString(),
            type: 'APPOINTMENT_REMINDER',
          },
        ),
      );
    }

    // Run patient and doctor notification groups concurrently
    await Promise.all([...patientTasks, ...doctorTasks]);
  }

  @OnEvent('doctor.verified')
  async handleDoctorVerified(payload: any) {
    const { userId, email, name } = payload;
    this.logger.log(`Handling doctor.verified for user ${userId}`);

    await Promise.all([
      this.notificationsService.createInAppNotification(
        userId,
        NotificationType.DOCTOR_VERIFIED,
        'Verification Approved',
        'Congratulations! Your doctor profile has been verified. You can now start accepting appointments.',
        { doctorId: payload.doctorId },
      ),
      this.pushService.sendToUser(
        userId.toString(),
        'Verification Approved',
        'Your doctor profile has been verified!',
        { type: 'DOCTOR_VERIFIED' },
      ),
      email
        ? this.mailService.sendDoctorAcceptanceEmail(email, name)
        : Promise.resolve(),
    ]);
  }

  @OnEvent('doctor.rejected')
  async handleDoctorRejected(payload: any) {
    const { userId, email, name, note } = payload;
    this.logger.log(`Handling doctor.rejected for user ${userId}`);

    await Promise.all([
      this.notificationsService.createInAppNotification(
        userId,
        NotificationType.DOCTOR_REJECTED,
        'Verification Rejected',
        note ||
          'Your doctor profile verification was not approved. Please review your documents and try again.',
        { doctorId: payload.doctorId },
      ),
      this.pushService.sendToUser(
        userId.toString(),
        'Verification Rejected',
        'Your doctor profile verification was not approved.',
        { type: 'DOCTOR_REJECTED' },
      ),
      email
        ? this.mailService.sendDoctorRejectionEmail(email, name, note)
        : Promise.resolve(),
    ]);
  }

  @OnEvent('doctor.suspended')
  async handleDoctorSuspended(payload: any) {
    const { userId, email, name, note } = payload;
    this.logger.log(`Handling doctor.suspended for user ${userId}`);

    await Promise.all([
      this.notificationsService.createInAppNotification(
        userId,
        NotificationType.DOCTOR_SUSPENDED,
        'Account Suspended',
        note ||
          'Your doctor account has been suspended. Please contact support for more information.',
        { doctorId: payload.doctorId },
      ),
      this.pushService.sendToUser(
        userId.toString(),
        'Account Suspended',
        'Your doctor account has been suspended.',
        { type: 'DOCTOR_SUSPENDED' },
      ),
      email
        ? this.mailService.sendDoctorSuspensionEmail(email, name, note)
        : Promise.resolve(),
    ]);
  }

  @OnEvent('doctor.unsuspended')
  async handleDoctorUnsuspended(payload: any) {
    const { userId, email, name } = payload;
    this.logger.log(`Handling doctor.unsuspended for user ${userId}`);

    await Promise.all([
      this.notificationsService.createInAppNotification(
        userId,
        NotificationType.DOCTOR_UNSUSPENDED,
        'Account Restored',
        'Your doctor account has been restored. You can now resume accepting appointments.',
        { doctorId: payload.doctorId },
      ),
      this.pushService.sendToUser(
        userId.toString(),
        'Account Restored',
        'Your doctor account has been restored!',
        { type: 'DOCTOR_UNSUSPENDED' },
      ),
      email
        ? this.mailService.sendDoctorUnsuspensionEmail(email, name)
        : Promise.resolve(),
    ]);
  }

  @OnEvent('auth.registration_otp_sent')
  async handleRegistrationOtpSent(payload: { email: string; otp: string }) {
    this.logger.log(`Handling auth.registration_otp_sent for ${payload.email}`);
    try {
      await this.mailService.sendEmailVerificationOtp(
        payload.email,
        payload.otp,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send registration OTP email to ${payload.email}`,
        error,
      );
    }
  }

  @OnEvent('auth.password_reset_otp_sent')
  async handlePasswordResetOtpSent(payload: { email: string; otp: string }) {
    this.logger.log(
      `Handling auth.password_reset_otp_sent for ${payload.email}`,
    );
    try {
      await this.mailService.sendResetPasswordOtp(payload.email, payload.otp);
    } catch (error) {
      this.logger.error(
        `Failed to send password reset OTP email to ${payload.email}`,
        error,
      );
    }
  }

  @OnEvent('appointment.accepted')
  async handleAppointmentAccepted(payload: any) {
    const { appointmentId, userId, appointmentDate, appointmentTime } = payload;
    this.logger.log(
      `Handling appointment.accepted for appointment ${appointmentId}`,
    );

    const dateStr = new Date(appointmentDate).toLocaleDateString();

    const patient = await this.usersService.findById(userId);
    const tasks: Promise<any>[] = [
      this.notificationsService.createInAppNotification(
        userId,
        NotificationType.APPOINTMENT_UPDATED,
        'Appointment Confirmed',
        `Your appointment for ${dateStr} at ${appointmentTime} has been confirmed by the doctor.`,
        { appointmentId },
      ),
      this.pushService.sendToUser(
        userId.toString(),
        'Appointment Confirmed',
        `Your appointment for ${dateStr} at ${appointmentTime} has been confirmed by the doctor.`,
        {
          appointmentId: appointmentId.toString(),
          type: 'APPOINTMENT_CONFIRMED',
        },
      ),
    ];

    if (patient && patient.email) {
      tasks.push(
        this.mailService.sendEmail(
          patient.email,
          'Appointment Confirmed',
          `Good news! Your appointment on ${dateStr} at ${appointmentTime} has been confirmed by the doctor.`,
        ),
      );
    }

    await Promise.all(tasks);
  }

  @OnEvent('appointment.rejected')
  async handleAppointmentRejected(payload: any) {
    const { appointmentId, userId, appointmentDate, appointmentTime, reason } =
      payload;
    this.logger.log(
      `Handling appointment.rejected for appointment ${appointmentId}`,
    );

    const dateStr = new Date(appointmentDate).toLocaleDateString();
    const reasonText = reason ? ` Reason: ${reason}` : '';
    const refundText = payload.refundStarted
      ? ' A full refund is being processed.'
      : payload.refundFailed
        ? ' We could not start the refund automatically. Please contact support.'
        : '';
    const patientMessage = `Your appointment for ${dateStr} at ${appointmentTime} was declined by the doctor.${reasonText}${refundText}`;
    const doctorMessage = payload.refundStarted
      ? `You declined the appointment for ${dateStr} at ${appointmentTime}. A full refund is being sent to the patient.`
      : `You declined the appointment for ${dateStr} at ${appointmentTime}. The patient has been informed.`;

    const patient = await this.usersService.findById(userId);
    const doctorUserId = await this.resolveDoctorUserId(payload.doctorId);
    const tasks: Promise<any>[] = [
      this.notificationsService.createInAppNotification(
        userId,
        NotificationType.APPOINTMENT_CANCELLED,
        'Appointment Declined',
        patientMessage,
        { appointmentId, role: 'PATIENT' },
      ),
      this.pushService.sendToUser(
        userId.toString(),
        'Appointment Declined',
        patientMessage,
        {
          appointmentId: appointmentId.toString(),
          type: 'APPOINTMENT_REJECTED',
        },
      ),
    ];

    if (patient && patient.email) {
      tasks.push(
        this.mailService.sendEmail(
          patient.email,
          'Appointment Declined',
          patientMessage,
        ),
      );
    }

    if (doctorUserId) {
      tasks.push(
        this.notificationsService.createInAppNotification(
          doctorUserId,
          NotificationType.APPOINTMENT_CANCELLED,
          'Appointment Declined',
          doctorMessage,
          { appointmentId, role: 'DOCTOR' },
        ),
        this.pushService.sendToUser(
          doctorUserId,
          'Appointment Declined',
          doctorMessage,
          {
            appointmentId: appointmentId.toString(),
            type: 'APPOINTMENT_REJECTED',
          },
        ),
      );
    }

    await Promise.all(tasks);
  }

  @OnEvent('chat.message.sent')
  async handleChatMessageSent(payload: any) {
    const { message, sender, receiver } = payload;
    this.logger.log(
      `Handling chat.message.sent to ${receiver.id} (${receiver.role})`,
    );

    let recipientUserId = receiver.id;

    if (receiver.role.toUpperCase() === 'DOCTOR') {
      const doctorProfile = await this.doctorModel.findById(receiver.id).lean();
      if (doctorProfile && doctorProfile.userId) {
        recipientUserId = doctorProfile.userId.toString();
      } else {
        this.logger.warn(
          `Could not find doctor profile for chat push: ${receiver.id}`,
        );
        return;
      }
    }

    let senderName = 'Someone';
    try {
      let senderUserId = sender.id;
      if (sender.role.toUpperCase() === 'DOCTOR') {
        const docProfile = await this.doctorModel.findById(sender.id).lean();
        if (docProfile && docProfile.userId) {
          senderUserId = docProfile.userId.toString();
        }
      }
      const senderUser = await this.usersService.findById(senderUserId);
      if (senderUser && senderUser.name) {
        senderName = senderUser.name;
      }
      if (sender.role.toUpperCase() === 'DOCTOR') {
        senderName = `Dr. ${senderName.replace('Dr. ', '')}`;
      }
    } catch {
      this.logger.warn('Failed to fetch sender name for chat push');
    }

    // Determine message preview
    let bodyPreview = 'New message';
    if (message.text) {
      bodyPreview = message.text.substring(0, 100);
    } else if (message.images?.length > 0) {
      bodyPreview = 'Sent an image';
    } else if (message.video) {
      bodyPreview = 'Sent a video';
    }

    await this.pushService.sendToUser(
      recipientUserId.toString(),
      `New message from ${senderName}`,
      bodyPreview,
      {
        type: 'CHAT_MESSAGE',
        conversationId: message.conversationId.toString(),
        senderId: sender.id.toString(),
        senderRole: sender.role,
      },
    );
  }

  private visitWhen(date?: Date | string, time?: string) {
    if (!date || !time) return '';
    return ` for ${new Date(date).toLocaleDateString()} at ${time}`;
  }

  private money(amount?: number) {
    if (
      amount === undefined ||
      amount === null ||
      Number.isNaN(Number(amount))
    ) {
      return '';
    }
    return `NGN ${amount}`;
  }

  private cancellationMessages(payload: any, when: string) {
    const amountText = this.money(payload.refundAmount);
    const refundSentence = payload.refundStarted
      ? amountText
        ? ` A refund of ${amountText} is being processed.`
        : ' A refund is being processed.'
      : payload.refundFailed
        ? ' We could not start the refund automatically. Please contact support.'
        : '';

    if (payload.cancelledBy === 'PATIENT') {
      return {
        messagePatient: payload.refundStarted
          ? `You cancelled your appointment${when}.${refundSentence}`
          : payload.refundFailed
            ? `You cancelled your appointment${when}.${refundSentence}`
            : payload.hadPayment
              ? `You cancelled your appointment${when}. The visit time has passed, so this payment is not refunded.`
              : `You cancelled your appointment${when}.`,
        messageDoctor: payload.refundStarted
          ? `The patient cancelled the appointment${when}. Their payment is being refunded.`
          : `The patient cancelled the appointment${when}.`,
      };
    }

    if (payload.cancelledBy === 'DOCTOR_UNAVAILABLE') {
      return {
        messagePatient: payload.refundStarted
          ? `Your appointment${when} was cancelled because the doctor is no longer available. A full refund is being processed.`
          : `Your appointment${when} was cancelled because the doctor is no longer available.`,
        messageDoctor:
          'An appointment was cancelled because the doctor is unavailable.',
      };
    }

    if (payload.cancelledBy === 'DOCTOR') {
      return {
        messagePatient: payload.refundStarted
          ? `The doctor cancelled your appointment${when}. A full refund is being processed.`
          : payload.refundFailed
            ? `The doctor cancelled your appointment${when}. We could not start the refund automatically. Please contact support.`
            : `The doctor cancelled your appointment${when}.`,
        messageDoctor: payload.refundStarted
          ? `You cancelled the appointment${when}. A full refund is being sent to the patient.`
          : `You cancelled the appointment${when}. The patient has been informed.`,
      };
    }

    return {
      messagePatient: `Your appointment${when} has been cancelled.${refundSentence}`,
      messageDoctor: `An appointment${when} has been cancelled.`,
    };
  }

  private async emailUser(userId: any, subject: string, body: string) {
    try {
      const id = userId?._id || userId;
      if (!id) return;
      const user = await this.usersService.findById(id.toString());
      if (user?.email) {
        await this.mailService.sendEmail(user.email, subject, body);
      }
    } catch (error) {
      this.logger.error(`Failed to email user ${userId}`, error);
    }
  }

  private doctorUserForConfirmedRefund(payload: any) {
    if (!payload.doctorId || payload.reason === 'BOOKING_EXPIRED') {
      return Promise.resolve(null);
    }
    return this.resolveDoctorUserId(payload.doctorId);
  }

  private async resolveDoctorUserId(doctorId: any): Promise<string | null> {
    if (!doctorId) {
      return null;
    }

    const normalizedDoctorId = doctorId._id || doctorId;
    const doctorProfile = await this.doctorModel
      .findById(normalizedDoctorId)
      .select('userId')
      .lean();

    if (!doctorProfile?.userId) {
      this.logger.warn(
        `Doctor profile not found while resolving notification recipient: ${normalizedDoctorId}`,
      );
      return null;
    }

    return doctorProfile.userId.toString();
  }

  @OnEvent('appointment.payment_confirmed')
  async handleAppointmentPaymentConfirmed(payload: any) {
    const userId = payload.userId;
    const doctorUserId = await this.resolveDoctorUserId(payload.doctorId);
    const dateStr = new Date(payload.appointmentDate).toLocaleDateString();
    const patientMessage = `Your payment was received and your appointment for ${dateStr} at ${payload.appointmentTime} is confirmed.`;
    const doctorMessage = `A patient payment was confirmed for ${dateStr} at ${payload.appointmentTime}.`;

    const tasks: Promise<any>[] = [];
    if (userId) {
      tasks.push(
        this.notificationsService.createInAppNotification(
          userId,
          NotificationType.APPOINTMENT_PAYMENT_CONFIRMED,
          'Appointment Confirmed',
          patientMessage,
          { appointmentId: payload._id, role: 'PATIENT' },
        ),
        this.pushService.sendToUser(
          userId.toString(),
          'Appointment Confirmed',
          patientMessage,
          {
            type: NotificationType.APPOINTMENT_PAYMENT_CONFIRMED,
            appointmentId: payload._id.toString(),
          },
        ),
      );
    }
    if (doctorUserId) {
      tasks.push(
        this.notificationsService.createInAppNotification(
          doctorUserId,
          NotificationType.APPOINTMENT_PAYMENT_CONFIRMED,
          'Appointment Confirmed',
          doctorMessage,
          { appointmentId: payload._id, role: 'DOCTOR' },
        ),
        this.pushService.sendToUser(
          doctorUserId,
          'Appointment Confirmed',
          doctorMessage,
          {
            type: NotificationType.APPOINTMENT_PAYMENT_CONFIRMED,
            appointmentId: payload._id.toString(),
          },
        ),
      );
    }
    await Promise.all(tasks);
  }

  @OnEvent('appointment.expired_refund')
  async handleExpiredAppointmentRefund(payload: any) {
    const userId = payload.userId;
    if (!userId) return;

    const when = this.visitWhen(
      payload.appointmentDate,
      payload.appointmentTime,
    );
    const amountText = this.money(payload.amount);
    const message = `Your booking${when} expired before it could be confirmed. The time is no longer held, and ${amountText ? `a refund of ${amountText} is being processed` : 'your payment is being refunded'}.`;

    await Promise.all([
      this.notificationsService.createInAppNotification(
        userId,
        NotificationType.APPOINTMENT_EXPIRED_REFUND,
        'Booking Expired',
        message,
        { appointmentId: payload.appointmentId, role: 'PATIENT' },
      ),
      this.pushService.sendToUser(
        userId.toString(),
        'Booking Expired',
        message,
        {
          type: NotificationType.APPOINTMENT_EXPIRED_REFUND,
          appointmentId: payload.appointmentId.toString(),
        },
      ),
      this.emailUser(userId, 'Booking Expired', message),
    ]);
  }

  @OnEvent('appointment.refund_completed')
  async handleRefundCompleted(payload: any) {
    if (!payload.userId) return;
    const amountText = this.money(payload.amount);
    const message = amountText
      ? `Your refund of ${amountText} has been completed and is on its way back to your account.`
      : 'Your refund has been completed and is on its way back to your account.';
    const tasks: Promise<any>[] = [
      this.notificationsService.createInAppNotification(
        payload.userId,
        NotificationType.APPOINTMENT_EXPIRED_REFUND,
        'Refund Completed',
        message,
        { appointmentId: payload.appointmentId, role: 'PATIENT' },
      ),
      this.pushService.sendToUser(
        payload.userId.toString(),
        'Refund Completed',
        message,
        {
          type: NotificationType.APPOINTMENT_EXPIRED_REFUND,
          appointmentId: payload.appointmentId?.toString(),
        },
      ),
      this.emailUser(payload.userId, 'Refund Completed', message),
    ];
    const doctorUserId = await this.doctorUserForConfirmedRefund(payload);
    if (doctorUserId) {
      const doctorMessage = amountText
        ? `The patient's refund of ${amountText} has been completed. You will not be paid for that visit.`
        : 'The patient refund has been completed. You will not be paid for that visit.';
      tasks.push(
        this.notificationsService.createInAppNotification(
          doctorUserId,
          NotificationType.APPOINTMENT_EXPIRED_REFUND,
          'Refund Completed',
          doctorMessage,
          { appointmentId: payload.appointmentId, role: 'DOCTOR' },
        ),
        this.pushService.sendToUser(
          doctorUserId,
          'Refund Completed',
          doctorMessage,
          {
            type: NotificationType.APPOINTMENT_EXPIRED_REFUND,
            appointmentId: payload.appointmentId?.toString(),
          },
        ),
      );
    }
    await Promise.all(tasks);
  }

  @OnEvent('appointment.refund_failed')
  async handleRefundFailed(payload: any) {
    if (!payload.userId) return;
    const message =
      'We could not complete your refund automatically. Please contact support so we can return the payment.';
    const tasks: Promise<any>[] = [
      this.notificationsService.createInAppNotification(
        payload.userId,
        NotificationType.APPOINTMENT_EXPIRED_REFUND,
        'Refund Needs Help',
        message,
        { appointmentId: payload.appointmentId, role: 'PATIENT' },
      ),
      this.pushService.sendToUser(
        payload.userId.toString(),
        'Refund Needs Help',
        message,
        {
          type: NotificationType.APPOINTMENT_EXPIRED_REFUND,
          appointmentId: payload.appointmentId?.toString(),
        },
      ),
      this.emailUser(payload.userId, 'Refund Needs Help', message),
    ];
    const doctorUserId = await this.doctorUserForConfirmedRefund(payload);
    if (doctorUserId) {
      const doctorMessage =
        'The patient refund could not be completed automatically. Support needs to return the payment.';
      tasks.push(
        this.notificationsService.createInAppNotification(
          doctorUserId,
          NotificationType.APPOINTMENT_EXPIRED_REFUND,
          'Refund Needs Help',
          doctorMessage,
          { appointmentId: payload.appointmentId, role: 'DOCTOR' },
        ),
        this.pushService.sendToUser(
          doctorUserId,
          'Refund Needs Help',
          doctorMessage,
          {
            type: NotificationType.APPOINTMENT_EXPIRED_REFUND,
            appointmentId: payload.appointmentId?.toString(),
          },
        ),
      );
    }
    await Promise.all(tasks);
  }

  @OnEvent('appointment.hold_expired')
  async handleHoldExpired(payload: any) {
    if (!payload.userId) return;
    const when = this.visitWhen(
      payload.appointmentDate,
      payload.appointmentTime,
    );
    const message = `Your unpaid booking${when} expired because payment was not completed within 10 minutes. The time has been released.`;
    await Promise.all([
      this.notificationsService.createInAppNotification(
        payload.userId,
        NotificationType.APPOINTMENT_HOLD_EXPIRED,
        'Booking Hold Expired',
        message,
        { appointmentId: payload.appointmentId, role: 'PATIENT' },
      ),
      this.pushService.sendToUser(
        payload.userId.toString(),
        'Booking Hold Expired',
        message,
        {
          type: NotificationType.APPOINTMENT_HOLD_EXPIRED,
          appointmentId: payload.appointmentId?.toString(),
        },
      ),
      this.emailUser(payload.userId, 'Booking Hold Expired', message),
    ]);
  }

  @OnEvent('appointment.schedule_cleared')
  async handleScheduleCleared(payload: any) {
    if (!payload.doctorUserId) return;
    const count = Number(payload.count) || 0;
    const message =
      count === 1
        ? '1 upcoming appointment was cancelled because your account is no longer available to patients. Paid visits are being refunded.'
        : `${count} upcoming appointments were cancelled because your account is no longer available to patients. Paid visits are being refunded.`;
    await Promise.all([
      this.notificationsService.createInAppNotification(
        payload.doctorUserId,
        NotificationType.APPOINTMENT_CANCELLED,
        'Appointments Cancelled',
        message,
        { role: 'DOCTOR' },
      ),
      this.pushService.sendToUser(
        payload.doctorUserId.toString(),
        'Appointments Cancelled',
        message,
        { type: NotificationType.APPOINTMENT_CANCELLED },
      ),
    ]);
  }

  @OnEvent('user.profile_updated')
  async handleUserProfileUpdated(payload: { userId: string; role: string }) {
    const { userId, role } = payload;
    this.logger.log(`Handling user.profile_updated for user ${userId}`);

    const roleName = role.toLowerCase() === 'doctor' ? 'Doctor' : 'Patient';

    await Promise.all([
      this.notificationsService.createInAppNotification(
        userId,
        NotificationType.PROFILE_UPDATED,
        'Profile Updated',
        `Your ${roleName} profile has been updated successfully!`,
        { role },
      ),
      this.pushService.sendToUser(
        userId,
        'Profile Updated',
        `Your ${roleName} profile has been updated successfully!`,
        {
          type: 'PROFILE_UPDATED',
          role,
        },
      ),
    ]);
  }
}
