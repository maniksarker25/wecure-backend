import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

import { IUploadAuditLogger } from '../uploads/interfaces/uploads-options.interface';

@Injectable()
export class AuditLogsService implements IUploadAuditLogger {
  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
  ) {}

  async create(data: {
    userId: string;
    action: string;
    resource: string;
    resourceId?: string;
    ipAddress?: string;
    metadata?: Record<string, any>;
  }) {
    return this.auditLogModel.create({
      userId: data.userId,
      action: data.action,
      resource: data.resource,
      resourceId: data.resourceId,
      ipAddress: data.ipAddress,
      metadata: data.metadata,
    });
  }

  async findAll(filters: {
    userId?: string;
    action?: string;
    from?: string;
    to?: string;
    page: number;
    limit: number;
  }) {
    const query: any = {};

    if (filters.userId) {
      query.userId = filters.userId;
    }

    if (filters.action) {
      query.action = filters.action;
    }

    if (filters.from || filters.to) {
      query.createdAt = {};
      if (filters.from) {
        query.createdAt.$gte = new Date(filters.from);
      }
      if (filters.to) {
        query.createdAt.$lte = new Date(filters.to);
      }
    }

    const skip = (filters.page - 1) * filters.limit;

    const [data, total] = await Promise.all([
      this.auditLogModel
        .find(query)
        .populate('userId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(filters.limit)
        .lean(),
      this.auditLogModel.countDocuments(query),
    ]);

    return {
      data,
      total,
      page: filters.page,
      limit: filters.limit,
    };
  }

  // Implementation for IUploadAuditLogger
  logUpload(userId: string, fileKey: string) {
    this.create({
      userId,
      action: 'UPLOAD_PRIVATE_FILE',
      resource: fileKey,
    });
  }

  logView(userId: string, fileKey: string) {
    this.create({
      userId,
      action: 'GENERATE_VIEW_URL',
      resource: fileKey,
    });
  }
}
