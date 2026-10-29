import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { getModelToken } from '@nestjs/mongoose';
import { PublicUploadService } from '../public-upload/public-upload.service';
import { SpecialistService } from './specialist.service';
import { Specialist } from './schemas/specialist.schema';

describe('SpecialistService', () => {
  let service: SpecialistService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpecialistService,
        { provide: getModelToken(Specialist.name), useValue: {} },
        { provide: PublicUploadService, useValue: {} },
        { provide: CACHE_MANAGER, useValue: {} },
      ],
    }).compile();

    service = module.get<SpecialistService>(SpecialistService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
