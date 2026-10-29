import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AppointmentFinderService } from './appointment-finder.service';
import { Appointment } from '../schemas/appointment.schema';
import { Doctor } from '../../doctors/schemas/doctor.schema';
import { Review } from '../../reviews/schemas/review.schema';
import { EncryptionService } from 'src/common/services/encryption.service';
import { UploadsService } from '../../uploads/uploads.service';
import { DoctorAvailability } from '../../availability/schemas/availability.schema';

describe('AppointmentFinderService', () => {
  let service: AppointmentFinderService;
  let appointmentModel: any;
  let reviewModel: any;
  let encryptionService: EncryptionService;

  const mockUserId = new Types.ObjectId().toString();
  const mockAppointmentId = new Types.ObjectId().toString();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentFinderService,
        {
          provide: getModelToken(Appointment.name),
          useValue: {
            aggregate: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            findById: jest.fn(),
          },
        },
        {
          provide: getModelToken(Doctor.name),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getModelToken(Review.name),
          useValue: {
            aggregate: jest.fn(),
          },
        },
        {
          provide: getModelToken(DoctorAvailability.name),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: EncryptionService,
          useValue: {
            decrypt: jest.fn((val) => val),
          },
        },
        {
          provide: UploadsService,
          useValue: {
            generateViewUrl: jest.fn().mockResolvedValue('http://mock-url.com'),
          },
        },
      ],
    }).compile();

    service = module.get<AppointmentFinderService>(AppointmentFinderService);
    appointmentModel = module.get(getModelToken(Appointment.name));
    reviewModel = module.get(getModelToken(Review.name));
    encryptionService = module.get<EncryptionService>(EncryptionService);
  });

  describe('getAppointmentDetails', () => {
    it('should throw NotFoundException if appointment not found', async () => {
      appointmentModel.findOne.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.getAppointmentDetails(mockAppointmentId, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return enriched appointment details', async () => {
      const mockAppt = {
        _id: new Types.ObjectId(mockAppointmentId),
        userId: new Types.ObjectId(mockUserId),
        doctorId: { _id: new Types.ObjectId(), userId: { name: 'Dr. Smith' } },
        specialistId: { name: 'Cardiology' },
        reasonTitle: 'Encrypted Title',
        reasonDetails: 'Encrypted Details',
        attachments: [],
        appointmentDate: new Date(),
        appointmentTime: '09:00',
        appointmentEndTime: '09:30',
        status: 'UPCOMING',
        consultationFee: 100,
      };

      appointmentModel.findOne.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockAppt),
      });

      reviewModel.aggregate.mockResolvedValue([{ total: 2, average: 4.5 }]);

      const result = await service.getAppointmentDetails(
        mockAppointmentId,
        mockUserId,
      );

      expect(result.reasonTitle).toBe('Encrypted Title');
      expect(result.doctorInfo.rating).toBe(4.5);
      expect(encryptionService.decrypt).toHaveBeenCalledWith('Encrypted Title');
    });
  });

  describe('getForUser', () => {
    it('should call aggregate with default prioritized sorting', async () => {
      appointmentModel.aggregate.mockResolvedValue([
        {
          metadata: [{ total: 1 }],
          data: [{ _id: 'appt1' }],
        },
      ]);

      const result = await service.getForUser(mockUserId);

      expect(appointmentModel.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $match: {
              userId: new Types.ObjectId(mockUserId),
              status: { $ne: 'PENDING' },
            },
          }),
          expect.objectContaining({
            $addFields: expect.objectContaining({
              sortPriority: expect.any(Object),
            }),
          }),
          expect.objectContaining({
            $sort: { sortPriority: 1, appointmentDate: -1, appointmentTime: 1 },
          }),
        ]),
      );
      expect(result.data).toHaveLength(1);
    });

    it('should filter by specific status if provided', async () => {
      appointmentModel.aggregate.mockResolvedValue([
        {
          metadata: [{ total: 1 }],
          data: [{ _id: 'appt2' }],
        },
      ]);

      const result = await service.getForUser(mockUserId, {
        status: 'UPCOMING',
      });

      expect(appointmentModel.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $match: {
              userId: new Types.ObjectId(mockUserId),
              status: 'UPCOMING',
            },
          }),
        ]),
      );
    });
  });
});
