import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

declare global {
  // eslint-disable-next-line no-var
  var __beyondWallsPrisma: PrismaClient | undefined;
}

export const prisma =
  global.__beyondWallsPrisma ??
  new PrismaClient({
    log: env.isProduction ? ['error'] : ['error', 'warn'],
  });

if (!env.isProduction) {
  global.__beyondWallsPrisma = prisma;
}

export default prisma;
