import 'dotenv/config';
import { parseArgs } from 'node:util';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { emailField, nameField, phoneField } from './auth.js';
import { prisma } from './shared.js';

const identity = z.object({ email: emailField, name: nameField, phone: phoneField });

async function readPassword() {
  if (process.stdin.isTTY) throw new Error('Pipe the administrator password to standard input.');
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 256) throw new Error('Provide one password of at most 72 bytes.');
    chunks.push(buffer);
  }
  const password = Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72 || /[\r\n\0]/.test(password)) {
    throw new Error('Use an administrator password with at least 12 characters and at most 72 bytes.');
  }
  return password;
}

async function provision() {
  const { values } = parseArgs({
    options: { email: { type: 'string' }, name: { type: 'string' }, phone: { type: 'string' } },
  });
  const fields = identity.safeParse(values);
  if (!fields.success) throw new Error('Provide a valid --email, --name, and --phone.');

  const existing = await prisma.user.findUnique({
    where: { email: fields.data.email }, select: { role: true, status: true },
  });
  if (existing) {
    if (existing.role === 'ADMIN' && existing.status === 'ACTIVE') {
      process.stdout.write('An active administrator already exists for that email.\n');
      return;
    }
    throw new Error('That email belongs to an existing account. Use a distinct administrator email.');
  }

  const passwordHash = await bcrypt.hash(await readPassword(), 12);
  try {
    await prisma.user.create({
      data: { ...fields.data, role: 'ADMIN', passwordHash },
      select: { id: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new Error('That email was registered concurrently. Check the account before retrying.');
    }
    throw error;
  }
  process.stdout.write('Administrator created.\n');
}

try {
  await provision();
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientInitializationError) {
    console.error('The database could not provision the administrator. Check the connection and migrations.');
  } else {
    console.error(error instanceof Error ? error.message : 'Administrator provisioning failed.');
  }
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
