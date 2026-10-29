import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UPLOAD_FOLDERS } from 'src/common/constants/constants';
import { EncryptionService } from 'src/common/services/encryption.service';
import { AppointmentManagerService } from '../../appointments/services/appointment-manager.service';
import { AvailabilityService } from '../../availability/availability.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { PaystackService } from '../../payments/paystack.service';
import { PublicUploadService } from '../../public-upload/public-upload.service';
import { Review, ReviewDocument } from '../../reviews/schemas/review.schema';
import { SpecialistService } from '../../specialist/specialist.service';
import { UploadsService } from '../../uploads/uploads.service';
import { UsersService } from '../../users/users.service';
import { AddBankDetailsDto } from '../dto/add-bank-details.dto';
import { AddExperienceDto } from '../dto/add-experience.dto';
import { UpdateExperienceDto } from '../dto/update-experience.dto';
import {
  DoctorExperience,
  DoctorExperienceDocument,
} from '../schemas/doctor-experience.schema';
import {
  DoctorService,
  DoctorServiceDocument,
} from '../schemas/doctor-service.schema';
import { Doctor, DoctorDocument } from '../schemas/doctor.schema';

@Injectable()
export class DoctorManagementService {
  constructor(
    @InjectModel(Doctor.name)
    private doctorModel: Model<DoctorDocument>,
    @InjectModel(DoctorService.name)
    private doctorServiceModel: Model<DoctorServiceDocument>,
    @InjectModel(DoctorExperience.name)
    private doctorExperienceModel: Model<DoctorExperienceDocument>,
    @InjectModel(Review.name)
    private reviewModel: Model<ReviewDocument>,

    private readonly uploadsService: UploadsService,
    @Inject(forwardRef(() => AvailabilityService))
    private readonly availabilityService: AvailabilityService,

    @Inject(forwardRef(() => AppointmentManagerService))
    private readonly appointmentManagerService: AppointmentManagerService,

    private readonly usersService: UsersService,
    private readonly publicUploadService: PublicUploadService,
    private readonly notificationsService: NotificationsService,
    private readonly paystackService: PaystackService,
    private readonly encryptionService: EncryptionService,
    private readonly specialistService: SpecialistService,
  ) {}
  // ---------- Doctor Profile ----------
  async createProfile(userId: string, dto: any) {
    const exists = await this.doctorModel.findOne({ userId });
    if (exists) throw new ForbiddenException('Doctor profile already exists');

    const { name, phone, ...doctorData } = dto;
    await this.validateSpecialty(doctorData.specialtyId);

    if (name || phone) {
      await this.usersService.updateProfile(userId, { name, phone });
    }

    return this.doctorModel.create({
      userId,
      ...doctorData,
    });
  }

  async updateProfile(userId: string, dto: any, file?: Express.Multer.File) {
    const doctor = await this.doctorModel.findOne({ userId });
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    const { name, phone, timezone, ...doctorData } = dto;
    await this.validateSpecialty(doctorData.specialtyId);

    const verificationDetailsChanged =
      (dto.mdcnRegistrationNumber !== undefined &&
        dto.mdcnRegistrationNumber !== doctor.mdcnRegistrationNumber) ||
      (dto.mdcnPracticingLicenseExpiryDate !== undefined &&
        new Date(dto.mdcnPracticingLicenseExpiryDate).getTime() !==
          doctor.mdcnPracticingLicenseExpiryDate?.getTime());
    if (verificationDetailsChanged) {
      doctorData.verificationStatus = 'PENDING';
      doctorData.isVerified = false;
    }

    const userUpdate: any = {};
    if (name) {
      userUpdate.name = name;
    }
    if (phone) {
      userUpdate.phone = phone;
    }
    if (timezone) {
      userUpdate.timezone = timezone;
    }
    if (file) {
      const imageUrl = await this.publicUploadService.handleUpload(
        file,
        UPLOAD_FOLDERS.USER_PROFILES,
      );
      userUpdate.profileImage = imageUrl;
    }

    if (Object.keys(userUpdate).length > 0) {
      await this.usersService.updateProfile(userId, userUpdate);
    }

    return this.doctorModel
      .findByIdAndUpdate(doctor._id, doctorData, { new: true })
      .populate('userId', 'name email phone profileImage timezone')
      .populate('specialtyId', 'name');
  }

