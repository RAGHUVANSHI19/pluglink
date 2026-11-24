import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import {
  blockingBookings, bookingRelations, bookingResponse, expireBookings, lockStation, parseInput,
  reviewRelations, reviewResponse, routeId, stationRelations, stationResponse,
} from './domain-data.js';
import { dateBounds, localDate } from './domain-rules.js';
import { fail, prisma, requireRole } from './shared.js';

const stationStatuses = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const;
const textField = (min: number, max: number) => z.string().trim().min(min).max(max);
const instant = z.string().datetime({ offset: true }).transform((value) => new Date(value));
const scheduleRow = z.object({
  day: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1_439),
  endMinute: z.number().int().min(1).max(1_440),
});
const schedule = z.array(scheduleRow).max(21).superRefine((value, ctx) => {
  const ordered = [...value].sort((a, b) => a.day - b.day || a.startMinute - b.startMinute);
  ordered.forEach((range, index) => {
    const previous = ordered[index - 1];
    if (range.endMinute - range.startMinute < 60) {
      ctx.addIssue({ code: 'custom', message: 'Each availability window must be at least one hour.' });
    }
    if (previous && previous.day === range.day && range.startMinute < previous.endMinute) {
      ctx.addIssue({ code: 'custom', message: 'Availability windows on the same day cannot overlap.' });
    }
  });
});
const image = z.string().regex(/^\/(?:images\/[a-zA-Z0-9_-]+|uploads\/[a-fA-F0-9-]+)\.(?:jpe?g|png|webp|avif)$/i, 'Upload station images using the image uploader.');
const stationInput = z.object({
  name: textField(3, 100),
  city: textField(2, 80),
  locality: textField(2, 100),
  address: textField(4, 250),
  description: textField(10, 1_500),
  chargerType: textField(2, 80),
  connector: textField(2, 80),
  powerKw: z.number().min(1).max(350),
  pricePaise: z.number().int().min(100).max(100_000),
  feePaise: z.number().int().min(0).max(100_000),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  imageUrls: z.array(image).max(8),
  availability: schedule,
  cctvDeclared: z.boolean(),
  electricalDeclared: z.boolean(),
  termsAccepted: z.boolean(),
  identityMode: z.enum(['DEMO', 'PENDING_EXTERNAL']).optional(),
  evidenceNote: z.string().trim().max(500).optional(),
});
const blockInput = z.object({ start: instant, end: instant, reason: z.string().trim().max(200).optional() });
const filterStations = z.object({
  q: textField(0, 100).optional(),
  status: z.enum(stationStatuses).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});
const filterUsers = z.object({
  q: textField(0, 100).optional(),
  role: z.enum(['OWNER', 'HOST', 'ADMIN']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});
const stationDecision = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'SUSPENDED']),
  reason: z.string().trim().max(500).optional(),
});
const userDecision = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) });
const reviewDecision = z.object({ hidden: z.boolean() });
const userFields = {
  id: true, name: true, email: true, phone: true, role: true, status: true, createdAt: true,
} satisfies Prisma.UserSelect;

