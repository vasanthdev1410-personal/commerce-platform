BEGIN;

ALTER TABLE "ShippingRule" ADD COLUMN "stateCode" VARCHAR(3);

ALTER TABLE "ShippingRule"
  ADD CONSTRAINT "ShippingRule_state_code_format"
  CHECK (
    "stateCode" IS NULL
    OR "stateCode" ~ '^[A-Z0-9]{2,3}$'
  );

DROP INDEX "ShippingRule_countryCode_pricingMode_isActive_priority_idx";
CREATE INDEX "ShippingRule_countryCode_stateCode_pricingMode_isActive_priority_idx"
  ON "ShippingRule"("countryCode", "stateCode", "pricingMode", "isActive", "priority");

COMMIT;
