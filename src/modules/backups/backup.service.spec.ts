import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import { ConfigService } from '@nestjs/config';
import { BackupService } from './backup.service';
import { Role } from '../../common/enum/role.enum';
import { NotificationType } from '../../common/enum/notification-type.enum';

jest.mock('child_process', () => ({
  execFile: jest.fn((_cmd, _args, callback) =>
    callback(null, { stdout: '', stderr: '' }),
  ),
}));

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  rm: jest.fn(),
}));

describe('BackupService', () => {
  let service: BackupService;
  let uploadsService: any;
  let userModel: any;
  let notificationsService: any;
  let configService: ConfigService;

  const admins = [{ _id: 'admin-1' }, { _id: 'admin-2' }];

  beforeEach(() => {
    jest.clearAllMocks();

    (fs.readFile as jest.Mock).mockResolvedValue(Buffer.from('dump-bytes'));
    (fs.rm as jest.Mock).mockResolvedValue(undefined);

    uploadsService = {
      uploadBufferAtKey: jest.fn().mockResolvedValue('backups/key.archive.gz'),
      listObjects: jest.fn().mockResolvedValue([]),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };

    userModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(admins),
      }),
    };

    notificationsService = {
      createInAppNotificationOnce: jest.fn().mockResolvedValue(undefined),
    };

    configService = {
      get: jest.fn((_key: string, fallback?: any) => fallback),
      getOrThrow: jest.fn(() => 'mongodb://test-uri'),
    } as any;

    service = new BackupService(
      configService,
      uploadsService,
      userModel,
      notificationsService,
    );
  });

  it('runs mongodump and uploads the resulting archive to S3', async () => {
    const result = await service.runBackup();

    expect(execFile).toHaveBeenCalledWith(
      'mongodump',
      expect.arrayContaining([
        '--uri=mongodb://test-uri',
        '--gzip',
        expect.stringContaining('--archive='),
      ]),
      expect.any(Function),
    );
    expect(uploadsService.uploadBufferAtKey).toHaveBeenCalledWith(
      Buffer.from('dump-bytes'),
      'application/gzip',
      expect.stringMatching(/^backups\/mongodb-backup-.*\.archive\.gz$/),
    );
    expect(fs.rm).toHaveBeenCalled();
    expect(result.key).toMatch(/^backups\//);
    expect(result.size).toBe(Buffer.from('dump-bytes').length);
  });

  it('cleans up the local temp file even when upload fails', async () => {
    uploadsService.uploadBufferAtKey.mockRejectedValue(new Error('s3 down'));

    await expect(service.runBackup()).rejects.toThrow('s3 down');
    expect(fs.rm).toHaveBeenCalled();
  });

  it('notifies active admins and super admins when mongodump is missing', async () => {
    (execFile as unknown as jest.Mock).mockImplementationOnce(
      (_cmd, _args, callback) => {
        const error: any = new Error('spawn mongodump ENOENT');
        error.code = 'ENOENT';
        callback(error);
      },
    );

    await expect(service.runBackup()).rejects.toThrow();

    expect(userModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        role: { $in: [Role.ADMIN, Role.SUPER_ADMIN] },
      }),
    );
    expect(notificationsService.createInAppNotificationOnce).toHaveBeenCalledTimes(
      admins.length,
    );
    expect(notificationsService.createInAppNotificationOnce).toHaveBeenCalledWith(
      'admin-1',
      NotificationType.BACKUP_FAILED,
      'Database backup failed',
      expect.stringContaining('mongodump is not installed'),
      expect.any(Object),
      expect.any(String),
    );
  });

  it('deletes only backups older than the retention window', async () => {
    const now = Date.now();
    const oldKey = {
      key: 'backups/old.archive.gz',
      lastModified: new Date(now - 40 * 24 * 60 * 60 * 1000), // 40 days old
    };
    const recentKey = {
      key: 'backups/recent.archive.gz',
      lastModified: new Date(now - 2 * 24 * 60 * 60 * 1000), // 2 days old
    };
    uploadsService.listObjects.mockResolvedValue([oldKey, recentKey]);
    (configService.get as jest.Mock).mockImplementation(
      (key: string, fallback?: any) =>
        key === 'BACKUP_RETENTION_DAYS' ? '30' : fallback,
    );

    await service.runBackup();

    expect(uploadsService.deleteObject).toHaveBeenCalledTimes(1);
    expect(uploadsService.deleteObject).toHaveBeenCalledWith(oldKey.key);
  });

  it('lists backups sorted by most recent first', async () => {
    const older = {
      key: 'backups/older.archive.gz',
      lastModified: new Date('2026-01-01T00:00:00.000Z'),
    };
    const newer = {
      key: 'backups/newer.archive.gz',
      lastModified: new Date('2026-02-01T00:00:00.000Z'),
    };
    uploadsService.listObjects.mockResolvedValue([older, newer]);

    const result = await service.listBackups();

    expect(result.map((b) => b.key)).toEqual([newer.key, older.key]);
  });
});
