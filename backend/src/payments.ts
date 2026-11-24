import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { fail, prisma, requireRole } from './shared.js';

const provider = { demo: 'DEMO', razorpay: 'RAZORPAY_TEST' };
const orderIdField = z.string().max(80).regex(/^order_[a-zA-Z0-9]+$/);
const paymentIdField = z.string().max(80).regex(/^pay_[a-zA-Z0-9]+$/);
const paymentFields = z.object({
  id: paymentIdField,
  order_id: orderIdField,
  amount: z.number().int().positive(),
  currency: z.literal('INR'),
  status: z.string(),
});

function settings() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (keyId?.startsWith('rzp_test_') && keySecret) {
    return { mode: 'razorpay_test' as const, keyId, keySecret, webhookSecret };
  }
  if (process.env.NODE_ENV !== 'production' && !keyId && !keySecret && !webhookSecret) {
    return { mode: 'demo' as const };
  }
  return { mode: 'disabled' as const };
}

export function verifyHmac(secret: string, input: string | Buffer, signature: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const computed = createHmac('sha256', secret).update(input).digest();
  return timingSafeEqual(computed, Buffer.from(signature, 'hex'));
}

type Transaction = Prisma.TransactionClient;
type RazorpaySettings = Extract<ReturnType<typeof settings>, { mode: 'razorpay_test' }>;
const bookingDetails = {
  payment: true,
  station: { select: { name: true, status: true, host: { select: { status: true } } } },
} satisfies Prisma.BookingInclude;

