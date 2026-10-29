import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyRegistrationOtpDto } from './dto/verify-registration-otp.dto';
import { SendResetPasswordOtpDto } from './dto/send-reset-password-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { VerifyResetOtpDto } from './dto/verify-reset-otp.dto';
import { JwtRefreshGuard } from 'src/common/guards/jwt-refresh.guard';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 requests per minute
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    try {
      const result = await this.authService.sendRegistrationOtp(dto);
      return {
        success: true,
        statusCode: 200,
        message: result.message,
        data: result.otp ? { otp: result.otp } : null,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Registration failed',
        data: null,
      };
    }
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 requests per minute
  @Post('login')
  async login(@Body() dto: LoginDto) {
    try {
      const result = await this.authService.login(dto.email, dto.password);
      return {
        success: true,
        statusCode: 200,
        message: 'Login successful',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 401,
        message: error.message || 'Login failed',
        data: null,
      };
    }
  }

  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  async refresh(@Req() req) {
    try {
      const userId = req.user.userId;
      const refreshToken = req.user.refreshToken;
      const result = await this.authService.refreshTokens(userId, refreshToken);
      return {
        success: true,
        statusCode: 200,
        message: 'Tokens refreshed successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 401,
        message: error.message || 'Token refresh failed',
        data: null,
      };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Req() req, @Body() body: { fcmToken?: string }) {
    try {
      await this.authService.logout(req.user.userId, body.fcmToken);
      return {
        success: true,
        statusCode: 200,
        message: 'Logged out successfully',
        data: null,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Logout failed',
        data: null,
      };
    }
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } }) // 3 requests per minute
  @Post('resend-otp')
  async resendOtp(@Body() dto: ResendOtpDto) {
    try {
      const result = await this.authService.resendOtp(dto.email);
      return {
        success: true,
        statusCode: 200,
        message: result.message,
        data: result.otp ? { otp: result.otp } : null,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to resend OTP',
        data: null,
      };
    }
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 requests per minute
  @Post('verify-reg-otp')
  async verifyRegistrationOtp(@Body() dto: VerifyRegistrationOtpDto) {
    try {
      const result = await this.authService.verifyRegistrationOtp(
        dto.email,
        dto.otp,
      );
      return {
        success: true,
        statusCode: 201,
        message: 'Registration successful',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'OTP verification failed',
        data: null,
      };
    }
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } }) // 3 requests per minute
  @Post('send-reset-otp')
  async sendResetPasswordOtp(@Body() dto: SendResetPasswordOtpDto) {
    try {
      const result = await this.authService.sendPasswordResetOtp(dto.email);
      return {
        success: true,
        statusCode: 200,
        message: result.message,
        data: result.otp ? { otp: result.otp } : null,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 500,
        message: error.message || 'Failed to send reset OTP',
        data: null,
      };
    }
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 requests per minute
  @Post('verify-reset-otp')
  async verifyResetOtp(@Body() dto: VerifyResetOtpDto) {
    try {
      const result = await this.authService.verifyPasswordResetOtp(
        dto.email,
        dto.otp,
      );
      return {
        success: true,
        statusCode: 200,
        message: result.message,
        data: { resetToken: result.resetToken },
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'OTP verification failed',
        data: null,
      };
    }
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 requests per minute
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    try {
      const result = await this.authService.resetPassword(
        dto.resetToken,
        dto.newPassword,
      );
      return {
        success: true,
        statusCode: 200,
        message: result.message,
        data: null,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Password reset failed',
        data: null,
      };
    }
  }
}
