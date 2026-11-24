import { Prisma, type BookingStatus } from '@prisma/client';
import { z } from 'zod';
import { bookingHorizon, hasScheduledSlot, localDate } from './domain-rules.js';
import { paymentVariance } from './payment-variance.js';
import { fail, prisma } from './shared.js';

type Database = Prisma.TransactionClient;
const exposedStatuses: BookingStatus[] = ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'];
const bookingOverlapStatuses: BookingStatus[] = ['PENDING', ...exposedStatuses];
export const idSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);

export function routeId(value: unknown): string {
  return parseInput(idSchema, value);
}

export function parseInput<Schema extends z.ZodTypeAny>(schema: Schema, input: unknown): z.output<Schema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0];
    const field = first?.path.length ? `${first.path.join('.')}: ` : '';
    fail(400, `${field}${first?.message ?? 'Invalid request.'}`);
  }
  return result.data;
}

export function publicStationWhere(): Prisma.ChargingStationWhereInput {
  return { status: 'APPROVED', host: { status: 'ACTIVE' }, spec: { isNot: null } };
}

export function stationRelations(now: Date, includeFutureBlocks = false) {
  const horizon = bookingHorizon(now);
  return {
    spec: true,
    host: { select: { name: true, status: true } },
    availability: true,
    verification: true,
    blocks: {
      where: { start: includeFutureBlocks ? undefined : { lt: horizon }, end: { gt: now } },
      orderBy: { start: 'asc' },
    },
    reviews: { where: { hidden: false }, select: { rating: true } },
    bookings: {
      where: {
        start: { lt: horizon },
        end: { gt: now },
        OR: [
          { status: { in: exposedStatuses } },
          { status: 'PENDING', expiresAt: { gt: now } },
        ],
      },
      select: { start: true, end: true },
    },
  } satisfies Prisma.ChargingStationInclude;
}

export type StationRecord = Prisma.ChargingStationGetPayload<{ include: ReturnType<typeof stationRelations> }>;

export function stationResponse(station: StationRecord, now: Date, privateAccess = false) {
  const { spec, host, availability, reviews, blocks } = station;
  const available = station.status === 'APPROVED' && host.status === 'ACTIVE'
    && hasScheduledSlot(availability, [...blocks, ...station.bookings], now);
  const exactLocation = privateAccess || station.sample;
  const publicHostName = host.name.trim().split(/\s+/)[0] ?? 'PlugLink host';
  return {
    id: station.id,
    name: station.name,
    city: station.city,
    locality: station.locality,
    address: exactLocation ? station.address : `${station.locality}, ${station.city}`,
    description: station.description,
    connector: spec?.connector ?? '',
    chargerType: spec?.chargerType ?? '',
    powerKw: (spec?.powerWatts ?? 0) / 1_000,
    pricePaise: station.pricePaise,
    feePaise: station.feePaise,
    latitude: exactLocation ? station.latitude : Math.round(station.latitude * 100) / 100,
    longitude: exactLocation ? station.longitude : Math.round(station.longitude * 100) / 100,
    imageUrls: station.imageUrls,
    timezone: station.timezone,
    sample: station.sample,
    hostName: privateAccess ? host.name : publicHostName,
    rating: reviews.length ? Math.round(reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length * 10) / 10 : null,
    reviewCount: reviews.length,
    available,
    status: station.status,
    ...(privateAccess ? {
      availability: availability.map(({ day, startMinute, endMinute }) => ({ day, startMinute, endMinute })),
      blocks: blocks.map(({ id, start, end, reason }) => ({ id, start, end, reason })),
      verification: station.verification,
      createdAt: station.createdAt,
    } : {}),
  };
}

export const bookingRelations = {
  station: { select: { name: true, locality: true, address: true, latitude: true, longitude: true, timezone: true } },
  owner: { select: { name: true } },
  host: { select: { name: true } },
  review: { select: { id: true } },
  payment: { select: { amountPaise: true, provider: true, status: true } },
  paymentReview: { select: { reviewedAt: true, note: true } },
} satisfies Prisma.BookingInclude;

export type BookingRecord = Prisma.BookingGetPayload<{ include: typeof bookingRelations }>;

export function bookingResponse(booking: BookingRecord, viewer: { role: string; id: string }) {
  const contactVisible = viewer.role !== 'OWNER' || exposedStatuses.includes(booking.status);
  const paidPaise = booking.payment?.status === 'PAID' ? booking.payment.amountPaise : null;
  const variance = paymentVariance(booking.status, booking.finalPaise, paidPaise);
  return {
    id: booking.id,
    stationId: booking.stationId,
    stationName: booking.station.name,
    locality: booking.station.locality,
    date: localDate(booking.start),
    start: booking.start,
    end: booking.end,
    timezone: booking.station.timezone,
    expiresAt: booking.expiresAt,
    energyWh: booking.energyWh,
    pricePaise: booking.pricePaise,
    feePaise: booking.feePaise,
    totalPaise: booking.totalPaise,
    actualEnergyWh: booking.actualEnergyWh,
    finalPaise: booking.finalPaise,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    paidPaise,
    paymentVariance: variance ? {
      ...variance,
      reviewedAt: booking.paymentReview?.reviewedAt ?? null,
      ...(viewer.role === 'ADMIN' && booking.paymentReview ? { note: booking.paymentReview.note } : {}),
    } : null,
    paymentProvider: booking.payment?.provider ?? null,
    sample: booking.sample,
    createdAt: booking.createdAt,
    cancelledAt: booking.cancelledAt,
    cancellationReason: booking.cancellationReason,
    reviewId: booking.review?.id ?? null,
    ownerName: booking.owner.name,
    hostName: viewer.role === 'OWNER' ? booking.host.name.trim().split(/\s+/)[0] : booking.host.name,
    ...(contactVisible ? {
      address: booking.station.address,
      latitude: booking.station.latitude,
      longitude: booking.station.longitude,
    } : {}),
  };
}

export const reviewRelations = {
  owner: { select: { name: true } },
  station: { select: { name: true } },
} satisfies Prisma.ReviewInclude;

export type ReviewRecord = Prisma.ReviewGetPayload<{ include: typeof reviewRelations }>;

export function reviewResponse(review: ReviewRecord, moderationAccess = false) {
  return {
    id: review.id,
    stationName: review.station.name,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt,
    sample: review.sample,
    authorName: review.owner.name.trim().split(/\s+/)[0] ?? 'PlugLink driver',
    ...(moderationAccess ? { reportReason: review.reportReason, hidden: review.hidden } : {}),
  };
}

export async function expireBookings(now: Date, database: Database = prisma, stationId?: string) {
  return database.booking.updateMany({
    where: { stationId, status: 'PENDING', expiresAt: { lte: now } },
    data: { status: 'EXPIRED' },
  });
}

export async function lockStation(database: Database, id: string) {
  await database.$queryRaw`SELECT "id" FROM "ChargingStation" WHERE "id" = ${id} FOR UPDATE`;
}

export async function lockBooking(database: Database, id: string) {
  await database.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${id} FOR UPDATE`;
}

export function blockingBookings(start: Date, end: Date, now: Date): Prisma.BookingWhereInput {
  return {
    start: { lt: end },
    end: { gt: start },
    status: { in: bookingOverlapStatuses },
    OR: [{ status: { not: 'PENDING' } }, { expiresAt: { gt: now } }],
  };
}
