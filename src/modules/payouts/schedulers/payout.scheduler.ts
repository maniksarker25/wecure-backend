import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PayoutManagerService } from '../services/payout-manager.service';
import {
  PAYOUT_BATCH_CRON,
  PAYOUT_BATCH_JOB,
  buildPayoutBatchId,
  resolvePayoutSchedule,
  resolvePayoutTimezone,
} from '../payout-schedule';

@Injectable()
export class PayoutScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PayoutScheduler.name);
  private batchInProgress = false;

  constructor(
    private readonly payoutManager: PayoutManagerService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit() {
    const schedule = resolvePayoutSchedule(
      this.configService.get('PAYOUT_SCHEDULE'),
    );
    const { timezone, invalid } = resolvePayoutTimezone(
      this.configService.get('PAYOUT_TIMEZONE'),
    );

    if (invalid) {
      this.logger.error(
        `Invalid PAYOUT_TIMEZONE. Payout batches will use ${timezone}.`,
      );
    }

    if (!schedule) {
      this.logger.error(
        'PAYOUT_SCHEDULE must be WEEKLY or MONTHLY. Payout batch job was not started.',
      );
      return;
    }

    if (this.schedulerRegistry.doesExist('cron', PAYOUT_BATCH_JOB)) {
      this.logger.warn(
        `Payout batch job ${PAYOUT_BATCH_JOB} is already registered.`,
      );
      return;
    }

    const cronTime = PAYOUT_BATCH_CRON[schedule];
    const job = CronJob.from({
      cronTime,
      onTick: () => {
        void this.createScheduledBatch();
      },
      start: false,
      timeZone: timezone,
      waitForCompletion: true,
      name: PAYOUT_BATCH_JOB,
    });

    this.schedulerRegistry.addCronJob(PAYOUT_BATCH_JOB, job);
    job.start();

    this.logger.log(
      `Payout batches scheduled ${schedule} (${cronTime}) in ${timezone}.`,
    );
  }

  onModuleDestroy() {
    if (this.schedulerRegistry.doesExist('cron', PAYOUT_BATCH_JOB)) {
      this.schedulerRegistry.deleteCronJob(PAYOUT_BATCH_JOB);
    }
  }

  async createScheduledBatch() {
    if (this.batchInProgress) {
      this.logger.warn(
        'Skipping payout batch because another batch is already running.',
      );
      return;
    }

    const schedule = resolvePayoutSchedule(
      this.configService.get('PAYOUT_SCHEDULE'),
    );
    if (!schedule) {
      this.logger.error(
        'PAYOUT_SCHEDULE must be WEEKLY or MONTHLY. Payout batch was skipped.',
      );
      return;
    }

    const { timezone } = resolvePayoutTimezone(
      this.configService.get('PAYOUT_TIMEZONE'),
    );
    const batchId = buildPayoutBatchId(schedule, new Date(), timezone);

    this.batchInProgress = true;
    this.logger.log(
      `Starting ${schedule.toLowerCase()} payout batch ${batchId}.`,
    );

    try {
      const payouts = await this.payoutManager.createPayoutBatch(batchId);
      this.logger.log(
        `Payout batch ${batchId} created ${payouts.length} payouts.`,
      );
    } catch (error) {
      this.logger.error(`Payout batch ${batchId} failed`, error);
    } finally {
      this.batchInProgress = false;
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async processPendingPayouts() {
    const enabled = this.configService.get<string>(
      'PAYOUT_AUTO_PROCESS_ENABLED',
      'true',
    );
    if (enabled !== 'true') return;

    const limit = this.configService.get<number>('PAYOUT_PROCESS_LIMIT', 25);
    const result = await this.payoutManager.processDuePayouts(limit);

    if (result.attempted > 0) {
      this.logger.log(`Processed ${result.attempted} due payouts.`);
    }
  }
}
