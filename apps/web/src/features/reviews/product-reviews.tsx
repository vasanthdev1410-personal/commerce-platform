// apps/web/src/features/reviews/product-reviews.tsx
import Image from 'next/image';

const ProductReviews: React.FC = () => {
  return (
    <div>
      <Image
        src="https://example.com/image.jpg"
        alt="Product Image"
        width={200}
        height={200}
        sizes="(max-width: 640px) 100vw, 640px"
      />
    </div>
  );
};

export default ProductReviews;
