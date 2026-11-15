import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enum/role.enum';
import { BackupService } from './backup.service';

@Controller('backups')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class BackupsController {
  constructor(private readonly backupService: BackupService) {}

  /**
   * Trigger an on-demand MongoDB backup to S3, in addition to the
   * automatic one that runs every day at midnight.
   */
  @Post('run')
  async runManualBackup() {
    try {
      const result = await this.backupService.runBackup();
      return {
        success: true,
        statusCode: 201,
        message: 'Backup completed successfully',
        data: result,
      };
    } catch (error: any) {
      return {
        success: false,
        statusCode: 500,
        message: error.message || 'Backup failed',
        data: null,
      };
    }
  }

  @Get()
  async listBackups() {
    const data = await this.backupService.listBackups();
    return {
      success: true,
      statusCode: 200,
      message: 'Backups fetched successfully',
      data,
    };
  }
}
