import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AppointmentValidatorService } from './appointment-validator.service';
import { Appointment } from '../schemas/appointment.schema';
import { Doctor } from '../../doctors/schemas/doctor.schema';
import { AvailabilityService } from '../../availability/availability.service';
import { AppointmentStatus } from 'src/common/enum/appointment-status.enum';
import { getUtcDayBounds } from 'src/common/utils/business-time.util';

describe('AppointmentValidatorService', () => {
  let service: AppointmentValidatorService;
  let availabilityService: AvailabilityService;
  let appointmentModel: any;

  const mockDoctorId = new Types.ObjectId().toString();
  const mockDate = new Date();
  mockDate.setDate(mockDate.getDate() + 1); // Tomorrow

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentValidatorService,
        {
          provide: getModelToken(Appointment.name),
          useValue: {
            find: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            session: jest.fn().mockReturnThis(),
            lean: jest.fn(),
          },
        },
        {
          provide: AvailabilityService,
          useValue: {
            getByDoctor: jest.fn(),
            generateSlots: jest.fn(),
          },
        },
        {
          provide: getModelToken(Doctor.name),
          useValue: {
            findById: jest.fn().mockReturnValue({
              populate: jest.fn().mockReturnThis(),
              lean: jest.fn().mockResolvedValue({
                userId: { timezone: 'Africa/Lagos' },
              }),
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AppointmentValidatorService>(
      AppointmentValidatorService,
    );
    availabilityService = module.get<AvailabilityService>(AvailabilityService);
    appointmentModel = module.get(getModelToken(Appointment.name));
  });

  describe('validateGeneralAvailability', () => {
    it('should throw BadRequestException if date is in the past', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      await expect(
        service.validateGeneralAvailability(
          mockDoctorId,
          pastDate,
          '10:00',
          '10:30',
          [],
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if no availabilities provided', async () => {
      await expect(
        service.validateGeneralAvailability(
          mockDoctorId,
          mockDate,
          '10:00',
          '10:30',
          [],
        ),
      ).rejects.toThrow('Doctor has no availability configured');
    });

    it('should throw if doctor is not available on that day', async () => {
      const availabilities = [{ dayOfWeek: 'MONDAY', isActive: true }];
      // Pick a date that is definitely not Monday for this test
      const sunday = new Date('2030-02-03'); // This is a Sunday

      await expect(
        service.validateGeneralAvailability(
          mockDoctorId,
          sunday,
          '10:00',
          '10:30',
          availabilities,
        ),
      ).rejects.toThrow('Doctor is not available on SUNDAY');
    });

    it('should throw if time is outside of start/end range', async () => {
      const availabilities = [
        {
          dayOfWeek: 'MONDAY',
          isActive: true,
          startTime: '09:00',
          endTime: '17:00',
        },
      ];
      const monday = new Date('2030-02-04');

      await expect(
        service.validateGeneralAvailability(
          mockDoctorId,
          monday,
          '08:00',
          '08:30',
          availabilities,
        ),
      ).rejects.toThrow('Appointment time must be between 09:00 and 17:00');
    });
  });

  describe('checkOverlap', () => {
    it('should throw if overlapping appointment exists', async () => {
      appointmentModel.lean.mockResolvedValue([
        {
          appointmentTime: '10:00',
          appointmentEndTime: '10:30',
        },
      ]);

      await expect(
        service.checkOverlap(mockDoctorId, mockDate, '10:15', '10:45', {}),
      ).rejects.toThrow('This time slot overlaps with an existing appointment');
    });

    it('should call find with correct filters', async () => {
      appointmentModel.lean.mockResolvedValue([]);

      await service.checkOverlap(
        mockDoctorId,
        mockDate,
        '10:00',
        '10:30',
        'mock-session',
      );

      const { start: startOfDay, end: endOfDay } = getUtcDayBounds(mockDate);

      expect(appointmentModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          doctorId: new Types.ObjectId(mockDoctorId),
          appointmentDate: { $gte: startOfDay, $lt: endOfDay },
          status: { $ne: AppointmentStatus.CANCELLED },
        }),
      );
    });
  });
});
