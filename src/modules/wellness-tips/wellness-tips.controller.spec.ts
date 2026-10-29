import { Test, TestingModule } from '@nestjs/testing';
import { WellnessTipsController } from './wellness-tips.controller';
import { WellnessTipsService } from './wellness-tips.service';

describe('WellnessTipsController', () => {
  let controller: WellnessTipsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WellnessTipsController],
      providers: [{ provide: WellnessTipsService, useValue: {} }],
    }).compile();

    controller = module.get<WellnessTipsController>(WellnessTipsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