  private async validateSpecialty(specialtyId?: string) {
    if (!specialtyId) return;

    const isAvailable = await this.specialistService.isAvailable(specialtyId);
    if (!isAvailable) {
      throw new BadRequestException('Specialty not found or inactive');
    }
  }

  async getMyProfile(userId: string) {
    const doctor = await this.doctorModel
      .findOne({ userId })
      .populate('userId', 'name email phone profileImage timezone')
      .populate('specialtyId', 'name')
      .lean();
    if (!doctor) return null;

    // Decrypt phone number if it exists in populated userId
    if (doctor.userId && (doctor.userId as any).phone) {
      const user = doctor.userId as any;
      user.phone = this.encryptionService.isEncrypted(user.phone)
        ? this.encryptionService.decrypt(user.phone)
        : user.phone;
    }

    // Run all dependent queries in parallel instead of sequentially
    const [experiences, services, ratingAgg, verificationUrls] =
      await Promise.all([
        this.doctorExperienceModel.find({ doctorId: doctor._id }).lean(),
        this.doctorServiceModel.find({ doctorId: doctor._id }).lean(),
        this.reviewModel.aggregate([
          {
            $match: {
              $or: [
                { doctorId: doctor._id },
                { doctorId: doctor._id.toString() },
              ],
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              average: { $avg: '$rating' },
            },
          },
        ]),
        this.getVerificationDocumentUrls(doctor, userId),
      ]);

    // Apply results
    Object.assign(doctor, verificationUrls);
    (doctor as any).totalExperienceYears =
      this.calculateTotalExperience(experiences);
    (doctor as any).services = services;

    const [ratingStats] = ratingAgg;
    (doctor as any).averageRating =
      (ratingStats?.total || 0) > 0
        ? parseFloat((ratingStats.average || 0).toFixed(1))
        : 0;

    // Decrypt bank details if they exist
    if (doctor.bankName) {
      doctor.bankName = this.encryptionService.isEncrypted(doctor.bankName)
        ? this.encryptionService.decrypt(doctor.bankName)
        : doctor.bankName;
    }
    if (doctor.accountName) {
      doctor.accountName = this.encryptionService.isEncrypted(
        doctor.accountName,
      )
        ? this.encryptionService.decrypt(doctor.accountName)
        : doctor.accountName;
    }
    if (doctor.accountNumber) {
      doctor.accountNumber = this.encryptionService.isEncrypted(
        doctor.accountNumber,
      )
        ? this.encryptionService.decrypt(doctor.accountNumber)
        : doctor.accountNumber;
    }

    return doctor;
  }

  /**
   * Lightweight helper — returns ONLY _id for the given userId.
   * Use this instead of getMyProfile() when only the doctor's _id is needed,
   * to avoid triggering the full 4-query profile chain.
   */
  async getDoctorLean(userId: string): Promise<{ _id: Types.ObjectId } | null> {
    return this.doctorModel
      .findOne({ userId })
      .select('_id')
      .lean<{ _id: Types.ObjectId }>();
  }

  async addBankDetails(userId: string, dto: AddBankDetailsDto) {
    const doctor = await this.doctorModel.findOne({ userId });
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    const accountNumber = dto.accountNumber.trim();
    const bankCode = dto.bankCode.trim();
    const resolvedAccount = await this.paystackService.resolveBankAccount(
      accountNumber,
      bankCode,
    );

    if (!resolvedAccount?.account_name) {
      throw new BadRequestException('Unable to verify bank account details');
    }

    const banks = await this.paystackService.listBanks();
    const bank = banks.find((item) => item.code === bankCode);
    const bankName = bank?.name || dto.bankName?.trim();

    if (!bankName) {
      throw new BadRequestException('Bank code is not supported by Paystack');
    }

    const recipient = await this.paystackService.createTransferRecipient(
      resolvedAccount.account_name,
      accountNumber,
      bankCode,
    );

    if (!recipient?.recipient_code) {
      throw new BadRequestException('Unable to create Paystack recipient');
    }

    const updateData = {
      bankName: this.encryptionService.encrypt(bankName),
      bankCode: this.encryptionService.encrypt(bankCode),
      accountName: this.encryptionService.encrypt(resolvedAccount.account_name),
      accountNumber: this.encryptionService.encrypt(accountNumber),
      paystackRecipientCode: recipient.recipient_code,
      recipientCreatedAt: new Date(),
    };

    return this.doctorModel.findByIdAndUpdate(doctor._id, updateData, {
      new: true,
    });
  }

