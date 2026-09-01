import { Inject, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { loadConfig } from '../config';
import { PrismaService } from '../prisma.service';

export const AI_CONFIGURATION_ID = 'openai';
export const GRANITE_MODEL = 'ibm-granite/granite-4.2-3b';

export type ReasoningEffort = '' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type EffectiveAiConfig = {
  source: 'ENVIRONMENT' | 'ADMIN_OVERRIDE';
  baseUrl: string;
  model: string;
  apiKey: string;
  reasoningEffort: ReasoningEffort;
  confidenceThreshold: number;
  timeoutMs: number;
  version: number | null;
  updatedAt: Date | null;
};

type EncryptedSecret = { ciphertext: string; iv: string; tag: string };

function encryptionKey() {
  const encoded = loadConfig().OPENAI_CONFIG_ENCRYPTION_KEY;
  if (!encoded) throw new Error('AI configuration encryption key is unavailable');
  const key = Buffer.from(encoded, 'base64url');
  if (key.length !== 32) throw new Error('AI configuration encryption key is invalid');
  return key;
}

export function encryptAiSecret(value: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64url'),
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
  };
}

export function fingerprintAiSecret(value: string) {
  return createHmac('sha256', encryptionKey()).update(value, 'utf8').digest('base64url');
}

export function decryptAiSecret(secret: EncryptedSecret) {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(secret.iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(secret.tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function environmentAiConfig(): EffectiveAiConfig {
  const config = loadConfig();
  return {
    source: 'ENVIRONMENT',
    baseUrl: config.OPENAI_BASE_URL || '',
    model: config.OPENAI_MODEL || '',
    apiKey: config.OPENAI_API_KEY || '',
    reasoningEffort: config.OPENAI_REASONING_EFFORT,
    confidenceThreshold: config.OPENAI_CONFIDENCE_THRESHOLD,
    timeoutMs: config.OPENAI_TIMEOUT_MS,
    version: null,
    updatedAt: null,
  };
}

@Injectable()
export class AiRuntimeConfigService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async effective(): Promise<EffectiveAiConfig> {
    const fallback = environmentAiConfig();
    const override = await this.prisma.aiProviderConfiguration.findUnique({
      where: { id: AI_CONFIGURATION_ID },
    });
    if (!override) return fallback;
    return {
      source: 'ADMIN_OVERRIDE',
      baseUrl: override.baseUrl,
      model: override.model,
      apiKey: decryptAiSecret({
        ciphertext: override.apiKeyCiphertext,
        iv: override.apiKeyIv,
        tag: override.apiKeyTag,
      }),
      reasoningEffort: override.reasoningEffort as ReasoningEffort,
      confidenceThreshold: override.confidenceThreshold,
      timeoutMs: fallback.timeoutMs,
      version: override.version,
      updatedAt: override.updatedAt,
    };
  }

  async safeEffective() {
    const effective = await this.effective();
    return {
      source: effective.source,
      baseUrl: effective.baseUrl,
      model: effective.model,
      reasoningEffort: effective.reasoningEffort,
      confidenceThreshold: effective.confidenceThreshold,
      apiKeyConfigured: Boolean(effective.apiKey),
      version: effective.version,
      updatedAt: effective.updatedAt,
    };
  }
}
