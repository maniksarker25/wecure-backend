import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentSchedulerService } from './appointment.scheduler';
import { getModelToken } from '@nestjs/mongoose';
import { Appointment } from './schemas/appointment.schema';
import { AppointmentStatus } from '../../common/enum/appointment-status.enum';
import { NotificationsService } from '../notifications/notifications.service';

describe('Appointment Verification', () => {
  let schedulerService: AppointmentSchedulerService;

  const mockAppointmentModel = {
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
    findById: jest.fn(),
    find: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn(),
  };

  const mockNotificationsService = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockAppointmentModel.find.mockReturnThis();
    mockAppointmentModel.select.mockReturnThis();
    mockAppointmentModel.lean.mockResolvedValue([]);
    mockAppointmentModel.updateMany.mockResolvedValue({ modifiedCount: 1 });
    mockAppointmentModel.deleteMany.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentSchedulerService,
        {
          provide: getModelToken(Appointment.name),
          useValue: mockAppointmentModel,
        },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
      ],
    }).compile();

    schedulerService = module.get<AppointmentSchedulerService>(
      AppointmentSchedulerService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('AppointmentSchedulerService', () => {
    it('transitions UPCOMING to ONGOING once its start time (business timezone) has passed', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-29T12:00:00.000Z'));
      // now = 12:00 UTC = 13:00 Lagos. Start 12:30 Lagos already passed, end 14:00 Lagos has not.
      mockAppointmentModel.lean.mockResolvedValue([
        {
          _id: 'appt-upcoming',
          status: AppointmentStatus.UPCOMING,
          appointmentDate: new Date('2026-06-29T00:00:00.000Z'),
          appointmentTime: '12:30',
          appointmentEndTime: '14:00',
        },
      ]);

      await schedulerService.handleAppointmentTransitions();

      expect(mockAppointmentModel.updateMany).toHaveBeenCalledWith(
        { _id: { $in: ['appt-upcoming'] } },
        { $set: { status: AppointmentStatus.ONGOING } },
      );
      expect(mockAppointmentModel.updateMany).not.toHaveBeenCalledWith(
        expect.anything(),
        { $set: { status: AppointmentStatus.COMPLETED } },
      );
    });

    it('transitions ONGOING to COMPLETED once its end time (business timezone) has passed', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-29T12:00:00.000Z'));
      // now = 12:00 UTC = 13:00 Lagos. End 12:30 Lagos already passed.
      mockAppointmentModel.lean.mockResolvedValue([
        {
          _id: 'appt-ongoing',
          status: AppointmentStatus.ONGOING,
          appointmentDate: new Date('2026-06-29T00:00:00.000Z'),
          appointmentTime: '11:00',
          appointmentEndTime: '12:30',
        },
      ]);

      await schedulerService.handleAppointmentTransitions();

      expect(mockAppointmentModel.updateMany).toHaveBeenCalledWith(
        { _id: { $in: ['appt-ongoing'] } },
        { $set: { status: AppointmentStatus.COMPLETED } },
      );
    });

    it('skips straight to COMPLETED for an overdue UPCOMING appointment whose end time already passed', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-29T12:00:00.000Z'));
      // Appointment was for yesterday and never transitioned (e.g. server downtime).
      mockAppointmentModel.lean.mockResolvedValue([
        {
          _id: 'appt-overdue',
          status: AppointmentStatus.UPCOMING,
          appointmentDate: new Date('2026-06-28T00:00:00.000Z'),
          appointmentTime: '09:00',
          appointmentEndTime: '09:30',
        },
      ]);

      await schedulerService.handleAppointmentTransitions();

      expect(mockAppointmentModel.updateMany).toHaveBeenCalledWith(
        { _id: { $in: ['appt-overdue'] } },
        { $set: { status: AppointmentStatus.COMPLETED } },
      );
      expect(mockAppointmentModel.updateMany).not.toHaveBeenCalledWith(
        expect.anything(),
        { $set: { status: AppointmentStatus.ONGOING } },
      );
    });

    it('leaves an UPCOMING appointment alone before its start time has arrived', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-29T12:00:00.000Z'));
      mockAppointmentModel.lean.mockResolvedValue([
        {
          _id: 'appt-future',
          status: AppointmentStatus.UPCOMING,
          appointmentDate: new Date('2026-06-29T00:00:00.000Z'),
          appointmentTime: '15:00',
          appointmentEndTime: '15:30',
        },
      ]);

      await schedulerService.handleAppointmentTransitions();

      expect(mockAppointmentModel.updateMany).not.toHaveBeenCalled();
    });
  });
});
