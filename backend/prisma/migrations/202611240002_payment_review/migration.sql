CREATE TABLE "PaymentReview" (
    "bookingId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "reviewedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentReview_pkey" PRIMARY KEY ("bookingId")
);

CREATE INDEX "PaymentReview_adminId_idx" ON "PaymentReview"("adminId");

ALTER TABLE "PaymentReview" ADD CONSTRAINT "PaymentReview_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentReview" ADD CONSTRAINT "PaymentReview_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
