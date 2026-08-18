ALTER TABLE "PaymentRefund"
  ADD CONSTRAINT "PaymentRefund_amountPaise_positive" CHECK ("amountPaise" > 0);

ALTER TABLE "CouponRedemption"
  ADD CONSTRAINT "CouponRedemption_discountPaise_nonnegative" CHECK ("discountPaise" >= 0);
