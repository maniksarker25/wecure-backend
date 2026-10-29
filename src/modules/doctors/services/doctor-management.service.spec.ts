import { Test, TestingModule } from '@nestjs/testing';
import { DoctorManagementService } from './doctor-management.service';
import { getModelToken } from '@nestjs/mongoose';
import { Doctor } from '../schemas/doctor.schema';
import { DoctorService } from '../schemas/doctor-service.schema';
import { DoctorExperience } from '../schemas/doctor-experience.schema';
import { Review } from '../../reviews/schemas/review.schema';
import { UploadsService } from '../../uploads/uploads.service';
import { AvailabilityService } from '../../availability/availability.service';
import { AppointmentManagerService } from '../../appointments/services/appointment-manager.service';
import { UsersService } from '../../users/users.service';
import { PublicUploadService } from '../../public-upload/public-upload.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { PaystackService } from '../../payments/paystack.service';
import { EncryptionService } from 'src/common/services/encryption.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SpecialistService } from '../../specialist/specialist.service';

describe('DoctorManagementService', () => {
  let service: DoctorManagementService;
  let doctorModel: any;
  let encryptionService: EncryptionService;
  let specialistService: any;

  const mockDoctor = {
    _id: 'doctor123',
    userId: 'user123',
    bankName: '32hexcharsiv:encryptedbank',
    bankCode: '32hexcharsiv:encrypted044',
    accountName: '32hexcharsiv:encryptedname',
    accountNumber: '32hexcharsiv:encryptednumber',
    paystackRecipientCode: 'RCP_test',
  };

  const mockDoctorModel = {
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    create: jest.fn(),
  };

  const mockEncryptionService = {
    encrypt: jest.fn((text) => `32hexcharsiv:encrypted${text}`),
    decrypt: jest.fn((text) => text.replace('32hexcharsiv:encrypted', '')),
    isEncrypted: jest.fn((text) => text.startsWith('32hexcharsiv:')),
  };

  const mockSpecialistService = {
    isAvailable: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSpecialistService.isAvailable.mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DoctorManagementService,
        {
          provide: getModelToken(Doctor.name),
          useValue: mockDoctorModel,
        },
        {
          provide: getModelToken(DoctorService.name),
          useValue: {},
        },
        {
          provide: getModelToken(DoctorExperience.name),
          useValue: {},
        },
        {
          provide: getModelToken(Review.name),
          useValue: {},
        },
        {
          provide: UploadsService,
          useValue: {},
        },
        {
          provide: AvailabilityService,
          useValue: {},
        },
        {
          provide: AppointmentManagerService,
          useValue: {},
        },
        {
          provide: UsersService,
          useValue: {},
        },
        {
          provide: PublicUploadService,
          useValue: {},
        },
        {
          provide: NotificationsService,
          useValue: {},
        },
        {
          provide: PaystackService,
          useValue: {},
        },
        {
          provide: EncryptionService,
          useValue: mockEncryptionService,
        },
        {
          provide: SpecialistService,
          useValue: mockSpecialistService,
        },
      ],
    }).compile();

    service = module.get<DoctorManagementService>(DoctorManagementService);
    doctorModel = module.get(getModelToken(Doctor.name));
    encryptionService = module.get<EncryptionService>(EncryptionService);
    specialistService = module.get(SpecialistService);
  });

  describe('createProfile', () => {
    it('should validate specialty before creating doctor profile', async () => {
      mockDoctorModel.findOne.mockResolvedValue(null);
      mockDoctorModel.create.mockResolvedValue({
        _id: 'doctor123',
        specialtyId: '64f0c0f0c0f0c0f0c0f0c0f0',
      });

      await service.createProfile('user123', {
        currentOrganization: 'Clinic',
        specialtyId: '64f0c0f0c0f0c0f0c0f0c0f0',
      });

      expect(specialistService.isAvailable).toHaveBeenCalledWith(
        '64f0c0f0c0f0c0f0c0f0c0f0',
      );
      expect(mockDoctorModel.create).toHaveBeenCalledWith({
        userId: 'user123',
        currentOrganization: 'Clinic',
        specialtyId: '64f0c0f0c0f0c0f0c0f0c0f0',
      });
    });

    it('should reject unavailable specialty when creating doctor profile', async () => {
      mockDoctorModel.findOne.mockResolvedValue(null);
      mockSpecialistService.isAvailable.mockResolvedValue(false);

      await expect(
        service.createProfile('user123', {
          currentOrganization: 'Clinic',
          specialtyId: '64f0c0f0c0f0c0f0c0f0c0f0',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockDoctorModel.create).not.toHaveBeenCalled();
    });
  });

  describe('updateProfile', () => {
    it('should reject unavailable specialty when updating doctor profile', async () => {
      mockDoctorModel.findOne.mockResolvedValue({ _id: 'doctor123' });
      mockSpecialistService.isAvailable.mockResolvedValue(false);

      await expect(
        service.updateProfile('user123', {
          specialtyId: '64f0c0f0c0f0c0f0c0f0c0f0',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockDoctorModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('updateVerificationStatus', () => {
    it('should require MDCN details and a current licence before verification', async () => {
      const doctor = {
        verificationStatus: 'PENDING',
        mdcnRegistrationNumber: 'MDCN-123456',
        mdcnPracticingLicenseExpiryDate: new Date('2099-12-31'),
      };
      mockDoctorModel.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(doctor),
      });

      await expect(
        service.updateVerificationStatus('doctor123', 'VERIFIED'),
      ).rejects.toThrow('MDCN practising licence document is required');

      expect(mockDoctorModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('should reject verification when the licence has expired', async () => {
      const doctor = {
        verificationStatus: 'PENDING',
        mdcnRegistrationNumber: 'MDCN-123456',
        mdcnPracticingLicenseDocument: 'license-file-key',
        mdcnPracticingLicenseExpiryDate: new Date('2000-01-01'),
      };
      mockDoctorModel.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(doctor),
      });

      await expect(
        service.updateVerificationStatus('doctor123', 'VERIFIED'),
      ).rejects.toThrow('A current MDCN practising licence is required');

      expect(mockDoctorModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('getBankDetails', () => {
    it('should return decrypted bank details for doctor', async () => {
      mockDoctorModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockDoctor),
      });

      const result = await service.getBankDetails('user123');

      expect(result).toEqual({
        bankName: 'bank',
        bankCode: '044',
        accountName: 'name',
        accountNumber: 'number',
        hasRecipient: true,
      });
      expect(mockDoctorModel.findOne).toHaveBeenCalledWith({
        userId: 'user123',
      });
      expect(mockEncryptionService.decrypt).toHaveBeenCalledTimes(4);
    });

    it('should throw NotFoundException if doctor profile not found', async () => {
      mockDoctorModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      });

      await expect(service.getBankDetails('user123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
