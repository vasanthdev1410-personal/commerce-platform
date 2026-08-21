BEGIN;

ALTER TABLE "OrderItem"
  ADD COLUMN "hsnCode" TEXT,
  ADD COLUMN "taxRateBasisPoints" INTEGER,
  ADD COLUMN "taxablePaise" INTEGER,
  ADD COLUMN "taxPaise" INTEGER,
  ADD COLUMN "cgstPaise" INTEGER,
  ADD COLUMN "sgstPaise" INTEGER,
  ADD COLUMN "igstPaise" INTEGER;

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_tax_snapshot_complete_or_legacy"
  CHECK (
    (
      "taxRateBasisPoints" IS NULL
      AND "taxablePaise" IS NULL
      AND "taxPaise" IS NULL
      AND "cgstPaise" IS NULL
      AND "sgstPaise" IS NULL
      AND "igstPaise" IS NULL
    )
    OR
    (
      "taxRateBasisPoints" IS NOT NULL
      AND "taxablePaise" IS NOT NULL
      AND "taxPaise" IS NOT NULL
      AND "cgstPaise" IS NOT NULL
      AND "sgstPaise" IS NOT NULL
      AND "igstPaise" IS NOT NULL
      AND "taxRateBasisPoints" BETWEEN 0 AND 10000
      AND "taxablePaise" >= 0
      AND "taxPaise" >= 0
      AND "cgstPaise" >= 0
      AND "sgstPaise" >= 0
      AND "igstPaise" >= 0
      AND "taxPaise" = "cgstPaise" + "sgstPaise" + "igstPaise"
    )
  );

COMMIT;
