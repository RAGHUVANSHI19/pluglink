import { createHash, createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const suffix = randomUUID().slice(0, 8);
const emailDomain = `pluglink-fixture-${suffix}.test`;
const password = 'LocalSandboxFixture!2026';
const keySecret = 'mockCheckoutSecret';
const webhookSecret = 'mockWebhookSecret';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lccAAAAASUVORK5CYII=', 'base64');

type RequestAgent = ReturnType<typeof request.agent>;

describe.skipIf(!testDatabaseUrl)('Secure uploads and sandbox payments on PostgreSQL', () => {
  let app: Express;
  let createApp: () => Express;
  let prisma: PrismaClient;
  let owner: RequestAgent;
  let host: RequestAgent;
  let uploadDirectory: string;
  let stationId: string;
  let bookingId: string;
  const eventIds: string[] = [];

  beforeAll(async () => {
    if (!testDatabaseUrl) return;
    uploadDirectory = await mkdtemp(join(tmpdir(), 'pluglink-upload-test-'));
    vi.stubEnv('DATABASE_URL', testDatabaseUrl);
    vi.stubEnv('UPLOAD_DIR', uploadDirectory);
    vi.stubEnv('RAZORPAY_KEY_ID', undefined);
    vi.stubEnv('RAZORPAY_KEY_SECRET', undefined);
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', undefined);
    const [appModule, shared] = await Promise.all([import('../src/app.js'), import('../src/shared.js')]);
    createApp = appModule.createApp;
    prisma = shared.prisma;
    app = createApp();
    owner = request.agent(app);
    host = request.agent(app);
    const accounts = { phone: '+919555010001', password, confirmPassword: password };
    const [ownerAccount, hostAccount] = await Promise.all([
      owner.post('/api/auth/register').send({ ...accounts, name: 'Sandbox Owner', email: `owner@${emailDomain}`, role: 'OWNER' }).expect(201),
      host.post('/api/auth/register').send({ ...accounts, name: 'Sandbox Host', email: `host@${emailDomain}`, role: 'HOST' }).expect(201),
    ]);
    const station = await prisma.chargingStation.create({ data: {
      hostId: hostAccount.body.user.id,
      name: `Sandbox Charger ${suffix}`, city: 'Jaipur', locality: 'Jaipur',
      address: 'Fictional fixture address', description: 'Station for automated payment verification.',
      pricePaise: 1200, feePaise: 2000, latitude: 26.9, longitude: 75.8, imageUrls: [], status: 'APPROVED',
    } });
    stationId = station.id;
    const now = Date.now();
    const booking = await prisma.booking.create({ data: {
      stationId, ownerId: ownerAccount.body.user.id, hostId: hostAccount.body.user.id,
      start: new Date(now + 3_600_000), end: new Date(now + 7_200_000), expiresAt: new Date(now + 1_800_000),
      energyWh: 2000, powerWatts: 7400, pricePaise: 1200, feePaise: 2000, totalPaise: 4400,
    } });
    bookingId = booking.id;
  });

  afterEach(() => vi.unstubAllGlobals());

  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.$transaction(async (transaction) => {
          if (eventIds.length) await transaction.paymentEvent.deleteMany({ where: { eventId: { in: eventIds } } });
          if (bookingId) {
            await transaction.payment.deleteMany({ where: { bookingId } });
            await transaction.booking.deleteMany({ where: { id: bookingId } });
          }
          if (stationId) await transaction.chargingStation.deleteMany({ where: { id: stationId } });
          await transaction.user.deleteMany({ where: { email: { endsWith: `@${emailDomain}` } } });
        });
      }
    } finally {
      if (prisma) await prisma.$disconnect();
      if (uploadDirectory) await rm(uploadDirectory, { recursive: true, force: true });
      vi.unstubAllEnvs();
    }
  });

  it('permits only hosts to upload recognized image types and serves only generated image names', async () => {
    const guest = request(app);
    await owner.post('/api/uploads').set('Content-Type', 'image/png').send(png).expect(403);
    await host.post('/api/uploads').set('Content-Type', 'image/png').send(Buffer.from('<svg></svg>')).expect(415);
    await host.post('/api/uploads').set('Content-Type', 'image/png').send(Buffer.alloc(5 * 1024 * 1024 + 1)).expect(413);
    const uploaded = await host.post('/api/uploads').set('Content-Type', 'image/png').send(png).expect(201);
    const served = await guest.get(uploaded.body.url).expect('Content-Type', /image\/png/).expect(200);
    expect(served.body).toEqual(png);
    await guest.get('/uploads/package.json').expect(404);
  });

  it('uses the server price and authenticates captured and failed sandbox transactions idempotently', async () => {
    vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_InProcessFixture');
    vi.stubEnv('RAZORPAY_KEY_SECRET', keySecret);
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', webhookSecret);
    const orderId = `order_Fixture${suffix}`;
    const paymentId = `pay_Fixture${suffix}`;
    const paymentEntity = { id: paymentId, order_id: orderId, amount: 4400, currency: 'INR', status: 'captured' };
    const fetchGateway = vi.fn<typeof fetch>(async (url, options) => {
      if (String(url) === 'https://api.razorpay.com/v1/orders') {
        expect(options?.method).toBe('POST');
        expect(JSON.parse(String(options?.body)).amount).toBe(4400);
        return Response.json({ id: orderId, amount: 4400, currency: 'INR' });
      }
      expect(String(url)).toBe(`https://api.razorpay.com/v1/payments/${paymentId}`);
      return Response.json(paymentEntity);
    });
    vi.stubGlobal('fetch', fetchGateway);
    const path = `/api/payments/${bookingId}`;
    const guest = request(app);
    await owner.post(`${path}/demo`).expect(403);
    const order = await owner.post(`${path}/order`).send({ amountPaise: 1 }).expect(200);
    expect(order.body).toMatchObject({ orderId, amountPaise: 4400, currency: 'INR', mode: 'razorpay_test' });
    await owner.post(`${path}/order`).expect(200);
    expect(fetchGateway).toHaveBeenCalledTimes(1);

    function webhook(event: string, entity: typeof paymentEntity) {
      const body = JSON.stringify({ event, payload: { payment: { entity } } });
      eventIds.push(createHash('sha256').update(body).digest('hex'));
      return {
        body, signature: createHmac('sha256', webhookSecret).update(body).digest('hex'),
      };
    }
    const failed = webhook('payment.failed', { ...paymentEntity, id: `pay_Failed${suffix}`, status: 'failed' });
    await guest.post('/api/payments/webhook').type('json').set('X-Razorpay-Signature', failed.signature).send(failed.body).expect(200);
    const snapshot = await owner.get(path).expect(200);
    expect(snapshot.body.payment.status).toBe('FAILED');

    await owner.post(`${path}/verify`).send({ orderId, paymentId, signature: '0'.repeat(64) }).expect(400);
    expect(fetchGateway).toHaveBeenCalledTimes(1);
    const signature = createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
    await owner.post(`${path}/verify`).send({ orderId, paymentId, signature }).expect(200);
    await owner.post(`${path}/verify`).send({ orderId, paymentId, signature }).expect(200);
    expect(fetchGateway).toHaveBeenCalledTimes(2);

    const captured = webhook('payment.captured', paymentEntity);
    await guest.post('/api/payments/webhook').type('json').set('X-Razorpay-Signature', '0'.repeat(64)).send(captured.body).expect(400);
    for (let attempt = 0; attempt < 2; attempt++) {
      await guest.post('/api/payments/webhook').type('json').set('X-Razorpay-Signature', captured.signature).send(captured.body).expect(200);
    }
    expect(await prisma.paymentEvent.count({ where: { eventId: { in: eventIds } } })).toBe(2);
    const persisted = await prisma.booking.findUnique({ where: { id: bookingId }, include: { payment: true, notifications: true } });
    expect(persisted).toMatchObject({
      status: 'CONFIRMED', paymentStatus: 'PAID',
      payment: { amountPaise: 4400, providerPaymentId: paymentId, status: 'PAID' },
    });
    expect(persisted?.notifications.map((notification) => notification.kind).sort()).toEqual([
      'BOOKING_CONFIRMED', 'BOOKING_CONFIRMED', 'PAYMENT_CONFIRMED', 'PAYMENT_FAILED',
    ]);
  });

  it('uses secure cookies, an explicit HTTPS origin, and no checkout simulation in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ORIGIN', 'https://pluglink.test');
    vi.stubEnv('RAZORPAY_KEY_ID', undefined);
    vi.stubEnv('RAZORPAY_KEY_SECRET', undefined);
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', undefined);

    const production = request(createApp());
    await production.post('/api/auth/login').set('Origin', 'https://wrong.test').send({ email: `owner@${emailDomain}`, password }).expect(403);
    const login = await production.post('/api/auth/login').set('Origin', 'https://pluglink.test').send({ email: `owner@${emailDomain}`, password })
      .expect('Access-Control-Allow-Origin', 'https://pluglink.test')
      .expect('Content-Security-Policy', /https:\/\/checkout\.razorpay\.com/)
      .expect(200);
    const [cookie] = login.headers['set-cookie'] as unknown as string[];
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
    await production.post(`/api/payments/${bookingId}/demo`).set('Cookie', cookie.split(';')[0]).expect(403);
  });
});
