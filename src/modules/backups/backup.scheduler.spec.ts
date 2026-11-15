import { ConfigService } from '@nestjs/config';
import { BackupScheduler } from './backup.scheduler';

describe('BackupScheduler', () => {
  let backupService: any;
  let configService: any;
  let scheduler: BackupScheduler;

  beforeEach(() => {
    backupService = {
      runBackup: jest.fn().mockResolvedValue({ key: 'backups/x.gz', size: 10 }),
    };
    configService = {
      get: jest.fn((_key: string, fallback?: any) => fallback),
    };
    scheduler = new BackupScheduler(
      backupService,
      configService as unknown as ConfigService,
    );
  });

  it('runs the backup when enabled', async () => {
    await scheduler.handleDailyBackup();
    expect(backupService.runBackup).toHaveBeenCalledTimes(1);
  });

  it('skips the backup when BACKUP_ENABLED is false', async () => {
    configService.get.mockImplementation((key: string, fallback?: any) =>
      key === 'BACKUP_ENABLED' ? 'false' : fallback,
    );

    await scheduler.handleDailyBackup();

    expect(backupService.runBackup).not.toHaveBeenCalled();
  });

  it('does not overlap with an in-progress run', async () => {
    let resolveFirst: () => void;
    backupService.runBackup.mockReturnValueOnce(
      new Promise<any>((resolve) => {
        resolveFirst = () => resolve({ key: 'backups/x.gz', size: 10 });
      }),
    );

    const firstRun = scheduler.handleDailyBackup();
    const secondRun = scheduler.handleDailyBackup();

    resolveFirst!();
    await Promise.all([firstRun, secondRun]);

    expect(backupService.runBackup).toHaveBeenCalledTimes(1);
  });

  it('does not throw when the backup fails', async () => {
    backupService.runBackup.mockRejectedValue(new Error('boom'));
    await expect(scheduler.handleDailyBackup()).resolves.toBeUndefined();
  });
});
