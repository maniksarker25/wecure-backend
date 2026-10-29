import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from 'src/common/enum/role.enum';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async getDashboardStats(@Query() query: DashboardQueryDto) {
    try {
      const data = await this.dashboardService.getAdminDashboardStats(query);
      return {
        success: true,
        statusCode: 200,
        message: 'Admin dashboard stats fetched successfully',
        data,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 500,
        message: error.message || 'Failed to fetch dashboard stats',
        data: null,
      };
    }
  }
}
