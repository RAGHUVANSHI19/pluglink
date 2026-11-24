import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { emailField, nameField, phoneField, publicUserSelect } from './auth.js';
import { fail, prisma, requireRole, requireUser } from './shared.js';

const defaultUploads = fileURLToPath(new URL('../../uploads/', import.meta.url));
const fileTypes = ['image/jpeg', 'image/png', 'image/webp'];
const notificationWindow = 24 * 60 * 60 * 1000;

export function uploadDirectory() {
  return process.env.UPLOAD_DIR ? resolve(process.env.UPLOAD_DIR) : defaultUploads;
}

function abuseLimit(limit: number, message: string) {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: process.env.NODE_ENV === 'test' ? 500 : limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message },
  });
}

function imageExtension(contentType: string | false | null, file: Buffer) {
  if (contentType === 'image/jpeg' && file.length >= 20 && file[0] === 0xff && file[1] === 0xd8 &&
      file[2] === 0xff && file[file.length - 2] === 0xff && file[file.length - 1] === 0xd9) {
    return 'jpg';
  }
  if (contentType === 'image/png' && file.length >= 45 &&
      file.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      file.toString('ascii', 12, 16) === 'IHDR' && file.toString('ascii', file.length - 8, file.length - 4) === 'IEND') {
    return 'png';
  }
  if (contentType === 'image/webp' && file.length >= 24 && file.toString('ascii', 0, 4) === 'RIFF' &&
      file.readUInt32LE(4) + 8 === file.length && file.toString('ascii', 8, 12) === 'WEBP' &&
      ['VP8 ', 'VP8L', 'VP8X'].includes(file.toString('ascii', 12, 16))) {
    return 'webp';
  }
  fail(415, 'Choose a valid JPEG, PNG, or WebP image.');
}

function blobToken() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) fail(503, 'Hosted photo storage is not configured.');
  return token;
}

export const hostedUploadReader: RequestHandler = async (request, response) => {
  const token = blobToken();
  const { get } = await import('@vercel/blob');
  const result = await get(`pluglink-uploads${request.path}`, { access: 'private', token });
  if (!result || result.statusCode !== 200 || !fileTypes.includes(result.blob.contentType)) {
    fail(404, 'The requested image was not found.');
  }
  response.setHeader('Content-Type', result.blob.contentType);
  response.setHeader('Content-Length', result.blob.size);
  response.setHeader('Cache-Control', 'public, max-age=604800, immutable');
  if (request.method === 'HEAD') {
    await result.stream.cancel();
    response.end();
    return;
  }
  const stream = Readable.from(result.stream);
  stream.on('error', () => response.destroy());
  response.on('close', () => stream.destroy());
  stream.pipe(response);
};

export function uploadRouter(storage: 'filesystem' | 'blob' = 'filesystem') {
  const router = Router();
  router.post(
    '/',
    (request, _response, next) => { requireRole(request, 'HOST'); next(); },
    abuseLimit(40, 'Too many uploads. Try again later.'),
    express.raw({ type: fileTypes, limit: storage === 'blob' ? '4mb' : '5mb', inflate: false }),
    async (request, response) => {
      if (!Buffer.isBuffer(request.body)) fail(415, 'Upload a JPEG, PNG, or WebP image.');
      const extension = imageExtension(request.is(fileTypes), request.body);
      const filename = `${randomUUID()}.${extension}`;
      if (storage === 'blob') {
        const token = blobToken();
        const { put } = await import('@vercel/blob');
        await put(`pluglink-uploads/${filename}`, request.body, {
          access: 'private',
          token,
          addRandomSuffix: false,
          allowOverwrite: false,
          contentType: fileTypes.find((type) => request.is(type)),
        });
      } else {
        const directory = uploadDirectory();
        await mkdir(directory, { recursive: true });
        await writeFile(resolve(directory, filename), request.body, { flag: 'wx', mode: 0o640 });
      }
      response.status(201).json({ url: `/uploads/${filename}` });
    },
  );
  return router;
}

async function getFavoriteIds(userId: string) {
  const favorites = await prisma.favorite.findMany({
    where: { userId },
    select: { stationId: true },
    orderBy: { createdAt: 'desc' },
  });
  return favorites.map(({ stationId }) => stationId);
}

