CREATE TYPE "PaymentRefundStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');
CREATE TYPE "OrderActorType" AS ENUM ('CUSTOMER', 'ADMIN', 'SYSTEM');

CREATE TABLE "PaymentRefund" (
  "id" UUID NOT NULL,
  "paymentId" UUID NOT NULL,
  "providerRefundId" TEXT,
  "amountPaise" INTEGER NOT NULL,
  "reason" TEXT,
  "status" "PaymentRefundStatus" NOT NULL DEFAULT 'PENDING',
  "idempotencyKey" TEXT NOT NULL,
  "requestedByAdminId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentRefund_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentRefund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PaymentRefund_requestedByAdminId_fkey" FOREIGN KEY ("requestedByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PaymentRefund_providerRefundId_key" ON "PaymentRefund"("providerRefundId");
CREATE UNIQUE INDEX "PaymentRefund_paymentId_idempotencyKey_key" ON "PaymentRefund"("paymentId", "idempotencyKey");
CREATE INDEX "PaymentRefund_paymentId_idx" ON "PaymentRefund"("paymentId");
CREATE INDEX "PaymentRefund_providerRefundId_idx" ON "PaymentRefund"("providerRefundId");
CREATE INDEX "PaymentRefund_requestedByAdminId_idx" ON "PaymentRefund"("requestedByAdminId");
CREATE INDEX "PaymentRefund_createdAt_idx" ON "PaymentRefund"("createdAt");

CREATE TABLE "OrderEvent" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "actorType" "OrderActorType" NOT NULL,
  "actorUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrderEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");
CREATE INDEX "OrderEvent_actorUserId_idx" ON "OrderEvent"("actorUserId");
CREATE INDEX "OrderEvent_type_idx" ON "OrderEvent"("type");
CREATE INDEX "OrderEvent_createdAt_idx" ON "OrderEvent"("createdAt");
