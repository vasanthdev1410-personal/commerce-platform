'use client';

import Image from 'next/image';
import { useState } from 'react';

export function ProductImage({ src, alt, priority = false, sizes = '(max-width: 767px) 50vw, (max-width: 1023px) 33vw, (max-width: 1535px) 25vw, 20vw' }: { src?: string | null; alt: string; priority?: boolean; sizes?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <Image
      src={!src || failed ? '/product-placeholder.svg' : src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      className="object-contain p-3 sm:p-4"
      onError={() => setFailed(true)}
    />
  );
}
