import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { localDate } from '../src/domain-rules.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const suffix = randomUUID().slice(0, 8);
const domain = `pluglink-test-${suffix}.test`;
const password = 'LocalWorkflow!2026';
const demoPassword = process.env.DEMO_PASSWORD ?? 'PlugLinkDemo2026!';
const stationName = `Integration Charger ${suffix}`;

type Agent = ReturnType<typeof request.agent>;

function account(kind: string, role: 'OWNER' | 'HOST' | 'ADMIN') {
  return {
    name: `Test ${kind}`,
    email: `${kind}@${domain}`,
    phone: '9876500000',
    password,
    confirmPassword: password,
    role,
  };
}

function fixtureStation() {
  return {
    name: stationName,
    city: 'Jaipur',
    locality: 'Test Market',
    address: 'Fictional station address for automated integration testing',
    description: 'This charging station exists for the automated booking workflow only.',
    chargerType: 'AC',
    connector: 'Type 2',
    powerKw: 7.4,
    pricePaise: 1_200,
    feePaise: 2_000,
    latitude: 26.91,
    longitude: 75.78,
    imageUrls: [],
    availability: Array.from({ length: 7 }, (_, day) => ({ day, startMinute: 480, endMinute: 1_200 })),
    cctvDeclared: true,
    electricalDeclared: true,
    termsAccepted: true,
    identityMode: 'DEMO',
    evidenceNote: 'Synthetic compliance declaration for a local automated test.',
  };
}

