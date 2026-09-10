import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expectedCaptureScenarios } from './capture-contract.mjs';
import { mergeGalleries } from './gallery.mjs';
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: merge-captures <input> <output>');
const folders = (await readdir(input, { withFileTypes: true }))
  .filter((item) => item.isDirectory())
  .map((item) => join(input, item.name));
await mergeGalleries(folders, output, expectedCaptureScenarios);
