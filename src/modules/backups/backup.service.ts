import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { UploadsService } from '../uploads/uploads.service';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Role } from '../../common/enum/role.enum';
import { UserStatus } from '../../common/enum/user.status.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../../common/enum/notification-type.enum';

const execFileAsync = promisify(execFile);

export const BACKUP_PREFIX = 'backups/';

export interface BackupSummary {
  key: string;
  size?: number;
  lastModified?: Date;
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly uploadsService: UploadsService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async runBackup(): Promise<BackupSummary> {
    const mongoUri = this.configService.getOrThrow<string>('MONGODB_URI');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const tmpFile = path.join(
      os.tmpdir(),
      `mongodb-backup-${timestamp}.archive.gz`,
    );
    const s3Key = `${BACKUP_PREFIX}mongodb-backup-${timestamp}.archive.gz`;

    try {
      this.logger.log('Starting MongoDB backup via mongodump...');

      // Passed as separate argv entries (not through a shell), so the URI
      // is never subject to shell interpolation/injection.
      await execFileAsync('mongodump', [
        `--uri=${mongoUri}`,
        `--archive=${tmpFile}`,
        '--gzip',
      ]);

      const buffer = await fs.readFile(tmpFile);
      await this.uploadsService.uploadBufferAtKey(
        buffer,
        'application/gzip',
        s3Key,
      );

      this.logger.log(
        `MongoDB backup uploaded to s3://${s3Key} (${buffer.length} bytes)`,
      );

      await this.applyRetention();

      return { key: s3Key, size: buffer.length, lastModified: new Date() };
    } catch (error: any) {
      const reason =
        error?.code === 'ENOENT'
          ? 'mongodump is not installed on this server. Install MongoDB Database Tools (e.g. `apt-get install -y mongodb-database-tools`) and retry.'
          : error?.message || 'Unknown backup error';

      this.logger.error(`MongoDB backup failed: ${reason}`, error?.stack);
      await this.notifyAdminsOfFailure(reason);
      throw error;
    } finally {
      await fs.rm(tmpFile, { force: true }).catch(() => undefined);
    }
  }

  async listBackups(): Promise<BackupSummary[]> {
    const objects = await this.uploadsService.listObjects(BACKUP_PREFIX);
    return objects
      .map((o) => ({
        key: o.key,
        size: o.size,
        lastModified: o.lastModified,
      }))
      .sort(
        (a, b) =>
          (b.lastModified?.getTime() || 0) - (a.lastModified?.getTime() || 0),
      );
  }

  private async applyRetention(): Promise<void> {
    const retentionDays = parseInt(
      this.configService.get<string>('BACKUP_RETENTION_DAYS') || '30',
      10,
    );
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    const objects = await this.uploadsService.listObjects(BACKUP_PREFIX);
    const expired = objects.filter(
      (o) => o.lastModified && o.lastModified.getTime() < cutoff,
    );

    for (const obj of expired) {
      try {
        await this.uploadsService.deleteObject(obj.key);
        this.logger.log(`Deleted expired backup ${obj.key}`);
      } catch (error) {
        this.logger.error(`Failed to delete expired backup ${obj.key}`, error);
      }
    }
  }

  private async notifyAdminsOfFailure(reason: string): Promise<void> {
    try {
      const admins = await this.userModel
        .find({
          role: { $in: [Role.ADMIN, Role.SUPER_ADMIN] },
          status: UserStatus.ACTIVE,
        })
        .select('_id')
        .lean();

      const dedupeKey = `backup-failed:${new Date().toISOString().slice(0, 10)}`;

      await Promise.all(
        admins.map((admin) =>
          this.notificationsService.createInAppNotificationOnce(
            admin._id as any,
            NotificationType.BACKUP_FAILED,
            'Database backup failed',
            `The scheduled MongoDB backup failed: ${reason}`,
            { reason },
            `${dedupeKey}:${admin._id}`,
          ),
        ),
      );
    } catch (error) {
      this.logger.error('Failed to notify admins of backup failure', error);
    }
  }
}
