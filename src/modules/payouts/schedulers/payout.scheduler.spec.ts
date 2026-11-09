import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PayoutScheduler } from './payout.scheduler';
import { PayoutManagerService } from '../services/payout-manager.service';

describe('PayoutScheduler', () => {
  let scheduler: PayoutScheduler;
  let payoutManager: any;
  let configService: any;
  let schedulerRegistry: {
    doesExist: jest.Mock;
    addCronJob: jest.Mock;
    deleteCronJob: jest.Mock;
  };

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
    schedulerRegistry = {
      doesExist: jest.fn().mockReturnValue(false),
      addCronJob: jest.fn(),
      deleteCronJob: jest.fn(),
    };

    scheduler = new PayoutScheduler(
      payoutManager as PayoutManagerService,
      configService as ConfigService,
      schedulerRegistry as unknown as SchedulerRegistry,
    );
  });

  afterEach(() => {
    scheduler.onModuleDestroy();
  });

  it('registers a Monday midnight batch job in the business timezone by default', () => {
    scheduler.onModuleInit();

    expect(schedulerRegistry.addCronJob).toHaveBeenCalledWith(
      'payout-batch',
      expect.any(CronJob),
    );
    const job = schedulerRegistry.addCronJob.mock.calls[0][1] as CronJob;
    expect(job.cronTime.source).toBe('0 0 * * 1');
    expect(job.cronTime.timeZone).toBe('Africa/Lagos');
    expect(job.isActive).toBe(true);
    job.stop();
  });

  it('registers the monthly batch job when monthly payouts are selected', () => {
    configService.get.mockImplementation((key: string, fallback?: any) => {
      if (key === 'PAYOUT_SCHEDULE') return 'MONTHLY';
      return fallback;
    });

    scheduler.onModuleInit();

    const job = schedulerRegistry.addCronJob.mock.calls[0][1] as CronJob;
    expect(job.cronTime.source).toBe('0 0 1 * *');
    job.stop();
  });

  it('does not register a batch job for an unknown schedule', () => {
    configService.get.mockImplementation((key: string, fallback?: any) => {
      if (key === 'PAYOUT_SCHEDULE') return 'DAILY';
      return fallback;
    });

    scheduler.onModuleInit();

    expect(schedulerRegistry.addCronJob).not.toHaveBeenCalled();
  });

  it('creates a weekly batch id from the Lagos calendar', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-08T23:00:00.000Z'));

    await scheduler.createScheduledBatch();

    expect(payoutManager.createPayoutBatch).toHaveBeenCalledWith('2026-W46');
    jest.useRealTimers();
  });

  it('creates a monthly batch id when monthly payouts are selected', async () => {
    configService.get.mockImplementation((key: string, fallback?: any) => {
      if (key === 'PAYOUT_SCHEDULE') return 'MONTHLY';
      return fallback;
    });
    jest.useFakeTimers().setSystemTime(new Date('2026-01-31T23:00:00.000Z'));

    await scheduler.createScheduledBatch();

    expect(payoutManager.createPayoutBatch).toHaveBeenCalledWith('2026-02');
    jest.useRealTimers();
  });

  it('skips a second batch while the first is still running', async () => {
    let release: (value: unknown[]) => void = () => undefined;
    payoutManager.createPayoutBatch.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );

    const first = scheduler.createScheduledBatch();
    await Promise.resolve();
    await scheduler.createScheduledBatch();

    expect(payoutManager.createPayoutBatch).toHaveBeenCalledTimes(1);
    release([]);
    await first;
  });

  it('releases the batch lock when creation fails', async () => {
    payoutManager.createPayoutBatch
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce([]);

    await scheduler.createScheduledBatch();
    await scheduler.createScheduledBatch();

    expect(payoutManager.createPayoutBatch).toHaveBeenCalledTimes(2);
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
