import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { PayoutManagerService } from './payout-manager.service';
import { PayoutStatus } from '../schemas/payout.schema';

describe('PayoutManagerService', () => {
  let service: PayoutManagerService;
  let payoutModel: any;
  let appointmentModel: any;
  let doctorModel: any;
  let userModel: any;
  let paystackService: any;
  let auditLogsService: any;
  let payoutHelper: any;
  let configService: any;
  let notificationsService: any;

  const payoutId = new Types.ObjectId();
  const doctorId = new Types.ObjectId();

  beforeEach(() => {
    payoutModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      save: jest.fn().mockResolvedValue(undefined),
    }));
    payoutModel.aggregate = jest.fn();
    payoutModel.findById = jest.fn();
    payoutModel.findOneAndUpdate = jest.fn();
    payoutModel.findOne = jest.fn();
    payoutModel.find = jest.fn();
    appointmentModel = {
      updateMany: jest.fn(),
      find: jest.fn(),
      bulkWrite: jest.fn(),
      aggregate: jest.fn(),
    };
    doctorModel = {
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };
    userModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      }),
    };
    paystackService = {
      initiateTransfer: jest.fn(),
      listBanks: jest.fn(),
      createTransferRecipient: jest.fn(),
    };
    auditLogsService = {
      create: jest.fn(),
    };
    payoutHelper = {
      getPendingEarningsAggregation: jest.fn().mockReturnValue([]),
      calculatePayoutAmount: jest.fn().mockReturnValue({
        platformCommission: 100,
        payoutAmount: 900,
      }),
    };
    configService = {
      get: jest.fn((_key: string, fallback?: any) => fallback),
    };
    notificationsService = {
      createInAppNotificationOnce: jest.fn().mockResolvedValue(undefined),
    };

    service = new PayoutManagerService(
      payoutModel,
      appointmentModel,
      doctorModel,
      userModel,
      paystackService,
      auditLogsService,
      payoutHelper,
      configService as ConfigService,
      notificationsService,
    );
  });

  it('locks appointments before saving a payout batch', async () => {
    const appointmentId = new Types.ObjectId();

    appointmentModel.aggregate.mockResolvedValue([
      {
        _id: doctorId,
        appointmentIds: [appointmentId],
        totalEarnings: 1000,
        count: 1,
      },
    ]);
    appointmentModel.updateMany.mockResolvedValue({ modifiedCount: 1 });
    jest
      .spyOn(service, 'ensureTransferRecipient')
      .mockResolvedValue('RCP_test');

    const payouts = await service.createPayoutBatch('2026-07');

    expect(appointmentModel.updateMany).toHaveBeenCalledWith(
      {
        _id: { $in: [appointmentId] },
        isPaidOut: false,
        payoutId: { $exists: false },
      },
      { payoutId: expect.any(Types.ObjectId) },
    );
    expect(payouts).toHaveLength(1);
    expect(payoutModel).toHaveBeenCalledWith(
      expect.objectContaining({
        doctorId,
        batchId: '2026-07',
        appointmentIds: [appointmentId],
        totalEarnings: 1000,
        platformCommission: 100,
        payoutAmount: 900,
        transferRecipientCode: 'RCP_test',
        status: PayoutStatus.PENDING,
      }),
    );
  });

  it('notifies the doctor and admins when bank details prevent payout setup', async () => {
    const appointmentId = new Types.ObjectId();
    const doctorUserId = new Types.ObjectId();
    appointmentModel.aggregate.mockResolvedValue([
      {
        _id: doctorId,
        appointmentIds: [appointmentId],
        totalEarnings: 1000,
      },
    ]);
    jest.spyOn(service, 'ensureTransferRecipient').mockResolvedValue(null);
    doctorModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ userId: doctorUserId }),
    });
    userModel.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([{ _id: new Types.ObjectId() }]),
    });

    await service.createPayoutBatch('2026-W28');

    expect(
      notificationsService.createInAppNotificationOnce,
    ).toHaveBeenCalledTimes(2);
    expect(
      notificationsService.createInAppNotificationOnce,
    ).toHaveBeenCalledWith(
      doctorUserId,
      'PAYOUT_BANK_DETAILS_REQUIRED',
      'Update your payout bank details',
      expect.stringContaining('bank details are missing'),
      expect.objectContaining({
        batchId: '2026-W28',
        audience: 'DOCTOR',
      }),
      `payout-bank-details:${doctorId}:2026-W28:${doctorUserId}`,
    );
    expect(appointmentModel.updateMany).not.toHaveBeenCalled();
  });

  it('initiates transfers with a stable payout reference', async () => {
    const payout: any = {
      _id: payoutId,
      doctorId,
      batchId: '2026-07',
      payoutAmount: 900,
      transferRecipientCode: 'RCP_test',
      status: PayoutStatus.PENDING,
      save: jest.fn().mockResolvedValue(undefined),
    };

    payoutModel.findById.mockResolvedValue(payout);
    payoutModel.findOneAndUpdate.mockResolvedValue(payout);
    paystackService.initiateTransfer.mockResolvedValue({
      reference: `payout_${payoutId}`,
    });

    await service.processPayout(payoutId.toString());

    expect(payoutModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: payoutId,
        status: { $in: [PayoutStatus.PENDING, PayoutStatus.FAILED] },
      },
      expect.objectContaining({
        status: PayoutStatus.PROCESSING,
        paystackTransferId: `payout_${payoutId}`,
      }),
      { new: true },
    );
    expect(paystackService.initiateTransfer).toHaveBeenCalledWith(
      'RCP_test',
      900,
      'Payout Batch 2026-07',
      `payout_${payoutId}`,
    );
    expect(payout.save).toHaveBeenCalled();
  });

  it('notifies both parties when Paystack rejects the transfer request', async () => {
    const doctorUserId = new Types.ObjectId();
    const payout: any = {
      _id: payoutId,
      doctorId,
      batchId: '2026-07',
      payoutAmount: 900,
      transferRecipientCode: 'RCP_test',
      status: PayoutStatus.PENDING,
      retryCount: 0,
      save: jest.fn().mockResolvedValue(undefined),
    };
    payoutModel.findById.mockResolvedValue(payout);
    payoutModel.findOneAndUpdate.mockResolvedValue(payout);
    paystackService.initiateTransfer.mockRejectedValue(
      new Error('Bank transfer rejected'),
    );
    doctorModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ userId: doctorUserId }),
    });
    userModel.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([{ _id: new Types.ObjectId() }]),
    });

    const result = await service.processPayout(payoutId.toString());

    expect(result.status).toBe(PayoutStatus.FAILED);
    expect(result.retryCount).toBe(1);
    expect(
      notificationsService.createInAppNotificationOnce,
    ).toHaveBeenCalledTimes(2);
  });

  it('processes due payouts in scheduled batches', async () => {
    const payout = { _id: payoutId };
    const query = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([payout]),
    };
    payoutModel.find.mockReturnValue(query);
    jest.spyOn(service, 'processPayout').mockResolvedValue({
      status: PayoutStatus.PROCESSING,
    } as any);

    const result = await service.processDuePayouts(10);

    expect(payoutModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        status: { $in: [PayoutStatus.PENDING, PayoutStatus.FAILED] },
        scheduledFor: { $lte: expect.any(Date) },
        retryCount: { $lt: 3 },
      }),
    );
    expect(query.limit).toHaveBeenCalledWith(10);
    expect(service.processPayout).toHaveBeenCalledWith(payoutId.toString());
    expect(result.attempted).toBe(1);
  });

  it('marks completed payout appointments with proportional payout amounts', async () => {
    const firstAppointmentId = new Types.ObjectId();
    const secondAppointmentId = new Types.ObjectId();
    const payout: any = {
      _id: payoutId,
      doctorId,
      batchId: '2026-07',
      appointmentIds: [firstAppointmentId, secondAppointmentId],
      totalEarnings: 1000,
      payoutAmount: 900,
      paystackTransferId: `payout_${payoutId}`,
      status: PayoutStatus.PROCESSING,
      save: jest.fn().mockResolvedValue(undefined),
    };
    const findQuery = {
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        { _id: firstAppointmentId, consultationFee: 600 },
        { _id: secondAppointmentId, consultationFee: 400 },
      ]),
    };

    payoutModel.findOne.mockResolvedValue(payout);
    appointmentModel.find.mockReturnValue(findQuery);
    appointmentModel.bulkWrite.mockResolvedValue({});
    appointmentModel.updateMany.mockResolvedValue({});
    doctorModel.findByIdAndUpdate.mockResolvedValue({});
    auditLogsService.create.mockResolvedValue({});

    await service.completePayoutFromWebhook(`payout_${payoutId}`);

    expect(payout.status).toBe(PayoutStatus.COMPLETED);
    expect(appointmentModel.bulkWrite).toHaveBeenCalledWith([
      {
        updateOne: {
          filter: { _id: firstAppointmentId, isPaidOut: false },
          update: {
            isPaidOut: true,
            paidOutAt: expect.any(Date),
            payoutAmount: 540,
          },
        },
      },
      {
        updateOne: {
          filter: { _id: secondAppointmentId, isPaidOut: false },
          update: {
            isPaidOut: true,
            paidOutAt: expect.any(Date),
            payoutAmount: 360,
          },
        },
      },
    ]);
    expect(doctorModel.findByIdAndUpdate).toHaveBeenCalledWith(doctorId, {
      $inc: { totalPayouts: 900 },
    });
  });

  it('records failed transfer webhooks for retry', async () => {
    const doctorUserId = new Types.ObjectId();
    const payout: any = {
      _id: payoutId,
      doctorId,
      batchId: '2026-07',
      status: PayoutStatus.PROCESSING,
      retryCount: 0,
      metadata: { provider: 'paystack' },
      save: jest.fn().mockResolvedValue(undefined),
    };

    payoutModel.findOne.mockResolvedValue(payout);
    auditLogsService.create.mockResolvedValue({});
    doctorModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ userId: doctorUserId }),
    });
    userModel.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([{ _id: new Types.ObjectId() }]),
    });

    await service.failPayoutFromWebhook(`payout_${payoutId}`, 'Bank offline', {
      reference: `payout_${payoutId}`,
    });

    expect(payout.status).toBe(PayoutStatus.FAILED);
    expect(payout.failureReason).toBe('Bank offline');
    expect(payout.retryCount).toBe(1);
    expect(payout.save).toHaveBeenCalled();
    expect(auditLogsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PAYOUT_FAILED',
        resource: 'Payout',
        resourceId: payoutId.toString(),
      }),
    );
    expect(
      notificationsService.createInAppNotificationOnce,
    ).toHaveBeenCalledTimes(2);

    await service.failPayoutFromWebhook(`payout_${payoutId}`, 'Bank offline', {
      reference: `payout_${payoutId}`,
    });
    expect(payout.retryCount).toBe(1);
    expect(
      notificationsService.createInAppNotificationOnce,
    ).toHaveBeenCalledTimes(2);
  });
});
