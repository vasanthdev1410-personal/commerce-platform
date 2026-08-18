CREATE TYPE "WholesaleApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "WholesaleApplication" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "businessName" TEXT NOT NULL,
  "businessType" TEXT NOT NULL,
  "gstin" TEXT,
  "businessAddress" TEXT NOT NULL,
  "notes" TEXT,
  "status" "WholesaleApplicationStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedByAdminId" UUID,
  "reviewedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WholesaleApplication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WholesaleApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WholesaleApplication_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "WholesaleApplication_userId_createdAt_idx" ON "WholesaleApplication"("userId", "createdAt");
CREATE INDEX "WholesaleApplication_status_createdAt_idx" ON "WholesaleApplication"("status", "createdAt");
CREATE INDEX "WholesaleApplication_reviewedByAdminId_idx" ON "WholesaleApplication"("reviewedByAdminId");
CREATE UNIQUE INDEX "WholesaleApplication_one_pending_per_user" ON "WholesaleApplication"("userId") WHERE "status" = 'PENDING';
