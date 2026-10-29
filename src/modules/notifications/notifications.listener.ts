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
    const [, , doctorProfile] = await Promise.all([
      this.notificationsService.createInAppNotification(
        userId,
        NotificationType.APPOINTMENT_CREATED,
        'Appointment Request Submitted',
        `Your appointment request for ${dateStr} at ${appointmentTime} has been submitted.`,
        { appointmentId: payload._id, role: 'PATIENT' },
      ),
      this.pushService.sendToUser(
        userId.toString(),
        'Appointment Request Submitted',
        `Your appointment request for ${dateStr} at ${appointmentTime} has been submitted.`,
        {
          type: 'APPOINTMENT_CREATED',
          appointmentId: payload._id.toString(),
        },
      ),
      this.doctorModel.findById(doctorId).lean(),
    ]);

    if (doctorProfile) {
      // Notify doctor via in-app + push concurrently
      await Promise.all([
        this.notificationsService.createInAppNotification(
          doctorProfile.userId,
          NotificationType.APPOINTMENT_CREATED,
          'New Appointment Request',
          `You have a new appointment request for ${dateStr} at ${appointmentTime}.`,
          { appointmentId: payload._id, role: 'DOCTOR' },
        ),
        this.pushService.sendToUser(
          doctorProfile.userId.toString(),
          'New Appointment Request',
          `You have a new appointment request for ${dateStr} at ${appointmentTime}.`,
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

    switch (status) {
      case 'CANCELLED':
        type = NotificationType.APPOINTMENT_CANCELLED;
        title = 'Appointment Cancelled';
        messagePatient = 'Your appointment has been cancelled.';
        messageDoctor = 'An appointment has been cancelled.';
        break;
      case 'COMPLETED':
        type = NotificationType.APPOINTMENT_COMPLETED;
        title = 'Appointment Completed';
        messagePatient = 'Your appointment has been marked as completed.';
        messageDoctor = 'Appointment marked as completed.';
        break;
      case 'ONGOING': // Started
        type = NotificationType.APPOINTMENT_STARTED;
        title = 'Appointment Started';
        messagePatient = 'Your appointment has started.';
        messageDoctor = 'Appointment started.';
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

      if (doctorUserId) {
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
    const {
      appointmentId,
      userId,
      appointmentDate,
      appointmentTime,
    } = payload;
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
    const {
      appointmentId,
      userId,
      appointmentDate,
      appointmentTime,
      reason,
    } = payload;
    this.logger.log(
      `Handling appointment.rejected for appointment ${appointmentId}`,
    );

    const dateStr = new Date(appointmentDate).toLocaleDateString();
    const reasonText = reason ? ` Reason: ${reason}` : '';

    const patient = await this.usersService.findById(userId);
    const tasks: Promise<any>[] = [
      this.notificationsService.createInAppNotification(
        userId,
        NotificationType.APPOINTMENT_CANCELLED,
        'Appointment Request Declined',
        `Your appointment request for ${dateStr} at ${appointmentTime} was declined by the doctor.${reasonText}`,
        { appointmentId },
      ),
      this.pushService.sendToUser(
        userId.toString(),
        'Appointment Request Declined',
        `Your appointment request for ${dateStr} at ${appointmentTime} was declined by the doctor.${reasonText}`,
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
          'Appointment Request Declined',
          `Unfortunately, your appointment request for ${dateStr} at ${appointmentTime} was declined by the doctor.${reasonText}`,
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
