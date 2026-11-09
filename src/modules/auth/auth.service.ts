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
import {
  isDoctorProfileComplete,
  resolveVerificationStatus,
} from '../doctors/doctor-onboarding';
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
    return this.issueSession(user);
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

    return this.issueSession(user);
  }

  private async issueSession(user: any) {
    const doctor = await this.prepareDoctorAccount(user);
    const tokens = await this.generateToken(
      user._id.toString(),
      user.role,
      user.email,
      doctor?._id?.toString(),
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
      ...(doctor
        ? {
            doctorId: doctor._id.toString(),
            isProfileComplete: !!doctor.isProfileComplete,
            verificationStatus: doctor.verificationStatus,
          }
        : {}),
    };
  }

  private async prepareDoctorAccount(user: any) {
    if (user.status === UserStatus.BLOCKED) {
      throw new UnauthorizedException('Account blocked');
    }
    if (user.role !== Role.DOCTOR) return null;

    const userId = user._id.toString();
    let doctor =
      (await this.doctorModel.findOne({ userId })) ||
      (await this.doctorModel.findOne({ userId: user._id }));

    if (!doctor) {
      try {
        doctor = await this.doctorModel.create({
          userId: user._id,
          isProfileComplete: false,
          verificationStatus: 'INCOMPLETE',
          isVerified: false,
        });
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          (error as { code?: number }).code === 11000
        ) {
          doctor = await this.doctorModel.findOne({ userId });
        } else {
          throw error;
        }
      }
    }

    if (!doctor) {
      throw new UnauthorizedException('Doctor profile could not be created');
    }

    if (doctor.verificationStatus === 'SUSPENDED') {
      throw new UnauthorizedException(
        'Your account has been suspended. Please contact support.',
      );
    }

    const complete = isDoctorProfileComplete(doctor);
    const nextStatus = resolveVerificationStatus(
      doctor.verificationStatus,
      complete,
    );
    const nextVerified = nextStatus === 'VERIFIED';
    if (
      doctor.isProfileComplete !== complete ||
      doctor.verificationStatus !== nextStatus ||
      doctor.isVerified !== nextVerified
    ) {
      doctor.isProfileComplete = complete;
      doctor.verificationStatus = nextStatus;
      doctor.isVerified = nextVerified;
      if (typeof doctor.save === 'function') {
        await doctor.save();
      }
    }

    if (user.doctorId !== doctor._id.toString()) {
      await this.usersService.linkDoctorProfile(userId, doctor._id.toString());
    }

    return doctor;
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

    return this.issueSession(user);
  }

  private async generateToken(
    userId: string,
    role: string,
    email: string,
    doctorId?: string,
  ) {
    let resolvedDoctorId = doctorId || null;

    if (!resolvedDoctorId && role === Role.DOCTOR) {
      const doctor = await this.doctorModel.findOne({ userId }).select('_id');
      if (doctor) {
        resolvedDoctorId = doctor._id.toString();
      }
    }

    const payload: any = {
      userId,
      role,
      email,
    };

    if (resolvedDoctorId) {
      payload.doctorId = resolvedDoctorId;
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
    timezone?: string;
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
        ...(data.timezone ? { timezone: data.timezone } : {}),
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

    return this.issueSession(user);
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
