import { requireSuccess } from './plan.mjs';
const needs = JSON.parse(process.env.RESULTS ?? '{}');
requireSuccess(Object.fromEntries(Object.entries(needs).map(([name, job]) => [name, job.result])));
