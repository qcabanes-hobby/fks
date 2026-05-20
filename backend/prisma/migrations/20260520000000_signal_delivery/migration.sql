-- CreateTable
CREATE TABLE "SignalDelivery" (
    "signalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignalDelivery_pkey" PRIMARY KEY ("signalId", "userId")
);

-- CreateIndex
CREATE INDEX "SignalDelivery_userId_idx" ON "SignalDelivery"("userId");

-- AddForeignKey
ALTER TABLE "SignalDelivery" ADD CONSTRAINT "SignalDelivery_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalDelivery" ADD CONSTRAINT "SignalDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
