ALTER TABLE "Order" ADD COLUMN "reservationExpiresAt" TIMESTAMP(3);
CREATE TABLE "InventoryReservation" (
  "id" UUID NOT NULL, "orderId" UUID NOT NULL, "variantId" UUID NOT NULL,
  "quantity" INTEGER NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  "releasedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryReservation_quantity_positive" CHECK ("quantity" > 0)
);
CREATE TABLE "CheckoutIdempotency" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "key" TEXT NOT NULL,
  "orderId" UUID NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CheckoutIdempotency_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InventoryReservation_orderId_idx" ON "InventoryReservation"("orderId");
CREATE INDEX "InventoryReservation_variantId_idx" ON "InventoryReservation"("variantId");
CREATE INDEX "InventoryReservation_expiresAt_idx" ON "InventoryReservation"("expiresAt");
CREATE INDEX "InventoryReservation_releasedAt_idx" ON "InventoryReservation"("releasedAt");
CREATE UNIQUE INDEX "CheckoutIdempotency_orderId_key" ON "CheckoutIdempotency"("orderId");
CREATE UNIQUE INDEX "CheckoutIdempotency_userId_key_key" ON "CheckoutIdempotency"("userId", "key");
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CheckoutIdempotency" ADD CONSTRAINT "CheckoutIdempotency_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CheckoutIdempotency" ADD CONSTRAINT "CheckoutIdempotency_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
