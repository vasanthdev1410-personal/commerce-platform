import { Module } from '@nestjs/common';
import { AdminAuditModule } from '../admin-audit/admin-audit.module';
import { AuthModule } from '../auth/auth.module';
import { AddressController, AdminCustomerController, ProfileController, WholesaleController } from './customer-management.controller';
import { CustomerManagementService } from './customer-management.service';

@Module({imports:[AuthModule,AdminAuditModule],controllers:[ProfileController,AddressController,WholesaleController,AdminCustomerController],providers:[CustomerManagementService]})
export class CustomerManagementModule {}