export function userRouter() {
  const router = Router();

  router.patch('/me', async (request, response) => {
    const user = requireUser(request);
    const profile = z.object({ name: nameField, phone: phoneField }).parse(request.body);
    const updated = await prisma.user.update({ where: { id: user.id }, data: profile, select: publicUserSelect });
    response.json({ user: updated });
  });

  router.get('/favorites', async (request, response) => {
    const user = requireRole(request, 'OWNER');
    response.json({ stationIds: await getFavoriteIds(user.id) });
  });

  router.post('/favorites/:stationId', async (request, response) => {
    const user = requireRole(request, 'OWNER');
    const stationId = request.params.stationId;
    const station = await prisma.chargingStation.findFirst({
      where: { id: stationId, status: 'APPROVED', host: { status: 'ACTIVE' } },
      select: { id: true },
    });
    if (!station) fail(404, 'Charging station was not found.');
    await prisma.favorite.createMany({ data: [{ userId: user.id, stationId }], skipDuplicates: true });
    response.json({ stationIds: await getFavoriteIds(user.id) });
  });

  router.delete('/favorites/:stationId', async (request, response) => {
    const user = requireRole(request, 'OWNER');
    await prisma.favorite.deleteMany({ where: { userId: user.id, stationId: request.params.stationId } });
    response.json({ stationIds: await getFavoriteIds(user.id) });
  });

  return router;
}

export async function materializeUpcomingReminders(userId?: string) {
  const now = new Date();
  const upcoming = await prisma.booking.findMany({
    where: {
      status: 'CONFIRMED',
      start: { gt: now, lte: new Date(now.getTime() + notificationWindow) },
      notifications: { none: { kind: 'UPCOMING_SESSION' } },
      ...(userId ? { OR: [{ ownerId: userId }, { hostId: userId }] } : {}),
    },
    select: { id: true, ownerId: true, hostId: true, station: { select: { name: true } } },
    orderBy: { start: 'asc' },
    take: 250,
  });
  if (!upcoming.length) return;
  await prisma.notification.createMany({
    data: upcoming.flatMap((booking) => [booking.ownerId, booking.hostId].map((person) => ({
      userId: person,
      bookingId: booking.id,
      kind: 'UPCOMING_SESSION',
      title: 'Charging session in the next 24 hours',
      message: `Check the time of the upcoming reservation at ${booking.station.name}.`,
    }))),
    skipDuplicates: true,
  });
}

export function notificationRouter() {
  const router = Router();

  router.get('/', async (request, response) => {
    const user = requireUser(request);
    await materializeUpcomingReminders(user.id);
    const notifications = await prisma.notification.findMany({
      where: { userId: user.id },
      select: {
        id: true, title: true, message: true, createdAt: true, readAt: true, kind: true, bookingId: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 60,
    });
    response.json({ notifications });
  });

  router.patch('/read-all', async (request, response) => {
    const user = requireUser(request);
    await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
    response.json({ ok: true });
  });

  router.patch('/:id/read', async (request, response) => {
    const user = requireUser(request);
    const record = await prisma.notification.findFirst({
      where: { id: request.params.id, userId: user.id }, select: { id: true },
    });
    if (!record) fail(404, 'Notification was not found.');
    await prisma.notification.updateMany({
      where: { id: record.id, userId: user.id, readAt: null }, data: { readAt: new Date() },
    });
    response.json({ ok: true });
  });

  return router;
}

export function supportRouter() {
  const router = Router();

  router.post('/', abuseLimit(10, 'Too many support messages. Try again later.'), async (request, response) => {
    const fields = z.object({
      name: nameField,
      email: emailField,
      subject: z.string().trim().min(3).max(160),
      message: z.string().trim().min(10).max(3000),
    }).parse(request.body);
    const entry = await prisma.supportRequest.create({ data: fields, select: { id: true } });
    response.status(201).json(entry);
  });

  return router;
}

export function adminSupportRouter() {
  const router = Router();
  const statusField = z.enum(['OPEN', 'RESOLVED']);

  router.get('/', async (request, response) => {
    requireRole(request, 'ADMIN');
    const { status, page } = z.object({
      status: statusField.optional(),
      page: z.coerce.number().int().min(1).max(500).default(1),
    }).parse(request.query);
    const pageSize = 30;
    const where = status ? { status } : {};
    const [requests, total] = await prisma.$transaction([
      prisma.supportRequest.findMany({
        where, orderBy: { createdAt: 'desc' }, take: pageSize, skip: (page - 1) * pageSize,
      }),
      prisma.supportRequest.count({ where }),
    ]);
    response.json({ requests, total, page, pageSize });
  });

  router.patch('/:id', async (request, response) => {
    const admin = requireRole(request, 'ADMIN');
    const { status } = z.object({ status: statusField }).parse(request.body);
    const id = request.params.id;
    const entry = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "SupportRequest" WHERE id = ${id} FOR UPDATE`;
      const current = await transaction.supportRequest.findUnique({ where: { id } });
      if (!current) fail(404, 'Support request was not found.');
      if (current.status === status) return current;
      const updated = await transaction.supportRequest.update({ where: { id }, data: { status } });
      await transaction.adminAction.create({
        data: {
          adminId: admin.id, action: `SUPPORT_${status}`, targetType: 'SUPPORT_REQUEST', targetId: id,
        },
      });
      return updated;
    });
    response.json({ request: entry });
  });

  return router;
}
