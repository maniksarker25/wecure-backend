import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Query,
  Body,
} from '@nestjs/common';
import { PayoutFinderService } from './services/payout-finder.service';
import { PayoutManagerService } from './services/payout-manager.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/role.enum';

@Controller('payouts')
@UseGuards(JwtAuthGuard)
export class PayoutsController {
  constructor(
    private readonly payoutFinder: PayoutFinderService,
    private readonly payoutManager: PayoutManagerService,
  ) {}

  @Get('admin/due')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async getDuePayouts() {
    return this.payoutFinder.getDuePayouts();
  }

  @Get('admin/history')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async getPayoutHistory(
    @Query() query: { doctorId?: string; batchId?: string },
  ) {
    return this.payoutFinder.getPayoutHistory(query);
  }

  @Post('admin/batch')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async createPayoutBatch(@Body() body: { batchId?: string }) {
    // Manual trigger for testing or ad-hoc payouts
    const batchId =
      (body && body.batchId) || new Date().toISOString().slice(0, 7); // Default to YYYY-MM
    return this.payoutManager.createPayoutBatch(batchId);
  }

  @Post('admin/:payoutId/process')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async processPayout(@Param('payoutId') payoutId: string) {
    return this.payoutManager.processPayout(payoutId);
  }
}

// [
//   { name: '78 Finance Company Ltd', code: '40195' },
//   { name: '9jaPay Microfinance Bank', code: '090629' },
//   { name: '9mobile 9Payment Service Bank', code: '120001' },
//   { name: 'Abbey Mortgage Bank', code: '404' },
//   { name: 'Above Only MFB', code: '51204' },
//   { name: 'Abulesoro MFB', code: '51312' },
//   { name: 'Access Bank', code: '044' },
//   { name: 'Access Bank (Diamond)', code: '063' },
//   { name: 'Accion Microfinance Bank', code: '602' },
//   { name: 'Aella MFB', code: '50315' }
// ]
