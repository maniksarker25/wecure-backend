import { Test, TestingModule } from '@nestjs/testing';
import { DoctorsService } from './doctors.service';
import { DoctorAdminService } from './services/doctor-admin.service';
import { DoctorManagementService } from './services/doctor-management.service';
import { DoctorPublicService } from './services/doctor-public.service';

describe('DoctorsService', () => {
  let service: DoctorsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DoctorsService,
        { provide: DoctorManagementService, useValue: {} },
        { provide: DoctorAdminService, useValue: {} },
        { provide: DoctorPublicService, useValue: {} },
      ],
    }).compile();

    service = module.get<DoctorsService>(DoctorsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
