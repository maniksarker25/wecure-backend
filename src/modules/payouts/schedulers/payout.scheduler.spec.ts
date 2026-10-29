import { ConfigService } from '@nestjs/config';
import { PayoutScheduler } from './payout.scheduler';
import { PayoutManagerService } from '../services/payout-manager.service';

describe('PayoutScheduler', () => {
  let scheduler: PayoutScheduler;
  let payoutManager: any;
  let configService: any;

  beforeEach(() => {
    payoutManager = {
      createPayoutBatch: jest.fn().mockResolvedValue([]),
      processDuePayouts: jest.fn().mockResolvedValue({
        attempted: 0,
        results: [],
      }),
    };
    configService = {
      get: jest.fn((_key: string, fallback?: any) => fallback),
    };

    scheduler = new PayoutScheduler(
      payoutManager as PayoutManagerService,
      configService as ConfigService,
    );
  });

  it('creates monthly payout batches when monthly payouts are enabled', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-05T00:00:00.000Z'));

    await scheduler.handleMonthlyPayouts();

    expect(payoutManager.createPayoutBatch).toHaveBeenCalledWith('2026-07');
    jest.useRealTimers();
  });

  it('processes due payouts hourly when auto processing is enabled', async () => {
    await scheduler.processPendingPayouts();

    expect(payoutManager.processDuePayouts).toHaveBeenCalledWith(25);
  });

  it('does not process due payouts when auto processing is disabled', async () => {
    configService.get.mockImplementation((key: string, fallback?: any) => {
      if (key === 'PAYOUT_AUTO_PROCESS_ENABLED') return 'false';
      return fallback;
    });

    await scheduler.processPendingPayouts();

    expect(payoutManager.processDuePayouts).not.toHaveBeenCalled();
  });
});
