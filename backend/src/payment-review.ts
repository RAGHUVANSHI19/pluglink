import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { bookingRelations, bookingResponse, expireBookings, lockBooking, parseInput, routeId } from './domain-data.js';
import { paymentVariance } from './payment-variance.js';
import { fail, prisma, requireRole } from './shared.js';

const filters = z.object({
  status: z.enum(['OPEN', 'REVIEWED']).default('OPEN'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});
const reviewInput = z.object({ note: z.string().trim().min(8).max(500) });

export function paymentReviewRouter() {
  const router = Router();

  router.get('/admin/payment-reviews', async (request, response) => {
    const admin = requireRole(request, 'ADMIN');
    const { status, limit, offset } = parseInput(filters, request.query);
    await expireBookings(new Date());
    const reviewed = status === 'REVIEWED';
    const candidates = Prisma.sql`
      FROM "Booking" b
      JOIN "Payment" p ON p."bookingId" = b."id"
      LEFT JOIN "PaymentReview" r ON r."bookingId" = b."id"
      WHERE p."status" = 'PAID'
      AND (b."status" IN ('CANCELLED', 'EXPIRED')
        OR (b."status" = 'COMPLETED' AND b."finalPaise" <> p."amountPaise"))
      AND (r."bookingId" IS NOT NULL) = ${reviewed}
    `;
    const { bookings, total } = await prisma.$transaction(async (transaction) => {
      const records = await transaction.$queryRaw<{ id: string }[]>`
        SELECT b."id" ${candidates}
        ORDER BY b."updatedAt" DESC, b."id" ASC LIMIT ${limit} OFFSET ${offset}
      `;
      const [count] = await transaction.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::int AS count ${candidates}`;
      const matches = await transaction.booking.findMany({
        where: { id: { in: records.map(({ id }) => id) } }, include: bookingRelations,
      });
      const byId = new Map(matches.map((booking) => [booking.id, booking]));
      return {
        bookings: records.flatMap(({ id }) => {
          const booking = byId.get(id);
          return booking ? [bookingResponse(booking, admin)] : [];
        }),
        total: count.count,
      };
    }, { isolationLevel: 'RepeatableRead' });
    response.json({ bookings, total });
  });

  router.put('/admin/payment-reviews/:id', async (request, response) => {
    const admin = requireRole(request, 'ADMIN');
    const bookingId = routeId(request.params.id);
    const { note } = parseInput(reviewInput, request.body);

    const result = await prisma.$transaction(async (transaction) => {
      await lockBooking(transaction, bookingId);
      const booking = await transaction.booking.findUnique({
        where: { id: bookingId }, include: { payment: true, paymentReview: true },
      });
      if (!booking) fail(404, 'Booking does not exist.');
      const paidPaise = booking.payment?.status === 'PAID' ? booking.payment.amountPaise : null;
      if (!paymentVariance(booking.status, booking.finalPaise, paidPaise)) {
        fail(409, 'This booking has no payment variance to review.');
      }
      if (booking.paymentReview) {
        if (booking.paymentReview.note !== note) fail(409, 'A payment review has already been recorded.');
        return { reviewedAt: booking.paymentReview.reviewedAt };
      }
      const review = await transaction.paymentReview.create({
        data: { bookingId, adminId: admin.id, note }, select: { reviewedAt: true },
      });
      await transaction.adminAction.create({
        data: { adminId: admin.id, action: 'REVIEW_PAYMENT_VARIANCE', targetId: bookingId, targetType: 'BOOKING', reason: note },
      });
      return review;
    });
    response.json(result);
  });

  return router;
}
