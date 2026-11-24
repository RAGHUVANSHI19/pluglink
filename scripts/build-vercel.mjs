import { access, cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeFileTrace } from '@vercel/nft';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(root, '.vercel/output');
const bundle = resolve(output, 'functions/pluglink-api.func');
const handler = 'backend/dist/vercel-handler.js';

const { fileList } = await nodeFileTrace([handler], { base: root, processCwd: root });
if (!fileList.has('node_modules/.prisma/client/index.js')) {
  throw new Error('The generated Prisma Client was not traced. Run the production build first.');
}

const vercelEngine = 'node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node';
await access(resolve(root, vercelEngine));
fileList.add(vercelEngine);
await rm(output, { recursive: true, force: true });
await mkdir(bundle, { recursive: true });
for (const path of fileList) {
  // A few dependencies trace optional project assets. Only package runtime code and dependencies.
  if (path !== 'package.json' && path !== 'backend/package.json' &&
      !path.startsWith('backend/dist/') && !path.startsWith('node_modules/')) continue;
  if (/libquery_engine-(?!rhel-openssl-3\.0\.x).*\.so\.node$/.test(path)) continue;
  const destination = resolve(bundle, path);
  await mkdir(dirname(destination), { recursive: true });
  await cp(resolve(root, path), destination, { dereference: true });
}

const writeJson = async (path, data) => writeFile(path, JSON.stringify(data, null, 2) + '\n');
await cp(resolve(root, 'frontend/dist'), resolve(output, 'static'), { recursive: true });
await writeJson(resolve(bundle, '.vc-config.json'), {
  runtime: 'nodejs22.x',
  handler,
  launcherType: 'Nodejs',
  shouldAddHelpers: false,
});
await writeJson(resolve(output, 'config.json'), {
  version: 3,
  routes: [
    {
      src: '/.*',
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'X-Frame-Options': 'DENY',
        'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
        'Content-Security-Policy': [
          "default-src 'self'",
          "base-uri 'self'",
          "object-src 'none'",
          "frame-ancestors 'none'",
          "script-src 'self' https://checkout.razorpay.com https://cdn.razorpay.com",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com",
          "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://*.razorpay.com",
          "frame-src 'self' https://*.razorpay.com",
          "connect-src 'self' https://*.razorpay.com",
        ].join('; '),
      },
      continue: true,
    },
    { src: '/(?:api|uploads)(?:/.*)?', dest: '/pluglink-api' },
    { handle: 'filesystem' },
    { src: '/[^.]*', methods: ['GET', 'HEAD'], dest: '/index.html' },
  ],
});
console.log('Packaged PlugLink for Vercel.');
