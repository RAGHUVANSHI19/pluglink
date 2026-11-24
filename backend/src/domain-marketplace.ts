import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import {
  blockingBookings, bookingRelations, bookingResponse, expireBookings, idSchema, lockBooking, lockStation,
  parseInput, publicStationWhere, reviewRelations, reviewResponse, routeId, stationRelations, stationResponse,
} from './domain-data.js';
import {
  availableSlots, bookingHorizon, calculateCost, canTransition, dateBounds, distanceKm, localDate, maximumEnergy,
} from './domain-rules.js';
import { fail, prisma, requireRole, requireUser } from './shared.js';

const statuses = ['PENDING', 'CONFIRMED', 'CANCELLED', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED'] as const;
const instant = z.string().datetime({ offset: true }).transform((value) => new Date(value));
const searchInput = z.object({
  q: z.string().trim().max(120).optional(),
  connector: z.string().trim().max(80).optional(),
  available: z.enum(['true', 'false']).optional(),
  maxPrice: z.coerce.number().min(0).max(100_000).optional(),
  minPower: z.coerce.number().min(0).max(500).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  sort: z.enum(['rating', 'price', 'distance']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(60),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});
const bookInput = z.object({
  stationId: idSchema,
  start: instant,
  end: instant,
  energyWh: z.number().int().min(100).max(350_000),
});
const cancelInput = z.object({ reason: z.string().trim().max(300).optional() });
const sessionInput = z.object({
  status: z.enum(['IN_PROGRESS', 'COMPLETED']),
  actualEnergyWh: z.number().int().min(0).max(350_000).optional(),
});
const reviewInput = z.object({
  bookingId: idSchema,
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(3).max(1_000),
});
const reportInput = z.object({ reason: z.string().trim().min(3).max(300) });
const bookingSearch = z.object({
  status: z.enum(statuses).optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

export function marketplaceRouter(): Router {
  const router = Router();

  router.get('/stations', async (req, res) => {
    const query = parseInput(searchInput, req.query);
    if ((query.lat === undefined) !== (query.lng === undefined)) fail(400, 'Provide both latitude and longitude.');
    const now = new Date();
    const records = await prisma.chargingStation.findMany({
      where: {
        ...publicStationWhere(),
        ...(query.maxPrice !== undefined ? { pricePaise: { lte: Math.round(query.maxPrice * 100) } } : {}),
        spec: {
          is: {
            ...(query.connector ? { connector: { equals: query.connector, mode: 'insensitive' } } : {}),
            ...(query.minPower !== undefined ? { powerWatts: { gte: Math.round(query.minPower * 1_000) } } : {}),
          },
        },
        AND: query.q?.split(/\s+/).map((term) => ({
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { city: { contains: term, mode: 'insensitive' } },
            { locality: { contains: term, mode: 'insensitive' } },
          ],
        })),
      },
      include: stationRelations(now),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const stations = records.map((record) => {
      const station = stationResponse(record, now);
      const calculatedDistance = query.lat !== undefined && query.lng !== undefined
        ? distanceKm(query.lat, query.lng, station.latitude, station.longitude) : undefined;
      return { ...station, distanceKm: calculatedDistance };
    }).filter((station) => query.available === undefined || station.available === (query.available === 'true'));

    if (query.sort === 'rating') stations.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.reviewCount - a.reviewCount);
    if (query.sort === 'price') stations.sort((a, b) => a.pricePaise - b.pricePaise);
    if (query.sort === 'distance') stations.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    res.json({ stations: stations.slice(query.offset, query.offset + query.limit), total: stations.length });
  });

  router.get('/stations/:id', async (req, res) => {
    const id = routeId(req.params.id);
    const now = new Date();
    const station = await prisma.chargingStation.findFirst({
      where: { id, ...publicStationWhere() },
      include: stationRelations(now),
    });
    if (!station) fail(404, 'This charging station is unavailable.');
    const reviews = await prisma.review.findMany({
      where: { stationId: id, hidden: false },
      include: reviewRelations,
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    res.json({ station: { ...stationResponse(station, now), reviews: reviews.map((review) => reviewResponse(review)) } });
  });

  router.get('/stations/:id/slots', async (req, res) => {
    const id = routeId(req.params.id);
    const date = parseInput(z.string(), req.query.date);
    const bounds = dateBounds(date);
    if (!bounds) fail(400, 'Choose a valid calendar date.');
    const station = await prisma.chargingStation.findFirst({
      where: { id, ...publicStationWhere() },
      select: {
        availability: true,
        blocks: { where: { start: { lt: bounds.end }, end: { gt: bounds.start } } },
      },
    });
    if (!station) fail(404, 'This charging station is unavailable.');
    const now = new Date();
    const bookings = await prisma.booking.findMany({
      where: { stationId: id, ...blockingBookings(bounds.start, bounds.end, now) },
      select: { start: true, end: true },
    });
    res.json({ slots: availableSlots(date, station.availability, [...station.blocks, ...bookings], now) });
  });

  router.post('/bookings', async (req, res) => {
    const owner = requireRole(req, 'OWNER');
    const input = parseInput(bookInput, req.body);
    const { stationId, start, end, energyWh } = input;
    const now = new Date();
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
      fail(400, 'Choose a valid charging time.');
    }
    if (start <= now) fail(400, 'Choose a charging time in the future.');
    if (start >= bookingHorizon(now) || end > bookingHorizon(now)) fail(400, 'Bookings open up to 60 calendar days ahead.');
    const booking = await prisma.$transaction(async (tx) => {
      await lockStation(tx, stationId);
      const checkedAt = new Date();
      const station = await tx.chargingStation.findFirst({
        where: { id: stationId, ...publicStationWhere() },
        include: { spec: true, availability: true, blocks: { where: { start: { lt: end }, end: { gt: start } } } },
      });
      if (!station?.spec) fail(404, 'This station is unavailable for booking.');
      await expireBookings(checkedAt, tx, stationId);
      const occupied = await tx.booking.findMany({
        where: { stationId, ...blockingBookings(start, end, checkedAt) },
        select: { start: true, end: true },
      });
      const available = availableSlots(localDate(start), station.availability, [...station.blocks, ...occupied], checkedAt);
      if (!available.some((slot) => slot.start.getTime() === start.getTime() && slot.end.getTime() === end.getTime())) {
        fail(409, 'This charging slot is unavailable or already reserved.');
      }
      const powerWatts = station.spec.powerWatts;
      const capacity = maximumEnergy(powerWatts, start, end);
      if (energyWh > capacity) fail(400, `This charger can provide up to ${capacity / 1_000} kWh during the selected slot.`);

      const expiresAt = new Date(Math.min(start.getTime(), checkedAt.getTime() + 30 * 60_000));
      return tx.booking.create({
        data: {
          stationId,
          ownerId: owner.id,
          hostId: station.hostId,
          start,
          end,
          expiresAt,
          energyWh,
          powerWatts,
          pricePaise: station.pricePaise,
          feePaise: station.feePaise,
          totalPaise: calculateCost(energyWh, station.pricePaise, station.feePaise),
          sample: station.sample,
        },
        include: bookingRelations,
      });
    });
    res.status(201).json({ booking: bookingResponse(booking, owner) });
  });

  router.get(['/bookings', '/admin/bookings'], async (req, res) => {
    const user = req.path.startsWith('/admin') ? requireRole(req, 'ADMIN') : requireUser(req);
    const query = parseInput(bookingSearch, req.query);
    await expireBookings(new Date());
    const where: Prisma.BookingWhereInput = {
      ...(user.role === 'OWNER' ? { ownerId: user.id } : user.role === 'HOST' ? { hostId: user.id } : {}),
      status: query.status,
      id: query.q ? { contains: query.q, mode: 'insensitive' } : undefined,
    };
    const [bookings, total] = await prisma.$transaction([
      prisma.booking.findMany({
        where,
        include: bookingRelations,
        orderBy: { start: 'desc' },
        skip: query.offset,
        take: query.limit,
      }),
      prisma.booking.count({ where }),
    ]);
    res.json({ bookings: bookings.map((booking) => bookingResponse(booking, user)), total });
  });

  router.get('/bookings/:id', async (req, res) => {
    const user = requireUser(req);
    const id = routeId(req.params.id);
    await expireBookings(new Date());
    const booking = await prisma.booking.findFirst({
      where: { id, ...(user.role === 'OWNER' ? { ownerId: user.id } : user.role === 'HOST' ? { hostId: user.id } : {}) },
      include: bookingRelations,
    });
    if (!booking) fail(404, 'Booking does not exist.');
    res.json({ booking: bookingResponse(booking, user) });
  });

  router.post('/bookings/:id/cancel', async (req, res) => {
    const user = requireUser(req);
    const id = routeId(req.params.id);
    const { reason } = parseInput(cancelInput, req.body ?? {});
    const minutes = Number(process.env.CANCELLATION_CUTOFF_MINUTES ?? '0');
    const cutoff = Number.isInteger(minutes) && minutes >= 0 && minutes <= 1_440 ? minutes : 0;
    const result = await prisma.$transaction(async (tx) => {
      await lockBooking(tx, id);
      const booking = await tx.booking.findUnique({ where: { id }, include: bookingRelations });
      if (!booking || (user.role !== 'ADMIN' && user.id !== booking.ownerId && user.id !== booking.hostId)) {
        fail(404, 'Booking does not exist.');
      }
      const now = new Date();
      if ((booking.status === 'PENDING' && booking.expiresAt <= now) || !canTransition(booking.status, 'CANCELLED')) {
        fail(409, 'This booking can no longer be cancelled.');
      }
      const deadline = booking.start.getTime() - (user.role === 'ADMIN' ? 0 : cutoff) * 60_000;
      if (now.getTime() >= deadline) fail(409, 'The cancellation window for this booking has closed.');
      const cancelled = await tx.booking.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: now, cancellationReason: reason || null },
        include: bookingRelations,
      });
      await tx.notification.createMany({
        data: [booking.hostId, booking.ownerId].map((userId) => ({
          userId, bookingId: id, kind: 'BOOKING_CANCELLED', title: 'Booking cancelled',
          message: `The reservation at ${booking.station.name} was cancelled.`,
        })),
        skipDuplicates: true,
      });
      if (user.role === 'ADMIN') await tx.adminAction.create({
        data: { adminId: user.id, action: 'CANCEL', targetType: 'BOOKING', targetId: id, reason: reason || null },
      });
      return cancelled;
    });
    res.json({ booking: bookingResponse(result, user) });
  });

  router.patch('/bookings/:id/session', async (req, res) => {
    const host = requireRole(req, 'HOST');
    const id = routeId(req.params.id);
    const input = parseInput(sessionInput, req.body);
    const booking = await prisma.$transaction(async (tx) => {
      await lockBooking(tx, id);
      const existing = await tx.booking.findFirst({
        where: { id, hostId: host.id },
        include: { chargingSession: true, station: { include: { verification: true } } },
      });
      if (!existing) fail(404, 'Booking does not exist.');
      if (!canTransition(existing.status, input.status)) fail(409, 'This session cannot move to the selected status.');
      const now = new Date();
      const demo = process.env.NODE_ENV !== 'production'
        && (existing.sample || existing.station.verification?.identityMode === 'DEMO');
      if (input.status === 'IN_PROGRESS' && !demo && (now < existing.start || now >= existing.end)) {
        fail(409, 'Start the session during the reserved charging slot.');
      }
      if (input.status === 'IN_PROGRESS') {
        await tx.chargingSession.create({
          data: { bookingId: id, startedAt: now, meterSource: demo ? 'DEMO_MANUAL' : 'MANUAL' },
        });
        return tx.booking.update({ where: { id }, data: { status: input.status }, include: bookingRelations });
      }
      if (input.actualEnergyWh === undefined) fail(400, 'Enter the actual energy measured for this session.');
      if (input.actualEnergyWh > maximumEnergy(existing.powerWatts, existing.start, existing.end)) {
        fail(400, 'Actual energy exceeds the charging capacity of the reserved slot.');
      }
      if (!existing.chargingSession) fail(409, 'Start the charging session before completing it.');
      await tx.chargingSession.update({
        where: { bookingId: id },
        data: { endedAt: now, energyWh: input.actualEnergyWh },
      });
      const completed = await tx.booking.update({
        where: { id },
        data: {
          status: input.status,
          actualEnergyWh: input.actualEnergyWh,
          finalPaise: calculateCost(input.actualEnergyWh, existing.pricePaise, existing.feePaise),
        },
        include: bookingRelations,
      });
      await tx.notification.create({
        data: { userId: existing.ownerId, bookingId: id, kind: 'SESSION_COMPLETED', title: 'Charging session complete',
          message: `Your charging session at ${existing.station.name} is complete. You can now leave a review.` },
      });
      return completed;
    });
    res.json({ booking: bookingResponse(booking, host) });
  });

  router.post('/reviews', async (req, res) => {
    const owner = requireRole(req, 'OWNER');
    const input = parseInput(reviewInput, req.body);
    const review = await prisma.$transaction(async (tx) => {
      await lockBooking(tx, input.bookingId);
      const booking = await tx.booking.findFirst({
        where: { id: input.bookingId, ownerId: owner.id },
        include: { review: { select: { id: true } } },
      });
      if (!booking) fail(404, 'Booking does not exist.');
      if (booking.status !== 'COMPLETED') fail(409, 'Complete this charging session before leaving a review.');
      if (booking.review) fail(409, 'You have already reviewed this charging session.');
      return tx.review.create({
        data: { ...input, stationId: booking.stationId, ownerId: owner.id, sample: booking.sample },
        include: reviewRelations,
      });
    });
    res.status(201).json({ review: reviewResponse(review) });
  });

  router.post('/reviews/:id/report', async (req, res) => {
    requireUser(req);
    const id = routeId(req.params.id);
    const { reason } = parseInput(reportInput, req.body);
    const updated = await prisma.review.updateMany({
      where: { id, hidden: false, reportedAt: null, station: publicStationWhere() },
      data: { reportReason: reason, reportedAt: new Date() },
    });
    if (updated.count === 0) fail(409, 'This review is unavailable or already reported.');
    const review = await prisma.review.findUniqueOrThrow({ where: { id }, include: reviewRelations });
    res.json({ review: reviewResponse(review) });
  });

  return router;
}
