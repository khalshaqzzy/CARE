import {
  AccountKind,
  HandlerType,
  PrismaClient,
  Severity,
  VoiceEventType,
  VoiceStatus,
} from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PolicyService, type Principal } from '../../src/auth/policy.service';
import { VoicesService } from '../../src/voices/voices.service';

const prisma = new PrismaClient();
const policy = new PolicyService(prisma as never);
const voices = new VoicesService(prisma as never, {} as never, {} as never, policy);

let reporter: Principal;
let unitId: string;
let sourceRow = 0;
let seq = 0;

async function seedVoice(status: VoiceStatus = VoiceStatus.OPEN) {
  seq += 1;
  return prisma.voice.create({
    data: {
      displayId: `CARE-202608-${String(seq).padStart(6, '0')}`,
      reporterId: reporter.accountId,
      visibility: 'GENERAL',
      area: 'KARAWANG_1',
      reporterNoRegSnapshot: '000001',
      reporterNameSnapshot: 'Reporter',
      reporterDivisionSnapshot: 'Division A',
      reporterDepartmentSnapshot: 'Department A',
      reporterOrganizationUnitId: unitId,
      routeOwnerId: reporter.accountId,
      status,
      handlerType: HandlerType.MANAGER,
      locationDetail: 'line',
      title: 'pagination voice',
      detail: 'detail',
      severity: Severity.MEDIUM,
      categoryKey: null,
      anonymousAlias: `R-${seq}`,
      version: 1,
    },
  });
}

async function seedEvents(voiceId: string, count: number) {
  for (let index = 0; index < count; index += 1)
    await prisma.voiceEvent.create({
      data: {
        voiceId,
        actorId: reporter.accountId,
        actorAccountKind: AccountKind.WORKFORCE,
        actorCapabilities: [],
        type: VoiceEventType.MESSAGE_SENT,
        payload: { n: index },
        occurredAt: new Date(Date.now() + index * 1000),
      },
    });
}

async function seedMessages(voiceId: string, count: number) {
  const conversation = await prisma.conversation.create({ data: { voiceId } });
  for (let index = 0; index < count; index += 1)
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: reporter.accountId,
        senderAccountKind: AccountKind.WORKFORCE,
        senderCapabilities: [],
        text: `msg-${index}`,
        createdAt: new Date(Date.now() + index * 1000),
      },
    });
}

describe('Voice timeline and messages cursor pagination', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "UserAccount", "Employee", "OrganizationSnapshot", "OrganizationUnit", "OrganizationMembership" CASCADE',
    );
    const snapshot = await prisma.organizationSnapshot.create({
      data: { status: 'ACTIVE', checksum: 'c'.repeat(64), rowCount: 1, effectiveAt: new Date() },
    });
    const unit = await prisma.organizationUnit.create({
      data: { directorate: 'Manufacturing', division: 'Division A', department: 'Department A' },
    });
    unitId = unit.id;
    const employee = await prisma.employee.create({ data: { noReg: '000001', name: 'Reporter' } });
    const account = await prisma.userAccount.create({
      data: {
        username: 'workforce-000001',
        displayName: 'Reporter',
        passwordHash: 'test',
        accountKind: AccountKind.WORKFORCE,
        passwordChangeRequired: false,
        employeeId: employee.id,
      },
    });
    await prisma.organizationMembership.create({
      data: {
        snapshotId: snapshot.id,
        employeeId: employee.id,
        organizationUnitId: unit.id,
        employeeName: 'Reporter',
        structuralPosition: 'Member',
        section: 'Section A',
        sourceRow: (sourceRow += 1),
      },
    });
    reporter = await policy.resolvePrincipal(account, {
      id: crypto.randomUUID(),
      passwordRestricted: false,
    });
  });
  afterAll(async () => prisma.$disconnect());

  it('pages the timeline forward (asc) and emits a stable nextCursor', async () => {
    const voice = await seedVoice();
    await seedEvents(voice.id, 7);
    const first = await voices.timeline(reporter, voice.id, { limit: '3', order: 'asc' });
    expect(first.items.map((event) => event.payload)).toEqual([{ n: 0 }, { n: 1 }, { n: 2 }]);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await voices.timeline(reporter, voice.id, {
      limit: '3',
      order: 'asc',
      cursor: first.nextCursor!,
    });
    expect(second.items.map((event) => event.payload)).toEqual([{ n: 3 }, { n: 4 }, { n: 5 }]);
    const third = await voices.timeline(reporter, voice.id, {
      limit: '3',
      order: 'asc',
      cursor: second.nextCursor!,
    });
    expect(third.items.map((event) => event.payload)).toEqual([{ n: 6 }]);
    expect(third.nextCursor).toBeNull();
  });

  it('returns the most recent events first with order=desc', async () => {
    const voice = await seedVoice();
    await seedEvents(voice.id, 4);
    const page = await voices.timeline(reporter, voice.id, { limit: '10', order: 'desc' });
    expect(page.items.map((event) => event.payload)).toEqual([
      { n: 3 },
      { n: 2 },
      { n: 1 },
      { n: 0 },
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it('pages messages newest-first with order=desc and honors limit', async () => {
    const voice = await seedVoice(VoiceStatus.IN_VERIFICATION);
    await seedMessages(voice.id, 6);
    const first = await voices.messages(reporter, voice.id, { limit: '4', order: 'desc' });
    expect(first.items.map((message) => message.text)).toEqual([
      'msg-5',
      'msg-4',
      'msg-3',
      'msg-2',
    ]);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await voices.messages(reporter, voice.id, {
      limit: '4',
      order: 'desc',
      cursor: first.nextCursor!,
    });
    expect(second.items.map((message) => message.text)).toEqual(['msg-1', 'msg-0']);
    expect(second.nextCursor).toBeNull();
  });
});
