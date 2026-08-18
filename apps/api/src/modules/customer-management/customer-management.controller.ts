import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CustomerManagementService } from './customer-management.service';
import { ApplicationQueryDto, CreateAddressDto, CustomerQueryDto, CustomerStatusDto, RejectApplicationDto, UpdateAddressDto, UpdateProfileDto, WholesaleApplicationDto } from './dto/customer-management.dto';

@Controller('users') @UseGuards(AccessTokenGuard)
export class ProfileController { constructor(private readonly service:CustomerManagementService){} @Get('me') get(@CurrentUser()u:AuthenticatedUser){return this.service.profile(u.id)} @Patch('me') patch(@CurrentUser()u:AuthenticatedUser,@Body()dto:UpdateProfileDto){return this.service.updateProfile(u.id,dto)} }

@Controller('addresses') @UseGuards(AccessTokenGuard)
export class AddressController { constructor(private readonly service:CustomerManagementService){} @Get() list(@CurrentUser()u:AuthenticatedUser){return this.service.addresses(u.id)} @Get(':id') get(@CurrentUser()u:AuthenticatedUser,@Param('id',ParseUUIDPipe)id:string){return this.service.address(u.id,id)} @Post() create(@CurrentUser()u:AuthenticatedUser,@Body()dto:CreateAddressDto){return this.service.createAddress(u.id,dto)} @Patch(':id') patch(@CurrentUser()u:AuthenticatedUser,@Param('id',ParseUUIDPipe)id:string,@Body()dto:UpdateAddressDto){return this.service.updateAddress(u.id,id,dto)} @Delete(':id') delete(@CurrentUser()u:AuthenticatedUser,@Param('id',ParseUUIDPipe)id:string){return this.service.deleteAddress(u.id,id)} @Post(':id/default') makeDefault(@CurrentUser()u:AuthenticatedUser,@Param('id',ParseUUIDPipe)id:string){return this.service.setDefault(u.id,id)} }

@Controller('wholesale') @UseGuards(AccessTokenGuard)
export class WholesaleController { constructor(private readonly service:CustomerManagementService){} @Post('applications') apply(@CurrentUser()u:AuthenticatedUser,@Body()dto:WholesaleApplicationDto){return this.service.apply(u.id,dto)} @Get('application') get(@CurrentUser()u:AuthenticatedUser){return this.service.application(u.id)} }

@Controller('admin') @UseGuards(AccessTokenGuard,RolesGuard) @Roles('ADMIN')
export class AdminCustomerController { constructor(private readonly service:CustomerManagementService){} @Get('customers') customers(@Query()q:CustomerQueryDto){return this.service.customers(q)} @Get('customers/:id') customer(@Param('id',ParseUUIDPipe)id:string){return this.service.customer(id)} @Patch('customers/:id/status') status(@CurrentUser()u:AuthenticatedUser,@Param('id',ParseUUIDPipe)id:string,@Body()dto:CustomerStatusDto){return this.service.setCustomerStatus(u.id,id,dto.isActive)} @Get('wholesale/applications') applications(@Query()q:ApplicationQueryDto){return this.service.applications(q)} @Get('wholesale/applications/:id') application(@Param('id',ParseUUIDPipe)id:string){return this.service.applicationDetail(id)} @Post('wholesale/applications/:id/approve') approve(@CurrentUser()u:AuthenticatedUser,@Param('id',ParseUUIDPipe)id:string){return this.service.approve(u.id,id)} @Post('wholesale/applications/:id/reject') reject(@CurrentUser()u:AuthenticatedUser,@Param('id',ParseUUIDPipe)id:string,@Body()dto:RejectApplicationDto){return this.service.reject(u.id,id,dto)} }
