import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Prisma } from '@prisma/client';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type ErrorRequestHandler, type Request } from 'express';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { authRouter, loadSession } from './auth.js';
import { configuredAppOrigin } from './deployment-origin.js';
import { domainRouter } from './domain.js';
import { adminSupportRouter, notificationRouter, supportRouter, hostedUploadReader, uploadDirectory, uploadRouter, userRouter } from './operations.js';
import { acceptPaymentWebhook, paymentRouter } from './payments.js';
import { fail, HttpError, prisma } from './shared.js';

const frontendDirectory = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
const frontendIndex = fileURLToPath(new URL('../../frontend/dist/index.html', import.meta.url));
const staticExtensions = /\.[a-z0-9]+$/i;
const imageName = /^\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.(?:jpg|png|webp)$/;
const mutation = ['POST', 'PATCH', 'PUT', 'DELETE'];

function configuration() {
  const production = process.env.NODE_ENV === 'production';
  const origins = (configuredAppOrigin() ?? (production ? '' : 'http://localhost:5173'))
    .split(',').map((origin) => origin.trim()).filter(Boolean)
    .map((origin) => {
      const url = new URL(origin);
      if ((production && url.protocol !== 'https:') || !['https:', 'http:'].includes(url.protocol) ||
          url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
        throw new Error('APP_ORIGIN must list explicit HTTP origins. Use HTTPS in production.');
      }
      return url.origin;
    });
  const proxyHops = Number(process.env.TRUST_PROXY ?? 0);
  if (!Number.isSafeInteger(proxyHops) || proxyHops < 0) throw new Error('TRUST_PROXY must be a non-negative hop count.');
  if (production && (!origins.length || !process.env.DATABASE_URL)) {
    throw new Error('APP_ORIGIN and DATABASE_URL are required in production.');
  }
  return { production, origins, proxyHops };
}

function originAllowed(request: Request, origin: string, config: ReturnType<typeof configuration>) {
  if (config.origins.includes(origin)) return true;
  if (config.production) return false;
  try {
    const url = new URL(origin);
    return ['https:', 'http:'].includes(url.protocol) && url.origin === origin && url.host === request.get('host');
  } catch {
    return false;
  }
}

const handleError: ErrorRequestHandler = (error: unknown, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }
  if (error instanceof HttpError) {
    response.status(error.status).json({ message: error.message });
    return;
  }
  if (error instanceof ZodError) {
    const errors = error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }));
    const first = errors[0];
    response.status(400).json({ message: first?.field ? `${first.field}: ${first.message}` : 'Check the submitted fields.', errors });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2025') {
      response.status(404).json({ message: 'The requested record was not found.' });
      return;
    }
    if (['P2002', 'P2003', 'P2034'].includes(error.code)) {
      response.status(409).json({ message: 'The record changed or conflicts with an existing record. Refresh and try again.' });
      return;
    }
  }
  const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
  const expected = new Map([
    [400, 'The request could not be read.'],
    [404, 'The requested resource was not found.'],
    [413, 'The request exceeds this deployment’s upload size limit.'],
    [415, 'The request uses an unsupported content type or encoding.'],
  ]);
  if (typeof status === 'number' && expected.has(status)) {
    response.status(status).json({ message: expected.get(status) });
    return;
  }
  if (process.env.NODE_ENV !== 'test') {
    console.error('PlugLink request failed', error instanceof Error ? error.name : 'UnknownError');
  }
  response.status(500).json({ message: 'Something went wrong. Try again or contact support.' });
};

export function createApp(
  { serveFrontend = true, uploadStorage = 'filesystem' }: {
    serveFrontend?: boolean;
    uploadStorage?: 'filesystem' | 'blob';
  } = {},
) {
  const config = configuration();
  const app = express();
  app.disable('x-powered-by');
  if (config.proxyHops) app.set('trust proxy', config.proxyHops);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://checkout.razorpay.com', 'https://cdn.razorpay.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://tile.openstreetmap.org', 'https://*.tile.openstreetmap.org', 'https://*.razorpay.com'],
        frameSrc: ["'self'", 'https://*.razorpay.com'],
        connectSrc: ["'self'", 'https://*.razorpay.com'],
        upgradeInsecureRequests: config.production ? [] : null,
      },
    },
    strictTransportSecurity: config.production,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  }));
  app.use((_request, response, next) => {
    response.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
    next();
  });

  app.use('/api', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.post('/api/payments/webhook', express.raw({ type: 'application/json', limit: '256kb', inflate: false }), acceptPaymentWebhook);

  app.use('/api', cors((request: Request, callback) => {
    const origin = request.get('origin');
    callback(null, { origin: origin && originAllowed(request, origin, config) ? origin : false, credentials: true });
  }));
  app.use('/api', (request, _response, next) => {
    const origin = request.get('origin');
    if (mutation.includes(request.method) &&
        (origin ? !originAllowed(request, origin, config) : request.get('sec-fetch-site') === 'cross-site')) {
      fail(403, 'This request must come from the PlugLink website.');
    }
    next();
  });

  app.get('/api/health', async (_request, response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      response.json({ status: 'ok', database: 'ok' });
    } catch {
      response.status(503).json({ status: 'unavailable', database: 'unavailable' });
    }
  });

  app.use('/api', express.json({ limit: '128kb', inflate: false }), cookieParser(), loadSession);
  app.use('/api/auth', authRouter());
  app.use('/api/users', userRouter());
  app.use('/api/notifications', notificationRouter());
  app.use('/api/support', supportRouter());
  app.use('/api/admin/support', adminSupportRouter());
  app.use('/api/uploads', uploadRouter(uploadStorage));
  app.use('/api/payments', paymentRouter());
  app.use('/api', domainRouter());
  app.use('/api', () => fail(404, 'The requested API endpoint was not found.'));

  app.use('/uploads', (request, _response, next) => {
    if (!imageName.test(request.path) || !['GET', 'HEAD'].includes(request.method)) {
      fail(404, 'The requested image was not found.');
    }
    next();
  }, uploadStorage === 'blob'
    ? hostedUploadReader
    : express.static(uploadDirectory(), { maxAge: '7d', immutable: true, index: false, fallthrough: false }));

  if (serveFrontend && (config.production || existsSync(frontendIndex))) {
    app.use(express.static(frontendDirectory, { maxAge: '1h', index: false }));
    app.get('/{*path}', (request, response) => {
      if (staticExtensions.test(request.path)) fail(404, 'The requested asset was not found.');
      response.setHeader('Cache-Control', 'no-cache');
      response.sendFile(frontendIndex);
    });
  }

  app.use(handleError);
  return app;
}
