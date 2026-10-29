import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Role } from 'src/common/enum/role.enum';
import { UserStatus } from 'src/common/enum/user.status.enum';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Doctor, DoctorDocument } from '../doctors/schemas/doctor.schema';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    @InjectModel(Doctor.name) private doctorModel: Model<DoctorDocument>,
  ) {}

  async register(data: {
    name: string;
    email: string;
    password: string;
    role: Role;
    doctorId?: string;
    timezone?: string;
  }) {
    const user = await this.usersService.createUser(data);
    const tokens = await this.generateToken(
      user._id.toString(),
      user.role,
      user.email,
      user.doctorId,
    );
    await this.usersService.updateRefreshToken(
      user._id.toString(),
      tokens.refreshToken,
    );
    return {
      name: user.name,
      email: user.email,
      role: user.role,
      ...tokens,
    };
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    if (user.status === 'BLOCKED') {
      throw new UnauthorizedException('Account blocked');
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException(
        'Email not verified. Please verify your email first.',
      );
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) throw new UnauthorizedException('Invalid credentials');

    await this.validateDoctorStatus(user);

    const tokens = await this.generateToken(
      user._id.toString(),
      user.role,
      user.email,
      user.doctorId,
    );
    await this.usersService.updateRefreshToken(
      user._id.toString(),
      tokens.refreshToken,
    );
    await this.validateDoctorStatus(user);

    return {
      name: user.name,
      email: user.email,
      role: user.role,
      ...tokens,
    };
  }

  private async validateDoctorStatus(user: any) {
    if (user.status === UserStatus.BLOCKED) {
      throw new UnauthorizedException('Account blocked');
    }

    if (user.role === Role.DOCTOR) {
      const doctor = await this.doctorModel.findOne({
        userId: user._id.toString(),
      });
      if (doctor) {
        if (doctor.verificationStatus === 'PENDING') {
          throw new UnauthorizedException(
            'Your account is pending verification. Please wait for admin approval.',
          );
        }
        if (doctor.verificationStatus === 'REJECTED') {
          throw new UnauthorizedException(
            'Your account has been rejected. Please contact support.',
          );
        }
        if (doctor.verificationStatus === 'SUSPENDED') {
          throw new UnauthorizedException(
            'Your account has been suspended. Please contact support.',
          );
        }
      } else if (user.status === UserStatus.PENDING) {
        throw new UnauthorizedException(
          'Your account is pending verification. Please wait for admin approval.',
        );
      }
    }
  }

  async resendRegistrationOtp(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.isEmailVerified) {
      throw new UnauthorizedException('Email already verified');
    }

    const otp = this.generateOtp();
    const hashedOtp = await bcrypt.hash(otp, 11);
    const expirationMinutes = parseInt(
      this.config.get<string>('OTP_EXPIRATION_MINUTES') || '15',
    );
    const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000);

    await this.usersService.saveEmailVerificationOtp(
      email,
      hashedOtp,
      expiresAt,
    );

    // Emit event to send OTP via email
    this.eventEmitter.emit('auth.registration_otp_sent', { email, otp });

    return {
      message: 'OTP resent to your email',
      otp: process.env.NODE_ENV === 'development' ? otp : undefined,
    };
  }

  async resendOtp(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.isEmailVerified) {
      return this.resendRegistrationOtp(email);
    } else {
      return this.sendPasswordResetOtp(email);
    }
  }

  async logout(userId: string, fcmToken?: string) {
    await this.usersService.updateRefreshToken(userId, null);
    if (fcmToken) {
      await this.usersService.removeFcmToken(userId, fcmToken);
    }
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !user.refreshToken) {
      throw new ForbiddenException('Access Denied');
    }

    const refreshTokenMatches = await bcrypt.compare(
      refreshToken,
      user.refreshToken,
    );
    if (!refreshTokenMatches) throw new ForbiddenException('Access Denied');

    await this.validateDoctorStatus(user);

    const tokens = await this.generateToken(
      user._id.toString(),
      user.role,
      user.email,
    );
    await this.usersService.updateRefreshToken(
      user._id.toString(),
      tokens.refreshToken,
    );
    return tokens;
  }

  private async generateToken(
    userId: string,
    role: string,
    email: string,
    providedDoctorId?: string,
  ) {
    let doctorId: string | null = providedDoctorId || null;

    if (!doctorId && role === Role.DOCTOR) {
      const doctor = await this.doctorModel.findOne({ userId });
      if (doctor) {
        doctorId = doctor._id.toString();
      }
    }

    const payload: any = {
      userId,
      role,
      email,
    };

    if (doctorId) {
      payload.doctorId = doctorId;
    }

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('JWT_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACC_EXPIRATION') as any,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>('JWT_REF_EXPIRATION') as any,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async sendRegistrationOtp(data: {
    name: string;
    email: string;
    password: string;
    role: Role;
    doctorId?: string;
  }) {
    // Check if user already exists and is verified
    const existingUser = await this.usersService.findByEmail(data.email);
    if (existingUser && existingUser.isEmailVerified) {
      throw new UnauthorizedException('Email already registered');
    }

    // Generate OTP
    const otp = this.generateOtp();
    const expirationMinutes = parseInt(
      this.config.get<string>('OTP_EXPIRATION_MINUTES') || '15',
    );
    const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000);

    // Parallelize hashing and use 10 rounds for better performance
    const [hashedOtp, hashedPassword] = await Promise.all([
      bcrypt.hash(otp, 11),
      bcrypt.hash(data.password, 11),
    ]);

    // Create or update pending registration
    await this.usersService.userModel.findOneAndUpdate(
      { email: data.email },
      {
        email: data.email,
        name: data.name,
        password: hashedPassword,
        role: data.role,
        doctorId: data.doctorId,
        emailVerificationOtp: hashedOtp,
        emailVerificationOtpExpires: expiresAt,
        isEmailVerified: false,
      },
      { upsert: true },
    );

    // Emit event to send OTP via email
    this.eventEmitter.emit('auth.registration_otp_sent', {
      email: data.email,
      otp,
    });

    return {
      message: 'OTP sent to your email',
      otp: process.env.NODE_ENV === 'development' ? otp : undefined,
    };
  }

  async verifyRegistrationOtp(email: string, otp: string) {
    const isValid = await this.usersService.verifyEmailVerificationOtp(
      email,
      otp,
    );
    if (!isValid) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    // Get the verified user
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    await this.validateDoctorStatus(user);

    // Generate tokens
    const tokens = await this.generateToken(
      user._id.toString(),
      user.role,
      user.email,
      user.doctorId,
    );
    await this.usersService.updateRefreshToken(
      user._id.toString(),
      tokens.refreshToken,
    );

    return {
      name: user.name,
      email: user.email,
      role: user.role,
      ...tokens,
    };
  }

  async sendPasswordResetOtp(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      // Don't reveal if email exists or not for security
      return { message: 'If email exists, OTP has been sent' };
    }

    const otp = this.generateOtp();
    const hashedOtp = await bcrypt.hash(otp, 11);
    const expirationMinutes = parseInt(
      this.config.get<string>('OTP_EXPIRATION_MINUTES') || '15',
    );
    const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000);

    await this.usersService.savePasswordResetOtp(email, hashedOtp, expiresAt);

    // Emit event to send OTP via email
    this.eventEmitter.emit('auth.password_reset_otp_sent', { email, otp });

    return {
      message: 'If email exists, OTP has been sent',
      otp: process.env.NODE_ENV === 'development' ? otp : undefined,
    };
  }

  async verifyPasswordResetOtp(email: string, otp: string) {
    const isValid = await this.usersService.verifyPasswordResetOtp(email, otp);
    if (!isValid) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    const payload = { email, type: 'password_reset' };
    const resetToken = await this.jwtService.signAsync(payload, {
      secret: this.config.get<string>('JWT_SECRET'),
      expiresIn: '15m', // Reset token valid for 15 minutes
    });

    return {
      message: 'OTP verified successfully',
      resetToken,
    };
  }

  async resetPassword(resetToken: string, newPassword: string) {
    try {
      const payload = await this.jwtService.verifyAsync(resetToken, {
        secret: this.config.get<string>('JWT_SECRET'),
      });

      if (payload.type !== 'password_reset') {
        throw new UnauthorizedException('Invalid reset token');
      }

      await this.usersService.updatePassword(payload.email, newPassword);
      return { message: 'Password reset successfully' };
    } catch {
      throw new UnauthorizedException('Invalid or expired reset token');
    }
  }
}
