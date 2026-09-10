import { expect, test } from '@playwright/test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { PrismaClient as PrismaClientType } from '../apps/api/node_modules/@prisma/client';
import { chooseBirthDate, enterIdentifier } from './helpers/auth-recovery';
const requireApi = createRequire(resolve('apps/api/package.json'));
const { PrismaClient } = requireApi('@prisma/client') as { PrismaClient: typeof PrismaClientType };
const { hash } = requireApi('argon2') as typeof import('../apps/api/node_modules/argon2');
test.skip(process.env.FULLSTACK_E2E !== '1', 'Requires isolated fullstack database');
test('real password recovery returns to registration-first login and changes the default credential', async ({
  page,
}) => {
  const db = new PrismaClient();
  const noReg = '00998877';
  const employee = await db.employee.create({
    data: { noReg, name: 'Synthetic Recovery Member', birthDate: new Date('1990-02-28T00:00:00Z') },
  });
  const account = await db.userAccount.create({
    data: {
      employeeId: employee.id,
      username: noReg,
      displayName: 'Synthetic Recovery Member',
      passwordHash: await hash('old-personal-password'),
      passwordChangeRequired: false,
      accountKind: 'WORKFORCE',
    },
  });
  try {
    await page.goto('/login');
    await enterIdentifier(page, noReg);
    await page.getByRole('link', { name: 'Lupa Password?' }).click();
    await page.getByRole('button', { name: 'Lanjutkan' }).click();
    await chooseBirthDate(page);
    await page.getByRole('button', { name: 'Reset password', exact: true }).click();
    await expect(
      page.getByText('Password anda sudah direset, silahkan login kembali.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Lanjutkan' }).click();
    await expect(page.getByLabel('Password saat ini')).toHaveCount(0);
    await page.getByLabel(/^Password baru/).fill('new-personal-password');
    await page.getByLabel('Konfirmasi password baru').fill('new-personal-password');
    await page.getByRole('button', { name: 'Simpan password' }).click();
    await expect
      .poll(
        async () =>
          (await db.userAccount.findUniqueOrThrow({ where: { id: account.id } }))
            .passwordChangeRequired,
      )
      .toBe(false);
  } finally {
    await db.session.deleteMany({ where: { accountId: account.id } });
    await db.userAccount.delete({ where: { id: account.id } });
    await db.employee.delete({ where: { id: employee.id } });
    await db.$disconnect();
  }
});
