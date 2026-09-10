import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { rm } from 'node:fs/promises';
import {
  copyCapture,
  writeGallery,
  persistLocalGallery,
} from '../../scripts/validation/gallery.mjs';

export default class CaptureReporter implements Reporter {
  private tests: TestCase[] = [];
  private config!: FullConfig;
  private results = new Map<string, TestResult>();
  onBegin(config: FullConfig, suite: Suite) {
    this.config = config;
    this.tests = suite.allTests().filter((item) => item.parent.project()?.name === 'visual');
  }
  onTestEnd(test: TestCase, result: TestResult) {
    this.results.set(test.id, result);
  }
  async onEnd(result: FullResult): Promise<void | { status: FullResult['status'] }> {
    if (!this.tests.length) return;
    const directory = resolve('visual-output');
    await rm(directory, { force: true, recursive: true });
    const scenarios = [];
    for (const test of this.tests) {
      const outcome = this.results.get(test.id);
      const images = [];
      for (const attachment of outcome?.attachments ?? []) {
        if (attachment.name.startsWith('capture:') && attachment.path) {
          images.push({
            ...(await copyCapture(attachment.path, directory, `${test.id}:${attachment.name}`)),
            name: attachment.name.slice('capture:'.length),
          });
        }
      }
      scenarios.push({
        id: test.id,
        title: test.titlePath().join(' › '),
        status: outcome?.status ?? 'missing',
        images,
        metadata: (outcome?.attachments ?? [])
          .filter((attachment) => attachment.name.startsWith('capture-meta:'))
          .map((attachment) => ({
            name: attachment.name,
            value: attachment.body?.toString('utf8') ?? '',
          })),
      });
    }
    await writeGallery(directory, {
      sha:
        process.env.GITHUB_SHA ??
        execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
      platform: `${process.platform}-${process.arch}`,
      browser: 'chromium',
      run: process.env.GITHUB_RUN_ID ?? 'local',
      attempt: process.env.GITHUB_RUN_ATTEMPT ?? '1',
      shard: this.config.shard,
      scenarios,
    });
    if (
      result.status === 'passed' &&
      scenarios.some((item) => item.status !== 'passed' || !item.images.length)
    )
      return { status: 'failed' };
    if (result.status === 'passed' && !process.env.CI) {
      await persistLocalGallery(
        directory,
        resolve('e2e/captures/local'),
        this.tests.length === 161,
      );
    }
  }
}
