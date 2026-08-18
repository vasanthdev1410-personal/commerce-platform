import { BadRequestException } from '@nestjs/common';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function createSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug || !SLUG_PATTERN.test(slug)) {
    throw new BadRequestException('A valid URL-safe slug is required');
  }
  return slug;
}

export function normalizeSlug(value: string | undefined, name: string): string {
  return createSlug(value?.trim() || name);
}
