import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role } from 'src/common/enum/role.enum';
import { UsersService } from 'src/modules/users/users.service';
import { UserStatus } from 'src/common/enum/user.status.enum';
import {
  Doctor,
  DoctorDocument,
} from 'src/modules/doctors/schemas/doctor.schema';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
    @InjectModel(Doctor.name)
    private readonly doctorModel: Model<DoctorDocument>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      ignoreExpiration: false,
    });
  }

  async validate(payload: any): Promise<{
    userId: string;
    email: string;
    role: string;
    doctorId?: string;
  }> {
    // Validate payload structure
    if (!payload?.userId || !payload?.email || !payload?.role) {
      throw new UnauthorizedException('Invalid token payload');
    }

    // Fetch user from database
    const user = await this.usersService.findById(payload.userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Check if user is logged in (has a refresh token)
    if (!user.refreshToken) {
      throw new UnauthorizedException('Session expired. Please login again.');
    }

    // Check user status with specific error messages
    let doctorId: string | undefined;
    if (user.role === Role.DOCTOR) {
      const doctor = await this.doctorModel
        .findOne({ userId: user._id })
        .select('_id verificationStatus')
        .lean();
      if (doctor?.verificationStatus === 'SUSPENDED') {
        throw new UnauthorizedException(
          'Your account has been suspended. Please contact support.',
        );
      }
      if (doctor?._id) {
        doctorId = doctor._id.toString();
      }
    }

    switch (user.status) {
      case UserStatus.ACTIVE:
        return {
          userId: payload.userId,
          email: payload.email,
          role: payload.role,
          ...(doctorId ? { doctorId } : {}),
        };
      case UserStatus.PENDING:
        throw new UnauthorizedException('Account is pending approval');
      case UserStatus.REJECTED:
        throw new UnauthorizedException('Account has been rejected');
      case UserStatus.BLOCKED:
        throw new UnauthorizedException('Account is blocked');
      default:
        throw new UnauthorizedException('Invalid account status');
    }
  }
}
