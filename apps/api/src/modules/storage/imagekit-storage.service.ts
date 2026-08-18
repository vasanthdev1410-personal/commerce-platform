import { randomUUID } from 'node:crypto';
import ImageKit from '@imagekit/nodejs';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PRODUCT_IMAGE_TYPES,
  PRODUCT_IMAGE_UPLOAD_TTL_SECONDS,
  type ProductImageContentType,
} from './image.constants';

export interface StoredImageMetadata {
  contentType: string | undefined;
  contentLength: number | undefined;
  filePath: string | undefined;
  publicUrl: string | undefined;
}

export interface ImageKitUploadAuthorization {
  token: string;
  expire: number;
  signature: string;
  publicKey: string;
  uploadUrl: string;
  fileName: string;
  folder: string;
  useUniqueFileName: false;
  expiresIn: number;
}

@Injectable()
export class ImageKitStorageService {
  private readonly client: ImageKit | null;
  private readonly publicKey: string | null;
  private readonly urlEndpoint: string | null;
  private readonly mockMode: boolean;
  private readonly mockFiles = new Map<string, StoredImageMetadata>();

  constructor(config: ConfigService) {
    const privateKey = config.get<string>('IMAGEKIT_PRIVATE_KEY');
    this.publicKey = config.get<string>('IMAGEKIT_PUBLIC_KEY') || null;
    this.urlEndpoint = config.get<string>('IMAGEKIT_URL_ENDPOINT') || null;
    this.mockMode =
      config.get('NODE_ENV') === 'test' &&
      config.get('IMAGEKIT_MOCK_MODE') === 'true';
    this.client = !this.mockMode && privateKey
      ? new ImageKit({ privateKey, logLevel: 'off' })
      : null;
  }

  createUploadAuthorization(
    productId: string,
    contentType: ProductImageContentType,
    expectedFileSize: number,
  ): ImageKitUploadAuthorization & { mockFileId?: string } {
    return this.createScopedUploadAuthorization(`/products/${productId}`, contentType, expectedFileSize);
  }

  createReviewUploadAuthorization(
    userId: string,
    reviewId: string,
    contentType: 'image/jpeg' | 'image/png' | 'image/webp',
    expectedFileSize: number,
  ): ImageKitUploadAuthorization & { mockFileId?: string } {
    return this.createScopedUploadAuthorization(`/reviews/${userId}/${reviewId}`, contentType, expectedFileSize);
  }

  private createScopedUploadAuthorization(
    folder: string,
    contentType: ProductImageContentType,
    expectedFileSize: number,
  ): ImageKitUploadAuthorization & { mockFileId?: string } {
    const fileName = `${randomUUID()}.${PRODUCT_IMAGE_TYPES[contentType]}`;

    if (this.mockMode) {
      const mockFileId = randomUUID();
      const filePath = `${folder}/${fileName}`;
      this.mockFiles.set(mockFileId, {
        contentType,
        contentLength: expectedFileSize,
        filePath,
        publicUrl: `https://images.test.invalid${filePath}`,
      });
      return {
        token: randomUUID(),
        expire: Math.floor(Date.now() / 1000) + PRODUCT_IMAGE_UPLOAD_TTL_SECONDS,
        signature: 'mock-signature',
        publicKey: 'mock-public-key',
        uploadUrl: 'https://upload.imagekit.io/api/v1/files/upload',
        fileName,
        folder,
        useUniqueFileName: false,
        expiresIn: PRODUCT_IMAGE_UPLOAD_TTL_SECONDS,
        mockFileId,
      };
    }

    const { client, publicKey } = this.requireStorage();
    const auth = client.helper.getAuthenticationParameters(
      undefined,
      PRODUCT_IMAGE_UPLOAD_TTL_SECONDS,
    );
    return {
      ...auth,
      publicKey,
      uploadUrl: 'https://upload.imagekit.io/api/v1/files/upload',
      fileName,
      folder,
      useUniqueFileName: false,
      expiresIn: PRODUCT_IMAGE_UPLOAD_TTL_SECONDS,
    };
  }

  async getFile(fileId: string): Promise<StoredImageMetadata | null> {
    if (this.mockMode) return this.mockFiles.get(fileId) ?? null;
    const { client } = this.requireStorage();
    try {
      const file = await client.files.get(fileId);
      return {
        contentType: file.mime,
        contentLength: file.size,
        filePath: file.filePath,
        publicUrl: file.url,
      };
    } catch (error: unknown) {
      if (this.isMissingFile(error)) return null;
      throw new ServiceUnavailableException('Image storage is unavailable');
    }
  }

  async deleteFile(fileId: string): Promise<void> {
    if (this.mockMode) {
      this.mockFiles.delete(fileId);
      return;
    }
    const { client } = this.requireStorage();
    try {
      await client.files.delete(fileId);
    } catch {
      throw new ServiceUnavailableException('Image storage is unavailable');
    }
  }

  private requireStorage(): { client: ImageKit; publicKey: string } {
    if (!this.client || !this.publicKey || !this.urlEndpoint) {
      throw new ServiceUnavailableException('Image storage is not configured');
    }
    return { client: this.client, publicKey: this.publicKey };
  }

  private isMissingFile(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const candidate = error as { status?: number; statusCode?: number };
    return candidate.status === 404 || candidate.statusCode === 404;
  }
}
