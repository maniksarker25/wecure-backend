import { Module, Global } from '@nestjs/common';
import { EncryptionService } from './services/encryption.service';
import { OwnershipGuard } from './guards/ownership.guard';

@Global()
@Module({
  providers: [EncryptionService, OwnershipGuard],
  exports: [EncryptionService, OwnershipGuard],
})
export class CommonModule {}
