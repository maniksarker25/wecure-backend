import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { WellnessTipsService } from './wellness-tips.service';
import { WellnessTip } from './schemas/wellness-tip.schema';
import { WellnessTipLike } from './schemas/wellness-tip-like.schema';

describe('WellnessTipsService', () => {
  let service: WellnessTipsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WellnessTipsService,
        { provide: getModelToken(WellnessTip.name), useValue: {} },
        { provide: getModelToken(WellnessTipLike.name), useValue: {} },
      ],
    }).compile();

    service = module.get<WellnessTipsService>(WellnessTipsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
