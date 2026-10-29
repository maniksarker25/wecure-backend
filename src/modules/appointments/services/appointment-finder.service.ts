import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppointmentStatus } from 'src/common/enum/appointment-status.enum';
import { DayOfWeek } from 'src/common/enum/days.enum';
import { EncryptionService } from 'src/common/services/encryption.service';
import {
  AvailabilityDocument,
  DoctorAvailability,
} from '../../availability/schemas/availability.schema';
import { Doctor, DoctorDocument } from '../../doctors/schemas/doctor.schema';
import { Review, ReviewDocument } from '../../reviews/schemas/review.schema';
import { UploadsService } from '../../uploads/uploads.service';
import {
  AppointmentDetailsDto,
  AttachmentDto,
  DoctorInfoDto,
} from '../dto/appointment-details.dto';
import {
  Appointment,
  AppointmentDocument,
} from '../schemas/appointment.schema';

@Injectable()
export class AppointmentFinderService {
  constructor(
    @InjectModel(Appointment.name)
    private appointmentModel: Model<AppointmentDocument>,
    @InjectModel(Doctor.name)
    private doctorModel: Model<DoctorDocument>,
    @InjectModel(Review.name)
    private reviewModel: Model<ReviewDocument>,
    @InjectModel(DoctorAvailability.name)
    private availabilityModel: Model<AvailabilityDocument>,
    private readonly encryptionService: EncryptionService,
    private readonly uploadsService: UploadsService,
  ) {}

