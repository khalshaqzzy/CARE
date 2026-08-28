import createClient from 'openapi-fetch';
import type { paths } from './generated.js';

export type { components, operations, paths } from './generated.js';
export const createCareClient = (baseUrl: string) =>
  createClient<paths>({ baseUrl, credentials: 'include' });
