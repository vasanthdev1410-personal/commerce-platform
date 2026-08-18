import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { normalizeSlug } from '../../common/utils/slug.util';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import type { AdminProductQueryDto } from './dto/admin-product-query.dto';
import type { CreateProductDto } from './dto/create-product.dto';
import type { CreateVariantDto } from './dto/create-variant.dto';
import type { ProductQueryDto } from './dto/product-query.dto';
import type { UpdateProductDto } from './dto/update-product.dto';
import type { UpdateVariantDto } from './dto/update-variant.dto';

const categorySelect = { id: true, name: true, slug: true } satisfies Prisma.CategorySelect;
const publicImageSelect = {
  id: true,
  publicUrl: true,
  altText: true,
  position: true,
  isPrimary: true,
} satisfies Prisma.ProductImageSelect;
const adminProductInclude = {
  categories: { include: { category: { select: categorySelect } } },
  variants: { include: { inventory: true }, orderBy: { createdAt: 'asc' as const } },
  images: { orderBy: [{ position: 'asc' as const }, { createdAt: 'asc' as const }] },
} satisfies Prisma.ProductInclude;

type PublicProductRow = Prisma.ProductGetPayload<{
  include: {
    categories: { include: { category: { select: typeof categorySelect } } };
    variants: { include: { inventory: true } };
    images: { select: typeof publicImageSelect };
  };
}>;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  async listPublic(query: ProductQueryDto) {
    const where = this.publicWhere(query);
    const total = await this.prisma.product.count({ where });
    let products: PublicProductRow[];

    if (query.sort === 'price_low' || query.sort === 'price_high') {
      const priceRows = await this.prisma.productVariant.groupBy({
        by: ['productId'],
        where: { isActive: true, product: where },
        _min: { retailPricePaise: true },
        orderBy: {
          _min: {
            retailPricePaise: query.sort === 'price_low' ? 'asc' : 'desc',
          },
        },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      });
      const productIds = priceRows.map(({ productId }) => productId);
      const pageProducts = await this.prisma.product.findMany({
        where: { id: { in: productIds } },
        include: this.publicInclude(),
      });
      const positions = new Map(productIds.map((id, index) => [id, index]));
      products = pageProducts.sort(
        (left, right) =>
          (positions.get(left.id) ?? 0) - (positions.get(right.id) ?? 0),
      );
    } else {
      products = await this.prisma.product.findMany({
        where,
        include: this.publicInclude(),
        orderBy: this.publicOrderBy(query.sort),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      });
    }

    return {
      data: products.map((product) => this.toPublicProduct(product, false)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async getPublic(slug: string) {
    const product = await this.prisma.product.findFirst({
      where: { slug: slug.toLowerCase(), isActive: true, deletedAt: null },
      include: this.publicInclude(),
    });
    if (!product) throw new NotFoundException('Product not found');
    return this.toPublicProduct(product, true);
  }

  async listAdmin(query: AdminProductQueryDto) {
    const where: Prisma.ProductWhereInput = {
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { slug: { contains: query.search, mode: 'insensitive' } },
          { variants: { some: { sku: { contains: query.search, mode: 'insensitive' } } } },
        ],
      }),
      ...(query.category && {
        categories: { some: { category: { slug: query.category.toLowerCase() } } },
      }),
      ...(query.status === 'active' && { isActive: true, deletedAt: null }),
      ...(query.status === 'inactive' && { isActive: false, deletedAt: null }),
      ...(query.status === 'deleted' && { deletedAt: { not: null } }),
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: adminProductInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return {
      data: data.map((product) => this.toAdminProduct(product)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async getAdmin(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: adminProductInclude,
    });
    if (!product) throw new NotFoundException('Product not found');
    return this.toAdminProduct(product);
  }

  async create(dto: CreateProductDto, adminUserId: string) {
    const categoryIds = [...new Set(dto.categoryIds)];
    await this.assertCategories(categoryIds);
    this.assertUniqueRequestSkus(dto.variants.map((variant) => variant.sku));
    try {
      const id = await this.prisma.$transaction(async (transaction) => {
        const product = await transaction.product.create({
          data: {
            name: dto.name.trim(),
            slug: normalizeSlug(dto.slug, dto.name),
            description: dto.description?.trim() || null,
            isActive: dto.isActive ?? true,
            categories: {
              create: categoryIds.map((categoryId) => ({ categoryId })),
            },
            variants: {
              create: dto.variants.map((variant) => ({
                sku: variant.sku.trim(),
                name: variant.name.trim(),
                attributes: variant.attributes as Prisma.InputJsonValue,
                retailPricePaise: variant.retailPricePaise,
                wholesalePricePaise: variant.wholesalePricePaise ?? null,
                wholesaleMinQty: variant.wholesaleMinQty,
                isActive: variant.isActive ?? true,
                taxProfileId: variant.taxProfileId ?? null,
                hsnCode: variant.hsnCode?.trim() ?? null,
                inventory: {
                  create: {
                    stockQuantity: variant.stockQuantity,
                    reorderLevel: variant.reorderLevel,
                  },
                },
              })),
            },
          },
          select: { id: true },
        });
        await this.audit.record(
          {
            adminUserId,
            action: 'PRODUCT_CREATE',
            entityType: 'Product',
            entityId: product.id,
            metadata: { variantCount: dto.variants.length },
          },
          transaction,
        );
        return product.id;
      });
      return this.getAdmin(id);
    } catch (error) {
      this.throwCatalogConflict(error);
    }
  }

  async update(id: string, dto: UpdateProductDto, adminUserId: string) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Product not found');
    const categoryIds = dto.categoryIds ? [...new Set(dto.categoryIds)] : undefined;
    if (categoryIds) await this.assertCategories(categoryIds);
    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.product.update({
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
        });
        if (categoryIds) {
          await transaction.productCategory.deleteMany({ where: { productId: id } });
          await transaction.productCategory.createMany({
            data: categoryIds.map((categoryId) => ({ productId: id, categoryId })),
          });
        }
        await this.audit.record(
          {
            adminUserId,
            action: 'PRODUCT_UPDATE',
            entityType: 'Product',
            entityId: id,
            metadata: { changedFields: Object.keys(dto) },
          },
          transaction,
        );
      });
      return this.getAdmin(id);
    } catch (error) {
      this.throwCatalogConflict(error);
    }
  }

  async createVariant(productId: string, dto: CreateVariantDto, adminUserId: string) {
    if (!(await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true } }))) {
      throw new NotFoundException('Product not found');
    }
    try {
      const variantId = await this.prisma.$transaction(async (transaction) => {
        const variant = await transaction.productVariant.create({
          data: {
            productId,
            sku: dto.sku.trim(),
            name: dto.name.trim(),
            attributes: dto.attributes as Prisma.InputJsonValue,
            retailPricePaise: dto.retailPricePaise,
            wholesalePricePaise: dto.wholesalePricePaise ?? null,
            wholesaleMinQty: dto.wholesaleMinQty,
            isActive: dto.isActive ?? true,
            taxProfileId: dto.taxProfileId ?? null,
            hsnCode: dto.hsnCode?.trim() ?? null,
            inventory: {
              create: {
                stockQuantity: dto.stockQuantity,
                reorderLevel: dto.reorderLevel,
              },
            },
          },
          select: { id: true },
        });
        await this.audit.record(
          {
            adminUserId,
            action: 'VARIANT_CREATE',
            entityType: 'ProductVariant',
            entityId: variant.id,
          },
          transaction,
        );
        return variant.id;
      });
      return this.getVariantAdmin(variantId);
    } catch (error) {
      this.throwCatalogConflict(error);
    }
  }

  async updateVariant(variantId: string, dto: UpdateVariantDto, adminUserId: string) {
    if (!(await this.prisma.productVariant.findUnique({ where: { id: variantId }, select: { id: true } }))) {
      throw new NotFoundException('Variant not found');
    }
    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.productVariant.update({
          where: { id: variantId },
          data: {
            ...(dto.sku !== undefined && { sku: dto.sku.trim() }),
            ...(dto.name !== undefined && { name: dto.name.trim() }),
            ...(dto.attributes !== undefined && {
              attributes: dto.attributes as Prisma.InputJsonValue,
            }),
            ...(dto.retailPricePaise !== undefined && {
              retailPricePaise: dto.retailPricePaise,
            }),
            ...(dto.wholesalePricePaise !== undefined && {
              wholesalePricePaise: dto.wholesalePricePaise,
            }),
            ...(dto.wholesaleMinQty !== undefined && {
              wholesaleMinQty: dto.wholesaleMinQty,
            }),
            ...(dto.isActive !== undefined && { isActive: dto.isActive }),
            ...(dto.taxProfileId !== undefined && { taxProfileId: dto.taxProfileId }),
            ...(dto.hsnCode !== undefined && { hsnCode: dto.hsnCode.trim() }),
          },
        });
        await this.audit.record(
          {
            adminUserId,
            action: dto.isActive === false ? 'VARIANT_DEACTIVATE' : 'VARIANT_UPDATE',
            entityType: 'ProductVariant',
            entityId: variantId,
            metadata: { changedFields: Object.keys(dto) },
          },
          transaction,
        );
      });
      return this.getVariantAdmin(variantId);
    } catch (error) {
      this.throwCatalogConflict(error);
    }
  }

  async softDelete(id: string, adminUserId: string) {
    if (!(await this.prisma.product.findUnique({ where: { id }, select: { id: true } }))) {
      throw new NotFoundException('Product not found');
    }
    await this.prisma.$transaction(async (transaction) => {
      await transaction.product.update({
        where: { id },
        data: { isActive: false, deletedAt: new Date() },
      });
      await transaction.productVariant.updateMany({
        where: { productId: id },
        data: { isActive: false },
      });
      await this.audit.record(
        { adminUserId, action: 'PRODUCT_DELETE', entityType: 'Product', entityId: id },
        transaction,
      );
    });
    return { status: 'ok' as const };
  }

  async restore(id: string, adminUserId: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    await this.prisma.$transaction(async (transaction) => {
      await transaction.product.update({ where: { id }, data: { deletedAt: null } });
      await this.audit.record(
        { adminUserId, action: 'PRODUCT_RESTORE', entityType: 'Product', entityId: id },
        transaction,
      );
    });
    return this.getAdmin(id);
  }

  private publicWhere(query: ProductQueryDto): Prisma.ProductWhereInput {
    return {
      isActive: true,
      deletedAt: null,
      variants: { some: { isActive: true } },
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { slug: { contains: query.search, mode: 'insensitive' } },
          { variants: { some: { sku: { contains: query.search, mode: 'insensitive' }, isActive: true } } },
        ],
      }),
      ...(query.category && {
        categories: {
          some: {
            category: { slug: query.category.toLowerCase(), isActive: true },
          },
        },
      }),
    };
  }

  private publicInclude() {
    return {
      categories: {
        where: { category: { isActive: true } },
        include: { category: { select: categorySelect } },
      },
      variants: {
        where: { isActive: true },
        include: { inventory: true },
        orderBy: { createdAt: 'asc' as const },
      },
      images: {
        select: publicImageSelect,
        orderBy: [{ position: 'asc' as const }, { createdAt: 'asc' as const }],
      },
    } satisfies Prisma.ProductInclude;
  }

  private publicOrderBy(sort: ProductQueryDto['sort']): Prisma.ProductOrderByWithRelationInput {
    if (sort === 'name_asc') return { name: 'asc' };
    if (sort === 'name_desc') return { name: 'desc' };
    return { createdAt: 'desc' };
  }

  private toPublicProduct(product: PublicProductRow, includeImageGallery: boolean) {
    const primary =
      product.images.find((image) => image.isPrimary) ?? product.images[0];
    const response = {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      categories: product.categories.map(({ category }) => category),
      variants: product.variants.map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        name: variant.name,
        attributes: variant.attributes,
        retailPricePaise: variant.retailPricePaise,
        wholesalePricePaise: variant.wholesalePricePaise,
        wholesaleMinQty: variant.wholesaleMinQty,
        isActive: variant.isActive,
        stockStatus: this.stockStatus(variant.inventory),
      })),
      primaryImage: primary
        ? { id: primary.id, url: primary.publicUrl, altText: primary.altText }
        : null,
    };
    if (!includeImageGallery) return response;
    return {
      ...response,
      images: product.images.map((image) => ({
        id: image.id,
        url: image.publicUrl,
        altText: image.altText,
        position: image.position,
        isPrimary: image.isPrimary,
      })),
    };
  }

  private toAdminProduct(product: Prisma.ProductGetPayload<{ include: typeof adminProductInclude }>) {
    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      isActive: product.isActive,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      deletedAt: product.deletedAt,
      categories: product.categories.map(({ category }) => category),
      variants: product.variants.map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        name: variant.name,
        attributes: variant.attributes,
        retailPricePaise: variant.retailPricePaise,
        wholesalePricePaise: variant.wholesalePricePaise,
        wholesaleMinQty: variant.wholesaleMinQty,
        isActive: variant.isActive,
        createdAt: variant.createdAt,
        updatedAt: variant.updatedAt,
        inventory: variant.inventory,
      })),
      images: product.images,
    };
  }

  private async getVariantAdmin(id: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id },
      include: { inventory: true },
    });
    if (!variant) throw new NotFoundException('Variant not found');
    return variant;
  }

  private stockStatus(inventory: { stockQuantity: number; reservedQuantity: number; reorderLevel: number } | null) {
    if (!inventory || inventory.stockQuantity - inventory.reservedQuantity <= 0) return 'OUT_OF_STOCK' as const;
    if (inventory.stockQuantity - inventory.reservedQuantity <= inventory.reorderLevel) return 'LOW_STOCK' as const;
    return 'IN_STOCK' as const;
  }

  private async assertCategories(categoryIds: string[]): Promise<void> {
    const count = await this.prisma.category.count({ where: { id: { in: categoryIds } } });
    if (count !== categoryIds.length) throw new BadRequestException('One or more category IDs are invalid');
  }

  private assertUniqueRequestSkus(skus: string[]): void {
    const normalized = skus.map((sku) => sku.trim());
    if (new Set(normalized).size !== normalized.length) {
      throw new ConflictException('Variant SKUs must be unique');
    }
  }

  private throwCatalogConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Product slug or SKU already exists');
    }
    throw error;
  }
}
