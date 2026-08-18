import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import {
  isProductImageContentType,
  MAX_PRODUCT_IMAGE_SIZE,
} from '../storage/image.constants';
import { ImageKitStorageService } from '../storage/imagekit-storage.service';
import type { ConfirmProductImageDto } from './dto/confirm-product-image.dto';
import type { PresignProductImageDto } from './dto/presign-product-image.dto';
import type { UpdateProductImageDto } from './dto/update-product-image.dto';

const adminImageSelect = {
  id: true,
  publicUrl: true,
  objectKey: true,
  altText: true,
  position: true,
  isPrimary: true,
  contentType: true,
  fileSize: true,
  createdAt: true,
} satisfies Prisma.ProductImageSelect;

@Injectable()
export class ProductImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ImageKitStorageService,
    private readonly audit: AdminAuditService,
  ) {}

  async presign(productId: string, dto: PresignProductImageDto) {
    await this.requireActiveProduct(productId);
    return this.storage.createUploadAuthorization(
      productId,
      dto.contentType,
      dto.fileSize,
    );
  }

  async confirm(
    productId: string,
    dto: ConfirmProductImageDto,
    adminUserId: string,
  ) {
    await this.requireActiveProduct(productId);
    const metadata = await this.storage.getFile(dto.fileId);
    if (!metadata) throw new BadRequestException('Uploaded image was not found');
    this.assertProductFilePath(productId, metadata.filePath);
    if (!isProductImageContentType(metadata.contentType)) {
      throw new BadRequestException('Uploaded image type is not allowed');
    }
    if (
      metadata.contentLength === undefined ||
      metadata.contentLength <= 0 ||
      metadata.contentLength > MAX_PRODUCT_IMAGE_SIZE
    ) {
      throw new BadRequestException('Uploaded image size is invalid');
    }
    if (!metadata.publicUrl) {
      throw new BadRequestException('Uploaded image URL is invalid');
    }
    const contentType = metadata.contentType;
    const fileSize = metadata.contentLength;

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const imageCount = await transaction.productImage.count({
          where: { productId },
        });
        const makePrimary = dto.isPrimary === true || imageCount === 0;
        if (makePrimary) {
          await transaction.productImage.updateMany({
            where: { productId, isPrimary: true },
            data: { isPrimary: false },
          });
        }
        const image = await transaction.productImage.create({
          data: {
            productId,
            objectKey: dto.fileId,
            publicUrl: metadata.publicUrl!,
            altText: dto.altText?.trim() || null,
            position: dto.position,
            isPrimary: makePrimary,
            contentType,
            fileSize,
          },
          select: adminImageSelect,
        });
        await this.audit.record(
          {
            adminUserId,
            action: 'PRODUCT_IMAGE_CREATE',
            entityType: 'ProductImage',
            entityId: image.id,
            metadata: { productId },
          },
          transaction,
        );
        if (makePrimary) {
          await this.audit.record(
            {
              adminUserId,
              action: 'PRODUCT_IMAGE_PRIMARY_CHANGE',
              entityType: 'ProductImage',
              entityId: image.id,
              metadata: { productId },
            },
            transaction,
          );
        }
        return image;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Image object is already registered');
      }
      throw error;
    }
  }

  async list(productId: string) {
    await this.requireProduct(productId);
    return this.prisma.productImage.findMany({
      where: { productId },
      select: adminImageSelect,
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async update(
    productId: string,
    imageId: string,
    dto: UpdateProductImageDto,
    adminUserId: string,
  ) {
    await this.requireImage(productId, imageId);
    return this.prisma.$transaction(async (transaction) => {
      if (dto.isPrimary === true) {
        await transaction.productImage.updateMany({
          where: { productId, isPrimary: true, id: { not: imageId } },
          data: { isPrimary: false },
        });
      }
      const image = await transaction.productImage.update({
        where: { id: imageId },
        data: {
          ...(dto.altText !== undefined && {
            altText: dto.altText.trim() || null,
          }),
          ...(dto.position !== undefined && { position: dto.position }),
          ...(dto.isPrimary !== undefined && { isPrimary: dto.isPrimary }),
        },
        select: adminImageSelect,
      });
      await this.audit.record(
        {
          adminUserId,
          action: 'PRODUCT_IMAGE_UPDATE',
          entityType: 'ProductImage',
          entityId: imageId,
          metadata: { productId, changedFields: Object.keys(dto) },
        },
        transaction,
      );
      if (dto.isPrimary !== undefined) {
        await this.audit.record(
          {
            adminUserId,
            action: 'PRODUCT_IMAGE_PRIMARY_CHANGE',
            entityType: 'ProductImage',
            entityId: imageId,
            metadata: { productId },
          },
          transaction,
        );
      }
      return image;
    });
  }

  async remove(productId: string, imageId: string, adminUserId: string) {
    const image = await this.requireImage(productId, imageId);
    await this.storage.deleteFile(image.objectKey);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.productImage.delete({ where: { id: imageId } });
      let nextPrimaryId: string | undefined;
      if (image.isPrimary) {
        const next = await transaction.productImage.findFirst({
          where: { productId },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
          select: { id: true },
        });
        if (next) {
          await transaction.productImage.update({
            where: { id: next.id },
            data: { isPrimary: true },
          });
          nextPrimaryId = next.id;
        }
      }
      await this.audit.record(
        {
          adminUserId,
          action: 'PRODUCT_IMAGE_DELETE',
          entityType: 'ProductImage',
          entityId: imageId,
          metadata: { productId },
        },
        transaction,
      );
      if (nextPrimaryId) {
        await this.audit.record(
          {
            adminUserId,
            action: 'PRODUCT_IMAGE_PRIMARY_CHANGE',
            entityType: 'ProductImage',
            entityId: nextPrimaryId,
            metadata: { productId },
          },
          transaction,
        );
      }
    });
    return { status: 'ok' as const };
  }

  private async requireProduct(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, deletedAt: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  private async requireActiveProduct(productId: string) {
    const product = await this.requireProduct(productId);
    if (product.deletedAt) throw new NotFoundException('Product not found');
    return product;
  }

  private async requireImage(productId: string, imageId: string) {
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId },
      select: { ...adminImageSelect, productId: true },
    });
    if (!image) throw new NotFoundException('Product image not found');
    return image;
  }

  private assertProductFilePath(productId: string, filePath: string | undefined): void {
    const prefix = `/products/${productId}/`;
    if (
      !filePath?.startsWith(prefix) ||
      filePath.includes('..') ||
      filePath.includes('\\')
    ) {
      throw new BadRequestException('Image file path is invalid');
    }
  }
}
