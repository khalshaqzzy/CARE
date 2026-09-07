import 'reflect-metadata';
import { loadConfig } from './config';
import { createApp } from './bootstrap';

async function main() {
  const app = await createApp();
  await app.listen(loadConfig().PORT, '0.0.0.0');
}
void main();
