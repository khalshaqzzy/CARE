import type { LoggerService } from '@nestjs/common';
import { loadConfig } from '../config';

export class SafeJsonLogger implements LoggerService {
  log(message: unknown, context?: string) {
    this.write('log', message, context);
  }
  error(message: unknown, _trace?: string, context?: string) {
    this.write('error', message, context);
  }
  warn(message: unknown, context?: string) {
    this.write('warn', message, context);
  }
  debug(message: unknown, context?: string) {
    this.write('debug', message, context);
  }
  verbose(message: unknown, context?: string) {
    this.write('verbose', message, context);
  }
  fatal(message: unknown, context?: string) {
    this.write('fatal', message, context);
  }
  private write(level: string, message: unknown, context?: string) {
    const record = {
      timestamp: new Date().toISOString(),
      level,
      service: 'care-api',
      release: loadConfig().RELEASE_SHA,
      context: context?.slice(0, 100),
      message: this.safeMessage(message),
    };
    const line = `${JSON.stringify(record)}\n`;
    if (level === 'error' || level === 'fatal') process.stderr.write(line);
    else process.stdout.write(line);
  }

  private safeMessage(value: unknown) {
    if (typeof value === 'string') return value.slice(0, 500);
    if (value instanceof Error) return value.name;
    return 'Application event';
  }
}