  async getForUser(userId: string, query: any = {}): Promise<any> {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    const skip = (page - 1) * limit;
    const status = query.status;

    const userObjectId = new Types.ObjectId(userId);

    const matchStage: any = { userId: userObjectId };
    if (status) {
      matchStage.status = status;
    } else {
      matchStage.status = { $ne: AppointmentStatus.PENDING };
    }

    const pipeline: any[] = [
      { $match: matchStage },
      {
        $addFields: {
          sortPriority: {
            $switch: {
              branches: [
                {
                  case: { $eq: ['$status', AppointmentStatus.ONGOING] },
                  then: 1,
                },
                {
                  case: { $eq: ['$status', AppointmentStatus.UPCOMING] },
                  then: 2,
                },
              ],
              default: 3,
            },
          },
        },
      },
      {
        $sort: {
          sortPriority: 1,
          appointmentDate: -1,
          appointmentTime: 1,
        },
      },
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $lookup: {
                from: 'doctors',
                let: { doctorId: '$doctorId' },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $or: [
                          { $eq: ['$_id', '$$doctorId'] },
                          {
                            $eq: [
                              { $toString: '$_id' },
                              { $toString: '$$doctorId' },
                            ],
                          },
                        ],
                      },
                    },
                  },
                ],
                as: 'doctor',
              },
            },
            { $unwind: { path: '$doctor', preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: 'users',
                let: { userId: '$doctor.userId' },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $or: [
                          { $eq: ['$_id', '$$userId'] },
                          {
                            $eq: [
                              { $toString: '$_id' },
                              { $toString: '$$userId' },
                            ],
                          },
                        ],
                      },
                    },
                  },
                ],
                as: 'doctorUser',
              },
            },
            {
              $unwind: {
                path: '$doctorUser',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $lookup: {
                from: 'specialists',
                let: { specialistId: '$specialistId' },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $or: [
                          { $eq: ['$_id', '$$specialistId'] },
                          {
                            $eq: [
                              { $toString: '$_id' },
                              { $toString: '$$specialistId' },
                            ],
                          },
                        ],
                      },
                    },
                  },
                ],
                as: 'specialty',
              },
            },
            {
              $unwind: { path: '$specialty', preserveNullAndEmptyArrays: true },
            },
            {
              $project: {
                _id: 1,
                doctorName: { $ifNull: ['$doctorUser.name', 'Unknown Doctor'] },
                doctorProfileImage: '$doctorUser.profileImage',
                specialtyName: { $ifNull: ['$specialty.name', 'General'] },
                doctorTimezone: '$doctorUser.timezone',
                appointmentDate: 1,
                appointmentTime: 1,
                appointmentEndTime: 1,
                status: 1,
                consultationFee: 1,
              },
            },
          ],
        },
      },
    ];

    const [result] = await this.appointmentModel.aggregate(pipeline);

    const total = result.metadata[0]?.total || 0;
    const data = result.data;

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getForDoctorSimple(userId: string, query: any = {}): Promise<any> {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    const skip = (page - 1) * limit;

    const doctor = await this.doctorModel.findOne({ userId }).lean();
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    const doctorObjectId = doctor._id;

    const pipeline: any[] = [
      {
        $match: {
          doctorId: doctorObjectId,
          status: { $ne: AppointmentStatus.PENDING },
        },
      },
      { $sort: { appointmentDate: -1 } },
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $lookup: {
                from: 'users',
                let: { userId: '$userId' },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $or: [
                          { $eq: ['$_id', '$$userId'] },
                          {
                            $eq: [
                              { $toString: '$_id' },
                              { $toString: '$$userId' },
                            ],
                          },
                        ],
                      },
                    },
                  },
                ],
                as: 'patientUser',
              },
            },
            {
              $unwind: {
                path: '$patientUser',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $lookup: {
                from: 'specialists',
                let: { specialistId: '$specialistId' },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $or: [
                          { $eq: ['$_id', '$$specialistId'] },
                          {
                            $eq: [
                              { $toString: '$_id' },
                              { $toString: '$$specialistId' },
                            ],
                          },
                        ],
                      },
                    },
                  },
                ],
                as: 'specialty',
              },
            },
            {
              $unwind: { path: '$specialty', preserveNullAndEmptyArrays: true },
            },
            {
              $project: {
                _id: 1,
                patientName: {
                  $ifNull: ['$patientUser.name', 'Unknown Patient'],
                },
                specialtyName: { $ifNull: ['$specialty.name', 'General'] },
                appointmentDate: 1,
                appointmentTime: 1,
                appointmentEndTime: 1,
                status: 1,
                consultationFee: 1,
              },
            },
          ],
        },
      },
    ];

    const [result] = await this.appointmentModel.aggregate(pipeline);

    const total = result.metadata[0]?.total || 0;
    const data = result.data;

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getForDoctor(userId?: string, doctorId?: string, query: any = {}) {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (doctorId && Types.ObjectId.isValid(doctorId)) {
      filter.doctorId = new Types.ObjectId(doctorId);
    } else if (userId) {
      const doctor = await this.doctorModel.findOne({ userId }).lean();
      if (!doctor) throw new NotFoundException('Doctor profile not found');
      filter.doctorId = doctor._id;
    } else {
      throw new BadRequestException('UserId or DoctorId is required');
    }

    if (query.status) {
      filter.status = query.status;
    } else {
      filter.status = {
        $in: [AppointmentStatus.UPCOMING, AppointmentStatus.ONGOING],
      };
    }

    const [data, total, completedCount, cancelledCount] = await Promise.all([
      this.appointmentModel
        .find(filter)
        .populate('userId', 'name email phone profileImage consultationFee')
        .populate('specialistId', 'name')
        .populate('attachments')
        .sort({ appointmentDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.appointmentModel.countDocuments(filter),
      this.appointmentModel.countDocuments({
        ...filter,
        status: AppointmentStatus.COMPLETED,
      }),
      this.appointmentModel.countDocuments({
        ...filter,
        status: AppointmentStatus.CANCELLED,
      }),
    ]);

    const projectedData = data.map((appt: any) => ({
      _id: appt._id,
      patientName: appt.userId?.name || 'Unknown',
      patientProfileImage: appt.userId?.profileImage,
      patientPhone: this.decryptValue(appt.userId?.phone),
      reasonTitle: this.decryptValue(appt.reasonTitle),
      appointmentDate: appt.appointmentDate,
      appointmentTime: appt.appointmentTime,
      appointmentEndTime: appt.appointmentEndTime,
      consultationFee: appt.consultationFee,
      status: appt.status,
    }));

    return {
      data: projectedData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      completedCount,
      cancelledCount,
    };
  }

  async getDashboardStats(userId: string) {
    const doctor = await this.doctorModel.findOne({ userId }).lean();
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dayName = now
      .toLocaleDateString('en-US', { weekday: 'long' })
      .toUpperCase() as DayOfWeek;

    const [availability, todayAppointments, allAppointments, counts] =
      await Promise.all([
        this.availabilityModel
          .findOne({
            doctorId: doctor._id,
            dayOfWeek: dayName,
            isActive: true,
          })
          .lean(),
        this.appointmentModel
          .find({
            doctorId: doctor._id,
            appointmentDate: { $gte: today, $lt: tomorrow },
            status: {
              $in: [AppointmentStatus.UPCOMING, AppointmentStatus.ONGOING],
            },
          })
          .sort({ appointmentTime: 1 })
          .lean(),
        this.appointmentModel
          .find({
            doctorId: doctor._id,
            appointmentDate: { $gte: today },
            status: AppointmentStatus.UPCOMING,
          })
          .sort({ appointmentDate: 1, appointmentTime: 1 })
          .limit(10)
          .populate('userId', 'name profileImage')
          .lean(),
        this.getStatsCounts(doctor._id.toString()),
      ]);

    let totalSlots = 0;
    if (availability) {
      const start = this.timeToMinutes(availability.startTime);
      const end = this.timeToMinutes(availability.endTime);
      totalSlots = Math.floor((end - start) / availability.slotSizeMinutes);
    }

    const ongoingSession = todayAppointments.find(
      (a) => a.status === AppointmentStatus.ONGOING,
    );
    const nextSession = todayAppointments.find(
      (a) => a.status === AppointmentStatus.UPCOMING,
    );

    return {
      today: {
        date: `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`,
        dayName,
        slotCount: totalSlots,
        startTime: availability?.startTime,
        endTime: availability?.endTime,
      },
      nextSchedule: nextSession
        ? `${nextSession.appointmentTime} - ${nextSession.appointmentEndTime}`
        : allAppointments[0]
          ? `${allAppointments[0].appointmentTime} - ${allAppointments[0].appointmentEndTime}`
          : null,
      activeAppointment: ongoingSession
        ? {
            _id: ongoingSession._id,
            patientName: (ongoingSession.userId as any)?.name,
            patientProfileImage: (ongoingSession.userId as any)?.profileImage,
            timeRange: `${ongoingSession.appointmentTime} - ${ongoingSession.appointmentEndTime}`,
            reasonTitle: this.decryptValue(ongoingSession.reasonTitle),
            status: ongoingSession.status,
          }
        : null,
      stats: {
        completedCount: counts.completedCount,
        cancelledCount: counts.cancelledCount,
      },
      upcomingAppointments: allAppointments.map((a) => ({
        _id: a._id,
        patientName: (a.userId as any)?.name,
        patientProfileImage: (a.userId as any)?.profileImage,
        timeRange: `${a.appointmentTime} - ${a.appointmentEndTime}`,
        reasonTitle: this.decryptValue(a.reasonTitle),
        date: a.appointmentDate,
        status: a.status,
      })),
    };
  }

  private async getStatsCounts(doctorId: string) {
    const filter = {
      doctorId: new Types.ObjectId(doctorId),
    };
    const [completedCount, cancelledCount] = await Promise.all([
      this.appointmentModel.countDocuments({
        ...filter,
        status: AppointmentStatus.COMPLETED,
      }),
      this.appointmentModel.countDocuments({
        ...filter,
        status: AppointmentStatus.CANCELLED,
      }),
    ]);
    return { completedCount, cancelledCount };
  }

  async getAppointmentDetails(
    appointmentId: string,
    userId: string,
  ): Promise<AppointmentDetailsDto> {
    const appointment = await this.appointmentModel
      .findOne({
        _id: new Types.ObjectId(appointmentId),
        userId: new Types.ObjectId(userId),
      })
      .populate({
        path: 'doctorId',
        select: 'userId currentOrganization experienceYears',
        populate: { path: 'userId', select: 'name profileImage' },
      })
      .populate('specialistId', 'name')
      .populate('attachments')
      .lean();

    if (!appointment) {
      throw new NotFoundException(
        'Appointment not found or you do not have access to it',
      );
    }

    const doctorId = (appointment.doctorId as any)._id;
    const [ratingStats] = await this.reviewModel.aggregate([
      { $match: { doctorId: new Types.ObjectId(doctorId) } },
      {
        $group: {
          _id: '$doctorId',
          total: { $sum: 1 },
          average: { $avg: '$rating' },
        },
      },
    ]);

    const totalReviews = ratingStats?.total || 0;
    const averageRating =
      totalReviews > 0 ? parseFloat((ratingStats.average || 0).toFixed(1)) : 0;

    const attachments = await this.formatAttachments(
      (appointment as any).attachments || [],
      userId,
    );

    const doctorInfo: DoctorInfoDto = {
      name: (appointment.doctorId as any)?.userId?.name || 'Unknown Doctor',
      specialty: (appointment.specialistId as any)?.name || 'General',
      organization:
        (appointment.doctorId as any)?.currentOrganization || 'Not specified',
      rating: averageRating,
      totalReviews,
      experienceYears: (appointment.doctorId as any)?.experienceYears,
      profileImage: (appointment.doctorId as any)?.userId?.profileImage,
      userId: (appointment.doctorId as any)?.userId?._id?.toString(),
    };

    return {
      _id: appointment._id.toString(),
      appointmentDate: appointment.appointmentDate,
      appointmentTime: appointment.appointmentTime,
      appointmentEndTime: appointment.appointmentEndTime,
      status: appointment.status,
      consultationFee: appointment.consultationFee,
      reasonTitle: this.decryptValue(appointment.reasonTitle),
      reasonDetails: this.decryptValue(appointment.reasonDetails),
      doctorInfo,
      attachments,
      doctorTimezone:
        (appointment.doctorId as any)?.userId?.timezone || 'Africa/Lagos',
      createdAt: (appointment as any).createdAt,
    };
  }

  async getAppointmentDetailsForDoctor(
    appointmentId: string,
    userId: string,
    doctorId?: string,
  ) {
    let targetDoctorId: Types.ObjectId;

    if (doctorId && Types.ObjectId.isValid(doctorId)) {
      targetDoctorId = new Types.ObjectId(doctorId);
    } else {
      const doctor = await this.doctorModel.findOne({ userId }).lean();
      if (!doctor) throw new NotFoundException('Doctor profile not found');
      targetDoctorId = doctor._id as Types.ObjectId;
    }

    const appointment = await this.appointmentModel
      .findOne({
        _id: new Types.ObjectId(appointmentId),
        doctorId: targetDoctorId,
      })
      .populate({
        path: 'userId',
        select: 'name profileImage dateOfBirth phone allergies bloodGroup',
      })
      .populate('specialistId', 'name')
      .populate('attachments')
      .lean();

    if (!appointment) {
      throw new NotFoundException(
        'Appointment not found or you do not have permission',
      );
    }

    const attachments = await this.formatAttachments(
      (appointment as any).attachments || [],
      userId,
    );

    return {
      _id: appointment._id.toString(),
      appointmentDate: appointment.appointmentDate,
      appointmentTime: appointment.appointmentTime,
      appointmentEndTime: appointment.appointmentEndTime,
      status: appointment.status,
      consultationFee: appointment.consultationFee,
      reasonTitle: this.decryptValue(appointment.reasonTitle),
      reasonDetails: this.decryptValue(appointment.reasonDetails),
      patient: this.decryptPatientPHI(appointment.userId),
      attachments,
      createdAt: (appointment as any).createdAt,
    };
  }

  async findById(id: string) {
    const appt = await this.appointmentModel.findById(id).lean();
    return this.enrichAppointmentData(appt);
  }

  private async enrichAppointmentData(appt: any, viewerId?: string) {
    if (!appt) return null;

    appt.reasonTitle = this.decryptValue(appt.reasonTitle);
    appt.reasonDetails = this.decryptValue(appt.reasonDetails);

    if (appt.doctorId?.userId?.phone) {
      appt.doctorId.userId.phone = this.decryptValue(
        appt.doctorId.userId.phone,
      );
    }
    if (appt.userId?.phone) {
      appt.userId.phone = this.decryptValue(appt.userId.phone);
    }

    if (appt.attachments && appt.attachments.length > 0) {
      appt.attachments = await this.formatAttachments(
        appt.attachments,
        viewerId,
      );
    }
    return appt;
  }

  async getAll(query: any = {}) {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (query.status) filter.status = query.status;
    if (query.doctorId && Types.ObjectId.isValid(query.doctorId)) {
      filter.doctorId = new Types.ObjectId(query.doctorId);
    }
    if (query.userId && Types.ObjectId.isValid(query.userId)) {
      filter.userId = new Types.ObjectId(query.userId);
    }

    const [data, total] = await Promise.all([
      this.appointmentModel
        .find(filter)
        .populate({
          path: 'userId',
          select: 'name email profileImage',
        })
        .populate('specialistId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.appointmentModel.countDocuments(filter),
    ]);

    const projectedData = data.map((appt: any) => ({
      _id: appt._id,
      patientName: appt.userId?.name || 'Unknown',
      patientEmail: appt.userId?.email,
      patientProfileImage: appt.userId?.profileImage,
      specialtyName: appt.specialistId?.name || 'General',
      reasonTitle: this.decryptValue(appt.reasonTitle),
      appointmentDate: appt.appointmentDate,
      appointmentTime: appt.appointmentTime,
      status: appt.status,
      consultationFee: appt.consultationFee,
      createdAt: appt.createdAt,
    }));

    return {
      data: projectedData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getDetailsForAdmin(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid appointment ID');
    }

    const appointment = await this.appointmentModel
      .findById(id)
      .populate({
        path: 'userId',
        select:
          'name email phone profileImage dateOfBirth allergies bloodGroup',
      })
      .populate({
        path: 'doctorId',
        select: 'userId currentOrganization experienceYears',
        populate: { path: 'userId', select: 'name email phone profileImage' },
      })
      .populate('specialistId', 'name')
      .populate('attachments')
      .lean();

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    const doctorDetails = appointment.doctorId as any;
    if (doctorDetails?.userId?.phone) {
      doctorDetails.userId.phone = this.decryptValue(
        doctorDetails.userId.phone,
      );
    }

    const attachments = await this.formatAttachments(
      (appointment as any).attachments || [],
      (appointment.userId as any)._id.toString(),
    );

    return {
      _id: appointment._id.toString(),
      appointmentDate: appointment.appointmentDate,
      appointmentTime: appointment.appointmentTime,
      appointmentEndTime: appointment.appointmentEndTime,
      status: appointment.status,
      consultationFee: appointment.consultationFee,
      reasonTitle: this.decryptValue(appointment.reasonTitle),
      reasonDetails: this.decryptValue(appointment.reasonDetails),
      createdAt: (appointment as any).createdAt,
      patient: this.decryptPatientPHI(appointment.userId),
      doctor: doctorDetails,
      specialty: (appointment.specialistId as any)?.name || 'General',
      attachments,
    };
  }

  // Helpers
  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  private decryptValue(value?: string): string {
    return value ? this.encryptionService.decrypt(value) || '' : '';
  }

  private decryptPatientPHI(patient: any): any {
    if (!patient) return null;
    return {
      ...patient,
      userId: patient._id?.toString(),
      phone: this.decryptValue(patient.phone),
      dateOfBirth: this.decryptValue(patient.dateOfBirth),
      allergies: this.decryptAllergies(patient.allergies),
    };
  }

  private decryptAllergies(allergies?: string): string[] {
    if (!allergies) return [];
    const decrypted = this.encryptionService.decrypt(allergies);
    if (!decrypted) return [];
    try {
      return JSON.parse(decrypted);
    } catch {
      return [];
    }
  }

  private async formatAttachments(
    attachments: any[],
    userId?: string,
  ): Promise<AttachmentDto[]> {
    return Promise.all(
      (attachments || []).map(async (att: any) => {
        const url = att.fileKey
          ? await this.uploadsService.generateViewUrl(att.fileKey, userId)
          : '';
        return {
          _id: att._id.toString(),
          fileKey: att.fileKey || '',
          fileType: att.fileType || '',
          url,
          createdAt: att.createdAt,
        };
      }),
    );
  }
}
