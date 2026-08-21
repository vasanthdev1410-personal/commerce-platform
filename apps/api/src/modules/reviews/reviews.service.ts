import {
BadRequestException,
ConflictException,
ForbiddenException,
Injectable,
NotFoundException,
} from '@nestjs/common';
import { Prisma, type ReviewStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import { ImageKitStorageService } from '../storage/imagekit-storage.service';
import type {
AdminReviewQueryDto,
ConfirmReviewMediaDto,
CreateReviewDto,
RejectReviewDto,
ReviewQueryDto,
ReviewUploadDto,
UpdateReviewDto,
} from './dto/review.dto';
const publicSelect = {
id: true,
rating: true,
title: true,
body: true,
verifiedPurchase: true,
createdAt: true,
updatedAt: true,
user: { select: { firstName: true, lastName: true } },
media: {
  select: { id: true, url: true, width: true, height: true, sortOrder: true },
  orderBy: { sortOrder: 'asc' },
},
} satisfies Prisma.ProductReviewSelect;
@Injectable()
export class ReviewsService {
constructor(
  private readonly prisma: PrismaService,
  private readonly storage: ImageKitStorageService,
  private readonly audit: AdminAuditService,
) {}
async create(userId: string, d: CreateReviewDto) {
  const product = await this.prisma.product.findFirst({
    where: { id: d.productId, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!product) throw new NotFoundException('Product not found');
  const purchased = await this.prisma.order.findFirst({
    where: {
      userId,
      status: 'DELIVERED',
      payments: {
        some: { status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] } },
      },
      items: { some: { variant: { productId: d.productId } } },
    },
    select: { id: true },
  });
  if (!purchased)
    throw new ForbiddenException('A delivered verified purchase is required');
  try {
    return await this.prisma.productReview.create({
      data: { ...d, userId, verifiedPurchase: true },
      include: { media: true },
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    )
      throw new ConflictException('An active review already exists');
    throw e;
  }
}
async mine(userId: string, q: ReviewQueryDto) {
  return this.page({ userId }, q, true);
}
async own(userId: string, id: string) {
  const row = await this.prisma.productReview.findFirst({
    where: { id, userId },
    include: {
      media: true,
      product: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!row) throw new NotFoundException('Review not found');
  return row;
}
async update(userId: string, id: string, d: UpdateReviewDto) {
  return this.prisma.$transaction(async (tx) => {
    const candidate = await tx.productReview.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!candidate) throw new NotFoundException('Review not found');
    await this.lockProduct(candidate.productId, tx);
    const row = await tx.productReview.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!row) throw new NotFoundException('Review not found');
    const updated = await tx.productReview.update({
      where: { id },
      data: {
        ...d,
        ...(row.status === 'APPROVED' && {
          status: 'PENDING',
          moderationReason: null,
        }),
      },
      include: { media: true },
    });
    if (row.status === 'APPROVED') await this.rebuild(row.productId, tx);
    return updated;
  });
}
async remove(userId: string, id: string) {
  return this.prisma.$transaction(async (tx) => {
    const candidate = await tx.productReview.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!candidate) throw new NotFoundException('Review not found');
    await this.lockProduct(candidate.productId, tx);
    const row = await tx.productReview.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!row) throw new NotFoundException('Review not found');
    await tx.productReview.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    if (row.status === 'APPROVED') await this.rebuild(row.productId, tx);
    return { deleted: true };
  });
}
public(productId: string, q: ReviewQueryDto) {
  return this.page(
    { productId, status: 'APPROVED', deletedAt: null },
    q,
    false,
  );
}
async summary(productId: string) {
  const s = await this.prisma.productReviewStats.findUnique({
    where: { productId },
  });
  return {
    averageRating: s?.reviewCount
      ? Number((s.ratingSum / s.reviewCount).toFixed(2))
      : 0,
    reviewCount: s?.reviewCount ?? 0,
    ratingDistribution: {
      1: s?.star1Count ?? 0,
      2: s?.star2Count ?? 0,
      3: s?.star3Count ?? 0,
      4: s?.star4Count ?? 0,
      5: s?.star5Count ?? 0,
    },
  };
}
gallery(productId: string, q: ReviewQueryDto) {
  return this.prisma.productReviewMedia.findMany({
    where: { review: { productId, status: 'APPROVED', deletedAt: null } },
    select: {
      id: true,
      url: true,
      width: true,
      height: true,
      sortOrder: true,
      review: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: 'desc' },
    skip: (q.page - 1) * q.limit,
    take: q.limit,
  });
}
async admin(q: AdminReviewQueryDto) {
  return this.page({ status: q.status }, q, true);
}
async adminOne(id: string) {
  const row = await this.prisma.productReview.findUnique({
    where: { id },
    include: {
      media: true,
      user: {
        select: { id: true, email: true, firstName: true, lastName: true },
      },
      product: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!row) throw new NotFoundException('Review not found');
  return row;
}
approve(adminId: string, id: string) {
  return this.moderate(adminId, id, 'APPROVED');
}
reject(adminId: string, id: string, d: RejectReviewDto) {
  return this.moderate(adminId, id, 'REJECTED', d.reason);
}
async uploadAuth(userId: string, id: string, d: ReviewUploadDto) {
  const review = await this.ownerActive(userId, id);
  if (
    (await this.prisma.productReviewMedia.count({
      where: { reviewId: id },
    })) >= 5
  )
    throw new ConflictException('A review may contain at most 5 images');
  return this.storage.createReviewUploadAuthorization(
    userId,
    review.id,
    d.contentType,
    d.fileSize,
  );
}
async confirmMedia(userId: string, id: string, d: ConfirmReviewMediaDto) {
  const review = await this.ownerActive(userId, id);
  const file = await this.storage.getFile(d.fileId),
    prefix = `/reviews/${userId}/${id}/`;
  if (!file || !file.filePath?.startsWith(prefix) || !file.publicUrl)
    throw new BadRequestException('Uploaded image is invalid');
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(
      file.contentType ?? '',
    ) ||
    !file.contentLength ||
    file.contentLength > 8 * 1024 * 1024
  )
    throw new BadRequestException('Uploaded image metadata is invalid');
  const mimeType = String(file.contentType);
  const sizeBytes = Number(file.contentLength);
  const publicUrl: string = file.publicUrl;
  try {
    return await this.prisma.$transaction(async (tx) => {
      await this.lockProduct(review.productId, tx);
      const current = await tx.productReview.findFirst({
        where: { id, userId, deletedAt: null },
      });
      if (!current) throw new NotFoundException('Review not found');
      const mediaCount = await tx.productReviewMedia.count({
        where: { reviewId: id },
      });
      if (mediaCount >= 5) {
        throw new ConflictException('A review may contain at most 5 images');
      }
      const media = await tx.productReviewMedia.create({
        data: {
          reviewId: id,
          imageKitFileId: d.fileId,
          url: publicUrl,
          mimeType,
          sizeBytes,
          sortOrder: d.sortOrder,
          width: d.width,
          height: d.height,
        },
      });
      if (current.status === 'APPROVED') {
        await tx.productReview.update({
          where: { id },
          data: { status: 'PENDING', moderationReason: null },
        });
        await this.rebuild(current.productId, tx);
      }
      return media;
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    )
      throw new ConflictException('Image is already confirmed');
    throw e;
  }
}
async deleteMedia(userId: string, reviewId: string, mediaId: string) {
  await this.ownerActive(userId, reviewId);
  const media = await this.prisma.productReviewMedia.findFirst({
    where: { id: mediaId, reviewId },
  });
  if (!media) throw new NotFoundException('Review image not found');
  await this.storage.deleteFile(media.imageKitFileId);
  await this.prisma.productReviewMedia.delete({ where: { id: media.id } });
  return { deleted: true };
}
private async ownerActive(userId: string, id: string) {
  const row = await this.prisma.productReview.findFirst({
    where: { id, userId, deletedAt: null },
    select: { id: true, productId: true },
  });
  if (!row) throw new NotFoundException('Review not found');
  return row;
}
private async moderate(
  adminId: string,
  id: string,
  status: ReviewStatus,
  reason?: string,
) {
  return this.prisma.$transaction(async (tx) => {
    const candidate = await tx.productReview.findFirst({
      where: { id, deletedAt: null },
    });
    if (!candidate) throw new NotFoundException('Review not found');
    await this.lockProduct(candidate.productId, tx);
    const row = await tx.productReview.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) throw new NotFoundException('Review not found');
    const updated = await tx.productReview.update({
      where: { id },
      data: { status, moderationReason: reason ?? null },
    });
    await this.rebuild(row.productId, tx);
    await this.audit.record(
      {
        adminUserId: adminId,
        action: status === 'APPROVED' ? 'REVIEW_APPROVE' : 'REVIEW_REJECT',
        entityType: 'ProductReview',
        entityId: id,
        metadata: { productId: row.productId, status },
      },
      tx,
    );
    return updated;
  });
}
private async lockProduct(
  productId: string,
  tx: Prisma.TransactionClient,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${productId}))`;
}
private async rebuild(productId: string, tx: Prisma.TransactionClient) {
  const groups = await tx.productReview.groupBy({
    by: ['rating'],
    where: { productId, status: 'APPROVED', deletedAt: null },
    _count: { _all: true },
  });
  const stars = [0, 0, 0, 0, 0],
    reviewCount = groups.reduce(
      (n, g) => ((stars[g.rating - 1] = g._count._all), n + g._count._all),
      0,
    ),
    ratingSum = groups.reduce((n, g) => n + g.rating * g._count._all, 0);
  await tx.productReviewStats.upsert({
    where: { productId },
    create: {
      productId,
      reviewCount,
      ratingSum,
      star1Count: stars[0],
      star2Count: stars[1],
      star3Count: stars[2],
      star4Count: stars[3],
      star5Count: stars[4],
    },
    update: {
      reviewCount,
      ratingSum,
      star1Count: stars[0],
      star2Count: stars[1],
      star3Count: stars[2],
      star4Count: stars[3],
      star5Count: stars[4],
    },
  });
}
private async page(
where: Prisma.ProductReviewWhereInput,
q: ReviewQueryDto,
privateView: boolean,
) {
const filtered: Prisma.ProductReviewWhereInput = {
  ...where,
  ...(q.rating !== undefined ? { rating: q.rating } : {}),
  ...(q.verifiedPurchase !== undefined
    ? { verifiedPurchase: q.verifiedPurchase }
    : {}),
};

const orderBy =
  q.sort === 'oldest'
    ? { createdAt: 'asc' as const }
    : q.sort === 'highest-rating'
      ? { rating: 'desc' as const }
      : q.sort === 'lowest-rating'
        ? { rating: 'asc' as const }
        : { createdAt: 'desc' as const };

const pagination = {
  skip: (q.page - 1) * q.limit,
  take: q.limit,
};

if (privateView) {
  const [data, total] = await this.prisma.$transaction([
    this.prisma.productReview.findMany({
      where: filtered,
      include: {
        media: true,
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      orderBy,
      ...pagination,
    }),
    this.prisma.productReview.count({
      where: filtered,
    }),
  ]);

  return {
    data,
    pagination: {
      page: q.page,
      limit: q.limit,
      total,
      totalPages: Math.ceil(total / q.limit),
    },
  };
}

const [data, total] = await this.prisma.$transaction([
  this.prisma.productReview.findMany({
    where: filtered,
    select: publicSelect,
    orderBy,
    ...pagination,
  }),
  this.prisma.productReview.count({
    where: filtered,
  }),
]);

return {
  data,
  pagination: {
    page: q.page,
    limit: q.limit,
    total,
    totalPages: Math.ceil(total / q.limit),
  },
};
}
}
