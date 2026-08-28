import { careQueryKey, clearSessionBoundQueries, createCareQueryClient } from '../cache.js';

describe('session cache isolation', () => {
  it('purges every account namespace without touching public cache entries', () => {
    const client = createCareQueryClient();
    client.setQueryData(careQueryKey('session-a', 'voices'), ['voice-a']);
    client.setQueryData(careQueryKey('session-b', 'voices'), ['voice-b']);
    client.setQueryData(['public-reference'], ['reference']);

    clearSessionBoundQueries(client);

    expect(client.getQueryData(careQueryKey('session-a', 'voices'))).toBeUndefined();
    expect(client.getQueryData(careQueryKey('session-b', 'voices'))).toBeUndefined();
    expect(client.getQueryData(['public-reference'])).toEqual(['reference']);
  });
});
