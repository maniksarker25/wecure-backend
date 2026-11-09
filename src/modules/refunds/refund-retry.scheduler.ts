import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RefundsService } from './refunds.service';

@Injectable()
export class RefundRetryScheduler {
  private readonly logger = new Logger(RefundRetryScheduler.name);

  constructor(private readonly refundsService: RefundsService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async retryFailedBookingRefunds() {
    try {
      await this.refundsService.retryFailedBookingRefunds();
    } catch (error) {
      this.logger.error('Booking refund retry job failed', error);
    }
  }
}