async function requestRazorpay(configuration: RazorpaySettings, path: string, body?: object): Promise<unknown> {
  let response: globalThis.Response;
  try {
    response = await fetch(`https://api.razorpay.com/v1${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Basic ${Buffer.from(`${configuration.keyId}:${configuration.keySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: body && JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    fail(502, 'Razorpay test checkout is temporarily unavailable.');
  }
  if (!response.ok) fail(502, 'Razorpay test checkout is temporarily unavailable.');
  return response.json().catch(() => fail(502, 'Razorpay returned an invalid response.'));
}

async function findBooking(id: string, client: Transaction = prisma) {
  const booking = await client.booking.findUnique({ where: { id }, include: bookingDetails });
  if (!booking) fail(404, 'Booking was not found.');
  return booking;
}

type PayableBooking = Awaited<ReturnType<typeof findBooking>>;

async function lockBooking(transaction: Transaction, bookingId: string) {
  await transaction.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`;
  return findBooking(bookingId, transaction);
}

function assertOwner(booking: PayableBooking, ownerId: string) {
  if (booking.ownerId !== ownerId) fail(404, 'Booking was not found.');
}

function holdUnavailable(booking: PayableBooking) {
  return booking.status === 'PENDING' && (
    booking.expiresAt <= new Date() || booking.station.status !== 'APPROVED' || booking.station.host.status !== 'ACTIVE'
  );
}

function assertPayable(booking: PayableBooking) {
  if (booking.paymentStatus === 'PAID') fail(409, 'This booking has already been paid.');
  if (holdUnavailable(booking) || !['PENDING', 'CONFIRMED', 'COMPLETED'].includes(booking.status)) {
    fail(409, 'This booking is no longer available for payment.');
  }
  const amount = booking.finalPaise ?? booking.totalPaise;
  if (amount <= 0) fail(409, 'This booking has no charge to pay.');
  return amount;
}

async function setPaid(transaction: Transaction, booking: PayableBooking, providerPaymentId?: string) {
  if (!booking.payment) fail(409, 'Start checkout before confirming payment.');
  if (booking.payment.status === 'PAID') return booking.payment;

  const inactiveHold = holdUnavailable(booking);
  const confirmed = booking.status === 'PENDING' && !inactiveHold;
  const payment = await transaction.payment.update({
    where: { id: booking.payment.id },
    data: { status: 'PAID', providerPaymentId },
  });
  await transaction.booking.update({
    where: { id: booking.id },
    data: { paymentStatus: 'PAID', status: confirmed ? 'CONFIRMED' : inactiveHold ? 'EXPIRED' : booking.status },
  });

  const inactive = inactiveHold || booking.status === 'CANCELLED' || booking.status === 'EXPIRED';
  const label = booking.payment.provider === provider.demo ? 'Demo payment' : 'Razorpay test payment';
  const notifications = [{
    userId: booking.ownerId,
    bookingId: booking.id,
    kind: 'PAYMENT_CONFIRMED',
    title: `${label} recorded`,
    message: inactive
      ? `${label} for ${booking.station.name} was recorded after the reservation became inactive. Contact support for help.`
      : `${label} for ${booking.station.name} was recorded.`,
  }];
  if (confirmed) {
    notifications.push({
      userId: booking.ownerId,
      bookingId: booking.id,
      kind: 'BOOKING_CONFIRMED',
      title: 'Your charging slot is confirmed',
      message: `You have booked ${booking.station.name}.`,
    }, {
      userId: booking.hostId,
      bookingId: booking.id,
      kind: 'BOOKING_CONFIRMED',
      title: 'A charging reservation is confirmed',
      message: `A driver has confirmed a booking at ${booking.station.name}.`,
    });
  }
  await transaction.notification.createMany({ data: notifications, skipDuplicates: true });
  return payment;
}

export function paymentRouter() {
  const router = Router();

  router.get('/:bookingId', async (request, response) => {
    const owner = requireRole(request, 'OWNER');
    const booking = await findBooking(request.params.bookingId);
    assertOwner(booking, owner.id);
    response.json({ payment: booking.payment, mode: settings().mode });
  });

  router.post('/:bookingId/order', async (request, response) => {
    const owner = requireRole(request, 'OWNER');
    const configuration = settings();
    if (configuration.mode === 'disabled') fail(503, 'Payments are unavailable in this environment.');

    const order = await prisma.$transaction(async (transaction) => {
      const booking = await lockBooking(transaction, request.params.bookingId);
      assertOwner(booking, owner.id);
      const amountPaise = assertPayable(booking);
      const orderProvider = configuration.mode === 'demo' ? provider.demo : provider.razorpay;
      if (booking.payment && booking.payment.provider !== orderProvider) {
        fail(409, 'This booking uses a different checkout configuration.');
      }
      if (configuration.mode === 'demo') {
        await transaction.payment.upsert({
          where: { bookingId: booking.id },
          create: { bookingId: booking.id, amountPaise, provider: orderProvider },
          update: { amountPaise, status: 'PENDING' },
        });
        await transaction.booking.update({ where: { id: booking.id }, data: { paymentStatus: 'PENDING' } });
        return { mode: configuration.mode, amountPaise, currency: 'INR' };
      }
      if (amountPaise < 100) fail(409, 'Razorpay test checkout requires a total of at least ₹1.');
      let orderId = booking.payment?.amountPaise === amountPaise ? booking.payment.providerOrderId : null;
      if (!orderId) {
        const orderInfo = z.object({ id: orderIdField, amount: z.number().int(), currency: z.literal('INR') })
          .safeParse(await requestRazorpay(configuration, '/orders', {
            amount: amountPaise, currency: 'INR', receipt: booking.id,
          }));
        if (!orderInfo.success || orderInfo.data.amount !== amountPaise) {
          fail(502, 'Razorpay returned an order that does not match the booking total.');
        }
        orderId = orderInfo.data.id;
      }

      await transaction.payment.upsert({
        where: { bookingId: booking.id },
        create: { bookingId: booking.id, amountPaise, provider: orderProvider, providerOrderId: orderId },
        update: { amountPaise, providerOrderId: orderId, status: 'PENDING' },
      });
      await transaction.booking.update({ where: { id: booking.id }, data: { paymentStatus: 'PENDING' } });
      return { mode: configuration.mode, amountPaise, currency: 'INR', orderId, keyId: configuration.keyId };
    }, { timeout: 11000 });
    response.json(order);
  });

  router.post('/:bookingId/demo', async (request, response) => {
    const owner = requireRole(request, 'OWNER');
    if (settings().mode !== 'demo') fail(403, 'The demo payment simulator is unavailable.');
    const payment = await prisma.$transaction(async (transaction) => {
      const booking = await lockBooking(transaction, request.params.bookingId);
      assertOwner(booking, owner.id);
      if (booking.payment && booking.payment.provider !== provider.demo) {
        fail(409, 'This booking uses a different checkout configuration.');
      }
      if (booking.payment?.status === 'PAID') return booking.payment;
      const amountPaise = assertPayable(booking);
      const pendingPayment = await transaction.payment.upsert({
        where: { bookingId: booking.id },
        create: { bookingId: booking.id, amountPaise, provider: provider.demo },
        update: { amountPaise, status: 'PENDING' },
      });
      return setPaid(transaction, { ...booking, payment: pendingPayment });
    });
    response.json({ payment });
  });

  router.post('/:bookingId/verify', async (request, response) => {
    const owner = requireRole(request, 'OWNER');
    const { orderId, paymentId, signature } = z.object({
      orderId: orderIdField, paymentId: paymentIdField, signature: z.string().max(128),
    }).parse(request.body);
    const configuration = settings();
    if (configuration.mode !== 'razorpay_test') fail(503, 'Razorpay test checkout is unavailable.');
    const booking = await findBooking(request.params.bookingId);
    assertOwner(booking, owner.id);
    if (booking.payment?.provider !== provider.razorpay || booking.payment.providerOrderId !== orderId ||
        !verifyHmac(configuration.keySecret, `${booking.payment.providerOrderId}|${paymentId}`, signature)) {
      fail(400, 'Payment verification failed.');
    }
    if (booking.payment.status === 'PAID') {
      if (booking.payment.providerPaymentId !== paymentId) fail(409, 'A different payment was already recorded.');
      response.json({ payment: booking.payment });
      return;
    }
    const captured = paymentFields.safeParse(await requestRazorpay(configuration, `/payments/${paymentId}`));
    if (!captured.success || captured.data.id !== paymentId || captured.data.order_id !== orderId ||
        captured.data.amount !== booking.payment.amountPaise) {
      fail(400, 'The gateway payment does not match this booking.');
    }
    if (captured.data.status !== 'captured') fail(409, 'This test payment is awaiting capture.');
    const payment = await prisma.$transaction(async (transaction) => {
      const current = await lockBooking(transaction, booking.id);
      if (current.payment?.provider !== provider.razorpay || current.payment.providerOrderId !== orderId ||
          current.payment.amountPaise !== captured.data.amount) {
        fail(409, 'The booking payment order changed. Contact support for help.');
      }
      if (current.payment.status === 'PAID' && current.payment.providerPaymentId !== paymentId) {
        fail(409, 'A different payment was already recorded.');
      }
      return setPaid(transaction, current, paymentId);
    });
    response.json({ payment });
  });

  return router;
}

const webhookSchema = z.object({
  event: z.enum(['payment.captured', 'payment.failed', 'order.paid']),
  payload: z.object({ payment: z.object({ entity: paymentFields }) }),
});

export const acceptPaymentWebhook: RequestHandler = async (request, response) => {
  const configuration = settings();
  if (configuration.mode !== 'razorpay_test' || !configuration.webhookSecret) {
    fail(503, 'Razorpay webhooks are unavailable.');
  }
  const signature = request.get('x-razorpay-signature');
  if (!signature || !Buffer.isBuffer(request.body) ||
      !verifyHmac(configuration.webhookSecret, request.body, signature)) {
    fail(400, 'Invalid webhook signature.');
  }

  let webhook: unknown;
  try {
    webhook = JSON.parse(request.body.toString('utf8'));
  } catch {
    fail(400, 'Invalid webhook payload.');
  }
  const parsed = webhookSchema.safeParse(webhook);
  if (!parsed.success) {
    response.json({ ok: true });
    return;
  }

  const { entity } = parsed.data.payload.payment;
  const failed = parsed.data.event === 'payment.failed';
  if (entity.status !== (failed ? 'failed' : 'captured')) fail(400, 'Unexpected gateway payment status.');
  const eventId = createHash('sha256').update(request.body).digest('hex');
  await prisma.$transaction(async (transaction) => {
    const first = await transaction.paymentEvent.createMany({ data: [{ eventId }], skipDuplicates: true });
    if (!first.count) return;
    const stored = await transaction.payment.findUnique({
      where: { providerOrderId: entity.order_id }, select: { bookingId: true },
    });
    if (!stored) return;
    const booking = await lockBooking(transaction, stored.bookingId);
    if (booking.payment?.provider !== provider.razorpay || booking.payment.providerOrderId !== entity.order_id ||
        booking.payment.amountPaise !== entity.amount) return;

    if (!failed) {
      await setPaid(transaction, booking, entity.id);
      return;
    }
    if (booking.payment.status !== 'PAID') {
      await transaction.payment.update({ where: { id: booking.payment.id }, data: { status: 'FAILED' } });
      await transaction.booking.update({ where: { id: booking.id }, data: { paymentStatus: 'FAILED' } });
      await transaction.notification.createMany({
        data: [{
          userId: booking.ownerId,
          bookingId: booking.id,
          kind: 'PAYMENT_FAILED',
          title: 'Razorpay test payment failed',
          message: `The test payment for ${booking.station.name} failed. You can retry checkout while your booking is active.`,
        }],
        skipDuplicates: true,
      });
    }
  });
  response.json({ ok: true });
};
