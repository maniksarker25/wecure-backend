import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { LegalContentService } from './legal-content.service';
import { LegalContentType } from './schemas/legal-content.schema';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/role.enum';

@Controller('legal-content')
export class LegalContentController {
  constructor(private readonly legalContentService: LegalContentService) {}

  @Get('terms-and-conditions')
  async getTermsAndConditions() {
    try {
      const result = await this.legalContentService.getContentByType(
        LegalContentType.TERMS_AND_CONDITIONS,
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Terms and Conditions retrieved successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 500,
        message: error.message || 'Failed to retrieve Terms and Conditions',
        data: null,
      };
    }
  }

  @Get('privacy-policy')
  async getPrivacyPolicy() {
    try {
      const result = await this.legalContentService.getContentByType(
        LegalContentType.PRIVACY_POLICY,
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Privacy Policy retrieved successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 500,
        message: error.message || 'Failed to retrieve Privacy Policy',
        data: null,
      };
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch()
  async updateContent(
    @Body('type') type: LegalContentType,
    @Body('content') content: string,
  ) {
    try {
      const result = await this.legalContentService.updateContent(
        type,
        content,
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Legal content updated successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 500,
        message: error.message || 'Failed to update legal content',
        data: null,
      };
    }
  }
}
