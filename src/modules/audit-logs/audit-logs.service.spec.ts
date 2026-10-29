import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AuditLogsService } from './audit-logs.service';
import { AuditLog } from './schemas/audit-log.schema';

describe('AuditLogsService', () => {
  let service: AuditLogsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogsService,
        { provide: getModelToken(AuditLog.name), useValue: {} },
      ],
    }).compile();

    service = module.get<AuditLogsService>(AuditLogsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
