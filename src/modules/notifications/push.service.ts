import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from 'src/modules/users/schemas/user.schema';
import { FirebaseService } from '../firebase/firebase.service';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly maxTokensPerRequest = 500;

  constructor(
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    private firebaseService: FirebaseService,
  ) {}

  /**
   * Sends a push notification to a user's registered devices.
   */
  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data: Record<string, any> = {},
  ): Promise<void> {
    try {
      if (!userId || !Types.ObjectId.isValid(userId)) {
        this.logger.warn(`Skipping push with invalid userId: ${String(userId)}`);
        return;
      }

      const user = await this.userModel
        .findById(userId)
        .select('fcmTokens')
        .lean();

      if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
        this.logger.debug(`No FCM tokens for user ${userId}, skipping push`);
        return;
      }

      if (!this.firebaseService.isConfigured()) {
        this.logger.warn('Firebase is not configured, skipping push');
        return;
      }

      const tokens = [...new Set(user.fcmTokens.filter(Boolean))];
      if (tokens.length === 0) {
        this.logger.debug(
          `No valid FCM tokens for user ${userId}, skipping push`,
        );
        return;
      }

      // Prepare text values for data payload as FCM data requires string values
      const stringifiedData: Record<string, string> = {};
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined && value !== null) {
          stringifiedData[key] = String(value);
        }
      }

      const invalidTokens = new Set<string>();
      let successCount = 0;
      let failureCount = 0;

      for (const tokenChunk of this.chunk(tokens, this.maxTokensPerRequest)) {
        const promises = tokenChunk.map(async (token) => {
          try {
            await this.firebaseService.messaging.send({
              token,
              notification: { title, body },
              data: stringifiedData,
            });
            successCount++;
          } catch (error: any) {
            failureCount++;
            if (this.isInvalidTokenError(error?.code)) {
              invalidTokens.add(token);
            } else {
              this.logger.error(`Error sending push to token: ${token}`, error);
            }
          }
        });
        await Promise.all(promises);
      }

      this.logger.log(
        `Successfully sent ${successCount} push messages to user ${userId}`,
      );

      if (failureCount > 0) {
        this.logger.warn(
          `Failed to send ${failureCount} push messages to user ${userId}`,
        );
      }

      if (invalidTokens.size > 0) {
        await this.userModel.findByIdAndUpdate(userId, {
          $pull: { fcmTokens: { $in: [...invalidTokens] } },
        });
        this.logger.log(
          `Removed ${invalidTokens.size} invalid FCM tokens for user ${userId}`,
        );
      }
    } catch (error) {
      this.logger.error(`Failed to send push to user ${userId}`, error);
    }
  }

  /**
   * Sends a push notification to multiple users.
   */
  async sendToUsers(
    userIds: string[],
    title: string,
    body: string,
    data: Record<string, any> = {},
  ): Promise<void> {
    await Promise.all(
      [...new Set(userIds)].map((userId) =>
        this.sendToUser(userId, title, body, data),
      ),
    );
  }

  private isInvalidTokenError(errorCode?: string): boolean {
    return (
      errorCode === 'messaging/invalid-registration-token' ||
      errorCode === 'messaging/registration-token-not-registered' ||
      errorCode === 'messaging/invalid-argument'
    );
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  }
}