  async getBankDetails(userId: string) {
    const doctor = await this.doctorModel
      .findOne({ userId })
      .select('bankName bankCode accountName accountNumber paystackRecipientCode')
      .lean();
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    return {
      bankName: doctor.bankName
        ? this.encryptionService.isEncrypted(doctor.bankName)
          ? this.encryptionService.decrypt(doctor.bankName)
          : doctor.bankName
        : null,
      accountName: doctor.accountName
        ? this.encryptionService.isEncrypted(doctor.accountName)
          ? this.encryptionService.decrypt(doctor.accountName)
          : doctor.accountName
        : null,
      accountNumber: doctor.accountNumber
        ? this.encryptionService.isEncrypted(doctor.accountNumber)
          ? this.encryptionService.decrypt(doctor.accountNumber)
          : doctor.accountNumber
        : null,
      bankCode: doctor.bankCode
        ? this.encryptionService.isEncrypted(doctor.bankCode)
          ? this.encryptionService.decrypt(doctor.bankCode)
          : doctor.bankCode
        : null,
      hasRecipient: !!doctor.paystackRecipientCode,
    };
  }

  // ---------- Services ----------
  async addService(userId: string, name: string) {
    const doctor = await this.doctorModel.findOne({ userId });
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    return this.doctorServiceModel.create({
      doctorId: doctor._id,
      name,
    });
  }

  async listServices(doctorId: string) {
    return this.doctorServiceModel.find({ doctorId }).lean();
  }

  async deleteService(userId: string, serviceId: string) {
    const doctor = await this.doctorModel.findOne({ userId });
    if (!doctor) throw new NotFoundException();

    return this.doctorServiceModel.deleteOne({
      _id: serviceId,
      doctorId: doctor._id,
    });
  }

  // ---------- Experiences ----------
  async addExperience(userId: string, dto: AddExperienceDto) {
    const doctor = await this.doctorModel.findOne({ userId });
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    const experience = await this.doctorExperienceModel.create({
      doctorId: doctor._id,
      ...dto,
    });

    await this.updateDoctorTotalExperience(doctor._id.toString());

    return experience;
  }

  async updateExperience(
    userId: string,
    experienceId: string,
    dto: UpdateExperienceDto,
  ) {
    const doctor = await this.doctorModel.findOne({ userId });
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    const experience = await this.doctorExperienceModel.findOneAndUpdate(
      { _id: experienceId, doctorId: doctor._id },
      dto,
      { new: true },
    );

    if (!experience) throw new NotFoundException('Experience not found');

    await this.updateDoctorTotalExperience(doctor._id.toString());

    return experience;
  }

  async deleteExperience(userId: string, experienceId: string) {
    const doctor = await this.doctorModel.findOne({ userId });
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    const result = await this.doctorExperienceModel.deleteOne({
      _id: experienceId,
      doctorId: doctor._id,
    });

    if (result.deletedCount === 0) {
      throw new NotFoundException('Experience not found');
    }

    await this.updateDoctorTotalExperience(doctor._id.toString());

    return { success: true };
  }

  private async updateDoctorTotalExperience(doctorId: string) {
    const experiences = await this.doctorExperienceModel.find({ doctorId });
    const totalYears = this.calculateTotalExperience(experiences);
    await this.doctorModel.findByIdAndUpdate(doctorId, {
      experienceYears: totalYears,
    });
  }

  async listExperiences(doctorId: string) {
    return this.doctorExperienceModel
      .find({ doctorId: new Types.ObjectId(doctorId) })
      .sort({ isCurrent: -1, startDate: -1 })
      .lean();
  }

  calculateTotalExperience(experiences: any[]): number {
    if (!experiences || experiences.length === 0) return 0;

    let totalMonths = 0;
    const now = new Date();

    experiences.forEach((exp) => {
      const start = new Date(exp.startDate);
      const end = exp.isCurrent || !exp.endDate ? now : new Date(exp.endDate);

      const diffMonths =
        (end.getFullYear() - start.getFullYear()) * 12 +
        (end.getMonth() - start.getMonth());

      if (diffMonths > 0) {
        totalMonths += diffMonths;
      }
    });

    return Math.floor(totalMonths / 12);
  }

