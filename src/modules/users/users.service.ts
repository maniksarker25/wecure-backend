import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { Role } from 'src/common/enum/role.enum';
import { UserStatus } from 'src/common/enum/user.status.enum';
import { EncryptionService } from 'src/common/services/encryption.service';
import { AddUserBankDetailsDto } from './dto/add-user-bank-details.dto';
import { CreateAdminDto } from './dto/create-admin.dto';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  constructor(
    @InjectModel(User.name)
    public readonly userModel: Model<UserDocument>,
    private readonly encryptionService: EncryptionService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createUser(data: {
    name: string;
    email: string;
    password: string;
    role: string;
    phone?: string;
    doctorId?: string;
    dateOfBirth?: Date | string;
    allergies?: string[];
    bloodGroup?: string;
    profileImage?: string;
  }) {
    const exists = await this.userModel.findOne({ email: data.email });
    if (exists) throw new ConflictException('Email already in use');

    const hashedPassword = await bcrypt.hash(data.password, 12);

    const dataToSave: any = {
      ...data,
      password: hashedPassword,
    };

    if (data.phone) {
      dataToSave.phone = this.encryptionService.encrypt(data.phone);
    }
    if (data.allergies) {
      dataToSave.allergies = this.encryptionService.encrypt(
        JSON.stringify(data.allergies),
      );
    }
    if (data.dateOfBirth) {
      // Ensure we store string representation usually
      const dobStr =
        data.dateOfBirth instanceof Date
          ? (data.dateOfBirth as Date).toISOString()
          : data.dateOfBirth;
      dataToSave.dateOfBirth = this.encryptionService.encrypt(dobStr);
    }

    if (data.role === Role.ADMIN || data.role === Role.SUPER_ADMIN) {
      dataToSave.isEmailVerified = true;
    }

    const status =
      data.role === Role.DOCTOR ? UserStatus.PENDING : UserStatus.ACTIVE;

    return this.userModel.create({
      ...dataToSave,
      status,
    });
  }

  async createAdmin(data: CreateAdminDto) {
    const admin = await this.createUser({
      ...data,
      role: Role.ADMIN,
    });

    // Emit event to send credentials via email
    this.eventEmitter.emit('admin.created', {
      email: data.email,
      name: data.name,
      password: data.password, // Original password before hashing in createUser
    });

    return admin;
  }

  async findByEmail(email: string) {
    const user = await this.userModel.findOne({ email }).lean();
    if (user) {
      if (user.phone) {
        user.phone = this.encryptionService.decrypt(user.phone) as string;
      }
      if (user.allergies && typeof user.allergies === 'string') {
        try {
          (user as any).allergies = JSON.parse(
            this.encryptionService.decrypt(user.allergies) as string,
          );
        } catch {
          (user as any).allergies = [];
        }
      }
      if (user.dateOfBirth && typeof user.dateOfBirth === 'string') {
        const decryptedDob = this.encryptionService.decrypt(user.dateOfBirth);
        // Helper to try converting back to Date or keep string
        (user as any).dateOfBirth = decryptedDob;
      }

      // Decrypt bank details if they exist
      if (user.bankName) {
        user.bankName = this.encryptionService.isEncrypted(user.bankName)
          ? this.encryptionService.decrypt(user.bankName)
          : user.bankName;
      }
      if (user.accountName) {
        user.accountName = this.encryptionService.isEncrypted(user.accountName)
          ? this.encryptionService.decrypt(user.accountName)
          : user.accountName;
      }
      if (user.accountNumber) {
        user.accountNumber = this.encryptionService.isEncrypted(
          user.accountNumber,
        )
          ? this.encryptionService.decrypt(user.accountNumber)
          : user.accountNumber;
      }
    }
    return user;
  }

  async findById(id: string) {
    const user = await this.userModel.findById(id).select('-password').lean();
    if (user) {
      if (user.phone) {
        user.phone = this.encryptionService.decrypt(user.phone) as string;
      }
      if (user.allergies && typeof user.allergies === 'string') {
        try {
          (user as any).allergies = JSON.parse(
            this.encryptionService.decrypt(user.allergies) as string,
          );
        } catch {
          (user as any).allergies = [];
        }
      }
      if (user.dateOfBirth && typeof user.dateOfBirth === 'string') {
        const decryptedDob = this.encryptionService.decrypt(user.dateOfBirth);
        (user as any).dateOfBirth = decryptedDob;
      }

      // Decrypt bank details if they exist
      if (user.bankName) {
        user.bankName = this.encryptionService.isEncrypted(user.bankName)
          ? this.encryptionService.decrypt(user.bankName)
          : user.bankName;
      }
      if (user.accountName) {
        user.accountName = this.encryptionService.isEncrypted(user.accountName)
          ? this.encryptionService.decrypt(user.accountName)
          : user.accountName;
      }
      if (user.accountNumber) {
        user.accountNumber = this.encryptionService.isEncrypted(
          user.accountNumber,
        )
          ? this.encryptionService.decrypt(user.accountNumber)
          : user.accountNumber;
      }
    }
    return user;
  }

  async updateRefreshToken(userId: string, refreshToken: string | null) {
    const hashedRefreshToken = refreshToken
      ? await bcrypt.hash(refreshToken, 11)
      : null;
    await this.userModel.findByIdAndUpdate(userId, {
      refreshToken: hashedRefreshToken,
    });
  }

  async saveEmailVerificationOtp(
    email: string,
    hashedOtp: string,
    expiresAt: Date,
  ) {
    await this.userModel.findOneAndUpdate(
      { email },
      {
        emailVerificationOtp: hashedOtp,
        emailVerificationOtpExpires: expiresAt,
      },
      { upsert: true },
    );
  }

  async verifyEmailVerificationOtp(
    email: string,
    otp: string,
  ): Promise<boolean> {
    const user = await this.userModel.findOne({ email });
    if (
      !user ||
      !user.emailVerificationOtp ||
      !user.emailVerificationOtpExpires
    ) {
      return false;
    }

    if (new Date() > user.emailVerificationOtpExpires) {
      return false;
    }

    const isValid = await bcrypt.compare(otp, user.emailVerificationOtp);
    if (isValid) {
      await this.userModel.findOneAndUpdate(
        { email },
        {
          isEmailVerified: true,
          emailVerificationOtp: null,
          emailVerificationOtpExpires: null,
        },
      );
    }
    return isValid;
  }

  async savePasswordResetOtp(
    email: string,
    hashedOtp: string,
    expiresAt: Date,
  ) {
    await this.userModel.findOneAndUpdate(
      { email },
      {
        passwordResetOtp: hashedOtp,
        passwordResetOtpExpires: expiresAt,
      },
    );
  }

  async verifyPasswordResetOtp(email: string, otp: string): Promise<boolean> {
    const user = await this.userModel.findOne({ email });
    if (!user || !user.passwordResetOtp || !user.passwordResetOtpExpires) {
      return false;
    }

    if (new Date() > user.passwordResetOtpExpires) {
      return false;
    }

    const isValid = await bcrypt.compare(otp, user.passwordResetOtp);
    if (isValid) {
      await this.userModel.findOneAndUpdate(
        { email },
        {
          passwordResetOtp: null,
          passwordResetOtpExpires: null,
        },
      );
    }
    return isValid;
  }

  async updatePassword(email: string, newPassword: string) {
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await this.userModel.findOneAndUpdate(
      { email },
      {
        password: hashedPassword,
        passwordResetOtp: null,
        passwordResetOtpExpires: null,
      },
    );
  }

  async getPendingRegistration(email: string) {
    return this.userModel
      .findOne({
        email,
        isEmailVerified: false,
      })
      .lean();
  }

  async updateProfile(
    userId: string,
    data: {
      name?: string;
      phone?: string;
      dateOfBirth?: string;
      profileImage?: string;
      allergies?: string[];
      bloodGroup?: string;
      timezone?: string;
    },
  ) {
    const updates: any = {};
    if (data.name) updates.name = data.name;
    if (data.dateOfBirth) {
      updates.dateOfBirth = this.encryptionService.encrypt(
        new Date(data.dateOfBirth).toISOString(),
      );
    }
    if (data.profileImage) updates.profileImage = data.profileImage;
    if (data.allergies) {
      updates.allergies = this.encryptionService.encrypt(
        JSON.stringify(data.allergies),
      );
    }
    if (data.bloodGroup) updates.bloodGroup = data.bloodGroup;
    if (data.timezone) updates.timezone = data.timezone;
    if (data.phone) {
      updates.phone = this.encryptionService.encrypt(data.phone);
    }

    const updatedUser = await this.userModel
      .findByIdAndUpdate(userId, updates, { new: true })
      .select('-password')
      .lean();

    if (updatedUser) {
      if (updatedUser.phone) {
        updatedUser.phone = this.encryptionService.decrypt(
          updatedUser.phone,
        ) as string;
      }
      if (updatedUser.allergies && typeof updatedUser.allergies === 'string') {
        try {
          (updatedUser as any).allergies = JSON.parse(
            this.encryptionService.decrypt(updatedUser.allergies) as string,
          );
        } catch {
          (updatedUser as any).allergies = [];
        }
      }
      if (
        updatedUser.dateOfBirth &&
        typeof updatedUser.dateOfBirth === 'string'
      ) {
        (updatedUser as any).dateOfBirth = this.encryptionService.decrypt(
          updatedUser.dateOfBirth,
        );
      }

      // Decrypt bank details if they exist
      if (updatedUser.bankName) {
        updatedUser.bankName = this.encryptionService.isEncrypted(
          updatedUser.bankName,
        )
          ? this.encryptionService.decrypt(updatedUser.bankName)
          : updatedUser.bankName;
      }
      if (updatedUser.accountName) {
        updatedUser.accountName = this.encryptionService.isEncrypted(
          updatedUser.accountName,
        )
          ? this.encryptionService.decrypt(updatedUser.accountName)
          : updatedUser.accountName;
      }
      if (updatedUser.accountNumber) {
        updatedUser.accountNumber = this.encryptionService.isEncrypted(
          updatedUser.accountNumber,
        )
          ? this.encryptionService.decrypt(updatedUser.accountNumber)
          : updatedUser.accountNumber;
      }

      this.eventEmitter.emit('user.profile_updated', {
        userId: updatedUser._id.toString(),
        role: updatedUser.role,
      });
    }

    return updatedUser;
  }

  async changePassword(userId: string, data: any) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new ConflictException('User not found');
    }

    const match = await bcrypt.compare(data.oldPassword, user.password);
    if (!match) {
      throw new ConflictException('Invalid old password');
    }

    const hashedPassword = await bcrypt.hash(data.newPassword, 12);
    await this.userModel.findByIdAndUpdate(userId, {
      password: hashedPassword,
    });
  }

  async deleteAccount(userId: string) {
    await this.userModel.findByIdAndDelete(userId);
  }

  async findAll(query: any) {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (query.role) filter.role = query.role;
    if (query.search) {
      filter.$or = [
        { name: { $regex: query.search, $options: 'i' } },
        { email: { $regex: query.search, $options: 'i' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.userModel
        .find(filter)
        .skip(skip)
        .limit(limit)
        .select('-password')
        .lean(),
      this.userModel.countDocuments(filter),
    ]);

    const decryptedData = data.map((user) => {
      if (user.phone) {
        user.phone = this.encryptionService.decrypt(user.phone) as string;
      }
      if (user.allergies && typeof user.allergies === 'string') {
        try {
          (user as any).allergies = JSON.parse(
            this.encryptionService.decrypt(user.allergies) as string,
          );
        } catch {
          (user as any).allergies = [];
        }
      }
      if (user.dateOfBirth && typeof user.dateOfBirth === 'string') {
        (user as any).dateOfBirth = this.encryptionService.decrypt(
          user.dateOfBirth,
        );
      }

      // Decrypt bank details if they exist
      if (user.bankName) {
        user.bankName = this.encryptionService.isEncrypted(user.bankName)
          ? this.encryptionService.decrypt(user.bankName)
          : user.bankName;
      }
      if (user.accountName) {
        user.accountName = this.encryptionService.isEncrypted(user.accountName)
          ? this.encryptionService.decrypt(user.accountName)
          : user.accountName;
      }
      if (user.accountNumber) {
        user.accountNumber = this.encryptionService.isEncrypted(
          user.accountNumber,
        )
          ? this.encryptionService.decrypt(user.accountNumber)
          : user.accountNumber;
      }
      return user;
    });

    return {
      data: decryptedData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async toggleUserStatus(userId: string, requestingUserId?: string) {
    if (requestingUserId && userId === requestingUserId) {
      throw new BadRequestException('You cannot block/unblock yourself');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new ConflictException('User not found');
    }

    const newStatus =
      user.status === UserStatus.BLOCKED
        ? UserStatus.ACTIVE
        : UserStatus.BLOCKED;
    return this.userModel.findByIdAndUpdate(
      userId,
      { status: newStatus },
      { new: true },
    );
  }

  async changeRole(userId: string, role: string) {
    return this.userModel.findByIdAndUpdate(userId, { role }, { new: true });
  }

  async registerFcmToken(userId: string, token: string) {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      throw new BadRequestException('FCM token is required');
    }

    return this.userModel.findByIdAndUpdate(
      userId,
      { $addToSet: { fcmTokens: normalizedToken } },
      { new: true },
    );
  }

  async removeFcmToken(userId: string, token: string) {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      throw new BadRequestException('FCM token is required');
    }

    return this.userModel.findByIdAndUpdate(
      userId,
      { $pull: { fcmTokens: normalizedToken } },
      { new: true },
    );
  }

  async addBankDetails(userId: string, dto: AddUserBankDetailsDto) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new BadRequestException('User not found');

    const updateData = {
      bankName: this.encryptionService.encrypt(dto.bankName),
      accountName: this.encryptionService.encrypt(dto.accountName),
      accountNumber: this.encryptionService.encrypt(dto.accountNumber),
    };

    return this.userModel
      .findByIdAndUpdate(userId, updateData, { new: true })
      .select('-password')
      .lean();
  }

  async getBankDetails(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('bankName accountName accountNumber')
      .lean();
    if (!user) throw new BadRequestException('User not found');

    return {
      bankName: user.bankName
        ? this.encryptionService.isEncrypted(user.bankName)
          ? this.encryptionService.decrypt(user.bankName)
          : user.bankName
        : null,
      accountName: user.accountName
        ? this.encryptionService.isEncrypted(user.accountName)
          ? this.encryptionService.decrypt(user.accountName)
          : user.accountName
        : null,
      accountNumber: user.accountNumber
        ? this.encryptionService.isEncrypted(user.accountNumber)
          ? this.encryptionService.decrypt(user.accountNumber)
          : user.accountNumber
        : null,
    };
  }
}
