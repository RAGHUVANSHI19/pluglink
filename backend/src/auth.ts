import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { Router, type Request, type RequestHandler, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { configuredAppOrigin } from './deployment-origin.js';
import { fail, prisma, type AuthUser } from './shared.js';

const sessionLifetime = 7 * 24 * 60 * 60 * 1000;
const resetLifetime = 30 * 60 * 1000;
const tokenPattern = /^[a-f0-9]{64}$/;
const dummyPasswordHash = '$2b$12$uOQnYnRQ.FWG3lE/hVoXpe7RKK42OcDAONzA86i9L/DfnAf7Xf9lK';
const sessionCookie = 'pluglink_session';
export const nameField = z.string().trim().min(2).max(100);
export const emailField = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
export const phoneField = z.string().trim().regex(/^[+]?[0-9][0-9 ()-]{7,19}$/, 'Enter a valid contact number.');
const passwordField = z.string().min(8, 'Use at least 8 characters.').max(72).refine(
  (value) => Buffer.byteLength(value, 'utf8') <= 72,
  'Use a password of at most 72 bytes.',
);

const registerSchema = z.object({
  name: nameField,
  email: emailField,
  phone: phoneField,
  password: passwordField,
  confirmPassword: z.string().max(72),
  role: z.enum(['OWNER', 'HOST']),
}).refine((value) => value.password === value.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Passwords must match.',
});

const resetSchema = z.object({
  token: z.string().regex(tokenPattern, 'Enter a valid reset token.'),
  password: passwordField,
  confirmPassword: z.string().max(72),
}).refine((value) => value.password === value.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Passwords must match.',
});

const publicUserSelect = {
  id: true, name: true, email: true, phone: true, role: true,
} satisfies Prisma.UserSelect;

export { publicUserSelect };

function tokenDigest(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
}

function readSessionToken(request: Request): string | undefined {
  const token: unknown = request.cookies?.[sessionCookie];
  return typeof token === 'string' && tokenPattern.test(token) ? token : undefined;
}

async function startSession(request: Request, response: Response, user: AuthUser, verifiedHash: string) {
  const previousToken = readSessionToken(request);
  const token = randomBytes(32).toString('hex');
  await prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
    const current = await transaction.user.findUnique({
      where: { id: user.id }, select: { passwordHash: true, status: true },
    });
    if (!current || current.passwordHash !== verifiedHash) fail(401, 'Email or password is incorrect.');
    if (current.status !== 'ACTIVE') fail(403, 'This account is suspended. Contact PlugLink support.');
    if (previousToken) {
      await transaction.session.deleteMany({ where: { tokenHash: tokenDigest(previousToken) } });
    }
    await transaction.session.deleteMany({ where: { userId: user.id, expiresAt: { lte: new Date() } } });
    await transaction.session.create({
      data: { userId: user.id, tokenHash: tokenDigest(token), expiresAt: new Date(Date.now() + sessionLifetime) },
    });
  });
  response.cookie(sessionCookie, token, { ...cookieOptions(), maxAge: sessionLifetime });
}

export const loadSession: RequestHandler = async (request, _response, next) => {
  const token = readSessionToken(request);
  if (token) {
    const session = await prisma.session.findUnique({
      where: { tokenHash: tokenDigest(token) },
      select: { expiresAt: true, user: { select: { ...publicUserSelect, status: true } } },
    });
    if (session && session.expiresAt > new Date()) {
      const { status, ...user } = session.user;
      if (status === 'ACTIVE') request.auth = user;
    }
  }
  next();
};

function resetEmailSettings() {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESET_FROM_EMAIL;
  const origin = configuredAppOrigin()?.split(',')[0]?.trim();
  return key && from && origin ? { key, from, origin } : undefined;
}

