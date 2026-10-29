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
  };

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn().mockResolvedValue(mockUser),
      updateRefreshToken: jest.fn().mockResolvedValue(undefined),
    };

    doctorModel = {
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDoctor),
      }),
    };

    // For findOne without exec if that's how it's used
    doctorModel.findOne = jest.fn().mockImplementation((query) => {
      return {
        exec: jest.fn().mockResolvedValue(mockDoctor),
        ...mockDoctor, // Fallback for direct return
        _id: 'doctor123',
        verificationStatus: mockDoctor.verificationStatus,
      };
    });

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
    it('should throw UnauthorizedException if doctor status is PENDING', async () => {
      mockDoctor.verificationStatus = 'PENDING';
      await expect(
        service.login('doctor@example.com', 'password'),
      ).rejects.toThrow(
        new UnauthorizedException(
          'Your account is pending verification. Please wait for admin approval.',
        ),
      );
    });

    it('should throw UnauthorizedException if doctor status is REJECTED', async () => {
      mockDoctor.verificationStatus = 'REJECTED';
      await expect(
        service.login('doctor@example.com', 'password'),
      ).rejects.toThrow(
        new UnauthorizedException(
          'Your account has been rejected. Please contact support.',
        ),
      );
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

    it('should allow login if doctor status is VERIFIED', async () => {
      mockDoctor.verificationStatus = 'VERIFIED';
      const result = await service.login('doctor@example.com', 'password');
      expect(result).toBeDefined();
      expect(result.email).toBe('doctor@example.com');
    });
  });
});
