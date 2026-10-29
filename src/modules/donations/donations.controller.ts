import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { DonationsService } from './donations.service';
import { CreateDonationDto } from './dto/create-donation.dto';
import { UpdateDonationDto } from './dto/update-donation.dto';

@Controller('donations')
export class DonationsController {
  constructor(private readonly donationsService: DonationsService) {}

  @Post()
  async create(@Body() createDonationDto: CreateDonationDto) {
    try {
      const result = await this.donationsService.create(createDonationDto);
      return {
        success: true,
        statusCode: 201,
        message: 'Donation created successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to create donation',
        data: null,
      };
    }
  }

  @Get()
  async findAll(@Query() query) {
    try {
      const { data, ...meta } = await this.donationsService.findAll(query);
      return {
        success: true,
        statusCode: 200,
        message: 'Donations fetched successfully',
        data,
        meta,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch donations',
        data: null,
      };
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    try {
      const result = await this.donationsService.findOne(id);
      return {
        success: true,
        statusCode: 200,
        message: 'Donation fetched successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch donation',
        data: null,
      };
    }
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateDonationDto: UpdateDonationDto,
  ) {
    try {
      const result = await this.donationsService.update(id, updateDonationDto);
      return {
        success: true,
        statusCode: 200,
        message: 'Donation updated successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to update donation',
        data: null,
      };
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    try {
      const result = await this.donationsService.remove(id);
      return {
        success: true,
        statusCode: 200,
        message: 'Donation deleted successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to delete donation',
        data: null,
      };
    }
  }
}
