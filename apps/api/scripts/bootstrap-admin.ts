import { PrismaClient, Role } from '@prisma/client';
import { hash } from 'argon2';
import { loadLocalEnv } from '../src/load-local-env';

loadLocalEnv();

async function main() {
  const username = process.env.CARE_ADMIN_USERNAME?.trim();
  const password = process.env.CARE_ADMIN_PASSWORD;
  if (!username || !password || password.length < 12 || password === username)
    throw new Error(
      'CARE_ADMIN_USERNAME and a distinct 12+ character CARE_ADMIN_PASSWORD are required',
    );
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.userAccount.findUnique({ where: { username } });
    if (!existing)
      await prisma.userAccount.create({
        data: {
          username,
          displayName: 'CARE Admin',
          role: Role.CARE_ADMIN,
          passwordHash: await hash(password),
          passwordChangeRequired: false,
        },
      });
    else if (existing.role !== Role.CARE_ADMIN)
      throw new Error('Bootstrap username belongs to a non-admin account');
    process.stdout.write('CARE Admin bootstrap completed\n');
  } finally {
    await prisma.$disconnect();
  }
}
void main();
