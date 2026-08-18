import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { normalizeEmail } from '../modules/users/email.util';

function readEmailArgument(): string {
  const emailFlag = process.argv.indexOf('--email');
  const email = emailFlag >= 0 ? process.argv[emailFlag + 1] : undefined;
  if (!email) throw new Error('Usage: pnpm admin:promote --email user@example.com');
  return normalizeEmail(email);
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    const user = await prisma.user.findUnique({
      where: { email: readEmailArgument() },
      select: { id: true },
    });
    if (!user) throw new Error('User not found');
    await prisma.user.update({
      where: { id: user.id },
      data: { role: 'ADMIN' },
    });
    process.stdout.write('User promoted to ADMIN successfully.\n');
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Admin promotion failed';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
