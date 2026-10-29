import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Notification,
  NotificationDocument,
} from './schemas/notification.schema';
import { NotificationType } from 'src/common/enum/notification-type.enum';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
    private eventEmitter: EventEmitter2,
  ) {}

  emit(event: string, payload: any) {
    this.logger.log(`Emitting event: ${event}`);
    this.eventEmitter.emit(event, payload);
  }

  async createInAppNotification(
    userId: string | Types.ObjectId,
    type: NotificationType,
    title: string,
    message: string,
    data: Record<string, any> = {},
  ) {
    try {
      if (!userId || !Types.ObjectId.isValid(userId.toString())) {
        this.logger.warn(
          `Skipping notification with invalid userId: ${String(userId)}`,
        );
        return;
      }

      const notification = await this.notificationModel.create({
        userId: new Types.ObjectId(userId),
        type,
        title,
        message,
        data,
      });
      return notification;
    } catch (error) {
      this.logger.error('Failed to create in-app notification', error);
      // We don't want to throw here to avoid breaking the main flow if notification fails
    }
  }

  async getUserNotifications(userId: string, page = 1, limit = 20) {
    const userObjectId = this.toObjectId(userId, 'Invalid user ID');
    const safePage = this.normalizePositiveInteger(page, 1, 1, 100000);
    const safeLimit = this.normalizePositiveInteger(limit, 20, 1, 100);
    const skip = (safePage - 1) * safeLimit;

    const [notifications, total] = await Promise.all([
      this.notificationModel
        .find({ userId: userObjectId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      this.notificationModel.countDocuments({
        userId: userObjectId,
      }),
    ]);

    const unreadCount = await this.notificationModel.countDocuments({
      userId: userObjectId,
      isRead: false,
    });

    return {
      data: notifications,
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
        unreadCount,
      },
    };
  }

  async markAsRead(userId: string, notificationId: string) {
    const userObjectId = this.toObjectId(userId, 'Invalid user ID');
    const notificationObjectId = this.toObjectId(
      notificationId,
      'Invalid notification ID',
    );

    return this.notificationModel.findOneAndUpdate(
      {
        _id: notificationObjectId,
        userId: userObjectId,
      },
      { isRead: true },
      { new: true },
    );
  }

  async markAllAsRead(userId: string) {
    const userObjectId = this.toObjectId(userId, 'Invalid user ID');

    return this.notificationModel.updateMany(
      { userId: userObjectId, isRead: false },
      { isRead: true },
    );
  }

  private toObjectId(value: string, message: string) {
    if (!value || !Types.ObjectId.isValid(value)) {
      throw new BadRequestException(message);
    }

    return new Types.ObjectId(value);
  }

  private normalizePositiveInteger(
    value: unknown,
    fallback: number,
    min: number,
    max: number,
  ) {
    const parsed =
      typeof value === 'number' ? value : Number.parseInt(String(value), 10);

    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return Math.min(Math.max(Math.trunc(parsed), min), max);
  }
}
