BEGIN;

ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'CAPTURED_REQUIRES_ACTION' AFTER 'AUTHORIZED';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Inventory"
    WHERE "stockQuantity" < 0
       OR "reservedQuantity" < 0
       OR "reservedQuantity" > "stockQuantity"
  ) THEN
    RAISE EXCEPTION 'Inventory rows violate the reserved-stock invariant; migration stopped without changing inventory data'
      USING ERRCODE = 'check_violation';
  END IF;
END $$;

ALTER TABLE "Inventory"
  ADD CONSTRAINT "Inventory_reserved_not_exceed_stock"
  CHECK (
    "stockQuantity" >= 0
    AND "reservedQuantity" >= 0
    AND "reservedQuantity" <= "stockQuantity"
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT "providerOrderId"
    FROM "Payment"
    WHERE "providerOrderId" IS NOT NULL
    GROUP BY "providerOrderId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate provider order IDs exist; migration stopped without changing payment data'
      USING ERRCODE = 'unique_violation';
  END IF;

  IF EXISTS (
    SELECT "providerPaymentId"
    FROM "Payment"
    WHERE "providerPaymentId" IS NOT NULL
    GROUP BY "providerPaymentId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate provider payment IDs exist; migration stopped without changing payment data'
      USING ERRCODE = 'unique_violation';
  END IF;
END $$;

CREATE UNIQUE INDEX "Payment_providerOrderId_key" ON "Payment"("providerOrderId");
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "Payment"("providerPaymentId");

ALTER TABLE "PaymentRefund"
  ADD COLUMN "providerStatus" TEXT,
  ADD COLUMN "lastReconciledAt" TIMESTAMP(3);

COMMIT;
