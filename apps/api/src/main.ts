import 'reflect-metadata';
import { createApp } from './bootstrap';
import { loadConfig } from './config';

async function main() {
  const app = await createApp();
  await app.listen(loadConfig().PORT, '0.0.0.0');
}
void main();
