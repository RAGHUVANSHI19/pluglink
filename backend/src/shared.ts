import { PrismaClient } from '@prisma/client';
import type { Request } from 'express';

export const prisma = new PrismaClient();

export type Role = 'OWNER' | 'HOST' | 'ADMIN';
export type AuthUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
};

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthUser;
  }
}

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}

export function requireUser(request: Request): AuthUser {
  if (!request.auth) fail(401, 'Sign in to continue.');
  return request.auth;
}

export function requireRole(request: Request, ...roles: Role[]): AuthUser {
  const user = requireUser(request);
  if (!roles.includes(user.role)) fail(403, 'This account does not have access to that action.');
  return user;
}