describe.skipIf(!testDatabaseUrl)('PlugLink API on PostgreSQL', () => {
  let app: Express;
  let createApp: () => Express;
  let prisma: PrismaClient;

  beforeAll(async () => {
    if (!testDatabaseUrl) return;
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.AUTH_ALLOW_DEMO_RESET = 'true';
    delete process.env.RESEND_API_KEY;
    delete process.env.RESET_FROM_EMAIL;
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    const [shared, appModule] = await Promise.all([import('../src/shared.js'), import('../src/app.js')]);
    prisma = shared.prisma;
    createApp = appModule.createApp;
    app = createApp();
  });

  afterAll(async () => {
    if (!prisma) return;

    try {
      const station = await prisma.chargingStation.findFirst({ where: { name: stationName }, select: { id: true } });
      if (station) {
        const { id: stationId } = station;
        const bookingIds = (await prisma.booking.findMany({ where: { stationId }, select: { id: true } }))
          .map(({ id }) => id);
        await prisma.$transaction([
          prisma.paymentReview.deleteMany({ where: { bookingId: { in: bookingIds } } }),
          prisma.adminAction.deleteMany({ where: { targetType: 'BOOKING', targetId: { in: bookingIds } } }),
          prisma.review.deleteMany({ where: { stationId } }),
          prisma.chargingSession.deleteMany({ where: { booking: { stationId } } }),
          prisma.payment.deleteMany({ where: { booking: { stationId } } }),
          prisma.booking.deleteMany({ where: { stationId } }),
          prisma.adminAction.deleteMany({ where: { targetId: stationId } }),
          prisma.chargingStation.delete({ where: { id: stationId } }),
        ]);
      }
      await prisma.supportRequest.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
      await prisma.user.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  async function register(agent: Agent, kind: string, role: 'OWNER' | 'HOST') {
    const result = await agent.post('/api/auth/register').send(account(kind, role)).expect(201);
    expect(result.body.user.role).toBe(role);
    expect(result.body.user.passwordHash).toBeUndefined();
    return result;
  }

  it('reports readiness, handles missing routes, and requires production configuration', async () => {
    const guest = request(app);
    await guest.get('/api/health').expect(200, { status: 'ok', database: 'ok' });
    await guest.get('/api/stations/absent-station').expect(404);
    await guest.get('/api/absent-endpoint').expect(404);
    await guest.post('/api/auth/logout').set('Origin', 'https://untrusted.invalid').expect(403);

    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ORIGIN', '');
    try {
      expect(createApp).toThrow(/APP_ORIGIN and DATABASE_URL are required/i);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('validates registration, authenticates with a cookie, limits roles and invalidates reset tokens', async () => {
    const guest = request(app);
    const owner = request.agent(app);
    const accountInfo = account('auth-owner', 'OWNER');
    await guest.get('/api/auth/me').expect(200, { user: null });
    await guest.get('/api/bookings').expect(401);
    await guest.post('/api/auth/register').send(account('public-admin', 'ADMIN')).expect(400);
    await guest.post('/api/auth/register').send({ ...accountInfo, confirmPassword: 'DifferentPassword!' }).expect(400);
    const signup = await register(owner, 'auth-owner', 'OWNER');
    expect(signup.headers['set-cookie'].join(';')).toMatch(/HttpOnly/i);
    expect(signup.headers['set-cookie'].join(';')).toMatch(/SameSite=Lax/i);

    await owner.get('/api/admin/overview').expect(403);
    await guest.post('/api/auth/register').send({ ...accountInfo, email: accountInfo.email.toUpperCase() }).expect(409);
    await guest.post('/api/auth/login').send({ ...accountInfo, password: 'incorrect' }).expect(401);

    const resetRequest = await guest.post('/api/auth/forgot').send({ email: accountInfo.email }).expect(200);
    const token: string = resetRequest.body.developmentResetToken;
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const replacementPassword = 'NewLocalWorkflow!2026';
    const reset = { token, password: replacementPassword, confirmPassword: replacementPassword };
    await guest.post('/api/auth/reset').send(reset).expect(200);
    await guest.post('/api/auth/reset').send(reset).expect(400);
    await owner.get('/api/auth/me').expect(200, { user: null });
    await owner.post('/api/auth/login').send({ email: accountInfo.email, password: replacementPassword }).expect(200);
    await owner.post('/api/auth/logout').expect(200);
    await owner.get('/api/auth/me').expect(200, { user: null });
  });

  it('shows matching catalog examples with filters and keeps their booking routes read-only', async () => {
    const guest = request(app);
    const owner = request.agent(app);
    const exampleId = 'example-greencharge';
    const exampleMatch = await guest.get('/api/stations').query({
      q: 'Jaipur vaishali', connector: 'type 2', maxPrice: 12, minPower: 7, available: 'false',
    }).expect(200);
    expect(exampleMatch.body).toMatchObject({
      total: 1, stations: [{ id: exampleId, catalogExample: true, sample: true, available: false }],
    });
    await guest.get('/api/stations').query({ q: 'Jaipur vaishali', connector: 'CHAdeMO' })
      .expect(200, { stations: [], total: 0 });
    const detail = await guest.get(`/api/stations/${exampleId}`).expect(200);
    expect(detail.body.station).toMatchObject({ id: exampleId, catalogExample: true, reviews: [] });
    const start = new Date(Date.now() + 24 * 3_600_000);
    await guest.get(`/api/stations/${exampleId}/slots`).query({ date: localDate(start) }).expect(200, { slots: [] });
    await register(owner, 'catalog-example-owner', 'OWNER');
    await owner.post('/api/bookings').send({
      stationId: exampleId, start: start.toISOString(), end: new Date(start.getTime() + 3_600_000).toISOString(),
      energyWh: 1_000,
    }).expect(409, { message: 'Bookings are unavailable for demo listings.' });
  });

  it('approves a host application then protects booking, test payment and review lifecycles', async () => {
    const host = request.agent(app);
    const owner = request.agent(app);
    const secondOwner = request.agent(app);
    const admin = request.agent(app);
    const guest = request(app);

    await register(host, 'host', 'HOST');
    await register(owner, 'booking-owner', 'OWNER');
    await register(secondOwner, 'other-owner', 'OWNER');
    await admin.post('/api/auth/login').send({ email: 'admin@pluglink.test', password: demoPassword }).expect(200);

    const draft = await host.post('/api/hosts/stations').send(fixtureStation()).expect(201);
    const stationId: string = draft.body.station.id;
    expect(draft.body.station.status).toBe('DRAFT');
    await guest.get(`/api/stations/${stationId}`).expect(404);
    const submit = await host.post(`/api/hosts/stations/${stationId}/submit`).send({}).expect(200);
    expect(submit.body.station.status).toBe('PENDING');
    await owner.patch(`/api/admin/stations/${stationId}`).send({ status: 'APPROVED' }).expect(403);
    await admin.patch(`/api/admin/stations/${stationId}`).send({ status: 'APPROVED' }).expect(200);

    const listing = await guest.get('/api/stations').query({ q: stationName }).expect(200);
    expect(listing.body.stations.map((station: { id: string }) => station.id)).toContain(stationId);
    const detail = await guest.get(`/api/stations/${stationId}`).expect(200);
    expect(detail.body.station.hostEmail).toBeUndefined();
    expect(detail.body.station.pricePaise).toBe(1_200);

    const date = localDate(new Date(Date.now() + 5 * 86_400_000));
    const past = localDate(new Date(Date.now() - 2 * 86_400_000));
    const slots = await guest.get(`/api/stations/${stationId}/slots`).query({ date }).expect(200);
    const pastSlots = await guest.get(`/api/stations/${stationId}/slots`).query({ date: past }).expect(200);
    expect(pastSlots.body.slots).toEqual([]);
    const [slot, blockedSlot]: Array<{ start: string; end: string }> = slots.body.slots;
    expect(slot).toBeDefined();
    expect(blockedSlot).toBeDefined();

    const blocksPath = `/api/hosts/stations/${stationId}/blocks`;
    const blocked = await host.post(blocksPath).send({ ...blockedSlot, reason: 'Host unavailable' }).expect(201);
    const filteredSlots = await guest.get(`/api/stations/${stationId}/slots`).query({ date }).expect(200);
    expect(filteredSlots.body.slots).not.toContainEqual(blockedSlot);
    await owner.post('/api/bookings').send({ stationId, ...blockedSlot, energyWh: 1_000 }).expect(409);
    await host.delete(`${blocksPath}/${blocked.body.block.id}`).expect(204);

    const payload = { stationId, ...slot, energyWh: 1_000, totalPaise: 1 };
    await owner.post('/api/bookings').send({ ...payload, energyWh: 20_000 }).expect(400);
    const competing = await Promise.all([
      owner.post('/api/bookings').send(payload),
      secondOwner.post('/api/bookings').send(payload),
    ]);
    expect(competing.map((result) => result.status).sort((a, b) => a - b)).toEqual([201, 409]);
    const winningIndex = competing.findIndex((result) => result.status === 201);
    const winningAgent = winningIndex === 0 ? owner : secondOwner;
    const losingAgent = winningIndex === 0 ? secondOwner : owner;
    const booked = competing[winningIndex].body.booking;
    expect(booked.totalPaise).toBe(3_200);
    expect(booked.status).toBe('PENDING');

    const cancelPath = `/api/bookings/${booked.id}/cancel`;
    const unauthorized = await losingAgent.post(cancelPath).send({ reason: 'I do not own this booking' });
    expect([403, 404]).toContain(unauthorized.status);
    await winningAgent.post(cancelPath).send({ reason: 'Integration test cancellation' }).expect(200);

    const replacement = await owner.post('/api/bookings').send(payload).expect(201);
    const bookingId: string = replacement.body.booking.id;
    const review = { bookingId, rating: 5, comment: 'Clear access and a straightforward charging session.' };
    const ineligible = await owner.post('/api/reviews').send(review);
    expect([400, 403, 409]).toContain(ineligible.status);

    const order = await owner.post(`/api/payments/${bookingId}/order`).send({}).expect(200);
    expect(order.body).toMatchObject({ mode: 'demo', amountPaise: 3_200, currency: 'INR' });
    const forbiddenPayment = await secondOwner.post(`/api/payments/${bookingId}/demo`).send({});
    expect([403, 404]).toContain(forbiddenPayment.status);
    const paid = await owner.post(`/api/payments/${bookingId}/demo`).send({}).expect(200);
    expect(paid.body.payment.status).toBe('PAID');
    const repeatedPayment = await owner.post(`/api/payments/${bookingId}/demo`).send({}).expect(200);
    expect(repeatedPayment.body.payment.id).toBe(paid.body.payment.id);
    const inbox = await owner.get('/api/notifications').expect(200);
    const confirmation = inbox.body.notifications.find(
      (entry: { kind: string; bookingId: string }) => entry.kind === 'BOOKING_CONFIRMED' && entry.bookingId === bookingId,
    );
    expect(confirmation).toMatchObject({ readAt: null });
    await owner.patch(`/api/notifications/${confirmation.id}/read`).expect(200);
    const readInbox = await owner.get('/api/notifications').expect(200);
    expect(readInbox.body.notifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: confirmation.id, readAt: expect.any(String) }),
    ]));

    const sessionPath = `/api/bookings/${bookingId}/session`;
    await owner.patch(sessionPath).send({ status: 'IN_PROGRESS' }).expect(403);
    await host.patch(sessionPath).send({ status: 'IN_PROGRESS' }).expect(200);
    const done = await host.patch(sessionPath).send({ status: 'COMPLETED', actualEnergyWh: 900 }).expect(200);
    expect(done.body.booking).toMatchObject({ status: 'COMPLETED', actualEnergyWh: 900, finalPaise: 3_080 });
    const path = '/api/admin/payment-reviews';
    const variance = { kind: 'CHARGED_MORE', amountPaise: 120, reviewedAt: null };
    expect(done.body.booking.paymentVariance).toEqual(variance);
    await owner.get(path).expect(403);
    await owner.put(path + '/' + bookingId).send({ note: 'Unauthorized review attempt' }).expect(403);
    const open = await admin.get(path).expect(200);
    expect(open.body.bookings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: bookingId, paymentVariance: variance }),
    ]));
    const note = 'Compared the test checkout record with the final charge.';
    await admin.put(path + '/' + bookingId).send({ note: 'x' }).expect(400);
    const resolution = await admin.put(path + '/' + bookingId).send({ note }).expect(200);
    await admin.put(path + '/' + bookingId).send({ note }).expect(200, resolution.body);
    await admin.put(path + '/' + bookingId).send({ note: 'Replace the original review record.' }).expect(409);
    const reviewed = await admin.get(path).query({ status: 'REVIEWED' }).expect(200);
    expect(reviewed.body.bookings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: bookingId, paymentVariance: { ...variance, note, reviewedAt: resolution.body.reviewedAt } }),
    ]));
    const receipt = await owner.get('/api/bookings/' + bookingId).expect(200);
    expect(receipt.body.booking).toMatchObject({ paidPaise: 3_200, paymentStatus: 'PAID', finalPaise: 3_080 });
    expect(receipt.body.booking.paymentVariance).toEqual({ ...variance, reviewedAt: resolution.body.reviewedAt });
    await owner.post('/api/reviews').send(review).expect(201);
    await owner.post('/api/reviews').send(review).expect(409);
    const current = await owner.get('/api/bookings').expect(200);
    expect(current.body.bookings).toEqual(expect.arrayContaining([expect.objectContaining({ id: bookingId, status: 'COMPLETED' })]));
    const reviewedListing = await guest.get(`/api/stations/${stationId}`).expect(200);
    expect(reviewedListing.body.station).toMatchObject({ reviewCount: 1, rating: 5 });
  });

  it('persists valid support requests and rejects invalid form fields', async () => {
    const payload = {
      name: 'Integration Support Test',
      email: `support@${domain}`,
      subject: 'Testing an EV charging support request',
      message: 'This is an automated integration test support request with no personal information.',
    };
    await request(app).post('/api/support').send({ ...payload, email: 'bad-email' }).expect(400);
    const response = await request(app).post('/api/support').send(payload).expect(201);
    const persisted = await prisma.supportRequest.findUnique({ where: { id: response.body.id } });
    expect(persisted).toMatchObject({ email: payload.email, status: 'OPEN' });
  });
});
