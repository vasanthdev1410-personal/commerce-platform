import { Module } from '@nestjs/common';
import { AdminAuditModule } from '../admin-audit/admin-audit.module';
import { AuthModule } from '../auth/auth.module';
import { AdminInventoryController } from './admin-inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [AuthModule, AdminAuditModule],
  controllers: [AdminInventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
