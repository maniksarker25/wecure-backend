import { EventEmitter2 } from '@nestjs/event-emitter';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { EncryptionService } from 'src/common/services/encryption.service';
import { User } from './schemas/user.schema';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let model: any;
  let encryptionService: EncryptionService;

  const mockUser = {
    _id: 'user123',
    bankName: '32hexcharsiv:encryptedbank',
    accountName: '32hexcharsiv:encryptedname',
    accountNumber: '32hexcharsiv:encryptednumber',
  };

  const mockUserModel = {
    findById: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    create: jest.fn(),
  };

  const mockEncryptionService = {
    encrypt: jest.fn((text) => `32hexcharsiv:encrypted${text}`),
    decrypt: jest.fn((text) => text.replace('32hexcharsiv:encrypted', '')),
    isEncrypted: jest.fn((text) => text.startsWith('32hexcharsiv:')),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getModelToken(User.name),
          useValue: mockUserModel,
        },
        {
          provide: EncryptionService,
          useValue: mockEncryptionService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    model = module.get(getModelToken(User.name));
    encryptionService = module.get<EncryptionService>(EncryptionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateProfile', () => {
    it('should update timezone when provided', async () => {
      const updatedUser = {
        _id: 'user123',
        timezone: 'America/New_York',
      };

      mockUserModel.findByIdAndUpdate.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(updatedUser),
      });

      const result = await service.updateProfile('user123', {
        timezone: 'America/New_York',
      });

      expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'user123',
        { timezone: 'America/New_York' },
        { new: true },
      );
      expect(result?.timezone).toBe('America/New_York');
    });
  });

  describe('getBankDetails', () => {
    it('should return decrypted bank details', async () => {
      mockUserModel.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockUser),
      });

      const result = await service.getBankDetails('user123');

      expect(result).toEqual({
        bankName: 'bank',
        accountName: 'name',
        accountNumber: 'number',
      });
      expect(mockUserModel.findById).toHaveBeenCalledWith('user123');
      expect(mockEncryptionService.decrypt).toHaveBeenCalledTimes(3);
    });

    it('should throw BadRequestException if user not found', async () => {
      mockUserModel.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      });

      await expect(service.getBankDetails('user123')).rejects.toThrow(
        'User not found',
      );
    });
  });
});
