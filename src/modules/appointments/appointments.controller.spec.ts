import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentsController } from './appointments.controller';
import { AppointmentManagerService } from './services/appointment-manager.service';
import { AppointmentFinderService } from './services/appointment-finder.service';
import { AppointmentValidatorService } from './services/appointment-validator.service';
import { PrivateUploadService } from '../uploads/private-upload.service';
import { AppointmentAccessGuard } from '../../common/guards/appointment-access.guard';
import { PaystackService } from '../payments/paystack.service';
import { PaymentsService } from '../payments/payments.service';

describe('AppointmentsController', () => {
  let controller: AppointmentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppointmentsController],
      providers: [
        { provide: AppointmentManagerService, useValue: {} },
        { provide: AppointmentFinderService, useValue: {} },
        { provide: AppointmentValidatorService, useValue: {} },
        { provide: PrivateUploadService, useValue: {} },
        { provide: PaystackService, useValue: {} },
        { provide: PaymentsService, useValue: {} },
      ],
    })
      .overrideGuard(AppointmentAccessGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<AppointmentsController>(AppointmentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
