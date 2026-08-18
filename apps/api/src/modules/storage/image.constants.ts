export const MAX_PRODUCT_IMAGE_SIZE = 8 * 1024 * 1024;
export const PRODUCT_IMAGE_UPLOAD_TTL_SECONDS = 300;

export const PRODUCT_IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
} as const;

export type ProductImageContentType = keyof typeof PRODUCT_IMAGE_TYPES;

export function isProductImageContentType(
  value: string | undefined,
): value is ProductImageContentType {
  return value !== undefined && value in PRODUCT_IMAGE_TYPES;
}
