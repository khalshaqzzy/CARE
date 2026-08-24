import { describe, expect, it } from 'vitest';
import { Role, VoiceVisibility } from '@prisma/client';
import { VoicesService } from '../../src/voices/voices.service';

describe('Private Voice response boundary', () => {
  it('scopes Union access to the immutable route owner relationship', async () => {
    const service = Object.create(VoicesService.prototype) as any;
    await expect(
      service.scope({ accountId: 'union-route-owner', role: Role.UNION }),
    ).resolves.toEqual({
      visibility: VoiceVisibility.PRIVATE,
      routeOwnerId: 'union-route-owner',
    });
  });
  it('does not serialize reporter identity to Union or Admin audiences', () => {
    const service = Object.create(VoicesService.prototype) as any;
    const response = service.serialize(
      { accountId: 'union', role: Role.UNION },
      {
        id: 'voice',
        displayId: 'CARE-202608-000001',
        visibility: VoiceVisibility.PRIVATE,
        area: 'KARAWANG_1',
        locationDetail: 'line',
        title: 'private',
        detail: 'detail',
        category: null,
        severity: 'HIGH',
        status: 'OPEN',
        version: 1,
        currentHandlerId: null,
        reporterId: 'reporter-secret',
        anonymousAlias: 'Anonymous-X',
        reporter: {
          employee: {
            noReg: 'SECRET',
            name: 'Secret Name',
            division: 'Secret Division',
            department: 'Secret Department',
          },
        },
      },
    );
    const json = JSON.stringify(response);
    expect(response.audience).toBe('PRIVATE_RESPONDER');
    expect(json).toContain('Anonymous-X');
    for (const value of [
      'reporter-secret',
      'SECRET',
      'Secret Name',
      'Secret Division',
      'Secret Department',
    ])
      expect(json).not.toContain(value);
  });
});
