import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PayoutManagerService } from '../services/payout-manager.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PayoutScheduler {
  private readonly logger = new Logger(PayoutScheduler.name);

  constructor(
    private readonly payoutManager: PayoutManagerService,
    private readonly configService: ConfigService,
  ) {}

  @Cron('0 0 1 * *') // Run at midnight on the 1st of every month
  async handleMonthlyPayouts() {
    const schedule = this.configService.get('PAYOUT_SCHEDULE', 'MONTHLY');
    if (schedule !== 'MONTHLY') return;

    this.logger.log('Starting monthly payout scheduler...');
    const batchId = new Date().toISOString().slice(0, 7); // YYYY-MM
    const payouts = await this.payoutManager.createPayoutBatch(batchId);
    this.logger.log(
      `Monthly payout batch creation completed: ${payouts.length} payouts created.`,
    );
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
