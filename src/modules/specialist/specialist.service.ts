import { Injectable, NotFoundException, Inject, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CreateSpecialistDto } from './dto/create-specialist.dto';
import { UpdateSpecialistDto } from './dto/update-specialist.dto';
import { Specialist, SpecialistDocument } from './schemas/specialist.schema';
import { PublicUploadService } from '../public-upload/public-upload.service';
import { CACHE_TTL, generateCacheKey } from 'src/config/cache.config';

interface SpecialistListResponse {
  data: Specialist[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class SpecialistService {
  private readonly logger = new Logger(SpecialistService.name);

  constructor(
    @InjectModel(Specialist.name)
    private specialistModel: Model<SpecialistDocument>,
    private readonly publicUploadService: PublicUploadService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async create(
    createSpecialistDto: CreateSpecialistDto,
    file?: Express.Multer.File,
  ) {
    let thumbnailUrl: string | undefined;

    // Upload thumbnail if file is provided
    if (file) {
      thumbnailUrl = await this.publicUploadService.handleUpload(
        file,
        'specialists',
      );
    }

    const createdSpecialist = new this.specialistModel({
      ...createSpecialistDto,
      thumbnail: thumbnailUrl || createSpecialistDto.thumbnail,
    });

    const result = await createdSpecialist.save();

    // Invalidate cache after creating specialist
    await this.invalidateCache();

    return result;
  }

  async findAll(query: any): Promise<SpecialistListResponse> {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter
    const filter: any = {};
    if (query.q) {
      filter.name = { $regex: query.q, $options: 'i' };
    }

    // Generate cache key (include q in key so searches are cached separately)
    const cacheKey = generateCacheKey('specialists', {
      page,
      limit,
      q: query.q || '',
    });

    // Try to get from cache
    try {
      const isDevelopment = process.env.NODE_ENV === 'development';
      const cacheEnabled = process.env.ENABLE_CACHE === 'true';

      if (!isDevelopment || cacheEnabled) {
        const cached =
          await this.cacheManager.get<SpecialistListResponse>(cacheKey);
        if (cached) {
          this.logger.debug(`Cache HIT: ${cacheKey}`);
          return cached as SpecialistListResponse;
        }
      }
    } catch (error) {
      this.logger.warn(`Cache read failed: ${error.message}`);
    }

    // Query database
    const [data, total] = await Promise.all([
      this.specialistModel.find(filter).skip(skip).limit(limit).exec(),
      this.specialistModel.countDocuments(filter),
    ]);

    const result = {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    // Store in cache
    try {
      const isDevelopment = process.env.NODE_ENV === 'development';
      const cacheEnabled = process.env.ENABLE_CACHE === 'true';

      if (!isDevelopment || cacheEnabled) {
        await this.cacheManager.set(
          cacheKey,
          result,
          CACHE_TTL.SPECIALISTS * 1000,
        );
        this.logger.debug(`Cache SET: ${cacheKey}`);
      }
    } catch (error) {
      this.logger.warn(`Cache write failed: ${error.message}`);
    }

    return result;
  }

  async findOne(id: string) {
    const specialist = await this.specialistModel.findById(id).exec();
    if (!specialist) {
      throw new NotFoundException(`Specialist with ID ${id} not found`);
    }
    return specialist;
  }

  async isAvailable(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;

    const specialist = await this.specialistModel
      .exists({ _id: id, isActive: true })
      .exec();

    return !!specialist;
  }

  async update(
    id: string,
    updateSpecialistDto: UpdateSpecialistDto,
    file?: Express.Multer.File,
  ) {
    const specialist = await this.findOne(id);
    let thumbnailUrl: string | undefined;

    // Upload new thumbnail if file is provided
    if (file) {
      // Delete old thumbnail if exists
      if (specialist.thumbnail) {
        try {
          await this.publicUploadService.deleteFile(specialist.thumbnail);
        } catch (error) {
          console.error('Failed to delete old thumbnail:', error);
        }
      }

      thumbnailUrl = await this.publicUploadService.handleUpload(
        file,
        'specialists',
      );
    }

    const updatedSpecialist = await this.specialistModel
      .findByIdAndUpdate(
        id,
        {
          ...updateSpecialistDto,
          ...(thumbnailUrl && { thumbnail: thumbnailUrl }),
        },
        { new: true },
      )
      .exec();

    if (!updatedSpecialist) {
      throw new NotFoundException(`Specialist with ID ${id} not found`);
    }

    // Invalidate cache after update
    await this.invalidateCache();

    return updatedSpecialist;
  }

  async remove(id: string) {
    const specialist = await this.specialistModel.findById(id).exec();
    if (!specialist) {
      throw new NotFoundException(`Specialist with ID ${id} not found`);
    }

    // Delete thumbnail from S3 if exists
    if (specialist.thumbnail) {
      try {
        await this.publicUploadService.deleteFile(specialist.thumbnail);
      } catch (error) {
        // Log error but don't fail deletion
        console.error('Failed to delete specialist thumbnail:', error);
      }
    }

    await this.specialistModel.findByIdAndDelete(id).exec();

    // Invalidate cache after deletion
    await this.invalidateCache();

    return specialist;
  }

  /**
   * Invalidate all specialist caches
   * Called after create/update/delete operations
   */
  private async invalidateCache(): Promise<void> {
    try {
      // In production with Redis, you could use pattern-based deletion
      // For now, we'll let TTL handle expiration
      // Future: implement cache.store.keys('specialists:*') pattern deletion
      this.logger.debug('Specialist cache invalidation triggered (TTL-based)');
    } catch (error) {
      this.logger.warn(`Cache invalidation failed: ${error.message}`);
      // Don't throw - cache invalidation is optional
    }
  }
}
