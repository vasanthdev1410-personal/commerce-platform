import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import type {
  ApplicationQueryDto,
  CreateAddressDto,
  CustomerQueryDto,
  RejectApplicationDto,
  UpdateAddressDto,
  UpdateProfileDto,
  WholesaleApplicationDto,
} from './dto/customer-management.dto';

const profileSelect = {
  id: true,
  email: true,
  phone: true,
  firstName: true,
  lastName: true,
  role: true,
  accountType: true,
  wholesaleStatus: true,
  isActive: true,
  createdAt: true,
} satisfies Prisma.UserSelect;
const addressSelect = {
  id: true,
  label: true,
  fullName: true,
  phone: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  postalCode: true,
  countryCode: true,
  latitude: true,
  longitude: true,
  locationProvider: true,
  providerPlaceId: true,
  formattedAddress: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AddressSelect;
const applicationSelect = {
  id: true,
  businessName: true,
  businessType: true,
  gstin: true,
  businessAddress: true,
  notes: true,
  status: true,
  reviewedAt: true,
  rejectionReason: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WholesaleApplicationSelect;

@Injectable()
export class CustomerManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}
  profile(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: profileSelect,
    });
  }
  updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: profileSelect,
    });
  }
  addresses(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      select: addressSelect,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }
  async address(userId: string, id: string) {
    const row = await this.prisma.address.findFirst({
      where: { id, userId },
      select: addressSelect,
    });
    if (!row) throw new NotFoundException('Address not found');
    return row;
  }
  createAddress(userId: string, dto: CreateAddressDto) {
    this.validateCoordinates(dto);
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.address.count({ where: { userId } });
      const makeDefault = dto.isDefault === true || count === 0;
      if (makeDefault)
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      return tx.address.create({
        data: {
          ...dto,
          countryCode: dto.countryCode || 'IN',
          isDefault: makeDefault,
          userId,
        },
        select: addressSelect,
      });
    });
  }
  updateAddress(userId: string, id: string, dto: UpdateAddressDto) {
    this.validateCoordinates(dto);
    return this.prisma.$transaction(async (tx) => {
      const own = await tx.address.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      if (!own) throw new NotFoundException('Address not found');
      if (dto.isDefault)
        await tx.address.updateMany({
          where: { userId, isDefault: true, NOT: { id } },
          data: { isDefault: false },
        });
      return tx.address.update({
        where: { id },
        data: dto,
        select: addressSelect,
      });
    });
  }
  async deleteAddress(userId: string, id: string) {
    const result = await this.prisma.address.deleteMany({
      where: { id, userId },
    });
    if (!result.count) throw new NotFoundException('Address not found');
    return { deleted: true };
  }
  setDefault(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const own = await tx.address.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      if (!own) throw new NotFoundException('Address not found');
      await tx.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
      return tx.address.update({
        where: { id },
        data: { isDefault: true },
        select: addressSelect,
      });
    });
  }

  private validateCoordinates(dto: { latitude?: number; longitude?: number }): void {
    if ((dto.latitude === undefined) !== (dto.longitude === undefined)) {
      throw new BadRequestException('Latitude and longitude must be supplied together');
    }
  }
  async apply(userId: string, dto: WholesaleApplicationDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (
          await tx.wholesaleApplication.findFirst({
            where: { userId, status: 'PENDING' },
            select: { id: true },
          })
        )
          throw new ConflictException(
            'A wholesale application is already pending',
          );
        const row = await tx.wholesaleApplication.create({
          data: { userId, ...dto },
          select: applicationSelect,
        });
        await tx.user.update({
          where: { id: userId },
          data: { wholesaleStatus: 'PENDING' },
        });
        return row;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'A wholesale application is already pending',
        );
      throw error;
    }
  }
  async application(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { accountType: true, wholesaleStatus: true },
    });
    const application = await this.prisma.wholesaleApplication.findFirst({
      where: { userId },
      select: applicationSelect,
      orderBy: { createdAt: 'desc' },
    });
    return { ...user, application };
  }
  async customers(query: CustomerQueryDto) {
    const where: Prisma.UserWhereInput = {
      role: 'CUSTOMER',
      accountType: query.accountType,
      wholesaleStatus: query.wholesaleStatus,
      isActive: query.isActive,
      ...(query.search && {
        OR: ['email', 'firstName', 'lastName', 'phone'].map((field) => ({
          [field]: { contains: query.search, mode: 'insensitive' },
        })),
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: profileSelect,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
  async customer(id: string) {
    const row = await this.prisma.user.findFirst({
      where: { id, role: 'CUSTOMER' },
      select: {
        ...profileSelect,
        addresses: { select: addressSelect, orderBy: { createdAt: 'desc' } },
        wholesaleApplications: {
          select: applicationSelect,
          orderBy: { createdAt: 'desc' },
        },
        orders: { select: { status: true, totalPaise: true } },
      },
    });
    if (!row) throw new NotFoundException('Customer not found');
    const { orders, ...customer } = row;
    return {
      ...customer,
      orderSummary: {
        count: orders.length,
        totalPaise: orders.reduce((sum, o) => sum + o.totalPaise, 0),
        byStatus: orders.reduce<Record<string, number>>(
          (out, o) => ((out[o.status] = (out[o.status] || 0) + 1), out),
          {},
        ),
      },
    };
  }
  async setCustomerStatus(adminUserId: string, id: string, isActive: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.user.findFirst({
        where: { id, role: 'CUSTOMER' },
        select: { id: true, isActive: true },
      });
      if (!customer) throw new NotFoundException('Customer not found');
      const updated = await tx.user.update({
        where: { id },
        data: { isActive },
        select: profileSelect,
      });
      if (!isActive)
        await tx.authSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      await this.audit.record(
        {
          adminUserId,
          action: isActive ? 'CUSTOMER_ACTIVATE' : 'CUSTOMER_DEACTIVATE',
          entityType: 'User',
          entityId: id,
          metadata: { previousIsActive: customer.isActive, isActive },
        },
        tx,
      );
      return updated;
    });
  }
  async applications(query: ApplicationQueryDto) {
    const where: Prisma.WholesaleApplicationWhereInput = {
      status: query.status,
      ...(query.search && {
        OR: [
          { businessName: { contains: query.search, mode: 'insensitive' } },
          { gstin: { contains: query.search, mode: 'insensitive' } },
          {
            user: {
              OR: [
                { email: { contains: query.search, mode: 'insensitive' } },
                { firstName: { contains: query.search, mode: 'insensitive' } },
                { lastName: { contains: query.search, mode: 'insensitive' } },
              ],
            },
          },
        ],
      }),
    };
    const select = {
      ...applicationSelect,
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          accountType: true,
          wholesaleStatus: true,
          isActive: true,
        },
      },
    } satisfies Prisma.WholesaleApplicationSelect;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.wholesaleApplication.findMany({
        where,
        select,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.wholesaleApplication.count({ where }),
    ]);
    return {
      data: data.map((a) => ({ ...a, submittedAt: a.createdAt })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
  async applicationDetail(id: string) {
    const row = await this.prisma.wholesaleApplication.findUnique({
      where: { id },
      select: { ...applicationSelect, user: { select: profileSelect } },
    });
    if (!row) throw new NotFoundException('Wholesale application not found');
    return row;
  }
  approve(adminUserId: string, id: string) {
    return this.review(adminUserId, id, true, {});
  }
  reject(adminUserId: string, id: string, dto: RejectApplicationDto) {
    return this.review(adminUserId, id, false, dto);
  }
  private review(
    adminUserId: string,
    id: string,
    approve: boolean,
    dto: RejectApplicationDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const application = await tx.wholesaleApplication.findUnique({
        where: { id },
        include: { user: true },
      });
      if (!application)
        throw new NotFoundException('Wholesale application not found');
      if (application.status !== 'PENDING')
        throw new ConflictException(
          'Wholesale application has already been reviewed',
        );
      if (!application.user.isActive)
        throw new ConflictException(
          'Inactive customer cannot be approved or rejected',
        );
      const status = approve ? 'APPROVED' : 'REJECTED';
      const row = await tx.wholesaleApplication.update({
        where: { id },
        data: {
          status,
          reviewedByAdminId: adminUserId,
          reviewedAt: new Date(),
          rejectionReason: approve ? null : dto.reason || null,
        },
        select: applicationSelect,
      });
      await tx.user.update({
        where: { id: application.userId },
        data: {
          accountType: approve ? 'WHOLESALE' : 'RETAIL',
          wholesaleStatus: status,
        },
      });
      await this.audit.record(
        {
          adminUserId,
          action: approve ? 'WHOLESALE_APPROVE' : 'WHOLESALE_REJECT',
          entityType: 'WholesaleApplication',
          entityId: id,
          metadata: { customerId: application.userId, status },
        },
        tx,
      );
      return row;
    });
  }
}
