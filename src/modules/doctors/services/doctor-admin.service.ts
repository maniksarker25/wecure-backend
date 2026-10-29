import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Doctor, DoctorDocument } from '../schemas/doctor.schema';
import {
  DoctorService,
  DoctorServiceDocument,
} from '../schemas/doctor-service.schema';
import {
  DoctorExperience,
  DoctorExperienceDocument,
} from '../schemas/doctor-experience.schema';
import { UploadsService } from '../../uploads/uploads.service';
import { EncryptionService } from 'src/common/services/encryption.service';

@Injectable()
export class DoctorAdminService {
  constructor(
    @InjectModel(Doctor.name)
    private doctorModel: Model<DoctorDocument>,
    @InjectModel(DoctorService.name)
    private doctorServiceModel: Model<DoctorServiceDocument>,
    @InjectModel(DoctorExperience.name)
    private doctorExperienceModel: Model<DoctorExperienceDocument>,

    private readonly uploadsService: UploadsService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async getAllDoctorsForAdmin(adminId: string, query: any) {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (query.status) {
      filter.verificationStatus = query.status;
    }

    const [doctors, total] = await Promise.all([
      this.doctorModel
        .find(filter)
        .populate('userId', 'name email phone doctorId')
        .populate('specialtyId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.doctorModel.countDocuments(filter),
    ]);

    // Fetch experiences and services for all these doctors in one go for efficiency
    const doctorIds = doctors.map((d) => d._id);
    const [allExperiences, allServices] = await Promise.all([
      this.doctorExperienceModel
        .find({
          doctorId: { $in: doctorIds },
        })
        .sort({ isCurrent: -1, startDate: -1 }),
      this.doctorServiceModel.find({
        doctorId: { $in: doctorIds },
      }),
    ]);

    // Create maps for efficient lookup
    const expMap = allExperiences.reduce((acc, exp) => {
      const id = exp.doctorId.toString();
      if (!acc[id]) acc[id] = [];
      acc[id].push(exp);
      return acc;
    }, {});

    const servicesMap = allServices.reduce((acc, service) => {
      const id = service.doctorId.toString();
      if (!acc[id]) acc[id] = [];
      acc[id].push(service);
      return acc;
    }, {});

    // Generate pre-signed URLs for verification documents and add experience/services
    for (const doctor of doctors) {
      // Decrypt phone number if it exists
      const user = doctor.userId as any;
      if (user && user.phone) {
        user.phone = this.encryptionService.decrypt(user.phone);
      }

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

      await this.addVerificationDocumentUrls(doctor, adminId);

      const doctorIdStr = doctor._id.toString();
      const doctorExp = expMap[doctorIdStr] || [];
      const doctorServices = servicesMap[doctorIdStr] || [];

      // Add totalYears to each experience
      const experiencesWithYears = doctorExp.map((exp) => ({
        ...(exp.toObject ? exp.toObject() : exp),
        totalYears: this.calculateExperienceYears(exp),
      }));

      // Add total experience years (prefer pre-calculated field if exists)
      if (
        doctor.experienceYears !== undefined &&
        doctor.experienceYears !== null
      ) {
        (doctor as any).totalExperienceYears = doctor.experienceYears;
      } else {
        (doctor as any).totalExperienceYears =
          this.calculateTotalExperience(doctorExp);
      }

      // Add services and experiences arrays
      (doctor as any).services = doctorServices;
      (doctor as any).experiences = experiencesWithYears;
    }

    return {
      data: doctors,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getDoctorByIdForAdmin(doctorId: string, adminId: string) {
    const doctor = await this.doctorModel
      .findById(doctorId)
      .populate('userId', 'name email phone profileImage doctorId')
      .populate('specialtyId', 'name')
      .lean();

    if (!doctor) throw new NotFoundException('Doctor not found');

    // Decrypt phone number
    const user = doctor.userId as any;
    if (user && user.phone) {
      user.phone = this.encryptionService.decrypt(user.phone);
    }

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

    await this.addVerificationDocumentUrls(doctor, adminId);

    // Parallel fetch for services and experiences
    const [services, experiences] = await Promise.all([
      this.doctorServiceModel.find({ doctorId: doctor._id }).lean(),
      this.doctorExperienceModel
        .find({ doctorId: doctor._id })
        .sort({ isCurrent: -1, startDate: -1 })
        .lean(),
    ]);

    // Add totalYears to each experience
    const experiencesWithYears = experiences.map((exp) => ({
      ...exp,
      totalYears: this.calculateExperienceYears(exp),
    }));

    // Add total experience
    (doctor as any).totalExperienceYears =
      this.calculateTotalExperience(experiences);

    return {
      ...doctor,
      services,
      experiences: experiencesWithYears,
    };
  }

  private async addVerificationDocumentUrls(
    doctor: Record<string, any>,
    adminId: string,
  ) {
    const documentFields = [
      'mdcnPracticingLicenseDocument',
      'governmentIdDocument',
      'medicalDegreeDocument',
      'specialtyCertificateDocument',
    ] as const;

    await Promise.all(
      documentFields.map(async (field) => {
        if (doctor[field]) {
          doctor[field] = await this.uploadsService.generateViewUrl(
            doctor[field],
            adminId,
          );
        }
      }),
    );
  }

  private calculateTotalExperience(experiences: any[]): number {
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

  private calculateExperienceYears(experience: any): number {
    const start = new Date(experience.startDate);
    const end =
      experience.isCurrent || !experience.endDate
        ? new Date()
        : new Date(experience.endDate);

    const diffMonths =
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth());

    return diffMonths > 0 ? Math.floor(diffMonths / 12) : 0;
  }
}
