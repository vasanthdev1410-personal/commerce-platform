import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { normalizeSlug } from '../../common/utils/slug.util';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import type { CreateCategoryDto } from './dto/create-category.dto';
import type { UpdateCategoryDto } from './dto/update-category.dto';

const publicCategorySelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
} satisfies Prisma.CategorySelect;

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  listPublic() {
    return this.prisma.category.findMany({
      where: { isActive: true },
      select: publicCategorySelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  async getPublic(slug: string) {
    const category = await this.prisma.category.findFirst({
      where: { slug: slug.toLowerCase(), isActive: true },
      select: publicCategorySelect,
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async create(dto: CreateCategoryDto, adminUserId: string) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const category = await transaction.category.create({
          data: {
            name: dto.name.trim(),
            slug: normalizeSlug(dto.slug, dto.name),
            description: dto.description?.trim() || null,
            isActive: dto.isActive ?? true,
          },
          select: { ...publicCategorySelect, isActive: true },
        });
        await this.audit.record(
          {
            adminUserId,
            action: 'CATEGORY_CREATE',
            entityType: 'Category',
            entityId: category.id,
          },
          transaction,
        );
        return category;
      });
    } catch (error) {
      this.throwUniqueConflict(error, 'Category slug already exists');
    }
  }

  async update(id: string, dto: UpdateCategoryDto, adminUserId: string) {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Category not found');
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const category = await transaction.category.update({
          where: { id },
          data: {
            ...(dto.name !== undefined && { name: dto.name.trim() }),
            ...(dto.slug !== undefined && {
              slug: normalizeSlug(dto.slug, dto.name ?? existing.name),
            }),
            ...(dto.description !== undefined && {
              description: dto.description.trim() || null,
            }),
            ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          },
          select: { ...publicCategorySelect, isActive: true },
        });
        await this.audit.record(
          {
            adminUserId,
            action: 'CATEGORY_UPDATE',
            entityType: 'Category',
            entityId: id,
            metadata: { changedFields: Object.keys(dto) },
          },
          transaction,
        );
        return category;
      });
    } catch (error) {
      this.throwUniqueConflict(error, 'Category slug already exists');
    }
  }

  async deactivate(id: string, adminUserId: string) {
    if (!(await this.prisma.category.findUnique({ where: { id }, select: { id: true } }))) {
      throw new NotFoundException('Category not found');
    }
    await this.prisma.$transaction(async (transaction) => {
      await transaction.category.update({ where: { id }, data: { isActive: false } });
      await this.audit.record(
        {
          adminUserId,
          action: 'CATEGORY_DEACTIVATE',
          entityType: 'Category',
          entityId: id,
        },
        transaction,
      );
    });
    return { status: 'ok' as const };
  }

  private throwUniqueConflict(error: unknown, message: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(message);
    }
    throw error;
  }
}
