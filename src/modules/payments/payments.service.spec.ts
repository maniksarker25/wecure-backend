import { NotFoundException } from '@nestjs/common';
import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let paymentModel: any;

  beforeEach(() => {
    paymentModel = jest.fn().mockImplementation((dto) => ({
      save: jest.fn().mockResolvedValue(dto),
    }));
    paymentModel.findOne = jest.fn();
    paymentModel.findOneAndUpdate = jest.fn();

    service = new PaymentsService(paymentModel);
  });

  it('creates a payment record', async () => {
    const dto = {
      appointmentId: 'appointment-id',
      userId: 'user-id',
      paystackReference: 'ref_123',
      amount: 1000,
      currency: 'NGN',
      status: 'PENDING',
    };

    await expect(service.create(dto)).resolves.toEqual(dto);
  });

  it('throws when updating a missing payment status', async () => {
    paymentModel.findOneAndUpdate.mockResolvedValue(null);

    await expect(service.updateStatus('missing-ref', 'PAID')).rejects.toThrow(
      NotFoundException,
    );
  });
});
