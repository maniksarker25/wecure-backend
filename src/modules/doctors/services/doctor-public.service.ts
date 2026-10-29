import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { SearchDoctorDto } from '../dto/search-doctor.dto';

import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CACHE_TTL, generateCacheKey } from 'src/config/cache.config';
import {
  getBusinessDayOfWeek,
  getBusinessNow,
} from 'src/common/utils/business-time.util';
import { AvailabilityService } from '../../availability/availability.service';
import { Review, ReviewDocument } from '../../reviews/schemas/review.schema';
import { DoctorAggregationHelper } from '../helpers/doctor-aggregation.helper';
import { DoctorSlotsHelper } from '../helpers/doctor-slots.helper';
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
export class DoctorPublicService {
  private readonly logger = new Logger(DoctorPublicService.name);
  constructor(
    @InjectModel(Doctor.name)
    private doctorModel: Model<DoctorDocument>,
    @InjectModel(DoctorService.name)
    private doctorServiceModel: Model<DoctorServiceDocument>,
    @InjectModel(DoctorExperience.name)
    private doctorExperienceModel: Model<DoctorExperienceDocument>,
    @InjectModel(Review.name)
    private reviewModel: Model<ReviewDocument>,

    @Inject(forwardRef(() => AvailabilityService))
    private readonly availabilityService: AvailabilityService,
    private readonly aggregationHelper: DoctorAggregationHelper,
    private readonly slotsHelper: DoctorSlotsHelper,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async getPublicProfile(doctorId: string) {
    // Generate cache key
    const cacheKey = generateCacheKey('doctor_profile', { id: doctorId });

    // Try to get from cache
    try {
      const isDevelopment = process.env.NODE_ENV === 'development';
      const cacheEnabled = process.env.ENABLE_CACHE === 'true';

      if (!isDevelopment || cacheEnabled) {
        const cached = await this.cacheManager.get(cacheKey);
        if (cached) {
          this.logger.debug(`Cache HIT: ${cacheKey}`);
          return cached;
        }
      }
    } catch (error:any) {
      this.logger.warn(`Cache read failed: ${error.message}`);
    }

    // Query database
    const doctor = await this.doctorModel
      .findOne({ _id: doctorId, isVerified: true })
      .select(
        '-mdcnRegistrationNumber -mdcnPracticingLicenseExpiryDate -mdcnPracticingLicenseDocument -governmentIdDocument -medicalDegreeDocument -specialtyCertificateDocument',
      )
      .populate('userId', 'name email profileImage timezone')
      .populate('specialtyId', 'name')
      .lean();

    if (!doctor) throw new NotFoundException('Doctor not found');

    // Run all queries in parallel for better performance
    const [services, experiences, reviews, ratingStats, availability] =
      await Promise.all([
        this.doctorServiceModel.find({ doctorId: doctor._id }).lean(),
        this.doctorExperienceModel
          .find({ doctorId: doctor._id })
          .sort({ isCurrent: -1, startDate: -1 })
          .lean(),
        this.reviewModel
          .find({
            $or: [
              { doctorId: doctor._id },
              { doctorId: doctor._id.toString() },
            ],
          })
          .populate('userId', 'name profileImage')
          .sort({ createdAt: -1 })
          .limit(10)
          .lean(),
        this.getDoctorRatingStats(doctor._id),
        this.availabilityService.getByDoctor(doctor._id as Types.ObjectId),
      ]);

    const calculatedYears = this.calculateTotalExperience(experiences);
    (doctor as any).totalExperienceYears = Math.max(
      (doctor as any).experienceYears || 0,
      calculatedYears,
    );

    // Calculate simple slots for each availability entry so public profile shows sample slots
    const doctorTz = (doctor.userId as any)?.timezone || 'Africa/Lagos';
    const { dateOnly: today } = getBusinessNow(doctorTz);
    const dayNames = [
      'SUNDAY',
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
    ];

    const availabilityWithSlots = (availability || []).map((a) => {
      try {
        const slots = this.availabilityService.generateSlots(
          a.startTime,
          a.endTime,
          a.slotSizeMinutes,
        );
        const isToday = a.dayOfWeek === dayNames[getBusinessDayOfWeek(today)];
        const filtered = this.slotsHelper.filterPastSlots(slots, isToday, doctorTz);
        return { ...a, totalSlots: filtered.length };
      } catch (e) {
        return { ...a, totalSlots: 0 };
      }
    });

    const result = {
      doctor,
      services,
      experiences,
      rating: ratingStats,
      reviews,
      availability: availabilityWithSlots,
    };

    // Store in cache (5 minutes TTL)
    try {
      const isDevelopment = process.env.NODE_ENV === 'development';
      const cacheEnabled = process.env.ENABLE_CACHE === 'true';

      if (!isDevelopment || cacheEnabled) {
        await this.cacheManager.set(
          cacheKey,
          result,
          CACHE_TTL.DOCTOR_PROFILE * 1000,
        );
        this.logger.debug(`Cache SET: ${cacheKey}`);
      }
    } catch (error) {
      this.logger.warn(`Cache write failed: ${error.message}`);
    }
    return result;
  }

  async getPopularDoctors(query: SearchDoctorDto) {
    const page = parseInt(query.page as string) || 1;
    const limit = parseInt(query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const pipeline: PipelineStage[] = [
      // Match verified doctors only
      {
        $match: {
          isVerified: true,
          verificationStatus: 'VERIFIED',
        },
      },
      // Add helper pipeline stages
      this.aggregationHelper.addDoctorIdStringField(),
      this.aggregationHelper.lookupReviews(),
      this.aggregationHelper.calculateRatings(),
      this.aggregationHelper.lookupExperiences(),
      this.aggregationHelper.calculateExperience(),
      // Filter for doctors with rating >= 4
      {
        $match: {
          averageRating: { $gte: 4 },
        },
      },
      // Lookup user and specialty details
      ...this.aggregationHelper.lookupUserDetails(),
      ...this.aggregationHelper.lookupSpecialtyDetails(),
    ];

    // Sorting (Default to Rating)
    pipeline.push(this.aggregationHelper.sortByRating());

    // Count total (before pagination)
    const countPipeline: PipelineStage[] = [...pipeline, { $count: 'total' }];

    // Project and sort
    pipeline.push(
      this.aggregationHelper.projectDoctorCard(false) as PipelineStage,
    );
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const [data, countResult] = await Promise.all([
      this.doctorModel.aggregate(pipeline),
      this.doctorModel.aggregate(countPipeline),
    ]);

    const total = countResult[0]?.total ?? 0;

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getDoctorsBySpecialty(query: SearchDoctorDto, specialtyId?: string) {
    const page = parseInt(query.page as string) || 1;
    const limit = parseInt(query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const targetSpecialtyId = specialtyId || (query as any).specialtyId;

    const pipeline: PipelineStage[] = [
      // Match verified doctors with the given specialty
      {
        $match: {
          isVerified: true,
          verificationStatus: 'VERIFIED',
          $expr: {
            $or: [
              { $eq: ['$specialtyId', new Types.ObjectId(targetSpecialtyId)] },
              { $eq: [{ $toString: '$specialtyId' }, targetSpecialtyId] },
            ],
          },
        },
      },
      // Add helper pipeline stages
      this.aggregationHelper.addDoctorIdStringField(),
      this.aggregationHelper.lookupReviews(),
      this.aggregationHelper.calculateRatings(),
      this.aggregationHelper.lookupExperiences(),
      this.aggregationHelper.calculateExperience(),
      // Lookup availabilities and user details
      ...this.aggregationHelper.lookupAvailabilities(),
      ...this.aggregationHelper.lookupUserDetails(),
      ...this.aggregationHelper.lookupSpecialtyDetails(),
    ];

    // Sorting (Default to Rating)
    pipeline.push(this.aggregationHelper.sortByRating());

    // Count total (before pagination)
    const countPipeline: PipelineStage[] = [...pipeline, { $count: 'total' }];

    // Project (exclude raw availabilities) + paginate
    pipeline.push(
      this.aggregationHelper.projectDoctorCard(false) as PipelineStage,
    );
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const [data, countResult] = await Promise.all([
      this.doctorModel.aggregate(pipeline),
      this.doctorModel.aggregate(countPipeline),
    ]);

    const total = countResult[0]?.total ?? 0;

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async searchDoctors(query: SearchDoctorDto) {
    const page = parseInt(query.page as string) || 1;
    const limit = parseInt(query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // ── Base match: verified doctors only ──────────────────────────────
    const baseMatch: any = {
      isVerified: true,
      verificationStatus: 'VERIFIED',
    };

    // ── Build aggregation pipeline ─────────────────────────────────────
    const pipeline: PipelineStage[] = [
      { $match: baseMatch },

      // Enrich with reviews, ratings, experiences
      this.aggregationHelper.addDoctorIdStringField(),
      this.aggregationHelper.lookupReviews(),
      this.aggregationHelper.calculateRatings(),
      this.aggregationHelper.lookupExperiences(),
      this.aggregationHelper.calculateExperience(),

      // Availability (for fee)
      ...this.aggregationHelper.lookupAvailabilities(),

      // User + specialty details
      ...this.aggregationHelper.lookupUserDetails(),
      ...this.aggregationHelper.lookupSpecialtyDetails(),
    ];

    // ── Post-join filters ──────────────────────────────────────────────
    const postMatch: any = {};

    if (query.q) {
      const regex = { $regex: query.q, $options: 'i' };
      postMatch.$or = [{ 'user.name': regex }, { 'specialty.name': regex }];
    }

    if (Object.keys(postMatch).length > 0) {
      pipeline.push({ $match: postMatch });
    }

    // ── Sorting (Default to Rating) ────────────────────────────────────
    pipeline.push(this.aggregationHelper.sortByRating());

    // ── Count total (before pagination) ───────────────────────────────
    const countPipeline: PipelineStage[] = [...pipeline, { $count: 'total' }];

    // ── Project + paginate ─────────────────────────────────────────────
    pipeline.push(
      this.aggregationHelper.projectDoctorCard(false) as PipelineStage,
    );
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const [data, countResult] = await Promise.all([
      this.doctorModel.aggregate(pipeline),
      this.doctorModel.aggregate(countPipeline),
    ]);

    const total = countResult[0]?.total ?? 0;

    return {
      doctors: {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
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

  private async getDoctorRatingStats(doctorId: Types.ObjectId) {
    const doctorIdStr = doctorId.toString();

    const [result] = await this.reviewModel.aggregate([
      {
        $match: {
          $or: [{ doctorId }, { doctorId: doctorIdStr }],
        },
      },
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                average: { $avg: '$rating' },
              },
            },
          ],
          breakdown: [
            {
              $group: {
                _id: '$rating',
                count: { $sum: 1 },
              },
            },
          ],
        },
      },
    ]);

    const breakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const item of result?.breakdown || []) {
      const rating = Number(item._id);
      if (rating >= 1 && rating <= 5) {
        breakdown[rating] = item.count;
      }
    }

    const summary = result?.summary?.[0];
    const total = summary?.total || 0;
    const average =
      total > 0 ? parseFloat((summary?.average || 0).toFixed(1)) : 0;

    return { average, total, breakdown };
  }
}
