import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AppointmentManagerService } from './appointment-manager.service';
import { Appointment } from '../schemas/appointment.schema';
import { AppointmentAttachment } from '../schemas/attachment.schema';
import { Doctor } from '../../doctors/schemas/doctor.schema';
import { AppointmentValidatorService } from './appointment-validator.service';
import { AvailabilityService } from '../../availability/availability.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { EncryptionService } from 'src/common/services/encryption.service';
import { AgoraService } from '../../agora/agora.service';
import { RefundsService } from '../../refunds/refunds.service';
import { BadRequestException } from '@nestjs/common';

describe('AppointmentManagerService', () => {
  let service: AppointmentManagerService;
  let appointmentModel: any;
  let validatorService: AppointmentValidatorService;

  const mockUserId = new Types.ObjectId().toString();
  const mockDoctorId = new Types.ObjectId().toString();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentManagerService,
        {
          provide: getModelToken(Appointment.name),
          useValue: {
            create: jest.fn(),
            findById: jest.fn(),
            updateMany: jest.fn(),
            findByIdAndUpdate: jest.fn(),
          },
        },
        {
          provide: getModelToken(AppointmentAttachment.name),
          useValue: {
            create: jest.fn(),
            updateMany: jest.fn(),
          },
        },
        {
          provide: getModelToken(Doctor.name),
          useValue: {
            findById: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: AppointmentValidatorService,
          useValue: {
            validateGeneralAvailability: jest.fn(),
            checkOverlap: jest.fn(),
          },
        },
        {
          provide: AvailabilityService,
          useValue: {
            getByDoctor: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: EncryptionService,
          useValue: {
            encrypt: jest.fn((val) => val),
          },
        },
        {
          provide: AgoraService,
          useValue: {
            generateToken: jest.fn(),
          },
        },
        {
          provide: RefundsService,
          useValue: {
            processFullRefund: jest.fn(),
          },
        },
        {
          provide: 'DatabaseConnection',
          useValue: {
            startSession: jest.fn().mockResolvedValue({
              startTransaction: jest.fn(),
              commitTransaction: jest.fn(),
              abortTransaction: jest.fn(),
              endSession: jest.fn(),
            }),
            model: jest.fn().mockReturnValue({
              findById: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  lean: jest.fn().mockResolvedValue({ timezone: 'Africa/Lagos' }),
                }),
              }),
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AppointmentManagerService>(AppointmentManagerService);
    appointmentModel = module.get(getModelToken(Appointment.name));
    validatorService = module.get<AppointmentValidatorService>(
      AppointmentValidatorService,
    );
  });

  describe('create', () => {
    it('should not book a doctor who is not verified', async () => {
      const dto = {
        doctorId: mockDoctorId,
        appointmentDate: new Date().toISOString(),
        appointmentTime: '10:00',
        reasonTitle: 'Flu',
        reasonDetails: 'High fever',
        attachmentIds: [],
      };
      const doctorModel = (service as any).doctorModel;
      doctorModel.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          _id: mockDoctorId,
          isVerified: false,
          verificationStatus: 'PENDING',
        }),
      });

      await expect(service.create(mockUserId, dto as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should successfully create an appointment', async () => {
      const dto = {
        doctorId: mockDoctorId,
        appointmentDate: new Date().toISOString(),
        appointmentTime: '10:00',
        reasonTitle: 'Flu',
        reasonDetails: 'High fever',
        attachmentIds: [],
      };

      const mockDoctor = {
        _id: mockDoctorId,
        specialtyId: 'spec1',
        isVerified: true,
        verificationStatus: 'VERIFIED',
        userId: { timezone: 'Africa/Lagos' },
      };
      const doctorModel = (service as any).doctorModel;
      doctorModel.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockDoctor),
      });

      const days = [
        'SUNDAY',
        'MONDAY',
        'TUESDAY',
        'WEDNESDAY',
        'THURSDAY',
        'FRIDAY',
        'SATURDAY',
      ];
      const currentDay = days[new Date().getDay()];
      const availabilityService = (service as any).availabilityService;
      availabilityService.getByDoctor.mockResolvedValue([
        {
          dayOfWeek: currentDay,
          isActive: true,
          startTime: '09:00',
          endTime: '17:00',
          slotSizeMinutes: 30,
        },
      ]);

      (
        validatorService.validateGeneralAvailability as jest.Mock
      ).mockResolvedValue({ fee: 100 });
      appointmentModel.create.mockResolvedValue([{ _id: 'appt1', ...dto }]);

      const result = await service.create(mockUserId, dto as any);

      expect(result._id).toBe('appt1');
      expect(appointmentModel.create).toHaveBeenCalled();
      expect(validatorService.checkOverlap).toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('should update status and emit event', async () => {
      const mockAppt = {
        _id: 'appt1',
        userId: mockUserId,
        doctorId: mockDoctorId,
        status: 'PENDING',
        save: jest.fn().mockResolvedValue({ _id: 'appt1', status: 'UPCOMING' }),
      };

      appointmentModel.findById.mockResolvedValue(mockAppt);

      const result = await service.updateStatus(
        'appt1',
        mockUserId,
        'USER',
        'UPCOMING' as any,
      );

      expect(mockAppt.status).toBe('UPCOMING');
      expect(mockAppt.save).toHaveBeenCalled();
    });
  });
});