export function managementRouter(): Router {
  const router = Router();

  router.get('/hosts/stations', async (req, res) => {
    const host = requireRole(req, 'HOST');
    const now = new Date();
    const stations = await prisma.chargingStation.findMany({
      where: { hostId: host.id },
      include: stationRelations(now, true),
      orderBy: { createdAt: 'desc' },
    });
    res.json({ stations: stations.map((station) => stationResponse(station, now, true)) });
  });

  router.post('/hosts/stations', async (req, res) => {
    const host = requireRole(req, 'HOST');
    const input = parseInput(stationInput, req.body);
    if (input.identityMode === 'DEMO' && process.env.NODE_ENV === 'production') {
      fail(400, 'Simulated identity checks only run in development.');
    }
    const {
      chargerType, connector, powerKw, availability, cctvDeclared, electricalDeclared,
      termsAccepted, identityMode, evidenceNote, ...fields
    } = input;
    const now = new Date();
    const station = await prisma.chargingStation.create({
      data: {
        ...fields,
        hostId: host.id,
        spec: { create: { chargerType, connector, powerWatts: Math.round(powerKw * 1_000) } },
        availability: { create: availability },
        verification: { create: { cctvDeclared, electricalDeclared, termsAccepted, identityMode, evidenceNote } },
      },
      include: stationRelations(now, true),
    });
    res.status(201).json({ station: stationResponse(station, now, true) });
  });

  router.patch('/hosts/stations/:id', async (req, res) => {
    const host = requireRole(req, 'HOST');
    const id = routeId(req.params.id);
    const input = parseInput(stationInput.partial(), req.body);
    if (input.identityMode === 'DEMO' && process.env.NODE_ENV === 'production') {
      fail(400, 'Simulated identity checks only run in development.');
    }
    const {
      chargerType, connector, powerKw, availability, cctvDeclared, electricalDeclared,
      termsAccepted, identityMode, evidenceNote, ...fields
    } = input;
    const now = new Date();
    const station = await prisma.$transaction(async (tx) => {
      await lockStation(tx, id);
      const existing = await tx.chargingStation.findFirst({
        where: { id, hostId: host.id },
        include: { spec: true, verification: true },
      });
      if (!existing?.spec || !existing.verification) fail(404, 'Station does not exist.');
      if (existing.status === 'SUSPENDED' || existing.status === 'PENDING') {
        fail(409, 'This station cannot be edited during its review or suspension.');
      }
      const powerWatts = powerKw === undefined ? undefined : Math.round(powerKw * 1_000);
      const locationChanged = (['city', 'locality', 'address', 'latitude', 'longitude'] as const)
        .some((field) => fields[field] !== undefined && fields[field] !== existing[field]);
      const specChanged = (chargerType !== undefined && chargerType !== existing.spec.chargerType)
        || (connector !== undefined && connector !== existing.spec.connector)
        || (powerWatts !== undefined && powerWatts !== existing.spec.powerWatts);
      const declarations = { cctvDeclared, electricalDeclared, termsAccepted, identityMode, evidenceNote };
      const verification = existing.verification;
      const verificationChanged = (Object.keys(declarations) as Array<keyof typeof declarations>)
        .some((field) => declarations[field] !== undefined && declarations[field] !== verification[field]);
      const requiresReview = locationChanged || specChanged || verificationChanged;

      const future = await tx.booking.findMany({
        where: {
          stationId: id, end: { gt: now },
          OR: [{ status: { in: ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] } }, { status: 'PENDING', expiresAt: { gt: now } }],
        },
        select: { start: true, end: true },
      });
      if ((locationChanged || specChanged) && future.length) {
        fail(409, 'Changing the charger or location requires all existing reservations to finish or be cancelled.');
      }
      if (availability && future.some((booking) => {
        const bounds = dateBounds(localDate(booking.start))!;
        const startMinute = (booking.start.getTime() - bounds.start.getTime()) / 60_000;
        const endMinute = (booking.end.getTime() - bounds.start.getTime()) / 60_000;
        return !availability.some((range) => range.day === bounds.day
          && range.startMinute <= startMinute && range.endMinute >= endMinute);
      })) {
        fail(409, 'The new charging hours must accommodate existing reservations.');
      }

      return tx.chargingStation.update({
        where: { id },
        data: {
          ...fields,
          status: requiresReview ? 'DRAFT' : undefined,
          spec: { update: { chargerType, connector, powerWatts } },
          ...(availability ? { availability: { deleteMany: {}, create: availability } } : {}),
          verification: { update: {
            ...declarations,
            ...(requiresReview ? { status: 'DRAFT', rejectionReason: null, reviewedAt: null, submittedAt: null } : {}),
          } },
        },
        include: stationRelations(now, true),
      });
    });
    res.json({ station: stationResponse(station, now, true) });
  });

  router.post('/hosts/stations/:id/submit', async (req, res) => {
    const host = requireRole(req, 'HOST');
    const id = routeId(req.params.id);
    const now = new Date();
    const station = await prisma.$transaction(async (tx) => {
      await lockStation(tx, id);
      const station = await tx.chargingStation.findFirst({
        where: { id, hostId: host.id },
        include: { verification: true, spec: true, availability: true },
      });
      if (!station?.verification || !station.spec) fail(404, 'Station does not exist.');
      if (station.status !== 'DRAFT' && station.status !== 'REJECTED') fail(409, 'This listing cannot be submitted again yet.');
      const { cctvDeclared, electricalDeclared, termsAccepted } = station.verification;
      if (!cctvDeclared || !electricalDeclared || !termsAccepted) {
        fail(400, 'Declare CCTV and electrical safety and accept the host terms before submitting.');
      }
      if (!station.availability.length) fail(400, 'Add at least one charging availability window.');

      const updated = await tx.chargingStation.update({
        where: { id },
        data: {
          status: 'PENDING',
          verification: { update: { status: 'PENDING', submittedAt: now, rejectionReason: null, reviewedAt: null } },
        },
        include: stationRelations(now, true),
      });
      await tx.notification.create({
        data: { userId: host.id, kind: 'STATION_SUBMITTED', title: 'Station submitted', message: `${station.name} is waiting for administrator review.` },
      });
      return updated;
    });
    res.json({ station: stationResponse(station, now, true) });
  });

  router.post('/hosts/stations/:id/blocks', async (req, res) => {
    const host = requireRole(req, 'HOST');
    const id = routeId(req.params.id);
    const input = parseInput(blockInput, req.body);
    const now = new Date();
    if (!Number.isFinite(input.start.getTime()) || !Number.isFinite(input.end.getTime()) || input.start >= input.end
      || input.end <= now || input.end.getTime() - input.start.getTime() > 90 * 86_400_000) {
      fail(400, 'Choose a time range ending in the future and lasting at most 90 days.');
    }
    const block = await prisma.$transaction(async (tx) => {
      await lockStation(tx, id);
      const station = await tx.chargingStation.findFirst({ where: { id, hostId: host.id }, select: { id: true } });
      if (!station) fail(404, 'Station does not exist.');
      const reserved = await tx.booking.findFirst({
        where: { stationId: id, ...blockingBookings(input.start, input.end, now) },
        select: { id: true },
      });
      if (reserved) fail(409, 'This block overlaps a reservation. Cancel or honor the reservation first.');
      return tx.blockedTime.create({ data: { ...input, stationId: id } });
    });
    res.status(201).json({ block });
  });

  router.delete('/hosts/stations/:id/blocks/:blockId', async (req, res) => {
    const host = requireRole(req, 'HOST');
    const id = routeId(req.params.id);
    const blockId = routeId(req.params.blockId);
    await prisma.$transaction(async (tx) => {
      await lockStation(tx, id);
      const removed = await tx.blockedTime.deleteMany({ where: { id: blockId, stationId: id, station: { hostId: host.id } } });
      if (!removed.count) fail(404, 'Blocked time does not exist.');
    });
    res.status(204).end();
  });

  router.get('/hosts/overview', async (req, res) => {
    const host = requireRole(req, 'HOST');
    const now = new Date();
    await expireBookings(now);
    const [stations, bookings, reviewed, amounts, upcoming] = await prisma.$transaction([
      prisma.chargingStation.findMany({
        where: { hostId: host.id }, include: stationRelations(now, true), orderBy: { createdAt: 'desc' },
      }),
      prisma.booking.findMany({
        where: { hostId: host.id }, include: bookingRelations, orderBy: { start: 'desc' }, take: 100,
      }),
      prisma.review.findMany({
        where: { station: { hostId: host.id }, hidden: false }, include: reviewRelations,
        orderBy: { createdAt: 'desc' }, take: 30,
      }),
      prisma.booking.aggregate({
        where: { hostId: host.id, status: 'COMPLETED' },
        _sum: { actualEnergyWh: true, finalPaise: true },
      }),
      prisma.booking.aggregate({
        where: { hostId: host.id, status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] } },
        _sum: { totalPaise: true },
      }),
    ]);
    res.json({
      stations: stations.map((station) => stationResponse(station, now, true)),
      bookings: bookings.map((booking) => bookingResponse(booking, host)),
      reviews: reviewed.map((review) => reviewResponse(review, true)),
      earnings: {
        estimatedPaise: upcoming._sum.totalPaise ?? 0,
        completedPaise: amounts._sum.finalPaise ?? 0,
        platformFeesPaise: 0,
        eligiblePaise: 0,
        paidOutPaise: 0,
        energyWh: amounts._sum.actualEnergyWh ?? 0,
      },
    });
  });

  router.get('/admin/overview', async (req, res) => {
    requireRole(req, 'ADMIN');
    await expireBookings(new Date());
    const [users, hosts, pending, active, bookings, completed, payments, support, reports] = await prisma.$transaction([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'HOST' } }),
      prisma.chargingStation.count({ where: { status: 'PENDING' } }),
      prisma.chargingStation.count({ where: { status: 'APPROVED', host: { status: 'ACTIVE' } } }),
      prisma.booking.count(),
      prisma.booking.count({ where: { status: 'COMPLETED' } }),
      prisma.payment.count(),
      prisma.supportRequest.count({ where: { status: 'OPEN' } }),
      prisma.review.count({ where: { reportedAt: { not: null }, hidden: false } }),
    ]);
    res.json({ counts: { users, hosts, pending, active, bookings, completed, payments, issues: support + reports } });
  });

  router.get('/admin/stations', async (req, res) => {
    requireRole(req, 'ADMIN');
    const { q, status, limit, offset } = parseInput(filterStations, req.query);
    const now = new Date();
    const where: Prisma.ChargingStationWhereInput = {
      status,
      OR: q ? [
        { name: { contains: q, mode: 'insensitive' } },
        { locality: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
        { host: { name: { contains: q, mode: 'insensitive' } } },
      ] : undefined,
    };
    const [stations, total] = await prisma.$transaction([
      prisma.chargingStation.findMany({
        where, include: stationRelations(now, true), orderBy: { updatedAt: 'desc' }, skip: offset, take: limit,
      }),
      prisma.chargingStation.count({ where }),
    ]);
    res.json({ stations: stations.map((station) => stationResponse(station, now, true)), total });
  });

  router.patch('/admin/stations/:id', async (req, res) => {
    const admin = requireRole(req, 'ADMIN');
    const id = routeId(req.params.id);
    const { status, reason } = parseInput(stationDecision, req.body);
    if (status !== 'APPROVED' && !reason) fail(400, 'Provide a reason for this decision.');
    const now = new Date();
    const station = await prisma.$transaction(async (tx) => {
      await lockStation(tx, id);
      const existing = await tx.chargingStation.findUnique({
        where: { id },
        include: { verification: true, host: { select: { status: true } } },
      });
      if (!existing?.verification) fail(404, 'Station does not exist.');
      const valid = {
        APPROVED: ['PENDING', 'SUSPENDED'],
        REJECTED: ['PENDING'],
        SUSPENDED: ['PENDING', 'APPROVED'],
      };
      if (!valid[status].includes(existing.status)) fail(409, 'This listing cannot move to the selected status.');
      if (status === 'APPROVED' && existing.host.status !== 'ACTIVE') fail(409, 'Reactivate the host account before approval.');
      if (status === 'APPROVED' && (!existing.verification.cctvDeclared || !existing.verification.electricalDeclared
        || !existing.verification.termsAccepted)) fail(409, 'The listing is missing required safety declarations.');
      if (status === 'APPROVED' && process.env.NODE_ENV === 'production') {
        fail(409, 'Connect the authorized identity provider before approving production listings.');
      }
      const updated = await tx.chargingStation.update({
        where: { id },
        data: {
          status,
          verification: { update: { status, reviewedAt: now, rejectionReason: status === 'APPROVED' ? null : reason } },
        },
        include: stationRelations(now, true),
      });
      await tx.adminAction.create({
        data: { adminId: admin.id, action: status, targetType: 'STATION', targetId: id, reason },
      });
      const action = status.toLowerCase();
      await tx.notification.create({
        data: {
          userId: existing.hostId,
          kind: `STATION_${status}`,
          title: `Station ${action}`,
          message: `${existing.name} was ${action}.${reason ? ` ${reason}` : ''}`,
        },
      });
      return updated;
    });
    res.json({ station: stationResponse(station, now, true) });
  });

  router.get('/admin/users', async (req, res) => {
    requireRole(req, 'ADMIN');
    const { q, role, limit, offset } = parseInput(filterUsers, req.query);
    const where: Prisma.UserWhereInput = {
      role,
      OR: q ? [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ] : undefined,
    };
    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({ where, select: userFields, orderBy: { createdAt: 'desc' }, skip: offset, take: limit }),
      prisma.user.count({ where }),
    ]);
    res.json({ users, total });
  });

  router.patch('/admin/users/:id', async (req, res) => {
    const admin = requireRole(req, 'ADMIN');
    const id = routeId(req.params.id);
    const { status } = parseInput(userDecision, req.body);
    if (id === admin.id) fail(400, 'Administrators cannot change their own account status.');
    const user = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { id }, select: userFields });
      if (!existing) fail(404, 'User does not exist.');
      if (existing.role === 'ADMIN') fail(403, 'Administrator accounts are managed separately.');
      if (status === existing.status) return existing;
      const updated = await tx.user.update({ where: { id }, data: { status }, select: userFields });
      if (status === 'SUSPENDED') await tx.session.deleteMany({ where: { userId: id } });
      await tx.adminAction.create({ data: { adminId: admin.id, action: status, targetType: 'USER', targetId: id } });
      return updated;
    });
    res.json({ user });
  });

  router.get('/admin/issues', async (req, res) => {
    requireRole(req, 'ADMIN');
    const [supportRequests, reviews] = await prisma.$transaction([
      prisma.supportRequest.findMany({ where: { status: 'OPEN' }, orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.review.findMany({
        where: { reportedAt: { not: null } }, include: reviewRelations,
        orderBy: { reportedAt: 'desc' }, take: 100,
      }),
    ]);
    res.json({ supportRequests, reviews: reviews.map((review) => reviewResponse(review, true)) });
  });

  router.patch('/admin/reviews/:id', async (req, res) => {
    const admin = requireRole(req, 'ADMIN');
    const id = routeId(req.params.id);
    const { hidden } = parseInput(reviewDecision, req.body);
    const review = await prisma.$transaction(async (tx) => {
      const existing = await tx.review.findFirst({ where: { id, reportedAt: { not: null } }, select: { id: true } });
      if (!existing) fail(404, 'Reported review does not exist.');
      const updated = await tx.review.update({ where: { id }, data: { hidden }, include: reviewRelations });
      await tx.adminAction.create({
        data: { adminId: admin.id, action: hidden ? 'HIDE' : 'RESTORE', targetType: 'REVIEW', targetId: id },
      });
      return updated;
    });
    res.json({ review: reviewResponse(review, true) });
  });

  return router;
}
