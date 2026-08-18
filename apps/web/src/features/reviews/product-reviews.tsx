'use client';

type ProductReviewsProps = {
  productId: string;
};

const ProductReviews = ({ productId }: ProductReviewsProps) => {
  return (
    <section
      aria-labelledby={`product-reviews-${productId}`}
      className="mt-12"
    >
      <h2
        id={`product-reviews-${productId}`}
        className="text-2xl font-semibold"
      >
        Product Reviews
      </h2>
    </section>
  );
};

export default ProductReviews;