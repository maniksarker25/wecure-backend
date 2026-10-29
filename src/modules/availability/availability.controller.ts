import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from 'src/common/enum/role.enum';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AvailabilityService } from './availability.service';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';

@Controller('doctors/me/availability')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.DOCTOR)
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Post()
  create(@Req() req, @Body() dto: CreateAvailabilityDto) {
    return this.availabilityService.create(req.user.userId, dto);
  }

  @Get()
  getMine(@Req() req) {
    return this.availabilityService.getMyAvailability(req.user.userId);
  }

  @Patch(':id')
  toggle(
    @Req() req,
    @Param('id') id: string,
    @Body() body: { isActive: boolean },
  ) {
    return this.availabilityService.toggleAvailability(
      req.user.userId,
      id,
      body.isActive,
    );
  }

  @Patch(':id/edit')
  edit(
    @Req() req,
    @Param('id') id: string,
    @Body() dto: UpdateAvailabilityDto,
  ) {
    return this.availabilityService.updateAvailability(
      req.user.userId,
      id,
      dto,
    );
  }

  @Delete(':id')
  remove(@Req() req, @Param('id') id: string) {
    return this.availabilityService.remove(req.user.userId, id);
  }
}
