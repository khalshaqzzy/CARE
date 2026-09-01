import { AccountKind, ImportStatus, PrismaClient } from '@prisma/client';
import { hash } from 'argon2';
import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AdminService } from '../../src/admin/admin.service';
import type { AuthActor } from '../../src/auth/auth.types';
import { PolicyService } from '../../src/auth/policy.service';
import { ImportsService } from '../../src/imports/imports.service';
import { AiRuntimeConfigService } from '../../src/ai/runtime-config.service';
import { AiService } from '../../src/ai/ai.service';

const prisma = new PrismaClient();
const policy = new PolicyService(prisma as never);
const adminService = new AdminService(prisma as never, policy);
const aiRuntime = new AiRuntimeConfigService(prisma as never);
const aiAdminService = new AdminService(prisma as never, policy, aiRuntime, {} as AiService);
const imports = new ImportsService(prisma as never);
let admin: AuthActor;
let workforceId: string;

describe('Admin safety invariants', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "UserAccount", "Employee", "OrganizationSnapshot", "OrganizationUnit" CASCADE',
    );
    const passwordHash = await hash('admin-safety-test-password');
    const adminAccount = await prisma.userAccount.create({
      data: {
        username: 'admin-safety-admin',
        displayName: 'Admin Safety Admin',
        passwordHash,
        accountKind: AccountKind.CARE_ADMIN,
        passwordChangeRequired: false,
      },
    });
    const workforce = await prisma.userAccount.create({
      data: {
        username: 'admin-safety-workforce',
        displayName: 'Admin Safety Workforce',
        passwordHash,
        accountKind: AccountKind.WORKFORCE,
        passwordChangeRequired: false,
      },
    });
    workforceId = workforce.id;
    admin = await policy.resolvePrincipal(adminAccount, {
      id: crypto.randomUUID(),
      passwordRestricted: false,
    });
  });

  afterAll(async () => prisma.$disconnect());

  it('keeps password fields out of account reads and persisted reset replay data', async () => {
    await expect(adminService.resetPassword(admin, workforceId)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REQUIRED',
    });
    const [first, replay] = (await Promise.all([
      adminService.resetPassword(admin, workforceId, 'admin-safety-reset-key'),
      adminService.resetPassword(admin, workforceId, 'admin-safety-reset-key'),
    ])) as Array<Record<string, unknown>>;

    expect(first).toMatchObject({
      id: workforceId,
      username: 'admin-safety-workforce',
      temporaryPassword: 'admin-safety-workforce',
      passwordChangeRequired: true,
    });
    expect(replay).toEqual(first);
    const detail = (await adminService.accountDetail(workforceId)) as Record<string, unknown>;
    expect(detail).not.toHaveProperty('passwordHash');
    expect(detail).not.toHaveProperty('employeeId');
    expect(
      await prisma.auditEvent.count({
        where: { action: 'ACCOUNT_PASSWORD_RESET', resourceId: workforceId },
      }),
    ).toBe(1);
    const record = await prisma.idempotencyRecord.findUniqueOrThrow({
      where: {
        accountId_scope_key: {
          accountId: admin.accountId,
          scope: `admin:reset:${workforceId}`,
          key: 'admin-safety-reset-key',
        },
      },
    });
    expect(record.response).toEqual({ id: workforceId, passwordChangeRequired: true });
    expect(JSON.stringify(record.response)).not.toContain('admin-safety-workforce');
  });

  it('enforces optimistic account status updates and replays atomically', async () => {
    const body = { status: 'INACTIVE', reason: 'Admin safety integration', expectedVersion: 1 };
    const first = (await adminService.setAccountStatus(
      admin,
      workforceId,
      body,
      'admin-safety-status-key',
    )) as Record<string, unknown>;
    const replay = (await adminService.setAccountStatus(
      admin,
      workforceId,
      body,
      'admin-safety-status-key',
    )) as Record<string, unknown>;
    expect(first).toMatchObject({ status: 'INACTIVE', version: 2 });
    expect(replay).toEqual(JSON.parse(JSON.stringify(first)));
    expect(first).not.toHaveProperty('passwordHash');
    await expect(
      adminService.setAccountStatus(
        admin,
        workforceId,
        { status: 'ACTIVE', reason: 'Stale update', expectedVersion: 1 },
        'admin-safety-status-stale',
      ),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  });

  it('persists encrypted AI overrides, preserves the key, and resets to env', async () => {
    const apiKey = 'admin-ai-provider-secret-that-is-never-returned';
    const first = await aiAdminService.updateAiConfiguration(
      admin,
      {
        baseUrl: 'https://inference.example.test/v1',
        model: 'ibm-granite/granite-4.2-3b',
        apiKey,
        reasoningEffort: '',
        confidenceThreshold: 0.7,
        expectedVersion: null,
      },
      'admin-ai-create',
    );
    expect(first).toMatchObject({ source: 'ADMIN_OVERRIDE', version: 1, apiKeyConfigured: true });
    expect(JSON.stringify(first)).not.toContain(apiKey);
    const stored = await prisma.aiProviderConfiguration.findUniqueOrThrow({
      where: { id: 'openai' },
    });
    expect(stored.apiKeyCiphertext).not.toContain(apiKey);

    const updated = await aiAdminService.updateAiConfiguration(
      admin,
      {
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-v4-flash',
        reasoningEffort: 'high',
        confidenceThreshold: 0.8,
        expectedVersion: 1,
      },
      'admin-ai-update',
    );
    expect(updated).toMatchObject({ version: 2, reasoningEffort: 'high' });
    const preserved = await prisma.aiProviderConfiguration.findUniqueOrThrow({
      where: { id: 'openai' },
    });
    expect(preserved.apiKeyCiphertext).toBe(stored.apiKeyCiphertext);
    expect(preserved.apiKeyIv).toBe(stored.apiKeyIv);
    expect(preserved.apiKeyTag).toBe(stored.apiKeyTag);

    await expect(
      aiAdminService.updateAiConfiguration(
        admin,
        {
          baseUrl: 'https://api.deepseek.com',
          model: 'deepseek-v4-flash',
          reasoningEffort: 'none',
          confidenceThreshold: 0.8,
          expectedVersion: 1,
        },
        'admin-ai-stale',
      ),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });

    const reset = await aiAdminService.resetAiConfiguration(
      admin,
      { expectedVersion: 2 },
      'admin-ai-reset',
    );
    expect(reset).toMatchObject({ source: 'ENVIRONMENT', version: null });
    expect(await prisma.aiProviderConfiguration.count()).toBe(0);
    const auditText = JSON.stringify(
      await prisma.auditEvent.findMany({ where: { resourceId: 'openai' } }),
    );
    expect(auditText).not.toContain(apiKey);
    expect(auditText).not.toContain(stored.apiKeyCiphertext);
  });

  it('stores and cursor-paginates import changes outside the bounded summary', async () => {
    const batch = await prisma.importBatch.create({
      data: {
        actorId: admin.accountId,
        status: ImportStatus.PREVIEWED,
        checksum: 'a'.repeat(64),
        storageKey: 'imports/admin-safety.xlsx',
        summary: { rowCount: 3, createCount: 2, updateCount: 1 },
        errors: [],
        expiresAt: new Date(Date.now() + 60_000),
        changes: {
          create: [
            {
              sequence: 1,
              type: 'CREATE',
              noReg: '001',
              payload: { type: 'CREATE', noReg: '001' },
            },
            {
              sequence: 2,
              type: 'UPDATE',
              noReg: '002',
              payload: { type: 'UPDATE', noReg: '002' },
            },
            {
              sequence: 3,
              type: 'CREATE',
              noReg: '003',
              payload: { type: 'CREATE', noReg: '003' },
            },
          ],
        },
      },
    });

    const first = await imports.changes(batch.id, { limit: 2 });
    expect(first).toMatchObject({ total: 3 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await imports.changes(batch.id, { limit: 2, cursor: first.nextCursor! });
    expect(second.items).toEqual([{ type: 'CREATE', noReg: '003' }]);
    const detail = (await imports.detail(batch.id)) as Record<string, unknown>;
    expect(detail).not.toHaveProperty('storageKey');
    expect(detail.summary).not.toHaveProperty('changes');
  });

  it('serializes route assignment with account deactivation', async () => {
    const passwordHash = await hash('route-owner-race-password');
    const employee = await prisma.employee.create({
      data: { noReg: 'admin-safety-route-owner', name: 'Route Owner Race' },
    });
    const candidate = await prisma.userAccount.create({
      data: {
        employeeId: employee.id,
        username: 'admin-safety-route-owner',
        displayName: 'Route Owner Race',
        passwordHash,
        accountKind: AccountKind.WORKFORCE,
        passwordChangeRequired: false,
      },
    });
    const snapshot = await prisma.organizationSnapshot.create({
      data: { status: 'ACTIVE', checksum: 'b'.repeat(64), rowCount: 1 },
    });
    const unit = await prisma.organizationUnit.create({
      data: { directorate: 'Safety', division: 'Concurrency', department: 'Routing' },
    });
    await prisma.organizationMembership.create({
      data: {
        snapshotId: snapshot.id,
        employeeId: employee.id,
        organizationUnitId: unit.id,
        employeeName: employee.name,
        structuralPosition: 'Department Head',
        section: 'Management',
        sourceRow: 2,
      },
    });

    const results = await Promise.allSettled([
      adminService.setGlobalPic(admin, { noReg: employee.noReg }, 'admin-safety-route-race'),
      adminService.setAccountStatus(
        admin,
        candidate.id,
        { status: 'INACTIVE', reason: 'Concurrency invariant test', expectedVersion: 1 },
        'admin-safety-deactivation-race',
      ),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(
      await prisma.routeMapping.count({
        where: { effectiveTo: null, owner: { status: { not: 'ACTIVE' } } },
      }),
    ).toBe(0);
  });

  it('does not expire or delete a raw import after a concurrent queue transition', async () => {
    const storageKey = `imports/admin-safety-expiry-${crypto.randomUUID()}.xlsx`;
    const rawPath = resolve(process.env.MEDIA_ROOT!, storageKey);
    await mkdir(dirname(rawPath), { recursive: true });
    await writeFile(rawPath, 'raw import retained after queue transition');
    const batch = await prisma.importBatch.create({
      data: {
        actorId: admin.accountId,
        status: ImportStatus.PREVIEWED,
        checksum: 'c'.repeat(64),
        storageKey,
        summary: { rowCount: 1 },
        errors: [],
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    let releaseLock!: () => void;
    const release = new Promise<void>((resolveRelease) => {
      releaseLock = resolveRelease;
    });
    let announceLock!: () => void;
    const locked = new Promise<void>((resolveLocked) => {
      announceLock = resolveLocked;
    });
    const queueTransition = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`import-batch:${batch.id}`}, 0))::text AS lock`;
        announceLock();
        await release;
        await tx.importBatch.update({
          where: { id: batch.id },
          data: { status: ImportStatus.QUEUED, version: { increment: 1 } },
        });
      },
      { timeout: 10_000 },
    );

    await locked;
    const detail = imports.detail(batch.id);
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    releaseLock();
    await queueTransition;

    await expect(detail).resolves.toMatchObject({ status: ImportStatus.QUEUED });
    await expect(access(rawPath)).resolves.toBeUndefined();
    await unlink(rawPath);
  });
});
