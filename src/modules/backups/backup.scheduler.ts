import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BackupService } from './backup.service';
import { DEFAULT_BUSINESS_TIMEZONE } from '../../common/utils/business-time.util';

@Injectable()
export class BackupScheduler {
  private readonly logger = new Logger(BackupScheduler.name);
  private backupInProgress = false;

  constructor(
    private readonly backupService: BackupService,
    private readonly configService: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, {
    name: 'mongodb-daily-backup',
    timeZone: DEFAULT_BUSINESS_TIMEZONE,
  })
  async handleDailyBackup(): Promise<void> {
    const enabled = this.configService.get<string>('BACKUP_ENABLED', 'true');
    if (enabled !== 'true') {
      this.logger.log(
        'Daily MongoDB backup is disabled (BACKUP_ENABLED=false).',
      );
      return;
    }

    if (this.backupInProgress) {
      this.logger.warn(
        'Skipping daily backup — a previous run is still in progress.',
      );
      return;
    }

    this.backupInProgress = true;
    try {
      const result = await this.backupService.runBackup();
      this.logger.log(
        `Daily MongoDB backup completed: ${result.key} (${result.size} bytes)`,
      );
    } catch (error) {
      this.logger.error('Daily MongoDB backup failed.', error);
    } finally {
      this.backupInProgress = false;
    }
  }
}