async function sendResetMail(email: string, token: string, settings: NonNullable<ReturnType<typeof resetEmailSettings>>) {
  const url = new URL('/reset-password', settings.origin);
  url.searchParams.set('token', token);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${settings.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: settings.from,
        to: [email],
        subject: 'Reset your PlugLink password',
        text: `To reset your PlugLink password, open ${url.href}\n\nThis link expires in 30 minutes. You can ignore this message if you did not request a reset.`,
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) console.warn('PlugLink password reset email failed with status', response.status);
  } catch {
    console.warn('PlugLink password reset email service was unavailable.');
  }
}

export function authRouter() {
  const router = Router();
  const authLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: process.env.NODE_ENV === 'test' ? 500 : 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Too many authentication attempts. Try again in 15 minutes.' },
  });

  router.get('/me', (request, response) => {
    response.json({ user: request.auth ?? null });
  });

  router.post('/register', authLimit, async (request, response) => {
    const { name, email, phone, password, role } = registerSchema.parse(request.body);
    const passwordHash = await bcrypt.hash(password, 12);
    try {
      const user = await prisma.user.create({ data: { name, email, phone, role, passwordHash }, select: publicUserSelect });
      await startSession(request, response, user, passwordHash);
      response.status(201).json({ user });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        fail(409, 'That email is already registered.');
      }
      throw error;
    }
  });

  router.post('/login', authLimit, async (request, response) => {
    const { email, password } = z.object({ email: emailField, password: z.string().min(1).max(72) }).parse(request.body);
    if (Buffer.byteLength(password, 'utf8') > 72) fail(401, 'Email or password is incorrect.');
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { ...publicUserSelect, passwordHash: true },
    });
    const matches = await bcrypt.compare(password, existing?.passwordHash ?? dummyPasswordHash);
    if (!existing || !matches) fail(401, 'Email or password is incorrect.');
    const { id, name, phone, role } = existing;
    const user = { id, name, email, phone, role };
    await startSession(request, response, user, existing.passwordHash);
    response.json({ user });
  });

  router.post('/logout', async (request, response) => {
    const token = readSessionToken(request);
    if (token) await prisma.session.deleteMany({ where: { tokenHash: tokenDigest(token) } });
    response.clearCookie(sessionCookie, cookieOptions());
    response.json({ user: null });
  });

  router.post('/forgot', authLimit, async (request, response) => {
    const { email } = z.object({ email: emailField }).parse(request.body);
    const message = 'If password recovery is available for this account, you will receive reset instructions.';
    const demo = process.env.NODE_ENV !== 'production' && process.env.AUTH_ALLOW_DEMO_RESET !== 'false';
    const settings = resetEmailSettings();
    if (!demo && !settings) {
      response.json({ message });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, status: true } });
    if (!user || user.status !== 'ACTIVE') {
      response.json({ message });
      return;
    }

    const token = randomBytes(32).toString('hex');
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: tokenDigest(token), expiresAt: new Date(Date.now() + resetLifetime) },
    });
    if (settings) {
      void sendResetMail(email, token, settings);
      response.json({ message });
      return;
    }
    response.json({ message, developmentResetToken: token });
  });

  router.post('/reset', authLimit, async (request, response) => {
    const { token, password } = resetSchema.parse(request.body);
    const tokenHash = tokenDigest(token);
    const reset = await prisma.passwordResetToken.findUnique({
      where: { tokenHash }, select: { id: true, userId: true, usedAt: true, expiresAt: true },
    });
    if (!reset || reset.usedAt || reset.expiresAt <= new Date()) fail(400, 'This reset link has expired or was already used.');
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "User" WHERE id = ${reset.userId} FOR UPDATE`;
      const now = new Date();
      const consumed = await transaction.passwordResetToken.updateMany({
        where: { id: reset.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now },
      });
      if (!consumed.count) fail(400, 'This reset link has expired or was already used.');
      await transaction.user.update({ where: { id: reset.userId }, data: { passwordHash } });
      await transaction.passwordResetToken.deleteMany({ where: { userId: reset.userId, id: { not: reset.id } } });
      await transaction.session.deleteMany({ where: { userId: reset.userId } });
    });
    response.clearCookie(sessionCookie, cookieOptions());
    response.json({ message: 'Password reset. Sign in with your new password.' });
  });

  return router;
}
