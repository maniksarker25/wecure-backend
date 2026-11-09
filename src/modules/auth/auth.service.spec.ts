import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getModelToken } from '@nestjs/mongoose';
import { Doctor } from '../doctors/schemas/doctor.schema';
import { UnauthorizedException } from '@nestjs/common';
import { Role } from 'src/common/enum/role.enum';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: Partial<UsersService>;
  let doctorModel: any;

  const mockUser = {
    _id: 'user123',
    email: 'doctor@example.com',
    password: 'hashedPassword',
    role: Role.DOCTOR,
    isEmailVerified: true,
    status: 'ACTIVE',
  };

  const mockDoctor = {
    _id: 'doctor123',
    userId: 'user123',
    verificationStatus: 'PENDING',
    isProfileComplete: true,
    isVerified: false,
    currentOrganization: 'Lagos Clinic',
    specialtyId: 'specialty-1',
    mdcnRegistrationNumber: 'MDCN-123',
    mdcnPracticingLicenseDocument: 'licence-key',
    mdcnPracticingLicenseExpiryDate: new Date('2099-01-01T00:00:00.000Z'),
    save: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    mockDoctor.verificationStatus = 'PENDING';
    mockDoctor.isProfileComplete = true;
    mockDoctor.isVerified = false;
    mockDoctor.currentOrganization = 'Lagos Clinic';
    mockDoctor.mdcnPracticingLicenseDocument = 'licence-key';
    mockDoctor.mdcnPracticingLicenseExpiryDate = new Date(
      '2099-01-01T00:00:00.000Z',
    );
    usersService = {
      findByEmail: jest.fn().mockResolvedValue(mockUser),
      updateRefreshToken: jest.fn().mockResolvedValue(undefined),
      linkDoctorProfile: jest.fn().mockResolvedValue(undefined),
    };

    doctorModel = {
      findOne: jest.fn().mockResolvedValue(mockDoctor),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn().mockResolvedValue('token') },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('secret') },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: getModelToken(Doctor.name), useValue: doctorModel },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('allows a doctor with an incomplete profile to sign in for onboarding', async () => {
      mockDoctor.verificationStatus = 'INCOMPLETE';
      mockDoctor.isProfileComplete = false;
      mockDoctor.currentOrganization = '';

      const result = await service.login('doctor@example.com', 'password');

      expect(result.verificationStatus).toBe('INCOMPLETE');
      expect(result.isProfileComplete).toBe(false);
      expect(result.doctorId).toBe('doctor123');
    });

    it('allows a pending or rejected doctor to sign in', async () => {
      mockDoctor.verificationStatus = 'PENDING';
      const pending = await service.login('doctor@example.com', 'password');
      expect(pending.verificationStatus).toBe('PENDING');
      expect(pending.isProfileComplete).toBe(true);

      mockDoctor.verificationStatus = 'REJECTED';
      const rejected = await service.login('doctor@example.com', 'password');
      expect(rejected.verificationStatus).toBe('REJECTED');
    });

    it('should throw UnauthorizedException if doctor status is SUSPENDED', async () => {
      mockDoctor.verificationStatus = 'SUSPENDED';
      await expect(
        service.login('doctor@example.com', 'password'),
      ).rejects.toThrow(
        new UnauthorizedException(
          'Your account has been suspended. Please contact support.',
        ),
      );
    });

    it('creates the doctor profile when email verification finishes', async () => {
      doctorModel.findOne.mockResolvedValue(null);
      doctorModel.create.mockResolvedValue({
        _id: 'doctor123',
        userId: mockUser._id,
        verificationStatus: 'INCOMPLETE',
        isProfileComplete: false,
        isVerified: false,
        save: jest.fn(),
      });
      (usersService as any).verifyEmailVerificationOtp = jest
        .fn()
        .mockResolvedValue(true);

      const result = await service.verifyRegistrationOtp(
        'doctor@example.com',
        '123456',
      );

      expect(doctorModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          isProfileComplete: false,
          verificationStatus: 'INCOMPLETE',
        }),
      );
      expect(result.doctorId).toBe('doctor123');
      expect(result.isProfileComplete).toBe(false);
    });

    it('creates the doctor document at signup with the national doctor id', async () => {
      const createdUser = {
        _id: 'new-user',
        name: 'Ada Lovelace',
        email: 'new@example.com',
        role: Role.DOCTOR,
      };
      (usersService.findByEmail as jest.Mock).mockResolvedValue(null);
      (usersService as any).userModel = {
        findOneAndUpdate: jest.fn().mockResolvedValue(createdUser),
      };
      doctorModel.findOne.mockImplementation((query: any) => {
        if (query?.mdcnRegistrationNumber) {
          return { select: jest.fn().mockResolvedValue(null) };
        }
        return Promise.resolve(null);
      });
      doctorModel.create.mockResolvedValue({
        _id: 'new-doctor',
        userId: createdUser._id,
        mdcnRegistrationNumber: '555555',
        verificationStatus: 'INCOMPLETE',
        isProfileComplete: false,
        isVerified: false,
      });

      const result = await service.sendRegistrationOtp({
        name: 'Ada Lovelace',
        email: 'new@example.com',
        password: 'password123',
        role: Role.DOCTOR,
        doctorId: '555555',
      });

      expect(doctorModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'new-user',
          mdcnRegistrationNumber: '555555',
          verificationStatus: 'INCOMPLETE',
          isProfileComplete: false,
        }),
      );
      expect(usersService.linkDoctorProfile).toHaveBeenCalledWith(
        'new-user',
        'new-doctor',
      );
      expect(result.doctorId).toBe('new-doctor');
    });

    it('should allow login if doctor status is VERIFIED', async () => {
      mockDoctor.verificationStatus = 'VERIFIED';
      mockDoctor.isVerified = true;
      const result = await service.login('doctor@example.com', 'password');
      expect(result).toBeDefined();
      expect(result.email).toBe('doctor@example.com');
      expect(result.verificationStatus).toBe('VERIFIED');
      expect(result.isProfileComplete).toBe(true);
    });
  });
});
