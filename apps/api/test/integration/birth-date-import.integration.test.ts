import { AccountKind, PrismaClient } from '@prisma/client';
import { hash } from 'argon2';
import { afterAll, describe, expect, it } from 'vitest';
import {
  ImportsService,
  ORGANIZATION_HEADERS,
  ORGANIZATION_BIRTH_DATE_HEADERS,
} from '../../src/imports/imports.service';
import { PolicyService } from '../../src/auth/policy.service';
const db = new PrismaClient();
const imports = new ImportsService(db as never);
afterAll(async () => {
  await db.$disconnect();
});
describe('DOB snapshot compatibility', () => {
  it('updates dates, preserves passwords, retains omitted DOB and clears explicit blanks', async () => {
    const account = await db.userAccount.create({
      data: {
        username: `dob-admin-${crypto.randomUUID().slice(0, 8)}`,
        displayName: 'Synthetic Admin',
        passwordHash: await hash('test-only-password'),
        accountKind: AccountKind.CARE_ADMIN,
      },
    });
    const actor = await new PolicyService(db as never).resolvePrincipal(account, {
      id: crypto.randomUUID(),
      passwordRestricted: false,
    });
    const row = [
      '00881234',
      'Synthetic Member',
      'Team Member',
      'Manufacturing',
      'DOB Division',
      'DOB Department',
      '',
    ];
    async function apply(date: string | undefined) {
      const headers = date === undefined ? ORGANIZATION_HEADERS : ORGANIZATION_BIRTH_DATE_HEADERS;
      const rows =
        date === undefined
          ? [row, ['TM881234', ...row.slice(1)]]
          : [
              [...row.slice(0, 3), date, ...row.slice(3)],
              ['TM881234', ...row.slice(1, 3), '', ...row.slice(3)],
            ];
      const buffer = Buffer.from(
        headers.join(',') + '\n' + rows.map((values) => values.join(',')).join('\n'),
      );
      const preview = await imports.preview(actor, {
        originalname: 'synthetic.csv',
        buffer,
        size: buffer.length,
        mimetype: 'text/csv',
      } as Express.Multer.File);
      await imports.confirm(
        actor,
        preview.id,
        { checksum: preview.checksum, expectedVersion: preview.version },
        crypto.randomUUID(),
      );
      await expect
        .poll(
          async () =>
            (await db.importBatch.findUniqueOrThrow({ where: { id: preview.id } })).status,
          { timeout: 20000 },
        )
        .toBe('CONFIRMED');
      return preview;
    }
    const first = await apply('1990-02-28');
    expect(first.summary).toMatchObject({
      birthDates: { available: 1, missing: 1, ageAnomalies: 0 },
    });
    const user = await db.userAccount.findUniqueOrThrow({ where: { username: row[0] } });
    const changedHash = await hash('personal-password');
    await db.userAccount.update({
      where: { id: user.id },
      data: { passwordHash: changedHash, passwordChangeRequired: false },
    });
    const update = await apply('1991-03-01');
    expect(update.summary).toMatchObject({ update: 1 });
    await apply(undefined);
    expect(
      (await db.employee.findUniqueOrThrow({ where: { noReg: row[0] } })).birthDate
        ?.toISOString()
        .slice(0, 10),
    ).toBe('1991-03-01');
    expect(await db.userAccount.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      passwordHash: changedHash,
      passwordChangeRequired: false,
    });
    const tm = await db.userAccount.findUniqueOrThrow({ where: { username: 'tm881234' } });
    expect(
      (
        await new PolicyService(db as never).resolvePrincipal(tm, {
          id: crypto.randomUUID(),
          passwordRestricted: false,
        })
      ).capabilities,
    ).toEqual(['MEMBER']);
    await apply('');
    expect(
      (await db.employee.findUniqueOrThrow({ where: { noReg: row[0] } })).birthDate,
    ).toBeNull();
  });
});
