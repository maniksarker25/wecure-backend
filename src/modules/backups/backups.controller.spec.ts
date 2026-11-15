import { BackupsController } from './backups.controller';

describe('BackupsController', () => {
  let backupService: any;
  let controller: BackupsController;

  beforeEach(() => {
    backupService = {
      runBackup: jest.fn(),
      listBackups: jest.fn(),
    };
    controller = new BackupsController(backupService);
  });

  it('returns a success response when the manual backup succeeds', async () => {
    backupService.runBackup.mockResolvedValue({ key: 'backups/x.gz', size: 10 });

    const result = await controller.runManualBackup();

    expect(result).toEqual({
      success: true,
      statusCode: 201,
      message: 'Backup completed successfully',
      data: { key: 'backups/x.gz', size: 10 },
    });
  });

  it('returns a failure response when the manual backup throws', async () => {
    backupService.runBackup.mockRejectedValue(new Error('mongodump missing'));

    const result = await controller.runManualBackup();

    expect(result).toEqual({
      success: false,
      statusCode: 500,
      message: 'mongodump missing',
      data: null,
    });
  });

  it('lists backups', async () => {
    backupService.listBackups.mockResolvedValue([{ key: 'backups/x.gz' }]);

    const result = await controller.listBackups();

    expect(result).toEqual({
      success: true,
      statusCode: 200,
      message: 'Backups fetched successfully',
      data: [{ key: 'backups/x.gz' }],
    });
  });
});