  // ---------- Verification ----------
  async uploadVerificationDocuments(
    userId: string,
    files: Record<string, Express.Multer.File[]>,
  ) {
    const doctor = await this.doctorModel.findOne({ userId });
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    const documentFields = [
      'mdcnPracticingLicenseDocument',
      'governmentIdDocument',
      'medicalDegreeDocument',
      'specialtyCertificateDocument',
    ] as const;
    const uploads = await Promise.all(
      documentFields.flatMap((field) =>
        (files[field] || []).map(async (file) => ({
          field,
          key: await this.uploadsService.uploadBuffer(
            file.buffer,
            file.mimetype,
            'verifications',
            file.originalname,
            userId,
          ),
        })),
      ),
    );

    for (const upload of uploads) {
      doctor[upload.field] = upload.key;
    }
    doctor.verificationStatus = 'PENDING';
    doctor.isVerified = false;
    await doctor.save();
    return doctor;
  }

  async updateVerificationStatus(
    doctorId: string,
    status: string,
    note?: string,
  ) {
    const doctor = await this.doctorModel
      .findById(doctorId)
      .populate('userId', 'name email');
    if (!doctor) throw new NotFoundException('Doctor not found');

    const previousStatus = doctor.verificationStatus;
    const user = doctor.userId as any;

    if (status === 'VERIFIED') {
      if (!doctor.mdcnRegistrationNumber?.trim()) {
        throw new BadRequestException(
          'MDCN registration number is required to verify this doctor',
        );
      }
      if (!doctor.mdcnPracticingLicenseDocument) {
        throw new BadRequestException(
          'MDCN practising licence document is required to verify this doctor',
        );
      }
      if (
        !doctor.mdcnPracticingLicenseExpiryDate ||
        doctor.mdcnPracticingLicenseExpiryDate <= new Date()
      ) {
        throw new BadRequestException(
          'A current MDCN practising licence is required to verify this doctor',
        );
      }
    }

    const updateData: any = {
      verificationStatus: status,
      verificationNote: note || '',
    };

    // Update isVerified for backward compatibility
    if (status === 'VERIFIED') {
      updateData.isVerified = true;
    } else {
      updateData.isVerified = false;
    }

    const updatedDoctor = await this.doctorModel.findByIdAndUpdate(
      doctorId,
      updateData,
      { new: true },
    );

    // Emit events for notifications (replaces direct mail calls)
    if (user) {
      if (status === 'VERIFIED') {
        if (previousStatus === 'SUSPENDED') {
          this.notificationsService.emit('doctor.unsuspended', {
            doctorId,
            userId: user._id,
            email: user.email,
            name: user.name,
          });
        } else if (previousStatus !== 'VERIFIED') {
          this.notificationsService.emit('doctor.verified', {
            doctorId,
            userId: user._id,
            email: user.email,
            name: user.name,
          });
        }
      } else if (status === 'REJECTED') {
        this.notificationsService.emit('doctor.rejected', {
          doctorId,
          userId: user._id,
          email: user.email,
          name: user.name,
          note,
        });
        // Side effects (non-blocking)
        this.availabilityService.deactivateAllForDoctor(doctorId);
        this.appointmentManagerService.cancelUpcomingForDoctor(doctorId);
      } else if (status === 'SUSPENDED') {
        this.notificationsService.emit('doctor.suspended', {
          doctorId,
          userId: user._id,
          email: user.email,
          name: user.name,
          note,
        });
        // Side effects (non-blocking)
        this.availabilityService.deactivateAllForDoctor(doctorId);
        this.appointmentManagerService.cancelUpcomingForDoctor(doctorId);
      }
    }

    return updatedDoctor;
  }

  private async getVerificationDocumentUrls(
    doctor: Record<string, any>,
    viewerId: string,
  ) {
    const documentFields = [
      'mdcnPracticingLicenseDocument',
      'governmentIdDocument',
      'medicalDegreeDocument',
      'specialtyCertificateDocument',
    ] as const;

    return Object.fromEntries(
      await Promise.all(
        documentFields
          .filter((field) => doctor[field])
          .map(async (field) => [
            field,
            await this.uploadsService.generateViewUrl(doctor[field], viewerId),
          ]),
      ),
    );
  }
}
