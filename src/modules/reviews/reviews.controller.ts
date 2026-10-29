import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/role.enum';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  async create(@Req() req, @Body() createReviewDto: CreateReviewDto) {
    const result = await this.reviewsService.create(
      req.user.userId,
      createReviewDto,
    );
    return {
      success: true,
      statusCode: 201,
      message: 'Review created successfully',
      data: result,
    };
  }

  @Get('doctor/:doctorId')
  async getDoctorReviews(
    @Param('doctorId') doctorId: string,
    @Query() query: any,
  ) {
    const result = await this.reviewsService.findByDoctorId(doctorId, query);
    return {
      success: true,
      statusCode: 200,
      message: 'Doctor reviews fetched successfully',
      data: result.data,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    };
  }

  @Get()
  async findAll(@Query() query) {
    const { data, ...meta } = await this.reviewsService.findAll(query);
    return {
      success: true,
      statusCode: 200,
      message: 'Reviews fetched successfully',
      data,
      meta,
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const result = await this.reviewsService.findOne(id);
    return {
      success: true,
      statusCode: 200,
      message: 'Review fetched successfully',
      data: result,
    };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async update(
    @Param('id') id: string,
    @Body() updateReviewDto: UpdateReviewDto,
  ) {
    const result = await this.reviewsService.update(id, updateReviewDto);
    return {
      success: true,
      statusCode: 200,
      message: 'Review updated successfully',
      data: result,
    };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async remove(@Param('id') id: string) {
    const result = await this.reviewsService.remove(id);
    return {
      success: true,
      statusCode: 200,
      message: 'Review deleted successfully',
      data: result,
    };
  }
}
