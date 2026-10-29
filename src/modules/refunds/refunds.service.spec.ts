import { Test, TestingModule } from '@nestjs/testing';
import { RefundsService } from './refunds.service';
import { getModelToken } from '@nestjs/mongoose';
import { Refund } from './schemas/refund.schema';
import { Payment } from '../payments/schemas/payment.schema';
import { PaystackService } from '../payments/paystack.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { AppointmentStatus } from 'src/common/enum/appointment-status.enum';

describe('RefundsService', () => {
  let service: RefundsService;
  let paymentModel: any;

  const mockPayment = {
    _id: new Types.ObjectId(),
    amount: 2000,
    paystackReference: 'ref_123',
    isRefunded: false,
  };

  const mockAppointment = {
    _id: new Types.ObjectId(),
    userId: new Types.ObjectId(),
    doctorId: new Types.ObjectId(),
    consultationFee: 2000,
    paymentId: mockPayment._id,
    appointmentDate: new Date(),
    appointmentTime: '10:00',
    status: AppointmentStatus.UPCOMING,
  };

  beforeEach(async () => {
    paymentModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockPayment),
      }),
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockPayment),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundsService,
        {
          provide: getModelToken(Refund.name),
          useValue: {},
        },
        {
          provide: getModelToken(Payment.name),
          useValue: paymentModel,
        },
        {
          provide: PaystackService,
          useValue: {},
        },
        {
          provide: AuditLogsService,
          useValue: {},
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<RefundsService>(RefundsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processFullRefund', () => {
    it('should find payment by paymentId first', async () => {
      // Mocking initiateRefund to avoid errors in the rest of the method
      jest.spyOn(service as any, 'initiateRefund').mockResolvedValue({});

      await service.processFullRefund(
        mockAppointment._id.toString(),
        mockAppointment as any,
        'user_123',
      );

      expect(paymentModel.findById).toHaveBeenCalledWith(mockPayment._id);
    });

    it('should fallback to appointmentId if paymentId is not on appointment', async () => {
      // Mocking initiateRefund
      jest.spyOn(service as any, 'initiateRefund').mockResolvedValue({});

      const aptWithoutPaymentId = { ...mockAppointment, paymentId: undefined };
      paymentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await service.processFullRefund(
        mockAppointment._id.toString(),
        aptWithoutPaymentId as any,
        'user_123',
      );

      expect(paymentModel.findOne).toHaveBeenCalledWith({
        appointmentId: new Types.ObjectId(mockAppointment._id.toString()),
      });
    });
  });
});
