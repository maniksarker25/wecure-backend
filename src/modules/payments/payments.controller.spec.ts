import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';
import { AppointmentFinderService } from '../appointments/services/appointment-finder.service';
import { AppointmentManagerService } from '../appointments/services/appointment-manager.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { DonationsService } from '../donations/donations.service';
import { PayoutManagerService } from '../payouts/services/payout-manager.service';
import { RefundsService } from '../refunds/refunds.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaystackService } from './paystack.service';

describe('PaymentsController', () => {
  let controller: PaymentsController;
  let paystackService: { verifyTransaction: jest.Mock };

  beforeEach(async () => {
    paystackService = {
      verifyTransaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        { provide: PaymentsService, useValue: {} },
        { provide: PaystackService, useValue: paystackService },
        { provide: AppointmentFinderService, useValue: {} },
        { provide: AppointmentManagerService, useValue: {} },
        { provide: DonationsService, useValue: {} },
        {
          provide: ConfigService,
          useValue: { get: jest.fn(() => 'test-secret') },
        },
        { provide: AuditLogsService, useValue: { create: jest.fn() } },
        { provide: PayoutManagerService, useValue: {} },
        { provide: RefundsService, useValue: {} },
      ],
    }).compile();

    controller = module.get<PaymentsController>(PaymentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return ignored when Paystack verification fails', async () => {
    paystackService.verifyTransaction.mockRejectedValue(new Error('boom'));

    const rawBody = Buffer.from(JSON.stringify({ event: 'charge.success' }));
    const signature = crypto
      .createHmac('sha512', 'test-secret')
      .update(rawBody)
      .digest('hex');

    await expect(
      controller.handleWebhook(
        signature,
        {
          event: 'charge.success',
          data: {
            reference: 'ref_123',
            metadata: { type: 'APPOINTMENT', appointmentId: 'apt_123' },
          },
        },
        {
          rawBody,
        },
      ),
    ).resolves.toEqual({ status: 'ignored' });
  });
});
